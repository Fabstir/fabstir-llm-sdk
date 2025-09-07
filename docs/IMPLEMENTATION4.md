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

### Protocol Reference
See `docs/node-reference/Fabstir SDK → Fabstir-LLM-Node Communication Protocol Report.md` for complete protocol specification including:
- WebSocket message formats (session_init, session_resume, prompt, response)
- Session initialization and resumption procedures
- Data flow architecture and sequence diagrams
- Recovery procedures for host crashes
- Security considerations and performance optimizations

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
- [x] Create `tests/integration/inference-websocket.test.ts` (20 tests)
  - [x] Test connection to host WebSocket with authentication
  - [x] Test session_init message protocol
  - [x] Test session_resume with conversation_context
  - [x] Test JWT token handling
  - [x] Test connection timeout and retry logic
- [x] Enhance connection methods with new protocol
  - [x] `connectToSession(sessionId, hostUrl, jobId, conversationContext?): Promise<void>`
  - [x] `initializeSession(sessionId, jobId): Promise<void>` - Send session_init
  - [x] `resumeSession(sessionId, conversationContext): Promise<void>` - Send session_resume
  - [x] `resumeSessionWithHistory(sessionId, hostUrl, jobId): Promise<void>` - Load from S5
- [x] Add authentication support
  - [x] JWT token generation and validation
  - [x] Token refresh mechanism
  - [x] Permission-based access control
  - [x] Session expiry handling
- [x] Implement server-side context management
  - [x] Send only new prompts during active session
  - [x] Send conversation_context array on resume
  - [x] Let node handle context truncation
  - [x] Track message indices for ordering
- [x] Test files: `tests/integration/inference-websocket.test.ts`

### Sub-phase 11.3: Prompt Sending and Response Handling (Max 250 lines) - OPTIMIZED FOR NODE
- [x] Create `tests/integration/inference-prompts.test.ts` (25 tests)
  - [x] Test prompt with server-side context management
  - [x] Test streaming response handling
  - [x] Test conversation_context array format
  - [x] Test message compression
  - [x] Test rate limiting handling
- [x] Update prompt methods for new protocol
  - [x] `sendPrompt(prompt, options)` - Send only prompt text, not context
  - [x] Use proper message format: `{type: 'prompt', session_id, content, message_index}`
  - [x] Handle compressed responses when enabled
  - [x] Track tokens from server response
- [x] Add message signing for secure sessions
  - [x] Ed25519 signature generation
  - [x] Signature verification
  - [x] Timestamp validation
  - [x] Replay attack prevention
- [x] Optimize for efficiency
  - [x] Enable gzip compression for large contexts
  - [x] Batch multiple prompts when possible
  - [x] Cache responses locally
  - [x] Minimize redundant data transmission
- [x] Test files: `tests/integration/inference-prompts.test.ts`

### Sub-phase 11.4: Token Tracking and Billing (Max 150 lines)
- [x] Create `tests/unit/token-tracking.test.ts` (20 tests)
  - [x] Test token counting accuracy
  - [x] Test cost calculation
  - [x] Test token limit enforcement
  - [x] Test billing event emission
  - [x] Test usage statistics
- [x] Implement token tracking
  - [x] `getTokenUsage(sessionId: string): number`
  - [x] `estimateTokens(prompt: string): number`
  - [x] `getSessionCost(sessionId: string): BigNumber`
  - [x] `getRemainingTokens(sessionId: string): number`
- [x] Add billing integration
  - [x] Track tokens per prompt
  - [x] Accumulate session totals
  - [x] Calculate costs based on pricing
  - [x] Emit billing events
- [x] Usage statistics
  - [x] Average tokens per prompt
  - [x] Total tokens per session
  - [x] Cost breakdown
- [x] Test files: `tests/unit/token-tracking.test.ts`

### Sub-phase 11.5: Security Integration (Max 150 lines) - NEW FROM NODE UPGRADE
- [x] Create `tests/integration/inference-security.test.ts` (20 tests)
  - [x] Test JWT authentication flow
  - [x] Test token refresh mechanism
  - [x] Test Ed25519 message signing
  - [x] Test signature verification
  - [x] Test permission-based access
- [x] Implement JWT authentication
  - [x] `authenticateSession(jobId): Promise<string>` - Get JWT token
  - [x] `refreshToken(token): Promise<string>` - Refresh expired token
  - [x] `validateToken(token): boolean` - Validate JWT claims
  - [x] Auto-refresh before expiry
- [x] Add Ed25519 signing support
  - [x] Generate key pairs for signing
  - [x] Sign critical messages (high-value prompts)
  - [x] Verify signatures from node
  - [x] Store keys securely
- [x] Implement permission controls
  - [x] Check permissions before operations
  - [x] Handle permission denied errors
  - [x] Request elevated permissions
  - [x] Track permission usage
- [x] Test files: `tests/integration/inference-security.test.ts`

### Sub-phase 11.6: EZKL Proof Generation and Verification (Max 200 lines)
- [x] Create `tests/integration/inference-proofs.test.ts` (25 tests)
  - [x] Test proof generation for inference
  - [x] Test proof verification
  - [x] Test proof submission to contract
  - [x] Test invalid proof handling
  - [x] Test proof caching
- [x] Implement proof methods
  - [x] `generateProof(sessionId: string, tokensUsed: number): Promise<string>`
  - [x] `verifyProof(proof: string): Promise<boolean>`
  - [x] `submitProof(sessionId: string, proof: string): Promise<TxReceipt>`
  - [x] `getProofHistory(sessionId: string): Promise<ProofData[]>`
- [x] Add proof generation logic
  - [x] Collect inference data
  - [x] Generate EZKL proof structure
  - [x] Hash proof for verification
  - [x] Cache generated proofs
- [x] Contract integration
  - [x] Submit proof to ProofSystem contract
  - [x] Handle proof acceptance/rejection
  - [x] Update session with proof status
- [x] Test files: `tests/integration/inference-proofs.test.ts`

### Sub-phase 11.7: Conversation Management (Max 150 lines) - LEVERAGING NODE CACHE
- [x] Create `tests/integration/conversation-management.test.ts` (20 tests)
  - [x] Test conversation with server-side context
  - [x] Test session recovery with full history
  - [x] Test context truncation by node
  - [x] Test conversation export from S5
  - [x] Test seamless host switching
- [x] Update conversation methods for stateless hosts
  - [x] `getConversation(sessionId)` - Load from S5 storage
  - [x] `resumeSessionWithHistory(sessionId, hostUrl, jobId)` - Resume with context
  - [x] `exportConversation(sessionId, format)` - Export from S5
  - [x] `switchHost(sessionId, newHostUrl)` - Move session to new host
- [x] Optimize storage strategy
  - [x] Store every message in S5 immediately
  - [x] Load full history when resuming
  - [x] Let node handle context window
  - [x] Implement efficient caching
- [x] Test files: `tests/integration/conversation-management.test.ts`

## Phase 12: Enhanced Node Discovery

### Sub-phase 12.1: NodeRegistry Integration (Max 200 lines)
- [x] Create `tests/integration/node-registry-discovery.test.ts` (25 tests)
  - [x] Test querying active nodes
  - [x] Test parsing node metadata
  - [x] Test filtering by capabilities
  - [x] Test handling inactive nodes
  - [x] Test registry event monitoring
- [x] Create `src/discovery/NodeRegistryClient.ts`
  - [x] Constructor with contract address
  - [x] Connect to NodeRegistry contract
  - [x] Parse contract ABI
  - [x] Handle contract errors
- [x] Implement registry methods
  - [x] `getAllActiveNodes(): Promise<string[]>`
  - [x] `getNodeMetadata(address: string): Promise<NodeMetadata>`
  - [x] `isNodeActive(address: string): Promise<boolean>`
  - [x] `getNodeStake(address: string): Promise<BigNumber>`
- [x] Add metadata parsing
  - [x] Parse JSON metadata
  - [x] Validate metadata schema
  - [x] Extract capabilities
  - [x] Handle malformed data
- [x] Test files: `tests/integration/node-registry-discovery.test.ts`

### Sub-phase 12.2: P2P Discovery Enhancement (Max 200 lines)
- [x] Create `tests/integration/p2p-discovery-enhanced.test.ts` (25 tests)
  - [x] Test mDNS local discovery
  - [x] Test DHT global discovery
  - [x] Test bootstrap node connection
  - [x] Test peer capability announcement
  - [x] Test network topology mapping
- [x] Enhance DiscoveryManager P2P capabilities
  - [x] `discoverLocalNodes(): Promise<Node[]>`
  - [x] `discoverGlobalNodes(): Promise<Node[]>`
  - [x] `announceCapabilities(capabilities: string[]): Promise<void>`
  - [x] `searchByCapability(capability: string): Promise<Node[]>`
- [x] Add discovery strategies
  - [x] mDNS for local network
  - [x] Kademlia DHT for global
  - [x] Bootstrap node fallback
  - [x] Hybrid discovery mode
- [x] Implement peer management
  - [x] Peer reputation tracking
  - [x] Connection quality metrics
  - [x] Blacklist management
  - [x] Preferred peer list
- [x] Test files: `tests/integration/p2p-discovery-enhanced.test.ts`

### Sub-phase 12.3: HTTP Discovery Service Integration (Max 150 lines)
- [x] Create `tests/integration/http-discovery-service.test.ts` (20 tests)
  - [x] Test querying discovery service
  - [x] Test filtering by model
  - [x] Test latency-based selection
  - [x] Test caching discovery results
  - [x] Test fallback on service failure
- [x] Create `src/discovery/HttpDiscoveryClient.ts`
  - [x] Constructor with discovery URL
  - [x] HTTP client setup
  - [x] Request retry logic
  - [x] Response caching
- [x] Implement HTTP discovery methods
  - [x] `discoverHosts(filter?: HostFilter): Promise<Host[]>`
  - [x] `getHostDetails(hostId: string): Promise<HostDetails>`
  - [x] `pingHost(url: string): Promise<number>`
  - [x] `reportHost(hostId: string, issue: string): Promise<void>`
- [x] Add result caching
  - [x] TTL-based cache
  - [x] Cache invalidation
  - [x] Background refresh
- [x] Test files: `tests/integration/http-discovery-service.test.ts`

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