# Fabstir LLM SDK Examples

Comprehensive examples demonstrating how to use the Fabstir LLM SDK with the new headless architecture and USDC/ETH payment methods.

## Table of Contents

- [Getting Started](#getting-started)
- [Basic Examples](#basic-examples)
- [Payment Examples](#payment-examples)
- [Headless SDK Examples](#headless-sdk-examples)
- [React Integration](#react-integration)
- [Node.js Examples](#nodejs-examples)
- [Advanced Examples](#advanced-examples)
- [Error Handling](#error-handling)
- [Migration Examples](#migration-examples)

## Getting Started

### Installation

```bash
npm install @fabstir/llm-sdk ethers
```

### Import the SDK

```typescript
// For headless SDK (recommended)
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';

// For contract-focused operations
import { FabstirLLMSDK } from '@fabstir/llm-sdk';

// For React applications
import { useSDK } from '@fabstir/llm-sdk/adapters/react';
```

## Basic Examples

### 1. Simple Job Submission with ETH

```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

async function submitBasicJob() {
  // Create SDK instance
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia'
  });

  // Get signer from wallet
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  
  // Set signer on SDK
  await sdk.setSigner(signer);

  // Submit job with ETH payment
  const job = await sdk.submitJob({
    modelId: 'gpt-3.5-turbo',
    prompt: 'Write a haiku about blockchain',
    maxTokens: 100,
    offerPrice: '1000000000000000', // 0.001 ETH
    paymentToken: 'ETH'
  });

  console.log('Job submitted:', job.requestId);
  
  // Clean up
  await sdk.disconnect();
}
```

### 2. Simple Job Submission with USDC

```typescript
import { FabstirLLMSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

async function submitJobWithUSDC() {
  // Use FabstirLLMSDK for automatic USDC handling
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const sdk = new FabstirLLMSDK(provider);

  // Submit job with USDC payment
  const jobId = await sdk.submitJob({
    modelId: 'gpt-3.5-turbo',
    prompt: 'Explain DeFi in simple terms',
    maxTokens: 200,
    offerPrice: '1000000',      // 1 USDC (6 decimals)
    paymentToken: 'USDC',
    paymentAmount: '1000000'     // Amount to pay
  });

  console.log('Job submitted with USDC:', jobId);
  
  // Listen for completion
  sdk.on('jobSubmitted', (data) => {
    console.log('Payment token:', data.paymentToken);
    console.log('Transaction hash:', data.txHash);
  });
}
```

## Payment Examples

### 3. Automatic Payment Token Selection

```typescript
async function submitJobWithBestPayment(sdk: FabstirLLMSDK) {
  // Check user balances
  const provider = sdk.provider;
  const signer = provider.getSigner();
  const address = await signer.getAddress();
  
  const ethBalance = await provider.getBalance(address);
  const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
  const usdcBalance = await usdcContract.balanceOf(address);
  
  // Choose payment method based on balance
  const jobParams = {
    modelId: 'gpt-3.5-turbo',
    prompt: 'Generate a smart contract audit checklist',
    maxTokens: 500,
    offerPrice: '2000000'  // 2 USDC or equivalent ETH
  };

  if (usdcBalance.gte(ethers.utils.parseUnits('2', 6))) {
    // Use USDC if available
    return await sdk.submitJob({
      ...jobParams,
      paymentToken: 'USDC',
      paymentAmount: '2000000'
    });
  } else if (ethBalance.gte(ethers.utils.parseEther('0.002'))) {
    // Fall back to ETH
    return await sdk.submitJob({
      ...jobParams,
      paymentToken: 'ETH',
      offerPrice: '2000000000000000'  // 0.002 ETH
    });
  } else {
    throw new Error('Insufficient balance for payment');
  }
}
```

### 4. Handling USDC Approval

```typescript
async function submitJobWithApprovalCheck() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const sdk = new FabstirLLMSDK(provider);
  
  try {
    // SDK automatically handles approval
    const jobId = await sdk.submitJob({
      modelId: 'claude-3-opus',
      prompt: 'Analyze this code for vulnerabilities',
      maxTokens: 1000,
      offerPrice: '5000000',      // 5 USDC
      paymentToken: 'USDC',
      paymentAmount: '5000000'
    });
    
    console.log('Job submitted:', jobId);
    console.log('USDC approval handled automatically');
    
  } catch (error) {
    if (error.message.includes('Insufficient USDC')) {
      console.error('Please add USDC to your wallet');
    } else if (error.message.includes('User rejected')) {
      console.error('Approval cancelled by user');
    } else {
      console.error('Submission failed:', error);
    }
  }
}
```

## Headless SDK Examples

### 5. Node.js Script with Headless SDK

```typescript
#!/usr/bin/env node
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

async function runHeadlessSDK() {
  // Create headless SDK
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia',
    p2pConfig: {
      bootstrapNodes: process.env.BOOTSTRAP_NODES?.split(',') || []
    }
  });

  // Create signer from private key (for scripts only!)
  const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  
  // Set signer
  await sdk.setSigner(wallet);
  
  // Discover nodes without submitting job
  const nodes = await sdk.discoverNodes({
    modelId: 'gpt-3.5-turbo'
  });
  
  console.log(`Found ${nodes.length} nodes`);
  nodes.forEach(node => {
    console.log(`- Node ${node.peerId}: ${node.capabilities.pricePerToken} wei/token`);
  });
  
  // Submit job to best node
  if (nodes.length > 0) {
    const job = await sdk.submitJob({
      modelId: 'gpt-3.5-turbo',
      prompt: 'Hello from Node.js',
      maxTokens: 50,
      offerPrice: nodes[0].capabilities.pricePerToken
    });
    
    console.log('Job submitted:', job.requestId);
  }
  
  // Clean up
  await sdk.disconnect();
}

runHeadlessSDK().catch(console.error);
```

### 6. Dynamic Signer Management

```typescript
class WalletManager {
  private sdk: FabstirSDKHeadless;
  private currentSigner?: ethers.Signer;
  
  constructor() {
    this.sdk = new FabstirSDKHeadless({
      mode: 'production',
      network: 'base-sepolia'
    });
  }
  
  async connectMetaMask() {
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = provider.getSigner();
    
    await this.sdk.setSigner(signer);
    this.currentSigner = signer;
    
    console.log('Connected:', await signer.getAddress());
  }
  
  async connectWalletConnect() {
    // WalletConnect setup
    const wcProvider = new WalletConnectProvider({
      rpc: { 84532: 'https://sepolia.base.org' }
    });
    
    await wcProvider.enable();
    const provider = new ethers.providers.Web3Provider(wcProvider);
    const signer = provider.getSigner();
    
    await this.sdk.setSigner(signer);
    this.currentSigner = signer;
  }
  
  async switchAccount(newAddress: string) {
    if (!this.currentSigner) throw new Error('No wallet connected');
    
    // Request account switch
    const provider = this.currentSigner.provider as ethers.providers.Web3Provider;
    await provider.send('wallet_requestPermissions', [{ eth_accounts: {} }]);
    
    // Get new signer
    const newSigner = provider.getSigner(newAddress);
    await this.sdk.setSigner(newSigner);
    this.currentSigner = newSigner;
  }
  
  disconnect() {
    this.sdk.clearSigner();
    this.currentSigner = undefined;
  }
}
```

## React Integration

### 7. React Hook Usage

```typescript
import { useSDK } from '@fabstir/llm-sdk/adapters/react';
import { useWalletClient } from 'wagmi';
import { ethers } from 'ethers';
import { useMemo, useState } from 'react';

function JobSubmissionComponent() {
  const { data: walletClient } = useWalletClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<string>('');
  
  // Convert wagmi client to ethers signer
  const signer = useMemo(() => {
    if (!walletClient) return null;
    const provider = new ethers.providers.Web3Provider(walletClient);
    return provider.getSigner();
  }, [walletClient]);
  
  // Initialize SDK with signer
  const sdk = useSDK(
    {
      mode: 'production',
      network: 'base-sepolia'
    },
    signer
  );
  
  const handleSubmit = async () => {
    if (!sdk) {
      alert('Please connect wallet first');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const job = await sdk.submitJob({
        modelId: 'gpt-3.5-turbo',
        prompt: 'Generate a React component',
        maxTokens: 500,
        offerPrice: '1000000',
        paymentToken: 'USDC'
      });
      
      // Listen for completion
      sdk.on('job:completed', (data) => {
        if (data.jobId === job.requestId) {
          setResult(data.result);
        }
      });
      
    } catch (error) {
      console.error('Job submission failed:', error);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div>
      <button onClick={handleSubmit} disabled={!sdk || isSubmitting}>
        {isSubmitting ? 'Submitting...' : 'Submit Job with USDC'}
      </button>
      {result && <pre>{result}</pre>}
    </div>
  );
}
```

### 8. React Hook with State Management

```typescript
import { useSDKWithState } from '@fabstir/llm-sdk/adapters/react';

function AdvancedJobComponent() {
  const { 
    sdk, 
    isConnected, 
    isLoading, 
    error, 
    jobs,
    submitJob, 
    discoverNodes 
  } = useSDKWithState(
    { mode: 'production', network: 'base-sepolia' },
    signer
  );
  
  const [selectedPayment, setSelectedPayment] = useState<'ETH' | 'USDC'>('USDC');
  const [nodes, setNodes] = useState<DiscoveredNode[]>([]);
  
  const handleDiscover = async () => {
    try {
      const discovered = await discoverNodes({
        modelId: 'gpt-3.5-turbo'
      });
      setNodes(discovered);
    } catch (err) {
      console.error('Discovery failed:', err);
    }
  };
  
  const handleSubmit = async (prompt: string) => {
    try {
      const job = await submitJob({
        modelId: 'gpt-3.5-turbo',
        prompt,
        maxTokens: 200,
        offerPrice: selectedPayment === 'USDC' ? '1000000' : '1000000000000000',
        paymentToken: selectedPayment
      });
      
      console.log('Job submitted:', job);
    } catch (err) {
      console.error('Submission failed:', err);
    }
  };
  
  return (
    <div>
      <h3>SDK Status</h3>
      <p>Connected: {isConnected ? 'Yes' : 'No'}</p>
      <p>Loading: {isLoading ? 'Yes' : 'No'}</p>
      {error && <p>Error: {error.message}</p>}
      
      <h3>Payment Method</h3>
      <select value={selectedPayment} onChange={(e) => setSelectedPayment(e.target.value as 'ETH' | 'USDC')}>
        <option value="ETH">ETH</option>
        <option value="USDC">USDC</option>
      </select>
      
      <h3>Available Nodes</h3>
      <button onClick={handleDiscover}>Discover Nodes</button>
      <ul>
        {nodes.map(node => (
          <li key={node.peerId}>
            {node.peerId} - {node.capabilities.pricePerToken} wei/token
          </li>
        ))}
      </ul>
      
      <h3>Active Jobs</h3>
      <ul>
        {Array.from(jobs.entries()).map(([id, job]) => (
          <li key={id}>
            Job {id}: {job.status} - {job.response?.status}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## Node.js Examples

### 9. CLI Tool Example

```typescript
#!/usr/bin/env node
import { program } from 'commander';
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import inquirer from 'inquirer';

program
  .name('fabstir-cli')
  .description('CLI for Fabstir LLM SDK')
  .version('1.0.0');

program
  .command('submit')
  .description('Submit a job to the network')
  .option('-m, --model <model>', 'Model ID', 'gpt-3.5-turbo')
  .option('-p, --prompt <prompt>', 'Prompt text')
  .option('-t, --tokens <tokens>', 'Max tokens', '100')
  .option('--payment <token>', 'Payment token (ETH/USDC)', 'ETH')
  .action(async (options) => {
    // Get prompt interactively if not provided
    if (!options.prompt) {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'prompt',
          message: 'Enter your prompt:',
        }
      ]);
      options.prompt = answers.prompt;
    }
    
    // Initialize SDK
    const sdk = new FabstirSDKHeadless({
      mode: 'production',
      network: 'base-sepolia'
    });
    
    // Get signer from environment
    const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
    await sdk.setSigner(wallet);
    
    // Submit job
    console.log('Submitting job...');
    const job = await sdk.submitJob({
      modelId: options.model,
      prompt: options.prompt,
      maxTokens: parseInt(options.tokens),
      offerPrice: options.payment === 'USDC' ? '1000000' : '1000000000000000',
      paymentToken: options.payment
    });
    
    console.log(`Job submitted: ${job.requestId}`);
    console.log(`Payment method: ${options.payment}`);
    
    await sdk.disconnect();
  });

program.parse();
```

### 10. Batch Job Processing

```typescript
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';
import pLimit from 'p-limit';

async function processBatchJobs(prompts: string[]) {
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia'
  });
  
  // Set signer
  const signer = await getSigner();
  await sdk.setSigner(signer);
  
  // Limit concurrent submissions
  const limit = pLimit(3);
  
  const jobs = await Promise.all(
    prompts.map((prompt, index) => 
      limit(async () => {
        try {
          const job = await sdk.submitJob({
            modelId: 'gpt-3.5-turbo',
            prompt,
            maxTokens: 100,
            offerPrice: '1000000',
            paymentToken: 'USDC'
          });
          
          console.log(`Job ${index + 1} submitted: ${job.requestId}`);
          return { success: true, jobId: job.requestId, prompt };
          
        } catch (error) {
          console.error(`Job ${index + 1} failed:`, error.message);
          return { success: false, error: error.message, prompt };
        }
      })
    )
  );
  
  // Summary
  const successful = jobs.filter(j => j.success).length;
  console.log(`\nBatch complete: ${successful}/${prompts.length} jobs submitted`);
  
  await sdk.disconnect();
  return jobs;
}

// Usage
const prompts = [
  'Generate a README',
  'Write unit tests',
  'Create API documentation',
  'Design a schema',
  'Optimize this query'
];

processBatchJobs(prompts).then(console.log);
```

## Advanced Examples

### 11. Streaming Response Handler

```typescript
async function handleStreamingJob() {
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia'
  });
  
  await sdk.setSigner(signer);
  
  // Submit job with streaming
  const job = await sdk.submitJob({
    modelId: 'gpt-3.5-turbo',
    prompt: 'Write a long story',
    maxTokens: 2000,
    offerPrice: '5000000',
    paymentToken: 'USDC',
    streaming: true  // Enable streaming
  });
  
  // Set up stream handler
  const stream = sdk.getJobStream(job.requestId);
  
  stream.on('token', (token: string) => {
    process.stdout.write(token);  // Print tokens as they arrive
  });
  
  stream.on('error', (error) => {
    console.error('\nStream error:', error);
  });
  
  stream.on('end', () => {
    console.log('\n\nStream complete');
    sdk.disconnect();
  });
}
```

### 12. Job Recovery and Retry

```typescript
class ResilientJobSubmitter {
  private sdk: FabstirSDKHeadless;
  private jobHistory: Map<string, any> = new Map();
  
  constructor() {
    this.sdk = new FabstirSDKHeadless({
      mode: 'production',
      network: 'base-sepolia',
      retryOptions: {
        maxRetries: 3,
        retryDelay: 2000,
        backoffMultiplier: 2
      },
      enableJobRecovery: true
    });
  }
  
  async submitWithRecovery(params: JobSubmissionParams) {
    const maxAttempts = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxAttempts}`);
        
        // Try submission
        const job = await this.sdk.submitJob(params);
        
        // Store for recovery
        this.jobHistory.set(job.requestId, {
          params,
          attempt,
          timestamp: Date.now(),
          status: 'submitted'
        });
        
        // Monitor job
        const result = await this.waitForCompletion(job.requestId);
        
        // Update history
        this.jobHistory.get(job.requestId)!.status = 'completed';
        this.jobHistory.get(job.requestId)!.result = result;
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        // Check if recoverable
        if (this.isRecoverableError(error)) {
          // Wait before retry
          await this.delay(Math.pow(2, attempt) * 1000);
          
          // Try different payment method on payment errors
          if (error.message.includes('Insufficient')) {
            params.paymentToken = params.paymentToken === 'USDC' ? 'ETH' : 'USDC';
            console.log(`Switching to ${params.paymentToken} payment`);
          }
        } else {
          throw error;  // Non-recoverable error
        }
      }
    }
    
    throw lastError || new Error('All attempts failed');
  }
  
  private isRecoverableError(error: any): boolean {
    const recoverableErrors = [
      'NETWORK_ERROR',
      'TIMEOUT',
      'INSUFFICIENT_BALANCE',
      'NODE_UNAVAILABLE'
    ];
    
    return recoverableErrors.some(code => 
      error.code === code || error.message.includes(code)
    );
  }
  
  private async waitForCompletion(jobId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Job timeout'));
      }, 300000);  // 5 minute timeout
      
      this.sdk.on('job:completed', (data) => {
        if (data.jobId === jobId) {
          clearTimeout(timeout);
          resolve(data.result);
        }
      });
      
      this.sdk.on('job:failed', (data) => {
        if (data.jobId === jobId) {
          clearTimeout(timeout);
          reject(new Error(data.error));
        }
      });
    });
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Error Handling

### 13. Comprehensive Error Handling

```typescript
async function robustJobSubmission() {
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia'
  });
  
  try {
    // Check network first
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const network = await provider.getNetwork();
    
    if (network.chainId !== 84532) {
      throw new Error(`Wrong network. Please switch to Base Sepolia`);
    }
    
    // Get signer
    const signer = provider.getSigner();
    await sdk.setSigner(signer);
    
    // Check balances
    const address = await signer.getAddress();
    const ethBalance = await provider.getBalance(address);
    const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, provider);
    const usdcBalance = await usdcContract.balanceOf(address);
    
    console.log('ETH Balance:', ethers.utils.formatEther(ethBalance));
    console.log('USDC Balance:', ethers.utils.formatUnits(usdcBalance, 6));
    
    // Choose payment method
    const useUSDC = usdcBalance.gte(ethers.utils.parseUnits('1', 6));
    
    // Submit job
    const job = await sdk.submitJob({
      modelId: 'gpt-3.5-turbo',
      prompt: 'Hello world',
      maxTokens: 50,
      offerPrice: useUSDC ? '1000000' : '1000000000000000',
      paymentToken: useUSDC ? 'USDC' : 'ETH'
    });
    
    console.log('Job submitted successfully:', job.requestId);
    
  } catch (error) {
    // Handle specific errors
    if (error.code === 'INSUFFICIENT_FUNDS') {
      console.error('Insufficient funds. Please add ETH or USDC to your wallet.');
    } else if (error.code === 'USER_REJECTED_REQUEST') {
      console.error('Transaction rejected by user.');
    } else if (error.code === 'NETWORK_ERROR') {
      console.error('Network error. Please check your connection.');
    } else if (error.message.includes('Wrong network')) {
      console.error(error.message);
      // Prompt to switch network
      try {
        await provider.send('wallet_switchEthereumChain', [
          { chainId: '0x14A34' }  // Base Sepolia
        ]);
      } catch (switchError) {
        console.error('Failed to switch network:', switchError);
      }
    } else {
      console.error('Unexpected error:', error);
    }
  } finally {
    await sdk.disconnect();
  }
}
```

## Migration Examples

### 14. Migrating from Legacy SDK

```typescript
// OLD CODE - Using FabstirSDK with FAB tokens
import { FabstirSDK } from '@fabstir/llm-sdk-old';

async function oldSubmitJob() {
  const sdk = new FabstirSDK({
    mode: 'production',
    network: 'base-sepolia'
  });
  
  await sdk.connect(provider);
  
  const job = await sdk.submitJob({
    modelId: 'gpt-3.5-turbo',
    prompt: 'Hello',
    maxTokens: 100,
    price: '1000000000000000'  // FAB tokens
  });
}

// NEW CODE - Using FabstirSDKHeadless with USDC/ETH
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';

async function newSubmitJob() {
  const sdk = new FabstirSDKHeadless({
    mode: 'production',
    network: 'base-sepolia'
  });
  
  await sdk.setSigner(signer);  // Set signer instead of connect
  
  const job = await sdk.submitJob({
    modelId: 'gpt-3.5-turbo',
    prompt: 'Hello',
    maxTokens: 100,
    offerPrice: '1000000',      // USDC amount
    paymentToken: 'USDC'         // Explicit token selection
  });
}
```

### 15. Migrating React Components

```typescript
// OLD CODE - Using provider directly
function OldComponent() {
  const [sdk, setSDK] = useState(null);
  
  useEffect(() => {
    const initSDK = async () => {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const sdkInstance = new FabstirSDK({ mode: 'production' });
      await sdkInstance.connect(provider);
      setSDK(sdkInstance);
    };
    initSDK();
  }, []);
  
  // ...
}

// NEW CODE - Using React adapter
import { useSDK } from '@fabstir/llm-sdk/adapters/react';

function NewComponent() {
  const { data: walletClient } = useWalletClient();
  
  const signer = useMemo(() => {
    if (!walletClient) return null;
    const provider = new ethers.providers.Web3Provider(walletClient);
    return provider.getSigner();
  }, [walletClient]);
  
  const sdk = useSDK(
    { mode: 'production', network: 'base-sepolia' },
    signer
  );
  
  // SDK is ready to use, handles updates automatically
}
```

## Testing Examples

### 16. Unit Testing with Mock Mode

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FabstirSDKHeadless } from '@fabstir/llm-sdk';

describe('Job Submission', () => {
  let sdk: FabstirSDKHeadless;
  
  beforeEach(() => {
    sdk = new FabstirSDKHeadless({
      mode: 'mock',  // Use mock mode for testing
      network: 'base-sepolia'
    });
  });
  
  it('should submit job with USDC payment', async () => {
    // Create mock signer
    const mockSigner = {
      provider: {
        getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
      },
      getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'
    };
    
    await sdk.setSigner(mockSigner as any);
    
    const job = await sdk.submitJob({
      modelId: 'test-model',
      prompt: 'test prompt',
      maxTokens: 100,
      offerPrice: '1000000',
      paymentToken: 'USDC'
    });
    
    expect(job).toBeDefined();
    expect(job.requestId).toBeDefined();
    expect(job.status).toBe('accepted');
  });
  
  it('should handle missing signer', async () => {
    await expect(sdk.submitJob({
      modelId: 'test',
      prompt: 'test',
      maxTokens: 10
    })).rejects.toThrow('No signer available');
  });
});
```

## Conclusion

These examples demonstrate the flexibility and power of the Fabstir LLM SDK with its new headless architecture and USDC/ETH payment support. The SDK can be used in various environments (browser, Node.js, React) and handles complex scenarios like payment token selection, error recovery, and dynamic signer management.

For more information, see:
- [API Reference](./API.md)
- [Configuration Guide](./CONFIGURATION.md)
- [Architecture Overview](./ARCHITECTURE.md)