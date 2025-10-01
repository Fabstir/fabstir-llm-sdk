# Model Governance Integration Guide

## Overview

The Fabstir LLM SDK now includes comprehensive model governance features that ensure only pre-approved AI models can be used in the marketplace. This system provides quality control, security validation, and standardization across the P2P network.

## Architecture

### Smart Contracts

1. **ModelRegistry Contract** (`0xfE54c2aa68A7Afe8E0DD571933B556C8b6adC357`)
   - Stores approved model specifications
   - Validates model IDs using Keccak256 hashing
   - Manages approval tiers (Standard, Premium, Enterprise)
   - Enforces SHA-256 hash validation for model integrity

2. **NodeRegistryWithModels Contract** (`0xaa14Ed58c3EF9355501bc360E5F09Fb9EC8c1100`)
   - Enhanced host registry with model ID support
   - Replaces comma-separated metadata with structured JSON
   - Validates all registered models against ModelRegistry
   - Prevents hosts from claiming unsupported models

### SDK Components

#### ModelManager (`packages/sdk-core/src/managers/ModelManager.ts`)
Core manager for model validation and registry operations:

```typescript
const modelManager = new ModelManager(provider, modelRegistryAddress);

// Calculate model ID (matches node implementation)
const modelId = await modelManager.getModelId(
  "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
  "tinyllama-1b.Q4_K_M.gguf"
);

// Check if model is approved
const isApproved = await modelManager.isModelApproved(modelId);

// Get full model information
const modelInfo = await modelManager.getModelInfo(modelId);
```

#### HostManagerEnhanced (`packages/sdk-core/src/managers/HostManagerEnhanced.ts`)
Enhanced host management with model validation:

```typescript
const hostManager = new HostManagerEnhanced(signer, registryAddress, modelManager);

// Register host with approved models only
await hostManager.registerHostWithModels({
  nodeUrl: "http://localhost:8080",
  supportedModels: [
    {
      repo: "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
      file: "tinyllama-1b.Q4_K_M.gguf",
      sha256: "45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6"
    }
  ],
  metadata: {
    region: "us-east-1",
    tier: "standard",
    capabilities: { streaming: true }
  },
  pricePerToken: ethers.utils.parseUnits("0.0001", 6)
});
```

#### ClientManager (`packages/sdk-core/src/managers/ClientManager.ts`)
Client-side model operations and host selection:

```typescript
const clientManager = new ClientManager(provider, modelManager);

// Get recommended host for a specific model
const host = await clientManager.getRecommendedHost(
  "TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF",
  "tinyllama-1b.Q4_K_M.gguf"
);

// Find all hosts supporting a model
const hosts = await clientManager.findHostsWithModel(modelId);
```

## Approved Models

Currently approved models in the system:

### TinyVicuna (Standard Tier)
- **Repository**: `CohereForAI/TinyVicuna-1B-32k-GGUF`
- **File**: `tiny-vicuna-1b.q4_k_m.gguf`
- **SHA-256**: `329d002bc20d4e7baae25df802c9678b5a4340b3ce91f23e6a0644975e95935f`
- **Model ID**: Calculated as `keccak256("CohereForAI/TinyVicuna-1B-32k-GGUF/tiny-vicuna-1b.q4_k_m.gguf")`

### TinyLlama (Standard Tier)
- **Repository**: `TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF`
- **File**: `tinyllama-1b.Q4_K_M.gguf`
- **SHA-256**: `45b71fe98efe5f530b825dce6f5049d738e9c16869f10be4370ab81a9912d4a6`
- **Model ID**: Calculated as `keccak256("TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF/tinyllama-1b.Q4_K_M.gguf")`

## Model ID Calculation

Model IDs are calculated deterministically using Keccak256 hashing:

```typescript
function calculateModelId(huggingfaceRepo: string, fileName: string): string {
  const input = `${huggingfaceRepo}/${fileName}`;
  const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(input));
  return hash;
}
```

**Important**: The exact format is `{repo}/{filename}` with no trailing slashes or spaces.

## UI Harness Pages

### Model Registry Viewer (`/model-registry`)
- Displays all approved models
- Shows model specifications and approval status
- Includes model ID calculator
- Fetches real-time data from blockchain

### Model Validator (`/model-validator`)
- Upload GGUF files for SHA-256 validation
- Calculate model IDs for any repo/file combination
- Check approval status both locally and on-chain
- Validate file integrity against expected hashes

### Host Registration (`/host-registration`)
- Register hosts with pre-approved models only
- Select from available approved models
- Configure host metadata (region, tier, pricing)
- Automatic model validation before registration

## Integration Testing

Run the model governance tests:

```bash
# Run all model governance tests
pnpm test tests/integration/model-governance.test.ts

# Run specific test suites
pnpm test -- --grep "ModelManager"
pnpm test -- --grep "HostManagerEnhanced"
```

## SDK Usage

### Initialize Managers

```typescript
const sdk = new FabstirSDKCore(config);
await sdk.authenticate(privateKey);

const modelManager = sdk.getModelManager();
const hostManager = sdk.getHostManager();
```

### Model-Aware Operations

```typescript
// Check model approval before use
const isApproved = await modelManager.isModelApproved(modelId);

// Find hosts for specific model
const hosts = await clientManager.findHostsWithModel(modelId);
```

## Security Considerations

1. **Model Integrity**: SHA-256 hashes ensure model files haven't been tampered with
2. **On-Chain Validation**: All model registrations are validated by smart contracts
3. **Governance Control**: Only authorized addresses can approve new models
4. **Deterministic IDs**: Model IDs are calculated consistently across all components

## Troubleshooting

### Common Issues

1. **"Model is not approved" Error**
   - Verify model is in approved list
   - Check exact repo and file names match
   - Ensure model ID calculation is correct

2. **SHA-256 Mismatch**
   - Re-download model file from HuggingFace
   - Verify file wasn't corrupted during transfer
   - Check file matches exact approved version

3. **Registration Transaction Fails**
   - Ensure all selected models are approved
   - Check wallet has sufficient gas
   - Verify contract addresses are correct

## Future Enhancements

- Dynamic model approval through governance votes
- Model performance metrics and ratings
- Automated model testing and certification
- Support for additional model formats beyond GGUF
- Model-specific pricing tiers

## Contact

For questions about model governance or to request new model approvals, contact the Fabstir team.