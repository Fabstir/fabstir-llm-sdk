# SDK Upgrade: Pre-Report Remediation

**Version:** 2.1.0
**Date:** January 31, 2026
**Network:** Base Sepolia (Chain ID: 84532)

---

## Overview

This guide covers the required changes to upgrade the SDK to work with the remediated contracts. These changes address security findings from the AUDIT pre-report review.

**Action Required:** Update the SDK and test against the new contracts.

### What's Changing

| Change | Impact | Section |
|--------|--------|---------|
| `proofTimeoutWindow` parameter | **BREAKING** | §1 |
| New `createSessionFromDepositForModel` | Additive | §2 |
| `deltaCID` in proof functions | Additive | §3 |
| New contract addresses | **Required** | §4 |

---

## Contract Addresses

### Test Contracts (Use These Now)

Update the SDK to use these addresses:

```typescript
const CONTRACTS = {
  jobMarketplace: "0x95132177F964FF053C1E874b53CF74d819618E06",  // NEW
  proofSystem: "0xE8DCa89e1588bbbdc4F7D5F78263632B35401B31",    // NEW
  nodeRegistry: "0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22",   // Unchanged
  modelRegistry: "0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2", // Unchanged
  hostEarnings: "0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0",  // Unchanged
  fabToken: "0xC78949004B4EB6dEf2D66e49Cd81231472612D62",
  usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
} as const;
```

### Frozen Contracts (Auditors Only)

These remain unchanged for security audit. Do not use for new development:

| Contract | Frozen Address |
|----------|----------------|
| JobMarketplace | `0x3CaCbf3f448B420918A93a88706B26Ab27a3523E` |
| ProofSystem | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` |

---

## 1. BREAKING: Session Creation Requires proofTimeoutWindow

### The Change (AUDIT-F3)

All session creation functions now require a `proofTimeoutWindow` parameter. This separates the timeout logic from `proofInterval` (which is for minimum tokens per proof).

### Constants

```solidity
uint256 public constant MIN_PROOF_TIMEOUT = 60;    // 1 minute minimum
uint256 public constant MAX_PROOF_TIMEOUT = 3600;  // 1 hour maximum
uint256 public constant DEFAULT_PROOF_TIMEOUT = 300; // 5 minutes (recommended)
```

### Updated Function Signatures

#### createSessionJob (ETH payment)

```solidity
// OLD (5 parameters)
function createSessionJob(
    address host,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256);

// NEW (6 parameters)
function createSessionJob(
    address host,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow  // NEW: 60-3600 seconds
) external payable returns (uint256);
```

#### createSessionJobForModel (ETH payment, model-specific)

```solidity
// OLD (5 parameters)
function createSessionJobForModel(
    address host,
    bytes32 modelId,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external payable returns (uint256);

// NEW (6 parameters)
function createSessionJobForModel(
    address host,
    bytes32 modelId,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow  // NEW
) external payable returns (uint256);
```

#### createSessionJobWithToken (ERC20 payment)

```solidity
// OLD (6 parameters)
function createSessionJobWithToken(
    address host,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external returns (uint256);

// NEW (7 parameters)
function createSessionJobWithToken(
    address host,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow  // NEW
) external returns (uint256);
```

#### createSessionJobForModelWithToken (ERC20 payment, model-specific)

```solidity
// OLD (7 parameters)
function createSessionJobForModelWithToken(
    address host,
    bytes32 modelId,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external returns (uint256);

// NEW (8 parameters)
function createSessionJobForModelWithToken(
    address host,
    bytes32 modelId,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow  // NEW
) external returns (uint256);
```

#### createSessionFromDeposit (Pre-deposited funds)

```solidity
// OLD (6 parameters)
function createSessionFromDeposit(
    address host,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval
) external returns (uint256);

// NEW (7 parameters)
function createSessionFromDeposit(
    address host,
    address paymentToken,
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow  // NEW
) external returns (uint256);
```

### SDK Implementation Example

```typescript
interface CreateSessionParams {
  host: string;
  modelId?: string;           // Optional: for model-specific sessions
  paymentToken?: string;      // Optional: address(0) or undefined for ETH
  deposit: bigint;
  pricePerToken: bigint;
  maxDuration: number;        // seconds
  proofInterval: number;      // minimum tokens per proof
  proofTimeoutWindow: number; // NEW: seconds before timeout (60-3600)
}

async function createSession(params: CreateSessionParams): Promise<bigint> {
  const {
    host,
    modelId,
    paymentToken,
    deposit,
    pricePerToken,
    maxDuration,
    proofInterval,
    proofTimeoutWindow = 300 // Default 5 minutes
  } = params;

  // Validate timeout window
  if (proofTimeoutWindow < 60 || proofTimeoutWindow > 3600) {
    throw new Error("proofTimeoutWindow must be between 60 and 3600 seconds");
  }

  if (modelId && !paymentToken) {
    // ETH + Model
    return await jobMarketplace.createSessionJobForModel(
      host,
      modelId,
      pricePerToken,
      maxDuration,
      proofInterval,
      proofTimeoutWindow,
      { value: deposit }
    );
  } else if (modelId && paymentToken) {
    // Token + Model
    return await jobMarketplace.createSessionJobForModelWithToken(
      host,
      modelId,
      paymentToken,
      deposit,
      pricePerToken,
      maxDuration,
      proofInterval,
      proofTimeoutWindow
    );
  } else if (!modelId && paymentToken) {
    // Token, no Model
    return await jobMarketplace.createSessionJobWithToken(
      host,
      paymentToken,
      deposit,
      pricePerToken,
      maxDuration,
      proofInterval,
      proofTimeoutWindow
    );
  } else {
    // ETH, no Model
    return await jobMarketplace.createSessionJob(
      host,
      pricePerToken,
      maxDuration,
      proofInterval,
      proofTimeoutWindow,
      { value: deposit }
    );
  }
}
```

---

## 2. NEW: createSessionFromDepositForModel

### The Change (AUDIT-F5)

New function allows users with pre-deposited funds to create model-specific sessions.

### Function Signature

```solidity
function createSessionFromDepositForModel(
    bytes32 modelId,
    address host,
    address paymentToken,      // address(0) for ETH
    uint256 deposit,
    uint256 pricePerToken,
    uint256 maxDuration,
    uint256 proofInterval,
    uint256 proofTimeoutWindow
) external returns (uint256 sessionId);
```

### SDK Implementation

```typescript
async function createSessionFromDepositForModel(
  modelId: string,
  host: string,
  paymentToken: string,  // Use ethers.ZeroAddress for ETH
  deposit: bigint,
  pricePerToken: bigint,
  maxDuration: number,
  proofInterval: number,
  proofTimeoutWindow: number = 300
): Promise<bigint> {
  // User must have pre-deposited funds via depositNative() or depositToken()

  const sessionId = await jobMarketplace.createSessionFromDepositForModel(
    modelId,
    host,
    paymentToken,
    deposit,
    pricePerToken,
    maxDuration,
    proofInterval,
    proofTimeoutWindow
  );

  return sessionId;
}
```

### Pre-deposit Flow

```typescript
// Step 1: User deposits funds
await jobMarketplace.depositNative({ value: ethers.parseEther("1.0") });
// OR
await usdc.approve(jobMarketplace.address, depositAmount);
await jobMarketplace.depositToken(usdc.address, depositAmount);

// Step 2: Check balance
const ethBalance = await jobMarketplace.userDepositsNative(userAddress);
const usdcBalance = await jobMarketplace.userDepositsToken(userAddress, usdc.address);

// Step 3: Create model session from deposit
const sessionId = await jobMarketplace.createSessionFromDepositForModel(
  modelId,
  host,
  ethers.ZeroAddress,  // ETH from deposit
  ethers.parseEther("0.5"),
  pricePerToken,
  3600,  // 1 hour
  100,   // min 100 tokens per proof
  300    // 5 minute timeout
);
```

---

## 3. Proof Functions: deltaCID Support

### submitProofOfWork

```solidity
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    bytes calldata signature,
    string calldata proofCID,
    string calldata deltaCID   // NEW - 6th parameter
) external
```

### getProofSubmission

```solidity
// Now returns 5 values instead of 4
function getProofSubmission(uint256 sessionId, uint256 proofIndex)
    external view returns (
        bytes32 proofHash,
        uint256 tokensClaimed,
        uint256 timestamp,
        bool verified,
        string memory deltaCID  // NEW - 5th return value
    );
```

### SDK Types Update

```typescript
interface ProofSubmission {
  proofHash: string;
  tokensClaimed: bigint;
  timestamp: number;
  verified: boolean;
  deltaCID: string;  // NEW
}

async function getProofSubmission(
  sessionId: bigint,
  proofIndex: number
): Promise<ProofSubmission> {
  const [proofHash, tokensClaimed, timestamp, verified, deltaCID] =
    await jobMarketplace.getProofSubmission(sessionId, proofIndex);

  return { proofHash, tokensClaimed, timestamp, verified, deltaCID };
}
```

---

## 4. Update Your ABIs

Replace your local ABI files with the updated versions from `client-abis/`:

- `JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json`
- `ProofSystemUpgradeable-CLIENT-ABI.json`

### Key ABI Changes Summary

| Function | Change |
|----------|--------|
| `createSessionJob` | +1 param: `proofTimeoutWindow` |
| `createSessionJobForModel` | +1 param: `proofTimeoutWindow` |
| `createSessionJobWithToken` | +1 param: `proofTimeoutWindow` |
| `createSessionJobForModelWithToken` | +1 param: `proofTimeoutWindow` |
| `createSessionFromDeposit` | +1 param: `proofTimeoutWindow` |
| `createSessionFromDepositForModel` | NEW function |
| `submitProofOfWork` | +1 param: `deltaCID` |
| `getProofSubmission` | +1 return: `deltaCID` |

---

## 5. Verification Checklist

Before testing, verify the SDK:

- [ ] Updated contract addresses to test contracts
- [ ] All session creation functions pass `proofTimeoutWindow` (60-3600)
- [ ] Added `createSessionFromDepositForModel` support
- [ ] `submitProofOfWork` passes 6 parameters (including `deltaCID`)
- [ ] `getProofSubmission` handles 5 return values
- [ ] Updated ABIs from `client-abis/`

### Quick Validation

```typescript
// Verify proofTimeoutWindow constants are accessible
const minTimeout = await jobMarketplace.MIN_PROOF_TIMEOUT();
const maxTimeout = await jobMarketplace.MAX_PROOF_TIMEOUT();
console.log(`Timeout range: ${minTimeout} - ${maxTimeout} seconds`);
// Expected: 60 - 3600 seconds

// Verify new function exists
const hasNewFunction = typeof jobMarketplace.createSessionFromDepositForModel === 'function';
console.log(`createSessionFromDepositForModel available: ${hasNewFunction}`);
// Expected: true
```

---

## Summary of Changes

| Before | After |
|--------|-------|
| `createSessionJob(host, price, duration, interval)` | `createSessionJob(host, price, duration, interval, timeoutWindow)` |
| `submitProofOfWork(id, tokens, hash, sig, cid)` | `submitProofOfWork(id, tokens, hash, sig, cid, deltaCID)` |
| No pre-deposit model sessions | `createSessionFromDepositForModel(...)` |
| JobMarketplace: `0x3CaC...23E` | JobMarketplace: `0x9513...E06` |
| ProofSystem: `0x5afB...eeb` | ProofSystem: `0xE8DC...B31` |

---

## Questions?

- Reference: `docs/REMEDIATION_CHANGES.md` for full commit history
- Breaking changes: `client-abis/CHANGELOG.md`
