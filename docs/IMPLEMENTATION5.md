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
- [ ] Move P2PClient to sdk-node
- [ ] Move libp2p dependencies to sdk-node
- [ ] Create P2P service interface for sdk-core
- [ ] Implement WebSocket client in sdk-core for P2P bridge
- [ ] Move DHT operations to sdk-node
- [ ] Move peer discovery to sdk-node
- [ ] Create API bridge between core and node packages

### Sub-phase 4.2: Move EZKL Proof Generation
**Goal**: Isolate heavy cryptography in sdk-node

#### Tasks:
- [ ] Move EZKL proof generation to sdk-node
- [ ] Create proof verification interface for sdk-core
- [ ] Move heavy crypto operations to sdk-node
- [ ] Implement proof submission from browser
- [ ] Create API for proof status checking
- [ ] Ensure proof validation works in browser
- [ ] Setup proof caching mechanism

### Sub-phase 4.3: Create Server-Client Bridge
**Goal**: Enable sdk-core to communicate with sdk-node services

#### Tasks:
- [ ] Design WebSocket protocol for core-node communication
- [ ] Implement WebSocket client in sdk-core
- [ ] Implement WebSocket server in sdk-node
- [ ] Create RPC-style method calls
- [ ] Handle connection management
- [ ] Implement retry logic
- [ ] Add authentication between core and node

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
- [ ] Update registration flows for browser
- [ ] Ensure staking works with browser wallets
- [ ] Update metadata management for browser
- [ ] Verify earnings withdrawal in browser
- [ ] Test host info queries from browser
- [ ] Update node metrics fetching
- [ ] Remove server-only host operations

---

## Phase 6: Create Unified API

### Sub-phase 6.1: Design Unified SDK Interface
**Goal**: Create consistent API across both packages

#### Tasks:
- [ ] Define FabstirSDKCore class
- [ ] Define FabstirSDKNode class extending Core
- [ ] Ensure API compatibility between versions
- [ ] Create migration guide from current SDK
- [ ] Document breaking changes
- [ ] Create compatibility layer for existing code
- [ ] Setup deprecation warnings

### Sub-phase 6.2: Implement Factory Pattern
**Goal**: Smart SDK initialization based on environment

#### Tasks:
- [ ] Create SDK factory function
- [ ] Detect environment (browser vs Node.js)
- [ ] Auto-select appropriate implementation
- [ ] Handle missing server features gracefully
- [ ] Provide clear error messages
- [ ] Create environment capability detection
- [ ] Document environment requirements

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

## Next Steps

1. Begin with Phase 1.1 - Dependency analysis
2. Create detailed technical design document
3. Set up new package structure
4. Start incremental refactoring
5. Test continuously throughout process

This refactor will enable UI developers to use FabstirSDK directly in browsers while maintaining full functionality through the optional server package for advanced features.