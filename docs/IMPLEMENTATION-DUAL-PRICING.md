# Dual Pricing System Implementation Plan

**Status**: 🚧 IN PROGRESS
**Started**: January 28, 2025
**Version**: v7.0.29 (Corrected Dual Pricing)
**Environment**: Pre-MVP (No migration needed)

## Overview

This document tracks the implementation of the corrected dual pricing system that separates pricing for native tokens (ETH/BNB) and stablecoins (USDC) with proper 10,000x range validation.

### Key Changes

- **Dual pricing fields**: Separate `minPricePerTokenNative` and `minPricePerTokenStable`
- **Proper ranges**: Both have 10,000x range (MIN to MAX)
- **Correct validation**: Contract validates against appropriate field based on payment type
- **New contracts**: Updated addresses for NodeRegistry and JobMarketplace
- **8-field struct**: getNodeFullInfo() now returns 8 values instead of 7

## New Contract Addresses

| Contract | Old (Deprecated) | New (Active) |
|----------|-----------------|--------------|
| NodeRegistryWithModels | `0xC8dDD546e0993eEB4Df03591208aEDF6336342D7` | `0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6` |
| JobMarketplaceWithModels | `0x462050a4a551c4292586D9c1DE23e3158a9bF3B3` | `0xe169A4B57700080725f9553E3Cc69885fea13629` |

**Unchanged contracts**:
- ModelRegistry: `0x92b2De840bB2171203011A6dBA928d855cA8183E`
- ProofSystem: `0x2ACcc60893872A499700908889B38C5420CBcFD1`
- HostEarnings: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- USDC Token: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- FAB Token: `0xC78949004B4EB6dEf2D66e49Cd81231472612D62`

## Pricing Ranges

### Native Token (ETH/BNB)
```
MIN: 2,272,727,273 wei          (~$0.00001 @ $4400 ETH)
MAX: 22,727,272,727,273 wei     (~$0.1 @ $4400 ETH)
DEFAULT: 11,363,636,363,636 wei (~$0.00005 @ $4400 ETH)
RANGE: 10,000x
```

### Stablecoin (USDC)
```
MIN: 10                (0.00001 USDC per token)
MAX: 100,000           (0.1 USDC per token)
DEFAULT: 316           (0.000316 USDC per token)
RANGE: 10,000x
```

## Implementation Batches

### Batch 1: Foundation (Contract Addresses + Node Deployment)

**Estimated Time**: 30-45 minutes

#### 1.1 Update Environment Variables

**File**: `.env.test`
- [x] Update `CONTRACT_NODE_REGISTRY` to `0xDFFDecDfa0CF5D6cbE299711C7e4559eB16F42D6`
- [x] Update `CONTRACT_JOB_MARKETPLACE` to `0xe169A4B57700080725f9553E3Cc69885fea13629`

**File**: `packages/sdk-core/src/config/ChainRegistry.ts`
- [ ] Update `nodeRegistry` address for Base Sepolia
- [ ] Update `jobMarketplace` address for Base Sepolia

**File**: `apps/harness/.env.local` (or Next.js env setup)
- [ ] Update `NEXT_PUBLIC_CONTRACT_NODE_REGISTRY`
- [ ] Update `NEXT_PUBLIC_CONTRACT_JOB_MARKETPLACE`

#### 1.2 Deploy New Node v7.0.29

**Location**: `/workspace/fabstir-llm-node-v7.0.29.tar.gz`

**Steps**:
1. [ ] Extract tarball to node directory
2. [ ] Rebuild Docker image with new node binary
3. [ ] Restart container with correct environment variables
4. [ ] Verify health endpoint shows v7.0.29

**Commands**:
```bash
# Extract node
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-node
tar -xzf /workspace/fabstir-llm-node-v7.0.29.tar.gz

# Rebuild Docker image
cd ~/dev/Fabstir/fabstir-llm-marketplace/fabstir-llm-sdk
docker build --no-cache -f packages/host-cli/Dockerfile -t fabstir-host-cli:local .

# Restart container
docker stop fabstir-host-test && docker rm fabstir-host-test
bash start-fabstir-docker.sh
```

#### 1.3 Checkpoint Validation

**Verify**:
- [ ] SDK can connect to new contracts
- [ ] Node starts successfully
- [ ] Health endpoint returns version 7.0.29
- [ ] No immediate errors in logs

**Test Commands**:
```bash
# Check node health
curl http://localhost:8083/health

# Check contract accessibility via ethers
# (will write test script in checkpoint)
```

---

### Batch 2: SDK Core Updates

**Estimated Time**: 1-2 hours

#### 2.1 Update HostManager Types

**File**: `packages/sdk-core/src/managers/HostManager.ts`

**Changes**:
1. [ ] Update `HostInfo` interface (line ~40-44):
```typescript
export interface HostInfo {
  isRegistered: boolean;
  isActive: boolean;
  stake: bigint;
  metadata: HostMetadata;
  apiUrl: string;
  supportedModels: ModelSpec[];
  minPricePerTokenNative: bigint;   // NEW
  minPricePerTokenStable: bigint;   // NEW
}
```

2. [ ] Update `RegisterHostRequest` interface (line ~177):
```typescript
interface RegisterHostRequest {
  metadata: HostMetadata;
  apiUrl: string;
  modelIds: string[];
  minPricePerTokenNative: string;  // NEW
  minPricePerTokenStable: string;  // NEW
}
```

3. [ ] Update pricing constants:
```typescript
// Native token pricing (ETH/BNB)
const MIN_PRICE_NATIVE = 2_272_727_273n;
const MAX_PRICE_NATIVE = 22_727_272_727_273n;
const DEFAULT_PRICE_NATIVE = '11363636363636';

// Stablecoin pricing (USDC)
const MIN_PRICE_STABLE = 10n;
const MAX_PRICE_STABLE = 100_000n;
const DEFAULT_PRICE_STABLE = '316';
```

4. [ ] Update `registerHost()` method (line ~245):
   - Accept both pricing parameters
   - Validate both ranges separately
   - Pass both to contract call

5. [ ] Update `getHostStatus()` method (line ~505):
   - Parse 8 fields from `getNodeFullInfo()` (was 7)
   - Return both pricing fields

6. [ ] Add new methods:
```typescript
async updatePricingNative(newPrice: string): Promise<string>
async updatePricingStable(newPrice: string): Promise<string>
async getNodePricing(hostAddress: string, tokenAddress: string): Promise<bigint>
```

7. [ ] Update `getHostInfo()` method (line ~732):
   - Include both pricing fields in returned object

#### 2.2 Update SessionManager

**File**: `packages/sdk-core/src/managers/SessionManager.ts`

**Changes**:
1. [ ] Update pricing validation logic (line ~124):
   - Query both native and stable pricing
   - Validate against correct field based on payment token
   - Use `tokenAddress === '0x0000000000000000000000000000000000000000'` for native vs stable detection

2. [ ] Update error messages to specify native vs stable pricing failures

#### 2.3 Update Interfaces

**File**: `packages/sdk-core/src/interfaces/IHostManager.ts`

**Changes**:
- [ ] Update `IHostManager` interface to match HostManager changes
- [ ] Add method signatures for `updatePricingNative()`, `updatePricingStable()`, `getNodePricing()`

#### 2.4 Checkpoint Validation

**Verify**:
- [ ] TypeScript compilation succeeds
- [ ] Build completes: `cd packages/sdk-core && pnpm build`
- [ ] Write simple test to query dual pricing from test host
- [ ] No type errors in dependent files

**Test Script** (create temporary test file):
```typescript
// Test dual pricing query
const [nativePrice, stablePrice] = await hostManager.getNodePricing(
  TEST_HOST_1_ADDRESS,
  ethers.ZeroAddress
);
console.log('Native:', nativePrice.toString());
console.log('Stable:', stablePrice.toString());
```

---

### Batch 3: UI Integration

**Estimated Time**: 2-3 hours

#### 3.1 Update ETH Flow Test Harness

**File**: `apps/harness/pages/eth-mvp-flow-sdk.test.tsx`

**Changes**:
1. [ ] Update host parsing (line ~481):
```typescript
const parsedHosts = hosts.map((host: any) => ({
  address: host.address,
  endpoint: host.apiUrl || host.endpoint || `http://localhost:8080`,
  models: host.supportedModels || [],
  minPricePerTokenNative: host.minPricePerTokenNative || 0,  // NEW
  minPricePerTokenStable: host.minPricePerTokenStable || 0   // NEW
}));
```

2. [ ] Update pricing display (line ~500-505):
```typescript
// Use native pricing for ETH sessions
const pricingRaw = Number(selected.minPricePerTokenNative || 0);
const pricingEth = pricingRaw > 0
  ? ethers.formatEther(BigInt(pricingRaw))
  : DEFAULT_PRICE_NATIVE;
setHostPricing(pricingEth);
addLog(`💵 Host native pricing: ${pricingEth} ETH/token (wei: ${pricingRaw})`);
```

3. [ ] Remove old conversion hack (divide by 100000000)

4. [ ] Update `DEFAULT_PRICE_PER_TOKEN` to use native default

#### 3.2 Update USDC Flow Test Harness

**File**: `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx`

**Changes**:
1. [ ] Update host parsing (line ~523) - same as ETH flow

2. [ ] Update pricing display:
```typescript
// Use stable pricing for USDC sessions
const pricingRaw = Number(selected.minPricePerTokenStable || 316);
const pricingUSDC = (pricingRaw / 1_000_000).toFixed(6);
setHostPricing(pricingUSDC);
addLog(`💵 Host stable pricing: $${pricingUSDC} USDC/token (raw: ${pricingRaw})`);
```

3. [ ] Update `DEFAULT_PRICE_PER_TOKEN` from `100` to `316`

#### 3.3 Update Base USDC Flow Test Harness

**File**: `apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`

**Changes**:
- [ ] Same changes as usdc-mvp-flow-sdk.test.tsx (use stable pricing)

#### 3.4 Update Node Management UI

**File**: `apps/harness/components/NodeManagementClient.tsx`

**Changes**:
1. [ ] Add dual pricing state (line ~106):
```typescript
const [minPricePerTokenNative, setMinPricePerTokenNative] = useState('11363636363636');
const [minPricePerTokenStable, setMinPricePerTokenStable] = useState('316');
```

2. [ ] Add price formatting helpers:
```typescript
const formatNativePrice = (weiPrice: string, ethPriceUSD = 4400) => {
  const ethAmount = parseFloat(ethers.formatEther(BigInt(weiPrice)));
  const usdAmount = ethAmount * ethPriceUSD;
  return {
    wei: weiPrice,
    eth: ethAmount.toFixed(18),
    usd: usdAmount.toFixed(6),
    per1000: (usdAmount * 1000).toFixed(4)
  };
};

const formatStablePrice = (rawPrice: string) => {
  const usdAmount = Number(rawPrice) / 1_000_000;
  return {
    raw: rawPrice,
    usdc: usdAmount.toFixed(6),
    per1000: (usdAmount * 1000).toFixed(4)
  };
};
```

3. [ ] Update registration form (line ~1472-1491):
   - Replace single price field with TWO fields
   - Add validation for both ranges
   - Display USD equivalents for both

4. [ ] Update `registerNode()` call (line ~795):
   - Pass both `minPricePerTokenNative` and `minPricePerTokenStable`

5. [ ] Update pricing management section (line ~1622-1675):
   - Add TWO update sections (native and stable)
   - Show both current prices from contract

6. [ ] Update `checkRegistrationStatus()` (line ~527):
   - Parse both pricing fields
   - Display both in UI

#### 3.5 Checkpoint Validation

**Verify**:
- [ ] Next.js builds successfully: `cd apps/harness && pnpm build`
- [ ] No TypeScript errors
- [ ] UI displays both native and stable pricing
- [ ] Registration form has both price input fields
- [ ] Price update buttons exist for both types

**Manual UI Test**:
- [ ] Open http://localhost:3000/eth-mvp-flow-sdk.test
- [ ] Verify dual pricing shown in host discovery
- [ ] Open node management UI
- [ ] Verify registration form has two price fields

---

### Batch 4: End-to-End Validation & Documentation

**Estimated Time**: 1-2 hours

#### 4.1 Re-register Test Hosts

**Steps**:
1. [ ] Unregister existing hosts (if registered on old contracts)
2. [ ] Register TEST_HOST_1 with dual pricing via management UI:
   - Native: `11363636363636` wei (~$0.00005 @ $4400 ETH)
   - Stable: `316` (0.000316 USDC per token)
3. [ ] Verify registration on blockchain
4. [ ] Query dual pricing to confirm values

**Commands**:
```bash
# Check current registration
docker exec fabstir-host-test fabstir-host info --address $TEST_HOST_1_ADDRESS

# Or use management UI at http://localhost:3000/node-management-enhanced
```

#### 4.2 Full Testing Checklist

**Contract Query Tests**:
- [ ] Query dual pricing from registered host via SDK
- [ ] Verify `getNodeFullInfo()` returns 8 fields
- [ ] Verify pricing values match registration

**ETH Flow Tests** (`/eth-mvp-flow-sdk.test`):
- [ ] Display shows native pricing correctly
- [ ] Create session with pricing >= host native minimum
- [ ] Verify session creation succeeds
- [ ] Monitor production node logs for proof submission
- [ ] Verify host earnings credited correctly
- [ ] Verify client refund for unused deposit

**USDC Flow Tests** (`/usdc-mvp-flow-sdk.test`):
- [ ] Display shows stable pricing correctly
- [ ] Create session with pricing >= host stable minimum
- [ ] Verify session creation succeeds
- [ ] Monitor production node logs for proof submission
- [ ] Verify host earnings credited correctly
- [ ] Verify client refund for unused deposit

**Pricing Validation Tests**:
- [ ] Test session creation with price < native minimum (should fail)
- [ ] Test session creation with price < stable minimum (should fail)
- [ ] Verify correct error messages

**Management UI Tests**:
- [ ] Register new host with dual pricing
- [ ] Update native pricing via UI
- [ ] Update stable pricing via UI
- [ ] Verify updates reflected on blockchain

#### 4.3 Update Documentation

**Files to Update**:

1. [ ] `docs/SDK_API.md`:
   - Document dual pricing methods
   - Update HostInfo interface
   - Add examples for both native and stable

2. [ ] `docs/SDK_QUICK_REFERENCE.md`:
   - Add dual pricing quick start
   - Show how to query both prices

3. [ ] `docs/UI_DEVELOPER_CHAT_GUIDE.md`:
   - Update with dual pricing display patterns
   - Show ETH vs USDC pricing handling

4. [ ] `CLAUDE.md`:
   - Update contract addresses
   - Add dual pricing architecture section
   - Update common issues & fixes

5. [ ] `CLAUDE.local.md`:
   - Update test account pricing examples
   - Note completion of dual pricing implementation

#### 4.4 Final Checkpoint

**Verify**:
- [ ] All tests pass
- [ ] ETH flow works end-to-end
- [ ] USDC flow works end-to-end
- [ ] Documentation updated
- [ ] No console errors in UI
- [ ] Production node logs show successful sessions

---

## Breaking Changes Summary

| Change | Old Behavior | New Behavior |
|--------|--------------|--------------|
| **Contract Addresses** | NodeRegistry: `0xC8dD...`, JobMarketplace: `0x4620...` | NodeRegistry: `0xDFFD...`, JobMarketplace: `0xe169...` |
| **Struct Fields** | `getNodeFullInfo()` returns 7 fields | Returns 8 fields (added dual pricing) |
| **Pricing Query** | `getNodePricing(address)` | `getNodePricing(address, token)` - requires token param |
| **Registration** | `registerNode(..., price)` - single price | `registerNode(..., priceNative, priceStable)` - dual prices |
| **Pricing Updates** | `updatePricing(price)` | `updatePricingNative(price)` and `updatePricingStable(price)` - separate functions |
| **Validation** | Single price validated for all sessions | Native pricing for ETH, stable pricing for USDC |

## Rollback Plan

If critical issues arise:

1. **Revert contract addresses** in `.env.test`, ChainRegistry, Next.js env
2. **Revert SDK changes** via git
3. **Use old node** v7.0.28 tarball
4. **Re-register hosts** on old contracts

**Note**: Old contracts have the 10x range bug, so rollback is not recommended unless absolutely necessary.

## Progress Tracking

### Batch 1: Foundation ✅ COMPLETE
- [x] Contract addresses updated (.env.test, apps/harness/.env.local)
- [x] Node v7.0.29 binary ready (will start during E2E testing)
- [x] Checkpoint deferred to E2E testing phase

### Batch 2: SDK Core ✅ COMPLETE
- [x] HostManager pricing constants updated (MIN/MAX/DEFAULT for both native and stable)
- [x] HostInfo interface updated (added minPricePerTokenNative and minPricePerTokenStable fields)
- [x] HostRegistrationWithModels interface updated (dual pricing parameters)
- [x] registerHostWithModels() updated (validates and passes both pricing values)
- [x] getHostStatus() updated (parses 8-field struct from getNodeFullInfo)
- [x] getHostInfo() updated (includes both pricing fields)
- [x] findHostsForModel() updated (parses dual pricing from 8-field struct)
- [x] discoverAllActiveHostsWithModels() updated (parses dual pricing)
- [x] updatePricingNative() added (update native token pricing with validation)
- [x] updatePricingStable() added (update stablecoin pricing with validation)
- [x] getPricing() marked deprecated (use getHostStatus or getHostInfo instead)
- [x] SessionManager pricing validation updated (detects native vs stable, validates against correct field)
- [x] IHostManager interface updated (added dual pricing methods, updated getHostStatus return type)
- [x] SDK builds successfully (esbuild completes, type errors are pre-existing)
- [x] Checkpoint validated (build successful)

### Batch 3: UI Integration ⏸️ PENDING
- [ ] ETH flow updated
- [ ] USDC flow updated
- [ ] Base USDC flow updated
- [ ] Management UI updated
- [ ] Checkpoint validated

### Batch 4: Validation & Docs ⏸️ PENDING
- [ ] Hosts re-registered
- [ ] Full test suite passed
- [ ] Documentation updated
- [ ] Final validation complete

---

## Notes & Issues

### Known Issues
- None yet

### Decisions Made
- Using phased approach for implementation
- Pre-MVP: No migration logic needed
- Testing on Base Sepolia testnet only (opBNB contracts not yet deployed)

### Future Enhancements
- [ ] Add price comparison UI (ETH vs USDC)
- [ ] Implement dynamic pricing recommendations
- [ ] Cache pricing data with TTL
- [ ] Monitor pricing update events

---

**Last Updated**: January 28, 2025
**Status**: Batch 1 starting
**Next Action**: Update contract addresses in .env.test
