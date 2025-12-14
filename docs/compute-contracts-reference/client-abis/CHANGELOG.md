# Client ABIs Changelog

## December 14, 2025 - UUPS Upgradeable Migration + Minimum Deposit Reduction

### Major Changes
- **All contracts migrated to UUPS Upgradeable pattern**
- **Minimum deposits reduced to ~$0.50**
- **Old non-upgradeable ABIs removed**

### Current ABIs (Upgradeable Only)
- `JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json`
- `ModelRegistryUpgradeable-CLIENT-ABI.json`
- `HostEarningsUpgradeable-CLIENT-ABI.json`
- `ProofSystemUpgradeable-CLIENT-ABI.json`

### New Contract Addresses (UUPS Proxies)
| Contract | Proxy Address | Implementation |
|----------|---------------|----------------|
| JobMarketplace | `0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D` | `0xe0ee96FC4Cc7a05a6e9d5191d070c5d1d13f143F` |
| NodeRegistry | `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` | `0x68298e2b74a106763aC99E3D973E98012dB5c75F` |
| ModelRegistry | `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` | `0xd7Df5c6D4ffe6961d47753D1dd32f844e0F73f50` |
| ProofSystem | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` | `0x83eB050Aa3443a76a4De64aBeD90cA8d525E7A3A` |
| HostEarnings | `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` | `0x588c42249F85C6ac4B4E27f97416C0289980aabB` |

### Minimum Deposits (Reduced)
| Payment Type | Old Value | New Value |
|--------------|-----------|-----------|
| ETH | 0.0002 ETH (~$0.88) | 0.0001 ETH (~$0.50) |
| USDC | 800000 ($0.80) | 500000 ($0.50) |

### New Functions Added to JobMarketplace
- `updateTokenMinDeposit(address token, uint256 minDeposit)` - Admin function to update minimum deposits
- `pause()` / `unpause()` - Emergency pause functionality

### New Events Added to JobMarketplace
- `TokenMinDepositUpdated(address indexed token, uint256 oldMinDeposit, uint256 newMinDeposit)`
- `ContractPaused(address indexed by)`
- `ContractUnpaused(address indexed by)`

### Removed ABIs (Deprecated)
The following non-upgradeable ABIs have been removed:
- `HostEarnings-CLIENT-ABI.json`
- `JobMarketplaceWithModels-CLIENT-ABI.json`
- `ModelRegistry-CLIENT-ABI.json`
- `NodeRegistryWithModels-CLIENT-ABI.json`
- `ProofSystem-CLIENT-ABI.json`

### Migration Required
1. **Update all contract addresses** to use proxy addresses above
2. **Update ABIs** to use `*Upgradeable-CLIENT-ABI.json` files
3. **Update minimum deposit checks** (now $0.50 instead of $0.80)

---

## December 10, 2025 - Rate Limit Fix (2000 tokens/sec)

### Changes
- Increased proof submission rate limit from 200 to 2000 tokens/sec
- Supports high-speed inference on small models (RTX 4090: 800-1500 tok/sec)

---

## October 14, 2025 - S5 Proof Storage

### Changes
- Moved STARK proofs to S5 decentralized storage
- On-chain: only hash + CID (300 bytes vs 221KB)
- `submitProofOfWork` signature changed to 4 parameters

---

## September 2025 - Initial Release

### Features
- Session-based streaming payments
- FAB token staking for hosts
- USDC/ETH payment support
- Model governance via ModelRegistry
