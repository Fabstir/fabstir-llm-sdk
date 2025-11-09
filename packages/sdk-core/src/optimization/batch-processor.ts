/**
 * Batch Processor
 * Request batching system for improved throughput
 * Max 250 lines
 */

export interface BatchProcessorConfig {
  maxBatchSize: number;
  maxWaitTime: number; // milliseconds
}

export interface BatchOperation<T = any> {
  id: string;
  data: T;
  resolve: (value: any) => void;
  reject: (error: any) => void;
}

export interface BatchStats {
  totalBatches: number;
  totalOperations: number;
  avgBatchSize: number;
}

type BatchHandler<T, R> = (batch: T[]) => Promise<R>;

export class BatchProcessor {
  private config: BatchProcessorConfig;
  private queues: Map<string, BatchOperation[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private stats: Map<string, { batches: number; operations: number }> = new Map();

  constructor(config: BatchProcessorConfig) {
    this.config = config;
  }

  /**
   * Submit an operation to be batched
   */
  async submit<T, R>(
    operationType: string,
    handler: BatchHandler<T, R>,
    data?: T
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      // Get or create queue for this operation type
      let queue = this.queues.get(operationType);
      if (!queue) {
        queue = [];
        this.queues.set(operationType, queue);
      }

      // Add operation to queue
      const operation: BatchOperation<T> = {
        id: this.generateId(),
        data: data as T,
        resolve,
        reject
      };

      queue.push(operation);

      // Check if we should flush immediately
      if (queue.length >= this.config.maxBatchSize) {
        this.flush(operationType, handler);
      } else {
        // Set timer if not already set
        if (!this.timers.has(operationType)) {
          const timer = setTimeout(() => {
            this.flush(operationType, handler);
          }, this.config.maxWaitTime);

          this.timers.set(operationType, timer);
        }
      }
    });
  }

  /**
   * Flush a batch of operations
   */
  private async flush<T, R>(
    operationType: string,
    handler: BatchHandler<T, R>
  ): Promise<void> {
    // Clear timer
    const timer = this.timers.get(operationType);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(operationType);
    }

    // Get and clear queue
    const queue = this.queues.get(operationType);
    if (!queue || queue.length === 0) {
      return;
    }

    this.queues.delete(operationType);

    // Update stats
    this.updateStats(operationType, queue.length);

    try {
      // Extract data from operations
      const batch = queue.map(op => op.data);

      // Execute handler
      const result = await handler(batch);

      // Resolve all operations with the result
      for (const operation of queue) {
        operation.resolve(result);
      }
    } catch (error) {
      // Reject all operations with the error
      for (const operation of queue) {
        operation.reject(error);
      }
    }
  }

  /**
   * Get batch statistics
   */
  getStats(): BatchStats {
    let totalBatches = 0;
    let totalOperations = 0;

    for (const stats of this.stats.values()) {
      totalBatches += stats.batches;
      totalOperations += stats.operations;
    }

    const avgBatchSize = totalBatches > 0 ? totalOperations / totalBatches : 0;

    return {
      totalBatches,
      totalOperations,
      avgBatchSize
    };
  }

  /**
   * Get stats for specific operation type
   */
  getOperationStats(operationType: string): { batches: number; operations: number } {
    return this.stats.get(operationType) || { batches: 0, operations: 0 };
  }

  /**
   * Clear all queues
   */
  clear(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }

    this.timers.clear();
    this.queues.clear();
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.clear();
  }

  /**
   * Update statistics
   */
  private updateStats(operationType: string, operationCount: number): void {
    const current = this.stats.get(operationType) || { batches: 0, operations: 0 };

    this.stats.set(operationType, {
      batches: current.batches + 1,
      operations: current.operations + operationCount
    });
  }

  /**
   * Generate unique operation ID
   */
  private generateId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get pending operation count for a type
   */
  getPendingCount(operationType: string): number {
    const queue = this.queues.get(operationType);
    return queue ? queue.length : 0;
  }

  /**
   * Get total pending operations across all types
   */
  getTotalPending(): number {
    let total = 0;
    for (const queue of this.queues.values()) {
      total += queue.length;
    }
    return total;
  }

  /**
   * Manually flush a specific operation type
   */
  async flushType<T, R>(
    operationType: string,
    handler: BatchHandler<T, R>
  ): Promise<void> {
    await this.flush(operationType, handler);
  }

  /**
   * Destroy the batch processor
   */
  destroy(): void {
    this.clear();
    this.resetStats();
  }
}
