# SDK Update Required: Model Governance System Integration

## Executive Summary

We've deployed a new model governance system that requires significant SDK updates. The system enforces that hosts can only register with pre-approved AI models, improving security and quality control across the Fabstir marketplace. This message outlines the required SDK changes and provides implementation guidance for the model management UI harness.

## New Smart Contracts Deployed

### 1. ModelRegistry Contract (LIVE)
- **Address**: `0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357`
- **Network**: Base Sepolia
- **ABI**: `/docs/compute-contracts-reference/client-abis/ModelRegistry-CLIENT-ABI.json`

### 2. NodeRegistryWithModels Contract (LIVE)
- **Address**: `0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100`
- **Network**: Base Sepolia
- **ABI**: `/docs/compute-contracts-reference/client-abis/NodeRegistryWithModels-CLIENT-ABI.json`

## Currently Approved Models (MVP)

Only these two models are approved for the initial release:

```javascript
const APPROVED_MODELS = {
  TINY_VICUNA: {
    repo: "CohereForAI/TinyVicuna-1B-32k-GGUF",
    file: "tiny-vicuna-1b.q4_k_m.gguf",
    sha256: "329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f",
    modelId: null // Will be calculated
  },
  TINY_LLAMA: {
    repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
    file: "tinyllama-1b.Q4_K_M.gguf",
    sha256: "45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6",
    modelId: null // Will be calculated
  }
}
```

## Required SDK Classes and Methods

### 1. ModelManager Class (NEW)

```typescript
class ModelManager {
  private modelRegistry: Contract;
  private modelCache: Map<string, ModelInfo>;

  constructor(registryAddress: string, provider: Provider) {
    this.modelRegistry = new Contract(registryAddress, ModelRegistryABI, provider);
    this.modelCache = new Map();
  }

  /**
   * Calculate model ID from repo and filename
   * CRITICAL: This must match the node's calculation exactly
   */
  async getModelId(huggingfaceRepo: string, fileName: string): Promise<string> {
    const input = `${huggingfaceRepo}/${fileName}`;
    const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(input));
    return hash;
  }

  /**
   * Check if a model is approved on-chain
   */
  async isModelApproved(modelId: string): Promise<boolean> {
    try {
      const approved = await this.modelRegistry.isModelApproved(modelId);
      return approved;
    } catch (error) {
      console.error('Error checking model approval:', error);
      return false;
    }
  }

  /**
   * Get detailed model information from registry
   */
  async getModelDetails(modelId: string): Promise<ModelInfo | null> {
    if (this.modelCache.has(modelId)) {
      return this.modelCache.get(modelId);
    }

    try {
      const model = await this.modelRegistry.getModel(modelId);
      const info: ModelInfo = {
        modelId,
        huggingfaceRepo: model.huggingfaceRepo,
        fileName: model.fileName,
        sha256Hash: model.sha256Hash,
        approvalTier: model.approvalTier.toNumber(),
        active: model.active,
        timestamp: model.timestamp.toNumber()
      };

      this.modelCache.set(modelId, info);
      return info;
    } catch (error) {
      console.error('Error fetching model details:', error);
      return null;
    }
  }

  /**
   * Get all approved models (for UI display)
   */
  async getAllApprovedModels(): Promise<ModelInfo[]> {
    try {
      const modelIds = await this.modelRegistry.getAllModels();
      const approvedModels: ModelInfo[] = [];

      for (const id of modelIds) {
        const details = await this.getModelDetails(id);
        if (details && details.active) {
          approvedModels.push(details);
        }
      }

      return approvedModels;
    } catch (error) {
      console.error('Error fetching approved models:', error);
      return [];
    }
  }

  /**
   * Verify model file integrity (for UI validation)
   */
  async verifyModelHash(fileContent: ArrayBuffer, expectedHash: string): Promise<boolean> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileContent);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === expectedHash;
  }
}
```

### 2. Enhanced HostManager Class (UPDATE REQUIRED)

```typescript
class HostManager {
  private nodeRegistry: Contract; // NodeRegistryWithModels contract
  private modelManager: ModelManager;

  constructor(
    nodeRegistryAddress: string,
    modelRegistryAddress: string,
    provider: Provider,
    signer?: Signer
  ) {
    this.nodeRegistry = new Contract(
      nodeRegistryAddress,
      NodeRegistryWithModelsABI,
      signer || provider
    );
    this.modelManager = new ModelManager(modelRegistryAddress, provider);
  }

  /**
   * Register a host with validated models
   */
  async registerHost(
    metadata: HostMetadata,
    apiUrl: string,
    supportedModels: ModelSpec[]
  ): Promise<TransactionReceipt> {
    // Validate all models are approved
    const modelIds: string[] = [];

    for (const model of supportedModels) {
      const modelId = await this.modelManager.getModelId(model.repo, model.file);
      const isApproved = await this.modelManager.isModelApproved(modelId);

      if (!isApproved) {
        throw new Error(`Model ${model.file} is not approved in registry`);
      }

      modelIds.push(modelId);
    }

    // Format metadata as JSON (new requirement)
    const metadataJson = JSON.stringify({
      hardware: {
        gpu: metadata.gpu,
        vram: metadata.vram,
        ram: metadata.ram
      },
      capabilities: metadata.capabilities,
      location: metadata.location,
      maxConcurrent: metadata.maxConcurrent,
      costPerToken: metadata.costPerToken
    });

    // Call new registration method
    const tx = await this.nodeRegistry.registerNode(
      metadataJson,
      apiUrl,
      modelIds,
      { value: metadata.stakeAmount }
    );

    return await tx.wait();
  }

  /**
   * Get all hosts supporting a specific model
   */
  async findHostsForModel(modelId: string): Promise<HostInfo[]> {
    try {
      const nodeAddresses = await this.nodeRegistry.getNodesForModel(modelId);
      const hosts: HostInfo[] = [];

      for (const address of nodeAddresses) {
        const info = await this.nodeRegistry.getNodeFullInfo(address);
        hosts.push({
          address,
          apiUrl: info[4],
          metadata: JSON.parse(info[3]),
          supportedModels: info[5],
          isActive: info[1],
          stake: info[2]
        });
      }

      return hosts;
    } catch (error) {
      console.error('Error finding hosts for model:', error);
      return [];
    }
  }

  /**
   * Update host's supported models
   */
  async updateHostModels(
    hostAddress: string,
    newModels: ModelSpec[]
  ): Promise<TransactionReceipt> {
    const modelIds: string[] = [];

    for (const model of newModels) {
      const modelId = await this.modelManager.getModelId(model.repo, model.file);
      const isApproved = await this.modelManager.isModelApproved(modelId);

      if (!isApproved) {
        throw new Error(`Model ${model.file} is not approved`);
      }

      modelIds.push(modelId);
    }

    const tx = await this.nodeRegistry.updateNodeModels(hostAddress, modelIds);
    return await tx.wait();
  }
}
```

### 3. Enhanced ClientManager Class (UPDATE REQUIRED)

```typescript
class ClientManager {
  private modelManager: ModelManager;
  private hostManager: HostManager;

  /**
   * Select best host for a specific model
   */
  async selectHostForModel(
    modelSpec: ModelSpec,
    requirements?: {
      minVRAM?: number;
      location?: string;
      maxCostPerToken?: number;
    }
  ): Promise<HostInfo | null> {
    const modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);

    // Check model is approved
    if (!await this.modelManager.isModelApproved(modelId)) {
      throw new Error(`Model ${modelSpec.file} is not approved`);
    }

    // Find all hosts with this model
    const hosts = await this.hostManager.findHostsForModel(modelId);

    // Filter by requirements
    const suitableHosts = hosts.filter(host => {
      if (!host.isActive) return false;
      if (requirements?.minVRAM && host.metadata.hardware.vram < requirements.minVRAM) return false;
      if (requirements?.location && host.metadata.location !== requirements.location) return false;
      if (requirements?.maxCostPerToken && host.metadata.costPerToken > requirements.maxCostPerToken) return false;
      return true;
    });

    if (suitableHosts.length === 0) {
      return null;
    }

    // Sort by some criteria (e.g., cost, reputation)
    suitableHosts.sort((a, b) => a.metadata.costPerToken - b.metadata.costPerToken);

    return suitableHosts[0];
  }

  /**
   * Create inference job with model validation
   */
  async createInferenceJob(
    modelSpec: ModelSpec,
    prompt: string,
    maxTokens: number,
    hostAddress?: string
  ): Promise<JobInfo> {
    // If no host specified, find one
    if (!hostAddress) {
      const host = await this.selectHostForModel(modelSpec);
      if (!host) {
        throw new Error(`No hosts available for model ${modelSpec.file}`);
      }
      hostAddress = host.address;
    }

    // Verify host supports the model
    const modelId = await this.modelManager.getModelId(modelSpec.repo, modelSpec.file);
    const hostInfo = await this.hostManager.findHostsForModel(modelId);

    if (!hostInfo.some(h => h.address === hostAddress)) {
      throw new Error(`Host ${hostAddress} does not support model ${modelSpec.file}`);
    }

    // Create job on blockchain (existing JobMarketplace integration)
    // ... existing job creation code ...

    return jobInfo;
  }
}
```

## API Methods for Model Management UI

The UI harness will need these specific methods exposed:

### 1. Model Discovery & Validation

```typescript
interface ModelManagementAPI {
  // Get all approved models from registry
  getApprovedModels(): Promise<ModelInfo[]>;

  // Calculate model ID for display
  calculateModelId(repo: string, filename: string): string;

  // Check if a specific model is approved
  checkModelApproval(modelId: string): Promise<boolean>;

  // Get detailed info about a model
  getModelInfo(modelId: string): Promise<ModelInfo | null>;

  // Verify a model file's hash (for upload validation)
  verifyModelFile(file: File, expectedHash: string): Promise<boolean>;
}
```

### 2. Host Management

```typescript
interface HostManagementAPI {
  // Find all hosts supporting a model
  findHostsByModel(modelId: string): Promise<HostInfo[]>;

  // Get host's supported models
  getHostModels(hostAddress: string): Promise<string[]>;

  // Register new host (for host operators)
  registerHost(
    metadata: HostMetadata,
    apiUrl: string,
    modelFiles: ModelSpec[]
  ): Promise<TransactionReceipt>;

  // Update host's model list
  updateHostModels(
    hostAddress: string,
    newModels: ModelSpec[]
  ): Promise<TransactionReceipt>;

  // Get host registration status
  getHostStatus(hostAddress: string): Promise<{
    isRegistered: boolean;
    isActive: boolean;
    supportedModels: string[];
    stake: BigNumber;
  }>;
}
```

### 3. Client Operations

```typescript
interface ClientOperationsAPI {
  // Find best host for a model with filters
  selectHost(
    modelId: string,
    filters: {
      maxPrice?: number;
      minVRAM?: number;
      location?: string;
    }
  ): Promise<HostInfo | null>;

  // Get model availability across network
  getModelAvailability(modelId: string): Promise<{
    totalHosts: number;
    activeHosts: number;
    averagePrice: number;
    locations: string[];
  }>;

  // Estimate job cost for a model
  estimateJobCost(
    modelId: string,
    maxTokens: number
  ): Promise<{
    minCost: number;
    maxCost: number;
    averageCost: number;
  }>;
}
```

## UI Harness Requirements

For your model management UI page, you'll need these components:

### 1. Model Registry View
```typescript
// Display all approved models
const models = await modelManager.getAllApprovedModels();
// Show: name, repo, hash, approval tier, active status
```

### 2. Model Validation Tool
```typescript
// User uploads a GGUF file
const file = fileInput.files[0];
const buffer = await file.arrayBuffer();
const isValid = await modelManager.verifyModelHash(buffer, expectedHash);
```

### 3. Host Discovery Panel
```typescript
// User selects a model
const modelId = await modelManager.getModelId(repo, filename);
const hosts = await hostManager.findHostsForModel(modelId);
// Display host list with metadata, pricing, location
```

### 4. Host Registration Form
```typescript
// Host operator registers with models
const metadata = {
  gpu: "RTX 4090",
  vram: 24,
  ram: 64,
  capabilities: ["inference", "streaming"],
  location: "us-east",
  maxConcurrent: 5,
  costPerToken: 0.0001
};

const models = [
  APPROVED_MODELS.TINY_VICUNA,
  APPROVED_MODELS.TINY_LLAMA
];

await hostManager.registerHost(metadata, apiUrl, models);
```

## Migration Path & Timeline

### Phase 1: Immediate (This Week)
1. Add ModelManager class to SDK
2. Update contract ABIs
3. Calculate and store model IDs for approved models
4. Add model validation to existing flows

### Phase 2: Next Sprint
1. Update HostManager with new registration method
2. Migrate existing hosts to new registry
3. Update ClientManager with model-based host selection
4. Deploy UI harness for testing

### Phase 3: Production (2 Weeks)
1. Deprecate old NodeRegistry
2. Require all hosts to use NodeRegistryWithModels
3. Enable model governance in production UI

## Breaking Changes

1. **Host Registration**: Now requires model IDs, not model names
2. **Metadata Format**: Must be JSON, not comma-separated strings
3. **Model Validation**: All models must be pre-approved in registry
4. **API URL Required**: Hosts must provide their API endpoint

## Testing Considerations

### Unit Tests Required
```typescript
describe('ModelManager', () => {
  it('should calculate correct model IDs', async () => {
    const id = await modelManager.getModelId(
      "CohereForAI/TinyVicuna-1B-32k-GGUF",
      "tiny-vicuna-1b.q4_k_m.gguf"
    );
    expect(id).toBe(expectedHash);
  });

  it('should validate approved models', async () => {
    const approved = await modelManager.isModelApproved(validModelId);
    expect(approved).toBe(true);
  });

  it('should reject unapproved models', async () => {
    const approved = await modelManager.isModelApproved(invalidModelId);
    expect(approved).toBe(false);
  });
});
```

### Integration Tests Required
```typescript
describe('Host Registration with Models', () => {
  it('should register host with approved models', async () => {
    const tx = await hostManager.registerHost(metadata, apiUrl, [
      APPROVED_MODELS.TINY_VICUNA
    ]);
    expect(tx.status).toBe(1);
  });

  it('should reject registration with unapproved models', async () => {
    await expect(
      hostManager.registerHost(metadata, apiUrl, [{
        repo: "fake/model",
        file: "fake.gguf"
      }])
    ).rejects.toThrow('not approved');
  });
});
```

## Error Handling

Implement proper error messages for common scenarios:

```typescript
enum ModelRegistryErrors {
  MODEL_NOT_APPROVED = "Model is not approved in the registry",
  INVALID_MODEL_ID = "Invalid model ID format",
  MODEL_NOT_FOUND = "Model not found in registry",
  HASH_MISMATCH = "Model file hash does not match registry",
  NO_HOSTS_AVAILABLE = "No hosts available for this model",
  INSUFFICIENT_STAKE = "Host stake below minimum requirement",
  REGISTRATION_FAILED = "Failed to register host with models"
}
```

## Documentation & Support

- Full documentation: `/docs/MODEL_GOVERNANCE.md`
- Quick start guide: `/docs/MODEL_GOVERNANCE_QUICKSTART.md`
- API updates: `/docs/API.md` (v1.3 section)
- Contract ABIs: `/docs/compute-contracts-reference/client-abis/`

## Questions to Address

1. **Backwards Compatibility**: How long should we support the old NodeRegistry?
2. **Model Updates**: Process for adding new approved models?
3. **Governance**: Who controls model approval (DAO, multisig, owner)?
4. **Penalties**: Should hosts be slashed for serving unapproved models?
5. **Caching**: How aggressively should we cache model registry data?

## Action Items

### Immediate (Your SDK Developer):
1. [ ] Implement ModelManager class
2. [ ] Update HostManager with new registration flow
3. [ ] Add model validation to ClientManager
4. [ ] Create comprehensive test suite
5. [ ] Update SDK documentation

### For You (UI Harness):
1. [ ] Design model management UI components
2. [ ] Create model upload/validation interface
3. [ ] Build host discovery dashboard
4. [ ] Implement registration workflow
5. [ ] Add monitoring for model usage

## Contact & Resources

- ModelRegistry: [0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357](https://sepolia.basescan.org/address/0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357)
- NodeRegistryWithModels: [0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100](https://sepolia.basescan.org/address/0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100)
- Test ETH: Use Base Sepolia faucet
- Model Files: HuggingFace repos listed above

Please prioritize the ModelManager implementation as it's the foundation for all other changes. The UI harness will be essential for testing these features before production deployment.

Let me know if you need any clarification or have questions about the implementation!