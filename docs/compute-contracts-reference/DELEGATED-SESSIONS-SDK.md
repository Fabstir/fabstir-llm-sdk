# Delegated Session Creation - SDK Integration Guide

**Version:** 1.0
**Date:** February 2, 2026
**Status:** Ready for Integration
**Branch:** `fix/remediation-pre-report`

---

## Summary

Delegated session creation enables Coinbase Smart Wallet sub-accounts (and other authorized delegates) to create sessions using the primary account's pre-deposited funds **without requiring authorization popups** for each transaction.

### Why This Matters

Previously, sub-accounts couldn't use the primary wallet's deposits because `createSessionFromDeposit` looked up `userDeposits[msg.sender]`. Now, authorized delegates can specify which depositor's funds to use.

### User Experience Improvement

| Before | After |
|--------|-------|
| Every session requires popup | One-time authorization popup |
| Sub-accounts can't use primary's deposits | Sub-accounts use primary's deposits seamlessly |
| Poor UX for repeat users | Smooth, popup-free experience |

---

## Contract Addresses (Base Sepolia)

### Remediation Contracts (Use for Testing)

```typescript
const REMEDIATION_CONTRACTS = {
  jobMarketplace: "0x95132177F964FF053C1E874b53CF74d819618E06",  // Proxy with delegation
  proofSystem: "0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31",
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",
  hostEarnings: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",
};

// JobMarketplace Implementation: 0x305EC43ae2D6D110c2db8DD9F5420FFd2b551F57
```

### Frozen Audit Contracts (Do Not Use for Delegation)

```typescript
// These contracts do NOT have delegation support
const FROZEN_CONTRACTS = {
  jobMarketplace: "0x3CaCbf3f448B420918A93a88706B26Ab27a3523E",  // No delegation
  // ... other frozen contracts
};
```

---

## New Functions

### 1. `authorizeDelegate(address delegate, bool authorized)`

Primary wallet authorizes or revokes a sub-account's ability to create sessions on their behalf.

```solidity
function authorizeDelegate(address delegate, bool authorized) external
```

**Parameters:**
- `delegate`: Address to authorize (e.g., Smart Wallet sub-account)
- `authorized`: `true` to authorize, `false` to revoke

**Requirements:**
- `delegate` cannot be zero address
- `delegate` cannot be caller (no self-delegation)

**Gas:** ~45,000 (authorize) / ~23,000 (revoke)

---

### 2. `isDelegateAuthorized(address depositor, address delegate) → bool`

Check if a delegate is authorized for a specific depositor.

```solidity
function isDelegateAuthorized(
    address depositor,
    address delegate
) external view returns (bool)
```

**Gas:** ~2,600 (view function)

---

### 3. `createSessionFromDepositAsDelegate(...)`

Delegate creates a non-model session using depositor's pre-deposited funds.

```solidity
function createSessionFromDepositAsDelegate(
    address depositor,        // Owner of the deposits
    address host,             // Host to connect to
    address paymentToken,     // address(0) for ETH, or ERC20 address
    uint256 deposit,          // Amount to use for session
    uint256 pricePerToken,    // Agreed price per token
    uint256 maxDuration,      // Max session duration in seconds
    uint256 proofInterval,    // Min tokens between proofs (>=100)
    uint256 proofTimeoutWindow // Timeout window (60-3600 seconds)
) external returns (uint256 sessionId)
```

---

### 4. `createSessionFromDepositForModelAsDelegate(...)`

Delegate creates a model-specific session using depositor's pre-deposited funds. **This is the most common use case.**

```solidity
function createSessionFromDepositForModelAsDelegate(
    address depositor,        // Owner of the deposits
    bytes32 modelId,          // Model ID (cannot be bytes32(0))
    address host,             // Host to connect to
    address paymentToken,     // address(0) for ETH, or ERC20 address
    uint256 deposit,          // Amount to use for session
    uint256 pricePerToken,    // Agreed price per token
    uint256 maxDuration,      // Max session duration in seconds
    uint256 proofInterval,    // Min tokens between proofs (>=100)
    uint256 proofTimeoutWindow // Timeout window (60-3600 seconds)
) external returns (uint256 sessionId)
```

**Authorization Check:**
```solidity
require(
    msg.sender == depositor || isAuthorizedDelegate[depositor][msg.sender],
    "Not authorized delegate"
);
```

---

## Events

### `DelegateAuthorized`

Emitted when authorization status changes.

```solidity
event DelegateAuthorized(
    address indexed depositor,
    address indexed delegate,
    bool authorized
);
```

### `SessionCreatedByDelegate`

Emitted when a delegate creates a session (in addition to standard session events).

```solidity
event SessionCreatedByDelegate(
    uint256 indexed sessionId,
    address indexed depositor,
    address indexed delegate,
    address host,
    bytes32 modelId,
    uint256 deposit
);
```

---

## Complete Integration Example

### TypeScript/ethers.js v6

```typescript
import { ethers, Contract } from "ethers";
import JobMarketplaceABI from "./abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json";

const MARKETPLACE_ADDRESS = "0x95132177F964FF053C1E874b53CF74d819618E06";

// Model IDs
const TINY_VICUNA = "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced";
const TINY_LLAMA = "0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca";

async function setupDelegation(
  marketplace: Contract,
  primaryWallet: ethers.Signer,
  subAccountAddress: string
) {
  // Check if already authorized
  const primaryAddress = await primaryWallet.getAddress();
  const isAuthorized = await marketplace.isDelegateAuthorized(
    primaryAddress,
    subAccountAddress
  );

  if (!isAuthorized) {
    console.log("Authorizing delegate...");
    const tx = await marketplace.connect(primaryWallet).authorizeDelegate(
      subAccountAddress,
      true
    );
    await tx.wait();
    console.log("Delegate authorized:", subAccountAddress);
  } else {
    console.log("Delegate already authorized");
  }
}

async function createDelegatedSession(
  marketplace: Contract,
  subAccountSigner: ethers.Signer,
  depositorAddress: string,
  modelId: string,
  hostAddress: string,
  depositAmount: bigint,
  pricePerToken: bigint
): Promise<bigint> {
  console.log("Creating delegated session...");

  const tx = await marketplace.connect(subAccountSigner)
    .createSessionFromDepositForModelAsDelegate(
      depositorAddress,           // Who owns the deposits
      modelId,                    // Model to use
      hostAddress,                // Host address
      ethers.ZeroAddress,         // ETH payment (or USDC address)
      depositAmount,              // e.g., ethers.parseEther("0.5")
      pricePerToken,              // Must meet host's minimum
      3600n,                      // 1 hour max duration
      100n,                       // Min 100 tokens per proof
      300n                        // 5 minute timeout window
    );

  const receipt = await tx.wait();

  // Extract sessionId from SessionCreatedByDelegate event
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === "SessionCreatedByDelegate"
  );

  const sessionId = event?.args?.sessionId;
  console.log("Session created:", sessionId.toString());

  return sessionId;
}

// ============================================
// FULL WORKFLOW EXAMPLE
// ============================================

async function main() {
  const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");

  // Primary wallet (has funds, authorizes delegates)
  const primaryWallet = new ethers.Wallet(PRIMARY_PRIVATE_KEY, provider);

  // Sub-account (creates sessions without popups)
  const subAccountWallet = new ethers.Wallet(SUBACCOUNT_PRIVATE_KEY, provider);

  const marketplace = new Contract(
    MARKETPLACE_ADDRESS,
    JobMarketplaceABI,
    provider
  );

  // ========== SETUP PHASE (One-time) ==========

  // 1. Deposit funds (primary wallet)
  const depositTx = await marketplace.connect(primaryWallet).depositNative({
    value: ethers.parseEther("5")
  });
  await depositTx.wait();
  console.log("Deposited 5 ETH");

  // 2. Authorize sub-account (primary wallet)
  await setupDelegation(
    marketplace,
    primaryWallet,
    await subAccountWallet.getAddress()
  );

  // ========== SESSION CREATION (Repeatable, NO popup) ==========

  // 3. Create session (sub-account)
  const sessionId = await createDelegatedSession(
    marketplace,
    subAccountWallet,
    await primaryWallet.getAddress(),  // Depositor
    TINY_VICUNA,
    "0x1234...hostAddress",
    ethers.parseEther("0.5"),
    227273n  // Min native price
  );

  // Session is OWNED by primaryWallet
  // Refunds will go to primaryWallet
  // Sub-account just created it on their behalf
}
```

### Event Listening

```typescript
// Listen for delegation changes
marketplace.on("DelegateAuthorized", (depositor, delegate, authorized) => {
  console.log(`Delegation ${authorized ? "granted" : "revoked"}`);
  console.log(`  Depositor: ${depositor}`);
  console.log(`  Delegate: ${delegate}`);
});

// Listen for delegated session creation
marketplace.on("SessionCreatedByDelegate",
  (sessionId, depositor, delegate, host, modelId, deposit) => {
    console.log(`Delegated session created: ${sessionId}`);
    console.log(`  Depositor: ${depositor}`);
    console.log(`  Delegate: ${delegate}`);
    console.log(`  Host: ${host}`);
    console.log(`  Deposit: ${ethers.formatEther(deposit)} ETH`);
  }
);
```

---

## Key Behaviors

| Aspect | Behavior |
|--------|----------|
| **Session Owner** | Always the `depositor` parameter (not `msg.sender`) |
| **Refunds** | Go to `depositor` address |
| **Balance Deduction** | From `depositor`'s deposits |
| **Who Can Complete** | Both `depositor` and `host` (same as normal sessions) |
| **Revocation** | Depositor can revoke anytime via `authorizeDelegate(delegate, false)` |
| **Multiple Delegates** | A depositor can authorize multiple delegates |
| **Cross-User Access** | Delegates can ONLY access deposits from users who authorized them |

---

## Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `"Invalid delegate address"` | Delegate is zero address | Use valid address |
| `"Cannot delegate to self"` | Trying to authorize yourself | Not needed - you can already create sessions |
| `"Not authorized delegate"` | Caller not authorized for depositor | Call `authorizeDelegate()` first |
| `"Invalid depositor"` | Depositor is zero address | Use valid depositor address |
| `"Insufficient native balance"` | Depositor lacks ETH deposit | Depositor needs to `depositNative()` |
| `"Insufficient token balance"` | Depositor lacks token deposit | Depositor needs to `depositToken()` |

---

## Security Considerations

### For SDK Developers

1. **Always verify authorization before attempting delegated session creation**
   ```typescript
   const isAuth = await marketplace.isDelegateAuthorized(depositor, delegate);
   if (!isAuth) {
     throw new Error("Delegate not authorized");
   }
   ```

2. **Track session ownership correctly** - The session owner is the `depositor`, not the `delegate`

3. **Handle revocation gracefully** - Authorization can be revoked at any time

### For Users

1. **Only authorize trusted sub-accounts** - Delegates can spend your deposited funds
2. **Monitor `DelegateAuthorized` events** - Track who has access to your deposits
3. **Revoke unused delegates** - Call `authorizeDelegate(delegate, false)` when no longer needed

---

## SDK Integration Checklist

- [ ] Update ABI from `client-abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- [ ] Add `authorizeDelegate()` to wallet setup flow
- [ ] Add `isDelegateAuthorized()` for checking authorization status
- [ ] Implement `createSessionFromDepositForModelAsDelegate()` for sub-account sessions
- [ ] Implement `createSessionFromDepositAsDelegate()` for non-model sessions (if needed)
- [ ] Subscribe to `DelegateAuthorized` event for authorization tracking
- [ ] Subscribe to `SessionCreatedByDelegate` event for session tracking
- [ ] Update session tracking to handle delegated sessions (owner ≠ creator)
- [ ] Add UI for managing delegates (authorize/revoke)
- [ ] Test with Coinbase Smart Wallet sub-accounts
- [ ] Test revocation flow

---

## Testing

### Run Delegation Tests

```bash
# All delegation tests
forge test --match-path "test/SecurityFixes/DelegatedSessions/**" -vv

# Specific test contracts
forge test --match-contract DelegationAuthorizationTest -vv
forge test --match-contract DelegatedSessionCreationTest -vv
forge test --match-contract DelegationSecurityTest -vv
```

### Manual Testing Flow

1. Deploy/use remediation contracts
2. Deposit funds from primary wallet
3. Authorize a delegate address
4. Create session from delegate
5. Verify session owner is depositor
6. Complete session and verify refund goes to depositor
7. Revoke delegate and verify they can no longer create sessions

---

## Related Documentation

- [API Reference](../API_REFERENCE.md) - Full function documentation
- [Breaking Changes](../BREAKING_CHANGES.md) - Migration notes (this feature is non-breaking)
- [Architecture](../ARCHITECTURE.md) - Storage layout and access control
- [Remediation Changes](../REMEDIATION_CHANGES.md) - Audit fix details

---

## Questions or Issues?

If you encounter issues or have questions about integrating delegated sessions:

1. Check the error messages table above
2. Review the test files for expected behaviors
3. Verify you're using the remediation contract addresses
4. Ensure the ABI is updated with delegation functions

---

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-02 | 1.0 | Initial release with delegation support |
