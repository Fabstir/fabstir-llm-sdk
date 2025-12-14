# Migration Guide for SDK Developers

**Date:** December 14, 2025
**Change:** UUPS Upgradeable Contract Migration + Minimum Deposit Reduction

---

## Summary

All Fabstir marketplace contracts have been upgraded to UUPS (Universal Upgradeable Proxy Standard) pattern. **The SDK must be updated to use the new contract addresses.**

Additionally, minimum session deposits have been reduced to ~$0.50.

---

## New Contract Addresses (Base Sepolia)

```typescript
// contracts/addresses.ts

export const BASE_SEPOLIA_CONTRACTS = {
  // UUPS Proxy addresses (interact with these)
  JOB_MARKETPLACE: "0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D",
  NODE_REGISTRY: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  MODEL_REGISTRY: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",
  PROOF_SYSTEM: "0x5afB91977e69Cc5003288849059bc62d47E7deeb",
  HOST_EARNINGS: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",

  // Tokens (unchanged)
  FAB_TOKEN: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  USDC_TOKEN: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
} as const;

// Implementation addresses (for verification/debugging only)
export const IMPLEMENTATIONS = {
  JOB_MARKETPLACE: "0xe0ee96FC4Cc7a05a6e9d5191d070c5d1d13f143F",
  NODE_REGISTRY: "0x68298e2b74a106763aC99E3D973E98012dB5c75F",
  MODEL_REGISTRY: "0xd7Df5c6D4ffe6961d47753D1dd32f844e0F73f50",
  PROOF_SYSTEM: "0x83eB050Aa3443a76a4De64aBeD90cA8d525E7A3A",
  HOST_EARNINGS: "0x588c42249F85C6ac4B4E27f97416C0289980aabB",
} as const;

// Minimum deposits
export const MIN_DEPOSITS = {
  ETH: "100000000000000", // 0.0001 ETH (~$0.50)
  USDC: "500000",         // 0.50 USDC
} as const;
```

---

## What Changed?

### 1. Contract Addresses Only
- All 5 core contracts have new proxy addresses
- Proxy addresses are permanent (upgrades don't change them)

### 2. Minimum Deposits Reduced

| Payment Type | Old Minimum | New Minimum | Raw Value |
|--------------|-------------|-------------|-----------|
| ETH | 0.0002 ETH (~$0.88) | 0.0001 ETH (~$0.50) | 100000000000000 wei |
| USDC | 0.80 USDC | 0.50 USDC | 500000 (6 decimals) |

### 3. ABI Changes
- **Backward compatible** - existing function signatures unchanged
- **New function**: `updateTokenMinDeposit(address token, uint256 minDeposit)` (admin only)
- **New event**: `TokenMinDepositUpdated(address indexed token, uint256 oldMinDeposit, uint256 newMinDeposit)`

### 4. New Feature: Pause State
The JobMarketplace now has pause functionality:

```typescript
// New read function to check pause state
const isPaused = await jobMarketplace.paused();

// When paused:
// - createSessionJob() reverts
// - submitProofOfWork() reverts
// - completeSessionJob() still works (safety)
// - withdrawals still work (safety)
```

Consider adding a check in the SDK:
```typescript
async function createSession(...) {
  if (await jobMarketplace.paused()) {
    throw new Error("Contract is paused for maintenance");
  }
  // ... proceed with session creation
}
```

---

## Migration Checklist

### Required Changes

- [ ] Update contract addresses in SDK configuration
- [ ] Update any hardcoded addresses in examples/tests
- [ ] Update minimum deposit constants (ETH: 0.0001, USDC: 500000)
- [ ] Regenerate TypeScript types if using typechain (ABI has new function/event)

### Optional Improvements

- [ ] Add `paused()` check before session creation
- [ ] Add contract upgrade detection (check implementation address)
- [ ] Listen for `TokenMinDepositUpdated` events
- [ ] Update documentation with new addresses

---

## ABIs

ABIs have minor additions (new function + event). If you need fresh copies:

```bash
# From the contracts repo
cat out/JobMarketplaceWithModelsUpgradeable.sol/JobMarketplaceWithModelsUpgradeable.json | jq '.abi'
cat out/NodeRegistryWithModelsUpgradeable.sol/NodeRegistryWithModelsUpgradeable.json | jq '.abi'
# etc.
```

Or use the pre-extracted ABIs in `client-abis/` directory.

---

## New ABI Additions

### Function: updateTokenMinDeposit (admin only)
```solidity
function updateTokenMinDeposit(address token, uint256 minDeposit) external
```

### Event: TokenMinDepositUpdated
```solidity
event TokenMinDepositUpdated(
    address indexed token,
    uint256 oldMinDeposit,
    uint256 newMinDeposit
)
```

---

## Approved Models

Model IDs remain the same:

```typescript
export const APPROVED_MODELS = {
  TINY_VICUNA: "0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced",
  TINY_LLAMA: "0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca",
  GPT_OSS_20B: "0x7583557c14f71d2bf21d48ffb7cde9329f9494090869d2d311ea481b26e7e06c",
} as const;
```

---

## Testing

After updating addresses, verify:

1. **Read operations work:**
   ```typescript
   const nextJobId = await jobMarketplace.nextJobId();
   const isActive = await nodeRegistry.isActiveNode(hostAddress);
   const minDeposit = await jobMarketplace.tokenMinDeposits(USDC_ADDRESS);
   // minDeposit should be 500000
   ```

2. **Write operations work:**
   ```typescript
   // Test session creation with new minimum (0.50 USDC instead of 0.80)
   ```

3. **Events are emitted correctly:**
   ```typescript
   // Event signatures are unchanged for existing events
   // New: TokenMinDepositUpdated
   ```

---

## Questions?

Contact the Fabstir team if you encounter any issues during SDK migration.
