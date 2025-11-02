/**
 * Lazy Loader
 * Lazy chunk loading for efficient memory usage
 * Max 250 lines
 */

import type { VectorInput } from '../rag/vector-operations.js';

export interface LazyLoaderConfig {
  chunkSize: number;
  preloadSize?: number; // Number of chunks to preload ahead
  maxLoadedChunks?: number; // Maximum chunks to keep in memory
}

export interface ChunkInfo {
  index: number;
  startIndex: number;
  endIndex: number;
  loadedAt?: number;
  lastAccessAt?: number;
  accessCount: number;
}

export interface LazyLoaderStats {
  totalChunks: number;
  loadedChunks: number;
  totalAccesses: number;
  chunkAccesses: Map<number, number>;
}

export class LazyLoader {
  private config: Required<LazyLoaderConfig>;
  private chunks: Map<number, VectorInput[]> = new Map();
  private chunkInfo: Map<number, ChunkInfo> = new Map();
  private vectorData: VectorInput[] = [];
  private totalChunks: number = 0;

  constructor(config: LazyLoaderConfig) {
    this.config = {
      chunkSize: config.chunkSize,
      preloadSize: config.preloadSize || 2,
      maxLoadedChunks: config.maxLoadedChunks || 10
    };
  }

  /**
   * Initialize with vector data
   */
  async initialize(vectors: VectorInput[]): Promise<void> {
    this.vectorData = vectors;
    this.totalChunks = Math.ceil(vectors.length / this.config.chunkSize);

    // Create chunk info for all chunks
    for (let i = 0; i < this.totalChunks; i++) {
      const startIndex = i * this.config.chunkSize;
      const endIndex = Math.min(startIndex + this.config.chunkSize, vectors.length);

      this.chunkInfo.set(i, {
        index: i,
        startIndex,
        endIndex,
        accessCount: 0
      });
    }

    // Load first chunk
    await this.loadChunk(0);
  }

  /**
   * Get a chunk by index
   */
  async getChunk(chunkIndex: number): Promise<VectorInput[]> {
    if (chunkIndex < 0 || chunkIndex >= this.totalChunks) {
      throw new Error(`Chunk index ${chunkIndex} out of bounds`);
    }

    // Update access tracking
    const info = this.chunkInfo.get(chunkIndex);
    if (info) {
      info.lastAccessAt = Date.now();
      info.accessCount++;
    }

    // Load chunk if not already loaded
    if (!this.chunks.has(chunkIndex)) {
      await this.loadChunk(chunkIndex);

      // Preload adjacent chunks
      await this.preloadChunks(chunkIndex);

      // Evict old chunks if over limit
      this.evictChunks();
    }

    return this.chunks.get(chunkIndex) || [];
  }

  /**
   * Get loaded chunk count
   */
  getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  /**
   * Get statistics
   */
  getStats(): LazyLoaderStats {
    const chunkAccesses = new Map<number, number>();
    let totalAccesses = 0;

    for (const [index, info] of this.chunkInfo.entries()) {
      chunkAccesses.set(index, info.accessCount);
      totalAccesses += info.accessCount;
    }

    return {
      totalChunks: this.totalChunks,
      loadedChunks: this.chunks.size,
      totalAccesses,
      chunkAccesses
    };
  }

  /**
   * Clear all loaded chunks
   */
  clear(): void {
    this.chunks.clear();
  }

  /**
   * Load a chunk into memory
   */
  private async loadChunk(chunkIndex: number): Promise<void> {
    const info = this.chunkInfo.get(chunkIndex);
    if (!info) return;

    const chunkData = this.vectorData.slice(info.startIndex, info.endIndex);
    this.chunks.set(chunkIndex, chunkData);

    info.loadedAt = Date.now();
  }

  /**
   * Preload adjacent chunks
   */
  private async preloadChunks(currentChunk: number): Promise<void> {
    const chunksToLoad: number[] = [];

    // Load next chunks
    for (let i = 1; i <= this.config.preloadSize; i++) {
      const nextChunk = currentChunk + i;
      if (nextChunk < this.totalChunks && !this.chunks.has(nextChunk)) {
        chunksToLoad.push(nextChunk);
      }
    }

    // Load preload chunks
    for (const chunkIndex of chunksToLoad) {
      await this.loadChunk(chunkIndex);
    }
  }

  /**
   * Evict least recently used chunks
   */
  private evictChunks(): void {
    if (this.chunks.size <= this.config.maxLoadedChunks) {
      return;
    }

    // Find chunks to evict (LRU)
    const loadedChunks: Array<{ index: number; lastAccess: number }> = [];

    for (const [index, info] of this.chunkInfo.entries()) {
      if (this.chunks.has(index)) {
        loadedChunks.push({
          index,
          lastAccess: info.lastAccessAt || info.loadedAt || 0
        });
      }
    }

    // Sort by last access time (oldest first)
    loadedChunks.sort((a, b) => a.lastAccess - b.lastAccess);

    // Evict oldest chunks
    const numToEvict = this.chunks.size - this.config.maxLoadedChunks;
    for (let i = 0; i < numToEvict; i++) {
      this.chunks.delete(loadedChunks[i].index);
    }
  }

  /**
   * Get chunk info
   */
  getChunkInfo(chunkIndex: number): ChunkInfo | undefined {
    return this.chunkInfo.get(chunkIndex);
  }

  /**
   * Check if chunk is loaded
   */
  isChunkLoaded(chunkIndex: number): boolean {
    return this.chunks.has(chunkIndex);
  }

  /**
   * Get total vector count
   */
  getTotalVectorCount(): number {
    return this.vectorData.length;
  }

  /**
   * Get chunk size
   */
  getChunkSize(): number {
    return this.config.chunkSize;
  }

  /**
   * Get total chunk count
   */
  getTotalChunkCount(): number {
    return this.totalChunks;
  }
}
