# Host Embedding Generation via WebSocket - Implementation Guide

**⚠️ PHASE 2 (POST-MVP) - FUTURE IMPLEMENTATION**

This document describes the **Phase 2 (post-MVP)** approach for deferred embeddings with WebSocket streaming and ECDH encryption.

**For Pre-MVP UI5 Release**: Use the existing HTTP `/v1/embed` endpoint instead. No host-side changes are needed for Phase 1.

---

**Target Audience**: fabstir-llm-node developers
**Purpose**: WebSocket-based embedding generation with S5 path handling and ECDH encryption
**Implementation Timeline**: After UI5 MVP release (~10-15 hours development time)
**Date**: 2025-11-17

---

## Document Status

| Phase | Status | Implementation |
|-------|--------|----------------|
| **Phase 1 (Pre-MVP)** | ✅ Complete | Use existing HTTP `/v1/embed` endpoint |
| **Phase 2 (Post-MVP)** | 📋 Planned | WebSocket + S5 + ECDH (this document) |

**Current Recommendation**: Skip to "Phase 1 Notes" section below if implementing for pre-MVP release.

---

## Phase 1 Notes (Current HTTP Approach)

**No host-side changes needed for Phase 1!**

The existing HTTP endpoint `/v1/embed` already handles embedding generation:
- **Endpoint**: `POST /v1/embed`
- **Input**: `{ texts: string[], model: "all-MiniLM-L6-v2", chainId: number }`
- **Output**: `{ embeddings: [{ embedding: number[], text: string }] }`

This works perfectly for pre-MVP deferred embeddings. The SDK handles downloading documents from S5 and sending full text to the host.

**See**: `docs/node-reference/API.md` lines 805-918 for existing endpoint documentation.

---

## Phase 2 Overview (Future - WebSocket Approach)

This guide describes the changes needed in `fabstir-llm-node` to support **WebSocket-based embedding generation** where the host downloads documents directly from S5 using CIDs provided by the SDK.

### Current Architecture (HTTP-based) ❌

```
SDK → [HTTP POST /v1/embed] → Host
      Payload: { texts: [...full document text...] }

Host generates embeddings → [HTTP Response] → SDK
      Response: { embeddings: [...all vectors...] }
```

**Problems**:
- SDK downloads documents from S5 (10KB-10MB)
- SDK sends full content to host via HTTP (double transfer)
- No streaming progress updates
- HTTP timeouts for large documents
- Inconsistent with LLM inference protocol (WebSocket)

### New Architecture (WebSocket-based) ✅

```
SDK → [WebSocket: generate_embeddings] → Host
      Payload: { documents: [{ cid: '0x...', documentId: '...', fileName: '...' }] }

Host downloads from S5 → Generates embeddings → Streams back

Host → [WebSocket: embedding_progress] → SDK (real-time updates)
Host → [WebSocket: embedding_chunk] → SDK (vectors streaming)
Host → [WebSocket: embedding_complete] → SDK (done)
```

**Benefits**:
- ✅ Host downloads documents directly from S5 (single transfer)
- ✅ SDK only sends CID (< 1KB vs 10MB)
- ✅ Real-time progress updates
- ✅ Streaming vectors (no timeout issues)
- ✅ Consistent with LLM inference protocol

---

## WebSocket Message Protocol

### 1. Request: `generate_embeddings` (SDK → Host)

**When**: User starts a chat session with pending documents

**Message Format**:
```typescript
{
  type: 'generate_embeddings',
  session_id: 'sess_abc123',           // Active session ID
  chain_id: 84532,                     // Base Sepolia testnet
  documents: [                         // Array of documents to process
    {
      cid: '0x7a6f8b9c2d4e1f3a5b7c8d9e...', // S5 CID (hex string)
      documentId: 'doc_xyz123',        // Unique document ID
      fileName: 'api-documentation.pdf' // Original filename
    },
    {
      cid: '0x2b3c4d5e6f7a8b9c0d1e2f3a...',
      documentId: 'doc_abc456',
      fileName: 'user-guide.md'
    }
  ],
  model: 'all-MiniLM-L6-v2',           // Embedding model
  chunk_size: 512,                      // Characters per chunk
  chunk_overlap: 50                     // Character overlap between chunks
}
```

**Expected Host Actions**:
1. Validate session_id and chain_id
2. For each document:
   - Download content from S5 using `cid`
   - Chunk the text (512 chars, 50 char overlap)
   - Generate embeddings using `all-MiniLM-L6-v2`
   - Stream vectors back to SDK
3. Send progress updates during processing
4. Send completion notification when done

---

### 2. Response: `embedding_progress` (Host → SDK)

**When**: Periodically during embedding generation (e.g., every 10 chunks)

**Message Format**:
```typescript
{
  type: 'embedding_progress',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz123',
  file_name: 'api-documentation.pdf',
  total_chunks: 120,                   // Total chunks for this document
  processed_chunks: 45,                // Chunks processed so far
  percentage: 37.5,                    // Progress percentage (0-100)
  status: 'processing'                 // 'processing' | 'complete' | 'failed'
}
```

**Frequency**: Send every 10 chunks or every 2 seconds (whichever comes first)

---

### 3. Response: `embedding_chunk` (Host → SDK)

**When**: After generating embeddings for each chunk or batch of chunks

**Message Format**:
```typescript
{
  type: 'embedding_chunk',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz123',
  chunk_index: 45,                     // Index of this chunk (0-based)
  vectors: [                           // Array of vectors (batch of 1-10 chunks)
    {
      id: 'vec_doc_xyz123_chunk_45',   // Unique vector ID
      embedding: [0.123, -0.456, 0.789, ...], // 384-dimensional vector
      text: 'The API authentication requires an OAuth2 token...', // Original chunk text
      metadata: {
        source: 'api-documentation.pdf',
        chunk: 45,
        documentId: 'doc_xyz123',
        totalChunks: 120
      }
    }
    // ... up to 10 vectors per message (batch streaming)
  ]
}
```

**Batching**: Send vectors in batches of 1-10 chunks to reduce WebSocket overhead

---

### 4. Response: `embedding_complete` (Host → SDK)

**When**: All chunks for a document have been processed

**Message Format**:
```typescript
{
  type: 'embedding_complete',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz123',
  total_vectors: 120,                  // Total vectors generated
  total_chunks: 120,                   // Total chunks processed
  model: 'all-MiniLM-L6-v2',           // Model used
  dimensions: 384,                     // Vector dimensions
  processing_time_ms: 15234            // Time taken (milliseconds)
}
```

---

### 5. Response: `embedding_error` (Host → SDK)

**When**: Document processing fails (S5 download, embedding generation, etc.)

**Message Format**:
```typescript
{
  type: 'embedding_error',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz123',
  error: 'Failed to download from S5: CID not found',
  error_code: 'S5_DOWNLOAD_FAILED',    // See error codes below
  retry_after: 5000                     // Optional: milliseconds to wait before retry
}
```

**Error Codes**:
- `S5_DOWNLOAD_FAILED` - Could not download document from S5
- `S5_CID_INVALID` - CID format is invalid
- `EMBEDDING_MODEL_ERROR` - Embedding model failed to generate vectors
- `CHUNK_TOO_LARGE` - Document chunk exceeds maximum size
- `OUT_OF_MEMORY` - Host ran out of memory during processing
- `TIMEOUT` - Processing took too long (> 10 minutes per document)
- `INVALID_DOCUMENT_FORMAT` - Document content is not valid text

---

## S5 Integration Requirements

### 1. Install S5 Client Library

The host needs an S5 client to download documents from the S5 network.

**Recommended**: Use the same S5.js library as the SDK for consistency

```bash
# In fabstir-llm-node repository
npm install @s5-dev/s5js
```

**Alternative**: Implement a minimal S5 HTTP client (if full library is too heavy)

### 2. S5 Download Implementation

**Method Signature**:
```typescript
async function downloadFromS5(cid: string): Promise<string>
```

**Example Implementation** (using S5.js):
```typescript
import { S5 } from '@s5-dev/s5js';

// Initialize S5 client (reuse across requests)
const s5 = new S5({
  userID: process.env.HOST_S5_USER_ID,        // Host's S5 user ID
  portalURL: process.env.S5_PORTAL_URL || 'https://s5.platformlessai.ai'
});

async function downloadFromS5(cid: string): Promise<string> {
  try {
    console.log(`[S5] Downloading document: ${cid}`);

    // S5 CID format: '0x7a6f8b9c2d4e1f3a5b7c8d9e...' (hex string)
    // Convert to S5 path format if needed
    const path = cidToPath(cid); // Implementation depends on S5 CID format

    // Download content
    const data = await s5.fs.get(path);

    // Decode to string (S5 returns raw bytes)
    const content = new TextDecoder().decode(data);

    console.log(`[S5] Downloaded ${content.length} bytes`);
    return content;

  } catch (error) {
    console.error(`[S5] Download failed:`, error);
    throw new Error(`S5_DOWNLOAD_FAILED: ${error.message}`);
  }
}

// Helper: Convert CID to S5 path
function cidToPath(cid: string): string {
  // Implementation depends on how SDK stores documents
  // Check with SDK developer for exact format
  // Example: CID might map to 'home/vector-databases/{dbName}/documents/{docId}.txt'

  // For now, assume CID IS the path
  return cid;
}
```

**Important**: Coordinate with SDK developer on exact CID format and S5 path structure.

### 3. S5 Configuration

**Environment Variables** (add to `.env`):
```bash
# S5 Configuration
S5_PORTAL_URL=https://s5.platformlessai.ai           # S5 portal endpoint
HOST_S5_USER_ID=your-host-user-id    # Host's S5 user ID (if needed)
S5_DOWNLOAD_TIMEOUT=30000             # Timeout for S5 downloads (milliseconds)
```

### 4. S5 Error Handling

**Common S5 Errors**:
- **CID not found**: Document doesn't exist on S5 network
- **Network timeout**: S5 portal unreachable or slow
- **Invalid CID format**: CID is malformed
- **Permission denied**: Host doesn't have access to document (if private)

**Error Handling Pattern**:
```typescript
try {
  const content = await downloadFromS5(cid);
  // Process content...
} catch (error) {
  if (error.message.includes('not found')) {
    sendErrorMessage(ws, sessionId, documentId, 'S5_CID_INVALID');
  } else if (error.message.includes('timeout')) {
    sendErrorMessage(ws, sessionId, documentId, 'S5_DOWNLOAD_FAILED');
  } else {
    sendErrorMessage(ws, sessionId, documentId, 'S5_DOWNLOAD_FAILED');
  }
}
```

---

## Implementation Steps

### Step 1: Add WebSocket Message Handler

**File**: `src/websocket/handlers.ts` (or equivalent)

```typescript
import { WebSocket } from 'ws';
import { generateEmbeddings } from '../embeddings/generator';
import { downloadFromS5 } from '../s5/client';

export async function handleGenerateEmbeddings(
  ws: WebSocket,
  message: GenerateEmbeddingsMessage
) {
  const { session_id, documents, model, chunk_size, chunk_overlap } = message;

  console.log(`[Embeddings] Processing ${documents.length} documents for session ${session_id}`);

  // Process each document
  for (const doc of documents) {
    try {
      // Step 1: Download document from S5
      const content = await downloadFromS5(doc.cid);

      // Step 2: Chunk the document
      const chunks = chunkText(content, chunk_size, chunk_overlap);
      const totalChunks = chunks.length;

      console.log(`[Embeddings] Document ${doc.fileName}: ${totalChunks} chunks`);

      // Step 3: Generate embeddings for each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];

        // Generate embedding (384D vector)
        const embedding = await generateEmbedding(chunk, model);

        // Create vector object
        const vector = {
          id: `vec_${doc.documentId}_chunk_${i}`,
          embedding,
          text: chunk,
          metadata: {
            source: doc.fileName,
            chunk: i,
            documentId: doc.documentId,
            totalChunks
          }
        };

        // Send vector chunk to SDK (batch of 1-10 vectors)
        sendEmbeddingChunk(ws, session_id, doc.documentId, i, [vector]);

        // Send progress update every 10 chunks
        if ((i + 1) % 10 === 0 || i === chunks.length - 1) {
          sendProgressUpdate(ws, session_id, doc.documentId, doc.fileName, totalChunks, i + 1);
        }
      }

      // Step 4: Send completion notification
      sendEmbeddingComplete(ws, session_id, doc.documentId, totalChunks, model);

    } catch (error) {
      console.error(`[Embeddings] Error processing ${doc.fileName}:`, error);

      // Send error notification
      sendEmbeddingError(ws, session_id, doc.documentId, error.message);
    }
  }
}

// Helper: Chunk text with overlap
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = start + chunkSize;
    chunks.push(text.slice(start, end));
    start = end - overlap; // Move back by overlap amount
  }

  return chunks;
}

// Helper: Send embedding chunk
function sendEmbeddingChunk(
  ws: WebSocket,
  sessionId: string,
  documentId: string,
  chunkIndex: number,
  vectors: any[]
) {
  ws.send(JSON.stringify({
    type: 'embedding_chunk',
    session_id: sessionId,
    document_id: documentId,
    chunk_index: chunkIndex,
    vectors
  }));
}

// Helper: Send progress update
function sendProgressUpdate(
  ws: WebSocket,
  sessionId: string,
  documentId: string,
  fileName: string,
  totalChunks: number,
  processedChunks: number
) {
  ws.send(JSON.stringify({
    type: 'embedding_progress',
    session_id: sessionId,
    document_id: documentId,
    file_name: fileName,
    total_chunks: totalChunks,
    processed_chunks: processedChunks,
    percentage: (processedChunks / totalChunks) * 100,
    status: processedChunks === totalChunks ? 'complete' : 'processing'
  }));
}

// Helper: Send completion notification
function sendEmbeddingComplete(
  ws: WebSocket,
  sessionId: string,
  documentId: string,
  totalVectors: number,
  model: string
) {
  ws.send(JSON.stringify({
    type: 'embedding_complete',
    session_id: sessionId,
    document_id: documentId,
    total_vectors: totalVectors,
    total_chunks: totalVectors,
    model,
    dimensions: 384,
    processing_time_ms: 0 // Track this if needed
  }));
}

// Helper: Send error notification
function sendEmbeddingError(
  ws: WebSocket,
  sessionId: string,
  documentId: string,
  errorMessage: string
) {
  const errorCode = errorMessage.includes('S5') ? 'S5_DOWNLOAD_FAILED' : 'EMBEDDING_MODEL_ERROR';

  ws.send(JSON.stringify({
    type: 'embedding_error',
    session_id: sessionId,
    document_id: documentId,
    error: errorMessage,
    error_code: errorCode
  }));
}
```

### Step 2: Register WebSocket Handler

**File**: `src/websocket/router.ts` (or equivalent)

```typescript
import { handleGenerateEmbeddings } from './handlers';

export function handleWebSocketMessage(ws: WebSocket, message: any) {
  const { type } = message;

  switch (type) {
    case 'session_init':
      handleSessionInit(ws, message);
      break;

    case 'prompt':
      handlePrompt(ws, message);
      break;

    case 'generate_embeddings': // NEW
      handleGenerateEmbeddings(ws, message);
      break;

    default:
      console.warn(`[WebSocket] Unknown message type: ${type}`);
  }
}
```

### Step 3: Update Embedding Generator

**File**: `src/embeddings/generator.ts` (or equivalent)

```typescript
import { pipeline } from '@xenova/transformers';

// Initialize embedding model (do this once on startup)
let embeddingModel: any = null;

export async function initializeEmbeddingModel() {
  console.log('[Embeddings] Loading all-MiniLM-L6-v2 model...');

  embeddingModel = await pipeline(
    'feature-extraction',
    'Xenova/all-MiniLM-L6-v2'
  );

  console.log('[Embeddings] Model loaded successfully');
}

// Generate embedding for a single text chunk
export async function generateEmbedding(
  text: string,
  model: string = 'all-MiniLM-L6-v2'
): Promise<number[]> {
  if (!embeddingModel) {
    throw new Error('Embedding model not initialized');
  }

  try {
    // Generate embedding (384 dimensions)
    const output = await embeddingModel(text, {
      pooling: 'mean',
      normalize: true
    });

    // Convert to plain array
    const embedding = Array.from(output.data);

    return embedding;

  } catch (error) {
    console.error('[Embeddings] Generation failed:', error);
    throw new Error(`EMBEDDING_MODEL_ERROR: ${error.message}`);
  }
}
```

### Step 4: Add S5 Client Module

**File**: `src/s5/client.ts` (new file)

```typescript
import { S5 } from '@s5-dev/s5js';

// Initialize S5 client
const s5 = new S5({
  portalURL: process.env.S5_PORTAL_URL || 'https://s5.platformlessai.ai'
});

export async function downloadFromS5(cid: string): Promise<string> {
  const timeout = parseInt(process.env.S5_DOWNLOAD_TIMEOUT || '30000');

  try {
    console.log(`[S5] Downloading: ${cid}`);

    // Download with timeout
    const data = await Promise.race([
      s5.fs.get(cid),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('S5 download timeout')), timeout)
      )
    ]);

    // Decode to string
    const content = new TextDecoder().decode(data as Uint8Array);

    console.log(`[S5] Downloaded ${content.length} bytes`);
    return content;

  } catch (error) {
    console.error(`[S5] Download failed:`, error);
    throw error;
  }
}
```

### Step 5: Initialize on Startup

**File**: `src/index.ts` (or equivalent)

```typescript
import { initializeEmbeddingModel } from './embeddings/generator';

async function startServer() {
  console.log('[Host] Starting fabstir-llm-node...');

  // Initialize embedding model (do this once at startup)
  await initializeEmbeddingModel();

  // Start WebSocket server
  startWebSocketServer();

  console.log('[Host] Server ready');
}

startServer().catch(console.error);
```

---

## Testing Guide

### Unit Tests

**File**: `tests/embeddings.test.ts`

```typescript
import { handleGenerateEmbeddings } from '../src/websocket/handlers';
import { downloadFromS5 } from '../src/s5/client';

describe('Embedding Generation', () => {
  it('should download document from S5', async () => {
    const cid = 'test-cid-123';
    const content = await downloadFromS5(cid);

    expect(content).toBeDefined();
    expect(typeof content).toBe('string');
  });

  it('should generate embeddings for text', async () => {
    const text = 'This is a test document';
    const embedding = await generateEmbedding(text);

    expect(embedding).toHaveLength(384); // 384 dimensions
    expect(embedding[0]).toBeCloseTo(0, 1); // Normalized values
  });

  it('should chunk text correctly', async () => {
    const text = 'A'.repeat(1000);
    const chunks = chunkText(text, 512, 50);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].length).toBe(512);
  });
});
```

### Integration Tests

**Manual Testing Steps**:

1. **Start fabstir-llm-node**:
   ```bash
   npm start
   ```

2. **Upload test document to S5** (via SDK):
   - Upload a small text file (1-2KB)
   - Note the S5 CID returned

3. **Send WebSocket message** (using wscat or Postman):
   ```bash
   wscat -c ws://localhost:8080/ws

   # Send session init
   > {"type":"session_init","session_id":"sess_test","chain_id":84532,"job_id":"1"}

   # Send embedding request
   > {"type":"generate_embeddings","session_id":"sess_test","chain_id":84532,"documents":[{"cid":"YOUR_S5_CID","documentId":"doc_test","fileName":"test.txt"}],"model":"all-MiniLM-L6-v2","chunk_size":512,"chunk_overlap":50}
   ```

4. **Verify responses**:
   - Should receive `embedding_progress` messages
   - Should receive `embedding_chunk` messages with vectors
   - Should receive `embedding_complete` message

5. **Check logs**:
   ```bash
   [S5] Downloading: YOUR_S5_CID
   [S5] Downloaded 1234 bytes
   [Embeddings] Document test.txt: 3 chunks
   [Embeddings] Processing chunk 0/3
   [Embeddings] Processing chunk 1/3
   [Embeddings] Processing chunk 2/3
   [Embeddings] Document test.txt complete: 3 vectors
   ```

### End-to-End Test (with SDK)

**Prerequisites**:
- fabstir-llm-node running
- UI5 running with deferred embeddings feature

**Test Flow**:
1. Upload document via UI5 (status: "Pending Embeddings")
2. Start chat session
3. Verify UI shows progress bar
4. Verify vectors appear in vector database
5. Verify document status changes to "Ready"
6. Verify semantic search works

---

## Performance Considerations

### 1. Batch Embedding Generation

**Optimization**: Generate embeddings in batches instead of one-by-one

```typescript
// Instead of:
for (const chunk of chunks) {
  const embedding = await generateEmbedding(chunk);
  sendEmbeddingChunk(ws, sessionId, documentId, i, [embedding]);
}

// Do:
const batchSize = 10;
for (let i = 0; i < chunks.length; i += batchSize) {
  const batch = chunks.slice(i, i + batchSize);
  const embeddings = await Promise.all(
    batch.map(chunk => generateEmbedding(chunk))
  );

  const vectors = embeddings.map((emb, idx) => ({
    id: `vec_${documentId}_chunk_${i + idx}`,
    embedding: emb,
    text: batch[idx],
    metadata: { /* ... */ }
  }));

  sendEmbeddingChunk(ws, sessionId, documentId, i, vectors);
}
```

**Performance Impact**: 5-10x faster for large documents

### 2. S5 Download Caching

**Optimization**: Cache downloaded documents to avoid re-downloading

```typescript
const s5Cache = new Map<string, string>();

async function downloadFromS5Cached(cid: string): Promise<string> {
  if (s5Cache.has(cid)) {
    console.log(`[S5] Cache hit: ${cid}`);
    return s5Cache.get(cid)!;
  }

  const content = await downloadFromS5(cid);
  s5Cache.set(cid, content);

  // Expire cache after 5 minutes
  setTimeout(() => s5Cache.delete(cid), 5 * 60 * 1000);

  return content;
}
```

**When to Use**: If documents might be re-processed (e.g., retry after failure)

### 3. Memory Management

**Issue**: Large documents + many concurrent sessions = high memory usage

**Solution**: Process documents sequentially per session, limit concurrent sessions

```typescript
const activeSessions = new Set<string>();
const MAX_CONCURRENT_SESSIONS = 5;

async function handleGenerateEmbeddings(ws: WebSocket, message: any) {
  const { session_id } = message;

  // Wait if too many active sessions
  while (activeSessions.size >= MAX_CONCURRENT_SESSIONS) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  activeSessions.add(session_id);

  try {
    // Process embeddings...
  } finally {
    activeSessions.delete(session_id);
  }
}
```

### 4. Progress Update Frequency

**Recommendation**: Send progress updates every 10 chunks OR every 2 seconds

```typescript
let lastProgressTime = Date.now();

for (let i = 0; i < chunks.length; i++) {
  // Generate embedding...

  const now = Date.now();
  const shouldSendProgress =
    (i + 1) % 10 === 0 ||              // Every 10 chunks
    i === chunks.length - 1 ||         // Last chunk
    (now - lastProgressTime) > 2000;   // Every 2 seconds

  if (shouldSendProgress) {
    sendProgressUpdate(/* ... */);
    lastProgressTime = now;
  }
}
```

---

## Error Handling Best Practices

### 1. S5 Download Failures

**Pattern**: Retry up to 3 times with exponential backoff

```typescript
async function downloadFromS5WithRetry(
  cid: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadFromS5(cid);
    } catch (error) {
      lastError = error;
      console.warn(`[S5] Download attempt ${attempt} failed:`, error);

      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
```

### 2. Embedding Model Failures

**Pattern**: Catch and report specific errors

```typescript
try {
  const embedding = await generateEmbedding(chunk);
} catch (error) {
  if (error.message.includes('out of memory')) {
    throw new Error('OUT_OF_MEMORY: Document too large');
  } else if (error.message.includes('timeout')) {
    throw new Error('TIMEOUT: Embedding generation took too long');
  } else {
    throw new Error(`EMBEDDING_MODEL_ERROR: ${error.message}`);
  }
}
```

### 3. WebSocket Connection Loss

**Pattern**: Detect disconnection and stop processing

```typescript
async function handleGenerateEmbeddings(ws: WebSocket, message: any) {
  let isConnected = true;

  ws.on('close', () => {
    isConnected = false;
    console.log('[WebSocket] Client disconnected, stopping processing');
  });

  for (const doc of documents) {
    if (!isConnected) {
      console.log('[WebSocket] Stopping due to disconnection');
      return; // Stop processing
    }

    // Process document...
  }
}
```

---

## Configuration Reference

**Environment Variables** (add to `.env`):

```bash
# S5 Configuration
S5_PORTAL_URL=https://s5.platformlessai.ai
S5_DOWNLOAD_TIMEOUT=30000              # 30 seconds

# Embedding Configuration
EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
EMBEDDING_BATCH_SIZE=10                # Vectors per WebSocket message
EMBEDDING_MAX_CHUNK_SIZE=2048          # Maximum characters per chunk
EMBEDDING_DEFAULT_CHUNK_SIZE=512       # Default characters per chunk
EMBEDDING_DEFAULT_OVERLAP=50           # Default character overlap

# Performance Tuning
MAX_CONCURRENT_EMBEDDING_SESSIONS=5    # Limit concurrent sessions
PROGRESS_UPDATE_INTERVAL=2000          # Milliseconds between progress updates
```

---

## Migration from HTTP Endpoint

### What to Keep

✅ **Keep existing `/v1/embed` HTTP endpoint** for backward compatibility
✅ **Keep embedding model** (`all-MiniLM-L6-v2`)
✅ **Keep chunking logic** (512 chars, 50 char overlap)

### What to Add

➕ **New**: WebSocket message handler for `generate_embeddings`
➕ **New**: S5 client integration
➕ **New**: Progress update messages
➕ **New**: Streaming vector responses

### What Changes

🔄 **Input**: From HTTP POST with text array → WebSocket message with CID array
🔄 **Download**: From SDK downloading → Host downloading from S5
🔄 **Output**: From single HTTP response → Streaming WebSocket messages

---

## Checklist for Node Developer

- [ ] Install S5 client library (`@s5-dev/s5js`)
- [ ] Implement `downloadFromS5(cid)` function
- [ ] Add WebSocket message handler for `generate_embeddings`
- [ ] Implement streaming responses:
  - [ ] `embedding_progress` messages
  - [ ] `embedding_chunk` messages
  - [ ] `embedding_complete` messages
  - [ ] `embedding_error` messages
- [ ] Add S5 error handling (CID not found, timeout, etc.)
- [ ] Test S5 download with real CID from SDK
- [ ] Test embedding generation end-to-end
- [ ] Implement batch processing (10 vectors per message)
- [ ] Add progress update throttling (every 10 chunks or 2 seconds)
- [ ] Test with large documents (> 1MB)
- [ ] Test with multiple concurrent sessions
- [ ] Update API documentation with new WebSocket protocol

---

## Timeline Estimate

| Task | Estimated Time |
|------|----------------|
| S5 client integration | 2-3 hours |
| WebSocket message handler | 2-3 hours |
| Streaming responses | 2-3 hours |
| Error handling | 1-2 hours |
| Testing | 2-3 hours |
| Documentation | 1 hour |

**Total**: 10-15 hours (1.5-2 days)

---

## Questions for SDK Developer

Before starting implementation, coordinate with SDK developer on:

1. **S5 CID Format**: What format are CIDs in? (hex string? base64?)
2. **S5 Path Structure**: What S5 path do documents use? (`home/vector-databases/...`?)
3. **Authentication**: Does host need S5 authentication to download public documents?
4. **Testing CIDs**: Can you provide test CIDs for development?
5. **Error Handling**: What should happen if CID is invalid or document not found?

---

## References

- **SDK Implementation Plan**: `/workspace/docs/IMPLEMENTATION_DEFERRED_EMBEDDINGS.md`
- **WebSocket Protocol**: Lines 544-748 (SessionManager.requestEmbeddings)
- **S5.js API**: `/workspace/docs/s5js-reference/API.md`
- **Current HTTP Endpoint**: `/workspace/docs/node-reference/API.md` lines 805-918

---

## Support

For questions or issues, contact:
- **SDK Developer**: [your-name] - fabstir-llm-sdk repository
- **Architecture Questions**: See IMPLEMENTATION_DEFERRED_EMBEDDINGS.md lines 35-96

---

**Document Version**: 1.0
**Last Updated**: 2025-11-17
**Status**: Ready for implementation
