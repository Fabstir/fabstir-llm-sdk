# Fabstir LLM SDK Examples

Complete examples demonstrating the Fabstir LLM SDK with USDC/ETH payments on Base Sepolia.

## Table of Contents

- [Setup](#setup)
- [USDC Payment Flow](#usdc-payment-flow)
- [ETH Payment Flow](#eth-payment-flow)
- [Job Submission Examples](#job-submission-examples)
- [Host Operations](#host-operations)
- [Error Handling](#error-handling)
- [Advanced Patterns](#advanced-patterns)

## Setup

### Environment Variables

```bash
# .env file
NETWORK=base-sepolia
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x... # Your wallet private key

# Contract addresses (Base Sepolia)
JOB_MARKETPLACE_ADDRESS=0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6
PAYMENT_ESCROW_ADDRESS=0x4B7f... # Check latest deployment
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
FAB_ADDRESS=0x... # Governance token only (NOT for payments)
```

### Basic SDK Initialization

```typescript
import { FabstirLLMSDK } from '@fabstir/llm-marketplace-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function initializeSDK() {
  // Setup provider and wallet
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  // Initialize SDK
  const sdk = new FabstirLLMSDK({
    signer: wallet,
    network: 'base-sepolia',
    contracts: {
      jobMarketplace: process.env.JOB_MARKETPLACE_ADDRESS!,
      paymentEscrow: process.env.PAYMENT_ESCROW_ADDRESS!,
      usdc: process.env.USDC_ADDRESS!,
    },
    rpcUrl: process.env.RPC_URL,
    debug: true
  });
  
  return sdk;
}
```

## USDC Payment Flow

### Complete USDC Job Submission

```typescript
async function submitJobWithUSDC() {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  try {
    // Step 1: Check USDC balance
    const usdcContract = new ethers.Contract(
      process.env.USDC_ADDRESS!,
      ['function balanceOf(address) view returns (uint256)'],
      sdk.provider
    );
    
    const balance = await usdcContract.balanceOf(address);
    console.log('USDC Balance:', ethers.formatUnits(balance, 6), 'USDC');
    
    if (balance < ethers.parseUnits('10', 6)) {
      throw new Error('Insufficient USDC balance. Need at least 10 USDC');
    }
    
    // Step 2: Check and approve USDC if needed
    const requiredAmount = ethers.parseUnits('10', 6); // 10 USDC
    const currentAllowance = await sdk.checkUSDCAllowance(address);
    
    if (currentAllowance < requiredAmount) {
      console.log('Approving USDC spending...');
      const approveTx = await sdk.approveUSDC(requiredAmount);
      const approveReceipt = await approveTx.wait();
      console.log('USDC approved! Tx:', approveReceipt.hash);
    }
    
    // Step 3: Prepare job details (ORDER MATTERS!)
    const jobDetails = {
      requester: address,
      model: 'gpt-4',
      prompt: 'Write a comprehensive guide about DeFi lending protocols',
      offerPrice: ethers.parseUnits('10', 6), // 10 USDC
      maxTokens: 500n,
      seed: 0n
    };
    
    const requirements = {
      trustedExecution: false
    };
    
    // Step 4: Submit job with USDC payment
    console.log('Submitting job with 10 USDC payment...');
    const jobTx = await sdk.postJobWithToken(
      jobDetails,
      requirements,
      process.env.USDC_ADDRESS!,
      ethers.parseUnits('10', 6)
    );
    
    console.log('Transaction submitted:', jobTx.hash);
    const receipt = await jobTx.wait();
    
    // Extract job ID from events (adjust based on actual event structure)
    const jobPostedEvent = receipt.logs.find(
      log => log.topics[0] === ethers.id('JobPosted(uint256,address,string)')
    );
    const jobId = jobPostedEvent ? parseInt(jobPostedEvent.topics[1], 16) : null;
    
    console.log('✅ Job submitted successfully!');
    console.log('Job ID:', jobId);
    console.log('Payment: 10 USDC escrowed');
    console.log('Distribution on completion: 9 USDC to host, 1 USDC to treasury');
    
    return jobId;
    
  } catch (error) {
    console.error('Job submission failed:', error);
    
    // Handle specific errors
    if (error.message.includes('Insufficient allowance')) {
      console.log('Solution: Increase USDC approval amount');
    } else if (error.message.includes('Invalid struct')) {
      console.log('Solution: Check jobDetails field order matches Solidity struct');
    }
    
    throw error;
  }
}
```

### Batch USDC Approval

```typescript
async function batchApproveUSDC(jobs: number) {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  // Calculate total USDC needed for all jobs
  const costPerJob = ethers.parseUnits('5', 6); // 5 USDC per job
  const totalRequired = costPerJob * BigInt(jobs);
  
  console.log(`Approving ${ethers.formatUnits(totalRequired, 6)} USDC for ${jobs} jobs...`);
  
  const tx = await sdk.approveUSDC(totalRequired);
  await tx.wait();
  
  console.log('✅ Batch approval complete!');
  
  // Verify new allowance
  const newAllowance = await sdk.checkUSDCAllowance(address);
  console.log('New allowance:', ethers.formatUnits(newAllowance, 6), 'USDC');
}
```

## ETH Payment Flow

### Submit Job with ETH

```typescript
async function submitJobWithETH() {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  try {
    // Check ETH balance
    const balance = await sdk.provider.getBalance(address);
    console.log('ETH Balance:', ethers.formatEther(balance), 'ETH');
    
    if (balance < ethers.parseEther('0.01')) {
      throw new Error('Insufficient ETH balance');
    }
    
    // Prepare job details
    const jobDetails = {
      requester: address,
      model: 'gpt-4',
      prompt: 'Explain the concept of Layer 2 scaling solutions',
      offerPrice: ethers.parseEther('0.005'), // 0.005 ETH
      maxTokens: 300n,
      seed: 0n
    };
    
    const requirements = {
      trustedExecution: false
    };
    
    // Submit with ETH (use ZeroAddress for ETH)
    console.log('Submitting job with 0.005 ETH payment...');
    const tx = await sdk.postJobWithToken(
      jobDetails,
      requirements,
      ethers.ZeroAddress, // ETH payment
      ethers.parseEther('0.005')
    );
    
    const receipt = await tx.wait();
    console.log('✅ Job submitted with ETH payment!');
    console.log('Transaction:', receipt.hash);
    
    return receipt;
    
  } catch (error) {
    console.error('ETH payment failed:', error);
    throw error;
  }
}
```

## Job Submission Examples

### Simple Text Generation

```typescript
async function generateText(prompt: string) {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  const jobDetails = {
    requester: address,
    model: 'gpt-4',
    prompt: prompt,
    offerPrice: ethers.parseUnits('2', 6), // 2 USDC
    maxTokens: 100n,
    seed: 0n
  };
  
  const tx = await sdk.postJobWithToken(
    jobDetails,
    { trustedExecution: false },
    process.env.USDC_ADDRESS!,
    ethers.parseUnits('2', 6)
  );
  
  await tx.wait();
  console.log('Text generation job submitted!');
}
```

### Code Generation with Higher Limits

```typescript
async function generateCode(specification: string) {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  const jobDetails = {
    requester: address,
    model: 'gpt-4',
    prompt: `Generate production-ready code for: ${specification}`,
    offerPrice: ethers.parseUnits('20', 6), // 20 USDC for complex task
    maxTokens: 2000n, // Higher token limit for code
    seed: 42n // Fixed seed for reproducibility
  };
  
  const tx = await sdk.postJobWithToken(
    jobDetails,
    { trustedExecution: true }, // Use TEE for sensitive code
    process.env.USDC_ADDRESS!,
    ethers.parseUnits('20', 6)
  );
  
  await tx.wait();
  console.log('Code generation job submitted with TEE requirement!');
}
```

### Batch Job Submission

```typescript
async function submitBatchJobs(prompts: string[]) {
  const sdk = await initializeSDK();
  const address = await sdk.signer.getAddress();
  
  // Approve total USDC needed
  const costPerJob = ethers.parseUnits('5', 6);
  const totalCost = costPerJob * BigInt(prompts.length);
  
  const approveTx = await sdk.approveUSDC(totalCost);
  await approveTx.wait();
  
  // Submit all jobs
  const jobs = [];
  for (const [index, prompt] of prompts.entries()) {
    const jobDetails = {
      requester: address,
      model: 'gpt-4',
      prompt: prompt,
      offerPrice: costPerJob,
      maxTokens: 200n,
      seed: BigInt(index) // Different seed for each job
    };
    
    const tx = await sdk.postJobWithToken(
      jobDetails,
      { trustedExecution: false },
      process.env.USDC_ADDRESS!,
      costPerJob
    );
    
    jobs.push({
      prompt: prompt,
      tx: tx,
      index: index
    });
    
    console.log(`Job ${index + 1}/${prompts.length} submitted`);
  }
  
  // Wait for all transactions
  const receipts = await Promise.all(jobs.map(job => job.tx.wait()));
  console.log(`✅ All ${prompts.length} jobs submitted successfully!`);
  
  return receipts;
}
```

## Host Operations

### Claim and Complete Job

```typescript
async function hostClaimAndCompleteJob(jobId: string) {
  const sdk = await initializeSDK();
  
  try {
    // Step 1: Claim the job
    console.log(`Claiming job ${jobId}...`);
    const claimTx = await sdk.claimJob(jobId);
    await claimTx.wait();
    console.log('Job claimed successfully!');
    
    // Step 2: Process the job (simulate LLM inference)
    console.log('Processing job...');
    const result = await processLLMInference(jobId); // Your inference logic
    
    // Step 3: Submit the result
    console.log('Submitting result...');
    const completeTx = await sdk.completeJob(jobId, result);
    const receipt = await completeTx.wait();
    
    console.log('✅ Job completed successfully!');
    console.log('Payment released: 90% to host, 10% to treasury');
    console.log('Transaction:', receipt.hash);
    
    return receipt;
    
  } catch (error) {
    console.error('Host operation failed:', error);
    throw error;
  }
}

async function processLLMInference(jobId: string): Promise<string> {
  // Simulate LLM processing
  await new Promise(resolve => setTimeout(resolve, 2000));
  return 'This is the LLM inference result for job ' + jobId;
}
```

### Monitor Available Jobs

```typescript
async function monitorAvailableJobs() {
  const sdk = await initializeSDK();
  const jobMarketplace = new ethers.Contract(
    process.env.JOB_MARKETPLACE_ADDRESS!,
    [
      'event JobPosted(uint256 indexed jobId, address indexed requester, string model)',
      'function getJob(uint256) view returns (tuple(address requester, string model, string prompt, uint256 offerPrice, uint256 maxTokens, uint256 seed, uint8 status))'
    ],
    sdk.provider
  );
  
  // Listen for new jobs
  jobMarketplace.on('JobPosted', async (jobId, requester, model) => {
    console.log(`New job posted: ${jobId}`);
    console.log(`  Requester: ${requester}`);
    console.log(`  Model: ${model}`);
    
    // Get full job details
    const job = await jobMarketplace.getJob(jobId);
    const offerPrice = ethers.formatUnits(job.offerPrice, 6);
    console.log(`  Offer: ${offerPrice} USDC`);
    
    // Auto-claim if profitable
    if (parseFloat(offerPrice) >= 5) { // Minimum 5 USDC
      console.log('Auto-claiming profitable job...');
      await hostClaimAndCompleteJob(jobId.toString());
    }
  });
  
  console.log('Monitoring for new jobs...');
}
```

## Error Handling

### Comprehensive Error Handler

```typescript
async function safeJobSubmission(jobDetails: any, paymentToken: string, amount: bigint) {
  const sdk = await initializeSDK();
  const maxRetries = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${maxRetries}...`);
      
      // Check if USDC needs approval
      if (paymentToken === process.env.USDC_ADDRESS) {
        const address = await sdk.signer.getAddress();
        const allowance = await sdk.checkUSDCAllowance(address);
        
        if (allowance < amount) {
          console.log('Approving USDC...');
          const approveTx = await sdk.approveUSDC(amount * 2n); // Approve extra
          await approveTx.wait();
        }
      }
      
      // Submit job
      const tx = await sdk.postJobWithToken(
        jobDetails,
        { trustedExecution: false },
        paymentToken,
        amount
      );
      
      const receipt = await tx.wait();
      console.log('✅ Job submitted successfully!');
      return receipt;
      
    } catch (error: any) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      // Handle specific errors
      if (error.code === 'INSUFFICIENT_FUNDS') {
        console.log('Not enough funds to continue');
        break;
      } else if (error.message.includes('nonce')) {
        console.log('Nonce issue detected, waiting...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else if (error.message.includes('gas')) {
        console.log('Gas estimation failed, increasing gas limit...');
        // Retry with higher gas limit
      } else if (error.message.includes('Invalid struct')) {
        console.log('Struct validation failed. Check field order:');
        console.log('1. requester, 2. model, 3. prompt, 4. offerPrice, 5. maxTokens, 6. seed');
        break; // Don't retry struct errors
      }
      
      // Wait before retry
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`Failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

## Advanced Patterns

### Job Status Monitoring

```typescript
async function monitorJobStatus(jobId: string, intervalMs: number = 5000) {
  const sdk = await initializeSDK();
  const jobMarketplace = new ethers.Contract(
    process.env.JOB_MARKETPLACE_ADDRESS!,
    ['function getJob(uint256) view returns (tuple(...))'],
    sdk.provider
  );
  
  return new Promise((resolve, reject) => {
    const checkStatus = async () => {
      try {
        const job = await jobMarketplace.getJob(jobId);
        const status = job.status; // 0=Posted, 1=Claimed, 2=Completed, 3=Failed
        
        console.log(`Job ${jobId} status: ${['Posted', 'Claimed', 'Completed', 'Failed'][status]}`);
        
        if (status === 2) { // Completed
          resolve(job);
        } else if (status === 3) { // Failed
          reject(new Error(`Job ${jobId} failed`));
        } else {
          setTimeout(checkStatus, intervalMs);
        }
      } catch (error) {
        reject(error);
      }
    };
    
    checkStatus();
  });
}
```

### Gas Optimization

```typescript
async function optimizedJobSubmission(jobs: any[]) {
  const sdk = await initializeSDK();
  
  // Get current gas prices
  const feeData = await sdk.provider.getFeeData();
  console.log('Current gas price:', ethers.formatUnits(feeData.gasPrice!, 'gwei'), 'gwei');
  
  // Wait for low gas if needed
  if (feeData.gasPrice! > ethers.parseUnits('50', 'gwei')) {
    console.log('Gas too high, waiting for better prices...');
    await waitForLowerGas(sdk.provider, ethers.parseUnits('30', 'gwei'));
  }
  
  // Batch approve USDC once for all jobs
  const totalCost = jobs.reduce((sum, job) => sum + job.cost, 0n);
  const approveTx = await sdk.approveUSDC(totalCost);
  await approveTx.wait();
  
  // Submit jobs with optimized gas settings
  for (const job of jobs) {
    const tx = await sdk.postJobWithToken(
      job.details,
      job.requirements,
      process.env.USDC_ADDRESS!,
      job.cost,
      {
        gasLimit: 300000, // Fixed gas limit
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
      }
    );
    await tx.wait();
  }
}

async function waitForLowerGas(provider: ethers.Provider, targetGasPrice: bigint) {
  while (true) {
    const feeData = await provider.getFeeData();
    if (feeData.gasPrice! <= targetGasPrice) {
      break;
    }
    console.log('Waiting for gas to drop...');
    await new Promise(resolve => setTimeout(resolve, 60000)); // Check every minute
  }
}
```

### Event-Driven Architecture

```typescript
class JobManager extends EventEmitter {
  private sdk: FabstirLLMSDK;
  private jobs: Map<string, any> = new Map();
  
  constructor(sdk: FabstirLLMSDK) {
    super();
    this.sdk = sdk;
    this.setupEventListeners();
  }
  
  private setupEventListeners() {
    const jobMarketplace = new ethers.Contract(
      process.env.JOB_MARKETPLACE_ADDRESS!,
      [
        'event JobPosted(uint256 indexed jobId, address indexed requester, string model)',
        'event JobClaimed(uint256 indexed jobId, address indexed host)',
        'event JobCompleted(uint256 indexed jobId, string resultHash)',
        'event PaymentReleased(uint256 indexed jobId, address indexed recipient, uint256 amount)'
      ],
      this.sdk.provider
    );
    
    jobMarketplace.on('JobPosted', (jobId, requester, model) => {
      this.emit('job:posted', { jobId: jobId.toString(), requester, model });
      this.jobs.set(jobId.toString(), { status: 'posted', requester, model });
    });
    
    jobMarketplace.on('JobClaimed', (jobId, host) => {
      this.emit('job:claimed', { jobId: jobId.toString(), host });
      const job = this.jobs.get(jobId.toString());
      if (job) job.status = 'claimed';
    });
    
    jobMarketplace.on('JobCompleted', (jobId, resultHash) => {
      this.emit('job:completed', { jobId: jobId.toString(), resultHash });
      const job = this.jobs.get(jobId.toString());
      if (job) job.status = 'completed';
    });
    
    jobMarketplace.on('PaymentReleased', (jobId, recipient, amount) => {
      this.emit('payment:released', {
        jobId: jobId.toString(),
        recipient,
        amount: ethers.formatUnits(amount, 6) + ' USDC'
      });
    });
  }
  
  async submitJob(prompt: string, modelId: string, payment: string) {
    const address = await this.sdk.signer.getAddress();
    const jobDetails = {
      requester: address,
      model: modelId,
      prompt: prompt,
      offerPrice: ethers.parseUnits(payment, 6),
      maxTokens: 500n,
      seed: 0n
    };
    
    const tx = await this.sdk.postJobWithToken(
      jobDetails,
      { trustedExecution: false },
      process.env.USDC_ADDRESS!,
      ethers.parseUnits(payment, 6)
    );
    
    const receipt = await tx.wait();
    return receipt;
  }
  
  getJob(jobId: string) {
    return this.jobs.get(jobId);
  }
}

// Usage
async function useJobManager() {
  const sdk = await initializeSDK();
  const manager = new JobManager(sdk);
  
  manager.on('job:posted', (data) => {
    console.log('New job posted:', data);
  });
  
  manager.on('job:completed', (data) => {
    console.log('Job completed:', data);
  });
  
  manager.on('payment:released', (data) => {
    console.log('Payment released:', data);
  });
  
  // Submit a job
  await manager.submitJob(
    'Write a haiku about smart contracts',
    'gpt-4',
    '5' // 5 USDC
  );
}
```

## Important Notes

### Payment Token Changes

⚠️ **CRITICAL**: FAB tokens are NO LONGER used for job payments!

```typescript
// ❌ WRONG - Don't use FAB for payments
const tx = await sdk.postJobWithToken(
  jobDetails,
  requirements,
  FAB_ADDRESS, // WRONG!
  amount
);

// ✅ CORRECT - Use USDC or ETH
const tx = await sdk.postJobWithToken(
  jobDetails,
  requirements,
  USDC_ADDRESS, // or ethers.ZeroAddress for ETH
  amount
);
```

### Struct Field Order

The order of fields in `JobDetails` must match the Solidity struct exactly:

```typescript
// ✅ CORRECT ORDER
const jobDetails = {
  requester: address,      // Field 1
  model: 'gpt-4',          // Field 2
  prompt: 'test',          // Field 3
  offerPrice: amount,      // Field 4
  maxTokens: 100n,         // Field 5
  seed: 0n                 // Field 6
};

// ❌ WRONG ORDER - Will fail
const jobDetails = {
  model: 'gpt-4',          // Wrong position!
  requester: address,
  // ...
};
```

### Gas Considerations

Base Sepolia has very low gas fees, but still optimize for production:

```typescript
// Batch operations to save gas
const batchApprove = await sdk.approveUSDC(totalForAllJobs);
await batchApprove.wait();

// Then submit all jobs without individual approvals
for (const job of jobs) {
  await submitJob(job);
}
```

## Next Steps

1. **Get Test Tokens**: Obtain Base Sepolia ETH and USDC from faucets
2. **Deploy Contracts**: Use provided addresses or deploy your own
3. **Run Examples**: Start with simple text generation
4. **Build Your App**: Integrate the SDK into your application
5. **Join Community**: Get help in Discord or GitHub Discussions

For more information, see:
- [API Reference](API.md)
- [Architecture Guide](ARCHITECTURE.md)
- [Setup Guide](SETUP_GUIDE.md)