# Implementation Plan: Image Support for RAG Document Upload

## Overview

Enable image upload (PNG, JPEG, WebP, GIF) for RAG by leveraging the node's new `/v1/ocr` and `/v1/describe-image` endpoints (v8.6.0). Images are automatically processed to extract text for embedding and vector search.

## Status: In Progress 🔄

**Implementation**: 15% complete (~30/~205 lines)
**Target SDK Version**: 1.8.0
**Node Requirement**: v8.6.0+ (with PaddleOCR + Florence-2)

---

## Architecture: Host-Side Image Processing

**CRITICAL**: Image processing is **100% host-side**. The client sends base64-encoded images to the host's vision endpoints.

```
User Browser (Client)                    Production Node (Host)
     ↓                                         ↓
Upload Image File                              [Vision models loaded]
     ↓
Convert to Base64 (client-side)
     ↓
     ├──→ POST /v1/ocr ─────────────────────→ PaddleOCR (ONNX, CPU)
     │         ↓                                    ↓
     │    Extracted Text ←──────────────────── OCR Result + confidence
     │
     └──→ POST /v1/describe-image ──────────→ Florence-2 (ONNX, CPU)
               ↓                                    ↓
          Description ←─────────────────────── Image caption
     ↓
Combine Results (client-side)
     ↓
[Image Description]
A screenshot showing code...

[Extracted Text]
def hello_world():
    print("Hello")
     ↓
Chunk Combined Text (client-side)
     ↓
Generate Embeddings ──→ POST /v1/embed ────→ all-MiniLM-L6-v2
     ↓                                            ↓
Receive Embeddings ←── Response ←───────────── 384-dim vectors
     ↓
Continue normal RAG flow...
```

### Key Design Decision: Zero Config UX

**HostAdapter already has host context** (`hostUrl`, `chainId`) for `/v1/embed`.
Since the **same host** serves `/v1/ocr` and `/v1/describe-image`, we add `processImage()` to HostAdapter.

**UI Developer Experience** (no changes needed):
```typescript
// Existing code - works with text documents
const hostAdapter = new HostAdapter({ hostUrl: host.endpoint, chainId: 84532 });
const dm = new DocumentManager({ embeddingService: hostAdapter });
const chunks = await dm.processDocument(txtFile);  // ✅ works

// Same code - now also works with images!
const chunks = await dm.processDocument(pngFile);  // ✅ just works
```

---

## Goal

Extend DocumentManager to support image uploads that:
1. Detect image files by extension (PNG, JPEG, WebP, GIF)
2. Send images to host via HostAdapter for OCR + description
3. Combine OCR text and description for optimal RAG searchability
4. Continue normal chunking → embedding → storage flow
5. Require zero configuration changes from UI developers

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Type Definitions and Image Detection

### Sub-phase 1.1: Extend DocumentType with Image Types

**Goal**: Add image format types to the existing DocumentType union.

**Line Budget**: 15 lines (10 types + 5 tests)

#### Tasks
- [x] Write test: `detectDocumentType('image.png')` returns `'png'`
- [x] Write test: `detectDocumentType('photo.jpg')` returns `'jpeg'`
- [x] Write test: `detectDocumentType('photo.jpeg')` returns `'jpeg'`
- [x] Write test: `detectDocumentType('image.webp')` returns `'webp'`
- [x] Write test: `detectDocumentType('animation.gif')` returns `'gif'`
- [x] Add `'png' | 'jpeg' | 'webp' | 'gif'` to DocumentType union in `types.ts`
- [x] Add ImageProcessingResult interface to `types.ts`
- [x] Verify TypeScript compilation succeeds

**Test Files:**
- `packages/sdk-core/tests/unit/image-type-detection.test.ts` (NEW, ~60 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/documents/types.ts` (MODIFY, +16 lines) ✅

**Success Criteria:**
- [x] DocumentType includes: `'png' | 'jpeg' | 'webp' | 'gif'`
- [x] ImageProcessingResult interface defined with: description, extractedText, ocrConfidence, combinedText, processingTimeMs
- [x] TypeScript compilation succeeds
- [x] All detectDocumentType tests pass (completed in Sub-phase 1.2)

**Test Results:** ✅ **16/16 tests passing** (all type + detectDocumentType + isImageType tests pass)

---

### Sub-phase 1.2: Update detectDocumentType() and Add isImageType()

**Goal**: Update the detector to handle image extensions and add helper function.

**Line Budget**: 25 lines (15 implementation + 10 tests)

#### Tasks
- [x] Write test: `isImageType('png')` returns `true`
- [x] Write test: `isImageType('jpeg')` returns `true`
- [x] Write test: `isImageType('webp')` returns `true`
- [x] Write test: `isImageType('gif')` returns `true`
- [x] Write test: `isImageType('pdf')` returns `false`
- [x] Write test: `isImageType('txt')` returns `false`
- [x] Add case statements for 'png', 'jpg', 'jpeg', 'webp', 'gif' in `detectDocumentType()`
- [x] Add `isImageType(type: DocumentType): boolean` helper function
- [x] Export `isImageType` from extractors.ts
- [x] Verify all tests pass

**Test Files:**
- `packages/sdk-core/tests/unit/image-type-detection.test.ts` (EXTEND, +40 lines) ✅

**Implementation Files:**
- `packages/sdk-core/src/documents/extractors.ts` (MODIFY, +20 lines) ✅

**Success Criteria:**
- [x] `detectDocumentType()` returns correct type for all image extensions
- [x] `isImageType()` correctly identifies image vs document types
- [x] All 16 tests pass

**Test Results:** ✅ **16/16 tests passing (100%)**

---

## Phase 2: HostAdapter Image Processing Methods

### Sub-phase 2.1: Add Base64 Conversion Utility

**Goal**: Add private method to convert File ArrayBuffer to base64 string.

**Line Budget**: 20 lines (10 implementation + 10 tests)

#### Tasks
- [ ] Write test: `arrayBufferToBase64()` converts small buffer correctly
- [ ] Write test: `arrayBufferToBase64()` handles empty buffer
- [ ] Write test: `arrayBufferToBase64()` handles binary data (image bytes)
- [ ] Add private `arrayBufferToBase64(buffer: ArrayBuffer): string` method to HostAdapter
- [ ] Verify base64 output is valid (can be decoded)

**Test Files:**
- `packages/sdk-core/tests/unit/host-adapter-image.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (MODIFY, +10 lines)

**Success Criteria:**
- [ ] `arrayBufferToBase64()` produces valid base64 strings
- [ ] Works with various buffer sizes (empty, small, large)
- [ ] All 3 base64 tests pass

---

### Sub-phase 2.2: Implement callOcrEndpoint() Private Method

**Goal**: Add private method to call host's `/v1/ocr` endpoint.

**Line Budget**: 35 lines (20 implementation + 15 tests)

#### Tasks
- [ ] Write test: `callOcrEndpoint()` sends correct request format
- [ ] Write test: `callOcrEndpoint()` returns text and confidence on success
- [ ] Write test: `callOcrEndpoint()` throws on 503 (model not loaded)
- [ ] Write test: `callOcrEndpoint()` throws on 400 (invalid request)
- [ ] Write test: `callOcrEndpoint()` handles empty OCR result gracefully
- [ ] Add private `callOcrEndpoint(base64Image, format): Promise<OcrResponse>` method
- [ ] Implement POST to `${hostUrl}/v1/ocr` with correct body
- [ ] Handle response parsing and error cases
- [ ] Return `{ text, confidence, processingTimeMs }`

**Test Files:**
- `packages/sdk-core/tests/unit/host-adapter-image.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (MODIFY, +25 lines)

**Success Criteria:**
- [ ] Request includes: image (base64), format, language, chainId
- [ ] Response parsed correctly into OcrResponse type
- [ ] 503 error throws "OCR model not loaded on host"
- [ ] 400/500 errors include error message from response
- [ ] All 5 OCR tests pass

---

### Sub-phase 2.3: Implement callDescribeEndpoint() Private Method

**Goal**: Add private method to call host's `/v1/describe-image` endpoint.

**Line Budget**: 35 lines (20 implementation + 15 tests)

#### Tasks
- [ ] Write test: `callDescribeEndpoint()` sends correct request format
- [ ] Write test: `callDescribeEndpoint()` returns description on success
- [ ] Write test: `callDescribeEndpoint()` throws on 503 (model not loaded)
- [ ] Write test: `callDescribeEndpoint()` throws on 400 (invalid request)
- [ ] Write test: `callDescribeEndpoint()` handles empty description gracefully
- [ ] Add private `callDescribeEndpoint(base64Image, format): Promise<DescribeResponse>` method
- [ ] Implement POST to `${hostUrl}/v1/describe-image` with correct body
- [ ] Handle response parsing and error cases
- [ ] Return `{ description, processingTimeMs }`

**Test Files:**
- `packages/sdk-core/tests/unit/host-adapter-image.test.ts` (EXTEND, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (MODIFY, +25 lines)

**Success Criteria:**
- [ ] Request includes: image (base64), format, detail ('detailed'), chainId
- [ ] Response parsed correctly into DescribeResponse type
- [ ] 503 error throws "Florence vision model not loaded on host"
- [ ] 400/500 errors include error message from response
- [ ] All 5 describe tests pass

---

### Sub-phase 2.4: Implement processImage() Public Method

**Goal**: Add public method that calls both endpoints in parallel and combines results.

**Line Budget**: 50 lines (30 implementation + 20 tests)

#### Tasks
- [ ] Write test: `processImage()` calls both OCR and describe endpoints
- [ ] Write test: `processImage()` combines results with correct format
- [ ] Write test: `processImage()` works when only OCR succeeds
- [ ] Write test: `processImage()` works when only describe succeeds
- [ ] Write test: `processImage()` throws when BOTH endpoints fail
- [ ] Write test: `processImage()` returns correct ImageProcessingResult shape
- [ ] Add public `processImage(file: File): Promise<ImageProcessingResult>` method
- [ ] Convert file to base64 using `arrayBufferToBase64()`
- [ ] Extract format from filename
- [ ] Call both endpoints with `Promise.allSettled()`
- [ ] Implement `combineImageText()` private method
- [ ] Handle partial failures gracefully (one succeeds, one fails)
- [ ] Return ImageProcessingResult with all fields populated

**Test Files:**
- `packages/sdk-core/tests/unit/host-adapter-image.test.ts` (EXTEND, +40 lines)

**Implementation Files:**
- `packages/sdk-core/src/embeddings/adapters/HostAdapter.ts` (MODIFY, +35 lines)

**Success Criteria:**
- [ ] `processImage()` is public and callable
- [ ] Both endpoints called in parallel (not sequential)
- [ ] Combined text format: `[Image Description]\n{desc}\n\n[Extracted Text]\n{ocr}`
- [ ] Partial failures handled (one succeeds → result returned)
- [ ] Total failure throws descriptive error
- [ ] All 6 processImage tests pass

---

## Phase 3: DocumentManager Integration

### Sub-phase 3.1: Add Image Detection to processDocument()

**Goal**: Detect when file is an image and route to HostAdapter.

**Line Budget**: 30 lines (15 implementation + 15 tests)

#### Tasks
- [ ] Write test: `processDocument()` with PNG file calls `embeddingService.processImage()`
- [ ] Write test: `processDocument()` with JPEG file calls `embeddingService.processImage()`
- [ ] Write test: `processDocument()` with PDF file does NOT call `processImage()`
- [ ] Write test: `processDocument()` with TXT file does NOT call `processImage()`
- [ ] Write test: `processDocument()` throws if image file but embeddingService lacks `processImage()`
- [ ] Import `isImageType` from extractors.ts
- [ ] Add image type check at start of `processDocument()`
- [ ] Add instanceof check for HostAdapter
- [ ] Throw clear error if image but not HostAdapter
- [ ] Call `embeddingService.processImage(file)` for images

**Test Files:**
- `packages/sdk-core/tests/unit/document-manager-image.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/DocumentManager.ts` (MODIFY, +20 lines)

**Success Criteria:**
- [ ] Image files detected and routed to `processImage()`
- [ ] Non-image files continue through normal extraction
- [ ] Clear error when using OpenAI/Cohere adapter with images
- [ ] All 5 DocumentManager image tests pass

---

### Sub-phase 3.2: Complete Image Processing Flow

**Goal**: Use image text result for chunking and embedding.

**Line Budget**: 20 lines (10 implementation + 10 tests)

#### Tasks
- [ ] Write test: `processDocument()` with image returns ChunkResult[] with embeddings
- [ ] Write test: Image text is chunked correctly (not raw binary)
- [ ] Write test: Progress callback reports "Image processed" stage
- [ ] Use `imageResult.combinedText` as the text to chunk
- [ ] Report progress with OCR confidence percentage
- [ ] Continue with normal chunking → embedding flow

**Test Files:**
- `packages/sdk-core/tests/unit/document-manager-image.test.ts` (EXTEND, +20 lines)

**Implementation Files:**
- `packages/sdk-core/src/managers/DocumentManager.ts` (MODIFY, +15 lines)

**Success Criteria:**
- [ ] Image processing returns ChunkResult[] (same as documents)
- [ ] Combined text (description + OCR) is chunked
- [ ] Progress callback includes OCR confidence
- [ ] All 8 DocumentManager tests pass (5 from 3.1 + 3 new)

---

## Phase 4: Build, Test, and Verification

### Sub-phase 4.1: Build and Unit Test Verification

**Goal**: Ensure SDK builds and all unit tests pass.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Verify build succeeds without errors
- [ ] Run `cd packages/sdk-core && pnpm test`
- [ ] Verify all unit tests pass
- [ ] Check bundle size increase is reasonable (<10KB for image support)

**Success Criteria:**
- [ ] Build completes successfully
- [ ] All unit tests pass (image-type-detection, host-adapter-image, document-manager-image)
- [ ] Bundle size increase <10KB
- [ ] No TypeScript errors

---

### Sub-phase 4.2: Harness Integration Test

**Goal**: Test image upload in chat-context-rag-demo.

**Line Budget**: 10 lines (harness modification only)

#### Tasks
- [ ] Update harness file input to accept image files: `accept=".txt,.md,.html,.pdf,.png,.jpg,.jpeg,.webp,.gif"`
- [ ] Upload a test PNG image (screenshot with text)
- [ ] Verify OCR extracts text from image
- [ ] Verify description generated
- [ ] Verify combined text chunked and embedded
- [ ] Verify vectors uploaded to host session
- [ ] Test RAG query that should match image content

**Implementation Files:**
- `apps/harness/pages/chat-context-rag-demo.tsx` (MODIFY, +5 lines)

**Success Criteria:**
- [ ] Image file accepted in upload dialog
- [ ] Image processed without errors
- [ ] Chunks created from combined text
- [ ] RAG search finds relevant image content
- [ ] End-to-end flow works

---

### Sub-phase 4.3: Create SDK Tarball

**Goal**: Package SDK v1.8.0 with image support.

**Line Budget**: 0 lines (packaging only)

#### Tasks
- [ ] Update package.json version to 1.8.0
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Run `cd packages/sdk-core && pnpm pack`
- [ ] Verify tarball created: `fabstir-sdk-core-1.8.0.tgz`
- [ ] Copy to workspace root for distribution

**Success Criteria:**
- [ ] SDK version 1.8.0
- [ ] Tarball includes image processing code
- [ ] Ready for production UI integration

---

## Files Changed Summary

| File | Phase | Lines Added | Lines Modified |
|------|-------|-------------|----------------|
| `src/documents/types.ts` | 1.1 | ~10 | 1 |
| `src/documents/extractors.ts` | 1.2 | ~20 | ~5 |
| `src/embeddings/adapters/HostAdapter.ts` | 2.1-2.4 | ~95 | 0 |
| `src/managers/DocumentManager.ts` | 3.1-3.2 | ~35 | ~5 |
| `tests/unit/image-type-detection.test.ts` | 1.1-1.2 | ~45 | 0 (new) |
| `tests/unit/host-adapter-image.test.ts` | 2.1-2.4 | ~140 | 0 (new) |
| `tests/unit/document-manager-image.test.ts` | 3.1-3.2 | ~70 | 0 (new) |
| `apps/harness/pages/chat-context-rag-demo.tsx` | 4.2 | ~5 | ~2 |
| **Total** | | **~420** | **~13** |

---

## Test Coverage Target

| Test File | Tests | Status |
|-----------|-------|--------|
| `image-type-detection.test.ts` | 11 | ⬜ Pending |
| `host-adapter-image.test.ts` | 19 | ⬜ Pending |
| `document-manager-image.test.ts` | 8 | ⬜ Pending |
| **Total** | **38** | ⬜ 0/38 |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Large images slow processing | 10MB limit enforced by node |
| Host doesn't have vision models | Clear 503 error message |
| OCR returns garbage for photos | Combined with description for context |
| Network timeout on large images | Use HostAdapter's existing timeout handling |
| Using OpenAI/Cohere adapter | Clear error: "Image processing requires HostAdapter" |

---

## Not In Scope (Future Phases)

- Retry with exponential backoff for vision endpoints
- Image compression before upload
- Caching of processed images
- Progress callbacks during host processing
- Multi-language OCR selection (currently defaults to 'en')
- Custom description detail level selection
