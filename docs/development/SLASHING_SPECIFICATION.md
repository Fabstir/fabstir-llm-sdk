# Stake Slashing Specification for MVP

**Version:** 1.0
**Date:** January 2026
**Status:** Specification for Implementation
**Target Contract:** NodeRegistryWithModelsUpgradeable

---

## Executive Summary

This document specifies the implementation of stake slashing functionality for the Platformless AI MVP. The feature enables the contract owner to penalize hosts for proven misbehavior by reducing their staked FAB tokens.

**Key Design Decisions:**
- Owner-controlled at MVP (no DAO voting required)
- Evidence-based decision making using existing CID audit trail
- Safety constraints to prevent abuse
- Upgradeable access control for future DAO transition

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Function Specification](#2-function-specification)
3. [Safety Constraints](#3-safety-constraints)
4. [Events](#4-events)
5. [Access Control](#5-access-control)
6. [Integration with Evidence System](#6-integration-with-evidence-system)
7. [State Changes](#7-state-changes)
8. [Error Conditions](#8-error-conditions)
9. [Migration to DAO](#9-migration-to-dao)
10. [Security Considerations](#10-security-considerations)
11. [Testing Requirements](#11-testing-requirements)
12. [Gas Estimation](#12-gas-estimation)

---

## 1. Motivation

### Current State

Hosts stake 1000+ FAB tokens to register in the NodeRegistry. Currently, this stake can only be:
- **Increased** via `stake(amount)`
- **Fully returned** via `unregisterNode()`

There is **no mechanism** to penalize hosts for misbehavior.

### Problem

Without slashing, hosts face no economic penalty for:
- Claiming more tokens than actually delivered
- Submitting fraudulent proofs
- Delivering garbage/irrelevant AI output
- Systematic overcharging

The evidence trail exists (proofCID, deltaCID, conversationCID) but cannot be enforced.

### Solution

Add `slashStake()` function allowing the owner to reduce a host's stake based on evidence review. Slashed tokens are sent to the protocol treasury.

---

## 2. Function Specification

### Primary Function

```solidity
/**
 * @notice Slash a portion of a host's stake for proven misbehavior
 * @dev Only callable by slashing authority (owner at MVP, DAO later)
 * @param host Address of the host to slash
 * @param amount Amount of FAB tokens to slash
 * @param evidenceCID S5 CID containing evidence (proofCID, deltaCID, or custom report)
 * @param reason Human-readable reason for the slash
 */
function slashStake(
    address host,
    uint256 amount,
    string calldata evidenceCID,
    string calldata reason
) external onlySlashingAuthority {
    // Implementation
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `host` | address | The host address to slash |
| `amount` | uint256 | Amount of FAB tokens to slash (in wei) |
| `evidenceCID` | string | S5 CID pointing to evidence (required, cannot be empty) |
| `reason` | string | Human-readable reason (required, cannot be empty) |

### Return Value

None (reverts on failure).

---

## 3. Safety Constraints

### 3.1 Maximum Slash Percentage

```solidity
uint256 public constant MAX_SLASH_PERCENTAGE = 50; // 50% maximum per slash
```

**Rationale:** Prevents accidental or malicious complete stake destruction. Multiple slashes can still reach 100% over time if warranted.

### 3.2 Minimum Remaining Stake

```solidity
uint256 public constant MIN_STAKE_AFTER_SLASH = 100 * 1e18; // 100 FAB minimum
```

**Rationale:** Ensures host retains minimum stake to maintain node registration. If slash would reduce below this, host is automatically unregistered.

### 3.3 Cooldown Period

```solidity
uint256 public constant SLASH_COOLDOWN = 24 hours;
mapping(address => uint256) public lastSlashTime;
```

**Rationale:** Prevents rapid-fire slashing. Owner must wait 24 hours between slashes on the same host.

### 3.4 Evidence Requirement

```solidity
require(bytes(evidenceCID).length > 0, "Evidence CID required");
require(bytes(reason).length > 0, "Reason required");
```

**Rationale:** Forces accountability. Every slash must have documented justification stored on S5.

### 3.5 Active Host Only

```solidity
require(nodes[host].active, "Host not active");
require(nodes[host].stakedAmount > 0, "No stake to slash");
```

**Rationale:** Cannot slash non-existent or already-unregistered hosts.

---

## 4. Events

### SlashExecuted Event

```solidity
event SlashExecuted(
    address indexed host,
    uint256 amount,
    uint256 remainingStake,
    string evidenceCID,
    string reason,
    address indexed executor,
    uint256 timestamp
);
```

**Indexed Fields:**
- `host` - For filtering slashes by host
- `executor` - For tracking who performed the slash

### HostAutoUnregistered Event

```solidity
event HostAutoUnregistered(
    address indexed host,
    uint256 slashedAmount,
    uint256 returnedAmount,
    string reason
);
```

Emitted when slash reduces stake below `MIN_STAKE_AFTER_SLASH`, triggering automatic unregistration.

---

## 5. Access Control

### MVP: Owner-Controlled

```solidity
address public slashingAuthority;

modifier onlySlashingAuthority() {
    require(msg.sender == slashingAuthority, "Not slashing authority");
    _;
}

function setSlashingAuthority(address newAuthority) external onlyOwner {
    require(newAuthority != address(0), "Invalid authority");
    emit SlashingAuthorityUpdated(slashingAuthority, newAuthority);
    slashingAuthority = newAuthority;
}
```

### Initialization

```solidity
function initialize(address _fabToken, address _modelRegistry) public initializer {
    // ... existing init code ...
    slashingAuthority = msg.sender; // Owner is initial slashing authority
}
```

### Future: DAO Transition

When DAO is ready:
```solidity
// Owner calls this to transfer slashing authority to DAO
setSlashingAuthority(daoContractAddress);
```

---

## 6. Integration with Evidence System

### Evidence Types

The `evidenceCID` parameter should point to one of:

| Evidence Type | Source | Use Case |
|---------------|--------|----------|
| `proofCID` | From `ProofSubmitted` event | Verify specific proof data |
| `deltaCID` | From `ProofSubmitted` event | Verify incremental changes |
| `conversationCID` | From `SessionCompleted` event | Review full conversation |
| Custom Report CID | Owner-created | Complex multi-session analysis |

### Verification Workflow

```
1. User submits complaint with session ID
2. Owner retrieves on-chain data:
   - sessionJobs(sessionId) → get host, tokensUsed, conversationCID
   - getProofSubmission(sessionId, index) → get proofHash, tokensClaimed, deltaCID
3. Owner downloads CID content from S5
4. Owner verifies:
   - Actual token count vs claimed
   - Content quality (subjective)
   - Signature validity
5. If misbehavior confirmed:
   - Create evidence report (upload to S5)
   - Call slashStake(host, amount, reportCID, reason)
```

### Evidence Report Format (Recommended)

```json
{
  "version": "1.0",
  "timestamp": "2026-01-15T10:30:00Z",
  "sessionId": 12345,
  "host": "0x...",
  "complainant": "0x...",
  "findings": {
    "tokensClaimed": 5000,
    "tokensActual": 2100,
    "discrepancy": 2900,
    "discrepancyPercentage": 58
  },
  "evidence": {
    "proofCID": "bafyrei...",
    "deltaCID": "bafyrei...",
    "conversationCID": "bafyrei..."
  },
  "conclusion": "Host overclaimed tokens by 58%",
  "recommendedSlash": "500000000000000000000",
  "recommendedSlashFAB": "500"
}
```

---

## 7. State Changes

### Storage Updates

```solidity
// In slashStake():
nodes[host].stakedAmount -= amount;
lastSlashTime[host] = block.timestamp;
```

### Token Transfer

```solidity
// Slashed tokens go to treasury
IERC20(fabToken).safeTransfer(treasury, amount);
```

### Auto-Unregistration

If `nodes[host].stakedAmount < MIN_STAKE_AFTER_SLASH`:
```solidity
// Return remaining stake to host
uint256 remaining = nodes[host].stakedAmount;
nodes[host].stakedAmount = 0;
nodes[host].active = false;
_removeFromActiveNodes(host);
IERC20(fabToken).safeTransfer(host, remaining);
emit HostAutoUnregistered(host, amount, remaining, reason);
```

---

## 8. Error Conditions

| Error | Condition |
|-------|-----------|
| `"Not slashing authority"` | Caller is not authorized |
| `"Host not active"` | Host is not registered or already inactive |
| `"No stake to slash"` | Host has zero stake |
| `"Evidence CID required"` | Empty evidenceCID string |
| `"Reason required"` | Empty reason string |
| `"Exceeds max slash percentage"` | amount > stakedAmount * MAX_SLASH_PERCENTAGE / 100 |
| `"Slash cooldown active"` | block.timestamp < lastSlashTime[host] + SLASH_COOLDOWN |
| `"Amount exceeds stake"` | amount > stakedAmount |

---

## 9. Migration to DAO

### Phase 1: MVP (Owner-Controlled)

```
slashingAuthority = owner
```

Owner manually reviews evidence and executes slashes.

### Phase 2: Multi-Sig

```solidity
setSlashingAuthority(multiSigWallet);
```

Requires multiple signatures (e.g., 2-of-3 team members).

### Phase 3: DAO Contract

```solidity
setSlashingAuthority(daoSlashingExecutor);
```

DAO contract that:
1. Accepts dispute submissions with evidence CID
2. FAB token holders vote
3. If approved, calls `slashStake()` on NodeRegistry

### Upgrade Path

The `slashingAuthority` pattern allows seamless transition without contract upgrade:

```solidity
// Day 1: Owner controls
slashingAuthority = 0xOwner...

// Later: Transfer to multi-sig
owner.setSlashingAuthority(0xMultiSig...);

// Later: Transfer to DAO
multiSig.setSlashingAuthority(0xDAO...);
```

---

## 10. Security Considerations

### 10.1 Reentrancy Protection

```solidity
function slashStake(...) external onlySlashingAuthority nonReentrant {
    // Implementation
}
```

### 10.2 Integer Overflow

Use SafeMath or Solidity 0.8+ built-in overflow protection.

### 10.3 Centralization Risk

**Mitigations:**
- MAX_SLASH_PERCENTAGE limits damage per slash
- SLASH_COOLDOWN prevents rapid attacks
- All slashes emit events for public transparency
- Evidence CID requirement creates accountability
- Migration path to DAO documented

### 10.4 Griefing Prevention

Owner cannot:
- Slash more than 50% per action
- Slash same host within 24 hours
- Slash without providing evidence CID

### 10.5 Front-Running

Not applicable - only slashingAuthority can call.

---

## 11. Testing Requirements

### Unit Tests

```solidity
// Happy path
function test_slashStake_reducesStake() external;
function test_slashStake_transfersToTreasury() external;
function test_slashStake_emitsEvent() external;

// Constraints
function test_slashStake_revertsIfExceedsMaxPercentage() external;
function test_slashStake_revertsIfCooldownActive() external;
function test_slashStake_revertsIfNoEvidence() external;
function test_slashStake_revertsIfNoReason() external;

// Edge cases
function test_slashStake_autoUnregistersIfBelowMinimum() external;
function test_slashStake_revertsIfHostInactive() external;
function test_slashStake_revertsIfNotAuthority() external;

// Access control
function test_setSlashingAuthority_onlyOwner() external;
function test_setSlashingAuthority_updatesAuthority() external;
```

### Integration Tests

```solidity
// Full flow
function test_fullSlashingFlow_withEvidenceVerification() external;
function test_multipleSlashes_respectCooldown() external;
function test_slashToAutoUnregister_returnsRemainingStake() external;
```

### Scenario Tests

1. **Token Overclaim**: Host claims 1000 tokens but deltaCID shows 500
2. **Repeated Offender**: Same host slashed multiple times
3. **Edge Case**: Slash exactly to MIN_STAKE_AFTER_SLASH boundary

---

## 12. Gas Estimation

| Operation | Estimated Gas |
|-----------|---------------|
| `slashStake()` (normal) | ~80,000 |
| `slashStake()` (with auto-unregister) | ~150,000 |
| `setSlashingAuthority()` | ~30,000 |

---

## Appendix A: Complete Implementation Reference

```solidity
// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.20;

// Add to NodeRegistryWithModelsUpgradeable.sol

// === NEW CONSTANTS ===
uint256 public constant MAX_SLASH_PERCENTAGE = 50;
uint256 public constant MIN_STAKE_AFTER_SLASH = 100 * 1e18;
uint256 public constant SLASH_COOLDOWN = 24 hours;

// === NEW STATE VARIABLES ===
address public slashingAuthority;
address public treasury;
mapping(address => uint256) public lastSlashTime;

// === NEW EVENTS ===
event SlashExecuted(
    address indexed host,
    uint256 amount,
    uint256 remainingStake,
    string evidenceCID,
    string reason,
    address indexed executor,
    uint256 timestamp
);

event HostAutoUnregistered(
    address indexed host,
    uint256 slashedAmount,
    uint256 returnedAmount,
    string reason
);

event SlashingAuthorityUpdated(
    address indexed previousAuthority,
    address indexed newAuthority
);

// === NEW MODIFIERS ===
modifier onlySlashingAuthority() {
    require(msg.sender == slashingAuthority, "Not slashing authority");
    _;
}

// === NEW FUNCTIONS ===

function setSlashingAuthority(address newAuthority) external onlyOwner {
    require(newAuthority != address(0), "Invalid authority");
    emit SlashingAuthorityUpdated(slashingAuthority, newAuthority);
    slashingAuthority = newAuthority;
}

function setTreasury(address newTreasury) external onlyOwner {
    require(newTreasury != address(0), "Invalid treasury");
    treasury = newTreasury;
}

function slashStake(
    address host,
    uint256 amount,
    string calldata evidenceCID,
    string calldata reason
) external onlySlashingAuthority nonReentrant {
    // Validation
    require(nodes[host].active, "Host not active");
    require(nodes[host].stakedAmount > 0, "No stake to slash");
    require(bytes(evidenceCID).length > 0, "Evidence CID required");
    require(bytes(reason).length > 0, "Reason required");
    require(amount <= nodes[host].stakedAmount, "Amount exceeds stake");

    // Safety constraints
    uint256 maxSlash = (nodes[host].stakedAmount * MAX_SLASH_PERCENTAGE) / 100;
    require(amount <= maxSlash, "Exceeds max slash percentage");
    require(
        block.timestamp >= lastSlashTime[host] + SLASH_COOLDOWN,
        "Slash cooldown active"
    );

    // Execute slash
    nodes[host].stakedAmount -= amount;
    lastSlashTime[host] = block.timestamp;

    // Transfer slashed tokens to treasury
    IERC20(fabToken).safeTransfer(treasury, amount);

    // Check if auto-unregister needed
    if (nodes[host].stakedAmount < MIN_STAKE_AFTER_SLASH) {
        uint256 remaining = nodes[host].stakedAmount;
        nodes[host].stakedAmount = 0;
        nodes[host].active = false;
        _removeFromActiveNodes(host);

        if (remaining > 0) {
            IERC20(fabToken).safeTransfer(host, remaining);
        }

        emit HostAutoUnregistered(host, amount, remaining, reason);
    }

    emit SlashExecuted(
        host,
        amount,
        nodes[host].stakedAmount,
        evidenceCID,
        reason,
        msg.sender,
        block.timestamp
    );
}

// === UPGRADE INITIALIZATION ===
// Call this after upgrading to initialize new state variables
function initializeSlashing(address _treasury) external onlyOwner {
    require(slashingAuthority == address(0), "Already initialized");
    slashingAuthority = owner();
    treasury = _treasury;
}
```

---

## Appendix B: ABI Addition

```json
{
  "type": "function",
  "name": "slashStake",
  "inputs": [
    { "name": "host", "type": "address" },
    { "name": "amount", "type": "uint256" },
    { "name": "evidenceCID", "type": "string" },
    { "name": "reason", "type": "string" }
  ],
  "outputs": [],
  "stateMutability": "nonpayable"
}
```

---

## Appendix C: SDK Integration (Future)

Once deployed, add to SDK's HostManager:

```typescript
// packages/sdk-core/src/managers/HostManager.ts

/**
 * Slash a host's stake (owner/DAO only)
 * @param host Host address to slash
 * @param amount Amount in FAB (will be converted to wei)
 * @param evidenceCID S5 CID containing evidence
 * @param reason Human-readable reason
 */
async slashStake(
  host: string,
  amount: string,
  evidenceCID: string,
  reason: string
): Promise<TransactionReceipt> {
  const amountWei = parseEther(amount);
  const tx = await this.nodeRegistry.slashStake(
    host,
    amountWei,
    evidenceCID,
    reason
  );
  return tx.wait(3);
}

/**
 * Get slash history for a host
 */
async getSlashHistory(host: string): Promise<SlashEvent[]> {
  const filter = this.nodeRegistry.filters.SlashExecuted(host);
  const events = await this.nodeRegistry.queryFilter(filter);
  return events.map(e => ({
    host: e.args.host,
    amount: e.args.amount,
    remainingStake: e.args.remainingStake,
    evidenceCID: e.args.evidenceCID,
    reason: e.args.reason,
    executor: e.args.executor,
    timestamp: e.args.timestamp
  }));
}
```

---

*End of Specification*
