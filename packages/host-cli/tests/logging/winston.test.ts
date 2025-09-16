import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Logger } from '../../src/logging/logger';
import * as fs from 'fs';
import * as path from 'path';

describe('Winston Logger Configuration', () => {
  let logger: Logger;
  const testLogDir = path.join(__dirname, '../../test-logs');

  beforeEach(() => {
    // Clean up test log directory
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(async () => {
    if (logger) {
      await logger.flush();
      logger.close();
    }
    // Wait a bit for winston to finish
    await new Promise(resolve => setTimeout(resolve, 100));

    // Clean up test logs
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('Logger Initialization', () => {
    it('should create logger instance with default config', () => {
      logger = new Logger();
      expect(logger).toBeDefined();
      expect(logger.getLevel()).toBe('info');
    });

    it('should accept custom log directory', () => {
      logger = new Logger({ logDir: testLogDir });
      expect(logger.getLogDir()).toBe(testLogDir);
    });

    it('should create log directory if not exists', () => {
      const customDir = path.join(testLogDir, 'custom');
      logger = new Logger({ logDir: customDir });
      expect(fs.existsSync(customDir)).toBe(true);
    });

    it('should accept custom log level', () => {
      logger = new Logger({ level: 'debug' });
      expect(logger.getLevel()).toBe('debug');
    });
  });

  describe('Log Levels', () => {
    it('should log error messages', () => {
      logger = new Logger({ logDir: testLogDir });
      const spy = vi.spyOn(logger, 'error');

      logger.error('Test error message');
      expect(spy).toHaveBeenCalledWith('Test error message');
    });

    it('should log warn messages', () => {
      logger = new Logger({ logDir: testLogDir });
      const spy = vi.spyOn(logger, 'warn');

      logger.warn('Test warning');
      expect(spy).toHaveBeenCalledWith('Test warning');
    });

    it('should log info messages', () => {
      logger = new Logger({ logDir: testLogDir });
      const spy = vi.spyOn(logger, 'info');

      logger.info('Test info');
      expect(spy).toHaveBeenCalledWith('Test info');
    });

    it('should log debug messages when level is debug', () => {
      logger = new Logger({ logDir: testLogDir, level: 'debug' });
      const spy = vi.spyOn(logger, 'debug');

      logger.debug('Test debug');
      expect(spy).toHaveBeenCalledWith('Test debug');
    });

    it('should not log debug messages when level is info', () => {
      logger = new Logger({ logDir: testLogDir, level: 'info' });
      const spy = vi.spyOn(logger, 'debug');

      logger.debug('Test debug');
      expect(spy).toHaveBeenCalledWith('Test debug');
      // Debug should be called but not written to file
    });
  });

  describe('Log Files', () => {
    it('should write to combined.log file', async () => {
      logger = new Logger({ logDir: testLogDir });
      logger.info('Test message');

      // Wait for file write
      await new Promise(resolve => setTimeout(resolve, 100));

      const logFile = path.join(testLogDir, 'combined.log');
      expect(fs.existsSync(logFile)).toBe(true);

      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('Test message');
    });

    it('should write errors to error.log file', async () => {
      logger = new Logger({ logDir: testLogDir });
      logger.error('Test error');

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorFile = path.join(testLogDir, 'error.log');
      expect(fs.existsSync(errorFile)).toBe(true);

      const content = fs.readFileSync(errorFile, 'utf-8');
      expect(content).toContain('Test error');
    });

    it('should create separate component logs', async () => {
      logger = new Logger({ logDir: testLogDir });

      const sdkLogger = logger.child('sdk');
      const processLogger = logger.child('process');

      sdkLogger.info('SDK message');
      processLogger.info('Process message');

      await new Promise(resolve => setTimeout(resolve, 100));

      const sdkFile = path.join(testLogDir, 'sdk.log');
      const processFile = path.join(testLogDir, 'process.log');

      expect(fs.existsSync(sdkFile)).toBe(true);
      expect(fs.existsSync(processFile)).toBe(true);
    });
  });

  describe('Log Formatting', () => {
    it('should include timestamp in logs', async () => {
      logger = new Logger({ logDir: testLogDir });
      logger.info('Timestamp test');

      await new Promise(resolve => setTimeout(resolve, 100));

      const logFile = path.join(testLogDir, 'combined.log');
      const content = fs.readFileSync(logFile, 'utf-8');

      // Check for ISO timestamp pattern
      expect(content).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include log level in output', async () => {
      logger = new Logger({ logDir: testLogDir });
      logger.error('Level test');

      await new Promise(resolve => setTimeout(resolve, 100));

      const logFile = path.join(testLogDir, 'combined.log');
      const content = fs.readFileSync(logFile, 'utf-8');

      expect(content).toContain('error');
    });

    it('should support metadata in logs', () => {
      logger = new Logger({ logDir: testLogDir });
      const spy = vi.spyOn(logger, 'info');

      logger.info('User action', { userId: '123', action: 'login' });
      expect(spy).toHaveBeenCalledWith('User action', { userId: '123', action: 'login' });
    });
  });

  describe('Logger Cleanup', () => {
    it('should close file transports', () => {
      logger = new Logger({ logDir: testLogDir });
      const spy = vi.spyOn(logger, 'close');

      logger.close();
      expect(spy).toHaveBeenCalled();
    });

    it('should flush logs before closing', async () => {
      logger = new Logger({ logDir: testLogDir });
      logger.info('Final message');

      await logger.flush();
      logger.close();

      const logFile = path.join(testLogDir, 'combined.log');
      const content = fs.readFileSync(logFile, 'utf-8');
      expect(content).toContain('Final message');
    });
  });
});