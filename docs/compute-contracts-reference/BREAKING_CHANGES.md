# Breaking Changes

---

## December 14, 2025: Minimum Deposit Reduction + UUPS Migration

**Contracts Affected**: `JobMarketplaceWithModelsUpgradeable`
**Impact Level**: LOW - Non-breaking, reduces minimum requirements

### Summary

Minimum session deposits have been reduced from ~$0.80 to ~$0.50:

| Parameter | Old Value | New Value |
|-----------|-----------|-----------|
| `MIN_DEPOSIT` (ETH) | 0.0002 ETH (~$0.88) | 0.0001 ETH (~$0.50) |
| `USDC_MIN_DEPOSIT` | 800,000 ($0.80) | 500,000 ($0.50) |

### New Admin Function

A new function allows admins to update minimum deposits without contract redeployment:

```solidity
function updateTokenMinDeposit(address token, uint256 minDeposit) external
```

**Event emitted:**
```solidity
event TokenMinDepositUpdated(address indexed token, uint256 oldMinDeposit, uint256 newMinDeposit)
```

### Contract Addresses (UUPS Proxies)

All contracts are now UUPS upgradeable:

| Contract | Proxy Address | Implementation |
|----------|---------------|----------------|
| JobMarketplace | `0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D` | `0xe0ee96FC4Cc7a05a6e9d5191d070c5d1d13f143F` |
| NodeRegistry | `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` | `0x68298e2b74a106763aC99E3D973E98012dB5c75F` |
| ModelRegistry | `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` | `0xd7Df5c6D4ffe6961d47753D1dd32f844e0F73f50` |
| ProofSystem | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` | `0x83eB050Aa3443a76a4De64aBeD90cA8d525E7A3A` |
| HostEarnings | `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` | `0x588c42249F85C6ac4B4E27f97416C0289980aabB` |

### Migration Required

1. **Update contract addresses** to use proxy addresses (if using old non-upgradeable addresses)
2. **Update ABIs** to use `*Upgradeable-CLIENT-ABI.json` files
3. **No code changes needed** for minimum deposit reduction (it's backwards compatible)

---

## December 2025: PRICE_PRECISION Update

**Contracts Affected**: `NodeRegistryWithModels`, `JobMarketplaceWithModels`
**Impact Level**: HIGH - Requires SDK and Node operator updates

## Summary

Prices are now stored with a **1000x multiplier** (PRICE_PRECISION=1000) to support sub-$1/million token pricing for budget AI models.

**This is a breaking change** - all price values must be multiplied by 1000 to maintain the same USD value.

## Why This Change?

The previous minimum price of $10/million tokens was too high for budget models:

| Model | Actual Price/Million | Previous Min | New Min |
|-------|---------------------|--------------|---------|
| Llama 3.2 3B | $0.06/million | $10/million (too high) | $0.001/million |
| DeepSeek V3 | $0.27/million | $10/million (too high) | $0.001/million |
| Gemma 2 2B | $0.07/million | $10/million (too high) | $0.001/million |

## What Changed

### 1. New Constants

```solidity
// NodeRegistryWithModels.sol
uint256 public constant PRICE_PRECISION = 1000;

// Stable pricing (with 1000x precision):
uint256 public constant MIN_PRICE_PER_TOKEN_STABLE = 1;     // $0.001 per million tokens
uint256 public constant MAX_PRICE_PER_TOKEN_STABLE = 100_000_000; // $100,000 per million tokens

// Native pricing (with 1000x precision, calibrated for ~$4400 ETH):
uint256 public constant MIN_PRICE_PER_TOKEN_NATIVE = 227_273;       // ~$0.001 per million @ $4400 ETH
uint256 public constant MAX_PRICE_PER_TOKEN_NATIVE = 22_727_272_727_273_000; // ~$100,000 per million
```

### 2. Payment Calculation Changes

**Before (OLD):**
```javascript
maxTokens = deposit / pricePerToken
hostPayment = tokensUsed * pricePerToken
```

**After (NEW):**
```javascript
maxTokens = (deposit * PRICE_PRECISION) / pricePerToken
hostPayment = (tokensUsed * pricePerToken) / PRICE_PRECISION
```

## Migration Guide

### For SDK Developers

#### Price Conversion

| USD Price/Million | OLD pricePerToken | NEW pricePerToken |
|-------------------|-------------------|-------------------|
| $0.06/million | Not supported | 60 |
| $0.27/million | Not supported | 270 |
| $1/million | 1 | 1,000 |
| $5/million | 5 | 5,000 |
| $10/million | 10 | 10,000 |
| $50/million | 50 | 50,000 |

**Conversion formula:**
```javascript
// Convert USD/million to pricePerToken
const newPricePerToken = oldPricePerToken * 1000;

// Or from USD directly
const pricePerToken = usdPerMillion * 1000;
```

#### Example SDK Update

**Before (OLD):**
```javascript
const pricePerToken = 5; // $5/million tokens

const session = await marketplace.createSessionJobWithToken(
  host,
  usdcAddress,
  deposit,
  pricePerToken, // 5
  maxDuration,
  proofInterval
);
```

**After (NEW):**
```javascript
const PRICE_PRECISION = 1000;
const pricePerMillion = 5; // $5/million tokens
const pricePerToken = pricePerMillion * PRICE_PRECISION; // 5000

const session = await marketplace.createSessionJobWithToken(
  host,
  usdcAddress,
  deposit,
  pricePerToken, // 5000
  maxDuration,
  proofInterval
);
```

#### Calculating Max Tokens from Deposit

**Before (OLD):**
```javascript
const maxTokens = deposit / pricePerToken;
// Example: 10 USDC / 5 = 2,000,000 tokens
```

**After (NEW):**
```javascript
const PRICE_PRECISION = 1000;
const maxTokens = (deposit * PRICE_PRECISION) / pricePerToken;
// Example: (10 USDC * 1000) / 5000 = 2,000,000 tokens (same result!)
```

#### Calculating Cost from Token Usage

**Before (OLD):**
```javascript
const cost = tokensUsed * pricePerToken;
// Example: 1,000,000 tokens * 5 = 5,000,000 USDC units = $5
```

**After (NEW):**
```javascript
const PRICE_PRECISION = 1000;
const cost = (tokensUsed * pricePerToken) / PRICE_PRECISION;
// Example: (1,000,000 tokens * 5000) / 1000 = 5,000,000 USDC units = $5 (same result!)
```

### For Node Operators

#### Registering a Node

**Before (OLD):**
```javascript
// Register with $5/million stable pricing
await nodeRegistry.registerNode(
  metadata,
  apiUrl,
  modelIds,
  nativePrice,    // e.g., 3_000_000_000 wei
  5               // $5/million stable price
);
```

**After (NEW):**
```javascript
// Register with $5/million stable pricing (multiply by 1000)
await nodeRegistry.registerNode(
  metadata,
  apiUrl,
  modelIds,
  3_000_000,      // Native price (also 1000x smaller for same USD value)
  5000            // $5/million stable price (5 * 1000)
);
```

#### Updating Pricing

**Before (OLD):**
```javascript
await nodeRegistry.updatePricingStable(10); // $10/million
```

**After (NEW):**
```javascript
await nodeRegistry.updatePricingStable(10000); // $10/million (10 * 1000)
```

#### Setting Model-Specific Pricing

**Before (OLD):**
```javascript
await nodeRegistry.setModelPricing(
  modelId,
  nativePrice,
  15  // $15/million for this model
);
```

**After (NEW):**
```javascript
await nodeRegistry.setModelPricing(
  modelId,
  nativePrice,
  15000  // $15/million for this model (15 * 1000)
);
```

### Native Token (ETH/BNB) Pricing

Native pricing also uses PRICE_PRECISION. The values are calibrated for ~$4400 ETH:

| USD Price/Million | NEW Native pricePerToken |
|-------------------|--------------------------|
| $0.001/million | 227,273 (MIN) |
| $0.013/million | 3,000,000 |
| $0.1/million | 22,727,273 |
| $1/million | 227,272,727 |

**Formula:**
```javascript
// Convert USD/million to native pricePerToken (for $4400 ETH)
const nativePricePerToken = (usdPerMillion / 4400) * 1e18 / 1e6 * 1000;
```

## Query Functions

The following query functions return prices in the NEW format (with PRICE_PRECISION):

```javascript
// Get host's base pricing
const [nativePrice, stablePrice] = await nodeRegistry.getNodePricing(hostAddress);
// Returns: [3000000, 5000] for ~$0.013/million native and $5/million stable

// Get model-specific pricing
const modelPrice = await nodeRegistry.getModelPricing(hostAddress, modelId, tokenAddress);
// Returns price with PRICE_PRECISION included

// Get full node info
const [operator, stake, active, metadata, apiUrl, models, nativePrice, stablePrice] =
  await nodeRegistry.getNodeFullInfo(hostAddress);
```

## Checklist for Migration

### SDK Updates

- [ ] Update all `pricePerToken` values by multiplying by 1000
- [ ] Update maxTokens calculation: `(deposit * 1000) / pricePerToken`
- [ ] Update cost calculation: `(tokensUsed * pricePerToken) / 1000`
- [ ] Update price display: divide by 1000 before showing USD
- [ ] Add PRICE_PRECISION constant to SDK config

### Node Operator Updates

- [ ] Re-register nodes with updated price values (×1000)
- [ ] Update any pricing automation scripts
- [ ] Test session creation with new prices

### Testing

- [ ] Verify session creation works with new prices
- [ ] Verify payment calculations are correct
- [ ] Verify price display in UI matches expected USD values

## Contract Addresses

> **Note:** As of December 14, 2025, all contracts have been migrated to UUPS upgradeable pattern. See the December 14, 2025 section above for current proxy addresses.

### Legacy (Non-Upgradeable) - DEPRECATED

| Contract | Address (Base Sepolia) | Status |
|----------|------------------------|--------|
| NodeRegistryWithModels | `0x906F4A8Cb944E4fe12Fb85Be7E627CeDAA8B8999` | ⚠️ DEPRECATED Dec 14, 2025 |
| JobMarketplaceWithModels | `0x75C72e8C3eC707D8beF5Ba9b9C4f75CbB5bced97` | ⚠️ DEPRECATED Dec 14, 2025 |
| JobMarketplaceWithModels (200 tok/sec) | `0x5497a28B4bE6b1219F93e6Fcd631E8aCdC173709` | ⚠️ DEPRECATED Dec 10, 2025 |
| JobMarketplaceWithModels (20 tok/sec) | `0xfD764804C5A5808b79D66746BAF4B65fb4413731` | ⚠️ DEPRECATED Dec 10, 2025 |

## Questions?

If you have questions about this migration, please contact the Fabstir team or open an issue at https://github.com/fabstirp2p/contracts/issues.
