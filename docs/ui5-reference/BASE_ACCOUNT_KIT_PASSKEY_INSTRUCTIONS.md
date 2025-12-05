# Base Account Kit Integration: Passkey Authentication & Session Keys

**For**: UI Developer implementing fabstir-platformless-ui
**Target**: Coinbase Base Account Kit with Passkeys
**Goal**: Seamless UX with zero transaction popups
**Date**: November 2025

---

## What We're Building

A wallet connection system that provides:
- **Passkey login** - Users authenticate with Face ID, Touch ID, or PIN (no seed phrases)
- **Zero popups** - Transactions execute silently via Sub-Accounts + Auto Spend Permissions
- **MetaMask fallback** - Power users can still use traditional wallet

### The Magic

```
Traditional Flow:          Base Account Kit Flow:
User clicks "Pay"          User clicks "Pay"
  → MetaMask popup           → Loading spinner (2 sec)
  → User confirms            → ✓ Success!
  → Pay gas fees             (no popup, no gas fees)
  → Wait 15 sec
  → ✓ Success
```

---

## Architecture Overview

### Account Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│  USER'S BASE ACCOUNT (Smart Wallet)                             │
│  Authenticated via: Passkey (Face ID / Touch ID / PIN)          │
│  Address: 0xPRIMARY...                                          │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  SUB-ACCOUNT (App-Scoped)                                 │  │
│  │  Created automatically for: platformless-ui.app           │  │
│  │  Address: 0xSUB...                                        │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  AUTO SPEND PERMISSION                              │  │  │
│  │  │  Token: USDC                                        │  │  │
│  │  │  Allowance: 1,000,000 USDC                          │  │  │
│  │  │  Period: 365 days                                   │  │  │
│  │  │  → Transactions execute WITHOUT user approval       │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Transaction Flow

```
1. User clicks "Deposit 100 USDC"
2. App calls SDK's paymentManager.depositUSDC()
3. SDK routes transaction through Sub-Account
4. Sub-Account uses Auto Spend Permission
5. Transaction executes (no popup, no gas)
6. User sees "✓ Transaction confirmed"
```

---

## Implementation Steps

### Step 1: Install Dependencies

```bash
npm install @base-org/account viem @wagmi/core
```

### Step 2: Get API Credentials

1. Go to [Coinbase Developer Portal](https://portal.cdp.coinbase.com/)
2. Create new project
3. Enable "Account Kit" API
4. Copy **API Key** and **Project ID**

### Step 3: Environment Variables

```bash
# .env.local
NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY=your_api_key_here
NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID=your_project_id_here

# Chain configuration
NEXT_PUBLIC_CHAIN_ID=8453            # Base Mainnet (or 84532 for Sepolia)

# Contract addresses (from .env.test in fabstir-llm-sdk)
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x...
NEXT_PUBLIC_BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0x...
```

### Step 4: Initialize Base Account SDK

Create `lib/base-account-sdk.ts`:

```typescript
import { createBaseAccountSDK } from '@base-org/account';
import { base, baseSepolia } from 'viem/chains';

const chain = process.env.NEXT_PUBLIC_CHAIN_ID === '8453' ? base : baseSepolia;

export const baseAccountSDK = createBaseAccountSDK({
  // App branding (shown in wallet UI)
  appName: 'Platformless AI',
  appLogoUrl: 'https://platformless-ui.app/logo.png',

  // Chain configuration
  appChainIds: [chain.id],

  // THE KEY CONFIGURATION for zero-popup UX
  subAccounts: {
    creation: 'on-connect',    // Auto-create sub-account when user connects
    defaultAccount: 'sub',      // Route all transactions through sub-account
  },
});

export const getBaseProvider = () => baseAccountSDK.getProvider();
```

### Step 5: Wallet Connection Component

Create `components/ConnectWallet.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { baseAccountSDK, getBaseProvider } from '@/lib/base-account-sdk';

type WalletType = 'base' | 'metamask' | null;

interface WalletState {
  connected: boolean;
  type: WalletType;
  universalAddress: string | null;
  subAccountAddress: string | null;
}

export function ConnectWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    connected: false,
    type: null,
    universalAddress: null,
    subAccountAddress: null,
  });
  const [loading, setLoading] = useState(false);

  // Connect with Base Account Kit (Passkey)
  const connectWithBase = async () => {
    setLoading(true);
    try {
      const provider = getBaseProvider();

      // This triggers passkey authentication
      // User will see Face ID / Touch ID / PIN prompt
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      });

      // accounts[0] = Universal (primary) address
      // accounts[1] = Sub-account address (auto-created)
      const [universalAddress, subAccountAddress] = accounts;

      setWallet({
        connected: true,
        type: 'base',
        universalAddress,
        subAccountAddress: subAccountAddress || null,
      });

      console.log('[Wallet] Connected via Base Account Kit:', {
        universal: universalAddress,
        subAccount: subAccountAddress,
      });

    } catch (error) {
      console.error('[Wallet] Base connection failed:', error);
      // Could fall back to MetaMask here
    } finally {
      setLoading(false);
    }
  };

  // Connect with MetaMask (fallback)
  const connectWithMetaMask = async () => {
    if (!window.ethereum) {
      alert('MetaMask not installed');
      return;
    }

    setLoading(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      setWallet({
        connected: true,
        type: 'metamask',
        universalAddress: accounts[0],
        subAccountAddress: null, // MetaMask doesn't have sub-accounts
      });

      console.log('[Wallet] Connected via MetaMask:', accounts[0]);

    } catch (error) {
      console.error('[Wallet] MetaMask connection failed:', error);
    } finally {
      setLoading(false);
    }
  };

  // Disconnect
  const disconnect = () => {
    setWallet({
      connected: false,
      type: null,
      universalAddress: null,
      subAccountAddress: null,
    });
  };

  if (wallet.connected) {
    return (
      <div className="flex items-center gap-4">
        <div className="text-sm">
          <span className="text-gray-500">
            {wallet.type === 'base' ? '🔐 Passkey' : '🦊 MetaMask'}
          </span>
          <span className="ml-2 font-mono">
            {wallet.universalAddress?.slice(0, 6)}...{wallet.universalAddress?.slice(-4)}
          </span>
          {wallet.subAccountAddress && (
            <span className="ml-2 text-green-500 text-xs">
              ⚡ Zero-popup enabled
            </span>
          )}
        </div>
        <button
          onClick={disconnect}
          className="px-3 py-1 text-sm border rounded hover:bg-gray-100"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={connectWithBase}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Connecting...' : '🔐 Connect with Passkey'}
      </button>
      <button
        onClick={connectWithMetaMask}
        disabled={loading}
        className="px-4 py-2 border rounded hover:bg-gray-100 disabled:opacity-50"
      >
        🦊 MetaMask
      </button>
    </div>
  );
}
```

### Step 6: Transaction Helper

Create `lib/transactions.ts`:

```typescript
import { getBaseProvider } from './base-account-sdk';
import { encodeFunctionData } from 'viem';

interface TransactionConfig {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
}

/**
 * Send a transaction using the sub-account (zero popup)
 * Falls back to primary account if no sub-account exists
 */
export async function sendTransaction(
  config: TransactionConfig,
  walletType: 'base' | 'metamask'
): Promise<string> {

  if (walletType === 'metamask') {
    // Traditional MetaMask flow (will show popup)
    return await window.ethereum!.request({
      method: 'eth_sendTransaction',
      params: [{
        to: config.to,
        data: config.data,
        value: config.value ? `0x${config.value.toString(16)}` : undefined,
      }],
    });
  }

  // Base Account Kit flow (zero popup via sub-account)
  const provider = getBaseProvider();

  // Get addresses (universal + sub-account)
  const accounts = await provider.request({
    method: 'eth_requestAccounts',
    params: [],
  });

  const [universalAddress, subAccountAddress] = accounts;

  // Use sub-account if available (enables zero-popup)
  const fromAddress = subAccountAddress || universalAddress;

  // Use wallet_sendCalls for batch support and better UX
  const callsId = await provider.request({
    method: 'wallet_sendCalls',
    params: [{
      version: '2.0',
      atomicRequired: true,
      from: fromAddress,
      calls: [{
        to: config.to,
        data: config.data || '0x',
        value: config.value ? `0x${config.value.toString(16)}` : '0x0',
      }],
    }],
  });

  console.log('[Transaction] Sent via sub-account:', {
    from: fromAddress,
    callsId,
    zeroPopup: !!subAccountAddress,
  });

  return callsId;
}

/**
 * Example: Deposit USDC to JobMarketplace
 */
export async function depositUSDC(
  amount: bigint,
  jobMarketplaceAddress: `0x${string}`,
  usdcAddress: `0x${string}`,
  walletType: 'base' | 'metamask'
): Promise<string> {
  // First approve USDC spending (if needed)
  // Note: With Auto Spend Permissions, this may not require approval

  const depositData = encodeFunctionData({
    abi: [
      {
        name: 'depositUSDC',
        type: 'function',
        inputs: [{ name: 'amount', type: 'uint256' }],
        outputs: [],
      },
    ],
    functionName: 'depositUSDC',
    args: [amount],
  });

  return await sendTransaction(
    {
      to: jobMarketplaceAddress,
      data: depositData,
    },
    walletType
  );
}
```

### Step 7: React Hook

Create `hooks/useWallet.ts`:

```typescript
'use client';

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { baseAccountSDK, getBaseProvider } from '@/lib/base-account-sdk';
import { sendTransaction } from '@/lib/transactions';

interface WalletContextValue {
  // Connection state
  connected: boolean;
  connecting: boolean;
  walletType: 'base' | 'metamask' | null;

  // Addresses
  universalAddress: string | null;
  subAccountAddress: string | null;

  // Actions
  connectWithBase: () => Promise<void>;
  connectWithMetaMask: () => Promise<void>;
  disconnect: () => void;

  // Transaction helper
  sendTx: (config: { to: string; data?: string; value?: bigint }) => Promise<string>;

  // Convenience
  hasZeroPopup: boolean; // True if sub-account exists
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletType, setWalletType] = useState<'base' | 'metamask' | null>(null);
  const [universalAddress, setUniversalAddress] = useState<string | null>(null);
  const [subAccountAddress, setSubAccountAddress] = useState<string | null>(null);

  const connectWithBase = useCallback(async () => {
    setConnecting(true);
    try {
      const provider = getBaseProvider();
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
        params: [],
      });

      setUniversalAddress(accounts[0]);
      setSubAccountAddress(accounts[1] || null);
      setWalletType('base');
      setConnected(true);
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectWithMetaMask = useCallback(async () => {
    if (!window.ethereum) throw new Error('MetaMask not installed');

    setConnecting(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      setUniversalAddress(accounts[0]);
      setSubAccountAddress(null);
      setWalletType('metamask');
      setConnected(true);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setConnected(false);
    setWalletType(null);
    setUniversalAddress(null);
    setSubAccountAddress(null);
  }, []);

  const sendTx = useCallback(async (config: { to: string; data?: string; value?: bigint }) => {
    if (!walletType) throw new Error('Wallet not connected');
    return sendTransaction(
      {
        to: config.to as `0x${string}`,
        data: config.data as `0x${string}` | undefined,
        value: config.value,
      },
      walletType
    );
  }, [walletType]);

  const value: WalletContextValue = {
    connected,
    connecting,
    walletType,
    universalAddress,
    subAccountAddress,
    connectWithBase,
    connectWithMetaMask,
    disconnect,
    sendTx,
    hasZeroPopup: !!subAccountAddress,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
```

---

## How Passkeys Work

### First Connection (New User)

1. User clicks "Connect with Passkey"
2. Base Account Kit shows passkey creation dialog
3. User creates passkey with Face ID / Touch ID / PIN
4. Smart wallet created on-chain (passkey is owner)
5. Sub-account auto-created for your app
6. User is ready to transact without popups!

### Subsequent Connections

1. User clicks "Connect with Passkey"
2. Base Account Kit recognizes existing passkey
3. User authenticates with Face ID / Touch ID / PIN
4. Existing sub-account retrieved
5. Ready to transact instantly

### Security Model

- **Passkey stored**: On user's device (backed up to iCloud/Google/1Password)
- **Coinbase access**: NEVER holds keys or has access to funds
- **Signature validation**: Happens on-chain via smart contract
- **Sub-account isolation**: Each app gets separate sub-account
- **User control**: Can manage all sub-accounts at [account.base.app](https://account.base.app)

---

## How Auto Spend Permissions Work

### What They Do

Auto Spend Permissions allow your app's sub-account to spend USDC directly from the user's primary wallet balance **without showing a popup for each transaction**.

### How They're Created

```
1. User connects wallet
2. Sub-account is auto-created
3. First transaction triggers spend permission request
4. User approves once (one-time popup)
5. All future transactions in allowance = zero popups
```

### Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Token | USDC | Which token sub-account can spend |
| Allowance | Configurable | Max amount spendable in period |
| Period | Configurable | Time window (e.g., 365 days) |
| Auto-approve | Enabled | Requests permission as needed |

### User Controls

Users can:
- View all spend permissions at [account.base.app](https://account.base.app)
- Revoke any permission at any time
- See spending history per app
- Set custom limits

---

## Error Handling

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| "User rejected" | User cancelled passkey auth | Show retry button |
| "Spend permission denied" | Allowance exceeded | Prompt user to increase |
| "No sub-account" | First-time edge case | Fallback to primary account |
| "Browser not supported" | Old browser without WebAuthn | Show MetaMask fallback |

### Error Handling Pattern

```typescript
try {
  await sendTransaction(config, walletType);
} catch (error: any) {
  if (error.message.includes('User rejected')) {
    // User cancelled - show message
    toast.info('Transaction cancelled');
  } else if (error.message.includes('spend permission')) {
    // Need to refresh permission
    toast.error('Please approve spending permission');
    await refreshSpendPermission();
  } else if (error.message.includes('insufficient')) {
    // Not enough funds
    toast.error('Insufficient balance');
  } else {
    // Generic error
    toast.error('Transaction failed: ' + error.message);
  }
}
```

---

## Testing Checklist

### First-Time User Flow
- [ ] "Connect with Passkey" button visible
- [ ] Clicking shows Base Account Kit passkey creation
- [ ] Creating passkey succeeds
- [ ] Sub-account address displayed (different from primary)
- [ ] "Zero-popup enabled" indicator shown

### Returning User Flow
- [ ] "Connect with Passkey" button visible
- [ ] Clicking shows Face ID / Touch ID / PIN prompt
- [ ] Same addresses as before (primary + sub-account)
- [ ] Ready to transact immediately

### Transaction Flow (Base Account Kit)
- [ ] Click "Deposit USDC"
- [ ] First time: Spend permission popup appears
- [ ] Subsequent: No popup, transaction executes
- [ ] Transaction confirms within ~5 seconds
- [ ] Balance updates correctly

### MetaMask Fallback
- [ ] "MetaMask" button visible
- [ ] Clicking triggers MetaMask popup
- [ ] Address displayed (no sub-account)
- [ ] Transactions show MetaMask popup each time

### Edge Cases
- [ ] Disconnect and reconnect works
- [ ] Browser refresh maintains session (if using persistence)
- [ ] Switching wallets works correctly
- [ ] Network switching handled

---

## UI Recommendations

### Connect Button States

```
Not Connected:    [🔐 Connect with Passkey]  [🦊 MetaMask]

Connecting:       [Connecting...] (disabled, spinner)

Connected (Base): [🔐 0x1234...5678  ⚡ Zero-popup]  [Disconnect]

Connected (MM):   [🦊 0x1234...5678]  [Disconnect]
```

### Transaction Feedback

```
Base Account Kit:
- Show loading spinner (not "Confirm in wallet")
- Success in ~2-5 seconds
- No external wallet mentions

MetaMask:
- Show "Confirm in MetaMask"
- Wait for user action
- Success after confirmation
```

### First-Time Experience

Consider showing an explanation for new users:

```
┌─────────────────────────────────────────────┐
│  🔐 Passkey Login                           │
│                                             │
│  • Sign in with Face ID, Touch ID, or PIN   │
│  • No seed phrases to remember              │
│  • Transactions happen without popups       │
│                                             │
│  [Get Started]                              │
└─────────────────────────────────────────────┘
```

---

## Resources & References

### Official Base Documentation
- [Base Account Kit Sub-Accounts Guide](https://docs.base.org/base-account/improve-ux/sub-accounts) - Primary implementation reference
- [Using Spend Permissions with Sub Accounts](https://docs.base.org/identity/smart-wallet/guides/sub-accounts/incorporate-spend-permissions) - Spend permissions setup
- [Using Sub Accounts with Privy](https://docs.base.org/smart-wallet/guides/sub-accounts/sub-accounts-with-privy) - Alternative integration pattern
- [Create Subscription Payments with Spend Permissions](https://docs.base.org/tutorials/create-subscription-payments-with-spend-permissions/) - Advanced tutorial

### Coinbase Documentation
- [Smart Wallet Passkeys Help](https://help.coinbase.com/en/wallet/getting-started/smart-wallet-passkeys) - End-user passkey guide
- [Coinbase Smart Wallet GitHub](https://github.com/coinbase/smart-wallet) - ERC-4337 smart contract implementation
- [Base Account on Coinbase](https://www.coinbase.com/wallet/smart-wallet) - Product overview

### NPM Package
- [@base-org/account on npm](https://www.npmjs.com/package/@base-org/account) - SDK package

### Blog Posts & Deep Dives
- [From Session Keys to Sub Accounts: Through the Idea Maze](https://blog.base.dev/subaccounts) - Architecture rationale
- [Introducing the Base Account SDK](https://blog.base.dev/base-account-sdk) - SDK announcement
- [Simplifying Web3 Authentication: How Passkeys Work Onchain](https://hackmd.io/@thisisjoules/H1qQnRC_R) - Technical deep dive
- [Smart Wallets and Passkeys](https://www.corbado.com/blog/smart-wallets-passkeys) - Passkey architecture overview

### Third-Party Integrations
- [Coinbase Smart Wallet - Dynamic](https://www.dynamic.xyz/docs/wallets/advanced-wallets/coinbase-smart-wallet) - Dynamic integration
- [Account Permissions & Session Keys - thirdweb](https://portal.thirdweb.com/wallets/smart-wallet/permissions) - Alternative approach
- [Session Keys - Alchemy Account Kit](https://accountkit.alchemy.com/smart-contracts/session-keys) - Comparison reference

### Reference Implementation (fabstir-llm-sdk)
- `docs/ui5-reference/BASE_ACCOUNT_KIT_INTEGRATION.md` - Comprehensive technical guide with code examples
- `apps/ui5/lib/wallet-adapter.ts` - Wallet adapter pattern (MetaMask + Base Account Kit)
- `apps/ui5/lib/base-wallet.ts` - High-level wallet provider abstraction
- `apps/ui5/hooks/use-wallet.ts` - React hook implementation
- `packages/sdk-core/src/wallet/BaseAccountManager.ts` - SDK-level sub-account management

### User Management Portal
- [account.base.app](https://account.base.app) - Where users manage their sub-accounts and spend permissions

### Support Channels
- [Base Discord](https://discord.gg/buildonbase) - Developer community
- [Coinbase Developer Support](https://help.coinbase.com/) - Official support
- [Coinbase Developer Portal](https://portal.cdp.coinbase.com/) - API key management

---

## Summary

**Install**: `npm install @base-org/account viem @wagmi/core`

**Configure**:
```typescript
const sdk = createBaseAccountSDK({
  appName: 'Platformless AI',
  appChainIds: [base.id],
  subAccounts: {
    creation: 'on-connect',   // ← Auto-create sub-account
    defaultAccount: 'sub',     // ← Route txns through sub-account
  },
});
```

**Result**: Zero transaction popups for USDC operations!

---

**Questions?** Reach out to the backend team or check the fabstir-llm-sdk repo for reference implementations.
