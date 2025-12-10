# PRICE_PRECISION=1000 Migration Implementation Plan

## Overview

Migration of the Fabstir SDK (`@fabstir/sdk-core`) and Host CLI (`@fabstir/host-cli`) to support the new PRICE_PRECISION=1000 contract update, enabling sub-$1/million token pricing for budget AI models.

**Breaking Change**: All price values now use a 1000x multiplier. This is required to work with the new contracts.

## New Contract Addresses (Base Sepolia)

| Contract | Address | Status |
|----------|---------|--------|
| NodeRegistryWithModels | 0x906F4A8Cb944E4fe12Fb85Be7E627CeDAA8B8999 | PRICE_PRECISION=1000, MIN_PRICE_STABLE=1 |
| JobMarketplaceWithModels | 0xfD764804C5A5808b79D66746BAF4B65fb4413731 | PRICE_PRECISION=1000, linked to new NodeRegistry |

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST, then implementation
2. **Bounded Autonomy**: Each sub-phase has strict boundaries and line limits
3. **Incremental Progress**: Build on previous sub-phases without breaking them
4. **No Hardcoded Addresses**: All contract addresses from `.env.test`
5. **Fail Fast**: Error explicitly rather than use fallbacks
6. **Real Contracts**: Test with actual deployed contracts on Base Sepolia

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must be written before implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Clear Boundaries**: Each sub-phase is independently verifiable

## Pricing Formula Changes

**OLD Formula**:
```typescript
maxTokens = deposit / pricePerToken
hostPayment = tokensUsed * pricePerToken
```

**NEW Formula**:
```typescript
const PRICE_PRECISION = 1000n;
maxTokens = (deposit * PRICE_PRECISION) / pricePerToken
hostPayment = (tokensUsed * pricePerToken) / PRICE_PRECISION
```

## Price Value Conversion Table

| USD Price/Million | OLD pricePerToken | NEW pricePerToken |
|-------------------|-------------------|-------------------|
| $0.06/million | Not supported | 60 |
| $0.27/million | Not supported | 270 |
| $1/million | 1 | 1,000 |
| $5/million | 5 | 5,000 |
| $10/million | 10 | 10,000 |
| $50/million | 50 | 50,000 |

---

## Phase 1: SDK Core - Constants & Exports

### Sub-phase 1.1: Update Pricing Constants ✅ COMPLETE
**Goal**: Update all pricing constants to new PRICE_PRECISION values

**Tasks**:
- [x] Write tests in `tests/managers/price-precision-constants.test.ts` (100 lines)
- [x] Update `packages/sdk-core/src/managers/HostManager.ts` constants (lines 37-51)
- [x] Add PRICE_PRECISION = 1000n constant
- [x] Update MIN_PRICE_STABLE = 1n (was 10n)
- [x] Update MAX_PRICE_STABLE = 100_000_000n (was 100_000n)
- [x] Update MIN_PRICE_NATIVE = 227_273n (was 2_272_727_273n)
- [x] Update MAX_PRICE_NATIVE = 22_727_272_727_273_000n (was 22_727_272_727_273n)
- [x] Update DEFAULT_PRICE_STABLE = '5000' (was '316')
- [x] Update DEFAULT_PRICE_NATIVE = '3000000' (was '11363636363636')
- [x] Update legacy constants to match

**Result**: 20/20 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
- PRICE_PRECISION === 1000n
- MIN_PRICE_STABLE === 1n
- MAX_PRICE_STABLE === 100_000_000n
- MIN_PRICE_NATIVE === 227_273n
- MAX_PRICE_NATIVE === 22_727_272_727_273_000n
- DEFAULT_PRICE_STABLE === '5000'
- DEFAULT_PRICE_NATIVE === '3000000'
```

**File Changes** (30 lines max):
```typescript
// packages/sdk-core/src/managers/HostManager.ts (lines 37-51)
export const PRICE_PRECISION = 1000n;

// Native token pricing (ETH/BNB) - with PRICE_PRECISION
export const MIN_PRICE_NATIVE = 227_273n;
export const MAX_PRICE_NATIVE = 22_727_272_727_273_000n;
export const DEFAULT_PRICE_NATIVE = '3000000';

// Stablecoin pricing (USDC) - with PRICE_PRECISION
export const MIN_PRICE_STABLE = 1n;
export const MAX_PRICE_STABLE = 100_000_000n;
export const DEFAULT_PRICE_STABLE = '5000';

// Legacy constants (for backward compatibility)
export const MIN_PRICE_PER_TOKEN = MIN_PRICE_STABLE;
export const MAX_PRICE_PER_TOKEN = MAX_PRICE_STABLE;
export const DEFAULT_PRICE_PER_TOKEN = DEFAULT_PRICE_STABLE;
export const DEFAULT_PRICE_PER_TOKEN_NUMBER = 5000;
```

### Sub-phase 1.2: Export PRICE_PRECISION from SDK ✅ COMPLETE
**Goal**: Make PRICE_PRECISION available to consumers

**Tasks**:
- [x] Write tests in `tests/exports/price-precision-export.test.ts` (50 lines)
- [x] Update `packages/sdk-core/src/index.ts` to export PRICE_PRECISION
- [x] Verify export works in consuming packages

**Result**: 4/4 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
import { PRICE_PRECISION } from '@fabstir/sdk-core';
expect(PRICE_PRECISION).toBe(1000n);
```

**File Changes** (5 lines max):
```typescript
// packages/sdk-core/src/index.ts
export {
  PRICE_PRECISION,
  // ... existing exports
} from './managers/HostManager';
```

---

## Phase 2: SDK Core - Payment Calculations

### Sub-phase 2.1: Update SessionManager.calculateCost() ✅ COMPLETE
**Goal**: Update cost calculation to divide by PRICE_PRECISION

**Tasks**:
- [x] Write tests in `tests/managers/session-cost-precision.test.ts` (120 lines)
- [x] Update `packages/sdk-core/src/managers/SessionManager.ts` calculateCost() (lines 1740-1746)
- [x] Import PRICE_PRECISION constant
- [x] Divide result by PRICE_PRECISION
- [x] Verify backward compatibility with existing callers

**Result**: 12/12 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
// OLD: 1,000,000 tokens * 5 = 5,000,000 (WRONG with new pricing)
// NEW: (1,000,000 tokens * 5000) / 1000 = 5,000,000 (CORRECT)
const cost = sessionManager.calculateCost(1_000_000, 5000);
expect(cost).toBe(5_000_000n);

// Verify small amounts work correctly
const smallCost = sessionManager.calculateCost(100, 5000);
expect(smallCost).toBe(500n);
```

**File Changes** (15 lines max):
```typescript
// packages/sdk-core/src/managers/SessionManager.ts (lines 1740-1746)
import { PRICE_PRECISION } from './HostManager';

calculateCost(tokensUsed: number, pricePerToken: number): bigint {
  // Price includes PRICE_PRECISION multiplier, divide to get actual cost
  return (BigInt(tokensUsed) * BigInt(pricePerToken)) / PRICE_PRECISION;
}
```

### Sub-phase 2.2: Update SessionJobManager.actualCost() ✅ COMPLETE
**Goal**: Update session cost calculation for job creation

**Tasks**:
- [x] Write tests in `tests/contracts/session-job-cost-precision.test.ts` (100 lines)
- [x] Update `packages/sdk-core/src/contracts/SessionJobManager.ts` (lines 79-83)
- [x] Import PRICE_PRECISION constant
- [x] Update actualCost formula to divide by PRICE_PRECISION
- [x] Verify job creation works with new pricing

**Result**: 11/11 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
// actualCost = (pricePerToken * proofInterval) / PRICE_PRECISION
// Example: (5000 * 1000) / 1000 = 5000 USDC units
const params = { pricePerToken: 5000, proofInterval: 1000 };
const cost = calculateActualCost(params);
expect(cost).toBe(5000n);
```

**File Changes** (15 lines max):
```typescript
// packages/sdk-core/src/contracts/SessionJobManager.ts (lines 79-83)
import { PRICE_PRECISION } from '../managers/HostManager';

// Calculate minimum required balance (actual session cost)
// pricePerToken includes PRICE_PRECISION multiplier
const actualCost = (BigInt(params.sessionConfig.pricePerToken) * BigInt(params.sessionConfig.proofInterval)) / PRICE_PRECISION;
```

---

## Phase 3: SDK Core - Validation Updates

### Sub-phase 3.1: Update Host Registration Validation ✅ COMPLETE
**Goal**: Update validation in registerHost() for new price ranges

**Tasks**:
- [x] Write tests in `tests/managers/host-registration-validation-precision.test.ts` (150 lines)
- [x] Update `packages/sdk-core/src/managers/HostManager.ts` registerHost() (lines 183-207)
- [x] Use updated MIN/MAX constants for validation (already using constants - updated in 1.1)
- [x] Update error messages with new valid ranges (automatic via constants)
- [x] Verify registration works with new price values

**Result**: 19/19 tests passing (validation uses updated constants from Sub-phase 1.1)

**Test Requirements**:
```typescript
// Tests must verify:
// Valid stable prices: 1 to 100,000,000
await expect(hostManager.registerHost({ minPricePerTokenStable: '0' }))
  .rejects.toThrow('must be between 1 and 100000000');

await expect(hostManager.registerHost({ minPricePerTokenStable: '5000' }))
  .resolves.toBeDefined();

// Valid native prices: 227,273 to 22,727,272,727,273,000
await expect(hostManager.registerHost({ minPricePerTokenNative: '1000' }))
  .rejects.toThrow('must be between 227273');
```

**File Changes** (20 lines max):
```typescript
// Validation messages updated to use new constants
if (minPriceNative < MIN_PRICE_NATIVE || minPriceNative > MAX_PRICE_NATIVE) {
  throw new PricingValidationError(
    `minPricePerTokenNative must be between ${MIN_PRICE_NATIVE} and ${MAX_PRICE_NATIVE} wei, got ${minPriceNative}`,
  );
}

if (minPriceStable < MIN_PRICE_STABLE || minPriceStable > MAX_PRICE_STABLE) {
  throw new PricingValidationError(
    `minPricePerTokenStable must be between ${MIN_PRICE_STABLE} and ${MAX_PRICE_STABLE}, got ${minPriceStable}`,
  );
}
```

### Sub-phase 3.2: Update Pricing Update Validation ✅ COMPLETE
**Goal**: Update validation in updatePricing methods for new ranges

**Tasks**:
- [x] Write tests in `tests/managers/pricing-update-validation-precision.test.ts` (120 lines)
- [x] Update `packages/sdk-core/src/managers/HostManager.ts` updatePricing() (lines 873-879)
- [x] Update updatePricingNative() (lines 927-932)
- [x] Update updatePricingStable() (lines 980)
- [x] Use new MIN/MAX constants (already using constants - updated in 1.1)
- [x] Update error messages (automatic via constants)
- [x] Updated JSDoc comments to reflect new ranges

**Result**: 14/14 tests passing

**Test Requirements**:
```typescript
// Tests must verify updatePricing accepts new ranges:
await expect(hostManager.updatePricingStable('1')).resolves.toBeDefined();
await expect(hostManager.updatePricingStable('100000000')).resolves.toBeDefined();
await expect(hostManager.updatePricingStable('100000001')).rejects.toThrow();
```

**File Changes** (30 lines max):
```typescript
// updatePricing() - uses legacy constants (which now point to new values)
if (price < MIN_PRICE_PER_TOKEN || price > MAX_PRICE_PER_TOKEN) {
  throw new PricingValidationError(...);
}

// updatePricingNative()
if (price < MIN_PRICE_NATIVE || price > MAX_PRICE_NATIVE) {
  throw new PricingValidationError(...);
}

// updatePricingStable()
if (price < MIN_PRICE_STABLE || price > MAX_PRICE_STABLE) {
  throw new PricingValidationError(...);
}
```

---

## Phase 4: SDK Core - ABIs & Version

### Sub-phase 4.1: Update Contract ABIs ✅ COMPLETE
**Goal**: Copy new ABIs from docs folder to SDK

**Tasks**:
- [x] Copy `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModels-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [x] Copy `docs/compute-contracts-reference/client-abis/NodeRegistryWithModels-CLIENT-ABI.json` to `packages/sdk-core/src/contracts/abis/`
- [x] Verified ABIs contain PRICE_PRECISION-aware functions

**Result**: ABIs updated (Dec 10, 2025)

### Sub-phase 4.2: Bump SDK Version ✅ COMPLETE
**Goal**: Update SDK version to indicate breaking change

**Tasks**:
- [x] Update `packages/sdk-core/package.json` version to 1.5.0

**Result**: Version bumped from 1.4.26 to 1.5.0

---

## Phase 5: Host CLI Updates

### Sub-phase 5.1: Update CLI Pricing Defaults ✅ COMPLETE
**Goal**: Update default pricing in CLI commands

**Tasks**:
- [x] Write tests in `tests/commands/pricing-defaults-precision.test.ts` (11 tests)
- [x] Update `packages/host-cli/src/commands/register.ts` help text with new valid ranges
- [x] Update price display formula to account for PRICE_PRECISION
- [x] SDK exports (DEFAULT_PRICE_PER_TOKEN = '5000') automatically used

**Result**: 11/11 tests passing

### Sub-phase 5.2: Update CLI Validation Ranges ✅ COMPLETE
**Goal**: Update price validation in CLI commands

**Tasks**:
- [x] Write tests in `tests/commands/pricing-validation-precision.test.ts` (18 tests)
- [x] Update `packages/host-cli/src/commands/update-pricing.ts` validation to 1-100,000,000 range
- [x] Update validation error messages
- [x] Update existing test file to use new ranges

**Result**: 18/18 tests passing

### Sub-phase 5.3: Update CLI Info Display ✅ COMPLETE
**Goal**: Update price display in info command

**Tasks**:
- [x] Write tests in `tests/commands/info-display-precision.test.ts` (13 tests)
- [x] Update `packages/host-cli/src/commands/info.ts` to divide by PRICE_PRECISION
- [x] Update display to show $/million, per-token, per-1K, per-10K costs

**Result**: 13/13 tests passing (46 total CLI pricing tests)

---

## Phase 6: Test Harness Updates

### Sub-phase 6.1: Update NodeManagementClient Formatters ✅ COMPLETE
**Goal**: Update price formatters in node management UI

**Tasks**:
- [x] Update `apps/harness/components/NodeManagementClient.tsx` formatStablePrice() with PRICE_PRECISION
- [x] Update formatNativePrice() with PRICE_PRECISION
- [x] Update state defaults (minPricePerTokenNative='3000000', minPricePerTokenStable='5000')
- [x] Added perMillion display to both formatters

**Result**: Formatters updated to divide by PRICE_PRECISION=1000

### Sub-phase 6.2: Update Test Page Defaults ✅ COMPLETE
**Goal**: Update default pricing in test pages

**Tasks**:
- [x] Update `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx` DEFAULT_PRICE_STABLE to 5000
- [x] Update `apps/harness/pages/eth-mvp-flow-sdk.test.tsx` DEFAULT_PRICE_NATIVE_WEI to 3000000
- [x] Update `apps/harness/pages/chat-context-demo.tsx` DEFAULT_PRICE_PER_TOKEN to 5000
- [x] Update cost calculation formulas to divide by PRICE_PRECISION

**Result**: All test pages updated with PRICE_PRECISION=1000 support

---

## Phase 7: Integration Testing

### Sub-phase 7.1: SDK Integration Tests
**Goal**: Verify SDK works with new contracts

**Tasks**:
- [ ] Write tests in `tests/integration/price-precision-e2e.test.ts` (250 lines)
- [ ] Test host registration with new pricing
- [ ] Test session creation with new pricing
- [ ] Test payment calculations are correct
- [ ] Test cost display matches expected values
- [ ] Test with real contracts on Base Sepolia

**Test Scenarios**:
```typescript
// Integration tests must verify:
1. Register host with price 5000 → shows as $5/million
2. Create session with 1000 tokens → costs 5000 USDC units
3. Payment to host is (tokens * price) / 1000
4. getHostInfo returns new price format
5. Session completes with correct payment distribution
```

### Sub-phase 7.2: Host CLI Integration Tests
**Goal**: Verify CLI works with new contracts

**Tasks**:
- [ ] Write tests in `tests/integration/cli-price-precision-e2e.test.ts` (200 lines)
- [ ] Test `fabstir-host register --price 5000`
- [ ] Test `fabstir-host update-pricing --price 10000`
- [ ] Test `fabstir-host info` displays correct USD values
- [ ] Test with real contracts on Base Sepolia

**Test Scenarios**:
```typescript
// CLI integration tests must verify:
1. register --price 5000 succeeds
2. update-pricing --price 10000 succeeds
3. info shows "$0.000010/token" for price 10000
4. validation rejects price 0 and price > 100000000
```

---

## Success Criteria

1. **Constants Updated**: All MIN/MAX/DEFAULT values use PRICE_PRECISION
2. **Formulas Correct**: Cost calculations divide by PRICE_PRECISION
3. **Validation Works**: New price ranges enforced
4. **ABIs Current**: Latest contract ABIs in place
5. **CLI Updated**: Commands use new defaults and validation
6. **UI Correct**: Price displays show correct USD values
7. **Tests Pass**: All new and existing tests pass
8. **Real Contracts**: Works with deployed v8.4.22 node

## Implementation Schedule

**Day 1**: Phase 1 (Constants & Exports)
- Sub-phase 1.1: Update constants
- Sub-phase 1.2: Export PRICE_PRECISION

**Day 2**: Phase 2 (Payment Calculations)
- Sub-phase 2.1: SessionManager.calculateCost()
- Sub-phase 2.2: SessionJobManager.actualCost()

**Day 3**: Phase 3 (Validation Updates)
- Sub-phase 3.1: Host registration validation
- Sub-phase 3.2: Pricing update validation

**Day 4**: Phase 4 (ABIs & Version)
- Sub-phase 4.1: Update ABIs
- Sub-phase 4.2: Bump version

**Day 5**: Phase 5 (Host CLI)
- Sub-phase 5.1: CLI defaults
- Sub-phase 5.2: CLI validation
- Sub-phase 5.3: CLI display

**Day 6**: Phase 6 (Test Harness)
- Sub-phase 6.1: NodeManagementClient
- Sub-phase 6.2: Test page defaults

**Day 7**: Phase 7 (Integration Testing)
- Sub-phase 7.1: SDK integration
- Sub-phase 7.2: CLI integration

## Files Summary

| File | Changes |
|------|---------|
| `packages/sdk-core/src/managers/HostManager.ts` | Add PRICE_PRECISION, update constants, update validation |
| `packages/sdk-core/src/managers/SessionManager.ts` | Update calculateCost() |
| `packages/sdk-core/src/contracts/SessionJobManager.ts` | Update actualCost calculation |
| `packages/sdk-core/src/index.ts` | Export PRICE_PRECISION |
| `packages/sdk-core/src/contracts/abis/*.json` | Copy from docs folder |
| `packages/sdk-core/package.json` | Version 1.5.0 |
| `packages/host-cli/src/commands/register.ts` | Default price, display |
| `packages/host-cli/src/commands/update-pricing.ts` | Validation range |
| `packages/host-cli/src/commands/info.ts` | Price display |
| `apps/harness/components/NodeManagementClient.tsx` | Formatters, defaults |
| `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx` | DEFAULT_PRICE_STABLE |
| `apps/harness/pages/chat-context-demo.tsx` | Cost display |

---

*Created: December 2025*
*Based on contract deployment with PRICE_PRECISION=1000*
*Node version: v8.4.22*
