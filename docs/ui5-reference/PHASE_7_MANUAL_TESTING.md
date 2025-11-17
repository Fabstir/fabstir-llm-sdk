# Phase 7: Manual Testing Requirements

**Date**: 2025-11-17
**Status**: Automated tests complete (4/4 passing), manual tests pending

---

## Overview

Phase 7 Error Handling & Edge Cases includes several sub-phases that require manual testing due to complexity or need for specific environmental conditions. This document outlines the manual testing procedures for these sub-phases.

---

## Automated Tests (Complete) ✅

The following sub-phases have automated tests that are passing:

- **Sub-phase 7.3**: Error Message Display (1 test) ✅
- **Sub-phase 7.4**: File Upload Validation (1 test) ✅
- **Sub-phase 7.5**: Invalid Form Inputs (2 tests) ✅

**Automated Test File**: `/workspace/tests-ui5/test-error-handling.spec.ts`
**Results**: 4/4 tests passing (1.2 minutes)

---

## Manual Tests Required

### Sub-phase 7.1: Network Error Simulation

**Why Manual**: Requires network disconnection/manipulation that's difficult to automate reliably in Playwright.

**Test Procedure**:

1. **Setup**: Open UI5 at http://localhost:3008, connect wallet
2. **Disconnect Network**:
   - Windows: Disable network adapter OR
   - Browser DevTools → Network tab → Set to "Offline"
3. **Test Operation**: Try to create a session group
4. **Verify**:
   - Error message appears (should be user-friendly, not technical)
   - Error should mention network/connection issue
   - No stack traces visible
   - App doesn't crash
5. **Reconnect Network**: Re-enable network adapter or set DevTools to "Online"
6. **Retry Operation**: Try creating session group again
7. **Verify**: Operation succeeds after network restored

**Expected Duration**: 5 minutes

**Success Criteria**:
- ✅ User-friendly error message shown
- ✅ No technical jargon or stack traces
- ✅ App remains stable (doesn't crash)
- ✅ Retry succeeds after reconnection

---

### Sub-phase 7.2: Insufficient Gas Fees

**Why Manual**: Requires UI features that trigger blockchain transactions. Currently, UI5 does not expose deposit/withdrawal features that would require gas fees.

**Current Status**: ⚠️ **BLOCKED** - UI5 does not have blockchain transaction features exposed in the UI yet. Session groups and vector databases are S5-storage only (no gas required).

**Test Procedure** (when blockchain features are added):

1. **Setup**: Create or use test account with minimal ETH (< 0.0001 ETH)
2. **Connect Wallet**: Connect the low-balance account to UI5
3. **Test Operation**: Try to deposit funds, withdraw earnings, or perform another blockchain transaction
4. **Verify**:
   - Error message appears about insufficient funds/gas
   - Message is user-friendly (not "UNPREDICTABLE_GAS_LIMIT" or similar)
   - Suggests adding ETH to account
   - Transaction doesn't get stuck in pending state
5. **Add ETH**: Transfer 0.01 ETH to test account
6. **Retry Operation**: Try the same blockchain operation again
7. **Verify**: Operation succeeds with sufficient balance

**Expected Duration**: 10 minutes (includes ETH transfer time)

**Success Criteria**:
- ✅ Clear "insufficient funds" error message
- ✅ Helpful guidance (add ETH, amount needed)
- ✅ No stuck transactions
- ✅ Retry succeeds after adding funds

**Notes**:
- This test is specific to EOA (Externally Owned Account) wallets. Base Account Kit with gasless transactions would not encounter this error, but it's still important to test for compatibility with standard wallets.
- **Update (2025-11-17)**: Automated test attempted but UI5 does not have deposit/withdrawal features yet. Test will remain manual until blockchain transaction UI is implemented.

---

### Sub-phase 7.6: Embedding Generation Failure

**Why Manual**: Requires simulating host node failure or network disconnection during embedding generation.

**Test Procedure**:

1. **Setup**: Create session group and vector database
2. **Upload Document**: Upload document to vector database
3. **Verify Initial State**: Document shows "Pending Embeddings" badge (yellow)
4. **Start Chat Session**: Click "New Chat" to trigger embedding generation
5. **Simulate Failure**:
   - **Option A**: Disconnect internet during embedding process
   - **Option B**: Stop host node (`docker stop fabstir-host-test`)
6. **Wait for Timeout**: Wait ~30-60 seconds for embedding timeout
7. **Verify Error State**:
   - Document transitions to "Failed" status (red badge)
   - Error icon appears with tooltip on document
   - Hover over error icon shows: "Embedding generation failed: [reason]"
   - Banner shows: "Some documents failed to vectorize. Start a new session to retry."
8. **Reconnect/Restart**:
   - **Option A**: Reconnect internet
   - **Option B**: Restart host node (`docker start fabstir-host-test`)
9. **Retry**: Start new chat session
10. **Verify Recovery**:
    - Failed document retries automatically
    - Document transitions: failed → pending → processing → ready
    - Badge color changes: red → yellow → blue/green
    - Chat session can proceed once ready

**Expected Duration**: 3-5 minutes (including timeout wait)

**Success Criteria**:
- ✅ Clear error indication (red badge, error icon)
- ✅ Helpful error message in tooltip
- ✅ Retry mechanism available and functional
- ✅ Failed documents don't block other operations
- ✅ Graceful recovery on retry
- ✅ User receives clear guidance on how to proceed

**Screenshots to Capture**:
- Document in "Failed" state (red badge)
- Error tooltip on hover
- Retry in progress (yellow badge)
- Successfully recovered (green badge)

---

### Sub-phase 7.7: Large Document Timeout Handling

**Why Manual**: Requires uploading very large files (>10MB) and waiting for 2-minute timeout.

**Test Procedure**:

1. **Setup**: Create session group and vector database
2. **Prepare Large File**: Create or obtain file >10MB (e.g., 15MB PDF)
3. **Upload Document**: Upload large file to vector database
4. **Verify Initial State**: Document shows "Pending Embeddings" badge
5. **Start Chat Session**: Click "New Chat" to trigger embedding generation
6. **Monitor Progress**: Watch progress bar for 2+ minutes
7. **Wait for Timeout**: Embedding should timeout at 120 seconds (2 minutes)
8. **Verify Timeout State**:
   - Document marked as "Failed" with timeout message
   - Error tooltip: "Embedding timeout (120s). Document may be too large."
   - Banner suggestion: "Try splitting document into smaller files (< 10MB recommended)"
   - Timeout doesn't crash the app or block other operations
9. **Test Concurrent Operations**:
   - If other documents exist, verify they continue processing
   - Try creating a new chat session
   - Verify app remains responsive
10. **Retry with Smaller File**: Upload same content split into smaller files (< 10MB each)
11. **Verify Success**: Smaller files process successfully

**Expected Duration**: 4-6 minutes (includes 2-minute timeout wait)

**Success Criteria**:
- ✅ Timeout after 120 seconds for large documents
- ✅ Clear timeout message with document name
- ✅ Helpful suggestion to user (split file)
- ✅ Document marked as failed, not stuck in processing state
- ✅ App remains stable, other operations unaffected
- ✅ User can retry with smaller files

**Screenshots to Capture**:
- Large file in "Processing" state (progress bar)
- Timeout error state (red badge)
- Error tooltip with timeout message
- Banner with file splitting suggestion

---

## Summary

**Automated Tests**: 4/4 passing (7.3, 7.4, 7.5)
**Manual Tests**: 4 required (7.1, 7.2, 7.6, 7.7)

**Total Phase 7 Coverage**:
- Automated: 50% (4/8 sub-phases)
- Manual: 50% (4/8 sub-phases)
- Overall: 100% coverage planned

**Recommendation**: Perform manual tests before considering Phase 7 complete. Manual tests are important for edge cases that are difficult to automate but critical for user experience.

---

**Last Updated**: 2025-11-17
**Next Update**: After manual testing is performed
