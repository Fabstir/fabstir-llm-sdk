import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogsCommand } from '../../src/commands/logs';
import * as fs from 'fs';
import * as path from 'path';

describe('Logs Command', () => {
  let logsCommand: LogsCommand;
  const testLogDir = path.join(__dirname, '../../test-logs');

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });

    // Create sample log files
    createSampleLogs();

    logsCommand = new LogsCommand(testLogDir);
  });

  afterEach(async () => {
    // Stop any followers to prevent file watchers from keeping handles open
    if (logsCommand) {
      const followers = (logsCommand as any).followWatchers;
      if (followers) {
        followers.forEach((watcher: any) => {
          try {
            watcher.close();
          } catch (e) {
            // Ignore
          }
        });
        followers.clear();
      }
    }

    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 50));

    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  function createSampleLogs() {
    const now = new Date();

    // Combined log
    fs.writeFileSync(path.join(testLogDir, 'combined.log'),
      `${now.toISOString()} info: Server started
${now.toISOString()} error: Connection failed
${now.toISOString()} info: Processing request
${now.toISOString()} warn: Memory usage high
${now.toISOString()} debug: Debug information`);

    // Error log
    fs.writeFileSync(path.join(testLogDir, 'error.log'),
      `${now.toISOString()} error: Database connection failed
${now.toISOString()} error: Authentication error`);

    // Component logs
    fs.writeFileSync(path.join(testLogDir, 'sdk.log'),
      `${now.toISOString()} info: SDK initialized
${now.toISOString()} info: Authentication successful`);
  }

  describe('List Logs', () => {
    it('should list all log files', () => {
      const files = logsCommand.listLogFiles();

      expect(files).toContain('combined.log');
      expect(files).toContain('error.log');
      expect(files).toContain('sdk.log');
    });

    it('should include file sizes', () => {
      const filesWithStats = logsCommand.listLogFilesWithStats();

      expect(filesWithStats).toHaveProperty('combined.log');
      expect(filesWithStats['combined.log'].size).toBeGreaterThan(0);
    });

    it('should sort by modification time', () => {
      // Create files with different timestamps
      fs.writeFileSync(path.join(testLogDir, 'old.log'), 'old');

      // Wait a bit
      const later = new Date(Date.now() + 1000);
      fs.writeFileSync(path.join(testLogDir, 'new.log'), 'new');
      fs.utimesSync(path.join(testLogDir, 'new.log'), later, later);

      const sorted = logsCommand.listLogFilesSorted();
      const firstIndex = sorted.indexOf('new.log');
      const secondIndex = sorted.indexOf('old.log');

      expect(firstIndex).toBeLessThan(secondIndex);
    });
  });

  describe('View Logs', () => {
    it('should tail last N lines', () => {
      const lines = logsCommand.tail('combined.log', 2);

      expect(lines).toHaveLength(2);
      expect(lines[1]).toContain('debug: Debug information');
    });

    it('should show all logs if N > total lines', () => {
      const lines = logsCommand.tail('error.log', 100);

      expect(lines).toHaveLength(2);
    });

    it('should handle non-existent file', () => {
      const lines = logsCommand.tail('nonexistent.log', 10);

      expect(lines).toHaveLength(0);
    });

    it('should follow log in real-time', async () => {
      const messages: string[] = [];
      const follower = logsCommand.follow('combined.log', (line) => {
        messages.push(line);
      });

      // Append new line
      fs.appendFileSync(path.join(testLogDir, 'combined.log'),
        '\n' + new Date().toISOString() + ' info: New message');

      // Wait for file watch
      await new Promise(resolve => setTimeout(resolve, 200));

      // Ensure we stop the follower
      follower.stop();

      // Give it a moment to clean up
      await new Promise(resolve => setTimeout(resolve, 50));

      expect(messages.some(m => m.includes('New message'))).toBe(true);
    });
  });

  describe('Filter Logs', () => {
    it('should filter by log level', () => {
      const errors = logsCommand.filterByLevel('combined.log', 'error');

      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('Connection failed');
    });

    it('should filter by date range', () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const inRange = logsCommand.filterByDateRange('combined.log', yesterday, tomorrow);
      expect(inRange.length).toBeGreaterThan(0);

      const outOfRange = logsCommand.filterByDateRange('combined.log',
        new Date('2020-01-01'), new Date('2020-12-31'));
      expect(outOfRange).toHaveLength(0);
    });

    it('should search for text pattern', () => {
      const results = logsCommand.search('combined.log', 'Processing');

      expect(results).toHaveLength(1);
      expect(results[0]).toContain('Processing request');
    });

    it('should support regex search', () => {
      const results = logsCommand.searchRegex('combined.log', /error|warn/i);

      expect(results).toHaveLength(2);
    });

    it('should filter by component', () => {
      const sdkLogs = logsCommand.filterByComponent('sdk');

      expect(sdkLogs.every(log => log.file === 'sdk.log')).toBe(true);
    });
  });

  describe('Export Logs', () => {
    it('should export logs to file', async () => {
      const exportPath = path.join(testLogDir, 'export.txt');

      await logsCommand.exportLogs(['combined.log'], exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
      const content = fs.readFileSync(exportPath, 'utf-8');
      expect(content).toContain('Server started');
    });

    it('should export with filters', async () => {
      const exportPath = path.join(testLogDir, 'errors.txt');

      await logsCommand.exportFiltered('error', exportPath);

      const content = fs.readFileSync(exportPath, 'utf-8');
      expect(content).toContain('error');
      expect(content).not.toContain('info');
    });

    it('should compress exported logs', async () => {
      const exportPath = path.join(testLogDir, 'export.log.gz');

      await logsCommand.exportCompressed(['combined.log'], exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
    });
  });

  describe('Log Analysis', () => {
    it('should generate log summary', () => {
      const summary = logsCommand.generateSummary();

      expect(summary.totalLines).toBeGreaterThan(0);
      expect(summary.levels).toHaveProperty('error');
      expect(summary.levels).toHaveProperty('info');
      expect(summary.levels.error).toBe(3); // 1 in combined, 2 in error.log
    });

    it('should calculate log growth rate', () => {
      const rate = logsCommand.getGrowthRate('combined.log');

      expect(rate).toHaveProperty('bytesPerHour');
      expect(rate.bytesPerHour).toBeGreaterThanOrEqual(0);
    });

    it('should identify most frequent errors', () => {
      // Add duplicate errors
      fs.appendFileSync(path.join(testLogDir, 'error.log'),
        '\n' + new Date().toISOString() + ' error: Database connection failed');

      const frequent = logsCommand.getMostFrequentErrors(5);

      expect(frequent[0].message).toContain('Database connection failed');
      expect(frequent[0].count).toBe(2);
    });
  });

  describe('Console Output', () => {
    it('should format output with colors', () => {
      const spy = vi.spyOn(console, 'log');

      logsCommand.display('combined.log', { colors: true });

      expect(spy).toHaveBeenCalled();
      // Output should contain ANSI color codes
    });

    it('should paginate long output', () => {
      const lines = Array.from({ length: 100 }, (_, i) => `Line ${i}`);
      const paginated = logsCommand.paginate(lines, 10, 2);

      expect(paginated).toHaveLength(10);
      expect(paginated[0]).toContain('Line 10');
    });
  });
});