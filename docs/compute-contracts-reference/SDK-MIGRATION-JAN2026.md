# SDK Developer Migration Guide: January-February 2026 Contract Updates

**Version:** 3.0.0
**Date:** February 4, 2026
**Network:** Base Sepolia (Chain ID: 84532)
**Solidity:** ^0.8.24 (compiled with 0.8.30)

---

## Executive Summary

This guide consolidates all January-February 2026 contract changes affecting SDK developers. It includes security audit remediation, Solidity version upgrade, gas optimizations, and the **February 4, 2026 signature removal**.

### Quick Impact Assessment

| Change | Impact | SDK Action |
|--------|--------|------------|
| **Signature REMOVED** (Feb 4) | **SIMPLIFICATION** | Remove signature generation code |
| `submitProofOfWork` 5 params | **BREAKING** | Update function call (remove signature) |
| `deltaCID` parameter (Jan 14) | Required | Add deltaCID to submissions |
| ProofSystem changes | Medium | Update if calling directly |
| Solidity ^0.8.24 upgrade | None | No SDK changes |
| ReentrancyGuardTransient | None | ~4,900 gas savings per protected call |
| Legacy Job types removed | **BREAKING** (if used) | Remove references |
| New view functions | Additive | Optional integration |

### Contract Addresses (Updated February 4, 2026)

```typescript
// REMEDIATION CONTRACTS - Use these for new development
const CONTRACTS = {
  jobMarketplace: "0x95132177F964FF053C1E874b53CF74d819618E06",  // ✅ Signature removed
  proofSystem: "0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31",    // ✅ markProofUsed only
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",
  hostEarnings: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
} as const;

// FROZEN AUDIT CONTRACTS - Do not use for new development
const FROZEN_CONTRACTS = {
  jobMarketplace: "0x3CaCbf3f448B420918A93a88706B26Ab27a3523E",  // 🔒 Frozen
  proofSystem: "0x5afB91977e69Cc5003288849059bc62d47E7deeb",    // 🔒 Frozen
} as const;
```

---

## 1. SIMPLIFIED: Proof Submission (No Signature Required!)

### Overview (February 4, 2026 Update)

**Good news!** The signature requirement has been **removed**. Authentication is now handled via `msg.sender == session.host` check, which provides equivalent security with ~3,000 gas savings per proof.

### Current Function Signature (5 Parameters)

```solidity
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    string calldata proofCID,
    string calldata deltaCID    // For incremental changes (can be "")
) external
```

### SDK Implementation (Simplified!)

```typescript
import { ethers, keccak256, Wallet } from 'ethers';

interface ProofParams {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofData: Uint8Array;
  proofCID: string;
  deltaCID?: string;  // Optional - use "" if not tracking
}

/**
 * Submit proof of work - NO SIGNATURE NEEDED!
 * Authentication is via msg.sender == session.host
 */
async function submitProof(
  marketplace: ethers.Contract,
  hostWallet: Wallet,
  params: ProofParams
): Promise<ethers.TransactionReceipt> {
  const { sessionId, tokensClaimed, proofData, proofCID, deltaCID = "" } = params;

  // Generate proof hash from raw proof data
  const proofHash = keccak256(proofData);

  // Submit directly - no signature generation needed!
  const tx = await marketplace.submitProofOfWork(
    sessionId,
    tokensClaimed,
    proofHash,
    proofCID,
    deltaCID
  );

  return tx.wait();
}

// Example usage - much simpler now!
const receipt = await submitProof(
  marketplaceContract,
  hostWallet,
  {
    sessionId: 42n,
    tokensClaimed: 1000n,
    proofData: proofBytes,
    proofCID: "bafyreib...",
    deltaCID: ""  // Optional
  }
);
```

### Migration from Signature-Based Code

```typescript
// OLD CODE (January 2026) - REMOVE THIS COMPLEXITY
const dataHash = keccak256(solidityPacked(['bytes32', 'address', 'uint256'], [proofHash, hostAddress, tokensClaimed]));
const signature = await hostWallet.signMessage(getBytes(dataHash));
await marketplace.submitProofOfWork(sessionId, tokensClaimed, proofHash, signature, proofCID, deltaCID);

// NEW CODE (February 2026) - SIMPLER!
await marketplace.submitProofOfWork(sessionId, tokensClaimed, proofHash, proofCID, deltaCID);
```

### Error Handling (Updated)

```typescript
const PROOF_ERRORS = {
  ONLY_HOST: "Only host can submit proof",
  EXCESSIVE_TOKENS: "Excessive tokens claimed",
  MIN_TOKENS: "Must claim minimum tokens",
  UNAUTHORIZED: "Unauthorized",  // ProofSystem not configured
} as const;

async function submitProofWithErrorHandling(
  marketplace: ethers.Contract,
  hostWallet: Wallet,
  params: ProofParams
): Promise<{ success: boolean; receipt?: ethers.TransactionReceipt; error?: string }> {
  try {
    const receipt = await submitProof(marketplace, hostWallet, params);
    return { success: true, receipt };
  } catch (error: any) {
    const reason = error.reason || error.message || "Unknown error";

    if (reason.includes("Only host")) {
      return { success: false, error: "Transaction must be sent by the session host wallet." };
    }
    if (reason.includes("Excessive tokens")) {
      return { success: false, error: "Token claim exceeds rate limit. Wait longer between proofs." };
    }
    if (reason.includes("minimum tokens")) {
      return { success: false, error: "Must claim at least 100 tokens per proof." };
    }

    return { success: false, error: reason };
  }
}
```

---

## 2. ProofSystem Changes (February 4, 2026)

### What Changed

The signature verification functions have been **removed**. ProofSystem now only provides replay protection:

```solidity
// REMOVED - No longer exist
function verifyEKZL(bytes proof, address prover, uint256 claimedTokens) external
function verifyHostSignature(bytes proof, address prover, uint256 claimedTokens) external
function verifyAndMarkComplete(...) external

// NEW - Simple replay protection only
function markProofUsed(bytes32 proofHash) external returns (bool)
```

### SDK Impact

**Most SDKs are NOT affected** - the `JobMarketplace` contract calls `ProofSystem.markProofUsed()` internally. You do NOT need to call ProofSystem directly.

If you were calling ProofSystem directly for signature verification, **remove that code** - it's no longer needed.

---

## 3. New View Functions

### Balance Tracking

```typescript
interface UserBalances {
  withdrawable: bigint;  // Available for immediate withdrawal
  locked: bigint;        // Locked in active sessions
  total: bigint;         // withdrawable + locked
}

async function getUserBalances(
  marketplace: ethers.Contract,
  userAddress: string,
  tokenAddress?: string
): Promise<UserBalances> {
  const isNative = !tokenAddress || tokenAddress === ethers.ZeroAddress;

  const [withdrawable, locked, total] = await Promise.all([
    marketplace.depositBalances(userAddress, tokenAddress || ethers.ZeroAddress),
    isNative
      ? marketplace.getLockedBalanceNative(userAddress)
      : marketplace.getLockedBalanceToken(userAddress, tokenAddress),
    isNative
      ? marketplace.getTotalBalanceNative(userAddress)
      : marketplace.getTotalBalanceToken(userAddress, tokenAddress)
  ]);

  return { withdrawable, locked, total };
}
```

### Proof Query

```typescript
interface ProofSubmission {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: bigint;
  verified: boolean;
}

async function getSessionProofs(
  marketplace: ethers.Contract,
  sessionId: bigint
): Promise<ProofSubmission[]> {
  const proofs: ProofSubmission[] = [];
  let index = 0;

  while (true) {
    try {
      const [proofHash, tokensClaimed, timestamp, verified] =
        await marketplace.getProofSubmission(sessionId, index);
      proofs.push({ proofHash, tokensClaimed, timestamp, verified });
      index++;
    } catch {
      break;
    }
  }

  return proofs;
}
```

---

## 4. Session Management

### Creating Sessions

```typescript
interface CreateSessionParams {
  host: string;
  deposit: bigint;
  pricePerToken: bigint;      // With PRICE_PRECISION (×1000)
  maxDuration: bigint;        // Seconds
  proofInterval: bigint;      // Seconds between proofs
  modelId: string;            // bytes32 model identifier
  paymentToken?: string;      // USDC address or undefined for ETH
}

async function createSession(
  marketplace: ethers.Contract,
  nodeRegistry: ethers.Contract,
  params: CreateSessionParams
): Promise<{ sessionId: bigint; receipt: ethers.TransactionReceipt }> {
  const { host, deposit, pricePerToken, maxDuration, proofInterval, modelId, paymentToken } = params;

  // Verify host pricing before creating session
  const [minNative, minStable] = await nodeRegistry.getNodePricing(host);
  const isStable = !!paymentToken && paymentToken !== ethers.ZeroAddress;
  const minPrice = isStable ? minStable : minNative;

  if (pricePerToken < minPrice) {
    throw new Error(`Price ${pricePerToken} below host minimum ${minPrice}`);
  }

  let tx;
  if (isStable) {
    tx = await marketplace.createSessionJobWithToken(
      host,
      paymentToken,
      deposit,
      pricePerToken,
      maxDuration,
      proofInterval,
      modelId
    );
  } else {
    tx = await marketplace.createSessionJob(
      host,
      pricePerToken,
      maxDuration,
      proofInterval,
      modelId,
      { value: deposit }
    );
  }

  const receipt = await tx.wait();

  // Extract session ID from event
  const event = receipt.logs.find(
    (log: any) => log.fragment?.name === 'SessionJobCreated'
  );
  const sessionId = event?.args?.jobId;

  return { sessionId, receipt };
}
```

### Completing Sessions

```typescript
async function completeSession(
  marketplace: ethers.Contract,
  sessionId: bigint,
  conversationCID: string
): Promise<ethers.TransactionReceipt> {
  // Anyone can complete - gasless for users
  const tx = await marketplace.completeSessionJob(sessionId, conversationCID);
  return tx.wait();
}
```

---

## 5. Pricing with PRICE_PRECISION

### Overview

All prices use a 1000x multiplier for sub-dollar precision:

```typescript
const PRICE_PRECISION = 1000n;

// Convert USD/million to pricePerToken
function usdToPrice(usdPerMillion: number): bigint {
  return BigInt(Math.floor(usdPerMillion * 1000));
}

// Convert pricePerToken to USD/million
function priceToUsd(pricePerToken: bigint): number {
  return Number(pricePerToken) / 1000;
}
```

### Examples

| USD/Million | pricePerToken |
|------------|---------------|
| $0.06 | 60 |
| $0.50 | 500 |
| $1.00 | 1000 |
| $5.00 | 5000 |
| $10.00 | 10000 |

### Cost Calculations

```typescript
/**
 * Calculate maximum tokens from deposit
 */
function calculateMaxTokens(deposit: bigint, pricePerToken: bigint): bigint {
  return (deposit * PRICE_PRECISION) / pricePerToken;
}

/**
 * Calculate cost from token usage
 */
function calculateCost(tokensUsed: bigint, pricePerToken: bigint): bigint {
  return (tokensUsed * pricePerToken) / PRICE_PRECISION;
}

// Example: 10 USDC at $5/million
const deposit = 10_000_000n; // 10 USDC (6 decimals)
const price = 5000n;         // $5/million
const maxTokens = calculateMaxTokens(deposit, price);
// = (10_000_000 * 1000) / 5000 = 2,000,000 tokens
```

---

## 6. Removed Legacy Types

The following are removed from the ABI and should be removed from SDKs:

### Functions Removed

| Function | Replacement |
|----------|-------------|
| `claimWithProof()` | Use `submitProofOfWork()` + `completeSessionJob()` |

### Types Removed

```typescript
// REMOVE these type definitions if present
interface Job { ... }
enum JobStatus { ... }
enum JobType { ... }
interface JobDetails { ... }
interface JobRequirements { ... }

// KEEP using these
interface SessionJob {
  depositor: string;
  host: string;
  deposit: bigint;
  pricePerToken: bigint;
  maxDuration: bigint;
  startTime: bigint;
  totalTokensClaimed: bigint;
  status: SessionStatus;
  paymentToken: string;
}

enum SessionStatus {
  Active = 0,
  Completed = 1,
  TimedOut = 2,
  Disputed = 3,
  Abandoned = 4,
  Cancelled = 5
}
```

### Events Removed

```typescript
// REMOVE event listeners for
// - JobPosted
// - JobClaimed
// - JobCompleted

// KEEP listening to
// - SessionJobCreated
// - SessionJobCompleted
// - ProofSubmitted
// - EarningsCredited
```

---

## 7. Complete SDK Class Example

```typescript
import { ethers, Contract, Wallet, keccak256 } from 'ethers';
import JobMarketplaceABI from './abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import NodeRegistryABI from './abis/NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json';

const PRICE_PRECISION = 1000n;

interface FabstirConfig {
  rpcUrl: string;
  jobMarketplace: string;
  nodeRegistry: string;
}

export class FabstirSDK {
  private provider: ethers.JsonRpcProvider;
  private marketplace: Contract;
  private nodeRegistry: Contract;
  private signer?: Wallet;

  constructor(config: FabstirConfig, privateKey?: string) {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);

    if (privateKey) {
      this.signer = new Wallet(privateKey, this.provider);
    }

    this.marketplace = new Contract(
      config.jobMarketplace,
      JobMarketplaceABI,
      this.signer || this.provider
    );

    this.nodeRegistry = new Contract(
      config.nodeRegistry,
      NodeRegistryABI,
      this.signer || this.provider
    );
  }

  /**
   * Get host pricing (required before creating sessions)
   */
  async getHostPricing(hostAddress: string): Promise<{ native: bigint; stable: bigint }> {
    const [native, stable] = await this.nodeRegistry.getNodePricing(hostAddress);
    return { native, stable };
  }

  /**
   * Create a new session
   */
  async createSession(params: {
    host: string;
    deposit: bigint;
    pricePerToken: bigint;
    maxDuration: bigint;
    proofInterval: bigint;
    modelId: string;
    paymentToken?: string;
  }): Promise<bigint> {
    if (!this.signer) throw new Error("Signer required for transactions");

    const { host, deposit, pricePerToken, maxDuration, proofInterval, modelId, paymentToken } = params;

    let tx;
    if (paymentToken && paymentToken !== ethers.ZeroAddress) {
      tx = await this.marketplace.createSessionJobWithToken(
        host, paymentToken, deposit, pricePerToken, maxDuration, proofInterval, modelId
      );
    } else {
      tx = await this.marketplace.createSessionJob(
        host, pricePerToken, maxDuration, proofInterval, modelId,
        { value: deposit }
      );
    }

    const receipt = await tx.wait();
    const event = receipt.logs.find((l: any) => l.fragment?.name === 'SessionJobCreated');
    return event?.args?.jobId;
  }

  /**
   * Submit proof of work (host only) - NO SIGNATURE NEEDED!
   * Authentication is via msg.sender == session.host
   */
  async submitProof(params: {
    sessionId: bigint;
    tokensClaimed: bigint;
    proofData: Uint8Array;
    proofCID: string;
    deltaCID?: string;
  }): Promise<ethers.TransactionReceipt> {
    if (!this.signer) throw new Error("Host signer required");

    const { sessionId, tokensClaimed, proofData, proofCID, deltaCID = "" } = params;

    // Generate proof hash
    const proofHash = keccak256(proofData);

    // Submit directly - no signature needed! (Feb 4, 2026)
    const tx = await this.marketplace.submitProofOfWork(
      sessionId,
      tokensClaimed,
      proofHash,
      proofCID,
      deltaCID
    );

    return tx.wait();
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: bigint, conversationCID: string): Promise<ethers.TransactionReceipt> {
    if (!this.signer) throw new Error("Signer required");
    const tx = await this.marketplace.completeSessionJob(sessionId, conversationCID);
    return tx.wait();
  }

  /**
   * Get session details
   */
  async getSession(sessionId: bigint): Promise<any> {
    return this.marketplace.sessionJobs(sessionId);
  }

  /**
   * Get user balances
   */
  async getUserBalances(userAddress: string, tokenAddress?: string): Promise<{
    withdrawable: bigint;
    locked: bigint;
    total: bigint;
  }> {
    const isNative = !tokenAddress || tokenAddress === ethers.ZeroAddress;

    const [withdrawable, locked, total] = await Promise.all([
      this.marketplace.depositBalances(userAddress, tokenAddress || ethers.ZeroAddress),
      isNative
        ? this.marketplace.getLockedBalanceNative(userAddress)
        : this.marketplace.getLockedBalanceToken(userAddress, tokenAddress!),
      isNative
        ? this.marketplace.getTotalBalanceNative(userAddress)
        : this.marketplace.getTotalBalanceToken(userAddress, tokenAddress!)
    ]);

    return { withdrawable, locked, total };
  }
}

// Usage - Use REMEDIATION contracts (Feb 4, 2026)
const sdk = new FabstirSDK({
  rpcUrl: 'https://sepolia.base.org',
  jobMarketplace: '0x95132177F964FF053C1E874b53CF74d819618E06',  // Remediation proxy
  nodeRegistry: '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22'
}, process.env.PRIVATE_KEY);
```

---

## 8. Migration Checklist

### Required Changes (February 4, 2026)

- [ ] **REMOVE** signature generation code (no longer needed!)
- [ ] Update `submitProofOfWork` to 5 params (remove signature, keep deltaCID)
- [ ] Update contract address to remediation: `0x95132177F964FF053C1E874b53CF74d819618E06`
- [ ] Update all ABI files from `client-abis/`
- [ ] Remove references to legacy Job types and events

### Recommended Changes

- [ ] Integrate new balance view functions for UI dashboards
- [ ] Integrate `getProofSubmission()` for proof tracking
- [ ] Remove any direct calls to ProofSystem (no longer needed)
- [ ] Update TypeScript types per Section 6

### Testing

- [ ] Test session creation with correct pricing
- [ ] Test proof submission without signature (should work!)
- [ ] Test proof submission from non-host wallet (should fail)
- [ ] Test proof replay (same hash twice - should fail)
- [ ] Test session completion flow
- [ ] Test balance queries

### Verification Commands

```bash
# Check REMEDIATION contract is accessible
cast call 0x95132177F964FF053C1E874b53CF74d819618E06 "nextJobId()" --rpc-url https://sepolia.base.org

# Check ProofSystem markProofUsed exists
cast call 0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31 "usedProofs(bytes32)" 0x0000000000000000000000000000000000000000000000000000000000000000 --rpc-url https://sepolia.base.org

# Query a session
cast call 0x95132177F964FF053C1E874b53CF74d819618E06 "sessionJobs(uint256)" 1 --rpc-url https://sepolia.base.org
```

---

## 9. ABI Files

Download latest ABIs from `client-abis/`:

| File | Purpose |
|------|---------|
| `JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json` | Session/proof management |
| `NodeRegistryWithModelsUpgradeable-CLIENT-ABI.json` | Host queries |
| `ModelRegistryUpgradeable-CLIENT-ABI.json` | Model validation |
| `HostEarningsUpgradeable-CLIENT-ABI.json` | Earnings withdrawal |
| `ProofSystemUpgradeable-CLIENT-ABI.json` | Proof replay protection |

### Key ABI Changes (February 4, 2026)

**submitProofOfWork** - Signature REMOVED, deltaCID added (5 params):
```json
{
  "name": "submitProofOfWork",
  "type": "function",
  "inputs": [
    {"name": "jobId", "type": "uint256"},
    {"name": "tokensClaimed", "type": "uint256"},
    {"name": "proofHash", "type": "bytes32"},
    {"name": "proofCID", "type": "string"},
    {"name": "deltaCID", "type": "string"}
  ]
}
```

**ProofSystem** - Signature verification removed:
```json
// REMOVED - no longer exist
{"name": "verifyEKZL", ...}
{"name": "verifyHostSignature", ...}
{"name": "verifyAndMarkComplete", ...}

// NEW - simple replay protection
{"name": "markProofUsed", "inputs": [{"name": "proofHash", "type": "bytes32"}]}
```

---

## 10. NodeRegistry: Corrupt Node Recovery (January 10, 2026)

### Problem

During contract upgrades, some registered hosts ended up in a "corrupt" state where:
- `nodes[host].active = true`
- `activeNodesIndex[host] = 0`
- But the host was NOT in `activeNodesList[]`

This caused `unregisterNode()` to fail or corrupt other nodes' data.

### Solution

Two fixes have been deployed:

**1. Safety check in `unregisterNode()`** - Hosts can now unregister even with corrupt state:

```typescript
const nodeRegistry = new ethers.Contract(
  '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22',  // Same for both remediation and frozen
  NodeRegistryABI,
  hostWallet
);

// Works even if host has corrupt state
await nodeRegistry.unregisterNode();
// Stake is returned, node data is cleared
```

**2. New `repairCorruptNode()` admin function** - Owner can fix corrupt hosts:

```typescript
// Owner-only function to repair corrupt nodes
await nodeRegistry.repairCorruptNode(corruptHostAddress);
// Emits: CorruptNodeRepaired(address operator, uint256 stakeReturned)
```

### For SDK Developers

- Update NodeRegistry ABI to include `repairCorruptNode` and `CorruptNodeRepaired` event
- The `unregisterNode()` function now safely handles corrupt state - no SDK changes required
- Listen for `CorruptNodeRepaired` event if tracking node lifecycle

---

## 11. Support

- GitHub Issues: https://github.com/fabstirp2p/contracts/issues
- Documentation: https://docs.fabstir.com
- See also: `SECURITY-AUDIT-SDK-MIGRATION.md` for additional security details

---

**Document Version:** 3.0.0
**Last Updated:** February 4, 2026

### Version History
- **3.0.0** (Feb 4, 2026): Signature removal - simplified proof submission
- **2.0.0** (Jan 10, 2026): Added corrupt node recovery documentation
- **1.0.0** (Jan 9, 2026): Initial release with signature requirement

**Previous Version:** See `SECURITY-AUDIT-SDK-MIGRATION.md` for January 6, 2026 changes
