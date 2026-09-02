# Fabstir LLM SDK Architecture

## Overview

The Fabstir LLM SDK is a modular TypeScript/JavaScript SDK that enables applications to interact with the Fabstir P2P LLM marketplace. The SDK has been refactored into a browser-compatible core package with a manager-based architecture for clean separation of concerns.

## Package Structure

```
/workspace/
├── packages/
│   ├── sdk-core/        # Browser-compatible core SDK
│   ├── sdk-node/        # Node.js specific features (P2P, libp2p)
│   ├── sdk-client/      # Client utilities
│   ├── host-cli/        # CLI for host providers
│   ├── orchestrator/    # Multi-agent orchestration with A2A and x402
│   └── s5js/            # Enhanced S5 storage (symlinked)
├── apps/
│   └── harness/         # Test harness Next.js application
├── tests/               # Formal test suite
├── scripts/             # Development and debugging scripts
└── docs/                # Documentation
```

## Core Architecture

### 1. SDK Core (`@fabstir/sdk-core`)

The main browser-compatible SDK package with a manager-based architecture.

#### Entry Point
```typescript
// packages/sdk-core/src/index.ts
export { FabstirSDKCore } from './FabstirSDKCore';
```

#### Core Components

**FabstirSDKCore** - Main SDK class that orchestrates all managers
- Handles authentication (private key, signer, or wallet provider)
- Manages contract initialization
- Provides access to all manager instances
- Supports multiple authentication methods

### 2. Manager Architecture

The SDK uses a manager pattern where each manager handles a specific domain:

#### **AuthManager** (`/managers/AuthManager.ts`)
- Wallet authentication and connection
- S5 seed phrase generation from wallet signature
- Support for multiple wallet types (EOA, Smart Wallets)
- Key Features:
  - Deterministic seed generation
  - Secure signature-based authentication
  - Multi-wallet support

#### **PaymentManagerMultiChain** (`/managers/PaymentManagerMultiChain.ts`)
- USDC and ETH payment processing across multiple chains
- Approval and deposit handling
- Balance checking and validation
- Session job creation with payments
- Key Features:
  - Multi-chain, multi-token support (USDC, ETH, BNB)
  - Gas-efficient approval patterns
  - Payment validation and error handling

#### **SessionManager** (`/managers/SessionManager.ts`)
- Session lifecycle management
- WebSocket connection to host nodes
- Streaming response handling
- Context preservation across prompts
- Key Features:
  - Gasless session ending (host pays gas)
  - Automatic checkpoint handling
  - Session recovery from S5 storage
  - Real-time streaming support

#### **StorageManager** (`/managers/StorageManager.ts`)
- S5 decentralized storage integration
- Conversation persistence
- Session metadata storage
- File upload/download capabilities
- Key Features:
  - Encrypted storage with S5
  - Conversation history management
  - Metadata persistence
  - CID-based content addressing

#### **ClientManager** (`/managers/ClientManager.ts`)
- Host discovery and selection
- Job submission and negotiation
- Cost estimation
- Model availability checking
- Key Features:
  - Dynamic host discovery
  - Best host selection algorithms
  - Job lifecycle management

#### **HostManager** (`/managers/HostManager.ts`)
- Host registration, staking, and management
- Model listing, capabilities, and per-model/token pricing
- Host discovery (`findHostsForModel`, `getActiveHosts`) and metadata management
- Key Features:
  - JSON metadata support
  - Model validation
  - Multi-model registration
  - Dual read/write contract instances (1.38.1+): every discovery read rides the
    dedicated `rpcUrl` provider, only transactions touch the signer — reads are never
    rate-limited or observed by the injected wallet (`getReadProviderSource()` reports
    where reads are going)

#### **ModelManager** (`/managers/ModelManager.ts`)
- Model governance and validation
- Approved model registry
- Model hash verification
- Tier management (Standard, Premium, Enterprise)
- Key Features:
  - On-chain model registry
  - SHA-256 hash validation
  - Model approval workflows

#### **TreasuryManager** (`/managers/TreasuryManager.ts`)
- Treasury operations and analytics
- Fee collection tracking
- Revenue distribution
- Protocol metrics
- Key Features:
  - Treasury balance monitoring
  - Fee percentage management (10% treasury, 90% host)
  - Withdrawal capabilities

#### **EncryptionManager** (`/managers/EncryptionManager.ts`)
- End-to-end encryption for all sessions (enabled by default)
- Key exchange, session key management
- Forward secrecy via ephemeral keys
- Key Features:
  - XChaCha20-Poly1305 AEAD encryption
  - ECDH key exchange on secp256k1
  - ECDSA sender authentication
  - Replay protection via per-session message indexing

#### **TranscodeManager** (`/managers/TranscodeManager.ts`)
- GPU-accelerated video transcoding with load balancing across hosts
- Capacity-aware host selection and automatic failover
- Key Features:
  - Load-balanced transcode submission (`submitTranscodeWithLoadBalancing`)
  - Host capacity checking via sidecar endpoint
  - Pending job tracking for accurate capacity estimation
  - Supports Phase 1 (whole-file) and Phase 2 (HLS segmented) output

#### Transcode Utilities (`/utils/transcode-utils.ts`, `/utils/transcode-ws.ts`)
- Format builders: `buildStreamingFormats()` (Phase 1), `buildHlsFormats()` (Phase 2 HLS)
- HLS playlist generation: `buildMasterPlaylist()`, `buildVariantPlaylist()` (M3U8 v7, fMP4)
- Metadata assembly: `assembleContentMetadata()`, `assembleHlsContentMetadata()`
- Model ID computation: `computeTranscodeModelId()` (canonical JSON → keccak256)
- WebSocket transcode submission with encrypted message envelope
- Type guard: `isHlsOutput()` discriminates HLS from standard outputs

#### **LtxManager** (`/managers/LtxManager.ts`)
- AI video generation (LTX 2.3): text-to-video, image-to-video, first-last-frame — the third
  non-LLM sidecar on the same encrypted WS + paid-session rail as transcoding
- One session per clip with an exact USDC escrow (`max(floor, cost)`); the per-clip socket closes on
  completion and the session self-settles on-chain (host paid per megapixel-frame token, 90/10 split)
- Pre-escrow validation against the host's **versioned allow-list bundle** (S5-published, hash-
  authenticated): templates, frame/fps/resolution bounds, image counts, u64 seed range — a bad job
  never locks funds
- Encrypted input images: `uploadImages()` → S5 capability CIDs (order-significant, bound into the
  provenance commitment)
- **Provenance verification** (`verifyAttestation`): recomputes the input commitment (prompt, seed,
  params, image hashes) against the host's attestation; checks `sha256(attestation bytes)` against
  the on-chain proof anchor (`getProofSubmission`); Merkle root over frame hashes
- Key Features: `estimateCost` (exact at every resolution), `generate` (validate → escrow → stream
  progress → surface), `downloadFrames` (capability-CID decrypt), `triggerSessionTimeout` (reclaim)

#### LTX Utilities (`/utils/ltx-utils.ts`, `/utils/ltx-ws.ts`)
- Conformance primitives, fixture-verified byte-exact against node-generated vectors: input
  commitment (7-field abi.encode; v2 adds `bytes32[]` image hashes for image templates), output
  commitment, Merkle root, EIP-191 attestation digest + signer recovery, `sha256` proof hash,
  canonical bundle hash (recursive key-sort → compact JSON → keccak256)
- WebSocket submission (`submitLtxWs`): `ltx_generate` dispatch, staged progress, typed `LtxError`
  mapping, client-side cancel

#### **TrainingManager** (`/managers/TrainingManager.ts`)
- LoRA/QLoRA fine-tuning (Training M0) — mirrors LtxManager over the same encrypted WS +
  paid-session rail; proven end-to-end August 2026 (an adapter answering facts that exist
  only in its training set, beside a base model that correctly calls them unknown)
- Pre-deposit validation against the host's published bounds bundle (templates, ranks,
  alphas, seqLens) — a bad job never locks funds
- `count-v1` client-side token counting with the template's **pinned tokenizer**
  (`@huggingface/tokenizers`), verified exact three ways: browser == offline == node
- Dataset sharded, encrypted, and uploaded to S5; input commitment recomputed against the
  host's attestation to prove it trained *your* job on *your* dataset
- Finished adapter served back on an ordinary encrypted chat session (`lora` field in the
  session init; staging is post-ack with a dedicated error listener)
- Key Features: `estimateTrainingCost` (exact before any deposit), bounds validation,
  slice-by-slice settlement design (paid phase staged next)
- Card / vault path (1.38.6): `existingSession` adopts a service-minted session with no wallet
  touch, after an A.3 pre-flight that reads the on-chain session drift-proof (raw words against
  the 18-slot layout, fails closed) and refuses locally before the one `train` the session can
  carry; every post-adoption failure carries `{ sessionId, jobId }` for reclaim

#### Training Utilities (`/utils/training-*.ts`)
- `training-count.ts` — count-v1 declaredTokens (fixture-verified 173/173 against node vectors)
- `training-shard.ts` — dataset sharding + encryption for S5 upload
- `training-serve-back.ts` — adapter serve-back session wiring
- `training-ws.ts` / `training-utils.ts` — WS submission and shared helpers

#### **VectorRAGManager** (`/managers/VectorRAGManager.ts`)
- Host-side vector database operations via WebSocket
- Simplified wrapper delegating to SessionManager
- Key Features:
  - Upload vectors to host session memory
  - Search vectors with cosine similarity
  - No client-side vector storage needed

#### **DocumentManager** (`/documents/DocumentManager.ts`)
- Document chunking and embedding generation
- Text extraction from uploaded files
- Key Features:
  - 500-token chunks with 50-token overlap
  - Embedding via host's `/v1/embed` endpoint
  - No native bindings required

#### **SessionGroupManager** (`/managers/SessionGroupManager.ts`)
- Claude Projects-style session organization
- Group sessions by topic or project
- Key Features:
  - Create, list, and manage session groups
  - Access control via PermissionManager

#### **PermissionManager** (`/managers/PermissionManager.ts`)
- Access control for groups and vector databases
- Key Features:
  - Permission grants and revocations
  - Group-level access management

### 2b. Orchestrator Package (`@fabstir/orchestrator`)

Multi-agent orchestration layer that coordinates multiple SDK sessions for complex tasks.

#### **OrchestratorManager** (`/core/OrchestratorManager.ts`)
- Top-level coordinator for multi-agent workflows
- Manages: SessionPool, ModelRouter, TaskQueue, ProofCollector
- LLM-driven task decomposition via planning session
- Result synthesis from parallel subtask execution

#### **SessionPool** (`/core/SessionPool.ts`)
- Semaphore-based concurrency control for parallel sessions
- Per-model session caching (session multiplexing) to reduce deposits
- Transaction mutex for safe blockchain nonce ordering
- Budget enforcement: per-task and total deposit limits

#### **SessionAdapter** (`/core/SessionAdapter.ts`)
- Clean abstraction wrapping FabstirSDKCore for session lifecycle
- Methods: createSession(), sendPrompt(), endSession()
- End-to-end encryption by default

#### **ModelRouter** (`/core/ModelRouter.ts`)
- Intelligent task-to-model assignment based on complexity
- Routes: tool-calling/synthesis → deep model, small analysis → fast model

#### **TaskPlanner** (`/core/TaskPlanner.ts`)
- LLM-driven goal decomposition into dependency DAG
- JSON-based task graph with blockedBy dependencies

#### **Orchestration Patterns**
- **FanOut** — Execute N independent tasks in parallel
- **Pipeline** — Sequential execution, each task receives prior result
- **MapReduce** — Parallel map phase + single reduce synthesis

#### **A2A Protocol** (Agent-to-Agent)
- **OrchestratorA2AServer** — Express HTTP server exposing orchestrator as discoverable agent
- **A2AClientPool** — Discover and delegate to external agents
- **AgentDiscovery** — Skill-based agent registry and lookup
- **SSEEventBus** — Server-Sent Events for progress streaming

#### **x402 Payment Protocol**
- HTTP-native USDC micropayments between agents (EIP-3009)
- **X402PaymentGate** — Express middleware validating X-PAYMENT headers
- **X402PaymentValidator** — On-chain settlement via transferWithAuthorization
- **X402PaymentHandler** — Client-side EIP-712 signed payment headers
- **X402BudgetTracker** — Outbound spending limits enforcement
- **X402SessionManager** — One-time payment → reusable session tokens

### 3. Contract Integration

The SDK interacts with smart contracts deployed on Base Sepolia (and future chains):

```bash
# Contract addresses - always read from .env.test (source of truth)
# Never hardcode addresses in source code or documentation
cat .env.test | grep CONTRACT_
```

**Read/write provider split (1.38.1+):** every contract *read* (host discovery, model
enumeration, pricing) goes through a dedicated provider built from `rpcUrl`; only transactions
ride the wallet signer. Read volume never hits the injected wallet (which rate-limits dapps),
a user-configured RPC endpoint is honored, and read/write chain parity is asserted at
initialization, on the wallet's `chainChanged`, and across `switchChain()`
(`READ_WRITE_CHAIN_MISMATCH` on divergence).

**Required contracts** (7 total):
- `CONTRACT_JOB_MARKETPLACE` - Job creation, assignment, payment escrow
- `CONTRACT_NODE_REGISTRY` - Host registration, staking, model listings
- `CONTRACT_PROOF_SYSTEM` - STARK proof verification
- `CONTRACT_HOST_EARNINGS` - Earnings tracking, withdrawals
- `CONTRACT_MODEL_REGISTRY` - Model approvals, governance
- `CONTRACT_USDC_TOKEN` - USDC stablecoin
- `CONTRACT_FAB_TOKEN` - Platform governance token

### 4. WebSocket Architecture

Direct WebSocket connections to host nodes for real-time inference and transcoding:

```
User → SDK → WebSocket → Host Node (fabstir-llm-node)
                ↓                        ↓
        Streaming Responses     Transcoder Sidecar (ffmpeg + NVENC)
```

All WebSocket messages use E2E encryption (ECDH + XChaCha20-Poly1305). The same connection carries LLM inference, vector operations, image generation, video transcoding, LTX video generation, and LoRA fine-tuning. For transcoding and video generation, the host node proxies requests to GPU sidecars via localhost (ffmpeg/NVENC for transcode; a headless ComfyUI running pinned LTX 2.3 templates for generation — clients send typed parameters only, never graphs).

**Session crypto is per-session and per-connection (1.38.2–1.38.4).** The node registers one
key per session; the SDK holds a matching per-session map — frames are decrypted with the key
of the session stamped on them, outgoing prompts are encrypted (and replay-protected) under the
key of the session the call was made for, init acks are correlated by `session_id`, and
concurrent handshakes are serialized. `WebSocketClient` counts connection generations: a silent
reconnect invalidates the session key (the new connection has no node-side session), fails
in-flight encrypted requests immediately with `SESSION_KEY_INVALIDATED` (retryable), and
discards frames queued for the dead connection rather than replaying them. Key attribution is
observable end to end as `[SDK:wire]` log lines carrying short key fingerprints.

**Key Innovation**: Gasless session ending
- User closes WebSocket connection
- Host node automatically calls `completeSessionJob()`
- Host pays gas to receive payment
- User gets refund without gas fees

### 5. Storage Architecture (S5 Integration)

Enhanced S5.js integration for decentralized storage:

```typescript
// Symlinked at node_modules/@s5-dev/s5js → /workspace/packages/s5js
import { S5 } from '@s5-dev/s5js';
```

Features:
- Conversation persistence
- Session metadata storage
- Deterministic seed phrases from wallet signatures
- CID-based content addressing

### 6. Authentication Flow

```
1. User provides credentials
   ├─ Private Key
   ├─ Ethers Signer
   └─ Wallet Provider (future)

2. SDK authenticates
   ├─ Creates wallet instance
   ├─ Generates S5 seed phrase
   └─ Initializes managers

3. Managers become available
   └─ All operations now authorized
```

### 7. Session Flow

```
1. Start Session
   ├─ Discover hosts (ClientManager)
   ├─ Create session job (PaymentManagerMultiChain)
   └─ Connect WebSocket (SessionManager)

2. Send Prompts
   ├─ Stream over WebSocket
   ├─ Receive token streaming
   └─ Store in S5 (StorageManager)

3. End Session (GASLESS!)
   ├─ Close WebSocket only
   ├─ Host submits completion
   └─ Automatic settlement
```

### 8. Orchestration Flow

```
1. Plan
   ├─ OrchestratorManager acquires planning session
   ├─ TaskPlanner.decompose() breaks goal into TaskGraph
   └─ ModelRouter assigns model per task

2. Execute
   ├─ TaskQueue tracks dependency DAG
   ├─ SessionPool provides concurrent sessions (with multiplexing)
   ├─ Patterns (FanOut/Pipeline/MapReduce) coordinate execution
   └─ A2AClientPool delegates to external agents if needed

3. Synthesize
   ├─ TaskPlanner.synthesise() combines all results
   ├─ ProofCollector accumulates proof CIDs
   └─ SessionPool.destroy() cleans up all sessions
```

## Data Flow

### Request Flow
```
UI → SDK Core → Manager → Contract/WebSocket → Host Node
```

### Response Flow
```
Host Node → WebSocket → SessionManager → Event Emitter → UI
```

### Storage Flow
```
SessionManager → StorageManager → S5 Network → CID
```

## RAG Architecture (Host-Side)

**IMPORTANT**: As of v8.3.0+, RAG implementation is **100% host-side**. Vectors are stored in session memory on the host node (Rust), not client-side.

### Architecture Flow

```
Browser (Client)                      Production Node (Host)
     ↓                                      ↓
1. Document Upload                    [No document storage]
     ↓
2. Extract Text (client-side)
     ↓
3. Chunk Documents (client-side)
     ↓
4. Generate Embeddings ——→ POST /v1/embed ——→ all-MiniLM-L6-v2 model (ONNX)
     ↓                                      ↓
5. Receive Embeddings ←—— Response ←————————— Embedding vectors (384-d)
     ↓
6. Send Vectors ——————→ uploadVectors msg ——→ Store in session memory (Rust)
     ↓                                      ↓
7. Receive Confirmation ←— uploadVectorsResponse ← Vectors stored (up to 100K)
     ↓
8. [User sends prompt]
     ↓
9. Generate Query Embedding ——→ POST /v1/embed
     ↓
10. Search Request ————→ searchVectors msg ——→ Cosine similarity search (Rust)
     ↓                                      ↓
11. Receive Results ←—— searchVectorsResponse ← Top K results with scores
     ↓
12. Inject Context (client-side)
     ↓
13. Send Enhanced Prompt ——→ WebSocket ————→ LLM Inference
     ↓                                      ↓
14. Receive Response ←——— Streaming ←————————— Generated text
```

### Division of Responsibilities

**Client SDK Does**:
- ✅ Document upload and text extraction
- ✅ Text chunking (500 tokens, 50 overlap)
- ✅ Embedding generation (POST /v1/embed)
- ✅ Send vectors to host via WebSocket (uploadVectors message)
- ✅ Request search via WebSocket (searchVectors message)
- ✅ Context injection into prompts
- ❌ **Does NOT** manage vector database (no native bindings)

**Host Node Does**:
- ✅ `/v1/embed` - Generate embeddings (all-MiniLM-L6-v2, 384-d)
- ✅ `uploadVectors` WebSocket handler - Store vectors in session memory
- ✅ `searchVectors` WebSocket handler - Perform cosine similarity search
- ✅ Auto-cleanup on WebSocket disconnect (privacy)
- ✅ Session isolation (vectors only visible to session owner)
- ❌ **Does NOT** persist vectors to disk (temporary session storage only)

### Key Components

1. **SessionManager** (packages/sdk-core/src/managers/SessionManager.ts)
   - `uploadVectors()` - Send vectors to host via WebSocket
   - `searchVectors()` - Search vectors on host via WebSocket
   - `askWithContext()` - Helper for embedding + search + context injection

2. **DocumentManager** (packages/sdk-core/src/documents/DocumentManager.ts)
   - `processDocument()` - Extract → chunk → embed (returns ChunkResult[])
   - No vector storage (simplified from v8.2.x)

3. **HostAdapter** (packages/sdk-core/src/embeddings/HostAdapter.ts)
   - Zero-cost embeddings via POST /v1/embed
   - 384-dimensional vectors (all-MiniLM-L6-v2)

4. **VectorRAGManager** (packages/sdk-core/src/managers/VectorRAGManager.ts)
   - Simplified wrapper that delegates to SessionManager
   - No S5 persistence, no session creation

### Production Configuration

**Threshold**: 0.2 (production-tested with all-MiniLM-L6-v2)
- Similarity score ranges: 0.35-0.50 (highly relevant), 0.20-0.35 (relevant), 0.00-0.20 (noise)
- Previous default of 0.7 returns 0 results with all-MiniLM-L6-v2

**Environment Variables**: Always use `NEXT_PUBLIC_TEST_HOST_1_URL` instead of hardcoded URLs
- Docker port remapping: 8083 inside container → 8080 on host

**Text Extraction**: Use fallback chain for search results
```typescript
const text = result.text || result.content || result.metadata?.text || result.chunk || 'No text found';
```

### Benefits of Host-Side RAG

| Feature | Client-Side (Old) | Host-Side (New) |
|---------|------------------|-----------------|
| Native Bindings | Required (@fabstir/vector-db-native) | Not needed ✅ |
| Webpack Issues | Severe (stub/external workarounds) | None ✅ |
| Vector Search Speed | ~300ms (WASM) | ~100ms (Rust) ✅ |
| Memory Usage | High (all vectors in browser) | Low (vectors on host) ✅ |
| Privacy | Persists to S5 (permanent) | Auto-deleted on disconnect ✅ |
| Scalability | Limited (browser memory) | Better (host memory, up to 100K vectors) ✅ |
| Implementation | Complex (vector DB management) | Simple (WebSocket calls) ✅ |

### Test Coverage

- **84 tests passing** on node side (47 storage + 29 handlers + 8 e2e)
- **102/114 tests passing** on SDK side (89%)
- **Production verified**: Session 110, Jan 2025

For detailed implementation status, see [docs/IMPLEMENTATION_CHAT_RAG.md](IMPLEMENTATION_CHAT_RAG.md).

---

## Key Design Principles

1. **Browser-First**: Core SDK works in browsers without Node.js dependencies
2. **Manager Pattern**: Clean separation of concerns with dedicated managers
3. **Gasless UX**: Session ending doesn't require user gas payments
4. **Event-Driven**: Extensive use of events for async operations
5. **Streaming-First**: Real-time token streaming over WebSocket
6. **Decentralized Storage**: S5 for persistence without central servers
7. **Host-Side RAG**: Vector storage and search on host nodes for performance and privacy
8. **Session Multiplexing**: Reuse blockchain sessions per model to minimize deposit burden
9. **A2A Interoperability**: Agents discover and delegate to each other via standard protocol
10. **x402 Payments**: HTTP-native micropayments eliminate pre-funding requirements

## Testing Architecture

```
/workspace/tests/
├── integration/         # End-to-end integration tests
├── unit/               # Unit tests for components
├── managers/           # Manager-specific tests
└── contracts/          # Smart contract interaction tests
```

Test Stack:
- Vitest for test runner
- Real contract interactions (no mocks)
- Polyfills for browser APIs in Node.js

## Future Architecture (Multi-Chain/Multi-Wallet)

See `/workspace/docs/IMPLEMENTATION-MULTI.md` for planned architecture supporting:
- Multiple blockchains (Base, opBNB, etc.)
- Multiple wallet types (EOA, Smart Wallets)
- Wallet abstraction layer
- Chain-agnostic operations

## Environment Configuration

Required environment variables:
```bash
# RPC and Chain
RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY

# All 7 contracts required (no fallbacks)
CONTRACT_JOB_MARKETPLACE=0x...
CONTRACT_NODE_REGISTRY=0x...
CONTRACT_PROOF_SYSTEM=0x...
CONTRACT_HOST_EARNINGS=0x...
CONTRACT_MODEL_REGISTRY=0x...
CONTRACT_USDC_TOKEN=0x...
CONTRACT_FAB_TOKEN=0x...

# S5 Storage
S5_SEED_PHRASE="..." # Auto-generated if not provided
```

## Performance Considerations

- WebSocket connections are reused for efficiency
- S5 storage operations are async and non-blocking
- Contract calls are batched where possible
- Streaming responses enable real-time UX
- Manager instances are cached after initialization

## Security Architecture

- **End-to-end encryption by default** (XChaCha20-Poly1305 AEAD, Phase 6.2)
- **Forward secrecy** via ephemeral session keys (discarded after use)
- **Per-session keys bound to connection identity** — one key per session client-side to match
  the node, invalidated the moment the connection is replaced (1.38.2–1.38.4)
- **Sender authentication** via ECDSA signatures on every message
- **Reads off the wallet** — chain reads ride the configured RPC endpoint, so host and model
  discovery never leaks through the wallet provider (1.38.1+)
- Private keys never leave the client
- S5 seed phrases derived from wallet signatures
- Contract interactions validated before submission
- Model governance ensures only approved models
- Host verification through on-chain registry
- Evidence-based slashing for host misbehavior

## Error Handling

Typed error system, fail-fast (pre-MVP: no fallbacks):
- `SDKError` - Base class: `message`, `code` (e.g. `SESSION_KEY_INVALIDATED` with
  `retryable: true`, `READ_WRITE_CHAIN_MISMATCH`), optional `cause`
- Typed families under `/errors/`: `TrainingError` (wire codes frozen per the M0 interface),
  `LtxError`, transcode, model, pricing, chain, web-search, image-generation, and context
  errors — each mapping node wire codes to typed client errors

## Deployment Architecture

- **SDK**: Published to npm as `@fabstir/sdk-core`
- **Contracts**: Deployed on Base Sepolia
- **Host Nodes**: Run `fabstir-llm-node` instances
- **S5 Network**: Decentralized storage layer
- **Test Harness**: Next.js app at `localhost:3006`

## Dependencies

Core dependencies:
- `ethers` v6.x - Blockchain interactions
- `@huggingface/tokenizers` 0.1.3 - Pinned-tokenizer token counting for training (`count-v1`)
- `@s5-dev/s5js` - Decentralized storage
- `ws` - WebSocket client
- `events` - Event emitter
- `buffer` - Buffer polyfill for browsers

## Version History

- **v1.38.1–1.38.4** - Read/write provider split (reads ride `rpcUrl`, never the wallet);
  connection generations with session-key invalidation on reconnect; per-session crypto state
  (key map, ack/frame correlation by `session_id`, serialized handshakes, `[SDK:wire]`
  observability); frame stamp threaded from the caller
- **v1.38.0** - Training M0: TrainingManager wire surface, count-v1, serve-back — proven
  end-to-end August 2026
- **v1.36.0** - LTX generation against existing vault/card-paid sessions; explicit session
  targeting for `submitLtx`/`submitTranscode`
- **v1.18.0** - HLS adaptive bitrate streaming: `buildHlsFormats`, M3U8 playlist generation, per-segment encryption, `isHlsOutput` type guard
- **v1.17.x** - S5 concurrent write serialization, non-blocking endSession, session group persistence
- **v0.5.0** - Orchestrator package: multi-agent, A2A, x402 payments, session multiplexing
- **v1.8.6+** - 13 managers, multi-chain, encryption by default, RAG, marketplace pricing
- **v1.0.10** - Gasless session ending
- **v1.0.0** - Initial refactored architecture
- **v0.x** - Legacy monolithic SDK (deprecated)