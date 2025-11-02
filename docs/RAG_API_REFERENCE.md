# RAG API Reference

Complete API documentation for Retrieval-Augmented Generation (RAG) in Fabstir SDK.

## Table of Contents

- [VectorRAGManager](#vectorragmanager)
- [DocumentManager](#documentmanager)
- [Embedding Services](#embedding-services)
- [SessionManager RAG Integration](#sessionmanager-rag-integration)
- [Sharing and Permissions](#sharing-and-permissions)
- [Types and Interfaces](#types-and-interfaces)

---

## VectorRAGManager

Core manager for vector database operations.

### Constructor

```typescript
constructor(
  s5Service: S5Service,
  authManager: AuthManager,
  options?: RAGConfig
)
```

**Parameters:**
- `s5Service`: S5 service instance for decentralized storage
- `authManager`: Authentication manager (provides user identity)
- `options`: Optional RAG configuration

### Session Management

#### `createSession(databaseName: string, options?: CreateSessionOptions): Promise<string>`

Creates a new vector database session.

**Parameters:**
- `databaseName`: Unique name for the database
- `options`: Optional configuration
  - `dimensions`: Vector dimensions (default: 384)
  - `indexType`: 'ivf' | 'hnsw' (default: 'ivf')
  - `metric`: 'cosine' | 'euclidean' | 'dot' (default: 'cosine')
  - `description`: Database description

**Returns:** Session ID

**Example:**
```typescript
const sessionId = await vectorRAGManager.createSession('my-docs', {
  dimensions: 384,
  indexType: 'ivf',
  description: 'My document collection'
});
```

#### `destroySession(sessionIdOrName: string): Promise<void>`

Destroys a vector database session and cleans up resources.

**Parameters:**
- `sessionIdOrName`: Session ID or database name

**Example:**
```typescript
await vectorRAGManager.destroySession('my-docs');
```

#### `getSession(sessionIdOrName: string): VectorRAGSession | undefined`

Retrieves session information.

**Returns:** Session object or undefined

### Vector Operations

#### `addVector(databaseName: string, id: string, vector: number[], metadata?: Record<string, any>): Promise<void>`

Adds a single vector to the database.

**Parameters:**
- `databaseName`: Database name
- `id`: Unique vector ID
- `vector`: Vector embeddings (must match database dimensions)
- `metadata`: Optional metadata (native support, no JSON.stringify needed)

**Example:**
```typescript
await vectorRAGManager.addVector('my-docs', 'doc-1', embeddings, {
  content: 'Document text...',
  title: 'Introduction',
  author: 'John Doe',
  tags: ['tutorial', 'getting-started'],
  folderPath: '/tutorials'
});
```

#### `addVectors(databaseName: string, vectors: VectorInput[], options?: AddVectorOptions): Promise<AddVectorResult>`

Adds multiple vectors in batch.

**Parameters:**
- `databaseName`: Database name
- `vectors`: Array of vector inputs
- `options`: Optional settings
  - `deduplicateIds`: Remove duplicate IDs (default: true)
  - `skipValidation`: Skip validation for performance

**Returns:**
```typescript
{
  added: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
  skipped: number;
}
```

**Example:**
```typescript
const result = await vectorRAGManager.addVectors('my-docs', [
  { id: 'doc-1', vector: vec1, metadata: { title: 'Doc 1' } },
  { id: 'doc-2', vector: vec2, metadata: { title: 'Doc 2' } }
]);

console.log(`Added: ${result.added}, Failed: ${result.failed}`);
```

#### `updateMetadata(databaseName: string, id: string, metadata: Record<string, any>): Promise<void>`

Updates metadata for a specific vector (in-place, no re-indexing).

**Example:**
```typescript
await vectorRAGManager.updateMetadata('my-docs', 'doc-1', {
  tags: ['updated', 'tutorial'],
  lastModified: Date.now()
});
```

#### `deleteVector(databaseName: string, id: string): Promise<boolean>`

Deletes a single vector (soft deletion).

**Returns:** `true` if deleted, `false` if not found

#### `deleteByMetadata(databaseName: string, filter: MetadataFilter): Promise<DeleteResult>`

Deletes multiple vectors matching metadata filter.

**Parameters:**
- `filter`: MongoDB-style filter

**Returns:**
```typescript
{
  deletedIds: string[];
  deletedCount: number;
}
```

**Example:**
```typescript
const result = await vectorRAGManager.deleteByMetadata('my-docs', {
  category: 'obsolete'
});

console.log(`Deleted ${result.deletedCount} vectors`);
```

### Search Operations

#### `search(databaseName: string, queryVector: number[], topK: number, options?: SearchOptions): Promise<SearchResultWithSource[]>`

Searches a single database for similar vectors.

**Parameters:**
- `databaseName`: Database to search
- `queryVector`: Query embedding
- `topK`: Number of results to return
- `options`: Search options
  - `threshold`: Minimum similarity score (0-1)
  - `filter`: Metadata filter
  - `includeVectors`: Include full vectors in results

**Returns:** Array of search results with source attribution

**Example:**
```typescript
const results = await vectorRAGManager.search('my-docs', queryEmbedding, 5, {
  threshold: 0.7,
  filter: { category: 'tutorial' }
});

results.forEach(result => {
  console.log(`Score: ${result.score}, Content: ${result.metadata.content}`);
});
```

#### `searchMultipleDatabases(databaseNames: string[], queryVector: number[], options: MultiSearchOptions): Promise<SearchResultWithSource[]>`

Searches across multiple databases and merges results.

**Parameters:**
- `databaseNames`: Array of database names
- `queryVector`: Query embedding
- `options`: Multi-search options
  - `topK`: Total results across all databases
  - `threshold`: Minimum similarity score
  - `filter`: Metadata filter applied to all databases

**Returns:** Merged and ranked results from all databases

**Example:**
```typescript
const results = await vectorRAGManager.searchMultipleDatabases(
  ['work-docs', 'research-papers'],
  queryEmbedding,
  { topK: 10, threshold: 0.7 }
);

// Results include sourceDatabaseName
results.forEach(result => {
  console.log(`From ${result.sourceDatabaseName}: ${result.metadata.title}`);
});
```

### Database Management

#### `getDatabaseMetadata(databaseName: string): DatabaseMetadata | null`

Retrieves database metadata.

**Returns:**
```typescript
{
  databaseName: string;
  type: 'vector';
  createdAt: number;
  lastAccessedAt: number;
  owner: string;
  vectorCount: number;
  storageSizeBytes: number;
  description?: string;
  isPublic: boolean;
}
```

#### `updateDatabaseMetadata(databaseName: string, updates: UpdateMetadata): void`

Updates database metadata.

**Parameters:**
- `updates`: Fields to update (description, vectorCount, storageSizeBytes, isPublic)

#### `listDatabases(): DatabaseMetadata[]`

Lists all databases (sorted by creation time, newest first).

**Returns:** Array of database metadata

#### `getDatabaseStats(databaseName: string): DatabaseStats | null`

Gets database statistics.

**Returns:**
```typescript
{
  vectorCount: number;
  storageSizeBytes: number;
  sessionCount: number;
}
```

#### `deleteDatabase(databaseName: string): Promise<void>`

Deletes a database and all its sessions.

### Folder Operations

#### `listFolders(databaseName: string): string[]`

Lists all folder paths in the database (sorted alphabetically).

**Returns:** Array of folder paths (e.g., `['/docs', '/docs/tutorials', '/images']`)

#### `getFolderStatistics(databaseName: string, folderPath?: string): FolderStats`

Gets statistics for a folder (or entire database if no path provided).

**Returns:**
```typescript
{
  totalVectors: number;
  folderCounts: Record<string, number>; // Count per subfolder
}
```

#### `moveToFolder(databaseName: string, vectorIds: string[], targetFolder: string): Promise<number>`

Moves vectors to a different folder.

**Returns:** Number of vectors moved

**Example:**
```typescript
const moved = await vectorRAGManager.moveToFolder(
  'my-docs',
  ['doc-1', 'doc-2'],
  '/archive'
);
```

#### `searchInFolder(databaseName: string, folderPath: string, queryVector: number[], topK: number, options?: SearchOptions): Promise<SearchResultWithSource[]>`

Searches within a specific folder.

**Example:**
```typescript
const results = await vectorRAGManager.searchInFolder(
  'my-docs',
  '/tutorials',
  queryEmbedding,
  5
);
```

#### `moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number>`

Moves all contents from one folder to another.

**Returns:** Number of vectors moved

---

## DocumentManager

Manages document upload, chunking, and embedding generation.

### Constructor

```typescript
constructor(options: DocumentManagerOptions)
```

**Parameters:**
```typescript
{
  embeddingService: EmbeddingService;
  vectorManager: VectorRAGManager;
  databaseName: string;
  defaultChunkSize?: number; // Default: 500
  defaultOverlap?: number;    // Default: 50
}
```

### Document Processing

#### `processDocument(file: File, options?: ProcessDocumentOptions): Promise<ProcessDocumentResult>`

Processes a single document (extract → chunk → embed → store).

**Parameters:**
- `file`: Document file (PDF, DOCX, TXT, MD, HTML)
- `options`: Processing options
  - `chunkSize`: Characters per chunk (default: 500)
  - `overlap`: Overlap between chunks (default: 50)
  - `metadata`: Custom metadata to attach
  - `folderPath`: Virtual folder path
  - `deduplicateChunks`: Remove duplicate text chunks
  - `onProgress`: Progress callback

**Returns:**
```typescript
{
  documentId: string;
  chunks: number;
  embeddingsGenerated: number;
  vectorsStored: number;
  cost: number; // Embedding cost in USD
}
```

**Example:**
```typescript
const result = await documentManager.processDocument(pdfFile, {
  chunkSize: 500,
  overlap: 50,
  metadata: {
    author: 'John Doe',
    category: 'tutorial'
  },
  folderPath: '/tutorials',
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.progress}%`);
    // Stages: 'extracting', 'chunking', 'embedding', 'storing', 'complete'
  }
});

console.log(`Processed ${result.chunks} chunks, cost: $${result.cost.toFixed(4)}`);
```

#### `processBatch(files: File[], options?: ProcessBatchOptions): Promise<ProcessBatchResult>`

Processes multiple documents concurrently.

**Parameters:**
- `files`: Array of document files
- `options`: Batch processing options
  - `concurrency`: Max concurrent operations (default: 3)
  - `continueOnError`: Don't stop if one document fails
  - All `ProcessDocumentOptions` supported

**Returns:**
```typescript
{
  successful: number;
  failed: number;
  totalChunks: number;
  totalCost: number;
  results: Array<ProcessDocumentResult | { error: string }>;
}
```

**Example:**
```typescript
const result = await documentManager.processBatch(
  [pdf1, pdf2, txt1],
  {
    concurrency: 3,
    continueOnError: true,
    chunkSize: 500
  }
);

console.log(`Success: ${result.successful}/${files.length}`);
console.log(`Total cost: $${result.totalCost.toFixed(4)}`);
```

### Document Management

#### `listDocuments(): DocumentInfo[]`

Lists all processed documents.

**Returns:**
```typescript
Array<{
  documentId: string;
  filename: string;
  processedAt: number;
  chunks: number;
  metadata: Record<string, any>;
}>
```

#### `deleteDocument(documentId: string): Promise<void>`

Deletes a document and all its vectors.

### Cost Estimation

#### `estimateCost(file: File, options?: { chunkSize?: number; overlap?: number }): Promise<CostEstimate>`

Estimates embedding cost before processing.

**Returns:**
```typescript
{
  estimatedChunks: number;
  estimatedTokens: number;
  estimatedCost: number; // USD
}
```

**Example:**
```typescript
const estimate = await documentManager.estimateCost(largePdfFile);

if (estimate.estimatedCost > 0.50) {
  console.warn(`High cost: $${estimate.estimatedCost.toFixed(2)}`);
  // Prompt user for confirmation
}
```

---

## Embedding Services

### Base Class: EmbeddingService

All embedding adapters extend this base class.

#### Methods

```typescript
abstract embed(text: string): Promise<number[]>
abstract embedBatch(texts: string[]): Promise<number[][]>
getCostTracker(): CostTracker
getRateLimiter(): RateLimiter
```

### OpenAIAdapter

```typescript
import { OpenAIAdapter } from '@fabstir/sdk-core/embeddings/adapters';

const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'text-embedding-3-small',
  dimensions: 384,
  maxRetries: 3,
  timeout: 30000
});

// Generate embedding
const embedding = await adapter.embed('Some text');

// Batch embeddings
const embeddings = await adapter.embedBatch([text1, text2, text3]);

// Check costs
const costs = adapter.getCostTracker().getStats();
console.log(`Total cost: $${costs.totalCost.toFixed(4)}`);
```

**Pricing:** $0.02 per 1M tokens

### CohereAdapter

```typescript
import { CohereAdapter } from '@fabstir/sdk-core/embeddings/adapters';

const adapter = new CohereAdapter({
  apiKey: process.env.COHERE_API_KEY,
  model: 'embed-english-light-v3.0',
  dimensions: 384,
  inputType: 'search_document' // or 'search_query'
});
```

**Pricing:** $0.10 per 1M tokens

### HostAdapter (Zero Cost)

```typescript
import { HostAdapter } from '@fabstir/sdk-core/embeddings/adapters';

const adapter = new HostAdapter({
  hostUrl: 'http://your-host:8080',
  model: 'all-MiniLM-L6-v2',
  dimensions: 384,
  maxRetries: 3
});

// Zero-cost embeddings!
const embedding = await adapter.embed('Some text');
```

**Pricing:** $0.00 (runs on host infrastructure)

**Performance:** ~11ms per embedding (9x faster than 100ms target)

---

## SessionManager RAG Integration

### Configuration

#### `setVectorRAGManager(manager: VectorRAGManager): void`

Sets the vector RAG manager for the session manager.

#### `setEmbeddingService(service: EmbeddingService): void`

Sets the embedding service for RAG operations.

### Starting RAG-Enabled Sessions

```typescript
const { sessionId } = await sessionManager.startSession({
  hostUrl: 'http://host:8080',
  jobId: BigInt(123),
  modelName: 'llama-3',
  chainId: 84532,
  ragConfig: {
    enabled: true,
    databaseName: 'my-docs',           // Single database
    // OR
    databaseNames: ['docs', 'notes'],  // Multiple databases
    topK: 5,
    threshold: 0.7,
    conversationMemory: {
      enabled: true,
      maxMessages: 10,
      includeRecent: 5,
      similarityThreshold: 0.8
    }
  }
});
```

### RAG Configuration Types

```typescript
interface RAGConfig {
  enabled: boolean;
  databaseName?: string;        // Single database
  databaseNames?: string[];     // Multiple databases
  topK: number;                 // Number of context chunks
  threshold: number;            // Similarity threshold (0-1)
  conversationMemory?: {
    enabled: boolean;
    maxMessages: number;        // Max history messages to store
    includeRecent: number;      // Always include N most recent
    similarityThreshold: number; // Threshold for historical retrieval
  };
}
```

### Sending Prompts with RAG

```typescript
// RAG context automatically injected
const response = await sessionManager.sendPrompt(sessionId, 'Your question');

// Or with streaming
await sessionManager.sendPromptStreaming(
  sessionId,
  'Your question',
  (chunk) => {
    console.log('Chunk:', chunk.content);
  }
);
```

### Accessing RAG Metrics

```typescript
const session = sessionManager.getSession(sessionId);

if (session.ragMetrics) {
  console.log('Contexts retrieved:', session.ragMetrics.contextsRetrieved);
  console.log('Avg similarity:', session.ragMetrics.avgSimilarityScore);
  console.log('Retrieval time:', session.ragMetrics.retrievalTimeMs, 'ms');
  console.log('Tokens added:', session.ragMetrics.tokensAdded);
}
```

---

## Sharing and Permissions

### PermissionManager

```typescript
import { PermissionManager } from '@fabstir/sdk-core/permissions';

const permissionManager = new PermissionManager(currentUserAddress);
```

#### `grant(databaseName: string, userAddress: string, role: 'reader' | 'writer'): void`

Grants permission to another user.

**Example:**
```typescript
permissionManager.grant('my-docs', '0x742d35Cc...', 'reader');
```

#### `revoke(databaseName: string, userAddress: string): void`

Revokes permission from a user.

#### `check(databaseName: string, permission: 'read' | 'write', userAddress: string): boolean`

Checks if a user has permission.

#### `listPermissions(databaseName: string): PermissionRecord[]`

Lists all permissions for a database.

### SharingManager

```typescript
import { SharingManager } from '@fabstir/sdk-core/sharing';

const sharingManager = new SharingManager({
  permissionManager: sdk.getPermissionManager(),
  notificationHandler: (notification) => {
    console.log('Notification:', notification);
  }
});
```

#### `createInvitation(options: InvitationOptions): Promise<Invitation>`

Creates a sharing invitation.

**Parameters:**
```typescript
{
  databaseName: string;
  recipientAddress: string;
  role: 'reader' | 'writer';
  expiresIn?: number;  // Milliseconds (default: 7 days)
  message?: string;
}
```

**Returns:**
```typescript
{
  invitationId: string;
  invitationCode: string; // Share this with recipient
  databaseName: string;
  recipientAddress: string;
  role: 'reader' | 'writer';
  expiresAt: number;
  status: 'pending';
}
```

#### `acceptInvitation(invitationCode: string): Promise<void>`

Accepts a sharing invitation.

#### `generateAccessToken(options: TokenOptions): Promise<AccessToken>`

Generates time-limited or usage-limited access token.

**Parameters:**
```typescript
{
  databaseName: string;
  role: 'reader' | 'writer';
  expiresIn?: number;   // Time limit (ms)
  usageLimit?: number;  // Max uses
}
```

---

## Types and Interfaces

### VectorInput

```typescript
interface VectorInput {
  id: string;
  vector: number[];
  metadata?: Record<string, any>;
}
```

### SearchResult

```typescript
interface SearchResult {
  id: string;
  vector?: number[];
  score: number;
  metadata: Record<string, any>;
}
```

### SearchResultWithSource

```typescript
interface SearchResultWithSource extends SearchResult {
  sourceDatabaseName: string;
}
```

### MetadataFilter

MongoDB-style filter syntax:

```typescript
type MetadataFilter =
  | { $eq: { [key: string]: any } }
  | { $in: { [key: string]: any[] } }
  | { $gt: { [key: string]: number } }
  | { $gte: { [key: string]: number } }
  | { $lt: { [key: string]: number } }
  | { $lte: { [key: string]: number } }
  | { $and: MetadataFilter[] }
  | { $or: MetadataFilter[] }
  | { [key: string]: any }; // Shorthand for $eq
```

**Examples:**
```typescript
// Exact match (shorthand)
{ category: 'tutorial' }

// Exact match (explicit)
{ $eq: { category: 'tutorial' } }

// In array
{ $in: { tags: ['ai', 'ml'] } }

// Range
{ $gte: { score: 0.8 } }

// Complex query
{
  $and: [
    { category: 'tutorial' },
    { $gte: { createdAt: Date.now() - 86400000 } }
  ]
}
```

### DatabaseMetadata

```typescript
interface DatabaseMetadata {
  databaseName: string;
  type: 'vector' | 'graph';
  createdAt: number;
  lastAccessedAt: number;
  owner: string;
  vectorCount: number;
  storageSizeBytes: number;
  description?: string;
  isPublic: boolean;
}
```

### ProgressUpdate

```typescript
interface ProgressUpdate {
  stage: 'extracting' | 'chunking' | 'embedding' | 'storing' | 'complete';
  progress: number; // 0-100
  currentItem?: number;
  totalItems?: number;
}
```

---

## Error Handling

All methods may throw the following errors:

- `DatabaseNotFoundError`: Database doesn't exist
- `SessionNotFoundError`: Session not found
- `PermissionDeniedError`: User lacks required permission
- `DimensionMismatchError`: Vector dimensions don't match database
- `RateLimitError`: Embedding API rate limit exceeded
- `ValidationError`: Invalid input parameters
- `StorageError`: S5 storage operation failed

**Example:**
```typescript
try {
  await vectorRAGManager.addVector('my-docs', 'id-1', vector);
} catch (error) {
  if (error.name === 'DimensionMismatchError') {
    console.error('Vector dimensions do not match database');
  } else if (error.name === 'PermissionDeniedError') {
    console.error('You do not have write permission');
  } else {
    throw error;
  }
}
```

---

## Next Documentation

- **[Quick Start Guide](./RAG_QUICK_START.md)** - Get started in 5 minutes
- **[Integration Guide](./RAG_INTEGRATION_GUIDE.md)** - Integrate into existing apps
- **[Best Practices](./RAG_BEST_PRACTICES.md)** - Recommended patterns
- **[Troubleshooting](./RAG_TROUBLESHOOTING.md)** - Common issues
- **[Security Guide](./RAG_SECURITY.md)** - Security considerations
