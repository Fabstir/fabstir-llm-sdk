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

## Investigation Needed

1. **Verify SDK method signatures**:
   - Check what parameters VectorRAGManager.addVectors() expects
   - Check what parameters VectorRAGManager.searchVectors() expects
   - Verify if database name or session ID should be passed

2. **Check SDK Core source**:
   - Look at `/workspace/packages/sdk-core/src/managers/VectorRAGManager.ts`
   - Check if there's confusion between session IDs and database names

3. **Review SessionManager usage**:
   - SessionManager should handle LLM chat sessions
   - VectorRAGManager should handle vector database operations
   - Verify they're not incorrectly mixing concerns

4. **Test with correct parameters**:
   - Try passing a session ID if that's what's expected
   - Or fix SDK to accept database names instead

## Related Files

- Modal investigation: `/workspace/tests-ui5/MODAL_AUTO_CLOSE_INVESTIGATION.md`
- Test file: `/workspace/tests-ui5/test-vector-db-search.spec.ts`
- Test log: `/tmp/test-button-selector-corrected.log`

---

**Note**: This issue is **separate** from the modal auto-close issue, which has been successfully resolved. The modal now correctly calls handleUpload(), but the upload fails due to this SDK integration issue.
