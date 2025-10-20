// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as ConfigStorage from '../../src/config/storage';
import { ConfigData } from '../../src/config/types';

vi.mock('fs/promises');
vi.mock('os');

describe('Configuration Persistence', () => {
  const mockHomeDir = '/home/user';
  const mockConfigPath = path.join(mockHomeDir, '.fabstir', 'config.json');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(os.homedir).mockReturnValue(mockHomeDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('saveConfig', () => {
    it('should save configuration to correct location', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await ConfigStorage.saveConfig(config);

      expect(fs.mkdir).toHaveBeenCalledWith(
        path.join(mockHomeDir, '.fabstir'),
        { recursive: true }
      );
      expect(fs.writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
    });

    it('should handle save errors', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      await expect(ConfigStorage.saveConfig(config)).rejects.toThrow('Failed to save configuration');
    });

    it('should create backup before overwriting', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(fs.access).mockResolvedValue(undefined); // File exists
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);
      vi.mocked(fs.copyFile).mockResolvedValue(undefined);

      await ConfigStorage.saveConfig(config);

      expect(fs.copyFile).toHaveBeenCalled();
    });
  });

  describe('loadConfig', () => {
    it('should load configuration from file', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));

      const loaded = await ConfigStorage.loadConfig();
      expect(loaded).toEqual(config);
    });

    it('should return null if config does not exist', async () => {
      vi.mocked(fs.readFile).mockRejectedValue({ code: 'ENOENT' });

      const loaded = await ConfigStorage.loadConfig();
      expect(loaded).toBeNull();
    });

    it('should handle corrupted config file', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json');

      await expect(ConfigStorage.loadConfig()).rejects.toThrow('Invalid configuration file');
    });

    it('should migrate old config versions', async () => {
      const oldConfig = {
        version: '0.9.0',
        walletAddress: '0x123',
        network: 'testnet' // Old format
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(oldConfig));

      const loaded = await ConfigStorage.loadConfig();
      expect(loaded?.version).toBe('1.0.0');
      expect(loaded?.network).toBe('base-sepolia'); // Migrated
    });
  });

  describe('configExists', () => {
    it('should return true if config file exists', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const exists = await ConfigStorage.configExists();
      expect(exists).toBe(true);
    });

    it('should return false if config file does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue({ code: 'ENOENT' });

      const exists = await ConfigStorage.configExists();
      expect(exists).toBe(false);
    });
  });

  describe('deleteConfig', () => {
    it('should delete config file', async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const deleted = await ConfigStorage.deleteConfig();
      expect(deleted).toBe(true);
      expect(fs.unlink).toHaveBeenCalledWith(mockConfigPath);
    });

    it('should return false if no config to delete', async () => {
      vi.mocked(fs.unlink).mockRejectedValue({ code: 'ENOENT' });

      const deleted = await ConfigStorage.deleteConfig();
      expect(deleted).toBe(false);
    });
  });

  describe('backupConfig', () => {
    it('should create timestamped backup', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      const backupPath = await ConfigStorage.backupConfig();
      expect(backupPath).toContain('backup');
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle backup errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Read error'));

      await expect(ConfigStorage.backupConfig()).rejects.toThrow('Failed to backup configuration');
    });
  });

  describe('restoreConfig', () => {
    it('should restore from backup file', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const backupPath = path.join(mockHomeDir, '.fabstir', 'backup.json');
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(config));
      vi.mocked(fs.writeFile).mockResolvedValue(undefined);

      await ConfigStorage.restoreConfig(backupPath);
      expect(fs.writeFile).toHaveBeenCalledWith(
        mockConfigPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
    });
  });

  describe('getConfigPath', () => {
    it('should return correct config path', () => {
      const configPath = ConfigStorage.getConfigPath();
      expect(configPath).toBe(mockConfigPath);
    });
  });

  describe('migrateConfig', () => {
    it('should migrate v0.9.0 to v1.0.0', async () => {
      const oldConfig = {
        version: '0.9.0',
        walletAddress: '0x123',
        network: 'testnet'
      };

      const migrated = await ConfigStorage.migrateConfig(oldConfig as any);
      expect(migrated.version).toBe('1.0.0');
      expect(migrated.network).toBe('base-sepolia');
    });

    it('should not modify current version config', async () => {
      const config: ConfigData = {
        version: '1.0.0',
        walletAddress: '0x123',
        network: 'base-sepolia',
        rpcUrl: 'https://test.rpc',
        inferencePort: 8080,
        publicUrl: 'https://host.example.com',
        models: ['model1'],
        pricePerToken: 0.0001,
        minSessionDeposit: 0.01
      };

      const migrated = await ConfigStorage.migrateConfig(config);
      expect(migrated).toEqual(config);
    });
  });
});