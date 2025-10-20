// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import chalk from 'chalk';
import { promisify } from 'util';

/**
 * Register the logs command with the CLI
 */
export function registerLogsCommand(program: Command): void {
  program
    .command('logs')
    .description('View and manage host logs')
    .option('-n, --lines <number>', 'Number of lines to display', '100')
    .option('-f, --follow', 'Follow log output')
    .option('--level <level>', 'Filter by log level (error, warn, info, debug)')
    .option('--component <component>', 'Filter by component')
    .option('--export <path>', 'Export logs to file')
    .action(async (options) => {
      try {
        // Simplified implementation for now
        console.log(chalk.yellow('⚠️  Logs command not fully implemented'));
        console.log(chalk.gray(`Would show ${options.lines} lines of logs`));
        if (options.follow) {
          console.log(chalk.gray('Would follow log output'));
        }
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

const gzip = promisify(zlib.gzip);

export interface LogFileStats {
  size: number;
  modified: Date;
  lines?: number;
}

export interface LogSummary {
  totalLines: number;
  levels: Record<string, number>;
  components: string[];
  dateRange?: { start: Date; end: Date };
}

export interface GrowthRate {
  bytesPerHour: number;
  linesPerHour?: number;
}

export interface ErrorFrequency {
  message: string;
  count: number;
  lastOccurrence?: Date;
}

export class LogsCommand {
  private logDir: string;
  private followWatchers: Map<string, fs.FSWatcher> = new Map();

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(process.env.HOME || '.', '.fabstir', 'host-cli', 'logs');
  }

  listLogFiles(): string[] {
    if (!fs.existsSync(this.logDir)) {
      return [];
    }

    return fs.readdirSync(this.logDir)
      .filter(file => file.endsWith('.log'));
  }

  listLogFilesWithStats(): Record<string, LogFileStats> {
    const files = this.listLogFiles();
    const result: Record<string, LogFileStats> = {};

    files.forEach(file => {
      const filepath = path.join(this.logDir, file);
      const stats = fs.statSync(filepath);
      result[file] = {
        size: stats.size,
        modified: stats.mtime
      };
    });

    return result;
  }

  listLogFilesSorted(): string[] {
    const filesWithStats = this.listLogFilesWithStats();

    return Object.entries(filesWithStats)
      .sort((a, b) => b[1].modified.getTime() - a[1].modified.getTime())
      .map(([file]) => file);
  }

  tail(filename: string, lines: number = 10): string[] {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const allLines = content.split('\n').filter(line => line.trim());

    return allLines.slice(-lines);
  }

  follow(filename: string, callback: (line: string) => void): { stop: () => void } {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return { stop: () => {} };
    }

    let position = fs.statSync(filepath).size;

    const watcher = fs.watch(filepath, (eventType) => {
      if (eventType === 'change') {
        // Check if file still exists before reading
        if (!fs.existsSync(filepath)) {
          return;
        }

        let currentSize: number;
        try {
          currentSize = fs.statSync(filepath).size;
        } catch (error) {
          // File may have been deleted
          return;
        }

        // Only read if file has grown
        if (currentSize > position) {
          const stream = fs.createReadStream(filepath, {
            start: position,
            end: currentSize,
            encoding: 'utf-8'
          });

          let buffer = '';
          stream.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            lines.forEach(line => {
              if (line.trim()) {
                callback(line);
              }
            });
          });

          stream.on('end', () => {
            // If there's remaining data in buffer, process it
            if (buffer.trim()) {
              callback(buffer);
            }
            position = currentSize;
          });
        }
      }
    });

    this.followWatchers.set(filename, watcher);

    return {
      stop: () => {
        watcher.close();
        this.followWatchers.delete(filename);
      }
    };
  }

  filterByLevel(filename: string, level: string): string[] {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    return lines.filter(line =>
      line.toLowerCase().includes(` ${level.toLowerCase()}:`) ||
      line.toLowerCase().includes(`"level":"${level.toLowerCase()}"`)
    );
  }

  filterByDateRange(filename: string, start: Date, end: Date): string[] {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    return lines.filter(line => {
      // Try to extract timestamp
      const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
      if (!timestampMatch) return false;

      const lineDate = new Date(timestampMatch[1]);
      return lineDate >= start && lineDate <= end;
    });
  }

  search(filename: string, pattern: string): string[] {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    return lines.filter(line => line.includes(pattern));
  }

  searchRegex(filename: string, pattern: RegExp): string[] {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return [];
    }

    const content = fs.readFileSync(filepath, 'utf-8');
    const lines = content.split('\n');

    return lines.filter(line => pattern.test(line));
  }

  filterByComponent(component: string): Array<{ file: string; line: string }> {
    const componentFile = `${component}.log`;
    const results: Array<{ file: string; line: string }> = [];

    if (fs.existsSync(path.join(this.logDir, componentFile))) {
      const lines = fs.readFileSync(path.join(this.logDir, componentFile), 'utf-8')
        .split('\n')
        .filter(line => line.trim());

      lines.forEach(line => {
        results.push({ file: componentFile, line });
      });
    }

    return results;
  }

  async exportLogs(filenames: string[], exportPath: string): Promise<void> {
    const contents: string[] = [];

    for (const filename of filenames) {
      const filepath = path.join(this.logDir, filename);
      if (fs.existsSync(filepath)) {
        contents.push(`\n=== ${filename} ===\n`);
        contents.push(fs.readFileSync(filepath, 'utf-8'));
      }
    }

    fs.writeFileSync(exportPath, contents.join('\n'));
  }

  async exportFiltered(level: string, exportPath: string): Promise<void> {
    const files = this.listLogFiles();
    const filtered: string[] = [];

    for (const file of files) {
      const lines = this.filterByLevel(file, level);
      if (lines.length > 0) {
        filtered.push(`\n=== ${file} ===\n`);
        filtered.push(lines.join('\n'));
      }
    }

    fs.writeFileSync(exportPath, filtered.join('\n'));
  }

  async exportCompressed(filenames: string[], exportPath: string): Promise<void> {
    const contents: string[] = [];

    for (const filename of filenames) {
      const filepath = path.join(this.logDir, filename);
      if (fs.existsSync(filepath)) {
        contents.push(`\n=== ${filename} ===\n`);
        contents.push(fs.readFileSync(filepath, 'utf-8'));
      }
    }

    const compressed = await gzip(Buffer.from(contents.join('\n')));
    fs.writeFileSync(exportPath, compressed);
  }

  generateSummary(): LogSummary {
    const files = this.listLogFiles();
    const summary: LogSummary = {
      totalLines: 0,
      levels: {},
      components: []
    };

    for (const file of files) {
      const filepath = path.join(this.logDir, file);
      const content = fs.readFileSync(filepath, 'utf-8');
      const lines = content.split('\n');

      summary.totalLines += lines.length;

      // Count log levels
      ['error', 'warn', 'info', 'debug'].forEach(level => {
        const count = lines.filter(line =>
          line.toLowerCase().includes(` ${level}:`) ||
          line.toLowerCase().includes(`"level":"${level}"`)
        ).length;

        summary.levels[level] = (summary.levels[level] || 0) + count;
      });

      // Track component logs
      if (file !== 'combined.log' && file !== 'error.log') {
        const component = file.replace('.log', '');
        summary.components.push(component);
      }
    }

    return summary;
  }

  getGrowthRate(filename: string): GrowthRate {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return { bytesPerHour: 0 };
    }

    const stats = fs.statSync(filepath);
    const ageInHours = (Date.now() - stats.birthtime.getTime()) / (1000 * 60 * 60);

    return {
      bytesPerHour: ageInHours > 0 ? Math.round(stats.size / ageInHours) : 0
    };
  }

  getMostFrequentErrors(limit: number = 10): ErrorFrequency[] {
    const errorCounts = new Map<string, number>();
    const lastOccurrence = new Map<string, Date>();

    // Read error log
    const errorFile = path.join(this.logDir, 'error.log');
    if (fs.existsSync(errorFile)) {
      const lines = fs.readFileSync(errorFile, 'utf-8').split('\n');

      lines.forEach(line => {
        if (line.trim()) {
          // Extract error message (simplified)
          const messageMatch = line.match(/error:\s*(.+)$/i);
          if (messageMatch) {
            const message = messageMatch[1];
            errorCounts.set(message, (errorCounts.get(message) || 0) + 1);

            // Extract timestamp
            const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
            if (timestampMatch) {
              lastOccurrence.set(message, new Date(timestampMatch[1]));
            }
          }
        }
      });
    }

    // Sort by frequency
    return Array.from(errorCounts.entries())
      .map(([message, count]) => ({
        message,
        count,
        lastOccurrence: lastOccurrence.get(message)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  display(filename: string, options: { colors?: boolean } = {}): void {
    const lines = this.tail(filename, 50);

    lines.forEach(line => {
      if (options.colors) {
        if (line.includes('error')) {
          console.log(chalk.red(line));
        } else if (line.includes('warn')) {
          console.log(chalk.yellow(line));
        } else if (line.includes('info')) {
          console.log(chalk.blue(line));
        } else if (line.includes('debug')) {
          console.log(chalk.gray(line));
        } else {
          console.log(line);
        }
      } else {
        console.log(line);
      }
    });
  }

  paginate(lines: string[], pageSize: number, page: number): string[] {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return lines.slice(start, end);
  }
}