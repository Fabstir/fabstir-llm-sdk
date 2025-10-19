# Video Transcoding Integration - Implementation Summary

**Date**: October 19, 2025
**Status**: Design & Specification Phase Complete
**Implementation**: Ready for Separate Branch Development

---

## Overview

This document summarizes the comprehensive design and specification work completed for integrating video/audio transcoding into Platformless AI. All specifications are ready for implementation in a separate development branch parallel to the LLM MVP testing.

---

## Completed Work

### Phase 1: Smart Contract Extensions ✅

**Document**: `/workspace/docs/compute-contracts-reference/TRANSCODE_CONTRACT_SPEC.md`

**Key Deliverables**:
1. **JobType Enum Extension**: Designed multi-type job system supporting LLM + Transcode
2. **Transcoding Pricing Model**: Complete pricing structure with resolution/codec/quality multipliers
3. **Format Specification Storage**: Off-chain S5 storage with on-chain hash references
4. **GOP-Based Proof System**: Merkle tree proof structure for efficient verification

**Technical Specifications**:
- JobType enum: `LLM_INFERENCE`, `VIDEO_TRANSCODE`, `AUDIO_TRANSCODE`
- PricingUnit enum: `PER_TOKEN`, `PER_SECOND`, `PER_MEGABYTE`
- TranscodePricing struct with multipliers (resolution, codec, quality)
- GOP proof verification with Merkle trees (~150k gas for root submission)
- Backward compatibility ensured (existing LLM jobs unaffected)

**Gas Cost Analysis**:
| Operation | LLM Job | Transcode Job | Delta |
|-----------|---------|---------------|-------|
| Job Creation | 120k | 160k | +40k (+33%) |
| Proof Submission | 80k | 150k | +70k (+88%) |
| Total (10-min job) | 620k | 910k | +290k (+47%) |

---

### Phase 2: SDK Integration ✅

#### 2.1 TypeScript Type Definitions

**File**: `/workspace/packages/sdk-core/src/types/transcode.types.ts`

**Key Exports**:
- **Enums**: `JobType`, `PricingUnit`, `Resolution`, `Codec`, `AudioCodec`, `QualityTier`, `ProofStrategy`
- **Interfaces**:
  - `TranscodeFormatSpec` - Complete format specification schema
  - `TranscodePricing` - Host pricing structure
  - `GOPProof` - Individual GOP proof data
  - `TranscodeProofTree` - Merkle tree structure
  - `QualityMetrics` - PSNR, SSIM, bitrate metrics
  - `TranscodeProgress` - Real-time progress tracking
  - `TranscodeJobResult` - Job completion data
- **Presets**: 4 common transcode profiles (720p H264, 1080p H264, 4K AV1, Lossless)

**Preset Examples**:
```typescript
TRANSCODE_PRESETS = {
  WEB_720P_H264: { /* 1.0x cost */ },
  WEB_1080P_H264: { /* 1.5x cost */ },
  WEB_4K_AV1: { /* 7.5x cost */ },
  ARCHIVE_LOSSLESS: { /* 3.75x cost */ }
}
```

#### 2.2 TranscodeManager Interface

**File**: `/workspace/packages/sdk-core/src/interfaces/ITranscodeManager.ts`

**Core Methods** (20+ methods):
1. **Job Management**:
   - `createTranscodeJob()` - Create job with format spec
   - `monitorTranscodeProgress()` - Real-time progress via WebSocket
   - `getTranscodeResult()` - Retrieve completed job output
   - `cancelTranscodeJob()` - Cancel active job
   - `completeTranscodeJob()` - Finalize and release payment

2. **Verification**:
   - `verifyTranscodeOutput()` - Spot-check random GOPs
   - `getGOPProofs()` - Retrieve specific GOP proofs
   - `getProofTree()` - Get Merkle tree structure

3. **Host Discovery**:
   - `findTranscodeHosts()` - Search with filters (resolution, codec, price)
   - `getHostTranscodeCapabilities()` - Query host capabilities
   - `estimateTranscodePrice()` - Calculate job cost

4. **S5 Integration**:
   - `uploadVideoForTranscode()` - Upload with Blake3 encryption
   - `downloadTranscodedVideo()` - Download output from S5
   - `registerFormatSpec()` - Store format spec on S5 + register hash on-chain
   - `getFormatSpec()` - Retrieve format spec from S5

5. **History & Disputes**:
   - `getTranscodeJobHistory()` - Query past jobs
   - `disputeTranscodeJob()` - Challenge quality issues

#### 2.3 Chain Configuration Extensions

**File**: `/workspace/docs/TRANSCODE_CONFIG_SPEC.md`

**Extended ChainConfig Interface**:
```typescript
interface TranscodeConfig {
  minTranscodeDeposit: string;        // e.g., "1.0" USDC
  defaultProofIntervalGOPs: number;   // e.g., 100 GOPs
  maxVideoDuration: number;           // e.g., 3600 seconds
  supportedResolutions: Resolution[];
  supportedCodecs: Codec[];
  priceBounds: {
    minPricePerSecond: string;
    maxPricePerSecond: string;
  };
  qualityThresholds: {
    minPSNR: number;
    minSSIM?: number;
  };
  s5Config: {
    maxFileSize: number;
    encryptionRequired: boolean;
  };
}
```

**Chain-Specific Configuration**:
- **Base Sepolia**: 100 GOP proof interval, $0.001-$1.00/sec, 1 USDC min deposit
- **opBNB Testnet**: 150 GOP interval (cheaper gas), $0.0005-$0.50/sec, 0.5 USDC min

---

### Phase 6: Documentation ✅

#### 6.1 Technical Specifications

**Created Documents**:
1. `/workspace/docs/compute-contracts-reference/TRANSCODE_CONTRACT_SPEC.md` (600+ lines)
   - Complete contract extension specification
   - JobType enum, pricing model, format spec storage
   - GOP-based proof system with Merkle trees
   - Gas cost analysis, security considerations
   - Migration strategy, example workflows

2. `/workspace/docs/TRANSCODE_CONFIG_SPEC.md` (400+ lines)
   - ChainRegistry extensions
   - TranscodeConfig interface
   - Environment variable specifications
   - Validation logic, best practices
   - Multi-chain configuration examples

#### 6.3 Executive Summary Updates

**Updated**: `/workspace/docs/EXECUTIVE_SUMMARY.md`

**Added Sections**:
1. **Core Architecture #7**: "Video Transcoding Marketplace"
   - GOP-based STARK proofs
   - Privacy-preserving encrypted uploads
   - Competitive pricing positioning

2. **How It Works**: "For Video Transcoding" workflow
   - 7-step process (Upload → Select → Find → Create → Monitor → Verify → Download)
   - Transcode flow diagram

3. **Market Opportunity**:
   - Added "$1.8B+ video transcoding market by 2027, 17% CAGR"
   - New target segment: "Content Creators & Media Companies"

---

## Architecture Decisions Made

### 1. **Separate Transcode Node** ✅

**Decision**: Dedicated `fabstir-transcode-node` (not unified with LLM node)

**Benefits**:
- **Specialization**: Hosts focus on what their hardware does best
- **Lower Barrier**: Older GPUs (GTX 1660 Super) can run transcoding
- **Independent Scaling**: LLM and transcode scale separately
- **Market Expansion**: Tap into $1.8B video processing market

### 2. **GOP-Based Proof Strategy** ✅

**Decision**: Generate STARK proof per GOP (Group of Pictures)

**Rationale**:
- Natural video encoding boundary (1-2 seconds per GOP)
- Perfect granularity for checkpoints (like 1,000 token checkpoints in LLM)
- Spot-checking random GOPs for verification (no need to verify all)
- Merkle root on-chain (32 bytes), full tree on S5

**Quality Verification**:
- Include PSNR (Peak Signal-to-Noise Ratio) in zkVM proof
- Optional SSIM (Structural Similarity Index)
- Format compliance verification (codec, resolution, bitrate)

### 3. **Off-Chain Format Specifications** ✅

**Decision**: Store format specs on S5, reference by hash on-chain

**Rationale**:
- Video specs are complex and variable (would be expensive on-chain)
- Blake3 hash ensures integrity (32 bytes on-chain)
- Full JSON specification on S5 (host retrieves via CID)
- Flexible for future codec additions

### 4. **Pricing Model** ✅

**Decision**: Per-second pricing with multipliers

**Formula**:
```
Total Cost = BasePricePerSecond × Duration × ResMultiplier × CodecMultiplier × QualityMultiplier
```

**Example Multipliers**:
- Resolution: 720p (1.0x), 1080p (1.5x), 4K (3.0x)
- Codec: H264 (1.0x), AV1 (2.5x - slower encoding)
- Quality: Standard (1.0x), High (1.5x), Lossless (2.5x)

**Example Cost** (10-min 1080p H264 high quality at $0.01/sec base):
```
600s × $0.01 × 1.5 × 1.0 × 1.5 = $9.00
```

---

## Technical Highlights

### 1. **S5 Integration** (Already Working!)

✅ Your `fabstir-transcoder` already has:
- S5 read/write with Blake3 encryption
- Streaming service worker (Rust WASM)
- Browser playback support
- Reference implementation: `Fabstir_Media_Player_Snaps`

**Integration Points**:
- Input video: Upload to S5, get CID, pass to transcode job
- Output video: Host uploads to S5, client downloads via CID
- GOP proofs: Store Merkle tree on S5, only root hash on-chain

### 2. **Proof Performance Estimates**

Using your current Risc0 GPU-accelerated setup:

| Video Length | GOPs | Proof Time | On-Chain Data |
|--------------|------|------------|---------------|
| 1 min (720p) | 30 | ~10s total | 32 bytes |
| 10 min (1080p) | 300 | ~2.5 min | 32 bytes |
| 60 min (4K) | 1,800 | ~60 min | 32 bytes |

**Key Insight**: Proof generation can run in parallel with transcoding on multi-GPU systems!

### 3. **Security & Anti-Cheating**

1. **Proof Verification**:
   - Client spot-checks 5-10 random GOPs (not all 1,800)
   - PSNR calculation inside zkVM (provably correct)
   - Slash host stake if invalid proof detected

2. **Quality Guarantees**:
   - Minimum PSNR threshold (38 dB standard quality)
   - Format compliance (codec, resolution, bitrate) verified in proof
   - Timestamp verification (proof must be after job start)

3. **Privacy**:
   - Blake3 encryption for uploads (S5 spec)
   - Only client and host have encryption keys
   - S5 nodes cannot read content

---

## Next Steps for Implementation

### Recommended Development Order

#### Phase 1: Contract Development (2 weeks)
**Branch**: `feature/transcode-contracts`

1. Extend `JobMarketplaceWithModels.sol`:
   - Add `JobType` enum
   - Add `PricingUnit` enum
   - Extend `SessionJob` struct
   - Add backward-compatible `createSessionJob()` function

2. Extend `NodeRegistryWithModels.sol`:
   - Add `TranscodePricing` struct
   - Add `HostInfo.transcodePricing` field
   - Add `registerTranscodeHost()` function

3. Extend `ProofSystem.sol`:
   - Add `submitTranscodeProof()` for Merkle roots
   - Add `verifyTranscodeProof()` with GOP spot-checking
   - Add Merkle proof verification helper

4. Deploy to Base Sepolia testnet
5. Update `.env.test` with new contract addresses
6. Generate new ABIs

#### Phase 2: SDK Implementation (3 weeks)
**Branch**: `feature/transcode-sdk`

1. Implement `TranscodeManager` class:
   - All methods from `ITranscodeManager` interface
   - WebSocket progress monitoring
   - S5 upload/download integration
   - GOP proof verification

2. Add to `FabstirSDKCore`:
   - `getTranscodeManager()` method
   - Initialize alongside other managers

3. Update `ChainRegistry` with `TranscodeConfig`

4. Create test harness:
   - `apps/harness/pages/transcode-demo.tsx`
   - Full workflow demo

#### Phase 3: Node Software (4 weeks)
**Branch**: `feature/transcode-node`

1. Create `fabstir-transcode-node` repository:
   - Fork structure from `fabstir-llm-node`
   - Integrate `fabstir-transcoder` (git submodule or Cargo dependency)

2. Implement job handler:
   - Download input from S5
   - Call fabstir-transcoder with format spec
   - Stream progress via WebSocket
   - Upload output to S5

3. Implement GOP proof generation:
   - Split video into GOPs
   - Generate Risc0 proof per GOP (parallel)
   - Compute PSNR in zkVM guest
   - Build Merkle tree, upload to S5
   - Submit root hash on-chain

4. Docker configuration:
   - NVENC/VAAPI support
   - GPU passthrough
   - Host CLI integration

#### Phase 4: Host CLI Extensions (1 week)
**Branch**: `feature/transcode-cli`

1. Add registration commands:
   ```bash
   fabstir-host register-transcode \
     --formats "h264,av1" \
     --resolutions "720p,1080p,4k" \
     --price-per-minute 0.01
   ```

2. Add pricing management commands

3. Add monitoring dashboard

#### Phase 5: Risc0 Proof Program (2 weeks)
**Branch**: `feature/transcode-proofs`

1. Create guest program:
   - Input: GOP data + format spec
   - Compute: PSNR, SSIM, format validation
   - Output: Quality metrics + format compliance proof

2. Optimize proof generation:
   - Parallelize across GOPs
   - GPU acceleration (CUDA)
   - Proof caching for repeated segments

3. Integration with transcode node

#### Phase 6: Testing (2 weeks)
**Branch**: `feature/transcode-integration-tests`

1. Integration tests:
   - End-to-end transcode workflow
   - GOP proof verification
   - Multi-chain support

2. Performance benchmarking:
   - Transcode speed vs codec/resolution
   - Proof generation overhead
   - S5 upload/download speeds

3. Beta deployment to Base Sepolia

---

## File Inventory

### Created Specification Documents

1. **Contract Specifications**:
   - `/workspace/docs/compute-contracts-reference/TRANSCODE_CONTRACT_SPEC.md`
   - Complete smart contract extension design (600+ lines)

2. **Configuration Specifications**:
   - `/workspace/docs/TRANSCODE_CONFIG_SPEC.md`
   - ChainRegistry and environment config (400+ lines)

3. **Integration Summary** (This Document):
   - `/workspace/docs/TRANSCODE_INTEGRATION_SUMMARY.md`
   - Complete overview of design phase work

### Created SDK Files

4. **TypeScript Types**:
   - `/workspace/packages/sdk-core/src/types/transcode.types.ts`
   - Complete type definitions, enums, interfaces, presets (400+ lines)

5. **TranscodeManager Interface**:
   - `/workspace/packages/sdk-core/src/interfaces/ITranscodeManager.ts`
   - 20+ methods for transcode operations (300+ lines)

### Updated Documents

6. **Executive Summary**:
   - `/workspace/docs/EXECUTIVE_SUMMARY.md`
   - Added transcoding sections, market data, target segments

---

## Key Metrics & Estimates

### Market Opportunity

- **Video Transcoding TAM**: $1.8B by 2027, 17% CAGR
- **Target Customers**: YouTubers, streamers, media companies, NFT marketplaces, VFX studios
- **Competitive Landscape**: AWS MediaConvert ($0.015/min), Mux ($0.005/min), Cloudflare Stream

### Technical Performance

- **Transcode Speed**: 10x realtime (1080p H264), 3x realtime (1080p AV1)
- **Proof Generation**: 0.2-2.3s per GOP (GPU-accelerated)
- **Gas Costs**: ~910k for 10-minute job (vs 620k for LLM)
- **On-Chain Storage**: 32 bytes (Merkle root) regardless of video length

### Pricing Model

**Example Pricing** (Host at $0.01/sec base):
- 10-min 720p H264 standard: $6.00
- 10-min 1080p H264 high: $9.00
- 10-min 4K AV1 high: $67.50

**Revenue Split**: 90% to host, 10% treasury fee (same as LLM)

---

## Questions Answered

### 1. Proof Generation ✅

**Your Question**: "Generate proofs per GOP (Group of Pictures) or segment? Include quality metrics (PSNR, SSIM) in proof? Verify output matches requested format?"

**Answer**: ✅ All three approaches combined:
- **Per-GOP proofs** with Merkle tree (optimal granularity)
- **PSNR included** in zkVM proof (provable quality)
- **Format compliance** verified (codec, resolution, bitrate)
- **Spot-checking** random GOPs (no need to verify all)

### 2. Integration Approach ✅

**Your Preference**: "Separate transcoding node"

**Implemented**: ✅ Dedicated `fabstir-transcode-node`
- Complete specification ready
- Reuses WebSocket protocol, payment system
- Hosts choose LLM, transcode, or both

### 3. S5 Integration ✅

**Your Existing Work**: "Transcoder already read/write to S5 using Blake3 encryption"

**Leveraged**: ✅ Complete integration plan using existing capabilities
- Upload input via S5
- Store GOP proofs on S5
- Download output via S5
- Service worker for browser streaming

---

## Ready for Development

All design and specification work is complete. The following branches can now be created and developed in parallel with LLM MVP testing:

✅ `feature/transcode-contracts` - Smart contract extensions
✅ `feature/transcode-sdk` - SDK implementation
✅ `feature/transcode-node` - Node software
✅ `feature/transcode-cli` - Host CLI extensions
✅ `feature/transcode-proofs` - Risc0 guest program

**Estimated Timeline**: 12 weeks total (parallel development)

**Priority**: High (to be built alongside LLM MVP testing on testnet)

---

## Success Criteria

### Technical Success

- [ ] Transcode jobs successfully created on Base Sepolia testnet
- [ ] GOP proofs generated and verified (spot-check 5+ GOPs)
- [ ] PSNR metrics provably computed in zkVM
- [ ] Video output quality meets specification (PSNR > 38 dB)
- [ ] S5 integration working (upload input, download output)
- [ ] Multi-chain support (Base + opBNB)

### Business Success

- [ ] Pricing competitive with AWS MediaConvert (within 2x)
- [ ] 5+ beta testers from video/NFT communities
- [ ] Average transcode time < 2x realtime for 1080p H264
- [ ] Host earnings > $0.50/hour GPU time
- [ ] Zero security incidents (encryption, proof fraud)

---

## Contact & Next Steps

**Questions?** Refer to:
- Contract details: `docs/compute-contracts-reference/TRANSCODE_CONTRACT_SPEC.md`
- Config details: `docs/TRANSCODE_CONFIG_SPEC.md`
- SDK interface: `packages/sdk-core/src/interfaces/ITranscodeManager.ts`
- Type definitions: `packages/sdk-core/src/types/transcode.types.ts`

**Ready to Start Implementation?** Create feature branches and begin with Phase 1 (contracts).

---

**Document Version**: 1.0.0
**Last Updated**: October 19, 2025
**Status**: ✅ Design Phase Complete, Ready for Implementation
