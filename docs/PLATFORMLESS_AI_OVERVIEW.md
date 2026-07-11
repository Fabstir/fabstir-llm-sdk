# Platformless AI - Project Overview

## Vision

**Decentralised infrastructure for AI agents and applications - trustless, private, and sovereign by design**

_"We don't trust, we verify."_

Platformless AI represents the right architecture for how the world should interact with LLMs, AI models, and autonomous AI agents. A truly ground-breaking infrastructure for the ages - where users are sovereign and in complete control of their data, able to decide what AI and AI agents can access, and share securely with other users on their own terms. From agentic coding assistants to experimental multi-agent orchestration with Google's A2A protocol (v1.0.0-rc), Platformless AI provides the decentralised compute layer that eliminates vendor lock-in, censorship, and privacy risk.

## Core Principles: Trustless by Design

| Principle                 | Technology                           | Guarantee                                                                                  |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| **Proof of Storage**      | Sia Network                          | Data persisted and retrievable without central servers                                     |
| **Proof of Computation**  | STARK Proofs (Risc0 zkVM)            | Mathematical certainty that inference ran correctly                                        |
| **Content Integrity**     | Blake3 Content Addressing            | Cryptographic guarantee content is not tampered with                                       |
| **Content Provenance**    | Input Commitments + On-Chain Anchors | AI-generated media carries a verifiable record of which model and which inputs produced it |
| **Communication Privacy** | XChaCha20-Poly1305 + Forward Secrecy | End-to-end encryption; past sessions remain secure even if keys compromised                |
| **Full Transparency**     | Open Source                          | Every line of code auditable by anyone                                                     |
| **User Sovereignty**      | Wallet-Based Identity                | You control your data, your keys, your AI access                                           |

## Overview

Platformless AI is building decentralised AI infrastructure that eliminates the platform middleman. Unlike traditional AI services, there's no centralised company that can censor prompts, access your data, or revoke your access. Smart contracts coordinate, P2P connections deliver inference, and cryptographic proofs verify computation - all without requiring trust in a central authority.

Our marketplace connects GPU providers directly with users through blockchain-based settlement, end-to-end encryption, and mathematical proof of computation. This creates a trustless, censorship-resistant, and privacy-preserving platform for AI services.

**Critically, this infrastructure extends beyond chat to support autonomous AI agents and multi-agent orchestration.** Our Claude Bridge has demonstrated Claude Code — an agentic coding assistant with 23 tools — running entirely on decentralised GPU hosts. Our OpenAI Bridge extends this to any OpenAI-compatible client (OpenCode, Continue, Cursor, LangChain), including image generation via FLUX.2 diffusion. The same encrypted rail now **generates video**: LTX 2.3 text-to-video, image-to-video, first-last-frame, and video-restyle (IC-LoRA union control) clips — paid per clip in USDC, settled on-chain with the host earning 90%, and carrying cryptographic provenance the buyer's own client verifies. Our orchestrator package (`@fabstir/orchestrator`) adds experimental DAG-based task decomposition, intelligent model routing, and inter-agent collaboration via Google's Agent-to-Agent (A2A) protocol (v1.0.0-rc, ~12 months old) — with x402 USDC micropayments for cross-agent delegation. Platformless AI is, to our knowledge, the first DePIN project to implement A2A. The core orchestration is functional and fully tested (351 unit tests), but A2A is still maturing as a standard, and we're early implementers — full interoperability testing with third-party A2A agents is ongoing.

## The Problem

### Current AI Market Challenges

1. **Platform Control & Censorship**
   - Centralised platforms (OpenAI, Anthropic, Google) control access
   - Content filtering based on platform policies
   - Risk of deplatforming or access revocation
   - No recourse if terms change
   - Training on user data without consent

2. **Data Privacy & IP Concerns**
   - Proprietary data sent to third-party servers
   - No end-to-end encryption guarantees
   - IP leakage risk for enterprises
   - Compliance issues (GDPR, HIPAA, financial regulations)
   - Trust-based security (no cryptographic guarantees)

3. **Vendor Lock-In & Economics**
   - 300-750x markup over compute costs
   - Subscription models and rate limits
   - API key dependencies (can be revoked)
   - Limited model selection
   - Geographic restrictions

4. **Enterprise Compliance Gaps**
   - Cannot meet data sovereignty requirements
   - No immutable audit trails
   - Insufficient for ISO 27001, ISO 42001, SOC 2 compliance
   - GDPR/HIPAA violations from third-party data handling
   - Single points of failure

## Our Solution

### Platformless AI: Infrastructure Without the Platform

A decentralised marketplace where smart contracts handle coordination, P2P connections deliver inference, and cryptographic proofs verify computation - no company in the middle.

### Core Architecture

1. **Decentralised Infrastructure**
   - Direct WebSocket connections (user ↔ GPU provider)
   - Smart contracts for job assignment (Base L2, opBNB)
   - No central servers or APIs to trust
   - Global distribution with automatic failover
   - Multi-chain support for resilience

2. **End-to-End Encryption (Default)**
   - XChaCha20-Poly1305 AEAD encryption
   - Forward secrecy via ephemeral session keys
   - ECDSA signatures for sender authentication
   - Private communication (only you and your chosen host can read content)
   - No platform intermediary sees your prompts or responses

3. **Cryptographic Verification**
   - STARK proofs via Risc0 zkVM
   - ~221KB proofs generated per 1,000 tokens
   - Off-chain storage on S5 (Sia network)
   - Only 32-byte hash + CID submitted on-chain (737x size reduction)
   - Mathematical certainty of computation

4. **Decentralised Storage**
   - Enhanced S5.js (Sia Foundation grant funded)
   - All conversations encrypted before storage
   - STARK proofs persisted on Sia network
   - No centralised databases or servers
   - Content-addressed, verifiable storage

5. **Multi-Chain Settlement**
   - Base L2 (primary) - fast, cheap transactions
   - opBNB Testnet (secondary) - alternative chain
   - ETH, USDC, FAB token payments
   - Automated escrow and distribution
   - Immutable on-chain audit trails

6. **Agentic AI Bridges**
   - **Claude Bridge** (`@fabstir/claude-bridge`): Anthropic Messages API compatibility layer
   - **OpenAI Bridge** (`@fabstir/openai-bridge`): OpenAI Chat Completions, Images, and Responses API compatibility layer
   - Enables autonomous AI agents (Claude Code, Cursor, OpenCode, Continue, LangChain) to run on decentralised hosts
   - Streaming SSE translation: tool_use, input_json_delta, multi-turn tool results
   - Supports 23+ tool definitions with structured tool calling
   - Think-block stripping, output limits, and session auto-recovery
   - Any Anthropic-compatible or OpenAI-compatible client works without modification

7. **Image Generation**
   - FLUX.2 diffusion model integration via host-side sidecar
   - SDK auto-detects image intent from natural language ("generate an image of...", "draw a...", "paint a...")
   - Extracts resolution (e.g. 1024x1024) and inference steps from prompt text
   - Multi-turn aware: correctly detects intent in conversation history
   - Encrypted end-to-end: image prompts and results flow through same encrypted WebSocket
   - Explicit API (`generateImage()`) and automatic intent routing both supported

8. **Developer-Friendly SDK**
   - Browser-compatible (@fabstir/sdk-core)
   - One SDK that handles the whole flow: wallet sign-in, payments, encrypted chat sessions, host discovery, storage, encryption, document search, and video transcoding
   - Real-time streaming responses
   - Simple integration (5 lines to start)
   - Open source and auditable

9. **Host Operator Tools**
   - Host CLI (`@fabstir/host-cli`) for server management
   - TUI dashboard for headless servers (status, logs, earnings, pricing)
   - Setup wizard for guided host onboarding
   - Model discovery and download with verification
   - Earnings tracking and withdrawal

10. **Multi-Agent Orchestration** (Experimental)

- `@fabstir/orchestrator` package — multi-agent coordination (experimental, built on A2A v1.0.0-rc)
- Google A2A protocol — first DePIN project to implement inter-agent communication standard (pre-1.0, interoperability testing ongoing)
- DAG-based task decomposition — LLM-driven goal breakdown into typed sub-tasks
- Intelligent model routing — task-type-aware assignment (fast/deep) with on-chain validation
- Orchestration patterns — FanOut (parallel), Pipeline (sequential), MapReduce (aggregate)
- SSE streaming — real-time phased progress with content negotiation and task cancellation
- x402 HTTP payment — USDC micropayments for inter-agent delegation via EIP-3009
- Session pooling — semaphore-based concurrency with nonce serialisation
- Agent discovery — skill-based lookup via A2A Agent Cards
- 351 unit tests passing

11. **Video Transcoding & HLS Streaming** (built & validated; post-MVP go-to-market)

- Decentralised, GPU-accelerated transcoding (H.264, HEVC/H.265, AV1 via NVIDIA NVENC sidecar)
- Multiple output resolutions per job; whole-file or **HLS adaptive bitrate** (fMP4 segments)
- Per-segment encryption: free preview segments unencrypted, paid segments XChaCha20-Poly1305 (key-in-CID); SDK builds M3U8 playlists client-side for hls.js playback
- GOP-level STARK proofs verify quality (PSNR/SSIM) with on-chain Merkle root and dispute/refund logic
- Capacity-aware load balancing across hosts with automatic overflow — stress-tested at 7 concurrent jobs across 2 GPU hosts (NVIDIA L40S + RTX Pro 6000), 100% completion
- NVENC uses dedicated encoder silicon separate from CUDA cores — hosts transcode and run inference simultaneously (dual revenue, no degradation)
- Privacy-preserving end-to-end (encrypted source/output on S5 + Blake3; unencrypted video exists only in host memory)
- Competitive pricing vs. AWS MediaConvert, Mux, Cloudflare Stream — same trustless infrastructure as LLM inference

12. **AI Video Generation (LTX 2.3)** — live end-to-end with settled on-chain economics

- Four modes, selected by pinned template: **text-to-video**, **image-to-video** (animate the user's own still), **first-last-frame** (two ordered stills; the model generates the motion between them), **video restyle** (IC-LoRA union control — a reference still plus a control clip whose motion and camera the output follows, re-skinned to the reference look)
- Resolutions SD through 4K (portrait/landscape/square; **1440p live, 4K staged**), **user-selectable 5–15 s clips at 24–50 fps** with generated audio; **$0.04–$0.91 per clip** across the ladder on current test pricing, billed by megapixel-frame at on-chain prices
- Per-clip USDC escrow sized to the exact cost; the host anchors its proof of work on-chain and settlement pays 90% to the host, refunding the remainder — **proven to the unit on real sessions** from both the SDK and the product UI
- **Verifiable provenance**: an attestation binds prompt, seed, parameters, and the byte-exact input images and control video to the output; the client recomputes the commitment, and the attestation hash is anchored on-chain at settlement — the product UI shows a "✓ verified" badge the user's own browser computed
- **Now inside Blender**: all four modes run in a native Blender 5.x extension in the Video Sequence Editor — the artist works with the strips already on the timeline (a prompt, a keyframe still, two stills to bridge, or a movie strip plus a reference still to restyle) and the finished clip replaces the placeholder in place, billed to the estimate and settled on-chain to the unit (SD/720p/1080p proven live, including a restyle that follows the control clip's motion and camera); the extension conforms the control strip to the job's fps/duration, adds the delivered audio as a frame-aligned sound strip, and records each clip's session id, proof CID, seed, and billing on the strip — a pure protocol client, so the host node is unchanged, and the LTX 2.3 pipeline is HDR- and EXR-native
- Input stills and control clips encrypted client-side (stills up to 32 MB); pinned, hash-committed templates mean clients send typed parameters, never executable graphs

## How It Works

### For Users (Clients)

1. **Connect Wallet** - Any Ethereum wallet (MetaMask, Coinbase Wallet, Rainbow)
2. **Automatic Encryption** - SDK generates session keys, encrypts all messages
3. **Select Model** - Browse available models and GPU providers
4. **Deposit Funds** - Minimum deposit (e.g., $1 USDC) into smart contract escrow
5. **Send Prompts** - Real-time encrypted inference with streaming responses
6. **Automatic Settlement** - Pay only for tokens used, unused deposit refunded

### For GPU Providers (Hosts)

1. **Register Node** - Specify hardware, stake FAB tokens, list supported models
2. **Set Pricing** - Competitive per-token pricing (marketplace dynamics)
3. **Serve Requests** - Automatic job matching via smart contracts
4. **Process Encrypted Payloads** - Decrypt only in memory to run inference; no platform, proxy, or storage node ever sees content
5. **Submit Proofs** - Generate STARK proofs, upload to S5, submit hash on-chain
6. **Earn Revenue** - 90% of payments, 10% treasury fee, instant settlement

### For Video Transcoding (Post-MVP)

1. **Upload Video** - Upload to S5 with Blake3 encryption, get CID
2. **Select Format** - Choose output codec (h264/AV1), resolution (720p/1080p/4K), quality tier
3. **Find Host** - Browse transcode providers by price, supported formats (H.264/HEVC/AV1), hardware acceleration
4. **Create Job** - Specify format requirements (whole-file or HLS segments), deposit USDC based on video duration
5. **Monitor Progress** - Real-time progress updates via WebSocket (GOP-by-GOP)
6. **Verify Quality** - Spot-check random GOPs, validate PSNR/SSIM metrics against spec
7. **Download Output** - Retrieve transcoded video from S5, encrypted with your keys

**Transcode Flow**:

```
Upload to S5 → Create Job → Host Downloads → GPU Transcode → GOP Proofs
→ Upload Output to S5 → Submit Proof Hash On-Chain → Payment Release
```

### For AI Video Generation

1. **Describe the Clip** - Prompt, plus optional stills (encrypted client-side) for image-to-video / first-last-frame, or a reference still and control clip for restyle
2. **See the Exact Price** - Cost computed from on-chain pricing before committing ($0.04–$0.91 per clip by resolution)
3. **Escrow & Generate** - Per-clip USDC session; encrypted WebSocket streams staged progress (generating → encrypting → uploading)
4. **Verify Provenance** - Client recomputes the input commitment (prompt, seed, params, byte-exact image hashes) against the attestation
5. **Automatic Settlement** - Host anchors its proof on-chain and the session settles: 90% to host, remainder refunded

**Generation Flow**:

```
Validate vs Allow-List Bundle → Escrow USDC → Encrypted Generate (pinned template)
→ Encrypted Clip on S5 → Verify Attestation → Proof Hash On-Chain → Settle & Refund
```

### Technical Flow

```
Client Wallet → Smart Contract → Host Discovery → P2P WebSocket (encrypted)
→ Inference (GPU) → STARK Proof → S5 Storage → Hash On-Chain → Payment Release
```

## Technology Stack

### Core Technologies

- **Blockchain**: Base L2 (Ethereum), opBNB Testnet - low-cost, fast settlement
- **Payments**: ETH, USDC, FAB tokens - multi-token support
- **Encryption**: XChaCha20-Poly1305 AEAD, ECDH key exchange, ECDSA signatures
- **Proofs**: Risc0 zkVM STARK proofs - cryptographic verification
- **Storage**: Enhanced S5.js (Sia network) - decentralised, verifiable persistence
- **Networking**: WebSocket P2P - direct client-to-host connections
- **Smart Contracts**: JobMarketplace, NodeRegistry, ProofSystem, HostEarnings, ModelRegistry

### Architecture Highlights

- **Session-Based Model**: Long-running encrypted conversations with checkpoints
- **Forward Secrecy**: Ephemeral keys per session, discarded after use
- **Streaming Responses**: Real-time token generation with low latency
- **Proof Checkpoints**: Every 1,000 tokens, STARK proof generated and verified
- **Automatic Failover**: Session recovery if host disconnects
- **Multi-Host Isolation**: Each host has unique encryption keys

### Security & Compliance

**Implemented**:

- ✅ End-to-end encryption by default (XChaCha20-Poly1305)
- ✅ Private inference (no platform intermediary sees content)
- ✅ Immutable audit trails (all transactions on-chain)
- ✅ GDPR-compliant data handling (encrypted, user-controlled)
- ✅ Forward secrecy (ephemeral session keys)
- ✅ Sender authentication (ECDSA signatures)
- ✅ Evidence-based slashing for host misbehavior

**Encryption boundary (honest scoping):** End-to-end encryption protects content **in transit and at rest** — no platform, proxy, or storage node ever sees it. The host you select does decrypt in memory to run inference; that is what "end-to-end" means here (client-to-host, no intermediary), not computation on ciphertext. Plaintext is transient and never persisted unencrypted. Host-blind _in-use_ privacy is the role of confidential computing (TEE), on the roadmap; sensitive inputs can also be pre-processed client-side today so only derived data (e.g. vectors) reaches the host.

**In Progress** (Enterprise Compliance):

- 🔄 ISO 27001 (Information Security Management)
- 🔄 ISO 42001 (AI Management Systems)
- 🔄 SOC 2 Type 2 audit readiness
- 🔄 HIPAA compliance architecture validation

## Business Model

### Revenue Streams

1. **Transaction Fees**
   - 10% treasury fee on all inference payments
   - 90% goes directly to GPU providers
   - Sustainable protocol development funding
   - Community governance treasury

2. **Model Curation & Governance**
   - Owner-curated model approval at MVP (via `addTrustedModel`)
   - Community voting infrastructure ready (proposeModel, voteOnProposal)
   - Quality assurance services
   - Curated model listings
   - Specialised model hosting

3. **Enterprise & SaaS Services**
   - Private node deployments
   - Dedicated compute capacity
   - SLA guarantees
   - Custom compliance packages
   - White-label solutions
   - SaaS AI backend (drop-in Anthropic or OpenAI API replacement for product teams)
   - Agentic AI infrastructure (managed Claude Bridge + OpenAI Bridge for enterprise dev teams)

### Token Economics

- **FAB Token**
  - Host staking requirement (minimum 1000 FAB)
  - Governance rights (model approvals, protocol upgrades)
  - Slashing collateral for dispute enforcement
  - Fee discounts (use FAB for payments)
  - Higher stake = higher job priority in selection algorithm

- **Multi-Token Payments**
  - ETH (native, gas-efficient)
  - USDC (stablecoin, preferred for pricing)
  - FAB (platform token, fee discounts)
  - Users choose payment token

## Market Opportunity

### Total Addressable Market

- **Global AI Market**: $400B+ by 2025, growing 35% annually
- **LLM API Market**: $7B+ in 2024, 37% CAGR
- **Agentic AI / AI Coding Market**: $15B+ by 2027 (GitHub Copilot alone: $100M+ ARR; Cursor, Windsurf, Claude Code growing rapidly)
- **AI-Powered SaaS**: $30B+ by 2027 — every SaaS company embedding AI needs reliable, private infrastructure
- **Video Transcoding Market**: $1.8B+ by 2027, 17% CAGR (Post-MVP expansion)
- **AI Video Generation**: the fastest-growing generative segment (Sora, Runway, Kling, LTX) — verifiable provenance is our wedge as AI-content disclosure rules tighten across film, advertising, and news
- **Enterprise AI Security**: $22B+ market (compliance, privacy)
- **Decentralised Compute**: $8B+ emerging market

### Target Segments

1. **Enterprises & Financial Institutions**
   - Trading firms (strategy protection, real-time analysis)
   - Investment banks (client portfolio analysis, compliance)
   - Law firms (attorney-client privilege, document review)
   - Healthcare (HIPAA compliance, patient diagnostics)
   - Web3 companies (avoid centralised AI irony)

2. **SaaS Companies**
   - AI-powered product features without vendor lock-in (no single API key dependency)
   - Private customer data processing (data never leaves encrypted P2P channel)
   - Multi-model flexibility (switch models without re-architecting)
   - Cost control (direct GPU pricing vs. 300-750x platform markup)
   - Compliance-ready AI backend (GDPR, HIPAA, SOC 2)

3. **Developers & Startups**
   - Privacy-first applications
   - Censorship-resistant apps
   - Custom model deployment
   - Budget-conscious builders

4. **GPU Providers**
   - Gamers with idle RTX 3060+ GPUs
   - AI-focused data centers with spare capacity
   - Cloud GPU providers looking to diversify revenue
   - Crypto miners pivoting to AI compute
   - Render farms that already have GPUs for VFX/animation
   - Geographic diversity (global participation)

5. **Researchers & Academics**
   - Experimental models
   - Controversial research (no censorship)
   - Budget constraints
   - Open access requirements

6. **Content Creators & Media Companies** (Post-MVP)
   - YouTubers, streamers, indie filmmakers (affordable transcoding + AI video generation from $0.04/clip)
   - Filmmakers needing **provenance-verifiable AI generation** (every clip carries a cryptographic record of model + inputs, anchored on-chain — C2PA-adjacent, ready for disclosure regimes)
   - Media companies (privacy-preserving video processing)
   - NFT marketplaces (video NFT optimisation)
   - Decentralised video platforms (LBRY, Odysee, PeerTube)
   - Animation studios, VFX houses (render farms diversifying into transcoding)
   - Censorship-resistant content distribution

## Competitive Advantages

### 1. **True Platformlessness**

- No company controls access (smart contracts coordinate)
- No API keys to revoke (wallet-based access)
- No terms of service to change (immutable protocol)
- No censorship (no gatekeeper)
- No single point of failure (distributed infrastructure)

### 2. **Cryptographic Security**

- End-to-end encryption by default (not optional)
- Private communication (only user and host see content, no platform intermediary)
- Forward secrecy (past sessions remain secure if keys compromised)
- STARK proofs (mathematical certainty of computation)
- Sender authentication (ECDSA signatures)
- Evidence-based slashing (CID audit trail enables accountability)

### 3. **Enterprise Compliance Ready**

- ISO 27001, ISO 42001, SOC 2 preparation underway
- GDPR-compliant by design (encrypted, user-controlled data)
- HIPAA-ready architecture (no third-party data exposure)
- Immutable audit trails (blockchain-based)
- Data sovereignty (choose geographic regions for compute)

### 4. **Efficient Economics**

- No platform markup (direct P2P pricing)
- Transparent pricing (all rates visible on-chain)
- Instant settlement (no payment delays)
- Fair distribution (90% to hosts, 10% protocol fee)
- Competitive marketplace (providers compete on price/quality)

### 5. **Agentic AI & Multi-Agent Orchestration Ready**

- Only decentralised infrastructure supporting autonomous AI agent tool use AND multi-agent orchestration (experimental)
- Claude Bridge: Anthropic Messages API compatibility for agentic coding (Claude Code, Cursor)
- OpenAI Bridge: OpenAI Chat Completions API compatibility (OpenCode, Continue, LangChain, any OpenAI SDK client)
- Streaming SSE with structured tool calling (23+ tools), multi-turn tool results
- Image generation via `/v1/images/generations` endpoint (FLUX.2 diffusion, quality/size mapping)
- **A2A Protocol** (experimental): First DePIN project to implement Google's Agent-to-Agent standard (v1.0.0-rc; 150+ partners, Linux Foundation governed). Third-party interoperability testing ongoing.
- **Multi-agent orchestration** (experimental): DAG-based task decomposition, FanOut/Pipeline/MapReduce patterns, intelligent model routing — 351 unit tests passing
- **x402 HTTP payments**: USDC micropayments for inter-agent delegation via EIP-3009 (gasless, no pre-funding)
- **Delegated payments (sponsored sessions)**: a payer (SaaS backend or treasury) authorises a delegate key with a hard on-chain USDC allowance cap to fund users'/agents' inference — the delegate never holds funds, so a runaway agent cannot exceed the cap; wired into the orchestrator daemon via a single env var
- **SSE orchestration streaming**: Real-time phased progress events with content negotiation and mid-flight task cancellation
- SaaS-ready: any Anthropic-compatible or OpenAI-compatible client works without modification
- Proven in production: Claude Code and OpenCode running on decentralised hosts

### 6. **Technical Innovation**

- Off-chain proof storage (221KB proofs on S5, 32-byte hash on-chain)
- Multi-chain support (Base, opBNB, future chains)
- Enhanced S5.js integration (Sia Foundation grant funded)
- Real-time streaming (low-latency inference)
- Session-based efficiency (context preservation)
- RAG infrastructure (vector DB, document management, Claude Projects-style organisation)
- Host-side embedding generation (privacy-preserving, no external API calls)
- Intelligent host selection (weighted scoring algorithm)
- A2A protocol integration (inter-agent discovery, delegation, and collaboration)
- x402 HTTP payment protocol (USDC micropayments alongside escrow settlement)
- Verifiable AI-media provenance (pinned hash-committed templates; input commitments binding prompt, seed, and byte-exact input images; attestation hashes anchored on-chain at settlement)
- Settled per-clip economics (megapixel-frame billing; sessions settle host earnings, treasury fee, and refunds to the exact unit)

## Current Status

### Completed (MVP Ready)

✅ **Core Infrastructure**

- Smart contracts deployed on Base Sepolia (UUPS upgradeable proxies)
- Multi-chain support operational
- WebSocket P2P connections working
- Production nodes running live inference with SSL
- SDK browser compatibility achieved
- Production UI (apps/ui5) in final development

✅ **End-to-End Encryption**

- XChaCha20-Poly1305 AEAD implementation complete
- Forward secrecy via ephemeral keys
- ECDSA signature authentication
- Session key management
- Encryption enabled by default (Phase 6.2)

✅ **Proof System**

- STARK proof generation via Risc0 zkVM
- ~221KB proofs stored on S5 (Sia network)
- 32-byte hash + CID on-chain (737x reduction)
- GPU-accelerated proof generation (0.2-2.3s)
- Checkpoint verification working (every 1,000 tokens)

✅ **Payment System**

- Multi-token support (ETH, USDC, FAB)
- Multi-chain payments (Base, opBNB)
- Session-based escrow and settlement
- Automatic refunds for unused deposits
- 90%/10% host/protocol revenue split

✅ **Storage Layer**

- Enhanced S5.js integration complete
- All conversations encrypted before storage
- STARK proofs persisted on Sia network
- Decentralised, content-addressed storage
- No centralised databases

✅ **Developer Tools**

- Browser-compatible SDK (@fabstir/sdk-core v1.28.2+)
- Modular architecture — each capability (sign-in, payments, sessions, storage, encryption, document search, transcoding, video generation) is a self-contained building block
- Comprehensive API documentation
- Working demo applications (apps/harness, apps/ui4, apps/ui5)
- Integration test suite passing

✅ **Host Operator Tools**

- Host CLI package (@fabstir/host-cli) for server management
- TUI dashboard for headless server monitoring (status, logs, earnings)
- Interactive setup wizard for guided host onboarding
- Model discovery with blockchain validation and download verification
- Pricing management (update rates via CLI or TUI)
- Earnings tracking and withdrawal commands

✅ **Marketplace Pricing**

- Host-controlled minimum pricing (contract-enforced)
- Price discovery via the SDK
- Intelligent host selection (weighted algorithm: stake 35%, price 30%, uptime 20%, latency 15%)
- User preference persistence (selection mode, default model)

✅ **Dispute Resolution & Slashing**

- Evidence-based enforcement via CID audit trail (proofCID, deltaCID, conversationCID)
- Owner-controlled slashing at MVP (transferable to DAO post-MVP)
- Safety constraints: 50% max slash per action, 24-hour cooldown, evidence required
- All slashes emit public events for transparency
- Progressive decentralisation path to DAO governance

✅ **Document Search (RAG)**

- Host-side vector database operations (semantic search)
- Document chunking and embedding
- Claude Projects-style session organisation
- Access control for groups and databases
- Host-side embedding via `/v1/embed` endpoint

✅ **Agentic AI Bridges** (Claude Bridge + OpenAI Bridge)

- **Claude Bridge** (`@fabstir/claude-bridge`): Anthropic Messages API compatibility layer
- **OpenAI Bridge** (`@fabstir/openai-bridge`): OpenAI Chat Completions, Images, and Responses API compatibility layer
- Full tool use support: streaming SSE with tool_use blocks, input_json_delta, multi-turn tool results
- Claude Code (23 tools) and OpenCode running end-to-end on decentralised hosts — verified in production
- OpenAI Bridge supports: `/v1/chat/completions` (streaming + non-streaming), `/v1/images/generations` (FLUX.2), `/v1/responses`, `/v1/models`, vision (base64 images), tool calling
- Think-block stripping, output safeguards, session auto-recovery
- Enables any Anthropic-compatible or OpenAI-compatible AI agent or SaaS application to use decentralised infrastructure
- 129 + 162 tests passing, production-validated

✅ **Image Generation**

- FLUX.2 diffusion model via host-side sidecar (encrypted WebSocket path)
- SDK auto-detects image intent from natural language prompts (7 trigger patterns)
- Extracts resolution and inference steps from prompt text
- Multi-turn aware: works correctly in conversation history (User:/Assistant: and Harmony formats)
- Both explicit API (`generateImage()`) and automatic intent routing supported
- Production-validated with multiple resolutions (512x512, 768x768, 1024x1024)

✅ **Multi-Agent Orchestration** (`@fabstir/orchestrator`) — Experimental

- A2A protocol (v1.0.0-rc) — first DePIN project to implement Google's Agent-to-Agent standard; third-party interoperability testing ongoing
- DAG-based task decomposition with LLM-driven planning
- Intelligent model routing (task-type-aware assignment with on-chain validation)
- Orchestration patterns: FanOut, Pipeline, MapReduce
- SSE streaming with real-time phased progress, content negotiation, and task cancellation
- x402 HTTP payment protocol — USDC micropayments for inter-agent delegation (EIP-3009)
- Session pooling with semaphore-based concurrency and nonce serialisation
- Agent discovery via A2A Agent Cards with skill-based routing
- Proof collection — cryptographic proof CID accumulation across sub-tasks
- 351 unit tests passing

✅ **Video Transcoding & HLS Streaming** (built & validated; post-MVP go-to-market)

- GPU transcoding (H.264, HEVC, AV1) via NVENC sidecar — runs concurrently with inference (dual revenue from one GPU)
- Whole-file and HLS adaptive bitrate (fMP4 segments) with per-segment encryption (free preview / paid encrypted)
- GOP-level STARK proofs (PSNR/SSIM) with on-chain Merkle root and dispute/refund logic
- Capacity-aware multi-host load balancing — stress-tested 7 concurrent jobs across 2 GPU hosts, 100% completion
- End-to-end validated: encrypted upload → GPU transcode → HLS segments on Sia/S5 → USDC settlement → hls.js playback with decrypting service worker

✅ **AI Video Generation (LTX 2.3)** — live with settled economics

- Four modes live from the product UI: text-to-video, image-to-video, first-last-frame, and video restyle (IC-LoRA union control) — encrypted input stills and control clips, order-bound into the provenance commitment
- Pinned, hash-committed ComfyUI templates behind a versioned, client-authenticated allow-list bundle — clients send typed parameters, never graphs
- Full payment rail proven on Base Sepolia: per-clip USDC escrow → on-chain proof submission → dispute-window settlement → 90/10 split — **host earnings, treasury fee, and user refund verified to the exact unit** on real sessions, from two independent clients
- Resolution ladder live through 1440p (4K staged behind a final contract check); **user-selectable 5–15 s clips at 24–50 fps** with generated audio, $0.04–$0.40 per clip through 1440p on test pricing
- Client-side provenance verification shipping in the chat UI: "✓ verified" badge (input binding) upgrading to "verified + anchored" once the proof confirms on-chain
- **Blender extension (live)**: all four modes inside the Video Sequence Editor of a native Blender 5.x extension — clips generated and settled on-chain to the unit from within the timeline (SD/720p/1080p proven, including a restyle following the control clip's motion and camera), with the control strip conformed to the job's fps/duration, the delivered audio added as a frame-aligned sound strip, and each strip recording its session id, proof CID, seed, and billing; the host node is unchanged, and the LTX 2.3 pipeline is HDR- and EXR-native

### In Progress (Q2 2026)

🚀 **Production Deployment**

- Security audit underway (smart contracts)
- Public beta preparation on Base Sepolia
- Enterprise beta programme preparation
- Web application (platformlessai.org)
- UI5 production deployment with Base Account Kit
- Network monitoring dashboard

🚀 **Compliance & Security**

- Security audit (smart contracts) - in progress
- ISO 27001 preparation
- ISO 42001 (AI-specific) preparation
- SOC 2 Type 2 audit readiness
- Penetration testing

## Roadmap

### Q4 2025 - Infrastructure Complete ✅

- [x] MVP complete (production-ready)
- [x] Complete modular SDK (sign-in, payments, sessions, storage, encryption, document search)
- [x] Host CLI with TUI dashboard
- [x] Setup wizard for host onboarding
- [x] Marketplace pricing (host-controlled, contract-enforced)
- [x] RAG infrastructure (vector DB, document management)
- [x] End-to-end encryption by default

### Q1 2026 - Multi-Agent Orchestration (Experimental) ✅

- [x] `@fabstir/orchestrator` package with A2A protocol support (v1.0.0-rc)
- [x] DAG-based task decomposition and intelligent model routing
- [x] SSE streaming with real-time progress and task cancellation
- [x] x402 HTTP payment protocol for inter-agent USDC micropayments
- [x] FanOut, Pipeline, MapReduce orchestration patterns
- [x] Agent discovery via A2A Agent Cards
- [ ] Third-party A2A agent interoperability testing

### Q1 2026 - Public Beta Launch

- [ ] Public beta on Base Sepolia
- [ ] Enterprise beta programme launch
- [ ] Web application live (platformlessai.org)
- [ ] 10+ verified models
- [ ] 20+ active hosts
- [ ] UI5 production deployment

### Q2 2026 - Enterprise Adoption

- [ ] ISO 27001, SOC 2 certification complete
- [ ] 3-5 enterprise pilot customers
- [ ] Base mainnet deployment
- [ ] Enhanced host pricing discovery
- [ ] Mobile-responsive UI improvements

### Q2 2026 - AI Video Generation ✅

- [x] LTX 2.3 generation live: text-to-video, image-to-video, first-last-frame, and video restyle (IC-LoRA union control)
- [x] Pinned-template provenance with client-side verification and on-chain proof anchoring
- [x] Full per-clip economics settled on Base Sepolia (90/10 split, verified to the unit)
- [x] Resolution ladder through 1440p in the product UI; encrypted input stills to 32 MB
- [x] User-selectable clip length (5–15 s) and frame rate (24, 25, 48, 50 fps)
- [x] Blender 5.x extension — all four modes live in the Video Sequence Editor (text-to-video, image-to-video, first-last-frame, restyle), settled on-chain to the unit (SD/720p/1080p proven), with control-strip conforming and frame-aligned delivered audio
- [ ] 4K activation (final contract-level check)
- [ ] Host-signed attestations

### Q3 2026 - Scale & Expansion

- [ ] 50+ models available
- [ ] 100+ active hosts
- [ ] 1,000+ monthly active users
- [ ] API gateway service (REST abstraction)
- [ ] Model governance DAO launch
- [ ] C2PA/Content Credentials export backed by the on-chain proof anchor

### Q4 2026 - Ecosystem Growth

- [ ] Additional L2 chains (Arbitrum, Optimism, Polygon)
- [ ] RAG/vector database marketplace
- [ ] Model training marketplace
- [ ] Multi-orchestrator coordination via A2A
- [ ] Agent marketplace with on-chain reputation scoring
- [ ] Dynamic x402 pricing based on task complexity
- [ ] 500+ hosts, 5,000+ users
- [ ] Institutional partnerships

## Use Cases

### Enterprise Use Cases

1. **Financial Services**
   - Algorithmic trading analysis (no strategy leakage)
   - Client portfolio analysis (compliance-ready)
   - Market sentiment analysis (real-time)
   - Fraud detection (data sovereignty)

2. **Healthcare**
   - Patient diagnostics (HIPAA-compliant)
   - Medical research (privacy-preserving)
   - Clinical decision support (encrypted data)
   - Insurance claim processing (secure)

3. **Legal**
   - Contract review and analysis (attorney-client privilege)
   - Case law research (confidential)
   - Document summarisation (IP protection)
   - Due diligence (data security)

4. **Media & Entertainment**
   - Script generation (no IP theft)
   - Creative content generation (proprietary)
   - AI video generation with verifiable provenance (which model, which inputs — anchored on-chain; ready for AI-disclosure requirements) — all four modes now generatable **directly inside Blender's timeline** via a native extension, keeping VFX artists in their production tool
   - Storyboard-to-motion and restyle workflows (animate stills, generate the motion between two frames, or re-skin a control clip to a reference still)
   - Translation services (confidential)
   - Voiceover generation (privacy)

### Agentic AI Use Cases

1. **Agentic Coding**
   - Claude Code, Cursor, Windsurf, OpenCode, Continue running on private decentralised infrastructure
   - Both Anthropic and OpenAI API compatibility (Claude Bridge + OpenAI Bridge)
   - Source code never leaves encrypted P2P channel (IP protection)
   - No API key dependency on Anthropic/OpenAI (sovereign access)
   - Enterprise dev teams coding with AI without data leakage risk
   - Full tool use: file editing, terminal commands, web search — all through decentralised hosts

2. **SaaS AI Backend**
   - Companies embedding AI into products without vendor lock-in
   - Drop-in Anthropic API replacement (Claude Bridge) or OpenAI API replacement (OpenAI Bridge)
   - Multi-model flexibility: swap underlying models without client changes
   - Predictable costs at scale (direct GPU pricing, no platform markup)
   - Sponsored sessions: fund all customer inference via a capped delegate allowance — no per-user wallets, hard on-chain spend ceiling
   - Compliance-ready: encrypted inference meets GDPR/HIPAA/SOC 2 requirements

3. **AI Agent Orchestration** (experimental, via `@fabstir/orchestrator`)
   - Multi-agent workflows decomposed into DAGs — research, analysis, synthesis tasks executed in parallel
   - A2A protocol (v1.0.0-rc) enables agents to discover and delegate to each other across organisational boundaries
   - Orchestration patterns: FanOut for parallel research, Pipeline for staged refinement, MapReduce for document aggregation
   - x402 USDC micropayments for cross-agent delegation — no pre-funding required (EIP-3009)
   - SSE streaming for real-time orchestration progress with mid-flight task cancellation
   - Long-running agent sessions with encrypted state persistence and cryptographic proof collection

### Developer Use Cases

1. **Privacy-First Applications**
   - Encrypted messaging with AI features
   - Private personal assistants
   - Confidential data analysis
   - Censorship-resistant content platforms

2. **DeFi & Web3**
   - Smart contract auditing (pre-release security)
   - Market analysis (alpha protection)
   - Community moderation (uncensorable)
   - Decentralised social media AI features

3. **Research & Education**
   - Controversial research (no censorship)
   - Academic paper analysis
   - Educational tutoring
   - Language learning

## Investment Highlights

### Why Platformless AI?

1. **First-Mover Advantage in Trustless AI**
   - First production-ready platformless AI infrastructure
   - First decentralised infrastructure supporting agentic AI tool use (Claude Code verified)
   - First DePIN project to implement Google's A2A protocol for multi-agent orchestration (experimental, v1.0.0-rc)
   - MVP complete with real nodes, real proofs, real encryption
   - Working implementation, not vaporware
   - Technical moat (cryptographic verification, multi-chain, encryption, agentic bridge, A2A protocol, x402 payments)

2. **Network Effects**
   - More hosts → better availability, lower prices
   - More users → higher revenue for hosts, attracts more hosts
   - More models → greater user value, attracts more users
   - Virtuous growth cycle with strong lock-in

3. **Regulatory Tailwinds**
   - EU AI Act, US AI executive orders increasing compliance burden
   - GDPR enforcement intensifying (€1B+ fines)
   - Data sovereignty requirements growing
   - Platformless AI positioned as compliance-by-design solution

4. **Defensible Moat**
   - Cryptographic verification technology (STARK proofs)
   - End-to-end encryption architecture (forward secrecy)
   - Network effects (first mover in platformless AI)
   - A2A protocol integration (inter-agent network effects compound with adoption)
   - Enhanced S5.js integration (Sia Foundation grant funded)
   - Developer ecosystem and SDK adoption

5. **Scalable Business Model**
   - Near-zero marginal cost (automated operations)
   - Global market reach (no geographic restrictions)
   - Multiple revenue streams (fees, enterprise, curation)
   - Sustainable economics (10% treasury fee sufficient)

6. **Aligned Incentives**
   - Hosts earn 90% (incentivised to provide quality service)
   - Users pay fair market rates (competitive pricing)
   - Protocol captures sustainable 10% fee
   - Community governance (token holder alignment)

## Technical Specifications

### Smart Contract Architecture

**Core Contracts**:

- **JobMarketplace**: Job creation, assignment, payment escrow, settlement
- **NodeRegistry**: Host registration, staking (1000 FAB min), slashing, model listings
- **ProofSystem**: STARK proof hash + CID verification
- **HostEarnings**: Accumulated earnings tracking, withdrawal management
- **ModelRegistry**: Model approvals, governance, quality control

**Slashing Parameters** (NodeRegistry):

- Maximum slash: 50% of stake per action
- Cooldown: 24 hours between slashes on same host
- Evidence required: CID pointing to proof of misbehavior
- Auto-unregister: Host removed if stake falls below 100 FAB

**Contract Addresses**:
See `.env.test` for current deployed addresses on Base Sepolia and opBNB Testnet. Addresses are updated with each contract deployment and should never be hardcoded.

### SDK Architecture

**Core SDK capabilities** (modular — each is a self-contained part of the SDK):

1. **Authentication** — wallet sign-in, decentralised storage-identity derivation
2. **Payments** — deposits, withdrawals, multi-chain, multi-token
3. **Sessions** — encrypted WebSocket conversations with streaming
4. **Host discovery** — finding hosts, pricing, earnings, host public keys
5. **Storage** — encrypted conversation storage (S5), user settings
6. **Models** — model registry, governance, approvals
7. **Treasury** — protocol fee management, governance funds
8. **Client tools** — reputation and usage tracking
9. **Encryption** — end-to-end encryption, key exchange, forward secrecy
10. **Vector search (RAG)** — host-side vector database operations
11. **Documents** — chunking, embedding, upload
12. **Session groups** — Claude Projects-style organisation
13. **Permissions** — access control for groups and databases
14. **Transcoding** — GPU video/audio transcoding (HLS segments, GOP-level proofs, host selection)
15. **Video generation (LTX)** — validated jobs against authenticated allow-list bundles, encrypted input stills, per-clip escrowed sessions, staged progress, capability-CID delivery, provenance verification

### Encryption Specifications

- **Algorithm**: XChaCha20-Poly1305 AEAD (Authenticated Encryption with Associated Data)
- **Key Exchange**: Ephemeral-static ECDH on secp256k1
- **Signatures**: ECDSA secp256k1 (same as Ethereum)
- **Key Derivation**: HKDF-SHA256
- **Session Keys**: Random 32 bytes, ephemeral (forward secrecy)
- **Libraries**: @noble/secp256k1, @noble/ciphers (audited, production-grade)

### Proof Specifications

- **Proof System**: Risc0 zkVM STARK proofs
- **Proof Size**: ~221KB per checkpoint (1,000 tokens)
- **Storage**: S5 decentralised network (Sia)
- **On-Chain Data**: 32-byte hash + CID (~300 bytes total)
- **Size Reduction**: 737x (221KB → 300 bytes)
- **Generation Time**: 0.2-2.3s (GPU-accelerated with CUDA)
- **Verification**: Anyone can retrieve from S5 and verify hash

## Risk Mitigation

### Technical Risks

- **Risk**: Smart contract vulnerabilities
- **Mitigation**: Security audits, gradual rollout, bug bounty programme, immutable core logic

### Regulatory Risks

- **Risk**: AI regulation, data privacy laws
- **Mitigation**: Compliance-by-design (ISO 27001, ISO 42001, SOC 2), decentralised architecture, legal counsel

### Competition Risks

- **Risk**: Centralised platforms improve privacy, other decentralised projects
- **Mitigation**: First mover advantage, network effects, continuous innovation, technical moat

### Adoption Risks

- **Risk**: Crypto wallet barrier, complexity
- **Mitigation**: Developer-friendly SDK, comprehensive docs, enterprise onboarding support, fiat on-ramps (future)

### Market Risks

- **Risk**: AI market consolidation, regulatory crackdown
- **Mitigation**: Multi-chain support, geographic diversity, compliance readiness, open-source ethos

## Team & Governance

### Core Development

- Experienced blockchain developers (Ethereum, smart contracts)
- AI/ML expertise (GGUF models, inference optimisation)
- Distributed systems engineers (P2P, libp2p, WebSocket)
- Cryptography specialists (STARK proofs, encryption)
- Open-source contributors (Sia Foundation grant recipient)

### Grants & Funding

- **Sia Foundation Grant**: Enhanced S5.js development (completed)
- **Base Ecosystem Support**: Contract deployment, developer relations
- Seeking: Seed round for team expansion, security audits, marketing

### Community Governance

- Progressive decentralisation roadmap
- FAB token holder voting (model approvals, protocol upgrades)
- Grant programmes for ecosystem development
- Transparent treasury management

## Call to Action

### For Investors

- **Opportunity**: Ground floor in platformless AI infrastructure (new category)
- **Stage**: Infrastructure complete, deploying to production Q1 2026
- **Contact**: investors@fabstir.com
- **Ask**: Seed round to scale team, audits, enterprise sales

### For Enterprise & SaaS Customers

- **Beta Programme**: Limited spots for Q1 2026 enterprise beta
- **SaaS Integration**: Drop-in Anthropic or OpenAI API replacement for AI-powered products
- **Agentic AI**: Run Claude Code, OpenCode, Cursor, Continue, and custom AI agents on private infrastructure
- **Benefits**: Early access, custom compliance support, dedicated integration help
- **Contact**: enterprise@fabstir.com or DM on LinkedIn
- **Industries**: Financial services, healthcare, legal, media & entertainment, SaaS

### For Developers

- **Get Started**: SDK available now (@fabstir/sdk-core)
- **Documentation**: https://docs.platformless.org (comprehensive API reference)
- **GitHub**: https://github.com/fabstir-llm-marketplace (open source)
- **Community**: Discord for real-time support

### For GPU Providers

- **Requirements**: RTX 3060+ (8GB VRAM), Docker, stable internet
- **Earnings**: 90% of inference payments, set your own pricing
- **Setup**: Interactive setup wizard via Host CLI (`fabstir-host setup`)
- **Tools**: TUI dashboard for monitoring, earnings, pricing updates
- **Documentation**: See `docs/HOST_OPERATOR_GUIDE.md`
- **Contact**: hosts@fabstir.com or join Discord #hosting

### For Partners

- **Integration**: White-label solutions, API partnerships
- **Opportunities**: Model providers, infrastructure partners, compliance consultants
- **Contact**: partnerships@fabstir.com

## Conclusion

Platformless AI represents a fundamental shift in AI infrastructure - from platform-centric to protocol-centric. By eliminating the centralised middleman through smart contracts, cryptographic proofs, and end-to-end encryption, we're building AI infrastructure that cannot censor, cannot spy, and cannot be shut down.

**We don't trust, we verify.** Every component of our stack is designed around this principle:

- **Sia's proof of storage** ensures your data persists without trusting any company
- **STARK proofs** mathematically verify computation happened correctly
- **Blake3 content addressing** guarantees content integrity and tamper-proof storage
- **XChaCha20-Poly1305 encryption with forward secrecy** protects all communication
- **Open source** means full transparency - every line auditable

Our infrastructure is complete and production-ready, currently undergoing security audit. The SDK (v1.28.2+) covers the whole flow — wallet sign-in, payments, encrypted sessions, storage, encryption, document search, video transcoding, and AI video generation — alongside a comprehensive Host CLI with TUI dashboard, marketplace pricing, evidence-based slashing for host accountability, and image generation with automatic intent detection. The newest capability, LTX 2.3 video generation, is live end-to-end in the product UI across all four modes — text-to-video, image-to-video, first-last-frame, and video restyle (IC-LoRA union control) — through 1440p (4K staged), 5–15 seconds at 24–50 fps, paid per clip in USDC, settled on-chain with the host earning 90% — verified to the exact unit on real sessions — and carrying provenance the user's own browser checks and the chain anchors. The same paid, provenance-bound generation now runs inside a native Blender 5.x extension, placing all four generation modes directly in a filmmaker's HDR- and EXR-native Video Sequence Editor timeline. The Claude Bridge and OpenAI Bridge extend this to agentic AI — Claude Code and OpenCode running autonomously on decentralised hosts, creating applications, executing tools, generating images, and managing files with full end-to-end encryption. The `@fabstir/orchestrator` package adds experimental multi-agent coordination via Google's A2A protocol (v1.0.0-rc) — the first DePIN project to implement this emerging standard — with DAG-based task decomposition, intelligent model routing, SSE streaming, and x402 USDC micropayments for inter-agent delegation. A2A is still maturing as a standard, and we're early implementers; the core orchestration works (351 tests passing), but full interoperability testing with third-party agents is ongoing. Companies are already approaching us to use this as SaaS AI backend infrastructure. With cryptographic security, compliance-by-design architecture, and sustainable economics, Platformless AI is positioned to capture significant enterprise, SaaS, and developer adoption as AI regulation tightens and privacy concerns intensify.

The convergence of blockchain technology, zero-knowledge cryptography, and decentralised storage creates a unique opportunity to build AI infrastructure that respects user sovereignty, protects intellectual property, and enables permissionless innovation. Users are sovereign - in complete control of their data, able to decide what AI and AI agents can access, and share securely with others on their own terms.

With first-mover advantage in the platformless AI category, we're poised to become foundational infrastructure for the next generation of AI applications. This is ground-breaking infrastructure for the ages.

---

## Key Metrics

| Metric               | Current (Q4 2025) | Target Q2 2026 | Target Q4 2026 |
| -------------------- | ----------------- | -------------- | -------------- |
| Active Hosts         | 5-10              | 50+            | 100+           |
| Available Models     | 5                 | 20+            | 50+            |
| Monthly Sessions     | 100+              | 1,000+         | 10,000+        |
| Enterprise Customers | 0                 | 3-5 pilots     | 10-20 paying   |
| Total Value Locked   | $5,000            | $100,000       | $1,000,000     |
| SDK Version          | v1.28.2+          | v2.0+          | v2.5+          |
| Avg Response Time    | <2s               | <1.5s          | <1s            |
| Encryption Default   | 100%              | 100%           | 100%           |

## Contact Information

- **Website**: https://platformlessai.org
- **Documentation**: https://docs.platformlessai.org (coming soon)
- **GitHub**: https://github.com/fabstir-llm-marketplace
- **Discord**: https://discord.gg/fabstir
- **Twitter**: @PlatformlessAI (coming soon)
- **LinkedIn**: Search "Platformless AI"
- **Email**:
  - General: info@fabstir.com
  - Investors: investors@fabstir.com
  - Enterprise: enterprise@fabstir.com
  - Support: support@fabstir.com

---

_"We Don't Trust, We Verify - AI Infrastructure for the Ages"_

**Trustless by Design** | **Sia Proof of Storage** | **STARK Proof of Computation** | **Blake3 Content Integrity** | **XChaCha20 Encryption** | **Open Source**

**Built by Fabstir | Powered by Sia Storage | Secured by STARK Proofs**

**© 2025-2026 Platformless AI. Ground-breaking Infrastructure for the Ages.**

---

_Last Updated: July 2026_
