# UI5 Automated Testing Implementation Plan

**Status**: Ready to implement
**Date**: 2025-11-13
**Estimated Time**: 3.5 hours

## Context

UI5 manual testing would take over a week with back-and-forth wallet approvals. This plan implements automated testing using a test wallet provider that auto-approves all blockchain transactions, eliminating manual intervention while testing against real Base Sepolia testnet.

## Approach: Direct Private Key (Recommended)

**Why this approach:**
- ✅ Fastest implementation: 2-4 hours (vs 1-3 days for Synpress)
- ✅ Already proven in codebase (`tests-ui5/test-rag-e2e.cjs`)
- ✅ Zero external dependencies (no Synpress, no browser extensions)
- ✅ Works with Base Sepolia testnet using TEST_USER_1_PRIVATE_KEY
- ✅ 100% deterministic, no flaky tests from MetaMask timing
- ✅ CI/CD friendly (runs headless)
- ✅ UI5 uses Base Account Kit anyway, not MetaMask

**Alternatives rejected:**
- **Synpress**: 1-2 days setup, slower tests (30-60s each), overkill since UI5 uses Base Account Kit not MetaMask
- **OnchainTestKit**: 2-3 days setup, fork overhead, very new (Sept 2024)

---

## Phase 1: Test Infrastructure (2 hours)

### 1.1 Create Test Wallet Provider (30 min)

**File**: `/workspace/tests-ui5/lib/test-wallet-provider.ts`

**Purpose**: Wraps ethers.js Wallet with TEST_USER_1_PRIVATE_KEY to auto-sign all transactions

**Implementation**:
```typescript
import { ethers } from 'ethers';

export interface TestWalletConfig {
  privateKey: string;
  rpcUrl: string;
  chainId: number;
}

export class TestWalletProvider {
  private wallet: ethers.Wallet;
  private provider: ethers.JsonRpcProvider;
  public readonly chainId: number;

  constructor(config: TestWalletConfig) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.chainId = config.chainId;
  }

  /**
   * Get signer for SDK authentication
   */
  getSigner(): ethers.Wallet {
    return this.wallet;
  }

  /**
   * Get address for UI display
   */
  getAddress(): string {
    return this.wallet.address;
  }

  /**
   * Simulate wallet connection (instant, no popup)
   */
  async connect(): Promise<string> {
    return this.wallet.address;
  }

  /**
   * Get balance (native or ERC-20 token)
   */
  async getBalance(tokenAddress?: string): Promise<bigint> {
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      // Native token (ETH)
      return await this.provider.getBalance(this.wallet.address);
    } else {
      // ERC-20 token (USDC, FAB, etc.)
      const contract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.provider
      );
      return await contract.balanceOf(this.wallet.address);
    }
  }

  /**
   * Wait for transaction confirmation
   */
  async waitForTransaction(txHash: string, confirmations = 3): Promise<void> {
    const tx = await this.provider.getTransaction(txHash);
    if (tx) {
      await tx.wait(confirmations);
    }
  }

  /**
   * Get current block number
   */
  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}
```

**Key Features**:
- Uses TEST_USER_1_PRIVATE_KEY from `.env.test`
- Auto-signs transactions (no manual approval)
- Provides signer for SDK authentication
- Handles balance checks
- Waits for blockchain confirmations

---

### 1.2 Create Test SDK Wrapper (30 min)

**File**: `/workspace/tests-ui5/lib/test-sdk-wrapper.ts`

**Purpose**: Initialize UI5SDK with test wallet and expose managers for testing

**Implementation**:
```typescript
import { ui5SDK } from '@/lib/sdk';
import { TestWalletProvider } from './test-wallet-provider';
import type { Signer } from 'ethers';

export interface TestSDKConfig {
  testWallet: TestWalletProvider;
  rpcUrl: string;
  chainId: number;
  contractAddresses: {
    jobMarketplace: string;
    nodeRegistry: string;
    proofSystem: string;
    hostEarnings: string;
    modelRegistry: string;
    usdcToken: string;
    fabToken: string;
  };
}

export class TestSDKWrapper {
  private testWallet: TestWalletProvider;
  private config: TestSDKConfig;
  private initialized = false;

  constructor(config: TestSDKConfig) {
    this.testWallet = config.testWallet;
    this.config = config;
  }

  /**
   * Initialize SDK with test wallet
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[TestSDK] Already initialized');
      return;
    }

    console.log('[TestSDK] Initializing SDK with test wallet...');
    const signer = this.testWallet.getSigner();

    await ui5SDK.initialize(signer);

    this.initialized = true;
    console.log('[TestSDK] SDK initialized successfully');
  }

  /**
   * Get all managers
   */
  getManagers() {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return ui5SDK.getManagers();
  }

  /**
   * Get specific manager
   */
  async getSessionManager() {
    return await ui5SDK.getSessionManager();
  }

  getPaymentManager() {
    return ui5SDK.getPaymentManager();
  }

  getHostManager() {
    return ui5SDK.getHostManager();
  }

  getVectorRAGManager() {
    return ui5SDK.getVectorRAGManager();
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.initialized && ui5SDK.isInitialized();
  }

  /**
   * Disconnect SDK
   */
  disconnect(): void {
    ui5SDK.disconnect();
    this.initialized = false;
  }
}

/**
 * Create test SDK instance from environment variables
 */
export function createTestSDK(testWallet: TestWalletProvider): TestSDKWrapper {
  return new TestSDKWrapper({
    testWallet,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
    chainId: 84532,
    contractAddresses: {
      jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
      nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
      proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
      hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
      modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!,
      usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
      fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
    },
  });
}
```

**Key Features**:
- Wraps UI5SDK singleton
- Initializes with test wallet signer
- Exposes all managers for testing
- Helper to create from environment variables

---

### 1.3 Update UI5 SDK to Detect Test Mode (30 min)

**File**: `/workspace/apps/ui5/lib/sdk.ts`

**Changes**:
```typescript
async initialize(signer: Signer): Promise<void> {
  // Check if already initialized
  if (this.initialized && this.sdk) {
    console.log('[UI5SDK] Already initialized');
    return;
  }

  // Check if initialization is in progress
  if (this.initializing) {
    // ... existing wait logic
  }

  this.initializing = true;

  try {
    console.log('[UI5SDK] Initializing SDK...');

    // CHECK FOR TEST MODE
    const isTestMode = typeof window !== 'undefined' && (window as any).__TEST_WALLET__;
    if (isTestMode) {
      console.log('[UI5SDK] 🧪 Test mode detected - using test wallet');
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA) {
      throw new Error('Missing NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA in environment');
    }
    // ... rest of validation

    // Initialize SDK with production configuration
    this.sdk = new FabstirSDKCore({
      mode: 'production' as const,
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA,
      contractAddresses: {
        // ... existing config
      },
      s5Config: {
        portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL || 'https://s5.cx',
        seedPhrase: process.env.NEXT_PUBLIC_S5_SEED_PHRASE,
      },
      encryptionConfig: {
        enabled: process.env.NEXT_PUBLIC_ENABLE_ENCRYPTION === 'true',
      },
    });

    // Authenticate with wallet signer
    const address = await signer.getAddress();
    console.log(`[UI5SDK] Authenticating with address: ${address}${isTestMode ? ' (TEST MODE)' : ''}`);

    await this.sdk.authenticate('signer', {
      signer
    });

    this.initialized = true;
    this.notify();
    console.log('[UI5SDK] SDK initialized successfully');
  } catch (error) {
    console.error('[UI5SDK] Initialization failed:', error);
    this.sdk = null;
    this.initialized = false;
    throw error;
  } finally {
    this.initializing = false;
  }
}
```

**Key Changes**:
- Detect `window.__TEST_WALLET__` flag
- Log test mode for debugging
- No changes to initialization logic (works the same way)

---

### 1.4 Update UI5 Wallet Hook (30 min)

**File**: `/workspace/apps/ui5/hooks/use-wallet.ts`

**Changes**:
```typescript
export function useWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { initialize, disconnect: disconnectSDK, isInitialized } = useSDK();

  // Check for test mode or existing connection on mount
  useEffect(() => {
    // CHECK FOR TEST MODE FIRST
    const testWallet = typeof window !== 'undefined' ? (window as any).__TEST_WALLET__ : null;
    if (testWallet && testWallet.autoApprove) {
      console.log('[useWallet] 🧪 Test mode detected - auto-connecting test wallet');
      setAddress(testWallet.address);
      setIsConnected(true);

      // Create test signer from window object
      if (testWallet.signer) {
        setSigner(testWallet.signer);
        // Initialize SDK with test signer
        initialize(testWallet.signer).catch((err) => {
          console.error('[useWallet] Failed to initialize SDK in test mode:', err);
          setError(err.message);
        });
      }
      return;
    }

    // Normal production flow - check for existing Base Account Kit connection
    const baseWallet = getBaseWallet();
    if (baseWallet.isConnected()) {
      const addresses = baseWallet.getAddresses();
      setAddress(addresses.primary);
      setIsConnected(true);

      // Get signer and initialize SDK
      baseWallet.getSigner().then(async (walletSigner) => {
        setSigner(walletSigner);
        if (!isInitialized) {
          await initialize(walletSigner);
        }
      });
    }
  }, []);

  // ... rest of hook unchanged
}
```

**Key Changes**:
- Check for `window.__TEST_WALLET__` on mount
- Auto-connect if test mode detected
- Get signer from test wallet object
- Initialize SDK with test signer
- Skip Base Account Kit in test mode

---

## Phase 2: Convert Existing Tests (1 hour)

### 2.1 Create Test Setup Helper (15 min)

**File**: `/workspace/tests-ui5/lib/test-setup.ts`

**Purpose**: Common setup for all tests

```typescript
import { test as base, expect } from '@playwright/test';
import { TestWalletProvider } from './test-wallet-provider';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.test' });

export interface TestFixtures {
  testWallet: TestWalletProvider;
}

/**
 * Extended test with test wallet fixture
 */
export const test = base.extend<TestFixtures>({
  testWallet: async ({ page }, use) => {
    // Create test wallet
    const testWallet = new TestWalletProvider({
      privateKey: process.env.TEST_USER_1_PRIVATE_KEY!,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
      chainId: 84532,
    });

    // Inject into browser BEFORE navigation
    await page.addInitScript((walletData) => {
      (window as any).__TEST_WALLET__ = {
        address: walletData.address,
        chainId: walletData.chainId,
        signer: null, // Will be set by SDK
        autoApprove: true,
      };
    }, {
      address: testWallet.getAddress(),
      chainId: testWallet.chainId,
    });

    // Provide to test
    await use(testWallet);

    // Cleanup (if needed)
  },
});

export { expect };
```

**Key Features**:
- Loads `.env.test` environment variables
- Creates test wallet fixture for each test
- Injects test wallet into browser context
- Exports custom `test` with wallet fixture

---

### 2.2 Convert Example Test Script (15 min)

**Example**: Convert `test-chat-operations.cjs` to TypeScript with test wallet

**File**: `/workspace/tests-ui5/test-chat-operations.spec.ts`

```typescript
import { test, expect } from './lib/test-setup';

test.describe('Chat Operations', () => {
  test('should create session group and send chat message', async ({ page, testWallet }) => {
    // Navigate to UI5
    await page.goto('http://localhost:3002');

    // Wait for SDK initialization (now auto-connects via test wallet)
    await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });

    // Verify wallet address displayed
    const addressText = await page.textContent('[data-testid="wallet-address"]');
    expect(addressText).toContain(testWallet.getAddress().slice(0, 6));

    // Navigate to session groups
    await page.click('a:text("Sessions")');
    await page.waitForURL('**/session-groups');

    // Create new session group
    await page.click('button:text("Create Session Group")');
    await page.fill('input[name="name"]', 'Test Project');
    await page.fill('textarea[name="description"]', 'Automated test session group');
    await page.click('button:text("Create")');

    // Wait for blockchain transaction (auto-approved by test wallet)
    await page.waitForSelector('text=Transaction confirmed', { timeout: 30000 });

    // Verify session group created
    await page.waitForSelector('text=Test Project');

    // Open session group
    await page.click('text=Test Project');

    // Create chat session
    await page.click('button:text("Create Chat Session")');
    await page.fill('input[name="sessionName"]', 'Test Chat');
    await page.click('button:text("Create")');

    // Wait for transaction
    await page.waitForSelector('text=Session created', { timeout: 30000 });

    // Open chat
    await page.click('text=Test Chat');

    // Send message
    await page.fill('textarea[name="message"]', 'Hello, this is a test message');
    await page.click('button:text("Send")');

    // Wait for AI response (real WebSocket streaming)
    await page.waitForSelector('[data-testid="ai-response"]', { timeout: 30000 });

    // Verify response received
    const aiResponse = await page.textContent('[data-testid="ai-response"]');
    expect(aiResponse).toBeTruthy();
    expect(aiResponse!.length).toBeGreaterThan(10);
  });
});
```

**Key Features**:
- Uses `test` fixture from test-setup
- Test wallet auto-injected
- No manual wallet approvals
- Waits for real blockchain confirmations
- Tests real WebSocket streaming

---

### 2.3 Create Additional Example Tests (30 min)

**File**: `/workspace/tests-ui5/test-deposit-withdraw.spec.ts`

```typescript
import { test, expect } from './lib/test-setup';
import { ethers } from 'ethers';

test.describe('USDC Deposit and Withdrawal', () => {
  test('should deposit 100 USDC without manual approval', async ({ page, testWallet }) => {
    await page.goto('http://localhost:3002');
    await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });

    // Check initial USDC balance
    const usdcAddress = process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!;
    const initialBalance = await testWallet.getBalance(usdcAddress);
    console.log(`Initial USDC balance: ${ethers.formatUnits(initialBalance, 6)} USDC`);

    // Navigate to payment page
    await page.click('a:text("Payments")');

    // Deposit 100 USDC (auto-approved)
    await page.fill('input[name="amount"]', '100');
    await page.click('button:text("Deposit USDC")');

    // Wait for transaction confirmation (no popup!)
    await page.waitForSelector('text=Deposit successful', { timeout: 30000 });

    // Verify balance updated on-chain
    const newBalance = await testWallet.getBalance(usdcAddress);
    expect(newBalance).toBeLessThan(initialBalance); // USDC spent
  });

  test('should withdraw USDC without manual approval', async ({ page, testWallet }) => {
    await page.goto('http://localhost:3002');
    await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });

    // Navigate to withdrawal page
    await page.click('a:text("Withdraw")');

    // Withdraw 50 USDC
    await page.fill('input[name="amount"]', '50');
    await page.click('button:text("Withdraw")');

    // No popup, auto-approved
    await page.waitForSelector('text=Withdrawal successful', { timeout: 30000 });
  });
});
```

---

**File**: `/workspace/tests-ui5/test-vector-database.spec.ts`

```typescript
import { test, expect } from './lib/test-setup';

test.describe('Vector Database Operations', () => {
  test('should create database and upload document', async ({ page, testWallet }) => {
    await page.goto('http://localhost:3002');
    await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });

    // Navigate to vector databases
    await page.click('a:text("Databases")');

    // Create database (auto-approved transaction)
    await page.click('button:text("Create Database")');
    await page.fill('input[name="name"]', 'Test Docs DB');
    await page.click('button:text("Create")');
    await page.waitForSelector('text=Database created', { timeout: 30000 });

    // Upload document
    await page.click('text=Test Docs DB');
    await page.setInputFiles('input[type="file"]', 'test-data/sample.pdf');
    await page.click('button:text("Upload")');

    // Wait for S5 upload (2-10 seconds)
    await page.waitForSelector('text=Upload successful', { timeout: 30000 });

    // Verify document appears
    await page.waitForSelector('text=sample.pdf');

    // Search database
    await page.fill('input[name="query"]', 'What is the main topic?');
    await page.click('button:text("Search")');

    // Wait for vector search results
    await page.waitForSelector('[data-testid="search-results"]', { timeout: 10000 });
  });
});
```

---

## Phase 3: Documentation (30 min)

### 3.1 Create Testing Guide (20 min)

**File**: `/workspace/tests-ui5/TESTING_GUIDE.md`

```markdown
# UI5 Automated Testing Guide

## Overview

UI5 uses **automated blockchain testing** with a test wallet provider that auto-approves all transactions. This eliminates the need for manual MetaMask approvals while still testing against the real Base Sepolia testnet.

## Architecture

### Test Wallet Provider

- **Location**: `tests-ui5/lib/test-wallet-provider.ts`
- **Purpose**: Wraps ethers.js Wallet with TEST_USER_1_PRIVATE_KEY
- **Key Feature**: Auto-signs all transactions (no popups)

### How It Works

1. Test creates `TestWalletProvider` with private key from `.env.test`
2. Test injects wallet into browser via `page.addInitScript()`
3. UI5 detects `window.__TEST_WALLET__` and auto-connects
4. All transactions are auto-signed by test wallet
5. Tests wait for real blockchain confirmations

### What Gets Tested

✅ **Real blockchain**: Base Sepolia testnet transactions
✅ **Real S5 storage**: Decentralized file uploads
✅ **Real WebSocket**: LLM streaming from production nodes
✅ **Real smart contracts**: Deployed contracts from `.env.test`

❌ **NOT tested**: MetaMask UI interactions (UI5 uses Base Account Kit anyway)

## Running Tests

### Prerequisites

1. **UI5 must be running**:
   ```bash
   cd /workspace/apps/ui5
   pnpm dev --port 3002
   ```

2. **Environment variables** (from `.env.test`):
   - TEST_USER_1_PRIVATE_KEY
   - NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA
   - All contract addresses

3. **Test account has testnet ETH** (~0.01 ETH for gas fees)

### Run All Tests

```bash
cd /workspace/tests-ui5
./run-all-tests.sh
```

**Expected duration**: 15-30 minutes (real blockchain transactions)

### Run Individual Test

```bash
cd /workspace/tests-ui5
npx playwright test test-chat-operations.spec.ts
```

### Debug Mode

```bash
npx playwright test --debug
```

## Writing Tests

### Test Template

```typescript
import { test, expect } from './lib/test-setup';

test.describe('My Feature', () => {
  test('should do something', async ({ page, testWallet }) => {
    // Navigate to UI5
    await page.goto('http://localhost:3002');

    // Wait for SDK initialization (auto-connects via test wallet)
    await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });

    // Verify wallet connected
    const address = testWallet.getAddress();
    await expect(page.locator('[data-testid="wallet-address"]'))
      .toContainText(address.slice(0, 6));

    // Perform actions (transactions auto-approved)
    await page.click('button:text("Deposit 100 USDC")');

    // Wait for blockchain confirmation (5-15 seconds)
    await page.waitForSelector('text=Transaction confirmed', { timeout: 30000 });

    // Verify on-chain state
    const balance = await testWallet.getBalance(usdcAddress);
    expect(balance).toBeGreaterThan(0);
  });
});
```

### Key Patterns

#### 1. Always Wait for SDK Initialization
```typescript
await page.waitForSelector('text=✓ SDK Ready', { timeout: 30000 });
```

#### 2. Use Longer Timeouts for Blockchain
```typescript
// Transaction confirmation: 15-30 seconds
await page.waitForSelector('text=Transaction confirmed', { timeout: 30000 });

// S5 upload: 10-30 seconds
await page.waitForSelector('text=Upload successful', { timeout: 30000 });

// WebSocket streaming: 15-30 seconds
await page.waitForSelector('[data-testid="ai-response"]', { timeout: 30000 });
```

#### 3. Verify On-Chain State
```typescript
// Check balance after transaction
const balance = await testWallet.getBalance(tokenAddress);
expect(balance).toBeGreaterThan(expectedBalance);

// Wait for block confirmations
await testWallet.waitForTransaction(txHash, 3);
```

## Differences from UI4 Tests

| Aspect | UI4 (Mock) | UI5 (Real) |
|--------|-----------|------------|
| Blockchain | Instant (localStorage) | 5-15 seconds (Base Sepolia) |
| S5 Storage | Instant (localStorage) | 2-10 seconds (real network) |
| WebSocket | Simulated | Real production nodes |
| Transactions | Mock (no gas) | Real (requires testnet ETH) |
| Test Duration | 5 minutes (61 tests) | 15-30 minutes (61 tests) |

## Troubleshooting

### "SDK not initialized"
- Ensure UI5 is running on port 3002
- Check `.env.local` has correct configuration
- Verify test wallet injected: `console.log(window.__TEST_WALLET__)`

### "Transaction timeout"
- Increase timeout to 60 seconds for slow blockchain
- Check testnet ETH balance (need ~0.01 ETH)
- Verify Base Sepolia network status

### "S5 upload failed"
- Check S5 portal URL in `.env.local`
- Verify S5 seed phrase configured
- Increase timeout to 60 seconds

## CI/CD Integration

Tests are ready for GitHub Actions:

```yaml
# .github/workflows/ui5-tests.yml
name: UI5 Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 22
      - run: pnpm install
      - name: Start UI5
        run: cd apps/ui5 && pnpm dev --port 3002 &
      - name: Wait for UI5
        run: npx wait-on http://localhost:3002
      - name: Run tests
        run: cd tests-ui5 && ./run-all-tests.sh
        env:
          TEST_USER_1_PRIVATE_KEY: ${{ secrets.TEST_USER_1_PRIVATE_KEY }}
```

## Test Coverage

See `MANUAL_TESTING_CHECKLIST.md` for comprehensive 61-test checklist that these automated tests cover.
```

---

### 3.2 Update tests-ui5/README.md (10 min)

**Add section on automated testing**:

```markdown
## Automated Testing with Test Wallet

UI5 tests use a **test wallet provider** that auto-approves blockchain transactions, eliminating the need for manual MetaMask approvals.

### Quick Start

1. **Start UI5**:
   ```bash
   cd /workspace/apps/ui5
   pnpm dev --port 3002
   ```

2. **Run tests**:
   ```bash
   cd /workspace/tests-ui5
   ./run-all-tests.sh
   ```

3. **View results** (15-30 minutes):
   ```
   Total tests: 61
   Passed: 61
   Failed: 0
   ```

### How It Works

Tests inject a test wallet into the browser that auto-signs all transactions using `TEST_USER_1_PRIVATE_KEY` from `.env.test`. This allows testing against real Base Sepolia blockchain without manual approvals.

**See `TESTING_GUIDE.md` for complete documentation.**

### Environment Setup

Ensure `.env.test` has:
- `TEST_USER_1_PRIVATE_KEY` - Private key for test account
- `NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA` - Base Sepolia RPC URL
- All contract addresses from latest deployment

Test account must have ~0.01 testnet ETH for gas fees.
```

---

## Implementation Checklist

### Phase 1: Test Infrastructure
- [ ] Create `tests-ui5/lib/test-wallet-provider.ts` (30 min)
- [ ] Create `tests-ui5/lib/test-sdk-wrapper.ts` (30 min)
- [ ] Update `apps/ui5/lib/sdk.ts` to detect test mode (30 min)
- [ ] Update `apps/ui5/hooks/use-wallet.ts` to auto-connect test wallet (30 min)

### Phase 2: Convert Tests
- [ ] Create `tests-ui5/lib/test-setup.ts` helper (15 min)
- [ ] Convert `test-chat-operations.cjs` → `.spec.ts` (15 min)
- [ ] Create `test-deposit-withdraw.spec.ts` (15 min)
- [ ] Create `test-vector-database.spec.ts` (15 min)

### Phase 3: Documentation
- [ ] Create `tests-ui5/TESTING_GUIDE.md` (20 min)
- [ ] Update `tests-ui5/README.md` with automated testing section (10 min)

### Verification
- [ ] Run example test: `npx playwright test test-chat-operations.spec.ts`
- [ ] Verify no MetaMask popup appears
- [ ] Verify transactions auto-approve
- [ ] Verify real blockchain confirmations
- [ ] Run full test suite: `./run-all-tests.sh`

---

## Expected Outcomes

After implementation:

✅ **61 automated tests** running without manual intervention
✅ **15-30 minute test execution** (vs hours of manual testing)
✅ **Deterministic results** (no flaky MetaMask timing)
✅ **CI/CD ready** (can run in GitHub Actions)
✅ **Real blockchain validation** (Base Sepolia testnet)

## Time Estimate

**Total: 3.5 hours**
- Phase 1: 2 hours
- Phase 2: 1 hour
- Phase 3: 30 minutes

## Next Steps

1. Implement Phase 1 (test infrastructure)
2. Test with single example test
3. Convert remaining tests
4. Document and commit

---

**References**:
- Test wallet pattern: `/workspace/tests-ui5/test-rag-e2e.cjs` (existing proof of concept)
- UI4 tests: `/workspace/test-*.cjs` (61 test scenarios to adapt)
- SDK docs: `/workspace/docs/SDK_API.md`
- Migration plan: `/workspace/docs/ui5-reference/UI5_MIGRATION_PLAN.md`
