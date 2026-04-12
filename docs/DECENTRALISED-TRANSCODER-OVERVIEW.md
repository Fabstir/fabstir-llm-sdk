# Fabstir Decentralised Video Transcoder

## What It Is

A decentralised, GPU-accelerated video transcoding service that runs on independent host nodes across a peer-to-peer network. No central servers. No single point of control. Source videos and outputs are stored on S5 — a content-addressed, decentralised storage network — with optional end-to-end encryption. Payments are handled via Ethereum smart contracts with cryptographic proof of work.

The transcoder is one capability within the Fabstir P2P marketplace, alongside LLM inference and image generation. All three share the same session management, encryption, billing, and proof infrastructure.

---

## Sovereignty and Privacy

### Data Sovereignty

- **No central custody.** Source videos are uploaded directly to S5 by the client. The transcoding host downloads from S5, processes, and uploads results back. At no point does a centralised platform hold or control the content.
- **Content-addressed storage.** Every file on S5 is identified by its cryptographic hash (BLAKE3). Files cannot be altered after upload — the hash is the proof of integrity.
- **Client-controlled access.** When encryption is enabled, only the holder of the CID (which embeds the decryption key) can access the content. There is no master key, no admin backdoor, no platform that can revoke access.

### Encryption

Three layers of encryption protect content in transit and at rest:

**1. Source Video Encryption (at rest on S5)**

Source videos can be encrypted before upload using XChaCha20-Poly1305 (256-bit key, 192-bit nonce). The encryption key is embedded directly in the S5 encrypted CID — a self-contained identifier that includes the encrypted blob hash, the decryption key, padding metadata, and a plaintext reference. Only someone with the full CID can decrypt the content. The S5 portal and network operators see only opaque encrypted bytes.

**2. Transport Encryption (WebSocket E2EE)**

All communication between the SDK and host nodes uses end-to-end encrypted WebSocket channels. The handshake uses ECDH key exchange on secp256k1 (the same curve as Ethereum) to establish a shared session key. Every message — including the transcode request, progress updates, and results — is encrypted with XChaCha20-Poly1305 using the session key. Host operators cannot read the content of transcode requests even though they process them.

**3. Output Encryption (at rest on S5)**

Transcoded outputs can optionally be encrypted before upload to S5. Each output format can independently enable encryption via the `encrypt: true` flag. The output CID returned to the client embeds the decryption key — the client can download and decrypt without any additional key exchange.

### What This Means in Practice

- A video platform can offer transcoding where the platform itself never has access to the unencrypted content
- Content creators retain full control — sharing a CID grants access, revoking it (by not sharing) removes access
- The transcoding host processes encrypted content but the WebSocket channel is the only point where plaintext exists, and it's protected by E2EE
- No API keys, no OAuth tokens, no accounts — identity is an Ethereum keypair

---

## Architecture

```
┌─────────────┐     Encrypted WS      ┌──────────────┐     HTTP      ┌──────────────────┐
│  SDK Client  │◄─────────────────────►│   Host Node   │◄────────────►│ Transcoder Sidecar│
│  (Browser/   │  ECDH + XChaCha20    │  (Rust, P2P)  │  localhost   │  (ffmpeg + NVENC) │
│   Node.js)   │                      │               │              │                   │
└──────┬───────┘                      └──────┬────────┘              └──────────┬────────┘
       │                                      │                                 │
       │  Upload/Download                     │  Upload proofs                  │  Upload output
       ▼                                      ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                              S5 Decentralised Storage                                    │
│                     (Content-addressed, BLAKE3 hashing, P2P replication)                  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                          Ethereum Smart Contracts (Base Sepolia)                          │
│              JobMarketplace · NodeRegistry · ProofSystem · HostEarnings                   │
│                    (Session management, billing, proof verification)                      │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Role | Technology |
|-----------|------|------------|
| **SDK Client** | Uploads source, submits transcode requests, downloads output | TypeScript, browser-compatible |
| **Host Node** | Routes requests, manages sessions, submits proofs | Rust, P2P networking |
| **Transcoder Sidecar** | Executes ffmpeg, computes GOP proofs, uploads to S5 | Docker, NVIDIA NVENC |
| **S5 Storage** | Content-addressed decentralised storage | BLAKE3 hashing, P2P replication |
| **Smart Contracts** | Billing, escrow, proof verification, dispute resolution | Solidity, audited, immutable |

### Key Design Decisions

- **Contract reuse.** Transcoding uses the same smart contracts as LLM inference — `createSessionFromDepositForModel`, `submitProofOfWork`, `completeSessionJob`. The model ID for transcoding is derived from the format specification hash, not a model name. This means no contract upgrades were needed to support transcoding.
- **Sidecar architecture.** The transcoder runs as a separate container alongside the host node. The host forwards requests via HTTP on localhost. This allows independent scaling, GPU isolation, and container-level security boundaries.
- **Browser-first SDK.** All cryptography uses browser-native APIs (`globalThis.crypto`, ethers.js). No Node.js `crypto` module dependency. The SDK works in browsers, Node.js, and React Native.

---

## Capabilities

### Codec Support

| Codec | Encoder | Complexity Factor | Status |
|-------|---------|-------------------|--------|
| H.264 | h264_nvenc | 1.0x (baseline) | Production |
| HEVC/H.265 | hevc_nvenc | 1.2x | Production |
| AV1 | av1_nvenc | 1.5x | SDK and billing ready. Sidecar image needs AV1-capable ffmpeg build (NVENC AV1 requires RTX 4000+ GPU). Contact host operators for availability |

**Input codecs**: H.264, H.265/HEVC, ProRes, VP9, and any codec supported by ffmpeg's decode pipeline. The sidecar handles decoding via software (CPU) or hardware paths — the `vcodec` field controls the *output* encoder only.

Audio: AAC, Opus, FLAC, MP3. Containers: MP4, WebM, MKV.

### Resolution Support

| Resolution | Factor | Example |
|------------|--------|---------|
| 480p and below | 0.25x | SD content, mobile |
| 720p | 0.5x | HD |
| 1080p | 1.0x (baseline) | Full HD |
| 2160p (4K) | 2.0x | Ultra HD |

### Multi-Format Output

A single transcode job can produce multiple outputs simultaneously — for example, 720p + 1080p + 4K from a single source upload. Each output is stored independently on S5 with its own CID.

### HLS Adaptive Bitrate Streaming

HLS mode produces fMP4 segments per resolution instead of whole files. The SDK submits formats with `hls: true` and receives per-segment CIDs in the response. M3U8 playlists are generated client-side from the segment metadata.

Key features:
- **Per-segment encryption**: Preview segments (first N%) uploaded unencrypted (`z`-prefix CID), paid segments encrypted (`u`-prefix CID)
- **One format per resolution**: Unlike Phase 1 (two formats: full + preview), HLS uses one format with `previewPercent` at the request level
- **Client-side playlists**: `buildMasterPlaylist()` and `buildVariantPlaylist()` generate standard HLS M3U8 (version 7, fMP4)
- **Backward compatible**: Formats without `hls: true` continue to produce single-file outputs

### Real-Time Progress

The SDK receives GOP-level progress updates via WebSocket during transcoding:
- Percentage complete (0-100%)
- Current GOP / total GOPs
- Elapsed time in seconds

Progress is streamed, not polled — the host pushes updates as each GOP completes.

---

## Trustless Verification

### The Problem

In a decentralised network, how do you know the host actually transcoded your video correctly? A malicious host could return a blank file, transcode at lower quality, or skip frames — and still claim payment.

### The Solution: GOP-Level Proofs

Every Group of Pictures (GOP) in the transcoded output is independently verified:

1. **Input GOP Hash** — keccak256 of the source GOP data
2. **Output GOP Hash** — keccak256 of the transcoded GOP data
3. **Quality Metrics** — PSNR (dB) and SSIM (0-1) per GOP
4. **STARK Proof Hash** — Cryptographic proof that the transcoding computation was performed correctly

These proofs are assembled into a **Merkle tree** with the root hash submitted on-chain. The full tree is stored on S5. Any party can:

- Recompute the Merkle root from the leaves to verify tree integrity
- Spot-check individual GOPs by downloading and verifying their proofs
- Dispute a job by providing evidence of quality violations (specific GOP indices)

### Quality Tiers

| Tier | PSNR Threshold | SSIM Threshold |
|------|---------------|----------------|
| Standard | >= 38.0 dB | — |
| High | >= 42.0 dB | >= 0.95 |

### Dispute Resolution

If quality verification fails, the client can file an on-chain dispute with evidence (affected GOP indices). The smart contract handles arbitration and refund logic. This creates economic incentives for hosts to deliver correct results.

---

## Billing

### Formula

```
billingUnits = duration(seconds) x resolutionFactor x codecFactor x encryptionFactor
tokens = ceil(billingUnits x 1000)
cost = tokens x pricePerToken (set by host on-chain)
```

### Examples

| Scenario | Duration | Resolution | Codec | Encrypted | Billing Units | Tokens |
|----------|----------|-----------|-------|-----------|--------------|--------|
| 60s 1080p H.264 | 60s | 1.0x | 1.0x | No | 60.0 | 60,000 |
| 60s 4K AV1 encrypted | 60s | 2.0x | 1.5x | Yes | 198.0 | 198,000 |
| 10min 720p H.264 | 600s | 0.5x | 1.0x | No | 300.0 | 300,000 |

Hosts set their own `pricePerToken` on the NodeRegistry contract. Different hosts compete on price. The SDK queries host pricing before starting a session.

### Payment Flow

1. Client deposits ETH (or USDC) into the JobMarketplace contract
2. Session is created with deposit amount, price per token, and duration
3. Host transcodes and submits proof of work with token count
4. On completion, contract releases payment to host based on actual tokens used
5. Unused deposit is refundable

---

## SDK Integration

### Quick Start

```typescript
import { FabstirSDKCore, ChainRegistry, ChainId } from '@fabstir/sdk-core';

// Initialize
const chain = ChainRegistry.getChain(ChainId.BASE_SEPOLIA);
const sdk = new FabstirSDKCore({
  mode: 'production',
  chainId: ChainId.BASE_SEPOLIA,
  rpcUrl: process.env.RPC_URL!,
  contractAddresses: { /* from chain.contracts */ },
  s5Config: { portalUrl, seedPhrase },
});

// Authenticate
await sdk.authenticate('signer', { signer });

// Get managers
const sessionManager = sdk.getSessionManager();
const transcodeManager = sdk.getTranscodeManager();

// Check host capabilities
const available = await transcodeManager.isTranscodingAvailable(hostUrl);

// Start session
const { sessionId, jobId } = await sessionManager.startSession({
  host: hostAddress,
  modelId: transcodeModelId,
  chainId: ChainId.BASE_SEPOLIA,
  endpoint: hostUrl,
  depositAmount: '0.0002',
  pricePerToken: 4000000000000,
  paymentMethod: 'deposit',
  encryption: true,
});

// Submit transcode
const handle = await (sessionManager as any).submitTranscode(sessionId.toString(), sourceCid, formats, {
  isGpu: true,
  isEncrypted: true,
  onProgress: (progress, gopInfo) => {
    console.log(`${progress}% — GOP ${gopInfo?.currentGop}/${gopInfo?.totalGops}`);
  },
});

// Wait for result
const result = await handle.result;
// Standard outputs have .cid, HLS outputs have .initSegmentCid + .segments[]
import { isHlsOutput } from '@fabstir/sdk-core';
for (const o of result.outputs) {
  if (isHlsOutput(o)) console.log(`HLS: ${o.segments.length} segments`);
  else console.log('CID:', o.cid);
}
console.log('Billing:', result.billing);
console.log('Proof tree:', result.proofTreeCID);
```

### Available Interfaces

| Interface | Purpose |
|-----------|---------|
| **SDK API** | TypeScript — embed transcoding into any application |
| **Test Harness** | Browser UI at `/transcode-test` — for manual testing and demos |
| **WebSocket Protocol** | Direct WS integration for non-TypeScript clients |
| **Smart Contracts** | On-chain — billing, proofs, disputes |

---

## Future Roadmap

| Feature | Status | Description |
|---------|--------|-------------|
| H.264 GPU transcoding | Production | Validated end-to-end with encrypted source/output |
| AV1 GPU transcoding | Pending sidecar update | Codec support ready in SDK, sidecar image needs AV1-capable ffmpeg |
| HEVC GPU transcoding | Ready | SDK and billing support, needs host registration |
| Quality metrics (PSNR/SSIM) | Phase 6.2 rollout | Per-GOP quality scoring, currently returns null |
| Adaptive streaming (HLS) | SDK ready | SDK v1.18.0: `buildHlsFormats()`, `buildMasterPlaylist()`, `buildVariantPlaylist()`, `assembleHlsContentMetadata()`, `isHlsOutput()` type guard. Node v8.28.0+ passes HLS fields through to transcoder sidecar. Pending: sidecar HLS segment generation (`-f hls -hls_segment_type fmp4`) |
| Streaming playback | SDK ready | HLS M3U8 playlists generated client-side from segment CIDs. Preview segments unencrypted (z-prefix), paid segments encrypted (u-prefix). Use with hls.js or native HLS players. Pending: sidecar HLS output + custom hls.js loader for encrypted segment decryption |
| Batch/bulk transcoding | Planned | Queue management, parallel sessions across hosts |
| Host marketplace | Planned | Compare hosts by price, GPU capability, location |
| USDC payments | Production ready | `PaymentManager.createSessionJobWithUSDC()` documented in SDK_API.md. Harness uses ETH for convenience but USDC is the production payment path |
| Dispute resolution | Contract ready | SDK stubs exist, UI and flow not yet implemented |
| REST API bridge | Planned | `POST /v1/transcode` for non-WebSocket clients |
| Agent-to-agent (A2A) | Planned | Transcode as a capability in the A2A protocol |

---

## Why Decentralised?

**Censorship resistance.** No platform can refuse to transcode your content based on its subject matter. Any host on the network can process any job.

**No vendor lock-in.** Switch hosts freely. Your content lives on S5, not in a vendor's silo. CIDs are portable — any S5-compatible application can access the content.

**Competitive pricing.** Hosts set their own prices and compete for jobs. No markup from a centralised platform.

**Privacy by default.** End-to-end encryption is standard, not optional. The network operators — hosts, S5 portals, blockchain validators — never see your content in the clear.

**Verifiable correctness.** Cryptographic proofs ensure hosts can't cheat. Quality is measurable and disputable on-chain.

**Permissionless participation.** Anyone with a GPU can register as a host and earn by transcoding. No application process, no approval needed.
