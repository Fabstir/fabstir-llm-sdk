/**
 * Consistency Tests
 * Tests for data consistency checks and validation
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsistencyChecker } from '../../src/resilience/consistency-checker.js';

describe('Consistency Checker', () => {
  let consistencyChecker: ConsistencyChecker;

  beforeEach(() => {
    consistencyChecker = new ConsistencyChecker({
      strictMode: true,
      autoRepair: false
    });
  });

  describe('Data Validation', () => {
    it('should validate vector data structure', () => {
      const validVector = {
        id: 'vec-1',
        values: [0.1, 0.2, 0.3],
        metadata: { source: 'test' }
      };

      const result = consistencyChecker.validateVector(validVector);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect invalid vector structures', () => {
      const invalidVector = {
        id: 'vec-1',
        values: [0.1, NaN, 0.3], // NaN is invalid
        metadata: { source: 'test' }
      };

      const result = consistencyChecker.validateVector(invalidVector);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Vector contains NaN values');
    });

    it('should validate dimension consistency', () => {
      const vectors = [
        { id: '1', values: [0.1, 0.2, 0.3] },
        { id: '2', values: [0.4, 0.5, 0.6] },
        { id: '3', values: [0.7, 0.8] } // Wrong dimension
      ];

      const result = consistencyChecker.validateDimensions(vectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Inconsistent vector dimensions');
    });

    it('should validate unique IDs', () => {
      const vectors = [
        { id: '1', values: [0.1, 0.2] },
        { id: '2', values: [0.3, 0.4] },
        { id: '1', values: [0.5, 0.6] } // Duplicate ID
      ];

      const result = consistencyChecker.validateUniqueIds(vectors);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Duplicate vector ID: 1');
    });
  });

  describe('Checksum Verification', () => {
    it('should compute checksums for data', () => {
      const data = { vectors: [{ id: '1', values: [0.1, 0.2] }] };

      const checksum = consistencyChecker.computeChecksum(data);
      expect(checksum).toHaveLength(64); // SHA-256 hex
    });

    it('should detect data modifications', () => {
      const data = { value: 'original' };
      const checksum1 = consistencyChecker.computeChecksum(data);

      data.value = 'modified';
      const checksum2 = consistencyChecker.computeChecksum(data);

      expect(checksum1).not.toBe(checksum2);
    });

    it('should verify data integrity', () => {
      const data = { test: 'data' };
      const checksum = consistencyChecker.computeChecksum(data);

      const isValid = consistencyChecker.verifyChecksum(data, checksum);
      expect(isValid).toBe(true);
    });

    it('should fail verification for corrupted data', () => {
      const data = { test: 'data' };
      const checksum = consistencyChecker.computeChecksum(data);

      // Modify data
      data.test = 'corrupted';

      const isValid = consistencyChecker.verifyChecksum(data, checksum);
      expect(isValid).toBe(false);
    });
  });

  describe('Transaction Atomicity', () => {
    it('should ensure all-or-nothing operations', async () => {
      const operations = [
        vi.fn(async () => 'op1'),
        vi.fn(async () => 'op2'),
        vi.fn(async () => {
          throw new Error('op3 failed');
        })
      ];

      await expect(
        consistencyChecker.executeAtomic(operations)
      ).rejects.toThrow('op3 failed');

      // All operations should be rolled back
      const state = consistencyChecker.getState();
      expect(state.completedOperations).toHaveLength(0);
    });

    it('should commit all operations on success', async () => {
      const operations = [
        vi.fn(async () => 'op1'),
        vi.fn(async () => 'op2'),
        vi.fn(async () => 'op3')
      ];

      const results = await consistencyChecker.executeAtomic(operations);
      expect(results).toEqual(['op1', 'op2', 'op3']);

      const state = consistencyChecker.getState();
      expect(state.completedOperations).toHaveLength(3);
    });

    it('should support nested atomic operations', async () => {
      const inner = [
        vi.fn(async () => 'inner1'),
        vi.fn(async () => 'inner2')
      ];

      const outer = [
        vi.fn(async () => 'outer1'),
        vi.fn(async () => consistencyChecker.executeAtomic(inner)),
        vi.fn(async () => 'outer3')
      ];

      const results = await consistencyChecker.executeAtomic(outer);
      expect(results[1]).toEqual(['inner1', 'inner2']);
    });
  });

  describe('State Consistency', () => {
    it('should detect inconsistent state', () => {
      const state = {
        vectorCount: 100,
        metadata: {
          count: 95 // Mismatch
        }
      };

      const result = consistencyChecker.checkStateConsistency(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Vector count mismatch');
    });

    it('should validate cross-references', () => {
      const state = {
        vectors: [
          { id: '1', metadata: { folderId: 'folder-1' } },
          { id: '2', metadata: { folderId: 'folder-2' } }
        ],
        folders: [
          { id: 'folder-1', name: 'Folder 1' }
          // folder-2 is missing
        ]
      };

      const result = consistencyChecker.validateReferences(state);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid folder reference: folder-2');
    });

    it('should check index integrity', () => {
      const data = {
        vectors: [
          { id: '1', values: [0.1, 0.2] },
          { id: '2', values: [0.3, 0.4] }
        ],
        index: {
          '1': 0,
          '3': 2 // ID 3 doesn't exist
        }
      };

      const result = consistencyChecker.checkIndexIntegrity(data);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Index contains non-existent ID: 3');
    });
  });

  describe('Auto-Repair', () => {
    it('should repair minor inconsistencies when enabled', () => {
      const checker = new ConsistencyChecker({ autoRepair: true });

      const state = {
        vectorCount: 100,
        metadata: {
          count: 95 // Will be auto-corrected
        }
      };

      const result = checker.checkStateConsistency(state);
      expect(result.valid).toBe(true);
      expect(result.repairs).toContain('Updated metadata count to 100');
    });

    it('should not repair in strict mode', () => {
      const checker = new ConsistencyChecker({
        strictMode: true,
        autoRepair: true // Overridden by strict mode
      });

      const state = {
        vectorCount: 100,
        metadata: { count: 95 }
      };

      const result = checker.checkStateConsistency(state);
      expect(result.valid).toBe(false);
      expect(result.repairs).toHaveLength(0);
    });

    it('should log repair actions', () => {
      const checker = new ConsistencyChecker({ autoRepair: true });
      const onRepair = vi.fn();
      checker.on('repair', onRepair);

      const state = {
        vectorCount: 100,
        metadata: { count: 95 }
      };

      checker.checkStateConsistency(state);
      expect(onRepair).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'count_mismatch',
          action: 'Updated metadata count'
        })
      );
    });
  });

  describe('Consistency Reports', () => {
    it('should generate consistency reports', () => {
      const data = {
        vectors: [
          { id: '1', values: [0.1, 0.2] },
          { id: '1', values: [0.3, 0.4] } // Duplicate
        ],
        metadata: {
          count: 3 // Wrong count
        }
      };

      const report = consistencyChecker.generateReport(data);

      expect(report.valid).toBe(false);
      expect(report.errors).toHaveLength(2);
      expect(report.checks).toHaveProperty('duplicateIds');
      expect(report.checks).toHaveProperty('countMismatch');
    });

    it('should include severity levels in reports', () => {
      const data = {
        vectors: [{ id: '1', values: [0.1, NaN] }] // Critical error
      };

      const report = consistencyChecker.generateReport(data);

      expect(report.errors.some(e => e.severity === 'critical')).toBe(true);
    });

    it('should track consistency over time', () => {
      const data1 = { vectorCount: 10 };
      const data2 = { vectorCount: 10 };
      const data3 = { vectorCount: 8 }; // Inconsistency

      consistencyChecker.checkStateConsistency(data1);
      consistencyChecker.checkStateConsistency(data2);
      consistencyChecker.checkStateConsistency(data3);

      const history = consistencyChecker.getCheckHistory();
      expect(history).toHaveLength(3);
      expect(history[2].valid).toBe(false);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple datasets efficiently', () => {
      const datasets = [
        { id: 'db1', vectors: [{ id: '1', values: [0.1, 0.2] }] },
        { id: 'db2', vectors: [{ id: '2', values: [0.3, 0.4] }] },
        { id: 'db3', vectors: [{ id: '3', values: [0.5, NaN] }] } // Invalid
      ];

      const results = consistencyChecker.validateBatch(datasets);

      expect(results).toHaveLength(3);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
      expect(results[2].valid).toBe(false);
    });

    it('should support parallel validation', async () => {
      const datasets = Array.from({ length: 10 }, (_, i) => ({
        id: `db${i}`,
        vectors: [{ id: String(i), values: [0.1, 0.2] }]
      }));

      const startTime = Date.now();
      const results = await consistencyChecker.validateBatchParallel(datasets);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Cleanup and Maintenance', () => {
    it('should clear check history', () => {
      consistencyChecker.checkStateConsistency({ vectorCount: 1 });
      consistencyChecker.checkStateConsistency({ vectorCount: 2 });

      expect(consistencyChecker.getCheckHistory()).toHaveLength(2);

      consistencyChecker.clearHistory();
      expect(consistencyChecker.getCheckHistory()).toHaveLength(0);
    });

    it('should get consistency statistics', () => {
      consistencyChecker.checkStateConsistency({ vectorCount: 1 });
      consistencyChecker.checkStateConsistency({ vectorCount: 2 });
      consistencyChecker.checkStateConsistency({ invalid: true });

      const stats = consistencyChecker.getStats();
      expect(stats.totalChecks).toBe(3);
      expect(stats.failedChecks).toBeGreaterThan(0);
      expect(stats.successRate).toBeLessThan(1.0);
    });
  });
});
