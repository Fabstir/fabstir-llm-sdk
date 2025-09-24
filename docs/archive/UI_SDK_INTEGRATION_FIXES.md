# Fabstir LLM UI2 - SDK Integration Fixes Guide

## Overview
This document provides a comprehensive checklist and guide for fixing SDK integration issues in the fabstir-llm-ui2 codebase. Each issue includes the file location, current incorrect code, and the correct implementation.

## Reference Implementation
Use `apps/harness/pages/chat-context-demo.tsx` from the SDK repository as the definitive reference for correct SDK integration patterns.

---

## 🔴 CRITICAL FIXES (App will crash without these)

### 1. ❌ Fix PaymentManager.checkUSDCBalance() calls

**File:** `lib/providers/session-provider.tsx` (Line 138)
**File:** `hooks/use-payment.ts` (Line 41)

**Current (INCORRECT):**
```typescript
const balance = await paymentManager.checkUSDCBalance(address)
```

**Fixed (CORRECT):**
```typescript
// Get USDC token address from environment
const usdcTokenAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
const balanceStr = await paymentManager.getTokenBalance(usdcTokenAddress, address)
const balance = BigInt(balanceStr)
```

**Checklist:**
- [ ] Update session-provider.tsx line 138
- [ ] Update use-payment.ts line 41
- [ ] Ensure NEXT_PUBLIC_CONTRACT_USDC_TOKEN is in .env

---

### 2. ❌ Fix SessionManager.endSession() method

**File:** `lib/providers/session-provider.tsx` (Line 199)

**Current (INCORRECT):**
```typescript
await sessionManager.endSession(session.sessionId)
```

**Fixed (CORRECT):**
```typescript
// Need to provide total tokens and final proof
const finalProof = "0x" + "00".repeat(32) // Minimal proof for completion
const totalTokens = session.totalTokens || 100 // Minimum 100 tokens
await sessionManager.completeSession(
  session.sessionId,
  totalTokens,
  finalProof
)
```

**Checklist:**
- [ ] Replace endSession with completeSession
- [ ] Add totalTokens parameter
- [ ] Add finalProof parameter
- [ ] Consider storing actual token count in session state

---

### 3. ❌ Fix PaymentManager transfer methods

**File:** `hooks/use-payment.ts` (Line 115)

**Current (INCORRECT):**
```typescript
await paymentManager.transferUSDC(toAddress, amountInUnits.toString())
```

**Fixed (CORRECT):**
```typescript
const usdcTokenAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
await paymentManager.sendToken(
  usdcTokenAddress,
  toAddress,
  amountInUnits.toString()
)
```

**Checklist:**
- [ ] Replace transferUSDC with sendToken
- [ ] Add token address as first parameter
- [ ] Update all transfer calls

---

### 4. ❌ Fix PaymentManager approve methods

**File:** `hooks/use-payment.ts` (Line 149)

**Current (INCORRECT):**
```typescript
await paymentManager.approveUSDC(spenderAddress, amountInUnits.toString())
```

**Fixed (CORRECT):**
```typescript
const usdcTokenAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
await paymentManager.approveToken(
  usdcTokenAddress,
  spenderAddress,
  amountInUnits.toString()
)
```

**Checklist:**
- [ ] Replace approveUSDC with approveToken
- [ ] Add token address as first parameter

---

### 5. ❌ Fix PaymentManager.submitCheckpoint() parameters

**File:** `hooks/use-payment.ts` (Lines 175-179)
**File:** `lib/providers/session-provider.tsx` (Lines 240-244)

**Current (INCORRECT):**
```typescript
await paymentManager.submitCheckpoint(
  sessionId,
  tokensUsed,
  hostAddress
)
```

**Fixed (CORRECT):**
```typescript
// For user calling submitCheckpoint:
await paymentManager.submitCheckpoint(
  sessionId,
  tokensUsed,
  "0x" + "00".repeat(32) // proof data
)

// OR for host submitting (need host signer):
await paymentManager.submitCheckpointAsHost(
  sessionId,
  tokensUsed,
  "0x" + "00".repeat(32), // proof data
  hostSigner // ethers.Signer instance for host
)
```

**Checklist:**
- [ ] Determine if user or host is submitting
- [ ] Remove hostAddress parameter for user submission
- [ ] Add proof data parameter
- [ ] Use submitCheckpointAsHost if host is submitting

---

### 6. ❌ Fix TreasuryManager.getTreasuryBalance()

**File:** `hooks/use-payment.ts` (Line 70)

**Current (INCORRECT):**
```typescript
treasuryBalance = BigInt(await treasuryManager.getTreasuryBalance())
```

**Fixed (CORRECT):**
```typescript
const usdcTokenAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
treasuryBalance = await treasuryManager.getBalance(usdcTokenAddress)
```

**Checklist:**
- [ ] Replace getTreasuryBalance with getBalance
- [ ] Add token address parameter

---

### 7. ❌ Fix missing PaymentManager.releaseHostPayment()

**File:** `hooks/use-payment.ts` (Line 206)

**Current (INCORRECT):**
```typescript
await paymentManager.releaseHostPayment(sessionId, hostAmount.toString())
```

**Fixed (CORRECT):**
```typescript
// This method doesn't exist - payments are handled via completeSession
// Remove this call entirely - payment distribution happens automatically
// when session is completed with finalProof
```

**Checklist:**
- [ ] Remove releaseHostPayment calls
- [ ] Ensure completeSession is called with proper parameters

---

### 8. ❌ Fix TreasuryManager.addToTreasury()

**File:** `hooks/use-payment.ts` (Line 207)

**Current (INCORRECT):**
```typescript
await treasuryManager.addToTreasury(treasuryAmount.toString())
```

**Fixed (CORRECT):**
```typescript
// Use recordFees or deposit depending on context
await treasuryManager.recordFees(treasuryAmount)
// OR
const usdcTokenAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!
await treasuryManager.deposit(usdcTokenAddress, treasuryAmount)
```

**Checklist:**
- [ ] Replace addToTreasury with recordFees or deposit
- [ ] Add token address if using deposit

---

## 🟡 HIGH PRIORITY FIXES (Will fail at runtime)

### 9. ⚠️ Fix HostManager.getHostsForModel()

**File:** `hooks/use-hosts.ts` (Line 124)

**Current (INCORRECT):**
```typescript
const modelHosts = await hostManager.getHostsForModel(modelHash)
```

**Fixed (CORRECT):**
```typescript
const modelHosts = await hostManager.findHostsForModel(modelHash)
```

**Checklist:**
- [ ] Replace getHostsForModel with findHostsForModel

---

### 10. ⚠️ Fix ModelManager.getAllApprovedModels() response handling

**File:** `hooks/use-models.ts` (Lines 31-72)

**Current (INCORRECT):**
```typescript
const approvedModels = await modelManager.getAllApprovedModels()
// Expecting complex structure with many fields
```

**Fixed (CORRECT):**
```typescript
const approvedModels = await modelManager.getAllApprovedModels()

// ModelInfo structure from SDK is simpler, need to handle missing fields:
const transformedModels = approvedModels.map((model: any) => ({
  id: model.modelId || model.id,
  name: model.name || 'Unknown Model',
  provider: model.provider || 'Unknown',
  description: model.description || '',
  modelHash: model.modelId,

  // These fields may not exist - provide defaults:
  capabilities: ['text-generation'], // Default capability
  specs: {
    contextWindow: 8192,  // Default values
    maxTokens: 4096,
    temperature: 0.7,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
  },

  hostCount: 0,  // Will need separate query
  availability: 'medium',
  rating: 0,
  totalRuns: 0,
  pricePerToken: 200,
  currency: 'USDC',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  verified: model.approved || false,
}))
```

**Checklist:**
- [ ] Handle simpler ModelInfo structure
- [ ] Provide defaults for missing fields
- [ ] Consider fetching host count separately

---

### 11. ⚠️ Fix ModelManager.getModel()

**File:** `hooks/use-models.ts` (Line 97)

**Current (INCORRECT):**
```typescript
const model = await modelManager.getModel(modelHash)
```

**Fixed (CORRECT):**
```typescript
const model = await modelManager.getModelDetails(modelHash)
```

**Checklist:**
- [ ] Replace getModel with getModelDetails

---

### 12. ⚠️ Fix SessionManager.startSession() configuration

**File:** `lib/providers/session-provider.tsx` (Lines 146-151)

**Current (INCORRECT):**
```typescript
const { sessionId, jobId } = await sessionManager.startSession(
  modelHash,
  hostAddress,
  sessionConfig,
  hostUrl
)
```

**Fixed (CORRECT):**
```typescript
// Ensure config values are numbers, not strings or BigInt
const sessionConfig = {
  depositAmount: SESSION_DEPOSIT_AMOUNT, // Keep as string "2"
  pricePerToken: PRICE_PER_TOKEN,        // Must be number: 200
  duration: SESSION_DURATION,            // Must be number: 3600
  proofInterval: PROOF_INTERVAL,         // Must be number: 100
}

// Returns different structure
const result = await sessionManager.startSession(
  modelHash,
  hostAddress,
  sessionConfig,
  hostUrl
)

// Extract sessionId (jobId might be same as sessionId in session model)
const sessionId = result.sessionId
const jobId = result.jobId || result.sessionId
```

**Checklist:**
- [ ] Ensure config numbers are not BigInt
- [ ] Handle return value structure correctly
- [ ] jobId might be undefined or same as sessionId

---

## 🟢 MEDIUM PRIORITY FIXES

### 13. ⚠️ Add SDK disconnect to provider

**File:** `lib/providers/sdk-provider.tsx` (Lines 144-154)

**Current (MISSING):**
```typescript
const disconnect = () => {
  setIsAuthenticated(false)
  // Clear managers
  setSessionManager(null)
  // ...
}
```

**Fixed (ADD):**
```typescript
const disconnect = async () => {
  // Disconnect SDK properly
  if (sdk) {
    await sdk.disconnect()
  }

  setIsAuthenticated(false)
  // Clear managers
  setSessionManager(null)
  // ...
}
```

**Checklist:**
- [ ] Add sdk.disconnect() call
- [ ] Make disconnect async

---

### 14. ⚠️ Fix cacheSeed import

**File:** `hooks/use-wallet.ts` (Line 7)

**Current (CHECK):**
```typescript
import { cacheSeed, hasCachedSeed } from '@fabstir/sdk-core'
```

**Fixed (IF NEEDED):**
```typescript
// If these aren't exported, implement locally or request SDK update
// Check if exported first - they should be in utils/s5-seed-derivation
```

**Checklist:**
- [ ] Verify cacheSeed is exported from SDK
- [ ] If not, implement local caching or request SDK update

---

## 🔵 IMPROVEMENTS & BEST PRACTICES

### 15. 💡 Import SDK types instead of duplicating

**Files:** Various type definition files

**Current:**
```typescript
// Defining own interfaces
export interface Model { ... }
export interface Host { ... }
```

**Better:**
```typescript
import type {
  ModelInfo,
  HostInfo,
  SessionJob,
  PaymentResult
} from '@fabstir/sdk-core'

// Extend if needed
export interface UIModel extends ModelInfo {
  // Additional UI-specific fields
}
```

---

### 16. 💡 Add proper error type handling

**All files using SDK**

**Current:**
```typescript
} catch (err: any) {
  console.error('Error:', err)
}
```

**Better:**
```typescript
import { SDKError } from '@fabstir/sdk-core'

} catch (err) {
  if (err instanceof SDKError) {
    // Handle SDK-specific errors
    switch(err.code) {
      case 'NOT_AUTHENTICATED':
        // Handle auth error
        break
      case 'INSUFFICIENT_BALANCE':
        // Handle balance error
        break
    }
  }
  console.error('Error:', err)
}
```

---

### 17. 💡 Check authentication before manager calls

**All hooks**

**Add guards:**
```typescript
if (!isAuthenticated) {
  throw new Error('Must authenticate before calling this method')
}

if (!manager) {
  throw new Error('Manager not initialized')
}
```

---

## Environment Variables Checklist

Ensure all these are defined in `.env.local`:
- [ ] `NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA`
- [ ] `NEXT_PUBLIC_CHAIN_ID` (e.g., "0x14a34" for Base Sepolia)
- [ ] `NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE`
- [ ] `NEXT_PUBLIC_CONTRACT_NODE_REGISTRY`
- [ ] `NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM`
- [ ] `NEXT_PUBLIC_CONTRACT_HOST_EARNINGS`
- [ ] `NEXT_PUBLIC_CONTRACT_FAB_TOKEN`
- [ ] `NEXT_PUBLIC_CONTRACT_USDC_TOKEN`
- [ ] `NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY`
- [ ] `NEXT_PUBLIC_S5_PORTAL_URL` (optional)
- [ ] `NEXT_PUBLIC_S5_SEED_PHRASE` (optional)

---

## Testing Sequence

After making these fixes, test in this order:

1. **SDK Initialization**
   - [ ] SDK initializes without errors
   - [ ] All required contract addresses load

2. **Wallet Connection**
   - [ ] MetaMask connects successfully
   - [ ] Base Account Kit connects (if applicable)
   - [ ] Authentication completes

3. **Manager Access**
   - [ ] All managers accessible after auth
   - [ ] No undefined managers

4. **Model Discovery**
   - [ ] Models load from blockchain
   - [ ] Model details display correctly

5. **Host Discovery**
   - [ ] Hosts discovered successfully
   - [ ] Host filtering works

6. **Session Management**
   - [ ] Session starts without errors
   - [ ] Messages send successfully
   - [ ] Session completes properly

7. **Payment Operations**
   - [ ] Balance checks work
   - [ ] Token approvals succeed
   - [ ] Checkpoints submit

---

## Quick Reference: Common Method Mappings

| UI Code (Wrong) | SDK Reality (Correct) |
|----------------|----------------------|
| `checkUSDCBalance(addr)` | `getTokenBalance(token, addr)` |
| `endSession(id)` | `completeSession(id, tokens, proof)` |
| `transferUSDC(to, amt)` | `sendToken(token, to, amt)` |
| `approveUSDC(spender, amt)` | `approveToken(token, spender, amt)` |
| `getHostsForModel(model)` | `findHostsForModel(model)` |
| `getModel(id)` | `getModelDetails(id)` |
| `getTreasuryBalance()` | `getBalance(token)` |
| `releaseHostPayment()` | *(handled by completeSession)* |
| `addToTreasury(amt)` | `recordFees(amt)` |

---

## Support & Questions

If you encounter issues not covered here:
1. Check `apps/harness/pages/chat-context-demo.tsx` for working examples
2. Review the SDK source code in `packages/sdk-core/src/managers/`
3. Check return types and parameters in the actual SDK implementation

---

## 🔴 ADDITIONAL CRITICAL FIXES (Found in Deep Review)

### 18. ❌ WebSocketClient doesn't have event emitter methods

**Files:** `hooks/use-streaming.ts` (Lines 58-109), `hooks/use-chat.ts` (Lines 84-97)

**Current (INCORRECT):**
```typescript
wsClient.on('connected', () => { ... })
wsClient.on('token', (token: string) => { ... })
wsClient.on('complete', (finalMessage: string) => { ... })
wsClient.on('error', (error: Error) => { ... })
```

**Fixed (CORRECT):**
```typescript
// WebSocketClient uses onMessage() for handling messages, not .on()
const unsubscribe = wsClient.onMessage((data: any) => {
  // Handle different message types
  switch(data.type) {
    case 'stream_chunk':
      // Handle token/chunk
      if (data.content) {
        callbacksRef.current.onToken?.(data.content)
      }
      break
    case 'stream_end':
    case 'stream_complete':
      // Handle completion
      callbacksRef.current.onComplete?.(data.content || '')
      break
    case 'error':
      // Handle error
      callbacksRef.current.onError?.(new Error(data.message || 'Unknown error'))
      break
  }
})

// Store unsubscribe function for cleanup
// unsubscribe() when disconnecting
```

**Checklist:**
- [ ] Replace all .on() calls with onMessage() handler
- [ ] Handle message types via switch statement
- [ ] Store unsubscribe function for cleanup

---

### 19. ❌ WebSocketClient.stopStreaming() doesn't exist

**Files:** `hooks/use-streaming.ts` (Line 202), `hooks/use-chat.ts` (Line 200)

**Current (INCORRECT):**
```typescript
await wsClient.stopStreaming()
```

**Fixed (CORRECT):**
```typescript
// There is no stopStreaming method - just disconnect
await wsClient.disconnect()
// Or send a cancel message if the protocol supports it
await wsClient.sendMessage({ type: 'cancel_stream' })
```

**Checklist:**
- [ ] Remove stopStreaming() calls
- [ ] Use disconnect() or send cancel message

---

### 20. ❌ Not using SessionManager for sending prompts

**Files:** `lib/providers/assistant-runtime.tsx` (Lines 120-134), `hooks/use-chat.ts` (Lines 102-109)

**Current (INCORRECT):**
```typescript
// Directly using WebSocket to send prompts
await streaming.sendPrompt(fullPrompt, session.sessionId.toString(), {...})
// Or
await wsClient.sendMessage({ sessionId, prompt, ... })
```

**Fixed (CORRECT):**
```typescript
// Use SessionManager's sendPrompt or sendPromptStreaming
const response = await sessionManager.sendPrompt(
  session.sessionId,  // bigint, not string
  fullPrompt
)

// Or for streaming:
const response = await sessionManager.sendPromptStreaming(
  session.sessionId,  // bigint
  fullPrompt,
  (token: string) => {
    // Handle each token
    console.log('Token:', token)
  }
)
```

**Checklist:**
- [ ] Replace direct WebSocket calls with SessionManager methods
- [ ] Use sendPromptStreaming for streaming responses
- [ ] Pass sessionId as bigint, not string

---

### 21. ❌ session.updateMetrics is not a function

**File:** `lib/providers/assistant-runtime.tsx` (Lines 111-113)

**Current (INCORRECT):**
```typescript
if (session.updateMetrics) {
  session.updateMetrics(assistantMessage.tokens || 0)
}
```

**Fixed (CORRECT):**
```typescript
// updateMetrics is on the SessionContext, not the session object
const { updateMetrics } = useSessionContext()
// Then use:
updateMetrics(assistantMessage.tokens || 0)
```

**Checklist:**
- [ ] Get updateMetrics from useSessionContext()
- [ ] Don't expect it on session object

---

### 22. ❌ Converting BigInt sessionId to string incorrectly

**Files:** Multiple locations where `sessionId.toString()` is used

**Current (INCORRECT):**
```typescript
sessionId.toString()  // May lose precision for large BigInts
```

**Fixed (CORRECT):**
```typescript
// For display/logging:
sessionId.toString()  // OK for display

// For API calls that need string:
String(sessionId)  // Safer

// For WebSocket messages - check what format host expects:
// If host expects number format in JSON:
Number(sessionId)  // Only if sessionId fits in safe integer range

// If host expects string format:
sessionId.toString()
```

**Checklist:**
- [ ] Verify what format the host API expects
- [ ] Use appropriate conversion method

---

## 🟡 ADDITIONAL HIGH PRIORITY FIXES

### 23. ⚠️ Race condition in WebSocket connection

**File:** `hooks/use-streaming.ts` (Line 215-223)

**Current (ISSUE):**
```typescript
useEffect(() => {
  if (hostUrl) {
    connect(hostUrl).catch(console.error)
    return () => {
      disconnect()
    }
  }
}, [hostUrl])
```

**Fixed (BETTER):**
```typescript
useEffect(() => {
  let cancelled = false

  if (hostUrl) {
    connect(hostUrl)
      .then(() => {
        if (cancelled) {
          // Component unmounted, disconnect
          disconnect()
        }
      })
      .catch(console.error)
  }

  return () => {
    cancelled = true
    disconnect()
  }
}, [hostUrl])
```

**Checklist:**
- [ ] Add cancelled flag to prevent race conditions
- [ ] Check flag after async operations

---

### 24. ⚠️ Memory leak with multiple useEffect cleanups

**File:** `hooks/use-streaming.ts` (Lines 225-230)

**Current (ISSUE):**
```typescript
// Two useEffects both calling disconnect on unmount
useEffect(() => {
  return () => {
    disconnect()
  }
}, [])
```

**Fixed (BETTER):**
```typescript
// Single cleanup in the main effect
useEffect(() => {
  // Connection logic...

  return () => {
    if (wsClientRef.current) {
      disconnect()
    }
  }
}, [hostUrl]) // Only one cleanup needed
```

**Checklist:**
- [ ] Remove duplicate cleanup effects
- [ ] Ensure single cleanup pattern

---

### 25. ⚠️ Missing null checks for session fields

**Files:** Multiple files accessing session.sessionId, session.hostUrl, etc.

**Current (RISKY):**
```typescript
session.sessionId.toString()  // Can crash if sessionId is null
session.hostUrl!  // Force unwrap can crash
```

**Fixed (SAFER):**
```typescript
// Always check before use
if (!session.sessionId) {
  throw new Error('No active session')
}

// Or use optional chaining
session.sessionId?.toString() ?? ''

// Provide defaults
const hostUrl = session.hostUrl || 'ws://localhost:8080'
```

**Checklist:**
- [ ] Add null checks for all session field access
- [ ] Use optional chaining where appropriate
- [ ] Provide sensible defaults

---

### 26. ⚠️ WebSocket message handlers not cleaned up

**File:** `hooks/use-chat.ts` (Lines 84-97)

**Current (ISSUE):**
```typescript
// Message handlers added but never removed
wsClientRef.current = new WebSocketClient(session.hostUrl)
// Handlers added but no cleanup
```

**Fixed (BETTER):**
```typescript
// Store unsubscribe function
const unsubscribe = wsClient.onMessage(handler)

// Clean up in disconnect or component unmount
useEffect(() => {
  return () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current()
    }
  }
}, [])
```

**Checklist:**
- [ ] Store unsubscribe functions
- [ ] Call them in cleanup

---

## 🟢 ADDITIONAL IMPROVEMENTS

### 27. 💡 Use SessionManager instead of direct WebSocket

**Why:** The SDK provides SessionManager which handles all the complexity of sessions, checkpoints, and payments. Using WebSocket directly bypasses all this logic.

**Better Architecture:**
```typescript
// Don't create WebSocketClient directly
// Use SessionManager's methods:

// For non-streaming:
const response = await sessionManager.sendPrompt(sessionId, prompt)

// For streaming:
const response = await sessionManager.sendPromptStreaming(
  sessionId,
  prompt,
  onTokenCallback
)
```

---

### 28. 💡 Consolidate streaming logic

**Issue:** Both use-streaming.ts and use-chat.ts have overlapping WebSocket logic

**Better:** Have a single streaming provider that:
1. Uses SessionManager.sendPromptStreaming()
2. Handles all WebSocket complexity internally
3. Exposes simple interface to components

---

### 29. 💡 Type-safe environment variables

**Create a config file:**
```typescript
// lib/config.ts
const requiredEnvVars = {
  RPC_URL: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
  CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
  CONTRACT_JOB_MARKETPLACE: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE,
  // ... etc
} as const

// Validate at startup
for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`Missing required environment variable: NEXT_PUBLIC_${key}`)
  }
}

export const config = requiredEnvVars as Required<typeof requiredEnvVars>
```

---

## Testing After Additional Fixes

### WebSocket Testing:
1. [ ] Messages send without errors
2. [ ] Streaming responses display correctly
3. [ ] No duplicate messages
4. [ ] Cleanup happens on disconnect
5. [ ] No memory leaks after multiple sessions

### Session Testing:
1. [ ] Session starts with proper config
2. [ ] Prompts sent via SessionManager
3. [ ] Metrics update correctly
4. [ ] Session completes with proper cleanup

### Error Handling:
1. [ ] Null session fields don't crash app
2. [ ] WebSocket disconnections handled gracefully
3. [ ] Failed API calls show proper errors

---

*Generated: December 2024*
*SDK Version: @fabstir/sdk-core 1.0.0*
*Updated with deep review findings*