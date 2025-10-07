import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigData } from './types';
import { getConfigDir } from './paths';

const CONFIG_FILE = 'config.json';

export function getConfigPath(): string {
  return path.join(getConfigDir(), CONFIG_FILE);
}

export async function saveConfig(config: ConfigData): Promise<void> {
  try {
    const configDir = getConfigDir();
    const configPath = getConfigPath();

    // Create backup if file exists
    try {
      await fs.access(configPath);
      const backupPath = path.join(configDir, `config.backup.${Date.now()}.json`);
      await fs.copyFile(configPath, backupPath);
    } catch {
      // File doesn't exist, no backup needed
    }

    // Create directory if it doesn't exist
    await fs.mkdir(configDir, { recursive: true });

    // Save config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    throw new Error('Failed to save configuration');
  }
}

export async function loadConfig(): Promise<ConfigData | null> {
  try {
    const configPath = getConfigPath();
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    // Migrate if necessary
    return await migrateConfig(config);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    if (error instanceof SyntaxError) {
      throw new Error('Invalid configuration file');
    }
    throw error;
  }
}

export async function configExists(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

export async function deleteConfig(): Promise<boolean> {
  try {
    const configPath = getConfigPath();
    await fs.unlink(configPath);
    return true;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

export async function backupConfig(): Promise<string> {
  try {
    const configPath = getConfigPath();
    const configDir = path.dirname(configPath);
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const backupPath = path.join(configDir, `backup-${timestamp}.json`);

    const data = await fs.readFile(configPath, 'utf8');
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(backupPath, data, 'utf8');

    return backupPath;
  } catch (error) {
    throw new Error('Failed to backup configuration');
  }
}

export async function restoreConfig(backupPath: string): Promise<void> {
  try {
    const configPath = getConfigPath();
    const data = await fs.readFile(backupPath, 'utf8');
    const config = JSON.parse(data);

    // Validate before restoring
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    throw new Error('Failed to restore configuration');
  }
}

export async function migrateConfig(config: any): Promise<ConfigData> {
  // Migrate from v0.9.0 to v1.0.0
  if (config.version === '0.9.0') {
    config.version = '1.0.0';

    // Migrate old network names
    if (config.network === 'testnet') {
      config.network = 'base-sepolia';
    }

    // Add default values for new fields
    config.models = config.models || ['llama-70b'];
    config.pricePerToken = config.pricePerToken || 0.0001;
    config.minSessionDeposit = config.minSessionDeposit || 0.01;
  }

  return config;
}