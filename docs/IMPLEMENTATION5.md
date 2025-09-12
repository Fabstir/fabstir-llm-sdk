# Implementation Phase 5: SDK Browser Compatibility Refactor

## Overview

Refactor FabstirSDK into browser-compatible and server-only packages to enable direct usage in React components and web applications. This addresses the critical issue where UI developers cannot use the SDK due to Node.js dependencies.

## Goal

Create two packages:
1. **@fabstir/sdk-core** - Browser-compatible SDK for UI developers
2. **@fabstir/sdk-node** - Server-only extensions for P2P and heavy operations

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Browser Environment                 │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │         @fabstir/sdk-core               │    │
│  │                                          │    │
│  │  • Contract interactions (ethers.js)    │    │
│  │  • Wallet management                    │    │
│  │  • S5.js storage (browser-compatible)   │    │
│  │  • Session management                   │    │
│  │  • Payment flows                        │    │
│  │  • Host registration                    │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│              Server Environment                  │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │         @fabstir/sdk-node               │    │
│  │                                          │    │
│  │  • P2P networking (libp2p)              │    │
│  │  • EZKL proof generation                │    │
│  │  • Heavy cryptography                   │    │
│  │  • WebSocket server                     │    │
│  │  • Extends @fabstir/sdk-core            │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## Phase 1: Dependency Analysis and Separation

### Sub-phase 1.1: Identify Node.js Dependencies
**Goal**: Catalog all Node.js-specific imports and dependencies

#### Tasks:
- [x] Scan all imports in FabstirSDK.ts for Node.js modules
- [x] Scan all manager files for Node.js dependencies
- [x] Identify libp2p usage in P2PClient and related files
- [x] Document crypto module usage (node:crypto vs Web Crypto API)
- [x] Check buffer usage (node:buffer vs browser Buffer)
- [x] Identify assert usage and other Node.js built-ins
- [x] Create dependency map showing which components need which environment

### Sub-phase 1.2: Classify Components by Environment
**Goal**: Determine which components can be browser-compatible

#### Tasks:
- [x] Classify AuthManager (likely browser-compatible)
- [x] Classify PaymentManager (likely browser-compatible)
- [x] Classify StorageManager (S5.js is browser-compatible)
- [x] Classify SessionManager (likely browser-compatible)
- [x] Classify HostManager (likely browser-compatible)
- [x] Classify DiscoveryManager (P2P parts are server-only)
- [x] Classify InferenceManager (mixed - contracts browser, P2P server)
- [x] Classify SmartWalletManager (browser-compatible)
- [x] Classify TreasuryManager (browser-compatible)
- [x] Document classification results in architecture diagram

---

## Phase 2: Create Package Structure

### Sub-phase 2.1: Setup @fabstir/sdk-core Package
**Goal**: Create browser-compatible core package structure

#### Tasks:
- [x] Create packages/sdk-core directory
- [x] Setup package.json with browser-compatible settings
- [x] Configure TypeScript for browser target (tsconfig.json)
- [x] Setup build process for ESM and CommonJS
- [x] Configure webpack/rollup for browser bundling
- [x] Add browser field in package.json
- [x] Setup exports map for proper module resolution

### Sub-phase 2.2: Setup @fabstir/sdk-node Package
**Goal**: Create server-only package structure

#### Tasks:
- [x] Create packages/sdk-node directory
- [x] Setup package.json with @fabstir/sdk-core as dependency
- [x] Configure TypeScript for Node.js target
- [x] Setup build process for Node.js
- [x] Configure proper Node.js module resolution
- [x] Add engines field requiring Node.js version
- [x] Setup exports for server-only components

---

## Phase 3: Refactor Core Components

### Sub-phase 3.1: Extract Browser-Compatible Interfaces
**Goal**: Create clean interfaces that work in both environments

#### Tasks:
- [ ] Create IAuthManager interface
- [ ] Create IPaymentManager interface
- [ ] Create IStorageManager interface
- [ ] Create ISessionManager interface
- [ ] Create IHostManager interface
- [ ] Create ITreasuryManager interface
- [ ] Define shared types in sdk-core/types
- [ ] Ensure all interfaces use browser-compatible types

### Sub-phase 3.2: Refactor Contract Interactions
**Goal**: Ensure all contract code is browser-compatible

#### Tasks:
- [x] Move contract ABIs to sdk-core
- [x] Refactor contract initialization to use ethers.js v6 browser providers
- [x] Update all BigNumber usage to native BigInt
- [x] Remove any Node.js specific ethers imports
- [x] Test contract calls work with MetaMask provider
- [x] Ensure gas estimation works in browser
- [x] Verify transaction signing in browser context

### Sub-phase 3.3: Refactor Authentication
**Goal**: Make AuthManager fully browser-compatible

#### Tasks:
- [x] Replace node:crypto with Web Crypto API
- [x] Update private key handling for browser security
- [x] Ensure MetaMask integration works
- [x] Support WalletConnect in browser
- [x] Update S5 seed generation for browser
- [x] Remove any fs operations
- [x] Test with multiple wallet providers

### Sub-phase 3.4: Refactor Storage Manager
**Goal**: Ensure S5.js integration is browser-compatible

#### Tasks:
- [x] Verify S5.js browser compatibility
- [x] Remove any Node.js polyfills from S5 usage
- [x] Update IndexedDB usage for browser
- [x] Ensure proper async/await patterns
- [x] Test file upload/download in browser
- [x] Verify conversation persistence works
- [x] Remove any server-side S5 code

---

## Phase 4: Extract Server-Only Components

### Sub-phase 4.1: Move P2P Networking
**Goal**: Isolate P2P code in sdk-node package

#### Tasks:
- [x] Move P2PClient to sdk-node
- [x] Move libp2p dependencies to sdk-node
- [x] Create P2P service interface for sdk-core
- [x] Implement WebSocket client in sdk-core for P2P bridge
- [x] Move DHT operations to sdk-node
- [x] Move peer discovery to sdk-node
- [x] Create API bridge between core and node packages

### Sub-phase 4.2: Move EZKL Proof Generation
**Goal**: Isolate heavy cryptography in sdk-node

#### Tasks:
- [x] Move EZKL proof generation to sdk-node
- [x] Create proof verification interface for sdk-core
- [x] Move heavy crypto operations to sdk-node
- [x] Implement proof submission from browser
- [x] Create API for proof status checking
- [x] Ensure proof validation works in browser
- [x] Setup proof caching mechanism

### Sub-phase 4.3: Create Server-Client Bridge
**Goal**: Enable sdk-core to communicate with sdk-node services

#### Tasks:
- [x] Design WebSocket protocol for core-node communication
- [x] Implement WebSocket client in sdk-core
- [x] Implement WebSocket server in sdk-node
- [x] Create RPC-style method calls
- [x] Handle connection management
- [x] Implement retry logic
- [x] Add authentication between core and node

---

## Phase 5: Update Managers for Browser Compatibility

### Sub-phase 5.1: Refactor PaymentManager
**Goal**: Ensure payment flows work in browser

#### Tasks:
- [x] Remove Node.js dependencies from PaymentManager
- [x] Update USDC approval flows for browser
- [x] Ensure ETH payments work with browser wallets
- [x] Update gas estimation for browser
- [x] Test with multiple browser wallets
- [x] Verify transaction receipts in browser
- [x] Update error handling for browser context

### Sub-phase 5.2: Refactor SessionManager
**Goal**: Make session management browser-compatible

#### Tasks:
- [x] Update WebSocket client for browser
- [x] Remove Node.js specific WebSocket code
- [x] Ensure session state persists in browser
- [x] Update checkpoint handling for browser
- [x] Verify streaming works in browser
- [x] Test session recovery in browser
- [x] Update error handling for browser

### Sub-phase 5.3: Refactor HostManager
**Goal**: Enable host operations from browser

#### Tasks:
- [x] Update registration flows for browser
- [x] Ensure staking works with browser wallets
- [x] Update metadata management for browser
- [x] Verify earnings withdrawal in browser
- [x] Test host info queries from browser
- [x] Update node metrics fetching
- [x] Remove server-only host operations

---

## Phase 6: Create Unified API

### Sub-phase 6.1: Design Unified SDK Interface
**Goal**: Create consistent API across both packages

#### Tasks:
- [x] Define FabstirSDKCore class
- [x] Define FabstirSDKNode class extending Core
- [x] Ensure API compatibility between versions
- [x] Create migration guide from current SDK
- [x] Document breaking changes
- [x] Create compatibility layer for existing code
- [x] Setup deprecation warnings

### Sub-phase 6.2: Implement Factory Pattern
**Goal**: Smart SDK initialization based on environment

#### Tasks:
- [x] Create SDK factory function
- [x] Detect environment (browser vs Node.js)
- [x] Auto-select appropriate implementation
- [x] Handle missing server features gracefully
- [x] Provide clear error messages
- [x] Create environment capability detection
- [x] Document environment requirements

---

## Phase 7: Testing and Validation

### Sub-phase 7.1: Browser Testing
**Goal**: Ensure sdk-core works in all browsers

#### Tasks:
- [ ] Test in Chrome with MetaMask
- [ ] Test in Firefox with MetaMask
- [ ] Test in Safari with WalletConnect
- [ ] Test in Edge
- [ ] Test mobile browsers
- [ ] Verify all contract interactions
- [ ] Test S5.js storage operations
- [ ] Validate session management
- [ ] Test payment flows end-to-end

### Sub-phase 7.2: Integration Testing
**Goal**: Verify sdk-core and sdk-node work together

#### Tasks:
- [ ] Test P2P operations through bridge
- [ ] Verify proof generation and submission
- [ ] Test full inference flow
- [ ] Validate checkpoint system
- [ ] Test error recovery
- [ ] Verify WebSocket reconnection
- [ ] Test scaling with multiple clients
- [ ] Validate security between packages

### Sub-phase 7.3: Migration Testing
**Goal**: Ensure existing code can migrate smoothly

#### Tasks:
- [ ] Update harness pages to use sdk-core
- [ ] Migrate test suite to new structure
- [ ] Update documentation examples
- [ ] Test backward compatibility
- [ ] Verify no functionality lost
- [ ] Performance comparison
- [ ] Memory usage comparison
- [ ] Bundle size analysis

---

## Phase 8: Documentation and Release

### Sub-phase 8.1: Update Documentation
**Goal**: Complete documentation for both packages

#### Tasks:
- [ ] Write sdk-core API documentation
- [ ] Write sdk-node API documentation
- [ ] Create migration guide
- [ ] Update README files
- [ ] Create browser usage examples
- [ ] Create server usage examples
- [ ] Document environment requirements
- [ ] Create troubleshooting guide

### Sub-phase 8.2: Create Example Applications
**Goal**: Demonstrate proper usage patterns

#### Tasks:
- [ ] Create React example app with sdk-core
- [ ] Create Next.js example with both packages
- [ ] Create Vue.js example
- [ ] Create vanilla JavaScript example
- [ ] Create Node.js server example
- [ ] Create API route examples
- [ ] Create WebSocket bridge example
- [ ] Create production deployment guide

### Sub-phase 8.3: Package and Release
**Goal**: Publish packages for use

#### Tasks:
- [ ] Setup npm/yarn publishing
- [ ] Configure package versioning
- [ ] Create changelog
- [ ] Setup CI/CD for packages
- [ ] Publish beta versions
- [ ] Gather feedback
- [ ] Fix reported issues
- [ ] Publish stable release

---

## Success Criteria

1. **Browser Compatibility**: UI developers can import and use sdk-core directly in React components
2. **No Node.js Dependencies**: sdk-core has zero Node.js-specific imports
3. **Feature Parity**: All essential features available in browser (except P2P direct)
4. **Performance**: Browser operations are performant and don't block UI
5. **Developer Experience**: Clear APIs, good error messages, comprehensive docs
6. **Backward Compatibility**: Existing code can migrate with minimal changes
7. **Testing**: >90% code coverage, all browsers tested
8. **Production Ready**: Used successfully in real applications

---

## Implementation Notes

### Priority Order
1. Phase 1-2: Foundation (Critical)
2. Phase 3: Core refactoring (Critical)
3. Phase 5: Manager updates (Critical)
4. Phase 4: Server extraction (Important)
5. Phase 6: Unified API (Important)
6. Phase 7: Testing (Critical)
7. Phase 8: Documentation (Important)

### Key Decisions
- Use Web Crypto API instead of node:crypto
- Use native BigInt instead of BigNumber
- Use fetch instead of node-fetch
- Use WebSocket instead of ws package
- Use IndexedDB for browser storage
- Keep S5.js for decentralized storage

### Risk Mitigation
- Test each refactored component immediately
- Maintain backward compatibility where possible
- Provide clear migration paths
- Keep existing SDK working during refactor
- Use feature flags for gradual rollout

---

## Timeline Estimate

- Phase 1: 2 days (Analysis)
- Phase 2: 2 days (Setup)
- Phase 3: 5 days (Core refactor)
- Phase 4: 3 days (Server extraction)
- Phase 5: 4 days (Manager updates)
- Phase 6: 2 days (Unified API)
- Phase 7: 3 days (Testing)
- Phase 8: 3 days (Documentation)

**Total: ~24 days**

---

## Phase 9: S5 Seed Phrase Derivation from User Identity

### Sub-phase 9.1: Understand S5 Seed Format
**Goal**: Document S5's custom seed phrase requirements

#### Background:
S5.js uses a custom 15-word seed phrase format, NOT standard BIP39:
- 13 seed words + 2 checksum words = 15 total words
- Custom wordlist of 1024 words (10 bits per word)
- Word 13 limited to first 256 words (8 bits)
- Custom checksum algorithm using Blake3 hash

#### Tasks:
- [ ] Document S5 wordlist structure and requirements
- [ ] Understand S5 checksum generation algorithm
- [ ] Map entropy requirements (16 bytes of entropy)
- [ ] Document word selection process
- [ ] Create test vectors for validation

### Sub-phase 9.2: Design Deterministic Derivation
**Goal**: Create reproducible S5 seed from user signature

#### Approach:
```typescript
// Current flow (temporary):
1. User signs message with private key/wallet
2. SHA-256 hash of signature → 32 bytes entropy
3. Currently: Using hardcoded seed phrase from config

// Target flow:
1. User signs message with private key/wallet
2. SHA-256 hash of signature → 32 bytes entropy
3. Take first 16 bytes as S5 entropy
4. Convert entropy to S5 seed words using S5 algorithm
5. Generate checksum words
6. Combine into valid 15-word S5 seed phrase
```

#### Tasks:
- [ ] Import S5 wordlist into sdk-core
- [ ] Port S5 seed generation algorithm
- [ ] Implement entropy to seed word conversion
- [ ] Implement checksum generation
- [ ] Create deterministic derivation function
- [ ] Add unit tests for seed generation
- [ ] Verify seeds work with S5.js

### Sub-phase 9.3: Implement Seed Derivation
**Goal**: Replace hardcoded seed with derived seed

#### Implementation Plan:
```typescript
// packages/sdk-core/src/utils/s5-seed-generator.ts
import { wordlist } from './s5-wordlist';

export function deriveS5SeedFromSignature(signature: string): string {
  // 1. Hash signature to get entropy
  const entropy = sha256(signature).slice(0, 16); // 16 bytes
  
  // 2. Convert entropy to seed words (13 words)
  const seedWords = entropyToSeedWords(entropy);
  
  // 3. Generate checksum (2 words)
  const checksumWords = generateChecksum(seedWords);
  
  // 4. Combine into phrase
  return [...seedWords, ...checksumWords].join(' ');
}
```

#### Tasks:
- [ ] Create s5-seed-generator.ts utility
- [ ] Copy S5 wordlist to sdk-core
- [ ] Implement entropyToSeedWords function
- [ ] Implement generateChecksum function
- [ ] Integrate with FabstirSDKCore authentication
- [ ] Remove hardcoded seed phrase
- [ ] Test with multiple wallets/signatures
- [ ] Verify deterministic generation

### Sub-phase 9.4: Handle Edge Cases
**Goal**: Ensure robust seed generation

#### Considerations:
- Different wallet signatures (MetaMask, WalletConnect, etc.)
- Consistent message for signing
- Fallback for failed generation
- Migration from existing seeds
- Security implications

#### Tasks:
- [ ] Define standard signing message
- [ ] Handle signature format variations
- [ ] Add entropy validation
- [ ] Implement fallback mechanism
- [ ] Create migration strategy for existing users
- [ ] Security audit of derivation process
- [ ] Document security considerations

### Sub-phase 9.5: Testing and Validation
**Goal**: Ensure derived seeds work correctly

#### Test Cases:
1. Same signature → same seed (deterministic)
2. Different signatures → different seeds
3. Generated seeds work with S5.js
4. Seeds persist across sessions
5. Seeds recover correct identity

#### Tasks:
- [ ] Create comprehensive test suite
- [ ] Test with real S5 network
- [ ] Verify identity recovery
- [ ] Test file storage/retrieval
- [ ] Performance benchmarks
- [ ] Cross-browser testing
- [ ] Document test results

### Implementation Code Example:

```typescript
// packages/sdk-core/src/FabstirSDKCore.ts
private async generateS5Seed(signature: string): Promise<void> {
  if (!this.config.authMethod || this.config.authMethod === 'none') {
    return;
  }
  
  try {
    // Derive S5 seed from signature entropy
    const { deriveS5SeedFromSignature } = await import('./utils/s5-seed-generator');
    this.s5Seed = deriveS5SeedFromSignature(signature);
    console.log('S5 seed derived from user signature');
  } catch (error) {
    console.warn('Failed to derive S5 seed, using fallback:', error);
    // Fallback to config seed if available
    if (this.config.s5Config?.seedPhrase) {
      this.s5Seed = this.config.s5Config.seedPhrase;
    } else {
      throw new SDKError('Failed to generate S5 seed', 'S5_SEED_ERROR');
    }
  }
}
```

### Success Criteria:
1. ✅ Deterministic seed generation from user signature
2. ✅ No hardcoded seeds in production code
3. ✅ Seeds compatible with S5.js requirements
4. ✅ Consistent seeds across sessions for same user
5. ✅ Proper error handling and fallbacks
6. ✅ Comprehensive test coverage
7. ✅ Security best practices followed

### Timeline:
- Research & Design: 1 day
- Implementation: 2 days  
- Testing: 1 day
- Documentation: 0.5 day
**Total: 4.5 days**

---

## Phase 10: Host Discovery Integration

### Overview
Integrate blockchain-based host discovery mechanism to automatically find LLM host API endpoints without hardcoding URLs.

### Sub-phase 10.1: Update Contract ABIs
**Goal**: Update NodeRegistry ABI with new host discovery functions
**Line limit**: N/A (file copy)

#### Tasks:
- [ ] Copy NodeRegistryFAB-CLIENT-ABI.json from docs/compute-contracts-reference/client-abis/
- [ ] Replace src/contracts/abis/NodeRegistryFAB-CLIENT-ABI.json
- [ ] Verify new functions exist: getNodeApiUrl, updateApiUrl, registerNodeWithUrl
- [ ] Update ContractManager to load new ABI
- [ ] Test ABI loading in browser environment

### Sub-phase 10.2: Create Host Discovery Service
**Goal**: Service to query blockchain for host API endpoints
**Line limit**: 150 lines

#### Implementation: `packages/sdk-core/src/services/HostDiscovery.ts`
```typescript
export class HostDiscovery {
  private nodeRegistry: ethers.Contract;
  private cache: Map<string, { url: string; timestamp: number }>;
  
  async discoverHost(hostAddress: string): Promise<string>;
  async discoverAllHosts(): Promise<Map<string, HostInfo>>;
  async findBestHost(requirements: HostRequirements): Promise<HostInfo>;
  private validateApiUrl(url: string): boolean;
  private cacheUrl(address: string, url: string): void;
}
```

#### Tasks:
- [ ] Write tests for host discovery (TDD)
- [ ] Create HostDiscovery class skeleton
- [ ] Implement discoverHost method
- [ ] Implement discoverAllHosts method
- [ ] Add URL validation and sanitization
- [ ] Implement caching with TTL
- [ ] Add findBestHost with selection logic
- [ ] Handle contract call failures gracefully

### Sub-phase 10.3: Update HostManager
**Goal**: Add API URL support to host management
**Line limit**: 50 lines added

#### Tasks:
- [ ] Write tests for new HostManager methods
- [ ] Add getHostApiUrl(address) method
- [ ] Add discoverAvailableHosts() method
- [ ] Update registerHost to include API URL
- [ ] Add updateHostApiUrl(url) method
- [ ] Update getHostInfo to return API URL
- [ ] Test integration with HostDiscovery service

---

## Phase 11: WebSocket Streaming Integration

### Overview
Integrate the new WebSocket API (`/v1/ws`) for real-time token streaming from LLM hosts.

### Sub-phase 11.1: Enhance WebSocket Client
**Goal**: Update WebSocket client for new protocol
**Line limit**: 200 lines modified

#### Implementation Updates: `packages/sdk-core/src/websocket/WebSocketClient.ts`
```typescript
interface InferenceMessage {
  type: 'inference';
  request: {
    model: string;
    prompt: string;
    max_tokens: number;
    stream: boolean;
  };
}

interface StreamToken {
  type: 'stream_token';
  token: string;
  finish_reason?: string;
}
```

#### Tasks:
- [ ] Write tests for WebSocket streaming
- [ ] Add support for /v1/ws endpoint
- [ ] Implement inference message type
- [ ] Add auth message type (for future JWT)
- [ ] Implement streaming token handler
- [ ] Add connection state management
- [ ] Handle reconnection with session recovery
- [ ] Add compression support (gzip/deflate)
- [ ] Implement rate limiting awareness

### Sub-phase 11.2: Create Inference Manager
**Goal**: Manager for direct inference without blockchain
**Line limit**: 150 lines

#### Implementation: `packages/sdk-core/src/managers/InferenceManager.ts`
```typescript
export class InferenceManager {
  private wsClient: WebSocketClient;
  private hostDiscovery: HostDiscovery;
  
  async *inference(prompt: string, options?: InferenceOptions): AsyncGenerator<string>;
  async *sessionInference(sessionId: string, prompt: string): AsyncGenerator<string>;
  private async connectToHost(hostUrl: string): Promise<void>;
  private handleStreamToken(token: StreamToken): void;
}
```

#### Tasks:
- [ ] Write tests for InferenceManager
- [ ] Create InferenceManager class
- [ ] Implement direct inference method
- [ ] Add async generator for streaming
- [ ] Implement session-based inference
- [ ] Add model selection logic
- [ ] Handle connection failures
- [ ] Add timeout and retry logic
- [ ] Implement token buffering

### Sub-phase 11.3: Update SessionManager
**Goal**: Integrate WebSocket streaming with sessions
**Line limit**: 100 lines modified

#### Tasks:
- [ ] Write tests for streaming sessions
- [ ] Add connectToHost method
- [ ] Modify createSession to discover & connect
- [ ] Update sendPrompt to return AsyncGenerator
- [ ] Implement streamPrompt method
- [ ] Add session context management
- [ ] Handle checkpoint proofs with streaming
- [ ] Update session state for WebSocket
- [ ] Test with real host connections

### Sub-phase 11.4: SDK Core Integration
**Goal**: Wire everything together in FabstirSDKCore
**Line limit**: 50 lines added

#### Tasks:
- [ ] Add InferenceManager to SDK core
- [ ] Create getInferenceManager() method
- [ ] Update initialize() to setup discovery
- [ ] Add host discovery to config
- [ ] Cache discovered endpoints
- [ ] Add WebSocket connection pooling
- [ ] Update exports and types
- [ ] Test full integration flow

---

## Phase 12: End-to-End Testing and Documentation

### Sub-phase 12.1: Integration Testing
**Goal**: Comprehensive testing of new features

#### Test Scenarios:
1. Register host with API URL → Discover → Connect → Stream
2. Multiple hosts → Select best → Failover
3. Session with streaming → Checkpoint → Complete
4. Direct inference without blockchain
5. Connection recovery and session resumption

#### Tasks:
- [ ] Create integration test suite
- [ ] Mock WebSocket server for testing
- [ ] Test host discovery flow
- [ ] Test streaming inference
- [ ] Test error scenarios
- [ ] Performance benchmarks
- [ ] Load testing with multiple connections
- [ ] Browser compatibility testing

### Sub-phase 12.2: Update Example Applications
**Goal**: Update harness pages to use new features

#### Tasks:
- [ ] Update base-usdc-mvp-flow-sdk.test.tsx
- [ ] Add streaming UI components
- [ ] Create host discovery demo page
- [ ] Add real-time token display
- [ ] Update documentation examples
- [ ] Create migration guide

### Sub-phase 12.3: Documentation
**Goal**: Complete documentation for new features

#### Tasks:
- [ ] Document HostDiscovery API
- [ ] Document InferenceManager API
- [ ] Update SessionManager docs
- [ ] Create WebSocket protocol guide
- [ ] Add troubleshooting section
- [ ] Update README with examples
- [ ] Create video demo/tutorial

---

## Success Criteria for Phases 10-12

1. ✅ No hardcoded host URLs in SDK
2. ✅ Automatic host discovery from blockchain
3. ✅ Real-time token streaming via WebSocket
4. ✅ Direct inference without blockchain payments
5. ✅ Session persistence and recovery
6. ✅ Graceful failover between hosts
7. ✅ Browser-compatible implementation
8. ✅ Comprehensive test coverage (>80%)
9. ✅ Full backward compatibility
10. ✅ Production-ready documentation

## Timeline

- **Phase 10**: 3 days (Host Discovery)
- **Phase 11**: 5 days (WebSocket Integration)
- **Phase 12**: 2 days (Testing & Documentation)
- **Total**: 10 days

---

## Next Steps

1. Complete Phase 9 (S5 Seed Derivation) if not done
2. Begin Phase 10.1 - Update Contract ABIs
3. Follow TDD approach for each sub-phase
4. Test in browser environment continuously
4. Start incremental refactoring
5. Test continuously throughout process
6. **Implement S5 seed derivation (Phase 9) after core browser compatibility**

This refactor will enable UI developers to use FabstirSDK directly in browsers while maintaining full functionality through the optional server package for advanced features.