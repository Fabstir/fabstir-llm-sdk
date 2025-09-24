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

#### **PaymentManager** (`/managers/PaymentManager.ts`)
- USDC and ETH payment processing
- Approval and deposit handling
- Balance checking and validation
- Session job creation with payments
- Key Features:
  - Multi-token support (USDC, ETH)
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

### 3. Contract Integration

The SDK interacts with smart contracts deployed on Base Sepolia (and future chains):

```typescript
// Contract addresses from .env.test
{
  jobMarketplace: "0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944",
  nodeRegistry: "0x2AA37Bb6E9f0a5d0F3b2836f3a5F656755906218",
  proofSystem: "0x2ACcc60893872A499700908889B38C5420CBcFD1",
  hostEarnings: "0x908962e8c6CE72610021586f85ebDE09aAc97776",
  modelRegistry: "0x92b2De840bB2171203011A6dBA928d855cA8183E",
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62"
}
```

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
   ├─ Create session job (PaymentManager)
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

## Key Design Principles

1. **Browser-First**: Core SDK works in browsers without Node.js dependencies
2. **Manager Pattern**: Clean separation of concerns with dedicated managers
3. **Gasless UX**: Session ending doesn't require user gas payments
4. **Event-Driven**: Extensive use of events for async operations
5. **Streaming-First**: Real-time token streaming over WebSocket
6. **Decentralized Storage**: S5 for persistence without central servers

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

- Private keys never leave the client
- S5 seed phrases derived from wallet signatures
- Contract interactions validated before submission
- Model governance ensures only approved models
- Host verification through on-chain registry

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

- **v1.0.10** - Current version with gasless session ending
- **v1.0.0** - Initial refactored architecture
- **v0.x** - Legacy monolithic SDK (deprecated)