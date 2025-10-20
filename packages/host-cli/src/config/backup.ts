// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ConfigData } from './types';

const BACKUP_DIR = path.join(os.homedir(), '.fabstir', 'backups');

export async function createBackup(
  config: ConfigData,
  customPath?: string
): Promise<string> {
  try {
    // Add metadata to backup
    const backupData = {
      ...config,
      _metadata: {
        timestamp: new Date().toISOString(),
        version: config.version
      }
    };

    // Determine backup path
    let backupPath: string;
    if (customPath) {
      backupPath = customPath;
      await fs.mkdir(path.dirname(customPath), { recursive: true });
    } else {
      await fs.mkdir(BACKUP_DIR, { recursive: true });
      const timestamp = new Date().toISOString().split('T')[0];
      backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);

      // Add unique suffix if file exists
      let counter = 1;
      while (await fileExists(backupPath)) {
        backupPath = path.join(BACKUP_DIR, `backup-${timestamp}-${counter}.json`);
        counter++;
      }
    }

    // Write backup
    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    return backupPath;
  } catch (error) {
    throw new Error('Failed to create backup');
  }
}

export async function restoreBackup(backupPath: string): Promise<ConfigData> {
  try {
    const data = await fs.readFile(backupPath, 'utf8');
    let parsed: any;

    try {
      parsed = JSON.parse(data);
    } catch {
      throw new Error('Invalid backup file format');
    }

    // Remove metadata before returning
    const { _metadata, ...config } = parsed;
    return config as ConfigData;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error('Backup file not found');
    }
    if (error.message === 'Invalid backup file format') {
      throw error;
    }
    throw new Error('Failed to restore backup');
  }
}

export async function listBackups(): Promise<string[]> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const backups = files.filter(file => file.startsWith('backup-') && file.endsWith('.json'));

    // Sort by date (newest first)
    return backups.sort().reverse();
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new Error('Failed to list backups');
  }
}

export async function cleanupOldBackups(daysToKeep: number = 30): Promise<number> {
  try {
    const files = await fs.readdir(BACKUP_DIR);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    let removedCount = 0;

    for (const file of files) {
      if (!file.startsWith('backup-')) continue;

      const filePath = path.join(BACKUP_DIR, file);
      const stats = await fs.stat(filePath);

      if (stats.mtime < cutoffDate) {
        await fs.unlink(filePath);
        removedCount++;
      }
    }

    return removedCount;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return 0;
    }
    throw new Error('Failed to cleanup old backups');
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}