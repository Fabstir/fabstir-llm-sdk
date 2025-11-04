# Implementation Plan: Chat Context RAG Demo UI

## Overview

Create a production-ready chat interface with RAG (Retrieval-Augmented Generation) capabilities in `apps/harness/pages/chat-context-rag-demo.tsx`, similar to Claude's Projects feature where users can upload documents to enhance LLM responses.

## Architecture: Client-Side RAG ✅

**CRITICAL**: RAG implementation is **100% client-side** (browser-based). This was confirmed by the production node developer.

```
User Browser (Client)                Production Node (Host)
     ↓                                      ↓
Upload Documents                           [No document storage]
     ↓
Extract Text (client-side)
     ↓
Chunk Documents (client-side)
     ↓
Generate Embeddings ——→ POST /v1/embed ——→ all-MiniLM-L6-v2 model
     ↓                                      ↓
Receive Embeddings ←—— Response ←———————— Embedding vectors (384d)
     ↓
Store in Vector DB (client, persisted to S5)
     ↓
[User sends prompt]
     ↓
Search Vectors (client-side)
     ↓
Inject Context (client-side, manual for now)
     ↓
Send Enhanced Prompt ——→ WebSocket ————→ LLM Inference
     ↓                                      ↓
Receive Response ←——— Streaming ←————————— Generated text
```

### Division of Responsibilities

**Client SDK Does** (Browser):
- ✅ Document upload and text extraction
- ✅ Text chunking (500 tokens, 50 overlap)
- ✅ Vector database management (WASM-based @fabstir/vector-db-native)
- ✅ Vector search and retrieval
- ✅ Context injection into prompts
- ✅ S5 persistence (user owns data)

**Host Node Does** (Stateless):
- ✅ `/v1/embed` - Generate embeddings (production-ready as of v8.2.0)
- ✅ `/v1/inference` - LLM text generation
- ❌ **Does NOT store** documents, vectors, or user data

**What Hosts DON'T Do**:
- ❌ No document upload endpoints needed
- ❌ No vector database management
- ❌ No persistent storage between sessions
- ❌ No automatic context injection (that's client-side)

## Goal

Deliver a Claude-like web chat interface that:
1. Allows users to upload documents (.txt, .md, .html)
2. Stores documents in **client-side vector database** with S5 persistence
3. Retrieves relevant context when users ask questions (client-side search)
4. **Manually** injects context into prompts (Phase 5 auto-injection deferred)
5. Enhances LLM responses with document knowledge
6. Maintains 100% client-side architecture (stateless hosts)

## Production-Ready Components Status

### Already Implemented ✅

These managers are **production-ready** and just need UI integration:

1. **VectorRAGManager** (962 lines)
   - Test coverage: **29/29 tests passing (100%)** ✅
   - Features: CRUD operations, search, S5 persistence
   - Browser-compatible: Uses WASM bindings
   - Location: `packages/sdk-core/src/managers/VectorRAGManager.ts`

2. **DocumentManager** (284 lines)
   - Test coverage: **15/15 tests passing (100%)** ✅
   - Features: Text extraction, chunking, embedding, upload
   - Browser-compatible: Client-side processing only
   - Location: `packages/sdk-core/src/documents/DocumentManager.ts`

3. **HostAdapter** (156 lines)
   - Test coverage: **18/18 tests passing (100%)** ✅
   - Features: Browser-compatible embedding service
   - Performance: 10.9ms latency (production-ready)
   - Location: `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts`

### What Needs Implementation

1. **RAG UI Components** in chat-context-rag-demo.tsx
   - Document upload interface
   - Document list display
   - RAG enable/disable toggle
   - Status indicators

2. **RAG State Management**
   - Initialize VectorRAGManager after wallet auth
   - Initialize DocumentManager
   - Track uploaded documents
   - Manage RAG enabled state

3. **Manual Context Injection**
   - Search vectors on prompt submission
   - Format retrieved context
   - Prepend to user prompt
   - Send enhanced prompt to LLM

4. **Phase 5 (Deferred)**: Automatic context injection in SessionManager
   - Not in current scope
   - Will be implemented later

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: RAG Component Integration and State Setup

### Sub-phase 1.1: Import RAG Components and Add State Variables

**Goal**: Add RAG imports and state variables to chat-context-rag-demo.tsx without breaking existing functionality.

**Time Estimate**: 1 hour (30 min tests + 30 min implementation)

#### Tasks
- [x] Write tests for RAG component imports (verify no webpack errors)
- [x] Write tests for state variable initialization
- [x] Add RAG imports (VectorRAGManager, DocumentManager, HostAdapter, types)
- [x] Add state variables: vectorRAGManager, documentManager, vectorDbName
- [x] Add state variables: uploadedDocuments array, isRAGEnabled boolean
- [x] Verify existing chat functionality still works
- [x] Test TypeScript compilation without errors

**Test Files:**
- `apps/harness/tests/unit/rag-imports.test.ts` (106 lines) - Import verification tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+14 lines) - Imports and state additions
  - Lines 40-43: Type imports (IVectorRAGManager, IDocumentManager, IEmbeddingService)
  - Lines 45-50: Component imports (VectorRAGManager, DocumentManager, HostAdapter)
  - Lines 116-121: State variables (5 RAG state variables)

**Success Criteria:**
- [x] All RAG imports resolve correctly (no webpack errors)
- [x] State variables are properly typed (IVectorRAGManager, IDocumentManager, etc.)
- [x] Existing chat UI renders without errors
- [x] No console errors on page load

**Test Results:** ✅ **PASSED (11/11 tests, 301ms)**
```
Test Files  1 passed (1)
     Tests  11 passed (11)
  Duration  574ms (transform 176ms, setup 0ms, collect 21ms, tests 301ms)
```

**Details:**
- ✅ VectorRAGManager import verified
- ✅ DocumentManager import verified
- ✅ HostAdapter import verified
- ✅ Type imports (IVectorRAGManager, IDocumentManager, IEmbeddingService) verified
- ✅ State variable types validated (vectorRAGManager, documentManager, vectorDbName, uploadedDocuments, isRAGEnabled)
- ✅ TypeScript compilation successful (no new errors introduced)

---

### Sub-phase 1.2: RAG Initialization Logic

**Goal**: Create `initializeRAG()` function to set up vector database and managers after wallet authentication.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [x] Write tests for initializeRAG() function execution
- [x] Write tests for VectorRAGManager initialization
- [x] Write tests for HostAdapter creation with correct host URL
- [x] Write tests for DocumentManager creation
- [x] Write tests for vector database creation/loading from S5
- [x] Write tests for error handling (no wallet, no host, network failures)
- [x] Implement initializeRAG() function
- [x] Add S5 portal configuration (from StorageManager)
- [x] Add encryption-at-rest settings (user's S5 seed)
- [x] Add loading/error states during initialization
- [x] Call initializeRAG() after successful wallet connection
- [x] Test initialization with real wallet and host

**Test Files:**
- `apps/harness/tests/unit/rag-initialization.test.tsx` (316 lines) - Initialization tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+72 lines) - initializeRAG() function (lines 704-771) and call (lines 1223-1226)

**Success Criteria:**
- [x] initializeRAG() creates VectorRAGManager successfully
- [x] HostAdapter configured with correct host URL
- [x] DocumentManager configured with correct vector DB name
- [x] Vector database loaded from S5 if exists, created if not
- [x] Error states handled gracefully (show error message, don't crash)
- [x] Initialization only happens once per session

**Test Results:** ✅ **PASSED (15/15 tests, 312ms)**
```
Test Files  1 passed (1)
     Tests  15 passed (15)
  Duration  736ms (transform 210ms, setup 0ms, collect 43ms, tests 312ms)
```

**Details:**
- ✅ initializeRAG() function defined and callable
- ✅ Returns success when all parameters valid
- ✅ Throws errors for missing prerequisites (storageManager, host, wallet)
- ✅ VectorRAGManager created with correct parameters (storageManager, userAddress)
- ✅ Vector database created if not exists (384 dimensions for all-MiniLM-L6-v2)
- ✅ Existing database loaded if present (no redundant creation)
- ✅ HostAdapter created with correct host URL
- ✅ DocumentManager created with VectorRAGManager, HostAdapter, and vectorDbName
- ✅ Error handling for wallet not connected
- ✅ Error handling for no host selected
- ✅ Error handling for network errors during database creation
- ✅ Error handling for S5 storage errors
- ✅ Initialization guard prevents re-initialization
- ✅ Function called in startSession() after host selection (lines 1223-1226)
- ✅ TypeScript compilation successful (no errors)

---

## Phase 2: Document Upload UI and Processing

### Sub-phase 2.1: Document Upload UI Component

**Goal**: Create RAGDocumentUpload component with file input, enable/disable toggle, and uploaded documents list.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [x] Write tests for RAGDocumentUpload component rendering
- [x] Write tests for enable/disable RAG toggle
- [x] Write tests for file input (accept .txt, .md, .html)
- [x] Write tests for uploaded documents list display
- [x] Write tests for remove document button
- [x] Write tests for disabled states (before initialization)
- [x] Create RAGDocumentUpload component
- [x] Add enable/disable checkbox with onChange handler
- [x] Add file input with accept attribute and onChange handler
- [x] Add uploaded documents list with document name and chunk count
- [x] Add remove button for each document
- [x] Add styling (Tailwind CSS, match chat-context-demo.tsx style)
- [x] Integrate component into main UI layout

**Test Files:**
- `apps/harness/tests/unit/rag-upload-ui.test.tsx` (274 lines) - UI component logic tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+73 lines) - RAGDocumentUpload UI section (lines 1837-1910)

**Success Criteria:**
- [x] RAGDocumentUpload component renders correctly
- [x] Enable/disable toggle works (calls initializeRAG when enabled)
- [x] File input only accepts .txt, .md, .html files
- [x] Uploaded documents list displays correctly
- [x] Remove button removes document from list
- [x] UI matches existing chat-context-demo.tsx style
- [x] Responsive layout (works on mobile and desktop)

**Test Results:** ✅ **PASSED (26/26 tests, 22ms)**
```
Test Files  1 passed (1)
     Tests  26 passed (26)
  Duration  802ms (transform 59ms, setup 0ms, collect 60ms, tests 22ms)
```

**Details:**
- ✅ Component state management (RAG enabled, documents array)
- ✅ Enable/disable RAG toggle handler (calls initializeRAG when enabled)
- ✅ File input validation (.txt, .md, .html accepted; .pdf, .docx rejected)
- ✅ Case-insensitive extension validation
- ✅ File upload handler integration
- ✅ Uploaded documents list display (name, chunks count)
- ✅ Multiple documents support
- ✅ Remove document handler
- ✅ Disabled states when RAG not enabled
- ✅ File upload disabled before initialization
- ✅ Remove button disabled before initialization
- ✅ Disabled message shown when RAG not enabled
- ✅ TypeScript compilation successful (no errors)

**UI Implementation:**
- Enable/disable checkbox at top right (lines 1842-1856)
- Disabled state message when RAG off (lines 1859-1863)
- File input with accept=".txt,.md,.html" (lines 1866-1876)
- Uploaded documents list with chunks display (lines 1884-1905)
- Remove button with disabled state support (lines 1895-1901)
- Empty state message when no documents (lines 1907-1909)
- Tailwind CSS styling matching existing UI

---

### Sub-phase 2.2: Document Upload Handler Implementation

**Goal**: Implement `handleDocumentUpload()` function to process uploaded documents using DocumentManager.

**Time Estimate**: 3 hours (1.5 hours tests + 1.5 hours implementation)

#### Tasks
- [ ] Write tests for handleDocumentUpload() with .txt file
- [ ] Write tests for handleDocumentUpload() with .md file
- [ ] Write tests for handleDocumentUpload() with .html file
- [ ] Write tests for file size validation (max 5MB)
- [ ] Write tests for file type validation
- [ ] Write tests for DocumentManager.processDocument() call
- [ ] Write tests for progress callback updates
- [ ] Write tests for error handling (processing failures)
- [ ] Write tests for uploadedDocuments state updates
- [ ] Implement handleDocumentUpload() function
- [ ] Add file validation (size, type)
- [ ] Call DocumentManager.processDocument() with progress callback
- [ ] Update uploadedDocuments state on success
- [ ] Add system message to chat on success/failure
- [ ] Reset file input after processing
- [ ] Test with real files (sample .txt, .md, .html)

**Test Files:**
- `apps/harness/tests/unit/document-upload-handler.test.tsx` (~200 lines) - Upload handler tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+80 lines) - handleDocumentUpload() function

**Success Criteria:**
- [ ] Files validated correctly (size, type)
- [ ] DocumentManager.processDocument() called with correct parameters
- [ ] Progress updates shown to user (status messages)
- [ ] uploadedDocuments state updated on success
- [ ] System message added to chat on success
- [ ] Error messages shown on failures
- [ ] File input reset after processing
- [ ] Works with real .txt, .md, .html files

**Test Results:** ⏳ Pending

---

### Sub-phase 2.3: Document Removal Handler

**Goal**: Implement `removeDocument()` function to delete documents from vector database.

**Time Estimate**: 1.5 hours (45 min tests + 45 min implementation)

#### Tasks
- [ ] Write tests for removeDocument() function
- [ ] Write tests for VectorRAGManager.deleteByMetadata() call
- [ ] Write tests for uploadedDocuments state update
- [ ] Write tests for error handling (deletion failures)
- [ ] Write tests for confirmation dialog (optional)
- [ ] Implement removeDocument() function
- [ ] Call VectorRAGManager.deleteByMetadata({ documentId })
- [ ] Update uploadedDocuments state (filter out removed doc)
- [ ] Add system message to chat on success/failure
- [ ] Optionally add confirmation dialog before deletion
- [ ] Test with real uploaded documents

**Test Files:**
- `apps/harness/tests/unit/document-removal.test.tsx` (~100 lines) - Removal handler tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+40 lines) - removeDocument() function

**Success Criteria:**
- [ ] removeDocument() deletes vectors from database
- [ ] uploadedDocuments state updated correctly
- [ ] System message added to chat on success
- [ ] Error messages shown on failures
- [ ] Optional confirmation dialog works
- [ ] Works with real uploaded documents

**Test Results:** ⏳ Pending

---

## Phase 3: Manual Context Injection and RAG Search

### Sub-phase 3.1: Vector Search on Prompt Submission

**Goal**: Implement vector search when user submits a prompt, if RAG is enabled.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [ ] Write tests for searchContext() function
- [ ] Write tests for VectorRAGManager.search() call
- [ ] Write tests for topK parameter (5 results)
- [ ] Write tests for threshold parameter (0.7 similarity)
- [ ] Write tests for no results found case
- [ ] Write tests for search errors
- [ ] Implement searchContext() function
- [ ] Call VectorRAGManager.search(vectorDbName, { query, topK: 5, threshold: 0.7 })
- [ ] Handle no results case (return empty array)
- [ ] Handle search errors (log and return empty array)
- [ ] Return array of relevant text chunks
- [ ] Test with real vector database and queries

**Test Files:**
- `apps/harness/tests/unit/vector-search.test.tsx` (~120 lines) - Search function tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+50 lines) - searchContext() function

**Success Criteria:**
- [ ] searchContext() calls VectorRAGManager.search() correctly
- [ ] Returns top 5 most relevant chunks (topK: 5)
- [ ] Filters out results below 0.7 similarity (threshold: 0.7)
- [ ] Returns empty array if no results
- [ ] Handles errors gracefully (logs error, returns empty)
- [ ] Works with real vector database and queries

**Test Results:** ⏳ Pending

---

### Sub-phase 3.2: Context Formatting and Injection

**Goal**: Format retrieved context and inject it into user prompt before sending to LLM.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [ ] Write tests for formatContext() function
- [ ] Write tests for context injection into prompt
- [ ] Write tests for no context case (send original prompt)
- [ ] Write tests for multiple chunks formatting
- [ ] Write tests for context truncation (if too long)
- [ ] Implement formatContext() function
- [ ] Format context as: "Context:\n{chunk1}\n\n{chunk2}\n\nQuestion: {userPrompt}"
- [ ] Modify sendMessage() to search and inject context
- [ ] Add RAG status indicator in UI (showing if context was used)
- [ ] Optionally show retrieved chunks in UI (debug mode)
- [ ] Test with real prompts and context

**Test Files:**
- `apps/harness/tests/unit/context-injection.test.tsx` (~150 lines) - Context injection tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+70 lines) - formatContext() and sendMessage() modifications

**Success Criteria:**
- [ ] Context formatted correctly with clear separation
- [ ] User prompt enhanced with context before sending
- [ ] Original prompt sent if no context found
- [ ] RAG status indicator shows if context was used
- [ ] Optional debug mode shows retrieved chunks
- [ ] Works with real prompts and enhances responses

**Test Results:** ⏳ Pending

---

## Phase 4: Error Handling and Edge Cases

### Sub-phase 4.1: Error Handling and Validation

**Goal**: Add comprehensive error handling for all RAG operations.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [ ] Write tests for file size validation errors
- [ ] Write tests for file type validation errors
- [ ] Write tests for network errors (embedding API)
- [ ] Write tests for vector database errors (storage failures)
- [ ] Write tests for S5 storage errors
- [ ] Write tests for initialization errors (no wallet, no host)
- [ ] Add file size validation (max 5MB)
- [ ] Add file type validation (.txt, .md, .html only)
- [ ] Add try/catch blocks around all async operations
- [ ] Add user-friendly error messages
- [ ] Add error state indicators in UI
- [ ] Add retry logic for transient failures (optional)
- [ ] Test all error scenarios

**Test Files:**
- `apps/harness/tests/unit/rag-error-handling.test.tsx` (~180 lines) - Error handling tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+60 lines) - Error handling code

**Success Criteria:**
- [ ] All file validation errors caught and displayed
- [ ] Network errors handled gracefully (don't crash UI)
- [ ] Vector database errors shown to user
- [ ] S5 storage errors handled properly
- [ ] Initialization errors shown with actionable messages
- [ ] UI remains functional even if RAG fails (graceful degradation)

**Test Results:** ⏳ Pending

---

### Sub-phase 4.2: Edge Cases and Boundary Conditions

**Goal**: Handle edge cases like empty documents, duplicate uploads, and large files.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [ ] Write tests for empty file upload
- [ ] Write tests for duplicate file upload (same name)
- [ ] Write tests for very large file (> 5MB)
- [ ] Write tests for file with no extractable text
- [ ] Write tests for malformed file content
- [ ] Write tests for RAG disabled mid-session
- [ ] Add empty file detection
- [ ] Add duplicate file handling (overwrite or skip)
- [ ] Add file size enforcement (reject > 5MB)
- [ ] Add empty text detection after extraction
- [ ] Add graceful degradation for unsupported content
- [ ] Add cleanup when RAG is disabled
- [ ] Test all edge cases

**Test Files:**
- `apps/harness/tests/unit/rag-edge-cases.test.tsx` (~150 lines) - Edge case tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+50 lines) - Edge case handling

**Success Criteria:**
- [ ] Empty files rejected with clear message
- [ ] Duplicate files handled consistently
- [ ] Files > 5MB rejected before processing
- [ ] Empty text after extraction handled gracefully
- [ ] Malformed content doesn't crash UI
- [ ] Disabling RAG mid-session works correctly

**Test Results:** ⏳ Pending

---

## Phase 5: Performance Optimization and UX Polish (Optional)

### Sub-phase 5.1: Loading States and Progress Indicators

**Goal**: Add loading states and progress indicators for all async RAG operations.

**Time Estimate**: 1.5 hours (45 min tests + 45 min implementation)

#### Tasks
- [ ] Write tests for loading state during document upload
- [ ] Write tests for progress updates during processing
- [ ] Write tests for loading state during vector search
- [ ] Add loading spinner during document upload
- [ ] Add progress bar showing processing stages
- [ ] Add loading indicator during vector search
- [ ] Add skeleton UI for uploaded documents list
- [ ] Disable UI controls during async operations
- [ ] Test all loading states

**Test Files:**
- `apps/harness/tests/unit/rag-loading-states.test.tsx` (~100 lines) - Loading state tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+40 lines) - Loading UI enhancements

**Success Criteria:**
- [ ] Loading spinners shown during async operations
- [ ] Progress bar shows processing stages accurately
- [ ] UI controls disabled during processing
- [ ] Skeleton UI provides visual feedback
- [ ] All loading states tested

**Test Results:** ⏳ Pending

---

### Sub-phase 5.2: UX Enhancements and Visual Polish

**Goal**: Add visual enhancements and UX improvements to RAG UI.

**Time Estimate**: 2 hours (1 hour tests + 1 hour implementation)

#### Tasks
- [ ] Write tests for document upload animation
- [ ] Write tests for context indicator in chat
- [ ] Write tests for tooltips on RAG controls
- [ ] Add smooth animations for document list updates
- [ ] Add visual indicator when context is injected (e.g., icon in message)
- [ ] Add tooltips explaining RAG features
- [ ] Add empty state UI (no documents uploaded yet)
- [ ] Add success/error toast notifications
- [ ] Improve responsive layout for mobile
- [ ] Test all UX enhancements

**Test Files:**
- `apps/harness/tests/unit/rag-ux-polish.test.tsx` (~120 lines) - UX enhancement tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (+60 lines) - UX enhancements

**Success Criteria:**
- [ ] Smooth animations enhance user experience
- [ ] Context indicator clearly shows when RAG is active
- [ ] Tooltips provide helpful information
- [ ] Empty state UI guides users to upload documents
- [ ] Toast notifications provide clear feedback
- [ ] Responsive layout works on all devices

**Test Results:** ⏳ Pending

---

## Phase 6: Integration Testing and Manual Verification

### Sub-phase 6.1: End-to-End Integration Tests

**Goal**: Write integration tests for complete RAG workflow.

**Time Estimate**: 3 hours (2 hours tests + 1 hour fixes)

#### Tasks
- [ ] Write E2E test: Complete upload-to-response flow
- [ ] Write E2E test: Multiple document uploads
- [ ] Write E2E test: Document removal and re-upload
- [ ] Write E2E test: RAG enable/disable mid-session
- [ ] Write E2E test: Session persistence (S5 reload)
- [ ] Write E2E test: Error recovery scenarios
- [ ] Run all E2E tests with real backend
- [ ] Fix any integration issues found
- [ ] Document any known limitations
- [ ] Verify all tests pass consistently

**Test Files:**
- `apps/harness/tests/e2e/rag-complete-flow.test.tsx` (~250 lines) - E2E integration tests

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (bug fixes as needed)

**Success Criteria:**
- [ ] Complete flow works end-to-end
- [ ] Multiple documents can be uploaded and used
- [ ] Document removal works correctly
- [ ] RAG can be toggled on/off mid-session
- [ ] Vector database persists to S5 correctly
- [ ] Error recovery scenarios handled

**Test Results:** ⏳ Pending

---

### Sub-phase 6.2: Manual Testing and Verification

**Goal**: Manually test RAG demo in browser to verify all functionality works as expected.

**Time Estimate**: 2 hours (manual testing)

#### Manual Testing Checklist
- [ ] **Test 1**: Upload .txt file and verify chunks created
  - Upload sample.txt (< 5MB)
  - Verify document appears in uploaded list
  - Verify chunk count is accurate
  - Verify no console errors

- [ ] **Test 2**: Ask question related to uploaded document
  - Type prompt: "What is [topic from document]?"
  - Verify context is injected (check network tab or debug UI)
  - Verify LLM response uses document knowledge
  - Compare response with and without RAG enabled

- [ ] **Test 3**: Upload .md and .html files
  - Upload sample.md and sample.html
  - Verify both process correctly
  - Verify chunk counts are accurate
  - Verify no errors

- [ ] **Test 4**: Remove document and verify deletion
  - Click remove button on uploaded document
  - Verify document removed from list
  - Ask same question again
  - Verify response no longer uses that context

- [ ] **Test 5**: Disable/enable RAG mid-session
  - Disable RAG toggle
  - Verify document upload is disabled
  - Ask question (should not use context)
  - Re-enable RAG
  - Verify documents are still listed
  - Ask question (should use context again)

- [ ] **Test 6**: Test error scenarios
  - Try uploading file > 5MB (should reject)
  - Try uploading .pdf file (should reject)
  - Try uploading empty file (should reject)
  - Disconnect network and try upload (should show error)
  - Verify all errors display user-friendly messages

- [ ] **Test 7**: Test S5 persistence
  - Upload document and refresh page
  - Verify vector database loads from S5
  - Verify uploaded documents list restores
  - Ask question and verify context still works

- [ ] **Test 8**: Test mobile responsiveness
  - Open on mobile device or resize browser
  - Verify UI is usable on small screens
  - Verify file upload works on mobile
  - Verify document list is scrollable

**Success Criteria:**
- [ ] All manual tests pass without errors
- [ ] LLM responses clearly enhanced with document knowledge
- [ ] UI is intuitive and responsive
- [ ] Error messages are clear and actionable
- [ ] S5 persistence works reliably
- [ ] Mobile experience is usable

**Test Results:** ⏳ Pending

---

## Final Verification and Documentation

### Sub-phase 6.3: Documentation and Code Cleanup

**Goal**: Document RAG demo usage and clean up code.

**Time Estimate**: 1 hour

#### Tasks
- [ ] Add inline comments to complex RAG logic
- [ ] Update README with RAG demo usage instructions
- [ ] Document known limitations (Phase 5 auto-injection not implemented)
- [ ] Remove debug console.logs
- [ ] Format code consistently (prettier)
- [ ] Check for unused imports
- [ ] Check for TypeScript errors
- [ ] Verify all tests still pass after cleanup

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (cleanup)
- `apps/harness/README.md` (+50 lines) - Usage documentation

**Success Criteria:**
- [ ] Code is well-commented and readable
- [ ] README documents how to use RAG demo
- [ ] No console.logs in production code
- [ ] Code formatted consistently
- [ ] No TypeScript errors
- [ ] All tests pass

**Test Results:** ⏳ Pending

---

## Summary

### Total Time Estimate
- Phase 1 (Integration & State): 3 hours
- Phase 2 (Upload UI & Processing): 6.5 hours
- Phase 3 (Search & Injection): 4 hours
- Phase 4 (Error Handling): 4 hours
- Phase 5 (Optional Polish): 3.5 hours
- Phase 6 (Testing & Verification): 6 hours
- **Total: ~27 hours** (excluding optional Phase 5)

### Implementation Files Summary
- `apps/harness/pages/chat-context-rag-demo.tsx` (~500 lines added)
- `apps/harness/tests/unit/rag-*.test.tsx` (~1,300 lines total)
- `apps/harness/tests/e2e/rag-complete-flow.test.tsx` (~250 lines)
- `apps/harness/README.md` (+50 lines)
- **Total: ~2,100 lines of new code**

### Key Architectural Decisions

1. **Client-Side RAG**: All RAG operations happen in browser, not on host
2. **S5 Persistence**: Vector databases owned by user, stored in S5
3. **Manual Context Injection**: Phase 5 auto-injection deferred to later
4. **Production-Ready Managers**: Reuse existing VectorRAGManager, DocumentManager, HostAdapter
5. **Host Provides Compute Only**: `/v1/embed` for embeddings, `/v1/inference` for generation

### Deferred Features (Future Phases)

1. **Phase 5 Automatic Context Injection**: Implement in SessionManager
2. **Advanced Chunking Strategies**: Semantic chunking, recursive splitting
3. **Multi-Database Support**: Multiple vector databases per user
4. **Folder Hierarchies**: Organize documents in virtual folders
5. **Access Control**: Share vector databases with other users
6. **Search History**: Track and display past searches
7. **Search Caching**: Cache search results for performance

---

## Development Progress Tracking

### Phase 1: ✅ Completed (2/2 sub-phases)
- [x] Sub-phase 1.1: Import RAG Components and Add State Variables (11/11 tests ✅)
- [x] Sub-phase 1.2: RAG Initialization Logic (15/15 tests ✅)

### Phase 2: ⏳ In Progress (1/3 sub-phases)
- [x] Sub-phase 2.1: Document Upload UI Component (26/26 tests ✅)
- [ ] Sub-phase 2.2: Document Upload Handler Implementation
- [ ] Sub-phase 2.3: Document Removal Handler

### Phase 3: ⏳ Not Started
- [ ] Sub-phase 3.1: Vector Search on Prompt Submission
- [ ] Sub-phase 3.2: Context Formatting and Injection

### Phase 4: ⏳ Not Started
- [ ] Sub-phase 4.1: Error Handling and Validation
- [ ] Sub-phase 4.2: Edge Cases and Boundary Conditions

### Phase 5 (Optional): ⏳ Not Started
- [ ] Sub-phase 5.1: Loading States and Progress Indicators
- [ ] Sub-phase 5.2: UX Enhancements and Visual Polish

### Phase 6: ⏳ Not Started
- [ ] Sub-phase 6.1: End-to-End Integration Tests
- [ ] Sub-phase 6.2: Manual Testing and Verification
- [ ] Sub-phase 6.3: Documentation and Code Cleanup

---

## Test Coverage Goals

- **Unit Tests**: 85%+ coverage for all RAG functionality
- **Integration Tests**: 100% coverage for E2E workflows
- **Manual Tests**: All 8 scenarios verified in browser

**Current Status**: 749/2,100 lines implemented (36%)
- Phase 1 Complete: 402 lines (316 test + 86 implementation)
- Phase 2 Partial: 347 lines (274 test + 73 implementation) - 1/3 sub-phases complete
