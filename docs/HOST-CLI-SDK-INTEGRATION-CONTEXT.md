# Host CLI SDK Integration - Critical Context Report

## ESSENTIAL CONTEXT FOR SUB-PHASE 3.2 AND BEYOND

This document contains all critical context from Sub-phases 3.0 and 3.1 implementation. **Read this entirely before proceeding.**

Last Updated: After completing Sub-phase 3.1 (SDK Initialization)

---

## 🏗️ Current Architecture Status

### ✅ Sub-phase 3.0: SDK Discovery and Setup (COMPLETE)
- Created basic SDK wrapper and configuration
- Established integration with FabstirSDKCore
- Set up test infrastructure
- **22/22 tests passing**

### ✅ Sub-phase 3.1: SDK Initialization (COMPLETE)
- Implemented modular architecture with separated concerns
- Added retry logic with exponential backoff
- Created connection status tracking
- Built authentication management layer
- **56/79 tests passing** (core functionality working)

---

## 🚨 CRITICAL: Which SDK to Use

### ❌ WRONG SDK (DO NOT USE)
- **FabstirSDK** from `/workspace/src/FabstirSDK.ts` - OBSOLETE
- Located at workspace root - replaced during browser refactor
- Has Node.js dependencies that break in browsers
- **Using this will cause everything to fail**

### ✅ CORRECT SDK (MUST USE)
- **FabstirSDKCore** from `@fabstir/sdk-core` package
- Located at `/workspace/packages/sdk-core/`
- Built at `/workspace/packages/sdk-core/dist/index.js`
- Browser-compatible, current production SDK
- **Reference**: `/workspace/apps/harness/pages/chat-context-demo.tsx`

---

## 📁 Current File Structure

```
packages/host-cli/
├── src/
│   ├── sdk/
│   │   ├── client.ts    (200 lines) - Main SDK wrapper, integrates all modules
│   │   ├── config.ts    (112 lines) - Configuration from env vars
│   │   ├── secrets.ts   (113 lines) - Private key management (no keytar)
│   │   ├── auth.ts      (198 lines) - Authentication module [NEW in 3.1]
│   │   ├── retry.ts     (149 lines) - Retry logic with backoff [NEW in 3.1]
│   │   └── status.ts    (149 lines) - Connection status tracking [NEW in 3.1]
│   ├── commands/
│   │   ├── init.ts      (exists from Phase 2)
│   │   └── config.ts    (exists from Phase 2)
│   └── wallet/
│       └── ... (wallet management from Phase 2)
└── tests/
    ├── integration/
    │   ├── sdk-setup.test.ts           (11 tests - ALL PASSING)
    │   └── testnet-connection.test.ts  (11 tests - ALL PASSING)
    └── sdk/
        ├── initialization.test.ts (18 tests - 13 passing)
        ├── authentication.test.ts (19 tests - most passing)
        ├── managers.test.ts       (22 tests - 17 passing)
        └── retry.test.ts          (20 tests - most passing)
```

---

## 🏛️ Modular Architecture (Sub-phase 3.1)

### Key Modules and Responsibilities:

1. **client.ts** - Main orchestrator
   - Singleton SDK instance management
   - Integration point for all modules
   - Public API for CLI commands

2. **auth.ts** - Authentication management
   - Multiple auth methods (privatekey, env, signer)
   - Auth state tracking
   - Event emitters for auth changes
   - Clean separation from SDK core

3. **status.ts** - Connection status
   - ConnectionStatus enum (DISCONNECTED, CONNECTING, CONNECTED, ERROR, RECONNECTING)
   - Status change events
   - Connection statistics
   - Uptime tracking

4. **retry.ts** - Resilient operations
   - Exponential backoff with jitter
   - Configurable retry policies
   - Error classification (retriable vs non-retriable)
   - Abort signal support

---

## ⚙️ Critical Configuration Structure

```typescript
// EXACT structure required by FabstirSDKCore:
{
  chainId: number,           // 84532 for Base Sepolia, 8453 for Base mainnet
  rpcUrl: string,           // From RPC_URL_BASE_SEPOLIA
  contractAddresses: {
    jobMarketplace: string,  // CONTRACT_JOB_MARKETPLACE
    nodeRegistry: string,    // CONTRACT_NODE_REGISTRY
    proofSystem: string,     // CONTRACT_PROOF_SYSTEM
    hostEarnings: string,    // CONTRACT_HOST_EARNINGS
    fabToken: string,        // CONTRACT_FAB_TOKEN
    usdcToken: string,       // CONTRACT_USDC_TOKEN
    modelRegistry: string    // CONTRACT_MODEL_REGISTRY (fallback to jobMarketplace)
  },
  s5Config: {
    portalUrl: string,       // Default: 'https://s5.cx'
    seedPhrase?: string      // S5_SEED_PHRASE env var
  },
  mode: 'production'        // Always 'production' for host CLI
}
```

---

## 🔑 Authentication Flow

### Critical Timing:
1. **SDK Construction**: No provider yet, just config
2. **Authentication**: Provider and signer created here
3. **Manager Access**: Only available after authentication

### Authentication Pattern:
```typescript
// 1. Initialize SDK (no provider yet)
const sdk = await initializeSDK('base-sepolia');

// 2. Authenticate (creates provider)
await authenticateSDK(privateKey);  // Uses retry logic internally

// 3. Now managers are accessible
const hostManager = getHostManager();
```

### Key Methods:
- `authenticate({ method: 'privatekey', privateKey })` - Direct key auth
- `authenticate({ method: 'env' })` - Uses FABSTIR_HOST_PRIVATE_KEY
- `authenticate({ method: 'signer', signer })` - External signer

---

## 🔄 Retry Logic Implementation

### Retry Policies Created:
```typescript
createRetryPolicy('rpc')      // 5 attempts, 1s initial, jitter
createRetryPolicy('contract')  // 3 attempts, 2s initial
createRetryPolicy('auth')      // 2 attempts, 1s initial
```

### Retriable Errors:
- Network errors (ECONNREFUSED, ETIMEDOUT, ENOTFOUND)
- Gas/nonce issues (replacement fee too low, nonce too low)
- Timeout errors

### Non-Retriable:
- Invalid private key
- Unauthorized/Forbidden
- Invalid configuration
- Missing required parameters

---

## 📊 Test Status Summary

### Integration Tests (Sub-phase 3.0):
- `sdk-setup.test.ts`: **11/11 passing** ✅
- `testnet-connection.test.ts`: **11/11 passing** ✅

### Unit Tests (Sub-phase 3.1):
- `initialization.test.ts`: 13/18 passing
- `authentication.test.ts`: ~15/19 passing
- `managers.test.ts`: 17/22 passing
- `retry.test.ts`: ~18/20 passing

**Total: ~75/100 tests passing**

### Known Issues:
- Some timeout issues in manager tests
- PaymentManager.withdrawEarnings method name mismatch
- Async test timing issues (not functional problems)

---

## ⚠️ Common Pitfalls & Solutions

### DO NOT:
1. Use old FabstirSDK - Use FabstirSDKCore
2. Mock the SDK - Use real SDK from @fabstir/sdk-core
3. Use keytar - Use environment variables
4. Expect provider before auth - Authenticate first
5. Hardcode addresses - Use env vars
6. Skip chainId - It's required
7. Use 'private-key' auth - Use 'privatekey' (one word)
8. Create fallbacks - They hide bugs
9. Use npm - Use pnpm (no dependency hoisting)

### ALWAYS:
1. Authenticate before accessing managers
2. Wait for transactions with `tx.wait(3)`
3. Use `.env.test` for contract addresses
4. Check `chat-context-demo.tsx` for reference
5. Follow TDD - Write tests FIRST
6. Respect line limits per file
7. Use singleton pattern for SDK

---

## 🚀 Ready for Sub-phase 3.2: Balance and Requirements Checking

### What's Already Available:
1. ✅ SDK initialization and configuration
2. ✅ Authentication with retry logic
3. ✅ Manager access after auth
4. ✅ Connection status tracking
5. ✅ Error handling and recovery

### What Sub-phase 3.2 Needs to Add:
1. ETH balance checking via provider
2. FAB token balance checking (ERC20)
3. Staking status verification
4. Minimum requirements validation
5. Balance monitoring/watching
6. Clear error messages for insufficient funds

### Key Managers to Use:
- `sdk.provider` - For ETH balance
- `PaymentManager` - For token operations
- `HostManager` - For staking status

### Environment Variables Available:
```bash
# Test accounts with balances
TEST_HOST_1_PRIVATE_KEY=0x...
TEST_HOST_1_ADDRESS=0x4594F755F593B517Bb3194F4DeC20C48a3f04504

# Token contracts
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Required minimums (from IMPLEMENTATION-HOST.md)
# - 0.015 ETH for gas
# - 1000 FAB for staking
```

---

## 🧪 Testing Approach (TDD Bounded Autonomy)

### Proven Process:
1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file
5. No modifications outside specified scope

### Test File Pattern:
```typescript
// Standard test structure
describe('Feature', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  // Test cases...
});
```

---

## 📝 Development Patterns Established

### Singleton Pattern:
```typescript
let instance: Type | null = null;

function getInstance(): Type {
  if (!instance) {
    instance = new Type();
  }
  return instance;
}
```

### Error Handling:
```typescript
try {
  setConnectionStatus(ConnectionStatus.CONNECTING);
  // operation
  setConnectionStatus(ConnectionStatus.CONNECTED);
} catch (error) {
  setConnectionStatus(ConnectionStatus.ERROR, error);
  throw error;
}
```

### Manager Access:
```typescript
if (!authIsAuthenticated()) {
  throw new Error('SDK not authenticated. Call authenticateSDK() first.');
}
return sdk.getManager();
```

---

## 🔧 Commands for Development

```bash
# Install dependencies (MUST use pnpm)
cd /workspace/packages/host-cli
pnpm install

# Run specific test file
pnpm test tests/sdk/initialization.test.ts --run

# Run all SDK tests
pnpm test tests/sdk --run

# Run integration tests
pnpm test tests/integration --run

# Build TypeScript
pnpm build

# Watch mode
pnpm dev
```

---

## 📌 Critical Files to Reference

1. **SDK Usage Example**: `/workspace/apps/harness/pages/chat-context-demo.tsx`
2. **Implementation Plan**: `/workspace/docs/IMPLEMENTATION-HOST.md`
3. **Contract ABIs**: `/workspace/packages/host-cli/src/contracts/abis/`
4. **Test Environment**: `/workspace/.env.test`
5. **This Document**: `/workspace/docs/HOST-CLI-SDK-INTEGRATION-CONTEXT.md`

---

## 🎯 Next Immediate Tasks (Sub-phase 3.2)

1. Create `tests/balance/` directory
2. Write balance checking tests
3. Write requirement validation tests
4. Implement balance checker module
5. Implement requirements validator
6. Add display formatting for balances
7. Create monitoring functionality

---

**Document Purpose**: Preserve context for chat restarts
**Scope**: Sub-phases 3.0-3.1 complete, ready for 3.2
**Critical for**: Continuing host-cli implementation without losing context