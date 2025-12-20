// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Docker Log Stream
 * Auto-detects fabstir Docker container and streams logs
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';
import { LogEntry } from '../types';

export class DockerLogStream extends EventEmitter {
  private process: ChildProcess | null = null;
  private containerName: string | null = null;

  /**
   * Connect to Docker logs
   * Auto-detects fabstir container and starts streaming
   */
  async connect(): Promise<void> {
    // Auto-detect fabstir container
    this.containerName = this.detectContainer();
    if (!this.containerName) {
      this.emit('error', new Error('No fabstir Docker container detected'));
      return;
    }

    // Spawn docker logs -f
    this.process = spawn('docker', ['logs', '-f', '--tail', '50', this.containerName]);

    this.process.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          const entry: LogEntry = {
            level: 'stdout',
            message: line,
            timestamp: new Date().toISOString(),
          };
          this.emit('log', entry);
        }
      }
    });

    this.process.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          const entry: LogEntry = {
            level: 'stderr',
            message: line,
            timestamp: new Date().toISOString(),
          };
          this.emit('log', entry);
        }
      }
    });

    this.process.on('close', (code: number | null) => {
      this.emit('disconnect', code);
    });

    this.process.on('error', (err: Error) => {
      this.emit('error', err);
    });

    this.emit('connect', this.containerName);
  }

  /**
   * Detect running fabstir Docker container
   * Searches for containers with 'fabstir' or 'llm-node' in the name
   */
  private detectContainer(): string | null {
    try {
      // Try to find fabstir containers
      const result = execSync(
        'docker ps --filter "status=running" --format "{{.Names}}" 2>/dev/null',
        { encoding: 'utf-8', timeout: 5000 }
      );

      const containers = result.trim().split('\n').filter(Boolean);

      // Look for fabstir-related container names
      const fabstirContainer = containers.find(
        (name) => name.includes('fabstir') || name.includes('llm-node') || name.includes('llm_node')
      );

      if (fabstirContainer) {
        return fabstirContainer;
      }

      // If no fabstir container found, return first container (user might have different naming)
      return containers[0] || null;
    } catch {
      return null;
    }
  }

  /**
   * Get the detected container name
   */
  getContainerName(): string | null {
    return this.containerName;
  }

  /**
   * Disconnect from Docker logs
   */
  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
