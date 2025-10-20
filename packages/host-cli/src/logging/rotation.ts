// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface RotationConfig {
  maxSize?: string;
  maxFiles?: number;
  datePattern?: string;
  compress?: boolean;
}

export interface RotationStats {
  totalFiles: number;
  totalSize: number;
  oldestFile?: string;
  newestFile?: string;
}

export class LogRotator {
  private logDir: string;
  private config: RotationConfig;
  private rotationTimer?: NodeJS.Timeout;

  constructor(logDir: string, config: RotationConfig = {}) {
    this.logDir = logDir;
    this.config = {
      maxSize: config.maxSize || '10m',
      maxFiles: config.maxFiles || 7,
      datePattern: config.datePattern || 'YYYY-MM-DD',
      compress: config.compress || false
    };
  }

  getConfig(): RotationConfig {
    return { ...this.config };
  }

  private parseSize(size: string): number {
    const match = size.match(/^(\d+)([kmg])?$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const value = parseInt(match[1]);
    const unit = (match[2] || '').toLowerCase();

    switch (unit) {
      case 'k': return value * 1024;
      case 'm': return value * 1024 * 1024;
      case 'g': return value * 1024 * 1024 * 1024;
      default: return value;
    }
  }

  async checkAndRotate(filename: string): Promise<void> {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const stats = fs.statSync(filepath);
    const maxSize = this.parseSize(this.config.maxSize!);

    if (stats.size >= maxSize) {
      await this.rotate(filename);
    }
  }

  private async rotate(filename: string): Promise<void> {
    const filepath = path.join(this.logDir, filename);

    // Find next available rotation number
    let rotationNum = 1;
    while (fs.existsSync(`${filepath}.${rotationNum}`)) {
      rotationNum++;
    }

    // Rename current file
    fs.renameSync(filepath, `${filepath}.${rotationNum}`);

    // Create new empty file
    fs.writeFileSync(filepath, '');

    // Clean old files if needed
    await this.cleanOldFiles(filename);
  }

  async cleanOldFiles(filename: string): Promise<void> {
    const filepath = path.join(this.logDir, filename);
    const files: string[] = [];

    // Find all rotated files
    const dir = fs.readdirSync(this.logDir);
    const baseFilename = path.basename(filename);

    dir.forEach(file => {
      if (file.startsWith(baseFilename + '.') && /\.\d+$/.test(file)) {
        files.push(file);
      }
    });

    // Sort by rotation number (oldest first)
    files.sort((a, b) => {
      const numA = parseInt(a.split('.').pop()!);
      const numB = parseInt(b.split('.').pop()!);
      return numA - numB; // Oldest first (1, 2, 3, 4, 5)
    });

    // Keep only the first maxFiles (oldest ones)
    // Remove files from the end (highest numbers)
    while (files.length > this.config.maxFiles!) {
      const newerFile = files.pop()!; // Remove from end (newer files with higher numbers)
      fs.unlinkSync(path.join(this.logDir, newerFile));
    }
  }

  async rotateDated(filename: string): Promise<void> {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const date = this.formatDate();
    let rotatedPath = `${filepath}.${date}`;

    // Check if date-only file exists
    if (fs.existsSync(rotatedPath)) {
      // Find next available counter
      let counter = 1;
      while (fs.existsSync(`${filepath}.${date}.${counter}`)) {
        counter++;
      }
      // Move existing date-only file to .1 if it's the first collision
      if (counter === 1 && !fs.existsSync(`${filepath}.${date}.1`)) {
        fs.renameSync(rotatedPath, `${filepath}.${date}.1`);
        rotatedPath = `${filepath}.${date}.2`;
      } else {
        rotatedPath = `${filepath}.${date}.${counter}`;
      }
    }

    fs.renameSync(filepath, rotatedPath);
    fs.writeFileSync(filepath, '');
  }

  private formatDate(): string {
    const now = new Date();
    const pattern = this.config.datePattern!;

    return pattern
      .replace('YYYY', now.getFullYear().toString())
      .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
      .replace('DD', String(now.getDate()).padStart(2, '0'))
      .replace('HH', String(now.getHours()).padStart(2, '0'));
  }

  async rotateAndCompress(filename: string): Promise<void> {
    const filepath = path.join(this.logDir, filename);

    if (!fs.existsSync(filepath)) {
      return;
    }

    const date = this.formatDate();
    const rotatedPath = `${filepath}.${date}`;
    const compressedPath = `${rotatedPath}.gz`;

    // Read file content
    const content = fs.readFileSync(filepath);

    // Compress content
    const compressed = await gzip(content);

    // Write compressed file
    fs.writeFileSync(compressedPath, compressed);

    // Clear original file
    fs.writeFileSync(filepath, '');
  }

  scheduleDailyRotation(): void {
    // Rotate daily at midnight
    const msPerDay = 24 * 60 * 60 * 1000;

    this.rotationTimer = setInterval(() => {
      this.rotateAllLogs();
    }, msPerDay);
  }

  private async rotateAllLogs(): Promise<void> {
    const files = fs.readdirSync(this.logDir);

    for (const file of files) {
      if (file.endsWith('.log')) {
        if (this.config.compress) {
          await this.rotateAndCompress(file);
        } else {
          await this.rotateDated(file);
        }
      }
    }
  }

  stop(): void {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = undefined;
    }
  }

  async getRotationStats(filename: string): Promise<RotationStats> {
    const filepath = path.join(this.logDir, filename);
    const stats: RotationStats = {
      totalFiles: 0,
      totalSize: 0
    };

    // Include main file
    if (fs.existsSync(filepath)) {
      stats.totalFiles++;
      stats.totalSize += fs.statSync(filepath).size;
      stats.newestFile = filename;
    }

    // Find rotated files
    const dir = fs.readdirSync(this.logDir);
    const baseFilename = path.basename(filename);
    const rotatedFiles: string[] = [];

    dir.forEach(file => {
      if (file.startsWith(baseFilename + '.')) {
        rotatedFiles.push(file);
        const fullPath = path.join(this.logDir, file);
        stats.totalFiles++;
        stats.totalSize += fs.statSync(fullPath).size;
      }
    });

    if (rotatedFiles.length > 0) {
      rotatedFiles.sort();
      stats.oldestFile = rotatedFiles[0];
      if (!stats.newestFile) {
        stats.newestFile = rotatedFiles[rotatedFiles.length - 1];
      }
    }

    return stats;
  }
}