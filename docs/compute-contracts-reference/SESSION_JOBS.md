# Session Jobs: Continuous AI Inference on Blockchain

*Last Updated: January 28, 2025*

## Current Deployment

- **JobMarketplaceWithModels**: `0x462050a4a551c4292586D9c1DE23e3158a9bF3B3` ✅ NEW
- **NodeRegistryWithModels**: `0xC8dDD546e0993eEB4Df03591208aEDF6336342D7` ✅ NEW
- **ProofSystem**: `0x2ACcc60893872A499700908889B38C5420CBcFD1`
- **HostEarnings**: `0x908962e8c6CE72610021586f85ebDE09aAc97776`
- **ModelRegistry**: `0x92b2De840bB2171203011A6dBA928d855cA8183E`
- **Network**: Base Sepolia
- **Storage**: `sessionJobs` mapping (NOT `sessions` or `jobs`)

## Overview

Session jobs represent a revolutionary approach to blockchain-based AI inference, enabling continuous interaction between users and AI models while minimizing transaction costs. Unlike traditional per-prompt payment models, session jobs use a checkpoint-based proof system that reduces blockchain transactions by 85-95%.

**New Feature (January 28, 2025)**: Host-controlled pricing allows hosts to set their minimum price per token, with contract-level validation ensuring clients pay fair market rates.

## ⚠️ CRITICAL: Proof Submission Required

**Hosts MUST submit cryptographic proofs at checkpoint intervals or they will NOT be paid.**

Payment is based ONLY on `provenTokens` (cryptographically verified work), not claimed usage:
- **Without proof submission**: `provenTokens` = 0 → Host payment = 0 → User gets full refund
- **With proof submission**: `provenTokens` accumulates → Host gets paid → User pays for actual usage

This proof-based system is what makes session jobs trustless and prevents either party from cheating.

## ⚠️ NEW: Host-Controlled Pricing

**Clients MUST query host pricing before creating sessions or transaction will REVERT.**

Price validation ensures fair compensation:
- **Hosts set minimum**: Each host sets `minPricePerToken` (100-100,000 range = 0.0001 to 0.1 USDC per token)
- **Contract validates**: `clientPricePerToken >= hostMinPricePerToken`
- **Transaction reverts**: "Price below host minimum" if client price too low

See [Host-Controlled Pricing](#host-controlled-pricing) section for details.

## Complete Session Flow

```
0. CLIENT QUERIES PRICING (on-chain) ← NEW STEP!
   ↓ Query host's minPricePerToken from NodeRegistry
   ↓ Ensure your price >= host minimum

1. USER CREATES SESSION (on-chain)
   ↓ Deposits funds, sets price/token (>= host minimum), assigns host
   ↓ Contract validates price >= host's minPricePerToken

2. USER ↔ HOST INTERACTION (off-chain)
   ↓ Prompts sent, responses generated, tokens counted

3. HOST SUBMITS PROOFS (on-chain) ← MANDATORY!
   ↓ Every N tokens (checkpoint), cryptographic proof submitted
   ↓ Updates provenTokens in contract

4. USER COMPLETES SESSION (on-chain)
   ↓ Calls completeSessionJob()

5. CONTRACT CALCULATES & DISTRIBUTES (automatic)
   - Payment = provenTokens × pricePerToken
   - Host receives: 90% of payment (via HostEarnings accumulation)
   - Treasury receives: 10% of payment (accumulated for batch withdrawal)
   - User receives: Refund of unused deposit
```

**Key Points**:
- Step 0 (pricing query) prevents transaction failures
- Step 3 (proof submission) is what enables trustless payment - skip it and the host gets nothing!

## Key Innovation: Off-Chain Inference, On-Chain Verification

The session job model separates:
- **Off-chain**: Actual AI inference, prompt/response exchanges, real-time interaction
- **On-chain**: Periodic proof submission, payment verification, dispute resolution, pricing validation

This separation enables:
- ✅ Continuous AI conversations without per-prompt gas fees
- ✅ Trustless payment based on cryptographically proven work
- ✅ Protection for both users and hosts
- ✅ Fair market pricing with host autonomy
- ✅ 85-95% reduction in transaction costs

## Transaction Model

### Transaction Frequency

Session jobs require blockchain transactions only at key checkpoints:

1. **Pricing Query** (read-only, no gas)
   - Query host's minimum price
   - Determine acceptable price range

2. **Session Creation** (1 transaction)
   - User deposits funds
   - Sets payment parameters (must meet host minimum)
   - Assigns host

3. **Proof Checkpoints** (periodic transactions)
   - Host submits cryptographic proofs
   - Frequency determined by `checkpointInterval`
   - Not tied to individual prompts

4. **Session Completion** (1-2 transactions)
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
- 0 tx: Query host pricing (read-only)
- 1 tx: Create session (deposit 1 ETH, price validated)
- 5 tx: Proof submissions (every 1000 tokens)
- 1 tx: Complete session
Gas cost: ~$10-15 on L2
User experience: Seamless conversation
```

## Host-Controlled Pricing

### Overview

As of January 28, 2025, hosts have full control over their pricing:

**For Hosts**:
- Set `minPricePerToken` during registration (100-100,000)
- Update pricing anytime via `nodeRegistry.updatePricing()`
- Price range: 100 (0.0001 USDC) to 100,000 (0.1 USDC) per token

**For Clients**:
- Query `nodeRegistry.getNodePricing(host)` BEFORE creating session
- Offer price >= host minimum, or transaction reverts
- Contract validates pricing automatically

### Price Range

| Value | USDC per Token | Use Case |
|-------|----------------|----------|
| 100 | 0.0001 USDC | Minimum allowed (testing, low-cost models) |
| 1,000 | 0.001 USDC | Budget tier |
| 2,000 | 0.002 USDC | Standard tier (typical) |
| 5,000 | 0.005 USDC | Premium tier |
| 100,000 | 0.1 USDC | Maximum allowed (high-end models) |

### Integration Example

```javascript
import NodeRegistryABI from './NodeRegistryWithModels-CLIENT-ABI.json';
import JobMarketplaceABI from './JobMarketplaceWithModels-CLIENT-ABI.json';

const nodeRegistry = new ethers.Contract(
  '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
  NodeRegistryABI,
  provider
);

const marketplace = new ethers.Contract(
  '0x462050a4a551c4292586D9c1DE23e3158a9bF3B3',
  JobMarketplaceABI,
  signer
);

// STEP 1: Query host pricing (MANDATORY)
const hostAddress = '0x...';
const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);
console.log(`Host minimum: ${hostMinPrice} (${hostMinPrice / 1e6} USDC per token)`);

// STEP 2: Set your price >= host minimum
const myPricePerToken = Math.max(hostMinPrice, 2000); // At least host minimum

// STEP 3: Create session with validated price
const tx = await marketplace.createSessionJob(
  hostAddress,
  myPricePerToken,  // Must be >= hostMinPrice or REVERTS!
  3600,             // 1 hour max duration
  1000,             // Proof every 1000 tokens
  { value: ethers.utils.parseEther('0.1') }
);
```

### Error Handling

```javascript
try {
  const tx = await marketplace.createSessionJob(
    hostAddress,
    1500,  // Price per token
    3600,
    1000,
    { value: deposit }
  );
} catch (error) {
  if (error.message.includes("Price below host minimum")) {
    // Client offered price < host's minPricePerToken
    const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);
    console.error(`Minimum required: ${hostMinPrice}, you offered: 1500`);
    // Retry with acceptable price
  }
}
```

## Proof Checkpoint System

### How Checkpoints Work

The `checkpointInterval` (also called `proofInterval`) determines how often the host must submit proof of work:

```solidity
// Set during session creation
checkpointInterval: 1000  // Submit proof every 1000 tokens (production default)
```

### Checkpoint Parameters

| Parameter | Min | Max | Typical | Purpose |
|-----------|-----|-----|---------|---------|
| checkpointInterval | 100 | 1,000,000 | 1000 (production) | Tokens between proofs |
| Proof submission time | - | - | 5-10 sec | On-chain verification |
| Gas per checkpoint | - | - | ~30,000 | L2 optimized |

### Choosing Optimal Intervals

**Small Intervals (100-500 tokens):**
- ✅ More frequent payment verification
- ✅ Lower risk for both parties
- ❌ Higher transaction costs (10x more gas than production default)
- Best for: Development/testing, high-value models, untrusted parties

**Production Default (1000 tokens):** ⭐ RECOMMENDED
- ✅ Optimal balance of security and gas costs
- ✅ ~$0.50 savings per session vs. 100-token intervals
- ✅ Reasonable verification frequency
- Best for: Production deployments, most use cases

**Medium-Large Intervals (2000-5000 tokens):**
- ✅ Lower transaction costs
- ❌ Moderate risk exposure
- ❌ Longer payment delays
- Best for: Long sessions, trusted relationships

**Large Intervals (5000+ tokens):**
- ✅ Minimal transaction costs
- ❌ High risk exposure
- ❌ Significant payment delays
- Best for: Trusted relationships only, low-value interactions

## Token-Based Accounting

### Core Concepts

Session jobs use **tokens** as the unit of account, not prompts:

```solidity
struct SessionDetails {
    uint256 depositAmount;      // Total funds deposited
    uint256 pricePerToken;      // Cost per AI token (must be >= host minimum)
    uint256 provenTokens;       // Tokens cryptographically proven
    uint256 checkpointInterval; // Tokens between proofs
}
```

### Payment Calculation

```
Payment = provenTokens × pricePerToken
Treasury Fee = Payment × 10%
Host Receives = Payment × 90%
```

### Example Token Flow

```
User deposits: 1 ETH
Host minimum price: 1500 per token
Client offers price: 2000 per token (>= 1500, valid!)
Maximum tokens: 5,000

Conversation generates:
- Prompt 1: 150 tokens
- Prompt 2: 200 tokens
- Prompt 3: 175 tokens
- ...
- Total: 2,500 tokens

Host submits proofs at:
- 1000 tokens: Proof 1
- 2000 tokens: Proof 2
- 2500 tokens: Proof 3 (final)

Final payment:
- Total payment: 2,500 × 0.002 ETH = 5 ETH
- Host receives: 5 × 0.9 = 4.5 ETH (90%)
- Treasury receives: 5 × 0.1 = 0.5 ETH (10%)
- User refunded: 1 - 5 = 0 ETH (used full deposit)
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

```javascript
// STEP 0: Query host pricing (NEW - MANDATORY!)
const nodeRegistry = new ethers.Contract(
  '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
  NodeRegistryABI,
  provider
);

const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);
const myPrice = Math.max(hostMinPrice, 2000); // Ensure >= host minimum

// STEP 1: Create session with validated price
const marketplace = new ethers.Contract(
  '0x462050a4a551c4292586D9c1DE23e3158a9bF3B3',
  JobMarketplaceABI,
  signer
);

await marketplace.createSessionJob(
    host,           // Assigned GPU provider (must have supported models)
    myPrice,        // Rate (MUST be >= host's minPricePerToken)
    maxDuration,    // Time limit (e.g., 24 hours)
    proofInterval   // Checkpoint frequency (e.g., 1000 - production default)
    // Deposit sent as msg.value for ETH, or pre-approved for tokens
);
```

**Requirements**:
- Host must be registered in NodeRegistryWithModels
- Host must support approved models from ModelRegistry
- **NEW**: `pricePerToken` must be >= host's `minPricePerToken`
- Minimum deposit: 0.0002 ETH or 0.80 USDC

**Validation**:
- Contract queries `nodeRegistry.getNodeFullInfo(host)` to get 7th field (minPricePerToken)
- Reverts with "Price below host minimum" if client price < host minimum

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
completeSessionJob(jobId)  // Anyone can call (user, host, or third party)
// Payment distributed automatically:
// - Host: 90% to HostEarnings (accumulated)
// - Treasury: 10% accumulated for batch withdrawal
// - User: Refund of unused deposit
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

### Payment Split (Explicit)

All session payments follow this split:
- **Host**: 90% of payment (accumulated in HostEarnings for batch withdrawal)
- **Treasury**: 10% of payment (accumulated for batch withdrawal)
- **User**: Refund of (deposit - payment)

Example:
```
Payment = 5 ETH (2500 tokens × 0.002 ETH)
Host receives: 4.5 ETH (90%)
Treasury receives: 0.5 ETH (10%)
```

### Payment Security

- Funds locked in contract during session
- **Payment ONLY on cryptographic proof (provenTokens)**
- **Price validation ensures fair compensation**
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

1. **Query pricing before session creation** (NEW)
   - Always call `nodeRegistry.getNodePricing()` first
   - Handle "Price below host minimum" errors gracefully
   - Display host pricing to users before commitment

2. **Set appropriate checkpoint intervals**
   - Use 1000 tokens for production (optimal balance)
   - Balance security vs gas costs
   - Consider model value and trust level

3. **Use token batching**
   - Submit multiple proofs in one transaction
   - Reduces gas costs further

4. **Monitor proof submissions**
   - Track checkpoint timing
   - Ensure timely submissions

## Integration Guide

### For Frontend Developers

```javascript
import NodeRegistryABI from './NodeRegistryWithModels-CLIENT-ABI.json';
import JobMarketplaceABI from './JobMarketplaceWithModels-CLIENT-ABI.json';

const nodeRegistry = new ethers.Contract(
  '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
  NodeRegistryABI,
  provider
);

const marketplace = new ethers.Contract(
  '0x462050a4a551c4292586D9c1DE23e3158a9bF3B3',
  JobMarketplaceABI,
  signer
);

// STEP 0: Query host pricing (NEW - MANDATORY!)
const hostAddress = '0x...';
const hostMinPrice = await nodeRegistry.getNodePricing(hostAddress);
console.log(`Host minimum: ${hostMinPrice}`);

// Display to user: "This host charges minimum 0.002 USDC per token"

// STEP 1: Create session with valid price (on-chain)
const myPrice = Math.max(hostMinPrice, 2000); // Ensure >= host minimum

const tx = await marketplace.createSessionJob(
    hostAddress,
    myPrice,                               // MUST be >= hostMinPrice
    ethers.utils.parseEther("0.1"),        // 0.1 ETH deposit
    86400,                                  // 24 hour duration
    1000,                                   // Proof every 1000 tokens (production default)
    { value: ethers.utils.parseEther("0.1") }
);
const jobId = tx.events[0].args.jobId;

// STEP 2: Off-chain interaction
// Send prompts to host, receive responses
// Track token usage but DO NOT pay yet

// STEP 3: CRITICAL: Host must submit proofs periodically
// The host will call submitProofOfWork() every 1000 tokens
// This happens independently - frontend just needs to wait
// Monitor ProofSubmitted events to track progress:
marketplace.on("ProofSubmitted", (jobId, host, tokens, proofHash, verified) => {
    console.log(`Proof submitted for ${tokens} tokens - verified: ${verified}`);
});

// STEP 4: Complete session when done (on-chain)
await marketplace.completeSessionJob(jobId);
// Payment automatically calculated from provenTokens
// Host gets 90%, treasury gets 10%, user gets refund
```

### For Host Operators

```javascript
const marketplace = new ethers.Contract(
  '0x462050a4a551c4292586D9c1DE23e3158a9bF3B3',
  JobMarketplaceABI,
  signer
);

// Accept session
const session = await marketplace.sessionJobs(jobId);
console.log(`Session price: ${session.pricePerToken} per token`);

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

### For Host Registration (Pricing Setup)

```javascript
import NodeRegistryABI from './NodeRegistryWithModels-CLIENT-ABI.json';

const nodeRegistry = new ethers.Contract(
  '0xC8dDD546e0993eEB4Df03591208aEDF6336342D7',
  NodeRegistryABI,
  signer
);

// Register with pricing
const minPricePerToken = 2000; // 0.002 USDC per token
const metadata = JSON.stringify({
  hardware: { gpu: "rtx-4090", vram: 24 },
  capabilities: ["inference", "streaming"],
  location: "us-east"
});

await nodeRegistry.registerNode(
  metadata,
  "https://my-host.com:8080",
  [modelId],
  minPricePerToken  // Required pricing parameter
);

// Update pricing later
const newPrice = 3000; // Increase to 0.003 USDC per token
await nodeRegistry.updatePricing(newPrice);
```

## Economic Benefits

### For Users
- Up to 90% reduction in transaction fees
- No interruptions during conversation
- Pay only for tokens actually used
- **Fair market pricing with transparency**
- Automatic refunds for unused deposits

### For Hosts
- **Set your own minimum pricing**
- **Update pricing dynamically based on demand**
- Guaranteed payment for proven work
- Protection against user abandonment
- Reduced transaction overhead
- Higher throughput capacity

### For the Network
- 85-95% reduction in blockchain congestion
- More scalable AI inference
- Better resource utilization
- Lower environmental impact
- Market-driven pricing discovery

## Security Considerations

### Trust Model

Session jobs require minimal trust:
- Cryptographic proofs ensure accurate token counting
- Smart contract holds funds in escrow
- **Contract validates pricing automatically**
- Automatic dispute resolution
- No party can steal funds

### Attack Vectors and Mitigations

**Proof Replay Attack:**
- Mitigation: Each proof is marked as used
- `verifyAndMarkComplete` prevents reuse

**Token Count Manipulation:**
- Mitigation: EZKL cryptographic verification
- Cannot claim more tokens than proven

**Price Manipulation:**
- Mitigation: Contract-level price validation (NEW)
- Host cannot accept sessions below their minimum
- Client cannot underpay below host minimum

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

4. **Dynamic Pricing Adjustments**
   - Hosts adjust pricing based on demand
   - Real-time market rates

5. **Cross-Chain Sessions**
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

### Session Creation Fails with "Price below host minimum"?
1. **Query host pricing first**: `nodeRegistry.getNodePricing(host)`
2. **Ensure your price >= host minimum**: Use `Math.max(hostMinPrice, yourPrice)`
3. **Check price range**: Must be between 100 and 100,000
4. **Display pricing to users**: Show host minimum before session creation

### Understanding Payment Calculation
```
Always remember:
- Payment = provenTokens × pricePerToken (NOT totalTokens × price)
- provenTokens ≤ totalTokensGenerated (only proven work counts)
- pricePerToken must be >= host's minPricePerToken
- If provenTokens = 0, then payment = 0
- Host always gets 90%, treasury gets 10%
```

## Conclusion

Session jobs represent a paradigm shift in blockchain-based AI inference. By separating off-chain computation from on-chain verification, they achieve:

- **85-95% reduction** in transaction costs
- **Seamless UX** without constant wallet interactions
- **Trustless payments** based on cryptographic proofs
- **Fair market pricing** with host autonomy (NEW)
- **Scalability** for real-world AI applications

This model makes decentralized AI inference economically viable and user-friendly, paving the way for widespread adoption of blockchain-based AI services.

**Remember**:
1. The proof submission requirement is not optional - it's the core mechanism that makes the system trustless and fair for both parties.
2. **NEW**: Always query host pricing before creating sessions to avoid transaction failures.
