# Implementation Plan: RAG System for Platformless AI

## Overview

Create a production-ready Retrieval-Augmented Generation (RAG) system that enables users to build and query their own decentralized knowledge bases. The system will integrate Fabstir Vector DB with native JavaScript bindings, Enhanced S5.js for decentralized storage, and provide true data sovereignty with end-to-end encryption.

## Goal

Deliver a fully decentralized RAG system that:
1. Enables users to create multiple vector databases with folder hierarchies
2. Provides sub-second vector search with 10x memory efficiency
3. Maintains complete user data sovereignty via S5 storage
4. Integrates seamlessly with existing LLM inference sessions
5. Supports document upload, chunking, and automatic embedding generation
6. Implements granular access control for sharing knowledge bases

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      User Browser/App                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                 Fabstir SDK Core (TypeScript)               │
│  ┌────────────────────────────────────────────────────────┐ │
│  │                    RAG System                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐│ │
│  │  │VectorRAG     │  │Document      │  │Permission    ││ │
│  │  │Manager       │  │Manager       │  │Manager       ││ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘│ │
│  │         │                  │                  │        │ │
│  │  ┌──────▼──────────────────▼──────────────────▼──────┐│ │
│  │  │          @fabstir/vector-db-native                ││ │
│  │  │  • Chunked storage (10K vectors/chunk)            ││ │
│  │  │  • S5 persistence with encryption                 ││ │
│  │  │  • 58ms search latency (warm cache)               ││ │
│  │  └────────────────────────────────────────────────────┘│ │
│  │                                                        │ │
│  │  ┌────────────────────────────────────────────────────┐│ │
│  │  │           Enhanced SessionManager                  ││ │
│  │  │  • RAG context injection                          ││ │
│  │  │  • Multi-DB selection                             ││ │
│  │  │  • Encrypted WebSocket communication              ││ │
│  │  └────────────────────┬───────────────────────────────┘│ │
│  └───────────────────────┼────────────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────┘
                           │ WebSocket
┌──────────────────────────▼──────────────────────────────────┐
│            fabstir-llm-node (Rust) - Host Side             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  New Embedding Endpoint: POST /v1/embed                │ │
│  │  • Local model (all-MiniLM-L6-v2, 384-dim)            │ │
│  │  • Batch processing support                           │ │
│  │  • No API costs                                       │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                S5 Network (Decentralized Storage)           │
│  User's vector DBs stored encrypted under their CID        │
│  ┌────────────────────────────────────────────────────────┐ │
│  │ home/vector-databases/{userAddress}/                   │ │
│  │   ├── personal-knowledge/                             │ │
│  │   ├── work-documents/                                 │ │
│  │   └── research-papers/                                │ │
│  └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `x` in `- [ ]` for each completed task

---

## Phase 1: Foundation and Vector DB Integration

### Sub-phase 1.1: Package Setup and Dependencies ✅ COMPLETE

**Goal**: Integrate @fabstir/vector-db-native package and verify it works

#### Tasks
- [x] Install @fabstir/vector-db-native package
- [x] Verify package loads in TypeScript environment
- [x] Write tests for basic VectorDbSession creation
- [x] Test S5 portal connectivity
- [x] Verify chunked storage configuration
- [x] Test encryption-at-rest defaults
- [x] Confirm native metadata support (no JSON.stringify)
- [x] Test memory usage with 100K vectors scenario
- [x] Verify 58ms search latency claim

**Test Files:** ✅ ALL CREATED
- `packages/sdk-core/tests/rag/setup.test.ts` (193 lines) - Package setup tests - **20/20 PASS**
- `packages/sdk-core/tests/rag/vector-db-native.test.ts` (235 lines) - Native bindings tests
- `packages/sdk-core/tests/rag/performance.test.ts` (199 lines) - Performance verification

**Implementation Files:** ✅ ALL CREATED
- `packages/sdk-core/package.json` (updated) - Added @fabstir/vector-db-native dependency
- `packages/sdk-core/src/rag/types.ts` (177 lines) - RAG type definitions
- `packages/sdk-core/src/rag/config.ts` (106 lines) - RAG configuration
- `packages/sdk-core/tests/setup-polyfills.ts` (updated) - Added .env.test loader

**Success Criteria:** ✅ ALL MET
- ✅ Package imports without errors
- ✅ VectorDbSession creates successfully
- ✅ S5 connection works
- ✅ Native metadata verified
- ✅ Performance meets specifications

### Sub-phase 1.2: Basic VectorRAGManager

**Goal**: Create the core manager for vector database operations

#### Tasks
- [ ] Write tests for VectorRAGManager initialization
- [ ] Write tests for session management
- [ ] Implement VectorRAGManager class structure
- [ ] Add session creation with S5 config
- [ ] Implement session cleanup/destroy
- [ ] Add basic error handling
- [ ] Test memory management
- [ ] Implement session caching
- [ ] Add session status tracking

**Test Files:**
- `packages/sdk-core/tests/managers/vector-rag-manager.test.ts` (max 300 lines) - Manager tests
- `packages/sdk-core/tests/managers/rag-session.test.ts` (max 250 lines) - Session tests
- `packages/sdk-core/tests/managers/rag-cleanup.test.ts` (max 200 lines) - Cleanup tests

**Implementation Files:**
- `packages/sdk-core/src/managers/VectorRAGManager.ts` (max 400 lines) - Main manager
- `packages/sdk-core/src/managers/interfaces/IVectorRAGManager.ts` (max 100 lines) - Interface
- `packages/sdk-core/src/rag/session-cache.ts` (max 200 lines) - Session caching

**Success Criteria:**
- Manager initializes correctly
- Sessions create and destroy properly
- Memory properly managed
- No memory leaks
- Sessions cached efficiently

---

## Phase 2: Storage and Document Management

### Sub-phase 2.1: Enhanced Storage Manager for Folders

**Goal**: Extend StorageManager to support folder operations for vector DBs

#### Tasks
- [ ] Write tests for folder creation
- [ ] Write tests for folder listing
- [ ] Write tests for folder deletion
- [ ] Implement createFolder method
- [ ] Implement listFolder with pagination
- [ ] Implement deleteFolder (recursive)
- [ ] Add folder move/rename operations
- [ ] Implement folder metadata storage
- [ ] Add folder path validation
- [ ] Test with nested folder structures

**Test Files:**
- `packages/sdk-core/tests/storage/folders.test.ts` (max 300 lines) - Folder operation tests
- `packages/sdk-core/tests/storage/hierarchy.test.ts` (max 250 lines) - Hierarchy tests
- `packages/sdk-core/tests/storage/metadata.test.ts` (max 200 lines) - Metadata tests

**Implementation Files:**
- `packages/sdk-core/src/managers/StorageManager.ts` (update, max 500 lines) - Add folder ops
- `packages/sdk-core/src/storage/folder-operations.ts` (max 300 lines) - Folder logic
- `packages/sdk-core/src/storage/path-validator.ts` (max 150 lines) - Path validation

**Success Criteria:**
- Folders create at any depth
- Listing works with pagination
- Recursive deletion works
- Move/rename preserves contents
- Metadata persists correctly

### Sub-phase 2.2: Document Manager Implementation

**Goal**: Create document upload and chunking system

#### Tasks
- [ ] Write tests for document upload
- [ ] Write tests for text extraction
- [ ] Write tests for chunking strategies
- [ ] Implement document upload to S5
- [ ] Add text extraction for PDF/DOCX/TXT
- [ ] Implement smart chunking (500 tokens, 50 overlap)
- [ ] Add document metadata tracking
- [ ] Implement batch document processing
- [ ] Add progress tracking for uploads
- [ ] Test with various document formats

**Test Files:**
- `packages/sdk-core/tests/documents/upload.test.ts` (max 300 lines) - Upload tests
- `packages/sdk-core/tests/documents/extraction.test.ts` (max 250 lines) - Extraction tests
- `packages/sdk-core/tests/documents/chunking.test.ts` (max 250 lines) - Chunking tests

**Implementation Files:**
- `packages/sdk-core/src/managers/DocumentManager.ts` (max 500 lines) - Document manager
- `packages/sdk-core/src/documents/extractors.ts` (max 300 lines) - Text extractors
- `packages/sdk-core/src/documents/chunker.ts` (max 250 lines) - Chunking logic
- `packages/sdk-core/src/documents/types.ts` (max 100 lines) - Document types

**Success Criteria:**
- Documents upload successfully
- Text extraction works for all formats
- Chunking maintains context
- Metadata tracks properly
- Batch processing efficient

---

## Phase 3: Vector Operations and Search

### Sub-phase 3.1: Vector Addition and Management

**Goal**: Implement vector addition with metadata to vector DBs

#### Tasks
- [ ] Write tests for addVectors method
- [ ] Write tests for vector metadata
- [ ] Write tests for batch operations
- [ ] Implement addVectors in VectorRAGManager
- [ ] Add metadata validation
- [ ] Implement batch vector addition
- [ ] Add duplicate detection
- [ ] Implement vector updates
- [ ] Add vector deletion by metadata
- [ ] Test with 10K+ vectors

**Test Files:**
- `packages/sdk-core/tests/vectors/addition.test.ts` (max 300 lines) - Addition tests
- `packages/sdk-core/tests/vectors/metadata.test.ts` (max 250 lines) - Metadata tests
- `packages/sdk-core/tests/vectors/batch.test.ts` (max 250 lines) - Batch tests

**Implementation Files:**
- `packages/sdk-core/src/rag/vector-operations.ts` (max 400 lines) - Vector operations
- `packages/sdk-core/src/rag/metadata-validator.ts` (max 200 lines) - Metadata validation
- `packages/sdk-core/src/rag/batch-processor.ts` (max 250 lines) - Batch processing

**Success Criteria:**
- Vectors add with metadata
- Batch operations performant
- Duplicates handled correctly
- Updates work properly
- Deletion by metadata works

### Sub-phase 3.2: Vector Search and Retrieval

**Goal**: Implement efficient vector search with filtering

#### Tasks
- [ ] Write tests for search operations
- [ ] Write tests for similarity thresholds
- [ ] Write tests for metadata filtering
- [ ] Implement searchContext method
- [ ] Add similarity score calculation
- [ ] Implement metadata-based filtering
- [ ] Add search result ranking
- [ ] Implement search caching
- [ ] Add search history tracking
- [ ] Test search performance at scale

**Test Files:**
- `packages/sdk-core/tests/search/basic-search.test.ts` (max 300 lines) - Search tests
- `packages/sdk-core/tests/search/filtering.test.ts` (max 250 lines) - Filter tests
- `packages/sdk-core/tests/search/performance.test.ts` (max 250 lines) - Performance tests

**Implementation Files:**
- `packages/sdk-core/src/rag/search-engine.ts` (max 400 lines) - Search implementation
- `packages/sdk-core/src/rag/filter-builder.ts` (max 200 lines) - Filter logic
- `packages/sdk-core/src/rag/search-cache.ts` (max 200 lines) - Search caching

**Success Criteria:**
- Search returns relevant results
- Similarity threshold works
- Filters apply correctly
- Performance < 100ms
- Cache improves speed

---

## Phase 4: Embedding Generation

### Sub-phase 4.1: Client-Side Embedding (MVP)

**Goal**: Implement initial embedding generation using external APIs

#### Tasks
- [ ] Write tests for OpenAI embedding integration
- [ ] Write tests for Cohere embedding integration
- [ ] Write tests for embedding caching
- [ ] Implement EmbeddingService interface
- [ ] Add OpenAI adapter implementation
- [ ] Add Cohere adapter implementation
- [ ] Implement embedding caching layer
- [ ] Add API key management
- [ ] Implement rate limiting
- [ ] Add cost tracking

**Test Files:**
- `packages/sdk-core/tests/embeddings/openai.test.ts` (max 250 lines) - OpenAI tests
- `packages/sdk-core/tests/embeddings/cohere.test.ts` (max 250 lines) - Cohere tests
- `packages/sdk-core/tests/embeddings/cache.test.ts` (max 200 lines) - Cache tests

**Implementation Files:**
- `packages/sdk-core/src/embeddings/EmbeddingService.ts` (max 300 lines) - Service interface
- `packages/sdk-core/src/embeddings/adapters/OpenAIAdapter.ts` (max 250 lines) - OpenAI
- `packages/sdk-core/src/embeddings/adapters/CohereAdapter.ts` (max 250 lines) - Cohere
- `packages/sdk-core/src/embeddings/EmbeddingCache.ts` (max 200 lines) - Caching

**Success Criteria:**
- Both providers work
- Embeddings generate correctly
- Caching reduces API calls
- Rate limiting prevents errors
- Costs tracked accurately

### Sub-phase 4.2: Host-Side Embedding (Production)

**Goal**: Add embedding generation endpoint to fabstir-llm-node

#### Tasks
- [ ] Write tests for /v1/embed endpoint
- [ ] Write tests for batch embedding
- [ ] Write tests for model loading
- [ ] Implement embedding endpoint in Rust
- [ ] Add all-MiniLM-L6-v2 model support
- [ ] Implement batch processing
- [ ] Add request validation
- [ ] Implement response caching
- [ ] Add performance monitoring
- [ ] Test with concurrent requests

**Test Files:**
- `docs/node-reference/tests/embedding-endpoint.test.ts` (max 300 lines) - Endpoint tests
- `docs/node-reference/tests/batch-embedding.test.ts` (max 250 lines) - Batch tests
- `docs/node-reference/tests/embedding-perf.test.ts` (max 200 lines) - Performance tests

**Implementation Files:**
- `fabstir-llm-node/src/api/embedding.rs` (max 400 lines) - Rust endpoint
- `fabstir-llm-node/src/models/embedding_model.rs` (max 300 lines) - Model handler
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (max 250 lines) - SDK adapter

**Success Criteria:**
- Endpoint responds correctly
- Embeddings match expected dimensions
- Batch processing efficient
- No memory leaks
- Performance acceptable

---

## Phase 5: Session Integration

### Sub-phase 5.1: Enhanced SessionManager with RAG

**Goal**: Integrate RAG into existing SessionManager

#### Tasks
- [ ] Write tests for RAG configuration
- [ ] Write tests for context injection
- [ ] Write tests for multi-DB selection
- [ ] Add RAG config to session options
- [ ] Implement automatic RAG initialization
- [ ] Add context retrieval before prompts
- [ ] Implement prompt augmentation
- [ ] Add RAG metrics tracking
- [ ] Test with real sessions
- [ ] Add RAG enable/disable toggle

**Test Files:**
- `packages/sdk-core/tests/session/rag-config.test.ts` (max 250 lines) - Config tests
- `packages/sdk-core/tests/session/context-injection.test.ts` (max 300 lines) - Context tests
- `packages/sdk-core/tests/session/rag-session.test.ts` (max 300 lines) - Integration tests

**Implementation Files:**
- `packages/sdk-core/src/managers/SessionManager.ts` (update, max 600 lines) - Add RAG
- `packages/sdk-core/src/session/rag-config.ts` (max 150 lines) - RAG configuration
- `packages/sdk-core/src/session/context-builder.ts` (max 250 lines) - Context building

**Success Criteria:**
- RAG integrates seamlessly
- Context injection works
- Multi-DB selection works
- Metrics tracked properly
- Toggle works correctly

### Sub-phase 5.2: Conversation Memory with RAG

**Goal**: Implement conversation history integration with RAG

#### Tasks
- [ ] Write tests for conversation storage
- [ ] Write tests for history retrieval
- [ ] Write tests for context windowing
- [ ] Implement conversation storage in vectors
- [ ] Add automatic history embedding
- [ ] Implement sliding context window
- [ ] Add conversation summarization
- [ ] Implement memory pruning
- [ ] Test with long conversations
- [ ] Add conversation export

**Test Files:**
- `packages/sdk-core/tests/conversation/storage.test.ts` (max 250 lines) - Storage tests
- `packages/sdk-core/tests/conversation/memory.test.ts` (max 250 lines) - Memory tests
- `packages/sdk-core/tests/conversation/windowing.test.ts` (max 200 lines) - Window tests

**Implementation Files:**
- `packages/sdk-core/src/conversation/ConversationMemory.ts` (max 400 lines) - Memory system
- `packages/sdk-core/src/conversation/summarizer.ts` (max 250 lines) - Summarization
- `packages/sdk-core/src/conversation/windowing.ts` (max 200 lines) - Context window

**Success Criteria:**
- Conversations stored properly
- History retrieval works
- Context window maintains relevance
- Summarization preserves key info
- Memory managed efficiently

---

## Phase 6: Multi-Database Support

### Sub-phase 6.1: Multiple Vector DBs Per User

**Goal**: Enable users to create and manage multiple vector databases

#### Tasks
- [ ] Write tests for multi-DB creation
- [ ] Write tests for DB switching
- [ ] Write tests for DB deletion
- [ ] Implement createVectorDB method
- [ ] Add DB listing functionality
- [ ] Implement DB switching logic
- [ ] Add DB deletion with cleanup
- [ ] Implement DB metadata storage
- [ ] Add DB size tracking
- [ ] Test with 10+ databases

**Test Files:**
- `packages/sdk-core/tests/multi-db/creation.test.ts` (max 250 lines) - Creation tests
- `packages/sdk-core/tests/multi-db/management.test.ts` (max 250 lines) - Management tests
- `packages/sdk-core/tests/multi-db/cleanup.test.ts` (max 200 lines) - Cleanup tests

**Implementation Files:**
- `packages/sdk-core/src/rag/db-manager.ts` (max 400 lines) - DB management
- `packages/sdk-core/src/rag/db-metadata.ts` (max 200 lines) - Metadata handling
- `packages/sdk-core/src/rag/db-registry.ts` (max 250 lines) - DB registry

**Success Criteria:**
- Multiple DBs create successfully
- Switching works seamlessly
- Deletion cleans up properly
- Metadata persists correctly
- Size tracking accurate

### Sub-phase 6.2: Folder Hierarchy Implementation

**Goal**: Implement virtual folder structure for document organization

#### Tasks
- [ ] Write tests for hierarchy creation
- [ ] Write tests for folder navigation
- [ ] Write tests for file operations
- [ ] Implement hierarchy data structure
- [ ] Add folder creation at any level
- [ ] Implement file move between folders
- [ ] Add breadcrumb navigation
- [ ] Implement folder permissions
- [ ] Add folder search functionality
- [ ] Test with deep hierarchies

**Test Files:**
- `packages/sdk-core/tests/hierarchy/structure.test.ts` (max 300 lines) - Structure tests
- `packages/sdk-core/tests/hierarchy/navigation.test.ts` (max 250 lines) - Navigation tests
- `packages/sdk-core/tests/hierarchy/operations.test.ts` (max 250 lines) - Operation tests

**Implementation Files:**
- `packages/sdk-core/src/hierarchy/HierarchyManager.ts` (max 400 lines) - Main manager
- `packages/sdk-core/src/hierarchy/tree-structure.ts` (max 300 lines) - Tree logic
- `packages/sdk-core/src/hierarchy/navigator.ts` (max 200 lines) - Navigation

**Success Criteria:**
- Hierarchies create properly
- Navigation intuitive
- File operations work
- Permissions enforced
- Search finds nested items

---

## Phase 7: Access Control and Permissions

### Sub-phase 7.1: Permission System Implementation

**Goal**: Implement granular access control for vector databases

#### Tasks
- [ ] Write tests for permission checking
- [ ] Write tests for permission granting
- [ ] Write tests for permission revocation
- [ ] Implement PermissionManager class
- [ ] Add owner/reader/writer roles
- [ ] Implement permission inheritance
- [ ] Add public/private DB settings
- [ ] Implement permission validation
- [ ] Add audit logging
- [ ] Test with multiple users

**Test Files:**
- `packages/sdk-core/tests/permissions/checking.test.ts` (max 250 lines) - Check tests
- `packages/sdk-core/tests/permissions/granting.test.ts` (max 250 lines) - Grant tests
- `packages/sdk-core/tests/permissions/audit.test.ts` (max 200 lines) - Audit tests

**Implementation Files:**
- `packages/sdk-core/src/permissions/PermissionManager.ts` (max 400 lines) - Main manager
- `packages/sdk-core/src/permissions/roles.ts` (max 200 lines) - Role definitions
- `packages/sdk-core/src/permissions/audit-logger.ts` (max 200 lines) - Audit logging

**Success Criteria:**
- Permissions check correctly
- Granting works properly
- Revocation removes access
- Inheritance works as expected
- Audit logs complete

### Sub-phase 7.2: Sharing and Collaboration

**Goal**: Enable secure sharing of vector databases

#### Tasks
- [ ] Write tests for sharing invitations
- [ ] Write tests for access tokens
- [ ] Write tests for shared queries
- [ ] Implement sharing invitation system
- [ ] Add time-limited access tokens
- [ ] Implement shared query execution
- [ ] Add usage tracking for shares
- [ ] Implement share revocation
- [ ] Add notification system
- [ ] Test collaborative scenarios

**Test Files:**
- `packages/sdk-core/tests/sharing/invitations.test.ts` (max 250 lines) - Invitation tests
- `packages/sdk-core/tests/sharing/tokens.test.ts` (max 250 lines) - Token tests
- `packages/sdk-core/tests/sharing/collaboration.test.ts` (max 300 lines) - Collab tests

**Implementation Files:**
- `packages/sdk-core/src/sharing/SharingManager.ts` (max 400 lines) - Sharing system
- `packages/sdk-core/src/sharing/token-generator.ts` (max 200 lines) - Token logic
- `packages/sdk-core/src/sharing/notifications.ts` (max 200 lines) - Notifications

**Success Criteria:**
- Invitations work correctly
- Tokens expire properly
- Shared queries execute
- Usage tracked accurately
- Revocation immediate

---

## Phase 8: Optimization and Performance

### Sub-phase 8.1: Caching and Performance

**Goal**: Optimize RAG system for production performance

#### Tasks
- [ ] Write performance benchmarks
- [ ] Write tests for caching layers
- [ ] Write tests for lazy loading
- [ ] Implement multi-level caching
- [ ] Add query result caching
- [ ] Implement lazy chunk loading
- [ ] Optimize search algorithms
- [ ] Add connection pooling
- [ ] Implement request batching
- [ ] Profile and optimize hot paths

**Test Files:**
- `packages/sdk-core/tests/performance/benchmarks.test.ts` (max 300 lines) - Benchmark tests
- `packages/sdk-core/tests/performance/caching.test.ts` (max 250 lines) - Cache tests
- `packages/sdk-core/tests/performance/profiling.test.ts` (max 200 lines) - Profile tests

**Implementation Files:**
- `packages/sdk-core/src/optimization/cache-manager.ts` (max 400 lines) - Cache system
- `packages/sdk-core/src/optimization/lazy-loader.ts` (max 250 lines) - Lazy loading
- `packages/sdk-core/src/optimization/batch-processor.ts` (max 250 lines) - Batching

**Success Criteria:**
- Search < 100ms at scale
- Cache hit rate > 80%
- Memory usage optimized
- No performance regressions
- Batching improves throughput

### Sub-phase 8.2: Error Handling and Recovery

**Goal**: Implement robust error handling and recovery mechanisms

#### Tasks
- [ ] Write tests for error scenarios
- [ ] Write tests for recovery procedures
- [ ] Write tests for data consistency
- [ ] Implement comprehensive error handling
- [ ] Add automatic retry logic
- [ ] Implement transaction rollback
- [ ] Add data consistency checks
- [ ] Implement recovery procedures
- [ ] Add error reporting system
- [ ] Test failure scenarios

**Test Files:**
- `packages/sdk-core/tests/resilience/errors.test.ts` (max 300 lines) - Error tests
- `packages/sdk-core/tests/resilience/recovery.test.ts` (max 250 lines) - Recovery tests
- `packages/sdk-core/tests/resilience/consistency.test.ts` (max 250 lines) - Consistency tests

**Implementation Files:**
- `packages/sdk-core/src/resilience/error-handler.ts` (max 350 lines) - Error handling
- `packages/sdk-core/src/resilience/recovery-manager.ts` (max 300 lines) - Recovery
- `packages/sdk-core/src/resilience/consistency-checker.ts` (max 250 lines) - Consistency

**Success Criteria:**
- All errors handled gracefully
- Recovery procedures work
- Data remains consistent
- No data loss on failure
- System self-heals

---

## Phase 9: User Interface Components

### Sub-phase 9.1: React Components for RAG Management

**Goal**: Create React components for vector DB management

#### Tasks
- [ ] Write tests for RAG dashboard component
- [ ] Write tests for document upload component
- [ ] Write tests for search interface
- [ ] Create RAGDashboard component
- [ ] Implement DocumentUploader component
- [ ] Create SearchInterface component
- [ ] Add VectorDBSelector component
- [ ] Implement FolderExplorer component
- [ ] Create PermissionManager UI
- [ ] Test all components together

**Test Files:**
- `apps/harness/tests/components/rag-dashboard.test.tsx` (max 300 lines) - Dashboard tests
- `apps/harness/tests/components/document-upload.test.tsx` (max 250 lines) - Upload tests
- `apps/harness/tests/components/search.test.tsx` (max 250 lines) - Search tests

**Implementation Files:**
- `apps/harness/components/rag/RAGDashboard.tsx` (max 400 lines) - Main dashboard
- `apps/harness/components/rag/DocumentUploader.tsx` (max 350 lines) - Upload UI
- `apps/harness/components/rag/SearchInterface.tsx` (max 300 lines) - Search UI
- `apps/harness/components/rag/FolderExplorer.tsx` (max 300 lines) - Folder UI

**Success Criteria:**
- Components render correctly
- User interactions work
- State management proper
- Responsive design
- Accessibility compliant

### Sub-phase 9.2: Integration with Chat Interface

**Goal**: Integrate RAG into existing chat-context-demo

#### Tasks
- [ ] Write tests for RAG toggle in chat
- [ ] Write tests for context display
- [ ] Write tests for source attribution
- [ ] Add RAG enable/disable toggle
- [ ] Implement context preview panel
- [ ] Add source attribution display
- [ ] Create context relevance indicator
- [ ] Add DB selection dropdown
- [ ] Implement context feedback system
- [ ] Test full chat flow with RAG

**Test Files:**
- `apps/harness/tests/integration/chat-rag.test.tsx` (max 300 lines) - Chat integration tests
- `apps/harness/tests/integration/context-display.test.tsx` (max 250 lines) - Context tests
- `apps/harness/tests/integration/attribution.test.tsx` (max 200 lines) - Attribution tests

**Implementation Files:**
- `apps/harness/pages/chat-context-demo.tsx` (update, max 2000 lines) - Add RAG
- `apps/harness/components/chat/RAGPanel.tsx` (max 300 lines) - RAG panel
- `apps/harness/components/chat/SourceAttribution.tsx` (max 200 lines) - Sources
- `apps/harness/components/chat/ContextRelevance.tsx` (max 150 lines) - Relevance

**Success Criteria:**
- RAG integrates seamlessly
- Context displays clearly
- Sources attributed properly
- Toggle works correctly
- UX remains smooth

---

## Phase 10: Testing and Documentation

### Sub-phase 10.1: End-to-End Testing

**Goal**: Comprehensive E2E tests for entire RAG system

#### Tasks
- [ ] Write E2E test for document upload flow
- [ ] Write E2E test for search flow
- [ ] Write E2E test for chat with RAG
- [ ] Test multi-user scenarios
- [ ] Test permission scenarios
- [ ] Test error recovery
- [ ] Test performance at scale
- [ ] Create test data generators
- [ ] Add regression test suite
- [ ] Test browser compatibility

**Test Files:**
- `packages/sdk-core/tests/e2e/upload-flow.test.ts` (max 400 lines) - Upload E2E
- `packages/sdk-core/tests/e2e/search-flow.test.ts` (max 400 lines) - Search E2E
- `packages/sdk-core/tests/e2e/chat-rag-flow.test.ts` (max 400 lines) - Chat E2E
- `packages/sdk-core/tests/e2e/multi-user.test.ts` (max 350 lines) - Multi-user tests

**Implementation Files:**
- `packages/sdk-core/tests/fixtures/test-data-generator.ts` (max 300 lines) - Data generation
- `packages/sdk-core/tests/helpers/e2e-helpers.ts` (max 250 lines) - Test helpers
- `packages/sdk-core/tests/regression/suite.ts` (max 200 lines) - Regression suite

**Success Criteria:**
- All flows work E2E
- Multi-user scenarios pass
- Performance acceptable
- No regressions
- Cross-browser compatible

### Sub-phase 10.2: Documentation

**Goal**: Create comprehensive documentation for RAG system

#### Tasks
- [ ] Write RAG Quick Start Guide
- [ ] Create API Reference documentation
- [ ] Write Integration Guide
- [ ] Document best practices
- [ ] Create troubleshooting guide
- [ ] Write performance tuning guide
- [ ] Add code examples
- [ ] Create video tutorial scripts
- [ ] Write migration guide
- [ ] Document security considerations

**Documentation Files:**
- `docs/RAG_QUICK_START.md` (max 500 lines) - Quick start guide
- `docs/RAG_API_REFERENCE.md` (max 800 lines) - API reference
- `docs/RAG_INTEGRATION_GUIDE.md` (max 600 lines) - Integration guide
- `docs/RAG_BEST_PRACTICES.md` (max 400 lines) - Best practices
- `docs/RAG_TROUBLESHOOTING.md` (max 400 lines) - Troubleshooting
- `docs/RAG_SECURITY.md` (max 300 lines) - Security guide

**Success Criteria:**
- Documentation complete
- Examples work correctly
- Covers all features
- Clear and concise
- Security documented

---

## Global Success Metrics

1. **Performance**: < 100ms search latency with 100K vectors
2. **Scalability**: Support 1M+ vectors per database
3. **Memory**: 10x reduction vs traditional approach (64MB for 100K vectors)
4. **Reliability**: 99.9% uptime with auto-recovery
5. **Security**: End-to-end encryption, zero data leaks
6. **Usability**: < 5 minutes to upload and search first document
7. **Decentralization**: 100% user data sovereignty, no central servers
8. **Code Quality**: 85%+ test coverage, all tests pass

## Risk Mitigation

1. **Performance Degradation**: Multi-level caching, lazy loading
2. **Memory Leaks**: Proper session cleanup, memory profiling
3. **Data Loss**: S5 persistence, automatic backups
4. **Security Vulnerabilities**: E2E encryption, access control
5. **API Costs**: Host-side embeddings, caching layer
6. **User Errors**: Validation, confirmation prompts
7. **Network Issues**: Retry logic, offline mode

## Timeline Estimate

- Phase 1: 6 hours (Foundation and Integration)
- Phase 2: 8 hours (Storage and Documents)
- Phase 3: 8 hours (Vector Operations)
- Phase 4: 6 hours (Embeddings)
- Phase 5: 8 hours (Session Integration)
- Phase 6: 8 hours (Multi-DB Support)
- Phase 7: 8 hours (Access Control)
- Phase 8: 6 hours (Optimization)
- Phase 9: 10 hours (UI Components)
- Phase 10: 8 hours (Testing and Docs)

**Total: ~76 hours** (10-12 days of focused development)

## Implementation Notes

- Start with MVP using OpenAI embeddings, migrate to host-side later
- Use @fabstir/vector-db-native directly, it's production-ready
- Leverage existing SessionManager and StorageManager
- Follow TDD approach strictly - tests first, then implementation
- Keep backward compatibility with non-RAG sessions
- Security and privacy are paramount
- Each sub-phase should be independently deployable
- Use existing chat-context-demo as reference implementation

## Dependencies

- @fabstir/vector-db-native (v0.1.1+) - Vector database with S5 persistence
- @noble/secp256k1 - Cryptographic operations
- @noble/ciphers - Encryption (XChaCha20-Poly1305)
- Enhanced S5.js - Decentralized storage
- OpenAI/Cohere SDKs - Initial embedding generation
- pdf-parse, mammoth - Document extraction libraries

## Validation Checklist

Before marking a sub-phase complete:
- [ ] All tests written and passing
- [ ] Code within line limits
- [ ] No modifications outside scope
- [ ] Documentation updated
- [ ] Performance benchmarks met
- [ ] Security review passed
- [ ] Integration tests passing
- [ ] Backward compatibility maintained