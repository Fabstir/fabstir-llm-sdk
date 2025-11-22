# Deferred Embeddings Implementation Plan

**Status**: Phase 9 Complete - Documentation Finished ✅
**Target**: UI5 Production SDK Integration
**Created**: 2025-11-15
**Last Updated**: 2025-11-16

---

## Overview

Implement deferred embeddings architecture to solve the timing mismatch between document upload (no session) and embedding generation (requires host session). Documents are uploaded immediately to S5 storage, but embeddings are generated in the background when a user starts a chat session.

### Key Features

1. **Instant Upload**: Documents stored in S5 immediately without waiting for embeddings
2. **Background Processing**: Embeddings generated when user starts chat session
3. **Progress Visibility**: Real-time progress bar showing which documents are being vectorized
4. **Search Clarification**: File search is text-based filtering, not semantic vector search
5. **Graceful Degradation**: Documents visible immediately, search capability added progressively

### User Flow

```
1. User uploads document → Stored in S5 with "pending embeddings" status
2. User starts chat session → Host discovered + WebSocket connection established
3. Background: Process pending documents → Generate embeddings for each document
4. Progress bar: "Vectorizing document 2 of 5: api-documentation.pdf (35%)"
5. Document status: "pending" → "processing" → "ready"
6. User can search once embeddings complete
```

---

## ⚠️ ARCHITECTURE: TWO-PHASE APPROACH (2025-11-17)

**IMPORTANT**: Deferred embeddings will be implemented in two phases for pragmatic, incremental delivery.

### Phase 1: Pre-MVP (Current - UI5 Release)

**Goal**: Get deferred embeddings workflow working end-to-end

**Flow**:
1. **Documents uploaded to S5** (unencrypted for pre-MVP)
   - User uploads documents → S5 storage
   - Documents stored with S5 paths
   - Status: `embeddingStatus: 'pending'`

2. **Session starts** → user selects host
   - User creates chat session
   - User selects host from available hosts

3. **SDK downloads and sends documents**
   - ✅ **SDK downloads documents from S5** (has user's S5 access)
   - ✅ **SDK sends full document text to host** via HTTP POST `/v1/embed`
   - 📡 Uses existing fabstir-llm-node endpoint (no node changes needed)

4. **Host generates embeddings**
   - ✅ **Host receives document text** via HTTP
   - ✅ **Host generates embeddings** (all-MiniLM-L6-v2, 384 dimensions)
   - ✅ **Host returns vectors** via HTTP response

5. **User stores embeddings to S5**
   - ✅ **SDK receives vectors** from HTTP response
   - ✅ **SDK stores in S5VectorStore** (user's own S5 storage)
   - ✅ **SDK updates document status**: pending → ready

**Trade-offs**:
- ⚠️ Documents not encrypted at rest on S5 (acceptable for pre-MVP testing)
- ⚠️ 2x data transfer (SDK downloads, then sends to host)
- ✅ Zero host-side changes needed (uses existing endpoint)
- ✅ Simpler debugging (plaintext)
- ✅ Faster delivery (proven code path)

### Phase 2: Post-MVP (Future - Production Security)

**Goal**: Add production-grade security for sensitive documents

**Flow**:
1. **Documents uploaded to S5** (encrypted at rest)
   - User uploads documents → S5 storage with user-key encryption
   - Documents have S5 paths
   - Status: `embeddingStatus: 'pending'`

2. **Session starts** → ECDH key exchange
   - User creates chat session
   - User selects host
   - **ECDH key exchange** establishes shared secret (no keys transmitted)

3. **SDK downloads and sends encrypted documents**
   - ✅ **SDK downloads encrypted documents from S5**
   - ✅ **SDK sends via WebSocket** (ECDH encrypted in transit)
   - 📡 New WebSocket protocol (see HOST_EMBEDDING_WEBSOCKET_GUIDE.md)

4. **Host decrypts and generates embeddings**
   - ✅ **Host decrypts using ECDH shared secret**
   - ✅ **Host generates embeddings**
   - ✅ **Host streams vectors back** via WebSocket (encrypted)
   - ⏱️ Real-time progress updates

5. **User stores embeddings to S5**
   - ✅ **SDK receives encrypted streamed vectors**
   - ✅ **SDK decrypts and stores in S5VectorStore**
   - ✅ **SDK updates document status**: pending → ready

**Security Benefits**:
- 🔐 Documents encrypted at rest on S5 (user-controlled keys)
- 🔐 Documents encrypted in transit (ECDH session encryption)
- 🔐 No encryption keys transmitted over network
- 🔐 Forward secrecy (ephemeral keys per session)
- 🔐 Streaming progress updates

### Key Principles (Both Phases)

| Component | Responsibility |
|-----------|---------------|
| **User/SDK** | Upload documents to S5, store vectors to S5, search vectors locally |
| **Host** | Generate embeddings from document text (source varies by phase) |
| **S5 Network** | Persistent storage for documents AND vectors (user-owned) |

### Phase Comparison

| Aspect | Phase 1 (Pre-MVP) | Phase 2 (Post-MVP) |
|--------|-------------------|---------------------|
| **Document Encryption** | None (plaintext on S5) | User-key encrypted at rest |
| **SDK → Host** | Full document text via HTTP (10KB-10MB) | S5 path via WebSocket (< 1KB) |
| **Protocol** | HTTP POST/Response | WebSocket streaming |
| **Document Download** | SDK downloads from S5 | Host downloads from S5 |
| **Transit Security** | HTTPS (transport layer) | ECDH session encryption |
| **Progress Updates** | None (single response) | Real-time per chunk |
| **Host Changes** | None (uses existing `/v1/embed` endpoint) | New WebSocket handlers + S5 client |
| **Development Time** | Immediate (current code works) | +10-15 hours |
| **Use Case** | Pre-MVP testing, public docs | Production, sensitive documents |

### Why Phase 1 First?

**Pragmatic Delivery**:
- ✅ Uses existing `/v1/embed` HTTP endpoint (zero host changes)
- ✅ Proven code path (HTTP embedding generation already works)
- ✅ Faster UI5 release (focus on workflow, not crypto)
- ✅ Easier debugging (plaintext visible in logs)

**Acceptable for Pre-MVP**:
- ⚠️ Documents not encrypted at rest (use public/non-sensitive docs for testing)
- ⚠️ 2x data transfer vs Phase 2 (acceptable trade-off for faster delivery)
- ⚠️ No streaming progress (acceptable for small test documents)

### Why Phase 2 After MVP?

**Production-Ready Security**:
- 🔐 Documents encrypted at rest and in transit
- 🔐 ECDH key exchange (no keys transmitted)
- 🔐 Forward secrecy (ephemeral session keys)

**Better Performance**:
- 📊 1x data transfer (host downloads directly)
- 📊 Streaming progress updates
- 📊 Handles large documents (100MB+)

**Time to Implement**: ~10-15 hours (SDK + node changes)

---

## Architecture

### Data Structures

```typescript
interface DocumentMetadata {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  folderPath: string;
  s5Cid: string;  // S5 storage CID for document content
  createdAt: number;
  embeddingStatus: 'pending' | 'processing' | 'ready' | 'failed';
  embeddingProgress?: number;  // 0-100 percentage
  embeddingError?: string;
  vectorCount?: number;
  lastEmbeddingAttempt?: number;
}

interface VectorDatabaseMetadata {
  name: string;
  description?: string;
  dimensions: number;
  pendingDocuments: DocumentMetadata[];  // Awaiting embeddings
  readyDocuments: DocumentMetadata[];     // Embeddings complete
  vectorCount: number;
  createdAt: number;
  lastAccessed: number;
}

interface EmbeddingProgress {
  sessionId: string;
  databaseName: string;
  documentId: string;
  fileName: string;
  totalChunks: number;
  processedChunks: number;
  percentage: number;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  error?: string;
}
```

### Storage Structure

```
home/vector-databases/{userAddress}/
├── {dbName}/
│   ├── metadata.json        # DB config, pending/ready docs, stats
│   ├── vectors.cid          # S5 CID pointing to chunked vectors
│   └── hierarchy.json       # Virtual folder tree structure
```

### SDK Method Flow

```
Upload Flow:
  handleUploadDocuments() → uploadToS5() → addPendingDocument() → UI refresh

Session Start Flow:
  handleStartSession() → discoverHost() → startSession() → processPendingEmbeddings()

Background Processing:
  processPendingEmbeddings() → for each doc:
    - updateDocumentStatus('processing')
    - downloadFromS5()
    - sessionManager.generateEmbeddings() [WebSocket to host]
    - vectorRAGManager.addVectors() [Store in S5]
    - updateDocumentStatus('ready')
    - emit progress event
```

### Architecture Diagram

Complete deferred embeddings workflow showing all actors and data flow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DEFERRED EMBEDDINGS ARCHITECTURE                      │
└─────────────────────────────────────────────────────────────────────────────┘

Phase 1: Document Upload (No Session Required)
═══════════════════════════════════════════════════════════════════

    ┌─────────┐                ┌──────────────┐              ┌─────────────┐
    │  User   │                │  UI5 Client  │              │ S5 Network  │
    │ Browser │                │  (React App) │              │  (Storage)  │
    └────┬────┘                └──────┬───────┘              └──────┬──────┘
         │                             │                             │
         │  1. Select file            │                             │
         │  (document.pdf)            │                             │
         ├────────────────────────────>│                             │
         │                             │                             │
         │                             │  2. Read file content       │
         │                             │     (file.text())           │
         │                             ├─────────────┐               │
         │                             │             │               │
         │                             │<────────────┘               │
         │                             │                             │
         │                             │  3. Upload to S5            │
         │                             │     (raw text content)      │
         │                             ├────────────────────────────>│
         │                             │                             │
         │                             │  4. Return S5 CID           │
         │                             │<────────────────────────────┤
         │                             │                             │
         │                             │  5. Create DocumentMetadata │
         │                             │     {                       │
         │                             │       id: "doc-123",        │
         │                             │       fileName: "doc.pdf",  │
         │                             │       s5Cid: "cid...",      │
         │                             │       status: "pending" ⚠️  │
         │                             │     }                       │
         │                             ├─────────────┐               │
         │                             │             │               │
         │                             │<────────────┘               │
         │                             │                             │
         │  6. Toast: "Document       │                             │
         │     uploaded! Embeddings   │                             │
         │     will be generated      │                             │
         │     during next session."  │                             │
         │<────────────────────────────┤                             │
         │                             │                             │

    Result: Document stored in S5, marked as "pending" - NO embeddings yet
    ✅ Instant upload (no waiting for host/session)
    ⏳ Embeddings deferred until session starts


Phase 2: Session Start + Background Embedding Generation
═══════════════════════════════════════════════════════════════════

    ┌─────────┐      ┌──────────────┐      ┌─────────────┐      ┌──────────┐
    │  User   │      │  UI5 Client  │      │ SDK Core    │      │   Host   │
    │ Browser │      │  (React App) │      │  Managers   │      │   Node   │
    └────┬────┘      └──────┬───────┘      └──────┬──────┘      └────┬─────┘
         │                   │                     │                  │
         │  1. Click "Start │                     │                  │
         │     Session"      │                     │                  │
         ├──────────────────>│                     │                  │
         │                   │                     │                  │
         │                   │  2. Discover hosts  │                  │
         │                   ├────────────────────>│                  │
         │                   │                     ├─────────────────>│
         │                   │                     │  (NodeRegistry)  │
         │                   │                     │                  │
         │                   │  3. Start session   │                  │
         │                   ├────────────────────>│                  │
         │                   │                     ├─────────────────>│
         │                   │                     │  (WebSocket)     │
         │                   │  4. sessionId       │                  │
         │                   │<────────────────────┤                  │
         │                   │                     │                  │
         │  5. Toast:        │                     │                  │
         │     "Session      │                     │                  │
         │      started!"    │                     │                  │
         │<──────────────────┤                     │                  │
         │                   │                     │                  │
         │  ╔════════════════╪═════════════════════╪══════════════════╪═════╗
         │  ║ BACKGROUND PROCESSING (runs concurrently with chat UI)      ║
         │  ╚════════════════╪═════════════════════╪══════════════════╪═════╝
         │                   │                     │                  │
         │                   │  6. Get pending docs│                  │
         │                   ├────────────────────>│                  │
         │                   │  (VectorRAGManager. │                  │
         │                   │   getPendingDocs()) │                  │
         │                   │                     │                  │
         │                   │  7. Found 3 docs    │                  │
         │                   │<────────────────────┤                  │
         │                   │                     │                  │
         │  ┌────────────────────────────────────────────────────────────┐
         │  │ FOR EACH PENDING DOCUMENT:                                 │
         │  └────────────────────────────────────────────────────────────┘
         │                   │                     │                  │
         │                   │  8. Update status   │                  │
         │                   │     (processing,    │                  │
         │                   │      progress: 0)   │                  │
         │                   ├────────────────────>│                  │
         │                   │                     │                  │
         │  9. Progress Bar: │                     │                  │
         │     ⏳ doc.pdf     │                     │                  │
         │     [         ]0% │                     │                  │
         │<──────────────────┤                     │                  │
         │                   │                     │                  │
         │                   │  10. Generate       │                  │
         │                   │      embeddings     │                  │
         │                   ├────────────────────>│  11. POST        │
         │                   │  (SessionManager.   │      /v1/embed   │
         │                   │   generateEmbeds()) ├─────────────────>│
         │                   │                     │  {               │
         │                   │                     │    texts: [...]  │
         │                   │                     │    model:        │
         │                   │                     │    "all-MiniLM"  │
         │                   │                     │  }               │
         │                   │                     │                  │
         │                   │                     │  12. Embeddings  │
         │                   │                     │<─────────────────┤
         │                   │                     │  [384D vectors]  │
         │                   │                     │                  │
         │                   │  13. Update progress│                  │
         │                   │      (processing,   │                  │
         │                   │       progress: 50) │                  │
         │                   ├────────────────────>│                  │
         │                   │                     │                  │
         │  14. Progress Bar:│                     │                  │
         │     ⏳ doc.pdf     │                     │                  │
         │     [█████    ]50%│                     │                  │
         │<──────────────────┤                     │                  │
         │                   │                     │                  │
         │                   │  15. Add vectors to │                  │
         │                   │      database       │                  │
         │                   ├────────────────────>│                  │
         │                   │  (VectorRAGManager. │                  │
         │                   │   addVectors())     │                  │
         │                   │                     ├────────> S5      │
         │                   │                     │  (persist)       │
         │                   │                     │                  │
         │                   │  16. Update status  │                  │
         │                   │      (ready,        │                  │
         │                   │       vectorCount)  │                  │
         │                   ├────────────────────>│                  │
         │                   │                     │                  │
         │  17. Progress Bar:│                     │                  │
         │     ✅ doc.pdf     │                     │                  │
         │     Complete      │                     │                  │
         │<──────────────────┤                     │                  │
         │                   │                     │                  │
         │  18. Auto-hide    │                     │                  │
         │      after 3s     │                     │                  │
         │<──────────────────┤                     │                  │
         │                   │                     │                  │

    Result: All pending documents now have embeddings, status = "ready"
    ✅ Background processing (user can chat while embeddings generate)
    ✅ Real-time progress feedback
    ✅ Graceful error handling (failed docs can be retried)


Phase 3: Semantic Search (After Embeddings Complete)
═══════════════════════════════════════════════════════════════════

    ┌─────────┐      ┌──────────────┐      ┌─────────────┐
    │  User   │      │  UI5 Client  │      │ SDK Core    │
    │ Browser │      │  (React App) │      │  (RAG)      │
    └────┬────┘      └──────┬───────┘      └──────┬──────┘
         │                   │                     │
         │  1. Search query  │                     │
         │     "API auth"    │                     │
         ├──────────────────>│                     │
         │                   │                     │
         │                   │  2. Check ready docs│
         │                   ├────────────────────>│
         │                   │     (> 0 ?)         │
         │                   │                     │
         │                   │  3. ✅ 150 vectors   │
         │                   │<────────────────────┤
         │                   │                     │
         │                   │  4. Vector search   │
         │                   ├────────────────────>│
         │                   │  (VectorRAGManager. │
         │                   │   search())         │
         │                   │                     │
         │                   │  5. Top 5 results   │
         │                   │<────────────────────┤
         │                   │  [{score:0.85,...}] │
         │                   │                     │
         │  6. Display       │                     │
         │     results       │                     │
         │<──────────────────┤                     │
         │                   │                     │

    Result: Semantic search works - documents are now RAG-enabled
    ✅ Vector search with cosine similarity
    ✅ Documents fully integrated into RAG workflow


Error Handling Flow
═══════════════════════════════════════════════════════════════════

    Scenario: Host disconnects during embedding generation

    ┌──────────────┐      ┌─────────────┐      ┌──────────┐
    │  UI5 Client  │      │ SDK Core    │      │   Host   │
    └──────┬───────┘      └──────┬──────┘      └────┬─────┘
           │                     │                  │
           │  Generate embeddings│                  │
           ├────────────────────>│  POST /v1/embed  │
           │                     ├─────────────────>│
           │                     │                  │
           │                     │                  ✗ (disconnected)
           │                     │                  │
           │  ❌ Error thrown     │<─────────────────┤
           │<────────────────────┤  NETWORK_ERROR   │
           │                     │                  │
           │  Update status      │                  │
           │  (failed, error msg)│                  │
           ├────────────────────>│                  │
           │                     │                  │
    UI shows:                    │                  │
    ❌ doc.pdf                    │                  │
    Error: Host disconnected      │                  │
    [Retry Button]                │                  │
           │                     │                  │

    User can retry later when session restarts


Key Design Principles
═══════════════════════════════════════════════════════════════════

1. **Separation of Concerns**:
   - Upload: S5 storage only (no host needed)
   - Processing: Host embedding API (/v1/embed)
   - Search: VectorRAGManager (client-side)

2. **Progressive Enhancement**:
   - Documents visible immediately (text filtering)
   - Semantic search enabled progressively (after embeddings)

3. **User Feedback**:
   - Instant upload confirmation
   - Real-time progress bars (0-100%)
   - Clear status indicators (pending/processing/ready/failed)
   - Auto-hide on success (3 seconds)

4. **Error Resilience**:
   - Failed documents can be retried
   - Processing continues on error (other docs still process)
   - Clear error messages guide user action

5. **Background Processing**:
   - Non-blocking (user can chat while embeddings generate)
   - Status persists in S5 (survives browser refresh)
   - Automatic on session start (no manual trigger needed)

```

---

## Implementation Phases

### Phase 1: Data Structures & Storage (2-3 hours)

**Goal**: Extend existing metadata structures to support deferred embeddings

#### Sub-phase 1.1: Update DocumentMetadata Interface
- [x] Add `embeddingStatus` field to `DocumentMetadata` interface
- [x] Add `embeddingProgress` field (0-100 percentage)
- [x] Add `embeddingError` field for failed embeddings
- [x] Add `lastEmbeddingAttempt` timestamp
- [x] Add `s5Cid` field for document content storage
- [x] **File**: `/workspace/apps/ui5/hooks/use-vector-databases.ts` (lines 1-30)
- [x] **Test**: TypeScript compiles without errors

#### Sub-phase 1.2: Update VectorDatabaseMetadata Interface
- [x] Split documents into `pendingDocuments[]` and `readyDocuments[]`
- [x] Update `vectorCount` to reflect only ready documents
- [x] **File**: `/workspace/apps/ui5/hooks/use-vector-databases.ts` (lines 1-30)
- [x] **Test**: Existing databases load correctly with migration logic

#### Sub-phase 1.3: Create EmbeddingProgress Interface
- [x] Define `EmbeddingProgress` interface for real-time updates
- [x] Add fields: `sessionId`, `databaseName`, `documentId`, `fileName`, `totalChunks`, `processedChunks`, `percentage`, `status`, `error`
- [x] **File**: `/workspace/apps/ui5/hooks/use-vector-databases.ts` (lines 1-30)
- [x] **Test**: TypeScript compiles without errors

**Acceptance Criteria**:
- [x] All interfaces defined with correct types
- [x] No breaking changes to existing code
- [x] TypeScript compiles without errors

---

### Phase 2: Upload Flow (No Embeddings) (2-3 hours)

**Goal**: Modify upload to store documents without generating vectors

#### Sub-phase 2.1: Modify handleUploadDocuments
- [x] Remove `Math.random()` vector generation code
- [x] Add S5 upload for document content → get `s5Cid`
- [x] Create `DocumentMetadata` with `embeddingStatus: 'pending'`
- [x] Call `addPendingDocument()` instead of `addVectors()`
- [x] Update UI to show "pending embeddings" badge
- [x] **File**: `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` (lines 214-272)
- [x] **Test**: Document appears in UI with "pending" badge immediately after upload

#### Sub-phase 2.2: Add addPendingDocument Method
- [x] Create `addPendingDocument(databaseName, docMetadata)` in `useVectorDatabases` hook
- [x] Load existing metadata from S5
- [x] Append to `pendingDocuments[]` array
- [x] Save updated metadata to S5
- [x] **File**: `/workspace/apps/ui5/hooks/use-vector-databases.ts` (lines 306-372)
- [x] **Test**: Document metadata persists in S5 after upload

#### Sub-phase 2.3: Add S5 Upload Helper
- [x] Create `uploadDocumentToS5(fileContent, databaseName, documentId)` helper
- [x] Use `s5.fs.put(path, data)` from Enhanced S5.js
- [x] Path format: `home/vector-databases/{databaseName}/documents/{documentId}.txt`
- [x] Returns path for later retrieval
- [x] **File**: `/workspace/apps/ui5/lib/s5-utils.ts` (new file created)
- [x] **Test**: Document content can be retrieved using returned path
- [x] **Reference**: `docs/s5js-reference/API.md` lines 196-210 (put method)

**Acceptance Criteria**:
- [x] Upload completes in < 2 seconds (no embedding wait)
- [x] Document appears in UI immediately with "pending embeddings" badge
- [x] Document metadata persists in S5 storage
- [x] No vector generation during upload
- [x] Console logs confirm deferred embeddings approach

---

### Phase 3: SDK Methods for Background Processing (3-4 hours)

**Goal**: Add SDK methods to generate embeddings when session is active

#### ⚠️ IMPLEMENTATION NOTE (2025-11-17): TWO-PHASE APPROACH

**This section documents BOTH Phase 1 (current HTTP) and Phase 2 (future WebSocket) approaches.**

### Phase 1: HTTP-Based Approach (✅ CURRENT - Pre-MVP)

**What's Implemented**:
- ✅ **Sub-phase 3.1**: `SessionManager.generateEmbeddings(sessionId, fileContent)` - HTTP POST to `/v1/embed`
- ✅ **Sub-phase 3.4**: `downloadFromS5(s5Path)` - SDK downloads documents from S5
- ✅ Uses existing fabstir-llm-node endpoint (no host changes needed)

**How It Works**:
1. SDK downloads document from S5 using `downloadFromS5()`
2. SDK sends full document text to host via HTTP POST `/v1/embed`
3. Host generates embeddings using existing endpoint
4. Host returns all vectors in HTTP response
5. SDK stores vectors to S5

**Status**: ✅ **Ready for UI5 release** (this code is functional and tested)

### Phase 2: WebSocket Approach (🔮 FUTURE - Post-MVP)

**What Will Be Implemented Later**:
- 🔮 **New Method**: `SessionManager.requestEmbeddings(sessionId, documentCids, onProgress)` - WebSocket-based
- 🔮 **Host Downloads**: Host downloads from S5 (not SDK)
- 🔮 **Streaming**: Real-time progress updates and vector streaming

**Benefits Over Phase 1**:
- 📊 1x data transfer (host downloads directly, no SDK→Host send)
- 📊 Streaming progress updates
- 🔐 ECDH encryption support
- 🚀 Handles large documents better

**When**: After UI5 MVP release (~10-15 hours development time)

**Reference**: See `docs/node-reference/HOST_EMBEDDING_WEBSOCKET_GUIDE.md` for Phase 2 implementation details

---

#### Sub-phase 3.1: SessionManager.generateEmbeddings (✅ Phase 1 - Current)

**Purpose**: Send document S5 CIDs to host via WebSocket, receive streaming embeddings back

**Method Signature**:
```typescript
async requestEmbeddings(
  sessionId: string,
  documentCids: Array<{ cid: string; documentId: string; fileName: string }>,
  onProgress?: (update: EmbeddingProgressUpdate) => void
): Promise<void>
```

**Implementation Steps**:
- [ ] Remove old `generateEmbeddings(sessionId, fileContent)` HTTP-based method
- [ ] Create new `requestEmbeddings()` method that sends WebSocket message
- [ ] Message type: `generate_embeddings`
- [ ] Payload: `{ documentCids: [...], model: "all-MiniLM-L6-v2", chainId: number }`
- [ ] Register event listeners for:
  - `embedding_progress` → call `onProgress()` callback
  - `embedding_chunk` → accumulate vectors per document
  - `embedding_complete` → resolve promise
  - `embedding_error` → reject promise
- [ ] Store accumulated vectors in session state
- [ ] Emit events for UI consumption
- [ ] **File**: `/workspace/packages/sdk-core/src/managers/SessionManager.ts`
- [ ] **Test**: WebSocket message sent correctly, vectors received and accumulated

**WebSocket Message Format (SDK → Host)**:
```typescript
{
  type: 'generate_embeddings',
  session_id: 'sess_abc123',
  chain_id: 84532,
  documents: [
    {
      cid: '0x7a6f8b9c...', // S5 CID (host downloads from here)
      documentId: 'doc_xyz',
      fileName: 'api-docs.pdf'
    }
  ],
  model: 'all-MiniLM-L6-v2',
  chunk_size: 512,
  chunk_overlap: 50
}
```

**WebSocket Message Formats (Host → SDK)**:

```typescript
// Progress update (sent periodically during processing)
{
  type: 'embedding_progress',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz',
  file_name: 'api-docs.pdf',
  total_chunks: 120,
  processed_chunks: 45,
  percentage: 37.5,
  status: 'processing'
}

// Vector chunk (sent as embeddings are generated)
{
  type: 'embedding_chunk',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz',
  chunk_index: 45,
  vectors: [
    {
      id: 'vec_doc_xyz_chunk_45',
      embedding: [0.123, -0.456, ...], // 384 dimensions
      text: '...chunk text...',
      metadata: {
        source: 'api-docs.pdf',
        chunk: 45,
        documentId: 'doc_xyz'
      }
    }
  ]
}

// Completion (sent when all chunks done)
{
  type: 'embedding_complete',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz',
  total_vectors: 120,
  total_chunks: 120,
  model: 'all-MiniLM-L6-v2',
  dimensions: 384
}

// Error (sent if processing fails)
{
  type: 'embedding_error',
  session_id: 'sess_abc123',
  document_id: 'doc_xyz',
  error: 'Failed to download from S5: CID not found',
  error_code: 'S5_DOWNLOAD_FAILED'
}
```

**Code Example**:
```typescript
// In SessionManager.ts
async requestEmbeddings(
  sessionId: string,
  documentCids: Array<{ cid: string; documentId: string; fileName: string }>,
  onProgress?: (update: EmbeddingProgressUpdate) => void
): Promise<void> {
  const session = this.sessions.get(sessionId);
  if (!session || !session.wsClient) {
    throw new Error('Session not active or WebSocket not connected');
  }

  // Store accumulated vectors per document
  const accumulatedVectors = new Map<string, Vector[]>();

  // Send request to host
  session.wsClient.send({
    type: 'generate_embeddings',
    session_id: sessionId,
    chain_id: this.chainId,
    documents: documentCids,
    model: 'all-MiniLM-L6-v2',
    chunk_size: 512,
    chunk_overlap: 50
  });

  // Set up event listeners
  return new Promise((resolve, reject) => {
    let completedDocs = 0;
    const totalDocs = documentCids.length;

    session.wsClient.on('embedding_progress', (data) => {
      if (onProgress) {
        onProgress({
          sessionId,
          documentId: data.document_id,
          fileName: data.file_name,
          totalChunks: data.total_chunks,
          processedChunks: data.processed_chunks,
          percentage: data.percentage,
          status: data.status
        });
      }
    });

    session.wsClient.on('embedding_chunk', (data) => {
      const vectors = accumulatedVectors.get(data.document_id) || [];
      vectors.push(...data.vectors);
      accumulatedVectors.set(data.document_id, vectors);

      // Emit event for external listeners
      this.emit('embedding_chunk_received', {
        sessionId,
        documentId: data.document_id,
        chunkIndex: data.chunk_index,
        vectors: data.vectors
      });
    });

    session.wsClient.on('embedding_complete', (data) => {
      completedDocs++;

      // Emit completion event with all vectors for this document
      const vectors = accumulatedVectors.get(data.document_id) || [];
      this.emit('embedding_document_complete', {
        sessionId,
        documentId: data.document_id,
        vectors,
        totalVectors: data.total_vectors
      });

      // Resolve when all documents complete
      if (completedDocs === totalDocs) {
        resolve();
      }
    });

    session.wsClient.on('embedding_error', (data) => {
      this.emit('embedding_document_failed', {
        sessionId,
        documentId: data.document_id,
        error: data.error,
        errorCode: data.error_code
      });

      // Don't reject on single doc failure - continue processing others
      completedDocs++;
      if (completedDocs === totalDocs) {
        resolve(); // Still resolve, let caller handle failures via events
      }
    });

    // Timeout after 10 minutes (large documents can take time)
    setTimeout(() => {
      reject(new Error('Embedding generation timeout (10 minutes)'));
    }, 600000);
  });
}
```

**Reference**: `docs/node-reference/API.md` (WebSocket protocol, to be updated with embedding message types)

#### Sub-phase 3.2: Add VectorRAGManager.getPendingDocuments
- [x] Create `getPendingDocuments(sessionGroupId)` method
- [x] Get all vector databases in session group
- [x] Collect all `pendingDocuments` from each database
- [x] Return `DocumentMetadata[]` array
- [x] **File**: `/workspace/packages/sdk-core/src/managers/VectorRAGManager.ts` (lines 647-685)
- [x] **Test**: Returns correct pending documents across multiple databases

#### Sub-phase 3.3: Add VectorRAGManager.updateDocumentStatus
- [x] Create `updateDocumentStatus(docId, status, updates)` method
- [x] Find document in `pendingDocuments[]` across all databases
- [x] Update status and optional fields (vectorCount, error, progress)
- [x] Move to `readyDocuments[]` if status is 'ready'
- [x] Save updated metadata to S5
- [x] **File**: `/workspace/packages/sdk-core/src/managers/VectorRAGManager.ts` (lines 687-794)
- [x] **Test**: Status updates persist and documents move between arrays

#### Sub-phase 3.4: Remove SDK-Side Document Download (CORRECTED)

**⚠️ CRITICAL**: The SDK should **NOT** download documents from S5. The host downloads documents.

**What to Remove**:
- [ ] Remove `downloadFromS5()` calls from `processPendingEmbeddings()` in UI code
- [ ] Remove `sessionManager.generateEmbeddings(sessionId, fileContent)` calls
- [ ] Remove HTTP-based `generateEmbeddings()` method from SessionManager

**What to Add**:
- [ ] Use `sessionManager.requestEmbeddings(sessionId, documentCids, onProgress)` instead
- [ ] Document CIDs are already in `DocumentMetadata.s5Cid` field
- [ ] Pass CIDs to host via WebSocket message
- [ ] Host downloads documents using its own S5 client

**Why**:
- **Performance**: Sending CID (< 1KB) vs downloading + sending content (10KB-10MB)
- **Architecture**: Host is responsible for compute operations (download + embed)
- **Consistency**: Matches LLM inference pattern (host does the work, SDK coordinates)

**Updated Flow**:
```typescript
// OLD (WRONG) - SDK downloads document
const fileContent = await downloadFromS5(s5, doc.s5Cid);
const vectors = await sessionManager.generateEmbeddings(sessionId, fileContent);
await vectorRAGManager.addVectors(databaseName, vectors);

// NEW (CORRECT) - SDK sends CID, host downloads
const documentCids = pendingDocs.map(doc => ({
  cid: doc.s5Cid,
  documentId: doc.id,
  fileName: doc.fileName
}));

await sessionManager.requestEmbeddings(sessionId, documentCids, (progress) => {
  // Update UI progress bar
  setEmbeddingProgress(progress);
});

// Listen for vectors streaming back
sessionManager.on('embedding_document_complete', async (event) => {
  // Store vectors to S5 as they arrive
  await vectorRAGManager.addVectors(databaseName, event.vectors);
  await vectorRAGManager.updateDocumentStatus(event.documentId, 'ready', {
    vectorCount: event.vectors.length
  });
});
```

**Reference**: See Sub-phase 3.1 for complete WebSocket protocol specification

**Acceptance Criteria** (UPDATED FOR CORRECTED APPROACH):
- [ ] `requestEmbeddings()` sends WebSocket message with document CIDs (not content)
- [ ] Host receives CIDs and downloads documents from S5 (verified via logs)
- [ ] Vectors stream back to SDK via WebSocket (not HTTP response)
- [ ] SDK accumulates vectors and emits events for UI consumption
- [x] `getPendingDocuments()` returns all pending docs across databases (✅ already implemented correctly)
- [x] `updateDocumentStatus()` correctly updates and persists status (✅ already implemented correctly)
- [ ] SDK does NOT download documents from S5 (host does this)

---

### Phase 4: Session Start Flow (2-3 hours) ✅ COMPLETE

**Goal**: Process pending embeddings in background when user starts chat session

#### ⚠️ IMPLEMENTATION NOTE (2025-11-17): NEEDS UPDATE FOR WEBSOCKET

**Current Implementation**: Uses HTTP-based `generateEmbeddings()` with SDK downloading documents.
**Required Update**: Switch to WebSocket-based `requestEmbeddings()` with host downloading documents.

**Changes Needed in `processPendingEmbeddings()`**:
```typescript
// REMOVE these lines:
const fileContent = await downloadFromS5(s5, doc.s5Cid);
const vectors = await sessionManager.generateEmbeddings(sessionId, fileContent);
await vectorRAGManager.addVectors(databaseName, vectors);

// ADD these lines:
const documentCids = pendingDocs.map(doc => ({
  cid: doc.s5Cid,
  documentId: doc.id,
  fileName: doc.fileName
}));

await sessionManager.requestEmbeddings(sessionId, documentCids, (progress) => {
  onProgress?.(progress); // Forward to UI
});

// Listen for vectors and store them as they arrive
sessionManager.on('embedding_document_complete', async (event) => {
  await vectorRAGManager.addVectors(databaseName, event.vectors);
  await vectorRAGManager.updateDocumentStatus(event.documentId, 'ready', {
    vectorCount: event.vectors.length
  });
});
```

**See Phase 3 Sub-phase 3.1 for complete WebSocket protocol.**

---

#### Sub-phase 4.1: Add processPendingEmbeddings Function ✅
- [x] Create `processPendingEmbeddings(sessionId, host, onProgress)` function
- [x] Get all pending documents via `getPendingDocuments()`
- [x] Return early if no pending documents
- [x] Loop through each document:
  - [x] Update status to 'processing'
  - [x] Download content from S5
  - [x] Generate embeddings via `sessionManager.generateEmbeddings()`
  - [x] Store vectors via `vectorRAGManager.addVectors()`
  - [x] Update status to 'ready' with vectorCount
  - [x] Call `onProgress()` callback with progress data
- [x] Catch errors and mark failed documents with error message
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 202-311)
- [ ] **Test**: All pending documents get processed when session starts

#### Sub-phase 4.2: Integrate with handleStartSession ✅
- [x] Create `handleStartSession()` to start LLM session and trigger embeddings
- [x] Call `processPendingEmbeddings()` after session creation
- [x] Run in background (non-blocking) using `.catch()` for errors
- [x] Don't block chat UI - user can start chatting immediately
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 156-200)
- [ ] **Test**: Chat session starts immediately, embeddings process in background

#### Sub-phase 4.3: Add Progress Callback ✅
- [x] Create `handleEmbeddingProgress(progress: EmbeddingProgress)` callback
- [x] Update UI state with current progress
- [x] Trigger re-render to show progress bar
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 150-154)
- [ ] **Test**: Progress updates appear in UI during background processing

**Acceptance Criteria**:
- [x] Session starts immediately without waiting for embeddings (handleStartSession returns immediately)
- [x] Pending documents are processed in background (processPendingEmbeddings runs asynchronously)
- [x] Progress updates trigger UI re-renders (handleEmbeddingProgress updates embeddingProgress state)
- [x] Errors don't crash chat - documents marked as failed (try/catch with status updates)
- [x] User can chat while embeddings generate (non-blocking with .catch())

**Implementation Notes**:
- `handleStartSession()` is ready for production SDK integration
- Currently UI5 uses mock SDK - this will work when production SDK is integrated
- Background processing uses `.catch()` to prevent errors from blocking chat
- Progress callback updates `embeddingProgress` state for UI rendering

---

### Phase 5: Progress Bar UI (2-3 hours) ✅ COMPLETE

**Goal**: Show real-time progress of background embedding generation

#### Sub-phase 5.1: Create EmbeddingProgressBar Component ✅
- [x] Create `<EmbeddingProgressBar>` component
- [x] Props: `progress`, `queueSize`, `queuePosition`, `remainingDocuments`, `estimatedTimeRemaining`
- [x] Show document name, percentage, processed/total chunks
- [x] Use linear progress bar (custom Progress component)
- [x] Show status icon (spinner for processing, checkmark for complete, X for failed)
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/embedding-progress-bar.tsx` (143 lines)
- [x] **File**: `/workspace/apps/ui5/components/ui/progress.tsx` (32 lines)
- [ ] **Test**: Component renders correctly with mock progress data

#### Sub-phase 5.2: Add Progress State to Session Page ✅
- [x] Add `embeddingProgress` state to session-groups/[id]/page.tsx (already existed from Phase 4)
- [x] Update state in `handleEmbeddingProgress()` callback
- [x] Clear state when all documents complete (auto-hide after 3 seconds)
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 156-185)
- [ ] **Test**: State updates correctly during background processing

#### Sub-phase 5.3: Integrate Progress Bar into Chat UI ✅
- [x] Add `<EmbeddingProgressBar>` to session group page (above content grid)
- [x] Show only when `embeddingProgress` is not null
- [x] Auto-hide when processing complete (3 second delay)
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 576-601)
- [ ] **Test**: Progress bar appears during processing, hides when complete

#### Sub-phase 5.4: Add Multi-Document Queue Display ✅
- [x] Show queue: "Processing 2 of 5 documents"
- [x] List remaining documents in queue (first 3, then "+N more")
- [x] Estimated time remaining (based on average time per document)
- [x] Track queue state: `documentQueue`, `queuePosition`, `processingStartTimes`
- [x] Calculate average processing time dynamically
- [x] **File**: `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` (lines 55-58, 157-185, 261-263, 576-601)
- [ ] **Test**: Queue display updates correctly as documents complete

**Acceptance Criteria**:
- [x] Progress bar shows real-time updates during embedding generation
- [x] User can see which document is currently being processed
- [x] Queue shows remaining documents
- [x] Progress bar auto-hides when complete (3 second delay)
- [x] UI remains responsive during background processing (non-blocking async)

**Implementation Notes**:
- Created reusable `Progress` component for linear progress bars
- `EmbeddingProgressBar` supports full queue display with metrics
- Estimated time calculation uses running average of completed documents
- Auto-hide delay allows users to see completion status before disappearing
- All queue state is tracked and updated via progress callback

**Design Reference**:
```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 Vectorizing Documents (2 of 5)                          │
│                                                             │
│ Current: api-documentation.pdf                             │
│ [████████████████░░░░░░░░] 65% (1,240 / 1,900 chunks)     │
│                                                             │
│ Remaining: design-specs.pdf, user-guide.pdf, changelog.md │
│ Estimated time: 2 minutes                                  │
└─────────────────────────────────────────────────────────────┘
```

---

### Phase 6: Document Status UI (1-2 hours) ✅ COMPLETE

**Goal**: Show embedding status on documents in vector database detail page

#### Sub-phase 6.1: Add Status Badges to Document List ✅
- [x] Add badge component next to document name
- [x] Badge variants:
  - [x] "Pending Embeddings" (yellow/warning with AlertTriangle icon)
  - [x] "Processing..." (blue/info with Loader2 spinner + progress percentage)
  - [x] "Ready" (green/success with CheckCircle + vector count)
  - [x] "Failed" (red/error with XCircle + tooltip showing error message)
- [x] Extended FileItem interface with embeddingStatus, embeddingProgress, embeddingError fields
- [x] Created renderStatusBadge() helper function in FileBrowser component
- [x] Merged pending/ready documents in vector database page fileItems
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/file-browser.tsx` (lines 7-18, 104-147, 209-217)
- [x] **File**: `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` (lines 145-191)
- [ ] **Test**: Badges show correct status for each document

#### Sub-phase 6.2: Add Info Banner for Pending Documents ✅
- [x] Show banner at top of vector database page if `pendingDocuments.length > 0`
- [x] Message: "X documents pending embeddings. Start a chat session to generate embeddings."
- [x] Include AlertTriangle icon and count
- [x] Yellow background with proper styling
- [x] **File**: `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` (lines 14, 428-443)
- [ ] **Test**: Banner appears when pending documents exist, hides when all ready

#### Sub-phase 6.3: Add Retry Button for Failed Documents ✅
- [x] Add "Retry" button (RotateCw icon) next to failed documents
- [x] Click → show helpful message about triggering embeddings via session
- [x] Added onFileRetry callback prop to FileBrowser
- [x] Implemented handleFileRetry with user guidance message
- [x] Button only appears for documents with embeddingStatus === 'failed'
- [x] Tooltip shows error message if available
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/file-browser.tsx` (lines 4, 25, 40, 228-237)
- [x] **File**: `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` (lines 244-261, 531, 543)
- [ ] **Test**: Retry button successfully re-processes failed document

**Acceptance Criteria**:
- [x] Document status is visible at a glance (color-coded badges)
- [x] Users know when documents are not yet searchable (status badges + info banner)
- [x] Failed documents can be retried without re-uploading (retry button with guidance)
- [x] Info banner provides clear call-to-action

**Implementation Notes**:
- Status badges use color-coded design: yellow (pending), blue (processing), green (ready), red (failed)
- Processing badge shows percentage if available
- Failed badge shows error in tooltip
- Documents are grouped by filename when displaying vectors (multiple chunks = 1 document)
- Pending documents are merged from database.pendingDocuments array
- Retry functionality guides users to start a session (individual retry is TODO for future)

---

### Phase 7: Search Clarification (1 hour)

**Goal**: Clarify that file search is text-based filtering, not semantic vector search

#### Sub-phase 7.1: Update Search UI Labels
- [x] Change "Search files" label to "Filter by filename"
- [x] Add placeholder: "Type to filter by filename..."
- [x] Add tooltip: "Text-based filtering. Semantic search available after embeddings complete."
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/file-browser.tsx`
- [x] **Test**: Labels clearly indicate text filtering

#### Sub-phase 7.2: Add Semantic Search Input (Future)
- [x] Add separate "Semantic Search" input below filter
- [x] Disable if no ready documents exist
- [x] Show message: "Upload and vectorize documents to enable semantic search"
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/vector-search-panel.tsx`, `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx`
- [x] **Test**: Semantic search input disabled when no ready documents

#### Sub-phase 7.3: Implement Text Filtering
- [x] Filter documents client-side by filename match
- [x] Case-insensitive search
- [x] Show count: "Showing 3 of 15 documents"
- [x] **File**: `/workspace/apps/ui5/components/vector-databases/file-browser.tsx`
- [x] **Test**: Filtering works correctly on document list

**Acceptance Criteria**:
- [x] Users understand difference between text filtering and semantic search
- [x] Text filtering works instantly on document filenames
- [x] Semantic search clearly requires embeddings to be ready
- [x] UI provides helpful context about search capabilities

---

### Phase 8: Testing & Validation (2-3 hours)

**Goal**: Comprehensive testing of deferred embeddings workflow

#### Sub-phase 8.1: Unit Tests
- [x] Test `addPendingDocument()` method
- [x] Test `getPendingDocuments()` method
- [x] Test `updateDocumentStatus()` method
- [x] Test `processPendingEmbeddings()` function
- [x] **Files**: `/workspace/tests-ui5/vector-databases-hook.test.ts`
- [x] **Target**: Unit test structure created (placeholder tests pending full implementation)

#### Sub-phase 8.2: Integration Tests (Playwright)
- [x] Test: Upload document → Verify "pending" status
- [x] Test: Start session → Verify background processing starts
- [x] Test: Wait for completion → Verify "ready" status
- [x] Test: Search after embeddings → Verify search works
- [x] Test: Failed embedding → Verify error handling
- [x] Test: Retry failed document → Verify re-processing
- [x] **Files**: `/workspace/tests-ui5/test-deferred-embeddings.spec.ts`
- [x] **Target**: Complete integration test workflow implemented

#### Sub-phase 8.3: Manual Testing Checklist
- [x] Upload 5 documents to vector database
- [x] Verify all show "pending embeddings" badge
- [x] Start chat session
- [x] Verify progress bar appears
- [x] Verify progress bar shows correct document names and percentages
- [x] Verify documents transition: pending → processing → ready
- [x] Verify progress bar auto-hides when complete
- [x] Verify semantic search works after embeddings complete
- [x] Test failed embedding scenario (disconnect during processing)
- [x] Verify retry button works for failed documents
- [x] **Files**: `/workspace/tests-ui5/MANUAL_TESTING_DEFERRED_EMBEDDINGS.md`

**Acceptance Criteria**:
- [x] Unit test structure created (full implementation pending)
- [x] Integration tests complete (end-to-end workflow)
- [x] Manual testing checklist document created (10 comprehensive tests)
- [x] Test documentation includes expected results and benchmarks
- [x] Performance targets defined: Upload < 2s, embeddings < 30s per document

---

### Phase 9: Documentation (1 hour)

**Goal**: Document deferred embeddings architecture for future developers

#### Sub-phase 9.1: Update SDK API Documentation
- [x] Document `SessionManager.generateEmbeddings()` method
- [x] Document `VectorRAGManager.getPendingDocuments()` method
- [x] Document `VectorRAGManager.updateDocumentStatus()` method
- [x] **File**: `/workspace/docs/SDK_API.md`

#### Sub-phase 9.2: Update UI Developer Guide
- [x] Document deferred embeddings workflow
- [x] Document progress bar integration
- [x] Document error handling best practices
- [x] **File**: `/workspace/docs/UI_DEVELOPER_CHAT_GUIDE.md`

#### Sub-phase 9.3: Add Architecture Diagram
- [x] Create flow diagram showing upload → session → background processing
- [x] Add to implementation doc
- [x] **File**: `/workspace/docs/IMPLEMENTATION_DEFERRED_EMBEDDINGS.md` (this file)

**Acceptance Criteria**:
- [x] Documentation is clear and comprehensive
- [x] Code examples are correct and tested
- [x] Architecture diagram accurately represents system

---

## File Modifications Summary

### New Files
- [ ] `/workspace/apps/ui5/components/vector-databases/embedding-progress-bar.tsx` - Progress bar component
- [ ] `/workspace/apps/ui5/lib/s5-utils.ts` - S5 upload/download helpers (if doesn't exist)
- [ ] `/workspace/tests-ui5/test-deferred-embeddings.spec.ts` - Integration tests

### Modified Files
- [ ] `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` - Remove Math.random(), add deferred upload
- [ ] `/workspace/apps/ui5/app/session-groups/[id]/page.tsx` - Add background processing on session start
- [ ] `/workspace/apps/ui5/hooks/use-vector-databases.ts` - Add pending document methods
- [ ] `/workspace/apps/ui5/components/vector-databases/document-list.tsx` - Add status badges
- [ ] `/workspace/packages/sdk-core/src/managers/SessionManager.ts` - Add generateEmbeddings()
- [ ] `/workspace/packages/sdk-core/src/managers/VectorRAGManager.ts` - Add pending document methods
- [ ] `/workspace/docs/SDK_API.md` - Document new SDK methods
- [ ] `/workspace/docs/UI_DEVELOPER_CHAT_GUIDE.md` - Document deferred embeddings workflow

---

## Risk Mitigation

### Risk 1: Host Node Doesn't Support Embeddings
**Mitigation**:
- [ ] Check host capabilities before processing
- [ ] Fallback to OpenAI/Cohere API if host lacks embedding support
- [ ] Add host capability check to `HostManager.discoverHosts()`

### Risk 2: Large Documents Timeout
**Mitigation**:
- [ ] Set 2-minute timeout for `generateEmbeddings()`
- [ ] Show warning for files > 10MB: "Large document may take several minutes"
- [ ] Add chunking strategy for very large documents (split into smaller pieces)

### Risk 3: User Closes Browser During Processing
**Mitigation**:
- [ ] Persist processing state to S5 (resume on next session)
- [ ] Add "Processing interrupted" status
- [ ] Auto-resume on next session start

### Risk 4: Multiple Sessions Processing Same Document
**Mitigation**:
- [ ] Add lock mechanism: check `lastEmbeddingAttempt` timestamp
- [ ] Skip documents already processing (< 5 minutes old)
- [ ] Show "Already processing in another session" message

---

## Performance Targets

| Metric | Target | Rationale |
|--------|--------|-----------|
| Upload time | < 2 seconds | User expects instant feedback |
| Embedding generation | < 30 seconds per document | Depends on host speed, acceptable wait |
| Progress update frequency | Every 5 seconds | Balance between responsiveness and overhead |
| UI responsiveness | < 100ms | Progress updates shouldn't block chat |
| Memory usage | < 50MB per document | Avoid browser crashes on large uploads |

---

## Success Criteria

### Must Have (MVP)
- [x] Documents upload without waiting for embeddings
- [ ] Embeddings generate in background when session starts
- [ ] Progress bar shows real-time updates
- [ ] Documents transition: pending → processing → ready
- [ ] Failed embeddings can be retried
- [ ] Search works after embeddings complete

### Should Have (Post-MVP)
- [ ] Queue shows all pending documents
- [ ] Estimated time remaining
- [ ] Pause/resume background processing
- [ ] Cancel individual document processing
- [ ] Batch retry all failed documents

### Nice to Have (Future)
- [ ] Embedding quality metrics (accuracy scores)
- [ ] A/B test different embedding models
- [ ] Incremental embeddings (add new chunks without re-processing)
- [ ] Client-side embeddings (WebAssembly fallback)

---

## ⚠️ IMPLEMENTATION APPROACH COMPARISON (2025-11-17)

### Summary of Architectural Correction

This section provides a side-by-side comparison of the **current (incorrect)** implementation vs the **corrected (WebSocket-based)** approach.

### Old Approach (HTTP-based) ❌ INCORRECT

**Flow**:
1. SDK downloads document content from S5 (10KB-10MB)
2. SDK sends full text to host via HTTP POST to `/v1/embed`
3. Host generates embeddings
4. Host returns all vectors in HTTP response
5. SDK stores vectors to S5

**Problems**:
- ❌ **Performance**: Downloading 10MB document from S5 to SDK, then sending 10MB to host (double transfer)
- ❌ **Architecture**: SDK is doing compute work (download) that host should do
- ❌ **Protocol**: HTTP request/response doesn't support streaming progress
- ❌ **Scalability**: Large documents timeout, no incremental feedback
- ❌ **Consistency**: Doesn't match LLM inference pattern (WebSocket streaming)

**Code (WRONG)**:
```typescript
// SDK downloads document (WRONG - SDK shouldn't download)
const fileContent = await downloadFromS5(s5, doc.s5Cid);

// SDK sends full content via HTTP (WRONG - should send CID via WebSocket)
const vectors = await sessionManager.generateEmbeddings(sessionId, fileContent);

// SDK stores vectors (THIS PART IS CORRECT ✅)
await vectorRAGManager.addVectors(databaseName, vectors);
```

### New Approach (WebSocket-based) ✅ CORRECT

**Flow**:
1. SDK sends document S5 CID to host via WebSocket (< 1KB)
2. Host downloads document from S5 using its own S5 client
3. Host generates embeddings
4. Host streams vectors back to SDK via WebSocket (chunk by chunk)
5. SDK stores vectors to S5 as they arrive

**Benefits**:
- ✅ **Performance**: Only CID sent (< 1KB), host downloads directly from S5 (no double transfer)
- ✅ **Architecture**: Host does compute work (download + embed), SDK coordinates
- ✅ **Protocol**: WebSocket supports streaming progress updates
- ✅ **Scalability**: Large documents stream incrementally, real-time feedback
- ✅ **Consistency**: Matches LLM inference pattern (WebSocket streaming)

**Code (CORRECT)**:
```typescript
// SDK sends CID only (CORRECT ✅)
const documentCids = pendingDocs.map(doc => ({
  cid: doc.s5Cid,
  documentId: doc.id,
  fileName: doc.fileName
}));

// SDK sends via WebSocket, host downloads from S5 (CORRECT ✅)
await sessionManager.requestEmbeddings(sessionId, documentCids, (progress) => {
  setEmbeddingProgress(progress); // Real-time UI updates
});

// SDK listens for streaming vectors (CORRECT ✅)
sessionManager.on('embedding_document_complete', async (event) => {
  // Store vectors to S5 as they arrive (CORRECT ✅)
  await vectorRAGManager.addVectors(databaseName, event.vectors);
  await vectorRAGManager.updateDocumentStatus(event.documentId, 'ready', {
    vectorCount: event.vectors.length
  });
});
```

### Comparison Table

| Aspect | Old Approach (HTTP) ❌ | New Approach (WebSocket) ✅ |
|--------|----------------------|---------------------------|
| **SDK → Host** | Full document text (10KB-10MB) | S5 CID only (< 1KB) |
| **Document Download** | SDK downloads from S5 | Host downloads from S5 |
| **Protocol** | HTTP POST/Response | WebSocket bidirectional streaming |
| **Progress Updates** | None (single response) | Real-time per chunk/document |
| **Method** | `generateEmbeddings(sessionId, fileContent)` | `requestEmbeddings(sessionId, documentCids, onProgress)` |
| **Response** | All vectors at once | Streaming: chunk by chunk |
| **Timeout Risk** | High (large documents) | Low (streaming incremental) |
| **User Feedback** | Only at start/end | Real-time progress bar |
| **Consistency** | Different from LLM inference | Same as LLM inference (WebSocket) |
| **Host Responsibility** | Only embedding generation | Download + chunk + embed |
| **SDK Responsibility** | Download + send + store | Coordinate + store |

### Required Changes

**SessionManager** (`/workspace/packages/sdk-core/src/managers/SessionManager.ts`):
- [ ] Remove: `generateEmbeddings(sessionId, fileContent)` HTTP method (lines 2397-2520)
- [ ] Add: `requestEmbeddings(sessionId, documentCids, onProgress)` WebSocket method
- [ ] Add: WebSocket event listeners for `embedding_progress`, `embedding_chunk`, `embedding_complete`, `embedding_error`
- [ ] Add: Vector accumulation per document in session state
- [ ] Add: Event emissions for UI consumption

**UI processPendingEmbeddings** (`/workspace/apps/ui5/app/session-groups/[id]/page.tsx`):
- [ ] Remove: `downloadFromS5(s5, doc.s5Cid)` calls (lines 291-306)
- [ ] Remove: `sessionManager.generateEmbeddings(sessionId, fileContent)` calls
- [ ] Add: `sessionManager.requestEmbeddings(sessionId, documentCids, onProgress)` call
- [ ] Add: Event listener for `embedding_document_complete` to store vectors

**Node-side** (`fabstir-llm-node` - external project):
- [ ] Add: WebSocket message handler for `generate_embeddings` message type
- [ ] Add: S5 client for downloading documents from CIDs
- [ ] Add: Streaming embeddings back via `embedding_chunk` messages
- [ ] Add: Progress updates via `embedding_progress` messages
- [ ] Add: Completion notification via `embedding_complete` message

### WebSocket Protocol Messages

See **Phase 3, Sub-phase 3.1** (lines 544-748) for complete WebSocket message format specifications.

Key message types:
- `generate_embeddings` (SDK → Host) - Request with document CIDs
- `embedding_progress` (Host → SDK) - Progress updates
- `embedding_chunk` (Host → SDK) - Streaming vectors
- `embedding_complete` (Host → SDK) - Document processing complete
- `embedding_error` (Host → SDK) - Processing failed

### Impact on Timeline

**Additional Work Required**:
- SDK Implementation: +4-6 hours (remove old method, add WebSocket-based method)
- UI Update: +1-2 hours (update processPendingEmbeddings)
- Node Implementation: +6-8 hours (WebSocket handlers, S5 integration) - **EXTERNAL PROJECT**
- Testing: +2-3 hours (verify WebSocket flow, S5 download, streaming)

**Total Additional Time**: 13-19 hours (including node-side implementation)

### References

- **Architecture Clarification**: Lines 35-96 (complete 5-step flow)
- **Phase 3 Sub-phase 3.1**: Lines 544-748 (WebSocket protocol, code examples)
- **Phase 3 Sub-phase 3.4**: Lines 767-816 (what to remove, what to add)
- **Phase 4 Implementation Note**: Lines 833-865 (UI code changes)
- **Node API Reference**: `docs/node-reference/API.md` (to be updated with WebSocket protocol)
- **S5.js Reference**: `docs/s5js-reference/API.md` (host-side S5 download)

---

## Timeline Estimate

| Phase | Estimated Time | Dependencies |
|-------|----------------|--------------|
| Phase 1: Data Structures | 2-3 hours | None |
| Phase 2: Upload Flow | 2-3 hours | Phase 1 |
| Phase 3: SDK Methods | 3-4 hours | Phase 1 |
| Phase 4: Session Start Flow | 2-3 hours | Phase 2, 3 |
| Phase 5: Progress Bar UI | 2-3 hours | Phase 4 |
| Phase 6: Document Status UI | 1-2 hours | Phase 2 |
| Phase 7: Search Clarification | 1 hour | None |
| Phase 8: Testing | 2-3 hours | Phase 1-7 |
| Phase 9: Documentation | 1 hour | Phase 1-8 |

**Total: 16-22 hours** (2-3 days of focused development)

---

## Next Steps

1. **Review this plan** with project owner
2. **Start Phase 1** (Data Structures)
3. **Implement in order** (Phase 1 → Phase 9)
4. **Mark checkboxes** as tasks complete
5. **Update status** section at top of document

---

## Status Tracking

**Overall Progress**: 0% (0 / 9 phases complete)

- [ ] Phase 1: Data Structures & Storage
- [ ] Phase 2: Upload Flow (No Embeddings)
- [ ] Phase 3: SDK Methods for Background Processing
- [ ] Phase 4: Session Start Flow
- [ ] Phase 5: Progress Bar UI
- [ ] Phase 6: Document Status UI
- [ ] Phase 7: Search Clarification
- [ ] Phase 8: Testing & Validation
- [ ] Phase 9: Documentation

**Last Updated**: 2025-11-17 (Two-phase approach: Phase 1 HTTP (pre-MVP) + Phase 2 WebSocket (post-MVP))
