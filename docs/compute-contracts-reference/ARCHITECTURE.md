# Architecture Documentation

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
User → JobMarketplaceFABWithS5 → Host
           (self-contained)
```

**Characteristics:**
- Direct payment handling within JobMarketplace
- Single contract holds deposits and processes payments
- ~30% reduction in gas costs
- Atomic payment operations (no multi-contract failure modes)
- Simpler error recovery

## Current Hybrid Architecture

The `JobMarketplaceFABWithS5` contract now implements both models:

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

### JobMarketplaceFABWithS5

The main contract that handles both job types:

```solidity
contract JobMarketplaceFABWithS5 {
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

### ProofSystem

Handles EZKL proof verification for AI model outputs:
- Verifies correctness of inference results
- Integrates with JobMarketplace for payment release
- Supports batch verification for efficiency

### NodeRegistry

Manages host registration and capabilities:
- Tracks registered GPU hosts
- Manages staking requirements
- Stores host capabilities and availability

## Payment Flows

### Session Job Payment Flow (Optimized)

```
1. Renter creates session job with deposit
   └→ Funds held directly in JobMarketplace

2. Host submits proof of work
   └→ ProofSystem verifies

3. Payment processed via _sendPayments()
   ├→ Host receives payment (direct transfer)
   ├→ Treasury receives fee (direct transfer)
   └→ Renter receives refund if any (direct transfer)
```

**Gas Cost: ~150,000 gas**

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