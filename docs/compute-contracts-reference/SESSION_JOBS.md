# Session Jobs: Continuous AI Inference on Blockchain

*Last Updated: January 2025*

## Current Deployment

- **JobMarketplaceWithModels**: `0x1273E6358aa52Bb5B160c34Bf2e617B745e4A944`
- **ProofSystem**: `0x2ACcc60893872A499700908889B38C5420CBcFD1`
- **HostEarnings**: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- **Network**: Base Sepolia
- **Storage**: `sessionJobs` mapping (NOT `sessions` or `jobs`)

## Overview

Session jobs represent a revolutionary approach to blockchain-based AI inference, enabling continuous interaction between users and AI models while minimizing transaction costs. Unlike traditional per-prompt payment models, session jobs use a checkpoint-based proof system that reduces blockchain transactions by 85-95%.

## ⚠️ CRITICAL: Proof Submission Required

**Hosts MUST submit cryptographic proofs at checkpoint intervals or they will NOT be paid.**

Payment is based ONLY on `provenTokens` (cryptographically verified work), not claimed usage:
- **Without proof submission**: `provenTokens` = 0 → Host payment = 0 → User gets full refund
- **With proof submission**: `provenTokens` accumulates → Host gets paid → User pays for actual usage

This proof-based system is what makes session jobs trustless and prevents either party from cheating.

## Complete Session Flow

```
1. USER CREATES SESSION (on-chain)
   ↓ Deposits funds, sets price/token, assigns host
   
2. USER ↔ HOST INTERACTION (off-chain)
   ↓ Prompts sent, responses generated, tokens counted
   
3. HOST SUBMITS PROOFS (on-chain) ← MANDATORY!
   ↓ Every N tokens (checkpoint), cryptographic proof submitted
   ↓ Updates provenTokens in contract
   
4. USER COMPLETES SESSION (on-chain)
   ↓ Calls completeSessionJob()
   
5. CONTRACT CALCULATES & DISTRIBUTES (automatic)
   - Payment = provenTokens × pricePerToken
   - Host receives: HOST_EARNINGS_PERCENTAGE of payment (configurable via env)
   - Treasury receives: TREASURY_FEE_PERCENTAGE of payment (configurable via env)  
   - User receives: Refund of unused deposit
```

**Key Point**: Step 3 (proof submission) is what enables trustless payment. Skip it and the host gets nothing!

## Key Innovation: Off-Chain Inference, On-Chain Verification

The session job model separates:
- **Off-chain**: Actual AI inference, prompt/response exchanges, real-time interaction
- **On-chain**: Periodic proof submission, payment verification, dispute resolution

This separation enables:
- ✅ Continuous AI conversations without per-prompt gas fees
- ✅ Trustless payment based on cryptographically proven work
- ✅ Protection for both users and hosts
- ✅ 85-95% reduction in transaction costs

## Transaction Model

### Transaction Frequency

Session jobs require blockchain transactions only at key checkpoints:

1. **Session Creation** (1 transaction)
   - User deposits funds
   - Sets payment parameters
   - Assigns host

2. **Proof Checkpoints** (periodic transactions)
   - Host submits cryptographic proofs
   - Frequency determined by `checkpointInterval`
   - Not tied to individual prompts

3. **Session Completion** (1-2 transactions)
   - Final payment settlement
   - Refund processing if applicable

### Real-World Example

Consider a user having an extended conversation with an AI model:

**Traditional Per-Prompt Model:**
```
50 prompts = 50+ blockchain transactions
Gas cost: ~$100-250 on L2
User experience: Constant wallet popups
```

**Session Job Model:**
```
50 prompts = 7 blockchain transactions
- 1 tx: Create session (deposit 1 ETH)
- 5 tx: Proof submissions (every 500 tokens)
- 1 tx: Complete session
Gas cost: ~$10-15 on L2
User experience: Seamless conversation
```

## Proof Checkpoint System

### How Checkpoints Work

The `checkpointInterval` (also called `proofInterval`) determines how often the host must submit proof of work:

```solidity
// Set during session creation
checkpointInterval: 500  // Submit proof every 500 tokens
```

### Checkpoint Parameters

| Parameter | Min | Max | Typical | Purpose |
|-----------|-----|-----|---------|---------|
| checkpointInterval | 100 | 1,000,000 | 500-1000 | Tokens between proofs |
| Proof submission time | - | - | 5-10 sec | On-chain verification |
| Gas per checkpoint | - | - | ~30,000 | L2 optimized |

### Choosing Optimal Intervals

**Small Intervals (100-500 tokens):**
- ✅ More frequent payment verification
- ✅ Lower risk for both parties
- ❌ Higher transaction costs
- Best for: High-value models, untrusted parties

**Medium Intervals (500-5000 tokens):**
- ✅ Balanced cost and security
- ✅ Reasonable verification frequency
- Best for: Most use cases

**Large Intervals (5000+ tokens):**
- ✅ Minimal transaction costs
- ❌ Higher risk exposure
- ❌ Longer payment delays
- Best for: Trusted relationships, low-value interactions

## Token-Based Accounting

### Core Concepts

Session jobs use **tokens** as the unit of account, not prompts:

```solidity
struct SessionDetails {
    uint256 depositAmount;      // Total funds deposited
    uint256 pricePerToken;      // Cost per AI token
    uint256 provenTokens;       // Tokens cryptographically proven
    uint256 checkpointInterval; // Tokens between proofs
}
```

### Payment Calculation

```
Payment = provenTokens × pricePerToken
Treasury Fee = Payment × TREASURY_FEE_PERCENTAGE
Host Receives = Payment - Treasury Fee
```

### Example Token Flow

```
User deposits: 1 ETH
Price per token: 0.0001 ETH
Maximum tokens: 10,000

Conversation generates:
- Prompt 1: 150 tokens
- Prompt 2: 200 tokens  
- Prompt 3: 175 tokens
- ...
- Total: 2,500 tokens

Host submits proofs at:
- 500 tokens: Proof 1
- 1000 tokens: Proof 2
- 1500 tokens: Proof 3
- 2000 tokens: Proof 4
- 2500 tokens: Proof 5

Final payment:
- Host receives: 2,500 × 0.0001 × 0.9 = 0.225 ETH
- Treasury receives: 0.025 ETH
- User refunded: 0.75 ETH
```

## EZKL Proof System

### Cryptographic Verification

Each proof checkpoint includes an EZKL proof that cryptographically verifies:
- Number of tokens generated
- Correct model execution
- Output authenticity

```solidity
function submitProofOfWork(
    uint256 jobId,
    bytes calldata ekzlProof,  // Cryptographic proof
    uint256 tokensInBatch      // Tokens in this batch
) external returns (bool verified)
```

### Proof Aggregation

Multiple proofs are aggregated to create a complete session history:

```solidity
aggregateProofHash = keccak256(
    abi.encode(previousHash, currentProofHash)
);
```

This creates an immutable chain of proofs that can be verified later.

## Session Lifecycle

### 1. Creation Phase

```solidity
createSessionJob(
    host,           // Assigned GPU provider (must have supported models)
    pricePerToken,  // Rate (e.g., 0.0001 ETH/token)
    maxDuration,    // Time limit (e.g., 24 hours)
    proofInterval   // Checkpoint frequency (e.g., 500)
)
// Deposit sent as msg.value for ETH, or pre-approved for tokens
```

**Requirements**:
- Host must be registered in NodeRegistryWithModels
- Host must support approved models from ModelRegistry
- Minimum deposit: 0.0002 ETH or 0.80 USDC

**Gas cost**: ~200,000 gas

### 2. Active Phase

During the session:
- User sends prompts off-chain
- Host generates responses off-chain
- Host accumulates token counts
- **Host MUST submit proofs at checkpoints** (every N tokens as defined by `checkpointInterval`)
  - Without proof submission, host will NOT be paid
  - Each proof updates `provenTokens` in the contract
  - Only `provenTokens` are paid, not claimed tokens

**Gas cost per checkpoint**: ~30,000 gas

### 3. Completion Phase

Session can end via:

**Normal Completion:**
```solidity
completeSessionJob(jobId)  // User satisfied
// or
claimWithProof(jobId)      // Host claims based on proofs
```

**Timeout/Abandonment:**
```solidity
triggerSessionTimeout(jobId)    // Session expired
claimAbandonedSession(jobId)    // User abandoned
```

**Gas cost**: ~100,000 gas

## Payment Flows

### Payment Model with Accumulation

Session jobs use an accumulation pattern for gas efficiency:

```solidity
function _sendPayments(host, user, amount, treasuryFee, token, refund) {
    if (token != address(0)) {
        // ERC20 tokens (e.g., USDC)
        IERC20(token).transfer(host, amount);
        accumulatedTreasuryTokens[token] += treasuryFee;
        if (refund > 0) {
            IERC20(token).transfer(user, refund);
        }
    } else {
        // Native ETH via HostEarnings
        hostEarnings.creditEarnings{value: amount}(host, address(0), amount);
        accumulatedTreasuryETH += treasuryFee;
        if (refund > 0) {
            payable(user).transfer(refund);
        }
    }
}
```

### Payment Security

- Funds locked in contract during session
- **Payment ONLY on cryptographic proof (provenTokens)**
- Automatic refunds for unused deposits  
- No funds can be trapped
- **Critical**: Unproven tokens = unpaid work (host gets nothing for tokens without proof)

## Timeout and Dispute Protection

### Timeout Mechanism

Sessions have configurable timeouts:
- `maxDuration`: Total session time limit (e.g., 24 hours)
- `ABANDONMENT_TIMEOUT`: Inactivity threshold (24 hours)

### Dispute Resolution

If disagreements arise:
1. User can trigger timeout if session expired
2. Host can claim abandonment after 24 hours of inactivity
3. Proofs determine final payment allocation

### Edge Case Handling

**User Disappears:**
- Host continues submitting proofs
- After 24 hours, host claims via `claimAbandonedSession`
- Payment based on proven work

**Host Stops Working:**
- User waits for `maxDuration`
- Triggers timeout via `triggerSessionTimeout`
- Receives refund minus proven work

**Network Issues:**
- Grace period for proof submission
- Partial payments for completed work
- Refunds for unproven tokens

## Gas Optimization Strategies

### L2 Optimization

Designed specifically for Layer 2 networks like Base:
- Optimized for low gas costs
- Batch proof submission supported
- Minimal storage updates

### Comparison: Session vs Per-Prompt

| Metric | Per-Prompt | Session Jobs | Reduction |
|--------|------------|--------------|-----------|
| Transactions (50 prompts) | 50+ | 5-10 | 85-95% |
| Gas Cost (L2) | $100-250 | $10-25 | 90% |
| User Experience | 50 popups | 2 popups | 96% |
| Time to Complete | 25+ min | 5 min | 80% |

### Best Practices

1. **Set appropriate checkpoint intervals**
   - Balance security vs gas costs
   - Consider model value and trust level

2. **Use token batching**
   - Submit multiple proofs in one transaction
   - Reduces gas costs further

3. **Monitor proof submissions**
   - Track checkpoint timing
   - Ensure timely submissions

## Integration Guide

### For Frontend Developers

```javascript
// 1. Create a session (on-chain)
const tx = await marketplace.createSessionJob(
    hostAddress,
    ethers.utils.parseEther("1"),     // 1 ETH deposit
    ethers.utils.parseEther("0.0001"), // Price per token
    86400,                              // 24 hour duration
    500                                 // Proof every 500 tokens (checkpoint interval)
);
const jobId = tx.events[0].args.jobId;

// 2. Off-chain interaction
// Send prompts to host, receive responses
// Track token usage but DO NOT pay yet

// 3. CRITICAL: Host must submit proofs periodically
// The host will call submitProofOfWork() every 500 tokens
// This happens independently - frontend just needs to wait
// Monitor ProofSubmitted events to track progress:
marketplace.on("ProofSubmitted", (jobId, tokens) => {
    console.log(`Proof submitted for ${tokens} tokens`);
});

// 4. Complete session when done (on-chain)
await marketplace.completeSessionJob(jobId);
// Payment automatically calculated from provenTokens
// Host gets HOST_EARNINGS_PERCENTAGE, treasury gets TREASURY_FEE_PERCENTAGE, user gets refund
```

### For Host Operators

```javascript
// Accept session
const session = await marketplace.getSessionDetails(jobId);

// CRITICAL: Track tokens and submit proofs to get paid!
let tokenCount = 0;
for (const prompt of prompts) {
    const response = await model.generate(prompt);
    tokenCount += response.tokenCount;
    
    // MANDATORY: Submit proof at checkpoint or lose payment!
    if (tokenCount >= session.checkpointInterval) {
        const proof = await generateEKZLProof(tokenCount);
        
        // This updates provenTokens - your payment depends on this!
        await marketplace.submitProofOfWork(jobId, proof, tokenCount);
        console.log(`Proof submitted for ${tokenCount} tokens - payment secured`);
        
        tokenCount = 0; // Reset for next batch
    }
}

// WARNING: Any tokens not proven will NOT be paid!
// If session ends with unproven tokens, submit final proof:
if (tokenCount > 0) {
    const finalProof = await generateEKZLProof(tokenCount);
    await marketplace.submitProofOfWork(jobId, finalProof, tokenCount);
}
```

## Economic Benefits

### For Users
- Up to 90% reduction in transaction fees
- No interruptions during conversation
- Pay only for tokens actually used
- Automatic refunds for unused deposits

### For Hosts
- Guaranteed payment for proven work
- Protection against user abandonment
- Reduced transaction overhead
- Higher throughput capacity

### For the Network
- 85-95% reduction in blockchain congestion
- More scalable AI inference
- Better resource utilization
- Lower environmental impact

## Security Considerations

### Trust Model

Session jobs require minimal trust:
- Cryptographic proofs ensure accurate token counting
- Smart contract holds funds in escrow
- Automatic dispute resolution
- No party can steal funds

### Attack Vectors and Mitigations

**Proof Replay Attack:**
- Mitigation: Each proof is marked as used
- `verifyAndMarkComplete` prevents reuse

**Token Count Manipulation:**
- Mitigation: EZKL cryptographic verification
- Cannot claim more tokens than proven

**Abandonment Attack:**
- Mitigation: Timeout mechanisms
- Both parties protected

**Front-Running:**
- Mitigation: Host assignment at creation
- Only assigned host can submit proofs

## Future Enhancements

### Planned Features

1. **Streaming Payments**
   - Real-time micropayments
   - Payment channels for instant settlement

2. **Multi-Model Sessions**
   - Switch between models mid-session
   - Composite AI workflows

3. **Reputation-Based Intervals**
   - Trusted hosts get larger intervals
   - Automatic interval adjustment

4. **Cross-Chain Sessions**
   - Start on one chain, settle on another
   - Bridge integration for payments

### Research Areas

- Zero-knowledge proofs for private inference
- Optimistic rollup integration
- Decentralized proof generation
- AI model composition protocols

## Common Pitfalls & Troubleshooting

### Host Not Getting Paid?
1. **Check if proofs were submitted**: Query `sessionJobs[jobId].provenTokens`
2. **Verify proof submission frequency**: Must be at checkpoint intervals
3. **Ensure proofs are valid**: Invalid proofs don't update `provenTokens`
4. **Check session status**: Can't submit proofs after session ends

### User Paying Nothing?
- Normal if host didn't submit proofs
- `provenTokens = 0` means no verifiable work was done
- User gets full refund when no tokens are proven

### Understanding Payment Calculation
```
Always remember:
- Payment = provenTokens × pricePerToken (NOT totalTokens × price)
- provenTokens ≤ totalTokensGenerated (only proven work counts)
- If provenTokens = 0, then payment = 0
```

## Conclusion

Session jobs represent a paradigm shift in blockchain-based AI inference. By separating off-chain computation from on-chain verification, they achieve:

- **85-95% reduction** in transaction costs
- **Seamless UX** without constant wallet interactions
- **Trustless payments** based on cryptographic proofs
- **Scalability** for real-world AI applications

This model makes decentralized AI inference economically viable and user-friendly, paving the way for widespread adoption of blockchain-based AI services.

**Remember**: The proof submission requirement is not optional - it's the core mechanism that makes the system trustless and fair for both parties.