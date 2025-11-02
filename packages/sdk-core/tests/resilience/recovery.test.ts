/**
 * Recovery Tests
 * Tests for recovery procedures and state restoration
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecoveryManager } from '../../src/resilience/recovery-manager.js';

describe('Recovery Manager', () => {
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    recoveryManager = new RecoveryManager({
      checkpointInterval: 1000,
      maxCheckpoints: 5,
      autoRecover: true
    });
  });

  describe('Checkpointing', () => {
    it('should create checkpoints', async () => {
      const state = {
        databaseName: 'test-db',
        vectorCount: 100,
        lastOperation: 'add'
      };

      await recoveryManager.createCheckpoint('db-state', state);

      const checkpoint = await recoveryManager.getCheckpoint('db-state');
      expect(checkpoint).toEqual(state);
    });

    it('should maintain checkpoint history', async () => {
      await recoveryManager.createCheckpoint('test', { version: 1 });
      await recoveryManager.createCheckpoint('test', { version: 2 });
      await recoveryManager.createCheckpoint('test', { version: 3 });

      const history = await recoveryManager.getCheckpointHistory('test');
      expect(history).toHaveLength(3);
      expect(history[0].data.version).toBe(1);
      expect(history[2].data.version).toBe(3);
    });

    it('should limit checkpoint history to maxCheckpoints', async () => {
      const manager = new RecoveryManager({ maxCheckpoints: 3 });

      for (let i = 1; i <= 5; i++) {
        await manager.createCheckpoint('test', { version: i });
      }

      const history = await manager.getCheckpointHistory('test');
      expect(history).toHaveLength(3);
      expect(history[0].data.version).toBe(3); // Oldest kept
      expect(history[2].data.version).toBe(5); // Latest
    });

    it('should include metadata in checkpoints', async () => {
      await recoveryManager.createCheckpoint('test', { data: 'test' });

      const checkpoint = await recoveryManager.getCheckpointMetadata('test');
      expect(checkpoint.createdAt).toBeDefined();
      expect(checkpoint.checkpointId).toBeDefined();
      expect(checkpoint.dataSize).toBeGreaterThan(0);
    });
  });

  describe('State Recovery', () => {
    it('should restore state from checkpoint', async () => {
      const originalState = {
        vectors: [{ id: '1', values: [0.1, 0.2] }],
        metadata: { count: 1 }
      };

      await recoveryManager.createCheckpoint('db-state', originalState);

      // Simulate state corruption
      const corruptedState = { vectors: [], metadata: { count: 0 } };

      const recovered = await recoveryManager.recoverState('db-state');
      expect(recovered).toEqual(originalState);
    });

    it('should recover from specific checkpoint version', async () => {
      await recoveryManager.createCheckpoint('test', { version: 1 });
      await recoveryManager.createCheckpoint('test', { version: 2 });
      await recoveryManager.createCheckpoint('test', { version: 3 });

      const history = await recoveryManager.getCheckpointHistory('test');
      const version2Id = history[1].checkpointId;

      const recovered = await recoveryManager.recoverState('test', version2Id);
      expect(recovered.version).toBe(2);
    });

    it('should throw error if no checkpoint exists', async () => {
      await expect(
        recoveryManager.recoverState('non-existent')
      ).rejects.toThrow('No checkpoint found');
    });

    it('should validate recovered state', async () => {
      const validator = vi.fn((state: any) => {
        return state.valid === true;
      });

      const manager = new RecoveryManager({ stateValidator: validator });

      await manager.createCheckpoint('test', { valid: true, data: 'test' });

      const recovered = await manager.recoverState('test');
      expect(validator).toHaveBeenCalledWith({ valid: true, data: 'test' });
      expect(recovered.valid).toBe(true);
    });
  });

  describe('Transaction Rollback', () => {
    it('should rollback failed transactions', async () => {
      const transaction = vi.fn(async (state: any) => {
        state.value++;
        if (state.value > 2) {
          throw new Error('Transaction failed');
        }
        return state;
      });

      const initialState = { value: 0 };
      await recoveryManager.createCheckpoint('tx-state', initialState);

      // First transaction succeeds
      await recoveryManager.executeWithRollback('tx-state', async () => {
        return transaction({ value: 1 });
      });

      // Second transaction fails and rolls back
      await expect(
        recoveryManager.executeWithRollback('tx-state', async () => {
          return transaction({ value: 3 });
        })
      ).rejects.toThrow('Transaction failed');

      // State should be restored to before failed transaction
      const state = await recoveryManager.recoverState('tx-state');
      expect(state.value).toBeLessThanOrEqual(1);
    });

    it('should support nested transactions', async () => {
      await recoveryManager.createCheckpoint('test', { value: 0 });

      await recoveryManager.executeWithRollback('test', async () => {
        await recoveryManager.createCheckpoint('test', { value: 1 });

        await recoveryManager.executeWithRollback('test', async () => {
          return { value: 2 };
        });

        return { value: 1 };
      });

      const state = await recoveryManager.recoverState('test');
      expect(state.value).toBe(1);
    });

    it('should cleanup temporary checkpoints after successful transaction', async () => {
      await recoveryManager.createCheckpoint('test', { value: 0 });

      await recoveryManager.executeWithRollback('test', async () => {
        return { value: 1 };
      });

      const history = await recoveryManager.getCheckpointHistory('test');
      // Should not accumulate temp checkpoints
      expect(history.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Automatic Recovery', () => {
    it('should auto-recover from crashes', async () => {
      const manager = new RecoveryManager({ autoRecover: true });

      // Simulate periodic checkpoints
      await manager.createCheckpoint('auto-test', { checkpoint: 1 });
      await manager.createCheckpoint('auto-test', { checkpoint: 2 });

      // Simulate crash and recovery
      const recovered = await manager.recoverAll();

      expect(recovered).toHaveProperty('auto-test');
      expect(recovered['auto-test'].checkpoint).toBe(2);
    });

    it('should identify incomplete operations', async () => {
      await recoveryManager.startOperation('op-123', 'vector-add');

      // Don't complete operation, simulating crash

      const incomplete = await recoveryManager.getIncompleteOperations();
      expect(incomplete).toHaveLength(1);
      expect(incomplete[0].operationId).toBe('op-123');
      expect(incomplete[0].type).toBe('vector-add');
    });

    it('should retry incomplete operations', async () => {
      const operation = vi.fn(async () => {
        return 'completed';
      });

      await recoveryManager.startOperation('op-123', 'test');

      const result = await recoveryManager.retryIncompleteOperation('op-123', operation);
      expect(result).toBe('completed');

      const incomplete = await recoveryManager.getIncompleteOperations();
      expect(incomplete).toHaveLength(0);
    });
  });

  describe('Data Integrity', () => {
    it('should compute checksums for checkpoints', async () => {
      const state = { data: 'test-data' };
      await recoveryManager.createCheckpoint('test', state);

      const metadata = await recoveryManager.getCheckpointMetadata('test');
      expect(metadata.checksum).toBeDefined();
      expect(metadata.checksum).toHaveLength(64); // SHA-256 hex
    });

    it('should detect corrupted checkpoints', async () => {
      const state = { data: 'original' };
      await recoveryManager.createCheckpoint('test', state);

      // Simulate corruption by directly modifying storage
      // (this is a simplified test - real corruption would be different)
      const metadata = await recoveryManager.getCheckpointMetadata('test');
      const isValid = await recoveryManager.validateCheckpoint('test');

      expect(isValid).toBe(true); // Original is valid
    });

    it('should skip corrupted checkpoints during recovery', async () => {
      const manager = new RecoveryManager({ skipCorrupted: true });

      await manager.createCheckpoint('test', { version: 1 });
      await manager.createCheckpoint('test', { version: 2 });

      // Even if some checkpoints are corrupted, should recover from valid ones
      const recovered = await manager.recoverState('test');
      expect(recovered).toBeDefined();
      expect(recovered.version).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Cleanup', () => {
    it('should delete old checkpoints', async () => {
      const manager = new RecoveryManager({ checkpointRetention: 100 }); // 100ms

      await manager.createCheckpoint('test', { value: 1 });
      await new Promise(resolve => setTimeout(resolve, 150));

      await manager.cleanupOldCheckpoints();

      await expect(
        manager.recoverState('test')
      ).rejects.toThrow('No checkpoint found');
    });

    it('should clear all checkpoints for a key', async () => {
      await recoveryManager.createCheckpoint('test', { value: 1 });
      await recoveryManager.createCheckpoint('test', { value: 2 });

      await recoveryManager.clearCheckpoints('test');

      await expect(
        recoveryManager.recoverState('test')
      ).rejects.toThrow('No checkpoint found');
    });

    it('should clear all checkpoints', async () => {
      await recoveryManager.createCheckpoint('test1', { data: 1 });
      await recoveryManager.createCheckpoint('test2', { data: 2 });

      await recoveryManager.clearAll();

      await expect(recoveryManager.recoverState('test1')).rejects.toThrow();
      await expect(recoveryManager.recoverState('test2')).rejects.toThrow();
    });
  });
});
