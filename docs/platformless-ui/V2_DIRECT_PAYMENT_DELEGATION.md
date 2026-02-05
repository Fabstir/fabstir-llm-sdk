# V2 Direct Payment Delegation - UI Integration Guide

## Overview

V2 Direct Payment Delegation enables **popup-free AI chat sessions** after a one-time setup. This replaces the previous escrow-based approach with a simpler flow where USDC is pulled directly from the user's wallet.

### Consumer UX Summary

| Step | Action | Popups |
|------|--------|--------|
| 1 | Approve USDC ($1,000) | 1 (one-time) |
| 2 | Authorize Sub-Account | 1 (one-time) |
| 3+ | Start Session | **0** |

After the 2 setup popups, users can start unlimited sessions without any wallet popups.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User's Wallet                           │
│  ┌─────────────────┐              ┌─────────────────┐          │
│  │ Primary Account │──────────────│   Sub-Account   │          │
│  │ (Smart Wallet)  │   authorizes │   (CryptoKey)   │          │
│  │                 │              │                 │          │
│  │ • Holds USDC    │              │ • Signs txns    │          │
│  │ • Approves ERC20│              │ • No popups     │          │
│  │ • Session owner │              │ • Delegate      │          │
│  └────────┬────────┘              └────────┬────────┘          │
└───────────┼────────────────────────────────┼────────────────────┘
            │                                │
            │ transferFrom()                 │ calls contract
            │ (pulls USDC)                   │ (popup-free)
            ▼                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    JobMarketplace Contract                       │
│                                                                  │
│  createSessionForModelAsDelegate(payer, modelId, host, ...)     │
│  • Verifies msg.sender (sub-account) is authorized delegate     │
│  • Pulls USDC from payer (primary) via transferFrom             │
│  • Creates session owned by payer                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### 1. Install SDK
```bash
pnpm add @fabstir/sdk-core
```

### 2. Install Base Account Kit
```bash
pnpm add @base-org/account
```

---

## Implementation

### Step 1: Initialize Base Account Kit

```typescript
import { createBaseAccountSDK } from '@base-org/account';

const baseAccountSDK = createBaseAccountSDK({
  appName: 'Your App Name',
  appChainIds: [84532], // Base Sepolia
  subAccounts: {
    funding: 'manual' // Required for CryptoKey signing
  }
});
```

### Step 2: Connect Wallet & Create Sub-Account

```typescript
// Connect wallet
const provider = baseAccountSDK.getProvider();
const accounts = await provider.request({
  method: 'eth_requestAccounts',
  params: []
});
const primaryAccount = accounts[0]; // Smart wallet address

// Create/register sub-account (MUST be called each browser session)
const subAccountResult = await provider.request({
  method: 'wallet_addSubAccount',
  params: [{ type: 'create' }]
});
const subAccount = subAccountResult.address;

console.log('Primary Account:', primaryAccount);
console.log('Sub-Account:', subAccount);
```

### Step 3: Create Sub-Account Signer

```typescript
import { createSubAccountSigner } from '@fabstir/sdk-core';

const subAccountSigner = createSubAccountSigner({
  provider: baseAccountSDK.getProvider(),
  subAccount: subAccount,
  primaryAccount: primaryAccount,
  chainId: 84532, // Base Sepolia
});
```

### Step 4: Initialize Fabstir SDK

```typescript
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';

const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);

const sdk = new FabstirSDKCore({
  mode: 'production',
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: 'YOUR_RPC_URL',
  contractAddresses: {
    jobMarketplace: chain.contracts.jobMarketplace,
    nodeRegistry: chain.contracts.nodeRegistry,
    usdcToken: chain.contracts.usdcToken,
    // ... other contracts
  }
});

// Authenticate with sub-account signer for popup-free transactions
await sdk.authenticate(subAccountSigner);
```

---

## One-Time Setup Flow

### Check & Approve USDC Allowance

```typescript
import { ethers } from 'ethers';
import { JobMarketplaceWrapper } from '@fabstir/sdk-core';

const USDC_ADDRESS = chain.contracts.usdcToken;
const JOB_MARKETPLACE = chain.contracts.jobMarketplace;
const APPROVAL_AMOUNT = ethers.parseUnits('1000', 6); // $1,000 USDC

// Check current allowance
async function checkAllowance(): Promise<bigint> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ['function allowance(address,address) view returns (uint256)'],
    provider
  );
  return await usdc.allowance(primaryAccount, JOB_MARKETPLACE);
}

// Approve USDC (shows popup - one time only)
async function approveUsdc(): Promise<void> {
  const ethersProvider = new ethers.BrowserProvider(baseAccountSDK.getProvider());
  const signer = await ethersProvider.getSigner(primaryAccount);

  const usdc = new ethers.Contract(
    USDC_ADDRESS,
    ['function approve(address,uint256) returns (bool)'],
    signer
  );

  const tx = await usdc.approve(JOB_MARKETPLACE, APPROVAL_AMOUNT);
  await tx.wait(3); // Wait for confirmation
}
```

### Check & Authorize Delegate

```typescript
// Check if sub-account is authorized
async function isDelegateAuthorized(): Promise<boolean> {
  const signer = await sdk.getSigner();
  const marketplace = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, signer);
  return await marketplace.isDelegateAuthorized(primaryAccount, subAccount);
}

// Authorize sub-account (shows popup - one time only)
async function authorizeDelegate(): Promise<void> {
  const ethersProvider = new ethers.BrowserProvider(baseAccountSDK.getProvider());
  const signer = await ethersProvider.getSigner(primaryAccount);
  const marketplace = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, signer);

  const tx = await marketplace.authorizeDelegate(subAccount, true);
  await tx.wait(3);
}
```

---

## Creating Sessions (Popup-Free)

### Pre-Flight Checks

```typescript
async function canStartSession(sessionCost: string): Promise<{
  ready: boolean;
  reason?: string;
}> {
  const costInUnits = ethers.parseUnits(sessionCost, 6);

  // Check 1: USDC allowance
  const allowance = await checkAllowance();
  if (allowance < costInUnits) {
    return { ready: false, reason: 'Insufficient USDC allowance. Click "Approve USDC".' };
  }

  // Check 2: Delegate authorized
  const authorized = await isDelegateAuthorized();
  if (!authorized) {
    return { ready: false, reason: 'Sub-account not authorized. Click "Authorize".' };
  }

  // Check 3: USDC balance
  const balance = await getUsdcBalance(primaryAccount);
  if (balance < costInUnits) {
    return { ready: false, reason: `Insufficient USDC balance. Need ${sessionCost} USDC.` };
  }

  return { ready: true };
}
```

### Create Session

```typescript
import { JobMarketplaceWrapper, DelegatedSessionParams } from '@fabstir/sdk-core';

async function startSession(host: {
  address: string;
  modelId: string;
}): Promise<number> {
  // Create marketplace wrapper with sub-account signer
  const marketplace = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, subAccountSigner);

  // V2 Direct Payment params
  const params: DelegatedSessionParams = {
    payer: primaryAccount,        // Primary wallet (USDC pulled from here)
    host: host.address,           // Host address
    paymentToken: USDC_ADDRESS,   // Must be ERC-20 (not ETH)
    amount: '0.5',                // Session deposit in USDC
    pricePerToken: 15000,         // Price per token (from host)
    duration: 86400,              // Max duration (1 day)
    proofInterval: 1000,          // Proof every 1000 tokens
    proofTimeoutWindow: 300,      // 5 minute timeout
    modelId: host.modelId,        // bytes32 model ID
  };

  // This call is POPUP-FREE because sub-account signs with CryptoKey
  const sessionId = await marketplace.createSessionForModelAsDelegate(params);

  console.log('Session created:', sessionId);
  return sessionId;
}
```

### Register Session with SDK

After creating the session, register it with SessionManager for chat functionality:

```typescript
const sessionManager = await sdk.getSessionManager();

await sessionManager.registerDelegatedSession({
  sessionId: BigInt(sessionId),
  jobId: BigInt(sessionId),
  hostUrl: host.endpoint,
  hostAddress: host.address,
  model: host.modelName,
  chainId: ChainId.BASE_SEPOLIA,
  depositAmount: '0.5',
  pricePerToken: 15000,
  proofInterval: 1000,
  duration: 86400,
});
```

---

## Complete UI Flow Example

```typescript
// ============================================
// COMPLETE EXAMPLE: V2 Direct Payment Flow
// ============================================

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { FabstirSDKCore, ChainRegistry, ChainId, JobMarketplaceWrapper, createSubAccountSigner } from '@fabstir/sdk-core';
import { createBaseAccountSDK } from '@base-org/account';

export function ChatApp() {
  // State
  const [sdk, setSdk] = useState(null);
  const [primaryAccount, setPrimaryAccount] = useState('');
  const [subAccount, setSubAccount] = useState('');
  const [subAccountSigner, setSubAccountSigner] = useState(null);
  const [usdcAllowance, setUsdcAllowance] = useState(0n);
  const [isDelegateAuthorized, setIsDelegateAuthorized] = useState(false);
  const [sessionId, setSessionId] = useState(null);

  const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
  const SESSION_COST = '0.5'; // USDC

  // Connect wallet
  async function connectWallet() {
    const baseSDK = createBaseAccountSDK({
      appName: 'My Chat App',
      appChainIds: [84532],
      subAccounts: { funding: 'manual' }
    });

    const provider = baseSDK.getProvider();
    const accounts = await provider.request({ method: 'eth_requestAccounts', params: [] });
    const primary = accounts[0];
    setPrimaryAccount(primary);

    // Register sub-account (required each session)
    const subResult = await provider.request({
      method: 'wallet_addSubAccount',
      params: [{ type: 'create' }]
    });
    const sub = subResult.address;
    setSubAccount(sub);

    // Create signer
    const signer = createSubAccountSigner({
      provider,
      subAccount: sub,
      primaryAccount: primary,
      chainId: 84532
    });
    setSubAccountSigner(signer);

    // Initialize SDK
    const fabstirSDK = new FabstirSDKCore({
      mode: 'production',
      chainId: ChainId.BASE_SEPOLIA,
      rpcUrl: process.env.NEXT_PUBLIC_RPC_URL,
      contractAddresses: chain.contracts
    });
    await fabstirSDK.authenticate(signer);
    setSdk(fabstirSDK);

    // Check setup status
    await checkSetupStatus(primary, sub, fabstirSDK);
  }

  // Check if setup is complete
  async function checkSetupStatus(primary, sub, fabstirSDK) {
    // Check allowance
    const allowance = await checkAllowance(primary);
    setUsdcAllowance(allowance);

    // Check delegation
    const signer = await fabstirSDK.getSigner();
    const marketplace = new JobMarketplaceWrapper(ChainId.BASE_SEPOLIA, signer);
    const authorized = await marketplace.isDelegateAuthorized(primary, sub);
    setIsDelegateAuthorized(authorized);
  }

  // Setup complete?
  const setupComplete = usdcAllowance >= ethers.parseUnits(SESSION_COST, 6) && isDelegateAuthorized;

  return (
    <div>
      {!primaryAccount ? (
        <button onClick={connectWallet}>Connect Wallet</button>
      ) : (
        <>
          {/* Setup Section */}
          <div>
            <h3>Setup (One-Time)</h3>

            {/* Step 1: Approve USDC */}
            <div>
              <span>Allowance: {ethers.formatUnits(usdcAllowance, 6)} USDC</span>
              {usdcAllowance < ethers.parseUnits(SESSION_COST, 6) ? (
                <button onClick={approveUsdc}>Approve USDC ($1,000)</button>
              ) : (
                <span>✅ Approved</span>
              )}
            </div>

            {/* Step 2: Authorize Delegate */}
            <div>
              {isDelegateAuthorized ? (
                <span>✅ Authorized</span>
              ) : (
                <button onClick={authorizeDelegate}>Authorize Sub-Account</button>
              )}
            </div>

            {setupComplete && <div>🎉 Setup complete! Sessions are popup-free.</div>}
          </div>

          {/* Session Section */}
          {setupComplete && (
            <div>
              <button onClick={startSession}>Start Session (No Popup)</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `NotDelegate()` | Sub-account not authorized | Call `authorizeDelegate()` |
| `ERC20Only()` | Tried to use ETH instead of USDC | Use USDC token address |
| `BadDelegateParams()` | Invalid parameters | Check payer, host, amount |
| `ERC20: insufficient allowance` | USDC not approved | Call `approveUsdc()` |
| `failed to add sub account owner` | CryptoKey session expired | Refresh page, reconnect wallet |

### CryptoKey Session Issues

If users see popups when they shouldn't:

```typescript
// The CryptoKey must be registered each browser session
// Always call wallet_addSubAccount after connecting

async function ensureSubAccountRegistered() {
  try {
    const result = await provider.request({
      method: 'wallet_addSubAccount',
      params: [{ type: 'create' }]
    });
    return result.address;
  } catch (error) {
    console.error('Failed to register sub-account:', error);
    // May need user to refresh and reconnect
    throw new Error('Please refresh the page and reconnect your wallet.');
  }
}
```

---

## Contract Details

| Property | Value |
|----------|-------|
| **Contract** | JobMarketplaceWithModelsUpgradeable |
| **Address** | `0x95132177F964FF053C1E874b53CF74d819618E06` |
| **Chain** | Base Sepolia (84532) |
| **USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

### Key Functions

```solidity
// Authorize a delegate (one-time)
function authorizeDelegate(address delegate, bool authorized) external

// Check authorization
function isDelegateAuthorized(address payer, address delegate) view returns (bool)

// Create session (called by delegate, pulls USDC from payer)
function createSessionForModelAsDelegate(
    address payer,
    bytes32 modelId,
    address host,
    address paymentToken,
    uint256 amount,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow
) external returns (uint256 sessionId)
```

---

## Testing Checklist

- [ ] Connect wallet, verify primary + sub-account addresses
- [ ] Click "Approve USDC" - verify popup appears, allowance updates
- [ ] Click "Authorize Sub-Account" - verify popup appears, status updates
- [ ] Click "Start Session" - **verify NO popup**
- [ ] Verify USDC balance decreases by session amount
- [ ] Send chat message, verify AI response
- [ ] End session, verify refund received (after dispute window)
- [ ] Start another session - **verify NO popup**

---

## Reference Implementation

See working implementation in test harness:
- `apps/harness/pages/chat-context-rag-demo.tsx`

SDK source files:
- `packages/sdk-core/src/contracts/JobMarketplace.ts`
- `packages/sdk-core/src/wallet/SubAccountSigner.ts`
