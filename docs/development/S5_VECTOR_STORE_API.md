# S5VectorStore API Reference

Complete API documentation for `S5VectorStore` - the client-side vector database storage layer that persists vector databases to the S5 decentralized network.

**Version**: 1.0.0
**Package**: `@fabstir/sdk-core`
**Module**: `/storage/S5VectorStore`

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Constructor](#constructor)
- [Initialization](#initialization)
- [Database Operations](#database-operations)
- [Vector Operations](#vector-operations)
- [Folder Operations](#folder-operations)
- [Metadata Operations](#metadata-operations)
- [Statistics](#statistics)
- [Types](#types)
- [Best Practices](#best-practices)
- [Error Handling](#error-handling)

---

## Overview

`S5VectorStore` is a **client-side vector database storage layer** that provides:

- **Decentralized Persistence**: Store vector databases on S5 network (IPFS-like)
- **Chunked Storage**: Efficient storage of large databases (10K vectors per chunk)
- **Folder Hierarchies**: Virtual folder organization for vectors
- **Metadata Support**: Native metadata without serialization overhead
- **Cache Layer**: In-memory cache for fast access
- **Browser-Compatible**: Works in browser and Node.js

### Key Characteristics

- **Storage Only**: S5VectorStore handles persistence, NOT search
- **Search Delegated**: Vector search is performed by `VectorRAGManager` using in-memory native JS vector database
- **Lazy Loading**: Vectors loaded on-demand from S5
- **CBOR Encoding**: Efficient binary serialization via Enhanced S5.js

### Typical Usage

```typescript
import { S5VectorStore } from '@fabstir/sdk-core/storage';

// 1. Create instance
const vectorStore = new S5VectorStore({
  s5Client: s5,
  userAddress: '0x...',
  encryptionManager: encryptionManager,
  cacheEnabled: true
});

// 2. Initialize (loads existing databases)
await vectorStore.initialize();

// 3. Create database
await vectorStore.createDatabase({
  name: 'my-docs',
  owner: '0x...',
  description: 'Documentation vectors'
});

// 4. Add vectors
await vectorStore.addVectors('my-docs', [
  { id: 'vec-1', values: [0.1, 0.2, ...], metadata: { text: '...' } }
]);

// 5. Persist to S5 (automatic on operations)
```

---

## Architecture

### Storage Structure

```
home/vector-databases/{userAddress}/
├── {databaseName}/
│   ├── manifest.json          # Database metadata + chunk index
│   ├── chunk_0.bin            # First 10K vectors (CBOR encoded)
│   ├── chunk_1.bin            # Next 10K vectors
│   └── ...
```

### Manifest Format

```typescript
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
}
```

### Chunking Strategy

- **Chunk Size**: 10,000 vectors per chunk
- **Encoding**: CBOR binary format
- **Lazy Loading**: Chunks loaded on-demand
- **Memory Efficiency**: 10x reduction vs loading all vectors

### Cache Layer

```typescript
manifestCache: Map<string, DatabaseManifest>  // Database metadata
vectorCache: Map<databaseName, Map<vectorId, Vector>>  // Vector data
```

---

## Constructor

### S5VectorStore

Creates a new vector store instance.

```typescript
constructor(options: S5VectorStoreOptions)
```

**Parameters:**

```typescript
interface S5VectorStoreOptions {
  s5Client: S5;                      // Enhanced S5.js client instance
  userAddress: string;               // Ethereum address (0x...)
  encryptionManager: EncryptionManager;  // For encrypting vector data
  cacheEnabled?: boolean;            // Enable in-memory cache (default: true)
}
```

**Example:**

```typescript
import { S5 } from '@julesl23/s5js';
import { S5VectorStore } from '@fabstir/sdk-core/storage';

const s5 = await S5.create({
  // S5 configuration
});

const vectorStore = new S5VectorStore({
  s5Client: s5,
  userAddress: sdk.getUserAddress(),
  encryptionManager: sdk.getEncryptionManager(),
  cacheEnabled: true  // Recommended for performance
});
```

**Notes:**
- Constructor does NOT load existing databases - call `initialize()` first
- Cache is enabled by default for performance
- Each user has isolated storage: `home/vector-databases/{userAddress}/`

---

## Initialization

### initialize

Loads all existing databases from S5 storage into cache.

```typescript
async initialize(): Promise<void>
```

**Behavior:**
- **Idempotent**: Safe to call multiple times (skips if already initialized)
- **Retry Logic**: Retries failed operations with exponential backoff
- **Blob Propagation**: Handles S5 network delays (up to 5 retries per manifest)
- **Populates Cache**: Loads all database manifests into `manifestCache`

**Example:**

```typescript
// IMPORTANT: Call once at startup
await vectorStore.initialize();

// Now listDatabases() will return existing databases
const databases = await vectorStore.listDatabases();
console.log(`Found ${databases.length} databases`);
```

**When to Call:**
- ✅ Once at SDK initialization
- ✅ After S5 client is ready
- ❌ NOT after every operation (redundant)
- ❌ NOT before each database operation

**Performance:**
- First call: ~500ms-2s (depends on number of databases)
- Subsequent calls: ~1ms (cache hit)

---

## Database Operations

### createDatabase

Creates a new vector database.

```typescript
async createDatabase(config: {
  name: string;
  owner: string;
  description?: string;
}): Promise<DatabaseMetadata>
```

**Parameters:**
- `name` - Unique database identifier (alphanumeric + hyphens)
- `owner` - Ethereum address (0x...)
- `description` - Optional human-readable description

**Returns:** Database metadata

**Example:**

```typescript
const metadata = await vectorStore.createDatabase({
  name: 'product-docs',
  owner: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  description: 'Product documentation vectors'
});

console.log('Created:', metadata.name);
console.log('Vectors:', metadata.vectorCount);  // 0 initially
```

**Throws:**
- Database already exists

### listDatabases

Lists all databases for current user.

```typescript
async listDatabases(): Promise<DatabaseMetadata[]>
```

**Returns:** Array of database metadata

**Example:**

```typescript
const databases = await vectorStore.listDatabases();

databases.forEach(db => {
  console.log(`${db.name}: ${db.vectorCount} vectors`);
  console.log(`  Created: ${new Date(db.createdAt)}`);
  console.log(`  Size: ${db.storageSizeBytes} bytes`);
});
```

**Notes:**
- Returns cached data (fast)
- Call `initialize()` first to populate cache
- Returns empty array if no databases exist

### getDatabase

Gets metadata for a specific database.

```typescript
async getDatabase(databaseName: string): Promise<DatabaseMetadata | null>
```

**Returns:** Database metadata or `null` if not found

**Example:**

```typescript
const db = await vectorStore.getDatabase('my-docs');
if (db) {
  console.log(`Vectors: ${db.vectorCount}`);
  console.log(`Folders: ${db.folderPaths?.length || 0}`);
} else {
  console.log('Database not found');
}
```

### deleteDatabase

Deletes a database and all its vectors.

```typescript
async deleteDatabase(databaseName: string): Promise<void>
```

**Behavior:**
- Marks database as `deleted` in manifest
- Removes from cache
- Does NOT immediately delete chunks (lazy cleanup)

**Example:**

```typescript
await vectorStore.deleteDatabase('old-docs');
console.log('Database deleted');
```

**Notes:**
- Irreversible operation
- Use with caution in production

### databaseExists

Checks if a database exists.

```typescript
async databaseExists(databaseName: string): Promise<boolean>
```

**Returns:** `true` if database exists and not deleted

**Example:**

```typescript
if (await vectorStore.databaseExists('my-docs')) {
  console.log('Database exists');
} else {
  console.log('Create database first');
}
```

---

## Vector Operations

### addVectors

Adds multiple vectors to a database (batch operation).

```typescript
async addVectors(databaseName: string, vectors: Vector[]): Promise<void>
```

**Parameters:**

```typescript
interface Vector {
  id: string;                     // Unique vector identifier
  values: number[];               // Embedding values (384D for all-MiniLM-L6-v2)
  metadata?: Record<string, any>; // Optional metadata
}
```

**Example:**

```typescript
const vectors = [
  {
    id: 'doc-1-chunk-0',
    values: [0.12, -0.45, 0.78, ...],  // 384 dimensions
    metadata: {
      text: 'Document chunk text...',
      chunkIndex: 0,
      fileName: 'intro.pdf',
      folderPath: '/getting-started'
    }
  },
  {
    id: 'doc-1-chunk-1',
    values: [0.34, -0.21, 0.56, ...],
    metadata: {
      text: 'Next chunk...',
      chunkIndex: 1,
      fileName: 'intro.pdf',
      folderPath: '/getting-started'
    }
  }
];

await vectorStore.addVectors('my-docs', vectors);
console.log('Added 2 vectors');
```

**Performance:**
- Efficient batch operation
- Automatically chunks into 10K-vector groups
- Persists to S5 in background

### addVector

Adds a single vector (convenience method).

```typescript
async addVector(
  databaseName: string,
  id: string,
  vector: number[],
  metadata?: Record<string, any>
): Promise<void>
```

**Example:**

```typescript
await vectorStore.addVector(
  'my-docs',
  'vec-123',
  [0.1, 0.2, 0.3, ...],  // 384D embedding
  { text: 'Example text', category: 'tutorial' }
);
```

**Notes:**
- Use `addVectors()` for batch operations (more efficient)

### getVector

Retrieves a single vector by ID.

```typescript
async getVector(databaseName: string, vectorId: string): Promise<Vector | null>
```

**Returns:** Vector with metadata or `null` if not found

**Example:**

```typescript
const vector = await vectorStore.getVector('my-docs', 'vec-123');
if (vector) {
  console.log('Dimensions:', vector.values.length);
  console.log('Metadata:', vector.metadata);
} else {
  console.log('Vector not found');
}
```

### getVectors

Retrieves multiple vectors by IDs (batch operation).

```typescript
async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]>
```

**Returns:** Array of found vectors (omits not-found IDs)

**Example:**

```typescript
const vectors = await vectorStore.getVectors('my-docs', ['vec-1', 'vec-2', 'vec-3']);
console.log(`Retrieved ${vectors.length} of 3 vectors`);
```

### listVectors

Lists all vectors in a database.

```typescript
async listVectors(databaseName: string): Promise<Vector[]>
```

**Returns:** All vectors with metadata

**Example:**

```typescript
const allVectors = await vectorStore.listVectors('my-docs');
console.log(`Total vectors: ${allVectors.length}`);
```

**Warning:**
- Loads ALL vectors into memory
- Use with caution for large databases (>100K vectors)
- Consider pagination or folder-based listing instead

### deleteVector

Deletes a single vector by ID.

```typescript
async deleteVector(databaseName: string, vectorId: string): Promise<void>
```

**Example:**

```typescript
await vectorStore.deleteVector('my-docs', 'vec-123');
console.log('Vector deleted');
```

### deleteByMetadata

Deletes all vectors matching a metadata filter.

```typescript
async deleteByMetadata(
  databaseName: string,
  filter: Record<string, any>
): Promise<number>
```

**Parameters:**
- `filter` - Metadata filter (key-value matching)

**Returns:** Number of vectors deleted

**Example:**

```typescript
// Delete all vectors from specific folder
const deleted = await vectorStore.deleteByMetadata('my-docs', {
  folderPath: '/old-docs'
});
console.log(`Deleted ${deleted} vectors`);

// Delete vectors by category
const deletedCount = await vectorStore.deleteByMetadata('my-docs', {
  category: 'deprecated'
});
```

**Notes:**
- Supports exact match only (no operators like $gt, $lt)
- Efficiently processes large datasets

---

## Folder Operations

S5VectorStore supports **virtual folder hierarchies** via metadata. Folders are not physical directories - they're metadata tags on vectors.

### listFolders

Lists all unique folder paths in a database.

```typescript
async listFolders(databaseName: string): Promise<string[]>
```

**Returns:** Array of folder paths (e.g., `["/", "/docs", "/docs/api"]`)

**Example:**

```typescript
const folders = await vectorStore.listFolders('my-docs');
folders.forEach(folder => {
  console.log(`Folder: ${folder}`);
});
```

### getAllFoldersWithCounts

Lists all folders with file counts.

```typescript
async getAllFoldersWithCounts(databaseName: string): Promise<Array<{
  path: string;
  fileCount: number;
}>>
```

**Returns:** Folders with vector counts

**Example:**

```typescript
const folders = await vectorStore.getAllFoldersWithCounts('my-docs');
folders.forEach(({ path, fileCount }) => {
  console.log(`${path}: ${fileCount} files`);
});
```

### getFolderStatistics

Gets detailed statistics for a folder.

```typescript
async getFolderStatistics(
  databaseName: string,
  folderPath: string
): Promise<FolderStats>
```

**Returns:**

```typescript
interface FolderStats {
  folderPath: string;
  vectorCount: number;
  totalSize: number;      // Bytes
  lastModified: number;   // Timestamp
}
```

**Example:**

```typescript
const stats = await vectorStore.getFolderStatistics('my-docs', '/tutorials');
console.log(`Vectors: ${stats.vectorCount}`);
console.log(`Size: ${(stats.totalSize / 1024).toFixed(2)} KB`);
```

### createFolder

Creates a virtual folder.

```typescript
async createFolder(databaseName: string, folderPath: string): Promise<void>
```

**Example:**

```typescript
await vectorStore.createFolder('my-docs', '/tutorials/python');
console.log('Folder created');
```

**Notes:**
- Creates parent folders automatically (`/tutorials` and `/`)
- Idempotent (safe to call multiple times)

### renameFolder

Renames a folder and updates all vectors.

```typescript
async renameFolder(
  databaseName: string,
  oldPath: string,
  newPath: string
): Promise<number>
```

**Returns:** Number of vectors updated

**Example:**

```typescript
const updated = await vectorStore.renameFolder(
  'my-docs',
  '/old-name',
  '/new-name'
);
console.log(`Updated ${updated} vectors`);
```

### deleteFolder

Deletes a folder and all its vectors.

```typescript
async deleteFolder(
  databaseName: string,
  folderPath: string
): Promise<number>
```

**Returns:** Number of vectors deleted

**Example:**

```typescript
const deleted = await vectorStore.deleteFolder('my-docs', '/deprecated');
console.log(`Deleted ${deleted} vectors`);
```

**Warning:**
- Deletes ALL vectors in folder
- Irreversible operation

### moveToFolder

Moves a single vector to a different folder.

```typescript
async moveToFolder(
  databaseName: string,
  vectorId: string,
  targetFolder: string
): Promise<void>
```

**Example:**

```typescript
await vectorStore.moveToFolder('my-docs', 'vec-123', '/tutorials');
console.log('Vector moved');
```

### moveFolderContents

Moves all vectors from one folder to another.

```typescript
async moveFolderContents(
  databaseName: string,
  sourceFolder: string,
  targetFolder: string
): Promise<number>
```

**Returns:** Number of vectors moved

**Example:**

```typescript
const moved = await vectorStore.moveFolderContents(
  'my-docs',
  '/temp',
  '/archive'
);
console.log(`Moved ${moved} vectors`);
```

### searchInFolder

Searches for vectors within a specific folder.

```typescript
async searchInFolder(
  databaseName: string,
  folderPath: string,
  queryVector: number[],
  k?: number,
  threshold?: number
): Promise<SearchResult[]>
```

**Parameters:**
- `queryVector` - Query embedding (384D)
- `k` - Number of results (default: 5)
- `threshold` - Minimum similarity score (default: 0.0)

**Returns:**

```typescript
interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
}
```

**Example:**

```typescript
const queryEmbedding = [0.1, 0.2, ...];  // 384D from embedding model

const results = await vectorStore.searchInFolder(
  'my-docs',
  '/tutorials',
  queryEmbedding,
  5,     // Top 5 results
  0.7    // Minimum 70% similarity
);

results.forEach(result => {
  console.log(`${result.metadata.title} (score: ${result.score})`);
});
```

**Notes:**
- Searches only vectors in specified folder
- Uses cosine similarity
- Returns empty array if folder doesn't exist

---

## Metadata Operations

### getDatabaseMetadata

Gets complete database metadata.

```typescript
async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata>
```

**Returns:**

```typescript
interface DatabaseMetadata {
  name: string;
  owner: string;
  description?: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes: number;
  createdAt: number;
  lastAccessed: number;
  updatedAt: number;
  folderPaths?: string[];
  pendingDocuments?: PendingDocument[];   // Deferred embeddings
  readyDocuments?: ReadyDocument[];       // Completed embeddings
}
```

**Example:**

```typescript
const metadata = await vectorStore.getDatabaseMetadata('my-docs');
console.log(`Created: ${new Date(metadata.createdAt)}`);
console.log(`Vectors: ${metadata.vectorCount}`);
console.log(`Size: ${metadata.storageSizeBytes} bytes`);
```

### updateDatabaseMetadata

Updates database metadata (partial update).

```typescript
async updateDatabaseMetadata(
  databaseName: string,
  updates: Partial<DatabaseMetadata>
): Promise<void>
```

**Example:**

```typescript
await vectorStore.updateDatabaseMetadata('my-docs', {
  description: 'Updated description',
  dimensions: 384
});
```

**Notes:**
- Only updates provided fields
- Automatically updates `updatedAt` timestamp

### updateMetadata

Updates metadata for a specific vector.

```typescript
async updateMetadata(
  databaseName: string,
  vectorId: string,
  metadata: Record<string, any>
): Promise<void>
```

**Example:**

```typescript
await vectorStore.updateMetadata('my-docs', 'vec-123', {
  category: 'tutorial',
  tags: ['beginner', 'python'],
  lastReviewed: Date.now()
});
```

**Notes:**
- Replaces entire metadata object (not partial update)
- Preserves `folderPath` if present

---

## Statistics

### getStats

Gets database statistics.

```typescript
async getStats(databaseName: string): Promise<{
  databaseName: string;
  vectorCount: number;
  storageSizeBytes: number;
  chunkCount: number;
  folderCount: number;
}>
```

**Example:**

```typescript
const stats = await vectorStore.getStats('my-docs');
console.log(`Database: ${stats.databaseName}`);
console.log(`Vectors: ${stats.vectorCount}`);
console.log(`Storage: ${(stats.storageSizeBytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`Chunks: ${stats.chunkCount}`);
console.log(`Folders: ${stats.folderCount}`);
```

**Use Cases:**
- Display storage usage in UI
- Monitor database growth
- Trigger cleanup/archival policies

---

## Types

### Vector

```typescript
interface Vector {
  id: string;                     // Unique identifier
  values: number[];               // Embedding values (typically 384D)
  metadata?: Record<string, any>; // Optional metadata
}
```

### DatabaseMetadata

```typescript
interface DatabaseMetadata {
  name: string;
  owner: string;
  description?: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes: number;
  createdAt: number;
  lastAccessed: number;
  updatedAt: number;
  folderPaths?: string[];
  pendingDocuments?: PendingDocument[];   // Deferred embeddings
  readyDocuments?: ReadyDocument[];       // Completed embeddings
}
```

### SearchResult

```typescript
interface SearchResult {
  id: string;
  score: number;                  // Cosine similarity (0-1)
  metadata: Record<string, any>;
}
```

### FolderStats

```typescript
interface FolderStats {
  folderPath: string;
  vectorCount: number;
  totalSize: number;              // Bytes
  lastModified: number;           // Timestamp
}
```

---

## Best Practices

### Initialization

```typescript
// ✅ GOOD: Initialize once at startup
const vectorStore = new S5VectorStore({ ... });
await vectorStore.initialize();

// ❌ BAD: Initialize before every operation (redundant)
await vectorStore.initialize();  // Called before every operation - wasteful
const db = await vectorStore.getDatabase('my-docs');
```

### Batch Operations

```typescript
// ✅ GOOD: Batch add vectors
await vectorStore.addVectors('my-docs', vectors);  // Single operation

// ❌ BAD: Loop with individual adds
for (const vector of vectors) {
  await vectorStore.addVector('my-docs', vector.id, vector.values);  // N operations
}
```

### Folder Organization

```typescript
// ✅ GOOD: Use hierarchical folders
/docs
/docs/api
/docs/tutorials
/docs/tutorials/python

// ❌ BAD: Flat structure with name prefixes
/docs-api
/docs-tutorials-python
```

### Metadata Usage

```typescript
// ✅ GOOD: Store search-relevant metadata
{
  text: 'Document chunk content...',
  fileName: 'intro.pdf',
  chunkIndex: 0,
  folderPath: '/tutorials',
  category: 'tutorial',
  tags: ['beginner', 'python']
}

// ❌ BAD: Store large binary data in metadata
{
  text: '...',
  rawFileContent: '...',  // 10 MB string - use S5 CID instead
  thumbnail: 'data:image/png;base64,...'  // Large base64 - use S5 CID
}
```

### Cache Management

```typescript
// ✅ GOOD: Enable cache for read-heavy workloads
const vectorStore = new S5VectorStore({
  cacheEnabled: true  // Default
});

// ⚠️ CAUTION: Disable cache only for write-heavy workloads
const vectorStore = new S5VectorStore({
  cacheEnabled: false  // Saves memory but slower reads
});
```

---

## Error Handling

### Database Not Found

```typescript
try {
  const db = await vectorStore.getDatabase('non-existent');
  if (!db) {
    console.error('Database not found');
  }
} catch (error) {
  console.error('Error:', error);
}
```

### Vector Not Found

```typescript
const vector = await vectorStore.getVector('my-docs', 'vec-123');
if (!vector) {
  console.log('Vector not found - may have been deleted');
}
```

### S5 Network Errors

```typescript
try {
  await vectorStore.addVectors('my-docs', vectors);
} catch (error) {
  if (error.message.includes('blob propagation')) {
    console.error('S5 network delay - vectors will be persisted eventually');
  } else {
    console.error('Failed to save vectors:', error);
  }
}
```

### Quota Exceeded

```typescript
try {
  await vectorStore.addVectors('my-docs', hugeVectorArray);
} catch (error) {
  if (error.message.includes('quota')) {
    console.error('Storage quota exceeded - consider archiving old data');
  }
}
```

---

## Performance Characteristics

### Operation Latency

| Operation | Latency | Notes |
|-----------|---------|-------|
| `initialize()` | 500ms-2s | First call only (depends on database count) |
| `createDatabase()` | 100-300ms | One-time per database |
| `addVectors()` (100 vectors) | 50-150ms | Batched, background persistence |
| `getVector()` | <1ms | Cache hit |
| `listDatabases()` | <1ms | Returns cached data |
| `searchInFolder()` | 10-50ms | Depends on folder size |

### Memory Usage

| Database Size | Memory (Cache Enabled) | Memory (Cache Disabled) |
|---------------|------------------------|-------------------------|
| 1K vectors | ~0.5 MB | ~0.1 MB |
| 10K vectors | ~5 MB | ~1 MB |
| 100K vectors | ~50 MB | ~10 MB |
| 1M vectors | ~500 MB | ~100 MB |

### Storage Efficiency

- **Chunking**: 10K vectors per chunk
- **Compression**: CBOR encoding (~40% size reduction vs JSON)
- **Lazy Loading**: Only active chunks in memory

---

## See Also

- [SDK API Reference](./SDK_API.md) - Main SDK documentation
- [VectorRAGManager](./SDK_API.md#vectorragmanager) - Vector search and RAG operations
- [Migration Guide](./MIGRATION_VECTOR_DB_NATIVE.md) - Migrate from vector-db-native
- [Enhanced S5.js API](./s5js-reference/API.md) - S5 storage layer
