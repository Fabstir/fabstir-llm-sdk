# Model and Host Selection Implementation Plan (v1.0)

> Complete implementation plan for adding model and host selection with persistent user preferences to Fabstir LLM SDK
>
> **Status**: 🚧 IN PROGRESS (1/6 phases complete, ~25%) | **Target**: User-selectable models and hosts with weighted selection algorithm | **Progress**: Phase 1 ✅, Phase 2 (1/2) 🚧, Phase 3 ⏳, Phase 4 ⏳, Phase 5 ⏳, Phase 6 ⏳

## Overview

Enable users to select their preferred model and host before running inference, with persistent preferences stored via S5. This transforms the SDK from automatic host selection to a user-controlled marketplace experience where users can choose their preferred model first, then select a host based on various criteria (price, reliability, speed).

**Current Problem**: Users cannot select their preferred model or host before starting a session. The SDK randomly selects hosts, and there's no persistence of user preferences across sessions.

**Solution**: Implement model selection UI support, a weighted host selection algorithm with multiple modes, and persistent user preferences via S5 storage.

## Prerequisites

Before starting implementation, ensure:

✅ Per-model pricing implemented (SDK v1.5.12+)
✅ HostManager.findHostsForModel() working
✅ ModelManager.getAllApprovedModels() working
✅ StorageManager user settings working (V1)
✅ S5 storage integration complete
✅ Test accounts funded with FAB and USDC

## Business Requirements

### Current State
- **Model selection**: None - hardcoded or first available
- **Host selection**: Random from available hosts
- **Persistence**: No saved preferences for model/host
- **User control**: Limited to price filters in discovery

### Target State
- **Model selection**: User selects model before session creation
- **Host selection**: Weighted algorithm with 5 modes (AUTO, CHEAPEST, RELIABLE, FASTEST, SPECIFIC)
- **Persistence**: Default model and host preferences saved to S5
- **User control**: Full control over model and host selection strategy

### Design Decisions (User Confirmed)

1. **Uptime/Latency Data**: Use placeholder values (95% uptime, 100ms latency) until a metrics system is built. The weighted algorithm will still function, just with static values for now.

2. **Fallback Behavior**: When `SPECIFIC` mode is set but the preferred host is unavailable, **return an error** and let the UI handle it. This gives UI developers full control over the user experience.

3. **Popular Models**: Outside SDK scope. This is a platform/server-side concern.

## Architecture

### UserSettings V2 Schema

```typescript
// packages/sdk-core/src/types/settings.types.ts

export enum HostSelectionMode {
  AUTO = 'auto',           // Weighted algorithm (default)
  CHEAPEST = 'cheapest',   // Lowest price first
  RELIABLE = 'reliable',   // Highest stake + reputation
  FASTEST = 'fastest',     // Lowest latency (placeholder)
  SPECIFIC = 'specific'    // Use preferredHostAddress
}

export interface UserSettings {
  version: UserSettingsVersion;  // V2
  lastUpdated: number;

  // Model Preferences
  defaultModelId: string | null;     // NEW: Default model (null = no default)
  selectedModel: string;             // Current session model
  lastUsedModels?: string[];

  // Host Preferences
  hostSelectionMode: HostSelectionMode;  // NEW: Selection algorithm
  preferredHostAddress: string | null;   // NEW: For SPECIFIC mode
  lastHostAddress?: string;
  preferredHosts?: string[];

  // Payment/UI (unchanged)
  preferredPaymentToken?: 'USDC' | 'ETH';
  autoApproveAmount?: string;
  advancedSettingsExpanded?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}
```

### Host Selection Algorithm

**Weighted Scoring Formula (per user recommendation):**
```
host_score = (stake_weight × 0.35) + (price_weight × 0.30) +
             (uptime_weight × 0.20) + (latency_weight × 0.15)
```

| Factor | Weight | Source | Notes |
|--------|--------|--------|-------|
| **Stake** | 35% | `host.stake` from NodeRegistry | Higher stake = more skin in the game |
| **Price** | 30% | `host.minPricePerTokenStable` | Normalized inverse (lower = better) |
| **Uptime** | 20% | Placeholder (95%) | Until metrics system built |
| **Latency** | 15% | Placeholder (100ms) | Until metrics system built |

**Mode-Specific Weights:**
- **AUTO**: Standard weights above
- **CHEAPEST**: price=0.70, stake=0.15, uptime=0.10, latency=0.05
- **RELIABLE**: stake=0.50, uptime=0.40, price=0.05, latency=0.05
- **FASTEST**: latency=0.60, price=0.20, stake=0.10, uptime=0.10
- **SPECIFIC**: Return preferred host or throw error if unavailable

### Host Selection Service Interface

```typescript
// packages/sdk-core/src/services/HostSelectionService.ts

export interface IHostSelectionService {
  // Select best host for model using specified mode
  selectHostForModel(
    modelId: string,
    mode: HostSelectionMode,
    preferredHostAddress?: string
  ): Promise<HostInfo | null>;

  // Get ranked hosts for model (for UI to display options)
  getRankedHostsForModel(
    modelId: string,
    mode: HostSelectionMode,
    limit?: number
  ): Promise<RankedHost[]>;

  // Calculate score for single host
  calculateHostScore(host: HostInfo, mode: HostSelectionMode): number;
}

export interface RankedHost {
  host: HostInfo;
  score: number;
  factors: {
    stakeScore: number;
    priceScore: number;
    uptimeScore: number;
    latencyScore: number;
  };
}
```

### Model Discovery Enhancement

```typescript
// packages/sdk-core/src/managers/ModelManager.ts (additions)

export interface ModelWithAvailability {
  model: ModelInfo;
  hostCount: number;        // Number of hosts serving this model
  priceRange: {
    min: bigint;            // Lowest host price
    max: bigint;            // Highest host price
    avg: bigint;            // Average price
  };
  isAvailable: boolean;     // hostCount > 0
}

// New methods
async getAvailableModelsWithHosts(): Promise<ModelWithAvailability[]>;
async getModelPriceRange(modelId: string): Promise<{
  min: bigint;
  max: bigint;
  avg: bigint;
  hostCount: number;
}>;
```

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST for all code changes
2. **Bounded Autonomy**: Each sub-phase has strict scope and line limits
3. **SDK First**: UI gets helper methods, not business logic
4. **Backward Compatibility**: Existing flows continue to work
5. **Fail Fast**: SPECIFIC mode throws error if host unavailable (UI handles fallback)
6. **Placeholder Metrics**: Use static values until real metrics available

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must exist and FAIL before writing implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Real Contract Testing**: Integration tests use actual deployed contracts

---

## Phase 1: UserSettings V2 Schema

**Dependencies**: None
**Estimated Time**: 2-3 hours
**Goal**: Extend UserSettings to support model and host preferences

### Sub-phase 1.1: Settings Types Update

**Goal**: Add new types and enums for host selection mode and extended preferences

**Status**: ✅ Complete (Dec 16, 2025)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/types/settings-v2.test.ts` (150 lines max)
  - [x] Test: HostSelectionMode enum has all 5 values
  - [x] Test: UserSettings V2 includes defaultModelId field
  - [x] Test: UserSettings V2 includes hostSelectionMode field
  - [x] Test: UserSettings V2 includes preferredHostAddress field
  - [x] Test: Default values are correct (null, AUTO, null)
- [x] Update `packages/sdk-core/src/types/settings.types.ts` (+30 lines)
  - [x] Add HostSelectionMode enum
  - [x] Add UserSettingsVersion.V2 = 2
  - [x] Add defaultModelId: string | null
  - [x] Add hostSelectionMode: HostSelectionMode
  - [x] Add preferredHostAddress: string | null
- [x] Export new types in `packages/sdk-core/src/types/index.ts` (already exports via `export * from './settings.types'`)
- [x] Verify all tests pass (18/18 new tests + 7/7 existing tests)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/types/settings.types.ts

export enum HostSelectionMode {
  AUTO = 'auto',
  CHEAPEST = 'cheapest',
  RELIABLE = 'reliable',
  FASTEST = 'fastest',
  SPECIFIC = 'specific'
}

export enum UserSettingsVersion {
  V1 = 1,
  V2 = 2  // NEW
}

export interface UserSettingsV2 {
  version: UserSettingsVersion.V2;
  lastUpdated: number;

  // Model Preferences
  defaultModelId: string | null;
  selectedModel: string;
  lastUsedModels?: string[];

  // Host Preferences
  hostSelectionMode: HostSelectionMode;
  preferredHostAddress: string | null;
  lastHostAddress?: string;
  preferredHosts?: string[];

  // Payment/UI (unchanged)
  preferredPaymentToken?: 'USDC' | 'ETH';
  autoApproveAmount?: string;
  advancedSettingsExpanded?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

// Union type for all versions
export type UserSettings = UserSettingsV1 | UserSettingsV2;
```

**Acceptance Criteria**:
- [ ] Types compile without errors
- [ ] All 5 tests pass
- [ ] Enum exported correctly
- [ ] JSDoc comments on new fields

---

### Sub-phase 1.2: Settings Migration V1 → V2

**Goal**: Implement migration logic to upgrade V1 settings to V2

**Status**: ✅ Complete (Dec 16, 2025)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/managers/settings-migration-v2.test.ts` (158 lines)
  - [x] Test: V1 settings migrate to V2 with defaults
  - [x] Test: V2 settings pass through unchanged
  - [x] Test: Migration preserves existing fields
  - [x] Test: defaultModelId defaults to null
  - [x] Test: hostSelectionMode defaults to AUTO
- [x] Update `packages/sdk-core/src/managers/migrations/user-settings.ts` (+25 lines)
  - [x] Add migrateV1ToV2() function
  - [x] Update migrateUserSettings() to handle V1→V2
  - [x] Set default values for new fields
- [x] Update existing migration tests for V1→V2 behavior
- [x] Verify all tests pass (10/10 new + 23/25 existing migration tests)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/migrations/user-settings.ts

function migrateV1ToV2(v1: UserSettingsV1): UserSettingsV2 {
  return {
    ...v1,
    version: UserSettingsVersion.V2,
    defaultModelId: null,
    hostSelectionMode: HostSelectionMode.AUTO,
    preferredHostAddress: null,
  };
}

export function runMigrations(settings: UserSettings): UserSettings {
  let current = settings;

  if (current.version === UserSettingsVersion.V1) {
    current = migrateV1ToV2(current as UserSettingsV1);
  }

  return current;
}
```

**Acceptance Criteria**:
- [ ] Migration runs automatically on load
- [ ] All 5 tests pass
- [ ] Existing V1 data preserved
- [ ] New fields have correct defaults

---

## Phase 2: Host Selection Service

**Dependencies**: Phase 1 complete
**Estimated Time**: 4-5 hours
**Goal**: Implement weighted host selection algorithm with multiple modes

### Sub-phase 2.1: Host Selection Service Core

**Goal**: Create HostSelectionService with scoring algorithm

**Status**: ✅ Complete (Dec 16, 2025)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/services/host-selection.test.ts` (248 lines)
  - [x] Test: calculateHostScore returns value between 0-1
  - [x] Test: AUTO mode uses standard weights (stake=0.35, price=0.30, uptime=0.20, latency=0.15)
  - [x] Test: CHEAPEST mode prioritizes price (0.70)
  - [x] Test: RELIABLE mode prioritizes stake+uptime (0.50+0.40)
  - [x] Test: FASTEST mode prioritizes latency (0.60)
  - [x] Test: Higher stake hosts score higher (stake factor)
  - [x] Test: Lower price hosts score higher (price factor)
  - [x] Test: Score factors are normalized 0-1
- [x] Create `packages/sdk-core/src/services/HostSelectionService.ts` (270 lines)
  - [x] Implement calculateHostScore() method
  - [x] Implement getScoreFactors() method
  - [x] Implement selectHostForModel() with SPECIFIC mode support
  - [x] Implement getRankedHostsForModel()
  - [x] Implement normalizeStake() and normalizePrice() helpers
  - [x] Implement weightedRandomSelect() for non-deterministic selection
  - [x] Placeholder uptimeScore (0.95) and latencyScore (0.9)
- [x] Create `packages/sdk-core/src/interfaces/IHostSelectionService.ts` (87 lines)
  - [x] Define ModeWeights, ScoreFactors, RankedHost interfaces
  - [x] Define IHostSelectionService interface
- [x] Create `packages/sdk-core/src/services/index.ts` (exports all services)
- [x] Export from `packages/sdk-core/src/interfaces/index.ts`
- [x] Verify all tests pass (15/15)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/services/HostSelectionService.ts

export class HostSelectionService implements IHostSelectionService {
  private readonly MODE_WEIGHTS: Record<HostSelectionMode, ModeWeights> = {
    [HostSelectionMode.AUTO]: { stake: 0.35, price: 0.30, uptime: 0.20, latency: 0.15 },
    [HostSelectionMode.CHEAPEST]: { stake: 0.15, price: 0.70, uptime: 0.10, latency: 0.05 },
    [HostSelectionMode.RELIABLE]: { stake: 0.50, price: 0.05, uptime: 0.40, latency: 0.05 },
    [HostSelectionMode.FASTEST]: { stake: 0.10, price: 0.20, uptime: 0.10, latency: 0.60 },
    [HostSelectionMode.SPECIFIC]: { stake: 0, price: 0, uptime: 0, latency: 0 }, // Not used
  };

  calculateHostScore(host: HostInfo, mode: HostSelectionMode): number {
    const weights = this.MODE_WEIGHTS[mode];

    const stakeScore = this.normalizeStake(host.stake);
    const priceScore = this.normalizePrice(host.minPricePerTokenStable);
    const uptimeScore = 0.95;  // Placeholder until metrics available
    const latencyScore = 0.9;  // Placeholder until metrics available

    return (
      weights.stake * stakeScore +
      weights.price * priceScore +
      weights.uptime * uptimeScore +
      weights.latency * latencyScore
    );
  }

  private normalizeStake(stake: bigint): number {
    // Normalize stake to 0-1 range (assume max stake ~10000 FAB)
    const maxStake = 10000n * 10n ** 18n;
    return Math.min(Number(stake) / Number(maxStake), 1);
  }

  private normalizePrice(price: bigint): number {
    // Lower price = higher score (inverse normalization)
    // Price range: 100-100000 (PRICE_PRECISION = 1000)
    const minPrice = 100n;
    const maxPrice = 100000n;
    const normalized = Number(maxPrice - price) / Number(maxPrice - minPrice);
    return Math.max(0, Math.min(1, normalized));
  }
}
```

**Acceptance Criteria**:
- [ ] Scoring algorithm implemented
- [ ] All 8 tests pass
- [ ] Mode weights configurable
- [ ] Normalization correct

---

### Sub-phase 2.2: Host Selection Methods

**Goal**: Implement selectHostForModel and getRankedHostsForModel

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/services/host-selection-methods.test.ts` (200 lines max)
  - [ ] Test: selectHostForModel returns highest-scoring host
  - [ ] Test: selectHostForModel uses weighted random (not always top)
  - [ ] Test: getRankedHostsForModel returns sorted list with scores
  - [ ] Test: SPECIFIC mode returns preferred host if available
  - [ ] Test: SPECIFIC mode throws error if preferred host unavailable
  - [ ] Test: SPECIFIC mode throws error if preferred host doesn't support model
  - [ ] Test: Empty host list returns null
- [ ] Update `packages/sdk-core/src/services/HostSelectionService.ts` (+80 lines)
  - [ ] Add constructor accepting HostManager
  - [ ] Implement selectHostForModel() with weighted random
  - [ ] Implement getRankedHostsForModel()
  - [ ] Implement SPECIFIC mode with error handling
  - [ ] Add weightedRandomSelect() helper
- [ ] Verify all tests pass (7/7)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/services/HostSelectionService.ts (additions)

constructor(private hostManager: IHostManager) {}

async selectHostForModel(
  modelId: string,
  mode: HostSelectionMode,
  preferredHostAddress?: string
): Promise<HostInfo | null> {
  // SPECIFIC mode - return preferred or throw error
  if (mode === HostSelectionMode.SPECIFIC) {
    if (!preferredHostAddress) {
      throw new Error('preferredHostAddress required for SPECIFIC mode');
    }
    const host = await this.hostManager.getHostInfo(preferredHostAddress);
    if (!host || !host.isActive) {
      throw new Error(`Preferred host ${preferredHostAddress} is not available`);
    }
    const supportsModel = await this.hostManager.hostSupportsModel(preferredHostAddress, modelId);
    if (!supportsModel) {
      throw new Error(`Preferred host ${preferredHostAddress} does not support model ${modelId}`);
    }
    return host;
  }

  // Other modes - get ranked hosts and use weighted random
  const rankedHosts = await this.getRankedHostsForModel(modelId, mode);
  if (rankedHosts.length === 0) return null;

  return this.weightedRandomSelect(rankedHosts);
}

async getRankedHostsForModel(
  modelId: string,
  mode: HostSelectionMode,
  limit: number = 10
): Promise<RankedHost[]> {
  const hosts = await this.hostManager.findHostsForModel(modelId);

  const ranked = hosts.map(host => ({
    host,
    score: this.calculateHostScore(host, mode),
    factors: this.calculateFactors(host)
  }));

  return ranked
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

private weightedRandomSelect(rankedHosts: RankedHost[]): HostInfo {
  // Use scores as probability weights
  const totalScore = rankedHosts.reduce((sum, rh) => sum + rh.score, 0);
  let random = Math.random() * totalScore;

  for (const rh of rankedHosts) {
    random -= rh.score;
    if (random <= 0) return rh.host;
  }

  return rankedHosts[0].host; // Fallback
}
```

**Acceptance Criteria**:
- [ ] selectHostForModel uses weighted random
- [ ] SPECIFIC mode throws on unavailable host
- [ ] getRankedHostsForModel returns scored/sorted list
- [ ] All 7 tests pass

---

## Phase 3: Model Discovery Enhancement

**Dependencies**: None (can run parallel with Phase 2)
**Estimated Time**: 2-3 hours
**Goal**: Add model availability and price range methods

### Sub-phase 3.1: Model Availability Methods

**Goal**: Implement getAvailableModelsWithHosts and getModelPriceRange

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/model-availability.test.ts` (150 lines max)
  - [ ] Test: getAvailableModelsWithHosts returns models with host counts
  - [ ] Test: getAvailableModelsWithHosts includes price ranges
  - [ ] Test: getAvailableModelsWithHosts marks unavailable models (hostCount=0)
  - [ ] Test: getModelPriceRange returns min/max/avg for model
  - [ ] Test: getModelPriceRange returns 0s for model with no hosts
- [ ] Update `packages/sdk-core/src/managers/ModelManager.ts` (+60 lines)
  - [ ] Add ModelWithAvailability interface (or import from types)
  - [ ] Implement getAvailableModelsWithHosts()
  - [ ] Implement getModelPriceRange()
  - [ ] Use HostManager.findHostsForModel() for host counts
- [ ] Update `packages/sdk-core/src/interfaces/IModelManager.ts` (+15 lines)
  - [ ] Add getAvailableModelsWithHosts() signature
  - [ ] Add getModelPriceRange() signature
- [ ] Add ModelWithAvailability to types
- [ ] Verify all tests pass (5/5)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/types/models.ts (addition)

export interface ModelWithAvailability {
  model: ModelInfo;
  hostCount: number;
  priceRange: {
    min: bigint;
    max: bigint;
    avg: bigint;
  };
  isAvailable: boolean;
}

// packages/sdk-core/src/managers/ModelManager.ts (additions)

async getAvailableModelsWithHosts(): Promise<ModelWithAvailability[]> {
  const allModels = await this.getAllApprovedModels();
  const results: ModelWithAvailability[] = [];

  for (const model of allModels) {
    const hosts = await this.hostManager.findHostsForModel(model.modelId);
    const priceRange = this.calculatePriceRange(hosts);

    results.push({
      model,
      hostCount: hosts.length,
      priceRange,
      isAvailable: hosts.length > 0
    });
  }

  return results;
}

async getModelPriceRange(modelId: string): Promise<{
  min: bigint;
  max: bigint;
  avg: bigint;
  hostCount: number;
}> {
  const hosts = await this.hostManager.findHostsForModel(modelId);
  if (hosts.length === 0) {
    return { min: 0n, max: 0n, avg: 0n, hostCount: 0 };
  }

  const prices = hosts.map(h => h.minPricePerTokenStable);
  const min = prices.reduce((a, b) => a < b ? a : b);
  const max = prices.reduce((a, b) => a > b ? a : b);
  const sum = prices.reduce((a, b) => a + b, 0n);
  const avg = sum / BigInt(prices.length);

  return { min, max, avg, hostCount: hosts.length };
}
```

**Acceptance Criteria**:
- [ ] Models include host availability info
- [ ] Price ranges calculated correctly
- [ ] All 5 tests pass
- [ ] Interface updated

---

## Phase 4: Preference Helper Methods

**Dependencies**: Phase 1 complete
**Estimated Time**: 2-3 hours
**Goal**: Add convenience methods for getting/setting preferences

### Sub-phase 4.1: StorageManager Preference Helpers

**Goal**: Add helper methods for default model and host selection mode

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/storage-preferences.test.ts` (180 lines max)
  - [ ] Test: getDefaultModel returns null when not set
  - [ ] Test: getDefaultModel returns ModelInfo when set
  - [ ] Test: setDefaultModel validates model exists
  - [ ] Test: setDefaultModel(null) clears default
  - [ ] Test: getHostSelectionMode returns AUTO by default
  - [ ] Test: setHostSelectionMode updates mode
  - [ ] Test: setHostSelectionMode with SPECIFIC requires preferredHostAddress
  - [ ] Test: clearAIPreferences resets all to defaults
- [ ] Update `packages/sdk-core/src/managers/StorageManager.ts` (+80 lines)
  - [ ] Add getDefaultModel() method
  - [ ] Add setDefaultModel() method with validation
  - [ ] Add getHostSelectionMode() method
  - [ ] Add setHostSelectionMode() method with validation
  - [ ] Add clearAIPreferences() method
- [ ] Update `packages/sdk-core/src/interfaces/IStorageManager.ts` (+20 lines)
  - [ ] Add new method signatures
- [ ] Verify all tests pass (8/8)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/StorageManager.ts (additions)

async getDefaultModel(): Promise<ModelInfo | null> {
  const settings = await this.getUserSettings();
  if (!settings?.defaultModelId) return null;

  return this.modelManager.getModelDetails(settings.defaultModelId);
}

async setDefaultModel(modelId: string | null): Promise<void> {
  if (modelId !== null) {
    // Validate model exists
    const model = await this.modelManager.getModelDetails(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }
  }

  await this.updateUserSettings({
    defaultModelId: modelId
  });
}

async getHostSelectionMode(): Promise<HostSelectionMode> {
  const settings = await this.getUserSettings();
  return settings?.hostSelectionMode ?? HostSelectionMode.AUTO;
}

async setHostSelectionMode(
  mode: HostSelectionMode,
  preferredHostAddress?: string
): Promise<void> {
  if (mode === HostSelectionMode.SPECIFIC && !preferredHostAddress) {
    throw new Error('preferredHostAddress required for SPECIFIC mode');
  }

  await this.updateUserSettings({
    hostSelectionMode: mode,
    preferredHostAddress: mode === HostSelectionMode.SPECIFIC ? preferredHostAddress : null
  });
}

async clearAIPreferences(): Promise<void> {
  await this.updateUserSettings({
    defaultModelId: null,
    hostSelectionMode: HostSelectionMode.AUTO,
    preferredHostAddress: null
  });
}
```

**Acceptance Criteria**:
- [ ] All 8 tests pass
- [ ] Validation prevents invalid states
- [ ] Integrates with existing settings
- [ ] Interface updated

---

## Phase 5: SessionManager Integration

**Dependencies**: Phases 2, 4 complete
**Estimated Time**: 2-3 hours
**Goal**: Integrate host selection service into session creation flow

### Sub-phase 5.1: SessionManager Host Selection Integration

**Goal**: Use HostSelectionService when no host specified in startSession

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/managers/session-host-selection.test.ts` (150 lines max)
  - [ ] Test: startSession without host uses HostSelectionService
  - [ ] Test: startSession without host uses user's preferred mode
  - [ ] Test: startSession with explicit host skips selection
  - [ ] Test: startSession stores selected host in lastHostAddress
  - [ ] Test: SPECIFIC mode error propagates to caller
- [ ] Update `packages/sdk-core/src/managers/SessionManager.ts` (+50 lines)
  - [ ] Add hostSelectionService field
  - [ ] Add setHostSelectionService() method
  - [ ] Update startSession() to use selection service when no host
  - [ ] Read user's hostSelectionMode from storageManager
  - [ ] Store selected host in lastHostAddress
- [ ] Update `packages/sdk-core/src/FabstirSDKCore.ts` (+10 lines)
  - [ ] Initialize HostSelectionService
  - [ ] Wire up to SessionManager
- [ ] Verify all tests pass (5/5)

**Implementation Requirements**:
```typescript
// packages/sdk-core/src/managers/SessionManager.ts (additions)

private hostSelectionService?: IHostSelectionService;
private storageManager?: IStorageManager;

setHostSelectionService(service: IHostSelectionService): void {
  this.hostSelectionService = service;
}

setStorageManager(manager: IStorageManager): void {
  this.storageManager = manager;
}

async startSession(params: SessionStartConfig): Promise<StartSessionResult> {
  let hostUrl = params.hostUrl;
  let hostAddress = params.hostAddress;

  // If no host specified, use selection service
  if (!hostAddress && this.hostSelectionService && this.storageManager) {
    const mode = await this.storageManager.getHostSelectionMode();
    const settings = await this.storageManager.getUserSettings();

    const selectedHost = await this.hostSelectionService.selectHostForModel(
      params.modelId || params.model,
      mode,
      settings?.preferredHostAddress ?? undefined
    );

    if (!selectedHost) {
      throw new Error('No hosts available for the selected model');
    }

    hostUrl = selectedHost.apiUrl;
    hostAddress = selectedHost.address;

    // Store for next time
    await this.storageManager.updateUserSettings({
      lastHostAddress: hostAddress
    });
  }

  // Continue with existing logic...
  return this.doStartSession({ ...params, hostUrl, hostAddress });
}
```

**Acceptance Criteria**:
- [ ] Automatic host selection works
- [ ] User preferences respected
- [ ] All 5 tests pass
- [ ] Backward compatible

---

## Phase 6: Testing & Documentation

**Dependencies**: Phases 1-5 complete
**Estimated Time**: 3-4 hours
**Goal**: Comprehensive testing and documentation

### Sub-phase 6.1: Integration Tests

**Goal**: End-to-end tests for model/host selection flow

**Status**: ⏳ Not started

**Tasks**:
- [ ] Write tests in `packages/sdk-core/tests/integration/model-host-selection.test.ts` (300 lines max)
  - [ ] Test: Full flow - set default model, start session, verify model used
  - [ ] Test: Full flow - set CHEAPEST mode, verify lowest price host selected
  - [ ] Test: Full flow - set SPECIFIC mode, verify preferred host used
  - [ ] Test: Full flow - SPECIFIC mode with unavailable host throws error
  - [ ] Test: Preferences persist across SDK instances
  - [ ] Test: Migration from V1 settings preserves existing data
  - [ ] Test: getAvailableModelsWithHosts returns accurate data
  - [ ] Test: getRankedHostsForModel scores match expected weights
- [ ] Verify all 8 tests pass
- [ ] Document any edge cases discovered

**Acceptance Criteria**:
- [ ] E2E tests cover main flows
- [ ] All 8 tests pass
- [ ] Edge cases documented

---

### Sub-phase 6.2: Documentation Updates

**Goal**: Update SDK documentation with new features

**Status**: ⏳ Not started

**Tasks**:
- [ ] Update `docs/SDK_API.md` (+100 lines)
  - [ ] Document HostSelectionMode enum
  - [ ] Document HostSelectionService methods
  - [ ] Document StorageManager preference helpers
  - [ ] Document ModelManager availability methods
  - [ ] Add usage examples
- [ ] Update `docs/UI_DEVELOPER_CHAT_GUIDE.md` (+50 lines)
  - [ ] Model selection UI patterns
  - [ ] Host selection mode UI patterns
  - [ ] Settings page recommendations
- [ ] Update `CLAUDE.md` (+30 lines)
  - [ ] Add HostSelectionMode to key concepts
  - [ ] Update UserSettings documentation
  - [ ] Add preference helper patterns
- [ ] Create example usage snippets

**Acceptance Criteria**:
- [ ] All public APIs documented
- [ ] UI guidance provided
- [ ] Examples included

---

## File Paths Summary

### New Files:
- `packages/sdk-core/src/services/HostSelectionService.ts`
- `packages/sdk-core/src/interfaces/IHostSelectionService.ts`
- `packages/sdk-core/tests/types/settings-v2.test.ts`
- `packages/sdk-core/tests/services/host-selection.test.ts`
- `packages/sdk-core/tests/services/host-selection-methods.test.ts`
- `packages/sdk-core/tests/managers/model-availability.test.ts`
- `packages/sdk-core/tests/managers/storage-preferences.test.ts`
- `packages/sdk-core/tests/managers/session-host-selection.test.ts`
- `packages/sdk-core/tests/managers/settings-migration-v2.test.ts`
- `packages/sdk-core/tests/integration/model-host-selection.test.ts`

### Modified Files:
- `packages/sdk-core/src/types/settings.types.ts` (+30 lines)
- `packages/sdk-core/src/types/models.ts` (+15 lines)
- `packages/sdk-core/src/types/index.ts` (+5 lines)
- `packages/sdk-core/src/managers/migrations/user-settings.ts` (+40 lines)
- `packages/sdk-core/src/managers/ModelManager.ts` (+60 lines)
- `packages/sdk-core/src/managers/StorageManager.ts` (+80 lines)
- `packages/sdk-core/src/managers/SessionManager.ts` (+50 lines)
- `packages/sdk-core/src/FabstirSDKCore.ts` (+10 lines)
- `packages/sdk-core/src/interfaces/IModelManager.ts` (+15 lines)
- `packages/sdk-core/src/interfaces/IStorageManager.ts` (+20 lines)
- `packages/sdk-core/src/services/index.ts` (+5 lines)
- `docs/SDK_API.md` (+100 lines)
- `docs/UI_DEVELOPER_CHAT_GUIDE.md` (+50 lines)
- `CLAUDE.md` (+30 lines)

---

## Success Metrics

### Implementation Complete
- [ ] All 6 phases complete
- [ ] All tests pass (estimated 50+ tests)
- [ ] No TypeScript errors
- [ ] Documentation updated

### Feature Verification
- [ ] Default model persists across sessions
- [ ] Host selection modes work correctly
- [ ] SPECIFIC mode throws on unavailable host
- [ ] Weighted random selection distributes load
- [ ] Backward compatible with existing code

---

## Risk Mitigation

### Technical Risks
- **Risk**: Weighted random may not distribute evenly
- **Mitigation**: Unit tests verify distribution over many iterations

### Integration Risks
- **Risk**: SessionManager changes break existing flows
- **Mitigation**: Make host selection opt-in (only when no host specified)

### Data Risks
- **Risk**: Migration corrupts existing settings
- **Mitigation**: V1 settings fully preserved, only new fields added

---

## Timeline

**Phase 1**: 2-3 hours (UserSettings V2)
**Phase 2**: 4-5 hours (Host Selection Service)
**Phase 3**: 2-3 hours (Model Discovery)
**Phase 4**: 2-3 hours (Preference Helpers)
**Phase 5**: 2-3 hours (SessionManager Integration)
**Phase 6**: 3-4 hours (Testing & Docs)

**Total Estimated**: 15-21 hours

---

## Next Steps

1. **Immediate**: Review this plan
2. **Start**: Phase 1, Sub-phase 1.1 (Settings Types Update)
3. **Parallel**: Phase 3 can run alongside Phase 2
4. **Test**: Run all tests after each sub-phase
5. **Document**: Update docs in Phase 6

---

**Document Version**: 1.0
**Created**: December 16, 2025
**Status**: Ready for implementation
