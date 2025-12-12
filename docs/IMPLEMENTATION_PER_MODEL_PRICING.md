# Per-Model Pricing Implementation Plan

## Overview

Add support for per-model pricing in the Fabstir SDK (`@fabstir/sdk-core`) and test harness UI, allowing hosts to set custom prices for individual models that override their default host-level pricing.

**Feature**: Hosts can set different prices for different models (e.g., charge more for larger models).

## Contract Functions (Already Deployed)

The NodeRegistryWithModels contract already supports per-model pricing:

| Function | Type | Description |
|----------|------|-------------|
| `setModelPricing(bytes32 modelId, uint256 nativePrice, uint256 stablePrice)` | Write | Set custom price for a model (0 = use default) |
| `clearModelPricing(bytes32 modelId)` | Write | Revert model to default pricing |
| `getHostModelPrices(address operator)` | Read | Get all models with their effective prices |
| `getModelPricing(address operator, bytes32 modelId, address token)` | Read | Get effective price for a specific model |

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

## Current State

| Component | Status |
|-----------|--------|
| Contract | ✅ Full per-model pricing support deployed |
| SDK (HostManager) | ✅ All 4 per-model pricing methods complete |
| UI (NodeManagementClient) | ❌ Only host default pricing inputs |

---

## Phase 1: SDK Types

### Sub-phase 1.1: Add ModelPricing Type ✅ COMPLETE
**Goal**: Define TypeScript types for per-model pricing

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/types/model-pricing.test.ts` (40 lines)
- [x] Add `ModelPricing` interface to `packages/sdk-core/src/types/models.ts`
- [x] Export type from `packages/sdk-core/src/types/index.ts`
- [x] Export type from `packages/sdk-core/src/index.ts` (via existing `export * from './types/models'`)

**Result**: 5/5 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
import { ModelPricing } from '@fabstir/sdk-core';

// Type should have correct shape
const pricing: ModelPricing = {
  modelId: '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced',
  nativePrice: 3000000n,
  stablePrice: 50000n,
  isCustom: true
};

expect(pricing.modelId).toBeDefined();
expect(typeof pricing.nativePrice).toBe('bigint');
expect(typeof pricing.stablePrice).toBe('bigint');
expect(typeof pricing.isCustom).toBe('boolean');
```

**File Changes** (15 lines max):
```typescript
// packages/sdk-core/src/types/models.ts
/**
 * Per-model pricing information
 * Hosts can set custom prices for individual models
 */
export interface ModelPricing {
  /** Model ID (bytes32 hash) */
  modelId: string;
  /** Native token price (ETH/BNB) with PRICE_PRECISION */
  nativePrice: bigint;
  /** Stablecoin price (USDC) with PRICE_PRECISION */
  stablePrice: bigint;
  /** True if custom override, false if using host default */
  isCustom: boolean;
}
```

---

## Phase 2: SDK Methods - Write Operations

### Sub-phase 2.1: Add setModelPricing() Method ✅ COMPLETE
**Goal**: Implement SDK method to set per-model pricing

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/managers/host-model-pricing-set.test.ts` (100 lines)
- [x] Add `setModelPricing()` method to `packages/sdk-core/src/managers/HostManager.ts`
- [x] Validate price ranges (0 = use default, or within MIN/MAX bounds)
- [x] Call contract `setModelPricing()` function
- [x] Return transaction hash

**Result**: 9/9 tests passing

**Test Requirements**:
```typescript
// Tests must verify:
describe('setModelPricing', () => {
  it('should set custom pricing for a supported model', async () => {
    const modelId = '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced';
    const txHash = await hostManager.setModelPricing(modelId, '5000000', '75000');
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('should reject pricing for unsupported model', async () => {
    const unsupportedModelId = '0x1234567890abcdef...';
    await expect(hostManager.setModelPricing(unsupportedModelId, '5000000', '75000'))
      .rejects.toThrow('Model not supported');
  });

  it('should accept 0 values (use default)', async () => {
    const modelId = TINY_VICUNA_MODEL_ID;
    const txHash = await hostManager.setModelPricing(modelId, '0', '0');
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('should validate price ranges', async () => {
    const modelId = TINY_VICUNA_MODEL_ID;
    await expect(hostManager.setModelPricing(modelId, '100', '200000000'))
      .rejects.toThrow('price');
  });
});
```

**File Changes** (60 lines max):
```typescript
// packages/sdk-core/src/managers/HostManager.ts

/**
 * Set custom pricing for a specific model
 * @param modelId - Model ID (bytes32 hash)
 * @param nativePrice - Native token price (0 = use default, or MIN_PRICE_NATIVE to MAX_PRICE_NATIVE)
 * @param stablePrice - Stablecoin price (0 = use default, or MIN_PRICE_STABLE to MAX_PRICE_STABLE)
 * @returns Transaction hash
 */
async setModelPricing(
  modelId: string,
  nativePrice: string,
  stablePrice: string
): Promise<string> {
  if (!this.initialized || !this.signer || !this.nodeRegistry) {
    throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
  }

  try {
    const priceNative = BigInt(nativePrice);
    const priceStable = BigInt(stablePrice);

    // Validate price ranges (0 is allowed = use default)
    if (priceNative !== 0n && (priceNative < MIN_PRICE_NATIVE || priceNative > MAX_PRICE_NATIVE)) {
      throw new PricingValidationError(
        `nativePrice must be 0 (default) or between ${MIN_PRICE_NATIVE} and ${MAX_PRICE_NATIVE}`,
        priceNative
      );
    }

    if (priceStable !== 0n && (priceStable < MIN_PRICE_STABLE || priceStable > MAX_PRICE_STABLE)) {
      throw new PricingValidationError(
        `stablePrice must be 0 (default) or between ${MIN_PRICE_STABLE} and ${MAX_PRICE_STABLE}`,
        priceStable
      );
    }

    const tx = await this.nodeRegistry.setModelPricing(
      modelId,
      priceNative,
      priceStable,
      { gasLimit: 200000n }
    );

    const receipt = await tx.wait(3);
    if (!receipt || receipt.status !== 1) {
      throw new ModelRegistryError('Set model pricing transaction failed', this.nodeRegistry.address);
    }

    return receipt.hash;
  } catch (error: any) {
    if (error instanceof PricingValidationError || error instanceof SDKError) {
      throw error;
    }
    throw new ModelRegistryError(
      `Failed to set model pricing: ${error.message}`,
      this.nodeRegistry?.address
    );
  }
}
```

### Sub-phase 2.2: Add clearModelPricing() Method ✅ COMPLETE
**Goal**: Implement SDK method to clear per-model pricing (revert to default)

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/managers/host-model-pricing-clear.test.ts` (60 lines)
- [x] Add `clearModelPricing()` method to `packages/sdk-core/src/managers/HostManager.ts`
- [x] Call contract `clearModelPricing()` function
- [x] Return transaction hash

**Result**: 8/8 tests passing (22 total per-model pricing tests)

**Test Requirements**:
```typescript
// Tests must verify:
describe('clearModelPricing', () => {
  it('should clear custom pricing for a model', async () => {
    const modelId = TINY_VICUNA_MODEL_ID;
    const txHash = await hostManager.clearModelPricing(modelId);
    expect(txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
  });

  it('should succeed even if no custom pricing was set', async () => {
    const modelId = TINY_VICUNA_MODEL_ID;
    const txHash = await hostManager.clearModelPricing(modelId);
    expect(txHash).toBeDefined();
  });
});
```

**File Changes** (35 lines max):
```typescript
// packages/sdk-core/src/managers/HostManager.ts

/**
 * Clear custom pricing for a model (revert to host default)
 * @param modelId - Model ID (bytes32 hash)
 * @returns Transaction hash
 */
async clearModelPricing(modelId: string): Promise<string> {
  if (!this.initialized || !this.signer || !this.nodeRegistry) {
    throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
  }

  try {
    const tx = await this.nodeRegistry.clearModelPricing(
      modelId,
      { gasLimit: 150000n }
    );

    const receipt = await tx.wait(3);
    if (!receipt || receipt.status !== 1) {
      throw new ModelRegistryError('Clear model pricing transaction failed', this.nodeRegistry.address);
    }

    return receipt.hash;
  } catch (error: any) {
    if (error instanceof SDKError) {
      throw error;
    }
    throw new ModelRegistryError(
      `Failed to clear model pricing: ${error.message}`,
      this.nodeRegistry?.address
    );
  }
}
```

---

## Phase 3: SDK Methods - Read Operations

### Sub-phase 3.1: Add getHostModelPrices() Method ✅ COMPLETE
**Goal**: Implement SDK method to get all model prices for a host

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/managers/host-model-pricing-get-all.test.ts` (80 lines)
- [x] Add `getHostModelPrices()` method to `packages/sdk-core/src/managers/HostManager.ts`
- [x] Call contract `getHostModelPrices()` function
- [x] Transform response to `ModelPricing[]` array
- [x] Determine `isCustom` flag by comparing to host defaults

**Result**: 7/7 tests passing (29 total per-model pricing tests)

**Test Requirements**:
```typescript
// Tests must verify:
describe('getHostModelPrices', () => {
  it('should return array of model pricing', async () => {
    const prices = await hostManager.getHostModelPrices(hostAddress);
    expect(Array.isArray(prices)).toBe(true);
    expect(prices.length).toBeGreaterThan(0);

    const price = prices[0];
    expect(price.modelId).toMatch(/^0x[a-fA-F0-9]{64}$/);
    expect(typeof price.nativePrice).toBe('bigint');
    expect(typeof price.stablePrice).toBe('bigint');
    expect(typeof price.isCustom).toBe('boolean');
  });

  it('should return empty array for unregistered host', async () => {
    const prices = await hostManager.getHostModelPrices(ethers.ZeroAddress);
    expect(prices).toEqual([]);
  });

  it('should mark custom prices correctly', async () => {
    // Set custom price first
    await hostManager.setModelPricing(TINY_VICUNA_MODEL_ID, '0', '75000');

    const prices = await hostManager.getHostModelPrices(hostAddress);
    const tinyVicunaPrice = prices.find(p => p.modelId === TINY_VICUNA_MODEL_ID);
    expect(tinyVicunaPrice?.isCustom).toBe(true);
  });
});
```

**File Changes** (55 lines max):
```typescript
// packages/sdk-core/src/managers/HostManager.ts

/**
 * Get all model prices for a host
 * @param hostAddress - Host's EVM address
 * @returns Array of ModelPricing objects
 */
async getHostModelPrices(hostAddress: string): Promise<ModelPricing[]> {
  if (!this.initialized || !this.nodeRegistry) {
    throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
  }

  try {
    // Get host defaults for comparison
    const hostStatus = await this.getHostStatus(hostAddress);
    const defaultNative = hostStatus.minPricePerTokenNative || 0n;
    const defaultStable = hostStatus.minPricePerTokenStable || 0n;

    // Get all model prices from contract
    const [modelIds, nativePrices, stablePrices] = await this.nodeRegistry.getHostModelPrices(hostAddress);

    const result: ModelPricing[] = [];
    for (let i = 0; i < modelIds.length; i++) {
      const nativePrice = nativePrices[i] || 0n;
      const stablePrice = stablePrices[i] || 0n;

      // Check if custom (different from host default)
      // Note: Contract returns effective prices, so we compare to defaults
      const isCustom = nativePrice !== defaultNative || stablePrice !== defaultStable;

      result.push({
        modelId: modelIds[i],
        nativePrice: BigInt(nativePrice),
        stablePrice: BigInt(stablePrice),
        isCustom
      });
    }

    return result;
  } catch (error: any) {
    console.error('Error fetching host model prices:', error);
    return [];
  }
}
```

### Sub-phase 3.2: Add getModelPricing() Method ✅ COMPLETE
**Goal**: Implement SDK method to get effective price for a specific model

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/managers/host-model-pricing-get-single.test.ts` (60 lines)
- [x] Add `getModelPricing()` method to `packages/sdk-core/src/managers/HostManager.ts`
- [x] Call contract `getModelPricing()` function
- [x] Return effective price (custom or default fallback)

**Result**: 8/8 tests passing (37 total per-model pricing tests)

**Test Requirements**:
```typescript
// Tests must verify:
describe('getModelPricing', () => {
  it('should return effective price for model (native)', async () => {
    const price = await hostManager.getModelPricing(
      hostAddress,
      TINY_VICUNA_MODEL_ID,
      ethers.ZeroAddress // Native
    );
    expect(typeof price).toBe('bigint');
    expect(price).toBeGreaterThan(0n);
  });

  it('should return effective price for model (USDC)', async () => {
    const price = await hostManager.getModelPricing(
      hostAddress,
      TINY_VICUNA_MODEL_ID,
      USDC_TOKEN_ADDRESS
    );
    expect(typeof price).toBe('bigint');
    expect(price).toBeGreaterThan(0n);
  });

  it('should return custom price when set', async () => {
    // Set custom price
    await hostManager.setModelPricing(TINY_VICUNA_MODEL_ID, '0', '75000');

    const price = await hostManager.getModelPricing(
      hostAddress,
      TINY_VICUNA_MODEL_ID,
      USDC_TOKEN_ADDRESS
    );
    expect(price).toBe(75000n);
  });
});
```

**File Changes** (30 lines max):
```typescript
// packages/sdk-core/src/managers/HostManager.ts

/**
 * Get effective pricing for a specific model
 * @param hostAddress - Host's EVM address
 * @param modelId - Model ID (bytes32 hash)
 * @param tokenAddress - Token address (ZeroAddress for native, USDC address for stable)
 * @returns Effective price (custom if set, otherwise default)
 */
async getModelPricing(
  hostAddress: string,
  modelId: string,
  tokenAddress: string
): Promise<bigint> {
  if (!this.initialized || !this.nodeRegistry) {
    throw new SDKError('HostManager not initialized', 'HOST_NOT_INITIALIZED');
  }

  try {
    const price = await this.nodeRegistry.getModelPricing(hostAddress, modelId, tokenAddress);
    return BigInt(price);
  } catch (error: any) {
    console.error('Error fetching model pricing:', error);
    return 0n;
  }
}
```

---

## Phase 4: SDK Version & Exports

### Sub-phase 4.1: Update Exports ✅ COMPLETE
**Goal**: Export new methods and types from SDK

**Tasks**:
- [x] Write tests in `packages/sdk-core/tests/exports/model-pricing-exports.test.ts` (30 lines)
- [x] Verify `ModelPricing` type is exported from `@fabstir/sdk-core`
- [x] Verify new methods are accessible via HostManager

**Result**: 5/5 tests passing (42 total per-model pricing tests)

**Test Requirements**:
```typescript
// Tests must verify:
import { ModelPricing } from '@fabstir/sdk-core';
import type { HostManager } from '@fabstir/sdk-core';

// Type should be importable
const pricing: ModelPricing = { ... };

// Methods should exist on HostManager
const hm: HostManager = sdk.getHostManager();
expect(typeof hm.setModelPricing).toBe('function');
expect(typeof hm.clearModelPricing).toBe('function');
expect(typeof hm.getHostModelPrices).toBe('function');
expect(typeof hm.getModelPricing).toBe('function');
```

**File Changes** (5 lines max):
```typescript
// packages/sdk-core/src/types/index.ts
export { ModelPricing } from './models';

// packages/sdk-core/src/index.ts
// ModelPricing is already exported via types barrel export
```

### Sub-phase 4.2: Bump SDK Version
**Goal**: Update SDK version to indicate new feature

**Tasks**:
- [ ] Update `packages/sdk-core/package.json` version to 1.5.4

**File Changes** (1 line):
```json
{
  "version": "1.5.4"
}
```

---

## Phase 5: UI Implementation - State & Functions

### Sub-phase 5.1: Add State Variables
**Goal**: Add React state for per-model pricing in NodeManagementClient

**Tasks**:
- [ ] Add state variables for selected model, price inputs, and cached prices
- [ ] Add useEffect to fetch model prices when nodeInfo updates

**File Changes** (25 lines max):
```typescript
// apps/harness/components/NodeManagementClient.tsx

// Per-model pricing state
const [selectedModelForPricing, setSelectedModelForPricing] = useState<string>('');
const [modelPriceNative, setModelPriceNative] = useState('');
const [modelPriceStable, setModelPriceStable] = useState('');
const [hostModelPrices, setHostModelPrices] = useState<any[]>([]);
const [loadingModelPrices, setLoadingModelPrices] = useState(false);

// Fetch model prices when node info loads
useEffect(() => {
  if (sdk && nodeInfo?.supportedModels?.length > 0 && walletAddress) {
    fetchHostModelPrices();
  }
}, [sdk, nodeInfo, walletAddress]);
```

### Sub-phase 5.2: Add Action Functions
**Goal**: Add functions for setting/clearing model prices

**Tasks**:
- [ ] Add `fetchHostModelPrices()` function
- [ ] Add `handleSetModelPricing()` function
- [ ] Add `handleClearModelPricing()` function
- [ ] Add model name helper function

**File Changes** (80 lines max):
```typescript
// apps/harness/components/NodeManagementClient.tsx

// Fetch all model prices for the connected host
const fetchHostModelPrices = async () => {
  if (!sdk || !walletAddress) return;

  setLoadingModelPrices(true);
  try {
    const hostManager = sdk.getHostManager();
    const prices = await hostManager.getHostModelPrices(walletAddress);
    setHostModelPrices(prices);
    addLog(`📊 Fetched ${prices.length} model prices`);
  } catch (error: any) {
    addLog(`❌ Failed to fetch model prices: ${error.message}`);
  } finally {
    setLoadingModelPrices(false);
  }
};

// Set custom pricing for selected model
const handleSetModelPricing = async () => {
  if (!sdk || !selectedModelForPricing) {
    addLog('❌ Select a model first');
    return;
  }

  setLoading(true);
  try {
    addLog(`💰 Setting pricing for model ${selectedModelForPricing.slice(0, 10)}...`);

    const hostManager = sdk.getHostManager();
    const txHash = await hostManager.setModelPricing(
      selectedModelForPricing,
      modelPriceNative || '0',
      modelPriceStable || '0'
    );

    addLog(`✅ Model pricing set! TX: ${txHash}`);

    // Refresh model prices
    await fetchHostModelPrices();
  } catch (error: any) {
    addLog(`❌ Failed to set model pricing: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

// Clear custom pricing for selected model
const handleClearModelPricing = async () => {
  if (!sdk || !selectedModelForPricing) {
    addLog('❌ Select a model first');
    return;
  }

  setLoading(true);
  try {
    addLog(`🔄 Clearing custom pricing for model ${selectedModelForPricing.slice(0, 10)}...`);

    const hostManager = sdk.getHostManager();
    const txHash = await hostManager.clearModelPricing(selectedModelForPricing);

    addLog(`✅ Model pricing cleared! TX: ${txHash}`);

    // Refresh model prices
    await fetchHostModelPrices();
  } catch (error: any) {
    addLog(`❌ Failed to clear model pricing: ${error.message}`);
  } finally {
    setLoading(false);
  }
};

// Helper to get model name from ID
const getModelNameFromId = (modelId: string): string => {
  const knownModels: Record<string, string> = {
    '0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced': 'TinyVicuna-1B',
    '0x14843424179fbcb9aeb7fd446fa97143300609757bd49ffb3ec7fb2f75aed1ca': 'TinyLlama-1.1B',
    '0x7583557c14f71d2bf21d48ffb7cde9329f9494090869d2d311ea481b26e7e06c': 'GPT-OSS-20B'
  };
  return knownModels[modelId] || `${modelId.slice(0, 10)}...`;
};
```

---

## Phase 6: UI Implementation - Components

### Sub-phase 6.1: Add Per-Model Pricing UI Section
**Goal**: Add UI section for per-model pricing management

**Tasks**:
- [ ] Add model selector dropdown
- [ ] Add native/stable price inputs
- [ ] Add Set/Clear buttons
- [ ] Add model prices table

**File Changes** (120 lines max):
```tsx
// apps/harness/components/NodeManagementClient.tsx
// Add after the "Update Pricing" section (around line 2130)

{/* Per-Model Pricing Section */}
{isRegistered && nodeInfo?.supportedModels?.length > 0 && (
  <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px', backgroundColor: '#fafafa' }}>
    <h4 style={{ marginBottom: '15px' }}>📦 Per-Model Pricing (Optional Overrides)</h4>

    {/* Model Selector */}
    <div style={{ marginBottom: '15px' }}>
      <label>Select Model:</label><br />
      <select
        value={selectedModelForPricing}
        onChange={(e) => setSelectedModelForPricing(e.target.value)}
        style={{ padding: '8px', width: '100%', maxWidth: '400px' }}
      >
        <option value="">-- Select a model --</option>
        {nodeInfo.supportedModels.map((modelId: string) => (
          <option key={modelId} value={modelId}>
            {getModelNameFromId(modelId)}
          </option>
        ))}
      </select>
    </div>

    {/* Price Inputs */}
    {selectedModelForPricing && (
      <div style={{ marginBottom: '15px' }}>
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <div>
            <label>Native Price (0 = use default):</label><br />
            <input
              type="text"
              value={modelPriceNative}
              onChange={(e) => setModelPriceNative(e.target.value)}
              placeholder="0"
              style={{ padding: '8px', width: '150px', fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <label>Stable Price (0 = use default):</label><br />
            <input
              type="text"
              value={modelPriceStable}
              onChange={(e) => setModelPriceStable(e.target.value)}
              placeholder="0"
              style={{ padding: '8px', width: '150px', fontFamily: 'monospace' }}
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
          <button
            onClick={handleSetModelPricing}
            disabled={loading}
            style={{ padding: '8px 15px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Setting...' : 'Set Model Price'}
          </button>
          <button
            onClick={handleClearModelPricing}
            disabled={loading}
            style={{ padding: '8px 15px', backgroundColor: '#ff9800', color: 'white', border: 'none', borderRadius: '4px', cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Clearing...' : 'Clear to Default'}
          </button>
        </div>
      </div>
    )}

    {/* Model Prices Table */}
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <strong>Current Model Prices:</strong>
        <button
          onClick={fetchHostModelPrices}
          disabled={loadingModelPrices}
          style={{ padding: '4px 10px', fontSize: '12px' }}
        >
          {loadingModelPrices ? '...' : '🔄 Refresh'}
        </button>
      </div>

      {hostModelPrices.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #ddd' }}>Model</th>
              <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>Native Price</th>
              <th style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd' }}>Stable Price</th>
              <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>Custom?</th>
            </tr>
          </thead>
          <tbody>
            {hostModelPrices.map((price: any) => (
              <tr key={price.modelId}>
                <td style={{ padding: '8px', border: '1px solid #ddd' }}>
                  {getModelNameFromId(price.modelId)}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontFamily: 'monospace' }}>
                  {price.nativePrice.toString()}
                </td>
                <td style={{ padding: '8px', textAlign: 'right', border: '1px solid #ddd', fontFamily: 'monospace' }}>
                  {price.stablePrice.toString()}
                  {' '}
                  <span style={{ color: '#666', fontSize: '11px' }}>
                    (${(Number(price.stablePrice) / 1000).toFixed(3)}/M)
                  </span>
                </td>
                <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #ddd' }}>
                  {price.isCustom ? '✅' : '➖'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ color: '#666', fontStyle: 'italic' }}>
          {loadingModelPrices ? 'Loading...' : 'No model prices loaded. Click Refresh to load.'}
        </div>
      )}
    </div>
  </div>
)}
```

---

## Phase 7: Build & Integration Testing

### Sub-phase 7.1: Build SDK
**Goal**: Build and verify SDK compiles correctly

**Tasks**:
- [ ] Run `cd packages/sdk-core && pnpm build`
- [ ] Verify no TypeScript errors
- [ ] Verify all exports work

**Commands**:
```bash
cd packages/sdk-core
pnpm build
```

### Sub-phase 7.2: Manual Testing
**Goal**: Test per-model pricing in harness UI

**Tasks**:
- [ ] Start harness: `cd apps/harness && pnpm dev`
- [ ] Connect with TEST_HOST_1 account
- [ ] Navigate to Node Management page
- [ ] Verify model selector shows supported models
- [ ] Set custom price for TinyVicuna model
- [ ] Verify table shows custom price with ✅
- [ ] Clear custom price
- [ ] Verify table shows default price with ➖

**Test Checklist**:
```
- [ ] Model dropdown populated from host's supported models
- [ ] Can enter native and stable prices
- [ ] "Set Model Price" button works
- [ ] "Clear to Default" button works
- [ ] Prices table shows correct values
- [ ] isCustom indicator (✅/➖) is correct
- [ ] Refresh button updates table
- [ ] Error messages shown for failures
```

---

## Success Criteria

1. **Types Defined**: `ModelPricing` interface exported from SDK
2. **Write Methods**: `setModelPricing()` and `clearModelPricing()` work correctly
3. **Read Methods**: `getHostModelPrices()` and `getModelPricing()` return correct data
4. **UI Functional**: Can set, view, and clear model prices in harness
5. **Tests Pass**: All new tests pass
6. **Build Works**: SDK builds without errors

## Files Summary

| File | Changes |
|------|---------|
| `packages/sdk-core/src/types/models.ts` | Add `ModelPricing` interface |
| `packages/sdk-core/src/types/index.ts` | Export `ModelPricing` |
| `packages/sdk-core/src/managers/HostManager.ts` | Add 4 new methods (~180 lines) |
| `packages/sdk-core/package.json` | Version 1.5.4 |
| `apps/harness/components/NodeManagementClient.tsx` | Add per-model pricing UI (~225 lines) |

## Test Files Summary

| File | Tests |
|------|-------|
| `packages/sdk-core/tests/types/model-pricing.test.ts` | Type validation |
| `packages/sdk-core/tests/managers/host-model-pricing-set.test.ts` | setModelPricing() |
| `packages/sdk-core/tests/managers/host-model-pricing-clear.test.ts` | clearModelPricing() |
| `packages/sdk-core/tests/managers/host-model-pricing-get-all.test.ts` | getHostModelPrices() |
| `packages/sdk-core/tests/managers/host-model-pricing-get-single.test.ts` | getModelPricing() |
| `packages/sdk-core/tests/exports/model-pricing-exports.test.ts` | Export verification |

---

*Created: December 2025*
*Based on NodeRegistryWithModels contract per-model pricing support*
*SDK Version: 1.5.4*
