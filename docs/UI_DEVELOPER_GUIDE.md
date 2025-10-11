# UI Developer Integration Guide - Dual Pricing SDK

**Version:** 1.3.0
**Date:** January 2025
**Status:** Pre-MVP - First Production UI

This guide helps you build the production UI using the Fabstir SDK with dual pricing support. The SDK now supports both native token (ETH/BNB) and stablecoin (USDC) payments with host-controlled pricing.

## Table of Contents

1. [Quick Start](#quick-start)
2. [SDK Installation](#sdk-installation)
3. [Dual Pricing System](#dual-pricing-system)
4. [Wallet Integration Patterns](#wallet-integration-patterns)
5. [Host Discovery & Selection](#host-discovery--selection)
6. [Session Creation & Payments](#session-creation--payments)
7. [Complete Code Examples](#complete-code-examples)
8. [Troubleshooting](#troubleshooting)

---

## Quick Start

### What's New in Dual Pricing SDK

- **Host-Controlled Pricing**: Hosts set their own prices separately for native tokens and stablecoins
- **Two Price Fields**:
  - `minPricePerTokenNative` - ETH/BNB pricing (in wei)
  - `minPricePerTokenStable` - USDC pricing (in smallest units, 6 decimals)
- **Multi-Chain Support**: Base Sepolia (ETH+USDC) and opBNB Testnet (BNB+USDC)
- **Base Account Kit**: Popup-free transactions with smart wallets

### Reference Test Pages

Your production UI should be based on these working examples:

1. **Base Account Kit (Smart Wallet)** - `apps/harness/pages/chat-context-popupfree-demo.tsx`
   - Popup-free transactions with Auto Spend Permissions
   - Best user experience for new users
   - Gasless transactions on Base Sepolia

2. **Regular Wallet (USDC)** - `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx`
   - MetaMask and other wallet extensions
   - Direct USDC payments with approval pattern

3. **Regular Wallet (ETH)** - `apps/harness/pages/eth-mvp-flow-sdk.test.tsx`
   - Native token payments (ETH on Base Sepolia)
   - No token approval needed (value sent directly)

---

## SDK Installation

### Install from Tarball

```bash
npm install ./fabstir-sdk-core-1.3.0.tgz
```

### TypeScript Imports

```typescript
import {
  FabstirSDKCore,
  ChainRegistry,
  ChainId,
  type IPaymentManager,
  type ISessionManager,
  type IHostManager,
  type IStorageManager
} from '@fabstir/sdk-core';
```

---

## Dual Pricing System

### Understanding Host Pricing

Each host now has **two separate pricing fields**:

```typescript
interface HostInfo {
  address: string;
  apiUrl: string;
  supportedModels: string[];
  minPricePerTokenNative: bigint;  // ETH/BNB pricing in wei
  minPricePerTokenStable: bigint;  // USDC pricing in smallest units (6 decimals)
  isActive: boolean;
}
```

### When to Use Which Pricing

**Use `minPricePerTokenStable` when:**
- User pays with USDC stablecoin
- More predictable costs
- No gas price volatility

**Use `minPricePerTokenNative` when:**
- User pays with ETH or BNB
- Simpler approval flow (no ERC20 approval needed)

### Displaying Prices to Users

```typescript
// For USDC payments (6 decimals)
const usdcPrice = Number(host.minPricePerTokenStable) / 1_000_000;
console.log(`${usdcPrice.toFixed(6)} USDC per token`);
// Example: "0.000316 USDC per token"

// For ETH payments (18 decimals)
const ethPrice = Number(host.minPricePerTokenNative) / 1e18;
console.log(`${ethPrice.toFixed(8)} ETH per token`);
// Example: "0.00000050 ETH per token"
```

### Price Filtering & Sorting

```typescript
// Filter hosts by max USDC price
const maxPriceUSDC = 500n; // 0.0005 USDC per token
const affordableHosts = hosts.filter(h =>
  h.minPricePerTokenStable <= maxPriceUSDC
);

// Sort by lowest USDC price first
const sortedHosts = [...affordableHosts].sort((a, b) =>
  Number(a.minPricePerTokenStable - b.minPricePerTokenStable)
);

// Sort by lowest ETH price first
const sortedByETH = [...hosts].sort((a, b) =>
  Number(a.minPricePerTokenNative - b.minPricePerTokenNative)
);
```

---

## Wallet Integration Patterns

### Pattern 1: Base Account Kit (Recommended for New Users)

**Benefits:**
- Popup-free transactions after initial setup
- Gasless on Base Sepolia (Coinbase sponsors gas)
- Better UX for non-crypto users

**Key Code:**

```typescript
import { createSDK, connectWallet as connectBaseWallet } from '../lib/base-account';

// 1. Connect (ONE popup for passkey/login)
const bas = createSDK();
const accounts = await connectBaseWallet();
const primaryAccount = accounts[0]; // Smart wallet address

// 2. Create sub-account with Auto Spend Permissions
const sub = await ensureSubAccount(bas.getProvider(), primaryAccount);

// 3. Create custom signer for popup-free transactions
const baseSigner = createSubAccountSigner(
  bas.getProvider(),
  sub,
  primaryAccount
);

// 4. Authenticate SDK
await sdk.authenticate('signer', { signer: baseSigner });

// 5. Get managers
const pm = sdk.getPaymentManager();
const sm = sdk.getSessionManager();
```

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 509-587

### Pattern 2: Regular Wallet (MetaMask, etc.)

**Benefits:**
- Works with existing wallet extensions
- Users already familiar with the UX

**Key Code:**

```typescript
// 1. Connect via window.ethereum
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const userAddress = await signer.getAddress();

// 2. Authenticate SDK
await sdk.authenticate('signer', { signer });

// 3. Get managers
const pm = sdk.getPaymentManager();
const sm = sdk.getSessionManager();
```

**Full implementation:** See `usdc-mvp-flow-sdk.test.tsx` lines 590-625

---

## Host Discovery & Selection

### Discover Active Hosts

```typescript
const hm = sdk.getHostManager();

// Get all active hosts with models and pricing
const hosts = await hm.discoverAllActiveHostsWithModels();

console.log('Discovered hosts:', hosts.map(h => ({
  address: h.address,
  usdcPrice: Number(h.minPricePerTokenStable) / 1_000_000,
  ethPrice: Number(h.minPricePerTokenNative) / 1e18,
  models: h.supportedModels
})));
```

### Filter & Sort Hosts

```typescript
// Filter by price and model support
let filteredHosts = hosts.filter(h =>
  h.supportedModels && h.supportedModels.length > 0
);

// Filter by max USDC price (optional)
if (maxPriceFilter) {
  const maxPrice = BigInt(maxPriceFilter);
  filteredHosts = filteredHosts.filter(h =>
    h.minPricePerTokenStable <= maxPrice
  );
}

// Sort by price (lowest first) or random
if (sortBy === 'price') {
  filteredHosts.sort((a, b) =>
    Number(a.minPricePerTokenStable - b.minPricePerTokenStable)
  );
} else if (sortBy === 'random') {
  filteredHosts.sort(() => Math.random() - 0.5);
}
```

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 984-1042

### Display Hosts in UI

```tsx
{availableHosts.map((host, index) => (
  <div key={host.address} className="host-card">
    <div>
      #{index + 1}: {host.address.slice(0, 10)}...{host.address.slice(-8)}
    </div>
    <div>
      💵 {(Number(host.minPricePerTokenStable)/1000000).toFixed(6)} USDC/token
    </div>
    <div>
      📦 {host.supportedModels?.length || 0} models
    </div>
    <button onClick={() => selectHost(host)}>
      Select & Start
    </button>
  </div>
))}
```

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 817-839

---

## Session Creation & Payments

### Step 1: Approve USDC (For Stablecoin Payments)

**IMPORTANT:** Use PaymentManager's `approveToken()` method, NOT direct contract calls!

```typescript
const pm = sdk.getPaymentManager();
const contracts = getContractAddresses();

// Check current allowance
const currentAllowance = await pm.checkAllowance(
  userAddress,
  contracts.JOB_MARKETPLACE,
  contracts.USDC
);

// Approve if needed (5x session cost for multiple sessions)
const sessionCost = ethers.parseUnits('2', 6); // 2 USDC
if (currentAllowance < sessionCost) {
  const approveAmount = sessionCost * 5n; // Approve 10 USDC total

  const approveResult = await pm.approveToken(
    contracts.JOB_MARKETPLACE,
    approveAmount,
    contracts.USDC
  );

  console.log('Approved:', approveResult.hash);
}
```

**Why PaymentManager?** It properly handles Base Account Kit's `wallet_sendCalls` and regular wallet approvals.

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 1180-1213

### Step 2: Create Session with Pricing

```typescript
const sm = sdk.getSessionManager();

// Use the ACTUAL host pricing from blockchain
const pricePerToken = Number(host.minPricePerTokenStable); // For USDC
// OR
const pricePerToken = Number(host.minPricePerTokenNative); // For ETH

const sessionConfig = {
  depositAmount: '2',           // 2 USDC or ETH
  pricePerToken: pricePerToken, // Use host's actual price
  proofInterval: 1000,          // Checkpoint every 1000 tokens
  duration: 86400,              // 1 day
  paymentToken: contracts.USDC, // For USDC payments
  useDeposit: false,            // Use direct payment
  chainId: selectedChainId,     // REQUIRED
  model: host.supportedModels[0],
  provider: host.address,
  hostAddress: host.address,
  endpoint: host.apiUrl
};

// Create session
const result = await sm.startSession(sessionConfig);

console.log('Session ID:', result.sessionId);
console.log('Job ID:', result.jobId);
```

**For ETH payments:** Omit `paymentToken` field - SDK uses native token automatically.

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 1215-1274

### Step 3: Send Messages

```typescript
const sm = sdk.getSessionManager();

// Send prompt and get streaming response
const response = await sm.sendPromptStreaming(
  sessionId,
  "What is the capital of France?"
);

console.log('Response:', response);
```

**With Context:** See `chat-context-popupfree-demo.tsx` lines 129-195 for context building

### Step 4: End Session

```typescript
const sm = sdk.getSessionManager();

// End session (closes WebSocket)
await sm.endSession(sessionId);

// Node automatically calls completeSessionJob to distribute payments:
// - 90% to host (via HostEarnings contract)
// - 10% to treasury
// - Unused deposit refunded to user
```

**Full implementation:** See `chat-context-popupfree-demo.tsx` lines 336-519

---

## Complete Code Examples

### Example 1: Base Account Kit Flow (Popup-Free)

```typescript
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';
import { createSDK, connectWallet } from './base-account';

async function initBaseAccountKit() {
  // 1. Initialize SDK
  const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
  const sdk = new FabstirSDKCore({
    mode: 'production',
    chainId: ChainId.BASE_SEPOLIA,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
    contractAddresses: {
      jobMarketplace: chain.contracts.jobMarketplace,
      nodeRegistry: chain.contracts.nodeRegistry,
      proofSystem: chain.contracts.proofSystem,
      hostEarnings: chain.contracts.hostEarnings,
      fabToken: chain.contracts.fabToken,
      usdcToken: chain.contracts.usdcToken,
      modelRegistry: chain.contracts.modelRegistry
    }
  });

  // 2. Connect Base Account Kit (ONE popup)
  const bas = createSDK();
  const accounts = await connectWallet();
  const primaryAccount = accounts[0];

  // 3. Create sub-account with Auto Spend Permissions
  const subAccount = await ensureSubAccount(bas.getProvider(), primaryAccount);

  // 4. Create popup-free signer
  const signer = createSubAccountSigner(bas.getProvider(), subAccount, primaryAccount);

  // 5. Authenticate SDK
  await sdk.authenticate('signer', { signer });

  // 6. Get managers
  const pm = sdk.getPaymentManager();
  const sm = sdk.getSessionManager();
  const hm = sdk.getHostManager();

  return { sdk, pm, sm, hm, primaryAccount, subAccount };
}

// Helper: Sub-account with Auto Spend Permissions
async function ensureSubAccount(provider: any, primaryAccount: string) {
  // Check for existing sub-account
  const resp = await provider.request({
    method: 'wallet_getSubAccounts',
    params: [{ account: primaryAccount, domain: window.location.origin }]
  });

  if (resp?.subAccounts?.length) {
    return resp.subAccounts[0].address;
  }

  // Create new sub-account with spend permissions
  const created = await provider.request({
    method: 'wallet_addSubAccount',
    params: [{
      account: { type: 'create' },
      spender: {
        address: process.env.SPEND_PERMISSION_MANAGER!,
        token: process.env.USDC_TOKEN!,
        allowance: ethers.parseUnits('1000000', 6).toString(),
        period: 86400 * 365,
        start: Math.floor(Date.now() / 1000),
        end: Math.floor(Date.now() / 1000) + (86400 * 365)
      }
    }]
  });

  return created.address;
}

// Helper: Popup-free signer
function createSubAccountSigner(provider: any, subAccount: string, primaryAccount: string) {
  const ethersProvider = new ethers.BrowserProvider(provider);

  return {
    provider: ethersProvider,

    async getAddress() {
      return subAccount;
    },

    async sendTransaction(tx: ethers.TransactionRequest) {
      // Use wallet_sendCalls for popup-free transactions
      const response = await provider.request({
        method: 'wallet_sendCalls',
        params: [{
          version: '2.0.0',
          chainId: '0x14a34', // Base Sepolia
          from: subAccount,
          calls: [{
            to: tx.to,
            data: tx.data,
            value: tx.value ? `0x${BigInt(tx.value).toString(16)}` : undefined
          }],
          capabilities: { atomic: { required: true } }
        }]
      });

      // Poll for transaction hash
      const bundleId = typeof response === 'string' ? response : response.id;
      for (let i = 0; i < 30; i++) {
        const res = await provider.request({
          method: 'wallet_getCallsStatus',
          params: [bundleId]
        });

        if (res.status === 'CONFIRMED' && res.receipts?.[0]?.transactionHash) {
          const txHash = res.receipts[0].transactionHash;
          return await ethersProvider.getTransaction(txHash);
        }

        await new Promise(r => setTimeout(r, 1000));
      }

      throw new Error('Transaction failed to confirm');
    },

    async signMessage(message: string | Uint8Array) {
      return await provider.request({
        method: 'personal_sign',
        params: [
          typeof message === 'string' ? message : ethers.hexlify(message),
          primaryAccount
        ]
      });
    }
  };
}
```

**Full reference:** `chat-context-popupfree-demo.tsx`

### Example 2: Regular Wallet Flow (USDC)

```typescript
async function initRegularWallet() {
  // 1. Initialize SDK
  const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
  const sdk = new FabstirSDKCore({
    mode: 'production',
    chainId: ChainId.BASE_SEPOLIA,
    rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA!,
    contractAddresses: {
      jobMarketplace: chain.contracts.jobMarketplace,
      nodeRegistry: chain.contracts.nodeRegistry,
      proofSystem: chain.contracts.proofSystem,
      hostEarnings: chain.contracts.hostEarnings,
      fabToken: chain.contracts.fabToken,
      usdcToken: chain.contracts.usdcToken,
      modelRegistry: chain.contracts.modelRegistry
    }
  });

  // 2. Connect MetaMask
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const userAddress = await signer.getAddress();

  // 3. Authenticate SDK
  await sdk.authenticate('signer', { signer });

  // 4. Get managers
  const pm = sdk.getPaymentManager();
  const sm = sdk.getSessionManager();
  const hm = sdk.getHostManager();

  return { sdk, pm, sm, hm, userAddress };
}

// Approve USDC
async function approveUSDC(pm: IPaymentManager, userAddress: string, contracts: any) {
  const currentAllowance = await pm.checkAllowance(
    userAddress,
    contracts.JOB_MARKETPLACE,
    contracts.USDC
  );

  const sessionCost = ethers.parseUnits('2', 6);
  if (currentAllowance < sessionCost) {
    const approveResult = await pm.approveToken(
      contracts.JOB_MARKETPLACE,
      sessionCost * 5n,
      contracts.USDC
    );
    console.log('Approved:', approveResult.hash);
  }
}

// Create session with USDC
async function createUSDCSession(sm: ISessionManager, host: any, contracts: any) {
  const sessionConfig = {
    depositAmount: '2',
    pricePerToken: Number(host.minPricePerTokenStable),
    proofInterval: 1000,
    duration: 86400,
    paymentToken: contracts.USDC,
    useDeposit: false,
    chainId: ChainId.BASE_SEPOLIA,
    model: host.supportedModels[0],
    provider: host.address,
    hostAddress: host.address,
    endpoint: host.apiUrl
  };

  const result = await sm.startSession(sessionConfig);
  return result;
}
```

**Full reference:** `usdc-mvp-flow-sdk.test.tsx`

### Example 3: Regular Wallet Flow (ETH)

```typescript
// Create session with ETH (no approval needed)
async function createETHSession(sm: ISessionManager, host: any) {
  const sessionConfig = {
    depositAmount: '0.01',  // 0.01 ETH
    pricePerToken: Number(host.minPricePerTokenNative),
    proofInterval: 1000,
    duration: 86400,
    // No paymentToken field - uses native ETH
    useDeposit: false,
    chainId: ChainId.BASE_SEPOLIA,
    model: host.supportedModels[0],
    provider: host.address,
    hostAddress: host.address,
    endpoint: host.apiUrl
  };

  const result = await sm.startSession(sessionConfig);
  return result;
}
```

**Full reference:** `eth-mvp-flow-sdk.test.tsx`

---

## Troubleshooting

### Common Issues

#### 1. "NaN USDC/token" displayed

**Cause:** Using old `minPricePerToken` field instead of dual pricing fields.

**Fix:**
```typescript
// ❌ WRONG - Old single pricing
const price = host.minPricePerToken;

// ✅ CORRECT - Use dual pricing with fallback
const priceUSDC = host.minPricePerTokenStable || host.minPricePerToken || 316;
const priceETH = host.minPricePerTokenNative || 0n;
```

#### 2. "no matching signer found for account" error

**Cause:** Using direct `ethers.Contract.approve()` instead of PaymentManager.

**Fix:**
```typescript
// ❌ WRONG - Direct contract call
const usdcContract = new ethers.Contract(USDC, [...], signer);
await usdcContract.approve(JOB_MARKETPLACE, amount);

// ✅ CORRECT - Use PaymentManager
const pm = sdk.getPaymentManager();
await pm.approveToken(JOB_MARKETPLACE, amount, USDC);
```

#### 3. "ERC20: transfer amount exceeds allowance"

**Cause:** Missing USDC approval before session creation.

**Fix:**
```typescript
// Always approve BEFORE creating session
const pm = sdk.getPaymentManager();
await pm.approveToken(
  contracts.JOB_MARKETPLACE,
  ethers.parseUnits('10', 6), // Approve 10 USDC
  contracts.USDC
);

// Then create session
const result = await sm.startSession(sessionConfig);
```

#### 4. Session creation hangs or times out

**Cause:** Missing `chainId` in session config.

**Fix:**
```typescript
const sessionConfig = {
  // ... other config
  chainId: ChainId.BASE_SEPOLIA  // REQUIRED!
};
```

#### 5. Balances not updating after session end

**Cause:** Need to wait for blockchain confirmations.

**Fix:**
```typescript
// End session
await sm.endSession(sessionId);

// Wait for settlement (5 seconds for blockchain confirmation)
await new Promise(r => setTimeout(r, 5000));

// Now read balances
const newBalance = await pm.getTokenBalance(userAddress, USDC);
```

### Getting Help

1. **Check Console Logs**: All SDK operations log to console with detailed info
2. **Review Test Pages**: Working examples in `apps/harness/pages/`
3. **Check Contract Explorer**: Verify transactions on Base Sepolia scanner
4. **Environment Variables**: Ensure all contract addresses are set correctly

---

## Environment Variables Required

```bash
# RPC URLs
NEXT_PUBLIC_RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# Contract Addresses (Base Sepolia - Corrected Dual Pricing, 2025-01-28)
NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE=0xe169A4B57700080725f9553E3Cc69885fea13629
NEXT_PUBLIC_CONTRACT_NODE_REGISTRY=0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6
NEXT_PUBLIC_CONTRACT_PROOF_SYSTEM=0x2ACcc60893872A499700908889B38C5420CBcFD1
NEXT_PUBLIC_CONTRACT_HOST_EARNINGS=0x908962e8c6CE72610021586f85ebDE09aAc97776
NEXT_PUBLIC_CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NEXT_PUBLIC_CONTRACT_MODEL_REGISTRY=0x92b2De840bB2171203011A6dBA928d855cA8183E

# Base Account Kit (optional - only if using smart wallets)
BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0xf85210B21cC50302F477BA56686d2019dC9b67Ad
```

---

## Summary Checklist

Before deploying your production UI, ensure:

- [ ] SDK installed from latest tarball (`fabstir-sdk-core-1.3.0.tgz`)
- [ ] All contract addresses configured for Base Sepolia
- [ ] Dual pricing displayed correctly (USDC and/or ETH)
- [ ] USDC approval uses `PaymentManager.approveToken()` (NOT direct contract calls)
- [ ] Session config includes `chainId` parameter
- [ ] Host discovery filters and sorts by actual pricing
- [ ] Base Account Kit flow uses custom sub-account signer
- [ ] Regular wallet flow uses `ethers.BrowserProvider`
- [ ] Error handling for insufficient balance, approval failures
- [ ] Balance updates after session end (with wait for confirmations)

---

## Support

For questions or issues:
1. Review the working test pages in `apps/harness/pages/`
2. Check SDK API docs in `docs/SDK_API.md`
3. Contact the SDK team with specific error messages and console logs
