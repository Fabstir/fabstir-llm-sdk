# Gasless Transaction Implementation Plan

## Overview

Browser-based testing harness for achieving truly gasless transactions on Base Sepolia using Coinbase Smart Wallet's default sponsorship. This implementation uses EIP-5792 `wallet_sendCalls` for proper account abstraction, avoiding the need for EOAs to hold ETH.

## Goals

- **Gasless Execution**: Zero ETH required in EOA for all operations
- **Automated Testing**: Hands-free E2E testing via Playwright + OnchainTestKit
- **Sub-accounts**: Leverage auto-spend permissions for seamless automation
- **Real Wallet Flow**: Use actual Coinbase Smart Wallet, not mock implementations

## Development Approach

- **TDD Bounded Autonomy**: Write tests first, implement minimally
- **Line Limits**: Each file stays under specified line count
- **Incremental Progress**: One sub-phase at a time
- **No Breaking Changes**: Preserve existing SDK functionality

## Phase 1: Monorepo Foundation

### Sub-phase 1.1: Workspace Configuration (50 lines) ✅

- [x] Create root package.json with Yarn workspaces
- [x] Configure workspace directories structure  
- [x] Set up shared TypeScript configuration
- [x] Add workspace scripts for build/test

**Test Files:**
- `tests/monorepo/workspace.test.js`

**Files to Create:**
- `/workspace/package.json` (root)
- `/workspace/.yarnrc.yml`
- `/workspace/tsconfig.base.json`

**Success Criteria:**
- Yarn workspaces resolve correctly
- Can run commands from root
- TypeScript configs inherit properly

### Sub-phase 1.2: SDK Package Migration (75 lines)

- [ ] Move SDK to packages/sdk directory
- [ ] Update SDK package.json for workspace
- [ ] Fix import paths and references
- [ ] Verify SDK builds in new location

**Test Files:**
- `packages/sdk/tests/migration.test.ts`

**Files to Modify:**
- `packages/sdk/package.json`
- `packages/sdk/tsconfig.json`
- `packages/sdk/src/index.ts`

**Success Criteria:**
- SDK builds without errors
- Existing tests still pass
- Can import SDK from workspace

### Sub-phase 1.3: Dependency Management (40 lines)

- [ ] Hoist common dependencies to root
- [ ] Configure peer dependencies correctly
- [ ] Set up workspace protocols
- [ ] Add development dependencies

**Test Files:**
- `tests/monorepo/dependencies.test.js`

**Files to Modify:**
- Root `package.json`
- `packages/sdk/package.json`

**Success Criteria:**
- No duplicate dependencies
- Correct version resolution
- Clean yarn install

## Phase 2: Browser Harness Application

### Sub-phase 2.1: Next.js Bootstrap (60 lines) ✅

- [x] Create apps/harness Next.js app
- [x] Configure for Base Sepolia
- [x] Set up minimal pages structure
- [x] Add development server config

**Test Files:**
- `apps/harness/tests/setup.test.ts`

**Files to Create:**
- `apps/harness/package.json`
- `apps/harness/next.config.js`
- `apps/harness/pages/_app.tsx`
- `apps/harness/pages/index.tsx`

**Success Criteria:**
- Next.js app starts on port 3000
- Can navigate to index page
- No console errors

### Sub-phase 2.2: Base Account SDK Integration (80 lines) ✅

- [x] Install @base-org/account package
- [x] Create SDK initialization module
- [x] Add provider management
- [x] Implement connection handling

**Test Files:**
- `apps/harness/tests/base-sdk.test.ts`

**Files to Create:**
- `apps/harness/lib/base-account.ts`
- `apps/harness/lib/provider.ts`

**Success Criteria:**
- Base Account SDK initializes
- Provider available globally
- Can detect wallet connection

### Sub-phase 2.3: Sub-account Management (70 lines) ✅

- [x] Implement sub-account detection
- [x] Create sub-account if missing
- [x] Handle auto-spend permissions
- [x] Store sub-account address

**Test Files:**
- `apps/harness/tests/sub-account.test.ts`

**Files to Create:**
- `apps/harness/lib/sub-account.ts`
- `apps/harness/hooks/useSubAccount.ts`

**Success Criteria:**
- Sub-account created for origin
- Auto-spend enabled by default
- Address persisted correctly

### Sub-phase 2.4: SDK Wrapper Integration (75 lines) ✅

- [x] Import fabstir SDK from workspace
- [x] Create browser-compatible wrapper
- [x] Integrate BaseAccountWallet class
- [x] Export unified interface

**Test Files:**
- `apps/harness/tests/sdk-wrapper.test.ts`

**Files to Create:**
- `apps/harness/lib/sdk-wrapper.ts`
- `apps/harness/lib/types.ts`

**Success Criteria:**
- SDK imports without errors
- BaseAccountWallet accessible
- Type definitions work

### Sub-phase 2.5: EIP-5792 Batch Implementation (85 lines) ✅

- [x] Build USDC approval call
- [x] Build job creation call
- [x] Implement wallet_sendCalls
- [x] Add status polling

**Test Files:**
- `apps/harness/tests/batch-calls.test.ts`

**Files to Create:**
- `apps/harness/lib/batch-calls.ts`
- `apps/harness/lib/call-builder.ts`

**Success Criteria:**
- Batch calls constructed correctly
- EIP-5792 v2 format used
- Status polling works

### Sub-phase 2.6: UI Components (65 lines) ✅

- [x] Create run button component
- [x] Add status display
- [x] Implement loading states
- [x] Show transaction results

**Test Files:**
- `apps/harness/tests/components.test.tsx`

**Files to Create:**
- `apps/harness/components/RunButton.tsx`
- `apps/harness/components/StatusDisplay.tsx`
- `apps/harness/pages/run.tsx`

**Success Criteria:**
- Button triggers batch calls
- Status updates displayed
- Results shown to user

### Sub-phase 2.7: Keep-Alive & Monitoring (50 lines)

- [ ] Implement connection keep-alive
- [ ] Add periodic capability checks
- [ ] Monitor long-running operations
- [ ] Handle connection drops

**Test Files:**
- `apps/harness/tests/keep-alive.test.ts`

**Files to Create:**
- `apps/harness/lib/keep-alive.ts`
- `apps/harness/hooks/useConnection.ts`

**Success Criteria:**
- Connection stays active
- No timeout during long tests
- Graceful reconnection

## Phase 3: E2E Test Automation

### Sub-phase 3.1: Playwright Setup (55 lines) ✅

- [x] Install Playwright dependencies
- [x] Configure for Chrome browser
- [x] Set up test directory structure
- [x] Add base test utilities

**Test Files:**
- `apps/harness/e2e/setup.spec.ts`

**Files to Create:**
- `apps/harness/playwright.config.ts`
- `apps/harness/e2e/utils.ts`

**Success Criteria:**
- Playwright runs successfully
- Chrome browser launches
- Can navigate to harness

### Sub-phase 3.2: OnchainTestKit Integration (70 lines) ✅

- [x] Install OnchainTestKit package
- [x] Configure wallet automation
- [x] Set up modal handling
- [x] Add transaction approval

**Test Files:**
- `apps/harness/e2e/testkit.spec.ts`

**Files to Create:**
- `apps/harness/e2e/testkit-setup.ts`
- `apps/harness/e2e/wallet-automation.ts`

**Success Criteria:**
- Wallet modal automated
- Transactions auto-approved
- No manual intervention

### Sub-phase 3.3: WebAuthn Automation (60 lines) ✅

- [x] Enable CDP for Chrome
- [x] Add virtual authenticator
- [x] Configure passkey handling
- [x] Test passkey flow

**Test Files:**
- `apps/harness/e2e/webauthn.spec.ts`

**Files to Create:**
- `apps/harness/e2e/webauthn-setup.ts`
- `apps/harness/e2e/cdp-config.ts`

**Success Criteria:**
- Passkeys auto-approved
- No OS prompts appear
- Authentication seamless

### Sub-phase 3.4: USDC Flow Migration (90 lines)

- [ ] Port usdc-mvp-flow-v2 test logic
- [ ] Adapt for browser environment
- [ ] Add balance assertions
- [ ] Verify gasless execution

**Test Files:**
- `apps/harness/e2e/usdc-flow.spec.ts`

**Files to Create:**
- `apps/harness/e2e/usdc-flow.ts`
- `apps/harness/e2e/assertions.ts`

**Success Criteria:**
- Full USDC flow executes
- Zero ETH spent from EOA
- All assertions pass

### Sub-phase 3.5: CI/CD Integration (45 lines)

- [ ] Add GitHub Actions workflow
- [ ] Configure test environment
- [ ] Set up artifact collection
- [ ] Add test reporting

**Files to Create:**
- `.github/workflows/e2e-gasless.yml`
- `apps/harness/e2e/ci-config.ts`

**Success Criteria:**
- Tests run in CI
- Reports generated
- Artifacts saved

## Phase 4: Production Readiness

### Sub-phase 4.1: Error Handling (60 lines)

- [ ] Add comprehensive error boundaries
- [ ] Implement retry mechanisms
- [ ] Add fallback strategies
- [ ] Log errors appropriately

**Test Files:**
- `apps/harness/tests/error-handling.test.ts`

**Files to Create:**
- `apps/harness/lib/error-handler.ts`
- `apps/harness/components/ErrorBoundary.tsx`

### Sub-phase 4.2: Performance Optimization (50 lines)

- [ ] Optimize bundle size
- [ ] Add request caching
- [ ] Implement lazy loading
- [ ] Monitor performance metrics

**Test Files:**
- `apps/harness/tests/performance.test.ts`

**Files to Create:**
- `apps/harness/lib/cache.ts`
- `apps/harness/lib/metrics.ts`

### Sub-phase 4.3: Documentation (40 lines)

- [ ] Create harness README
- [ ] Document test procedures
- [ ] Add troubleshooting guide
- [ ] Update main SDK docs

**Files to Create:**
- `apps/harness/README.md`
- `docs/GASLESS_TESTING.md`
- `docs/TROUBLESHOOTING.md`

## Success Criteria

### Phase 1 Complete
- [ ] Monorepo structure working
- [ ] SDK migrated successfully
- [ ] Dependencies managed correctly

### Phase 2 Complete
- [ ] Harness app functional
- [ ] Sub-accounts working
- [ ] Batch calls executing
- [ ] UI responsive

### Phase 3 Complete
- [ ] E2E tests automated
- [ ] No manual intervention
- [ ] USDC flow ported
- [ ] CI/CD integrated

### Phase 4 Complete
- [ ] Production ready
- [ ] Error handling robust
- [ ] Performance optimized
- [ ] Fully documented

## Testing Strategy

1. **Write test first** - Define expected behavior
2. **Run test** - Verify it fails initially
3. **Implement minimally** - Just enough to pass
4. **Refactor** - Clean up if needed
5. **Verify** - All tests still pass

## Current Status

- **Phase 1**: 📋 Ready to start
- **Phase 2**: ⏳ Pending Phase 1
- **Phase 3**: ⏳ Pending Phase 2
- **Phase 4**: ⏳ Pending Phase 3

## Implementation Notes

- Start with Sub-phase 1.1 (Workspace Configuration)
- Complete each sub-phase before moving to next
- Keep changes minimal and focused
- Preserve existing SDK functionality
- Document as you go

## References

- [Base Documentation - Batch Transactions](https://docs.base.org/base-account/improve-ux/batch-transactions)
- [Base Documentation - Sub Accounts](https://docs.base.org/base-account/improve-ux/sub-accounts)
- [OnchainTestKit Documentation](https://onchaintestkit.xyz/)
- [EIP-5792 Specification](https://www.eip5792.xyz/)
- [Playwright Documentation](https://playwright.dev/)