/**
 * Process logger module
 * Handles logging of process output to files
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream, WriteStream } from 'fs';

/**
 * Log level
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Logger options
 */
export interface LoggerOptions {
  logDir?: string;
  maxFileSize?: number; // bytes
  maxFiles?: number;
  dateFormat?: boolean;
  bufferSize?: number;
}

/**
 * Process logger class
 */
export class ProcessLogger {
  private processId: string;
  private options: LoggerOptions;
  private logDir: string;
  private currentStream?: WriteStream;
  private currentFile?: string;
  private currentSize: number = 0;
  private fileIndex: number = 0;
  private buffer: string[] = [];
  private flushTimer?: NodeJS.Timeout;

  constructor(processId: string, options: LoggerOptions = {}) {
    this.processId = processId;
    this.options = {
      logDir: options.logDir || path.join(process.cwd(), 'logs'),
      maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
      maxFiles: options.maxFiles || 10,
      dateFormat: options.dateFormat !== false,
      bufferSize: options.bufferSize || 100
    };

    this.logDir = path.join(this.options.logDir!, `process-${processId}`);
    this.initialize();
  }

  /**
   * Initialize logger
   */
  private async initialize(): Promise<void> {
    try {
      // Create log directory
      await fs.mkdir(this.logDir, { recursive: true });

      // Start with first log file
      await this.rotateLog();
    } catch (error) {
      console.error('Failed to initialize logger:', error);
    }
  }

  /**
   * Log a message
   */
  log(message: string, level: LogLevel = 'info'): void {
    const timestamp = this.options.dateFormat
      ? new Date().toISOString()
      : Date.now().toString();

    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    // Add to buffer
    this.buffer.push(formattedMessage);

    // Flush if buffer is full
    if (this.buffer.length >= this.options.bufferSize!) {
      this.flush();
    } else {
      // Schedule flush
      this.scheduleFlush();
    }
  }

  /**
   * Log error
   */
  error(message: string): void {
    this.log(message, 'error');
  }

  /**
   * Log warning
   */
  warn(message: string): void {
    this.log(message, 'warn');
  }

  /**
   * Log info
   */
  info(message: string): void {
    this.log(message, 'info');
  }

  /**
   * Log debug
   */
  debug(message: string): void {
    this.log(message, 'debug');
  }

  /**
   * Schedule buffer flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = undefined;
    }, 1000); // Flush every second
  }

  /**
   * Flush buffer to file
   */
  private async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const data = this.buffer.join('\n') + '\n';
    this.buffer = [];

    try {
      // Check if need to rotate
      if (this.currentSize + data.length > this.options.maxFileSize!) {
        await this.rotateLog();
      }

      // Write to stream
      if (this.currentStream) {
        await new Promise<void>((resolve, reject) => {
          this.currentStream!.write(data, (error) => {
            if (error) {
              reject(error);
            } else {
              this.currentSize += data.length;
              resolve();
            }
          });
        });
      }
    } catch (error) {
      console.error('Failed to write log:', error);
    }
  }

  /**
   * Rotate log files
   */
  private async rotateLog(): Promise<void> {
    // Close current stream
    if (this.currentStream) {
      await new Promise<void>((resolve) => {
        this.currentStream!.end(() => resolve());
      });
    }

    // Generate new filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentFile = path.join(this.logDir, `${timestamp}.log`);

    // Create new stream
    this.currentStream = createWriteStream(this.currentFile, { flags: 'a' });
    this.currentSize = 0;
    this.fileIndex++;

    // Clean old files if needed
    await this.cleanOldFiles();
  }

  /**
   * Clean old log files
   */
  private async cleanOldFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(f => f.endsWith('.log'))
        .sort()
        .reverse();

      // Keep only maxFiles
      if (logFiles.length > this.options.maxFiles!) {
        const toDelete = logFiles.slice(this.options.maxFiles!);
        for (const file of toDelete) {
          await fs.unlink(path.join(this.logDir, file));
        }
      }
    } catch (error) {
      console.error('Failed to clean old log files:', error);
    }
  }

  /**
   * Get log files
   */
  async getLogFiles(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.logDir);
      return files
        .filter(f => f.endsWith('.log'))
        .map(f => path.join(this.logDir, f))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Read logs
   */
  async readLogs(options?: {
    lines?: number;
    since?: Date;
    level?: LogLevel;
  }): Promise<string[]> {
    const files = await this.getLogFiles();
    const result: string[] = [];

    for (const file of files.reverse()) {
      try {
        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          // Filter by date if specified
          if (options?.since) {
            const match = line.match(/\[(.*?)\]/);
            if (match) {
              const lineDate = new Date(match[1]);
              if (lineDate < options.since) {
                continue;
              }
            }
          }

          // Filter by level if specified
          if (options?.level) {
            const levelUpper = options.level.toUpperCase();
            if (!line.includes(`[${levelUpper}]`)) {
              continue;
            }
          }

          result.push(line);

          // Check line limit
          if (options?.lines && result.length >= options.lines) {
            return result;
          }
        }
      } catch (error) {
        console.error(`Failed to read log file ${file}:`, error);
      }
    }

    return result;
  }

  /**
   * Tail logs (get last N lines)
   */
  async tail(lines: number = 100): Promise<string[]> {
    const allLogs = await this.readLogs();
    return allLogs.slice(-lines);
  }

  /**
   * Search logs
   */
  async search(pattern: string | RegExp): Promise<string[]> {
    const logs = await this.readLogs();
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return logs.filter(line => regex.test(line));
  }

  /**
   * Get log statistics
   */
  async getStats(): Promise<{
    totalFiles: number;
    totalSize: number;
    oldestLog?: Date;
    newestLog?: Date;
    errorCount: number;
    warnCount: number;
  }> {
    const files = await this.getLogFiles();
    let totalSize = 0;
    let oldestLog: Date | undefined;
    let newestLog: Date | undefined;
    let errorCount = 0;
    let warnCount = 0;

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        totalSize += stats.size;

        const content = await fs.readFile(file, 'utf-8');
        const lines = content.split('\n');

        // Count errors and warnings
        errorCount += lines.filter(l => l.includes('[ERROR]')).length;
        warnCount += lines.filter(l => l.includes('[WARN]')).length;

        // Find date range
        for (const line of lines) {
          const match = line.match(/\[(.*?)\]/);
          if (match && !match[1].match(/^\d+$/)) {
            const date = new Date(match[1]);
            if (!isNaN(date.getTime())) {
              if (!oldestLog || date < oldestLog) {
                oldestLog = date;
              }
              if (!newestLog || date > newestLog) {
                newestLog = date;
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to get stats for ${file}:`, error);
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      oldestLog,
      newestLog,
      errorCount,
      warnCount
    };
  }

  /**
   * Clear all logs
   */
  async clear(): Promise<void> {
    const files = await this.getLogFiles();
    for (const file of files) {
      try {
        await fs.unlink(file);
      } catch (error) {
        console.error(`Failed to delete ${file}:`, error);
      }
    }

    // Restart with new file
    await this.rotateLog();
  }

  /**
   * Close logger
   */
  async close(): Promise<void> {
    // Flush remaining buffer
    await this.flush();

    // Clear flush timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }

    // Close stream
    if (this.currentStream) {
      await new Promise<void>((resolve) => {
        this.currentStream!.end(() => resolve());
      });
      this.currentStream = undefined;
    }
  }
}