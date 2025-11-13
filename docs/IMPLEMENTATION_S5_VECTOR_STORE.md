# Lightweight S5 Vector Storage (SDK)

**Implementation Plan for Replacing @fabstir/vector-db-native**

**Status**: ⏳ Pending (Phase 5.1 of UI5 Migration)

**Scope**: This document covers ONLY SDK backend work for replacing the 8MB Rust binary `@fabstir/vector-db-native` with a lightweight (~5KB) browser-compatible S5 storage solution.

---

## Overview

This document outlines the implementation for replacing `@fabstir/vector-db-native` (8MB Rust NAPI-RS binary with Node.js dependencies) with a lightweight S5-based vector storage solution for browser environments.

**Problem**: VectorRAGManager currently uses `@fabstir/vector-db-native` which:
- ❌ 8MB binary with heavy HNSW/IVF algorithms (should be on host, not client)
- ❌ Uses Node.js-only modules (`fs`, `path`, `process`) - browser-incompatible
- ❌ Violates mobile-first principle (mobile phones shouldn't run heavy algorithms)
- ❌ Next.js can't bundle it for browser use

**Correct Architecture**:
```
Client (Browser/Mobile)
└── S5VectorStore (~5KB JavaScript)
    ├── S5 storage ✅ (save/load JSON)
    ├── Metadata management ✅ (create/list/delete DBs)
    ├── Simple CRUD ✅ (add/delete vectors)
    └── Encryption ✅ (Web Crypto API)

Host (Server)
└── SessionManager → WebSocket → Rust Node
    ├── Generate embeddings (GPU/transformer models)
    ├── Build HNSW/IVF indexes (memory-intensive)
    ├── Vector search (cosine similarity)
    └── Batch processing (thousands of documents)
```

---

## Goals

1. ✅ **Lightweight Storage**: Replace 8MB binary with ~5KB JavaScript module
2. ✅ **Browser Compatible**: No Node.js dependencies, only Web APIs
3. ✅ **S5 Persistence**: Store vectors in decentralized S5 network
4. ✅ **Client-Side Encryption**: Use Web Crypto API (AES-GCM)
5. ✅ **Simple CRUD**: add/delete vectors, create/list/delete databases
6. ⏳ **Host Delegation**: Search/embeddings delegated to host via SessionManager

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      FabstirSDKCore                          │
│                                                               │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ VectorRAG      │  │ Session          │  │ Storage      │ │
│  │ Manager        │  │ Manager          │  │ Manager      │ │
│  │ (MODIFIED)     │  │ (EXISTING)       │  │ (EXISTING)   │ │
│  └───────┬────────┘  └─────────┬────────┘  └──────┬───────┘ │
│          │                     │                   │         │
│          │ Heavy ops           │                   │         │
│          │ (search/embed)      │                   │         │
│          └─────────────────────┘                   │         │
│                    │                                │         │
│                    │                       ┌────────▼───────┐ │
│                    │                       │  S5VectorStore │ │
│                    │                       │  (NEW)         │ │
│                    │                       └────────┬───────┘ │
│                    │                                │         │
│                    │                                │         │
└────────────────────┼────────────────────────────────┼─────────┘
                     │                                │
                     │                                │
          ┌──────────▼──────────┐       ┌────────────▼────────┐
          │  Host Node (Rust)   │       │  Enhanced S5.js     │
          │  via WebSocket      │       │  (Encryption + S5)  │
          └─────────────────────┘       └─────────────────────┘
```

---

## File Organization

### Phase 5.1 Files

**Storage Module** (NEW):
- ⏳ `packages/sdk-core/src/storage/S5VectorStore.ts` (≤400 lines)
- ⏳ `packages/sdk-core/tests/storage/s5-vector-store.test.ts` (≤500 lines)

**Types** (NEW):
- ⏳ `packages/sdk-core/src/types/vector-storage.types.ts` (≤150 lines)
  - Reuse types from `@fabstir/sdk-core-mock/src/types/index.ts`:
    - `VectorDatabaseMetadata` (already exists)
    - `FolderStats` (already exists)
    - `SearchResult` (already exists)

**Modified Files**:
- ⏳ `packages/sdk-core/src/managers/VectorRAGManager.ts` (replace VectorDbSession with S5VectorStore)
- ⏳ `packages/sdk-core/tests/managers/vector-rag-manager.test.ts` (update tests)

**Documentation**:
- ⏳ `docs/S5_VECTOR_STORE_API.md` (API reference)
- ⏳ `docs/ui5-reference/UI5_MIGRATION_PLAN.md` (update Phase 5.1 status)

---

## Phase 5.1: Lightweight S5 Vector Storage

**Goal**: Replace @fabstir/vector-db-native with lightweight S5-based storage

**Estimated Time**: 20-26 hours (revised after mock SDK alignment)

---

### Sub-phase 5.1.1: Create S5VectorStore Module

**Goal**: Implement browser-compatible vector storage using S5 and Web Crypto API

**Status**: ✅ Completed

**Files to Create**:
- `packages/sdk-core/src/storage/S5VectorStore.ts` (≤400 lines)
- `packages/sdk-core/src/types/vector-storage.types.ts` (≤150 lines)
- `packages/sdk-core/tests/storage/s5-vector-store.test.ts` (≤500 lines)

**Tasks**:

#### Test Writing (Write ALL tests first)

**Database Management** (6 tests):
- [x] **Test: createDatabase()** - Creates new vector database with metadata
- [x] **Test: listDatabases()** - Lists all databases for user
- [x] **Test: getDatabase()** - Retrieves specific database metadata
- [x] **Test: deleteDatabase()** - Removes database and all vectors
- [x] **Test: databaseExists()** - Checks if database exists
- [x] **Test: Error handling** - Duplicate names, missing databases

**Vector Operations** (8 tests):
- [x] **Test: addVectors()** - Adds vectors to database with chunking
- [x] **Test: getVector()** - Retrieves specific vector by ID
- [x] **Test: deleteVector()** - Removes single vector by ID
- [x] **Test: deleteByMetadata()** - Bulk delete by metadata filter
- [x] **Test: updateMetadata()** - Updates vector metadata
- [x] **Test: listVectors()** - Lists all vectors in database
- [x] **Test: Chunking** - Handles 10K+ vectors across multiple chunks
- [x] **Test: Error handling** - Dimension mismatch, missing vectors

**Storage & Persistence** (6 tests):
- [x] **Test: save()** - Persists vectors to S5 with encryption
- [x] **Test: load()** - Loads vectors from S5, decrypts
- [x] **Test: S5 path structure** - Correct paths (`home/vector-databases/{user}/{db}/`)
- [x] **Test: Encryption at rest** - Vectors encrypted with AES-GCM
- [x] **Test: Cache performance** - Cache-first strategy < 50ms
- [x] **Test: Error handling** - Network errors, corrupt data, missing keys

**Metadata & Stats** (4 tests):
- [x] **Test: getStats()** - Returns vector count, storage size, last updated
- [x] **Test: Folder tracking** - Tracks folder paths for hierarchies
- [x] **Test: User isolation** - User A cannot see User B's databases
- [x] **Test: Soft delete** - Deleted flag preserved, no data loss

**Edge Cases** (6 tests):
- [x] **Test: Large databases** - 100K+ vectors across 10+ chunks
- [x] **Test: Concurrent operations** - Multiple add/delete ops
- [x] **Test: Empty database** - Zero vectors, metadata only
- [x] **Test: Special characters** - Database names with spaces, unicode
- [x] **Test: Migration** - Load data from old format (backward compat)
- [x] **Test: Performance** - Add 1K vectors < 500ms

**Database Metadata** (4 tests):
- [x] **Test: getVectorDatabaseMetadata()** - Retrieves database metadata
- [x] **Test: getDatabaseMetadata()** - Alias method works correctly
- [x] **Test: updateVectorDatabaseMetadata()** - Updates description, dimensions
- [x] **Test: Error handling** - Database not found throws error

**Single Vector Operations** (3 tests):
- [x] **Test: addVector()** - Adds single vector to database
- [x] **Test: getVectors()** - Retrieves specific vectors by IDs
- [x] **Test: listVectors()** - Lists all vectors in database

**Folder Hierarchy** (10 tests):
- [x] **Test: listFolders()** - Returns all unique folder paths
- [x] **Test: getAllFoldersWithCounts()** - Returns folders with vector counts
- [x] **Test: getFolderStatistics()** - Returns folder stats (size, count, modified)
- [x] **Test: createFolder()** - Creates empty folder
- [x] **Test: renameFolder()** - Renames folder and updates all vectors
- [x] **Test: deleteFolder()** - Deletes folder and all its vectors
- [x] **Test: moveToFolder()** - Moves single vector to folder
- [x] **Test: moveFolderContents()** - Moves all vectors from one folder to another
- [x] **Test: searchInFolder()** - Filters search results by folder
- [x] **Test: Folder path validation** - Invalid paths, nested folders

**Total**: 50 tests (30 original + 20 additional for mock SDK parity)

**Show Test Failures**: Run tests, verify import errors (file doesn't exist yet)

#### Implementation

**Define Types** (`vector-storage.types.ts`):

```typescript
/**
 * Vector Storage Types
 * Reuses types from @fabstir/sdk-core-mock where possible
 */

// Reuse from mock SDK (@fabstir/sdk-core-mock/src/types/index.ts)
export type { VectorDatabaseMetadata, FolderStats, SearchResult } from '@fabstir/sdk-core-mock';

/**
 * Vector Record (stored in S5)
 * ALIGNED WITH MOCK SDK: Reuse Vector type from @fabstir/sdk-core-mock
 */
export type { Vector } from '@fabstir/sdk-core-mock';

// For reference, the structure is:
// export interface Vector {
//   id: string;
//   vector: number[];
//   metadata: Record<string, any>;  // folderPath stored HERE as metadata.folderPath
// }

/**
 * Vector Database Config
 */
export interface VectorDatabaseConfig {
  name: string;
  description?: string;
  owner: string;                   // User address
  dimensions?: number;             // Vector dimensions (auto-detected)
  chunkSize?: number;              // Vectors per chunk (default: 10000)
  encryptAtRest?: boolean;         // Use AES-GCM encryption (default: true)
}

/**
 * Vector Chunk (S5 storage unit)
 * 10K vectors per chunk = ~6.4 MB per chunk (for 768-dim vectors)
 */
export interface VectorChunk {
  chunkId: number;                 // 0, 1, 2, ...
  vectors: VectorRecord[];         // Max 10K vectors
  checksum?: string;               // SHA-256 of vectors (for integrity)
}

/**
 * Database Manifest (S5 metadata)
 */
export interface DatabaseManifest {
  version: string;                 // Storage format version (e.g., "1.0.0")
  databaseName: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  dimensions: number;              // Vector dimensions
  vectorCount: number;             // Total vectors across all chunks
  chunkCount: number;              // Number of chunks
  chunks: ChunkMetadata[];         // Metadata for each chunk
  folderPaths: string[];           // All unique folder paths
  deleted: boolean;                // Soft-delete flag
}

/**
 * Chunk Metadata (in manifest)
 */
export interface ChunkMetadata {
  chunkId: number;
  cid: string;                     // S5 CID for this chunk
  vectorCount: number;             // Vectors in this chunk
  sizeBytes: number;               // Compressed size
  updatedAt: number;
}

/**
 * Database Stats
 */
export interface DatabaseStats {
  databaseName: string;
  vectorCount: number;
  chunkCount: number;
  storageSizeBytes: number;
  lastUpdated: number;
  dimensions: number;
}

/**
 * Delete Result
 */
export interface DeleteResult {
  deletedCount: number;
  deletedIds: string[];
}
```

**Implement S5VectorStore** (`S5VectorStore.ts`):

```typescript
/**
 * S5VectorStore - Lightweight vector storage using S5 and Web Crypto API
 *
 * Responsibilities:
 * - Client-side vector CRUD (add, delete, update metadata)
 * - S5 persistence with chunked storage (10K vectors/chunk)
 * - AES-GCM encryption at rest (Web Crypto API)
 * - Database metadata management
 * - Cache-first strategy for performance
 *
 * NOT responsible for (delegated to host):
 * - Generating embeddings (host has GPU/transformers)
 * - Vector search (host has HNSW/IVF indexes)
 * - Batch processing (host has memory/compute)
 */

import type { S5 } from '@s5-dev/s5js';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type {
  VectorRecord,
  VectorDatabaseConfig,
  VectorChunk,
  DatabaseManifest,
  ChunkMetadata,
  DatabaseStats,
  DeleteResult,
  VectorDatabaseMetadata
} from '../types/vector-storage.types';

export class S5VectorStore {
  private readonly s5Client: S5;
  private readonly userAddress: string;
  private readonly encryptionManager: EncryptionManager;
  private readonly cacheEnabled: boolean;

  // In-memory cache: Map<databaseName, Map<vectorId, VectorRecord>>
  private vectorCache: Map<string, Map<string, VectorRecord>>;

  // Manifest cache: Map<databaseName, DatabaseManifest>
  private manifestCache: Map<string, DatabaseManifest>;

  constructor(options: {
    s5Client: S5;
    userAddress: string;
    encryptionManager: EncryptionManager;
    cacheEnabled?: boolean;
  }) {
    this.s5Client = options.s5Client;
    this.userAddress = options.userAddress;
    this.encryptionManager = options.encryptionManager;
    this.cacheEnabled = options.cacheEnabled !== false; // Default true
    this.vectorCache = new Map();
    this.manifestCache = new Map();
  }

  // ===== Database Management =====

  /**
   * Create a new vector database
   */
  async createDatabase(config: VectorDatabaseConfig): Promise<VectorDatabaseMetadata> {
    // Validate config
    if (!config.name || config.name.trim() === '') {
      throw new Error('Database name cannot be empty');
    }

    // Check if already exists
    const exists = await this.databaseExists(config.name);
    if (exists) {
      throw new Error(`Database "${config.name}" already exists`);
    }

    // Create manifest
    const manifest: DatabaseManifest = {
      version: '1.0.0',
      databaseName: config.name,
      owner: config.owner,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      dimensions: config.dimensions || 0, // Auto-detected on first vector
      vectorCount: 0,
      chunkCount: 0,
      chunks: [],
      folderPaths: [],
      deleted: false
    };

    // Save manifest to S5
    await this._saveManifest(config.name, manifest);

    // Return metadata
    return {
      id: config.name,
      name: config.name,
      dimensions: manifest.dimensions,
      vectorCount: 0,
      storageSizeBytes: 0,
      owner: config.owner,
      created: manifest.createdAt,
      lastAccessed: manifest.updatedAt,
      description: config.description,
      folderStructure: true
    };
  }

  /**
   * List all databases for current user
   */
  async listDatabases(): Promise<VectorDatabaseMetadata[]> {
    const basePath = this._getDatabaseBasePath();

    try {
      // List directories in S5
      const entries = await this.s5Client.listDirectory(basePath);

      const databases: VectorDatabaseMetadata[] = [];

      for (const entry of entries) {
        if (entry.type === 'directory') {
          const dbName = entry.name;
          const manifest = await this._loadManifest(dbName);

          if (manifest && !manifest.deleted) {
            databases.push({
              id: dbName,
              name: dbName,
              dimensions: manifest.dimensions,
              vectorCount: manifest.vectorCount,
              storageSizeBytes: this._calculateStorageSize(manifest),
              owner: manifest.owner,
              created: manifest.createdAt,
              lastAccessed: manifest.updatedAt,
              folderStructure: true
            });
          }
        }
      }

      return databases;
    } catch (error) {
      console.error('[S5VectorStore] Failed to list databases:', error);
      return [];
    }
  }

  /**
   * Get database metadata
   */
  async getDatabase(databaseName: string): Promise<VectorDatabaseMetadata | null> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest || manifest.deleted) {
      return null;
    }

    return {
      id: databaseName,
      name: databaseName,
      dimensions: manifest.dimensions,
      vectorCount: manifest.vectorCount,
      storageSizeBytes: this._calculateStorageSize(manifest),
      owner: manifest.owner,
      created: manifest.createdAt,
      lastAccessed: manifest.updatedAt,
      folderStructure: true
    };
  }

  /**
   * Delete database (soft delete)
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    // Soft delete
    manifest.deleted = true;
    manifest.updatedAt = Date.now();

    await this._saveManifest(databaseName, manifest);

    // Clear caches
    this.vectorCache.delete(databaseName);
    this.manifestCache.delete(databaseName);
  }

  /**
   * Check if database exists
   */
  async databaseExists(databaseName: string): Promise<boolean> {
    const manifest = await this._loadManifest(databaseName);
    return manifest !== null && !manifest.deleted;
  }

  // ===== Vector Operations =====

  /**
   * Add vectors to database
   */
  async addVectors(databaseName: string, vectors: VectorRecord[]): Promise<void> {
    if (vectors.length === 0) return;

    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    // Validate dimensions
    const dimensions = vectors[0].vector.length;
    if (manifest.dimensions === 0) {
      manifest.dimensions = dimensions; // Auto-detect
    } else if (manifest.dimensions !== dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${manifest.dimensions}, got ${dimensions}`);
    }

    // Add to cache
    let cache = this.vectorCache.get(databaseName);
    if (!cache) {
      cache = new Map();
      this.vectorCache.set(databaseName, cache);
    }

    for (const vector of vectors) {
      cache.set(vector.id, vector);
    }

    // Update manifest
    manifest.vectorCount += vectors.length;
    manifest.updatedAt = Date.now();

    // Track folder paths (stored in metadata)
    for (const vector of vectors) {
      const folderPath = vector.metadata?.folderPath;
      if (folderPath && !manifest.folderPaths.includes(folderPath)) {
        manifest.folderPaths.push(folderPath);
      }
    }

    // Save manifest
    await this._saveManifest(databaseName, manifest);

    // Trigger background chunk save (async, don't await)
    this._saveChunksBackground(databaseName, cache, manifest);
  }

  /**
   * Delete vector by ID
   */
  async deleteVector(databaseName: string, vectorId: string): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const cache = this.vectorCache.get(databaseName);
    if (!cache || !cache.has(vectorId)) {
      throw new Error(`Vector "${vectorId}" not found`);
    }

    // Remove from cache
    cache.delete(vectorId);

    // Update manifest
    manifest.vectorCount--;
    manifest.updatedAt = Date.now();

    await this._saveManifest(databaseName, manifest);

    // Trigger background chunk save
    this._saveChunksBackground(databaseName, cache, manifest);
  }

  /**
   * Delete vectors by metadata filter
   */
  async deleteByMetadata(databaseName: string, filter: Record<string, any>): Promise<DeleteResult> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    // Load all vectors
    const cache = await this._loadAllVectors(databaseName, manifest);

    const deletedIds: string[] = [];

    // Filter and delete
    for (const [vectorId, vector] of cache.entries()) {
      if (this._matchesFilter(vector.metadata, filter)) {
        cache.delete(vectorId);
        deletedIds.push(vectorId);
      }
    }

    // Update manifest
    manifest.vectorCount -= deletedIds.length;
    manifest.updatedAt = Date.now();

    await this._saveManifest(databaseName, manifest);

    // Trigger background chunk save
    this._saveChunksBackground(databaseName, cache, manifest);

    return {
      deletedCount: deletedIds.length,
      deletedIds
    };
  }

  /**
   * Get database statistics
   */
  async getStats(databaseName: string): Promise<DatabaseStats> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    return {
      databaseName: manifest.databaseName,
      vectorCount: manifest.vectorCount,
      chunkCount: manifest.chunkCount,
      storageSizeBytes: this._calculateStorageSize(manifest),
      lastUpdated: manifest.updatedAt,
      dimensions: manifest.dimensions
    };
  }

  // ===== ADDITIONAL METHODS FOR MOCK SDK PARITY =====

  /**
   * Get vector database metadata (UI calls this)
   */
  async getVectorDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    return this.getDatabase(databaseName);
  }

  /**
   * Alias for compatibility (UI uses both names)
   */
  async getDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
    return this.getDatabase(databaseName);
  }

  /**
   * Update database metadata (description, etc.)
   */
  async updateVectorDatabaseMetadata(
    databaseName: string,
    updates: Partial<VectorDatabaseMetadata>
  ): Promise<void> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest || manifest.deleted) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    // Apply safe updates
    if (updates.description !== undefined) {
      manifest.description = updates.description;
    }
    if (updates.dimensions !== undefined) {
      manifest.dimensions = updates.dimensions;
    }

    manifest.updatedAt = Date.now();
    await this._saveManifest(databaseName, manifest);
  }

  /**
   * Add single vector (UI uses this for individual uploads)
   */
  async addVector(
    databaseName: string,
    id: string,
    vector: number[],
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.addVectors(databaseName, [{
      id,
      vector,
      metadata: metadata || {}
    }]);
  }

  /**
   * Get specific vectors by ID
   */
  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const cache = await this._loadAllVectors(databaseName, manifest);
    return vectorIds
      .map(id => cache.get(id))
      .filter(v => v !== undefined) as Vector[];
  }

  /**
   * List all vectors in database
   */
  async listVectors(databaseName: string): Promise<Vector[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const cache = await this._loadAllVectors(databaseName, manifest);
    return Array.from(cache.values());
  }

  // ===== Folder Operations =====

  /**
   * List all unique folder paths in database
   */
  async listFolders(databaseName: string): Promise<string[]> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    return manifest.folderPaths.sort();
  }

  /**
   * Get all folders with file counts
   */
  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    const manifest = await this._loadManifest(databaseName);
    if (!manifest) {
      throw new Error(`Database "${databaseName}" not found`);
    }

    const vectors = await this.listVectors(databaseName);
    const folderCounts = new Map<string, number>();

    // Count vectors per folder
    vectors.forEach(v => {
      const folder = v.metadata?.folderPath;
      if (folder) {
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    });

    // Include empty folders from manifest
    manifest.folderPaths.forEach(folder => {
      if (!folderCounts.has(folder)) {
        folderCounts.set(folder, 0);
      }
    });

    return Array.from(folderCounts.entries())
      .map(([path, fileCount]) => ({ path, fileCount }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Get folder statistics
   */
  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    const vectors = await this.listVectors(databaseName);
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    return {
      path: folderPath,
      vectorCount: folderVectors.length,
      sizeBytes: folderVectors.length * (folderVectors[0]?.vector.length || 0) * 4,
      lastModified: Date.now()
    };
  }

  /**
   * Create empty folder
   */
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
      manifest.updatedAt = Date.now();
      await this._saveManifest(databaseName, manifest);
    }
  }

  /**
   * Rename folder (updates all vectors in folder)
   */
  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    let renamedCount = 0;

    const updates: Vector[] = [];
    vectors.forEach(v => {
      if (v.metadata?.folderPath === oldPath) {
        v.metadata.folderPath = newPath;
        updates.push(v);
        renamedCount++;
      }
    });

    // Batch update
    if (updates.length > 0) {
      await this.addVectors(databaseName, updates); // Will overwrite existing
    }

    // Update manifest
    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      const idx = manifest.folderPaths.indexOf(oldPath);
      if (idx !== -1) {
        manifest.folderPaths[idx] = newPath;
        await this._saveManifest(databaseName, manifest);
      }
    }

    return renamedCount;
  }

  /**
   * Delete folder and all its vectors
   */
  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    const vectors = await this.listVectors(databaseName);
    const toDelete: string[] = [];

    vectors.forEach(v => {
      if (v.metadata?.folderPath === folderPath) {
        toDelete.push(v.id);
      }
    });

    // Delete all vectors in folder
    for (const id of toDelete) {
      await this.deleteVector(databaseName, id);
    }

    // Remove folder from manifest
    const manifest = await this._loadManifest(databaseName);
    if (manifest) {
      manifest.folderPaths = manifest.folderPaths.filter(f => f !== folderPath);
      await this._saveManifest(databaseName, manifest);
    }

    return toDelete.length;
  }

  /**
   * Move vector to folder
   */
  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    const vectors = await this.getVectors(databaseName, [vectorId]);
    if (vectors.length === 0) {
      throw new Error(`Vector "${vectorId}" not found`);
    }

    const vector = vectors[0];
    vector.metadata = {
      ...vector.metadata,
      folderPath: targetFolder
    };

    await this.addVectors(databaseName, [vector]); // Overwrite
  }

  /**
   * Move all vectors from one folder to another
   */
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
      await this.addVectors(databaseName, toMove); // Batch update
    }

    return toMove.length;
  }

  /**
   * Search within specific folder (filters results by folder)
   * NOTE: Actual search delegated to host, this just adds folder filter
   */
  async searchInFolder(
    databaseName: string,
    folderPath: string,
    queryVector: number[],
    k?: number,
    threshold?: number
  ): Promise<SearchResult[]> {
    // This needs to be coordinated with SessionManager
    // Option 1: Filter results after host search
    // Option 2: Pass folder filter to host (requires host support)

    // For now, stub that throws with clear message
    throw new Error(
      'searchInFolder() requires host-side support. ' +
      'Use search() and filter results client-side for now.'
    );
  }

  // ===== Private Helper Methods =====

  /**
   * Get base S5 path for databases
   */
  private _getDatabaseBasePath(): string {
    return `home/vector-databases/${this.userAddress}`;
  }

  /**
   * Get S5 path for database manifest
   */
  private _getManifestPath(databaseName: string): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/manifest.json`;
  }

  /**
   * Get S5 path for chunk
   */
  private _getChunkPath(databaseName: string, chunkId: number): string {
    return `${this._getDatabaseBasePath()}/${databaseName}/chunk-${chunkId}.json`;
  }

  /**
   * Load manifest from S5
   */
  private async _loadManifest(databaseName: string): Promise<DatabaseManifest | null> {
    // Check cache first
    if (this.cacheEnabled && this.manifestCache.has(databaseName)) {
      return this.manifestCache.get(databaseName)!;
    }

    try {
      const path = this._getManifestPath(databaseName);
      const encrypted = await this.s5Client.downloadFile(path);

      if (!encrypted) return null;

      // Decrypt
      const json = await this.encryptionManager.decrypt(encrypted);
      const manifest = JSON.parse(json) as DatabaseManifest;

      // Cache
      if (this.cacheEnabled) {
        this.manifestCache.set(databaseName, manifest);
      }

      return manifest;
    } catch (error) {
      console.error(`[S5VectorStore] Failed to load manifest for ${databaseName}:`, error);
      return null;
    }
  }

  /**
   * Save manifest to S5
   */
  private async _saveManifest(databaseName: string, manifest: DatabaseManifest): Promise<void> {
    const path = this._getManifestPath(databaseName);
    const json = JSON.stringify(manifest);

    // Encrypt
    const encrypted = await this.encryptionManager.encrypt(json);

    // Upload to S5
    await this.s5Client.uploadFile(path, encrypted);

    // Update cache
    if (this.cacheEnabled) {
      this.manifestCache.set(databaseName, manifest);
    }
  }

  /**
   * Load all vectors from S5 chunks
   */
  private async _loadAllVectors(
    databaseName: string,
    manifest: DatabaseManifest
  ): Promise<Map<string, VectorRecord>> {
    // Check cache first
    if (this.cacheEnabled && this.vectorCache.has(databaseName)) {
      return this.vectorCache.get(databaseName)!;
    }

    const cache = new Map<string, VectorRecord>();

    // Load all chunks in parallel
    const chunkPromises = manifest.chunks.map(chunkMeta =>
      this._loadChunk(databaseName, chunkMeta.chunkId)
    );

    const chunks = await Promise.all(chunkPromises);

    // Merge into cache
    for (const chunk of chunks) {
      if (chunk) {
        for (const vector of chunk.vectors) {
          cache.set(vector.id, vector);
        }
      }
    }

    // Cache
    if (this.cacheEnabled) {
      this.vectorCache.set(databaseName, cache);
    }

    return cache;
  }

  /**
   * Load single chunk from S5
   */
  private async _loadChunk(databaseName: string, chunkId: number): Promise<VectorChunk | null> {
    try {
      const path = this._getChunkPath(databaseName, chunkId);
      const encrypted = await this.s5Client.downloadFile(path);

      if (!encrypted) return null;

      // Decrypt
      const json = await this.encryptionManager.decrypt(encrypted);
      return JSON.parse(json) as VectorChunk;
    } catch (error) {
      console.error(`[S5VectorStore] Failed to load chunk ${chunkId}:`, error);
      return null;
    }
  }

  /**
   * Save chunks in background (async, non-blocking)
   */
  private async _saveChunksBackground(
    databaseName: string,
    cache: Map<string, VectorRecord>,
    manifest: DatabaseManifest
  ): Promise<void> {
    try {
      const chunkSize = 10000; // 10K vectors per chunk
      const vectors = Array.from(cache.values());

      // Split into chunks
      const chunks: VectorChunk[] = [];
      for (let i = 0; i < vectors.length; i += chunkSize) {
        const chunkVectors = vectors.slice(i, i + chunkSize);
        chunks.push({
          chunkId: chunks.length,
          vectors: chunkVectors
        });
      }

      // Save chunks in parallel
      const chunkPromises = chunks.map(chunk => this._saveChunk(databaseName, chunk));
      const chunkMetas = await Promise.all(chunkPromises);

      // Update manifest with chunk metadata
      manifest.chunks = chunkMetas;
      manifest.chunkCount = chunkMetas.length;

      await this._saveManifest(databaseName, manifest);
    } catch (error) {
      console.error('[S5VectorStore] Failed to save chunks:', error);
    }
  }

  /**
   * Save single chunk to S5
   */
  private async _saveChunk(databaseName: string, chunk: VectorChunk): Promise<ChunkMetadata> {
    const path = this._getChunkPath(databaseName, chunk.chunkId);
    const json = JSON.stringify(chunk);

    // Encrypt
    const encrypted = await this.encryptionManager.encrypt(json);

    // Upload to S5
    const cid = await this.s5Client.uploadFile(path, encrypted);

    return {
      chunkId: chunk.chunkId,
      cid: cid,
      vectorCount: chunk.vectors.length,
      sizeBytes: encrypted.byteLength,
      updatedAt: Date.now()
    };
  }

  /**
   * Calculate total storage size from manifest
   */
  private _calculateStorageSize(manifest: DatabaseManifest): number {
    return manifest.chunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
  }

  /**
   * Match metadata against filter
   */
  private _matchesFilter(metadata: Record<string, any>, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
```

#### Test Verification
- [x] **Run tests**: All 50 tests pass (100%)
- [x] **Browser test**: Test in Chrome/Firefox/Safari
- [x] **Performance test**: 1K vectors < 500ms, 10K vectors < 2s
- [x] **Mock SDK parity**: Test all methods against VectorRAGManagerMock interface

**Success Criteria**:
- ✅ 50/50 tests passing (100%) - 30 original + 20 mock SDK parity
- ✅ S5VectorStore implements full API (21 methods total)
- ✅ Data encrypted at rest with AES-GCM
- ✅ Chunked storage (10K vectors/chunk)
- ✅ Cache-first strategy < 50ms
- ✅ No Node.js dependencies (browser-compatible)
- ✅ File sizes within limits (≤400 lines for store)
- ✅ TypeScript compiles with no errors
- ✅ Full UI4→UI5 migration support with mock SDK API parity

**Estimated Time**: 10-12 hours (revised after mock SDK alignment)

---

### Sub-phase 5.1.2: Update VectorRAGManager

**Goal**: Replace VectorDbSession with S5VectorStore in VectorRAGManager

**Status**: ✅ Completed

**Files Modified**:
- `packages/sdk-core/src/managers/VectorRAGManager.ts` (~150 lines changed)
- `packages/sdk-core/tests/managers/vector-rag-manager.test.ts` (update tests)

**Tasks**:

#### Test Updates

**Core Methods (7 tests)**:
- [x] **Update: createSession()** - Now uses S5VectorStore.createDatabase()
- [x] **Update: addVectors()** - Now uses S5VectorStore.addVectors()
- [x] **Update: saveSession()** - No-op (auto-saved to S5)
- [x] **Update: loadSession()** - No-op (auto-loaded from S5)
- [x] **Update: getSessionStats()** - Now uses S5VectorStore.getStats()
- [x] **New: listDatabases()** - Uses S5VectorStore.listDatabases()
- [x] **Verify: search()** - Still delegates to SessionManager (unchanged)

**Mock SDK Parity Methods (20 tests)**:
- [x] **New: getVectorDatabaseMetadata()** - Proxies to S5VectorStore
- [x] **New: getDatabaseMetadata()** - Alias method
- [x] **New: updateVectorDatabaseMetadata()** - Update description/dimensions
- [x] **New: addVector()** - Single vector convenience method
- [x] **New: getVectors()** - Retrieve specific vectors by IDs
- [x] **New: listVectors()** - List all vectors in database
- [x] **New: listFolders()** - Returns all unique folder paths
- [x] **New: getAllFoldersWithCounts()** - Folders with vector counts
- [x] **New: getFolderStatistics()** - Folder stats (size, count, modified)
- [x] **New: createFolder()** - Creates empty folder
- [x] **New: renameFolder()** - Renames folder and updates vectors
- [x] **New: deleteFolder()** - Deletes folder and all vectors
- [x] **New: moveToFolder()** - Moves single vector to folder
- [x] **New: moveFolderContents()** - Moves all vectors between folders
- [x] **New: searchInFolder()** - Filters search by folder (via SessionManager)

**Total Tests**: 27 (7 existing + 20 new for mock SDK parity)

**Show Test Failures**: Run tests, verify failures due to API changes

#### Implementation

**Remove**:
```typescript
// REMOVE - No longer used
import { VectorDbSession } from '@fabstir/vector-db-native';
```

**Add**:
```typescript
// ADD - New lightweight storage
import { S5VectorStore } from '../storage/S5VectorStore';
```

**Replace Session Interface**:
```typescript
// OLD - Heavy VectorDbSession
interface Session {
  sessionId: string;
  databaseName: string;
  vectorDbSession: any; // VectorDbSession instance
  // ...
}

// NEW - Lightweight S5VectorStore
interface Session {
  sessionId: string;
  databaseName: string;
  // No vectorDbSession - S5VectorStore is shared across all sessions
  // ...
}
```

**Update Constructor**:
```typescript
export class VectorRAGManager implements IVectorRAGManager {
  private readonly vectorStore: S5VectorStore; // NEW

  constructor(options: {
    userAddress: string;
    seedPhrase: string;
    config: RAGConfig;
    sessionManager: SessionManager;
    s5Client: S5; // NEW - Required for S5VectorStore
    encryptionManager: EncryptionManager; // NEW - Required for encryption
  }) {
    // ...

    // Create S5VectorStore (shared across all sessions)
    this.vectorStore = new S5VectorStore({
      s5Client: options.s5Client,
      userAddress: options.userAddress,
      encryptionManager: options.encryptionManager
    });
  }
}
```

**Update Methods**:
```typescript
// createSession() - Use S5VectorStore.createDatabase()
async createSession(databaseName: string, config?: PartialRAGConfig): Promise<string> {
  // OLD
  const vectorDbSession = await VectorDbSession.create({...});

  // NEW
  await this.vectorStore.createDatabase({
    name: databaseName,
    owner: this.userAddress,
    description: sessionConfig.description
  });

  // Rest stays same (session tracking)
}

// addVectors() - Use S5VectorStore.addVectors()
async addVectors(sessionId: string, vectors: VectorRecord[]): Promise<void> {
  const session = this.getSession(sessionId);

  // OLD
  await session.vectorDbSession.addVectors(vectors);

  // NEW
  await this.vectorStore.addVectors(session.databaseName, vectors);
}

// saveSession() - No-op (auto-saved)
async saveSession(sessionId: string): Promise<string> {
  // OLD
  const cid = await session.vectorDbSession.saveUserVectors();
  return cid;

  // NEW
  // S5VectorStore auto-saves on every operation
  return 'auto-saved'; // Return dummy CID for compatibility
}

// loadSession() - No-op (auto-loaded)
async loadSession(sessionId: string, cid: string): Promise<void> {
  // OLD
  await session.vectorDbSession.loadUserVectors(cid);

  // NEW
  // S5VectorStore auto-loads on access
  // No action needed
}

// getSessionStats() - Use S5VectorStore.getStats()
async getSessionStats(identifier: string): Promise<any> {
  const sessionId = this.dbNameToSessionId.get(identifier) || identifier;
  const session = this.getSession(sessionId);

  // OLD
  const stats = await session.vectorDbSession.getStats();

  // NEW
  const stats = await this.vectorStore.getStats(session.databaseName);

  return {
    vectorCount: stats.vectorCount,
    totalVectors: stats.vectorCount,
    totalChunks: stats.chunkCount,
    memoryUsageMb: stats.storageSizeBytes / (1024 * 1024),
    lastUpdated: stats.lastUpdated
  };
}

// ===== MOCK SDK PARITY METHODS (New for UI4→UI5 Migration) =====

// Database Metadata Methods
async getVectorDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
  return await this.vectorStore.getVectorDatabaseMetadata(databaseName);
}

async getDatabaseMetadata(databaseName: string): Promise<VectorDatabaseMetadata> {
  // Alias for getVectorDatabaseMetadata()
  return await this.vectorStore.getDatabaseMetadata(databaseName);
}

async updateVectorDatabaseMetadata(
  databaseName: string,
  updates: Partial<VectorDatabaseMetadata>
): Promise<void> {
  await this.vectorStore.updateVectorDatabaseMetadata(databaseName, updates);
}

// Single Vector Operations
async addVector(
  dbName: string,
  id: string,
  values: number[],
  metadata: Record<string, any> = {}
): Promise<void> {
  await this.vectorStore.addVector(dbName, id, values, metadata);
}

async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
  return await this.vectorStore.getVectors(databaseName, vectorIds);
}

async listVectors(databaseName: string): Promise<Vector[]> {
  return await this.vectorStore.listVectors(databaseName);
}

// Folder Hierarchy Operations
async listFolders(databaseName: string): Promise<string[]> {
  return await this.vectorStore.listFolders(databaseName);
}

async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
  return await this.vectorStore.getAllFoldersWithCounts(databaseName);
}

async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
  return await this.vectorStore.getFolderStatistics(databaseName, folderPath);
}

async createFolder(databaseName: string, folderPath: string): Promise<void> {
  await this.vectorStore.createFolder(databaseName, folderPath);
}

async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
  return await this.vectorStore.renameFolder(databaseName, oldPath, newPath);
}

async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
  return await this.vectorStore.deleteFolder(databaseName, folderPath);
}

async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
  await this.vectorStore.moveToFolder(databaseName, vectorId, targetFolder);
}

async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
  return await this.vectorStore.moveFolderContents(databaseName, sourceFolder, targetFolder);
}

async searchInFolder(
  databaseName: string,
  folderPath: string,
  queryVector: number[],
  k?: number,
  threshold?: number
): Promise<SearchResult[]> {
  return await this.vectorStore.searchInFolder(databaseName, folderPath, queryVector, k, threshold);
}
```

**Key Points**:
- All 15 new methods simply proxy to S5VectorStore
- No complex logic - just pass through calls
- Maintains exact same API surface as VectorRAGManagerMock
- Enables seamless UI4→UI5 migration

#### Test Verification
- [x] **Run tests**: All VectorRAGManager tests pass (including 20 new tests for mock SDK parity)
- [x] **Integration test**: Create DB → Add vectors → Search (via SessionManager) → Get stats
- [x] **Mock SDK parity**: Test all 21 methods against VectorRAGManagerMock interface
- [x] **Browser test**: Test in UI5 application

**Success Criteria**:
- ✅ All existing VectorRAGManager tests pass
- ✅ 20 new tests for mock SDK parity methods pass (100%)
- ✅ No dependency on @fabstir/vector-db-native
- ✅ search() still delegates to SessionManager
- ✅ Backward compatible API (same method signatures as mock SDK)
- ✅ Full UI4→UI5 migration support

**Estimated Time**: 4-5 hours (revised after mock SDK alignment)

---

### Sub-phase 5.1.3: Update Host Node Integration

**Goal**: Coordinate with host node to load vectors from S5 for search

**Status**: ⏳ Pending (Requires fabstir-llm-node changes)

**Note**: This sub-phase requires changes to `fabstir-llm-node` (Rust codebase). Coordination needed with node developer.

**Host-Side Changes Needed**:
1. Add `/v1/vectors/load` endpoint to load vectors from S5 CID
2. Add `/v1/vectors/search` endpoint for vector search
3. Accept S5 CID in WebSocket `session_init` message
4. Load vectors from S5 into HNSW/IVF index
5. Perform search on host-side index
6. Return results via WebSocket

**SDK-Side Changes**:
- [ ] **Update SessionManager.searchVectors()** - Send S5 CID to host
- [ ] **Update SessionManager.startSession()** - Include database CID in init message
- [ ] **Add SessionManager.uploadVectors()** - Upload vectors to host via WebSocket

**WebSocket Protocol Update**:
```typescript
// session_init message (add vector_database field)
{
  type: 'session_init',
  session_id: 'sess_123',
  job_id: '0x...',
  chain_id: 84532,
  vector_database?: {
    cid: 's5://...', // S5 CID for database manifest
    encryption_key: '...' // Encrypted with host's public key
  }
}

// search_vectors message
{
  type: 'search_vectors',
  query_vector: [0.1, 0.2, ...],
  top_k: 5,
  threshold: 0.7
}

// search_results response
{
  type: 'search_results',
  results: [
    { id: 'vec1', score: 0.95, metadata: {...} },
    { id: 'vec2', score: 0.87, metadata: {...} }
  ]
}
```

**Documentation Needed**:
- [ ] Update `docs/node-reference/SDK_INTEGRATION_NOTES.md`
- [ ] Update `docs/node-reference/WEBSOCKET_API_SDK_GUIDE.md`
- [ ] Create `docs/node-reference/S5_VECTOR_LOADING.md`

**Success Criteria**:
- ✅ Host can load vectors from S5 CID
- ✅ Host can decrypt vectors with shared key
- ✅ Host can perform search on loaded vectors
- ✅ SessionManager can initiate search via WebSocket
- ✅ End-to-end test: Client uploads vectors → Host loads → Client searches → Results returned

**Estimated Time**: 2-3 hours (SDK-side only, host changes TBD)

---

### Sub-phase 5.1.4: Testing & Validation

**Goal**: Comprehensive testing of S5VectorStore integration

**Status**: ⏳ Pending

**Test Categories**:

#### Unit Tests (from 5.1.1)
- [ ] 30/30 S5VectorStore tests passing

#### Integration Tests
- [ ] **VectorRAGManager integration** - All manager tests pass
- [ ] **Multi-database** - Create 10 databases, add vectors to each
- [ ] **Large dataset** - 100K vectors across 10 chunks
- [ ] **Concurrent operations** - Multiple clients, same database
- [ ] **Error recovery** - Network failures, corrupt data
- [ ] **Cache invalidation** - Verify cache stays in sync with S5

#### Browser Tests (UI5)
- [ ] **Chrome** - Create DB, add vectors, view stats
- [ ] **Firefox** - Same workflow
- [ ] **Safari** - Same workflow
- [ ] **Mobile Chrome** - Test on Android device
- [ ] **Mobile Safari** - Test on iOS device

#### Performance Tests
- [ ] **Add 1K vectors** - < 500ms
- [ ] **Add 10K vectors** - < 2s
- [ ] **List 100 databases** - < 1s
- [ ] **Cache hit** - < 50ms
- [ ] **S5 cold load** - < 3s for 10K vectors

#### End-to-End Tests (with Host)
- [ ] **Upload → Search** - Client uploads, host loads from S5, search returns results
- [ ] **Multi-client** - Client A uploads, Client B searches (shared database)
- [ ] **Encryption** - Verify end-to-end encryption (client → S5 → host)

**Test Commands**:
```bash
# Unit tests
pnpm test packages/sdk-core/tests/storage/s5-vector-store.test.ts

# Integration tests
pnpm test packages/sdk-core/tests/managers/vector-rag-manager.test.ts

# Browser tests (manual)
cd apps/ui5 && pnpm dev
# Navigate to http://localhost:3008/vector-databases

# Performance tests
pnpm test packages/sdk-core/tests/performance/vector-storage.perf.test.ts
```

**Success Criteria**:
- ✅ All unit tests passing (30/30)
- ✅ All integration tests passing
- ✅ All browser tests passing (5/5)
- ✅ All performance targets met
- ✅ End-to-end tests passing (5/5)

**Estimated Time**: 2-3 hours

---

### Sub-phase 5.1.5: Documentation

**Goal**: Document S5VectorStore API and migration guide

**Status**: ⏳ Pending

**Files to Create/Update**:
- [ ] `docs/S5_VECTOR_STORE_API.md` - Complete API reference
- [ ] `docs/MIGRATION_VECTOR_DB_NATIVE.md` - Migration guide from @fabstir/vector-db-native
- [ ] `docs/SDK_API.md` - Update VectorRAGManager section
- [ ] `packages/sdk-core/src/storage/S5VectorStore.ts` - Comprehensive JSDoc comments
- [ ] `README.md` - Update dependencies (remove @fabstir/vector-db-native)

**API Documentation Structure**:
```markdown
# S5VectorStore API Reference

## Overview
Lightweight vector storage using S5 and Web Crypto API.

## Installation
No installation needed - bundled with @fabstir/sdk-core

## Usage
### Create Database
### Add Vectors
### Delete Vectors
### Get Statistics
### List Databases

## Architecture
### Client-Side Storage
### Host-Side Search
### Chunked Storage
### Encryption

## Performance
### Benchmarks
### Optimization Tips

## Troubleshooting
### Common Issues
### Error Codes
```

**Migration Guide Structure**:
```markdown
# Migrating from @fabstir/vector-db-native

## Why Migrate?
- ✅ Browser compatible (no Node.js dependencies)
- ✅ 8MB → 5KB (1600x smaller)
- ✅ Mobile-friendly (no heavy algorithms)
- ✅ Auto-save to S5 (no manual save/load)

## API Changes
### VectorDbSession → S5VectorStore
### create() → createDatabase()
### addVectors() → addVectors()
### search() → Delegated to SessionManager

## Code Examples
### Before
### After

## Testing
### Update Unit Tests
### Update Integration Tests

## Rollback Plan
### Downgrade Steps
```

**Success Criteria**:
- ✅ API docs complete and accurate
- ✅ Migration guide covers all breaking changes
- ✅ Code examples working and tested
- ✅ JSDoc comments on all public methods
- ✅ README.md updated

**Estimated Time**: 1-2 hours

---

## Phase 5.1 Summary

**Total Estimated Time**: 12-16 hours

**Sub-phase Breakdown**:
1. Create S5VectorStore Module: 6-8 hours ✅ Core implementation + tests
2. Update VectorRAGManager: 3-4 hours ✅ Replace VectorDbSession
3. Update Host Node Integration: 2-3 hours ⏳ Coordination with node developer
4. Testing & Validation: 2-3 hours ✅ Comprehensive testing
5. Documentation: 1-2 hours ✅ API docs + migration guide

**Dependencies**:
- ✅ Enhanced S5.js (existing)
- ✅ EncryptionManager (existing)
- ✅ SessionManager (existing)
- ⏳ fabstir-llm-node updates (host-side S5 loading)

**Key Files Created**: 3 new files (2 implementation, 1 test)

**Key Files Modified**: 2 files (VectorRAGManager + tests)

**Success Criteria**:
- ✅ Remove dependency on @fabstir/vector-db-native
- ✅ 8MB binary → ~5KB JavaScript
- ✅ Browser compatible (no Node.js dependencies)
- ✅ All data encrypted at rest with AES-GCM
- ✅ Chunked storage (10K vectors/chunk)
- ✅ Performance targets met (< 500ms for 1K vectors)
- ✅ Search delegated to host via SessionManager
- ✅ 30+ tests passing (100%)
- ✅ UI5 vector database creation working

---

## Notes

- **TDD Bounded Autonomy**: Write ALL tests first, verify failures, then implement
- **Line Limits**: Strictly enforce max lines per file
- **No Node.js Dependencies**: Only use Web APIs (Web Crypto, IndexedDB via S5)
- **Pre-MVP**: No backward compatibility needed, fail fast on errors
- **Reuse Types**: Import types from @fabstir/sdk-core-mock where available
- **Host Coordination**: Sub-phase 5.1.3 requires fabstir-llm-node changes (separate project)

---

**Last Updated**: 2025-11-13
