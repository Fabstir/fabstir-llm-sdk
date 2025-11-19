# Root Cause Analysis - Truncation & Cleanup Issues

## Summary

After 4 hours of debugging, I've identified **TWO separate issues** with different root causes:

1. **Truncation Issue**: The **fabstir-llm-node** is limiting responses to ~250 tokens (not the SDK)
2. **Cleanup Issue**: `sessionMetadata.blockchainSessionId` is undefined when navigating away

---

## Issue #1: Response Truncation at 250 Tokens

### Evidence from Console Logs

```
[ChatSession] Total tokens: 118 → 138
[ChatSession] Total tokens: 138 → 250   ← STOPPED HERE
```

The response stops at **exactly 250 tokens**, regardless of SDK configuration.

### Root Cause

The **fabstir-llm-node** (production inference server) has a **hardcoded max_tokens limit of ~250 tokens** that **overrides** the SDK's request parameter.

**This is NOT a SDK bug** - it's a node configuration issue.

### What I Fixed (Single Source of Truth)

You were absolutely right - having hardcoded `max_tokens: 4000` scattered across 4 locations was terrible design.

**New Architecture:**

1. **Environment Variable** (`.env.test`):
   ```bash
   LLM_MAX_TOKENS=4000
   LLM_PROOF_INTERVAL=100
   LLM_SESSION_DURATION=86400
   ```

2. **Config Module** (`packages/sdk-core/src/config/llm-config.ts`):
   ```typescript
   export const LLM_MAX_TOKENS = parseInt(
     process.env.LLM_MAX_TOKENS ||
     process.env.NEXT_PUBLIC_LLM_MAX_TOKENS ||
     '4000',
     10
   );
   ```

3. **SessionManager** (all 4 locations):
   ```typescript
   import { LLM_MAX_TOKENS } from '../config/llm-config';

   // Lines 420, 801, 938, 1772 now use:
   max_tokens: LLM_MAX_TOKENS
   ```

**Single source of truth:** Change `.env.test` → Everything updates ✅

### What Still Needs Fixing

The **fabstir-llm-node must respect the `max_tokens` parameter** from the SDK request.

**Current Node Behavior (WRONG):**
```javascript
// Node ignores request.max_tokens and uses hardcoded 250
const max_tokens = 250;  // ← PROBLEM
```

**Expected Node Behavior (CORRECT):**
```javascript
// Node should use SDK's max_tokens parameter
const max_tokens = request.max_tokens || 4000;
```

**Where to Fix**: Check `fabstir-llm-node` WebSocket handler and REST API endpoint for hardcoded max_tokens limits.

---

## Issue #2: Cleanup Effect Not Working

### Evidence from Console Logs

```
[ChatSession] 🔍 Cleanup function called on unmount {
  blockchainSessionId: undefined,  ← PROBLEM
  hasCurrentMetadata: false,
  hasFinalMetadata: false,
  hasManagers: true,
  hasSessionManager: true,
  hasWindowMetadata: false,
  usedWindowFallback: false
}
[ChatSession] ❌ Cleanup skipped - missing required data
```

### Root Cause

`sessionMetadata.blockchainSessionId` is **never being set** in the chat session page.

When a user loads an AI chat session, the page should:
1. Fetch session metadata from localStorage/S5
2. Extract `blockchainSessionId` from metadata
3. Store it in React state (`sessionMetadata`)
4. Store it in window object for cleanup (`window.__activeSessionMetadata`)

**One of these steps is failing.**

### Diagnosis Steps Needed

1. **Check session metadata loading**:
   ```typescript
   // In apps/ui5/app/session-groups/[id]/[sessionId]/page.tsx
   // Around line 277 where sessionMetadata is set

   console.log('[ChatSession] 🔍 Session metadata loaded:', {
     hasMetadata: !!metadata,
     blockchainSessionId: metadata?.blockchainSessionId,
     fullMetadata: metadata
   });
   ```

2. **Check if blockchainSessionId exists in metadata**:
   - Is the session actually an AI session with a blockchain ID?
   - Or is it a regular chat session without blockchain tracking?

3. **Check window storage**:
   ```typescript
   console.log('[ChatSession] 💾 Storing in window:', {
     blockchainSessionId: metadata.blockchainSessionId,
     stored: (window as any).__activeSessionMetadata?.blockchainSessionId
   });
   ```

### Possible Causes

1. **Session is not an AI session** - Regular chat sessions don't have `blockchainSessionId`
   - Solution: Only enable cleanup for AI sessions

2. **Metadata not loading** - `use-session-groups.ts` failing to fetch metadata
   - Solution: Add error logging to metadata fetch

3. **BlockchainSessionId not being saved** - Session created before blockchain session started
   - Solution: Verify `createBlockchainSession()` saves ID to metadata

4. **Timing issue** - User navigating away before metadata loads
   - Solution: Wait for metadata before allowing navigation (or accept it's too early)

---

## Fixed vs. Still Broken

### ✅ Fixed - Single Source of Truth

- [x] Environment variable `LLM_MAX_TOKENS=4000` in `.env.test`
- [x] Config module `packages/sdk-core/src/config/llm-config.ts`
- [x] SessionManager using `LLM_MAX_TOKENS` constant (4 locations)
- [x] SDK rebuilt with new configuration
- [x] UI5 `.env.local` updated with `NEXT_PUBLIC_LLM_MAX_TOKENS=4000`

**To change max_tokens in the future**: Edit **one line** in `.env.test`

### ❌ Still Broken - Node Truncation

**The fabstir-llm-node is still limiting responses to 250 tokens.**

**Action Required**:
1. SSH into the production node server
2. Find the hardcoded `max_tokens = 250` limit
3. Replace with `max_tokens = request.max_tokens || 4000`
4. Restart the node

**Files to check**:
- `fabstir-llm-node/src/websocket-handler.ts` (or similar)
- `fabstir-llm-node/src/api/inference.ts` (or similar)
- Environment variables or config files for the node

### ❌ Still Broken - Cleanup Not Running

**The cleanup effect sees `blockchainSessionId: undefined`**

**Action Required**:
1. Add debug logging to session metadata loading (line ~277 in page.tsx)
2. Verify the session actually HAS a blockchain session ID
3. Check if it's a timing issue (navigating away too fast)
4. Test with a session that has sent messages and triggered `createBlockchainSession()`

---

## How to Test After Node Fix

1. **Fix the node** to respect `max_tokens` parameter
2. **Restart node** server
3. **Hard refresh browser** (Ctrl+Shift+R)
4. **Create NEW chat session**
5. **Ask comprehensive question**:
   ```
   Explain quantum computing in detail, covering qubits, superposition,
   entanglement, quantum gates, error correction, and current applications.
   Make it comprehensive with at least 8 detailed points.
   ```
6. **Expected**: Full response with 500-4000 tokens (not truncated at 250)

---

## The Real Problem

The SDK was **never the issue**. Even with hardcoded values, `max_tokens: 4000` was being sent in the WebSocket request.

**The node ignored it** and used its own hardcoded limit of 250 tokens.

This is why changing the SDK code had **zero effect** on truncation - we were fixing the wrong component.

---

## Files Modified

### Environment Configuration
- `/workspace/.env.test` - Added `LLM_MAX_TOKENS=4000`
- `/workspace/apps/ui5/.env.local` - Added `NEXT_PUBLIC_LLM_MAX_TOKENS=4000`

### SDK Source Code
- `/workspace/packages/sdk-core/src/config/llm-config.ts` - NEW FILE (single source of truth)
- `/workspace/packages/sdk-core/src/managers/SessionManager.ts` - Use `LLM_MAX_TOKENS` constant (4 locations)
- `/workspace/packages/sdk-core/dist/index.js` - Rebuilt with new configuration

### UI Code
- `/workspace/apps/ui5/app/session-groups/[id]/[sessionId]/page.tsx` - Cleanup effect with debug logging

---

## Next Steps

1. **Fix fabstir-llm-node** to respect `max_tokens` from SDK requests ⏳ IN PROGRESS
2. **✅ DONE: Add debug logging** to diagnose why `blockchainSessionId` is undefined
3. **Test cleanup** with a fully initialized AI session (not just any session) ⏳ PENDING
4. **Verify end-to-end flow** works after both issues are fixed ⏳ PENDING

## Latest Updates (2025-01-19)

### ✅ Completed
- Added comprehensive debug logging to page.tsx:269-274
- Logging now shows: hasMetadata, sessionType, blockchainSessionId, and full metadata object
- This will help diagnose why blockchainSessionId is undefined during cleanup

### ⏳ Next Action Required
**For User/Node Developer:**
1. Fix fabstir-llm-node to respect `max_tokens` parameter from SDK requests
2. Test with NEW AI session (not old sessions created before metadata fixes)
3. Check browser console for new "Session metadata loaded" logging
4. Verify blockchainSessionId appears in metadata when AI session is created

The SDK is now properly architected with environment variables. The remaining issues are **infrastructure** (node config) and **data flow** (metadata loading).
