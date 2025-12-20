# Implementation Plan: Host Operator Setup UX Improvement

## Overview

This plan improves the host operator onboarding experience by adding model discovery, guided registration, and pre-validation to the Host CLI.

**Branch**: `feature/host-setup-ux`

---

## Problem Statement

The current host operator setup (documented in `docs/HOST_OPERATOR_GUIDE.md`) has UX friction points:

1. **Model String Format is Error-Prone**: Users must know exact format `{repo}:{filename}`
2. **No Model Discovery**: Users don't know which models are approved
3. **Manual Downloads**: Users must find/download model files from HuggingFace
4. **No Pre-Validation**: Registration fails at transaction time if model string is wrong
5. **No Guided Setup**: Users piece together steps from documentation

---

## Architecture Decisions

### Decision 1: Model Metadata Storage

**Chosen**: On-chain in ModelRegistry contract

**Rationale**:
- Static JSON file is unviable - models can change, would become stale
- Centralized API contradicts P2P architecture
- On-chain ensures single source of truth, decentralized, always current

**Current ModelRegistry Fields** (from contract):
```solidity
struct Model {
    string huggingfaceRepo;  // e.g., "CohereForAI/TinyVicuna-1B-32k-GGUF"
    string fileName;         // e.g., "tiny-vicuna-1b.q4_k_m.gguf"
    bytes32 sha256Hash;      // File hash for verification
    bool active;             // Whether model is approved
}
```

**Derived Fields** (computed by CLI, no contract changes needed):
- `displayName`: Parse from repo (e.g., "TinyVicuna-1B-32k")
- `downloadUrl`: Construct as `https://huggingface.co/{repo}/resolve/main/{fileName}`
- `modelString`: Construct as `{repo}:{fileName}`

**Optional Future Contract Enhancement**:
If more metadata is needed (fileSize, minVRAM), request contract update to add:
```solidity
struct ModelMetadata {
    uint256 fileSizeBytes;   // Optional: file size
    uint256 minVRAMGB;       // Optional: minimum VRAM requirement
}
```

For MVP, we proceed without these - they can be fetched from HuggingFace API if needed.

### Decision 2: Setup Wizard Docker Handling

**Chosen**: Generate config, don't auto-start

**Rationale**:
- Gives users control and visibility before committing GPU resources
- Allows review of configuration before starting
- Prevents accidental resource consumption
- Users can customize before starting

**Wizard Output**:
```
✓ Generated: docker-compose.yml
✓ Generated: .env

To start your node:
  docker-compose up -d

To view logs:
  docker-compose logs -f
```

---

## Contract Integration

### ModelRegistry Contract

**Address**: `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` (Base Sepolia)

**Functions Used**:

| Function | Returns | Purpose |
|----------|---------|---------|
| `getAllModels()` | `bytes32[]` | Get all model IDs |
| `getModel(modelId)` | `Model struct` | Get model details |
| `getModelHash(modelId)` | `bytes32` | Get SHA256 for verification |
| `getModelId(repo, fileName)` | `bytes32` | Compute model ID |
| `isModelApproved(modelId)` | `bool` | Check if approved |

**ABI Location**: `docs/compute-contracts-reference/client-abis/ModelRegistryUpgradeable-CLIENT-ABI.json`

---

## Implementation Phases

### Phase 1: Model Discovery (`fabstir-host models`)

**Priority**: HIGH (immediate value, enables all other phases)

**New Command Structure**:
```bash
fabstir-host models list              # List all approved models
fabstir-host models info <model-id>   # Show model details
```

**Output Example** (`models list`):
```
Approved Models for Fabstir Network
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  #  Model Name              Model String
 ── ─────────────────────── ─────────────────────────────────────────────────
  1  TinyVicuna-1B-32k      CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna...
  2  TinyLlama-1.1B-Chat    TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllam...

Total: 2 approved models

Use 'fabstir-host models info <number>' for details
```

**Output Example** (`models info 1`):
```
Model: TinyVicuna-1B-32k
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Model String:  CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
Model ID:      0x0b75a2061e70e736924a30c0a327db7ab719402129f76f631adbd7b7a5a5bced
Repository:    https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF
Download URL:  https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf
SHA256 Hash:   0x...

To register with this model:
  fabstir-host register --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" ...

To download this model:
  fabstir-host models download 1
```

**Files to Create**:
- `packages/host-cli/src/services/ModelRegistryClient.ts` - Contract queries
- `packages/host-cli/src/commands/models.ts` - Command implementation

**Files to Modify**:
- `packages/host-cli/src/index.ts` - Register models command

---

### Phase 2: Model Download (`fabstir-host models download`)

**Priority**: MEDIUM (nice-to-have, reduces friction)

**Command**:
```bash
fabstir-host models download <model-number|model-id>
```

**Features**:
1. Download from HuggingFace with progress bar
2. Verify SHA256 hash from contract
3. Save to standard location (`~/fabstir-node/models/`)

**Output Example**:
```
Downloading TinyVicuna-1B-32k...
URL: https://huggingface.co/CohereForAI/TinyVicuna-1B-32k-GGUF/resolve/main/tiny-vicuna-1b.q4_k_m.gguf

████████████████████████████████████████ 100% | 612 MB | 45.2 MB/s

Verifying SHA256 hash...
✓ Hash verified: 0x7a8b...

✓ Saved to: ~/fabstir-node/models/tiny-vicuna-1b.q4_k_m.gguf

To register with this model:
  fabstir-host register --model "CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf" ...
```

**Hash Verification Flow**:
```typescript
import crypto from 'crypto';
import fs from 'fs';

async function verifyModelFile(modelId: string, filePath: string): Promise<boolean> {
  // 1. Get expected hash from contract
  const expectedHash = await modelRegistry.getModelHash(modelId);

  // 2. Compute SHA256 of downloaded file
  const fileBuffer = fs.readFileSync(filePath);
  const actualHash = '0x' + crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // 3. Compare
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new Error(`Hash mismatch! Expected ${expectedHash}, got ${actualHash}`);
  }
  return true;
}
```

**Files to Create**:
- `packages/host-cli/src/services/ModelDownloader.ts` - Download with progress + verification

**Files to Modify**:
- `packages/host-cli/src/commands/models.ts` - Add download subcommand

---

### Phase 3: Pre-Registration Validation

**Priority**: HIGH (prevents failed transactions)

**Behavior**: Before `fabstir-host register` submits transaction, validate model string on-chain.

**Current Flow** (error at transaction time):
```bash
fabstir-host register --model "InvalidRepo/BadModel:wrong.gguf" ...
# Transaction fails after gas spent
```

**New Flow** (error before transaction):
```bash
fabstir-host register --model "InvalidRepo/BadModel:wrong.gguf" ...

✗ Error: Model "InvalidRepo/BadModel:wrong.gguf" is not approved

Did you mean one of these approved models?
  1. CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
  2. TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF:tinyllama-1.1b-chat-v1.0.Q4_K_M.gguf

Run 'fabstir-host models list' to see all approved models
```

**Files to Modify**:
- `packages/host-cli/src/commands/register.ts` - Add pre-validation

---

### Phase 4: Interactive Model Selection

**Priority**: MEDIUM (improves UX when --model not provided)

**Behavior**: When `--model` is omitted, show interactive selector.

**Example**:
```bash
fabstir-host register --stake 1000 --url http://my-server:8080 --pricing 2000

Select a model to register:
  ❯ 1. TinyVicuna-1B-32k (CohereForAI/TinyVicuna-1B-32k-GGUF)
    2. TinyLlama-1.1B-Chat (TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF)

  [↑/↓ to navigate, Enter to select, or type model string manually]
```

**Files to Modify**:
- `packages/host-cli/src/commands/register.ts` - Add interactive selector

---

### Phase 5: Setup Wizard (`fabstir-host setup`)

**Priority**: LOW (full onboarding, depends on Phases 1-4)

**Command**:
```bash
fabstir-host setup
```

**Wizard Flow**:

```
╔══════════════════════════════════════════════════════════════════════╗
║                    Fabstir Host Setup Wizard                         ║
╚══════════════════════════════════════════════════════════════════════╝

Step 1/5: Check Prerequisites
─────────────────────────────────────────────────────────────────────────
  ✓ Docker installed (v24.0.7)
  ✓ NVIDIA GPU detected: NVIDIA GeForce RTX 3080 (10 GB VRAM)
  ✓ NVIDIA Container Toolkit installed
  ✓ nvidia-smi accessible in Docker

Step 2/5: Select Model
─────────────────────────────────────────────────────────────────────────
  Based on your GPU (10 GB VRAM), compatible models:

  ❯ 1. TinyVicuna-1B-32k (~2 GB VRAM)
    2. TinyLlama-1.1B-Chat (~2 GB VRAM)

  [Select model]

Step 3/5: Download Model
─────────────────────────────────────────────────────────────────────────
  Downloading TinyVicuna-1B-32k...
  ████████████████████████████████████████ 100% | 612 MB

  ✓ Downloaded and verified

Step 4/5: Configure Node
─────────────────────────────────────────────────────────────────────────
  Enter your server's public URL: https://my-node.example.com:8080
  Enter USDC pricing ($/million tokens) [default: 5.00]: 3.00
  Enter ETH pricing (Gwei/million tokens) [default: 5000]: 3000
  Enter stake amount (FAB tokens) [default: 1000]: 1000

Step 5/5: Register on Blockchain
─────────────────────────────────────────────────────────────────────────
  Registering node with:
    - Model: CohereForAI/TinyVicuna-1B-32k-GGUF:tiny-vicuna-1b.q4_k_m.gguf
    - URL: https://my-node.example.com:8080
    - Stake: 1000 FAB
    - USDC Price: $3.00/million tokens
    - ETH Price: 3000 Gwei/million tokens

  Proceed? [Y/n]: Y

  Approving FAB token spend...
  ✓ Approval confirmed

  Registering node...
  ✓ Registration confirmed
  ✓ Transaction: 0x1234...abcd

╔══════════════════════════════════════════════════════════════════════╗
║                         Setup Complete!                              ║
╚══════════════════════════════════════════════════════════════════════╝

Generated files:
  ✓ docker-compose.yml
  ✓ .env

To start your node:
  docker-compose up -d

To view logs:
  docker-compose logs -f

To monitor via TUI dashboard:
  fabstir-host dashboard
```

**Files to Create**:
- `packages/host-cli/src/commands/setup.ts` - Wizard implementation
- `packages/host-cli/src/services/PrerequisiteChecker.ts` - Docker/GPU detection

---

## File Structure

```
packages/host-cli/src/
├── commands/
│   ├── models.ts          # NEW: models list/info/download
│   ├── setup.ts           # NEW: setup wizard
│   └── register.ts        # MODIFY: add pre-validation + interactive
├── services/
│   ├── ModelRegistryClient.ts  # NEW: query ModelRegistry contract
│   ├── ModelDownloader.ts      # NEW: download + verify
│   └── PrerequisiteChecker.ts  # NEW: Docker/GPU detection
└── index.ts               # MODIFY: register new commands
```

---

## Implementation Order

| Order | Phase | Effort | Value | Dependency |
|-------|-------|--------|-------|------------|
| 1 | Phase 1: `models list/info` | Low | High | None |
| 2 | Phase 3: Pre-validation | Low | High | Phase 1 |
| 3 | Phase 4: Interactive selection | Medium | Medium | Phase 1 |
| 4 | Phase 2: `models download` | Medium | Medium | Phase 1 |
| 5 | Phase 5: Setup wizard | High | High | Phases 1-4 |

---

## Testing Strategy

### Unit Tests
- `ModelRegistryClient.ts` - Mock contract responses
- `ModelDownloader.ts` - Mock HTTP responses + file verification

### Integration Tests
- Query real ModelRegistry on Base Sepolia
- Verify model discovery returns expected approved models

### Manual Testing
1. `fabstir-host models list` - Shows approved models from contract
2. `fabstir-host models info 1` - Shows details with correct URLs
3. `fabstir-host register --model "invalid"` - Fails with helpful message
4. `fabstir-host models download 1` - Downloads and verifies hash

---

## Success Metrics

1. **Reduced Onboarding Time**: Setup from 30+ minutes to <10 minutes
2. **Eliminated Invalid Registrations**: 0 failed transactions due to wrong model string
3. **Self-Service Discovery**: Hosts can find approved models without external docs

---

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Model Discovery | ✅ Complete | `models list`, `models info`, `models download` (placeholder) |
| Phase 2: Model Download | ⏳ Not Started | Download with SHA256 verification |
| Phase 3: Pre-Validation | ✅ Complete | Invalid models rejected with suggestions |
| Phase 4: Interactive Selection | ⏳ Not Started | |
| Phase 5: Setup Wizard | ⏳ Not Started | |

### Implementation Notes (Dec 20, 2025)

**Phase 1 & 3 Completed:**
- Created `ModelRegistryClient.ts` service with all contract query functions
- Created `models.ts` command with `list`, `info`, and `download` subcommands
- Added model pre-validation to `register.ts` before SDK initialization
- All model metadata derived from on-chain data (no static JSON)
- Uses minimal inline ABI for clean dependency-free code

**Files Created:**
- `packages/host-cli/src/services/ModelRegistryClient.ts`
- `packages/host-cli/src/commands/models.ts`

**Files Modified:**
- `packages/host-cli/src/index.ts` - Added models command
- `packages/host-cli/src/commands/register.ts` - Added pre-validation
