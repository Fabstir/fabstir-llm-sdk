# SDK Migration Guide: Security Audit Remediation

**Branch:** `fix/security-audit-remediation`
**Date:** January 6, 2026
**Network:** Base Sepolia (Chain ID: 84532)

---

## Executive Summary

This document covers all SDK-relevant changes from the security audit remediation. The most significant change is a **BREAKING CHANGE** to `submitProofOfWork()` which now requires hosts to sign their proofs.

### Impact Classification

| Change Type | Impact | Action Required |
|-------------|--------|-----------------|
| `submitProofOfWork` signature | **BREAKING** | SDK code change required |
| New view functions | Additive | Optional integration |
| Removed legacy functions | **BREAKING** (if used) | Remove any usage |
| Contract addresses | Implementation only | No SDK change (proxies unchanged) |

---

## 1. BREAKING CHANGE: submitProofOfWork Signature

### What Changed

The `submitProofOfWork` function signature changed from **4 parameters to 5 parameters**. A new `signature` parameter was added for ECDSA signature verification.

### Old Signature (NO LONGER WORKS)

```solidity
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    string calldata proofCID
) external
```

### New Signature (REQUIRED)

```solidity
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    bytes calldata signature,  // NEW: 65 bytes (r, s, v)
    string calldata proofCID
) external
```

### Why This Changed

The security audit identified that proof submissions had no verification - anyone could claim tokens without actual proof of work. The new signature requirement ensures:

1. **Host Authorization**: Only the session host can submit proofs for their session
2. **Non-repudiation**: The host cryptographically commits to the token count
3. **Replay Prevention**: Each proof hash can only be used once

### SDK Migration Code

```typescript
import { ethers, keccak256, solidityPacked, getBytes, Wallet } from 'ethers';

interface ProofSubmission {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofData: Uint8Array;  // The actual proof data
  proofCID: string;       // S5 storage CID
}

/**
 * Submit a proof of work with host signature
 * @param marketplace - JobMarketplace contract instance
 * @param hostWallet - The host's wallet (must be session host)
 * @param submission - Proof submission data
 */
async function submitProofOfWork(
  marketplace: ethers.Contract,
  hostWallet: Wallet,
  submission: ProofSubmission
): Promise<ethers.TransactionReceipt> {
  const { sessionId, tokensClaimed, proofData, proofCID } = submission;

  // Step 1: Generate proof hash from proof data
  const proofHash = keccak256(proofData);

  // Step 2: Create the data hash that will be signed
  // Format: keccak256(proofHash, hostAddress, tokensClaimed)
  const dataHash = keccak256(
    solidityPacked(
      ['bytes32', 'address', 'uint256'],
      [proofHash, hostWallet.address, tokensClaimed]
    )
  );

  // Step 3: Sign the data hash (produces EIP-191 signed message)
  const signature = await hostWallet.signMessage(getBytes(dataHash));

  // Step 4: Submit to contract with all 5 parameters
  const tx = await marketplace.submitProofOfWork(
    sessionId,
    tokensClaimed,
    proofHash,
    signature,  // 65 bytes: r (32) + s (32) + v (1)
    proofCID
  );

  return tx.wait();
}

// Usage example:
const receipt = await submitProofOfWork(
  marketplaceContract,
  hostWallet,
  {
    sessionId: 42n,
    tokensClaimed: 1000n,
    proofData: starkProofBytes,
    proofCID: "bafyreib..."
  }
);
```

### Error Handling

New error messages your SDK should handle:

| Error Message | Cause | SDK Action |
|--------------|-------|------------|
| `"Invalid signature length"` | Signature not 65 bytes | Ensure wallet.signMessage returns proper format |
| `"Invalid proof signature"` | Wrong signer or invalid sig | Verify host wallet matches session.host |
| `"Invalid proof signature"` | Replay attack (proofHash reused) | Generate unique proofHash per submission |

### Signature Verification Details

The contract verifies signatures using this logic:

```solidity
// Contract-side verification
bytes32 dataHash = keccak256(abi.encodePacked(proofHash, prover, claimedTokens));
bytes32 ethSignedMessageHash = keccak256(abi.encodePacked(
    "\x19Ethereum Signed Message:\n32",
    dataHash
));
address recoveredSigner = ecrecover(ethSignedMessageHash, v, r, s);
require(recoveredSigner == session.host, "Invalid proof signature");
```

**Important**: The signature MUST be created by the session's host address. Signatures from other wallets will be rejected.

---

## 2. New View Function: getProofSubmission

### Function Signature

```solidity
function getProofSubmission(
    uint256 sessionId,
    uint256 proofIndex
) external view returns (
    bytes32 proofHash,
    uint256 tokensClaimed,
    uint256 timestamp,
    bool verified
)
```

### Purpose

Retrieve details of a specific proof submission, including whether it passed verification.

### SDK Integration

```typescript
interface ProofSubmissionData {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: bigint;
  verified: boolean;
}

async function getProofSubmission(
  marketplace: ethers.Contract,
  sessionId: bigint,
  proofIndex: number
): Promise<ProofSubmissionData> {
  const [proofHash, tokensClaimed, timestamp, verified] =
    await marketplace.getProofSubmission(sessionId, proofIndex);

  return {
    proofHash,
    tokensClaimed,
    timestamp,
    verified
  };
}

// Get all proofs for a session
async function getAllSessionProofs(
  marketplace: ethers.Contract,
  sessionId: bigint
): Promise<ProofSubmissionData[]> {
  const proofs: ProofSubmissionData[] = [];
  let index = 0;

  while (true) {
    try {
      const proof = await getProofSubmission(marketplace, sessionId, index);
      proofs.push(proof);
      index++;
    } catch {
      break; // No more proofs
    }
  }

  return proofs;
}
```

### The `verified` Field

| Value | Meaning |
|-------|---------|
| `true` | ProofSystem verified the signature successfully |
| `false` | ProofSystem was not configured (graceful degradation) |

**Note**: If `verified` is `false`, it means the marketplace was deployed without a ProofSystem configured. This is allowed for backward compatibility but proofs are not cryptographically verified.

---

## 3. New Balance View Functions

Four new view functions provide transparency into user fund states:

### Functions

```solidity
// View locked funds in active sessions
function getLockedBalanceNative(address user) external view returns (uint256)
function getLockedBalanceToken(address user, address token) external view returns (uint256)

// View total balance (withdrawable + locked)
function getTotalBalanceNative(address user) external view returns (uint256)
function getTotalBalanceToken(address user, address token) external view returns (uint256)
```

### SDK Integration

```typescript
interface UserBalances {
  withdrawable: bigint;
  locked: bigint;
  total: bigint;
}

async function getUserBalances(
  marketplace: ethers.Contract,
  userAddress: string,
  tokenAddress?: string  // undefined for native ETH
): Promise<UserBalances> {
  let withdrawable: bigint;
  let locked: bigint;
  let total: bigint;

  if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
    // Native ETH
    withdrawable = await marketplace.depositBalances(userAddress, ethers.ZeroAddress);
    locked = await marketplace.getLockedBalanceNative(userAddress);
    total = await marketplace.getTotalBalanceNative(userAddress);
  } else {
    // ERC20 token
    withdrawable = await marketplace.depositBalances(userAddress, tokenAddress);
    locked = await marketplace.getLockedBalanceToken(userAddress, tokenAddress);
    total = await marketplace.getTotalBalanceToken(userAddress, tokenAddress);
  }

  return { withdrawable, locked, total };
}
```

### Use Cases

1. **Display User Dashboard**: Show users their available vs locked funds
2. **Withdrawal Validation**: Check withdrawable amount before attempting withdrawal
3. **Session Tracking**: Monitor how much is locked in active sessions

---

## 4. Removed Functions and Types (Legacy Cleanup)

The following were removed as they were unreachable dead code:

### Removed from ABI

| Item | Type | Notes |
|------|------|-------|
| `claimWithProof()` | Function | Never callable (required Job to be Completed, but Job flow was deprecated) |
| `JobPosted` | Event | Part of legacy Job system |
| `JobClaimed` | Event | Part of legacy Job system |
| `JobCompleted` | Event | Part of legacy Job system |
| `Job` | Struct | Use `SessionJob` instead |
| `JobStatus` | Enum | Use `SessionStatus` instead |
| `JobType` | Enum | Not used |
| `JobDetails` | Struct | Not used |
| `JobRequirements` | Struct | Not used |

### SDK Action Required

If your SDK references any of these, remove them:

```typescript
// REMOVE these if present:
// - Any reference to marketplace.claimWithProof()
// - Any listener for JobPosted, JobClaimed, JobCompleted events
// - Any type definitions for Job, JobStatus, JobType, JobDetails, JobRequirements

// KEEP using:
// - SessionJob struct
// - SessionStatus enum
// - SessionJobCreated, SessionCompleted events
```

---

## 5. Contract Addresses

### Proxy Addresses (UNCHANGED - Use These)

```typescript
const CONTRACTS = {
  jobMarketplace: "0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D",
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",
  proofSystem: "0x5afB91977e69Cc5003288849059bc62d47E7deeb",
  hostEarnings: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
} as const;
```

### Implementation Addresses (Updated - For Reference Only)

The proxy addresses remain the same; only the underlying implementations changed:

| Contract | New Implementation |
|----------|-------------------|
| JobMarketplace | `0x05c7d3a1b748dEbdbc12dd75D1aC195fb93228a3` |
| ProofSystem | `0xf0DA90e1ae1A3aB7b9Da47790Abd73D26b17670F` |

**SDK Impact**: None. Continue using proxy addresses.

---

## 6. Security Improvements (Background)

These fixes don't require SDK changes but are good to know:

### Host Validation
- Hosts must now be registered in NodeRegistry to accept sessions
- Session creation reverts if host is not active in NodeRegistry

### Double-Spend Prevention
- Fixed deposit tracking for inline session creation
- Users cannot withdraw funds that are locked in active sessions

### ProofSystem Access Control
- `recordVerifiedProof()` now requires authorization
- Prevents front-running attacks on proof submission

---

## 7. Complete Migration Checklist

### Required Changes

- [ ] Update `submitProofOfWork` calls to include signature parameter
- [ ] Implement signature generation in host-side code
- [ ] Add error handling for new signature-related errors
- [ ] Update ABI files to latest versions from `client-abis/`

### Recommended Changes

- [ ] Integrate `getProofSubmission()` for proof tracking
- [ ] Integrate balance view functions for user dashboards
- [ ] Remove any references to legacy Job types/events
- [ ] Add TypeScript types for new functions

### Testing Checklist

- [ ] Test proof submission with valid signature
- [ ] Test proof submission with invalid signature (should fail)
- [ ] Test proof submission with wrong host wallet (should fail)
- [ ] Test replay attack (same proofHash twice - should fail)
- [ ] Verify getProofSubmission returns correct `verified` status

---

## 8. TypeScript Types

```typescript
// New types for SDK
export interface ProofSubmissionParams {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofHash: string;      // bytes32
  signature: string;      // bytes (65 bytes hex)
  proofCID: string;
}

export interface ProofSubmissionResult {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: bigint;
  verified: boolean;
}

export interface UserBalanceInfo {
  withdrawable: bigint;
  locked: bigint;
  total: bigint;
}

// SessionStatus enum (unchanged)
export enum SessionStatus {
  Active = 0,
  Completed = 1,
  TimedOut = 2,
  Disputed = 3,
  Abandoned = 4,
  Cancelled = 5
}
```

---

## 9. Quick Reference: Before & After

### Proof Submission

**Before:**
```typescript
await marketplace.submitProofOfWork(sessionId, tokens, proofHash, proofCID);
```

**After:**
```typescript
const dataHash = keccak256(solidityPacked(
  ['bytes32', 'address', 'uint256'],
  [proofHash, hostAddress, tokens]
));
const signature = await hostWallet.signMessage(getBytes(dataHash));
await marketplace.submitProofOfWork(sessionId, tokens, proofHash, signature, proofCID);
```

### Checking Proof Status

**Before:** Not available

**After:**
```typescript
const [hash, tokens, time, verified] = await marketplace.getProofSubmission(sessionId, 0);
```

### Checking User Balances

**Before:** Only `depositBalances` mapping

**After:**
```typescript
const locked = await marketplace.getLockedBalanceNative(user);
const total = await marketplace.getTotalBalanceNative(user);
```

---

## 10. Support

For questions about this migration:
- Review the full API reference in `docs/API_REFERENCE.md`
- Check ABI files in `client-abis/` directory
- See `client-abis/CHANGELOG.md` for detailed change history

---

**Document Version:** 1.0
**Last Updated:** January 6, 2026
