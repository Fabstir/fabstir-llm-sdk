// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { S5 } from '@julesl23/s5js';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { Vector, SearchResult } from '../types';
import type { DatabaseMetadata } from '../database/types';

interface DatabaseManifest {
  name: string;
  owner: string;
  description?: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes: number;
  created: number;
  lastAccessed: number;
  updated: number;
  chunks: ChunkMetadata[];
  chunkCount: number;
  folderPaths: string[];
  deleted?: boolean;
  // Document metadata for deferred embeddings workflow
  pendingDocuments?: any[];
  readyDocuments?: any[];
}

interface ChunkMetadata {
  chunkId: number;
  cid: string;
  vectorCount: number;
  sizeBytes: number;
  updatedAt: number;
}

interface VectorChunk {
  chunkId: number;
  vectors: Vector[];
}

/**
 * Statistics for a folder in a vector database
 */
export interface FolderStats {
  path: string;
  vectorCount: number;
  sizeBytes: number;
  lastModified: number;
}

export interface S5VectorStoreOptions {
  s5Client: S5;
  userAddress: string;
  encryptionManager: EncryptionManager;
  cacheEnabled?: boolean;
}

export class S5VectorStore {
  private readonly s5Client: S5;
  private readonly userAddress: string;
  private readonly encryptionManager: EncryptionManager;
  private readonly cacheEnabled: boolean;
  private manifestCache: Map<string, DatabaseManifest>;
  private vectorCache: Map<string, Map<string, Vector>>;

  constructor(options: S5VectorStoreOptions) {
    this.s5Client = options.s5Client;
    this.userAddress = options.userAddress;
    this.encryptionManager = options.encryptionManager;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.manifestCache = new Map();
    this.vectorCache = new Map();
  }

  /**
   * Initialize the vector store by loading all database manifests from S5 storage
   *
   * IMPORTANT: This method MUST be called after construction to populate the manifestCache
   * from S5 storage. Without this, listDatabases() will return an empty array even when
   * databases exist in S5.
   *
   * Uses S5 filesystem API to:
   * 1. List all subdirectories in home/vector-databases/{userAddress}/
   * 2. Load manifest.json from each database directory
   * 3. Populate manifestCache for fast access
   */
  /**
   * Initialize vector store by loading existing databases from S5
   *
   * **Usage**: Call once at startup, not after every operation
   * - Skips initialization if cache is already populated
   * - Retries with exponential backoff to handle blob propagation delays
   */
  async initialize(): Promise<void> {
    // Skip if already initialized (prevents redundant S5 calls)
    if (this.cacheEnabled && this.manifestCache.size > 0) {
      console.log('[S5VectorStore] ✅ Already initialized - using existing cache');
      return;
    }

    console.log('[S5VectorStore] 🚀 Initialize() called - starting database discovery');
    try {
      const basePath = this._getDatabaseBasePath();
      console.log(`[S5VectorStore] Step 1: Base path = ${basePath}`);

      // Try fs.list() - handle 404 gracefully for new users
      console.log('[S5VectorStore] Step 2: Calling s5Client.fs.list()...');
      let iterator;
      try {
        iterator = await this.s5Client.fs.list(basePath);
      } catch (error: any) {
        // 404 means directory doesn't exist yet - normal for new users
        if (error?.message?.includes('404') || error?.status === 404) {
          console.log('[S5VectorStore] ✅ No databases directory yet (new user) - initialized empty');
          return;
        }
        throw error;
      }

      if (!iterator) {
        console.log('[S5VectorStore] ❌ Failed to get iterator from fs.list()');
        return;
      }

      // Collect all entries from the async iterator
      const entries: any[] = [];
      for await (const entry of iterator) {
        entries.push(entry);
      }
      console.log(`[S5VectorStore] Step 2: ✅ Got ${entries.length} entries`);

      if (entries.length === 0) {
        // No databases yet - this is fine for new users
        console.log('[S5VectorStore] ⚠️ No databases found (empty directory)');
        return;
      }

      // Load manifests in parallel with retry logic
      const directories = entries.filter((entry: any) => entry.type === 'directory');
      console.log(`[S5VectorStore] Step 3: Found ${directories.length} database directories`);

      const manifestPromises = directories.map(async (entry: any) => {
        const databaseName = entry.name;

        // Retry loading manifest with exponential backoff (blob propagation delay)
        for (let i = 0; i < 5; i++) {
          try {
            console.log(`[S5VectorStore] Loading manifest for "${databaseName}"... (attempt ${i + 1}/5)`);
            const manifest = await this._loadManifest(databaseName);

            console.log(`[S5VectorStore] Manifest loaded for "${databaseName}": exists=${!!manifest}, deleted=${manifest?.deleted}, cacheEnabled=${this.cacheEnabled}`);

            if (manifest && !manifest.deleted && this.cacheEnabled) {
              this.manifestCache.set(databaseName, manifest);
              console.log(`[S5VectorStore] ✅ Loaded "${databaseName}" into cache`);
              return; // Success - exit retry loop
            } else {
              console.log(`[S5VectorStore] ❌ Skipped caching "${databaseName}" - check conditions above`);
              break; // Got manifest (even if null), no need to retry
            }
          } catch (error) {
            if (i === 4) {
              // Final attempt failed - log warning and continue
              console.warn(`[S5VectorStore] ⚠️ Failed to load "${databaseName}" after 5 retries:`, error);
            } else {
              // Retry with exponential backoff: 200ms, 400ms, 800ms, 1600ms
              const delay = 200 * Math.pow(2, i);
              console.log(`[S5VectorStore] ⚠️ Retry loading "${databaseName}" (${i + 1}/5) - waiting ${delay}ms`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }
      });

      await Promise.all(manifestPromises);

      console.log(`[S5VectorStore] ✅✅✅ Initialized with ${this.manifestCache.size} database(s)`);
    } catch (error) {
      // If base path doesn't exist yet, that's okay - user has no databases
      const errorMsg = (error as any)?.message || '';
      if (errorMsg.includes('not found') || errorMsg.includes('404') || errorMsg.includes('does not exist')) {
        console.log('[S5VectorStore] ⚠️ No existing databases found (base path does not exist yet)');
        return;
      }

      // Log other errors but don't throw - allow SDK to continue working
      console.error('[S5VectorStore] ❌ Error during initialization:', error);
    }
  }

  /**
   * Create a new vector database
   *
   * @param config - Database configuration
   * @param config.name - Unique database identifier (alphanumeric + hyphens)
   * @param config.owner - Owner's Ethereum address (0x...)
   * @param config.description - Optional human-readable description
   * @returns Database metadata
   * @throws Error if database name is empty or database already exists
   */
  async createDatabase(config: { name: string; owner: string; description?: string }): Promise<DatabaseMetadata> {
    console.log(`[S5VectorStore] 📝 createDatabase() called with name: ${config.name}, owner: ${config.owner}`);
    if (!config.name?.trim()) throw new Error('Database name cannot be empty');
    if (await this.databaseExists(config.name)) throw new Error(`Database "${config.name}" already exists`);

    const manifest: DatabaseManifest = {
      name: config.name,
      owner: config.owner,
      description: config.description,
      vectorCount: 0,
      storageSizeBytes: 0,
      created: Date.now(),
      lastAccessed: Date.now(),
      updated: Date.now(),
      chunks: [],
      chunkCount: 0,
      folderPaths: [],
    };

    console.log(`[S5VectorStore] 💾 About to save manifest to S5...`);
    await this._saveManifest(config.name, manifest);
    console.log(`[S5VectorStore] ✅ Manifest saved successfully`);
    return this._manifestToMetadata(manifest);
  }

  /**
   * List all databases for current user
   *
   * @returns Array of database metadata (excluding deleted databases)
   */
  async listDatabases(): Promise<DatabaseMetadata[]> {
    // Ensure databases are loaded from S5 if cache is empty
    await this.initialize();

    const databases: DatabaseMetadata[] = [];
    for (const manifest of this.manifestCache.values()) {
      if (!manifest.deleted) databases.push(this._manifestToMetadata(manifest));
    }
    return databases;
  }

  /**
   * Get metadata for a specific database
   *
   * @param databaseName - Database identifier
   * @returns Database metadata or null if not found/deleted
   */
  async getDatabase(databaseName: string): Promise<DatabaseMetadata | null> {
    const manifest = await this._loadManifest(databaseName);
    return (manifest && !manifest.deleted) ? this._manifestToMetadata(manifest) : null;
  }

  /**
   * Delete a database and all its vectors
   *
   * Marks database as deleted in manifest and removes from cache.
   * Chunks are not immediately deleted (lazy cleanup).
   *
   * @param databaseName - Database identifier
   * @throws Error if database not found
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    manifest.deleted = true;
    await this._saveManifest(databaseName, manifest);
    this.manifestCache.delete(databaseName);
    this.vectorCache.delete(databaseName);
  }

  /**
   * Update database metadata
   *
   * Loads the current manifest, updates it with the provided metadata fields,
   * and saves it back to S5. Used for updating document arrays and other metadata.
   *
   * @param databaseName - Database identifier
   * @param metadata - Partial metadata to update (pendingDocuments, readyDocuments, etc.)
   * @throws Error if database not found
   */
  async updateDatabaseMetadata(databaseName: string, metadata: Partial<DatabaseMetadata>): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);

    // Update manifest fields from metadata (reverse of _manifestToMetadata)
    if (metadata.pendingDocuments !== undefined) {
      manifest.pendingDocuments = metadata.pendingDocuments;
    }
    if (metadata.readyDocuments !== undefined) {
      manifest.readyDocuments = metadata.readyDocuments;
    }

    if (metadata.vectorCount !== undefined) {
      manifest.vectorCount = metadata.vectorCount;
    }
    if (metadata.storageSizeBytes !== undefined) {
      manifest.storageSizeBytes = metadata.storageSizeBytes;
    }
    if (metadata.description !== undefined) {
      manifest.description = metadata.description;
    }
    if (metadata.dimensions !== undefined) {
      manifest.dimensions = metadata.dimensions;
    }

    // Update lastAccessed timestamp
    manifest.lastAccessed = Date.now();
    manifest.updated = Date.now();

    await this._saveManifest(databaseName, manifest);
  }

  /**
   * Check if a database exists
   *
   * @param databaseName - Database identifier
   * @returns true if database exists and not deleted
   */
  async databaseExists(databaseName: string): Promise<boolean> {
    const manifest = await this._loadManifest(databaseName);
    return manifest !== null && !manifest.deleted;
  }

  /**
   * Add multiple vectors to database (batch operation)
   *
   * Automatically chunks into 10K-vector groups for efficient storage.
   * Updates manifest and persists to S5 in background.
   *
   * @param databaseName - Database identifier
   * @param vectors - Array of vectors with IDs, values, and optional metadata
   * @throws Error if database not found or vector dimensions mismatch
   */
  async addVectors(databaseName: string, vectors: Vector[]): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);

    if (vectors.length > 0) {
      const firstDim = vectors[0].vector.length;
      for (const vec of vectors) {
        if (vec.vector.length !== firstDim) throw new Error('Vector dimension mismatch');
      }
      if (!manifest.dimensions) manifest.dimensions = firstDim;
      else if (manifest.dimensions !== firstDim) throw new Error('Vector dimension mismatch');
    }

    let cache = this.vectorCache.get(databaseName) || await this._loadAllVectors(databaseName, manifest);
    for (const vector of vectors) {
      cache.set(vector.id, vector);
      const folderPath = vector.metadata?.folderPath;
      if (folderPath && !manifest.folderPaths.includes(folderPath)) manifest.folderPaths.push(folderPath);
    }

    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
    this.vectorCache.set(databaseName, cache);
  }

  /**
   * Retrieve a single vector by ID
   *
   * @param databaseName - Database identifier
   * @param vectorId - Vector identifier
   * @returns Vector with metadata or null if not found
   */
  async getVector(databaseName: string, vectorId: string): Promise<Vector | null> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) return null;
    const cache = await this._loadAllVectors(databaseName, manifest);
    return cache.get(vectorId) || null;
  }

  /**
   * Delete a single vector by ID
   *
   * @param databaseName - Database identifier
   * @param vectorId - Vector identifier
   * @throws Error if database not found
   */
  async deleteVector(databaseName: string, vectorId: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    cache.delete(vectorId);
    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
  }

  /**
   * Delete all vectors matching a metadata filter
   *
   * @param databaseName - Database identifier
   * @param filter - Metadata filter (key-value exact match)
   * @returns Number of vectors deleted
   * @throws Error if database not found
   */
  async deleteByMetadata(databaseName: string, filter: Record<string, any>): Promise<number> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    let deletedCount = 0;
    for (const [id, vector] of cache.entries()) {
      if (this._matchesFilter(vector.metadata, filter)) {
        cache.delete(id);
        deletedCount++;
      }
    }
    manifest.vectorCount = cache.size;
    manifest.updated = Date.now();
    await this._saveChunksBackground(databaseName, cache, manifest);
    return deletedCount;
  }

  /**
   * Update metadata for a specific vector
   *
   * @param databaseName - Database identifier
   * @param vectorId - Vector identifier
   * @param metadata - Metadata to update (merged with existing)
   * @throws Error if vector not found
   */
  async updateMetadata(databaseName: string, vectorId: string, metadata: Record<string, any>): Promise<void> {
    const vector = await this.getVector(databaseName, vectorId);
    if (!vector) throw new Error(`Vector "${vectorId}" not found`);
    vector.metadata = { ...vector.metadata, ...metadata };
    await this.addVectors(databaseName, [vector]);
  }

  /**
   * List all vectors in database
   *
   * Warning: Loads ALL vectors into memory - use with caution for large databases
   *
   * @param databaseName - Database identifier
   * @returns All vectors with metadata
   * @throws Error if database not found
   */
  async listVectors(databaseName: string): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    return Array.from(cache.values());
  }

  async getStats(databaseName: string) {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    return {
      vectorCount: manifest.vectorCount,
      chunkCount: manifest.chunkCount,
      storageSizeBytes: manifest.storageSizeBytes,
      lastUpdated: manifest.updated,
    };
  }

  async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata> {
    const db = await this.getDatabase(databaseName);
    if (!db) throw new Error(`Database "${databaseName}" not found`);
    return db;
  }

  async addVector(databaseName: string, id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    await this.addVectors(databaseName, [{ id, vector, metadata: metadata || {} }]);
  }

  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) throw new Error(`Database "${databaseName}" not found`);
    const cache = await this._loadAllVectors(databaseName, manifest);
    return vectorIds.map(id => cache.get(id)).filter(v => v !== undefined) as Vector[];
  }

  // ===== FOLDER OPERATIONS (Mock SDK Parity) =====

  async listFolders(databaseName: string): Promise<string[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }
    return manifest.folderPaths.sort();
  }

  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const vectors = await this.listVectors(databaseName);
    const folderCounts = new Map<string, number>();

    vectors.forEach(v => {
      const folder = v.metadata?.folderPath;
      if (folder) {
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    });

    manifest.folderPaths.forEach(folder => {
      if (!folderCounts.has(folder)) {
        folderCounts.set(folder, 0);
      }
    });

    return Array.from(folderCounts.entries())
      .map(([path, fileCount]) => ({ path, fileCount }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    const vectors = await this.listVectors(databaseName);
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    return {
      path: folderPath,
      vectorCount: folderVectors.length,
      sizeBytes: folderVectors.length * (folderVectors[0]?.vector.length || 0) * 4,
      lastModified: Date.now(),
    };
  }

  async createFolder(databaseName: string, folderPath: string): Promise<void> {
    if (!folderPath || folderPath.trim() === '') {
      throw new Error('Folder path cannot be empty');
    }

    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    if (!manifest.folderPaths.includes(folderPath)) {
      manifest.folderPaths.push(folderPath);
      manifest.updated = Date.now();
      await this._saveManifest(databaseName, manifest);
    }
  }

  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const updates: Vector[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === oldPath) {
        v.metadata.folderPath = newPath;
        updates.push(v);
      }
    });

    if (updates.length > 0) {
      await this.addVectors(databaseName, updates);
    }

    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      const idx = manifest.folderPaths.indexOf(oldPath);
      if (idx !== -1) {
        manifest.folderPaths[idx] = newPath;
        await this._saveManifest(databaseName, manifest);
      }
    }

    return updates.length;
  }

  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const toDelete: string[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === folderPath) {
        toDelete.push(v.id);
      }
    });

    for (const id of toDelete) {
      await this.deleteVector(databaseName, id);
    }

    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      manifest.folderPaths = manifest.folderPaths.filter(f => f !== folderPath);
      await this._saveManifest(databaseName, manifest);
    }

    return toDelete.length;
  }

  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    const vector = await this.getVector(databaseName, vectorId);
    if (!vector) {
      throw new Error(`Vector "${vectorId}" not found`);
    }

    vector.metadata = { ...vector.metadata, folderPath: targetFolder };
    await this.addVectors(databaseName, [vector]);
  }

  async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const toMove: Vector[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === sourceFolder) {
        v.metadata.folderPath = targetFolder;
        toMove.push(v);
      }
    });

    if (toMove.length > 0) {
      await this.addVectors(databaseName, toMove);
    }

    return toMove.length;
  }

  async searchInFolder(databaseName: string, folderPath: string, queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> {
    throw new Error('searchInFolder() requires host-side support. Use search() and filter results client-side for now.');
  }

  // ===== PRIVATE HELPERS =====

  private _getDatabaseBasePath(): string {
    return `home/vector-databases/${this.userAddress}`;
  }

  private _getManifestPath(databaseName: string): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/manifest.json`;
  }

  private _getChunkPath(databaseName: string, chunkId: number): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/chunk-${chunkId}.json`;
  }

  private async _loadManifest(databaseName: string): Promise<DatabaseManifest | null> {
    if (this.cacheEnabled && this.manifestCache.has(databaseName)) {
      return this.manifestCache.get(databaseName)!;
    }

    try {
      const path = this._getManifestPath(databaseName);
      console.log(`[S5VectorStore] _loadManifest: Getting manifest from path: ${path}`);
      const data = await this.s5Client.fs.get(path);
      console.log(`[S5VectorStore] _loadManifest: Got result from s5Client.fs.get(): ${!!data}, type=${typeof data}`);

      if (!data) {
        console.log(`[S5VectorStore] _loadManifest: No data returned for "${databaseName}"`);
        return null;
      }

      // s5.js fs.get() returns the parsed object directly, not a JSON string
      let manifest: DatabaseManifest;
      if (typeof data === 'string') {
        // If it's a string, parse it
        manifest = JSON.parse(data) as DatabaseManifest;
      } else if (typeof data === 'object') {
        // If it's already an object, use it directly
        manifest = data as DatabaseManifest;
      } else {
        console.log(`[S5VectorStore] _loadManifest: Unexpected data type for "${databaseName}": ${typeof data}`);
        return null;
      }

      console.log(`[S5VectorStore] _loadManifest: Successfully loaded manifest for "${databaseName}"`);

      if (this.cacheEnabled) {
        this.manifestCache.set(databaseName, manifest);
      }

      return manifest;
    } catch (error) {
      console.log(`[S5VectorStore] _loadManifest: Error loading manifest for "${databaseName}":`, error);
      return null;
    }
  }

  private async _saveManifest(databaseName: string, manifest: DatabaseManifest): Promise<void> {
    const path = this._getManifestPath(databaseName);
    console.log(`[S5VectorStore] _saveManifest() called for "${databaseName}"`);
    console.log(`[S5VectorStore] Path: ${path}`);
    console.log(`[S5VectorStore] Calling s5Client.fs.put()...`);
    // S5 handles CBOR encoding automatically - pass object directly
    await this.s5Client.fs.put(path, manifest);
    console.log(`[S5VectorStore] ✅ s5Client.fs.put() completed successfully`);

    if (this.cacheEnabled) {
      this.manifestCache.set(databaseName, manifest);
      console.log(`[S5VectorStore] Cached manifest for "${databaseName}"`);
    }
  }

  private async _loadAllVectors(databaseName: string, manifest: DatabaseManifest): Promise<Map<string, Vector>> {
    if (this.cacheEnabled && this.vectorCache.has(databaseName)) {
      return this.vectorCache.get(databaseName)!;
    }

    const cache = new Map<string, Vector>();

    const chunkPromises = manifest.chunks.map(chunkMeta => this._loadChunk(databaseName, chunkMeta.chunkId));
    const chunks = await Promise.all(chunkPromises);

    for (const chunk of chunks) {
      if (chunk) {
        for (const vector of chunk.vectors) {
          cache.set(vector.id, vector);
        }
      }
    }

    if (this.cacheEnabled) {
      this.vectorCache.set(databaseName, cache);
    }

    return cache;
  }

  private async _loadChunk(databaseName: string, chunkId: number): Promise<VectorChunk | null> {
    try {
      const path = this._getChunkPath(databaseName, chunkId);
      // S5 returns object directly (CBOR decoding automatic)
      const data = await this.s5Client.fs.get(path);
      if (!data) return null;

      return data as VectorChunk;
    } catch (error) {
      return null;
    }
  }

  private async _saveChunksBackground(databaseName: string, cache: Map<string, Vector>, manifest: DatabaseManifest): Promise<void> {
    const chunkSize = 10000;
    const vectors = Array.from(cache.values());
    const chunks: VectorChunk[] = [];

    for (let i = 0; i < vectors.length; i += chunkSize) {
      const chunkVectors = vectors.slice(i, i + chunkSize);
      chunks.push({ chunkId: chunks.length, vectors: chunkVectors });
    }

    const chunkPromises = chunks.map(chunk => this._saveChunk(databaseName, chunk));
    const chunkMetas = await Promise.all(chunkPromises);

    manifest.chunks = chunkMetas;
    manifest.chunkCount = chunkMetas.length;

    await this._saveManifest(databaseName, manifest);
  }

  private async _saveChunk(databaseName: string, chunk: VectorChunk): Promise<ChunkMetadata> {
    const path = this._getChunkPath(databaseName, chunk.chunkId);
    console.log(`[S5VectorStore] _saveChunk() called for chunk ${chunk.chunkId}`);
    console.log(`[S5VectorStore] Path: ${path}`);
    console.log(`[S5VectorStore] Calling s5Client.fs.put()...`);
    // S5 handles CBOR encoding automatically - pass object directly
    await this.s5Client.fs.put(path, chunk);
    console.log(`[S5VectorStore] ✅ s5Client.fs.put() completed successfully`);

    return {
      chunkId: chunk.chunkId,
      cid: path, // Use path as identifier in path-based S5
      vectorCount: chunk.vectors.length,
      sizeBytes: 0, // Size calculated by S5 (CBOR encoded)
      updatedAt: Date.now(),
    };
  }

  private _manifestToMetadata(manifest: DatabaseManifest): DatabaseMetadata {
    return {
      databaseName: manifest.name,
      type: 'vector' as const,
      createdAt: manifest.created,
      lastAccessedAt: manifest.lastAccessed,
      owner: manifest.owner,
      vectorCount: manifest.vectorCount,
      storageSizeBytes: manifest.storageSizeBytes,
      description: manifest.description,
      // Preserve document metadata arrays for deferred embeddings workflow
      pendingDocuments: manifest.pendingDocuments,
      readyDocuments: manifest.readyDocuments,
    } as any;
  }

  private _matchesFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
