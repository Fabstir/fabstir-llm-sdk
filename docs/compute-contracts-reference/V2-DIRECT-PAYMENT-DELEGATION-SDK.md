# V2 Direct Payment Delegation - SDK Integration Guide

**Version:** 1.0
**Date:** February 2, 2026
**Status:** Production Ready
**Branch:** `fix/v2-direct-payment-delegation`

---

## Overview

V2 Direct Payment Delegation enables **Coinbase Smart Wallet sub-accounts** to create sessions by pulling USDC directly from the primary wallet via ERC-20 `transferFrom`. This is the **recommended approach** for Smart Wallet integration.

### V1 vs V2 Comparison

| Aspect | V1 (Escrow Pattern) | V2 (Direct Payment) |
|--------|---------------------|---------------------|
| **Setup Steps** | 3 (deposit + approve delegate + authorize) | 2 (approve USDC + authorize) |
| **Funds Location** | Held in contract escrow | Stay in user's wallet |
| **User Experience** | "Where did my money go?" | Standard Web2-like approval |
| **Refund Flow** | Contract → Wallet | Already in wallet (minus used) |
| **ETH Support** | Yes | No (USDC only) |
| **Recommended For** | General wallets, ETH users | Smart Wallets, USDC users |

### Why V2?

1. **Fewer popups** - 2 setup transactions vs 3
2. **Funds stay in wallet** - No confusing escrow deposits
3. **Standard pattern** - Users understand "approve $X to contract"
4. **Better UX** - Similar to Uniswap/OpenSea approval flows

---

## Contract Addresses (Base Sepolia)

```typescript
const CONTRACTS = {
  // Remediation proxy with V2 delegation
  jobMarketplace: "0x95132177F964FF053C1E874b53CF74d819618E06",

  // Supporting contracts (unchanged)
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",

  // Tokens
  usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  fab: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
};

// Implementation (for verification): 0xf5441bda610AbCDe71B96fe6051E738d2702f071
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install ethers@6
```

### 2. One-Time Setup (Primary Wallet)

```typescript
import { ethers, parseUnits } from "ethers";

const APPROVAL_AMOUNT = parseUnits("1000", 6); // $1,000 USDC

// Step 1: Approve USDC to contract (one popup)
await usdc.connect(primaryWallet).approve(
  CONTRACTS.jobMarketplace,
  APPROVAL_AMOUNT
);

// Step 2: Authorize sub-account (one popup)
await marketplace.connect(primaryWallet).authorizeDelegate(
  subAccount.address,
  true
);
```

### 3. Per-Session Creation (Sub-Account - NO Popup!)

```typescript
// Sub-account creates session using primary's USDC
const sessionId = await marketplace.connect(subAccount).createSessionForModelAsDelegate(
  primaryWallet.address,  // payer (whose USDC is used)
  modelId,                // model to use
  hostAddress,            // host
  CONTRACTS.usdc,         // USDC token address
  parseUnits("10", 6),    // 10 USDC
  5000n,                  // pricePerToken
  3600n,                  // 1 hour max
  1000n,                  // proof interval
  300n                    // proof timeout
);
```

---

## API Reference

### `authorizeDelegate(delegate, authorized)`

Authorize or revoke a delegate address.

```solidity
function authorizeDelegate(address delegate, bool authorized) external
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `delegate` | address | Sub-account to authorize |
| `authorized` | bool | `true` to grant, `false` to revoke |

**Constraints:**
- `delegate` cannot be `address(0)`
- `delegate` cannot be `msg.sender` (no self-delegation)

**Gas:** ~45,000 (grant) / ~23,000 (revoke)

---

### `isDelegateAuthorized(payer, delegate)`

Check if a delegate is authorized for a payer.

```solidity
function isDelegateAuthorized(address payer, address delegate) external view returns (bool)
```

**Gas:** ~2,600 (view)

---

### `createSessionForModelAsDelegate(...)`

Create a model-specific session as an authorized delegate. **USDC only.**

```solidity
function createSessionForModelAsDelegate(
    address payer,              // Whose USDC to use
    bytes32 modelId,            // Model ID (required, cannot be 0)
    address host,               // Host address
    address paymentToken,       // Must be ERC-20 (NOT address(0))
    uint256 amount,             // Amount to pull from payer
    uint256 pricePerToken,      // Agreed price (must meet host min)
    uint256 maxDuration,        // Max session duration (seconds)
    uint256 proofInterval,      // Min tokens between proofs (>=100)
    uint256 proofTimeoutWindow  // Proof timeout (60-3600 seconds)
) external returns (uint256 sessionId)
```

**Authorization Logic:**
```solidity
// Caller must be payer OR authorized delegate
if (msg.sender != payer && !isAuthorizedDelegate[payer][msg.sender]) {
    revert NotDelegate();
}
```

**Constraints:**
- `payer` cannot be `address(0)`
- `paymentToken` cannot be `address(0)` (USDC only, no ETH)
- `modelId` cannot be `bytes32(0)`
- Payer must have approved contract for `amount`
- Payer must have sufficient USDC balance

---

### `createSessionAsDelegate(...)`

Create a non-model session as an authorized delegate. **USDC only.**

```solidity
function createSessionAsDelegate(
    address payer,
    address host,
    address paymentToken,       // Must be ERC-20 (NOT address(0))
    uint256 amount,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow
) external returns (uint256 sessionId)
```

Same constraints as `createSessionForModelAsDelegate`, minus model validation.

---

## Custom Errors

V2 delegation uses custom errors for gas efficiency. Handle these in your SDK:

```solidity
error NotDelegate();        // Caller not authorized for this payer
error ERC20Only();          // paymentToken must be ERC-20 (not ETH)
error BadDelegateParams();  // Invalid parameters (zero address, bad duration, etc.)
```

### Error Handling in TypeScript

```typescript
import { Interface } from "ethers";

const iface = new Interface(JobMarketplaceABI);

try {
  await marketplace.connect(subAccount).createSessionForModelAsDelegate(...);
} catch (error: any) {
  // Decode custom error
  if (error.data) {
    try {
      const decoded = iface.parseError(error.data);
      switch (decoded?.name) {
        case "NotDelegate":
          console.error("Sub-account not authorized. Call authorizeDelegate() first.");
          break;
        case "ERC20Only":
          console.error("Must use USDC for delegated sessions (not ETH).");
          break;
        case "BadDelegateParams":
          console.error("Invalid parameters. Check addresses, amounts, and durations.");
          break;
      }
    } catch {
      console.error("Unknown error:", error.message);
    }
  }
}
```

---

## Events

### `DelegateAuthorized`

```solidity
event DelegateAuthorized(
    address indexed payer,
    address indexed delegate,
    bool authorized
);
```

### `SessionCreatedByDelegate`

```solidity
event SessionCreatedByDelegate(
    uint256 indexed sessionId,
    address indexed payer,
    address indexed delegate,
    address host,
    bytes32 modelId,
    uint256 amount
);
```

### Event Listening

```typescript
// Track authorization changes
marketplace.on("DelegateAuthorized", (payer, delegate, authorized) => {
  console.log(`Delegation ${authorized ? "granted" : "revoked"}`);
  console.log(`  Payer: ${payer}`);
  console.log(`  Delegate: ${delegate}`);
});

// Track delegated sessions
marketplace.on("SessionCreatedByDelegate",
  (sessionId, payer, delegate, host, modelId, amount) => {
    console.log(`Delegated session: ${sessionId}`);
    console.log(`  Payer: ${payer}`);
    console.log(`  Delegate: ${delegate}`);
    console.log(`  Amount: ${formatUnits(amount, 6)} USDC`);
  }
);
```

---

## Complete Integration Example

```typescript
import { ethers, Contract, parseUnits, formatUnits } from "ethers";
import JobMarketplaceABI from "./abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json";
import ERC20ABI from "./abis/ERC20.json";

// Constants
const MARKETPLACE = "0x95132177F964FF053C1E874b53CF74d819618E06";
const USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const TINY_VICUNA = "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced";

const DEFAULT_APPROVAL = parseUnits("1000", 6); // $1,000 USDC

/**
 * V2 Direct Payment Delegation SDK
 */
class DelegationSDK {
  private marketplace: Contract;
  private usdc: Contract;
  private provider: ethers.Provider;

  constructor(provider: ethers.Provider) {
    this.provider = provider;
    this.marketplace = new Contract(MARKETPLACE, JobMarketplaceABI, provider);
    this.usdc = new Contract(USDC, ERC20ABI, provider);
  }

  /**
   * Check if delegate is authorized for payer
   */
  async isAuthorized(payer: string, delegate: string): Promise<boolean> {
    return this.marketplace.isDelegateAuthorized(payer, delegate);
  }

  /**
   * Check USDC allowance for payer
   */
  async getAllowance(payer: string): Promise<bigint> {
    return this.usdc.allowance(payer, MARKETPLACE);
  }

  /**
   * Check USDC balance for payer
   */
  async getBalance(payer: string): Promise<bigint> {
    return this.usdc.balanceOf(payer);
  }

  /**
   * One-time setup: Approve USDC and authorize delegate
   * Returns array of transaction hashes
   */
  async setupDelegation(
    primaryWallet: ethers.Signer,
    delegateAddress: string,
    approvalAmount: bigint = DEFAULT_APPROVAL
  ): Promise<{ approveTx?: string; authorizeTx?: string }> {
    const result: { approveTx?: string; authorizeTx?: string } = {};
    const payerAddress = await primaryWallet.getAddress();

    // Step 1: Check and set USDC approval
    const currentAllowance = await this.getAllowance(payerAddress);
    if (currentAllowance < approvalAmount) {
      console.log(`Approving ${formatUnits(approvalAmount, 6)} USDC...`);
      const approveTx = await this.usdc.connect(primaryWallet).approve(
        MARKETPLACE,
        approvalAmount
      );
      await approveTx.wait();
      result.approveTx = approveTx.hash;
      console.log("USDC approved");
    } else {
      console.log("USDC already approved");
    }

    // Step 2: Authorize delegate
    const isAuth = await this.isAuthorized(payerAddress, delegateAddress);
    if (!isAuth) {
      console.log(`Authorizing delegate ${delegateAddress}...`);
      const authTx = await this.marketplace.connect(primaryWallet).authorizeDelegate(
        delegateAddress,
        true
      );
      await authTx.wait();
      result.authorizeTx = authTx.hash;
      console.log("Delegate authorized");
    } else {
      console.log("Delegate already authorized");
    }

    return result;
  }

  /**
   * Create session as delegate (no popup!)
   */
  async createDelegatedSession(
    delegateSigner: ethers.Signer,
    payerAddress: string,
    params: {
      modelId: string;
      host: string;
      amount: bigint;
      pricePerToken: bigint;
      maxDuration?: bigint;
      proofInterval?: bigint;
      proofTimeoutWindow?: bigint;
    }
  ): Promise<bigint> {
    const {
      modelId,
      host,
      amount,
      pricePerToken,
      maxDuration = 3600n,
      proofInterval = 1000n,
      proofTimeoutWindow = 300n,
    } = params;

    // Pre-flight checks
    const delegateAddress = await delegateSigner.getAddress();

    // Check authorization
    const isAuth = await this.isAuthorized(payerAddress, delegateAddress);
    if (!isAuth) {
      throw new Error(`Delegate ${delegateAddress} not authorized for payer ${payerAddress}`);
    }

    // Check allowance
    const allowance = await this.getAllowance(payerAddress);
    if (allowance < amount) {
      throw new Error(
        `Insufficient allowance: ${formatUnits(allowance, 6)} < ${formatUnits(amount, 6)} USDC`
      );
    }

    // Check balance
    const balance = await this.getBalance(payerAddress);
    if (balance < amount) {
      throw new Error(
        `Insufficient balance: ${formatUnits(balance, 6)} < ${formatUnits(amount, 6)} USDC`
      );
    }

    // Create session
    console.log(`Creating delegated session for ${formatUnits(amount, 6)} USDC...`);
    const tx = await this.marketplace.connect(delegateSigner).createSessionForModelAsDelegate(
      payerAddress,
      modelId,
      host,
      USDC,
      amount,
      pricePerToken,
      maxDuration,
      proofInterval,
      proofTimeoutWindow
    );

    const receipt = await tx.wait();

    // Extract session ID from event
    const event = receipt.logs.find(
      (log: any) => log.fragment?.name === "SessionCreatedByDelegate"
    );
    const sessionId = event?.args?.sessionId;

    console.log(`Session created: ${sessionId}`);
    return sessionId;
  }

  /**
   * Revoke delegate authorization
   */
  async revokeDelegate(
    primaryWallet: ethers.Signer,
    delegateAddress: string
  ): Promise<string> {
    const tx = await this.marketplace.connect(primaryWallet).authorizeDelegate(
      delegateAddress,
      false
    );
    await tx.wait();
    return tx.hash;
  }

  /**
   * Re-approve USDC when allowance is low
   */
  async reapprove(
    primaryWallet: ethers.Signer,
    amount: bigint = DEFAULT_APPROVAL
  ): Promise<string> {
    const tx = await this.usdc.connect(primaryWallet).approve(MARKETPLACE, amount);
    await tx.wait();
    return tx.hash;
  }
}

// ============================================
// USAGE EXAMPLE
// ============================================

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  // Wallets
  const primaryWallet = new ethers.Wallet(process.env.PRIMARY_KEY!, provider);
  const subAccount = new ethers.Wallet(process.env.SUBACCOUNT_KEY!, provider);

  const sdk = new DelegationSDK(provider);

  // ========== ONE-TIME SETUP ==========
  console.log("\n=== Setting up delegation ===");
  await sdk.setupDelegation(
    primaryWallet,
    await subAccount.getAddress(),
    parseUnits("1000", 6)  // $1,000 approval
  );

  // ========== CREATE SESSIONS (NO POPUP!) ==========
  console.log("\n=== Creating delegated session ===");
  const sessionId = await sdk.createDelegatedSession(
    subAccount,
    await primaryWallet.getAddress(),
    {
      modelId: TINY_VICUNA,
      host: "0x...",  // Your host address
      amount: parseUnits("10", 6),  // 10 USDC
      pricePerToken: 5000n,  // $5/million tokens
    }
  );

  console.log(`\nSession ${sessionId} created successfully!`);
  console.log("Session owner:", await primaryWallet.getAddress());
  console.log("Session creator:", await subAccount.getAddress());
}

main().catch(console.error);
```

---

## Allowance Management

### Recommended Strategy

Use a bounded approval (~$1,000) and monitor remaining allowance:

```typescript
const MIN_ALLOWANCE_THRESHOLD = parseUnits("50", 6); // $50 USDC

async function ensureSufficientAllowance(
  sdk: DelegationSDK,
  primaryWallet: ethers.Signer,
  requiredAmount: bigint
) {
  const payerAddress = await primaryWallet.getAddress();
  const currentAllowance = await sdk.getAllowance(payerAddress);

  if (currentAllowance < requiredAmount + MIN_ALLOWANCE_THRESHOLD) {
    console.log("Allowance running low, requesting re-approval...");
    await sdk.reapprove(primaryWallet, DEFAULT_APPROVAL);
  }
}
```

### Why Not Unlimited Approval?

- **Security**: Limits exposure if contract is compromised
- **User Trust**: Users are wary of unlimited approvals
- **Best Practice**: Match Web2 spending limit patterns

---

## Session Ownership

**Critical**: Sessions created via delegation are owned by the **payer**, not the delegate.

| Property | Value |
|----------|-------|
| `session.depositor` | Payer address |
| Refunds go to | Payer address |
| Who can complete | Payer or Host |
| Who creates | Delegate (msg.sender) |

```typescript
// After creating session
const session = await marketplace.sessionJobs(sessionId);
console.log("Session depositor:", session.depositor);  // = payer, NOT delegate
```

---

## Security Best Practices

### For SDK Developers

1. **Always verify authorization before session creation**
   ```typescript
   const isAuth = await sdk.isAuthorized(payer, delegate);
   if (!isAuth) throw new Error("Not authorized");
   ```

2. **Check allowance and balance before transactions**
   ```typescript
   const allowance = await sdk.getAllowance(payer);
   const balance = await sdk.getBalance(payer);
   if (allowance < amount || balance < amount) throw new Error("Insufficient funds");
   ```

3. **Handle custom errors properly** - Don't just catch generic errors

4. **Log delegation events** - Track authorization changes for audit

### For Users

1. **Only authorize trusted sub-accounts** - They can spend your approved USDC
2. **Use bounded approvals** - Don't approve unlimited amounts
3. **Revoke unused delegates** - Call `authorizeDelegate(delegate, false)`
4. **Monitor allowance** - Re-approve only when needed

---

## Testing

### Run Tests

```bash
# All V2 delegation tests (41 tests)
forge test --match-path "test/SecurityFixes/DelegatedSessions/**" -vv

# Specific test files
forge test --match-contract DirectPaymentDelegationTest -vv
forge test --match-contract DelegationSecurityTest -vv
```

### Manual Test Flow

1. **Setup**: Primary approves USDC + authorizes delegate
2. **Create**: Delegate creates session
3. **Verify**: Check session.depositor = payer
4. **Complete**: Payer completes session
5. **Refund**: Verify refund goes to payer
6. **Revoke**: Primary revokes delegate
7. **Fail**: Verify delegate can't create more sessions

---

## Migration from V1 (Escrow Pattern)

If you're migrating from the V1 escrow-based delegation:

| V1 (Escrow) | V2 (Direct Payment) |
|-------------|---------------------|
| `depositNative()` | `usdc.approve()` |
| `depositToken()` | `usdc.approve()` |
| `createSessionFromDepositAsDelegate()` | `createSessionAsDelegate()` |
| `createSessionFromDepositForModelAsDelegate()` | `createSessionForModelAsDelegate()` |
| ETH supported | USDC only |
| Funds in contract | Funds in user wallet |

### Key Differences

1. **No deposit step** - Just approve USDC
2. **No withdrawal needed** - Funds never leave user's wallet until session
3. **USDC only** - Use V1 for ETH delegation needs

---

## FAQ

**Q: Can I use ETH with V2 delegation?**
A: No. V2 requires ERC-20 tokens because it uses `transferFrom`. For ETH, use V1 escrow pattern or direct session creation.

**Q: What happens if payer revokes delegate mid-session?**
A: Existing sessions continue normally. Revocation only prevents new session creation.

**Q: Can delegate complete sessions?**
A: No. Only the payer (depositor) or host can complete sessions.

**Q: What if payer doesn't have enough USDC when delegate creates session?**
A: The `transferFrom` will fail with an ERC-20 error. Always check balance before creating.

**Q: Can one delegate serve multiple payers?**
A: Yes. Each payer must authorize the delegate separately.

---

## Related Documentation

- [API Reference](../API_REFERENCE.md) - Full function signatures
- [Breaking Changes](../BREAKING_CHANGES.md) - V2 delegation changes
- [Architecture](../ARCHITECTURE.md) - V2 delegation flow diagram
- [V1 Escrow Pattern](./DELEGATED-SESSIONS-SDK.md) - For ETH delegation

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-02 | 1.0 | Initial V2 Direct Payment Delegation release |

---

## Support

- **ABI Location**: `client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- **Test Files**: `test/SecurityFixes/DelegatedSessions/`
- **Implementation Doc**: `docs/IMPLEMENTATION-V2-DIRECT-PAYMENT-DELEGATION.md`
