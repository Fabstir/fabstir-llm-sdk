# Marketplace Pricing Implementation Plan (v1.0)

> Complete implementation plan for adding host-controlled pricing to Fabstir LLM Marketplace
>
> **Status**: 🚧 IN PROGRESS (5/17 sub-phases complete) | **Target**: Multi-chain marketplace with dynamic pricing | **Progress**: Phase 1 ✅ Complete, Phase 2 (1/4) ⏳

## Overview

Transform the Fabstir LLM platform from a fixed-price protocol into a true marketplace where hosts control their pricing and market forces determine competitive rates. This includes contract upgrades, SDK enhancements, CLI tools, and UI updates.

**Current Problem**: Clients can create sessions with any price, ignoring host's advertised rates. Hosts must either accept unprofitable sessions or refuse service (harming reputation). This is an "honor system," not a marketplace.

**Solution**: Enforce host-set minimum pricing at the contract level, provide price discovery tools, and optimize proof intervals for production.

## Prerequisites

Before starting implementation, ensure:

✅ Current contracts deployed and working (JobMarketplaceWithModels, NodeRegistryWithModels)
✅ SDK Core tested with multi-chain support (Base Sepolia, opBNB testnet)
✅ Host CLI registration/unregistration working
✅ Browser UI node management operational
✅ Contract developer available for smart contract changes
✅ Test accounts funded with FAB and USDC

## Business Requirements

### Current State (Pre-MVP)
- **Default price**: 2000 (0.002 USDC per token) hardcoded
- **Proof interval**: 100 tokens (too frequent, high gas costs)
- **Client control**: Clients set price during session creation
- **Host input**: Hosts can advertise price in metadata (ignored by contract)
- **Problem**: No enforcement = not a marketplace

### Target State (MVP)
- **Host control**: Hosts set minimum price per token
- **Contract enforcement**: Sessions rejected if price < host minimum
- **Optimized intervals**: 1000+ token proof intervals for production
- **Price discovery**: Clients can filter/sort hosts by price
- **Market dynamics**: Supply/demand determines actual pricing

### Post-MVP Features (Future)
- Dynamic pricing (time-of-day, volume discounts)
- Reputation-based pricing tiers
- Price history & trend analytics
- Automated price recommendations
- Model-specific pricing strategies

## Architecture

### Smart Contract Changes

```solidity
// NodeRegistryWithModels - Add pricing field
struct Node {
    address operator;
    uint256 stakedAmount;
    bool active;
    string metadata;
    string apiUrl;
    bytes32[] supportedModels;
    uint256 minPricePerToken;  // NEW: Minimum acceptable price
}

// New functions
function registerNode(
    string memory metadata,
    string memory apiUrl,
    bytes32[] memory modelIds,
    uint256 minPricePerToken  // NEW
) external;

function updatePricing(uint256 newMinPrice) external;

// JobMarketplaceWithModels - Add price validation
function createSessionFromDeposit(
    address host,
    address token,
    uint256 deposit,
    uint256 pricePerToken,  // Must meet host minimum!
    uint256 duration,
    uint256 proofInterval
) external returns (uint256) {
    Node memory node = nodeRegistry.nodes(host);
    require(pricePerToken >= node.minPricePerToken, "Price below host minimum");
    // ... rest of function
}
```

### SDK Architecture Changes

```typescript
// Enhanced HostInfo with pricing
export interface HostInfo {
  address: string;
  apiUrl: string;
  isActive: boolean;
  supportedModels: string[];
  minPricePerToken: bigint;  // NEW: Required minimum
  advertisedPrice?: bigint;   // NEW: Recommended price (optional)
  reputation?: number;
  metadata?: string;
}

// Price-aware host discovery
interface HostDiscoveryOptions {
  modelId?: string;
  maxPricePerToken?: bigint;  // NEW: Filter by price
  sortBy?: 'price' | 'reputation' | 'random';  // NEW
  region?: string;
}

// Host manager pricing methods
interface IHostManager {
  registerHost(
    stake: string,
    apiUrl: string,
    models: string[],
    minPricePerToken: string  // NEW: Required
  ): Promise<string>;

  updatePricing(newMinPrice: string): Promise<string>;  // NEW
  getPricing(hostAddress: string): Promise<bigint>;  // NEW
}
```

## Security Model

**Pricing Validation**:
- Contract-level enforcement prevents price manipulation
- Hosts cannot set prices below reasonable minimums (prevents race-to-bottom)
- Clients cannot create sessions below host minimums (prevents exploitation)

**Economic Safeguards**:
- Platform default: 2000 (0.002 USDC/token) as reasonable baseline
- Minimum price floor: 100 (0.0001 USDC/token) to prevent spam
- Maximum price cap: 100000 (0.1 USDC/token) to prevent gouging (MVP only, remove post-MVP)

**Migration Safety**:
- Existing hosts auto-migrate to default price (2000)
- No breaking changes to existing sessions
- Backward compatibility maintained for SDK v1.x clients

## Contract Developer Handoff

**What needs to change** (provide to contract developer):

### NodeRegistryWithModels.sol

1. **Add minPricePerToken field to Node struct** (line ~30):
```solidity
struct Node {
    address operator;
    uint256 stakedAmount;
    bool active;
    string metadata;
    string apiUrl;
    bytes32[] supportedModels;
    uint256 minPricePerToken;  // NEW: ADD THIS
}
```

2. **Update registerNode function** (line ~80):
```solidity
function registerNode(
    string memory metadata,
    string memory apiUrl,
    bytes32[] memory modelIds,
    uint256 minPricePerToken  // NEW: ADD THIS PARAMETER
) external nonReentrant {
    require(minPricePerToken >= 100, "Price too low");  // Minimum 100 (0.0001 USDC/token)
    require(minPricePerToken <= 100000, "Price too high");  // Maximum 100000 (0.1 USDC/token) for MVP

    // ... existing validation ...

    nodes[msg.sender] = Node({
        operator: msg.sender,
        stakedAmount: MIN_STAKE,
        active: true,
        metadata: metadata,
        apiUrl: apiUrl,
        supportedModels: new bytes32[](0),  // Will be set below
        minPricePerToken: minPricePerToken  // NEW: SET THIS
    });

    // ... rest of function ...
}
```

3. **Add updatePricing function** (new, ~120):
```solidity
function updatePricing(uint256 newMinPrice) external {
    require(nodes[msg.sender].operator != address(0), "Not registered");
    require(nodes[msg.sender].active, "Not active");
    require(newMinPrice >= 100, "Price too low");
    require(newMinPrice <= 100000, "Price too high");

    nodes[msg.sender].minPricePerToken = newMinPrice;

    emit PricingUpdated(msg.sender, newMinPrice);
}

event PricingUpdated(address indexed operator, uint256 newMinPrice);
```

4. **Add getNodePricing view function** (new, ~130):
```solidity
function getNodePricing(address operator) external view returns (uint256) {
    return nodes[operator].minPricePerToken;
}
```

### JobMarketplaceWithModels.sol

5. **Add price validation to createSessionFromDeposit** (line ~180):
```solidity
function createSessionFromDeposit(
    address host,
    address token,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 duration,
    uint256 proofInterval
) external returns (uint256) {
    // NEW: Add price validation BEFORE any other logic
    Node memory node = nodeRegistry.nodes(host);
    require(pricePerToken >= node.minPricePerToken, "Price below host minimum");

    // ... rest of existing function unchanged ...
}
```

6. **Add price validation to createSessionJob** (line ~250):
```solidity
function createSessionJob(
    address host,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId) {
    // NEW: Add price validation BEFORE any other logic
    Node memory node = nodeRegistry.nodes(host);
    require(pricePerToken >= node.minPricePerToken, "Price below host minimum");

    // ... rest of existing function unchanged ...
}
```

**Migration for existing nodes**:
```solidity
// Add migration function (temporary, remove after all nodes migrated)
function migrateNodePricing(address[] calldata nodeAddresses) external onlyOwner {
    for (uint i = 0; i < nodeAddresses.length; i++) {
        if (nodes[nodeAddresses[i]].operator != address(0) &&
            nodes[nodeAddresses[i]].minPricePerToken == 0) {
            nodes[nodeAddresses[i]].minPricePerToken = 2000;  // Default to current standard
        }
    }
}
```

**After deployment**: Provide updated contract addresses and ABIs:
- Updated `NodeRegistryWithModels` address
- Updated `JobMarketplaceWithModels` address (if changed)
- Updated ABIs for both contracts
- Block number of deployment (for event indexing)

## Implementation Status

✅ **Phase 1: Contract Preparation** (4/4 sub-phases complete) - COMPLETE (Jan 28 - Oct 8, 2025)
🚧 **Phase 2: SDK Core Updates** (1/4 sub-phases complete)
⏳ **Phase 3: Host CLI Updates** (0/3 sub-phases complete)
⏳ **Phase 4: Browser UI Updates** (0/3 sub-phases complete)
⏳ **Phase 5: Client Integration** (0/2 sub-phases complete)
⏳ **Phase 6: Testing & Migration** (0/1 sub-phase complete)

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST for all code changes
2. **Bounded Autonomy**: Each sub-phase has strict scope and line limits
3. **Contract-First**: Wait for contract deployment before implementing SDK
4. **Backward Compatibility**: Existing sessions continue to work
5. **Default Pricing**: Provide sensible defaults (2000 = 0.002 USDC/token)
6. **Price Discovery**: Enable clients to find best prices
7. **Proof Optimization**: Move from 100 to 1000+ token intervals

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must exist and FAIL before writing implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Real Contract Testing**: Integration tests use actual deployed contracts

---

## Phase 1: Contract Preparation ✅ COMPLETE

**Dependencies**: Contract developer availability
**Estimated Time**: 4-6 hours (contract dev) + 2 hours (verification)
**Goal**: Deploy updated contracts with pricing enforcement
**Completed**: Jan 28 - Oct 8, 2025

### Sub-phase 1.1: Contract Specification & Review ✅

**Goal**: Provide contract developer with complete specifications and verify understanding

**Status**: ✅ Complete (Jan 28, 2025)

**Tasks**:
- [x] Review "Contract Developer Handoff" section above with contract developer
- [x] Contract developer confirms understanding of changes
- [x] Contract developer provides ETA for deployment
- [x] Agree on testnet deployment strategy (Base Sepolia first)
- [x] Document expected ABI changes (documented in NodeRegistry.md, JobMarketplace.md, DEPLOYMENT_INFO.json)

**Deliverables**:
- [x] Contract developer confirmation received (contracts deployed)
- [x] Expected deployment timeline documented (Jan 28, 2025)
- [x] ABI change documentation created (DEPLOYMENT_INFO.json features & migrationNotes)
- [x] Migration strategy for existing hosts agreed (hosts must re-register with pricing)

**Acceptance Criteria**:
- [x] Contract developer has clear spec
- [x] Timeline agreed upon
- [x] All questions answered
- [x] Risk assessment complete

---

### Sub-phase 1.2: Contract Deployment & Verification ✅

**Goal**: Contract developer deploys updated contracts to Base Sepolia testnet

**Status**: ✅ Complete (Jan 28, 2025)

**Tasks**:
- [x] Contract developer deploys updated `NodeRegistryWithModels` (0xC8dDD546e0993eEB4Df03591208aEDF6336342D7)
- [x] Contract developer deploys updated `JobMarketplaceWithModels` (0x462050a4a551c4292586D9c1DE23e3158a9bF3B3)
- [x] Contract developer verifies contracts on BaseScan
- [x] Contract developer runs migration for existing test hosts (hosts unregistered - must re-register with pricing)
- [x] Contract developer provides deployment info:
  - [x] New NodeRegistry address (0xC8dDD546e0993eEB4Df03591208aEDF6336342D7)
  - [x] New JobMarketplace address (0x462050a4a551c4292586D9c1DE23e3158a9bF3B3)
  - [x] Deployment block numbers (32051950, 32051983)
  - [x] Updated ABIs (in client-abis folder)
  - [x] Gas costs for new functions (in DEPLOYMENT_INFO.json)
- [x] Receive and verify deployment information (DEPLOYMENT_INFO.json)

**Deliverables from Contract Developer**:
```json
{
  "network": "Base Sepolia",
  "chainId": 84532,
  "contracts": {
    "NodeRegistryWithModels": {
      "address": "0x...",
      "deploymentBlock": 12345678,
      "abi": "..."
    },
    "JobMarketplaceWithModels": {
      "address": "0x...",
      "deploymentBlock": 12345678,
      "abi": "..."
    }
  },
  "gasCosts": {
    "registerNode": "~250000",
    "updatePricing": "~50000"
  }
}
```

**Acceptance Criteria**:
- [x] Contracts deployed to Base Sepolia
- [x] Verified on BaseScan
- [x] Existing test hosts migrated (unregistered - must re-register with pricing)
- [x] ABIs match specification
- [x] No compilation errors or warnings

---

### Sub-phase 1.3: Contract ABI Integration ✅

**Goal**: Update local ABI files with new contract interfaces

**Status**: ✅ Complete (Oct 8, 2025)

**Tasks**:
- [x] Backup old ABIs to `archive/` folder
- [x] Update `packages/sdk-core/src/contracts/abis/NodeRegistryWithModels-CLIENT-ABI.json` with new ABI
- [x] Update `packages/sdk-core/src/contracts/abis/JobMarketplaceWithModels-CLIENT-ABI.json`
- [x] Update `docs/compute-contracts-reference/client-abis/NodeRegistryWithModels-CLIENT-ABI.json` (Oct 7)
- [x] Update `docs/compute-contracts-reference/client-abis/JobMarketplaceWithModels-CLIENT-ABI.json` (Oct 7)
- [x] Update `.env.test` with new contract addresses:
  ```bash
  CONTRACT_NODE_REGISTRY=0xC8dDD546e0993eEB4Df03591208aEDF6336342D7
  CONTRACT_JOB_MARKETPLACE=0x462050a4a551c4292586D9c1DE23e3158a9bF3B3
  ```
- [x] Changelog documented in `DEPLOYMENT_INFO.json` (features, migrationNotes, breakingChanges):
  - [x] New functions: getNodePricing(), updatePricing(), MIN_PRICE_PER_TOKEN, MAX_PRICE_PER_TOKEN
  - [x] Modified registerNode() signature (now includes minPricePerToken parameter)
  - [x] New events: PricingUpdated
  - [x] Migration notes: hosts must re-register with pricing parameter

**Implementation Requirements**:
- [x] All ABIs in sync (sdk-core and docs)
- [x] Old ABIs preserved in archive/
- [x] Changelog complete (DEPLOYMENT_INFO.json)
- [x] .env.test updated

**Acceptance Criteria**:
- [x] ABIs match deployed contracts (verified: getNodePricing, updatePricing, PricingUpdated event present)
- [x] No TypeScript compilation errors
- [x] All ABI locations updated
- [x] Changelog complete

---

### Sub-phase 1.4: Contract Verification Tests ✅

**Goal**: Write tests verifying new contract functions work as expected

**Status**: ✅ Complete (Oct 8, 2025)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/contracts/pricing-validation.test.ts` (150 lines max)
  - [x] Test: registerNode with minPricePerToken succeeds
  - [x] Test: registerNode rejects price < 100
  - [x] Test: registerNode rejects price > 100000
  - [x] Test: updatePricing changes host minimum
  - [x] Test: getNodePricing returns correct value
  - [x] Test: createSessionFromDeposit rejects price below minimum
  - [x] Test: createSessionFromDeposit succeeds with price >= minimum
  - [x] Test: PricingUpdated event emission
- [x] Test file created with real contract integration
- [x] Tests ready to run against deployed contracts (requires funded test accounts)
- [x] Test structure follows TDD pattern

**Test Requirements**:
```typescript
describe('Contract Pricing Validation', () => {
  describe('registerNode with pricing', () => {
    test('should register node with valid minPricePerToken');
    test('should reject price below minimum (100)');
    test('should reject price above maximum (100000)');
  });

  describe('updatePricing', () => {
    test('should update host minimum price');
    test('should reject price below 100');
    test('should reject price above 100000');
    test('should reject if not registered');
  });

  describe('createSession price validation', () => {
    test('should reject session with price below host minimum');
    test('should accept session with price >= host minimum');
  });
});
```

**Acceptance Criteria**:
- [x] All tests written and ready to run against real contracts
- [x] Price validation test structure follows specification
- [x] Migration strategy documented (hosts must re-register)
- [x] Tests use environment variables for contract addresses and credentials

---

## Phase 2: SDK Core Updates

**Dependencies**: Phase 1 complete (contracts deployed)
**Estimated Time**: 8-10 hours
**Goal**: Update SDK to support host pricing and price discovery

### Sub-phase 2.1: HostInfo Type Updates ✅

**Goal**: Update type definitions to include pricing fields

**Status**: ✅ Complete (Oct 8, 2025)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/types/pricing.test.ts` (117 lines - within 150 limit)
  - [x] Test: HostInfo includes minPricePerToken
  - [x] Test: HostInfo includes optional advertisedPrice
  - [x] Test: Price values are bigint type
  - [x] Test: HostRegistrationWithModels includes minPricePerToken parameter
- [x] Update `packages/sdk-core/src/types/models.ts` (+2 lines)
  - [x] Add minPricePerToken: bigint to HostInfo interface
  - [x] Add advertisedPrice?: bigint to HostInfo interface
- [x] Update `packages/sdk-core/src/managers/HostManager.ts` (+5 lines)
  - [x] Add minPricePerToken: string to HostRegistrationWithModels interface
- [x] Update `packages/sdk-core/src/interfaces/IHostManager.ts` (+14 lines)
  - [x] Add updatePricing() method signature
  - [x] Add getPricing() method signature
- [x] Verify all tests pass (4/4 ✅)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/types/models.ts
export interface HostInfo {
  address: string;
  apiUrl: string;
  isActive: boolean;
  stakedAmount?: bigint;
  supportedModels: string[];
  minPricePerToken: bigint;        // NEW: Required minimum
  advertisedPrice?: bigint;         // NEW: Optional recommended price
  reputation?: number;
  region?: string;
  metadata?: string;
}

export interface HostRegistrationParams {
  stake: string;
  apiUrl: string;
  models: string[];
  minPricePerToken: string;         // NEW: Required
  metadata?: string;
}
```

**Acceptance Criteria**:
- [x] Types compile without errors (pre-existing ethers.js errors unrelated to pricing changes)
- [x] All 4 tests pass (HostInfo fields, bigint types, HostRegistrationWithModels)
- [x] Breaking change documented: HostInfo now requires minPricePerToken, HostRegistrationWithModels requires minPricePerToken parameter
- [x] JSDoc comments added to new interface methods and type fields

---

### Sub-phase 2.2: HostManager Pricing Methods ⏳

**Goal**: Implement pricing methods in HostManager

**Status**: ⏳ Not started (waiting on 2.1)

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/host-pricing.test.ts` (200 lines max)
  - [ ] Test: registerHost with pricing succeeds
  - [ ] Test: registerHost validates price range
  - [ ] Test: updatePricing changes host minimum
  - [ ] Test: updatePricing requires host to be registered
  - [ ] Test: getPricing returns correct value
  - [ ] Test: getPricing handles unregistered hosts
- [ ] Update `packages/sdk-core/src/managers/HostManager.ts` (+150 lines max)
  - [ ] Update registerHost() to accept minPricePerToken parameter
  - [ ] Add client-side validation (100 <= price <= 100000)
  - [ ] Implement updatePricing() method
  - [ ] Implement getPricing() method
  - [ ] Update getHostInfo() to include pricing from contract
- [ ] Verify all tests pass (6/6 ✅)
- [ ] Verify acceptance criteria met

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/HostManager.ts
export class HostManager implements IHostManager {

  async registerHost(
    stake: string,
    apiUrl: string,
    models: string[],
    minPricePerToken: string,  // NEW
    metadata?: string
  ): Promise<string> {
    // Validate price range
    const price = BigInt(minPricePerToken);
    if (price < 100n || price > 100000n) {
      throw new Error(`Price must be between 100 and 100000, got ${price}`);
    }

    // Call contract with new parameter
    const tx = await this.nodeRegistry.registerNode(
      metadata || '',
      apiUrl,
      modelHashes,
      price  // NEW
    );
    await tx.wait();
    return tx.hash;
  }

  async updatePricing(newMinPrice: string): Promise<string> {
    const price = BigInt(newMinPrice);
    if (price < 100n || price > 100000n) {
      throw new Error(`Price must be between 100 and 100000`);
    }

    const tx = await this.nodeRegistry.updatePricing(price);
    await tx.wait();
    return tx.hash;
  }

  async getPricing(hostAddress: string): Promise<bigint> {
    return await this.nodeRegistry.getNodePricing(hostAddress);
  }

  // Update existing method
  async getHostInfo(address: string): Promise<HostInfo> {
    const node = await this.nodeRegistry.nodes(address);
    const pricing = await this.nodeRegistry.getNodePricing(address);  // NEW

    return {
      address,
      apiUrl: node.apiUrl,
      isActive: node.active,
      stakedAmount: node.stakedAmount,
      supportedModels: node.supportedModels,
      minPricePerToken: pricing,  // NEW
      // ... rest of fields
    };
  }
}
```

**Acceptance Criteria**:
- [ ] registerHost includes pricing parameter
- [ ] updatePricing method works
- [ ] getPricing returns accurate values
- [ ] Price validation prevents invalid values
- [ ] All tests pass

---

### Sub-phase 2.3: HostDiscovery Price Filtering ⏳

**Goal**: Add price filtering and sorting to host discovery

**Status**: ⏳ Not started (waiting on 2.2)

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/services/host-discovery-pricing.test.ts` (180 lines max)
  - [ ] Test: findHosts filters by maxPricePerToken
  - [ ] Test: findHosts sorts by price (ascending)
  - [ ] Test: findHosts sorts by reputation
  - [ ] Test: findHosts handles missing pricing gracefully
  - [ ] Test: discoverAllActiveHosts includes pricing
- [ ] Update `packages/sdk-core/src/services/HostDiscoveryService.ts` (+120 lines max)
  - [ ] Add maxPricePerToken to HostDiscoveryOptions
  - [ ] Add sortBy: 'price' | 'reputation' | 'random' to options
  - [ ] Implement price filtering in findHosts()
  - [ ] Implement sorting logic
  - [ ] Update host info parsing to include minPricePerToken from contract
- [ ] Verify all tests pass (5/5 ✅)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/services/HostDiscoveryService.ts
export interface HostDiscoveryOptions {
  modelId?: string;
  region?: string;
  maxPricePerToken?: bigint;  // NEW: Filter by price
  sortBy?: 'price' | 'reputation' | 'random';  // NEW
}

export class HostDiscoveryService {
  async findHosts(options: HostDiscoveryOptions = {}): Promise<HostInfo[]> {
    let hosts = await this.discoverAllActiveHosts();

    // Filter by model (existing)
    if (options.modelId) {
      hosts = hosts.filter(h => h.supportedModels.includes(options.modelId!));
    }

    // NEW: Filter by max price
    if (options.maxPricePerToken) {
      hosts = hosts.filter(h => h.minPricePerToken <= options.maxPricePerToken!);
    }

    // NEW: Sort hosts
    if (options.sortBy === 'price') {
      hosts.sort((a, b) => Number(a.minPricePerToken - b.minPricePerToken));
    } else if (options.sortBy === 'reputation') {
      hosts.sort((a, b) => (b.reputation || 0) - (a.reputation || 0));
    } else if (options.sortBy === 'random') {
      hosts = this.shuffleArray(hosts);
    }

    return hosts;
  }

  private shuffleArray<T>(array: T[]): T[] {
    // Fisher-Yates shuffle
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}
```

**Acceptance Criteria**:
- [ ] Price filtering works correctly
- [ ] Sorting by price works (lowest first)
- [ ] Sorting by reputation works (highest first)
- [ ] Random sorting shuffles array
- [ ] All tests pass

---

### Sub-phase 2.4: SessionManager Price Validation ⏳

**Goal**: Update SessionManager to validate prices against host minimums

**Status**: ⏳ Not started (waiting on 2.3)

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/session-pricing.test.ts` (150 lines max)
  - [ ] Test: startSession validates price >= host minimum
  - [ ] Test: startSession throws error if price too low
  - [ ] Test: startSession uses host minimum if no price provided
  - [ ] Test: createSession validates price on-chain
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (+80 lines max)
  - [ ] Add price validation before session creation
  - [ ] Fetch host minimum price from HostManager
  - [ ] Default to host minimum if client doesn't specify price
  - [ ] Add helpful error messages for price violations
- [ ] Update `packages/sdk-core/src/interfaces/ISessionManager.ts` (+10 lines)
  - [ ] Update startSession signature to make pricePerToken optional
  - [ ] Add JSDoc explaining pricing behavior
- [ ] Verify all tests pass (4/4 ✅)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/SessionManager.ts
export class SessionManager implements ISessionManager {

  async startSession(params: {
    hostUrl: string;
    hostAddress: string;
    jobId: bigint;
    modelName: string;
    chainId: number;
    pricePerToken?: number;  // NEW: Optional (defaults to host minimum)
  }): Promise<StartSessionResult> {

    // NEW: Fetch host minimum price
    const hostInfo = await this.hostManager.getHostInfo(params.hostAddress);
    const minPrice = Number(hostInfo.minPricePerToken);

    // NEW: Validate or default price
    const clientPrice = params.pricePerToken || minPrice;
    if (clientPrice < minPrice) {
      throw new Error(
        `Price ${clientPrice} is below host minimum ${minPrice}. ` +
        `Host requires at least ${minPrice} per token.`
      );
    }

    // Use validated price for session
    const wsClient = await this.connectToHost(params.hostUrl, {
      ...params,
      pricePerToken: clientPrice
    });

    return wsClient;
  }
}
```

**Acceptance Criteria**:
- [ ] Price validation works before connection
- [ ] Defaults to host minimum if not specified
- [ ] Clear error messages for violations
- [ ] No breaking changes to existing flows
- [ ] All tests pass

---

## Phase 3: Host CLI Updates

**Dependencies**: Phase 2 complete (SDK updated)
**Estimated Time**: 6-8 hours
**Goal**: Update CLI commands to support pricing management

### Sub-phase 3.1: Register Command Pricing Parameter ⏳

**Goal**: Add pricing parameter to register command

**Status**: ⏳ Not started (waiting on Phase 2)

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/commands/register-pricing.test.ts` (120 lines max)
  - [ ] Test: register with --price flag succeeds
  - [ ] Test: register without --price uses default (2000)
  - [ ] Test: register validates price range
  - [ ] Test: register shows pricing in output
- [ ] Update `packages/host-cli/src/commands/register.ts` (+60 lines max)
  - [ ] Add --price option to command
  - [ ] Add validation for price range
  - [ ] Pass minPricePerToken to SDK registerHost()
  - [ ] Update success message to show pricing
  - [ ] Add --price to help text and examples
- [ ] Update `packages/host-cli/docs/COMMANDS.md` (+30 lines)
  - [ ] Document --price parameter
  - [ ] Add pricing examples
  - [ ] Explain default behavior
- [ ] Verify all tests pass (4/4 ✅)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/commands/register.ts
program
  .command('register')
  .description('Register as a host node')
  .requiredOption('--url <url>', 'Public API URL')
  .requiredOption('--models <models>', 'Supported model IDs (comma-separated)')
  .requiredOption('--stake <amount>', 'FAB tokens to stake')
  .option('--price <amount>', 'Minimum price per token (default: 2000 = 0.002 USDC)', '2000')  // NEW
  .option('--metadata <json>', 'Additional metadata (JSON)')
  .action(async (options) => {
    const minPrice = options.price;

    // Validate price
    const priceNum = parseInt(minPrice);
    if (priceNum < 100 || priceNum > 100000) {
      console.error('Price must be between 100 and 100000');
      process.exit(1);
    }

    // Call SDK with pricing
    const txHash = await hostManager.registerHost(
      options.stake,
      options.url,
      models,
      minPrice,  // NEW
      options.metadata
    );

    console.log(`Minimum price: ${minPrice} (${(priceNum/1000000).toFixed(6)} USDC/token)`);
  });
```

**Example usage**:
```bash
# Register with default price (2000 = 0.002 USDC/token)
fabstir-host register --url http://... --models "..." --stake 1000

# Register with custom price
fabstir-host register --url http://... --models "..." --stake 1000 --price 3000

# Register with low price (budget host)
fabstir-host register --url http://... --models "..." --stake 1000 --price 1000
```

**Acceptance Criteria**:
- [ ] --price flag works
- [ ] Defaults to 2000 if not specified
- [ ] Validation prevents invalid prices
- [ ] Output shows pricing
- [ ] Documentation updated

---

### Sub-phase 3.2: Update-Pricing Command ⏳

**Goal**: Create new command for updating host pricing

**Status**: ⏳ Not started (waiting on 3.1)

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/commands/update-pricing.test.ts` (130 lines max)
  - [ ] Test: update-pricing changes minimum price
  - [ ] Test: update-pricing validates price range
  - [ ] Test: update-pricing requires host to be registered
  - [ ] Test: update-pricing shows confirmation
- [ ] Create `packages/host-cli/src/commands/update-pricing.ts` (100 lines max)
  - [ ] Define command with --price parameter
  - [ ] Add validation
  - [ ] Call SDK updatePricing()
  - [ ] Show before/after pricing
  - [ ] Add confirmation prompt
- [ ] Update `packages/host-cli/src/index.ts` (+5 lines)
  - [ ] Import and register update-pricing command
- [ ] Update `packages/host-cli/docs/COMMANDS.md` (+50 lines)
  - [ ] Document update-pricing command
  - [ ] Add examples and use cases
- [ ] Verify all tests pass (4/4 ✅)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/commands/update-pricing.ts
import { Command } from 'commander';
import { getWallet } from '../utils/wallet';
import { initializeHostManager } from '../utils/sdk';

export function registerUpdatePricingCommand(program: Command): void {
  program
    .command('update-pricing')
    .description('Update minimum price per token')
    .requiredOption('--price <amount>', 'New minimum price per token')
    .option('-k, --private-key <key>', 'Private key')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options) => {
      const newPrice = parseInt(options.price);

      // Validate
      if (newPrice < 100 || newPrice > 100000) {
        console.error('Price must be between 100 and 100000');
        process.exit(1);
      }

      // Get current price
      const wallet = await getWallet(options.privateKey);
      const hostManager = await initializeHostManager(wallet);
      const currentPrice = await hostManager.getPricing(wallet.address);

      // Show change
      console.log(`Current price: ${currentPrice} (${Number(currentPrice)/1000000} USDC/token)`);
      console.log(`New price: ${newPrice} (${newPrice/1000000} USDC/token)`);

      // Confirm
      if (!options.yes) {
        const confirm = await inquirer.prompt([{
          type: 'confirm',
          name: 'proceed',
          message: 'Update pricing on-chain?',
          default: false
        }]);
        if (!confirm.proceed) {
          console.log('Cancelled');
          return;
        }
      }

      // Update
      const txHash = await hostManager.updatePricing(newPrice.toString());
      console.log(`✅ Pricing updated!`);
      console.log(`Transaction: ${txHash}`);
    });
}
```

**Example usage**:
```bash
# Update to higher price (premium service)
fabstir-host update-pricing --price 5000

# Update to lower price (competitive pricing)
fabstir-host update-pricing --price 1500 --yes
```

**Acceptance Criteria**:
- [ ] Command updates pricing on-chain
- [ ] Shows before/after comparison
- [ ] Requires confirmation (unless --yes)
- [ ] Transaction succeeds
- [ ] Tests pass

---

### Sub-phase 3.3: Info Command Pricing Display ⏳

**Goal**: Update info command to display pricing information

**Status**: ⏳ Not started (waiting on 3.2)

**Tasks**:
- [ ] Write tests in `packages/host-cli/tests/commands/info-pricing.test.ts` (100 lines max)
  - [ ] Test: info displays minimum price
  - [ ] Test: info shows price in USDC/token format
  - [ ] Test: info handles hosts without pricing (migration case)
- [ ] Update `packages/host-cli/src/commands/info.ts` (+40 lines max)
  - [ ] Fetch pricing from HostManager
  - [ ] Display in both raw and USDC format
  - [ ] Add pricing section to output
- [ ] Verify all tests pass (3/3 ✅)

**Implementation Requirements**:
```typescript
// packages/host-cli/src/commands/info.ts (additions)
const pricing = await hostManager.getPricing(hostAddress);

console.log('\nPricing:');
console.log(`  Minimum per token: ${pricing} (${Number(pricing)/1000000} USDC/token)`);
console.log(`  Per 1000 tokens: ${Number(pricing)/1000} USDC`);
console.log(`  Example session cost: ${(Number(pricing) * 10000)/1000000} USDC (10,000 tokens)`);
```

**Example output**:
```
Host Information
================

Address: 0x4594F755F593B517Bb3194F4DeC20C48a3f04504
Status: Active
API URL: http://localhost:8083
Staked: 1000 FAB

Pricing:
  Minimum per token: 2000 (0.002 USDC/token)
  Per 1000 tokens: 2 USDC
  Example session cost: 20 USDC (10,000 tokens)

Supported Models:
  - CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
```

**Acceptance Criteria**:
- [ ] Pricing displayed in info output
- [ ] Shows both raw value and USDC format
- [ ] Handles missing pricing gracefully
- [ ] Tests pass

---

## Phase 4: Browser UI Updates

**Dependencies**: Phase 2 complete (SDK), Phase 3 optional (CLI can be updated in parallel)
**Estimated Time**: 6-8 hours
**Goal**: Update browser UI to support pricing management

### Sub-phase 4.1: Node Registration Pricing UI ⏳

**Goal**: Add pricing input to node registration form

**Status**: ⏳ Not started (waiting on Phase 2)

**Tasks**:
- [ ] Update `apps/harness/components/NodeManagementClient.tsx` (+100 lines max)
  - [ ] Add pricing input field to registration form (default: 2000)
  - [ ] Add price validation (100-100000)
  - [ ] Show price in USDC format as user types
  - [ ] Pass pricing to registration API
  - [ ] Display pricing in success message
- [ ] Add price calculator helper:
  - [ ] Show cost per 1000 tokens
  - [ ] Show estimated session cost
- [ ] Test manually:
  - [ ] Register with default price
  - [ ] Register with custom price
  - [ ] Validation works
  - [ ] Success message shows pricing

**Implementation Requirements**:
```typescript
// apps/harness/components/NodeManagementClient.tsx (additions)
const [minPricePerToken, setMinPricePerToken] = useState('2000');

// Price calculation helper
const calculatePriceDisplay = (price: string) => {
  const p = parseInt(price);
  return {
    perToken: (p / 1000000).toFixed(6),
    per1000: (p / 1000).toFixed(3),
    per10000: (p / 100).toFixed(2)
  };
};

// In registration form:
<div>
  <label>Minimum Price Per Token</label>
  <input
    type="number"
    value={minPricePerToken}
    onChange={(e) => setMinPricePerToken(e.target.value)}
    min="100"
    max="100000"
    step="100"
  />
  <small>
    ${calculatePriceDisplay(minPricePerToken).perToken} USDC per token
    <br />
    ${calculatePriceDisplay(minPricePerToken).per1000} USDC per 1,000 tokens
    <br />
    ${calculatePriceDisplay(minPricePerToken).per10000} USDC per 10,000 tokens
  </small>
</div>

// In registration API call:
await mgmtApiClient.register({
  url: publicUrl,
  models: supportedModels,
  stake: stakeAmount,
  minPricePerToken: minPricePerToken  // NEW
});
```

**Acceptance Criteria**:
- [ ] Pricing input appears in form
- [ ] Default value is 2000
- [ ] Real-time USDC conversion shown
- [ ] Validation prevents invalid values
- [ ] Registration includes pricing

---

### Sub-phase 4.2: Pricing Update UI ⏳

**Goal**: Add pricing update section to node management

**Status**: ⏳ Not started (waiting on 4.1)

**Tasks**:
- [ ] Update `apps/harness/components/NodeManagementClient.tsx` (+120 lines max)
  - [ ] Add "Update Pricing" section with current price display
  - [ ] Add new price input field
  - [ ] Add "Update Price" button
  - [ ] Show before/after comparison
  - [ ] Call management API updatePricing endpoint
  - [ ] Refresh node info after update
- [ ] Update management API server to support updatePricing
  - [ ] Add POST /api/update-pricing endpoint in `packages/host-cli/src/server/api.ts`
- [ ] Test manually:
  - [ ] Display shows current price
  - [ ] Update changes price on-chain
  - [ ] UI refreshes to show new price

**Implementation Requirements**:
```typescript
// apps/harness/components/NodeManagementClient.tsx (additions)
const [currentPrice, setCurrentPrice] = useState<string>('');
const [newPrice, setNewPrice] = useState<string>('');

async function updatePricing() {
  try {
    setLoading(true);
    addLog('Updating pricing on-chain...');

    const result = await mgmtApiClient.updatePricing({
      price: newPrice
    });

    addLog(`✅ Pricing updated! TX: ${result.transactionHash}`);

    // Refresh node info
    await refreshNodeInfo();
  } catch (error: any) {
    addLog(`❌ Update failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

// UI:
<div className="pricing-section">
  <h3>💰 Pricing Management</h3>
  <div>
    <strong>Current Price:</strong> {currentPrice} ({(Number(currentPrice)/1000000).toFixed(6)} USDC/token)
  </div>
  <div>
    <label>New Price:</label>
    <input
      type="number"
      value={newPrice}
      onChange={(e) => setNewPrice(e.target.value)}
      min="100"
      max="100000"
    />
  </div>
  <button onClick={updatePricing}>Update Price</button>
</div>

// packages/host-cli/src/server/api.ts (additions)
private async handleUpdatePricing(req: Request, res: Response) {
  const { price } = req.body;

  // Validate
  const priceNum = parseInt(price);
  if (priceNum < 100 || priceNum > 100000) {
    return res.status(400).json({ error: 'Price must be between 100 and 100000' });
  }

  // Update via CLI logic
  const txHash = await hostManager.updatePricing(price);

  res.json({
    success: true,
    transactionHash: txHash,
    newPrice: price
  });
}
```

**Acceptance Criteria**:
- [ ] Current price displayed
- [ ] Update form works
- [ ] Transaction succeeds
- [ ] UI refreshes with new price
- [ ] Management API endpoint works

---

### Sub-phase 4.3: Host Discovery with Price Filtering ⏳

**Goal**: Add price filtering to host discovery in chat demo

**Status**: ⏳ Not started (waiting on 4.2)

**Tasks**:
- [ ] Update `apps/harness/pages/chat-context-demo.tsx` (+100 lines max)
  - [ ] Add "Max Price" filter input to host discovery
  - [ ] Add sorting dropdown (price/reputation/random)
  - [ ] Display host pricing in discovery list
  - [ ] Filter hosts by max price
  - [ ] Sort hosts by selected criteria
- [ ] Test manually:
  - [ ] Price filter works
  - [ ] Sorting by price works
  - [ ] Host prices displayed correctly
  - [ ] Selected host pricing shown

**Implementation Requirements**:
```typescript
// apps/harness/pages/chat-context-demo.tsx (additions)
const [maxPrice, setMaxPrice] = useState<string>('');
const [sortBy, setSortBy] = useState<'price' | 'reputation' | 'random'>('price');

async function discoverHosts() {
  const hostDiscovery = await sdk.getHostDiscoveryService();

  const options: HostDiscoveryOptions = {
    modelId: selectedModel,
    sortBy: sortBy
  };

  if (maxPrice) {
    options.maxPricePerToken = BigInt(maxPrice);
  }

  const hosts = await hostDiscovery.findHosts(options);
  setAvailableHosts(hosts);
}

// UI:
<div className="discovery-filters">
  <div>
    <label>Max Price per Token:</label>
    <input
      type="number"
      value={maxPrice}
      onChange={(e) => setMaxPrice(e.target.value)}
      placeholder="No limit"
    />
  </div>
  <div>
    <label>Sort By:</label>
    <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
      <option value="price">Lowest Price</option>
      <option value="reputation">Highest Reputation</option>
      <option value="random">Random</option>
    </select>
  </div>
  <button onClick={discoverHosts}>Discover Hosts</button>
</div>

<div className="host-list">
  {availableHosts.map(host => (
    <div key={host.address} className="host-item">
      <div>{host.address.slice(0, 10)}...{host.address.slice(-8)}</div>
      <div>Price: {Number(host.minPricePerToken)/1000000} USDC/token</div>
      <div>Reputation: {host.reputation || 'N/A'}</div>
      <button onClick={() => selectHost(host)}>Select</button>
    </div>
  ))}
</div>
```

**Acceptance Criteria**:
- [ ] Price filter input works
- [ ] Sorting dropdown works
- [ ] Host pricing displayed in list
- [ ] Filtered/sorted results correct
- [ ] Manual testing passes

---

## Phase 5: Client Integration

**Dependencies**: Phase 2 complete (SDK), Phase 4 optional
**Estimated Time**: 4-6 hours
**Goal**: Update client flows to respect host pricing

### Sub-phase 5.1: Session Creation Price Defaults ⏳

**Goal**: Update session creation to default to host minimum pricing

**Status**: ⏳ Not started (waiting on Phase 2)

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/integration/session-pricing-flow.test.ts` (200 lines max)
  - [ ] Test: session creation without price uses host minimum
  - [ ] Test: session creation with price >= minimum succeeds
  - [ ] Test: session creation with price < minimum fails
  - [ ] Test: error message explains pricing violation
- [ ] Update session creation flows in harness:
  - [ ] `apps/harness/pages/chat-context-demo.tsx` (+50 lines)
  - [ ] `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx` (+30 lines)
  - [ ] `apps/harness/pages/eth-mvp-flow-sdk.test.tsx` (+30 lines)
  - [ ] Remove hardcoded `PRICE_PER_TOKEN` constants
  - [ ] Fetch from selected host instead
  - [ ] Use host pricing in session creation
- [ ] Verify all tests pass (4/4 ✅)

**Implementation Requirements**:
```typescript
// apps/harness/pages/chat-context-demo.tsx (changes)
// REMOVE: const PRICE_PER_TOKEN = 2000;

// ADD: Fetch pricing when host selected
async function selectHost(host: HostInfo) {
  setSelectedHost(host);
  setPricePerToken(Number(host.minPricePerToken));  // Use host minimum
  addMessage('system', `Selected host: ${host.address}`);
  addMessage('system', `Price: ${Number(host.minPricePerToken)/1000000} USDC/token`);
}

// In session creation:
const result = await paymentManager.createSessionFromDeposit({
  host: selectedHost.address,
  token: contracts.USDC,
  deposit: depositWei,
  pricePerToken: pricePerToken,  // Use host's price (not hardcoded)
  duration: sessionDuration,
  proofInterval: PROOF_INTERVAL
});
```

**Acceptance Criteria**:
- [ ] Hardcoded prices removed
- [ ] Sessions use host pricing
- [ ] Price displayed when host selected
- [ ] Tests verify pricing enforcement
- [ ] All existing flows work with new pricing

---

### Sub-phase 5.2: Proof Interval Optimization ⏳

**Goal**: Update default proof interval from 100 to 1000 tokens

**Status**: ⏳ Not started (waiting on 5.1)

**Tasks**:
- [ ] Update all proof interval constants (50 lines across multiple files)
  - [ ] `apps/harness/pages/chat-context-demo.tsx`: 100 → 1000
  - [ ] `apps/harness/pages/usdc-mvp-flow-sdk.test.tsx`: 100 → 1000
  - [ ] `apps/harness/pages/eth-mvp-flow-sdk.test.tsx`: 100 → 1000
  - [ ] `apps/harness/pages/base-usdc-mvp-flow-sdk.test.tsx`: 100 → 1000
- [ ] Update documentation references (100 lines across docs)
  - [ ] `docs/SDK_API.md`: Update proof interval examples
  - [ ] `docs/UI_DEVELOPER_CHAT_GUIDE.md`: Update recommendations
  - [ ] `docs/compute-contracts-reference/SESSION_JOBS.md`: Update best practices
- [ ] Update test expectations:
  - [ ] Expected token counts
  - [ ] Gas cost calculations
  - [ ] Checkpoint timing
- [ ] Verify all tests still pass with new interval

**Implementation Requirements**:
```typescript
// Change in ALL test harness pages:
const PROOF_INTERVAL = 1000; // Previously 100 - checkpoint every 1000 tokens

// Update documentation:
/**
 * Recommended proof intervals for production:
 * - Development/Testing: 100 tokens (frequent checkpoints for debugging)
 * - Production: 1000 tokens (optimal balance of security and gas costs)
 * - High-value sessions: 500 tokens (more frequent verification)
 * - Long sessions: 2000+ tokens (minimize gas costs)
 */
```

**Rationale**:
- **100 tokens**: 10x more transactions = 10x more gas = expensive for production
- **1000 tokens**: Optimal balance - reasonable security, manageable gas costs
- **Gas savings**: ~$0.50 per session in transaction costs (at current L2 rates)

**Acceptance Criteria**:
- [ ] All PROOF_INTERVAL constants updated to 1000
- [ ] Documentation reflects new recommendation
- [ ] Tests pass with new interval
- [ ] Gas costs documented in PRICING_UPDATE.md

---

## Phase 6: Testing & Migration

**Dependencies**: Phases 2-5 complete
**Estimated Time**: 4-6 hours
**Goal**: End-to-end testing and production migration prep

### Sub-phase 6.1: Integration Testing & Migration ⏳

**Goal**: Comprehensive testing and migration documentation

**Status**: ⏳ Not started (waiting on Phases 2-5)

**Tasks**:
- [ ] Write end-to-end test in `packages/sdk-core/tests/integration/pricing-e2e.test.ts` (300 lines max)
  - [ ] Test: Register host with custom pricing
  - [ ] Test: Discover hosts filtered by price
  - [ ] Test: Create session at host minimum price
  - [ ] Test: Attempt session below minimum (should fail)
  - [ ] Test: Update host pricing
  - [ ] Test: Create new session at updated price
  - [ ] Test: Price discovery shows updated pricing
- [ ] Create migration guide `docs/compute-contracts-reference/PRICING_MIGRATION.md` (200 lines max)
  - [ ] Pre-migration checklist
  - [ ] Contract deployment steps
  - [ ] SDK update procedure
  - [ ] Host migration steps (existing hosts)
  - [ ] Rollback procedure
  - [ ] Troubleshooting common issues
- [ ] Update `CLAUDE.md` with new pricing patterns (50 lines max)
  - [ ] Document pricing as required parameter
  - [ ] Update examples with pricing
  - [ ] Add pricing validation patterns
- [ ] Create `docs/PRICING_FAQ.md` (150 lines max)
  - [ ] How pricing works
  - [ ] Setting optimal prices
  - [ ] Price change best practices
  - [ ] Client perspective
  - [ ] Host perspective
- [ ] Verify all tests pass (6/6 ✅)
- [ ] Manual testing checklist complete

**Test Requirements**:
```typescript
describe('Marketplace Pricing E2E', () => {
  describe('Host Registration', () => {
    test('should register host with custom pricing');
    test('should reject invalid pricing');
  });

  describe('Price Discovery', () => {
    test('should discover hosts and filter by price');
    test('should sort hosts by price');
  });

  describe('Session Creation', () => {
    test('should create session at host minimum');
    test('should reject session below host minimum');
    test('should default to host minimum if no price specified');
  });

  describe('Pricing Updates', () => {
    test('should update host pricing');
    test('should affect new sessions immediately');
    test('should not affect running sessions');
  });
});
```

**Manual Testing Checklist**:
```markdown
## Pre-MVP Testing Checklist

### Host Registration
- [ ] Register with default price (2000)
- [ ] Register with custom price (1500)
- [ ] Register with minimum price (100)
- [ ] Register with maximum price (100000)
- [ ] Verify pricing appears in NodeRegistry

### Host Management
- [ ] Update pricing to higher value
- [ ] Update pricing to lower value
- [ ] Verify update appears on-chain
- [ ] Verify CLI info shows correct price
- [ ] Verify browser UI shows correct price

### Host Discovery
- [ ] Discover all hosts (no filter)
- [ ] Filter by max price
- [ ] Sort by price (lowest first)
- [ ] Sort by reputation
- [ ] Verify pricing displayed correctly

### Session Creation
- [ ] Create session with host minimum price
- [ ] Create session with price above minimum
- [ ] Attempt session with price below minimum (should fail)
- [ ] Verify error message is clear
- [ ] Create session without specifying price (should use host minimum)

### Proof Intervals
- [ ] Verify 1000 token interval used
- [ ] Check gas costs reasonable
- [ ] Confirm proofs submitted correctly
- [ ] Verify session completes successfully

### Migration
- [ ] Existing hosts show default price (2000)
- [ ] Existing hosts can update pricing
- [ ] Old SDK clients get clear error messages
- [ ] Documentation matches implementation
```

**Migration Guide Outline**:
```markdown
# Pricing Migration Guide

## Pre-Migration

1. Announce pricing feature to all hosts
2. Deploy updated contracts to testnet
3. Test with test hosts
4. Deploy to mainnet
5. Migrate existing hosts

## Contract Migration

```bash
# 1. Deploy new NodeRegistry
forge script scripts/DeployNodeRegistry.s.sol --broadcast

# 2. Deploy new JobMarketplace (if needed)
forge script scripts/DeployJobMarketplace.s.sol --broadcast

# 3. Migrate existing hosts
forge script scripts/MigrateNodePricing.s.sol --broadcast
```

## Host Migration

Existing hosts automatically migrated to default price (2000).

To update:
```bash
fabstir-host update-pricing --price YOUR_PRICE
```

## Client Migration

SDK v2.x automatically respects host pricing.
No changes needed for clients.

## Rollback Procedure

If issues arise:
1. Point SDK to old contract addresses
2. Deploy hotfix if needed
3. Coordinate with hosts on timing
```

**Acceptance Criteria**:
- [ ] E2E test covers full pricing lifecycle
- [ ] Migration guide complete and tested
- [ ] Manual testing checklist complete
- [ ] FAQ answers common questions
- [ ] All tests pass
- [ ] No regressions in existing functionality

---

## Success Metrics

### Pre-MVP (Immediate)
- ✅ Contracts deployed with pricing enforcement
- ✅ SDK supports host pricing
- ✅ CLI commands include pricing management
- ✅ Browser UI shows pricing controls
- ✅ Tests pass (17/17 sub-phases complete)

### MVP Launch
- 🎯 All hosts have set pricing (not default)
- 🎯 Clients use price discovery
- 🎯 No sessions rejected for pricing issues (hosts set reasonable prices)
- 🎯 Proof intervals at 1000+ tokens (gas optimized)

### Post-MVP
- 🎯 Price discovery API used by 80%+ of clients
- 🎯 Market establishes average prices by model tier
- 🎯 Hosts adjust pricing based on demand
- 🎯 Price trend data available

## Risk Mitigation

### Contract Risks
- **Risk**: Contract bugs in pricing validation
- **Mitigation**: Extensive testing on testnet first
- **Rollback**: Deploy bug-fix or revert to old contracts

### Migration Risks
- **Risk**: Existing hosts don't migrate
- **Mitigation**: Auto-migrate to default price (2000)
- **Communication**: Announce feature 1 week before deployment

### Economic Risks
- **Risk**: Race to bottom (hosts compete on price only)
- **Mitigation**: Emphasize reputation alongside price
- **Future**: Minimum quality standards for low-price hosts

### Adoption Risks
- **Risk**: Clients ignore pricing (use default)
- **Mitigation**: Make price discovery obvious in UI
- **Incentive**: Show savings with cheaper hosts

## Timeline

**Week 1**: Phase 1 (Contract deployment) + Phase 2 (SDK updates)
**Week 2**: Phase 3 (CLI) + Phase 4 (UI)
**Week 3**: Phase 5 (Client integration) + Phase 6 (Testing)
**Week 4**: Migration and production deployment

**Total**: 3-4 weeks for full implementation

## Next Steps

1. **Immediate**: Review this plan with team
2. **Day 1**: Contact contract developer with Phase 1.1 spec
3. **Wait**: Pause until contracts deployed
4. **Day 2+**: Begin Phase 2 (SDK) once contracts ready
5. **Continuous**: Write tests FIRST for every sub-phase

## Questions for Team

Before starting:
1. Confirm price ranges (100-100000) are acceptable?
2. Confirm default price (2000 = 0.002 USDC/token) is reasonable?
3. Any concerns about 1000 token proof intervals?
4. Timeline acceptable (3-4 weeks)?
5. Contract developer availability confirmed?

---

**Document Version**: 1.0
**Last Updated**: January 7, 2025
**Status**: Ready for review and team approval
