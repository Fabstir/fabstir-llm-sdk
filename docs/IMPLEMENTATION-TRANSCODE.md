# Video Transcoding Integration Implementation Plan (v1.0)

> Complete implementation plan for adding video/audio transcoding to Platformless AI
>
> **Status**: 🚀 READY TO START (0/28 sub-phases complete, 0%) | **Target**: Decentralized video transcoding marketplace with GOP-based proofs | **Progress**: Phase 1 ⏳ Pending, Phase 2 ⏳ Pending, Phase 3 ⏳ Pending, Phase 4 ⏳ Pending, Phase 5 ⏳ Pending, Phase 6 ⏳ Pending, Phase 7 ⏳ Pending

## Overview

Expand Platformless AI from an LLM inference marketplace to a **decentralized compute marketplace** by adding GPU-accelerated video/audio transcoding. This includes smart contract extensions, SDK managers, Rust node software, GOP-based STARK proofs, and S5 storage integration.

**Current State**: LLM inference only (text generation with token-based pricing and proofs)

**Target State**: Multi-service compute marketplace supporting both LLM inference and video transcoding with:
- GOP-based STARK proofs for quality verification
- Privacy-preserving Blake3 encrypted uploads via S5
- Resolution/codec/quality-based pricing
- Separate transcode nodes specialized for video processing
- Competitive pricing vs AWS MediaConvert, Mux, Cloudflare Stream

## Prerequisites

Before starting implementation, ensure:

✅ LLM MVP complete and deployed on Base Sepolia testnet
✅ Current contracts working (JobMarketplaceWithModels, NodeRegistryWithModels, ProofSystem)
✅ SDK Core tested with multi-chain support
✅ fabstir-transcoder repository available (https://github.com/Fabstir/fabstir-transcoder)
✅ Fabstir_Media_Player_Snaps working (service worker + WASM streaming)
✅ S5 integration operational (Blake3 encryption working)
✅ Risc0 zkVM proof generation tested (v8.1.2 with S5 proof storage)
✅ Contract developer available for smart contract changes
✅ Test accounts funded with FAB and USDC

## Business Requirements

### Current State (LLM-Only)
- **Services**: LLM inference only
- **Job Types**: Single job type (text generation)
- **Pricing**: Per-token pricing (tokens generated)
- **Proofs**: Per 1,000 tokens (STARK proofs via Risc0)
- **Storage**: Conversations on S5, proofs on S5
- **Nodes**: Unified LLM nodes (fabstir-llm-node)

### Target State (Multi-Service)
- **Services**: LLM inference + Video transcoding + Audio transcoding
- **Job Types**: JobType enum (LLM_INFERENCE, VIDEO_TRANSCODE, AUDIO_TRANSCODE)
- **Pricing**: Multi-unit pricing (per-token for LLM, per-second for transcode)
- **Proofs**:
  - LLM: Per 1,000 tokens (existing)
  - Transcode: Per GOP with quality metrics (PSNR, SSIM)
- **Storage**:
  - Input videos on S5 (Blake3 encrypted)
  - Output videos on S5 (Blake3 encrypted)
  - GOP proof trees on S5 (Merkle tree structure)
- **Nodes**:
  - LLM nodes (fabstir-llm-node)
  - Transcode nodes (fabstir-transcode-node) - **NEW**

### Post-MVP Features (Future)
- Image generation (DALL-E, Stable Diffusion)
- 3D rendering marketplace
- RAG/vector database as a service
- Model training marketplace
- Multi-GPU parallelization for faster transcoding
- Live streaming transcode (HLS, DASH)

## Market Opportunity

### Total Addressable Market
- **Video Transcoding**: $1.8B by 2027, 17% CAGR
- **Target Customers**: YouTubers, streamers, media companies, NFT marketplaces, VFX studios, decentralized video platforms
- **Competitors**: AWS MediaConvert ($0.015/min), Mux ($0.005/min), Cloudflare Stream
- **Competitive Edge**: Privacy (encrypted uploads), censorship-resistance, trustless quality proofs

### Revenue Model
- **Host Earnings**: 90% of transcode payments
- **Treasury Fee**: 10% (same as LLM)
- **Pricing**: $0.001-$1.00 per second of video (Base Sepolia)
- **Example**: 10-min 1080p H264 high quality ≈ $9.00

## Architecture

### Smart Contract Changes

#### JobType Enum (Multi-Service Support)
```solidity
// JobMarketplaceWithModels.sol - NEW

enum JobType {
    LLM_INFERENCE,      // 0 - Existing (text generation)
    VIDEO_TRANSCODE,    // 1 - NEW (video format conversion)
    AUDIO_TRANSCODE,    // 2 - NEW (audio format conversion)
    IMAGE_GENERATION,   // 3 - Future (image gen)
    THREE_D_RENDER      // 4 - Future (3D rendering)
}

enum PricingUnit {
    PER_TOKEN,          // LLM inference
    PER_SECOND,         // Transcode by duration
    PER_MEGABYTE,       // Transcode by file size
    PER_FRAME,          // Image generation
    PER_POLYGON         // 3D rendering
}

// Extended SessionJob struct
struct SessionJob {
    // Existing fields (unchanged)
    address client;
    address host;
    bytes32 modelId;        // For LLM: model hash, For transcode: profile hash
    uint256 pricePerToken;  // Now pricePerUnit (generic)
    uint256 deposit;
    uint256 tokensConsumed; // Now workUnitsConsumed (generic)
    uint256 startTime;
    uint256 endTime;
    bool completed;
    address token;

    // NEW fields for multi-type support
    JobType jobType;        // NEW: Type of compute job
    PricingUnit pricingUnit; // NEW: How to measure consumption
    bytes32 formatSpecHash;  // NEW: Hash of format spec (off-chain on S5)
}
```

#### Transcoding Pricing in NodeRegistry
```solidity
// NodeRegistryWithModels.sol - Extended

struct TranscodePricing {
    bool enabled;                   // Host offers transcoding
    PricingUnit pricingUnit;        // PER_SECOND or PER_MEGABYTE

    // Base pricing (in USDC, 6 decimals)
    uint256 basePricePerUnit;       // Base rate (e.g., 0.01 USDC per second)

    // Resolution multipliers (10000 = 1.0x)
    uint256 multiplier720p;         // e.g., 10000 (1.0x)
    uint256 multiplier1080p;        // e.g., 15000 (1.5x)
    uint256 multiplier4k;           // e.g., 30000 (3.0x)

    // Codec multipliers (10000 = 1.0x)
    uint256 multiplierH264;         // e.g., 10000 (1.0x)
    uint256 multiplierAV1;          // e.g., 25000 (2.5x - slower)

    // Quality multipliers (10000 = 1.0x)
    uint256 multiplierStandard;     // e.g., 10000 (PSNR 38-42 dB)
    uint256 multiplierHigh;         // e.g., 15000 (PSNR 42-46 dB)
    uint256 multiplierLossless;     // e.g., 25000 (PSNR > 50 dB)
}

struct Node {
    // Existing LLM fields (unchanged)
    address operator;
    uint256 stakedAmount;
    bool active;
    string metadata;
    string apiUrl;
    bytes32[] supportedModels;
    uint256 minPricePerToken;

    // NEW transcode fields
    TranscodePricing transcodePricing;  // NEW
    bytes32[] supportedFormats;         // NEW: h264, av1, etc.
    uint256 maxVideoResolution;         // NEW: 0=720p, 1=1080p, 2=4k
    bool hardwareAcceleration;          // NEW: NVENC/VAAPI support
}
```

#### Format Specification Storage
```solidity
// JobMarketplaceWithModels.sol - NEW

struct FormatSpecReference {
    bytes32 specHash;           // Blake3 hash of format spec JSON
    string specCID;             // S5 CID where spec is stored
    uint256 timestamp;          // When spec was registered
}

mapping(bytes32 => FormatSpecReference) public formatSpecs;

function registerFormatSpec(
    bytes32 specHash,
    string calldata specCID
) external returns (bytes32) {
    require(formatSpecs[specHash].timestamp == 0, "Spec already registered");

    formatSpecs[specHash] = FormatSpecReference({
        specHash: specHash,
        specCID: specCID,
        timestamp: block.timestamp
    });

    emit FormatSpecRegistered(specHash, specCID, msg.sender);
    return specHash;
}
```

#### GOP-Based Proof System
```solidity
// ProofSystem.sol - Extended

struct TranscodeProof {
    uint256 gopIndex;           // Which GOP (0, 1, 2, ...)
    bytes32 inputGOPHash;       // Hash of input GOP
    bytes32 outputGOPHash;      // Hash of output GOP
    uint256 psnrMillidB;        // PSNR in milli-dB (42000 = 42.0 dB)
    uint256 ssimMicroUnits;     // SSIM in micro-units (950000 = 0.95)
    uint256 actualBitrate;      // Actual bitrate achieved
    bytes32 starkProofHash;     // Hash of STARK proof for this GOP
}

struct TranscodeProofTree {
    bytes32 rootHash;           // Merkle root of all GOP proofs
    uint256 gopCount;           // Total number of GOPs
    bytes32[] spotCheckHashes;  // Hashes of randomly selected GOPs
    string treeCID;             // S5 CID of full Merkle tree
}

function submitTranscodeProof(
    uint256 jobId,
    bytes32 merkleRoot,
    uint256 gopCount,
    bytes32[] calldata spotCheckHashes,
    string calldata treeCID,
    bytes32 qualityMetricsHash,
    uint256 durationSeconds
) external {
    require(jobs[jobId].jobType == JobType.VIDEO_TRANSCODE, "Wrong job type");
    require(msg.sender == jobs[jobId].host, "Only host can submit");

    transcodeProofTrees[jobId] = TranscodeProofTree({
        rootHash: merkleRoot,
        gopCount: gopCount,
        spotCheckHashes: spotCheckHashes,
        treeCID: treeCID
    });

    emit TranscodeProofSubmitted(jobId, merkleRoot, gopCount);
}
```

### SDK Architecture Changes

```typescript
// packages/sdk-core/src/types/transcode.types.ts - NEW FILE

export enum JobType {
  LLM_INFERENCE = 0,
  VIDEO_TRANSCODE = 1,
  AUDIO_TRANSCODE = 2,
}

export enum Resolution {
  R720p = 0,
  R1080p = 1,
  R4k = 2,
}

export enum Codec {
  H264 = 0,
  AV1 = 1,
}

export interface TranscodeFormatSpec {
  version: '1.0.0';
  input: {
    cid: string;              // S5 CID of input video
    encryptionKey?: string;   // Blake3 key if encrypted
  };
  output: {
    video: {
      codec: 'h264' | 'av1';
      resolution: { width: number; height: number };
      frameRate: number;
      bitrate: { target: number };
    };
    audio: {
      codec: 'aac' | 'opus';
      sampleRate: number;
      channels: number;
    };
    container: 'mp4' | 'webm';
  };
  quality: {
    tier: 'standard' | 'high' | 'lossless';
    minPSNR?: number;
  };
  gop: {
    size: number;             // GOP size in frames
    structure: string;        // e.g., "IBBPBBP"
  };
  proof: {
    strategy: 'per_gop' | 'per_segment';
    spotCheckCount: number;   // Random GOPs to verify
  };
}
```

```typescript
// packages/sdk-core/src/managers/TranscodeManager.ts - NEW FILE

export class TranscodeManager implements ITranscodeManager {
  async createTranscodeJob(params: {
    hostAddress: string;
    inputCID: string;
    formatSpec: TranscodeFormatSpec;
    maxDuration: number;
    chainId: number;
  }): Promise<{ jobId: bigint; estimatedCost: string }> {
    // 1. Upload format spec to S5
    const specCID = await this.s5.upload(JSON.stringify(params.formatSpec));
    const specHash = blake3(JSON.stringify(params.formatSpec));

    // 2. Register format spec on-chain
    await this.jobMarketplace.registerFormatSpec(specHash, specCID);

    // 3. Calculate price estimate
    const estimate = await this.estimateTranscodePrice(
      params.hostAddress,
      params.formatSpec,
      videoDurationSeconds
    );

    // 4. Create job on-chain
    const tx = await this.jobMarketplace.createSessionJob(
      params.hostAddress,
      JobType.VIDEO_TRANSCODE,
      bytes32(0), // No model ID for transcode
      estimate.pricePerSecond,
      PricingUnit.PER_SECOND,
      specHash,
      params.maxDuration,
      100 // GOPs per proof submission
    );

    const receipt = await tx.wait();
    const jobId = receipt.events.find(e => e.event === 'SessionJobCreated').args.jobId;

    return { jobId, estimatedCost: estimate.totalCost };
  }

  async monitorTranscodeProgress(
    jobId: bigint,
    onProgress: (progress: TranscodeProgress) => void
  ): Promise<TranscodeJobResult> {
    // WebSocket connection to transcode node
    // Stream progress updates
    // Return output CID when complete
  }

  async verifyTranscodeOutput(
    jobId: bigint,
    spotCheckCount: number = 5
  ): Promise<TranscodeVerification> {
    // 1. Get proof tree from S5
    const proofTree = await this.getProofTree(jobId);

    // 2. Select random GOPs to verify
    const randomGOPs = this.selectRandomGOPs(proofTree.gopCount, spotCheckCount);

    // 3. Download GOP proofs from S5
    const gopProofs = await this.getGOPProofs(jobId, randomGOPs);

    // 4. Verify PSNR, format compliance
    const valid = gopProofs.every(proof => {
      return proof.psnrDB >= formatSpec.quality.minPSNR &&
             proof.outputGOPHash === expectedHash;
    });

    return { valid, verifiedGOPs: randomGOPs };
  }
}
```

### Node Architecture (fabstir-transcode-node)

```rust
// fabstir-transcode-node/src/main.rs - NEW REPOSITORY

use fabstir_transcoder::{Transcoder, TranscodeOptions};
use risc0_zkvm::{Prover, ExecutorEnv};
use s5_client::{S5Client, UploadOptions};

pub struct TranscodeNode {
    job_marketplace: JobMarketplace,
    node_registry: NodeRegistry,
    proof_system: ProofSystem,
    s5_client: S5Client,
    transcoder: Transcoder,
    risc0_prover: Prover,
}

impl TranscodeNode {
    pub async fn handle_transcode_job(&self, job_id: u64) -> Result<()> {
        // 1. Fetch job details from contract
        let job = self.job_marketplace.get_job(job_id).await?;

        // 2. Download format spec from S5
        let format_spec: TranscodeFormatSpec =
            self.s5_client.download(job.format_spec_cid).await?;

        // 3. Download input video from S5
        let input_video = self.s5_client.download(format_spec.input.cid).await?;

        // 4. Transcode video (with progress streaming via WebSocket)
        let output_video = self.transcoder.transcode(
            &input_video,
            TranscodeOptions {
                codec: format_spec.output.video.codec,
                resolution: format_spec.output.video.resolution,
                bitrate: format_spec.output.video.bitrate,
            },
            |progress| {
                self.send_progress_update(job_id, progress);
            }
        ).await?;

        // 5. Generate GOP proofs in parallel
        let gop_proofs = self.generate_gop_proofs(&input_video, &output_video).await?;

        // 6. Build Merkle tree of GOP proofs
        let merkle_tree = self.build_merkle_tree(&gop_proofs)?;

        // 7. Upload output video to S5
        let output_cid = self.s5_client.upload(&output_video, UploadOptions {
            encrypt: true,
            encryption_key: format_spec.input.encryption_key,
        }).await?;

        // 8. Upload proof tree to S5
        let proof_tree_cid = self.s5_client.upload(
            &serde_json::to_vec(&merkle_tree)?,
            UploadOptions::default()
        ).await?;

        // 9. Submit Merkle root on-chain
        self.proof_system.submit_transcode_proof(
            job_id,
            merkle_tree.root_hash,
            gop_proofs.len() as u64,
            merkle_tree.spot_check_hashes,
            proof_tree_cid,
        ).await?;

        Ok(())
    }

    async fn generate_gop_proofs(
        &self,
        input: &[u8],
        output: &[u8]
    ) -> Result<Vec<GOPProof>> {
        let gops = self.split_into_gops(output)?;

        // Parallel proof generation
        let proofs = gops.par_iter().enumerate().map(|(i, gop)| {
            // Generate STARK proof for this GOP
            let env = ExecutorEnv::builder()
                .write(&input[gop.input_range])
                .write(&gop.data)
                .write(&gop.encoding_params)
                .build()?;

            let prover = self.risc0_prover.prove(env, GOP_TRANSCODE_ELF)?;
            let receipt = prover.receipt;

            // Extract quality metrics from proof
            let psnr = receipt.journal.decode::<f32>()?;
            let ssim = receipt.journal.decode::<f32>()?;

            Ok(GOPProof {
                gop_index: i as u32,
                input_gop_hash: blake3(&input[gop.input_range]),
                output_gop_hash: blake3(&gop.data),
                psnr_db: psnr,
                ssim,
                actual_bitrate: gop.bitrate,
                stark_proof_hash: blake3(&receipt.seal),
            })
        }).collect::<Result<Vec<_>>>()?;

        Ok(proofs)
    }
}
```

## Security Model

### Proof Verification Strategy

**GOP-Based Proofs**:
- Each GOP (Group of Pictures, typically 1-2 seconds of video) has a proof
- STARK proof generated inside Risc0 zkVM guest
- Proof attests: Input GOP hash → Output GOP hash + PSNR quality metric
- Merkle tree of all GOP proofs → only root hash on-chain (32 bytes)

**Client Verification**:
- Client downloads proof tree from S5 (via CID)
- Spot-checks random 5-10 GOPs (not all)
- Verifies PSNR meets specification
- Verifies format compliance (codec, resolution, bitrate)
- If any GOP fails verification → dispute transaction

**Anti-Cheating Mechanisms**:
1. **Quality Metrics in zkVM**: PSNR calculation inside guest program (provably correct)
2. **Random Sampling**: Client selects random GOPs using block hash as seed
3. **Stake Slashing**: Invalid proofs result in stake slashing
4. **Reputation System**: Failed verifications lower host reputation

### Economic Safeguards

**Price Bounds**:
- Minimum: $0.001 per second (Base Sepolia)
- Maximum: $1.00 per second (Base Sepolia)
- Lower bounds on opBNB ($0.0005-$0.50 due to cheaper gas)

**Quality Thresholds**:
- Standard quality: PSNR ≥ 38 dB
- High quality: PSNR ≥ 42 dB
- Lossless: PSNR ≥ 50 dB

**Deposit Requirements**:
- Minimum deposit: 1.0 USDC (Base Sepolia) = ~1 minute of transcoding
- Proof interval: 100 GOPs = ~200 seconds of video

### Privacy & Encryption

**Blake3 Encryption** (S5 Spec):
- All input videos encrypted before upload to S5
- Encryption key derived from client's wallet signature
- Only client and host have encryption keys
- S5 nodes cannot read content

**End-to-End Privacy**:
- Input video: Encrypted on client, uploaded to S5
- Host downloads: Encrypted video, transcodes in secure environment
- Output video: Re-encrypted with client's key, uploaded to S5
- Proof tree: Public (quality metrics, no video content)

## Contract Developer Handoff

**What needs to change** (provide to contract developer):

### 1. JobMarketplaceWithModels.sol

**File**: `fabstir-compute-contracts/src/JobMarketplaceWithModels.sol`

**Changes Required**:

#### 1.1 Add JobType and PricingUnit Enums (line ~20)
```solidity
enum JobType {
    LLM_INFERENCE,      // 0
    VIDEO_TRANSCODE,    // 1
    AUDIO_TRANSCODE     // 2
}

enum PricingUnit {
    PER_TOKEN,          // 0
    PER_SECOND,         // 1
    PER_MEGABYTE        // 2
}
```

#### 1.2 Extend SessionJob Struct (line ~45)
```solidity
struct SessionJob {
    // Existing fields (unchanged)
    address client;
    address host;
    bytes32 modelId;
    uint256 pricePerToken;  // Keep name for backward compat, but now generic "pricePerUnit"
    uint256 deposit;
    uint256 tokensConsumed; // Keep name for backward compat, but now generic "workUnitsConsumed"
    uint256 startTime;
    uint256 endTime;
    bool completed;
    address token;

    // NEW fields
    JobType jobType;         // NEW: Add this
    PricingUnit pricingUnit; // NEW: Add this
    bytes32 formatSpecHash;  // NEW: Add this (0x0 for LLM jobs)
}
```

#### 1.3 Add FormatSpecReference Struct and Mapping (line ~70)
```solidity
struct FormatSpecReference {
    bytes32 specHash;
    string specCID;
    uint256 timestamp;
}

mapping(bytes32 => FormatSpecReference) public formatSpecs;
```

#### 1.4 Add registerFormatSpec Function (new, ~350)
```solidity
function registerFormatSpec(
    bytes32 specHash,
    string calldata specCID
) external returns (bytes32) {
    require(formatSpecs[specHash].timestamp == 0, "Spec already registered");

    formatSpecs[specHash] = FormatSpecReference({
        specHash: specHash,
        specCID: specCID,
        timestamp: block.timestamp
    });

    emit FormatSpecRegistered(specHash, specCID, msg.sender);
    return specHash;
}

event FormatSpecRegistered(bytes32 indexed specHash, string specCID, address indexed registrant);
```

#### 1.5 Update createSessionJob Function (line ~180)
```solidity
function createSessionJob(
    address host,
    JobType jobType,           // NEW parameter
    bytes32 modelOrProfileId,  // Renamed for clarity
    uint256 pricePerUnit,      // Renamed for clarity
    PricingUnit pricingUnit,   // NEW parameter
    bytes32 formatSpecHash,    // NEW parameter (0x0 for LLM)
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId) {
    // ... existing validation ...

    sessionJobs[jobId] = SessionJob({
        client: msg.sender,
        host: host,
        modelId: modelOrProfileId,
        pricePerToken: pricePerUnit,  // Keep field name for compatibility
        deposit: msg.value,
        tokensConsumed: 0,
        startTime: block.timestamp,
        endTime: 0,
        completed: false,
        token: address(0),  // Native token
        jobType: jobType,           // NEW
        pricingUnit: pricingUnit,   // NEW
        formatSpecHash: formatSpecHash  // NEW
    });

    emit SessionJobCreated(jobId, msg.sender, host, jobType, modelOrProfileId, pricePerUnit, pricingUnit);

    return jobId;
}

// Updated event
event SessionJobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed host,
    JobType jobType,
    bytes32 modelOrProfileId,
    uint256 pricePerUnit,
    PricingUnit pricingUnit
);
```

#### 1.6 Add Backward Compatibility Wrapper (optional, ~300)
```solidity
// Backward compatibility for existing LLM clients
function createLLMSessionJob(
    address host,
    bytes32 modelId,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId) {
    return createSessionJob(
        host,
        JobType.LLM_INFERENCE,
        modelId,
        pricePerToken,
        PricingUnit.PER_TOKEN,
        bytes32(0),  // No format spec for LLM
        maxDuration,
        proofInterval
    );
}
```

### 2. NodeRegistryWithModels.sol

**File**: `fabstir-compute-contracts/src/NodeRegistryWithModels.sol`

**Changes Required**:

#### 2.1 Add TranscodePricing Struct (line ~25)
```solidity
struct TranscodePricing {
    bool enabled;
    uint8 pricingUnit;  // 0 = PER_SECOND, 1 = PER_MEGABYTE
    uint256 basePricePerUnit;
    uint256 multiplier720p;
    uint256 multiplier1080p;
    uint256 multiplier4k;
    uint256 multiplierH264;
    uint256 multiplierAV1;
    uint256 multiplierStandard;
    uint256 multiplierHigh;
    uint256 multiplierLossless;
}
```

#### 2.2 Extend Node Struct (line ~45)
```solidity
struct Node {
    // Existing LLM fields (unchanged)
    address operator;
    uint256 stakedAmount;
    bool active;
    string metadata;
    string apiUrl;
    bytes32[] supportedModels;
    uint256 minPricePerToken;

    // NEW transcode fields
    TranscodePricing transcodePricing;  // NEW
    bytes32[] supportedFormats;         // NEW
    uint8 maxVideoResolution;           // NEW: 0=720p, 1=1080p, 2=4k
    bool hardwareAcceleration;          // NEW
}
```

#### 2.3 Add registerTranscodeHost Function (new, ~200)
```solidity
function registerTranscodeHost(
    TranscodePricing calldata pricing,
    bytes32[] calldata supportedFormats,
    uint8 maxVideoResolution,
    bool hardwareAcceleration
) external {
    require(nodes[msg.sender].operator != address(0), "Must register as LLM host first");
    require(pricing.basePricePerUnit >= 1000, "Price too low");  // Min 0.001 USDC/sec
    require(pricing.basePricePerUnit <= 1000000, "Price too high");  // Max 1.0 USDC/sec

    nodes[msg.sender].transcodePricing = pricing;
    nodes[msg.sender].supportedFormats = supportedFormats;
    nodes[msg.sender].maxVideoResolution = maxVideoResolution;
    nodes[msg.sender].hardwareAcceleration = hardwareAcceleration;

    emit TranscodeHostRegistered(msg.sender, pricing.basePricePerUnit);
}

event TranscodeHostRegistered(address indexed operator, uint256 basePricePerUnit);
```

#### 2.4 Add updateTranscodePricing Function (new, ~220)
```solidity
function updateTranscodePricing(
    TranscodePricing calldata newPricing
) external {
    require(nodes[msg.sender].active, "Host not active");
    require(newPricing.basePricePerUnit >= 1000, "Price too low");
    require(newPricing.basePricePerUnit <= 1000000, "Price too high");

    nodes[msg.sender].transcodePricing = newPricing;

    emit TranscodePricingUpdated(msg.sender);
}

event TranscodePricingUpdated(address indexed operator);
```

### 3. ProofSystem.sol

**File**: `fabstir-compute-contracts/src/ProofSystem.sol`

**Changes Required**:

#### 3.1 Add TranscodeProofTree Struct (line ~30)
```solidity
struct TranscodeProofTree {
    bytes32 rootHash;
    uint256 gopCount;
    bytes32[] spotCheckHashes;
    string treeCID;
}

mapping(uint256 => TranscodeProofTree) public transcodeProofTrees;
```

#### 3.2 Add submitTranscodeProof Function (new, ~150)
```solidity
function submitTranscodeProof(
    uint256 jobId,
    bytes32 merkleRoot,
    uint256 gopCount,
    bytes32[] calldata spotCheckHashes,
    string calldata treeCID
) external {
    require(jobs[jobId].host == msg.sender, "Only host can submit");

    transcodeProofTrees[jobId] = TranscodeProofTree({
        rootHash: merkleRoot,
        gopCount: gopCount,
        spotCheckHashes: spotCheckHashes,
        treeCID: treeCID
    });

    emit TranscodeProofSubmitted(jobId, merkleRoot, gopCount);
}

event TranscodeProofSubmitted(uint256 indexed jobId, bytes32 merkleRoot, uint256 gopCount);
```

#### 3.3 Add verifyTranscodeProof Function (new, ~180)
```solidity
function verifyTranscodeProof(
    uint256 jobId,
    uint256[] calldata gopIndicesToCheck,
    bytes32[] calldata gopHashes,
    bytes32[][] calldata merkleProofs
) external view returns (bool) {
    TranscodeProofTree memory tree = transcodeProofTrees[jobId];

    for (uint256 i = 0; i < gopIndicesToCheck.length; i++) {
        bool valid = verifyMerkleProof(
            gopHashes[i],
            gopIndicesToCheck[i],
            merkleProofs[i],
            tree.rootHash
        );
        if (!valid) return false;
    }

    return true;
}

function verifyMerkleProof(
    bytes32 leaf,
    uint256 index,
    bytes32[] calldata proof,
    bytes32 root
) internal pure returns (bool) {
    bytes32 computedHash = leaf;

    for (uint256 i = 0; i < proof.length; i++) {
        bytes32 proofElement = proof[i];

        if (index % 2 == 0) {
            computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
        } else {
            computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
        }

        index = index / 2;
    }

    return computedHash == root;
}
```

**After deployment**, provide:
- [ ] Updated `JobMarketplaceWithModels` address
- [ ] Updated `NodeRegistryWithModels` address
- [ ] Updated `ProofSystem` address
- [ ] Updated ABIs for all three contracts
- [ ] Block numbers of deployments
- [ ] Gas cost estimates for new functions

## Implementation Status

⏳ **Phase 1: Contract Extensions** (0/4 sub-phases complete)
⏳ **Phase 2: SDK Core - Types & Interfaces** (0/3 sub-phases complete)
⏳ **Phase 3: SDK Core - TranscodeManager** (0/5 sub-phases complete)
⏳ **Phase 4: Transcode Node Software** (0/6 sub-phases complete)
⏳ **Phase 5: GOP Proof Generation** (0/4 sub-phases complete)
⏳ **Phase 6: Host CLI & UI Integration** (0/3 sub-phases complete)
⏳ **Phase 7: Testing & Deployment** (0/3 sub-phases complete)

**Total Progress**: 0/28 sub-phases (0%)

## Key Principles

1. **Test-Driven Development (TDD)**: Write tests FIRST for all code changes
2. **Bounded Autonomy**: Each sub-phase has strict scope and line limits
3. **Contract-First**: Wait for contract deployment before implementing SDK
4. **Separate Nodes**: Dedicated transcode nodes (not unified with LLM)
5. **GOP-Based Proofs**: Generate proof per GOP with quality metrics (PSNR)
6. **S5 Integration**: Leverage existing fabstir-transcoder S5 capabilities
7. **Backward Compatibility**: Existing LLM sessions continue to work
8. **Privacy First**: Blake3 encryption for all video uploads/downloads

## Development Constraints

- **Max Lines Per File**: Specified for each sub-phase
- **Test First**: Tests must exist and FAIL before writing implementation
- **Single Responsibility**: Each sub-phase does ONE thing
- **No Side Effects**: Don't modify files outside sub-phase scope
- **Real Contract Testing**: Integration tests use actual deployed contracts
- **Proof Verification**: Always verify PSNR and format compliance

---

## Phase 1: Contract Extensions

**Dependencies**: Contract developer availability
**Estimated Time**: 1-2 weeks (contract dev) + testing
**Goal**: Deploy updated contracts with multi-service support (LLM + Transcode)

### Sub-phase 1.1: Contract Specification Review

**Goal**: Provide contract developer with complete specifications and verify understanding

**Status**: ⏳ Pending

**Reference Documents**:
- [ ] Review `docs/transcode-reference/TRANSCODE_CONTRACT_SPEC.md` (600+ lines)
- [ ] Review "Contract Developer Handoff" section above
- [ ] Review `docs/transcode-reference/TRANSCODE_INTEGRATION_SUMMARY.md`

**Tasks**:
- [ ] Contract developer reviews all three contract files requiring changes
- [ ] Contract developer confirms understanding of JobType enum changes
- [ ] Contract developer confirms understanding of TranscodePricing struct
- [ ] Contract developer confirms understanding of GOP proof system
- [ ] Contract developer confirms understanding of FormatSpec storage
- [ ] Contract developer provides ETA for deployment
- [ ] Agree on testnet deployment strategy (Base Sepolia first)
- [ ] Document expected ABI changes
- [ ] Clarify Merkle proof verification implementation

**Deliverables**:
- [ ] Contract developer confirmation received
- [ ] Expected deployment timeline documented
- [ ] ABI change documentation created (list new events, functions, structs)
- [ ] Migration strategy agreed (existing LLM hosts unaffected, must opt-in to transcode)
- [ ] Gas cost estimates provided for new functions

**Acceptance Criteria**:
- [ ] Contract developer has clear spec for all three contracts
- [ ] Timeline agreed upon (1-2 weeks)
- [ ] All technical questions answered
- [ ] Risk assessment complete (backward compatibility verified)
- [ ] Merkle proof strategy confirmed

---

### Sub-phase 1.2: Contract Deployment (JobMarketplace)

**Goal**: Contract developer deploys updated JobMarketplaceWithModels to Base Sepolia

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 1.1 complete

**Tasks**:
- [ ] Contract developer adds JobType and PricingUnit enums
- [ ] Contract developer extends SessionJob struct with 3 new fields
- [ ] Contract developer adds FormatSpecReference struct and mapping
- [ ] Contract developer implements registerFormatSpec() function
- [ ] Contract developer updates createSessionJob() with new parameters
- [ ] Contract developer adds backward compatibility wrapper (createLLMSessionJob)
- [ ] Contract developer writes unit tests for new functions
- [ ] Contract developer deploys to Base Sepolia testnet
- [ ] Contract developer verifies contract on BaseScan
- [ ] Contract developer provides deployment info

**Deliverables**:
- [ ] New JobMarketplaceWithModels address
- [ ] Deployment block number
- [ ] Updated ABI JSON file
- [ ] Gas cost report for new functions
- [ ] Unit test results (all tests passing)
- [ ] BaseScan verification link

**Acceptance Criteria**:
- [ ] Contract deployed successfully
- [ ] Contract verified on BaseScan
- [ ] createSessionJob() accepts JobType parameter
- [ ] registerFormatSpec() works (can register and retrieve specs)
- [ ] Backward compatibility wrapper works (existing LLM clients unaffected)
- [ ] Events emit correctly (SessionJobCreated includes jobType)
- [ ] Gas costs documented (~160k for transcode job creation)

---

### Sub-phase 1.3: Contract Deployment (NodeRegistry)

**Goal**: Contract developer deploys updated NodeRegistryWithModels to Base Sepolia

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 1.1 complete

**Tasks**:
- [ ] Contract developer adds TranscodePricing struct
- [ ] Contract developer extends Node struct with 4 new fields
- [ ] Contract developer implements registerTranscodeHost() function
- [ ] Contract developer implements updateTranscodePricing() function
- [ ] Contract developer adds getTranscodePricing() view function
- [ ] Contract developer writes unit tests for new functions
- [ ] Contract developer deploys to Base Sepolia testnet
- [ ] Contract developer verifies contract on BaseScan
- [ ] Contract developer provides deployment info

**Deliverables**:
- [ ] New NodeRegistryWithModels address
- [ ] Deployment block number
- [ ] Updated ABI JSON file
- [ ] Gas cost report for new functions
- [ ] Unit test results (all tests passing)
- [ ] BaseScan verification link

**Acceptance Criteria**:
- [ ] Contract deployed successfully
- [ ] Contract verified on BaseScan
- [ ] registerTranscodeHost() works (can set pricing and formats)
- [ ] updateTranscodePricing() works (hosts can update prices)
- [ ] Price bounds enforced (min 1000, max 1000000 for MVP)
- [ ] Multipliers stored correctly (10000 = 1.0x)
- [ ] Events emit correctly (TranscodeHostRegistered, TranscodePricingUpdated)
- [ ] Gas costs documented (~120k for transcode registration)

---

### Sub-phase 1.4: Contract Deployment (ProofSystem)

**Goal**: Contract developer deploys updated ProofSystem to Base Sepolia

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 1.1 complete

**Tasks**:
- [ ] Contract developer adds TranscodeProofTree struct and mapping
- [ ] Contract developer implements submitTranscodeProof() function
- [ ] Contract developer implements verifyTranscodeProof() function
- [ ] Contract developer implements verifyMerkleProof() helper
- [ ] Contract developer writes unit tests for Merkle verification
- [ ] Contract developer writes unit tests with sample GOP proof trees
- [ ] Contract developer deploys to Base Sepolia testnet
- [ ] Contract developer verifies contract on BaseScan
- [ ] Contract developer provides deployment info

**Deliverables**:
- [ ] New ProofSystem address
- [ ] Deployment block number
- [ ] Updated ABI JSON file
- [ ] Gas cost report for new functions
- [ ] Unit test results (all tests passing, Merkle proof tests included)
- [ ] BaseScan verification link

**Acceptance Criteria**:
- [ ] Contract deployed successfully
- [ ] Contract verified on BaseScan
- [ ] submitTranscodeProof() works (can submit Merkle root)
- [ ] verifyTranscodeProof() works (spot-check GOP verification)
- [ ] Merkle proof verification correct (tested with known Merkle trees)
- [ ] Events emit correctly (TranscodeProofSubmitted)
- [ ] Gas costs documented (~150k for proof submission, ~50k per GOP verification)

---

## Phase 2: SDK Core - Types & Interfaces

**Dependencies**: Phase 1 complete (contracts deployed)
**Estimated Time**: 1 week
**Goal**: Create TypeScript types, enums, and interfaces for transcoding

### Sub-phase 2.1: Transcoding Type Definitions

**Goal**: Create comprehensive TypeScript type definitions for transcoding

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 1.4 complete (contracts deployed)

**Test File**: `packages/sdk-core/tests/types/transcode-types.test.ts` (NEW, ~150 lines)

**Implementation File**: `packages/sdk-core/src/types/transcode.types.ts` (EXISTING, ~400 lines already created)

**Max Lines**: 450 total (already at 400)

**Tasks**:
- [ ] Write tests FIRST in `transcode-types.test.ts`:
  - [ ] Test: JobType enum has correct values (0, 1, 2)
  - [ ] Test: Resolution enum has correct values (0, 1, 2)
  - [ ] Test: Codec enum has correct values (0, 1)
  - [ ] Test: TranscodeFormatSpec validates required fields
  - [ ] Test: TRANSCODE_PRESETS contains 4 presets
  - [ ] Test: createFormatSpecFromPreset() creates valid spec
  - [ ] Test: getTranscodePreset() returns correct preset
- [ ] Verify existing type definitions match contract enums
- [ ] Add any missing types discovered during testing
- [ ] Update exports in `packages/sdk-core/src/types/index.ts`

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] Type definitions validated against contract enums
- [ ] Exports updated in index.ts

**Acceptance Criteria**:
- [ ] Enums match contract values exactly
- [ ] All interfaces have required fields
- [ ] Presets are valid and complete
- [ ] Helper functions work correctly
- [ ] No TypeScript compilation errors

---

### Sub-phase 2.2: TranscodeManager Interface

**Goal**: Define complete interface for TranscodeManager

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 2.1 complete

**Test File**: `packages/sdk-core/tests/interfaces/transcode-manager-interface.test.ts` (NEW, ~200 lines)

**Implementation File**: `packages/sdk-core/src/interfaces/ITranscodeManager.ts` (EXISTING, ~300 lines already created)

**Max Lines**: 320 total (already at 300)

**Tasks**:
- [ ] Write tests FIRST in `transcode-manager-interface.test.ts`:
  - [ ] Test: Interface has all 20+ required methods
  - [ ] Test: createTranscodeJob() has correct signature
  - [ ] Test: monitorTranscodeProgress() has correct signature
  - [ ] Test: verifyTranscodeOutput() has correct signature
  - [ ] Test: findTranscodeHosts() has correct signature
  - [ ] Test: estimateTranscodePrice() has correct signature
  - [ ] Test: uploadVideoForTranscode() has correct signature
  - [ ] Test: downloadTranscodedVideo() has correct signature
- [ ] Verify existing interface matches implementation plan
- [ ] Add method documentation (JSDoc) if missing
- [ ] Update exports in `packages/sdk-core/src/interfaces/index.ts`

**Deliverables**:
- [ ] Test file created with 8 test cases
- [ ] All tests PASS (8/8 ✅)
- [ ] Interface validated and documented
- [ ] Exports updated in index.ts

**Acceptance Criteria**:
- [ ] All 20+ methods defined with correct signatures
- [ ] Parameter types match transcode.types.ts
- [ ] Return types are properly typed
- [ ] JSDoc comments on all methods
- [ ] No TypeScript compilation errors

---

### Sub-phase 2.3: ChainConfig Extension for Transcoding

**Goal**: Extend ChainConfig interface with TranscodeConfig

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 2.1 complete

**Test File**: `packages/sdk-core/tests/config/transcode-config.test.ts` (NEW, ~180 lines)

**Implementation Files**:
- `packages/sdk-core/src/types/chain.types.ts` (+50 lines)
- `packages/sdk-core/src/config/ChainRegistry.ts` (+120 lines)
- `packages/sdk-core/src/config/environment.ts` (+80 lines)

**Max Lines**: 250 total across 3 files

**Tasks**:
- [ ] Write tests FIRST in `transcode-config.test.ts`:
  - [ ] Test: TranscodeConfig interface has all required fields
  - [ ] Test: ChainRegistry.getTranscodeConfig() returns config for Base Sepolia
  - [ ] Test: ChainRegistry.supportsTranscoding() returns true for Base Sepolia
  - [ ] Test: ChainRegistry.getTranscodingChains() returns only chains with transcode support
  - [ ] Test: Base Sepolia has correct transcode config (100 GOP interval, 1.0 USDC min)
  - [ ] Test: Price bounds are enforced (0.001-1.0 per second)
  - [ ] Test: Quality thresholds are correct (38 dB PSNR minimum)
- [ ] Add TranscodeConfig interface to chain.types.ts
- [ ] Extend ChainConfig interface with optional transcode field
- [ ] Update ChainRegistry with Base Sepolia transcode config
- [ ] Add getTranscodeConfig(), supportsTranscoding(), getTranscodingChains() methods
- [ ] Add environment variable parsing for transcode config

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] TranscodeConfig interface defined
- [ ] ChainRegistry extended with transcode support
- [ ] Environment config added

**Acceptance Criteria**:
- [ ] TranscodeConfig has all fields from spec
- [ ] Base Sepolia transcode config matches specification
- [ ] Helper methods work correctly
- [ ] Environment variables parse correctly
- [ ] No TypeScript compilation errors
- [ ] Backward compatible (LLM-only chains still work)

---

## Phase 3: SDK Core - TranscodeManager

**Dependencies**: Phase 2 complete (types and interfaces defined)
**Estimated Time**: 2 weeks
**Goal**: Implement full TranscodeManager with S5 integration

### Sub-phase 3.1: S5 Upload/Download Integration

**Goal**: Implement S5 video upload and download methods

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 2.3 complete

**Test File**: `packages/sdk-core/tests/managers/transcode-s5.test.ts` (NEW, ~250 lines)

**Implementation File**: `packages/sdk-core/src/managers/TranscodeManager.ts` (NEW, ~100 lines for this sub-phase)

**Max Lines**: 100 (incremental addition to TranscodeManager)

**Tasks**:
- [ ] Write tests FIRST in `transcode-s5.test.ts`:
  - [ ] Test: uploadVideoForTranscode() uploads file to S5 and returns CID
  - [ ] Test: uploadVideoForTranscode() encrypts with Blake3 when encrypt=true
  - [ ] Test: uploadVideoForTranscode() calls onProgress callback during upload
  - [ ] Test: downloadTranscodedVideo() downloads from S5 by CID
  - [ ] Test: downloadTranscodedVideo() decrypts with Blake3 encryption key
  - [ ] Test: downloadTranscodedVideo() calls onProgress callback during download
  - [ ] Test: Large file uploads work (>100 MB)
  - [ ] Test: Upload/download errors are handled gracefully
- [ ] Create TranscodeManager class skeleton
- [ ] Implement uploadVideoForTranscode() method
  - [ ] Integrate with S5 client (from StorageManager)
  - [ ] Add Blake3 encryption option
  - [ ] Add progress callbacks
- [ ] Implement downloadTranscodedVideo() method
  - [ ] Download from S5 by CID
  - [ ] Decrypt if encryption key provided
  - [ ] Add progress callbacks

**Deliverables**:
- [ ] Test file created with 8 test cases
- [ ] All tests PASS (8/8 ✅)
- [ ] uploadVideoForTranscode() implemented
- [ ] downloadTranscodedVideo() implemented
- [ ] S5 integration working

**Acceptance Criteria**:
- [ ] Videos upload to S5 successfully
- [ ] Blake3 encryption works (encrypted uploads, decrypted downloads)
- [ ] Progress callbacks fire during upload/download
- [ ] Large files (>100 MB) handle correctly
- [ ] Error handling works (network errors, invalid CIDs)

---

### Sub-phase 3.2: Format Spec Registration

**Goal**: Implement format spec upload to S5 and on-chain registration

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 3.1 complete

**Test File**: `packages/sdk-core/tests/managers/transcode-format-spec.test.ts` (NEW, ~200 lines)

**Implementation File**: `packages/sdk-core/src/managers/TranscodeManager.ts` (+80 lines)

**Max Lines**: 80 (incremental addition)

**Tasks**:
- [ ] Write tests FIRST in `transcode-format-spec.test.ts`:
  - [ ] Test: registerFormatSpec() uploads spec to S5
  - [ ] Test: registerFormatSpec() computes Blake3 hash correctly
  - [ ] Test: registerFormatSpec() registers hash on-chain
  - [ ] Test: registerFormatSpec() returns { specHash, specCID }
  - [ ] Test: getFormatSpec() retrieves spec from S5 by hash
  - [ ] Test: getFormatSpec() validates spec against schema
  - [ ] Test: Duplicate spec registration throws error (already registered)
- [ ] Implement registerFormatSpec() method
  - [ ] Serialize formatSpec to JSON
  - [ ] Compute Blake3 hash
  - [ ] Upload to S5
  - [ ] Register on-chain via JobMarketplace.registerFormatSpec()
- [ ] Implement getFormatSpec() method
  - [ ] Query on-chain for CID
  - [ ] Download from S5
  - [ ] Parse and validate JSON

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] registerFormatSpec() implemented
- [ ] getFormatSpec() implemented
- [ ] On-chain integration working

**Acceptance Criteria**:
- [ ] Format specs upload to S5
- [ ] Blake3 hashes computed correctly
- [ ] On-chain registration succeeds (tx confirmed)
- [ ] Specs can be retrieved by hash
- [ ] JSON validation works
- [ ] Duplicate registrations prevented

---

### Sub-phase 3.3: Transcode Job Creation

**Goal**: Implement createTranscodeJob() with price estimation

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 3.2 complete

**Test File**: `packages/sdk-core/tests/managers/transcode-job-creation.test.ts` (NEW, ~280 lines)

**Implementation File**: `packages/sdk-core/src/managers/TranscodeManager.ts` (+120 lines)

**Max Lines**: 120 (incremental addition)

**Tasks**:
- [ ] Write tests FIRST in `transcode-job-creation.test.ts`:
  - [ ] Test: estimateTranscodePrice() calculates cost correctly (720p H264 standard)
  - [ ] Test: estimateTranscodePrice() applies resolution multiplier (1080p = 1.5x)
  - [ ] Test: estimateTranscodePrice() applies codec multiplier (AV1 = 2.5x)
  - [ ] Test: estimateTranscodePrice() applies quality multiplier (high = 1.5x)
  - [ ] Test: estimateTranscodePrice() returns detailed breakdown
  - [ ] Test: createTranscodeJob() registers format spec
  - [ ] Test: createTranscodeJob() creates job on-chain with correct JobType
  - [ ] Test: createTranscodeJob() validates price against host minimum
  - [ ] Test: createTranscodeJob() returns { jobId, estimatedCost }
  - [ ] Test: createTranscodeJob() emits SessionJobCreated event
- [ ] Implement estimateTranscodePrice() method
  - [ ] Fetch host pricing from NodeRegistry
  - [ ] Calculate base cost (duration × basePricePerUnit)
  - [ ] Apply multipliers (resolution, codec, quality)
  - [ ] Return detailed breakdown
- [ ] Implement createTranscodeJob() method
  - [ ] Register format spec (call registerFormatSpec)
  - [ ] Estimate price (call estimateTranscodePrice)
  - [ ] Create job on-chain (JobMarketplace.createSessionJob)
  - [ ] Extract jobId from event logs

**Deliverables**:
- [ ] Test file created with 10 test cases
- [ ] All tests PASS (10/10 ✅)
- [ ] estimateTranscodePrice() implemented
- [ ] createTranscodeJob() implemented
- [ ] Contract integration working

**Acceptance Criteria**:
- [ ] Price estimation accurate (matches example calculations)
- [ ] Multipliers applied correctly
- [ ] Jobs created on-chain successfully
- [ ] JobType.VIDEO_TRANSCODE set correctly
- [ ] Format spec registered and referenced
- [ ] Events emitted with correct parameters

---

### Sub-phase 3.4: WebSocket Progress Monitoring

**Goal**: Implement monitorTranscodeProgress() with real-time updates

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 3.3 complete

**Test File**: `packages/sdk-core/tests/managers/transcode-progress.test.ts` (NEW, ~220 lines)

**Implementation File**: `packages/sdk-core/src/managers/TranscodeManager.ts` (+100 lines)

**Max Lines**: 100 (incremental addition)

**Tasks**:
- [ ] Write tests FIRST in `transcode-progress.test.ts`:
  - [ ] Test: monitorTranscodeProgress() connects to host WebSocket
  - [ ] Test: Progress callbacks fire with TranscodeProgress data
  - [ ] Test: Progress updates include GOP count (currentGOP/totalGOPs)
  - [ ] Test: Progress updates include status (DOWNLOADING, TRANSCODING, UPLOADING)
  - [ ] Test: monitorTranscodeProgress() resolves when job completes
  - [ ] Test: WebSocket reconnection on disconnect
  - [ ] Test: Error handling for failed transcode jobs
- [ ] Implement monitorTranscodeProgress() method
  - [ ] Establish WebSocket connection to host
  - [ ] Listen for progress events (GOP-by-GOP updates)
  - [ ] Call onProgress callback with structured data
  - [ ] Handle completion, errors, disconnections
  - [ ] Return TranscodeJobResult on completion

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] monitorTranscodeProgress() implemented
- [ ] WebSocket integration working
- [ ] Progress callbacks functional

**Acceptance Criteria**:
- [ ] WebSocket connects successfully
- [ ] Progress updates fire in real-time
- [ ] GOP-by-GOP progress tracked
- [ ] Status changes detected (phases)
- [ ] Completion resolves promise
- [ ] Reconnection works on disconnect
- [ ] Errors handled gracefully

---

### Sub-phase 3.5: GOP Proof Verification

**Goal**: Implement verifyTranscodeOutput() with spot-checking

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 3.4 complete

**Test File**: `packages/sdk-core/tests/managers/transcode-verification.test.ts` (NEW, ~280 lines)

**Implementation File**: `packages/sdk-core/src/managers/TranscodeManager.ts` (+150 lines)

**Max Lines**: 150 (incremental addition)

**Tasks**:
- [ ] Write tests FIRST in `transcode-verification.test.ts`:
  - [ ] Test: getProofTree() retrieves tree from S5 by jobId
  - [ ] Test: getGOPProofs() retrieves specific GOP proofs by indices
  - [ ] Test: selectRandomGOPs() selects random indices using block hash seed
  - [ ] Test: verifyTranscodeOutput() spot-checks 5 random GOPs
  - [ ] Test: verifyTranscodeOutput() validates PSNR ≥ minPSNR
  - [ ] Test: verifyTranscodeOutput() validates format compliance
  - [ ] Test: verifyTranscodeOutput() returns { valid: true } if all GOPs pass
  - [ ] Test: verifyTranscodeOutput() returns { valid: false, failedGOPs } if any fail
  - [ ] Test: Merkle proof verification works
- [ ] Implement getProofTree() method
  - [ ] Query ProofSystem for tree CID
  - [ ] Download from S5
  - [ ] Parse TranscodeProofTree JSON
- [ ] Implement getGOPProofs() method
  - [ ] Download proof tree
  - [ ] Extract specific GOP proofs by indices
  - [ ] Return array of GOPProof objects
- [ ] Implement selectRandomGOPs() helper
  - [ ] Use block hash as random seed
  - [ ] Select N random indices
- [ ] Implement verifyTranscodeOutput() method
  - [ ] Select random GOPs
  - [ ] Download GOP proofs
  - [ ] Verify PSNR ≥ threshold
  - [ ] Verify format compliance
  - [ ] Return verification result

**Deliverables**:
- [ ] Test file created with 9 test cases
- [ ] All tests PASS (9/9 ✅)
- [ ] getProofTree() implemented
- [ ] getGOPProofs() implemented
- [ ] verifyTranscodeOutput() implemented
- [ ] S5 proof retrieval working

**Acceptance Criteria**:
- [ ] Proof trees download from S5
- [ ] GOP proofs extracted correctly
- [ ] Random sampling deterministic (block hash seed)
- [ ] PSNR validation works
- [ ] Format compliance checks work
- [ ] Failed GOPs reported correctly
- [ ] Merkle proofs verified (optional, for disputes)

---

## Phase 4: Transcode Node Software

**Dependencies**: Phase 3 complete (SDK TranscodeManager implemented)
**Estimated Time**: 3 weeks
**Goal**: Create fabstir-transcode-node Rust repository with GOP proof generation

### Sub-phase 4.1: Repository Structure & Dependencies

**Goal**: Create fabstir-transcode-node repository skeleton

**Status**: ⏳ Pending

**Dependencies**: Phase 3 complete

**Tasks**:
- [ ] Create new Git repository: `fabstir-transcode-node`
- [ ] Add `Cargo.toml` with dependencies:
  - [ ] fabstir-transcoder (git submodule or crates.io)
  - [ ] risc0-zkvm (STARK proof generation)
  - [ ] s5-client (S5 storage)
  - [ ] tokio (async runtime)
  - [ ] ethers (contract interaction)
  - [ ] serde, serde_json (serialization)
  - [ ] blake3 (hashing)
  - [ ] tokio-tungstenite (WebSocket)
- [ ] Create directory structure:
  ```
  fabstir-transcode-node/
  ├── Cargo.toml
  ├── src/
  │   ├── main.rs
  │   ├── config.rs
  │   ├── contracts/
  │   │   ├── job_marketplace.rs
  │   │   ├── node_registry.rs
  │   │   └── proof_system.rs
  │   ├── transcode/
  │   │   ├── mod.rs
  │   │   ├── handler.rs
  │   │   └── gop_splitter.rs
  │   ├── proof/
  │   │   ├── mod.rs
  │   │   ├── generator.rs
  │   │   └── merkle.rs
  │   ├── storage/
  │   │   ├── mod.rs
  │   │   └── s5_client.rs
  │   └── websocket/
  │       ├── mod.rs
  │       └── server.rs
  ├── proof/
  │   ├── guest/
  │   │   ├── Cargo.toml
  │   │   └── src/
  │   │       └── main.rs  (Risc0 guest program)
  │   └── host/
  │       └── src/
  │           └── lib.rs
  ├── Dockerfile
  └── README.md
  ```
- [ ] Add README.md with setup instructions
- [ ] Add .env.example with required variables
- [ ] Initialize Git repository

**Deliverables**:
- [ ] Repository created on GitHub
- [ ] Cargo.toml with all dependencies
- [ ] Directory structure created
- [ ] README.md with setup guide
- [ ] .env.example documented

**Acceptance Criteria**:
- [ ] `cargo build` succeeds
- [ ] All dependencies resolve correctly
- [ ] Directory structure follows Rust conventions
- [ ] README has clear setup instructions

---

### Sub-phase 4.2: Contract Integration

**Goal**: Implement Rust wrappers for smart contracts

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 4.1 complete

**Test File**: `fabstir-transcode-node/tests/contracts_test.rs` (NEW, ~200 lines)

**Implementation Files**:
- `src/contracts/job_marketplace.rs` (~150 lines)
- `src/contracts/node_registry.rs` (~120 lines)
- `src/contracts/proof_system.rs` (~100 lines)

**Max Lines**: 370 total across 3 files

**Tasks**:
- [ ] Write tests FIRST in `contracts_test.rs`:
  - [ ] Test: Connect to JobMarketplace contract
  - [ ] Test: Fetch job details by jobId
  - [ ] Test: Parse SessionJob struct correctly
  - [ ] Test: Connect to NodeRegistry contract
  - [ ] Test: Fetch host info (transcode pricing)
  - [ ] Test: Connect to ProofSystem contract
  - [ ] Test: Submit transcode proof (mock data)
- [ ] Implement `job_marketplace.rs`:
  - [ ] Load JobMarketplace ABI
  - [ ] Create contract instance
  - [ ] Implement getJob() method
  - [ ] Parse SessionJob struct
- [ ] Implement `node_registry.rs`:
  - [ ] Load NodeRegistry ABI
  - [ ] Create contract instance
  - [ ] Implement getNode() method
  - [ ] Parse TranscodePricing struct
- [ ] Implement `proof_system.rs`:
  - [ ] Load ProofSystem ABI
  - [ ] Create contract instance
  - [ ] Implement submitTranscodeProof() method

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] Contract wrappers implemented
- [ ] ABI loading working
- [ ] Contract calls functional

**Acceptance Criteria**:
- [ ] Connects to Base Sepolia testnet
- [ ] Fetches job data correctly
- [ ] Parses structs correctly (Rust types match Solidity)
- [ ] Proof submission works (tx confirmed)

---

### Sub-phase 4.3: S5 Storage Integration

**Goal**: Implement S5 client for download/upload

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 4.1 complete

**Test File**: `fabstir-transcode-node/tests/s5_storage_test.rs` (NEW, ~180 lines)

**Implementation File**: `src/storage/s5_client.rs` (~120 lines)

**Max Lines**: 120

**Tasks**:
- [ ] Write tests FIRST in `s5_storage_test.rs`:
  - [ ] Test: Download file from S5 by CID
  - [ ] Test: Upload file to S5, returns CID
  - [ ] Test: Decrypt file with Blake3 key
  - [ ] Test: Encrypt file with Blake3 key
  - [ ] Test: Large file upload (>100 MB)
  - [ ] Test: Error handling (invalid CID, network errors)
- [ ] Implement `s5_client.rs`:
  - [ ] Create S5Client struct
  - [ ] Implement download() method
  - [ ] Implement upload() method
  - [ ] Implement Blake3 decrypt() helper
  - [ ] Implement Blake3 encrypt() helper
  - [ ] Add error handling

**Deliverables**:
- [ ] Test file created with 6 test cases
- [ ] All tests PASS (6/6 ✅)
- [ ] S5Client implemented
- [ ] Blake3 encryption working
- [ ] Upload/download functional

**Acceptance Criteria**:
- [ ] Downloads from S5 succeed
- [ ] Uploads to S5 succeed and return CID
- [ ] Blake3 decryption works
- [ ] Large files handled correctly
- [ ] Errors propagated clearly

---

### Sub-phase 4.4: Transcode Job Handler

**Goal**: Implement main transcode job processing loop

**Status**: ⏳ Pending

**Dependencies**: Sub-phases 4.2, 4.3 complete

**Test File**: `fabstir-transcode-node/tests/job_handler_test.rs` (NEW, ~250 lines)

**Implementation File**: `src/transcode/handler.rs` (~200 lines)

**Max Lines**: 200

**Tasks**:
- [ ] Write tests FIRST in `job_handler_test.rs`:
  - [ ] Test: handleTranscodeJob() fetches job from contract
  - [ ] Test: Downloads format spec from S5
  - [ ] Test: Downloads input video from S5
  - [ ] Test: Calls fabstir-transcoder with correct options
  - [ ] Test: Uploads output video to S5
  - [ ] Test: Returns output CID
  - [ ] Test: Error handling (transcode failures, S5 failures)
- [ ] Integrate fabstir-transcoder as dependency
- [ ] Implement `handler.rs`:
  - [ ] Create TranscodeJobHandler struct
  - [ ] Implement handleTranscodeJob() method
    - [ ] Fetch job from JobMarketplace
    - [ ] Download format spec from S5
    - [ ] Download input video from S5
    - [ ] Call fabstir-transcoder
    - [ ] Upload output to S5
  - [ ] Add progress streaming (via WebSocket)
  - [ ] Add error handling

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] TranscodeJobHandler implemented
- [ ] fabstir-transcoder integrated
- [ ] Full workflow functional

**Acceptance Criteria**:
- [ ] Downloads input video successfully
- [ ] Transcodes video correctly (h264, AV1)
- [ ] Uploads output video successfully
- [ ] Progress updates stream via WebSocket
- [ ] Errors handled and logged

---

### Sub-phase 4.5: WebSocket Progress Server

**Goal**: Implement WebSocket server for real-time progress

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 4.4 complete

**Test File**: `fabstir-transcode-node/tests/websocket_test.rs` (NEW, ~220 lines)

**Implementation File**: `src/websocket/server.rs` (~180 lines)

**Max Lines**: 180

**Tasks**:
- [ ] Write tests FIRST in `websocket_test.rs`:
  - [ ] Test: WebSocket server starts on port 8080
  - [ ] Test: Client connects successfully
  - [ ] Test: Send progress update, client receives
  - [ ] Test: Send completion event, client receives
  - [ ] Test: Send error event, client receives
  - [ ] Test: Multiple clients can connect
  - [ ] Test: Disconnection handled gracefully
- [ ] Implement `server.rs`:
  - [ ] Create WebSocketServer struct
  - [ ] Implement start() method (bind to port)
  - [ ] Implement sendProgress() method
  - [ ] Implement sendCompletion() method
  - [ ] Implement sendError() method
  - [ ] Handle client connections/disconnections

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] WebSocketServer implemented
- [ ] Client connections working
- [ ] Progress streaming functional

**Acceptance Criteria**:
- [ ] Server starts on configurable port
- [ ] Clients connect successfully
- [ ] Progress events broadcast to all clients
- [ ] Disconnections don't crash server
- [ ] JSON messages formatted correctly

---

### Sub-phase 4.6: Docker Configuration

**Goal**: Create Dockerfile for transcode node deployment

**Status**: ⏳ Pending

**Dependencies**: Sub-phases 4.1-4.5 complete

**Implementation File**: `Dockerfile` (~60 lines)

**Tasks**:
- [ ] Create Dockerfile:
  - [ ] Base image: `nvidia/cuda:12.2-runtime-ubuntu22.04` (for NVENC)
  - [ ] Install Rust toolchain
  - [ ] Install FFmpeg with NVENC/VAAPI support
  - [ ] Copy fabstir-transcode-node source
  - [ ] Build Rust binary
  - [ ] Expose port 8080 (WebSocket)
  - [ ] Set entrypoint
- [ ] Create docker-compose.yml for easy deployment
- [ ] Test Docker build locally
- [ ] Test Docker run with GPU passthrough
- [ ] Document deployment steps in README

**Deliverables**:
- [ ] Dockerfile created
- [ ] docker-compose.yml created
- [ ] Docker build succeeds
- [ ] Docker run with GPU works
- [ ] README deployment section added

**Acceptance Criteria**:
- [ ] Docker image builds successfully
- [ ] Container runs with `--gpus all` flag
- [ ] NVENC/VAAPI acceleration works inside container
- [ ] WebSocket server accessible from host
- [ ] Logs visible via `docker logs`

---

## Phase 5: GOP Proof Generation

**Dependencies**: Phase 4 complete (transcode node working)
**Estimated Time**: 2 weeks
**Goal**: Implement Risc0 zkVM guest program for GOP quality proofs

### Sub-phase 5.1: GOP Splitter

**Goal**: Implement video splitting into GOPs

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 4.4 complete

**Test File**: `fabstir-transcode-node/tests/gop_splitter_test.rs` (NEW, ~200 lines)

**Implementation File**: `src/transcode/gop_splitter.rs` (~150 lines)

**Max Lines**: 150

**Tasks**:
- [ ] Write tests FIRST in `gop_splitter_test.rs`:
  - [ ] Test: splitIntoGOPs() detects keyframes (I-frames)
  - [ ] Test: GOPs have correct structure (IBBPBBP...)
  - [ ] Test: GOP size matches format spec (e.g., 60 frames)
  - [ ] Test: Last GOP handled correctly (may be smaller)
  - [ ] Test: GOPs cover entire video (no frames skipped)
  - [ ] Test: Works with h264 and AV1 codecs
- [ ] Implement `gop_splitter.rs`:
  - [ ] Parse video bitstream to find keyframes
  - [ ] Split video at keyframe boundaries
  - [ ] Return Vec<GOP> with frame ranges
  - [ ] Add GOP metadata (index, size, bitrate)

**Deliverables**:
- [ ] Test file created with 6 test cases
- [ ] All tests PASS (6/6 ✅)
- [ ] GOPSplitter implemented
- [ ] Keyframe detection working
- [ ] GOP extraction functional

**Acceptance Criteria**:
- [ ] Keyframes detected correctly
- [ ] GOPs have valid structure
- [ ] GOP count accurate (for proof generation)
- [ ] Works with both h264 and AV1

---

### Sub-phase 5.2: Risc0 Guest Program - PSNR Calculation

**Goal**: Create Risc0 zkVM guest program that computes PSNR

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 5.1 complete

**Test File**: `fabstir-transcode-node/proof/host/tests/psnr_test.rs` (NEW, ~180 lines)

**Implementation File**: `proof/guest/src/main.rs` (~120 lines)

**Max Lines**: 120 (guest program must be small for proof performance)

**Tasks**:
- [ ] Write tests FIRST in `psnr_test.rs`:
  - [ ] Test: Guest program executes successfully
  - [ ] Test: PSNR calculated correctly for identical frames (infinite dB)
  - [ ] Test: PSNR calculated correctly for different frames (~30-50 dB range)
  - [ ] Test: PSNR output in journal (can be decoded)
  - [ ] Test: Proof generation succeeds (<3 seconds)
  - [ ] Test: Proof verification succeeds
- [ ] Implement `guest/src/main.rs`:
  - [ ] Read input GOP data from env
  - [ ] Read output GOP data from env
  - [ ] Compute MSE (Mean Squared Error)
  - [ ] Compute PSNR = 10 * log10(MAX² / MSE)
  - [ ] Write PSNR to journal
  - [ ] Add input/output hashes to journal

**Deliverables**:
- [ ] Test file created with 6 test cases
- [ ] All tests PASS (6/6 ✅)
- [ ] Risc0 guest program implemented
- [ ] PSNR calculation correct
- [ ] Proof generation working

**Acceptance Criteria**:
- [ ] PSNR values accurate (within 0.1 dB of reference)
- [ ] Proof generates in <3 seconds (GPU accelerated)
- [ ] Proof verifies successfully
- [ ] Journal decodes correctly (f32 PSNR value)

---

### Sub-phase 5.3: Parallel GOP Proof Generation

**Goal**: Implement parallel proof generation for all GOPs

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 5.2 complete

**Test File**: `fabstir-transcode-node/tests/proof_generation_test.rs` (NEW, ~250 lines)

**Implementation File**: `src/proof/generator.rs` (~200 lines)

**Max Lines**: 200

**Tasks**:
- [ ] Write tests FIRST in `proof_generation_test.rs`:
  - [ ] Test: generateGOPProofs() generates proofs for all GOPs
  - [ ] Test: Proofs generated in parallel (faster than sequential)
  - [ ] Test: Each proof has correct PSNR value
  - [ ] Test: Each proof has input/output hashes
  - [ ] Test: STARK proof hashes are unique per GOP
  - [ ] Test: Large video (1000+ GOPs) completes in <10 minutes
  - [ ] Test: Error handling (proof generation failure for one GOP)
- [ ] Implement `generator.rs`:
  - [ ] Create ProofGenerator struct
  - [ ] Implement generateGOPProofs() method
    - [ ] Split into GOPs (call GOPSplitter)
    - [ ] Parallelize proof generation (rayon or tokio)
    - [ ] For each GOP: run Risc0 guest program
    - [ ] Collect GOPProof results
  - [ ] Add GPU acceleration (CUDA)
  - [ ] Add progress callbacks

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] ProofGenerator implemented
- [ ] Parallel generation working
- [ ] GPU acceleration enabled

**Acceptance Criteria**:
- [ ] Proofs generate in parallel
- [ ] GPU acceleration works (2-3x speedup)
- [ ] All GOPs have valid proofs
- [ ] Progress callbacks fire
- [ ] Large videos complete in reasonable time (<10 min for 1000 GOPs)

---

### Sub-phase 5.4: Merkle Tree Construction & Submission

**Goal**: Build Merkle tree of GOP proofs and submit to contract

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 5.3 complete

**Test File**: `fabstir-transcode-node/tests/merkle_tree_test.rs` (NEW, ~220 lines)

**Implementation File**: `src/proof/merkle.rs` (~180 lines)

**Max Lines**: 180

**Tasks**:
- [ ] Write tests FIRST in `merkle_tree_test.rs`:
  - [ ] Test: buildMerkleTree() creates valid tree
  - [ ] Test: Merkle root calculated correctly
  - [ ] Test: Tree has correct depth (log2(gopCount))
  - [ ] Test: Spot check hashes included
  - [ ] Test: Upload tree to S5, returns CID
  - [ ] Test: Submit proof to ProofSystem contract
  - [ ] Test: Transaction confirmed on-chain
- [ ] Implement `merkle.rs`:
  - [ ] Create MerkleTree struct
  - [ ] Implement buildMerkleTree() method
    - [ ] Hash each GOPProof
    - [ ] Build binary tree bottom-up
    - [ ] Compute root hash
  - [ ] Implement selectSpotCheckHashes() method
  - [ ] Implement uploadToS5() method
  - [ ] Implement submitToContract() method

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] MerkleTree implemented
- [ ] Tree construction correct
- [ ] On-chain submission working

**Acceptance Criteria**:
- [ ] Merkle root matches reference implementation
- [ ] Tree structure valid (binary tree)
- [ ] Spot check hashes deterministic (block hash seed)
- [ ] Upload to S5 succeeds
- [ ] On-chain submission succeeds (tx confirmed)
- [ ] Event emitted (TranscodeProofSubmitted)

---

## Phase 6: Host CLI & UI Integration

**Dependencies**: Phases 1-5 complete
**Estimated Time**: 1 week
**Goal**: Add transcode commands to Host CLI and update browser UI

### Sub-phase 6.1: Host CLI - Transcode Registration

**Goal**: Add `register-transcode` command to Host CLI

**Status**: ⏳ Pending

**Dependencies**: Sub-phases 1.3, 2.2 complete

**Test File**: `packages/host-cli/tests/commands/register-transcode.test.ts` (NEW, ~200 lines)

**Implementation File**: `packages/host-cli/src/commands/register-transcode.ts` (NEW, ~150 lines)

**Max Lines**: 150

**Tasks**:
- [ ] Write tests FIRST in `register-transcode.test.ts`:
  - [ ] Test: `register-transcode` command exists
  - [ ] Test: Accepts --formats flag (h264,av1)
  - [ ] Test: Accepts --resolutions flag (720p,1080p,4k)
  - [ ] Test: Accepts --price-per-second flag (0.01)
  - [ ] Test: Accepts --hardware-accel flag (true/false)
  - [ ] Test: Calls NodeRegistry.registerTranscodeHost()
  - [ ] Test: Displays success message with pricing
- [ ] Implement `register-transcode.ts`:
  - [ ] Define command with yargs
  - [ ] Parse CLI flags
  - [ ] Validate pricing (min/max bounds)
  - [ ] Hash format strings to bytes32
  - [ ] Call sdk.getHostManager().registerTranscodeHost()
  - [ ] Display formatted output

**Deliverables**:
- [ ] Test file created with 7 test cases
- [ ] All tests PASS (7/7 ✅)
- [ ] register-transcode command implemented
- [ ] CLI flags working
- [ ] Contract integration functional

**Acceptance Criteria**:
- [ ] Command accessible via `fabstir-host register-transcode`
- [ ] Flags parsed correctly
- [ ] Registration succeeds (tx confirmed)
- [ ] Success message displays pricing details
- [ ] Error messages clear and helpful

---

### Sub-phase 6.2: Host CLI - Pricing Update Command

**Goal**: Add `update-transcode-pricing` command

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 6.1 complete

**Test File**: `packages/host-cli/tests/commands/update-pricing.test.ts` (NEW, ~180 lines)

**Implementation File**: `packages/host-cli/src/commands/update-transcode-pricing.ts` (NEW, ~120 lines)

**Max Lines**: 120

**Tasks**:
- [ ] Write tests FIRST in `update-pricing.test.ts`:
  - [ ] Test: `update-transcode-pricing` command exists
  - [ ] Test: Accepts --price-per-second flag
  - [ ] Test: Accepts multiplier flags (--720p-mult, --1080p-mult, etc.)
  - [ ] Test: Calls NodeRegistry.updateTranscodePricing()
  - [ ] Test: Displays old vs new pricing comparison
  - [ ] Test: Validation prevents invalid pricing
- [ ] Implement `update-transcode-pricing.ts`:
  - [ ] Define command
  - [ ] Parse pricing updates
  - [ ] Fetch current pricing
  - [ ] Validate new pricing
  - [ ] Call updateTranscodePricing()
  - [ ] Display before/after comparison

**Deliverables**:
- [ ] Test file created with 6 test cases
- [ ] All tests PASS (6/6 ✅)
- [ ] update-transcode-pricing command implemented
- [ ] Pricing validation working
- [ ] Contract integration functional

**Acceptance Criteria**:
- [ ] Command accessible via `fabstir-host update-transcode-pricing`
- [ ] Pricing updates apply on-chain
- [ ] Validation prevents invalid pricing
- [ ] Before/after comparison clear
- [ ] Error messages helpful

---

### Sub-phase 6.3: Browser UI - Transcode Job Creation

**Goal**: Add transcode job creation to test harness UI

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 3.5 complete

**Test File**: Manual testing (browser)

**Implementation File**: `apps/harness/pages/transcode-demo.tsx` (NEW, ~400 lines)

**Max Lines**: 400

**Tasks**:
- [ ] Create `transcode-demo.tsx` in apps/harness/pages/
- [ ] Implement UI components:
  - [ ] Video file upload (drag-and-drop)
  - [ ] Format selection (codec, resolution, quality)
  - [ ] Host selection (filter by price, formats)
  - [ ] Price estimation display
  - [ ] Job creation button
  - [ ] Progress bar (GOP-by-GOP)
  - [ ] Output download button
  - [ ] Verification button (spot-check GOPs)
- [ ] Integrate with TranscodeManager:
  - [ ] uploadVideoForTranscode()
  - [ ] findTranscodeHosts()
  - [ ] estimateTranscodePrice()
  - [ ] createTranscodeJob()
  - [ ] monitorTranscodeProgress()
  - [ ] verifyTranscodeOutput()
  - [ ] downloadTranscodedVideo()
- [ ] Add error handling and loading states

**Deliverables**:
- [ ] transcode-demo.tsx created
- [ ] UI components functional
- [ ] Full workflow working (upload → transcode → verify → download)
- [ ] Manual testing complete

**Acceptance Criteria**:
- [ ] Video upload works (displays preview)
- [ ] Format selection updates price estimate
- [ ] Host filtering works (by price, formats)
- [ ] Job creation succeeds
- [ ] Progress bar updates in real-time
- [ ] Output downloads successfully
- [ ] Verification spot-checks work
- [ ] Error states handled gracefully

---

## Phase 7: Testing & Deployment

**Dependencies**: Phases 1-6 complete
**Estimated Time**: 1-2 weeks
**Goal**: Integration testing, performance benchmarking, beta deployment

### Sub-phase 7.1: End-to-End Integration Tests

**Goal**: Write comprehensive E2E tests for full transcode workflow

**Status**: ⏳ Pending

**Dependencies**: All previous phases complete

**Test File**: `packages/sdk-core/tests/integration/transcode-e2e.test.ts` (NEW, ~400 lines)

**Max Lines**: 400

**Tasks**:
- [ ] Write E2E test suite in `transcode-e2e.test.ts`:
  - [ ] Test: Full workflow (upload → create job → transcode → verify → download)
  - [ ] Test: 720p H264 standard quality (baseline)
  - [ ] Test: 1080p AV1 high quality (complex codec)
  - [ ] Test: 4K H264 lossless (large file)
  - [ ] Test: Price estimation accurate (within 10% of actual)
  - [ ] Test: GOP proofs verify correctly (spot-check 10 GOPs)
  - [ ] Test: PSNR meets quality threshold (≥38 dB for standard)
  - [ ] Test: Format compliance (codec, resolution, bitrate)
  - [ ] Test: Blake3 encryption/decryption works
  - [ ] Test: Error handling (transcode failure, host offline)
- [ ] Run tests against real Base Sepolia testnet
- [ ] Run tests against real transcode node (Docker)
- [ ] Document test results

**Deliverables**:
- [ ] Test file created with 10 test cases
- [ ] All tests PASS (10/10 ✅)
- [ ] Test results documented
- [ ] Known issues documented

**Acceptance Criteria**:
- [ ] All 10 tests pass against real contracts
- [ ] Tests run against real transcode node
- [ ] GOP verification works
- [ ] PSNR values meet thresholds
- [ ] No unexpected errors
- [ ] Test suite runs in <30 minutes

---

### Sub-phase 7.2: Performance Benchmarking

**Goal**: Benchmark transcode performance and proof generation

**Status**: ⏳ Pending

**Dependencies**: Sub-phase 7.1 complete

**Benchmark File**: `packages/sdk-core/tests/benchmarks/transcode-perf.test.ts` (NEW, ~300 lines)

**Max Lines**: 300

**Tasks**:
- [ ] Create benchmark suite in `transcode-perf.test.ts`:
  - [ ] Benchmark: 720p H264 transcode time (10-min video)
  - [ ] Benchmark: 1080p H264 transcode time (10-min video)
  - [ ] Benchmark: 4K AV1 transcode time (10-min video)
  - [ ] Benchmark: GOP proof generation time (per GOP)
  - [ ] Benchmark: Merkle tree construction time (1000 GOPs)
  - [ ] Benchmark: S5 upload time (100 MB file)
  - [ ] Benchmark: S5 download time (100 MB file)
  - [ ] Benchmark: Total job time (end-to-end)
- [ ] Run benchmarks on reference hardware:
  - [ ] RTX 4090 (high-end)
  - [ ] RTX 3060 (mid-range)
  - [ ] Intel Arc A770 (hardware accel)
- [ ] Document results in spreadsheet
- [ ] Compare to AWS MediaConvert benchmarks

**Deliverables**:
- [ ] Benchmark suite created
- [ ] Results documented for 3 GPU types
- [ ] Performance comparison to AWS MediaConvert
- [ ] Optimization recommendations

**Acceptance Criteria**:
- [ ] 1080p H264 transcode ≥10x realtime (RTX 4090)
- [ ] 1080p AV1 transcode ≥3x realtime (RTX 4090)
- [ ] GOP proof generation <2s per GOP (GPU accelerated)
- [ ] S5 upload/download ≥50 Mbps
- [ ] Total job time competitive with AWS (within 2x)
- [ ] Results reproducible

---

### Sub-phase 7.3: Beta Deployment & User Testing

**Goal**: Deploy to Base Sepolia, recruit beta testers, gather feedback

**Status**: ⏳ Pending

**Dependencies**: Sub-phases 7.1, 7.2 complete

**Tasks**:
- [ ] Deploy final contracts to Base Sepolia:
  - [ ] JobMarketplaceWithModels
  - [ ] NodeRegistryWithModels
  - [ ] ProofSystem
- [ ] Update .env.test with final contract addresses
- [ ] Update SDK with final ABIs
- [ ] Deploy transcode node Docker image:
  - [ ] Build and tag image
  - [ ] Push to Docker Hub
  - [ ] Test deployment on VPS
- [ ] Create beta tester recruitment materials:
  - [ ] Forum post (Sia Discord, Reddit r/decentralization)
  - [ ] Tweet/X post
  - [ ] Beta signup form (Google Forms)
- [ ] Recruit 5-10 beta testers
- [ ] Onboard beta testers:
  - [ ] Provide testnet USDC
  - [ ] Share test harness URL
  - [ ] Provide documentation
  - [ ] Set up support channel (Discord)
- [ ] Collect feedback via survey
- [ ] Document bugs and feature requests

**Deliverables**:
- [ ] Contracts deployed to Base Sepolia (final)
- [ ] Docker image deployed (public)
- [ ] 5-10 beta testers recruited
- [ ] Beta testing complete (2-week period)
- [ ] Feedback survey results (quantitative + qualitative)
- [ ] Bug reports triaged and prioritized

**Acceptance Criteria**:
- [ ] At least 5 beta testers complete full workflow
- [ ] At least 20 transcode jobs completed successfully
- [ ] Average satisfaction score ≥7/10
- [ ] Zero critical bugs (contract vulnerabilities, data loss)
- [ ] Minor bugs documented for post-beta fixes
- [ ] Positive feedback on GOP proof verification
- [ ] Pricing deemed competitive vs AWS MediaConvert

---

## Post-MVP Roadmap

After successful beta deployment, future work includes:

**Q2 2025**:
- [ ] Mainnet deployment (Base mainnet)
- [ ] Audio transcoding support (standalone)
- [ ] Live streaming transcode (HLS, DASH)
- [ ] Multi-GPU parallelization (faster transcoding)
- [ ] Advanced quality metrics (VMAF, SSIM)

**Q3 2025**:
- [ ] Image generation marketplace (DALL-E, Stable Diffusion)
- [ ] 3D rendering marketplace (Blender, Maya)
- [ ] RAG/vector database as a service
- [ ] Mobile app (iOS, Android)

**Q4 2025**:
- [ ] Model training marketplace
- [ ] Federated learning support
- [ ] AI agent marketplace
- [ ] Enterprise SLAs and private nodes

---

## Success Metrics

### Technical Success
- [ ] 100% of transcode jobs complete successfully (no crashes)
- [ ] GOP proofs verify correctly (100% spot-check pass rate)
- [ ] PSNR ≥38 dB for standard quality (95%+ of jobs)
- [ ] Transcode speed ≥10x realtime (1080p H264 on RTX 4090)
- [ ] S5 upload/download ≥50 Mbps
- [ ] Zero contract vulnerabilities (audited)

### Business Success
- [ ] Pricing competitive with AWS MediaConvert (within 2x)
- [ ] 10+ active transcode hosts on testnet
- [ ] 50+ transcode jobs completed during beta
- [ ] 5+ beta testers from video/NFT communities
- [ ] Average satisfaction ≥7/10
- [ ] Zero security incidents (encryption, proofs)

### Community Success
- [ ] Positive reception in Sia community (>100 Discord reactions)
- [ ] Media coverage (1+ article in crypto/video tech press)
- [ ] GitHub stars (>50 on fabstir-transcode-node)
- [ ] 3+ community contributions (PRs, issues)

---

## Risk Mitigation

### Technical Risks

**Risk**: Risc0 proof generation too slow (>10s per GOP)
**Mitigation**:
- GPU acceleration (CUDA)
- Optimize guest program (minimize computation)
- Proof caching for repeated segments
- Fallback to segment-based proofs (10 GOPs per proof)

**Risk**: S5 upload/download too slow (network bottleneck)
**Mitigation**:
- Use S5 regional gateways (closest to host)
- Chunked uploads (parallel)
- CDN integration (future)

**Risk**: Smart contract gas costs too high
**Mitigation**:
- Merkle root only (not all GOPs)
- Batch proof submissions
- Optimize contract code (gas profiling)
- Use opBNB (cheaper gas) as alternative

### Business Risks

**Risk**: Hosts don't join (insufficient demand)
**Mitigation**:
- Marketing to render farms, VFX studios
- Host incentive program (bonus FAB tokens)
- Easy onboarding (Docker, Host CLI)

**Risk**: Users prefer AWS MediaConvert (trust)
**Mitigation**:
- Emphasize privacy (encrypted uploads)
- Transparency (open source, auditable proofs)
- Competitive pricing
- Web3-native positioning (NFT marketplaces, decentralized platforms)

### Security Risks

**Risk**: Proof fraud (fake PSNR values)
**Mitigation**:
- PSNR calculation inside zkVM (provable)
- Spot-checking by clients (random GOPs)
- Stake slashing for invalid proofs
- Reputation system

**Risk**: Encryption key leakage
**Mitigation**:
- Keys never leave client/host
- Blake3 encryption (audited)
- S5 nodes never see plaintext
- Best practices documentation

---

## Appendix

### Reference Documents

- **Contract Spec**: `docs/transcode-reference/TRANSCODE_CONTRACT_SPEC.md` (600+ lines)
- **Config Spec**: `docs/transcode-reference/TRANSCODE_CONFIG_SPEC.md` (400+ lines)
- **Integration Summary**: `docs/transcode-reference/TRANSCODE_INTEGRATION_SUMMARY.md` (1000+ lines)
- **SDK Types**: `packages/sdk-core/src/types/transcode.types.ts` (400+ lines)
- **SDK Interface**: `packages/sdk-core/src/interfaces/ITranscodeManager.ts` (300+ lines)

### External Dependencies

- **fabstir-transcoder**: https://github.com/Fabstir/fabstir-transcoder (your Rust transcoder)
- **Fabstir_Media_Player_Snaps**: https://github.com/Fabstir/Fabstir_Media_Player_Snaps (service worker)
- **S5 Encryption Spec**: https://docs.sfive.net/spec/encryption.html
- **Risc0 zkVM**: https://dev.risczero.com/ (STARK proof generation)

### Contact

For questions about this implementation plan:
- Review reference documents in `docs/transcode-reference/`
- Check contract specifications in "Contract Developer Handoff" section
- Consult SDK interface in `packages/sdk-core/src/interfaces/ITranscodeManager.ts`

---

**Document Version**: 1.0.0
**Last Updated**: October 19, 2025
**Status**: 🚀 Ready to Start - Phase 1 awaiting contract developer
**Total Sub-Phases**: 28
**Estimated Timeline**: 10-12 weeks (parallel development with LLM MVP testing)
