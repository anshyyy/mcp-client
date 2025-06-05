import winston from 'winston';
import { ILogger } from '../interfaces/logger.interface.js';

export class Logger implements ILogger {
  private readonly logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
      ],
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.simple()
      }));
    }
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>): void {
    this.logger.error(message, { error: error?.stack, ...meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }
}