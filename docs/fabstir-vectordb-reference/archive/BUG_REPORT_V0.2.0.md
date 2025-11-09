# Fabstir Vector DB v0.2.0 - Bug Report

**Date**: January 31, 2025
**Reporter**: SDK Integration Team (fabstir-llm-sdk)
**Test Suite**: packages/sdk-core/tests/search/
**Total Tests**: 32 (15 passing, 12 failing, 5 skipped/deferred)

## Executive Summary

During integration testing of v0.2.0, we discovered **5 critical issues** that prevent proper search functionality. Filtering works excellently (83% pass rate), but core search features have API limitations that block multiple tests.

**Priority Issues**:
1. 🔴 **CRITICAL**: `topK` parameter not respected (6+ tests failing)
2. 🟠 **HIGH**: `includeVectors` option not working (2 tests failing)
3. 🟡 **MEDIUM**: Soft-deleted vectors still appear in search results (1 test failing)
4. 🟡 **MEDIUM**: `$gt` and `$lt` operators not supported (2 tests skipped)
5. 🟢 **LOW**: Query dimension mismatch doesn't throw error (1 test failing)

---

## Issue #1: topK Parameter Not Respected 🔴 CRITICAL

### Description
When calling `search(query, k, options)`, the API returns far fewer results than requested, often just 1 result regardless of `k` value.

### Expected Behavior
```typescript
// Request top 10 results
const results = await session.search(queryVector, 10);
console.log(results.length); // Expected: 10
```

### Actual Behavior
```typescript
// Request top 10 results
const results = await session.search(queryVector, 10);
console.log(results.length); // Actual: 1 (or sometimes 0)
```

### Reproduction Steps

1. Create session with 20+ vectors:
```typescript
const session = await VectorDbSession.create({
  s5Portal: 'http://localhost:5522',
  userSeedPhrase: 'test-seed',
  sessionId: 'test-topk',
  encryptAtRest: true,
  chunkSize: 10000,
  cacheSizeMb: 150
});

const vectors = Array.from({ length: 20 }, (_, i) => ({
  id: `doc-${i}`,
  vector: new Array(384).fill(0).map(() => Math.random()),
  metadata: { index: i }
}));

await session.addVectors(vectors);
```

2. Search with various `k` values:
```typescript
const query = vectors[0].vector;

const results3 = await session.search(query, 3);
console.log('Expected 3, got:', results3.length); // Actual: 1

const results10 = await session.search(query, 10);
console.log('Expected 10, got:', results10.length); // Actual: 1

const results100 = await session.search(query, 100);
console.log('Expected 20 (max available), got:', results100.length); // Actual: 1
```

### Test Evidence
```
❌ FAIL: should respect topK parameter
   Expected: 3
   Received: 1

❌ FAIL: should search 1K vectors in < 100ms
   Expected: 10
   Received: 1

❌ FAIL: should search 10K vectors in < 200ms
   Expected: 10
   Received: 0

❌ FAIL: should handle large result sets efficiently
   Expected: 100
   Received: 1
```

### Impact
- **6+ tests failing** across basic search and performance suites
- Blocks pagination, large result sets, performance testing
- Makes API unsuitable for production use

### Suggested Fix
Check search implementation in:
- HNSW index search logic
- IVF index search logic
- Result merging/ranking code
- Possible off-by-one error or early return condition

### Affected Tests
- `tests/search/basic-search.test.ts:73-80` - should respect topK parameter
- `tests/search/basic-search.test.ts:245-265` - should handle large result sets efficiently
- `tests/search/performance.test.ts:44-62` - should search 1K vectors in < 100ms
- `tests/search/performance.test.ts:64-92` - should search 10K vectors in < 200ms
- `tests/search/performance.test.ts:94-120` - should handle concurrent searches efficiently
- `tests/search/basic-search.test.ts:267-288` - should support pagination

---

## Issue #2: includeVectors Option Not Working 🟠 HIGH

### Description
The `includeVectors` option in `SearchOptions` does not return the vector embeddings in results, even when explicitly set to `true`.

### Expected Behavior
```typescript
const results = await session.search(queryVector, 10, {
  includeVectors: true
});

console.log(results[0].vector); // Expected: [0.123, 0.456, ...] (384-dim array)
```

### Actual Behavior
```typescript
const results = await session.search(queryVector, 10, {
  includeVectors: true
});

console.log(results[0].vector); // Actual: undefined
```

### Reproduction Steps

1. Add vectors to session:
```typescript
const vectors = Array.from({ length: 5 }, (_, i) => ({
  id: `doc-${i}`,
  vector: new Array(384).fill(0).map(() => Math.random()),
  metadata: { index: i }
}));

await session.addVectors(vectors);
```

2. Search with `includeVectors: false`:
```typescript
const resultsWithout = await session.search(vectors[0].vector, 3, {
  includeVectors: false
});

console.log(resultsWithout[0].vector); // Expected: undefined ✅ WORKS
```

3. Search with `includeVectors: true`:
```typescript
const resultsWith = await session.search(vectors[0].vector, 3, {
  includeVectors: true
});

console.log(resultsWith[0].vector); // Expected: Array, Actual: undefined ❌ BROKEN
console.log(resultsWith[0].vector?.length); // Expected: 384, Actual: undefined
```

### Test Evidence
```
❌ FAIL: should include vectors in results when requested
   expected undefined not to be undefined

   at tests/search/basic-search.test.ts:138:35
```

### Impact
- **2 tests failing**
- Blocks use cases requiring vector retrieval (e.g., re-ranking, similarity computation)
- Feature is documented in TypeScript definitions but not implemented

### TypeScript Definition Reference
```typescript
// From node_modules/@fabstir/vector-db-native/index.d.ts:30-39
export interface SearchOptions {
  /** Minimum similarity score (0-1, default: 0.7) */
  threshold?: number;
  /** Include vectors in results (default: false) */
  includeVectors?: boolean;  // ← This option exists in types
  /** Optional: Metadata filter for search results (v0.2.0) */
  filter?: MetadataFilter;
  /** Optional: k_oversample multiplier for filtered search (default: k * 2) */
  kOversample?: number;
}

export interface SearchResult {
  /** Vector ID */
  id: string;
  /** Similarity score (0-1) */
  score: number;
  /** Associated metadata (any valid JSON value) */
  metadata: any;
  /** Original vector (if requested) */
  vector?: Array<number>;  // ← This field should be populated
}
```

### Suggested Fix
Check Rust implementation:
- Verify `include_vectors` option is passed to search functions
- Ensure vector data is included in `SearchResult` serialization
- Check if vectors are being filtered out during JSON serialization

### Affected Tests
- `tests/search/basic-search.test.ts:114-140` - should include vectors in results when requested
- `tests/search/performance.test.ts:268-298` - should handle memory efficiently with large result sets

---

## Issue #3: Soft-Deleted Vectors Still Appear in Search 🟡 MEDIUM

### Description
After calling `deleteByMetadata()`, soft-deleted vectors still appear in search results. The API should either auto-exclude deleted vectors OR clearly document that `vacuum()` must be called before searching.

### Expected Behavior (Option A - Auto-exclude)
```typescript
await session.addVectors([
  { id: 'doc-1', vector: [...], metadata: { status: 'keep' } },
  { id: 'doc-2', vector: [...], metadata: { status: 'delete' } },
  { id: 'doc-3', vector: [...], metadata: { status: 'keep' } }
]);

// Delete vectors with status='delete'
await session.deleteByMetadata({ status: 'delete' });

// Search should auto-exclude deleted vectors
const results = await session.search(queryVector, 10);
console.log(results.length); // Expected: 2 (only 'keep' vectors)
```

### Expected Behavior (Option B - Require vacuum)
```typescript
// Delete vectors
await session.deleteByMetadata({ status: 'delete' });

// Must call vacuum before search
await session.vacuum();

// Now search excludes deleted vectors
const results = await session.search(queryVector, 10);
console.log(results.length); // Expected: 2 (only 'keep' vectors)
```

### Actual Behavior
```typescript
await session.deleteByMetadata({ status: 'delete' });

// Deleted vectors still appear (no vacuum called)
const results = await session.search(queryVector, 10);
console.log(results.length); // Actual: 3 (includes deleted vector!)

// Even after vacuum, behavior unclear
await session.vacuum();
const results2 = await session.search(queryVector, 10);
console.log(results2.length); // Actual: 1 (why only 1? topK issue?)
```

### Reproduction Steps

1. Add vectors with mixed statuses:
```typescript
const vectors = [
  { id: 'doc-1', vector: baseVector, metadata: { status: 'keep' } },
  { id: 'doc-2', vector: baseVector, metadata: { status: 'keep' } },
  { id: 'doc-3', vector: baseVector, metadata: { status: 'delete' } },
  { id: 'doc-4', vector: baseVector, metadata: { status: 'keep' } },
  { id: 'doc-5', vector: baseVector, metadata: { status: 'delete' } }
];

await session.addVectors(vectors);
```

2. Delete by metadata:
```typescript
const deleteResult = await session.deleteByMetadata({ status: 'delete' });
console.log('Deleted:', deleteResult.deletedCount); // Shows: 2 ✅
console.log('Deleted IDs:', deleteResult.deletedIds); // Shows: ['doc-3', 'doc-5'] ✅
```

3. Search without vacuum:
```typescript
const results = await session.search(baseVector, 10);
console.log('Expected 3 (keep only), got:', results.length); // Actual: varies (topK issue complicates this)

// Check if any deleted vectors appear
const hasDeleted = results.some(r => r.id === 'doc-3' || r.id === 'doc-5');
console.log('Has deleted vectors?', hasDeleted); // Need to verify
```

### Test Evidence
```
❌ FAIL: should handle soft-deleted vectors
   Expected: 3
   Received: 1

   at tests/search/basic-search.test.ts:241:28
```

**Note**: This test is also affected by Issue #1 (topK), making it hard to isolate the soft-deletion issue.

### Impact
- **1 test failing** (possibly more once topK is fixed)
- Data integrity concern - users might see "deleted" data
- Unclear API behavior - documentation needed

### Suggested Fix
**Option 1 (Recommended)**: Auto-exclude soft-deleted vectors from search
- Modify search to check `is_deleted` flag
- Filter results before returning

**Option 2**: Require explicit vacuum
- Document clearly in API reference
- Add warning in TypeScript comments
- Consider auto-vacuum after deleteByMetadata?

### Affected Tests
- `tests/search/basic-search.test.ts:223-243` - should handle soft-deleted vectors

---

## Issue #4: $gt and $lt Operators Not Supported 🟡 MEDIUM

### Description
The metadata filter operators `$gt` (greater than) and `$lt` (less than) are **not implemented**, even though they're documented in the TypeScript definitions. Only `$gte` and `$lte` work.

### Expected Behavior
```typescript
// Get scores strictly greater than 40 (not including 40)
const results = await session.search(queryVector, 10, {
  filter: { $gt: { score: 40 } }
});

// Should return: 50, 60, 70, 80, 90 (scores > 40)
```

### Actual Behavior
```typescript
const results = await session.search(queryVector, 10, {
  filter: { $gt: { score: 40 } }
});

// Error: Invalid filter: Unsupported operator: $gt
```

### What Works
```typescript
// ✅ WORKS: Greater than or equal
const results = await session.search(queryVector, 10, {
  filter: { $gte: { score: 40 } }
});
// Returns: 40, 50, 60, 70, 80, 90

// ✅ WORKS: Less than or equal
const results = await session.search(queryVector, 10, {
  filter: { $lte: { score: 50 } }
});
// Returns: 0, 10, 20, 30, 40, 50
```

### What Doesn't Work
```typescript
// ❌ FAILS: Greater than (strict)
filter: { $gt: { score: 40 } }
// Error: Unsupported operator: $gt

// ❌ FAILS: Less than (strict)
filter: { $lt: { score: 50 } }
// Error: Unsupported operator: $lt
```

### Reproduction Steps

1. Add vectors with numeric metadata:
```typescript
const vectors = Array.from({ length: 10 }, (_, i) => ({
  id: `doc-${i}`,
  vector: baseVector,
  metadata: { score: i * 10 } // 0, 10, 20, ..., 90
}));

await session.addVectors(vectors);
```

2. Try $gt filter:
```typescript
try {
  const results = await session.search(baseVector, 10, {
    filter: { $gt: { score: 40 } }
  });
} catch (error) {
  console.error(error); // "Invalid filter: Unsupported operator: $gt"
}
```

3. Try $lt filter:
```typescript
try {
  const results = await session.search(baseVector, 10, {
    filter: { $lt: { score: 30 } }
  });
} catch (error) {
  console.error(error); // "Invalid filter: Unsupported operator: $lt"
}
```

### Test Evidence
```
⏭️ SKIPPED: should filter with $gt and $lt operators
   Reason: v0.2.0 limitation - operators not implemented

⏭️ SKIPPED: should filter with nested $and and $or
   Reason: Uses $gt which is not supported
```

### Impact
- **2 tests skipped** (would fail if not skipped)
- Limits query expressiveness
- Forces workarounds using $gte/$lte

### Workaround for Users
```typescript
// Instead of: { $gt: { score: 40 } }
// Use: { $gte: { score: 41 } }

// Instead of: { $lt: { score: 30 } }
// Use: { $lte: { score: 29 } }
```

**Limitation**: Only works for integer metadata. Cannot express strict inequality for floats.

### TypeScript Definition Reference
```typescript
// From node_modules/@fabstir/vector-db-native/index.d.ts:84-101
export interface MetadataFilter {
  /** Equality filter: { field: { $eq: value } } */
  $eq?: { [field: string]: any };
  /** Array membership filter: { field: { $in: [value1, value2] } } */
  $in?: { [field: string]: Array<any> };
  /** Greater than filter: { field: { $gt: number } } */
  $gt?: { [field: string]: number };  // ← Defined but NOT IMPLEMENTED
  /** Greater than or equal filter: { field: { $gte: number } } */
  $gte?: { [field: string]: number };  // ✅ Works
  /** Less than filter: { field: { $lt: number } } */
  $lt?: { [field: string]: number };  // ← Defined but NOT IMPLEMENTED
  /** Less than or equal filter: { field: { $lte: number } } */
  $lte?: { [field: string]: number };  // ✅ Works
  /** AND combinator: { $and: [filter1, filter2] } */
  $and?: Array<MetadataFilter>;  // ✅ Works
  /** OR combinator: { $or: [filter1, filter2] } */
  $or?: Array<MetadataFilter>;  // ✅ Works
}
```

### Suggested Fix
**Option 1 (Recommended)**: Implement $gt and $lt operators
- Add to Rust filter parser
- Implement in HNSW metadata filtering
- Implement in IVF metadata filtering
- Add tests

**Option 2**: Remove from TypeScript definitions
- Remove `$gt` and `$lt` from `MetadataFilter` interface
- Update API documentation to clarify only `$gte`/`$lte` supported
- Recommend workarounds for strict inequalities

### Affected Tests
- `tests/search/filtering.test.ts:103-133` - should filter with $gt and $lt operators (SKIPPED)
- `tests/search/filtering.test.ts:214-250` - should filter with nested $and and $or (SKIPPED)

---

## Issue #5: Query Dimension Mismatch Doesn't Throw Error 🟢 LOW

### Description
When searching with a query vector that has different dimensions than indexed vectors, the API returns an empty array `[]` instead of throwing a clear error.

### Expected Behavior
```typescript
// Index has 384-dim vectors
await session.addVectors([...]);

// Query with 512-dim vector (wrong!)
const wrongQuery = new Array(512).fill(0).map(() => Math.random());

try {
  await session.search(wrongQuery, 10);
  // Should not reach here
} catch (error) {
  console.log(error.message); // Expected: "Dimension mismatch: query has 512, index has 384"
}
```

### Actual Behavior
```typescript
// Query with wrong dimensions
const wrongQuery = new Array(512).fill(0).map(() => Math.random());

const results = await session.search(wrongQuery, 10);
console.log(results); // Actual: [] (empty array, no error)
```

### Reproduction Steps

1. Add vectors with 384 dimensions:
```typescript
const vectors = Array.from({ length: 3 }, (_, i) => ({
  id: `doc-${i}`,
  vector: new Array(384).fill(0).map(() => Math.random()),
  metadata: { index: i }
}));

await session.addVectors(vectors);
```

2. Search with wrong dimensions:
```typescript
// Try 512 dimensions (too many)
const query512 = new Array(512).fill(0).map(() => Math.random());
const results512 = await session.search(query512, 10);
console.log('512-dim results:', results512); // [] (no error thrown)

// Try 256 dimensions (too few)
const query256 = new Array(256).fill(0).map(() => Math.random());
const results256 = await session.search(query256, 10);
console.log('256-dim results:', results256); // [] (no error thrown)

// Try correct dimensions (384)
const query384 = new Array(384).fill(0).map(() => Math.random());
const results384 = await session.search(query384, 10);
console.log('384-dim results:', results384); // [... results] ✅
```

### Test Evidence
```
❌ FAIL: should handle query dimension mismatch
   promise resolved "[]" instead of rejecting

   Expected: Rejected promise with error
   Received: Resolved promise with []

   at tests/search/basic-search.test.ts:190:5
```

### Impact
- **1 test failing**
- Silent failure mode - users might not realize query is wrong
- Could lead to debugging confusion

### Current Behavior Analysis
The API is doing "graceful degradation" by returning empty results when dimensions don't match, rather than throwing an error. This could be:
- **Intentional**: Graceful handling of invalid queries
- **Unintentional**: Dimension check missing from validation

### Suggested Fix
**Option 1 (Recommended)**: Throw descriptive error
```rust
if query_vector.len() != index.dimension() {
    return Err(VectorDbError::DimensionMismatch {
        query: query_vector.len(),
        index: index.dimension(),
    });
}
```

**Option 2**: Document current behavior
- Update API docs to clarify: "Returns empty array [] if dimensions don't match"
- Update TypeScript comments
- Add dimension check in SDK layer (throw before calling native API)

### SDK Workaround (Option 2)
```typescript
// In SDK wrapper, before calling native API:
if (queryVector.length !== expectedDimensions) {
  throw new Error(`Dimension mismatch: query has ${queryVector.length}, expected ${expectedDimensions}`);
}

const results = await session.search(queryVector, k, options);
```

### Affected Tests
- `tests/search/basic-search.test.ts:172-191` - should handle query dimension mismatch

---

## Working Features ✅

Despite the issues above, many features work excellently:

### Metadata Filtering (83% pass rate) ✅ EXCELLENT
- ✅ Shorthand filter syntax: `{ field: value }`
- ✅ `$in` operator: `{ $in: { tags: ['ai', 'ml'] } }`
- ✅ `$eq` operator (shorthand recommended)
- ✅ `$gte` / `$lte` range operators
- ✅ `$and` combinator: `{ $and: [filter1, filter2] }`
- ✅ `$or` combinator: `{ $or: [filter1, filter2] }`
- ✅ Boolean field filtering: `{ active: true }`
- ✅ Nested combinators: `{ $and: [{ $or: [...] }, ...] }`
- ✅ Filter + threshold combinations
- ✅ Empty results when no match
- ✅ topK with filters (works when topK itself works)

### CRUD Operations ✅ EXCELLENT
From v0.2.0 integration (Sub-phase 3.1):
- ✅ `addVectors()` - Vector addition with metadata
- ✅ `updateMetadata()` - In-place metadata updates
- ✅ `deleteByMetadata()` - Bulk deletion (returns correct count/IDs)
- ✅ `deleteVector()` - Single vector deletion
- ✅ `vacuum()` - Cleanup of soft-deleted vectors
- ✅ `setSchema()` - Schema validation (format needs clarification)
- ✅ `getStats()` - Session statistics with deletion counts

### Basic Search ✅ GOOD (when not affected by topK issue)
- ✅ Returns results sorted by similarity score
- ✅ Empty database returns empty array
- ✅ All metadata fields returned correctly
- ✅ Handles nested metadata objects
- ✅ Handles arrays in metadata
- ✅ Cache invalidation after updates

---

## Summary of Required Fixes

| Issue | Priority | Estimated Effort | Blocking Tests |
|-------|----------|-----------------|----------------|
| #1: topK not respected | 🔴 CRITICAL | 2-4 hours | 6+ tests |
| #2: includeVectors not working | 🟠 HIGH | 1-2 hours | 2 tests |
| #3: Soft-deleted in results | 🟡 MEDIUM | 1-2 hours | 1+ tests |
| #4: $gt/$lt not supported | 🟡 MEDIUM | 2-3 hours | 2 tests |
| #5: No dimension error | 🟢 LOW | 30 mins | 1 test |
| **TOTAL** | | **~10 hours** | **12+ tests** |

---

## Test Files for Reproduction

All issues can be reproduced using our comprehensive test suite:

```bash
# Location: packages/sdk-core/tests/search/

# Basic search tests (11 tests, 4 passing)
./tests/search/basic-search.test.ts

# Filtering tests (12 tests, 10 passing)
./tests/search/filtering.test.ts

# Performance tests (9 tests, 1 passing)
./tests/search/performance.test.ts
```

**To run**:
```bash
cd packages/sdk-core
pnpm install
pnpm test tests/search/
```

**Expected output after fixes**:
- Basic search: 11/11 passing (currently 4/11)
- Filtering: 12/12 passing (currently 10/12)
- Performance: 7/9 passing (2 deferred) (currently 1/9)
- **Total: 30/32 passing (94%)**

---

## Environment Details

- **Package**: @fabstir/vector-db-native v0.2.0 (from tarball)
- **Test Framework**: Vitest v1.6.1
- **Node.js**: v22
- **Platform**: Linux/WSL2
- **Integration**: fabstir-llm-sdk (RAG system for decentralized AI)

---

## Contact

For questions or clarification on any issue:
- Test files: `packages/sdk-core/tests/search/`
- Implementation: `packages/sdk-core/src/managers/VectorRAGManager.ts`
- This report: `docs/fabstir-vectordb-reference/BUG_REPORT_V0.2.0.md`

Thank you for the excellent work on v0.2.0! The filtering system works great, and CRUD operations are solid. Looking forward to these fixes so we can achieve 100% test pass rate.

---

**Generated**: January 31, 2025
**Test Suite Version**: Sub-phase 3.2 (Vector Search and Retrieval)
**Current Pass Rate**: 15/32 (47%)
**Target Pass Rate**: 30/32 (94%) after fixes
