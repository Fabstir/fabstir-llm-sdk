/**
 * Vector Operations Module
 * Handles vector addition, updates, and deletion
 * Max 400 lines
 */

/**
 * Vector input format for adding vectors
 */
export interface VectorInput {
  id: string;
  values: number[];
  metadata: Record<string, any>;
}

/**
 * Result of vector addition operation
 */
export interface AddVectorResult {
  added: number;
  failed: number;
  errors?: Array<{ id: string; error: string }>;
  skipped?: number;
  replaced?: number;
  batches?: number;
}

/**
 * Options for batch vector addition
 */
export interface AddVectorOptions {
  batchSize?: number;
  handleDuplicates?: 'skip' | 'replace' | 'error';
  onProgress?: (progress: number) => void;
}

/**
 * Validate a single vector
 * @param vector - Vector to validate
 * @param expectedDimensions - Expected vector dimensions (default: 384)
 * @throws Error if validation fails
 */
export function validateVector(vector: any, expectedDimensions: number = 384): void {
  // Check if vector has required fields
  if (!vector.id) {
    throw new Error('Vector ID is required');
  }

  if (!vector.values) {
    throw new Error('Vector values are required');
  }

  // Check if values is an array
  if (!Array.isArray(vector.values)) {
    throw new Error('Vector values must be an array');
  }

  // Check dimensions
  if (vector.values.length !== expectedDimensions) {
    throw new Error(`Invalid vector dimensions: expected ${expectedDimensions}, got ${vector.values.length}`);
  }

  // Check if metadata is an object (not array, not null, not primitive)
  if (vector.metadata !== undefined && vector.metadata !== null) {
    if (typeof vector.metadata !== 'object' || Array.isArray(vector.metadata)) {
      throw new Error('Metadata must be an object');
    }
  }
}

/**
 * Convert VectorInput to VectorRecord format
 * @param input - Vector input
 * @returns VectorRecord compatible with VectorDbSession
 */
export function convertToVectorRecord(input: VectorInput): any {
  return {
    id: input.id,
    vector: input.values,
    metadata: input.metadata || {}
  };
}

/**
 * Validate a batch of vectors
 * Returns array of valid vectors and array of errors
 */
export function validateVectorBatch(
  vectors: VectorInput[],
  expectedDimensions: number = 384
): {
  valid: VectorInput[];
  errors: Array<{ id: string; error: string }>;
} {
  const valid: VectorInput[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const vector of vectors) {
    try {
      validateVector(vector, expectedDimensions);
      valid.push(vector);
    } catch (error) {
      errors.push({
        id: vector?.id || 'unknown',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return { valid, errors };
}

/**
 * Process vectors in batches
 * @param vectors - Vectors to process
 * @param batchSize - Size of each batch
 * @param processor - Function to process each batch
 * @param onProgress - Optional progress callback
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R>,
  onProgress?: (progress: number) => void
): Promise<R[]> {
  const results: R[] = [];
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, Math.min(i + batchSize, items.length));
    const result = await processor(batch);
    results.push(result);

    if (onProgress) {
      const progress = Math.round(((i + batch.length) / items.length) * 100);
      onProgress(progress);
    }
  }

  return results;
}

/**
 * Detect duplicate vector IDs in a batch
 * @param vectors - Vectors to check
 * @returns Map of duplicate IDs to their indices
 */
export function detectDuplicates(vectors: VectorInput[]): Map<string, number[]> {
  const idMap = new Map<string, number[]>();

  vectors.forEach((vector, index) => {
    const existing = idMap.get(vector.id) || [];
    existing.push(index);
    idMap.set(vector.id, existing);
  });

  // Filter to only duplicates (IDs that appear more than once)
  const duplicates = new Map<string, number[]>();
  idMap.forEach((indices, id) => {
    if (indices.length > 1) {
      duplicates.set(id, indices);
    }
  });

  return duplicates;
}

/**
 * Handle duplicate vectors based on strategy
 * @param vectors - Input vectors
 * @param strategy - How to handle duplicates
 * @returns Deduplicated vectors and skip count
 */
export function handleDuplicates(
  vectors: VectorInput[],
  strategy: 'skip' | 'replace' | 'error' = 'error'
): { vectors: VectorInput[]; skipped: number } {
  const duplicates = detectDuplicates(vectors);

  if (duplicates.size === 0) {
    return { vectors, skipped: 0 };
  }

  if (strategy === 'error') {
    const duplicateIds = Array.from(duplicates.keys()).join(', ');
    throw new Error(`Duplicate vector IDs found: ${duplicateIds}`);
  }

  if (strategy === 'skip') {
    // Keep only first occurrence of each ID
    const seen = new Set<string>();
    const deduplicated: VectorInput[] = [];

    vectors.forEach((vector) => {
      if (!seen.has(vector.id)) {
        seen.add(vector.id);
        deduplicated.push(vector);
      }
    });

    return {
      vectors: deduplicated,
      skipped: vectors.length - deduplicated.length
    };
  }

  if (strategy === 'replace') {
    // Keep only last occurrence of each ID
    const idMap = new Map<string, VectorInput>();
    vectors.forEach((vector) => {
      idMap.set(vector.id, vector);
    });

    return {
      vectors: Array.from(idMap.values()),
      skipped: 0 // Not really skipped, but replaced
    };
  }

  return { vectors, skipped: 0 };
}

/**
 * Split vectors into chunks for efficient processing
 * @param vectors - Vectors to chunk
 * @param chunkSize - Size of each chunk
 * @returns Array of vector chunks
 */
export function chunkVectors(vectors: VectorInput[], chunkSize: number): VectorInput[][] {
  const chunks: VectorInput[][] = [];

  for (let i = 0; i < vectors.length; i += chunkSize) {
    chunks.push(vectors.slice(i, Math.min(i + chunkSize, vectors.length)));
  }

  return chunks;
}

/**
 * Estimate memory usage for vectors
 * @param vectorCount - Number of vectors
 * @param dimensions - Vector dimensions
 * @param avgMetadataSize - Average metadata size in bytes
 * @returns Estimated memory in MB
 */
export function estimateVectorMemory(
  vectorCount: number,
  dimensions: number = 384,
  avgMetadataSize: number = 100
): number {
  // Vector: dimensions * 4 bytes (float32) + metadata + overhead
  const bytesPerVector = (dimensions * 4) + avgMetadataSize + 50; // 50 bytes overhead
  const totalBytes = vectorCount * bytesPerVector;
  return totalBytes / (1024 * 1024); // Convert to MB
}
