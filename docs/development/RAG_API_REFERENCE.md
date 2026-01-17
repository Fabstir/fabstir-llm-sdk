# RAG API Reference (Host-Side Architecture)

Complete API documentation for Retrieval-Augmented Generation (RAG) in Fabstir SDK v8.3.0+.

## Overview

As of v8.3.0, RAG implementation is **100% host-side**. Vectors are stored in session memory on the host node (Rust), not client-side. This eliminates native binding issues, improves performance, and provides automatic cleanup.

## Architecture: Hybrid Approach

**Current Implementation (v8.3.0)**: Temporary session-scoped RAG

The current implementation provides **session-scoped RAG** - vectors are uploaded for a specific conversation and automatically deleted when the session ends. This is ideal for:
- ✅ "Chat about this PDF right now" use cases
- ✅ Privacy-sensitive temporary document queries
- ✅ Mobile-friendly (no heavy client-side compute)

**Limitations of Current Implementation**:
- ❌ **No persistence** - vectors deleted when session ends
- ❌ **No organization** - no folders or multi-database support
- ❌ **No sharing** - session-private only
- ❌ **No long-term knowledge bases** - must re-upload docs every session

**Planned: Hybrid Architecture** (see [IMPLEMENTATION_RAG.md](./IMPLEMENTATION_RAG.md))

The full RAG system combines **host-side compute** with **client-side storage**:

| Feature | Where | Why |
|---------|-------|-----|
| **Embedding generation** | Host | GPU/CPU intensive (neural networks) |
| **Vector search** | Host | CPU intensive (cosine similarity) |
| **Vector storage** | Client (S5) | User data sovereignty |
| **Folder organization** | Client | Lightweight metadata operations |
| **Permissions** | Client | Access control is client-managed |
| **Database management** | Client | Multiple knowledge bases per user |

**Example Future Workflow**:
```typescript
// 1. Store vectors in S5 with folder organization (client-side)
await vectorRAG.createSession('company-docs');
await vectorRAG.addVector('company-docs', id, vector, {
  folderPath: '/engineering/api-docs',
  permissions: { readers: ['0x123...'] }
});

// 2. Later session: retrieve from S5, upload to host for search
const vectors = await vectorRAG.getVectorsFromS5('company-docs');
await sessionManager.uploadVectors(sessionId, vectors); // Temporary
const results = await sessionManager.searchVectors(sessionId, query);
// Host discards vectors after search, no persistence
```

**Benefits**:
- ✅ **Client sovereignty** - Your data in S5, your folders, your permissions
- ✅ **Host performance** - Rust vector search, GPU embeddings
- ✅ **Mobile-friendly** - Client just manages S3-like operations
- ✅ **Privacy** - Host only sees vectors temporarily during search
- ✅ **Persistent knowledge bases** - Build over time, organize 100s of documents

**For Now**: Use current session-scoped RAG for temporary queries. Watch [IMPLEMENTATION_RAG.md](./IMPLEMENTATION_RAG.md) for progress on persistent storage features.

## Table of Contents

- [Quick Start](#quick-start)
- [SessionManager RAG Methods](#sessionmanager-rag-methods)
  - [uploadVectors](#uploadvectors)
  - [searchVectors](#searchvectors)
  - [askWithContext](#askwithcontext)
- [DocumentManager](#documentmanager)
  - [processDocument](#processdocument)
- [HostAdapter (Embedding Service)](#hostadapter-embedding-service)
- [VectorRAGManager (Simplified)](#vectorragmanager-simplified)
- [Production Configuration](#production-configuration)
- [Types and Interfaces](#types-and-interfaces)
- [Error Handling](#error-handling)
- [Migration from Client-Side RAG](#migration-from-client-side-rag)

---

## Quick Start

```typescript
import { FabstirSDKCore } from "@fabstir/sdk-core";
import { HostAdapter } from "@fabstir/sdk-core/embeddings";
import { DocumentManager } from "@fabstir/sdk-core/documents";

async function ragQuickStart() {
  // 1. Initialize SDK
  const sdk = new FabstirSDKCore({ network: 'base-sepolia' });
  await sdk.authenticate(privateKey);

  // 2. Setup embedding service (zero-cost)
  const hostUrl = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083';
  const embeddingService = new HostAdapter({ hostUrl, dimensions: 384 });

  // 3. Start session
  const sessionManager = await sdk.getSessionManager();
  const { sessionId } = await sessionManager.startSession({
    hostUrl,
    jobId: 123n,
    modelName: 'llama-3',
    chainId: 84532
  });

  // 4. Process document (extract → chunk → embed)
  const documentManager = new DocumentManager({ embeddingService });
  const chunks = await documentManager.processDocument(file, {
    chunkSize: 500,
    overlap: 50
  });

  // 5. Convert chunks to vectors and upload to host
  const vectors = chunks.map((chunk, i) => ({
    id: `chunk-${i}`,
    vector: chunk.embedding,
    metadata: { text: chunk.text, index: i }
  }));

  await sessionManager.uploadVectors(sessionId, vectors);
  console.log(`Uploaded ${vectors.length} vectors`);

  // 6. Ask questions with automatic context injection
  const enhanced = await sessionManager.askWithContext(
    sessionId,
    'What are the key points in this document?',
    3  // topK: retrieve top 3 chunks
  );

  // 7. Send to LLM
  await sessionManager.sendPromptStreaming(sessionId, enhanced, (chunk) => {
    process.stdout.write(chunk.content);
  });
}
```

---

## SessionManager RAG Methods

The SessionManager provides three methods for host-side RAG operations via WebSocket.

### uploadVectors

Uploads vectors to the host node's session memory for RAG functionality.

```typescript
async uploadVectors(
  sessionId: string | BigInt,
  vectors: Vector[],
  replace?: boolean
): Promise<UploadVectorsResult>
```

**Parameters:**
- `sessionId`: Active session ID (must have WebSocket connection)
- `vectors`: Array of vector objects (see [Vector interface](#vector))
- `replace`: If true, replace all existing vectors; if false, append (default: false)

**Returns:**
```typescript
interface UploadVectorsResult {
  uploaded: number;    // Number of vectors successfully uploaded
  status: 'success' | 'error';
  error?: string;      // Error message if status is 'error'
}
```

**Example:**
```typescript
// Convert document chunks to vectors
const vectors = chunks.map((chunk, i) => ({
  id: `doc-${docId}-chunk-${i}`,
  vector: chunk.embedding,  // 384-dimensional array from HostAdapter
  metadata: {
    text: chunk.text,
    source: 'document.pdf',
    page: chunk.page,
    index: i,
    timestamp: Date.now()
  }
}));

// Upload to host (automatically batched at 1000 vectors per WebSocket message)
const result = await sessionManager.uploadVectors(sessionId, vectors);

if (result.status === 'success') {
  console.log(`✅ Uploaded ${result.uploaded} vectors`);
} else {
  console.error(`❌ Upload failed: ${result.error}`);
}
```

**Notes:**
- **Auto-batching**: Vectors are automatically split into batches of 1000 per WebSocket message
- **Session memory**: Vectors stored in Rust HashMap on host (fast, in-memory)
- **Auto-cleanup**: Vectors automatically deleted when session ends (WebSocket disconnect)
- **No persistence**: Host is stateless - vectors not saved to disk
- **Capacity**: Up to 100,000 vectors per session
- **Validation**: Vector dimensions must be 384 (all-MiniLM-L6-v2)

**Errors:**
- Throws if session is not active
- Throws if vector dimensions don't match (must be 384)
- Throws if batch size exceeds 1000 vectors
- Throws on WebSocket timeout (30 seconds)

---

### searchVectors

Searches for similar vectors on the host node using cosine similarity.

```typescript
async searchVectors(
  sessionId: string | BigInt,
  queryVector: number[],
  k?: number,
  threshold?: number
): Promise<SearchResult[]>
```

**Parameters:**
- `sessionId`: Active session ID
- `queryVector`: Query embedding (384 dimensions)
- `k`: Number of results to return (default: 5, max: 20)
- `threshold`: Minimum similarity score (default: 0.2, range: 0.0-1.0)

**Returns:**
```typescript
interface SearchResult {
  id: string;                      // Vector ID
  score: number;                   // Cosine similarity (0-1, higher is better)
  metadata: Record<string, any>;   // Vector metadata
  vector?: number[];               // Optional: full vector (if requested)
}
```

**Example:**
```typescript
// Generate query embedding
const query = "What are the key findings about climate change?";
const queryEmbedding = await embeddingService.embed(query);

// Search with production-tested threshold
const results = await sessionManager.searchVectors(
  sessionId,
  queryEmbedding,
  5,    // topK: return top 5 most similar chunks
  0.2   // threshold: 0.2 works best with all-MiniLM-L6-v2
);

// Process results
results.forEach((result, i) => {
  console.log(`\n[Result ${i + 1}] Score: ${result.score.toFixed(3)}`);
  console.log(`Text: ${result.metadata.text}`);
  console.log(`Source: ${result.metadata.source}`);
});

// Example output:
// [Result 1] Score: 0.417
// Text: Climate models show a 1.5°C warming trend...
// Source: ipcc-report-2024.pdf
```

**Threshold Selection Guide:**

| Threshold | Behavior | Use Case |
|-----------|----------|----------|
| 0.0 | Accept all results | Debugging only |
| **0.2** | **Balanced filtering** | **✅ Recommended for production** |
| 0.4 | Strict filtering | High-precision queries |
| 0.7 | Very strict | ❌ Returns 0 results with all-MiniLM-L6-v2 |

**Similarity Score Interpretation:**
- **0.35-0.50**: Highly relevant (semantic match)
- **0.20-0.35**: Relevant (topical match)
- **0.00-0.20**: Noise (unrelated content)

**Performance:**
- **Speed**: ~100ms for 10,000 vectors (Rust implementation)
- **Scalability**: Linear time complexity O(n)
- **Memory**: Constant memory usage (no vector copy needed)

**Notes:**
- Results sorted by score (highest first)
- Empty array returned if no matches above threshold
- Cosine similarity metric used (normalized dot product)
- Search performs on session-specific vectors only (isolated)

**Errors:**
- Throws if session is not active
- Throws if query vector dimensions don't match (must be 384)
- Throws if k is out of range (1-20)
- Throws if threshold is out of range (0.0-1.0)
- Throws on WebSocket timeout (10 seconds)

---

### askWithContext

Helper method that combines embedding generation, vector search, and context injection.

```typescript
async askWithContext(
  sessionId: string | BigInt,
  question: string,
  topK?: number
): Promise<string>
```

**Parameters:**
- `sessionId`: Active session ID
- `question`: User's question (plain text)
- `topK`: Number of context chunks to retrieve (default: 5)

**Returns:** Enhanced prompt string with RAG context injected

**Example:**
```typescript
// Automatic workflow: embed → search → format
const enhancedPrompt = await sessionManager.askWithContext(
  sessionId,
  'What are the main conclusions about renewable energy?',
  3  // Retrieve top 3 relevant chunks
);

// enhancedPrompt contains:
// Context:
// [Document 1] Solar energy capacity increased by 23%...
//
// [Document 2] Wind power costs decreased 40%...
//
// [Document 3] Battery storage technology improved...
//
// Question: What are the main conclusions about renewable energy?

// Send enhanced prompt to LLM
await sessionManager.sendPromptStreaming(sessionId, enhancedPrompt, (chunk) => {
  process.stdout.write(chunk.content);
});
```

**Context Format:**
```
Context:
[Document 1] <text from result[0].metadata.text>

[Document 2] <text from result[1].metadata.text>

[Document 3] <text from result[2].metadata.text>

Question: <original question>
```

**Behavior:**
- **With Results**: Returns formatted prompt with context
- **No Results**: Returns original question unchanged (graceful fallback)
- **Error Handling**: Logs error and returns original question (fail-safe)

**Text Extraction:**

The method uses a robust fallback chain to extract text from search results:

```typescript
// Priority order for text extraction
const text = result.text
  || result.content
  || result.metadata?.text
  || result.chunk
  || 'No text found';
```

**Notes:**
- Uses production-tested threshold (0.2) automatically
- Requires embedding service to be configured on SessionManager
- Logs errors to console but doesn't throw (fail-safe design)
- No external dependencies (uses SessionManager methods)

**Errors:**
- Silently falls back to original question on error
- Logs error messages to console for debugging

---

## DocumentManager

Simplified document manager for processing files (extract → chunk → embed).

### Constructor

```typescript
constructor(options: DocumentManagerOptions)
```

**Parameters:**
```typescript
interface DocumentManagerOptions {
  embeddingService: EmbeddingService;  // HostAdapter or other embedding service
  defaultChunkSize?: number;            // Default: 500 tokens
  defaultOverlap?: number;              // Default: 50 tokens
}
```

**Example:**
```typescript
import { HostAdapter } from '@fabstir/sdk-core/embeddings';
import { DocumentManager } from '@fabstir/sdk-core/documents';

const embeddingService = new HostAdapter({
  hostUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083',
  dimensions: 384
});

const documentManager = new DocumentManager({
  embeddingService,
  defaultChunkSize: 500,
  defaultOverlap: 50
});
```

---

### processDocument

Processes a document file: extract text → chunk → generate embeddings.

```typescript
async processDocument(
  file: File,
  options?: ProcessDocumentOptions
): Promise<ChunkResult[]>
```

**Parameters:**
- `file`: Document file (supported: .txt, .md, .html, .pdf, .docx)
- `options`: Processing options (see below)

**Options:**
```typescript
interface ProcessDocumentOptions {
  chunkSize?: number;           // Characters per chunk (default: 500)
  overlap?: number;             // Overlap between chunks (default: 50)
  onProgress?: (progress: ProgressUpdate) => void;
}

interface ProgressUpdate {
  stage: 'extracting' | 'chunking' | 'embedding';
  progress: number;             // 0-100
  currentItem?: number;
  totalItems?: number;
}
```

**Returns:**
```typescript
interface ChunkResult {
  text: string;                 // Chunk text content
  embedding: number[];          // 384-dimensional vector
  index: number;                // Chunk index in document
  metadata?: Record<string, any>;
}
```

**Example:**
```typescript
const file = document.getElementById('fileInput').files[0];

// Process with progress tracking
const chunks = await documentManager.processDocument(file, {
  chunkSize: 500,
  overlap: 50,
  onProgress: (progress) => {
    console.log(`${progress.stage}: ${progress.progress}%`);
    // extracting: 25%
    // chunking: 50%
    // embedding: 75%
  }
});

console.log(`Processed ${chunks.length} chunks`);

// Convert to vectors for upload
const vectors = chunks.map((chunk, i) => ({
  id: `doc-${file.name}-chunk-${i}`,
  vector: chunk.embedding,
  metadata: {
    text: chunk.text,
    index: chunk.index,
    filename: file.name,
    chunkSize: chunk.text.length
  }
}));

// Upload to host
await sessionManager.uploadVectors(sessionId, vectors);
```

**Supported File Types:**
- **Text**: .txt, .md
- **HTML**: .html, .htm
- **PDF**: .pdf (text extraction only, no OCR)
- **Word**: .docx

**Progress Stages:**
1. **extracting** (25%): Reading file and extracting text
2. **chunking** (50%): Splitting text into overlapping chunks
3. **embedding** (75%): Generating embeddings for all chunks

**Notes:**
- **No vector storage**: Returns chunks only (you upload to host manually)
- **Simplified API**: Removed client-side vector DB management
- **Zero cost**: Uses HostAdapter for free embeddings
- **Memory efficient**: Processes chunks in batches

**Errors:**
- Throws if file type is not supported
- Throws if file is empty or corrupted
- Throws if embedding service fails
- Throws if chunk size is invalid (must be > 0)

---

## HostAdapter (Embedding Service)

Zero-cost embedding service using the host node's ONNX model (all-MiniLM-L6-v2).

### Constructor

```typescript
constructor(config: HostAdapterConfig)
```

**Parameters:**
```typescript
interface HostAdapterConfig {
  hostUrl: string;              // Host API URL
  dimensions?: number;          // Embedding dimensions (default: 384)
  model?: string;               // Model name (default: 'all-MiniLM-L6-v2')
  maxRetries?: number;          // Max retries on failure (default: 3)
  timeout?: number;             // Request timeout in ms (default: 30000)
}
```

**Example:**
```typescript
import { HostAdapter } from '@fabstir/sdk-core/embeddings';

// Always use environment variables (not hardcoded URLs)
const adapter = new HostAdapter({
  hostUrl: process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083',
  dimensions: 384,
  model: 'all-MiniLM-L6-v2',
  maxRetries: 3
});
```

### embed

Generates embedding for a single text string.

```typescript
async embed(text: string): Promise<number[]>
```

**Example:**
```typescript
const embedding = await adapter.embed('What is machine learning?');
console.log(`Generated ${embedding.length}-dimensional vector`);
// Output: Generated 384-dimensional vector
```

### embedBatch

Generates embeddings for multiple text strings.

```typescript
async embedBatch(texts: string[]): Promise<number[][]>
```

**Example:**
```typescript
const texts = [
  'Introduction to AI',
  'Machine learning basics',
  'Deep learning fundamentals'
];

const embeddings = await adapter.embedBatch(texts);
console.log(`Generated ${embeddings.length} embeddings`);
// Output: Generated 3 embeddings
```

**Performance:**
- **Speed**: ~11ms per embedding (9x faster than 100ms target)
- **Cost**: $0.00 (zero cost, runs on host infrastructure)
- **Batch size**: Recommended max 100 texts per batch

**HTTP Endpoint:**
```
POST {hostUrl}/v1/embed
Content-Type: application/json

{
  "input": "text to embed",
  "model": "all-MiniLM-L6-v2"
}

Response:
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "index": 0,
      "embedding": [0.123, -0.456, ...]  // 384 floats
    }
  ],
  "model": "all-MiniLM-L6-v2",
  "usage": {
    "prompt_tokens": 5,
    "total_tokens": 5
  }
}
```

**Notes:**
- **ONNX model**: all-MiniLM-L6-v2 (384 dimensions)
- **Production-ready**: Available since fabstir-llm-node v8.2.0
- **No API key**: No authentication required
- **Always available**: Included in every host node

**Errors:**
- Throws if host URL is unreachable
- Throws if embedding model not loaded
- Throws on timeout (30 seconds default)
- Throws if response dimensions don't match (must be 384)

---

## VectorRAGManager (Simplified)

**DEPRECATED**: VectorRAGManager is now a simplified wrapper that delegates to SessionManager. Use SessionManager methods directly for host-side RAG.

### Constructor

```typescript
constructor(sessionManager: SessionManager)
```

**Example:**
```typescript
import { VectorRAGManager } from '@fabstir/sdk-core';

const sessionManager = await sdk.getSessionManager();
const vectorRAGManager = new VectorRAGManager(sessionManager);

// Internally delegates to SessionManager.uploadVectors()
await vectorRAGManager.addVectors(sessionId, vectors);

// Internally delegates to SessionManager.searchVectors()
const results = await vectorRAGManager.search(sessionId, queryVector, 5, { threshold: 0.2 });
```

**Removed Features** (compared to client-side version):
- ❌ No `createSession()` - sessions managed by host
- ❌ No S5 persistence - host is stateless
- ❌ No folder hierarchies - simplified to flat structure
- ❌ No permissions/sharing - session-isolated
- ❌ No metadata filtering - basic search only
- ❌ No multi-database search - one database per session

**Migration Tip**: Replace all VectorRAGManager calls with SessionManager methods:

```typescript
// OLD (client-side RAG)
await vectorRAGManager.createSession('my-db');
await vectorRAGManager.addVector('my-db', id, vector, metadata);
const results = await vectorRAGManager.search('my-db', query, 5, { threshold: 0.7 });

// NEW (host-side RAG)
const { sessionId } = await sessionManager.startSession({...});
await sessionManager.uploadVectors(sessionId, [{ id, vector, metadata }]);
const results = await sessionManager.searchVectors(sessionId, query, 5, 0.2);
```

---

## Production Configuration

### Environment Variables

**CRITICAL**: Always use environment variables for host URLs.

```bash
# apps/harness/.env.local
NEXT_PUBLIC_TEST_HOST_1_URL=http://localhost:8083
```

```typescript
// ❌ WRONG - Hardcoded URL
const hostUrl = 'http://localhost:8080';

// ✅ CORRECT - Environment variable
const hostUrl = process.env.NEXT_PUBLIC_TEST_HOST_1_URL || 'http://localhost:8083';
```

**Why**: Docker port remapping (8083 inside container → 8080 on host) causes confusion. Environment variables handle this automatically.

### Threshold Configuration

**Default**: 0.2 (production-verified with all-MiniLM-L6-v2)

```typescript
// ✅ Production-tested threshold
const results = await sessionManager.searchVectors(sessionId, query, 5, 0.2);

// ❌ Old default (returns 0 results)
const results = await sessionManager.searchVectors(sessionId, query, 5, 0.7);
```

**Why**: all-MiniLM-L6-v2 embeddings typically produce similarity scores in the 0.15-0.42 range. A threshold of 0.7 is too strict.

### Text Extraction Pattern

Search results may have text in different fields:

```typescript
// Robust text extraction with fallback chain
searchResults.forEach((result: any, idx: number) => {
  const text = result.text
    || result.content
    || result.metadata?.text
    || result.chunk
    || 'No text found';

  console.log(`[Document ${idx + 1}] ${text}`);
});
```

**Field Priority:**
1. `result.text` - Primary field (node v8.3.0+)
2. `result.content` - Alternative field
3. `result.metadata?.text` - Metadata-embedded text
4. `result.chunk` - Legacy field
5. `'No text found'` - Graceful degradation

### Context Window Strategies

**Tiny LLM Models** (TinyVicuna, TinyLlama) have 512-token context windows:

```typescript
// Strategy 1: Use smaller topK
const results = await sessionManager.searchVectors(sessionId, query, 3, 0.2);

// Strategy 2: Truncate context
let ragContext = '';
for (const result of results) {
  const text = result.metadata?.text || '';
  ragContext += text.slice(0, 500) + '\n\n';  // Limit each chunk to 500 chars
}

// Strategy 3: Upload smaller documents (recommended)
const chunks = await documentManager.processDocument(file, {
  chunkSize: 300,  // Smaller chunks for tiny models
  overlap: 30
});
```

**Context Budget:**
- Context window: **512 tokens**
- RAG context budget: **~300 tokens** (leaves 212 for prompt + response)
- Document size limit: **~1,500 characters per document**

### Debug Logging Pattern

Comprehensive logging for RAG operations:

```typescript
// Upload flow
console.log('[RAG DEBUG] handleFileUpload called');
console.log('[RAG DEBUG] File:', { name: file.name, size: file.size });
console.log('[RAG DEBUG] Processing document...');
console.log('[RAG DEBUG] Chunks created:', chunks.length);
console.log('[RAG DEBUG] Converting chunks to vectors...');
console.log('[RAG DEBUG] Vectors:', vectors.length);
console.log('[RAG DEBUG] Calling sessionManager.uploadVectors...');
console.log('[RAG DEBUG] Upload result:', result);

// Search flow
console.log('[RAG] Generating embedding for query:', query);
console.log('[RAG] Calling searchVectors...');
console.log('[RAG] Search results:', results.length);
console.log('[RAG] Top result score:', results[0]?.score);
console.log('[RAG] Extracted context length:', context.length);
```

---

## Types and Interfaces

### Vector

```typescript
interface Vector {
  id: string;                      // Unique identifier
  vector: number[];                // 384-dimensional embedding
  metadata?: Record<string, any>;  // Optional metadata
}
```

### SearchResult

```typescript
interface SearchResult {
  id: string;                      // Vector ID
  score: number;                   // Cosine similarity (0-1)
  metadata: Record<string, any>;   // Vector metadata
  vector?: number[];               // Optional: full vector
}
```

### UploadVectorsResult

```typescript
interface UploadVectorsResult {
  uploaded: number;    // Number of vectors uploaded
  status: 'success' | 'error';
  error?: string;      // Error message if failed
}
```

### ChunkResult

```typescript
interface ChunkResult {
  text: string;                    // Chunk text
  embedding: number[];             // 384-dimensional vector
  index: number;                   // Chunk index
  metadata?: Record<string, any>;
}
```

### ProgressUpdate

```typescript
interface ProgressUpdate {
  stage: 'extracting' | 'chunking' | 'embedding';
  progress: number;                // 0-100
  currentItem?: number;
  totalItems?: number;
}
```

---

## Error Handling

All RAG methods may throw the following errors:

### Common Errors

**SessionNotActiveError**: Session not found or WebSocket disconnected
```typescript
try {
  await sessionManager.uploadVectors(sessionId, vectors);
} catch (error) {
  if (error.message.includes('session not active')) {
    console.error('Session ended or WebSocket disconnected');
    // Restart session
  }
}
```

**DimensionMismatchError**: Vector dimensions don't match (must be 384)
```typescript
try {
  await sessionManager.searchVectors(sessionId, queryVector, 5, 0.2);
} catch (error) {
  if (error.message.includes('dimension')) {
    console.error('Query vector must be 384 dimensions');
  }
}
```

**WebSocket Timeout**: Operation timed out (30s upload, 10s search)
```typescript
try {
  await sessionManager.uploadVectors(sessionId, largeVectorArray);
} catch (error) {
  if (error.message.includes('timeout')) {
    console.error('Upload timed out - try smaller batches');
  }
}
```

**ValidationError**: Invalid parameters (k, threshold out of range)
```typescript
try {
  await sessionManager.searchVectors(sessionId, query, 25, 0.2);
} catch (error) {
  if (error.message.includes('validation')) {
    console.error('k must be between 1-20');
  }
}
```

### Best Practices

1. **Always check session status** before RAG operations
2. **Use try-catch blocks** around all WebSocket operations
3. **Implement retries** for transient failures (network issues)
4. **Validate vector dimensions** before upload (must be 384)
5. **Handle timeouts gracefully** (reduce batch size if needed)

---

## Migration from Client-Side RAG

If you're migrating from the old client-side RAG (v8.2.x and earlier):

### What Changed

| Feature | Client-Side (Old) | Host-Side (New) |
|---------|------------------|-----------------|
| Vector Storage | Browser memory + S5 | Host session memory (Rust) |
| Database Creation | `createSession('db-name')` | No creation needed |
| Vector Upload | `addVector('db', id, vector)` | `uploadVectors(sessionId, vectors)` |
| Search | `search('db', query, k)` | `searchVectors(sessionId, query, k)` |
| Persistence | S5 permanent storage | Auto-deleted on disconnect |
| Threshold Default | 0.7 | 0.2 |
| Native Bindings | Required | Not needed ✅ |

### Migration Steps

**Step 1**: Remove VectorRAGManager initialization
```typescript
// OLD
const vectorRAGManager = sdk.getVectorRAGManager();
await vectorRAGManager.createSession('my-db');

// NEW
const sessionManager = await sdk.getSessionManager();
const { sessionId } = await sessionManager.startSession({...});
```

**Step 2**: Update vector upload
```typescript
// OLD
await vectorRAGManager.addVector('my-db', id, vector, metadata);

// NEW
await sessionManager.uploadVectors(sessionId, [{ id, vector, metadata }]);
```

**Step 3**: Update search
```typescript
// OLD
const results = await vectorRAGManager.search('my-db', query, 5, {
  threshold: 0.7
});

// NEW
const results = await sessionManager.searchVectors(sessionId, query, 5, 0.2);
```

**Step 4**: Update DocumentManager
```typescript
// OLD
const documentManager = new DocumentManager({
  embeddingService,
  vectorManager: vectorRAGManager,
  databaseName: 'my-db'
});

// NEW
const documentManager = new DocumentManager({
  embeddingService
  // No vector manager or database name needed
});
```

**Step 5**: Remove S5 persistence code
```typescript
// OLD - Remove this code
await vectorRAGManager.saveSession('my-db');
await vectorRAGManager.loadSession('my-db');

// NEW - No persistence needed (host is stateless)
```

### Removed Features

These features are **no longer available** in host-side RAG:

- ❌ Database creation (`createSession`)
- ❌ Database listing (`listDatabases`)
- ❌ Folder hierarchies (`listFolders`, `moveToFolder`)
- ❌ Permissions and sharing (`PermissionManager`, `SharingManager`)
- ❌ Metadata filtering (`deleteByMetadata` with complex filters)
- ❌ Multi-database search (`searchMultipleDatabases`)
- ❌ S5 persistence (`saveSession`, `loadSession`)

---

## Additional Resources

- **Implementation Guide**: [docs/IMPLEMENTATION_CHAT_RAG.md](IMPLEMENTATION_CHAT_RAG.md)
- **SDK API Reference**: [docs/SDK_API.md](SDK_API.md)
- **Architecture Overview**: [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- **Manual Testing Guide**: [docs/RAG_MANUAL_TESTING_GUIDE.md](RAG_MANUAL_TESTING_GUIDE.md)
- **Node API Reference**: [docs/node-reference/API.md](node-reference/API.md)

---

**Version**: v8.3.0+ (Host-Side RAG)
**Last Updated**: January 2025
**Production Status**: ✅ Verified (Session 110)
