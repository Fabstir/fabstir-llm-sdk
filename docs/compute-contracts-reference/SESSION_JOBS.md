# Session Jobs: Continuous AI Inference on Blockchain

## Overview

Session jobs represent a revolutionary approach to blockchain-based AI inference, enabling continuous interaction between users and AI models while minimizing transaction costs. Unlike traditional per-prompt payment models, session jobs use a checkpoint-based proof system that reduces blockchain transactions by 85-95%.

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
Treasury Fee = Payment × 10%
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
    host,           // Assigned GPU provider
    deposit,        // Total funds (e.g., 1 ETH)
    pricePerToken,  // Rate (e.g., 0.0001 ETH/token)
    maxDuration,    // Time limit (e.g., 24 hours)
    proofInterval   // Checkpoint frequency (e.g., 500)
)
```

**Gas cost**: ~200,000 gas

### 2. Active Phase

During the session:
- User sends prompts off-chain
- Host generates responses off-chain
- Host accumulates token counts
- Host submits proofs at checkpoints

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

### Direct Payment Model

Session jobs use direct transfers, bypassing external escrow contracts:

```solidity
function _sendPayments(job, host, payment, fee, refund) {
    if (job.paymentToken != address(0)) {
        // ERC20 tokens (e.g., USDC)
        token.transfer(host, payment);
        token.transfer(treasury, fee);
        token.transfer(user, refund);
    } else {
        // Native ETH
        payable(host).transfer(payment);
        payable(treasury).transfer(fee);
        payable(user).transfer(refund);
    }
}
```

### Payment Security

- Funds locked in contract during session
- Payment only on cryptographic proof
- Automatic refunds for unused deposits
- No funds can be trapped

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
// Create a session
const tx = await marketplace.createSessionJob(
    hostAddress,
    ethers.utils.parseEther("1"),     // 1 ETH deposit
    ethers.utils.parseEther("0.0001"), // Price per token
    86400,                              // 24 hour duration
    500                                 // Proof every 500 tokens
);

// Monitor off-chain
// ... handle prompts and responses off-chain ...

// Complete when done
await marketplace.completeSessionJob(jobId);
```

### For Host Operators

```javascript
// Accept session
const session = await marketplace.getSessionDetails(jobId);

// Generate tokens off-chain
let tokenCount = 0;
for (const prompt of prompts) {
    const response = await model.generate(prompt);
    tokenCount += response.tokenCount;
    
    // Submit proof at checkpoint
    if (tokenCount >= session.checkpointInterval) {
        const proof = await generateEKZLProof(tokenCount);
        await marketplace.submitProofOfWork(jobId, proof, tokenCount);
        tokenCount = 0; // Reset for next batch
    }
}
```

## Economic Benefits

### For Users
- 90% reduction in transaction fees
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

## Conclusion

Session jobs represent a paradigm shift in blockchain-based AI inference. By separating off-chain computation from on-chain verification, they achieve:

- **85-95% reduction** in transaction costs
- **Seamless UX** without constant wallet interactions
- **Trustless payments** based on cryptographic proofs
- **Scalability** for real-world AI applications

This model makes decentralized AI inference economically viable and user-friendly, paving the way for widespread adoption of blockchain-based AI services.