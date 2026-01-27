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

#### **HostManagerEnhanced** (`/managers/HostManagerEnhanced.ts`)
- Enhanced host registration and management
- Model listing and capabilities
- Metadata management
- Host status tracking
- Key Features:
  - JSON metadata support
  - Model validation
  - Multi-model registration

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
  - Replay protection via message indexing

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

### 3. Contract Integration

The SDK interacts with smart contracts deployed on Base Sepolia (and future chains):

```bash
# Contract addresses - always read from .env.test (source of truth)
# Never hardcode addresses in source code or documentation
cat .env.test | grep CONTRACT_
```

**Required contracts** (7 total):
- `CONTRACT_JOB_MARKETPLACE` - Job creation, assignment, payment escrow
- `CONTRACT_NODE_REGISTRY` - Host registration, staking, model listings
- `CONTRACT_PROOF_SYSTEM` - STARK proof verification
- `CONTRACT_HOST_EARNINGS` - Earnings tracking, withdrawals
- `CONTRACT_MODEL_REGISTRY` - Model approvals, governance
- `CONTRACT_USDC_TOKEN` - USDC stablecoin
- `CONTRACT_FAB_TOKEN` - Platform governance token

### 4. WebSocket Architecture

Direct WebSocket connections to host nodes for real-time inference:

```
User → SDK → WebSocket → Host Node (fabstir-llm-node)
                ↓
        Streaming Responses
```

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
- **Sender authentication** via ECDSA signatures on every message
- Private keys never leave the client
- S5 seed phrases derived from wallet signatures
- Contract interactions validated before submission
- Model governance ensures only approved models
- Host verification through on-chain registry
- Evidence-based slashing for host misbehavior

## Error Handling

Hierarchical error system:
- `FabstirError` - Base error class
- `AuthenticationError` - Auth failures
- `PaymentError` - Payment issues
- `SessionError` - Session problems
- `StorageError` - S5 storage errors
- `ContractError` - Blockchain issues

## Deployment Architecture

- **SDK**: Published to npm as `@fabstir/sdk-core`
- **Contracts**: Deployed on Base Sepolia
- **Host Nodes**: Run `fabstir-llm-node` instances
- **S5 Network**: Decentralized storage layer
- **Test Harness**: Next.js app at `localhost:3000`

## Dependencies

Core dependencies:
- `ethers` v6.x - Blockchain interactions
- `@s5-dev/s5js` - Decentralized storage
- `ws` - WebSocket client
- `events` - Event emitter
- `buffer` - Buffer polyfill for browsers

## Version History

- **v1.8.6+** - Current version: 13 managers, multi-chain, encryption by default, RAG, marketplace pricing
- **v1.0.10** - Gasless session ending
- **v1.0.0** - Initial refactored architecture
- **v0.x** - Legacy monolithic SDK (deprecated)