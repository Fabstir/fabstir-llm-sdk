# UPGRADE_GUIDE.md - Contract Upgrade Procedures

**Last Updated:** January 9, 2026
**Network:** Base Sepolia (Chain ID: 84532)

---

## Overview

This guide documents the procedures for upgrading the Fabstir marketplace smart contracts using the UUPS (Universal Upgradeable Proxy Standard) pattern.

### Upgradeable Contracts

| Contract | Proxy Address | Current Implementation |
|----------|---------------|------------------------|
| JobMarketplaceWithModelsUpgradeable | `0x3CaCbf3f448B420918A93a88706B26Ab27a3523E` ⚠️ NEW | `0x26f27C19F80596d228D853dC39A204f0f6C45C7E` |
| NodeRegistryWithModelsUpgradeable | `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` | `0xb85424dd91D4ae0C6945e512bfDdF8a494299115` |
| ModelRegistryUpgradeable | `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` | `0x1D31d9688a4ffD2aFE738BC6C9a4cb27C272AA5A` |
| HostEarningsUpgradeable | `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` | `0x8584AeAC9687613095D13EF7be4dE0A796F84D7a` |
| ProofSystemUpgradeable | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` | `0xCF46BBa79eA69A68001A1c2f5Ad9eFA1AD435EF9` |

---

## UUPS Pattern Overview

### How It Works

1. **Proxy Contract**: Stores all state data and delegates calls to implementation
2. **Implementation Contract**: Contains the business logic (can be upgraded)
3. **ERC1967 Storage Slot**: Implementation address stored at `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`

### Key Characteristics

- **Owner-Only Upgrades**: Only the contract owner can call `upgradeToAndCall()`
- **Storage Preservation**: All state is preserved across upgrades
- **Storage Gaps**: 50 slots reserved in each contract for future storage additions
- **Initialization**: Contracts use `initialize()` instead of constructors

---

## Pre-Upgrade Checklist

Before performing any upgrade:

- [ ] Review the new implementation code thoroughly
- [ ] Ensure storage layout compatibility (no storage collisions)
- [ ] Run all existing tests against the new implementation
- [ ] Test upgrade flow on local fork first
- [ ] Verify you have owner access to the proxy contract
- [ ] Prepare rollback plan if needed
- [ ] Document all changes being made

---

## Standard Upgrade Procedure

### Step 1: Deploy New Implementation

```bash
# Set environment variables
export PRIVATE_KEY=your-private-key
export BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Deploy new implementation (example for JobMarketplace)
forge create src/JobMarketplaceWithModelsUpgradeable.sol:JobMarketplaceWithModelsUpgradeable \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --legacy

# Note the deployed address from output
# Example output: Deployed to: 0x1234...
```

### Step 2: Verify New Implementation

```bash
# Verify the implementation contract on BaseScan
forge verify-contract $NEW_IMPL_ADDRESS \
  src/JobMarketplaceWithModelsUpgradeable.sol:JobMarketplaceWithModelsUpgradeable \
  --chain-id 84532 \
  --etherscan-api-key $BASESCAN_API_KEY
```

### Step 3: Upgrade Proxy

```bash
# Define addresses
PROXY_ADDRESS=0x3CaCbf3f448B420918A93a88706B26Ab27a3523E
NEW_IMPL_ADDRESS=0x1234... # From Step 1

# Upgrade the proxy (owner only)
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  $NEW_IMPL_ADDRESS \
  0x \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

### Step 4: Verify Upgrade Success

```bash
# Read implementation from ERC1967 slot
cast call $PROXY_ADDRESS \
  "proxiableUUID()" \
  --rpc-url $BASE_SEPOLIA_RPC_URL

# Verify implementation address (using storage slot)
cast storage $PROXY_ADDRESS \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
  --rpc-url $BASE_SEPOLIA_RPC_URL

# Test a simple function call
cast call $PROXY_ADDRESS "owner()" --rpc-url $BASE_SEPOLIA_RPC_URL
```

---

## Upgrade with Data Migration

If the new implementation needs to run initialization code:

```bash
# Encode the initialization call
INIT_DATA=$(cast calldata "reinitialize(uint256)" 2)

# Upgrade with initialization
cast send $PROXY_ADDRESS \
  "upgradeToAndCall(address,bytes)" \
  $NEW_IMPL_ADDRESS \
  $INIT_DATA \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

**Important**: Use the `reinitializer(version)` modifier in your new implementation:

```solidity
function reinitialize(uint256 version) public reinitializer(version) {
    // Migration logic here
}
```

---

## Contract-Specific Upgrade Notes

### JobMarketplaceWithModelsUpgradeable

**Current Proxy**: `0x3CaCbf3f448B420918A93a88706B26Ab27a3523E`

**Critical Dependencies**:
- NodeRegistry address (immutable after deployment)
- HostEarnings address (immutable after deployment)
- Treasury fee configuration

**Upgrade Considerations**:
- Active sessions will continue to work
- Paused state is preserved
- Fee configurations are preserved

**Emergency Pause** (if needed before upgrade):
```bash
cast send $PROXY_ADDRESS "pause()" \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY
```

### NodeRegistryWithModelsUpgradeable

**Current Proxy**: `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22`

**Critical Dependencies**:
- FAB Token address
- ModelRegistry address

**Upgrade Considerations**:
- Registered nodes are preserved
- Staked amounts are preserved
- Model support mappings are preserved

### ModelRegistryUpgradeable

**Current Proxy**: `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2`

**Critical Dependencies**:
- Governance token address

**Upgrade Considerations**:
- Approved models list is preserved
- Voting state is preserved

### HostEarningsUpgradeable

**Current Proxy**: `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0`

**Upgrade Considerations**:
- Host balances are preserved
- Authorized callers list is preserved
- Always verify JobMarketplace is still authorized after upgrade

### ProofSystemUpgradeable

**Current Proxy**: `0x5afB91977e69Cc5003288849059bc62d47E7deeb`

**Upgrade Considerations**:
- Proof verification logic changes require careful testing
- Used proof hashes storage is preserved

---

## Storage Layout Rules

### DO:
- Add new storage variables at the end (before `__gap`)
- Reduce the `__gap` size by the number of slots added
- Keep variable ordering consistent

### DON'T:
- Remove existing storage variables
- Change the order of existing variables
- Change the type of existing variables (unless same storage size)
- Insert new variables between existing ones

### Example: Adding New Storage

**Before (V1)**:
```solidity
uint256 public existingVar;
uint256[50] private __gap;
```

**After (V2)** - Adding `newVar`:
```solidity
uint256 public existingVar;
uint256 public newVar;        // NEW
uint256[49] private __gap;    // Reduced from 50 to 49
```

---

## Testing Upgrades Locally

### Using Forge Script

```bash
# Run upgrade test on local fork
forge script script/UpgradeContract.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --fork-url $BASE_SEPOLIA_RPC_URL \
  -vvv

# If successful, run with broadcast
forge script script/UpgradeContract.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --legacy
```

### Using Anvil Fork

```bash
# Start local fork
anvil --fork-url $BASE_SEPOLIA_RPC_URL

# In another terminal, run tests
forge test --fork-url http://localhost:8545 -vvv
```

---

## Rollback Procedure

If an upgrade fails or causes issues:

1. **Deploy Previous Implementation** (if needed):
   ```bash
   # Get previous implementation from BaseScan or local records
   PREVIOUS_IMPL=0x...
   ```

2. **Rollback to Previous**:
   ```bash
   cast send $PROXY_ADDRESS \
     "upgradeToAndCall(address,bytes)" \
     $PREVIOUS_IMPL \
     0x \
     --rpc-url $BASE_SEPOLIA_RPC_URL \
     --private-key $PRIVATE_KEY
   ```

3. **Verify Rollback**:
   ```bash
   cast storage $PROXY_ADDRESS \
     0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
     --rpc-url $BASE_SEPOLIA_RPC_URL
   ```

---

## Mainnet Deployment Considerations

When deploying to Base Mainnet:

1. **Multi-Sig Ownership**: Transfer ownership to a multi-sig wallet (e.g., Gnosis Safe)
2. **Timelock**: Consider adding a timelock for upgrades
3. **Audit**: Get the upgrade audited before mainnet deployment
4. **Staged Rollout**: Test on testnet first, then mainnet
5. **Monitoring**: Set up alerts for upgrade events

### Gnosis Safe Upgrade Flow

```solidity
// 1. Propose upgrade transaction in Safe
// 2. Collect required signatures
// 3. Execute upgrade transaction
```

---

## Troubleshooting

### "OwnableUnauthorizedAccount" Error
**Cause**: Caller is not the contract owner
**Solution**: Use the owner account to perform upgrades

### "UUPSUnauthorizedCallContext" Error
**Cause**: Trying to call upgrade function directly on implementation
**Solution**: Always call upgrade on the proxy address

### "InvalidInitialization" Error
**Cause**: Contract already initialized or wrong initializer version
**Solution**: Use `reinitializer(version)` with the next version number

### Storage Collision
**Cause**: Changed storage layout incompatibly
**Solution**: Review storage changes, ensure compatibility

---

## Version History

| Version | Date | Changes | Implementation |
|---------|------|---------|----------------|
| 2.0.0 | January 9, 2026 | Clean slate JobMarketplace deployment (no deprecated storage) | See table above |
| 1.0.0 | December 14, 2025 | Initial upgradeable deployment | Legacy |

---

## References

- [OpenZeppelin UUPS Guide](https://docs.openzeppelin.com/contracts/4.x/api/proxy#UUPSUpgradeable)
- [ERC-1967 Proxy Storage Slots](https://eips.ethereum.org/EIPS/eip-1967)
- [Foundry Upgrades](https://book.getfoundry.sh/tutorials/upgrades)
