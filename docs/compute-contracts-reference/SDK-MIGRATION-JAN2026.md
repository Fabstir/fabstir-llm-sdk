# SDK Developer Migration Guide: January 2026 Contract Updates

**Version:** 2.0.0
**Date:** January 9, 2026
**Network:** Base Sepolia (Chain ID: 84532)
**Solidity:** ^0.8.24 (compiled with 0.8.30)

---

## Executive Summary

This guide consolidates all January 2026 contract changes affecting SDK developers. It includes both the security audit remediation (January 6) and the Solidity/ReentrancyGuard upgrade (January 9).

### Quick Impact Assessment

| Change | Impact | SDK Action |
|--------|--------|------------|
| `submitProofOfWork` signature param | **BREAKING** | Code change required |
| ProofSystem function rename | Medium | Update if calling directly |
| Solidity ^0.8.24 upgrade | None | No SDK changes |
| ReentrancyGuardTransient | None | ~4,900 gas savings per protected call |
| EIP-1153 requirement | None | No SDK changes (all target networks support) |
| Legacy Job types removed | **BREAKING** (if used) | Remove references |
| New view functions | Additive | Optional integration |

### Contract Addresses (Updated January 9, 2026)

```typescript
const CONTRACTS = {
  jobMarketplace: "0x3CaCbf3f448B420918A93a88706B26Ab27a3523E",  // ⚠️ NEW - Clean slate deployment
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2",
  proofSystem: "0x5afB91977e69Cc5003288849059bc62d47E7deeb",
  hostEarnings: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
} as const;
```

---

## 1. BREAKING: Proof Submission Requires Signature

### Overview

The `submitProofOfWork` function now requires an ECDSA signature from the session host. This is the most significant change affecting SDKs.

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
    bytes calldata signature,  // NEW: 65 bytes ECDSA signature
    string calldata proofCID
) external
```

### SDK Implementation

```typescript
import { ethers, keccak256, solidityPacked, getBytes, Wallet } from 'ethers';

interface ProofParams {
  sessionId: bigint;
  tokensClaimed: bigint;
  proofData: Uint8Array;
  proofCID: string;
}

/**
 * Generate signature for proof submission
 * The host must sign: keccak256(abi.encodePacked(proofHash, hostAddress, tokensClaimed))
 */
async function generateProofSignature(
  hostWallet: Wallet,
  proofHash: string,
  tokensClaimed: bigint
): Promise<string> {
  const dataHash = keccak256(
    solidityPacked(
      ['bytes32', 'address', 'uint256'],
      [proofHash, hostWallet.address, tokensClaimed]
    )
  );

  // EIP-191 personal sign
  return hostWallet.signMessage(getBytes(dataHash));
}

/**
 * Submit proof of work with required signature
 */
async function submitProof(
  marketplace: ethers.Contract,
  hostWallet: Wallet,
  params: ProofParams
): Promise<ethers.TransactionReceipt> {
  const { sessionId, tokensClaimed, proofData, proofCID } = params;

  // Generate proof hash from raw proof data
  const proofHash = keccak256(proofData);

  // Generate required signature
  const signature = await generateProofSignature(
    hostWallet,
    proofHash,
    tokensClaimed
  );

  // Submit with all 5 parameters
  const tx = await marketplace.submitProofOfWork(
    sessionId,
    tokensClaimed,
    proofHash,
    signature,
    proofCID
  );

  return tx.wait();
}

// Example usage
const receipt = await submitProof(
  marketplaceContract,
  hostWallet,
  {
    sessionId: 42n,
    tokensClaimed: 1000n,
    proofData: proofBytes,
    proofCID: "bafyreib..."
  }
);
```

### Verification Logic

The contract verifies signatures as follows:

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

### Error Handling

```typescript
const PROOF_ERRORS = {
  INVALID_SIGNATURE_LENGTH: "Invalid signature length",
  INVALID_SIGNATURE: "Invalid proof signature",
  ONLY_HOST: "Only host can submit proof",
  EXCESSIVE_TOKENS: "Excessive tokens claimed",
  MIN_TOKENS: "Must claim minimum tokens",
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

    if (reason.includes("Invalid signature")) {
      return { success: false, error: "Signature verification failed. Ensure host wallet matches session host." };
    }
    if (reason.includes("Only host")) {
      return { success: false, error: "Transaction must be sent by the session host." };
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

## 2. ProofSystem Function Rename

### What Changed

```solidity
// OLD - No longer exists
function verifyEKZL(bytes proof, address prover, uint256 claimedTokens) external

// NEW - Current function name
function verifyHostSignature(bytes proof, address prover, uint256 claimedTokens) external
```

### SDK Impact

**Most SDKs are NOT affected** - the `JobMarketplace` contract calls `ProofSystem` internally. Only update if your SDK calls `ProofSystem` directly:

```typescript
// BEFORE - OLD CODE (will fail)
await proofSystem.verifyEKZL(proofBytes, proverAddress, tokensClaimed);

// AFTER - NEW CODE
await proofSystem.verifyHostSignature(proofBytes, proverAddress, tokensClaimed);
```

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
import { ethers, Contract, Wallet, keccak256, solidityPacked, getBytes } from 'ethers';
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
   * Submit proof of work (host only)
   */
  async submitProof(params: {
    sessionId: bigint;
    tokensClaimed: bigint;
    proofData: Uint8Array;
    proofCID: string;
  }): Promise<ethers.TransactionReceipt> {
    if (!this.signer) throw new Error("Host signer required");

    const { sessionId, tokensClaimed, proofData, proofCID } = params;

    // Generate proof hash
    const proofHash = keccak256(proofData);

    // Generate required signature
    const dataHash = keccak256(
      solidityPacked(
        ['bytes32', 'address', 'uint256'],
        [proofHash, this.signer.address, tokensClaimed]
      )
    );
    const signature = await this.signer.signMessage(getBytes(dataHash));

    // Submit with signature
    const tx = await this.marketplace.submitProofOfWork(
      sessionId,
      tokensClaimed,
      proofHash,
      signature,
      proofCID
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

// Usage
const sdk = new FabstirSDK({
  rpcUrl: 'https://sepolia.base.org',
  jobMarketplace: '0x3CaCbf3f448B420918A93a88706B26Ab27a3523E',  // Updated Jan 9, 2026
  nodeRegistry: '0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22'
}, process.env.PRIVATE_KEY);
```

---

## 8. Migration Checklist

### Required Changes

- [ ] Update `submitProofOfWork` calls to include signature (5 params, not 4)
- [ ] Implement signature generation for proofs
- [ ] Add error handling for signature-related errors
- [ ] Update all ABI files from `client-abis/`
- [ ] Remove references to legacy Job types and events

### Recommended Changes

- [ ] Integrate new balance view functions for UI dashboards
- [ ] Integrate `getProofSubmission()` for proof tracking
- [ ] If calling ProofSystem directly: rename `verifyEKZL` to `verifyHostSignature`
- [ ] Update TypeScript types per Section 6

### Testing

- [ ] Test session creation with correct pricing
- [ ] Test proof submission with valid host signature
- [ ] Test proof submission with wrong signer (should fail)
- [ ] Test proof replay (same hash twice - should fail)
- [ ] Test session completion flow
- [ ] Test balance queries

### Verification Commands

```bash
# Check contract is accessible
cast call 0x3CaCbf3f448B420918A93a88706B26Ab27a3523E "nextJobId()" --rpc-url https://sepolia.base.org

# Check ProofSystem function exists
cast call 0x5afB91977e69Cc5003288849059bc62d47E7deeb "verifyHostSignature(bytes,address,uint256)" 0x --rpc-url https://sepolia.base.org

# Query a session
cast call 0x3CaCbf3f448B420918A93a88706B26Ab27a3523E "sessionJobs(uint256)" 1 --rpc-url https://sepolia.base.org
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
| `ProofSystemUpgradeable-CLIENT-ABI.json` | Proof verification |

### Key ABI Changes

**submitProofOfWork** - Added signature:
```json
{
  "name": "submitProofOfWork",
  "type": "function",
  "inputs": [
    {"name": "jobId", "type": "uint256"},
    {"name": "tokensClaimed", "type": "uint256"},
    {"name": "proofHash", "type": "bytes32"},
    {"name": "signature", "type": "bytes"},
    {"name": "proofCID", "type": "string"}
  ]
}
```

**ProofSystem** - Function renamed:
```json
// OLD - removed
{"name": "verifyEKZL", ...}

// NEW
{"name": "verifyHostSignature", ...}
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

**Document Version:** 2.0.0
**Last Updated:** January 9, 2026
**Previous Version:** See `SECURITY-AUDIT-SDK-MIGRATION.md` for January 6, 2026 changes
