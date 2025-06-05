import { MCPTool } from "../types/index.js";

export interface IMCPClient {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    listTools(): Promise<readonly MCPTool[]>;
    callTool(name: string, arguments_: Record<string, unknown>): Promise<unknown>;
    isConnected(): boolean;
  }