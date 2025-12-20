# TUI Dashboard Simplification - Implementation Plan

**Status:** Phase 1 Complete ✅ | Phase 2 (Earnings) Complete ✅ | Phase 3 (Withdrawal) Complete ✅ | Phase 4 (Pricing) Complete ✅
**Branch:** `feature/host-tui-dashboard`
**Created:** 2025-12-20

## Problem

The TUI dashboard currently requires a **separate management server** (`fabstir-host serve` on port 3001) to function. This is unnecessarily complex because:

1. `fabstir-llm-node` already exposes `/health`, `/status`, and `/v1/version` endpoints
2. Users run `fabstir-llm-node` directly (via Docker) - they don't use `fabstir-host serve`
3. Two separate processes adds confusion and complexity

## Solution

**Modify the TUI dashboard to connect directly to `fabstir-llm-node` (port 8080) instead of requiring a separate management server.**

### Before (Current - Complex)
```bash
# User must run TWO things:
fabstir-llm-node                           # LLM inference (port 8080)
fabstir-host serve --port 3001             # Management API (port 3001)
fabstir-host dashboard --mgmt-url http://localhost:3001
```

### After (Simplified)
```bash
# User just runs their node normally:
docker-compose up -d                       # fabstir-llm-node on port 8080

# Dashboard connects directly:
fabstir-host dashboard --url http://localhost:8080
```

---

## fabstir-llm-node API (Already Available)

| Endpoint | Data |
|----------|------|
| `GET /health` | `{ status: "healthy", issues: null }` |
| `GET /status` | `{ status, uptime_seconds, active_sessions, total_jobs_completed, models_loaded, version }` |
| `GET /v1/version` | `{ version, build, features, chains }` |

---

## Implementation Tasks

### Task 1: Update MgmtClient.ts
- [x] Change `/api/status` → `/status`
- [x] Remove `startNode()` function (can't control external node via API)
- [x] Remove `stopNode()` function (can't control external node via API)
- [x] Update response parsing for fabstir-llm-node format

**File:** `packages/host-cli/src/tui/services/MgmtClient.ts`

**New NodeStatus type:**
```typescript
export interface NodeStatus {
  status: 'active' | 'busy' | 'maintenance';  // Not 'running' | 'stopped'
  uptime_seconds: number;      // Not 'uptime'
  active_sessions: number;     // New field
  total_jobs_completed: number; // New field
  models_loaded: string[];     // New field
  version: string;
}
```

### Task 2: Update types.ts
- [x] Update `NodeStatus` interface to match fabstir-llm-node response
- [x] Keep `LogEntry` interface (still used)
- [x] Keep `EarningsData` interface (still used)
- [x] Keep `DashboardState` interface (still used)

**File:** `packages/host-cli/src/tui/types.ts`

### Task 3: Update Dashboard.ts
- [x] Change default URL: `http://localhost:3001` → `http://localhost:8080`
- [x] Replace `LogStreamClient` import with `DockerLogStream`
- [x] Remove `handleStart` and `handleStop` imports
- [x] Remove 's' key handler (start node)
- [x] Remove 'x' key handler (stop node)
- [x] Update actions bar text (remove [S]tart and [X]Stop)
- [x] Update error message: "Unable to connect to node" instead of "management server"
- [x] Update log stream instantiation to use `DockerLogStream`

**File:** `packages/host-cli/src/tui/Dashboard.ts`

### Task 4: Update dashboard.ts command
- [x] Rename `--mgmt-url` → `--url`
- [x] Change default: `http://localhost:3001` → `http://localhost:8080`
- [x] Update description: "Node URL" instead of "Management server URL"
- [x] Update option help text

**File:** `packages/host-cli/src/commands/dashboard.ts`

### Task 5: Update StatusPanel.ts
- [x] Update status display: `'running'|'stopped'` → `'active'|'busy'|'maintenance'`
- [x] Update field: `uptime` → `uptime_seconds`
- [x] Add display for `active_sessions`
- [x] Add display for `total_jobs_completed`
- [x] Add display for `models_loaded`
- [x] Update formatting for new fields

**File:** `packages/host-cli/src/tui/components/StatusPanel.ts`

### Task 6: Create DockerLogs.ts (NEW FILE)
- [x] Create `DockerLogStream` class extending EventEmitter
- [x] Implement `detectContainer()` method using `docker ps --filter`
- [x] Implement `connect()` method that spawns `docker logs -f`
- [x] Implement `disconnect()` method to kill subprocess
- [x] Emit 'log', 'connect', 'disconnect', 'error' events
- [x] Handle case when no container found gracefully

**File:** `packages/host-cli/src/tui/services/DockerLogs.ts`

```typescript
import { spawn, ChildProcess, execSync } from 'child_process';
import { EventEmitter } from 'events';

export class DockerLogStream extends EventEmitter {
  private process: ChildProcess | null = null;
  private containerName: string | null = null;

  async connect(): Promise<void> {
    // Auto-detect fabstir container
    this.containerName = await this.detectContainer();
    if (!this.containerName) {
      this.emit('error', new Error('No fabstir Docker container detected'));
      return;
    }

    // Spawn docker logs -f
    this.process = spawn('docker', ['logs', '-f', '--tail', '50', this.containerName]);

    this.process.stdout?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          this.emit('log', { level: 'stdout', message: line, timestamp: new Date().toISOString() });
        }
      }
    });

    this.process.stderr?.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line) {
          this.emit('log', { level: 'stderr', message: line, timestamp: new Date().toISOString() });
        }
      }
    });

    this.process.on('close', (code) => {
      this.emit('disconnect', code);
    });

    this.emit('connect', this.containerName);
  }

  private async detectContainer(): Promise<string | null> {
    try {
      const result = execSync('docker ps --filter "name=fabstir" --format "{{.Names}}"', {
        encoding: 'utf-8',
        timeout: 5000,
      });
      const containers = result.trim().split('\n').filter(Boolean);
      return containers[0] || null;
    } catch {
      return null;
    }
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }
}
```

### Task 7: Delete LogStream.ts
- [x] Remove file (no longer needed - was WebSocket to management server)

**File:** `packages/host-cli/src/tui/services/LogStream.ts`

### Task 8: Update actions.ts
- [x] Remove `handleStart` function (can't control external node)
- [x] Remove `handleStop` function (can't control external node)
- [x] Keep `showMessage` and `showError` functions

**File:** `packages/host-cli/src/tui/actions.ts`

### Task 9: Build and Test
- [x] Run `pnpm build` in packages/host-cli
- [x] Fix any TypeScript errors
- [x] Test dashboard locally (will show "Unable to connect" since no node)
- [x] Update tests if needed

### Task 10: Test on Production Server
- [x] SSH into Ubuntu server
- [x] Verify node is running: `docker ps | grep fabstir`
- [x] Run dashboard: `fabstir-host dashboard --url http://localhost:8080`
- [x] Verify log panel shows Docker logs (auto-detected) ✅
- [x] Verify keyboard shortcuts work (R for refresh, Q for quit) ✅
- [x] Add fallback: `/status` → `/health` + `/v1/version` endpoints
- [x] Display health issues in status panel

---

## Docker Distribution

### Build the Dashboard Image

From the repo root on your dev machine:

```bash
# Build
cd /workspace
docker build -f packages/host-cli/Dockerfile.dashboard -t fabstir/host-cli:latest .

# Push to Docker Hub
docker push fabstir/host-cli:latest
```

### User Experience (After Published)

```bash
# One command to run dashboard - no installation needed
docker run --rm -it --network host fabstir/host-cli:latest dashboard

# Or with specific URL
docker run --rm -it --network host fabstir/host-cli:latest dashboard --url http://localhost:8080
```

### Files Added
- `packages/host-cli/Dockerfile.dashboard` - Lightweight CLI image
- `packages/host-cli/scripts/build-dashboard-image.sh` - Build script

---

## API Mapping

| Current (MgmtClient) | fabstir-llm-node | Notes |
|---------------------|------------------|-------|
| `/api/status` | `/status` or `/health` + `/v1/version` | Fallback when /status unavailable |
| `/api/logs/stream` | Docker logs | WebSocket → subprocess |
| `/health` | `/health` | Same |

---

## Summary

**Before:** Host operators needed to run `fabstir-host serve` separately just for the dashboard to work.

**After:** Dashboard connects directly to `fabstir-llm-node`. Just run the node however you want, then run the dashboard. Zero extra setup.

| What Changed | Before | After |
|--------------|--------|-------|
| Status API | `localhost:3001/api/status` | `localhost:8080/status` |
| Log source | WebSocket to mgmt server | Docker logs (auto-detect) |
| Required processes | Node + Management server | Node only |
| User input needed | Container name, port, etc. | None (auto-detect) |

---

## Phase 2: Earnings Panel Implementation

**Status:** Complete ✅

### Problem

The Earnings panel currently shows "Loading..." and never updates. Host operators need to see their accumulated earnings from the HostEarnings contract.

### Solution

Query the HostEarnings contract on-chain via RPC to display:
- ETH balance (native token earnings)
- USDC balance (stablecoin earnings)
- Total value in USD (optional)

### Requirements

To query earnings, the dashboard needs:
1. **Host wallet address** - Derived from `HOST_PRIVATE_KEY` environment variable
2. **RPC URL** - To query Base Sepolia blockchain
3. **Contract addresses** - HostEarnings and USDC token

### HostEarnings Contract API

**Contract Address:** `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` (Base Sepolia)

```typescript
// Get balance for a specific token
function getBalance(address host, address token) external view returns (uint256)

// Get balances for multiple tokens at once
function getBalances(address host, address[] tokens) external view returns (uint256[])

// Token addresses:
// - Native ETH: address(0) or 0x0000000000000000000000000000000000000000
// - USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

### Implementation Tasks

#### Task 2.1: Add Environment Variables Support
- [x] Read `HOST_PRIVATE_KEY` from environment to derive host address
- [x] Read `RPC_URL` from environment (default: `https://sepolia.base.org`)
- [x] Add `--rpc-url` CLI option to override

**File:** `packages/host-cli/src/dashboard-standalone.ts`

#### Task 2.2: Create EarningsClient Service
- [x] Create `EarningsClient.ts` in `src/tui/services/`
- [x] Implement `fetchEarnings(hostAddress, rpcUrl)` function
- [x] Query HostEarnings contract for ETH balance (address(0))
- [x] Query HostEarnings contract for USDC balance
- [x] Return `EarningsData` interface

**File:** `packages/host-cli/src/tui/services/EarningsClient.ts`

```typescript
import { ethers } from 'ethers';
import { EarningsData } from '../types';

const HOST_EARNINGS_ADDRESS = '0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0';
const USDC_ADDRESS = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

const HOST_EARNINGS_ABI = [
  'function getBalance(address host, address token) view returns (uint256)',
  'function getBalances(address host, address[] tokens) view returns (uint256[])'
];

export async function fetchEarnings(
  hostAddress: string,
  rpcUrl: string
): Promise<EarningsData | null> {
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(HOST_EARNINGS_ADDRESS, HOST_EARNINGS_ABI, provider);

    // Query both ETH and USDC balances in one call
    const [ethBalance, usdcBalance] = await contract.getBalances(
      hostAddress,
      [ethers.ZeroAddress, USDC_ADDRESS]
    );

    return {
      eth: ethers.formatEther(ethBalance),
      usdc: ethers.formatUnits(usdcBalance, 6),
      currency: 'USD'
    };
  } catch (error) {
    console.error('Failed to fetch earnings:', error);
    return null;
  }
}

export function deriveAddressFromPrivateKey(privateKey: string): string {
  const wallet = new ethers.Wallet(privateKey);
  return wallet.address;
}
```

#### Task 2.3: Update EarningsData Type
- [x] Update `EarningsData` interface to match contract data
- [x] Remove `today`/`week` fields (not available on-chain)
- [x] Add `eth` and `usdc` fields

**File:** `packages/host-cli/src/tui/types.ts`

```typescript
export interface EarningsData {
  eth: string;      // ETH balance (formatted)
  usdc: string;     // USDC balance (formatted)
  currency: string; // Display currency
}
```

#### Task 2.4: Create EarningsPanel Component
- [x] Create `EarningsPanel.ts` in `src/tui/components/`
- [x] Format earnings display with ETH and USDC amounts
- [x] Show "No earnings yet" when balances are zero
- [x] Handle loading and error states

**File:** `packages/host-cli/src/tui/components/EarningsPanel.ts`

```typescript
import { EarningsData } from '../types';

export function formatEarningsPanel(earnings: EarningsData | null): string {
  if (!earnings) {
    return '⚠️ Unable to fetch earnings\n\nCheck HOST_PRIVATE_KEY and RPC_URL';
  }

  const ethNum = parseFloat(earnings.eth);
  const usdcNum = parseFloat(earnings.usdc);

  if (ethNum === 0 && usdcNum === 0) {
    return 'No earnings yet\n\nComplete jobs to earn rewards';
  }

  const lines: string[] = [
    '💰 Available Balance',
    '',
    `ETH:  ${earnings.eth} ETH`,
    `USDC: ${earnings.usdc} USDC`,
    '',
    'Press [W] to withdraw'
  ];

  return lines.join('\n');
}
```

#### Task 2.5: Update Dashboard.ts
- [x] Import `fetchEarnings` and `deriveAddressFromPrivateKey`
- [x] Import `formatEarningsPanel`
- [x] Read `HOST_PRIVATE_KEY` from environment
- [x] Derive host address from private key
- [x] Add `refreshEarnings()` function
- [x] Call `refreshEarnings()` on initial load and with status refresh
- [x] Update earnings box content

**File:** `packages/host-cli/src/tui/Dashboard.ts`

#### Task 2.6: Update dashboard-standalone.ts
- [x] Add `--rpc-url` option
- [x] Pass RPC URL to dashboard options
- [x] Document required environment variables

**File:** `packages/host-cli/src/dashboard-standalone.ts`

#### Task 2.7: Update Dockerfile.dashboard
- [x] Add `ethers` to npm install command
- [x] Document `HOST_PRIVATE_KEY` environment variable requirement

**File:** `packages/host-cli/Dockerfile.dashboard`

### Task 2.8: Build and Test
- [x] Run `pnpm build` in packages/host-cli
- [x] Fix any TypeScript errors
- [ ] Test on production server with real HOST_PRIVATE_KEY

### User Experience

**Before:**
```
┌─ Earnings ─────────┐
│ Loading...         │
│                    │
└────────────────────┘
```

**After:**
```
┌─ Earnings ─────────┐
│ 💰 Available Balance│
│                    │
│ ETH:  0.0123 ETH   │
│ USDC: 45.67 USDC   │
│                    │
│ Press [W] to withdraw│
└────────────────────┘
```

### Docker Run Command (Updated)

```bash
docker run --rm -it \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e HOST_PRIVATE_KEY=your_private_key_here \
  -e RPC_URL=https://sepolia.base.org \
  julesl123/fabstir-host-cli:latest
```

### Dependencies

Need to add `ethers` to the dashboard Docker image:

```dockerfile
RUN npm install --omit=dev blessed blessed-contrib chalk commander ethers
```

### Security Considerations

- Private key is used to derive address and sign withdrawal transactions
- Private key never leaves the local environment
- Only the host can withdraw their own earnings

---

## Phase 3: Withdrawal Functionality

**Status:** Complete ✅

### Problem

Users can see their earnings but cannot withdraw them from the dashboard.

### Solution

Implement withdrawal when user presses [W]:
1. Check if HOST_PRIVATE_KEY is set
2. Check if there are earnings to withdraw
3. Call `withdrawAll()` or `withdrawMultiple()` on HostEarnings contract
4. Display transaction status in logs
5. Refresh earnings display after success

### Implementation

#### Task 3.1: Create WithdrawalService.ts
- [x] Create service to sign and send withdrawal transactions
- [x] Support both ETH and USDC withdrawals
- [x] Handle common errors (insufficient gas, nonce issues)

**File:** `packages/host-cli/src/tui/services/WithdrawalService.ts`

#### Task 3.2: Update Dashboard.ts
- [x] Import WithdrawalService
- [x] Update 'w' key handler to call withdrawal
- [x] Show status updates in logs panel
- [x] Refresh earnings after successful withdrawal

**File:** `packages/host-cli/src/tui/Dashboard.ts`

### User Experience

When user presses [W]:
```
[WITHDRAW] Checking balances...
[WITHDRAW] Sending withdrawal transaction...
[WITHDRAW] Transaction sent: 0x1234abcd...
[WITHDRAW] Waiting for confirmation...
✅ Withdrawn: $0.26 USDC
[WITHDRAW] TX: 0x1234abcdef...
```

### Security Notes

- Private key is required for signing withdrawal transactions
- Only the host's own earnings can be withdrawn
- Transaction is signed locally, private key never sent over network

---

## Phase 4: Pricing Management

**Status:** Complete ✅

### Problem

The [P] key in the TUI dashboard shows "Pricing management not yet implemented". Host operators need to view and update their pricing from the dashboard.

### Solution

Implement pricing management when user presses [P]:
1. Show current pricing (ETH and USDC per million tokens)
2. Prompt for new USDC price via text input
3. Sign and send transaction to NodeRegistry contract
4. Display result in logs panel

### NodeRegistry Contract API

**Contract Address:** `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` (Base Sepolia)

```typescript
// Read current pricing
function getNodePricing(address operator, address token) view returns (uint256)
function nodes(address) view returns (address, uint256, bool, string, string, uint256 minPricePerTokenNative, uint256 minPricePerTokenStable)

// Update pricing
function updatePricingStable(uint256 newMinPrice) external
function updatePricingNative(uint256 newMinPrice) external
```

### Price Format

- PRICE_PRECISION = 1000
- Price is per million tokens
- Example: $5/million tokens = 5000 (5 * 1000)
- Range: $0.001 to $100,000 per million tokens

### Implementation

#### Task 4.1: Create PricingService.ts
- [x] Create service to query and update pricing
- [x] Implement `fetchCurrentPricing(hostAddress, rpcUrl)`
- [x] Implement `updateStablePricing(privateKey, rpcUrl, newPrice)`
- [x] Handle price formatting (contract units ↔ USD)

**File:** `packages/host-cli/src/tui/services/PricingService.ts`

#### Task 4.2: Update Dashboard.ts
- [x] Import PricingService functions
- [x] Update 'p' key handler to fetch and display current price
- [x] Create blessed textbox for price input
- [x] Call updateStablePricing() on submit
- [x] Show result in logs panel

**File:** `packages/host-cli/src/tui/Dashboard.ts`

### User Experience

When user presses [P]:
```
[PRICING] Fetching current pricing...
[PRICING] Current USDC price: $2.00/million

┌─ New price ($/million tokens) or ESC to cancel ─┐
│ 6.50                                              │
└───────────────────────────────────────────────────┘

[PRICING] Updating to $6.50/million tokens...
[PRICING] Updating price to $6.50/million tokens...
[PRICING] Transaction sent: 0x1234...
[PRICING] Waiting for confirmation...
✅ Price updated to $6.50/million tokens
[PRICING] TX: 0x1234abcdef...
```

### Security Notes

- Private key required for signing price update transactions
- Only the host can update their own pricing
- Transaction signed locally, private key never sent over network
