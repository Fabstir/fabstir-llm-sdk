import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import * as ConfigManager from '../../src/config/manager';
import * as ConfigStorage from '../../src/config/storage';
import { registerConfigCommand } from '../../src/commands/config';
import { ConfigData } from '../../src/config/types';

vi.mock('../../src/config/storage');
vi.mock('../../src/config/manager');

describe('Config Commands', () => {
  let program: Command;
  let exitSpy: any;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

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
    program = new Command();
    program.exitOverride(); // Prevent process.exit during tests
    registerConfigCommand(program);

    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('config get', () => {
    it('should get a specific config value', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);

      await program.parseAsync(['node', 'test', 'config', 'get', 'walletAddress']);

      expect(ConfigStorage.loadConfig).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(mockConfig.walletAddress);
    });

    it('should handle nested config keys', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);

      await program.parseAsync(['node', 'test', 'config', 'get', 'models.0']);

      expect(consoleLogSpy).toHaveBeenCalledWith('llama-70b');
    });

    it('should error if config does not exist', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      try {
        await program.parseAsync(['node', 'test', 'config', 'get', 'walletAddress']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No configuration found. Run "fabstir-host init" first.');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should error if key does not exist', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);

      try {
        await program.parseAsync(['node', 'test', 'config', 'get', 'nonexistent']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Key "nonexistent" not found in configuration.');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('config set', () => {
    it('should set a config value', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(ConfigManager.updateConfig).mockResolvedValue({
        ...mockConfig,
        inferencePort: 9090
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue(undefined);

      await program.parseAsync(['node', 'test', 'config', 'set', 'inferencePort', '9090']);

      expect(ConfigManager.updateConfig).toHaveBeenCalledWith(mockConfig, 'inferencePort', '9090');
      expect(ConfigStorage.saveConfig).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Configuration updated successfully.');
    });

    it('should validate new values', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(ConfigManager.updateConfig).mockRejectedValue(
        new Error('Invalid value for inferencePort')
      );

      try {
        await program.parseAsync(['node', 'test', 'config', 'set', 'inferencePort', 'invalid']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Invalid value for inferencePort');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle array values', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);
      vi.mocked(ConfigManager.updateConfig).mockResolvedValue({
        ...mockConfig,
        models: ['llama-70b', 'gpt-j-6b']
      });
      vi.mocked(ConfigStorage.saveConfig).mockResolvedValue(undefined);

      await program.parseAsync(['node', 'test', 'config', 'set', 'models', '["llama-70b","gpt-j-6b"]']);

      expect(ConfigManager.updateConfig).toHaveBeenCalledWith(
        mockConfig,
        'models',
        '["llama-70b","gpt-j-6b"]'
      );
    });
  });

  describe('config list', () => {
    it('should list all configuration values', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);

      await program.parseAsync(['node', 'test', 'config', 'list']);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Configuration'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('walletAddress'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('network'));
    });

    it('should show message if no config exists', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(null);

      try {
        await program.parseAsync(['node', 'test', 'config', 'list']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ No configuration found. Run "fabstir-host init" first.');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should support JSON output format', async () => {
      vi.mocked(ConfigStorage.loadConfig).mockResolvedValue(mockConfig);

      await program.parseAsync(['node', 'test', 'config', 'list', '--json']);

      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockConfig, null, 2));
    });
  });

  describe('config reset', () => {
    it('should reset configuration with confirmation', async () => {
      vi.mocked(ConfigManager.confirmReset).mockResolvedValue(true);
      vi.mocked(ConfigStorage.deleteConfig).mockResolvedValue(true);

      await program.parseAsync(['node', 'test', 'config', 'reset']);

      expect(ConfigManager.confirmReset).toHaveBeenCalled();
      expect(ConfigStorage.deleteConfig).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Configuration reset successfully.');
    });

    it('should skip reset if not confirmed', async () => {
      vi.mocked(ConfigManager.confirmReset).mockResolvedValue(false);

      await program.parseAsync(['node', 'test', 'config', 'reset']);

      expect(ConfigStorage.deleteConfig).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('Reset cancelled.');
    });

    it('should force reset with --force flag', async () => {
      vi.mocked(ConfigStorage.deleteConfig).mockResolvedValue(true);

      await program.parseAsync(['node', 'test', 'config', 'reset', '--force']);

      expect(ConfigManager.confirmReset).not.toHaveBeenCalled();
      expect(ConfigStorage.deleteConfig).toHaveBeenCalled();
    });
  });

  describe('config backup', () => {
    it('should create backup', async () => {
      vi.mocked(ConfigStorage.backupConfig).mockResolvedValue('/home/user/.fabstir/backup-2024.json');

      await program.parseAsync(['node', 'test', 'config', 'backup']);

      expect(ConfigStorage.backupConfig).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Backup created: /home/user/.fabstir/backup-2024.json');
    });

    it('should handle backup errors', async () => {
      vi.mocked(ConfigStorage.backupConfig).mockRejectedValue(new Error('Backup failed'));

      try {
        await program.parseAsync(['node', 'test', 'config', 'backup']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Backup failed');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('config restore', () => {
    it('should restore from backup', async () => {
      vi.mocked(ConfigStorage.restoreConfig).mockResolvedValue(undefined);

      await program.parseAsync(['node', 'test', 'config', 'restore', '/path/to/backup.json']);

      expect(ConfigStorage.restoreConfig).toHaveBeenCalledWith('/path/to/backup.json');
      expect(consoleLogSpy).toHaveBeenCalledWith('✅ Configuration restored successfully.');
    });

    it('should validate backup file exists', async () => {
      vi.mocked(ConfigStorage.restoreConfig).mockRejectedValue(
        new Error('Backup file not found')
      );

      try {
        await program.parseAsync(['node', 'test', 'config', 'restore', '/invalid/path.json']);
      } catch {}

      expect(consoleErrorSpy).toHaveBeenCalledWith('❌ Error: Backup file not found');
    });
  });
});