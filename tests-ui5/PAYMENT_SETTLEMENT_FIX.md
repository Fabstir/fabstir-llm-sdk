# Payment Settlement Fix Summary

## Issue
Test User 1 was receiving full refunds instead of paying host and treasury for AI chat sessions.

## Root Causes

### 1. No Proof Submissions (CRITICAL)
- **Problem**: `proofInterval: 1000` tokens (production default)
- **Impact**: Test messages (~100-200 tokens) never reach checkpoint
- **Result**: 0 tokens proven → 0 payment → full refund

### 2. Missing Session Duration
- **Problem**: No `duration` parameter → defaults to 3600 seconds (1 hour)
- **Impact**: Sessions expire if testing spans >1 hour
- **Result**: Expired sessions → full refund

### 3. WebSocket Not Closing Cleanly
- **Problem**: No cleanup effect when navigating away
- **Impact**: Browser abruptly closes connection
- **Result**: Node may not detect disconnect → session never completed → eventual timeout → full refund

## Fixes Applied

### Fix 1: Lower Proof Interval for Testing
**File**: `/workspace/apps/ui5/hooks/use-session-groups.ts:368`

```typescript
// BEFORE:
proofInterval: 1000, // Checkpoint every 1000 tokens

// AFTER:
proofInterval: 100, // Checkpoint every 100 tokens (testing-friendly)
```

**Why**: With 100-token intervals, even short test conversations will trigger proof submissions and proper payment distribution.

### Fix 2: Add Session Duration
**File**: `/workspace/apps/ui5/hooks/use-session-groups.ts:369`

```typescript
// ADDED:
duration: 86400, // 1 day (prevents session expiry)
```

**Why**: Matches the harness demo (`chat-context-rag-demo.tsx:70`) and prevents sessions from expiring during testing.

### Fix 3: Add WebSocket Cleanup
**File**: `/workspace/apps/ui5/app/session-groups/[id]/[sessionId]/page.tsx:336-346`

```typescript
// ADDED:
// Cleanup: Close WebSocket when navigating away from page
useEffect(() => {
  return () => {
    if (sessionMetadata?.blockchainSessionId && managers?.sessionManager) {
      const blockchainSessionId = BigInt(sessionMetadata.blockchainSessionId);
      console.log('[ChatSession] 🧹 Cleanup: Ending WebSocket session on unmount');
      managers.sessionManager.endSession(blockchainSessionId).catch(err => {
        console.error('[ChatSession] Failed to end session on cleanup:', err);
      });
    }
  };
}, [sessionMetadata, managers]);
```

**Why**: Ensures WebSocket closes cleanly when navigating away, triggering the node's automatic payment settlement process.

## How Automatic Settlement Works

From node documentation (`docs/node-reference/API.md:1883-1908`):

1. **WebSocket Disconnect** → Immediate
2. **Node Calls `completeSessionJob()`** → Automatic
3. **Blockchain Transaction** → 5-15 seconds
4. **Payment Distribution** → Same transaction:
   - Host: 90% → HostEarnings contract (`0x908962e8c6CE72610021586f85ebDE09aAc97776`)
   - Treasury: 10% → Treasury account (`0xbeaBB2a5AEd358aA0bd442dFFd793411519Bdc11`)
   - User: Unused deposit refunded

**Total Time**: ~10-20 seconds from disconnect to claimable earnings

## Testing Steps

### 1. Create New AI Session
```
1. Navigate to session group
2. Click "💎 New AI Chat"
3. Wait for host discovery
4. Deposit $2 USDC (creates blockchain job)
5. Session created successfully
```

### 2. Send Test Messages
```
1. Send: "What is the capital of France?"
2. Wait for AI response (~3s)
3. Send: "Tell me more about it"
4. Wait for AI response (~3s)
5. Total: ~200 tokens (2 proof submissions at 100-token interval)
```

### 3. Navigate Away
```
1. Click browser back button OR
2. Navigate to another page
3. Console will show: "🧹 Cleanup: Ending WebSocket session on unmount"
```

### 4. Wait for Settlement
```
Wait 10-20 seconds for blockchain confirmation
```

### 5. Check Balances
```typescript
// In browser console or via SDK:

// Host accumulated earnings (should show ~$0.36 = 200 tokens × 0.002 × 0.9)
await hostManager.getBalance(hostAddress, usdcAddress);

// Treasury accumulated fees (should show ~$0.04 = 200 tokens × 0.002 × 0.1)
await treasuryManager.getTreasuryBalance(usdcAddress);

// User refund (should show ~$1.60 = $2.00 - $0.40 used)
```

## Expected Payment Breakdown

For 200 tokens at $0.002/token (pricing: 2000):

| Party | Calculation | Amount |
|-------|-------------|--------|
| **Total Cost** | 200 × 0.002 | **$0.40** |
| Host (90%) | $0.40 × 0.9 | $0.36 |
| Treasury (10%) | $0.40 × 0.1 | $0.04 |
| User Refund | $2.00 - $0.40 | $1.60 |

## Verification

### Console Logs to Watch For:

**Session Creation**:
```
[useSessionGroups] Creating blockchain job...
[useSessionGroups] ✅ Blockchain job created: { sessionId: '123', jobId: '456' }
```

**Proof Submissions** (every 100 tokens):
```
[SessionManager] Proof submitted for 100 tokens
[SessionManager] Proof submitted for 200 tokens
```

**Navigation/Cleanup**:
```
[ChatSession] 🧹 Cleanup: Ending WebSocket session on unmount
```

**Node Settlement** (check node logs):
```
WebSocket disconnected, settling session 123
Calling completeSessionJob(123)
SessionCompleted event emitted
```

## Files Changed

1. `/workspace/apps/ui5/hooks/use-session-groups.ts` (lines 368-369)
   - Changed `proofInterval: 1000` → `100`
   - Added `duration: 86400`

2. `/workspace/apps/ui5/app/session-groups/[id]/[sessionId]/page.tsx` (lines 336-346)
   - Added WebSocket cleanup useEffect

## Status

✅ **Fixes Implemented** - Ready for testing
⏳ **Manual Testing Pending** - Awaiting user verification that host and treasury receive payment

## Reference Implementation

Working demo: `/workspace/apps/harness/pages/chat-context-rag-demo.tsx`
- Uses same `proofInterval: 100` (production uses 1000)
- Uses same `duration: 86400` (1 day)
- Has manual "End Session" button (UI5 now has automatic cleanup)

## Notes

- **Production**: Should use `proofInterval: 1000` for gas efficiency
- **Testing**: `proofInterval: 100` makes it easier to verify payment flow
- **Duration**: 86400 (1 day) is reasonable for both testing and production
- **Cleanup**: Automatic WebSocket close on navigation is required for proper settlement
