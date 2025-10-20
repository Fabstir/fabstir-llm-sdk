// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import DailyRotateFile from 'winston-daily-rotate-file';

export interface LoggerConfig {
  level?: string;
  logDir?: string;
  maxSize?: string;
  maxFiles?: string;
  datePattern?: string;
}

export class Logger {
  private logger: winston.Logger;
  private logDir: string;
  private level: string;
  private childLoggers: Map<string, winston.Logger> = new Map();

  constructor(config: LoggerConfig = {}) {
    this.level = config.level || 'info';
    this.logDir = config.logDir || path.join(process.env.HOME || '.', '.fabstir', 'host-cli', 'logs');

    // Ensure log directory exists (create parent dir first if needed)
    const parentDir = path.dirname(this.logDir);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Create Winston logger
    this.logger = winston.createLogger({
      level: this.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: { service: 'host-cli' },
      transports: this.createTransports(config)
    });

    // Add console transport for development
    if (process.env.NODE_ENV !== 'production') {
      this.logger.add(new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }));
    }
  }

  private createTransports(config: LoggerConfig): winston.transport[] {
    const transports: winston.transport[] = [];

    // Ensure log directory exists before creating transports
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // For testing, use simple file transports
    // In production, use daily rotation
    const isTest = process.env.NODE_ENV === 'test' || this.logDir.includes('test-logs');

    if (!isTest) {
      // Combined log with rotation - all levels
      transports.push(new DailyRotateFile({
        filename: path.join(this.logDir, 'combined-%DATE%.log'),
        datePattern: config.datePattern || 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: config.maxSize || '10m',
        maxFiles: config.maxFiles || '7d',
        createSymlink: false
      }));

      // Error log with rotation - only errors
      transports.push(new DailyRotateFile({
        filename: path.join(this.logDir, 'error-%DATE%.log'),
        datePattern: config.datePattern || 'YYYY-MM-DD',
        zippedArchive: true,
        maxSize: config.maxSize || '10m',
        maxFiles: config.maxFiles || '7d',
        level: 'error',
        createSymlink: false
      }));
    }

    // Always add simple file transports for easy access
    transports.push(new winston.transports.File({
      filename: path.join(this.logDir, 'error.log'),
      level: 'error'
    }));

    transports.push(new winston.transports.File({
      filename: path.join(this.logDir, 'combined.log')
    }));

    return transports;
  }

  error(message: string, ...meta: any[]): void {
    this.logger.error(message, ...meta);
  }

  warn(message: string, ...meta: any[]): void {
    this.logger.warn(message, ...meta);
  }

  info(message: string, ...meta: any[]): void {
    this.logger.info(message, ...meta);
  }

  debug(message: string, ...meta: any[]): void {
    this.logger.debug(message, ...meta);
  }

  getLevel(): string {
    return this.level;
  }

  setLevel(level: string): void {
    this.level = level;
    this.logger.level = level;
  }

  getLogDir(): string {
    return this.logDir;
  }

  child(component: string): winston.Logger {
    if (!this.childLoggers.has(component)) {
      const childLogger = winston.createLogger({
        level: this.level,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.splat(),
          winston.format.json()
        ),
        defaultMeta: { service: 'host-cli', component },
        transports: [
          new winston.transports.File({
            filename: path.join(this.logDir, `${component}.log`)
          })
        ]
      });

      // Add console in development
      if (process.env.NODE_ENV !== 'production') {
        childLogger.add(new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        }));
      }

      this.childLoggers.set(component, childLogger);
    }

    return this.childLoggers.get(component)!;
  }

  async flush(): Promise<void> {
    return new Promise((resolve) => {
      // Winston doesn't have a built-in flush, so we'll wait briefly
      setTimeout(resolve, 100);
    });
  }

  close(): void {
    this.logger.close();
    this.childLoggers.forEach(child => child.close());
    this.childLoggers.clear();
  }
}

// Singleton instance for global use
let globalLogger: Logger | null = null;

export function getLogger(config?: LoggerConfig): Logger {
  if (!globalLogger) {
    globalLogger = new Logger(config);
  }
  return globalLogger;
}

export function createLogger(config?: LoggerConfig): Logger {
  return new Logger(config);
}