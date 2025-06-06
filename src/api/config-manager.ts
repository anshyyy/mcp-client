import crypto from 'crypto';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { ILogger } from '../interfaces/logger.interface.js';
import { LLMConfig, MCPServerConfig } from '../types/index.js';

export interface StoredProvider {
  name: string;
  config: LLMConfig;
}

export class ConfigManager {
  private readonly configDir: string;
  private readonly encryptionKey: Buffer;
  private readonly authTokens: Set<string> = new Set();

  constructor(private logger: ILogger) {
    // Create config directory in user's home
    this.configDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.mcp-client');
    
    // Generate or load encryption key
    this.encryptionKey = this.getOrCreateEncryptionKey();
    
    // Generate initial auth token
    this.generateNewAuthToken();
  }

  private getOrCreateEncryptionKey(): Buffer {
    const keyPath = path.join(this.configDir, '.key');
    try {
      return fsSync.readFileSync(keyPath);
    } catch {
      // Generate new encryption key
      const key = crypto.randomBytes(32);
      fsSync.mkdirSync(this.configDir, { recursive: true });
      fsSync.writeFileSync(keyPath, key, { mode: 0o600 }); // Read-write for owner only
      return key;
    }
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    cipher.setAAD(Buffer.from('mcp-client'));
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) throw new Error('Invalid encrypted format');
    
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAAD(Buffer.from('mcp-client'));
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }

  generateNewAuthToken(): string {
    const token = crypto.randomBytes(32).toString('hex');
    this.authTokens.add(token);
    this.logger.info('🔑 New API token generated. Use this in your Chrome extension:', { token });
    return token;
  }

  validateApiToken(token: string): boolean {
    return this.authTokens.has(token);
  }

  async saveProviders(providers: StoredProvider[]): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      
      // Encrypt sensitive data
      const encryptedProviders = providers.map(p => ({
        ...p,
        config: {
          ...p.config,
          apiKey: this.encrypt(p.config.apiKey)
        }
      }));
      
      const filePath = path.join(this.configDir, 'providers.json');
      await fs.writeFile(filePath, JSON.stringify(encryptedProviders, null, 2), { mode: 0o600 });
      
      this.logger.info('Providers configuration saved securely');
    } catch (error) {
      this.logger.error('Failed to save providers', error as Error);
      throw error;
    }
  }

  async getProviders(): Promise<StoredProvider[]> {
    try {
      const filePath = path.join(this.configDir, 'providers.json');
      const data = await fs.readFile(filePath, 'utf8');
      const encryptedProviders = JSON.parse(data) as StoredProvider[];
      
      // Decrypt API keys
      return encryptedProviders.map(p => ({
        ...p,
        config: {
          ...p.config,
          apiKey: this.decrypt(p.config.apiKey)
        }
      }));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.getDefaultProviders();
      }
      this.logger.error('Failed to load providers', error as Error);
      throw error;
    }
  }

  async addProvider(name: string, config: LLMConfig): Promise<void> {
    const providers = await this.getProviders();
    const existingIndex = providers.findIndex(p => p.name === name);
    
    if (existingIndex >= 0) {
      providers[existingIndex] = { name, config };
    } else {
      providers.push({ name, config });
    }
    
    await this.saveProviders(providers);
  }

  async removeProvider(name: string): Promise<void> {
    const providers = await this.getProviders();
    const filtered = providers.filter(p => p.name !== name);
    await this.saveProviders(filtered);
  }

  async saveServers(servers: MCPServerConfig[]): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      const filePath = path.join(this.configDir, 'servers.json');
      await fs.writeFile(filePath, JSON.stringify(servers, null, 2), { mode: 0o600 });
      this.logger.info('MCP servers configuration saved');
    } catch (error) {
      this.logger.error('Failed to save servers', error as Error);
      throw error;
    }
  }

  async getServers(): Promise<MCPServerConfig[]> {
    try {
      const filePath = path.join(this.configDir, 'servers.json');
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data) as MCPServerConfig[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.getDefaultServers();
      }
      this.logger.error('Failed to load servers', error as Error);
      throw error;
    }
  }

  async addServer(serverConfig: MCPServerConfig): Promise<void> {
    const servers = await this.getServers();
    const existingIndex = servers.findIndex(s => s.name === serverConfig.name);
    
    if (existingIndex >= 0) {
      servers[existingIndex] = serverConfig;
    } else {
      servers.push(serverConfig);
    }
    
    await this.saveServers(servers);
  }

  async removeServer(name: string): Promise<void> {
    const servers = await this.getServers();
    const filtered = servers.filter(s => s.name !== name);
    await this.saveServers(filtered);
  }

  private getDefaultProviders(): StoredProvider[] {
    const providers: StoredProvider[] = [];
    
    // Only add providers if environment variables exist
    if (process.env.OPENAI_API_KEY) {
      providers.push({
        name: 'gpt-4',
        config: {
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: process.env.OPENAI_API_KEY,
          temperature: 0.7,
          maxTokens: 4000,
        }
      });
    }
    
    if (process.env.ANTHROPIC_API_KEY) {
      providers.push({
        name: 'claude-3-sonnet',
        config: {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          apiKey: process.env.ANTHROPIC_API_KEY,
          temperature: 0.7,
          maxTokens: 4000,
        }
      });
    }
    
    if (process.env.GOOGLE_API_KEY) {
      providers.push({
        name: 'gemini-pro',
        config: {
          provider: 'google',
          model: 'gemini-1.5-pro',
          apiKey: process.env.GOOGLE_API_KEY,
          temperature: 0.7,
          maxTokens: 8192,
        }
      });
    }
    
    return providers;
  }

  private getDefaultServers(): MCPServerConfig[] {
    return [
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      },
      {
        name: 'sqlite',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-sqlite', './example.db'],
      },
    ];
  }

  async exportConfig(): Promise<{ providers: Omit<StoredProvider, 'config'>[], servers: MCPServerConfig[] }> {
    const providers = await this.getProviders();
    const servers = await this.getServers();
    
    // Remove sensitive information for export
    const safeProviders = providers.map(p => ({
      name: p.name,
      provider: p.config.provider,
      model: p.config.model,
      hasApiKey: !!p.config.apiKey
    }));
    
    return {
      providers: safeProviders as Omit<StoredProvider, 'config'>[],
      servers
    };
  }
} 