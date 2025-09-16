import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LogRotator } from '../../src/logging/rotation';
import * as fs from 'fs';
import * as path from 'path';

describe('Log Rotation', () => {
  let rotator: LogRotator;
  const testLogDir = path.join(__dirname, '../../test-logs');

  beforeEach(() => {
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testLogDir, { recursive: true });
  });

  afterEach(() => {
    if (rotator) {
      rotator.stop();
    }
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
  });

  describe('Rotation Configuration', () => {
    it('should initialize with default config', () => {
      rotator = new LogRotator(testLogDir);
      const config = rotator.getConfig();

      expect(config.maxSize).toBe('10m');
      expect(config.maxFiles).toBe(7);
      expect(config.datePattern).toBe('YYYY-MM-DD');
    });

    it('should accept custom max size', () => {
      rotator = new LogRotator(testLogDir, { maxSize: '5m' });
      expect(rotator.getConfig().maxSize).toBe('5m');
    });

    it('should accept custom max files', () => {
      rotator = new LogRotator(testLogDir, { maxFiles: 14 });
      expect(rotator.getConfig().maxFiles).toBe(14);
    });

    it('should accept custom date pattern', () => {
      rotator = new LogRotator(testLogDir, { datePattern: 'YYYY-MM-DD-HH' });
      expect(rotator.getConfig().datePattern).toBe('YYYY-MM-DD-HH');
    });
  });

  describe('Size-based Rotation', () => {
    it('should rotate when file exceeds max size', async () => {
      rotator = new LogRotator(testLogDir, { maxSize: '1k' }); // 1KB limit

      const testFile = path.join(testLogDir, 'test.log');
      const largeContent = 'x'.repeat(2000); // 2KB of data

      fs.writeFileSync(testFile, largeContent);
      await rotator.checkAndRotate('test.log');

      // Original file should be rotated
      expect(fs.existsSync(testFile + '.1')).toBe(true);
      // New file should be created
      expect(fs.existsSync(testFile)).toBe(true);
      expect(fs.statSync(testFile).size).toBe(0);
    });

    it('should maintain max number of rotated files', async () => {
      rotator = new LogRotator(testLogDir, { maxFiles: 3 });

      const testFile = path.join(testLogDir, 'test.log');

      // Create 5 rotated files
      for (let i = 1; i <= 5; i++) {
        fs.writeFileSync(`${testFile}.${i}`, `content ${i}`);
      }

      await rotator.cleanOldFiles('test.log');

      // Should only keep 3 files
      expect(fs.existsSync(`${testFile}.1`)).toBe(true);
      expect(fs.existsSync(`${testFile}.2`)).toBe(true);
      expect(fs.existsSync(`${testFile}.3`)).toBe(true);
      expect(fs.existsSync(`${testFile}.4`)).toBe(false);
      expect(fs.existsSync(`${testFile}.5`)).toBe(false);
    });
  });

  describe('Date-based Rotation', () => {
    it('should add date to rotated filename', async () => {
      rotator = new LogRotator(testLogDir);

      const testFile = path.join(testLogDir, 'test.log');
      fs.writeFileSync(testFile, 'test content');

      await rotator.rotateDated('test.log');

      const date = new Date().toISOString().split('T')[0];
      const rotatedFile = `${testFile}.${date}`;

      expect(fs.existsSync(rotatedFile)).toBe(true);
    });

    it('should handle multiple rotations on same day', async () => {
      rotator = new LogRotator(testLogDir);

      const testFile = path.join(testLogDir, 'test.log');

      // First rotation
      fs.writeFileSync(testFile, 'content 1');
      await rotator.rotateDated('test.log');

      // Second rotation
      fs.writeFileSync(testFile, 'content 2');
      await rotator.rotateDated('test.log');

      const date = new Date().toISOString().split('T')[0];
      expect(fs.existsSync(`${testFile}.${date}.1`)).toBe(true);
      expect(fs.existsSync(`${testFile}.${date}.2`)).toBe(true);
    });
  });

  describe('Compression', () => {
    it('should compress rotated logs if enabled', async () => {
      rotator = new LogRotator(testLogDir, { compress: true });

      const testFile = path.join(testLogDir, 'test.log');
      fs.writeFileSync(testFile, 'test content to compress');

      await rotator.rotateAndCompress('test.log');

      const date = new Date().toISOString().split('T')[0];
      const compressedFile = `${testFile}.${date}.gz`;

      expect(fs.existsSync(compressedFile)).toBe(true);
    });

    it('should delete original after compression', async () => {
      rotator = new LogRotator(testLogDir, { compress: true });

      const testFile = path.join(testLogDir, 'test.log');
      fs.writeFileSync(testFile, 'test content');

      await rotator.rotateAndCompress('test.log');

      const date = new Date().toISOString().split('T')[0];
      expect(fs.existsSync(`${testFile}.${date}`)).toBe(false);
      expect(fs.existsSync(`${testFile}.${date}.gz`)).toBe(true);
    });
  });

  describe('Automatic Rotation', () => {
    it('should schedule daily rotation', () => {
      const spy = vi.spyOn(global, 'setInterval');
      rotator = new LogRotator(testLogDir);

      rotator.scheduleDailyRotation();

      expect(spy).toHaveBeenCalledWith(
        expect.any(Function),
        24 * 60 * 60 * 1000 // 24 hours
      );
    });

    it('should stop scheduled rotation', () => {
      const spy = vi.spyOn(global, 'clearInterval');
      rotator = new LogRotator(testLogDir);

      rotator.scheduleDailyRotation();
      rotator.stop();

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Rotation Status', () => {
    it('should report rotation statistics', async () => {
      rotator = new LogRotator(testLogDir);

      const testFile = path.join(testLogDir, 'test.log');

      // Create some rotated files
      fs.writeFileSync(testFile, 'current');
      fs.writeFileSync(`${testFile}.1`, 'rotated 1');
      fs.writeFileSync(`${testFile}.2`, 'rotated 2');

      const stats = await rotator.getRotationStats('test.log');

      expect(stats.totalFiles).toBe(3);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.oldestFile).toBeDefined();
      expect(stats.newestFile).toBeDefined();
    });
  });
});