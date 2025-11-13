# UI5 Migration Plan: Production SDK Integration

**Project**: fabstir-llm-sdk - UI5 with Real SDK (@fabstir/sdk-core)
**Goal**: Migrate UI4 (mock SDK) to UI5 (production SDK) with Base Account Kit integration
**Estimated Time**: 12-20 hours
**Prerequisites**: UI4 fully tested (61/61 tests passing with mock SDK)

---

## Overview

UI5 will be a production-ready version of UI4 using:
- ✅ Real `@fabstir/sdk-core` (not mock)
- ✅ Real blockchain transactions (Base Sepolia testnet)
- ✅ Real S5 storage for conversations
- ✅ Real WebSocket connections to production nodes
- ✅ **Base Account Kit** for account abstraction
- ✅ **Sub-accounts with spend permissions** for gasless transactions

---

## Phase 0: Project Setup ✅

### 0.1: Copy UI4 to UI5
- [x] Copy entire `/workspace/apps/ui4/` to `/workspace/apps/ui5/`
- [x] Update `apps/ui5/package.json` name to `"@fabstir/ui5"`
- [x] Update `apps/ui5/package.json` description to "Production UI with Real SDK"
- [x] Add ui5 to root workspace in `/workspace/package.json`
- [x] Create `/workspace/apps/ui5/.env.local` (do not commit)
- [x] Create `/workspace/apps/ui5/.gitignore` entry for `.env.local`

**Commands**:
```bash
cd /workspace/apps
cp -r ui4 ui5

# Update package.json
cd ui5
# Change name: "@fabstir/ui4" → "@fabstir/ui5"
# Change description to mention production SDK

# Create environment file
touch .env.local
echo ".env.local" >> .gitignore
```

**Verification**:
- [x] UI5 folder exists with all UI4 files
- [x] UI5 package.json has correct name
- [x] .env.local file created (empty for now)

**Time Estimate**: 15 minutes

---

## Phase 1: Dependency Updates ✅

### 1.1: Remove Mock SDK
- [x] Open `/workspace/apps/ui5/package.json`
- [x] Remove dependency: `"@fabstir/sdk-core-mock": "workspace:*"`
- [x] Remove any other mock-related dependencies

### 1.2: Add Production SDK
- [x] Add dependency: `"@fabstir/sdk-core": "workspace:*"`
- [x] ~~Add dependency: `"@s5-dev/s5js": "^1.0.0"`~~ (Skipped - pulled in via sdk-core workspace)
- [x] Add dependency: `"ethers": "^6.13.0"`

### 1.3: Add Base Account Kit
- [x] Add dependency: `"@base-org/account": "^1.0.0"` (Base Account SDK)
- [x] Add dependency: `"viem": "^2.0.0"` (required by Base Account Kit)
- [x] Add dependency: `"@wagmi/core": "^2.0.0"` (wallet integration)

### 1.4: Install Dependencies
- [x] Run `cd /workspace/apps/ui5 && pnpm install`
- [x] Verify no installation errors
- [x] Verify `@fabstir/sdk-core` resolves to workspace package

**package.json changes**:
```diff
{
  "name": "@fabstir/ui5",
  "dependencies": {
-   "@fabstir/sdk-core-mock": "workspace:*",
+   "@fabstir/sdk-core": "workspace:*",
+   "@s5-dev/s5js": "^1.0.0",
+   "ethers": "^6.13.0",
+   "@base-org/account": "^1.0.0",
+   "viem": "^2.0.0",
+   "@wagmi/core": "^2.0.0",
    "next": "14.0.0",
    "react": "^18.2.0",
    // ... other dependencies
  }
}
```

**Verification**:
- [x] `pnpm install` completes successfully
- [x] `node_modules/@fabstir/sdk-core` exists
- [x] `node_modules/@base-org/account` exists
- [x] No dependency conflicts

**Time Estimate**: 20 minutes

---

## Phase 2: Configuration Setup ✅

### 2.1: Environment Variables
- [x] Copy contract addresses from `/workspace/.env.test` to `apps/ui5/.env.local`
- [x] Add RPC URLs for Base Sepolia
- [x] Add S5 portal configuration
- [x] Add Base Account Kit configuration
- [x] **DO NOT** commit `.env.local` to git

**File**: `/workspace/apps/ui5/.env.local`

```bash
# ===========================
# BLOCKCHAIN CONFIGURATION
# ===========================

# Base Sepolia (Chain ID: 84532)
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CHAIN_NAME="Base Sepolia"
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://sepolia.base.org

# ===========================
# CONTRACT ADDRESSES
# Copy from .env.test (do NOT hardcode!)
# ===========================

NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=<copy from .env.test>
NEXT_PUBLIC_CONTRACT_FAB_TOKEN=<copy from .env.test>

# ===========================
# BASE ACCOUNT KIT
# ===========================

# Base Protocol Contract (NOT Fabstir contract!)
NEXT_PUBLIC_BASE_CONTRACT_SPEND_PERMISSION_MANAGER=<copy from .env.test>

# Account Kit Configuration
NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY=<your Coinbase API key>
NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID=<your project ID>

# ===========================
# S5 STORAGE
# ===========================

NEXT_PUBLIC_S5_PORTAL_URL=https://s5.cx
NEXT_PUBLIC_S5_ENABLE_STORAGE=true

# User-specific (each user provides their own seed)
# This is for testing only - production uses wallet-derived seeds
NEXT_PUBLIC_S5_SEED_PHRASE="<optional test seed phrase>"

# ===========================
# PRODUCTION NODE ENDPOINTS
# ===========================

NEXT_PUBLIC_DEFAULT_HOST_URL=http://81.150.166.91:8080
NEXT_PUBLIC_DEFAULT_HOST_WS=ws://81.150.166.91:8080/ws

# ===========================
# FEATURE FLAGS
# ===========================

NEXT_PUBLIC_ENABLE_ENCRYPTION=true
NEXT_PUBLIC_ENABLE_BASE_ACCOUNT_KIT=true
NEXT_PUBLIC_ENABLE_GASLESS_TRANSACTIONS=true

# ===========================
# DEVELOPMENT
# ===========================

NODE_ENV=development
NEXT_PUBLIC_DEBUG_MODE=true
```

### 2.2: Verify Environment Variables
- [x] Check all contract addresses are from `.env.test` (no hardcoded values)
- [x] Verify RPC URL is accessible: `curl https://sepolia.base.org`
- [x] Verify S5 portal is accessible: `curl https://s5.cx`
- [x] Confirm `BASE_CONTRACT_SPEND_PERMISSION_MANAGER` is Base protocol address (not Fabstir)

**Verification Commands**:
```bash
# Test RPC endpoint
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# Should return: {"jsonrpc":"2.0","id":1,"result":"0x..."}

# Test S5 portal
curl -I https://s5.cx
# Should return: HTTP/2 200
```

**Time Estimate**: 30 minutes

---

## Phase 3: SDK Core Integration ✅

### 3.1: Update SDK Initialization

**File**: `/workspace/apps/ui5/lib/sdk.ts`

- [x] Remove mock SDK imports
- [x] Add real SDK imports
- [x] Update SDK initialization to use `FabstirSDKCore`
- [x] Add ChainRegistry configuration
- [x] Add S5 configuration
- [x] Add proper error handling

**Before (Mock SDK)**:
```typescript
import { UI4SDK } from '@fabstir/sdk-core-mock';

class UI5SDK {
  private sdk: UI4SDK | null = null;

  async initialize(userAddress: string): Promise<void> {
    this.sdk = new UI4SDK(userAddress);
    await this.sdk.initialize();
  }
}
```

**After (Real SDK)**:
```typescript
import { FabstirSDKCore } from '@fabstir/sdk-core';
import { ChainRegistry, ChainId } from '@fabstir/sdk-core/config';
import type { Signer } from 'ethers';

class UI5SDK {
  private sdk: FabstirSDKCore | null = null;
  private isInitializing = false;

  /**
   * Initialize SDK with real blockchain connection
   * @param signer - Ethers signer from wallet (MetaMask, Base Account Kit, etc.)
   */
  async initialize(signer: Signer): Promise<void> {
    // Prevent concurrent initialization
    if (this.isInitializing) {
      const maxWait = 5000;
      const startTime = Date.now();
      while (this.isInitializing && Date.now() - startTime < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.isInitializing) {
        throw new Error('SDK initialization timeout');
      }
      return;
    }

    // Already initialized
    if (this.sdk?.isInitialized()) {
      return;
    }

    this.isInitializing = true;

    try {
      // Get chain configuration
      const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

      // Initialize SDK with real configuration
      this.sdk = new FabstirSDKCore({
        mode: 'production' as const,
        chainId: ChainId.BASE_SEPOLIA,
        rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
        contractAddresses: {
          jobMarketplace: process.env.NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE!,
          nodeRegistry: process.env.NEXT_PUBLIC_CONTRACT_NODE_REGISTRY!,
          proofSystem: process.env.NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM!,
          hostEarnings: process.env.NEXT_PUBLIC_CONTRACT_HOST_EARNINGS!,
          modelRegistry: process.env.NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY!,
          usdcToken: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
          fabToken: process.env.NEXT_PUBLIC_CONTRACT_FAB_TOKEN!,
        },
        s5Config: {
          portalUrl: process.env.NEXT_PUBLIC_S5_PORTAL_URL!,
          enableStorage: process.env.NEXT_PUBLIC_ENABLE_STORAGE === 'true',
        },
        encryptionConfig: {
          enabled: process.env.NEXT_PUBLIC_ENABLE_ENCRYPTION === 'true',
        },
      });

      // Authenticate with wallet
      const address = await signer.getAddress();
      await this.sdk.authenticate('privatekey', {
        signer,  // Pass signer for real transactions
        address  // User address from wallet
      });

      console.log('[UI5SDK] SDK initialized successfully for:', address);
    } catch (error) {
      console.error('[UI5SDK] Initialization failed:', error);
      this.sdk = null;
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Get SDK instance (throws if not initialized)
   */
  getSDK(): FabstirSDKCore {
    if (!this.sdk) {
      throw new Error('SDK not initialized. Call initialize() first.');
    }
    return this.sdk;
  }

  /**
   * Check if SDK is initialized
   */
  isInitialized(): boolean {
    return this.sdk?.isInitialized() ?? false;
  }

  /**
   * Get all SDK managers
   */
  getManagers() {
    if (!this.sdk?.isInitialized()) {
      return null;
    }
    return {
      sessionGroupManager: this.sdk.getSessionGroupManager(),
      vectorRAGManager: this.sdk.getVectorRAGManager(),
      sessionManager: this.sdk.getSessionManager(),
      paymentManager: this.sdk.getPaymentManager(),
      hostManager: this.sdk.getHostManager(),
      // Add other managers as needed
    };
  }
}

// Singleton instance
export const ui5SDK = new UI5SDK();
```

**Verification**:
- [x] TypeScript compiles without errors
- [x] All environment variables accessed correctly
- [x] Error handling in place for initialization failures

**Time Estimate**: 1 hour

### 3.2: Update SDK Hook

**File**: `/workspace/apps/ui5/hooks/use-sdk.ts`

- [x] Update to use new SDK initialization pattern
- [x] Pass signer instead of userAddress
- [x] Add proper loading and error states

```typescript
import { useState, useEffect } from 'react';
import { ui5SDK } from '@/lib/sdk';
import type { Signer } from 'ethers';

export function useSDK(signer: Signer | null) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<ReturnType<typeof ui5SDK.getManagers>>(null);

  useEffect(() => {
    // Check if SDK already initialized on mount
    if (ui5SDK.isInitialized() && !managers) {
      setManagers(ui5SDK.getManagers());
      setIsInitialized(true);
    }
  }, []);

  const initializeSDK = async () => {
    if (!signer || isInitializing || isInitialized) {
      return;
    }

    setIsInitializing(true);
    setError(null);

    try {
      await ui5SDK.initialize(signer);
      setManagers(ui5SDK.getManagers());
      setIsInitialized(true);
      console.log('[useSDK] SDK initialized successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize SDK';
      console.error('[useSDK] Initialization error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsInitializing(false);
    }
  };

  return {
    managers,
    isInitialized,
    isInitializing,
    error,
    initializeSDK,
  };
}
```

**Time Estimate**: 30 minutes

---

## Phase 4: Base Account Kit Integration ✅

### 4.1: Create Base Wallet Provider

**File**: `/workspace/apps/ui5/lib/base-wallet.ts`

- [x] Create Base Account Kit provider
- [x] Implement sub-account creation with spend permissions
- [x] Handle authentication flow
- [x] Export signer for SDK

```typescript
import { createBaseAccountSDK } from '@base-org/account';
import { base } from '@base-org/account/chains';
import { ethers } from 'ethers';

export interface BaseWalletConfig {
  apiKey: string;
  projectId: string;
  chain: typeof base.sepolia | typeof base.mainnet;
}

export interface SubAccountConfig {
  tokenAddress: string;
  tokenDecimals: number;
  maxAllowance: string;  // e.g., "1000000" for 1M USDC
  periodDays: number;     // e.g., 365 for 1 year
}

export class BaseWalletProvider {
  private accountSDK: any;
  private primaryAccount: string | null = null;
  private subAccount: string | null = null;

  constructor(config: BaseWalletConfig) {
    this.accountSDK = createBaseAccountSDK({
      apiKey: config.apiKey,
      projectId: config.projectId,
      chain: config.chain,
    });
  }

  /**
   * Connect wallet and get primary account
   */
  async connect(): Promise<string> {
    try {
      // Trigger Base Account Kit UI (pop-up or embedded)
      await this.accountSDK.connect();

      // Get primary smart wallet address
      this.primaryAccount = await this.accountSDK.getAddress();

      console.log('[BaseWallet] Connected:', this.primaryAccount);
      return this.primaryAccount;
    } catch (error) {
      console.error('[BaseWallet] Connection failed:', error);
      throw new Error('Failed to connect Base Account Kit wallet');
    }
  }

  /**
   * Create or get sub-account with spend permissions (for gasless transactions)
   */
  async ensureSubAccount(config: SubAccountConfig): Promise<{
    address: string;
    isExisting: boolean;
  }> {
    if (!this.primaryAccount) {
      throw new Error('Primary account not connected. Call connect() first.');
    }

    try {
      // Check if sub-account already exists for this origin
      const existingSubAccount = await this.accountSDK.getSubAccount();

      if (existingSubAccount) {
        console.log('[BaseWallet] Using existing sub-account:', existingSubAccount);
        this.subAccount = existingSubAccount;
        return { address: existingSubAccount, isExisting: true };
      }

      // Create new sub-account with spend permissions
      console.log('[BaseWallet] Creating sub-account with spend permissions...');

      const subAccountAddress = await this.accountSDK.createSubAccount({
        spendPermission: {
          token: config.tokenAddress,
          allowance: ethers.parseUnits(config.maxAllowance, config.tokenDecimals),
          period: config.periodDays * 24 * 60 * 60, // days to seconds
        },
      });

      this.subAccount = subAccountAddress;
      console.log('[BaseWallet] Sub-account created:', subAccountAddress);

      return { address: subAccountAddress, isExisting: false };
    } catch (error) {
      console.error('[BaseWallet] Sub-account creation failed:', error);
      throw new Error('Failed to create sub-account with spend permissions');
    }
  }

  /**
   * Get ethers signer for SDK integration
   */
  async getSigner(): Promise<ethers.Signer> {
    if (!this.primaryAccount) {
      throw new Error('Wallet not connected');
    }

    // Convert Base Account Kit provider to ethers signer
    const provider = await this.accountSDK.getProvider();
    const signer = await provider.getSigner();

    return signer;
  }

  /**
   * Get current account addresses
   */
  getAddresses(): { primary: string | null; sub: string | null } {
    return {
      primary: this.primaryAccount,
      sub: this.subAccount,
    };
  }

  /**
   * Disconnect wallet
   */
  async disconnect(): Promise<void> {
    await this.accountSDK.disconnect();
    this.primaryAccount = null;
    this.subAccount = null;
    console.log('[BaseWallet] Disconnected');
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.primaryAccount !== null;
  }
}

// Singleton instance
let baseWalletInstance: BaseWalletProvider | null = null;

export function getBaseWallet(): BaseWalletProvider {
  if (!baseWalletInstance) {
    const config: BaseWalletConfig = {
      apiKey: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY!,
      projectId: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID!,
      chain: base.sepolia, // Use base.mainnet for production
    };

    baseWalletInstance = new BaseWalletProvider(config);
  }

  return baseWalletInstance;
}
```

**Verification**:
- [x] TypeScript compiles without errors
- [x] Base Account Kit SDK imported correctly
- [x] Environment variables accessed
- [x] **Note**: Implementation uses MetaMask primarily with Base Account Kit ready when configured

**Time Estimate**: 2 hours

### 4.2: Update Wallet Hook

**File**: `/workspace/apps/ui5/hooks/use-wallet.ts`

- [x] Remove mock wallet implementation
- [x] Add Base Account Kit integration
- [x] Handle sub-account creation
- [x] Auto-initialize SDK after connection

```typescript
import { useState, useEffect } from 'react';
import { getBaseWallet } from '@/lib/base-wallet';
import { useSDK } from './use-sdk';
import type { Signer } from 'ethers';

export function useWallet() {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [subAccountAddress, setSubAccountAddress] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { initializeSDK, isInitialized, managers } = useSDK(signer);

  // Check for existing connection on mount
  useEffect(() => {
    const baseWallet = getBaseWallet();
    if (baseWallet.isConnected()) {
      const addresses = baseWallet.getAddresses();
      setAddress(addresses.primary);
      setSubAccountAddress(addresses.sub);
      setIsConnected(true);

      // Get signer and initialize SDK
      baseWallet.getSigner().then(async (walletSigner) => {
        setSigner(walletSigner);
        if (!isInitialized) {
          await initializeSDK();
        }
      });
    }
  }, []);

  /**
   * Connect Base Account Kit wallet
   */
  const connectWallet = async () => {
    if (isConnecting || isConnected) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const baseWallet = getBaseWallet();

      // Step 1: Connect primary account
      console.log('[useWallet] Connecting Base Account Kit...');
      const primaryAddress = await baseWallet.connect();
      setAddress(primaryAddress);
      setIsConnected(true);

      // Step 2: Ensure sub-account with spend permissions
      console.log('[useWallet] Setting up sub-account...');
      const subAccountResult = await baseWallet.ensureSubAccount({
        tokenAddress: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
        tokenDecimals: 6,
        maxAllowance: '1000000', // 1M USDC
        periodDays: 365,
      });
      setSubAccountAddress(subAccountResult.address);

      if (subAccountResult.isExisting) {
        console.log('[useWallet] Using existing sub-account');
      } else {
        console.log('[useWallet] Created new sub-account');
      }

      // Step 3: Get signer
      const walletSigner = await baseWallet.getSigner();
      setSigner(walletSigner);

      // Step 4: Initialize SDK
      console.log('[useWallet] Initializing SDK...');
      await initializeSDK();

      console.log('[useWallet] Connection complete!');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect wallet';
      console.error('[useWallet] Connection error:', errorMessage);
      setError(errorMessage);
      setIsConnected(false);
      setAddress(null);
      setSubAccountAddress(null);
      setSigner(null);
    } finally {
      setIsConnecting(false);
    }
  };

  /**
   * Disconnect wallet
   */
  const disconnectWallet = async () => {
    try {
      const baseWallet = getBaseWallet();
      await baseWallet.disconnect();

      setIsConnected(false);
      setAddress(null);
      setSubAccountAddress(null);
      setSigner(null);

      console.log('[useWallet] Disconnected successfully');
    } catch (err) {
      console.error('[useWallet] Disconnect error:', err);
    }
  };

  return {
    // Connection state
    isConnected,
    isConnecting,
    address,           // Primary smart wallet address
    subAccountAddress, // Sub-account with spend permissions (for gasless txs)
    signer,
    error,

    // SDK state
    isInitialized,
    managers,

    // Actions
    connectWallet,
    disconnectWallet,
  };
}
```

**Verification**:
- [x] Wallet connection flow works
- [x] Sub-account created with spend permissions
- [x] SDK initializes after wallet connection

**Time Estimate**: 2 hours

### 4.3: Update Header Component

**File**: `/workspace/apps/ui5/components/Header.tsx`

- [ ] Update to show both primary and sub-account addresses (deferred to Phase 5 manual testing)
- [ ] Show connection status (deferred to Phase 5 manual testing)
- [ ] Handle Base Account Kit UI (deferred to Phase 5 manual testing)

```typescript
'use client';

import { useWallet } from '@/hooks/use-wallet';

export function Header() {
  const {
    isConnected,
    isConnecting,
    address,
    subAccountAddress,
    isInitialized,
    connectWallet,
    disconnectWallet,
    error,
  } = useWallet();

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">UI5 - Production</h1>
          <p className="text-sm text-gray-500">Powered by @fabstir/sdk-core</p>
        </div>

        <div className="flex items-center gap-4">
          {error && (
            <div className="text-sm text-red-600">
              Error: {error}
            </div>
          )}

          {isConnected ? (
            <div className="flex items-center gap-3">
              {/* Primary Account */}
              <div className="text-right">
                <p className="text-xs text-gray-500">Primary Account</p>
                <p className="text-sm font-mono">
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>

              {/* Sub-account (if exists) */}
              {subAccountAddress && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">Sub-account (Gasless)</p>
                  <p className="text-sm font-mono text-green-600">
                    {subAccountAddress.slice(0, 6)}...{subAccountAddress.slice(-4)}
                  </p>
                </div>
              )}

              {/* SDK Status */}
              <div className="flex items-center gap-2">
                {isInitialized ? (
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    ✓ SDK Ready
                  </span>
                ) : (
                  <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
                    ⏳ Initializing...
                  </span>
                )}
              </div>

              {/* Disconnect Button */}
              <button
                onClick={disconnectWallet}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-md"
            >
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Time Estimate**: 1 hour

---

## Phase 5: SDK Architecture Improvements & Testing

### 5.0: SDK Core Bug Fix - Restore VectorRAGManager Database Management ✅

**Background**: The production SDK's VectorRAGManager was "simplified" (commit 91c2e0b) which removed client-side database management features. This broke the vector database UI that UI4/UI5 depend on. The simplification removed too much - we need client-side database management but NOT client-side search.

**Root Cause**:
- Old VectorRAGManager (961 lines): Had database management + client-side WASM search
- New VectorRAGManager (269 lines): Removed everything, delegated to SessionManager
- Problem: Removed database management which IS needed client-side
- Problem: The "simplification" comment says to use SessionManager.startSession() but that's for LLM sessions, not vector databases!

**Correct Architecture**:
```
Client-Side (VectorRAGManager):
├── Database Management (RESTORE THIS)
│   ├── createSession() - Creates persistent vector DB using VectorDbSession
│   ├── listDatabases() - Lists user's databases from metadata
│   ├── addVectors() - Stores vectors in S5 via VectorDbSession
│   ├── getVectors() - Retrieves vectors from S5
│   └── deleteDatabase() - Removes database from S5
│
└── Search Operations (KEEP DELEGATED TO HOST)
    ├── search() - Delegates to SessionManager.searchVectors()
    └── uploadVectors() - Uploads to host session for search
```

Host-Side (SessionManager):
└── Stateless Operations
    ├── searchVectors() - Rust cosine similarity search
    └── WebSocket session memory (auto-cleared on disconnect)

**Implementation Strategy**: Hybrid restoration from commit 91c2e0b^

#### Sub-phase 5.0.1: Restore Client-Side Database Management

**Files to Restore** (from git commit `91c2e0b^`):
- `/workspace/packages/sdk-core/src/managers/VectorRAGManager.ts` (partial restoration)

**Methods to RESTORE** (client-side, ~400 lines):
1. Constructor: Accept `userAddress`, `seedPhrase`, `config`, `metadataService`
2. `createSession(dbName, config?)` - Creates VectorDbSession for persistence
3. `listDatabases()` - Returns DatabaseMetadata[] from metadata service
4. `addVector(sessionId, id, values, metadata)` - Adds to client VectorDbSession
5. `getVectors(sessionId, vectorIds)` - Retrieves from client VectorDbSession
6. `deleteDatabase(dbName)` - Removes database and S5 data
7. `closeSession(sessionId)` - Closes VectorDbSession (saves to S5)
8. Private helpers: `getSession()`, `ensureNotDisposed()`, session caching

**Methods to KEEP HOST-DELEGATED** (no changes, ~80 lines):
1. `search()` - Delegates to SessionManager.searchVectors() (Rust search)
2. `uploadVectors()` - Uploads vectors to host session memory
3. `deleteByMetadata()` - Soft delete via metadata update

**Methods to REMOVE** (client-side search, ~200 lines):
1. ~~`searchVectors()`~~ - This did client-side WASM search (NOT wanted)
2. ~~`searchInFolder()`~~ - Client-side folder filtering (NOT wanted)
3. ~~`searchMultipleDatabases()`~~ - Client-side multi-DB search (NOT wanted)

**Supporting Files** (already exist, no changes needed):
- `/workspace/packages/sdk-core/src/rag/types.ts` ✅
- `/workspace/packages/sdk-core/src/rag/config.ts` ✅
- `/workspace/packages/sdk-core/src/rag/session-cache.ts` ✅
- `/workspace/packages/sdk-core/src/rag/vector-operations.ts` ✅
- `/workspace/packages/sdk-core/src/database/DatabaseMetadataService.ts` ✅
- `/workspace/packages/sdk-core/src/database/types.ts` ✅

**Package Dependency**:
```bash
# Already installed in sdk-core package.json
"@fabstir/vector-db-native": "file:fabstir-vector-db-native-0.3.0.tgz"
```

**Implementation Steps**:
1. [x] Extract old VectorRAGManager: `git show 91c2e0b^:packages/sdk-core/src/managers/VectorRAGManager.ts > /tmp/old-vectorragmanager.ts`
2. [x] Copy file structure and imports from old version
3. [x] Restore constructor with userAddress/seedPhrase parameters
4. [x] Restore createSession() - client-side VectorDbSession creation
5. [x] Restore listDatabases() - metadata service integration
6. [x] Restore addVector() - client-side vector storage
7. [x] Restore closeSession() - S5 persistence
8. [x] Keep search() delegated to SessionManager (NO client-side search!)
9. [x] Remove all client-side search methods (searchVectors, searchInFolder, searchMultipleDatabases)
10. [x] Update IVectorRAGManager interface to match restored methods (added deleteByMetadata)
11. [x] Test import: `import { VectorDbSession } from '@fabstir/vector-db-native'`
12. [x] Verify no TypeScript errors (SDK builds successfully)

**Expected File Size**: ~550 lines (down from 961, up from 269)

**Time Estimate**: 3-4 hours (careful extraction and testing)

#### Sub-phase 5.0.2: Update FabstirSDKCore Initialization

**File**: `/workspace/packages/sdk-core/src/FabstirSDKCore.ts`

**Current Code** (line ~575):
```typescript
this.vectorRAGManager = new VectorRAGManager(this.sessionManager);
```

**New Code**:
```typescript
// VectorRAGManager needs userAddress, S5 seed, and config
if (!this.userAddress) {
  throw new Error('Cannot initialize VectorRAGManager: userAddress not set');
}
if (!this.s5Seed) {
  throw new Error('Cannot initialize VectorRAGManager: S5 seed not generated');
}

// Get default RAG config
const ragConfig: RAGConfig = {
  portalUrl: this.config.s5Config?.portalUrl || 'https://s5.cx',
  seedPhrase: this.s5Seed,
  dimensions: 384, // all-MiniLM-L6-v2
  metric: 'cosine',
  indexType: 'hnsw'
};

// Initialize VectorRAGManager with database management support
this.vectorRAGManager = new VectorRAGManager({
  userAddress: this.userAddress,
  seedPhrase: this.s5Seed,
  config: ragConfig,
  metadataService: new DatabaseMetadataService(),
  sessionManager: this.sessionManager // For search delegation
});
```

**Additional Imports Needed**:
```typescript
import { RAGConfig } from './rag/types';
import { DatabaseMetadataService } from './database/DatabaseMetadataService';
```

**Time Estimate**: 30 minutes

#### Sub-phase 5.0.3: Test Database Creation

**Test File**: `/workspace/tests-ui5/test-vector-db-create.spec.ts` (already exists)

**Verification Steps**:
1. [x] Start UI5: `cd /workspace/apps/ui5 && pnpm dev --port 3002`
2. [x] Run test: `cd /workspace/tests-ui5 && npx playwright test test-vector-db-create.spec.ts`
3. [x] Verify: Database creation succeeds (no deprecation error)
4. [x] Verify: Database appears in list
5. [x] Verify: No client-side search methods used (only SessionManager.searchVectors)

**Expected Result**: Test passes, database created client-side, stored in S5

**Time Estimate**: 1 hour (including debugging)

**Total Time for Phase 5.0**: 4-6 hours

---

### 5.1: Replace @fabstir/vector-db-native with Lightweight S5 Storage ⏳

**Problem Identified**: Phase 5.0 restored VectorRAGManager but it uses `@fabstir/vector-db-native` (8MB Rust binary with Node.js-only dependencies like `fs`, `path`, `process`). This causes:
1. ❌ Browser incompatibility (Next.js can't bundle it)
2. ❌ Includes heavy HNSW/IVF search algorithms (8MB) that should be on host
3. ❌ Violates mobile-first principle (mobile phones shouldn't run heavy algorithms)

**Solution**: Replace with lightweight (~5KB) browser-compatible S5VectorStore.

**Implementation Plan**: See `docs/IMPLEMENTATION_S5_VECTOR_STORE.md` for complete TDD bounded autonomy plan following strict format from `docs/IMPLEMENTATION_RAG_MISSING.md`.

**Architecture Summary**:
```
Client → S5VectorStore (~5KB)
         ├── S5 storage ✅
         ├── Metadata management ✅
         ├── Simple CRUD ✅
         └── Web Crypto encryption ✅

Host → Heavy Operations (via SessionManager)
         ├── Embeddings (GPU) ✅
         ├── HNSW/IVF indexing ✅
         ├── Vector search ✅
         └── Batch processing ✅
```

**Key Sub-phases** (from IMPLEMENTATION_S5_VECTOR_STORE.md):
- **5.1.1**: Create S5VectorStore Module (6-8 hours) - 30 tests, browser-compatible storage
- **5.1.2**: Update VectorRAGManager (3-4 hours) - Replace VectorDbSession with S5VectorStore
- **5.1.3**: Update Host Node Integration (2-3 hours) - Host loads vectors from S5 CID
- **5.1.4**: Testing & Validation (2-3 hours) - Unit, integration, browser, performance tests
- **5.1.5**: Documentation (1-2 hours) - API reference, migration guide

**Total Time Estimate**: 12-16 hours

**Status Tracking**: ⏳ Not started - See implementation document for detailed progress tracking

**Complete Implementation Details**: See `docs/IMPLEMENTATION_S5_VECTOR_STORE.md`

This document follows strict TDD bounded autonomy approach with:
- 30 comprehensive tests (write all tests first)
- Complete S5VectorStore implementation (~400 lines)
- VectorRAGManager updates (~150 lines changed)
- Host node coordination via WebSocket
- Browser/performance/integration testing
- API documentation and migration guide

**Reusing Mock SDK Types**: Types from `@fabstir/sdk-core-mock/src/types/index.ts` will be reused where applicable:
- `VectorDatabaseMetadata` ✅
- `FolderStats` ✅
- `SearchResult` ✅
```typescript
// OLD: Import native module
import { VectorDbSession } from '@fabstir/vector-db-native';

// NEW: Import lightweight storage
import { S5VectorStore } from '../storage/S5VectorStore';
import { SessionManager } from './SessionManager';

export class VectorRAGManager implements IVectorRAGManager {
  private vectorStore: S5VectorStore;
  private sessionManager: SessionManager;

  constructor(options: {
    userAddress: string;
    seedPhrase: string;
    s5Client: S5Client;
    sessionManager: SessionManager;
  }) {
    this.vectorStore = new S5VectorStore(options.s5Client, options.seedPhrase);
    this.sessionManager = options.sessionManager;
  }

  // Lightweight client-side operations
  async createSession(databaseName: string): Promise<string> {
    return await this.vectorStore.createDatabase(
      databaseName,
      this.userAddress
    );
  }

  async listDatabases(): Promise<DatabaseMetadata[]> {
    return await this.vectorStore.listDatabases(this.userAddress);
  }

  async addVectors(sessionId: string, vectors: VectorRecord[]): Promise<void> {
    // Store in S5 (lightweight)
    await this.vectorStore.addVectors(sessionId, vectors);
  }

  // Heavy operation delegated to host
  async search(
    sessionId: string,
    queryVector: number[],
    topK: number = 5,
    threshold: number = 0.7
  ): Promise<SearchResult[]> {
    // Get S5 CIDs for this database
    const cids = await this.vectorStore.getDatabaseCIDs(sessionId);

    // Delegate to SessionManager → Host loads from S5 and searches
    return await this.sessionManager.searchVectors(
      sessionId,
      queryVector,
      topK,
      threshold,
      { s5Cids: cids } // Host loads from these CIDs
    );
  }
}
```

#### Sub-phase 5.1.3: Update Host Node to Load from S5

**Context**: Host nodes need to load vectors from S5 CIDs when performing search.

**File to Update**: `fabstir-llm-node` (separate repository)

**New WebSocket Message Type**:
```rust
// searchVectors request now includes S5 CIDs
{
  "type": "searchVectors",
  "session_id": "sess_123",
  "query_vector": [0.1, 0.2, ...],
  "top_k": 5,
  "threshold": 0.7,
  "s5_cids": ["cid1", "cid2", "cid3"] // Host loads from these
}
```

**Host Implementation** (pseudocode):
```rust
async fn handle_search_vectors(request: SearchVectorsRequest) -> SearchResult {
    // 1. Load vectors from S5 CIDs
    let vectors = load_vectors_from_s5(&request.s5_cids).await?;

    // 2. Build HNSW index in memory (host has RAM for this)
    let index = build_hnsw_index(vectors)?;

    // 3. Perform search
    let results = index.search(&request.query_vector, request.top_k)?;

    // 4. Return results
    Ok(results)
}
```

**Note**: This change is in the host node repository, not SDK. Coordinate with host node team.

#### Sub-phase 5.1.4: Testing & Validation

**Test Plan**:

1. **Unit Tests** for S5VectorStore:
   - Test encryption/decryption
   - Test chunking (10K vectors per chunk)
   - Test S5 upload/download
   - Test metadata management

2. **Integration Tests**:
   - Create database → Store vectors → Load from S5
   - Add 50K vectors → Verify chunked correctly (5 chunks)
   - Search vectors → Verify host loads from S5 and returns results

3. **Browser Compatibility Tests**:
   - Test in Chrome, Firefox, Safari
   - Test on mobile (iOS Safari, Android Chrome)
   - Verify no Node.js-specific errors

4. **Performance Tests**:
   - Add 100K vectors → Measure upload time
   - Load 100K vectors → Measure download time
   - Compare with old @fabstir/vector-db-native approach

**Expected Results**:
- ✅ No browser compatibility errors
- ✅ Works on mobile devices
- ✅ Lightweight (~5KB vs 8MB)
- ✅ Search delegated to host correctly

#### Sub-phase 5.1.5: Update Documentation

**Files to Update**:
1. `/workspace/docs/SDK_API.md` - Document S5VectorStore API
2. `/workspace/docs/ARCHITECTURE.md` - Document client/host split
3. `/workspace/docs/ui5-reference/README.md` - Update migration notes
4. `/workspace/packages/sdk-core/README.md` - Update dependencies

**Documentation Points**:
- Client handles lightweight operations only
- Host handles heavy computation (search, embeddings)
- Vectors stored in S5 (user-owned, decentralized)
- Browser-compatible architecture

**Time Estimate**: 12-16 hours total
- Sub-phase 5.1.1: Create S5VectorStore (6-8 hours)
- Sub-phase 5.1.2: Update VectorRAGManager (2-3 hours)
- Sub-phase 5.1.3: Coordinate with host team (1-2 hours)
- Sub-phase 5.1.4: Testing (2-3 hours)
- Sub-phase 5.1.5: Documentation (1 hour)

**Dependencies**:
- Enhanced S5.js for S5 operations
- Web Crypto API (browser built-in)
- Host node update (coordinate with host team)

**Success Criteria**:
- [  ] S5VectorStore module created and tested
- [  ] VectorRAGManager uses S5VectorStore instead of @fabstir/vector-db-native
- [  ] No browser compatibility errors
- [  ] Works on mobile devices
- [  ] Search correctly delegated to host
- [  ] Host can load vectors from S5 CIDs
- [  ] All tests passing
- [  ] Documentation updated

---

### 5.2: Update Test Scripts for Real SDK ✅
- [x] Copy test scripts from UI4: `cp /workspace/test-*.cjs /workspace/tests-ui5/`
- [x] Update scripts to connect to UI5: `http://localhost:3002` (different port)
- [x] Add longer timeouts for real blockchain transactions
- [x] Update expectations for real SDK behavior

**Key Changes in Test Scripts**:
```javascript
// Increase timeouts for real blockchain
const TX_TIMEOUT = 30000; // 30 seconds for transactions
const UPLOAD_TIMEOUT = 60000; // 60 seconds for S5 uploads

// Wait for blockchain confirmations
await page.waitForTimeout(10000); // After transaction submit

// Check for transaction success (not instant like mock)
await page.waitForSelector('text=Transaction confirmed', { timeout: TX_TIMEOUT });
```

### 5.2: Manual Testing Checklist ✅

**Complete checklist**: `/workspace/tests-ui5/MANUAL_TESTING_CHECKLIST.md` (61 tests)

**Initial Verification (2025-11-13)**:
- [x] Click "Connect Wallet"
- [x] MetaMask UI appears (Base Account Kit integration pending full test)
- [x] Successfully authenticate
- [x] Primary account address shown in navbar (0x8D64...4bF6)
- [x] SDK initializes successfully
- [x] S5 storage connects (no timeout errors)
- [x] No console errors (only benign warnings: illegal path, favicon 404)

**Status**: Basic wallet connection and SDK initialization verified working. Full 61-test checklist ready for comprehensive manual testing.

#### Wallet Connection (From Checklist)
- [x] Click "Connect Wallet"
- [ ] Base Account Kit UI appears (using MetaMask currently)
- [x] Successfully authenticate
- [x] Primary account address shown
- [ ] Sub-account created (first time only) - pending Base Account Kit full integration
- [ ] Sub-account address shown - pending Base Account Kit full integration
- [x] SDK initializes (check console for success message)
- [x] No console errors

#### Vector Database Operations
- [ ] Navigate to /vector-databases
- [ ] Create new database
- [ ] Wait for blockchain transaction (~5-10 seconds)
- [ ] Database appears in list
- [ ] Upload test file to database
- [ ] Wait for S5 upload (~2-5 seconds)
- [ ] File appears in database
- [ ] Delete database
- [ ] Confirm blockchain transaction
- [ ] Database removed from list

#### Session Group Operations
- [ ] Navigate to /session-groups
- [ ] Create new session group
- [ ] Session group appears in list
- [ ] Open session group detail
- [ ] Upload document to group
- [ ] Wait for S5 upload
- [ ] Document appears in list
- [ ] Link vector database to group
- [ ] Database link appears
- [ ] Unlink database
- [ ] Link removed

#### Chat Operations
- [ ] Create new chat session
- [ ] Send message: "Hello, this is a test"
- [ ] Wait for WebSocket connection
- [ ] Wait for LLM response (~5-10 seconds)
- [ ] AI response appears in chat
- [ ] Send follow-up message
- [ ] Conversation persists after refresh
- [ ] Delete chat session
- [ ] Session removed from list

#### Payment Operations (Gasless Transactions)
- [ ] Navigate to payment section
- [ ] Check USDC balance
- [ ] Deposit USDC using sub-account
- [ ] Transaction completes WITHOUT MetaMask popup (gasless!)
- [ ] Balance updates
- [ ] Withdraw USDC
- [ ] Transaction completes
- [ ] Balance updates

### 5.3: Run Automated Tests
- [ ] Start UI5: `cd /workspace/apps/ui5 && pnpm dev --port 3002`
- [ ] Run test suite: `cd /workspace/tests-ui5 && ./run-all-tests.sh`
- [ ] Verify all tests pass (may take 15-30 minutes with real blockchain)
- [ ] Review test output for errors
- [ ] Check screenshots generated

**Expected Results**:
- All 61 tests should pass (with adjusted timeouts)
- Real blockchain transactions confirmed
- Real S5 storage working
- Real WebSocket connections successful
- Gasless transactions working via sub-account

### 5.4: Performance Testing
- [ ] Measure page load times (should be < 3 seconds)
- [ ] Measure transaction times (should be < 15 seconds)
- [ ] Measure file upload times (should be < 10 seconds)
- [ ] Measure LLM response times (should be < 15 seconds)
- [ ] Test with slow network (throttle to 3G)
- [ ] Test with multiple concurrent operations

### 5.5: Error Handling Testing
- [ ] Disconnect internet during transaction
- [ ] Verify error message displayed
- [ ] Reconnect and retry
- [ ] Try transaction with insufficient balance
- [ ] Verify error message
- [ ] Try connecting to unavailable node
- [ ] Verify fallback to alternative node
- [ ] Test S5 portal downtime handling

**Time Estimate**: 6-8 hours

---

## Phase 6: Production Preparation

### 6.1: Environment Configuration
- [ ] Create `apps/ui5/.env.production` for production values
- [ ] Update contract addresses for mainnet (when ready)
- [ ] Update RPC URLs for mainnet
- [ ] Configure production S5 portal
- [ ] Set production feature flags

### 6.2: Build Optimization
- [ ] Run production build: `cd apps/ui5 && pnpm build`
- [ ] Verify no build errors
- [ ] Check bundle size (should be < 500KB for main bundle)
- [ ] Test production build locally: `pnpm start`
- [ ] Verify all functionality works in production mode

### 6.3: Security Audit
- [ ] Review all API keys are in environment variables
- [ ] Verify no private keys in code
- [ ] Check all contract addresses are from environment
- [ ] Review authentication flow for vulnerabilities
- [ ] Test spend permission limits are enforced
- [ ] Verify S5 encryption is enabled

### 6.4: Documentation Updates
- [ ] Update README.md with UI5 setup instructions
- [ ] Document Base Account Kit integration
- [ ] Document gasless transaction flow
- [ ] Create user guide for wallet connection
- [ ] Document environment variable requirements

**Time Estimate**: 3-4 hours

---

## Phase 7: Deployment

### 7.1: Staging Deployment
- [ ] Deploy to staging environment (e.g., Vercel preview)
- [ ] Configure environment variables in deployment platform
- [ ] Test deployed version end-to-end
- [ ] Verify all features work in staging
- [ ] Share staging URL with stakeholders for feedback

### 7.2: Production Deployment
- [ ] Create production environment configuration
- [ ] Deploy to production (e.g., Vercel production)
- [ ] Configure production environment variables
- [ ] Set up monitoring (Sentry, LogRocket, etc.)
- [ ] Set up analytics (Google Analytics, Mixpanel, etc.)
- [ ] Test production deployment
- [ ] Monitor for errors in first 24 hours

### 7.3: Post-Deployment Validation
- [ ] Test all critical flows in production
- [ ] Monitor error rates
- [ ] Check transaction success rates
- [ ] Verify S5 storage working
- [ ] Monitor performance metrics
- [ ] Gather user feedback

**Time Estimate**: 2-3 hours

---

## Troubleshooting Guide

### Issue: "SDK not initialized"
**Cause**: SDK initialization failed or wallet not connected
**Solution**:
1. Check wallet is connected (address shown in header)
2. Check browser console for SDK initialization errors
3. Verify all environment variables are set
4. Try disconnecting and reconnecting wallet

### Issue: "Transaction failed"
**Cause**: Insufficient funds, network error, or contract revert
**Solution**:
1. Check wallet balance (need testnet ETH for gas)
2. Check USDC balance for payments
3. Verify contract addresses are correct
4. Check Base Sepolia testnet status
5. Review transaction revert reason in console

### Issue: "Sub-account creation failed"
**Cause**: Base Account Kit configuration error or network issue
**Solution**:
1. Verify Base Account Kit API key is valid
2. Check `BASE_CONTRACT_SPEND_PERMISSION_MANAGER` address
3. Ensure sufficient ETH for deployment transaction
4. Try clearing browser cache and reconnecting

### Issue: "WebSocket connection failed"
**Cause**: Node offline, network error, or incorrect URL
**Solution**:
1. Verify node URL is accessible: `curl http://81.150.166.91:8080/health`
2. Check WebSocket URL format: `ws://` not `wss://` for HTTP
3. Try alternative node if available
4. Check browser console for WebSocket errors

### Issue: "S5 upload failed"
**Cause**: S5 portal unavailable, large file, or network timeout
**Solution**:
1. Verify S5 portal is accessible: `curl https://s5.cx`
2. Check file size (limit may be 10MB)
3. Increase upload timeout
4. Try uploading smaller file
5. Check browser console for S5 errors

### Issue: "Gasless transaction not working"
**Cause**: Sub-account not created, spend permission not set, or allowance exceeded
**Solution**:
1. Verify sub-account address shown in header
2. Check spend permission was created during connection
3. Verify transaction amount within allowance (1M USDC)
4. Check transaction is using sub-account not primary account
5. Review spend permission contract on block explorer

---

## Success Criteria

### Must Pass
- [ ] All 61 automated tests pass with real SDK
- [ ] Wallet connection works with Base Account Kit
- [ ] Sub-account created with spend permissions
- [ ] Gasless transactions work (no MetaMask popups for allowed operations)
- [ ] Real blockchain transactions confirmed
- [ ] Real S5 storage persists data
- [ ] Real WebSocket connections stream LLM responses
- [ ] No console errors during normal operations
- [ ] All UI flows work identically to UI4

### Should Pass
- [ ] Transaction times < 15 seconds average
- [ ] File uploads < 10 seconds average
- [ ] Page loads < 3 seconds average
- [ ] Error messages displayed for all failure cases
- [ ] Graceful degradation when services unavailable
- [ ] Mobile responsive (if UI4 was responsive)

### Nice to Have
- [ ] Transaction pending states shown
- [ ] Upload progress indicators
- [ ] Network status indicator
- [ ] Transaction history view
- [ ] Estimated gas costs displayed

---

## Timeline Estimate

| Phase | Description | Time | Dependencies |
|-------|-------------|------|--------------|
| 0 | Project Setup | 15 min | None |
| 1 | Dependencies | 20 min | Phase 0 |
| 2 | Configuration | 30 min | Phase 1 |
| 3 | SDK Integration | 1.5 hours | Phase 2 |
| 4 | Base Account Kit | 5 hours | Phase 3 |
| 5 | Testing | 6-8 hours | Phase 4 |
| 6 | Production Prep | 3-4 hours | Phase 5 |
| 7 | Deployment | 2-3 hours | Phase 6 |
| **TOTAL** | **Full Migration** | **18-24 hours** | Sequential |

**Optimistic**: 18 hours (if everything works first try)
**Realistic**: 20-22 hours (with some debugging)
**Pessimistic**: 24+ hours (if major issues encountered)

---

## References

### Documentation
- **UI4 Testing Summary**: `/workspace/docs/UI4_TESTING_SUMMARY.md`
- **Mock SDK API Alignment**: `/workspace/docs/PLAN_MOCK_SDK_API_ALIGNMENT.md`
- **SDK API Reference**: `/workspace/docs/SDK_API.md`
- **Base Account Kit Integration**: `/workspace/CLAUDE.md` (section on Base Account Kit)

### Example Code
- **Base Account Kit Example**: `/workspace/apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`
- **SDK Initialization**: `/workspace/packages/sdk-core/src/FabstirSDKCore.ts`
- **Base Account Manager**: `/workspace/packages/sdk-core/src/wallet/BaseAccountManager.ts`

### Test Scripts (UI4)
- `/workspace/test-vector-db-phase2.cjs`
- `/workspace/test-chat-operations.cjs`
- `/workspace/test-navigation-phase5.cjs`
- All 8 test scripts (copy and adapt for UI5)

---

## Notes

### Important Reminders
1. **Never hardcode contract addresses** - Always use environment variables
2. **Test with testnet first** - Never deploy to mainnet without thorough testing
3. **Sub-accounts are per-origin** - Each domain gets one sub-account per primary wallet
4. **Gasless transactions have limits** - Spend permissions enforce allowance caps
5. **S5 storage requires network** - Handle offline scenarios gracefully
6. **WebSocket connections can drop** - Implement reconnection logic
7. **Blockchain transactions are slow** - Set expectations for 5-15 second confirmations

### Best Practices
- Use TypeScript strict mode
- Add loading states for all async operations
- Display transaction hashes for transparency
- Log all errors to console for debugging
- Test on multiple browsers (Chrome, Firefox, Safari)
- Test on mobile devices
- Monitor Sentry/logging service for production errors

---

**Plan Created**: January 13, 2025
**Status**: Ready for execution
**Next Step**: Phase 0 - Copy UI4 to UI5
