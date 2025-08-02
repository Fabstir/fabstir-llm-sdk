# Fabstir LLM SDK - Implementation Plan

## Overview

Client SDK for the Fabstir P2P LLM marketplace, enabling applications to connect directly to host nodes without central coordination. The SDK supports two modes:

- **Mock Mode**: For demos and development (current default)
- **Production Mode**: For real P2P connectivity with libp2p

## Development Setup

- **Language**: TypeScript/JavaScript
- **P2P**: js-libp2p (production mode only)
- **Testing**: Vitest with TDD approach
- **Package Manager**: npm/pnpm
- **Backward Compatibility**: Must maintain exact demo behavior

## Phase 1: Mock Implementation (COMPLETED) ✅

### Sub-phase 1.1: Project Setup ✅

- [x] Initialize TypeScript project
- [x] Configure build system
- [x] Set up basic testing
- [x] Create package structure

### Sub-phase 1.2: Mock Provider ✅

- [x] Implement mock Web3 provider
- [x] Implement mock contract interactions
- [x] Implement simulated responses
- [x] Create demo integration

### Sub-phase 1.3: Basic SDK Interface ✅

- [x] Implement FabstirSDK class
- [x] Implement job submission
- [x] Implement status tracking
- [x] Implement response streaming

### Sub-phase 1.4: Demo Integration ✅

- [x] Connect with fabstir-llm-demo
- [x] Support all demo features
- [x] Mock timeline events
- [x] Cost estimation

## Phase 2: Production Mode Upgrade (IN PROGRESS)

### Sub-phase 2.1: Mode Configuration ✅

- [x] Add SDKMode type ('mock' | 'production')
- [x] Update FabstirConfig interface
- [x] Implement mode validation
- [x] Ensure backward compatibility

**Test Files:**

- `src/__tests__/config/mode.test.ts`
- `src/__tests__/compatibility/demo.test.ts`

**Claude Code Prompt:**

```
Add 'mode' configuration to SDK that defaults to 'mock'.
Tests in src/__tests__/config/mode.test.ts need to pass.
Minimal changes only - don't break existing functionality.
```

### Sub-phase 2.2: P2P Configuration ✅

- [x] Add P2PConfig interface
- [x] Validate P2P config in production mode
- [x] Add bootstrap nodes validation
- [x] Implement config freezing

**Test Files:**

- `src/__tests__/p2p/config.test.ts`

**Claude Code Prompt:**

```
Add P2P configuration validation when mode='production'.
Must have bootstrapNodes array. Throw clear errors.
```

### Sub-phase 2.3: P2P Client Structure

- [ ] Create P2PClient class skeleton
- [ ] Add libp2p dependencies
- [ ] Implement client lifecycle (start/stop)
- [ ] Add connection state tracking

**Test Files:**

- `src/__tests__/p2p/client-lifecycle.test.ts`

**Claude Code Prompt:**

```
Create basic P2PClient class that can start/stop.
Don't implement actual P2P yet - just structure.
```

### Sub-phase 2.4: Mode-Specific Behavior

- [ ] Update connect() for mode handling
- [ ] Update submitJob() for mode routing
- [ ] Update status methods for mode
- [ ] Ensure mock mode unchanged

**Test Files:**

- `src/__tests__/mode/behavior.test.ts`

**Claude Code Prompt:**

```
Make SDK methods check mode and route to appropriate implementation.
Mock mode must work exactly as before.
```

### Sub-phase 2.5: P2P Connection

- [ ] Implement libp2p node creation
- [ ] Connect to bootstrap nodes
- [ ] Handle connection events
- [ ] Implement connection retry

**Test Files:**

- `src/__tests__/p2p/connection.test.ts`

**Claude Code Prompt:**

```
Implement actual P2P connection using libp2p.
Connect to bootstrap nodes and emit events.
```

### Sub-phase 2.6: Node Discovery

- [ ] Implement DHT queries
- [ ] Parse node capabilities
- [ ] Filter by requirements
- [ ] Cache discovered nodes

**Test Files:**

- `src/__tests__/p2p/discovery.test.ts`

**Claude Code Prompt:**

```
Implement node discovery via DHT.
Find nodes offering 'llm-inference' service.
```

### Sub-phase 2.7: Job Negotiation

- [ ] Define job request protocol
- [ ] Send job to specific node
- [ ] Handle accept/reject
- [ ] Implement node selection

**Test Files:**

- `src/__tests__/p2p/job-negotiation.test.ts`

**Claude Code Prompt:**

```
Implement job request protocol over P2P.
Send job details and handle node response.
```

### Sub-phase 2.8: Response Streaming

- [ ] Implement stream protocol
- [ ] Handle token messages
- [ ] Support stream resumption
- [ ] Track streaming metrics

**Test Files:**

- `src/__tests__/streaming/p2p-stream.test.ts`

**Claude Code Prompt:**

```
Implement response streaming over P2P connection.
Handle individual tokens and completion.
```

### Sub-phase 2.9: Contract Bridge

- [ ] Link P2P events to contracts
- [ ] Submit job to blockchain
- [ ] Monitor contract events
- [ ] Handle payment flow

**Test Files:**

- `src/__tests__/contracts/p2p-integration.test.ts`

**Claude Code Prompt:**

```
Bridge P2P functionality with smart contracts.
Submit jobs on-chain while using P2P for execution.
```

### Sub-phase 2.10: Error Recovery

- [ ] Implement retry mechanisms
- [ ] Handle node failures
- [ ] Support job recovery
- [ ] Track node reliability

**Test Files:**

- `src/__tests__/error/recovery.test.ts`

**Claude Code Prompt:**

```
Add error recovery for P2P operations.
Retry failed connections and handle node failures.
```

### Sub-phase 2.11: Integration Testing

- [ ] Test full job lifecycle
- [ ] Verify mode switching
- [ ] Test fallback scenarios
- [ ] Performance benchmarks

**Test Files:**

- `src/__tests__/integration/e2e.test.ts`

**Claude Code Prompt:**

```
Verify complete flow works in both modes.
Test job submission through completion.
```

### Sub-phase 2.12: Documentation

- [ ] Update README with modes
- [ ] Document P2P configuration
- [ ] Add migration guide
- [ ] Update API docs

**Files:**

- `README.md`
- `docs/MIGRATION.md`
- `docs/API.md`

## Phase 3: Advanced Features (FUTURE)

### Sub-phase 3.1: Multi-language Support

- [ ] Python SDK
- [ ] Go SDK
- [ ] Rust SDK bindings
- [ ] SDK feature parity

### Sub-phase 3.2: Enhanced Streaming

- [ ] Binary protocol support
- [ ] Compression
- [ ] Multi-stream jobs
- [ ] Stream prioritization

### Sub-phase 3.3: Caching Layer

- [ ] S5.js integration
- [ ] Semantic caching
- [ ] Result deduplication
- [ ] Cache invalidation

### Sub-phase 3.4: Production Optimization

- [ ] Connection pooling
- [ ] Request batching
- [ ] Metric collection
- [ ] Performance tuning

## Testing Strategy

1. **Write test first** (TDD approach)
2. **Run test** - should fail
3. **Implement minimal code** to pass
4. **Refactor** if needed
5. **Run all tests** to ensure no regression

## Success Criteria

### Phase 2 Completion

- [ ] All Phase 2 tests passing
- [ ] Demo works unchanged in mock mode
- [ ] Can connect to real P2P nodes in production
- [ ] Can submit and process real jobs
- [ ] Test coverage > 80%
- [ ] No breaking changes

### Integration Success

- [ ] Works with fabstir-llm-node
- [ ] Integrates with smart contracts
- [ ] Handles network failures gracefully
- [ ] Performance meets requirements

## Current Status

- **Phase 1**: ✅ Complete (Mock implementation working)
- **Phase 2**: 🚧 In Progress (Starting with 2.1)
- **Phase 3**: 📋 Planned

## Implementation Order

For Phase 2, implement sub-phases in order:

1. Start with 2.1 (Mode Configuration)
2. Ensure 2.1 tests pass completely
3. Move to 2.2, and so on
4. Don't skip ahead - each phase builds on previous

## Notes

- **Backward Compatibility**: The demo must continue working exactly as is
- **Incremental Changes**: Each sub-phase should be small and focused
- **Test Coverage**: Aim for 100% coverage of new code
- **Documentation**: Update docs as features are added
