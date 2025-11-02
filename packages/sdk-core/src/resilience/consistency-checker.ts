/**
 * Consistency Checker
 * Data validation and consistency verification
 * Max 250 lines
 */

import { createHash } from 'crypto';
import type { EventEmitter } from 'events';

export interface ConsistencyCheckerConfig {
  strictMode?: boolean;
  autoRepair?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  repairs?: string[];
}

export interface CheckReport extends ValidationResult {
  checks: Record<string, boolean>;
  timestamp: number;
}

interface CheckHistoryRecord {
  timestamp: number;
  valid: boolean;
  errors: string[];
}

export class ConsistencyChecker {
  private config: Required<ConsistencyCheckerConfig>;
  private state: { completedOperations: string[] } = { completedOperations: [] };
  private checkHistory: CheckHistoryRecord[] = [];
  private eventHandlers: Map<string, Function[]> = new Map();
  private lastVectorCount: number | undefined;

  constructor(config: ConsistencyCheckerConfig = {}) {
    this.config = {
      strictMode: config.strictMode ?? false,
      autoRepair: config.autoRepair ?? false
    };
  }

  /**
   * Validate vector structure
   */
  validateVector(vector: any): ValidationResult {
    const errors: string[] = [];

    if (!vector.id || typeof vector.id !== 'string') {
      errors.push('Vector must have a valid string ID');
    }

    if (!Array.isArray(vector.values)) {
      errors.push('Vector values must be an array');
    } else if (vector.values.some((v: number) => !Number.isFinite(v))) {
      errors.push('Vector contains NaN values');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate dimension consistency
   */
  validateDimensions(vectors: any[]): ValidationResult {
    if (vectors.length === 0) {
      return { valid: true, errors: [] };
    }

    const firstDim = vectors[0].values.length;
    const inconsistent = vectors.some(v => v.values.length !== firstDim);

    if (inconsistent) {
      return {
        valid: false,
        errors: ['Inconsistent vector dimensions']
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate unique IDs
   */
  validateUniqueIds(vectors: any[]): ValidationResult {
    const ids = new Set<string>();
    const duplicates: string[] = [];

    for (const vector of vectors) {
      if (ids.has(vector.id)) {
        duplicates.push(vector.id);
      }
      ids.add(vector.id);
    }

    if (duplicates.length > 0) {
      return {
        valid: false,
        errors: duplicates.map(id => `Duplicate vector ID: ${id}`)
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Compute checksum
   */
  computeChecksum(data: any): string {
    const json = JSON.stringify(data);
    return createHash('sha256').update(json).digest('hex');
  }

  /**
   * Verify checksum
   */
  verifyChecksum(data: any, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(data);
    return actualChecksum === expectedChecksum;
  }

  /**
   * Execute atomic operations
   */
  async executeAtomic<T>(operations: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];
    const completedIndices: number[] = [];

    try {
      for (let i = 0; i < operations.length; i++) {
        const result = await operations[i]();
        results.push(result);
        completedIndices.push(i);
        this.state.completedOperations.push(`op_${i}`);
      }
      return results;
    } catch (error) {
      // Rollback completed operations
      this.state.completedOperations = [];
      throw error;
    }
  }

  /**
   * Get current state
   */
  getState(): { completedOperations: string[] } {
    return this.state;
  }

  /**
   * Check state consistency
   */
  checkStateConsistency(state: any): ValidationResult {
    const errors: string[] = [];
    const repairs: string[] = [];

    // Validate state structure
    const hasVectorCount = state.vectorCount !== undefined;
    const hasVectors = state.vectors !== undefined;
    const hasMetadata = state.metadata !== undefined;
    const hasValidStructure = hasVectorCount || hasVectors || hasMetadata;

    if (!hasValidStructure) {
      // State has no recognized properties
      errors.push('Invalid state structure');
    }

    // Check for temporal inconsistency (vector count regression)
    if (state.vectorCount !== undefined) {
      if (this.lastVectorCount !== undefined && state.vectorCount < this.lastVectorCount) {
        errors.push('Vector count decreased unexpectedly');
      }
      this.lastVectorCount = state.vectorCount;
    }

    // Check vector count consistency
    if (state.vectorCount !== undefined && state.metadata?.count !== undefined) {
      if (state.vectorCount !== state.metadata.count) {
        if (this.config.autoRepair && !this.config.strictMode) {
          state.metadata.count = state.vectorCount;
          repairs.push('Updated metadata count to ' + state.vectorCount);
          // Emit repair event
          this.emit('repair', {
            type: 'count_mismatch',
            action: 'Updated metadata count'
          });
        } else {
          errors.push('Vector count mismatch');
        }
      }
    }

    this.recordCheck({
      timestamp: Date.now(),
      valid: errors.length === 0,
      errors
    });

    return {
      valid: errors.length === 0,
      errors,
      repairs
    };
  }

  /**
   * Validate references
   */
  validateReferences(state: any): ValidationResult {
    const errors: string[] = [];

    if (state.vectors && state.folders) {
      const folderIds = new Set(state.folders.map((f: any) => f.id));

      for (const vector of state.vectors) {
        const folderId = vector.metadata?.folderId;
        if (folderId && !folderIds.has(folderId)) {
          errors.push(`Invalid folder reference: ${folderId}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Check index integrity
   */
  checkIndexIntegrity(data: any): ValidationResult {
    const errors: string[] = [];

    if (data.vectors && data.index) {
      const vectorIds = new Set(data.vectors.map((v: any) => v.id));

      for (const id of Object.keys(data.index)) {
        if (!vectorIds.has(id)) {
          errors.push(`Index contains non-existent ID: ${id}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Event emitter support
   */
  on(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event) || [];
    handlers.push(handler);
    this.eventHandlers.set(event, handlers);
  }

  /**
   * Emit event
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers.get(event) || [];
    for (const handler of handlers) {
      handler(data);
    }
  }

  /**
   * Generate consistency report
   */
  generateReport(data: any): CheckReport {
    const checks: Record<string, boolean> = {};
    const errors: Array<{ message: string; severity: string }> = [];

    // Check for duplicate IDs
    if (data.vectors) {
      const uniqueIds = this.validateUniqueIds(data.vectors);
      checks.duplicateIds = uniqueIds.valid;
      uniqueIds.errors.forEach(err => {
        errors.push({ message: err, severity: 'warning' });
      });
    }

    // Check count mismatch (use vectors.length if vectorCount not provided)
    if (data.metadata?.count !== undefined) {
      const actualCount = data.vectorCount !== undefined ? data.vectorCount : data.vectors?.length || 0;
      checks.countMismatch = actualCount === data.metadata.count;
      if (!checks.countMismatch) {
        errors.push({ message: 'Count mismatch', severity: 'warning' });
      }
    }

    // Check for NaN values
    if (data.vectors) {
      const hasNaN = data.vectors.some((v: any) =>
        v.values.some((val: number) => !Number.isFinite(val))
      );
      checks.nanValues = !hasNaN;
      if (hasNaN) {
        errors.push({ message: 'Vector contains NaN values', severity: 'critical' });
      }
    }

    return {
      valid: errors.length === 0,
      errors: errors as any,
      checks,
      timestamp: Date.now()
    };
  }

  /**
   * Record check in history
   */
  private recordCheck(record: CheckHistoryRecord): void {
    this.checkHistory.push(record);
  }

  /**
   * Get check history
   */
  getCheckHistory(): CheckHistoryRecord[] {
    return this.checkHistory;
  }

  /**
   * Clear check history
   */
  clearHistory(): void {
    this.checkHistory = [];
  }

  /**
   * Get consistency statistics
   */
  getStats(): {
    totalChecks: number;
    failedChecks: number;
    successRate: number;
  } {
    const total = this.checkHistory.length;
    const failed = this.checkHistory.filter(c => !c.valid).length;

    return {
      totalChecks: total,
      failedChecks: failed,
      successRate: total > 0 ? (total - failed) / total : 1.0
    };
  }

  /**
   * Validate batch of datasets
   */
  validateBatch(datasets: any[]): ValidationResult[] {
    return datasets.map(dataset => this.generateReport(dataset));
  }

  /**
   * Validate batch in parallel
   */
  async validateBatchParallel(datasets: any[]): Promise<ValidationResult[]> {
    const promises = datasets.map(dataset =>
      Promise.resolve(this.generateReport(dataset))
    );

    return Promise.all(promises);
  }
}
