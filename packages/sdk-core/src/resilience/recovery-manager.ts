/**
 * Recovery Manager
 * State checkpointing and recovery procedures
 * Max 300 lines
 */

import { createHash } from 'crypto';

export interface RecoveryManagerConfig {
  checkpointInterval?: number;
  maxCheckpoints?: number;
  autoRecover?: boolean;
  stateValidator?: (state: any) => boolean;
  checkpointRetention?: number;
  skipCorrupted?: boolean;
}

export interface Checkpoint {
  checkpointId: string;
  data: any;
  timestamp: number;
  checksum: string;
}

export interface CheckpointMetadata {
  checkpointId: string;
  createdAt: number;
  dataSize: number;
  checksum: string;
}

interface IncompleteOperation {
  operationId: string;
  type: string;
  startTime: number;
}

export class RecoveryManager {
  private config: Required<Omit<RecoveryManagerConfig, 'stateValidator'>> & { stateValidator?: (state: any) => boolean };
  private checkpoints: Map<string, Checkpoint[]> = new Map();
  private incompleteOps: Map<string, IncompleteOperation> = new Map();

  constructor(config: RecoveryManagerConfig = {}) {
    this.config = {
      checkpointInterval: config.checkpointInterval ?? 60000,
      maxCheckpoints: config.maxCheckpoints ?? 10,
      autoRecover: config.autoRecover ?? false,
      checkpointRetention: config.checkpointRetention ?? 86400000, // 24 hours
      skipCorrupted: config.skipCorrupted ?? false,
      stateValidator: config.stateValidator
    };
  }

  /**
   * Create checkpoint
   */
  async createCheckpoint(key: string, data: any): Promise<string> {
    const checkpointId = this.generateCheckpointId();
    const checksum = this.computeChecksum(data);

    const checkpoint: Checkpoint = {
      checkpointId,
      data: JSON.parse(JSON.stringify(data)), // Deep clone
      timestamp: Date.now(),
      checksum
    };

    // Get or create checkpoint list
    const checkpoints = this.checkpoints.get(key) || [];

    // Add new checkpoint
    checkpoints.push(checkpoint);

    // Limit checkpoint history
    if (checkpoints.length > this.config.maxCheckpoints) {
      checkpoints.shift(); // Remove oldest
    }

    this.checkpoints.set(key, checkpoints);

    return checkpointId;
  }

  /**
   * Get latest checkpoint
   */
  async getCheckpoint(key: string): Promise<any> {
    const checkpoints = this.checkpoints.get(key);
    if (!checkpoints || checkpoints.length === 0) {
      throw new Error(`No checkpoint found for key: ${key}`);
    }

    const latest = checkpoints[checkpoints.length - 1];
    return latest.data;
  }

  /**
   * Get checkpoint history
   */
  async getCheckpointHistory(key: string): Promise<Checkpoint[]> {
    return this.checkpoints.get(key) || [];
  }

  /**
   * Get checkpoint metadata
   */
  async getCheckpointMetadata(key: string): Promise<CheckpointMetadata> {
    const checkpoints = this.checkpoints.get(key);
    if (!checkpoints || checkpoints.length === 0) {
      throw new Error(`No checkpoint found for key: ${key}`);
    }

    const latest = checkpoints[checkpoints.length - 1];
    return {
      checkpointId: latest.checkpointId,
      createdAt: latest.timestamp,
      dataSize: JSON.stringify(latest.data).length,
      checksum: latest.checksum
    };
  }

  /**
   * Recover state from checkpoint
   */
  async recoverState(key: string, checkpointId?: string): Promise<any> {
    const checkpoints = this.checkpoints.get(key);
    if (!checkpoints || checkpoints.length === 0) {
      throw new Error(`No checkpoint found for key: ${key}`);
    }

    let checkpoint: Checkpoint;

    if (checkpointId) {
      // Find specific checkpoint
      const found = checkpoints.find(cp => cp.checkpointId === checkpointId);
      if (!found) {
        throw new Error(`Checkpoint ${checkpointId} not found`);
      }
      checkpoint = found;
    } else {
      // Use latest
      checkpoint = checkpoints[checkpoints.length - 1];
    }

    // Validate if validator provided
    if (this.config.stateValidator) {
      const isValid = this.config.stateValidator(checkpoint.data);
      if (!isValid) {
        throw new Error('Checkpoint state validation failed');
      }
    }

    return JSON.parse(JSON.stringify(checkpoint.data)); // Return deep clone
  }

  /**
   * Execute operation with rollback capability
   */
  async executeWithRollback<T>(
    key: string,
    operation: () => Promise<T>
  ): Promise<T> {
    // Create checkpoint before operation
    const checkpointId = await this.createCheckpoint(key, await this.getCheckpoint(key).catch(() => ({})));

    try {
      const result = await operation();
      // Success - optionally clean up temp checkpoint
      return result;
    } catch (error) {
      // Rollback to checkpoint
      await this.recoverState(key, checkpointId);
      throw error;
    }
  }

  /**
   * Recover all states
   */
  async recoverAll(): Promise<Record<string, any>> {
    const recovered: Record<string, any> = {};

    for (const [key, checkpoints] of this.checkpoints.entries()) {
      if (checkpoints.length > 0) {
        const latest = checkpoints[checkpoints.length - 1];
        recovered[key] = latest.data;
      }
    }

    return recovered;
  }

  /**
   * Start tracking operation
   */
  async startOperation(operationId: string, type: string): Promise<void> {
    this.incompleteOps.set(operationId, {
      operationId,
      type,
      startTime: Date.now()
    });
  }

  /**
   * Complete operation
   */
  async completeOperation(operationId: string): Promise<void> {
    this.incompleteOps.delete(operationId);
  }

  /**
   * Get incomplete operations
   */
  async getIncompleteOperations(): Promise<IncompleteOperation[]> {
    return Array.from(this.incompleteOps.values());
  }

  /**
   * Retry incomplete operation
   */
  async retryIncompleteOperation<T>(
    operationId: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const result = await operation();
    await this.completeOperation(operationId);
    return result;
  }

  /**
   * Validate checkpoint integrity
   */
  async validateCheckpoint(key: string): Promise<boolean> {
    const checkpoints = this.checkpoints.get(key);
    if (!checkpoints || checkpoints.length === 0) {
      return false;
    }

    const latest = checkpoints[checkpoints.length - 1];
    const currentChecksum = this.computeChecksum(latest.data);

    return currentChecksum === latest.checksum;
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupOldCheckpoints(): Promise<void> {
    const now = Date.now();
    const cutoff = now - this.config.checkpointRetention;

    for (const [key, checkpoints] of this.checkpoints.entries()) {
      const filtered = checkpoints.filter(cp => cp.timestamp >= cutoff);

      if (filtered.length === 0) {
        this.checkpoints.delete(key);
      } else {
        this.checkpoints.set(key, filtered);
      }
    }
  }

  /**
   * Clear checkpoints for a key
   */
  async clearCheckpoints(key: string): Promise<void> {
    this.checkpoints.delete(key);
  }

  /**
   * Clear all checkpoints
   */
  async clearAll(): Promise<void> {
    this.checkpoints.clear();
    this.incompleteOps.clear();
  }

  /**
   * Generate checkpoint ID
   */
  private generateCheckpointId(): string {
    return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Compute checksum
   */
  private computeChecksum(data: any): string {
    const json = JSON.stringify(data);
    return createHash('sha256').update(json).digest('hex');
  }
}
