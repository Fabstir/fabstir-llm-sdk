/**
 * Batch Processor
 * Handles batch processing of vector operations with progress tracking
 * Max 250 lines
 */

/**
 * Batch operation result
 */
export interface BatchResult<T> {
  success: T[];
  failed: Array<{
    item: any;
    error: string;
  }>;
  totalProcessed: number;
  totalFailed: number;
}

/**
 * Batch processor options
 */
export interface BatchProcessorOptions {
  batchSize?: number;
  concurrency?: number;
  onProgress?: (progress: number, processedCount: number, totalCount: number) => void;
  onBatchComplete?: (batchIndex: number, batchCount: number) => void;
  continueOnError?: boolean;
}

/**
 * Default batch processor options
 */
const DEFAULT_OPTIONS: Required<BatchProcessorOptions> = {
  batchSize: 100,
  concurrency: 1,
  onProgress: () => {},
  onBatchComplete: () => {},
  continueOnError: true
};

/**
 * Batch processor class
 * Processes items in configurable batch sizes with progress tracking
 */
export class BatchProcessor<TInput, TOutput> {
  private options: Required<BatchProcessorOptions>;

  constructor(options: BatchProcessorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process items in batches
   * @param items - Items to process
   * @param processor - Function to process each batch
   * @returns Batch result
   */
  async process(
    items: TInput[],
    processor: (batch: TInput[]) => Promise<TOutput[]>
  ): Promise<BatchResult<TOutput>> {
    const totalItems = items.length;
    const batchSize = this.options.batchSize;
    const batches = this.createBatches(items, batchSize);
    const totalBatches = batches.length;

    const success: TOutput[] = [];
    const failed: Array<{ item: any; error: string }> = [];
    let processedCount = 0;

    for (let i = 0; i < totalBatches; i++) {
      const batch = batches[i];

      try {
        const results = await processor(batch);
        success.push(...results);
        processedCount += batch.length;

        // Report progress
        const progress = Math.round((processedCount / totalItems) * 100);
        this.options.onProgress(progress, processedCount, totalItems);
        this.options.onBatchComplete(i + 1, totalBatches);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (this.options.continueOnError) {
          // Add all items in failed batch to failed list
          batch.forEach((item) => {
            failed.push({
              item,
              error: errorMessage
            });
          });
          processedCount += batch.length;

          // Still report progress
          const progress = Math.round((processedCount / totalItems) * 100);
          this.options.onProgress(progress, processedCount, totalItems);
        } else {
          // Stop processing on error
          throw new Error(`Batch processing failed at batch ${i + 1}/${totalBatches}: ${errorMessage}`);
        }
      }
    }

    return {
      success,
      failed,
      totalProcessed: processedCount,
      totalFailed: failed.length
    };
  }

  /**
   * Process items one by one (for operations that need individual handling)
   * @param items - Items to process
   * @param processor - Function to process each item
   * @returns Batch result
   */
  async processIndividual(
    items: TInput[],
    processor: (item: TInput) => Promise<TOutput>
  ): Promise<BatchResult<TOutput>> {
    const totalItems = items.length;
    const success: TOutput[] = [];
    const failed: Array<{ item: any; error: string }> = [];

    for (let i = 0; i < totalItems; i++) {
      const item = items[i];

      try {
        const result = await processor(item);
        success.push(result);

        // Report progress
        const progress = Math.round(((i + 1) / totalItems) * 100);
        this.options.onProgress(progress, i + 1, totalItems);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (this.options.continueOnError) {
          failed.push({ item, error: errorMessage });
          // Still report progress
          const progress = Math.round(((i + 1) / totalItems) * 100);
          this.options.onProgress(progress, i + 1, totalItems);
        } else {
          throw new Error(`Processing failed at item ${i + 1}/${totalItems}: ${errorMessage}`);
        }
      }
    }

    return {
      success,
      failed,
      totalProcessed: totalItems,
      totalFailed: failed.length
    };
  }

  /**
   * Create batches from items
   * @param items - Items to batch
   * @param batchSize - Size of each batch
   * @returns Array of batches
   */
  private createBatches(items: TInput[], batchSize: number): TInput[][] {
    const batches: TInput[][] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, Math.min(i + batchSize, items.length)));
    }

    return batches;
  }
}

/**
 * Simple batch processor function (without class)
 * @param items - Items to process
 * @param batchSize - Size of each batch
 * @param processor - Function to process each batch
 * @param onProgress - Optional progress callback
 * @returns Array of results
 */
export async function processBatches<TInput, TOutput>(
  items: TInput[],
  batchSize: number,
  processor: (batch: TInput[]) => Promise<TOutput[]>,
  onProgress?: (progress: number) => void
): Promise<TOutput[]> {
  const totalItems = items.length;
  const results: TOutput[] = [];

  for (let i = 0; i < totalItems; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, totalItems));
    const batchResults = await processor(batch);
    results.push(...batchResults);

    if (onProgress) {
      const progress = Math.round(((i + batch.length) / totalItems) * 100);
      onProgress(progress);
    }
  }

  return results;
}

/**
 * Estimate batch processing time
 * @param itemCount - Number of items
 * @param batchSize - Batch size
 * @param avgBatchTimeMs - Average time per batch in milliseconds
 * @returns Estimated time in seconds
 */
export function estimateBatchTime(
  itemCount: number,
  batchSize: number,
  avgBatchTimeMs: number
): number {
  const batchCount = Math.ceil(itemCount / batchSize);
  return (batchCount * avgBatchTimeMs) / 1000; // Convert to seconds
}
