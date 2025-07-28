# Fabstir LLM SDK - Implementation Plan

## Overview

Client SDK for the Fabstir P2P LLM marketplace, enabling applications to connect directly to host nodes without central coordination.

## Development Setup

- **Language**: TypeScript/JavaScript
- **P2P**: js-libp2p
- **UI Testing**: Puppeteer
- **Package Manager**: pnpm

## Phase 1: Core SDK (Month 1)

### Sub-phase 1.1: Project Setup

- [ ] Initialize TypeScript project
- [ ] Configure build system
- [ ] Set up testing framework
- [ ] Create package structure

**Test Files:**

- `tests/setup/test_project.spec.ts`
- `tests/setup/test_build.spec.ts`
- `tests/setup/test_packages.spec.ts`
- `tests/setup/test_types.spec.ts`

### Sub-phase 1.2: P2P Client

- [ ] Implement libp2p client
- [ ] Implement DHT queries
- [ ] Implement peer discovery
- [ ] Implement connection handling

**Test Files:**

- `tests/p2p/test_client.spec.ts`
- `tests/p2p/test_dht.spec.ts`
- `tests/p2p/test_discovery.spec.ts`
- `tests/p2p/test_connections.spec.ts`

### Sub-phase 1.3: Node Communication

- [ ] Implement request protocol
- [ ] Implement response handling
- [ ] Implement streaming support
- [ ] Implement error recovery

**Test Files:**

- `tests/comm/test_requests.spec.ts`
- `tests/comm/test_responses.spec.ts`
- `tests/comm/test_streaming.spec.ts`
- `tests/comm/test_recovery.spec.ts`

### Sub-phase 1.4: Contract Integration

- [ ] Implement Web3 provider
- [ ] Implement job submission
- [ ] Implement payment handling
- [ ] Implement event monitoring
- [ ] Implement S5 result retrieval (**NEW**)
- [ ] Implement Vector DB cache check (**NEW**)

**Test Files:**

- `tests/contracts/test_web3.spec.ts`
- `tests/contracts/test_jobs.spec.ts`
- `tests/contracts/test_payments.spec.ts`
- `tests/contracts/test_events.spec.ts`
- `tests/contracts/test_s5_retrieval.spec.ts` (**NEW**)
- `tests/contracts/test_vector_cache.spec.ts` (**NEW**)

### Sub-phase 1.5: Model Discovery (**NEW**)

- [ ] Implement model marketplace query
- [ ] Implement host discovery by model
- [ ] Implement pricing comparison
- [ ] Implement latency-based routing

**Test Files:**

- `tests/discovery/test_marketplace.spec.ts`
- `tests/discovery/test_host_search.spec.ts`
- `tests/discovery/test_pricing.spec.ts`
- `tests/discovery/test_routing.spec.ts`

## Phase 2: Advanced Features (Month 2)

### Sub-phase 2.1: Enhanced S5 Client

- [ ] Implement S5 integration
- [ ] Implement vector-db queries
- [ ] Implement cache management
- [ ] Implement result retrieval
- [ ] Use Enhanced S5.js path-based API (**NEW**)
- [ ] Implement CBOR decoding for results (**NEW**)

**Test Files:**

- `tests/s5/test_integration.spec.ts`
- `tests/s5/test_vector_queries.spec.ts`
- `tests/s5/test_cache.spec.ts`
- `tests/s5/test_retrieval.spec.ts`
- `tests/s5/test_path_api.spec.ts` (**NEW**)
- `tests/s5/test_cbor_decode.spec.ts` (**NEW**)

### Sub-phase 2.2: Base Account SDK

- [ ] Implement smart wallet support
- [ ] Implement gasless transactions
- [ ] Implement session management
- [ ] Implement batch operations

**Test Files:**

- `tests/base/test_wallets.spec.ts`
- `tests/base/test_gasless.spec.ts`
- `tests/base/test_sessions.spec.ts`
- `tests/base/test_batch.spec.ts`

### Sub-phase 2.3: Developer Experience

- [ ] Implement TypeScript types
- [ ] Implement error handling
- [ ] Implement logging system
- [ ] Implement debugging tools

**Test Files:**

- `tests/dx/test_types.spec.ts`
- `tests/dx/test_errors.spec.ts`
- `tests/dx/test_logging.spec.ts`
- `tests/dx/test_debugging.spec.ts`

### Sub-phase 2.4: UI Components

- [ ] Implement React components
- [ ] Implement Vue components
- [ ] Implement vanilla JS widgets
- [ ] Implement mobile support

**Test Files (Puppeteer):**

- `tests/ui/test_react.spec.ts`
- `tests/ui/test_vue.spec.ts`
- `tests/ui/test_vanilla.spec.ts`
- `tests/ui/test_mobile.spec.ts`

### Sub-phase 2.5: Payment Integration (**NEW**)

- [ ] Implement USDC payment flow
- [ ] Implement FAB token payment with discount
- [ ] Implement payment estimation
- [ ] Implement transaction tracking

**Test Files:**

- `tests/payments/test_usdc.spec.ts`
- `tests/payments/test_fab.spec.ts`
- `tests/payments/test_estimation.spec.ts`
- `tests/payments/test_tracking.spec.ts`

### Sub-phase 2.6: Host Selection (**NEW**)

- [ ] Implement automatic host selection
- [ ] Implement reputation-based routing
- [ ] Implement failover mechanisms
- [ ] Implement load distribution

**Test Files:**

- `tests/selection/test_auto_select.spec.ts`
- `tests/selection/test_reputation.spec.ts`
- `tests/selection/test_failover.spec.ts`
- `tests/selection/test_load_balance.spec.ts`

## Phase 3: Multi-Language SDKs (Month 3)

### Sub-phase 3.1: Python SDK

- [ ] Implement Python client
- [ ] Implement async support
- [ ] Implement type hints
- [ ] Create documentation

**Test Files:**

- `tests/python/test_client.py`
- `tests/python/test_async.py`
- `tests/python/test_types.py`
- `tests/python/test_docs.py`

### Sub-phase 3.2: Rust SDK

- [ ] Implement Rust client
- [ ] Implement async runtime
- [ ] Implement FFI bindings
- [ ] Create documentation

**Test Files:**

- `tests/rust/test_client.rs`
- `tests/rust/test_async.rs`
- `tests/rust/test_ffi.rs`
- `tests/rust/test_docs.rs`

### Sub-phase 3.3: Go SDK

- [ ] Implement Go client
- [ ] Implement goroutines
- [ ] Implement interfaces
- [ ] Create documentation

**Test Files:**

- `tests/go/test_client.go`
- `tests/go/test_goroutines.go`
- `tests/go/test_interfaces.go`
- `tests/go/test_docs.go`

### Sub-phase 3.4: Integration Testing

- [ ] Test cross-language compatibility
- [ ] Test performance benchmarks
- [ ] Test error scenarios
- [ ] Test production loads

**Test Files:**

- `tests/integration/test_compatibility.spec.ts`
- `tests/integration/test_performance.spec.ts`
- `tests/integration/test_errors.spec.ts`
- `tests/integration/test_load.spec.ts`
