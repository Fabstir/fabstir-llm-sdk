// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as ConfigBackup from '../../src/config/backup';
import { ConfigData } from '../../src/config/types';

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn()
}));

vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/user')
}));

describe('Config Backup', () => {
  const mockConfig: ConfigData = {
    version: '1.0.0',
    walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    network: 'base-sepolia',
    rpcUrl: 'https://test.rpc',
    inferencePort: 8080,
    publicUrl: 'https://host.example.com',
    models: ['llama-70b'],
    pricePerToken: 0.0001,
    minSessionDeposit: 0.01
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createBackup', () => {
    it('should create timestamped backup', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist

      const backupPath = await ConfigBackup.createBackup(mockConfig);

      expect(backupPath).toMatch(/backup-\d{4}-\d{2}-\d{2}/);
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"version": "1.0.0"'),
        'utf8'
      );
    });

    it('should create backup with custom path', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist

      const customPath = '/custom/backup.json';
      const backupPath = await ConfigBackup.createBackup(mockConfig, customPath);

      expect(backupPath).toBe(customPath);
      expect(fs.writeFile).toHaveBeenCalledWith(
        customPath,
        expect.stringContaining('"_metadata"'),
        'utf8'
      );
    });

    it('should include metadata in backup', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist

      await ConfigBackup.createBackup(mockConfig);

      const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
      const writtenData = JSON.parse(writeCall[1] as string);

      expect(writtenData._metadata).toBeDefined();
      expect(writtenData._metadata.timestamp).toBeDefined();
      expect(writtenData._metadata.version).toBe('1.0.0');
    });

    it('should handle existing backup files by adding suffix', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      // First call returns success (file exists), second call returns error (file doesn't exist)
      vi.mocked(fs.access)
        .mockResolvedValueOnce(undefined) // First file exists
        .mockRejectedValueOnce({ code: 'ENOENT' }); // Second file doesn't exist

      const backupPath = await ConfigBackup.createBackup(mockConfig);

      expect(backupPath).toMatch(/backup-\d{4}-\d{2}-\d{2}-1\.json$/);
    });
  });

  describe('restoreBackup', () => {
    it('should restore configuration from backup', async () => {
      const backupData = {
        ...mockConfig,
        _metadata: {
          timestamp: new Date().toISOString(),
          version: '1.0.0'
        }
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(backupData));

      const restored = await ConfigBackup.restoreBackup('/path/to/backup.json');

      expect(restored).toEqual(mockConfig);
    });

    it('should validate backup format', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(ConfigBackup.restoreBackup('/path/to/backup.json'))
        .rejects.toThrow('Invalid backup file format');
    });

    it('should handle missing backup file', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      await expect(ConfigBackup.restoreBackup('/nonexistent.json'))
        .rejects.toThrow('Backup file not found');
    });
  });

  describe('listBackups', () => {
    it('should list all backup files', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'backup-2024-01-01.json',
        'backup-2024-01-02.json',
        'config.json'
      ] as any);

      const backups = await ConfigBackup.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups).toContain('backup-2024-01-01.json');
      expect(backups).toContain('backup-2024-01-02.json');
      expect(backups).not.toContain('config.json');
    });

    it('should return empty array if no backups', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([] as any);

      const backups = await ConfigBackup.listBackups();

      expect(backups).toHaveLength(0);
    });

    it('should sort backups by date', async () => {
      vi.mocked(fs.readdir).mockResolvedValue([
        'backup-2024-01-03.json',
        'backup-2024-01-01.json',
        'backup-2024-01-02.json'
      ] as any);

      const backups = await ConfigBackup.listBackups();

      expect(backups[0]).toBe('backup-2024-01-03.json');
      expect(backups[1]).toBe('backup-2024-01-02.json');
      expect(backups[2]).toBe('backup-2024-01-01.json');
    });
  });

  describe('cleanupOldBackups', () => {
    it('should remove old backups', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      vi.mocked(fs.readdir).mockResolvedValue([
        'backup-old.json'
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: oldDate
      } as any);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const removed = await ConfigBackup.cleanupOldBackups(30);

      expect(removed).toBe(1);
      expect(fs.unlink).toHaveBeenCalledWith(expect.stringContaining('backup-old.json'));
    });

    it('should keep recent backups', async () => {
      const recentDate = new Date();

      vi.mocked(fs.readdir).mockResolvedValue([
        'backup-recent.json'
      ] as any);
      vi.mocked(fs.stat).mockResolvedValue({
        mtime: recentDate
      } as any);

      const removed = await ConfigBackup.cleanupOldBackups(30);

      expect(removed).toBe(0);
      expect(fs.unlink).not.toHaveBeenCalled();
    });
  });
});