// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Error Handling Example
 * 
 * This example demonstrates comprehensive error handling strategies
 * for the Fabstir LLM SDK, including retry logic, fallbacks, and recovery.
 */

import { FabstirSDK, FabstirError, ErrorCode } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';

async function main() {
  console.log('🛡️ Fabstir SDK Error Handling Example\n');

  const sdk = new FabstirSDK({
    mode: 'production',
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg'
      ],
    },
    // Global retry configuration
    retryOptions: {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 2,
    },
  });

  // Example 1: Connection error handling
  console.log('1️⃣ Connection Error Handling\n');
  await handleConnectionErrors(sdk);

  // Example 2: Job submission errors
  console.log('\n2️⃣ Job Submission Error Handling\n');
  await handleJobSubmissionErrors(sdk);

  // Example 3: Node-specific errors
  console.log('\n3️⃣ Node-Specific Error Handling\n');
  await handleNodeErrors(sdk);

  // Example 4: Payment errors
  console.log('\n4️⃣ Payment Error Handling\n');
  await handlePaymentErrors(sdk);

  // Example 5: Stream errors
  console.log('\n5️⃣ Stream Error Handling\n');
  await handleStreamErrors(sdk);

  // Example 6: Custom retry logic
  console.log('\n6️⃣ Custom Retry Logic\n');
  await customRetryLogic(sdk);

  // Example 7: Circuit breaker pattern
  console.log('\n7️⃣ Circuit Breaker Pattern\n');
  await circuitBreakerExample(sdk);

  // Example 8: Comprehensive error recovery
  console.log('\n8️⃣ Comprehensive Error Recovery\n');
  await comprehensiveErrorRecovery(sdk);

  console.log('\n✅ Error handling examples completed!');
}

// Example 1: Connection error handling
async function handleConnectionErrors(sdk: FabstirSDK) {
  const maxConnectionAttempts = 3;
  let connected = false;

  for (let attempt = 1; attempt <= maxConnectionAttempts; attempt++) {
    try {
      console.log(`Connection attempt ${attempt}/${maxConnectionAttempts}...`);
      
      // Try different RPC endpoints
      const rpcEndpoints = [
        'https://base-sepolia.public.blastapi.io',
        'https://sepolia.base.org',
        'https://base-sepolia-rpc.publicnode.com'
      ];
      
      const provider = new ethers.providers.JsonRpcProvider(
        rpcEndpoints[attempt - 1]
      );
      
      // Set a connection timeout
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout')), 10000)
      );
      
      await Promise.race([
        sdk.connect(provider),
        timeoutPromise
      ]);
      
      connected = true;
      console.log('✅ Connected successfully');
      break;
      
    } catch (error) {
      console.error(`❌ Connection attempt ${attempt} failed:`, error.message);
      
      if (error instanceof FabstirError) {
        switch (error.code) {
          case ErrorCode.CONNECTION_FAILED:
            console.log('→ Trying alternative RPC endpoint...');
            break;
          case ErrorCode.NETWORK_MISMATCH:
            console.log('→ Network mismatch, check configuration');
            break;
          case ErrorCode.P2P_CONNECTION_FAILED:
            console.log('→ P2P connection failed, checking bootstrap nodes');
            break;
        }
      }
      
      if (attempt < maxConnectionAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`→ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  if (!connected) {
    throw new Error('Failed to connect after all attempts');
  }
}

// Example 2: Job submission errors
async function handleJobSubmissionErrors(sdk: FabstirSDK) {
  const jobSubmissionStrategies = [
    // Strategy 1: Try preferred nodes
    async () => {
      return await sdk.submitJobWithNegotiation({
        prompt: 'Test job submission',
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 50,
        preferredNodes: ['12D3KooWNode1', '12D3KooWNode2'],
      });
    },
    
    // Strategy 2: Increase budget
    async () => {
      return await sdk.submitJobWithNegotiation({
        prompt: 'Test job submission',
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 50,
        maxBudget: ethers.utils.parseEther('0.002'), // Double budget
      });
    },
    
    // Strategy 3: Try alternative model
    async () => {
      return await sdk.submitJobWithNegotiation({
        prompt: 'Test job submission',
        modelId: 'gpt-3.5-turbo', // Alternative model
        maxTokens: 50,
      });
    },
    
    // Strategy 4: Allow P2P-only fallback
    async () => {
      return await sdk.submitJobWithNegotiation({
        prompt: 'Test job submission',
        modelId: 'llama-3.2-1b-instruct',
        maxTokens: 50,
        submitToChain: false, // Skip blockchain
        allowP2PFallback: true,
      });
    },
  ];

  for (let i = 0; i < jobSubmissionStrategies.length; i++) {
    try {
      console.log(`Trying strategy ${i + 1}: ${['preferred nodes', 'increased budget', 'alternative model', 'P2P fallback'][i]}`);
      const result = await jobSubmissionStrategies[i]();
      console.log('✅ Job submitted successfully');
      console.log(`Job ID: ${result.jobId}, Node: ${result.selectedNode}`);
      return result;
    } catch (error) {
      console.error(`❌ Strategy ${i + 1} failed:`, error.message);
      
      if (error.code === ErrorCode.NO_NODES_AVAILABLE) {
        console.log('→ No nodes available, trying next strategy...');
      } else if (error.code === ErrorCode.INSUFFICIENT_BALANCE) {
        console.log('→ Insufficient balance, please top up wallet');
        break;
      }
    }
  }
  
  console.log('⚠️ All strategies exhausted');
}

// Example 3: Node-specific errors
async function handleNodeErrors(sdk: FabstirSDK) {
  // Track node failures
  const nodeFailures = new Map<string, number>();
  const maxFailuresPerNode = 3;

  async function submitWithNodeTracking(params: any) {
    const maxAttempts = 5;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Get available nodes
        const nodes = await sdk.discoverNodes({
          modelId: params.modelId,
          excludeNodes: Array.from(nodeFailures.keys())
            .filter(nodeId => nodeFailures.get(nodeId)! >= maxFailuresPerNode),
        });
        
        if (nodes.length === 0) {
          throw new Error('No reliable nodes available');
        }
        
        console.log(`Attempt ${attempt}: Found ${nodes.length} available nodes`);
        
        // Submit job
        const result = await sdk.submitJobWithNegotiation({
          ...params,
          preferredNodes: nodes.slice(0, 3).map(n => n.peerId),
        });
        
        console.log('✅ Job submitted to:', result.selectedNode);
        
        // Reset failure count on success
        nodeFailures.set(result.selectedNode, 0);
        
        return result;
        
      } catch (error) {
        if (error.code === ErrorCode.NODE_NOT_RESPONDING || 
            error.code === ErrorCode.NODE_REJECTED_JOB) {
          const failedNode = error.details?.nodeId;
          if (failedNode) {
            const failures = (nodeFailures.get(failedNode) || 0) + 1;
            nodeFailures.set(failedNode, failures);
            console.log(`❌ Node ${failedNode} failed (${failures} failures)`);
            
            if (failures >= maxFailuresPerNode) {
              console.log(`→ Blacklisting node ${failedNode}`);
            }
          }
        }
        
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }
    
    throw new Error('Failed after all attempts');
  }

  try {
    await submitWithNodeTracking({
      prompt: 'Test node error handling',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 50,
    });
  } catch (error) {
    console.error('Final error:', error.message);
  }
}

// Example 4: Payment errors
async function handlePaymentErrors(sdk: FabstirSDK) {
  try {
    // Check balance before submission
    const balance = await sdk.getBalance();
    const estimatedCost = ethers.utils.parseEther('0.001');
    
    if (balance.lt(estimatedCost)) {
      console.error('❌ Insufficient balance');
      console.log(`Current balance: ${ethers.utils.formatEther(balance)} ETH`);
      console.log(`Estimated cost: ${ethers.utils.formatEther(estimatedCost)} ETH`);
      
      // Wait for user to top up
      console.log('→ Please top up your wallet and retry');
      return;
    }
    
    // Submit with payment error handling
    const result = await sdk.submitJobWithNegotiation({
      prompt: 'Test payment handling',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 50,
      maxBudget: estimatedCost,
    });
    
    console.log('✅ Job submitted with payment');
    
    // Monitor payment events
    sdk.on('payment:escrowed', (data) => {
      console.log('💰 Payment escrowed:', ethers.utils.formatEther(data.amount), 'ETH');
    });
    
    sdk.on('payment:released', (data) => {
      console.log('💸 Payment released to node');
    });
    
    sdk.on('payment:disputed', (data) => {
      console.error('⚠️ Payment disputed:', data.reason);
      // Handle dispute resolution
    });
    
  } catch (error) {
    if (error.code === ErrorCode.INSUFFICIENT_BALANCE) {
      console.error('❌ Insufficient balance for payment');
    } else if (error.code === ErrorCode.PAYMENT_FAILED) {
      console.error('❌ Payment transaction failed');
      console.log('→ Check gas settings and retry');
    } else if (error.code === ErrorCode.ESCROW_FAILED) {
      console.error('❌ Escrow creation failed');
      console.log('→ Contract may be paused or upgraded');
    }
  }
}

// Example 5: Stream errors
async function handleStreamErrors(sdk: FabstirSDK) {
  const result = await sdk.submitJobWithNegotiation({
    prompt: 'Generate a long response for streaming',
    modelId: 'llama-3.2-1b-instruct',
    maxTokens: 200,
    stream: true,
  });

  if (result.stream) {
    let reconnectAttempts = 0;
    const maxReconnects = 3;
    let lastCheckpoint = 0;

    async function setupStreamHandlers(stream: any) {
      stream.on('token', (token) => {
        process.stdout.write(token.content);
        lastCheckpoint = token.index;
      });

      stream.on('error', async (error) => {
        console.error(`\n❌ Stream error: ${error.message}`);
        
        if (error.code === ErrorCode.STREAM_CONNECTION_LOST && 
            error.recoverable && 
            reconnectAttempts < maxReconnects) {
          
          reconnectAttempts++;
          console.log(`→ Attempting to reconnect (${reconnectAttempts}/${maxReconnects})...`);
          
          try {
            // Wait before reconnecting
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Resume from last checkpoint
            const resumedStream = await sdk.resumeResponseStream({
              jobId: result.jobId.toString(),
              requestId: `req-${result.jobId}`,
              resumeFrom: lastCheckpoint + 1,
            });
            
            console.log(`✅ Reconnected, resuming from token ${lastCheckpoint + 1}`);
            setupStreamHandlers(resumedStream);
            
          } catch (reconnectError) {
            console.error('❌ Reconnection failed:', reconnectError.message);
          }
        } else if (error.code === ErrorCode.STREAM_RATE_LIMITED) {
          console.log('→ Rate limited, waiting before retry...');
          // Implement exponential backoff
        }
      });

      return new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', (error) => {
          if (!error.recoverable || reconnectAttempts >= maxReconnects) {
            reject(error);
          }
        });
      });
    }

    try {
      await setupStreamHandlers(result.stream);
      console.log('\n✅ Stream completed successfully');
    } catch (error) {
      console.error('\n❌ Stream failed:', error.message);
    }
  }
}

// Example 6: Custom retry logic
async function customRetryLogic(sdk: FabstirSDK) {
  // Implement sophisticated retry with jitter and backoff
  async function retryWithJitter<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts: number;
      baseDelay: number;
      maxDelay: number;
      shouldRetry?: (error: any, attempt: number) => boolean;
    }
  ): Promise<T> {
    const { maxAttempts, baseDelay, maxDelay, shouldRetry } = options;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxAttempts}`);
        return await operation();
      } catch (error) {
        console.error(`Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxAttempts) {
          throw error;
        }
        
        if (shouldRetry && !shouldRetry(error, attempt)) {
          throw error;
        }
        
        // Calculate delay with exponential backoff and jitter
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
        const jitter = Math.random() * exponentialDelay * 0.3; // 30% jitter
        const totalDelay = exponentialDelay + jitter;
        
        console.log(`→ Waiting ${Math.round(totalDelay)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, totalDelay));
      }
    }
    
    throw new Error('All retry attempts exhausted');
  }

  // Use the retry logic
  try {
    const result = await retryWithJitter(
      async () => {
        return await sdk.submitJobWithNegotiation({
          prompt: 'Test custom retry logic',
          modelId: 'llama-3.2-1b-instruct',
          maxTokens: 50,
        });
      },
      {
        maxAttempts: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        shouldRetry: (error, attempt) => {
          // Retry on specific errors
          const retryableCodes = [
            ErrorCode.P2P_TIMEOUT,
            ErrorCode.NODE_NOT_RESPONDING,
            ErrorCode.STREAM_CONNECTION_LOST,
          ];
          
          return retryableCodes.includes(error.code) && attempt < 5;
        },
      }
    );
    
    console.log('✅ Operation succeeded after retries');
    console.log('Job ID:', result.jobId);
  } catch (error) {
    console.error('❌ Operation failed after all retries:', error.message);
  }
}

// Example 7: Circuit breaker pattern
async function circuitBreakerExample(sdk: FabstirSDK) {
  class CircuitBreaker {
    private failures = 0;
    private lastFailureTime = 0;
    private state: 'closed' | 'open' | 'half-open' = 'closed';
    
    constructor(
      private threshold: number,
      private timeout: number,
      private resetTimeout: number
    ) {}
    
    async execute<T>(operation: () => Promise<T>): Promise<T> {
      if (this.state === 'open') {
        const now = Date.now();
        if (now - this.lastFailureTime > this.timeout) {
          console.log('🔄 Circuit breaker: Trying half-open state');
          this.state = 'half-open';
        } else {
          throw new Error('Circuit breaker is OPEN');
        }
      }
      
      try {
        const result = await operation();
        this.onSuccess();
        return result;
      } catch (error) {
        this.onFailure();
        throw error;
      }
    }
    
    private onSuccess() {
      if (this.state === 'half-open') {
        console.log('✅ Circuit breaker: Closing circuit');
        this.reset();
      }
    }
    
    private onFailure() {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        console.log('⚡ Circuit breaker: Opening circuit');
        this.state = 'open';
        
        // Auto-reset after timeout
        setTimeout(() => {
          console.log('🔄 Circuit breaker: Auto-reset to half-open');
          this.state = 'half-open';
        }, this.resetTimeout);
      }
    }
    
    private reset() {
      this.failures = 0;
      this.state = 'closed';
      this.lastFailureTime = 0;
    }
  }

  const breaker = new CircuitBreaker(
    3,     // Open after 3 failures
    5000,  // Wait 5 seconds before half-open
    30000  // Auto-reset after 30 seconds
  );

  // Test circuit breaker
  for (let i = 0; i < 6; i++) {
    try {
      await breaker.execute(async () => {
        // Simulate failures for testing
        if (i < 3) {
          throw new Error('Simulated failure');
        }
        
        return await sdk.submitJobWithNegotiation({
          prompt: `Circuit breaker test ${i}`,
          modelId: 'llama-3.2-1b-instruct',
          maxTokens: 20,
        });
      });
      
      console.log(`✅ Request ${i + 1} succeeded`);
    } catch (error) {
      console.error(`❌ Request ${i + 1} failed:`, error.message);
    }
    
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

// Example 8: Comprehensive error recovery
async function comprehensiveErrorRecovery(sdk: FabstirSDK) {
  class ErrorRecoveryManager {
    private errorCounts = new Map<string, number>();
    private blacklist = new Set<string>();
    private lastErrors: Array<{ error: any; timestamp: number }> = [];
    
    async executeWithRecovery(operation: () => Promise<any>, context: string) {
      const strategies = [
        { name: 'immediate-retry', delay: 0 },
        { name: 'delayed-retry', delay: 2000 },
        { name: 'alternative-node', delay: 1000 },
        { name: 'reduced-requirements', delay: 3000 },
        { name: 'emergency-fallback', delay: 5000 },
      ];
      
      for (const strategy of strategies) {
        try {
          console.log(`🔧 Trying strategy: ${strategy.name}`);
          
          if (strategy.delay > 0) {
            await new Promise(resolve => setTimeout(resolve, strategy.delay));
          }
          
          let modifiedOperation = operation;
          
          // Modify operation based on strategy
          if (strategy.name === 'alternative-node') {
            modifiedOperation = () => operation().catch(async (error) => {
              if (error.code === ErrorCode.NODE_NOT_RESPONDING) {
                // Try different nodes
                const nodes = await sdk.discoverNodes({
                  modelId: 'llama-3.2-1b-instruct',
                  excludeNodes: Array.from(this.blacklist),
                });
                
                if (nodes.length > 0) {
                  return sdk.submitJobWithNegotiation({
                    prompt: 'Fallback job',
                    modelId: 'llama-3.2-1b-instruct',
                    maxTokens: 50,
                    preferredNodes: [nodes[0].peerId],
                  });
                }
              }
              throw error;
            });
          }
          
          const result = await modifiedOperation();
          console.log(`✅ Success with strategy: ${strategy.name}`);
          this.recordSuccess(context);
          return result;
          
        } catch (error) {
          console.error(`❌ Strategy ${strategy.name} failed:`, error.message);
          this.recordError(context, error);
          
          // Check if we should continue
          if (!this.shouldContinue(context)) {
            throw new Error('Too many failures, aborting recovery');
          }
        }
      }
      
      throw new Error('All recovery strategies exhausted');
    }
    
    private recordError(context: string, error: any) {
      const count = (this.errorCounts.get(context) || 0) + 1;
      this.errorCounts.set(context, count);
      
      this.lastErrors.push({ error, timestamp: Date.now() });
      if (this.lastErrors.length > 10) {
        this.lastErrors.shift();
      }
      
      // Blacklist problematic nodes
      if (error.details?.nodeId && count > 3) {
        this.blacklist.add(error.details.nodeId);
        console.log(`⛔ Blacklisted node: ${error.details.nodeId}`);
      }
    }
    
    private recordSuccess(context: string) {
      this.errorCounts.delete(context);
    }
    
    private shouldContinue(context: string): boolean {
      const errorCount = this.errorCounts.get(context) || 0;
      const recentErrors = this.lastErrors.filter(
        e => Date.now() - e.timestamp < 60000 // Last minute
      ).length;
      
      return errorCount < 10 && recentErrors < 20;
    }
    
    getReport() {
      return {
        errorCounts: Object.fromEntries(this.errorCounts),
        blacklistedNodes: Array.from(this.blacklist),
        recentErrors: this.lastErrors.map(e => ({
          message: e.error.message,
          code: e.error.code,
          time: new Date(e.timestamp).toLocaleTimeString(),
        })),
      };
    }
  }

  const recoveryManager = new ErrorRecoveryManager();
  
  try {
    const result = await recoveryManager.executeWithRecovery(
      async () => {
        return await sdk.submitJobWithNegotiation({
          prompt: 'Test comprehensive recovery',
          modelId: 'llama-3.2-1b-instruct',
          maxTokens: 100,
        });
      },
      'job-submission'
    );
    
    console.log('✅ Job completed successfully');
    console.log('Result:', result);
  } catch (error) {
    console.error('❌ Recovery failed:', error.message);
  }
  
  // Print recovery report
  console.log('\n📊 Error Recovery Report:');
  console.log(JSON.stringify(recoveryManager.getReport(), null, 2));
}

// Run the example
main().catch(console.error);