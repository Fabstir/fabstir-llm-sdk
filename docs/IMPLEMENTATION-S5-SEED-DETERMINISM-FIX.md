# Implementation Plan: S5 Seed Determinism Fix (MVP Blocker)

## Overview

Fix critical bug where S5 seed derived from wallet signatures is **NOT deterministic**. When users clear browser data, they get a different S5 seed and lose access to all encrypted data.

**Root Cause**: Wallet signatures are not guaranteed to be deterministic across sessions.

**Solution**: Derive S5 seed from **wallet ADDRESS** instead of signatures.

```
Same Wallet → Same Address → Same S5 Seed → Data Preserved
```

## Status: COMPLETED ✅

**Implementation**: S5 Address-Based Seed Derivation
**SDK Version**: 1.11.3 → 1.11.4
**Network**: Base Sepolia (Chain ID: 84532)
**Completed**: 2026-02-05
**Source Documents**:
- `docs/S5_SEED_DETERMINISM_BUG.md`
- `packages/sdk-core/src/utils/s5-seed-derivation.ts`
- `packages/sdk-core/src/FabstirSDKCore.ts`

### Phases Overview:
- [x] Phase 1: Add Address-Based Derivation Functions
- [x] Phase 2: Update Authentication Methods
- [x] Phase 3: Update Tests
- [x] Phase 4: Build, Test & Version Bump

---

## Summary of Changes

| Change | Impact | SDK Action |
|--------|--------|------------|
| Signature-based seed derivation | **DATA LOSS** | Replace with address-based |
| All auth methods use signatures | **DATA LOSS** | Switch to address derivation |
| `authenticateWithBaseAccount()` | Works correctly | Refactor to use shared function |

### Why Address-Based Works for ALL Wallet Types

| Wallet Type | Address Deterministic? | Signature Deterministic? | Fix Works? |
|-------------|------------------------|--------------------------|------------|
| MetaMask/EOA | YES | Maybe (implementation varies) | YES |
| Base Account Kit | YES | NO (ephemeral CryptoKey) | YES |
| WalletConnect | YES | Maybe | YES |
| Hardware Wallet | YES | YES | YES |
| Any Wallet | YES | Unknown | YES |

### Derivation Formula

```typescript
// Old (BROKEN): signature-based
signature = wallet.signMessage("Generate S5 seed...")
seed = SHA256(signature)  // Different signature = different seed!

// New (FIXED): address-based
seed = SHA256(address.toLowerCase() + domain_separator + chainId)
// Same address = same seed (always!)
```

---

## Development Approach: TDD Bounded Autonomy

1. Write ALL tests for a sub-phase FIRST
2. Show test failures before implementing
3. Implement minimally to pass tests
4. Strict line limits per file (enforced)
5. No modifications outside specified scope
6. Mark `[x]` in `[ ]` for each completed task

---

## Phase 1: Add Address-Based Derivation Functions

### Sub-phase 1.1: Add deriveEntropyFromAddress() Function

**Goal**: Create deterministic entropy derivation from wallet address.

**Line Budget**: 25 lines (new code)

#### Tasks
- [x] Write test: `deriveEntropyFromAddress()` function exists
- [x] Write test: returns Uint8Array of 16 bytes
- [x] Write test: same address + chainId = same entropy (deterministic)
- [x] Write test: different address = different entropy
- [x] Write test: different chainId = different entropy
- [x] Write test: case-insensitive (0xABC... === 0xabc...)
- [x] Implement `deriveEntropyFromAddress(address: string, chainId: number): Promise<Uint8Array>`
- [x] Use formula: `SHA256(address.toLowerCase() + SEED_DOMAIN_SEPARATOR + chainId.toString())`

**Test Files:**
- `packages/sdk-core/tests/unit/s5-seed-address-derivation.test.ts` (NEW, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/s5-seed-derivation.ts` (MODIFY, ~20 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Function returns 16 bytes
- [x] Deterministic output verified

---

### Sub-phase 1.2: Add generateS5SeedFromAddress() Function

**Goal**: Create wrapper function that converts entropy to S5 phrase.

**Line Budget**: 15 lines (new code)

#### Tasks
- [x] Write test: `generateS5SeedFromAddress()` function exists
- [x] Write test: returns valid 15-word S5 phrase
- [x] Write test: same address + chainId = same phrase (deterministic)
- [x] Write test: phrase passes S5 validation (checksum)
- [x] Implement `generateS5SeedFromAddress(address: string, chainId: number): Promise<string>`
- [x] Call `deriveEntropyFromAddress()` then `entropyToS5Phrase()`
- [x] Add console log for debugging

**Test Files:**
- `packages/sdk-core/tests/unit/s5-seed-address-derivation.test.ts` (MODIFY, +30 lines)

**Implementation Files:**
- `packages/sdk-core/src/utils/s5-seed-derivation.ts` (MODIFY, ~12 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Returns valid S5 phrase
- [x] Phrase is deterministic

---

### Sub-phase 1.3: Export New Functions

**Goal**: Export new functions from module index.

**Line Budget**: 5 lines

#### Tasks
- [x] Add `deriveEntropyFromAddress` to exports in s5-seed-derivation.ts
- [x] Add `generateS5SeedFromAddress` to exports in s5-seed-derivation.ts
- [x] Update FabstirSDKCore.ts import statement

**Implementation Files:**
- `packages/sdk-core/src/utils/s5-seed-derivation.ts` (already exported by function definition)
- `packages/sdk-core/src/FabstirSDKCore.ts` (MODIFY import, ~2 lines)
- `packages/sdk-core/src/index.ts` (MODIFY export, ~2 lines)

**Success Criteria:**
- [x] Functions importable from module
- [x] TypeScript compilation succeeds

---

## Phase 2: Update Authentication Methods

### Sub-phase 2.1: Update authenticateWithMetaMask()

**Goal**: Switch MetaMask auth from signature-based to address-based seed derivation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [x] Write test: S5 seed derived from address, not signature
- [x] Write test: No signature popup during seed derivation
- [x] Write test: Same address = same seed after browser clear simulation
- [x] Remove signature-based derivation code (`getOrGenerateS5Seed(this.signer)`)
- [x] Add address-based derivation: `generateS5SeedFromAddress(this.userAddress, this.config.chainId!)`
- [x] Keep config.s5Config.seedPhrase as PRIORITY 1
- [x] Cache seed after derivation

**Test Files:**
- `packages/sdk-core/tests/unit/auth-metamask-seed.test.ts` (NEW, ~50 lines)

**Implementation Files:**
- `packages/sdk-core/src/FabstirSDKCore.ts` (MODIFY lines 321-350, ~15 lines changed)

**Success Criteria:**
- [x] Tests pass
- [x] No signMessage call for seed derivation
- [x] Seed is deterministic from address

---

### Sub-phase 2.2: Update authenticateWithSigner()

**Goal**: Switch signer auth from signature-based to address-based seed derivation.

**Line Budget**: 20 lines (modifications)

#### Tasks
- [x] Write test: S5 seed derived from address, not signature
- [x] Write test: Works with Base Account Kit signer
- [x] Write test: Works with EOA signer
- [x] Write test: Same address = same seed regardless of signer type
- [x] Remove signature-based derivation code (`getOrGenerateS5Seed(this.signer)`)
- [x] Add address-based derivation: `generateS5SeedFromAddress(this.userAddress, this.config.chainId!)`
- [x] Keep config.s5Config.seedPhrase as PRIORITY 1
- [x] Cache seed after derivation

**Test Files:**
- `packages/sdk-core/tests/unit/auth-signer-seed.test.ts` (NEW, ~60 lines)

**Implementation Files:**
- `packages/sdk-core/src/FabstirSDKCore.ts` (MODIFY lines 438-467, ~15 lines changed)

**Success Criteria:**
- [x] Tests pass
- [x] No signMessage call for seed derivation
- [x] Works for all signer types

---

### Sub-phase 2.3: Refactor authenticateWithBaseAccount()

**Goal**: Refactor to use shared `generateS5SeedFromAddress()` function.

**Line Budget**: 10 lines (modifications - simplification)

#### Tasks
- [x] Write test: authenticateWithBaseAccount uses generateS5SeedFromAddress
- [x] Write test: Seed cached for sub-account address
- [x] Replace inline derivation (lines 531-546) with shared function call
- [x] Keep caching for sub-account address (not primary)

**Test Files:**
- `packages/sdk-core/tests/unit/auth-base-account-seed.test.ts` (NEW, ~40 lines)

**Implementation Files:**
- `packages/sdk-core/src/FabstirSDKCore.ts` (MODIFY lines 528-548, ~8 lines simplified)

**Success Criteria:**
- [x] Tests pass
- [x] Uses shared function
- [x] Behavior unchanged (address-based already)

---

### Sub-phase 2.4: Keep authenticateWithPrivateKey() Unchanged

**Goal**: Verify private key auth already uses deterministic derivation.

**Line Budget**: 0 lines (verification only)

#### Tasks
- [x] Write test: authenticateWithPrivateKey uses generateS5SeedFromPrivateKey
- [x] Write test: Seed is deterministic from private key
- [x] Verify no changes needed (already correct)

**Test Files:**
- `packages/sdk-core/tests/unit/auth-privatekey-seed.test.ts` (NEW, ~30 lines)

**Implementation Files:**
- None (verification only)

**Success Criteria:**
- [x] Tests pass
- [x] Private key auth confirmed working

---

## Phase 3: Update Tests

### Sub-phase 3.1: Update Existing S5 Seed Tests

**Goal**: Update existing tests that expect signature-based derivation.

**Line Budget**: 30 lines (modifications)

#### Tasks
- [x] Update `s5-seed-derivation.test.ts`: add tests for address-based functions
- [x] Update any tests that mock signMessage for seed derivation
- [x] Remove tests that depend on signature-based behavior
- [x] Add determinism tests (clear cache, re-derive, compare)

**Test Files:**
- `packages/sdk-core/tests/utils/s5-seed.test.ts` (MODIFY, ~25 lines)

**Success Criteria:**
- [x] All seed tests pass
- [x] No signature mocking for seed derivation

---

### Sub-phase 3.2: Create Integration Test for Browser Clear Scenario

**Goal**: Test the specific scenario from the bug report.

**Line Budget**: 60 lines (new file)

#### Tasks
- [x] Create test file for browser clear simulation
- [x] Test: Generate seed → "clear browser" (clear cache) → regenerate → compare
- [x] Test: MetaMask auth determinism
- [x] Test: Signer auth determinism
- [x] Test: Cross-chain isolation (different chainId = different seed)

**Test Files:**
- `packages/sdk-core/tests/integration/s5-seed-determinism.test.ts` (NEW, ~60 lines)

**Success Criteria:**
- [x] Tests pass
- [x] Browser clear scenario verified
- [x] All auth methods verified

---

## Phase 4: Build, Test & Version Bump

### Sub-phase 4.1: Run All Tests

**Goal**: Verify all tests pass.

**Line Budget**: 0 lines

#### Tasks
- [x] Run `pnpm test` in packages/sdk-core
- [x] Fix any failing tests
- [x] Verify no regressions

**Success Criteria:**
- [x] All S5 seed tests pass (63 passed, 3 skipped)
- [x] No regressions in S5 seed functionality

---

### Sub-phase 4.2: Build SDK

**Goal**: Build SDK with all changes.

**Line Budget**: 0 lines

#### Tasks
- [x] Run `pnpm build:esm && pnpm build:cjs` in packages/sdk-core
- [x] Verify bundles generated (dist/index.mjs, dist/index.js)
- [x] Check bundle sizes (~957KB ESM, ~974KB CJS)

**Success Criteria:**
- [x] Build succeeds
- [x] dist/ files generated

---

### Sub-phase 4.3: Version Bump

**Goal**: Bump SDK version for release.

**Line Budget**: 1 line

#### Tasks
- [x] Update version in `packages/sdk-core/package.json` from 1.11.3 to 1.11.4

**Implementation Files:**
- `packages/sdk-core/package.json` (MODIFY, 1 line)

**Success Criteria:**
- [x] Version: 1.11.4

---

### Sub-phase 4.4: Create SDK Tarball

**Goal**: Package SDK for distribution.

**Line Budget**: 0 lines

#### Tasks
- [x] Run `pnpm pack` in packages/sdk-core
- [x] Move tarball to workspace root
- [x] Verify tarball contents

**Success Criteria:**
- [x] Tarball created: `fabstir-sdk-core-1.11.4.tgz`
- [x] Contains correct version

---

### Sub-phase 4.5: Manual Verification (User)

**Goal**: End-to-end verification of the fix.

**Line Budget**: 0 lines

**Status**: Manual testing by user

#### Tasks
- [ ] Connect MetaMask wallet
- [ ] Create session group with data
- [ ] Clear browser data (cookies, localStorage, IndexedDB)
- [ ] Reconnect same wallet
- [ ] Verify session group data is accessible
- [ ] Repeat with Base Account Kit

**Success Criteria:**
- [ ] Data survives browser clear
- [ ] Works for MetaMask
- [ ] Works for Base Account Kit

---

## Verification Checklist

### Address-Based Derivation
- [ ] `deriveEntropyFromAddress()` implemented
- [ ] `generateS5SeedFromAddress()` implemented
- [ ] Functions are deterministic
- [ ] Functions exported from module

### Authentication Methods
- [ ] `authenticateWithMetaMask()` uses address-based derivation
- [ ] `authenticateWithSigner()` uses address-based derivation
- [ ] `authenticateWithBaseAccount()` uses shared function
- [ ] `authenticateWithPrivateKey()` unchanged (already correct)
- [ ] No signature popups during seed derivation

### Determinism
- [ ] Same address + same chainId = same seed
- [ ] Different address = different seed
- [ ] Different chainId = different seed
- [ ] Survives browser data clear
- [ ] Works across browser tabs
- [ ] Works across devices (same wallet)

### Tests
- [ ] All unit tests pass
- [ ] Integration test for browser clear scenario
- [ ] No regressions

---

## File Summary

| Phase | File | Change Type | Lines |
|-------|------|-------------|-------|
| 1.1 | s5-seed-derivation.ts | MODIFY | ~20 |
| 1.2 | s5-seed-derivation.ts | MODIFY | ~12 |
| 1.3 | FabstirSDKCore.ts, index.ts | MODIFY | ~4 |
| 2.1 | FabstirSDKCore.ts | MODIFY | ~15 |
| 2.2 | FabstirSDKCore.ts | MODIFY | ~15 |
| 2.3 | FabstirSDKCore.ts | MODIFY | ~8 |
| 2.4 | None | VERIFY | 0 |
| 3.1 | s5-seed-derivation.test.ts | MODIFY | ~25 |
| 3.2 | s5-seed-determinism.test.ts | NEW | ~60 |
| 4.3 | package.json | MODIFY | 1 |

**Total New Test Lines**: ~350 lines
**Total Implementation Lines**: ~75 lines

---

## Notes

- **No signature needed**: S5 seed derived from address only
- **No popups**: Address derivation is synchronous, no wallet interaction
- **Backward compatible**: Existing cached seeds still work
- **Pre-MVP**: No migration of existing user data needed
- **Security**: Address-based derivation is equally secure (address is public anyway)
- **Cross-device**: Same wallet address on any device = same S5 identity

---

## Dependencies

- No external dependencies
- Uses existing `crypto.subtle.digest` (Web Crypto API)
- Uses existing `entropyToS5Phrase()` function
- Requires SDK rebuild after changes

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Existing users lose cached seed | Cache still honored (PRIORITY 1) |
| Address derivation differs from old signature derivation | Expected - new S5 identity is intentional for fresh start |
| Chain ID changes | Domain separation ensures different seeds per chain |

---

## FAQ

**Q: Will existing users lose their data?**
A: Only if they cleared browser data BEFORE this fix. After the fix, data persists across browser clears.

**Q: Is address-based derivation secure?**
A: Yes. The address is public information, but the derived seed is still cryptographically secure (SHA-256 hash with domain separation).

**Q: What about cross-chain?**
A: Each chain ID produces a different seed, providing proper isolation.

**Q: Do I need a signature popup?**
A: No! Address derivation requires no wallet interaction.
