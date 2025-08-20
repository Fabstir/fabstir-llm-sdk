# Fabstir LLM SDK Quick Reference

## Package Information
- **Package**: `@fabstir/llm-marketplace-sdk`
- **Network**: Base Sepolia
- **Payment Methods**: USDC (primary), ETH (alternative)
- **FAB Token**: Governance/staking only (NOT for payments)

## Core SDK Methods

### Initialization
```typescript
import { FabstirLLMSDK } from '@fabstir/llm-marketplace-sdk';
import { ethers } from 'ethers';

const sdk = new FabstirLLMSDK({
  signer: wallet,  // ethers.Signer required
  network: 'base-sepolia',
  contracts: {
    jobMarketplace: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
    paymentEscrow: '0x4B7f...',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  rpcUrl: 'https://sepolia.base.org'
});
```

### Job Submission with USDC/ETH
```typescript
// CRITICAL: Field order must match Solidity struct exactly!
interface JobDetails {
  requester: string;     // Field 1: User's wallet address
  model: string;         // Field 2: Model ID (e.g., "gpt-4")
  prompt: string;        // Field 3: The prompt text
  offerPrice: bigint;    // Field 4: Payment amount in token units
  maxTokens: bigint;     // Field 5: Maximum tokens for response
  seed: bigint;          // Field 6: Random seed for reproducibility
}

// Main job submission method
sdk.postJobWithToken(
  jobDetails: JobDetails,
  requirements: { trustedExecution: boolean },
  paymentToken: string,  // USDC or ETH address
  paymentAmount: bigint
) => Promise<ContractTransaction>

// Example with USDC
const tx = await sdk.postJobWithToken(
  {
    requester: userAddress,
    model: 'gpt-4',
    prompt: 'Write a haiku',
    offerPrice: ethers.parseUnits('5', 6), // 5 USDC
    maxTokens: 100n,
    seed: 0n
  },
  { trustedExecution: false },
  USDC_ADDRESS,
  ethers.parseUnits('5', 6)
);
```

### USDC Payment Flow
```typescript
// 1. Check USDC allowance
sdk.checkUSDCAllowance(owner: string) => Promise<bigint>

// 2. Approve USDC if needed
sdk.approveUSDC(amount: bigint) => Promise<ContractTransaction>

// 3. Submit job with USDC
// (see postJobWithToken above)

// Complete flow example:
const allowance = await sdk.checkUSDCAllowance(userAddress);
if (allowance < jobCost) {
  const approveTx = await sdk.approveUSDC(jobCost);
  await approveTx.wait();
}
const jobTx = await sdk.postJobWithToken(jobDetails, requirements, USDC_ADDRESS, jobCost);
await jobTx.wait();
```

### ETH Payment Flow
```typescript
// ETH doesn't require approval
const tx = await sdk.postJobWithToken(
  jobDetails,
  requirements,
  ethers.ZeroAddress,  // Use ZeroAddress for ETH
  ethers.parseEther('0.001')  // Payment in ETH
);
```

### Host Operations
```typescript
// Claim a job (for hosts)
sdk.claimJob(jobId: string) => Promise<ContractTransaction>

// Complete a job with result
sdk.completeJob(jobId: string, result: string) => Promise<ContractTransaction>

// Payment automatically distributed:
// - 90% to host
// - 10% to treasury
```

### Job Retrieval (Current Implementation)
```typescript
// Get job details from contract
sdk.getJob(jobId: string) => Promise<{
  requester: string;
  model: string;
  prompt: string;
  offerPrice: bigint;
  maxTokens: bigint;
  seed: bigint;
  status: number; // 0=Posted, 1=Claimed, 2=Completed, 3=Failed
}>

// Get pending jobs
sdk.getPendingJobs() => Promise<JobDetails[]>
```

## Contract Addresses (Base Sepolia)

```typescript
const ADDRESSES = {
  jobMarketplace: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6',
  paymentEscrow: '0x4B7f...', // Check latest deployment
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  fab: '0x...', // Governance only, NOT for payments
};
```

## Common Patterns

### Complete USDC Job Submission
```typescript
async function submitJobWithUSDC(prompt: string, payment: string) {
  // 1. Check and approve USDC
  const amount = ethers.parseUnits(payment, 6); // USDC has 6 decimals
  const allowance = await sdk.checkUSDCAllowance(userAddress);
  
  if (allowance < amount) {
    const approveTx = await sdk.approveUSDC(amount);
    await approveTx.wait();
  }
  
  // 2. Prepare job details (ORDER MATTERS!)
  const jobDetails = {
    requester: userAddress,
    model: 'gpt-4',
    prompt: prompt,
    offerPrice: amount,
    maxTokens: 500n,
    seed: 0n
  };
  
  // 3. Submit job
  const tx = await sdk.postJobWithToken(
    jobDetails,
    { trustedExecution: false },
    USDC_ADDRESS,
    amount
  );
  
  const receipt = await tx.wait();
  return receipt;
}
```

### Error Handling
```typescript
try {
  await submitJobWithUSDC('Test prompt', '10');
} catch (error) {
  if (error.message.includes('Insufficient allowance')) {
    // Need to approve more USDC
  } else if (error.message.includes('Invalid struct')) {
    // Check field order in jobDetails
  } else if (error.message.includes('Insufficient balance')) {
    // Need more USDC tokens
  }
}
```

## Migration from Old SDK

### Old (Deprecated) Methods
```typescript
// ❌ OLD - Don't use these
sdk.submitJob(params) // Used FAB tokens
sdk.submitJobWithNegotiation(params) // P2P not implemented yet
sdk.getJobStatus(jobId) // Use getJob instead
sdk.getJobResult(jobId) // Use getJob instead
```

### New Methods
```typescript
// ✅ NEW - Use these
sdk.postJobWithToken(...) // USDC/ETH payments
sdk.approveUSDC(...)      // Required for USDC
sdk.checkUSDCAllowance(...) // Check before submitting
sdk.claimJob(...)         // For hosts
sdk.completeJob(...)      // For hosts
```

## Important Notes

### ⚠️ Critical Changes
1. **FAB tokens are NOT for payments** - Only USDC/ETH
2. **Struct field order MUST match Solidity** - Wrong order = transaction fails
3. **USDC requires approval** - Always check allowance first
4. **Base Sepolia only** - Not on mainnet or other chains yet
5. **Payment distribution is automatic** - 90% host, 10% treasury

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Insufficient allowance" | USDC not approved | Call `approveUSDC()` first |
| "Invalid struct" | Wrong field order | Check JobDetails field order |
| "FAB payment failed" | Using FAB for payment | Use USDC or ETH instead |
| "Insufficient balance" | Not enough tokens | Get USDC from faucet/DEX |

### Gas Optimization Tips
```typescript
// Batch approve for multiple jobs
const totalCost = jobCount * costPerJob;
await sdk.approveUSDC(totalCost);

// Then submit jobs without individual approvals
for (const job of jobs) {
  await sdk.postJobWithToken(...);
}
```

## Events (if implemented)

### Contract Events
```typescript
// Listen to contract events directly
const jobMarketplace = new ethers.Contract(address, abi, provider);

jobMarketplace.on('JobPosted', (jobId, requester, model) => {
  console.log(`Job ${jobId} posted by ${requester}`);
});

jobMarketplace.on('JobClaimed', (jobId, host) => {
  console.log(`Job ${jobId} claimed by ${host}`);
});

jobMarketplace.on('JobCompleted', (jobId, resultHash) => {
  console.log(`Job ${jobId} completed`);
});

jobMarketplace.on('PaymentReleased', (jobId, recipient, amount) => {
  console.log(`Payment released: ${ethers.formatUnits(amount, 6)} USDC`);
});
```

## Testing Checklist

- [ ] Get Base Sepolia ETH from faucet
- [ ] Get test USDC on Base Sepolia
- [ ] Add Base Sepolia to MetaMask (Chain ID: 84532)
- [ ] Approve USDC spending
- [ ] Submit test job with USDC
- [ ] Monitor job status
- [ ] Verify payment distribution

## Resources

- **Base Sepolia Faucet**: https://faucet.quicknode.com/base/sepolia
- **Base Sepolia Explorer**: https://sepolia.basescan.org
- **Contract Address**: 0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6
- **USDC on Base Sepolia**: 0x036CbD53842c5426634e7929541eC2318f3dCF7e