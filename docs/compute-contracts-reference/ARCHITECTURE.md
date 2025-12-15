# Architecture Documentation

**Last Updated:** December 14, 2025

## Current Contract Addresses (UUPS Proxies)

All contracts have been migrated to UUPS upgradeable pattern:

| Contract | Proxy Address |
|----------|---------------|
| JobMarketplace | `0xeebEEbc9BCD35e81B06885b63f980FeC71d56e2D` |
| NodeRegistry | `0x8BC0Af4aAa2dfb99699B1A24bA85E507de10Fd22` |
| ModelRegistry | `0x1a9d91521c85bD252Ac848806Ff5096bBb9ACDb2` |
| ProofSystem | `0x5afB91977e69Cc5003288849059bc62d47E7deeb` |
| HostEarnings | `0xE4F33e9e132E60fc3477509f99b9E1340b91Aee0` |

**Minimum Deposits:** ETH: 0.0001 (~$0.50) | USDC: 500,000 ($0.50)

---

## Overview

The Fabstir P2P LLM marketplace smart contracts implement a **hybrid payment architecture** that evolved during development to optimize gas costs and simplify operations for different job types.

## Payment Architecture Evolution

### Phase 1-2: Original Separated Design

Initially, the system was designed with separated concerns:

```
User → JobMarketplace → PaymentEscrow → Host
                     ↓
                HostEarnings
```

**Components:**
- **JobMarketplace**: Managed job lifecycle
- **PaymentEscrow**: Held funds in escrow separately
- **HostEarnings**: Tracked host earnings separately

**Characteristics:**
- Clean separation of concerns
- Multiple external contract calls per payment
- Higher gas costs due to cross-contract communication
- More complex error handling across contracts

### Phase 3-4: Optimized Session Job Design

For session-based jobs (long-running AI inference sessions), the architecture was simplified:

```
User → JobMarketplaceWithModels → Host
           (self-contained)
```

**Characteristics:**
- Direct payment handling within JobMarketplace
- Single contract holds deposits and processes payments
- ~30% reduction in gas costs
- Atomic payment operations (no multi-contract failure modes)
- Simpler error recovery

## Current Hybrid Architecture

The `JobMarketplaceWithModels` contract now implements both models:

### 1. Legacy Single-Prompt Jobs
- May still use external PaymentEscrow/HostEarnings contracts
- Maintained for backward compatibility
- Used for one-off inference requests

### 2. Session Jobs (Recommended)
- Self-contained payment processing
- Uses internal `_sendPayments()` helper function
- Direct transfers to hosts and treasury
- Optimized for L2 (Base) deployment

## Key Components

### JobMarketplaceWithModels

The main contract that handles both job types:

```solidity
contract JobMarketplaceWithModels {
    // Legacy external contracts (optional)
    IPaymentEscrow public paymentEscrow;
    HostEarnings public hostEarnings;
    
    // Session job payments (self-contained)
    function _sendPayments(
        Job storage job,
        address host,
        uint256 payment,
        uint256 treasuryFee,
        uint256 refund
    ) internal {
        if (job.paymentToken != address(0)) {
            // Direct ERC20 transfers
            IERC20(job.paymentToken).transfer(host, payment);
            IERC20(job.paymentToken).transfer(treasury, treasuryFee);
            IERC20(job.paymentToken).transfer(renter, refund);
        } else {
            // Direct ETH transfers
            payable(host).transfer(payment);
            payable(treasury).transfer(treasuryFee);
            payable(renter).transfer(refund);
        }
    }
}
```

### ProofSystem (Updated for S5 Storage - Oct 14, 2025)

**Previous Approach**: On-chain EZKL proof verification (221KB proofs)
- Problem: STARK proofs exceeded RPC transaction limit (128KB)
- Result: All proof submissions were failing

**Current Approach**: S5 Off-Chain Proof Storage
- Full proofs (221KB) stored in S5 decentralized storage
- Only hash (32 bytes) + CID (string) submitted on-chain
- Transaction size: 221KB → 300 bytes (737x reduction)
- Storage cost: ~$50 → ~$0.001 per proof (5000x cheaper)
- Trust model: Contract trusts host's hash; disputes fetch proof from S5
- Proof integrity: SHA256 hash prevents tampering
- Proof availability: S5 ensures decentralized retrieval

### NodeRegistry

Manages host registration and capabilities:
- Tracks registered GPU hosts
- Manages staking requirements
- Stores host capabilities and availability

## Payment Flows

### Session Job Payment Flow (Optimized with S5 Proof Storage)

```
1. Renter creates session job with deposit
   └→ Funds held directly in JobMarketplace

2. Host submits proof of work (S5 off-chain)
   ├→ Host generates STARK proof (221KB) off-chain
   ├→ Host uploads proof to S5 → receives CID
   ├→ Host calculates SHA256 hash of proof
   └→ Host submits hash + CID to contract (~300 bytes)

3. Payment processed via _sendPayments()
   ├→ Host receives payment (direct transfer)
   ├→ Treasury receives fee (direct transfer)
   └→ Renter receives refund if any (direct transfer)

4. Dispute resolution (if needed)
   ├→ Retrieve full proof from S5 using CID
   ├→ Verify hash matches on-chain stored hash
   └→ Verify proof validity off-chain or via dispute contract
```

**Gas Cost: ~150,000 gas (minimal increase for string storage)**

### Legacy Job Payment Flow

```
1. Renter posts job
   └→ JobMarketplace → PaymentEscrow (external call)

2. Host completes job
   └→ JobMarketplace triggers release

3. PaymentEscrow releases funds
   ├→ PaymentEscrow → HostEarnings (external call)
   └→ HostEarnings → Host (external call)
```

**Gas Cost: ~220,000 gas**

## Token Support

### Native ETH
- Default payment method
- No approval needed
- Direct transfer via `payable().transfer()`

### USDC (ERC20)
- Base Sepolia: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Base Mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Requires approval before job creation
- Direct transfer via `token.transfer()`

### Adding New Tokens
```solidity
marketplace.setAcceptedToken(tokenAddress, true);
```

## Gas Optimization Strategies

### 1. Reduced External Calls
- Session jobs avoid cross-contract calls
- Payments processed in single transaction
- No intermediate escrow state

### 2. Efficient Storage Patterns
- Packed structs for job data
- Minimal storage updates
- Reuse of storage slots where possible

### 3. L2 Optimization
- Designed for Base L2's lower gas costs
- Batch operations where applicable
- Event-heavy for off-chain indexing

## Security Considerations

### Reentrancy Protection
- OpenZeppelin ReentrancyGuard on all payment functions
- State updates before external calls
- Checks-Effects-Interactions pattern

### Access Control
- Only job renter can complete their session
- Only assigned host can claim abandoned session
- Treasury address updatable by owner only

### Payment Safety
- No funds can be trapped in contract
- All deposits either paid out or refunded
- Timeout mechanisms prevent indefinite locks

## Migration Path

For projects using the old architecture:

1. **Keep existing jobs running** - Legacy jobs continue to work
2. **Deploy new contracts** - ProofSystem and updated JobMarketplace
3. **Update frontend** - Point to new contract addresses
4. **Create new jobs as sessions** - Use session job functions
5. **Phase out legacy** - Stop creating legacy jobs

## Benefits of Hybrid Architecture

### For Users
- Lower transaction fees (~30% reduction)
- Faster payment processing
- Simpler error recovery

### For Developers
- Cleaner codebase for new features
- Easier testing and debugging
- Better gas predictability

### For the Protocol
- Reduced attack surface
- Simpler audit scope
- More efficient L2 utilization

## Session Jobs: Continuous AI Inference

### Overview
Session jobs enable continuous AI conversations with minimal blockchain transactions. Unlike single-prompt jobs that require a transaction per interaction, session jobs use a checkpoint-based proof system.

### Transaction Model
**Traditional per-prompt**: 50 prompts = 50+ transactions (~$100-250 gas on L2)  
**Session jobs**: 50 prompts = 5-10 transactions (~$10-25 gas on L2)

Key innovations:
- **Off-chain inference**: AI processing happens off-chain
- **On-chain verification**: Only periodic proof checkpoints hit blockchain
- **Checkpoint intervals**: Host submits proofs every N tokens (not per prompt)
- **Token-based accounting**: Payment calculated by proven tokens × price per token

### How It Works
1. **Session creation** (1 tx): User deposits funds, sets parameters
2. **Active session**: Off-chain prompts/responses, periodic proof submissions
3. **Completion** (1 tx): Payment based on cryptographically proven work

Example flow:
```
User deposits 1 ETH for 10,000 tokens at 0.0001 ETH/token
Sets checkpointInterval = 500 tokens
→ Host generates responses off-chain
→ Submits proof every 500 tokens (not every prompt)
→ User completes session, payment distributed
```

### Benefits
- **85-95% reduction** in transaction costs
- **Seamless UX** without wallet popups for each prompt
- **Trustless payment** via EZKL cryptographic proofs
- **Protection** for both users (refunds) and hosts (abandonment claims)

For detailed documentation, see [SESSION_JOBS.md](./SESSION_JOBS.md).

## S5 Off-Chain Proof Storage Architecture (October 14, 2025)

### The Problem
STARK proofs generated by RISC0 are approximately 221KB in size, which exceeds the Base Sepolia RPC transaction limit of 128KB. This caused **all proof submissions to fail** with "oversized data" errors, making the entire proof-of-work system non-functional.

### The Solution
Store full proofs in S5 decentralized storage, submit only cryptographic hash + retrieval CID on-chain.

### Architecture Components

```
┌─────────────┐
│   Host Node │
└──────┬──────┘
       │
       ├─1─→ Generate STARK proof (221KB)
       │
       ├─2─→ Upload to S5 Storage
       │     └→ Receives CID (content identifier)
       │
       ├─3─→ Calculate SHA256 hash
       │
       ├─4─→ Submit to blockchain:
       │     - jobId
       │     - tokensClaimed
       │     - proofHash (32 bytes)
       │     - proofCID (string)
       │
       ▼
┌──────────────────────────┐
│  JobMarketplaceWithModels │
│  (On-Chain)              │
│  - Stores hash + CID     │
│  - Processes payment     │
│  - Emits ProofSubmitted  │
└──────────────────────────┘
       │
       └─→ Event: ProofSubmitted(jobId, host, tokens, hash, cid)
```

### Trust and Security Model

**On-Chain Storage** (per proof):
- `bytes32 lastProofHash` - SHA256 hash of proof (32 bytes)
- `string lastProofCID` - S5 CID for retrieval (variable length, ~50 bytes)
- Total: ~82 bytes vs 221KB (2,695x reduction)

**Trust Assumptions**:
1. Contract trusts host's submitted hash during normal operation
2. Payment releases without on-chain proof verification
3. Disputes can retrieve full proof from S5 using CID
4. SHA256 hash verification prevents proof tampering
5. S5 decentralized network ensures proof availability

**Security Properties**:
- **Integrity**: SHA256 hash cryptographically binds to specific proof
- **Availability**: S5 decentralized storage (multiple nodes)
- **Verifiability**: Full proof retrievable for disputes
- **Non-repudiation**: Host cannot change proof after submission (hash mismatch)

### Benefits

| Metric | Before (On-Chain) | After (S5) | Improvement |
|--------|-------------------|------------|-------------|
| Transaction size | 221KB | ~300 bytes | 737x smaller |
| Storage cost | ~$50 | ~$0.001 | 5000x cheaper |
| Gas cost | N/A (failed) | Minimal | Now works! |
| Verification | On-chain | On-demand | More efficient |

### Breaking Changes

**Old Contract** (`0xe169A4B57700080725f9553E3Cc69885fea13629`):
```solidity
function submitProofOfWork(
    uint256 jobId,
    bytes calldata ekzlProof,
    uint256 tokensInBatch
) external
```

**New Contract** (`0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E`):
```solidity
function submitProofOfWork(
    uint256 jobId,
    uint256 tokensClaimed,
    bytes32 proofHash,
    string calldata proofCID
) external
```

### Trade-offs

**Pros**:
- ✅ Solves RPC size limit completely
- ✅ Massively reduces transaction costs
- ✅ Enables proof archiving and retrieval
- ✅ Decentralized storage via S5

**Cons**:
- ❌ No immediate on-chain verification
- ❌ Requires S5 client integration
- ❌ Trust model shifts from verification to hash commitment
- ❌ Dispute resolution requires off-chain proof retrieval

### Migration Guide

**For Node Operators**:
1. Integrate S5 client library
2. Upload proofs before blockchain submission
3. Calculate SHA256 hash of proof
4. Submit hash + CID to new contract

**For SDK Developers**:
1. Update contract address to `0xc6D44D7f2DfA8fdbb1614a8b6675c78D3cfA376E`
2. Update ABI to include new function signature
3. Listen for updated `ProofSubmitted` event (includes `proofCID`)
4. Implement S5 retrieval for proof viewing/verification

**For Auditors/Verifiers**:
1. Retrieve proof from S5 using CID
2. Calculate SHA256 hash of retrieved proof
3. Compare with on-chain stored hash
4. Verify proof validity using ProofSystem contract

For detailed deployment information, see [S5_PROOF_STORAGE_DEPLOYMENT.md](./S5_PROOF_STORAGE_DEPLOYMENT.md).

## Future Improvements

### Planned Optimizations
1. **Storage packing** - Further optimize struct layouts
2. **Batch payments** - Process multiple payments in one transaction
3. **Payment channels** - For high-frequency micro-payments

### Potential Features
1. **Streaming payments** - Pay per token as generated
2. **Multi-party escrow** - Support for collaborative jobs
3. **Cross-chain payments** - Bridge payments from other chains

## Summary

The hybrid payment architecture represents a pragmatic evolution:
- **Legacy support** ensures backward compatibility
- **Optimized session jobs** provide better UX and lower costs
- **Flexibility** to adapt to different use cases

This architecture balances the ideals of clean separation with the practical realities of gas optimization on L2 networks, resulting in a more efficient and user-friendly system.