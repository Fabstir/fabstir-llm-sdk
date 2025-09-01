# Fabstir LLM SDK - Implementation Plan (TDD Approach)

## Overview
Build SDK session support using Test-Driven Development with bounded autonomy. Tests define the interface, implementation follows.

**Repository**: `fabstir-llm-ui/packages/sdk-client` (developed independently)

**TDD Principles**:
- Write ALL tests for a sub-phase first
- Verify tests fail before implementing
- Implementation emerges from test requirements
- Keep implementations minimal to pass tests
- No implementation details in this plan

---

## Phase 1: SDK Foundation

### Sub-phase 1.1: Session Manager Core (Max 60 lines)
- [x] Create test file: `packages/sdk-client/src/session/SessionManager.test.ts`
  - [x] Test: Creates session manager with signer and contract address
  - [x] Test: Creates session with valid parameters
  - [x] Test: Rejects session creation with invalid deposit
  - [x] Test: Completes session with token count
  - [x] Test: Gets session status for valid job ID
  - [x] Test: Handles timeout trigger correctly
  - [x] Test: Emits correct events on state changes
  - [x] Test: Handles contract revert errors gracefully
- [x] Run tests - verify ALL fail with "not implemented"
- [x] Implement minimal SessionManager to pass tests
- [x] Verify all tests pass
- [x] Check line count: `wc -l SessionManager.ts` (must be < 60)

### Sub-phase 1.2: Contract Interface (Max 75 lines) ✅
- [x] Create test file: `tests/contracts/session-contract.test.ts`
  - [x] Test: Loads ABI from JSON file
  - [x] Test: Creates contract instance with provider
  - [x] Test: Encodes createSession function call
  - [x] Test: Decodes session created events
  - [x] Test: Estimates gas for transactions
  - [x] Test: Filters events by job ID
  - [x] Test: Handles missing ABI gracefully
  - [x] Test: Validates contract address format
- [x] Run tests - verify ALL fail
- [x] Implement minimal contract interface
- [x] Verify all tests pass
- [x] Check line count compliance (72/75 lines)

---

### Sub-phase 2.1: WebSocket Client (Max 80 lines) ✅
- [x] Create test file: `tests/p2p/WebSocketClient.test.ts`
  - [x] Test: Connects to WebSocket URL
  - [x] Test: Sends prompt with index
  - [x] Test: Receives streaming response
  - [x] Test: Handles connection drops with retry
  - [x] Test: Implements exponential backoff
  - [x] Test: Calls response callback on data
  - [x] Test: Disconnects cleanly
  - [x] Test: Rejects invalid URLs
  - [x] Test: Handles max retry limit
  - [x] Test: Queues messages when disconnected
- [x] Mock WebSocket server for tests
- [x] Run tests - verify ALL fail
- [x] Implement WebSocketClient
- [x] Verify all tests pass

### Sub-phase 2.2: Host Discovery (Max 50 lines) ✅
- [x] Create test file: `tests/p2p/HostDiscovery.test.ts`
  - [x] Test: Discovers available hosts
  - [x] Test: Gets detailed host information
  - [x] Test: Pings host and returns latency
  - [x] Test: Filters hosts by requirements
  - [x] Test: Handles unreachable hosts
  - [x] Test: Caches discovery results
  - [x] Test: Refreshes stale cache
- [x] Run tests - verify ALL fail
- [x] Implement HostDiscovery (44/50 lines)
- [x] Verify all tests pass

---

## Phase 3: Storage Layer

### Sub-phase 3.1: S5 Conversation Store (Max 70 lines - REAL S5.js) ✅
- [x] Create test file: `tests/storage/S5ConversationStore.test.ts`
  - [x] Test: Saves prompt to S5
  - [x] Test: Saves response to S5
  - [x] Test: Loads full session history
  - [x] Test: Grants access to host address
  - [x] Test: Handles S5 connection errors
  - [x] Test: Validates session ID format
  - [x] Test: Returns empty array for new session
  - [x] Test: Maintains message ordering
  - [x] Test: Handles sequential saves (adapted from concurrent)
- [x] Use REAL Enhanced S5.js (not mocks)
- [x] Run tests - verify ALL fail first
- [x] Implement S5ConversationStore with real S5
- [x] Verify all tests pass (9/9 passing)
- [x] Line count: 69/70 lines ✅

### Sub-phase 3.2: Local Cache (Max 40 lines) ✅
- [x] Create test file: `tests/storage/SessionCache.test.ts`
  - [x] Test: Stores session in memory
  - [x] Test: Retrieves session by ID
  - [x] Test: Updates existing session
  - [x] Test: Deletes session from cache
  - [x] Test: Lists all active sessions
  - [x] Test: Clears entire cache
  - [x] Test: Handles memory limits
  - [x] Test: Respects TTL expiration
  - [x] Test: Returns cache statistics
  - [x] Test: Implements LRU eviction policy
- [x] Run tests - verify ALL fail
- [x] Implement SessionCache (40/40 lines)
- [x] Verify all tests pass (10/10)

---

## Phase 4: Integrated Session Client

### Sub-phase 4.1: Unified Session API (Max 100 lines)
- [ ] Create test file: `packages/sdk-client/src/FabstirSessionSDK.test.ts`
  - [ ] Test: Initializes with configuration
  - [ ] Test: Starts session with host and deposit
  - [ ] Test: Sends prompt to active session
  - [ ] Test: Receives streaming responses
  - [ ] Test: Ends session and gets receipt
  - [ ] Test: Finds hosts matching requirements
  - [ ] Test: Saves conversation to S5
  - [ ] Test: Loads previous session
  - [ ] Test: Handles multiple concurrent sessions
  - [ ] Test: Rejects operations on inactive session
  - [ ] Test: Calculates token usage correctly
  - [ ] Test: Emits lifecycle events
- [ ] Run tests - verify ALL fail
- [ ] Implement FabstirSessionSDK
- [ ] Verify all tests pass

### Sub-phase 4.2: Event System (Max 40 lines)
- [ ] Create test file: `packages/sdk-client/src/events/SessionEvents.test.ts`
  - [ ] Test: Emits session:created event
  - [ ] Test: Emits session:connected event
  - [ ] Test: Emits prompt:sent event
  - [ ] Test: Emits response:received event
  - [ ] Test: Emits session:completed event
  - [ ] Test: Emits session:error with details
  - [ ] Test: Emits session:timeout event
  - [ ] Test: Supports multiple listeners
  - [ ] Test: Removes listeners correctly
  - [ ] Test: Handles listener errors
- [ ] Run tests - verify ALL fail
- [ ] Implement SessionEvents
- [ ] Verify all tests pass

---

## Phase 5: Infrastructure Services (NEW)

### Sub-phase 5.1: Mock Discovery Service (Max 30 lines)
- [ ] Create `test-services/discovery-server.js`
- [ ] Implement /api/hosts endpoint
- [ ] Return test host data
- [ ] Run on port 3000

### Sub-phase 5.2: WebSocket Test Servers (Max 50 lines)
- [ ] Create `test-services/ws-servers.js`
- [ ] Support ports 8080-8088
- [ ] Handle prompt/response protocol
- [ ] Echo back test responses

### Sub-phase 5.3: Test Environment Setup
- [ ] Create `test-services/start-all.sh`
- [ ] Docker compose for services
- [ ] Environment configuration
- [ ] Health check script

## Phase 6: Integration Testing (REVISED)

### Sub-phase 6.1: End-to-End Tests
- [ ] All services running
- [ ] 12/12 SDK tests passing
- [ ] Real contracts on Base Sepolia
- [ ] Real S5 storage working
- [ ] Real WebSocket streaming

### Sub-phase 6.2: Performance Tests
- [ ] Latency measurements
- [ ] Concurrent session tests
- [ ] S5 storage performance
- [ ] Gas usage optimization

## Phase 7: SDK Distribution (MOVED FROM PHASE 6)

### Sub-phase 7.1: Build & Package
- [ ] ESM and CommonJS builds
- [ ] TypeScript definitions
- [ ] Source maps
- [ ] NPM package preparation

### Sub-phase 7.2: Documentation
- [ ] API documentation
- [ ] Integration guide
- [ ] Example applications
- [ ] Migration guide

---

## Test Execution Strategy

### For Each Sub-phase:
```bash
# 1. Write all tests first
npx vitest run [test-file] 
# Expected: All tests fail with "not implemented"

# 2. Show failing output
npx vitest run [test-file] 2>&1 | head -50

# 3. Implement minimal code to pass tests
# Max lines per file enforced

# 4. Verify tests pass
npx vitest run [test-file]
# Expected: All green

# 5. Check implementation size
wc -l [implementation-files]
# Must be within limits

# 6. No console errors (if applicable)
node scripts/testing/console-check.js
```

---

## Success Metrics

### Coverage Requirements
- [ ] Each sub-phase: minimum 80% test coverage
- [ ] Overall SDK: minimum 85% test coverage
- [ ] All edge cases tested
- [ ] All error paths tested

### Performance Benchmarks (via tests)
- [ ] Session creation: < 2 seconds
- [ ] Message send: < 100ms
- [ ] Response streaming: < 50ms latency
- [ ] Host discovery: < 1 second
- [ ] S5 save: < 500ms

### Line Limits (enforced via tests)
- [ ] Simple utilities: 40 lines max
- [ ] Core classes: 60-80 lines max
- [ ] Integration class: 100 lines max
- [ ] Test files: no limit

---

## Boundaries - DO NOT:
- Modify ANY files outside SDK package
- Install dependencies without approval
- Exceed line limits per file
- Write implementation before tests
- Skip test failure verification
- Implement real S5/WebSocket in MVP (use mocks)

---

## Self-Validation After Each Sub-phase:
```bash
# Check test coverage
npx vitest run --coverage

# Check no files modified outside scope
git status --short | grep -v "packages/sdk-client"
# Expected: empty

# Check line counts
find packages/sdk-client/src -name "*.ts" -not -name "*.test.ts" -exec wc -l {} \;

# Run all tests
cd packages/sdk-client && npm test
# Expected: 100% pass
```

This TDD approach ensures the implementation emerges from the tests, keeping the SDK minimal, well-tested, and properly bounded.