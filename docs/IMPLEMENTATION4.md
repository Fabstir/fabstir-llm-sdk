# IMPLEMENTATION4.md - InferenceManager & Enhanced Node Discovery

## Overview
Implement the missing inference capabilities in the SDK using the manager pattern. This enables clients to perform real LLM inference through high-level abstractions without dealing with low-level WebSocket/HTTP details. Following TDD bounded autonomy approach where tests are written first for each sub-phase.

**UPDATE (Jan 2025)**: The fabstir-llm-node has been upgraded with production-ready features including:
- ✅ Stateless memory cache for conversation context (server-side management)
- ✅ WebSocket protocol with session_init, session_resume, prompt messages
- ✅ JWT authentication and Ed25519 message signing
- ✅ Message compression (40% bandwidth reduction)
- ✅ Rate limiting and monitoring capabilities

### Key Changes to Implementation Strategy:
1. **Server-Side Context Management**: Node now handles conversation context in memory during sessions. SDK only needs to send new prompts, not full history each time.
2. **Proper WebSocket Protocol**: Use session_init/session_resume messages with conversation_context array format
3. **Security First**: Integrate JWT auth and Ed25519 signing from the start
4. **Efficiency**: Enable compression and let node handle context truncation
5. **Stateless Host Recovery**: SDK maintains full history in S5 for seamless host switching

## Phase 11: InferenceManager Implementation (UPDATED)

### Sub-phase 11.1: Core InferenceManager Architecture (Max 150 lines) ✅ COMPLETED
- [x] Create `tests/unit/InferenceManager.test.ts` (25 tests)
  - [x] Test initialization with dependencies
  - [x] Test session connection validation
  - [x] Test error handling for missing session
  - [x] Test WebSocket lifecycle management
  - [x] Test message queue handling
- [x] Create `src/managers/InferenceManager.ts` base class
  - [x] Constructor accepting AuthManager, SessionManager, WebSocketClient
  - [x] Private fields for active connections and message queues
  - [x] Connection state management
  - [x] Error handling and retry logic
- [x] Create `src/types/inference.ts` for interfaces
  - [x] InferenceOptions interface
  - [x] InferenceResult interface
  - [x] StreamCallback type
  - [x] ProofData interface
- [x] Update `src/FabstirSDK.ts`
  - [x] Import InferenceManager
  - [x] Add private inferenceManager field
  - [x] Implement getInferenceManager() method
- [x] Test files: Created multiple integration tests demonstrating real inference

### Sub-phase 11.2: WebSocket Connection Management (Max 200 lines) - UPDATED FOR NODE UPGRADE
- [ ] Create `tests/integration/inference-websocket.test.ts` (20 tests)
  - [ ] Test connection to host WebSocket with authentication
  - [ ] Test session_init message protocol
  - [ ] Test session_resume with conversation_context
  - [ ] Test JWT token handling
  - [ ] Test connection timeout and retry logic
- [ ] Enhance connection methods with new protocol
  - [ ] `connectToSession(sessionId, hostUrl, jobId, conversationContext?): Promise<void>`
  - [ ] `initializeSession(sessionId, jobId): Promise<void>` - Send session_init
  - [ ] `resumeSession(sessionId, conversationContext): Promise<void>` - Send session_resume
  - [ ] `resumeSessionWithHistory(sessionId, hostUrl, jobId): Promise<void>` - Load from S5
- [ ] Add authentication support
  - [ ] JWT token generation and validation
  - [ ] Token refresh mechanism
  - [ ] Permission-based access control
  - [ ] Session expiry handling
- [ ] Implement server-side context management
  - [ ] Send only new prompts during active session
  - [ ] Send conversation_context array on resume
  - [ ] Let node handle context truncation
  - [ ] Track message indices for ordering
- [ ] Test files: `tests/integration/inference-websocket.test.ts`

### Sub-phase 11.3: Prompt Sending and Response Handling (Max 250 lines) - OPTIMIZED FOR NODE
- [ ] Create `tests/integration/inference-prompts.test.ts` (25 tests)
  - [ ] Test prompt with server-side context management
  - [ ] Test streaming response handling
  - [ ] Test conversation_context array format
  - [ ] Test message compression
  - [ ] Test rate limiting handling
- [ ] Update prompt methods for new protocol
  - [ ] `sendPrompt(prompt, options)` - Send only prompt text, not context
  - [ ] Use proper message format: `{type: 'prompt', session_id, content, message_index}`
  - [ ] Handle compressed responses when enabled
  - [ ] Track tokens from server response
- [ ] Add message signing for secure sessions
  - [ ] Ed25519 signature generation
  - [ ] Signature verification
  - [ ] Timestamp validation
  - [ ] Replay attack prevention
- [ ] Optimize for efficiency
  - [ ] Enable gzip compression for large contexts
  - [ ] Batch multiple prompts when possible
  - [ ] Cache responses locally
  - [ ] Minimize redundant data transmission
- [ ] Test files: `tests/integration/inference-prompts.test.ts`

### Sub-phase 11.4: Token Tracking and Billing (Max 150 lines)
- [ ] Create `tests/unit/token-tracking.test.ts` (20 tests)
  - [ ] Test token counting accuracy
  - [ ] Test cost calculation
  - [ ] Test token limit enforcement
  - [ ] Test billing event emission
  - [ ] Test usage statistics
- [ ] Implement token tracking
  - [ ] `getTokenUsage(sessionId: string): number`
  - [ ] `estimateTokens(prompt: string): number`
  - [ ] `getSessionCost(sessionId: string): BigNumber`
  - [ ] `getRemainingTokens(sessionId: string): number`
- [ ] Add billing integration
  - [ ] Track tokens per prompt
  - [ ] Accumulate session totals
  - [ ] Calculate costs based on pricing
  - [ ] Emit billing events
- [ ] Usage statistics
  - [ ] Average tokens per prompt
  - [ ] Total tokens per session
  - [ ] Cost breakdown
- [ ] Test files: `tests/unit/token-tracking.test.ts`

### Sub-phase 11.5: Security Integration (Max 150 lines) - NEW FROM NODE UPGRADE
- [ ] Create `tests/integration/inference-security.test.ts` (20 tests)
  - [ ] Test JWT authentication flow
  - [ ] Test token refresh mechanism
  - [ ] Test Ed25519 message signing
  - [ ] Test signature verification
  - [ ] Test permission-based access
- [ ] Implement JWT authentication
  - [ ] `authenticateSession(jobId): Promise<string>` - Get JWT token
  - [ ] `refreshToken(token): Promise<string>` - Refresh expired token
  - [ ] `validateToken(token): boolean` - Validate JWT claims
  - [ ] Auto-refresh before expiry
- [ ] Add Ed25519 signing support
  - [ ] Generate key pairs for signing
  - [ ] Sign critical messages (high-value prompts)
  - [ ] Verify signatures from node
  - [ ] Store keys securely
- [ ] Implement permission controls
  - [ ] Check permissions before operations
  - [ ] Handle permission denied errors
  - [ ] Request elevated permissions
  - [ ] Track permission usage
- [ ] Test files: `tests/integration/inference-security.test.ts`

### Sub-phase 11.6: EZKL Proof Generation and Verification (Max 200 lines)
- [ ] Create `tests/integration/inference-proofs.test.ts` (25 tests)
  - [ ] Test proof generation for inference
  - [ ] Test proof verification
  - [ ] Test proof submission to contract
  - [ ] Test invalid proof handling
  - [ ] Test proof caching
- [ ] Implement proof methods
  - [ ] `generateProof(sessionId: string, tokensUsed: number): Promise<string>`
  - [ ] `verifyProof(proof: string): Promise<boolean>`
  - [ ] `submitProof(sessionId: string, proof: string): Promise<TxReceipt>`
  - [ ] `getProofHistory(sessionId: string): Promise<ProofData[]>`
- [ ] Add proof generation logic
  - [ ] Collect inference data
  - [ ] Generate EZKL proof structure
  - [ ] Hash proof for verification
  - [ ] Cache generated proofs
- [ ] Contract integration
  - [ ] Submit proof to ProofSystem contract
  - [ ] Handle proof acceptance/rejection
  - [ ] Update session with proof status
- [ ] Test files: `tests/integration/inference-proofs.test.ts`

### Sub-phase 11.7: Conversation Management (Max 150 lines) - LEVERAGING NODE CACHE
- [ ] Create `tests/integration/conversation-management.test.ts` (20 tests)
  - [ ] Test conversation with server-side context
  - [ ] Test session recovery with full history
  - [ ] Test context truncation by node
  - [ ] Test conversation export from S5
  - [ ] Test seamless host switching
- [ ] Update conversation methods for stateless hosts
  - [ ] `getConversation(sessionId)` - Load from S5 storage
  - [ ] `resumeSessionWithHistory(sessionId, hostUrl, jobId)` - Resume with context
  - [ ] `exportConversation(sessionId, format)` - Export from S5
  - [ ] `switchHost(sessionId, newHostUrl)` - Move session to new host
- [ ] Optimize storage strategy
  - [ ] Store every message in S5 immediately
  - [ ] Load full history when resuming
  - [ ] Let node handle context window
  - [ ] Implement efficient caching
- [ ] Test files: `tests/integration/conversation-management.test.ts`

## Phase 12: Enhanced Node Discovery

### Sub-phase 12.1: NodeRegistry Integration (Max 200 lines)
- [ ] Create `tests/integration/node-registry-discovery.test.ts` (25 tests)
  - [ ] Test querying active nodes
  - [ ] Test parsing node metadata
  - [ ] Test filtering by capabilities
  - [ ] Test handling inactive nodes
  - [ ] Test registry event monitoring
- [ ] Create `src/discovery/NodeRegistryClient.ts`
  - [ ] Constructor with contract address
  - [ ] Connect to NodeRegistry contract
  - [ ] Parse contract ABI
  - [ ] Handle contract errors
- [ ] Implement registry methods
  - [ ] `getAllActiveNodes(): Promise<string[]>`
  - [ ] `getNodeMetadata(address: string): Promise<NodeMetadata>`
  - [ ] `isNodeActive(address: string): Promise<boolean>`
  - [ ] `getNodeStake(address: string): Promise<BigNumber>`
- [ ] Add metadata parsing
  - [ ] Parse JSON metadata
  - [ ] Validate metadata schema
  - [ ] Extract capabilities
  - [ ] Handle malformed data
- [ ] Test files: `tests/integration/node-registry-discovery.test.ts`

### Sub-phase 12.2: P2P Discovery Enhancement (Max 200 lines)
- [ ] Create `tests/integration/p2p-discovery-enhanced.test.ts` (25 tests)
  - [ ] Test mDNS local discovery
  - [ ] Test DHT global discovery
  - [ ] Test bootstrap node connection
  - [ ] Test peer capability announcement
  - [ ] Test network topology mapping
- [ ] Enhance DiscoveryManager P2P capabilities
  - [ ] `discoverLocalNodes(): Promise<Node[]>`
  - [ ] `discoverGlobalNodes(): Promise<Node[]>`
  - [ ] `announceCapabilities(capabilities: string[]): Promise<void>`
  - [ ] `searchByCapability(capability: string): Promise<Node[]>`
- [ ] Add discovery strategies
  - [ ] mDNS for local network
  - [ ] Kademlia DHT for global
  - [ ] Bootstrap node fallback
  - [ ] Hybrid discovery mode
- [ ] Implement peer management
  - [ ] Peer reputation tracking
  - [ ] Connection quality metrics
  - [ ] Blacklist management
  - [ ] Preferred peer list
- [ ] Test files: `tests/integration/p2p-discovery-enhanced.test.ts`

### Sub-phase 12.3: HTTP Discovery Service Integration (Max 150 lines)
- [ ] Create `tests/integration/http-discovery-service.test.ts` (20 tests)
  - [ ] Test querying discovery service
  - [ ] Test filtering by model
  - [ ] Test latency-based selection
  - [ ] Test caching discovery results
  - [ ] Test fallback on service failure
- [ ] Create `src/discovery/HttpDiscoveryClient.ts`
  - [ ] Constructor with discovery URL
  - [ ] HTTP client setup
  - [ ] Request retry logic
  - [ ] Response caching
- [ ] Implement HTTP discovery methods
  - [ ] `discoverHosts(filter?: HostFilter): Promise<Host[]>`
  - [ ] `getHostDetails(hostId: string): Promise<HostDetails>`
  - [ ] `pingHost(url: string): Promise<number>`
  - [ ] `reportHost(hostId: string, issue: string): Promise<void>`
- [ ] Add result caching
  - [ ] TTL-based cache
  - [ ] Cache invalidation
  - [ ] Background refresh
- [ ] Test files: `tests/integration/http-discovery-service.test.ts`

### Sub-phase 12.4: Optimal Host Selection (Max 200 lines)
- [ ] Create `tests/unit/host-selection.test.ts` (25 tests)
  - [ ] Test selection by price
  - [ ] Test selection by latency
  - [ ] Test selection by capability
  - [ ] Test multi-criteria scoring
  - [ ] Test load balancing
- [ ] Create `src/discovery/HostSelector.ts`
  - [ ] Constructor with selection strategy
  - [ ] Scoring algorithm
  - [ ] Weight configuration
  - [ ] Selection history
- [ ] Implement selection methods
  - [ ] `selectOptimalHost(hosts: Host[], criteria: SelectionCriteria): Host`
  - [ ] `rankHosts(hosts: Host[], weights: Weights): Host[]`
  - [ ] `filterByRequirements(hosts: Host[], requirements: Requirements): Host[]`
  - [ ] `loadBalance(hosts: Host[]): Host`
- [ ] Add selection strategies
  - [ ] Lowest price
  - [ ] Lowest latency
  - [ ] Best reputation
  - [ ] Composite scoring
  - [ ] Round-robin
- [ ] Performance tracking
  - [ ] Selection success rate
  - [ ] Average session duration
  - [ ] Host reliability scores
- [ ] Test files: `tests/unit/host-selection.test.ts`

### Sub-phase 12.5: Unified Discovery Interface (Max 150 lines)
- [ ] Create `tests/integration/unified-discovery.test.ts` (20 tests)
  - [ ] Test combining all discovery sources
  - [ ] Test deduplication
  - [ ] Test priority ordering
  - [ ] Test fallback chain
  - [ ] Test discovery caching
- [ ] Update DiscoveryManager with unified interface
  - [ ] `discoverAllHosts(): Promise<Host[]>`
  - [ ] `setDiscoveryPriority(order: string[]): void`
  - [ ] `enableDiscoverySource(source: string, enabled: boolean): void`
  - [ ] `getDiscoveryStats(): DiscoveryStats`
- [ ] Implement aggregation logic
  - [ ] Merge results from all sources
  - [ ] Remove duplicate hosts
  - [ ] Apply global filters
  - [ ] Sort by preference
- [ ] Add monitoring
  - [ ] Discovery source health
  - [ ] Success rates per source
  - [ ] Average discovery time
  - [ ] Cache hit rates
- [ ] Test files: `tests/integration/unified-discovery.test.ts`

## Phase 13: Real LLM Node Integration (Optional - Post MVP)

### Sub-phase 13.1: Fabstir LLM Node Client (Max 200 lines)
- [ ] Create `tests/integration/llm-node-client.test.ts` (25 tests)
  - [ ] Test health check endpoint
  - [ ] Test model listing
  - [ ] Test inference request
  - [ ] Test streaming response
  - [ ] Test error handling
- [ ] Create `src/inference/LLMNodeClient.ts`
  - [ ] HTTP/WebSocket client for Fabstir LLM Node
  - [ ] Support all API endpoints from docs/node-reference/API.md
  - [ ] Handle authentication if required
  - [ ] Implement retry and timeout logic
- [ ] Test files: `tests/integration/llm-node-client.test.ts`

## Testing Strategy

### Unit Tests
- Each manager method should have at least 2 unit tests (happy path + error case)
- Mock all external dependencies
- Test boundary conditions and edge cases
- Achieve >80% code coverage

### Integration Tests
- Test actual WebSocket connections (with mock server)
- Test contract interactions (on test network)
- Test P2P discovery (with local nodes)
- Test end-to-end flows

### TDD Bounded Autonomy Rules
1. Write ALL tests for a sub-phase FIRST
2. Run tests and see them fail
3. Implement ONLY enough code to pass tests
4. Stay within line limits for each sub-phase
5. No modifications outside specified scope

## Success Criteria

### Phase 11 Complete When:
- [ ] InferenceManager fully integrated into SDK
- [ ] All manager methods implemented and tested
- [ ] Real WebSocket communication working
- [ ] EZKL proof generation functional
- [ ] Token tracking accurate
- [ ] All tests passing (>80% coverage)

### Phase 12 Complete When:
- [ ] All discovery sources integrated
- [ ] Optimal host selection working
- [ ] Discovery results deduplicated and cached
- [ ] Performance metrics collected
- [ ] All tests passing (>80% coverage)

## Notes

- InferenceManager bridges the gap between session creation and actual LLM usage
- Discovery enhancements ensure reliable host finding across multiple sources
- All managers follow consistent patterns for easier maintenance
- Client applications only use high-level manager methods, never low-level protocols
- Tests are written first to drive implementation (TDD approach)