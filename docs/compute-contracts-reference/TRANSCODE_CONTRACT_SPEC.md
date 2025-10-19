# Video Transcoding Contract Extensions - Technical Specification

**Version**: 1.0.0
**Status**: Design Specification
**Target**: Post-LLM MVP (Separate Branch)
**Last Updated**: October 19, 2025

---

## Overview

This document specifies the smart contract extensions required to support video/audio transcoding jobs alongside LLM inference in the Platformless AI marketplace.

### Design Principles

1. **Backward Compatibility**: Existing LLM functionality must remain unchanged
2. **Job Type Abstraction**: Generic job system supporting multiple compute types
3. **Pricing Flexibility**: Different pricing models for different job types
4. **Proof Verification**: GOP-based STARK proofs with quality metrics
5. **Minimal On-Chain Storage**: Store only essential data, offload to S5

---

## Phase 1.1: JobType Enum Extension

### Current State

```solidity
// JobMarketplaceWithModels.sol - Current Implementation
contract JobMarketplaceWithModels {
    struct SessionJob {
        address client;
        address host;
        bytes32 modelId;  // Used for both LLM models and transcode profiles
        uint256 pricePerToken;
        uint256 deposit;
        uint256 tokensConsumed;
        // ... other fields
    }
}
```

### Proposed Changes

```solidity
// JobMarketplaceWithModels.sol - Extended Version

// New enum for job types
enum JobType {
    LLM_INFERENCE,      // 0 - Text generation (existing)
    VIDEO_TRANSCODE,    // 1 - Video format conversion
    AUDIO_TRANSCODE,    // 2 - Audio format conversion
    IMAGE_GENERATION,   // 3 - Future: Image gen (DALL-E, Stable Diffusion)
    THREE_D_RENDER      // 4 - Future: 3D rendering
}

// Extended SessionJob struct
struct SessionJob {
    // Existing fields
    address client;
    address host;
    bytes32 modelId;        // For LLM: model hash, For transcode: profile hash
    uint256 pricePerToken;  // For LLM: per token, For transcode: see PricingUnit
    uint256 deposit;
    uint256 tokensConsumed; // For LLM: tokens, For transcode: seconds/MB

    // New fields for multi-type support
    JobType jobType;        // NEW: Type of compute job
    PricingUnit pricingUnit; // NEW: How to measure consumption
    bytes32 formatSpecHash;  // NEW: Hash of format specification (off-chain on S5)

    // Existing fields (unchanged)
    uint256 startTime;
    uint256 endTime;
    bool completed;
    address token;
}

// New enum for pricing units
enum PricingUnit {
    PER_TOKEN,          // LLM inference (tokens generated)
    PER_SECOND,         // Transcode by video duration
    PER_MEGABYTE,       // Transcode by input file size
    PER_FRAME,          // Image generation
    PER_POLYGON         // 3D rendering
}
```

### Migration Strategy

**Option A: Add fields to existing struct** (Recommended)
- Pros: Single contract, no migration needed
- Cons: Slightly increased storage for LLM jobs
- Impact: +2 storage slots per job (~40,000 gas per job creation)

**Option B: Create separate TranscodeJobMarketplace contract**
- Pros: Complete separation, no impact on LLM
- Cons: Duplicate code, harder to manage
- Impact: Requires separate contract deployment

**Recommendation**: Use Option A (single contract extension)

### Function Changes

```solidity
// BEFORE (current LLM-only version)
function createSessionJob(
    address host,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId)

// AFTER (multi-type version)
function createSessionJob(
    address host,
    JobType jobType,           // NEW parameter
    bytes32 modelOrProfileId,  // Renamed for clarity
    uint256 pricePerUnit,      // Renamed for clarity
    PricingUnit pricingUnit,   // NEW parameter
    bytes32 formatSpecHash,    // NEW parameter (0x0 for LLM)
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256 jobId)

// Backward compatibility wrapper (optional)
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
        bytes32(0),
        maxDuration,
        proofInterval
    );
}
```

### Events

```solidity
// Extend existing event
event SessionJobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed host,
    JobType jobType,           // NEW field
    bytes32 modelOrProfileId,
    uint256 pricePerUnit,
    PricingUnit pricingUnit    // NEW field
);

// New transcode-specific event
event TranscodeJobCreated(
    uint256 indexed jobId,
    address indexed client,
    address indexed host,
    bytes32 profileId,
    bytes32 formatSpecHash,
    string inputCID,          // S5 CID of input video
    PricingUnit pricingUnit
);
```

### Gas Impact Analysis

| Operation | Current Gas | New Gas | Increase |
|-----------|-------------|---------|----------|
| Create LLM Job | ~120,000 | ~160,000 | +33% (one-time) |
| Create Transcode Job | N/A | ~160,000 | New |
| Submit Proof | ~80,000 | ~80,000 | No change |
| Complete Job | ~100,000 | ~100,000 | No change |

**Mitigation**: Gas increase only affects job creation (once per session), not per-proof submissions.

---

## Phase 1.2: Transcoding-Specific Pricing in NodeRegistry

### Current State

```solidity
// NodeRegistryWithModels.sol - Current Implementation
struct HostInfo {
    uint256 stake;
    bool active;
    bytes32[] approvedModels;
    uint256 nativePricePerToken;   // ETH/BNB per token
    uint256 stablePricePerToken;   // USDC per token
    // ... other fields
}
```

### Proposed Changes

```solidity
// NodeRegistryWithModels.sol - Extended Version

// Pricing for different job types
struct TranscodePricing {
    bool enabled;                   // Host offers transcoding
    PricingUnit pricingUnit;        // PER_SECOND or PER_MEGABYTE

    // Base pricing (in USDC, 6 decimals)
    uint256 basePricePerUnit;       // Base rate

    // Resolution multipliers (10000 = 1.0x)
    uint256 multiplier720p;         // e.g., 10000 (1.0x)
    uint256 multiplier1080p;        // e.g., 15000 (1.5x)
    uint256 multiplier4k;           // e.g., 30000 (3.0x)

    // Codec multipliers (10000 = 1.0x)
    uint256 multiplierH264;         // e.g., 10000 (1.0x)
    uint256 multiplierAV1;          // e.g., 25000 (2.5x - slower encoding)

    // Quality tier multipliers (10000 = 1.0x)
    uint256 multiplierStandard;     // e.g., 10000 (PSNR 38-42 dB)
    uint256 multiplierHigh;         // e.g., 15000 (PSNR 42-46 dB)
    uint256 multiplierLossless;     // e.g., 25000 (PSNR > 50 dB)
}

struct HostInfo {
    // Existing LLM fields
    uint256 stake;
    bool active;
    bytes32[] approvedModels;
    uint256 nativePricePerToken;
    uint256 stablePricePerToken;

    // New transcode fields
    TranscodePricing transcodePricing;  // NEW
    bytes32[] supportedFormats;         // NEW: h264, av1, etc. (hashed)
    uint256 maxVideoResolution;         // NEW: 0=720p, 1=1080p, 2=4k
    bool hardwareAcceleration;          // NEW: NVENC/VAAPI support
}
```

### Pricing Calculation Example

```solidity
// Calculate transcode price for a job
function calculateTranscodePrice(
    address host,
    uint256 durationSeconds,
    Resolution resolution,      // enum: R720p, R1080p, R4k
    Codec codec,                // enum: H264, AV1
    QualityTier quality         // enum: Standard, High, Lossless
) public view returns (uint256 totalPrice) {
    TranscodePricing memory pricing = hosts[host].transcodePricing;

    // Start with base price
    uint256 basePrice = pricing.basePricePerUnit * durationSeconds;

    // Apply resolution multiplier
    uint256 resMultiplier = resolution == R720p ? pricing.multiplier720p :
                           resolution == R1080p ? pricing.multiplier1080p :
                           pricing.multiplier4k;

    // Apply codec multiplier
    uint256 codecMultiplier = codec == H264 ? pricing.multiplierH264 :
                              pricing.multiplierAV1;

    // Apply quality multiplier
    uint256 qualityMultiplier = quality == Standard ? pricing.multiplierStandard :
                                quality == High ? pricing.multiplierHigh :
                                pricing.multiplierLossless;

    // Calculate total: base * res * codec * quality / (10000^2)
    totalPrice = (basePrice * resMultiplier * codecMultiplier * qualityMultiplier) / (10000 * 10000);
}
```

### Example Pricing

**Host Configuration:**
- Base price: 0.01 USDC per second
- 720p: 1.0x, 1080p: 1.5x, 4K: 3.0x
- H264: 1.0x, AV1: 2.5x
- Standard quality: 1.0x

**Job: 10-minute 1080p H264 video (standard quality)**
- Duration: 600 seconds
- Base: 600 × $0.01 = $6.00
- Resolution: $6.00 × 1.5 = $9.00
- Codec: $9.00 × 1.0 = $9.00
- Quality: $9.00 × 1.0 = **$9.00 total**

**Job: 10-minute 4K AV1 video (high quality)**
- Duration: 600 seconds
- Base: 600 × $0.01 = $6.00
- Resolution: $6.00 × 3.0 = $18.00
- Codec: $18.00 × 2.5 = $45.00
- Quality: $45.00 × 1.5 = **$67.50 total**

### Registration Functions

```solidity
// Register as transcode provider
function registerTranscodeHost(
    TranscodePricing calldata pricing,
    bytes32[] calldata supportedFormats,
    uint256 maxVideoResolution,
    bool hardwareAcceleration
) external {
    require(hosts[msg.sender].stake >= MIN_STAKE, "Insufficient stake");
    require(pricing.basePricePerUnit >= MIN_PRICE_PER_UNIT, "Price too low");
    require(pricing.basePricePerUnit <= MAX_PRICE_PER_UNIT, "Price too high");

    hosts[msg.sender].transcodePricing = pricing;
    hosts[msg.sender].supportedFormats = supportedFormats;
    hosts[msg.sender].maxVideoResolution = maxVideoResolution;
    hosts[msg.sender].hardwareAcceleration = hardwareAcceleration;

    emit TranscodeHostRegistered(msg.sender, pricing.basePricePerUnit);
}

// Update transcode pricing
function updateTranscodePricing(
    TranscodePricing calldata newPricing
) external {
    require(hosts[msg.sender].active, "Host not active");
    hosts[msg.sender].transcodePricing = newPricing;

    emit TranscodePricingUpdated(msg.sender);
}
```

---

## Phase 1.3: Format Specification Storage

### Design Decision: Off-Chain Storage

**Rationale**: Video format specifications are complex and variable. Storing them on-chain would be expensive and inflexible.

**Solution**: Store format specs on S5, reference by hash on-chain.

### Format Specification Schema (Off-Chain)

```typescript
// Stored on S5 as JSON, referenced by Blake3 hash
interface TranscodeFormatSpec {
  version: "1.0.0";

  // Input file
  input: {
    cid: string;              // S5 CID of input video
    encryptionKey?: string;   // Blake3 key if encrypted
  };

  // Output requirements
  output: {
    video: {
      codec: "h264" | "av1";
      profile?: string;       // e.g., "main", "high" for h264
      level?: string;         // e.g., "4.0", "5.1"
      resolution: {
        width: number;        // e.g., 1920
        height: number;       // e.g., 1080
      };
      frameRate: number;      // e.g., 30, 60
      bitrate: {
        target: number;       // Target bitrate in kbps
        min?: number;         // Minimum bitrate
        max?: number;         // Maximum bitrate
      };
      pixelFormat?: string;   // e.g., "yuv420p"
    };

    audio: {
      codec: "aac" | "opus" | "flac" | "mp3";
      sampleRate: number;     // e.g., 48000, 44100
      channels: number;       // e.g., 2 (stereo), 6 (5.1)
      bitrate?: number;       // Audio bitrate in kbps
    };

    container: "mp4" | "webm" | "mkv";
  };

  // Quality requirements
  quality: {
    tier: "standard" | "high" | "lossless";
    minPSNR?: number;         // Minimum PSNR in dB
    minSSIM?: number;         // Minimum SSIM (0.0-1.0)
  };

  // GOP (Group of Pictures) settings
  gop: {
    size: number;             // GOP size in frames (e.g., 60)
    structure: string;        // e.g., "IBBPBBP"
  };

  // Proof requirements
  proof: {
    strategy: "per_gop" | "per_segment" | "full_video";
    interval?: number;        // If per_segment, how many GOPs per segment
    requireQualityMetrics: boolean;
    spotCheckCount?: number;  // How many random GOPs to verify
  };
}
```

### On-Chain Format Specification Hash

```solidity
// JobMarketplaceWithModels.sol

// Minimal on-chain reference
struct FormatSpecReference {
    bytes32 specHash;           // Blake3 hash of format spec JSON
    string specCID;             // S5 CID where spec is stored
    uint256 timestamp;          // When spec was registered
}

mapping(bytes32 => FormatSpecReference) public formatSpecs;

// Register a format specification
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

// Verify format spec exists
function isFormatSpecValid(bytes32 specHash) public view returns (bool) {
    return formatSpecs[specHash].timestamp > 0;
}
```

### Example Usage Flow

1. **Client creates format spec** (off-chain):
   ```typescript
   const formatSpec: TranscodeFormatSpec = {
     version: "1.0.0",
     input: { cid: "bafyb..." },
     output: {
       video: { codec: "h264", resolution: { width: 1920, height: 1080 }, ... },
       audio: { codec: "aac", sampleRate: 48000, channels: 2 },
       container: "mp4"
     },
     quality: { tier: "high", minPSNR: 42 },
     gop: { size: 60, structure: "IBBPBBP" },
     proof: { strategy: "per_gop", requireQualityMetrics: true }
   };
   ```

2. **Upload to S5**:
   ```typescript
   const specJSON = JSON.stringify(formatSpec);
   const specCID = await s5.uploadBlob(Buffer.from(specJSON));
   const specHash = blake3(specJSON);
   ```

3. **Register on-chain**:
   ```typescript
   await jobMarketplace.registerFormatSpec(specHash, specCID);
   ```

4. **Create transcode job**:
   ```typescript
   await jobMarketplace.createSessionJob(
     hostAddress,
     JobType.VIDEO_TRANSCODE,
     profileId,
     pricePerSecond,
     PricingUnit.PER_SECOND,
     specHash,  // Reference to format spec
     maxDuration,
     proofInterval
   );
   ```

5. **Host retrieves format spec**:
   ```rust
   // In fabstir-transcode-node
   let spec_cid = job_marketplace.get_format_spec_cid(spec_hash)?;
   let spec_json = s5_client.download(spec_cid).await?;
   let format_spec: TranscodeFormatSpec = serde_json::from_str(&spec_json)?;
   ```

---

## Phase 1.4: Proof System Extensions

### Current Proof System (LLM)

```solidity
// ProofSystem.sol - Current Implementation
interface IProofSystem {
    function submitProof(
        uint256 jobId,
        bytes32 proofHash,
        string calldata proofCID,
        uint256 tokenCount
    ) external;

    function verifyProof(
        uint256 jobId,
        bytes32 proofHash
    ) external view returns (bool);
}
```

### Extended Proof System (Multi-Type)

```solidity
// ProofSystem.sol - Extended Version

// Proof metadata for different job types
struct ProofMetadata {
    JobType jobType;
    bytes32 proofHash;          // Blake3 hash of proof
    string proofCID;            // S5 CID of proof data
    uint256 workUnits;          // Tokens, seconds, MB, etc.
    bytes32 qualityMetricsHash; // Hash of quality metrics (for transcode)
    uint256 timestamp;
}

// GOP-based proof for transcoding
struct TranscodeProof {
    uint256 gopIndex;           // Which GOP (0, 1, 2, ...)
    bytes32 inputGOPHash;       // Hash of input GOP
    bytes32 outputGOPHash;      // Hash of output GOP
    uint256 psnrMillidB;        // PSNR in milli-dB (e.g., 42000 = 42.0 dB)
    uint256 ssimMicroUnits;     // SSIM in micro-units (e.g., 950000 = 0.95)
    uint256 actualBitrate;      // Actual bitrate achieved
    bytes32 starkProofHash;     // Hash of STARK proof for this GOP
}

// Merkle tree of GOP proofs
struct TranscodeProofTree {
    bytes32 rootHash;           // Merkle root of all GOP proofs
    uint256 gopCount;           // Total number of GOPs
    bytes32[] spotCheckHashes;  // Hashes of randomly selected GOPs for verification
    string treeCID;             // S5 CID of full Merkle tree
}

// Submit transcode proof (Merkle root only)
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

    proofs[jobId] = ProofMetadata({
        jobType: JobType.VIDEO_TRANSCODE,
        proofHash: merkleRoot,
        proofCID: treeCID,
        workUnits: durationSeconds,
        qualityMetricsHash: qualityMetricsHash,
        timestamp: block.timestamp
    });

    transcodeProofTrees[jobId] = TranscodeProofTree({
        rootHash: merkleRoot,
        gopCount: gopCount,
        spotCheckHashes: spotCheckHashes,
        treeCID: treeCID
    });

    emit TranscodeProofSubmitted(jobId, merkleRoot, gopCount);
}

// Verify transcode proof (spot-check random GOPs)
function verifyTranscodeProof(
    uint256 jobId,
    uint256[] calldata gopIndicesToCheck,
    TranscodeProof[] calldata gopProofs,
    bytes32[][] calldata merkleProofs
) external view returns (bool) {
    TranscodeProofTree memory tree = transcodeProofTrees[jobId];

    // Verify each requested GOP against Merkle root
    for (uint256 i = 0; i < gopIndicesToCheck.length; i++) {
        bytes32 gopHash = keccak256(abi.encode(gopProofs[i]));
        bool valid = verifyMerkleProof(
            gopHash,
            gopIndicesToCheck[i],
            merkleProofs[i],
            tree.rootHash
        );
        if (!valid) return false;

        // Verify quality metrics
        if (gopProofs[i].psnrMillidB < MIN_PSNR_MILLIDB) return false;
    }

    return true;
}

// Helper: Verify Merkle proof
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

### Gas Cost Analysis

| Operation | Gas Cost | Notes |
|-----------|----------|-------|
| Submit GOP Merkle root | ~150,000 | One-time per transcode job |
| Verify single GOP | ~50,000 | Client can spot-check off-chain first |
| Verify 5 GOPs | ~200,000 | Typical dispute resolution |
| Full video verification | Off-chain | Download all GOPs from S5, verify locally |

**Key Insight**: Only Merkle root goes on-chain. Full verification happens off-chain using S5-stored proofs.

---

## Deployment Strategy

### Phase 1: Contract Upgrades

1. **Deploy Extended Contracts** (Separate Branch)
   ```bash
   git checkout -b feature/transcode-contracts
   # Make changes to contracts
   # Test extensively
   # Deploy to testnet
   ```

2. **Update Contract Addresses** (`.env.test`)
   ```bash
   CONTRACT_JOB_MARKETPLACE_TRANSCODE=0x...
   CONTRACT_NODE_REGISTRY_TRANSCODE=0x...
   CONTRACT_PROOF_SYSTEM_TRANSCODE=0x...
   ```

3. **Generate New ABIs**
   ```bash
   cd fabstir-compute-contracts
   forge build
   cp out/JobMarketplaceWithTranscode.sol/JobMarketplaceWithTranscode.json \
      ../fabstir-llm-sdk/packages/sdk-core/src/contracts/abis/
   ```

### Phase 2: Testing Plan

1. **Unit Tests** (Hardhat)
   - Test JobType enum
   - Test pricing calculations
   - Test format spec registration
   - Test GOP proof verification

2. **Integration Tests** (Testnet)
   - Create transcode job
   - Submit GOP proofs
   - Verify random GOPs
   - Complete job and distribute payment

3. **Gas Optimization**
   - Profile gas usage
   - Optimize proof submission
   - Batch operations where possible

---

## Security Considerations

### 1. Proof Verification

**Risk**: Host submits fake GOP proofs
**Mitigation**:
- Require stake for transcode hosts
- Random GOP spot-checking
- Slash stake if invalid proof detected

### 2. Pricing Manipulation

**Risk**: Host changes pricing mid-job
**Mitigation**:
- Lock pricing at job creation
- Store price in SessionJob struct
- Emit event for price locks

### 3. Format Spec Tampering

**Risk**: Host uses different format than specified
**Mitigation**:
- Hash format spec and store on-chain
- Verify output against spec in proof
- Include format compliance in GOP proof

### 4. Quality Metric Fraud

**Risk**: Host claims high PSNR but delivers low quality
**Mitigation**:
- PSNR calculation inside zkVM (provable)
- Client can verify PSNR off-chain
- Reputation system for hosts

---

## Backward Compatibility

### Ensuring LLM Jobs Still Work

1. **Default Values**: If JobType not specified, assume LLM_INFERENCE
2. **Legacy Functions**: Keep old createSessionJob signature as wrapper
3. **Event Compatibility**: Extend events, don't replace
4. **ABI Compatibility**: Add new functions, don't modify existing

### Migration Path

**For Existing Hosts:**
```solidity
// Optional: Register for transcoding after LLM registration
function addTranscodeCapability(
    TranscodePricing calldata pricing,
    bytes32[] calldata supportedFormats
) external {
    require(hosts[msg.sender].active, "Must be registered LLM host first");
    hosts[msg.sender].transcodePricing = pricing;
    hosts[msg.sender].supportedFormats = supportedFormats;
}
```

**For Existing Clients:**
- Can continue using old SDK functions
- New transcode functions are additive
- No breaking changes to existing API

---

## Next Steps

After this specification is approved:

1. ✅ Create contract implementation branch
2. ✅ Implement JobType enum and struct changes
3. ✅ Add transcode pricing to NodeRegistry
4. ✅ Implement format spec storage
5. ✅ Extend ProofSystem for GOP proofs
6. ✅ Write comprehensive tests
7. ✅ Deploy to Base Sepolia testnet
8. ✅ Update SDK to support new contract features

---

## Appendix A: Example Transcode Job Flow

```typescript
// 1. Client creates format specification
const formatSpec = {
  input: { cid: "bafyb..." },
  output: {
    video: { codec: "h264", resolution: { width: 1920, height: 1080 }, ... },
    audio: { codec: "aac", ... }
  },
  quality: { tier: "high", minPSNR: 42 },
  gop: { size: 60, structure: "IBBPBBP" },
  proof: { strategy: "per_gop", requireQualityMetrics: true }
};

// 2. Upload spec to S5 and register on-chain
const specCID = await s5.upload(JSON.stringify(formatSpec));
const specHash = blake3(formatSpec);
await jobMarketplace.registerFormatSpec(specHash, specCID);

// 3. Find suitable host
const hosts = await nodeRegistry.getTranscodeHosts();
const selectedHost = hosts.find(h =>
  h.supports("h264") &&
  h.maxResolution >= "1080p" &&
  h.pricing.basePricePerUnit <= maxBudget
);

// 4. Calculate price
const videoDuration = 600; // 10 minutes
const price = await nodeRegistry.calculateTranscodePrice(
  selectedHost.address,
  videoDuration,
  Resolution.R1080p,
  Codec.H264,
  QualityTier.High
);

// 5. Create transcode job
const tx = await jobMarketplace.createSessionJob(
  selectedHost.address,
  JobType.VIDEO_TRANSCODE,
  bytes32(0), // No model ID for transcode
  price / videoDuration, // Price per second
  PricingUnit.PER_SECOND,
  specHash,
  3600, // Max 1 hour
  60 // Proof every 60 GOPs
);

const { jobId } = await tx.wait();

// 6. Host transcodes video and generates GOP proofs
// (Happens in fabstir-transcode-node - see Phase 3 spec)

// 7. Host submits Merkle root of GOP proofs
await proofSystem.submitTranscodeProof(
  jobId,
  merkleRoot,
  gopCount,
  spotCheckHashes,
  treeCID,
  qualityMetricsHash,
  videoDuration
);

// 8. Client spot-checks random GOPs (off-chain)
const randomGOPs = [5, 17, 42, 89, 150]; // Random selection
const gopProofs = await s5.download(treeCID);
const valid = randomGOPs.every(i => verifyGOPProof(gopProofs[i]));

// 9. Complete job and release payment
await jobMarketplace.completeSessionJob(jobId);

// 10. Download transcoded video from S5
const outputCID = await s5.getTranscodeOutput(jobId);
const transcodedVideo = await s5.download(outputCID);
```

---

## Appendix B: Gas Cost Comparison

| Operation | LLM Job | Transcode Job | Delta |
|-----------|---------|---------------|-------|
| Job Creation | 120k | 160k | +40k (+33%) |
| Proof Submission (per checkpoint) | 80k | 150k | +70k (+88%) |
| Spot Verification (1 GOP) | N/A | 50k | New |
| Job Completion | 100k | 100k | 0 |
| **Total (10-min job, 5 checkpoints)** | 620k | 910k | +290k (+47%) |

**Per-dollar efficiency**:
- LLM: ~1,500 tokens per $10 deposit = $0.0067 per token
- Transcode: ~10 minutes per $10 deposit = $1.00 per minute

**Conclusion**: Gas overhead is acceptable given the higher revenue per job for transcoding.

---

**End of Specification**
