# Host CLI SDK Integration Context

## Project Overview
The host-cli is a TypeScript CLI tool for Fabstir LLM marketplace hosts to manage their node operations, including registration, staking, earnings, and process management.

## 🚨 CRITICAL: Which SDK to Use

### ❌ WRONG SDK (DO NOT USE)
- **FabstirSDK** from `/workspace/src/FabstirSDK.ts` - OBSOLETE
- Located at workspace root - replaced during browser refactor
- Has Node.js dependencies that break in browsers

### ✅ CORRECT SDK (MUST USE)
- **FabstirSDKCore** from `@fabstir/sdk-core` package
- Located at `/workspace/packages/sdk-core/`
- Browser-compatible, current production SDK
- Import: `import { FabstirSDKCore } from '@fabstir/sdk-core';`

## Completed Phases

### Phase 3: SDK Integration ✅
- **Sub-phase 3.0**: SDK Initialization ✅ - 22 tests
- **Sub-phase 3.1**: Authentication ✅ - 32 tests
- **Sub-phase 3.2**: Balance Checking ✅ - 59 tests
  - Fixed SDK address retrieval: use `getAuthenticatedAddress()` not `sdk.getAddress()`
  - Fixed naming collision in BalanceMonitor: `shouldCheckRequirements` property

### Phase 4: Core Host Operations ✅
- **Sub-phase 4.1**: Registration and Staking ✅ - 55 tests
  - **CRITICAL FIX**: HostManagerEnhanced had swapped indexes
    - `stake` is at index 1 (was reading index 2)
    - `isActive` is at index 2 (was reading index 1)
  - Minimum stake: 1000 FAB tokens
  - Test account 0x4594F755F593B517Bb3194F4DeC20C48a3f04504 has 5000+ FAB

- **Sub-phase 4.2**: Status and Monitoring ✅ - 51 tests
  - **Treasury/Host split: 10%/90%** (NOT 5%/95%)
  - Fixed JSON serialization for BigInt using `formatJSON()` helper
  - Comprehensive metrics: earnings, sessions, uptime, profitability
  - Display formatting with chalk colors and charts

- **Sub-phase 4.3**: Withdrawal Operations ✅ - 47 tests
  - Host and treasury withdrawal with permission checking
  - Gas estimation with EIP-1559 support (low/normal/high priorities)
  - Withdrawal history persists to `~/.fabstir/host-cli/withdrawal-history.json`
  - Minimum withdrawal: 0.001 ETH
  - 20% gas buffer for safety

### Phase 5: Inference Server Integration (Partial)
- **Sub-phase 5.1**: Process Management ✅ - 55 tests
  - Spawns fabstir-llm-node Rust process
  - Checks PATH and common locations for executable
  - Health monitoring via `http://{host}:{port}/health`
  - CPU/memory tracking using `ps` command
  - Auto-restart policies: always, on-failure, never, custom
  - Exponential backoff: initial delay * multiplier^attempts
  - Process logging with rotation (10MB default max size)
  - Graceful shutdown: SIGTERM with 10s timeout, then SIGKILL

- **Sub-phase 5.2**: WebSocket Integration ✅ - 39 tests (1 skipped)
  - WebSocket client with ws module
  - Handles session-request, session-start, inference-complete events
  - Token generation tracking and session statistics
  - Message queue for disconnected state (up to 1000 messages)
  - Reconnection manager with exponential backoff
  - Circuit breaker pattern for failure protection
  - Health check scheduling
  - Binary message support
  - Event-driven architecture with wildcard handlers

## Key Architecture Patterns

### SDK Wrapper Pattern
```typescript
// src/sdk/client.ts
let sdkInstance: FabstirSDKCore | null = null;
let authenticatedAddress: string | null = null;

export function getSDK(): FabstirSDKCore {
  if (!sdkInstance) throw new Error('SDK not initialized');
  return sdkInstance;
}

export function getAuthenticatedAddress(): string | null {
  return authenticatedAddress;
}
```

### Manager Access Pattern
```typescript
const sdk = getSDK();
if (!sdk.isAuthenticated()) {
  throw new Error('SDK not authenticated');
}

const treasuryManager = sdk.getTreasuryManager();
const hostManager = sdk.getHostManager();
```

### Test Structure (TDD Bounded Autonomy)
1. Write ALL tests for a sub-phase FIRST
2. Run tests to show failures
3. Implement minimally to pass tests
4. Keep within line limits per file

### File Organization
```
packages/host-cli/
├── src/
│   ├── sdk/           # SDK wrapper and authentication
│   ├── balance/       # Balance checking and monitoring
│   ├── registration/  # Host registration and staking
│   ├── monitoring/    # Status tracking and metrics
│   ├── withdrawal/    # Earnings withdrawal
│   ├── process/       # Process lifecycle management
│   └── commands/      # CLI command implementations
└── tests/
    └── [matching structure with .test.ts files]
```

## Important Technical Details

### Treasury/Host Earnings Split
- **Treasury: 10%** of earnings
- **Host: 90%** of earnings
- Constants in `src/monitoring/metrics.ts`:
```typescript
const TREASURY_PERCENTAGE = 10;
const HOST_PERCENTAGE = 90;
```

### Contract Addresses (Base Sepolia)
From `.env.test` (September 2025 deployment):
- JobMarketplace: `0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0`
- NodeRegistry: `0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218`
- FAB Token: `0xC78949004B4EB6dEf2D66e49Cd81231472612D62`
- USDC Token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`

### BigInt Handling (ES2020 Compatibility)
```typescript
// ❌ Wrong - BigInt literals not supported in target
const amount = 1000n;

// ✅ Correct - Use BigInt constructor
const amount = BigInt(1000);
const zero = BigInt(0);
```

### Process Management Architecture
```typescript
interface ProcessHandle {
  pid: number;
  process: ChildProcess;
  config: ProcessConfig;
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';
  startTime: Date;
  logs: string[];
}
```

- Global ProcessManager singleton
- Event-driven with TypeScript event types
- Waits for health endpoint before marking as ready

### Auto-Restart Configuration
```typescript
interface RestartOptions {
  policy: 'always' | 'on-failure' | 'never' | 'custom';
  maxAttempts?: number;
  initialDelay?: number;      // Default: 1000ms
  backoffMultiplier?: number; // Default: 2
  resetPeriod?: number;       // Default: 300000ms (5 min)
}
```

## Next Phase: 5.2 WebSocket Integration

### Expected Tasks (from IMPLEMENTATION-HOST.md)
- Write tests for WebSocket connection
- Write tests for message handling
- Implement WebSocket client connection
- Handle session-request events
- Process session-complete events
- Update local session tracking
- Handle connection drops
- Implement reconnection logic
- Parse WebSocket messages
- Route events to appropriate handlers

### Key Interfaces to Implement
```typescript
interface WebSocketClient {
  connect(url: string): Promise<void>;
  disconnect(): void;
  send(message: any): void;
  on(event: string, handler: Function): void;
}

interface SessionEvent {
  type: 'session-request' | 'session-start' | 'session-end';
  sessionId: string;
  jobId?: string;
  payment?: bigint;
  model?: string;
}
```

### Integration Points
- Get WebSocket URL from ProcessHandle config
- Auto-connect when process starts (port from config)
- Update SessionInfo in `src/monitoring/tracker.ts`
- Track earnings in `src/monitoring/metrics.ts`

## Testing Patterns

### Standard Test Setup
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Feature', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
  });

  afterEach(async () => {
    await cleanupSDK();
  });

  it('should test something', async () => {
    const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
    await authenticateSDK(privateKey);
    // Test implementation
  });
});
```

### Mock Patterns
```typescript
// Mock child_process spawn
const mockSpawn = vi.spyOn(child_process, 'spawn');
mockSpawn.mockReturnValue({
  pid: 12345,
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  on: vi.fn(),
  kill: vi.fn()
} as any);

// Mock fetch for health checks
const mockFetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ status: 'healthy' })
});
global.fetch = mockFetch as any;
```

## Common Gotchas and Solutions

### Issue: "SDK not authenticated"
```typescript
// Always check authentication before manager access
const sdk = getSDK();
if (!sdk.isAuthenticated()) {
  throw new Error('SDK not authenticated');
}
```

### Issue: "Cannot find fabstir-llm-node"
Check locations in order:
1. `which fabstir-llm-node` (in PATH)
2. `/usr/local/bin/fabstir-llm-node`
3. `/usr/bin/fabstir-llm-node`
4. `~/.cargo/bin/fabstir-llm-node`
5. `./fabstir-llm-node` (current directory)

### Issue: "getHostStatus is not a function"
The correct method name in IHostManager is inconsistent:
- Sometimes `getHostInfo(address)`
- Sometimes `getHostStatus(address)`
- Try both with optional chaining

### Issue: JSON serialization with BigInt
Use the `formatJSON` helper from `src/monitoring/display.ts`:
```typescript
const jsonString = formatJSON(objectWithBigInt);
```

## Implementation Statistics

### Completed Sub-phases: 8
- Phase 3: 3.0, 3.1, 3.2 (3 sub-phases)
- Phase 4: 4.1, 4.2, 4.3 (3 sub-phases)
- Phase 5: 5.1, 5.2 (2 sub-phases)

### Total Test Count: 360 tests
- SDK Integration: 113 tests (22 + 32 + 59)
- Registration: 55 tests
- Status: 51 tests
- Withdrawal: 47 tests
- Process: 55 tests
- WebSocket: 39 tests (messages: 22, reconnect: 17)

### Test Pass Rate: ~98%
Small number of tests may fail due to network/timing issues

### Code Line Counts
Most files stay within limits:
- Test files: 200-400 lines
- Implementation: 300-450 lines
- Some complex tests reach 480 lines

## Git Commit Standards

### Commit Message Format
```
feat(host-cli): implement Sub-phase X.X - [Feature Name]

[Detailed description of implementation]
following TDD approach with 100% test coverage (XX tests).

Key features:
- [Feature 1]
- [Feature 2]
- [Feature 3]

Test coverage:
- [Category]: XX/XX passed
- [Category]: XX/XX passed

[Any fixes applied]

All XX tests passing.

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Files to Never Commit
- `test-runner.js`
- `test-withdrawal.js`
- `test-status.md`
- Any temporary test helpers

## Environment Variables (.env.test)
```bash
# Test Accounts
TEST_HOST_1_PRIVATE_KEY=...  # Has 5000+ FAB, 0.04+ ETH
TEST_USER_1_PRIVATE_KEY=...
TEST_TREASURY_PRIVATE_KEY=...

# RPC
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/...

# Contracts (Base Sepolia)
CONTRACT_JOB_MARKETPLACE=0x001A47Bb8C6CaD9995639b8776AB5816Ab9Ac4E0
CONTRACT_NODE_REGISTRY=0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218
CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
```

## Ready for Sub-phase 5.2: WebSocket Integration

This context document contains all critical information learned from implementing Sub-phases 3.0 through 5.1. Use this as reference when continuing with WebSocket integration and subsequent phases.