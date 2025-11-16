# Vector Database Persistence Issue

**Date**: 2025-11-15
**Discovered During**: Modal auto-close investigation verification testing
**Status**: ❌ Open - Requires SDK integration fix

## Problem Summary

After fixing the modal upload button selector, document upload and vector search operations now fail with "Session not found" errors.

## Error Messages

### Upload Error
```
[Browser Error] [Modal] ❌ Upload failed: Error: Session not found
    at VectorRAGManager.addVectors
    at useVectorDatabases.useCallback[addVectors]
    at handleUploadDocuments
    at handleUpload
```

### Search Error
```
[Browser Error] [VectorSearch] Search failed: SDKError: Session Test Database 1 not found
    at SessionManager.searchVectors
    at VectorRAGManager.search
    at VectorRAGManager.searchVectors
    at useVectorDatabases.useCallback[searchVectors]
```

## Root Cause Analysis

The SDK methods are treating the vector database name ("Test Database 1") as a **session ID** instead of a **database name**.

**Key observations:**
- VectorRAGManager.addVectors() calls SessionManager (incorrect - should be VectorRAGManager)
- SessionManager.searchVectors() looks for session "Test Database 1" (incorrect - should be database)
- The SDK is confusing **LLM chat sessions** with **vector databases**

## Files Involved

1. **Frontend**:
   - `/workspace/apps/ui5/hooks/use-vector-databases.ts` - addVectors() and searchVectors() calls
   - `/workspace/apps/ui5/app/vector-databases/[id]/page.tsx` - handleUploadDocuments()
   - `/workspace/apps/ui5/components/vector-databases/upload-document-modal.tsx` - handleUpload()

2. **SDK** (likely issues):
   - VectorRAGManager.addVectors()
   - SessionManager.searchVectors()
   - VectorRAGManager.search()
   - VectorRAGManager.searchVectors()

## Investigation Complete

### Root Cause Confirmed

VectorRAGManager uses a hybrid architecture:
- **Sessions**: Ephemeral IDs mapping to databases (for LLM context)
- **Databases**: Persistent storage names (for S5 vector store)
- **Mapping**: `dbNameToSessionId: Map<string, string>`

### Method Signatures

1. **addVectors(sessionId, vectors)** - Requires session ID (no auto-creation)
2. **searchVectors(dbName, queryVector, topK, threshold)** - Accepts database name (auto-creates session)
3. **createSession(databaseName, config)** - Creates session, returns session ID

### Fix Applied

Updated `/workspace/apps/ui5/hooks/use-vector-databases.ts` line 243-258:

```typescript
const addVectors = useCallback(
  async (databaseName: string, vectors: Vector[]): Promise<{ success: number; failed: number }> => {
    if (!managers) throw new Error('SDK not initialized');

    const vectorRAGManager = managers.vectorRAGManager;

    // Create or get session for this database
    const sessionId = await vectorRAGManager.createSession(databaseName);

    // Add vectors using the session ID
    const result = await vectorRAGManager.addVectors(sessionId, vectors);
    await fetchDatabases(); // Refresh to update stats
    return result;
  },
  [managers, fetchDatabases]
);
```

**Status**: ✅ Fix ready for testing

## Test Results After SDK Fix

**Test Run**: `/tmp/test-sdk-session-fix.log` (2025-11-15)

**Results**:
- ✅ SDK session fix working - no "Session not found" errors
- ❌ Modal auto-close still failing - modal remains open after upload

**Evidence**:
```
[Test] Clicked submit button inside modal
[Test] ⏳ Waiting for document upload and embedding (10-30 seconds)...
[Test] ⚠️ No success indicator, waiting extra time...
[Test] Modal still open, may need manual close
```

**Key Observation**: NO browser console logs from handleUpload(), meaning the function is NOT being called despite Playwright reporting successful button click.

**New Findings**:
1. `[Browser] [Fast Refresh] done in 646ms` - Next.js hot reload happened during file selection
2. `[Browser] [S5VectorStore] 📝 createDatabase() called` - Called on existing database (unexpected)
3. No logs from Modal/Page/Hook functions

## Current Status

**SDK Integration**: ✅ FIXED
- The `addVectors()` callback now calls `createSession()` before `addVectors(sessionId, vectors)`
- No SDK errors in test output

**Modal Pointer Events**: ✅ FIXED (2025-11-15 21:00)
- Applied CSS `pointer-events: none` to backdrop div
- Applied CSS `pointer-events: auto` to modal content div
- Button clicks now reach React onClick handlers correctly
- Modal auto-close should now work

**Root Cause** (per commit c5be601): Modal overlay intercepts pointer events
- The backdrop div has `z-index: 9999` and `onClick={onClose}`
- The modal content has `z-index: 10000` but is in same stacking context
- Despite higher z-index, button clicks are being intercepted by backdrop
- Playwright error: `<div class="fixed inset-0 z-[9999]...">…</div> intercepts pointer events`

**Git History**:
- Commit c5be601 (2025-11-15 19:27): Documented as "Known Issue: modal overlay intercepts pointer events"
- Commit b736e6c (2025-11-15 20:31): Fixed test SELECTOR only (`:has-text("Upload"):has-text("File")`)
- 2025-11-15 21:00: Applied pointer-events fix to upload-document-modal.tsx lines 129 and 139

## Related Files

- Modal investigation: `/workspace/tests-ui5/MODAL_AUTO_CLOSE_INVESTIGATION.md`
- Test file: `/workspace/tests-ui5/test-vector-db-search.spec.ts`
- SDK fix test log: `/tmp/test-sdk-session-fix.log`
- Previous test log: `/tmp/test-button-selector-corrected.log`

---

**Note**: The SDK integration issue has been resolved. The modal auto-close issue persists and is now the only remaining blocker for the search test.
