# Base Account Kit Integration Guide

**Project**: fabstir-llm-sdk - UI5
**Feature**: Account Abstraction with Gasless Transactions
**SDK**: @base-org/account v1.0.0

---

## Overview

Base Account Kit enables:

- ✅ **Smart Wallet Accounts** - Contract-based wallets with advanced features
- ✅ **Gasless Transactions** - Users don't pay gas for certain operations
- ✅ **Sub-accounts** - One sub-account per origin with spend permissions
- ✅ **Auto Spend Permissions** - Pre-approved USDC spending without popups

---

## Architecture

### Account Hierarchy

```
Primary Smart Wallet (0xPRIMARY...)
└── Sub-account (0xSUB...)
    └── Spend Permission
        ├── Token: USDC (0xUSDC...)
        ├── Allowance: 1,000,000 USDC
        ├── Period: 365 days
        └── Recipient: JobMarketplace contract
```

### Flow Diagram

```
User Actions → UI5 → Sub-account → Spend Permission → Contract
                                         ↓
                                   No gas fees!
                                   No MetaMask popup!
```

---

## Configuration

### Environment Variables

```bash
# Base Account Kit Configuration
NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY=<your-coinbase-api-key>
NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID=<your-project-id>

# Base Protocol Contract (SpendPermissionManager)
# This is a BASE PROTOCOL CONTRACT, not a Fabstir contract!
NEXT_PUBLIC_BASE_CONTRACT_SPEND_PERMISSION_MANAGER=0x... # from .env.test

# Token for spend permissions (USDC)
NEXT_PUBLIC_CONTRACT_USDC_TOKEN=0x... # from .env.test
```

### Getting API Credentials

1. Go to [Coinbase Developer Portal](https://portal.cdp.coinbase.com/)
2. Create new project
3. Enable "Account Kit" API
4. Copy API Key and Project ID
5. Add to `.env.local`

---

## Implementation

### 1. Install Dependencies

```bash
cd /workspace/apps/ui5
pnpm add @base-org/account viem @wagmi/core
```

### 2. Initialize Base Account Kit

```typescript
import { createBaseAccountSDK } from "@base-org/account";
import { base } from "@base-org/account/chains";

const accountSDK = createBaseAccountSDK({
  apiKey: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_API_KEY!,
  projectId: process.env.NEXT_PUBLIC_BASE_ACCOUNT_KIT_PROJECT_ID!,
  chain: base.sepolia, // or base.mainnet
});
```

### 3. Connect Wallet

```typescript
// Trigger connection UI
await accountSDK.connect();

// Get primary smart wallet address
const primaryAddress = await accountSDK.getAddress();
console.log("Primary wallet:", primaryAddress);
```

### 4. Create Sub-account with Spend Permission

```typescript
// Check if sub-account exists (one per origin)
let subAccount = await accountSDK.getSubAccount();

if (!subAccount) {
  // Create new sub-account with USDC spend permission
  subAccount = await accountSDK.createSubAccount({
    spendPermission: {
      token: process.env.NEXT_PUBLIC_CONTRACT_USDC_TOKEN!,
      allowance: ethers.parseUnits("1000000", 6), // 1M USDC
      period: 365 * 24 * 60 * 60, // 1 year in seconds
    },
  });
}

console.log("Sub-account:", subAccount);
```

### 5. Get Signer for SDK

```typescript
// Get ethers-compatible signer
const provider = await accountSDK.getProvider();
const signer = await provider.getSigner();

// Pass to Fabstir SDK
await fabstirSDK.authenticate("privatekey", {
  signer,
  address: primaryAddress,
});
```

### 6. Make Gasless Transaction

```typescript
// Use sub-account for USDC operations
// SDK automatically uses sub-account when available

// Example: Deposit USDC (no gas fees, no popup!)
await paymentManager.depositUSDC(
  usdcAddress,
  "100.0", // 100 USDC
  chainId,
);

// Transaction completes silently using spend permission
// User sees: "Transaction confirmed" (no MetaMask popup)
```

---

## Sub-account Properties

### Creation

- **Triggered**: First time user connects from a specific origin
- **Cost**: Gas fees paid by primary account (one-time setup)
- **Time**: ~10-15 seconds (blockchain transaction)

### Spend Permission

- **Token**: USDC (ERC-20)
- **Allowance**: 1,000,000 USDC (configurable)
- **Period**: 365 days (configurable)
- **Recipient**: Any approved contract (JobMarketplace, PaymentEscrow, etc.)
- **Revocable**: User can revoke permission at any time

### Persistence

- **Origin-specific**: Each domain/app gets one sub-account per primary wallet
- **Reusable**: Same sub-account used for all sessions from that origin
- **Cross-session**: Spend permission persists across browser sessions

---

## Gasless Transaction Flow

### What Happens Behind the Scenes

1. **User initiates action**: "Deposit 100 USDC"
2. **UI5 calls SDK**: `paymentManager.depositUSDC(...)`
3. **SDK uses sub-account**: Instead of prompting user
4. **Spend permission enforced**: Checks allowance available
5. **Transaction executed**: Using pre-approved permission
6. **No gas fees**: Spend permission covers execution
7. **Transaction confirmed**: User sees success message

### User Experience

**Without Base Account Kit (Traditional)**:

```
User clicks "Deposit"
  → MetaMask popup appears
  → User confirms (pays gas)
  → Wait 10 seconds
  → Success
```

**With Base Account Kit (Gasless)**:

```
User clicks "Deposit"
  → Loading spinner (2 seconds)
  → Success!
  (No popup, no gas fees)
```

---

## Supported Operations

### Gasless (via Spend Permission)

- ✅ USDC deposits to JobMarketplace
- ✅ USDC payments for LLM sessions
- ✅ USDC withdrawals (within allowance)
- ✅ Contract interactions using USDC

### Requires Gas (via Primary Account)

- ❌ ETH deposits/withdrawals
- ❌ FAB token operations
- ❌ Contract deployments
- ❌ Non-USDC token transfers
- ❌ Sub-account creation (one-time)

---

## Security Considerations

### Spend Permission Limits

- **Allowance cap**: 1,000,000 USDC (configured during creation)
- **Time limit**: 365 days (expires automatically)
- **Per-origin isolation**: Each app gets separate sub-account

### User Controls

- Users can revoke spend permission at any time via Base Account Kit UI
- Users can monitor spending via transaction history
- Allowance tracked on-chain, enforced by SpendPermissionManager

### Best Practices

1. **Set reasonable allowance**: Don't exceed expected usage by 10x
2. **Use shortest period**: Match subscription or usage period
3. **Monitor spending**: Show users current allowance remaining
4. **Handle revocation**: Gracefully handle permission revoked by user
5. **Audit permissions**: Regular security audits of spend permission logic

---

## Error Handling

### Common Errors

#### "Sub-account creation failed"

**Cause**: Insufficient ETH for deployment gas
**Solution**: Ensure primary account has ~0.001 ETH

#### "Spend permission denied"

**Cause**: Allowance exceeded or permission revoked
**Solution**: Check `getSpendPermission()` and prompt user to increase allowance

#### "Invalid recipient"

**Cause**: Trying to spend to unapproved contract
**Solution**: Ensure spend permission includes target contract address

#### "Permission expired"

**Cause**: 365 days elapsed since creation
**Solution**: Create new spend permission (requires user approval)

### Error Handling Pattern

```typescript
try {
  await paymentManager.depositUSDC(usdcAddress, amount, chainId);
} catch (error) {
  if (error.message.includes("spend permission")) {
    // Show UI to create/renew spend permission
    await recreateSpendPermission();
  } else if (error.message.includes("insufficient allowance")) {
    // Show UI to increase allowance
    await increaseAllowance();
  } else {
    // Generic error handling
    showErrorToast(error.message);
  }
}
```

---

## Testing

### Unit Tests

```typescript
import { getBaseWallet } from "@/lib/base-wallet";

describe("BaseWalletProvider", () => {
  let wallet: BaseWalletProvider;

  beforeEach(() => {
    wallet = getBaseWallet();
  });

  test("connects to Base Account Kit", async () => {
    const address = await wallet.connect();
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
  });

  test("creates sub-account with spend permission", async () => {
    await wallet.connect();
    const result = await wallet.ensureSubAccount({
      tokenAddress: usdcAddress,
      tokenDecimals: 6,
      maxAllowance: "1000000",
      periodDays: 365,
    });
    expect(result.address).toBeDefined();
  });

  test("returns same sub-account on subsequent calls", async () => {
    await wallet.connect();
    const result1 = await wallet.ensureSubAccount(config);
    const result2 = await wallet.ensureSubAccount(config);
    expect(result1.address).toBe(result2.address);
    expect(result2.isExisting).toBe(true);
  });
});
```

### Integration Tests

```typescript
describe("Gasless Transactions", () => {
  test("deposits USDC without MetaMask popup", async () => {
    // Connect wallet
    await page.click('button:text("Connect Wallet")');
    await page.waitForSelector("text=✓ SDK Ready");

    // Deposit USDC (should be gasless)
    const startTime = Date.now();
    await page.click('button:text("Deposit 100 USDC")');

    // Should NOT see MetaMask popup
    const hasPopup = (await page.locator(".metamask-popup").count()) > 0;
    expect(hasPopup).toBe(false);

    // Should complete quickly (no user interaction needed)
    await page.waitForSelector("text=Transaction confirmed", {
      timeout: 10000,
    });
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(10000); // < 10 seconds
  });
});
```

### Manual Testing Checklist

- [ ] First-time connection creates sub-account
- [ ] Subsequent connections reuse existing sub-account
- [ ] USDC deposit completes without popup
- [ ] Spend permission enforces allowance limit
- [ ] Exceeding allowance shows appropriate error
- [ ] Primary account shows ETH balance (for non-gasless operations)
- [ ] Sub-account shows in header UI
- [ ] Disconnect clears both accounts
- [ ] Reconnect restores both accounts

---

## Monitoring & Analytics

### Metrics to Track

1. **Sub-account Creation Rate**
   - How many users create sub-accounts?
   - Success rate of sub-account creation
   - Time to create sub-account

2. **Gasless Transaction Usage**
   - % of transactions using spend permission
   - Average allowance consumed per user
   - Time to confirmation for gasless txs

3. **Error Rates**
   - Spend permission errors
   - Allowance exceeded errors
   - Sub-account creation failures

4. **User Engagement**
   - Do gasless transactions increase usage?
   - User retention with vs without Account Kit
   - Time saved compared to MetaMask flow

### Logging

```typescript
// Log sub-account creation
console.log("[BaseWallet] Sub-account created:", {
  primary: primaryAddress,
  sub: subAccountAddress,
  allowance: "1000000 USDC",
  period: "365 days",
  timestamp: new Date().toISOString(),
});

// Log gasless transaction
console.log("[BaseWallet] Gasless transaction:", {
  type: "deposit",
  amount: "100 USDC",
  from: subAccountAddress,
  to: jobMarketplaceAddress,
  txHash: txHash,
  gasless: true,
});
```

---

## Troubleshooting

### Debug Mode

Enable debug logging:

```typescript
// In lib/base-wallet.ts
const DEBUG = process.env.NEXT_PUBLIC_DEBUG_MODE === "true";

if (DEBUG) {
  console.log("[BaseWallet] Debug info:", {
    primaryAccount: this.primaryAccount,
    subAccount: this.subAccount,
    connected: this.isConnected(),
    // ... other debug info
  });
}
```

### Check Spend Permission Status

```typescript
// Get current spend permission details
const permission = await accountSDK.getSpendPermission();
console.log("Spend Permission:", {
  token: permission.token,
  allowance: ethers.formatUnits(permission.allowance, 6),
  used: ethers.formatUnits(permission.used, 6),
  remaining: ethers.formatUnits(permission.allowance - permission.used, 6),
  expires: new Date(permission.expiresAt * 1000).toISOString(),
});
```

### Verify Contract Addresses

```typescript
// Ensure using correct SpendPermissionManager
const spendPermissionManager =
  process.env.NEXT_PUBLIC_BASE_CONTRACT_SPEND_PERMISSION_MANAGER;
console.log("SpendPermissionManager:", spendPermissionManager);

// This should be Base protocol address (0x...), NOT Fabstir contract
// Verify on Base Sepolia explorer: https://sepolia.basescan.org/address/<address>
```

---

## Resources

### Documentation

- **Base Account Kit Docs**: https://docs.base.org/account-kit
- **Coinbase Developer Portal**: https://portal.cdp.coinbase.com/
- **Base Sepolia Explorer**: https://sepolia.basescan.org/

### Example Code

- **Fabstir Harness Example**: `/workspace/apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`
- **SDK Integration**: `/workspace/packages/sdk-core/src/wallet/BaseAccountManager.ts`

### Support

- **Base Discord**: https://discord.gg/buildonbase
- **Coinbase Support**: https://help.coinbase.com/

---

**Last Updated**: January 13, 2025
**Status**: Ready for UI5 integration
**Next**: Implement in Phase 4 of UI5 Migration Plan
