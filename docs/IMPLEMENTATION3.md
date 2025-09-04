# IMPLEMENTATION3.md - SDK Public API Refactoring

## Overview
Extract proven functionality from integration tests into a clean public API that fabstir-llm-ui can consume. The SDK will wrap authentication and provide high-level abstractions for all LLM marketplace operations.

## Phase 10: Public API Development

### Sub-phase 10.1: Core SDK Architecture (Max 200 lines) ✅
- [x] Create `src/FabstirSDK.ts` main class (92 lines)
  - [x] Initialize with configuration
  - [x] Wrap authentication (Option A - mock implementation)
  - [x] Expose manager instances (stubs for now)
  - [x] Handle provider/signer setup
- [x] Create `src/types/index.ts` for all interfaces (42 lines)
  - [x] SessionOptions, PaymentOptions, etc.
  - [x] Response types
  - [x] Error types
- [x] Create `src/index.ts` main export file (42 lines)
- [x] Test: SDK initialization and configuration (24 unit tests in tests/unit/)

Total: 176 lines (well under 200 line limit) ✅

### Sub-phase 10.2: Authentication Manager (Max 150 lines)
- [ ] Create `src/managers/AuthManager.ts`
  - [ ] Extract from integration test setup
  - [ ] Wrap @fabstir/llm-auth internally
  - [ ] Generate S5 seeds from signatures
  - [ ] Handle multiple auth providers
- [ ] Methods:
  - [ ] `authenticate(provider: 'base' | 'metamask'): Promise<AuthResult>`
  - [ ] `getS5Seed(): string`
  - [ ] `getSigner(): ethers.Signer`
- [ ] Test: Auth flow with seed generation

### Sub-phase 10.3: Payment Manager (Max 200 lines)
- [ ] Create `src/managers/PaymentManager.ts`
  - [ ] Extract from eth-payment-cycle.test.ts
  - [ ] Extract from usdc-payment-cycle.test.ts
- [ ] Methods:
  - [ ] `createETHSession(options): Promise<string>`
  - [ ] `createUSDCSession(options): Promise<string>`
  - [ ] `approveToken(token, amount): Promise<void>`
  - [ ] `getPaymentStatus(sessionId): Promise<PaymentStatus>`
- [ ] Test: Payment operations through manager

### Sub-phase 10.3.1: Account Abstraction Gas Management (POST-MVP)
- [ ] Create `src/managers/GasManager.ts`
  - [ ] Detect smart account vs EOA
  - [ ] Estimate gas costs in USDC
  - [ ] Handle paymaster interactions
- [ ] Update PaymentManager for gas abstraction
  - [ ] Add `gasPaymentMethod` to session options
  - [ ] Route transactions through paymaster when available
  - [ ] Fallback to ETH gas for EOA accounts
- [ ] Add gas cost estimation to SDK
  - [ ] `estimateGasInUSDC(transaction): Promise<string>`
  - [ ] `canPayGasWithUSDC(): boolean`
- [ ] Test: USDC gas payments on mainnet fork
- [ ] Status: DEFERRED - Base Sepolia sponsors gas automatically

### Sub-phase 10.4: Storage Manager (Max 150 lines)
- [ ] Create `src/managers/StorageManager.ts`
  - [ ] Extract from s5-storage.test.ts
  - [ ] Handle S5 client lifecycle
- [ ] Methods:
  - [ ] `initialize(seed: string): Promise<void>`
  - [ ] `storeConversation(sessionId, data): Promise<void>`
  - [ ] `retrieveConversation(sessionId): Promise<Conversation>`
  - [ ] `listSessions(): Promise<string[]>`
  - [ ] `deleteSession(sessionId): Promise<void>`
- [ ] Test: Storage operations with encryption

### Sub-phase 10.5: Discovery Manager (Max 150 lines)
- [ ] Create `src/managers/DiscoveryManager.ts`
  - [ ] Extract from p2p-discovery.test.ts
  - [ ] Handle P2P node lifecycle
- [ ] Methods:
  - [ ] `startDiscovery(): Promise<void>`
  - [ ] `findHosts(criteria): Promise<Host[]>`
  - [ ] `getHostCapabilities(hostId): Promise<Capabilities>`
  - [ ] `selectOptimalHost(requirements): Promise<Host>`
- [ ] Test: P2P discovery through manager

### Sub-phase 10.6: Session Manager (Max 200 lines)
- [ ] Create `src/managers/SessionManager.ts`
  - [ ] Orchestrate other managers
  - [ ] Handle complete job lifecycle
- [ ] Methods:
  - [ ] `createSession(options): Promise<Session>`
  - [ ] `sendPrompt(sessionId, prompt): Promise<Response>`
  - [ ] `streamResponse(sessionId): AsyncIterator<Token>`
  - [ ] `endSession(sessionId): Promise<void>`
  - [ ] `getSessionHistory(sessionId): Promise<Message[]>`
- [ ] Test: Full session flow

### Sub-phase 10.7: High-Level SDK Interface (Max 150 lines)
- [ ] Update `src/FabstirSDK.ts` with convenience methods
  - [ ] `quickStart(prompt, options): Promise<Response>`
  - [ ] `estimateCost(prompt, model): Promise<CostEstimate>`
  - [ ] `getBalance(): Promise<Balances>`
- [ ] Add event emitters:
  - [ ] `on('sessionStarted', callback)`
  - [ ] `on('tokenReceived', callback)`
  - [ ] `on('paymentSettled', callback)`
- [ ] Test: High-level operations

### Sub-phase 10.8: Error Handling & Recovery (Max 150 lines)
- [ ] Create `src/utils/ErrorHandler.ts`
  - [ ] Network retry logic
  - [ ] Transaction failure recovery
  - [ ] User-friendly error messages
- [ ] Create custom error classes:
  - [ ] `InsufficientFundsError`
  - [ ] `HostUnavailableError`
  - [ ] `AuthenticationError`
- [ ] Test: Error scenarios and recovery

### Sub-phase 10.9: SDK Documentation & Examples (Max 200 lines)
- [ ] Create `docs/SDK_API.md` with all methods
- [ ] Create `examples/basic-usage.ts`
- [ ] Create `examples/advanced-usage.ts`
- [ ] Create `examples/ui-integration.ts`
- [ ] Update main README.md with quick start

---

## Phase 11: UI Integration Bridge

### Sub-phase 11.1: React Hooks (Max 150 lines)
- [ ] Create `src/react/useFabstirSDK.ts`
  - [ ] Hook for SDK initialization
  - [ ] Auto-reconnection logic
- [ ] Create `src/react/useSession.ts`
  - [ ] Session state management
  - [ ] Message history
- [ ] Create `src/react/usePayment.ts`
  - [ ] Payment state
  - [ ] Balance tracking
- [ ] Test: Hook functionality

### Sub-phase 11.2: SDK Context Provider (Max 100 lines)
- [ ] Create `src/react/FabstirProvider.tsx`
  - [ ] Provide SDK instance to component tree
  - [ ] Handle authentication state
  - [ ] Manage global configuration
- [ ] Test: Context provider functionality

### Sub-phase 11.3: TypeScript Types Package (Max 100 lines)
- [ ] Create `@fabstir/llm-types` package
  - [ ] Shared types between SDK and UI
  - [ ] Ensure type safety across packages
- [ ] Publish to npm or use workspace
- [ ] Test: Type imports and usage

---

## Usage Example After Implementation

```typescript
// In fabstir-llm-ui/src/App.tsx
import { FabstirSDK } from '@fabstir/llm-sdk';

const App = () => {
  const [sdk, setSdk] = useState<FabstirSDK>();
  
  const initializeSDK = async () => {
    const sdk = new FabstirSDK({
      network: 'base-sepolia',
      rpcUrl: process.env.RPC_URL
    });
    
    // SDK handles auth internally
    const { user, s5Seed } = await sdk.authenticate('base');
    
    setSdk(sdk);
  };
  
  const startSession = async () => {
    const session = await sdk.sessions.create({
      model: 'llama2-7b',
      paymentType: 'ETH',
      amount: '0.005',
      maxTokens: 1000
    });
    
    const response = await sdk.sessions.sendPrompt(
      session.id,
      "Explain blockchain"
    );
    
    // Response automatically stored in S5
    // Payment handled automatically
    // P2P discovery handled internally
  };
};