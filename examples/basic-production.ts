/**
 * Basic Production Mode Example
 * 
 * This example demonstrates how to use the Fabstir LLM SDK in production mode
 * with real P2P network connections and blockchain integration.
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  console.log('🚀 Fabstir SDK Production Mode Example\n');

  // 1. Initialize SDK in production mode
  console.log('1️⃣ Initializing SDK in production mode...');
  const sdk = new FabstirSDK({
    mode: 'production',
    network: 'base-sepolia',
    
    // P2P configuration with bootstrap nodes
    p2pConfig: {
      bootstrapNodes: [
        '/ip4/34.70.224.193/tcp/4001/p2p/12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg',
        '/ip4/35.185.215.242/tcp/4001/p2p/12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V'
      ],
      enableDHT: true,
      enableMDNS: true,
    },
    
    // Contract addresses (Base Sepolia)
    contracts: {
      jobMarketplace: process.env.JOB_MARKETPLACE || '0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1',
      paymentEscrow: process.env.PAYMENT_ESCROW || '0x12892b2fD2e484B88C19568E7D63bB3b9fE4dB02',
      nodeRegistry: process.env.NODE_REGISTRY || '0x8Ba7968C30496aB344bc9e7595f5b9A185E3eD89',
    },
    
    debug: true, // Enable debug logging
  });

  // 2. Connect wallet
  console.log('2️⃣ Connecting wallet...');
  
  // For browser environment with MetaMask
  // const provider = new ethers.providers.Web3Provider(window.ethereum);
  // await provider.send("eth_requestAccounts", []);
  
  // For Node.js with RPC provider
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL || 'https://base-sepolia.public.blastapi.io'
  );
  
  await sdk.connect(provider);
  console.log('✅ Connected to blockchain and P2P network');
  
  const address = await sdk.getAddress();
  console.log('Wallet address:', address);
  
  const network = await sdk.getNetwork();
  console.log('Network:', network.name, `(Chain ID: ${network.chainId})\n`);

  // 3. Check system health
  console.log('3️⃣ Checking system health...');
  const health = await sdk.getSystemHealthReport();
  console.log('System status:', health.status);
  console.log('P2P status:', health.p2p.status);
  console.log('Connected peers:', health.p2p.connectedPeers);
  console.log('Blockchain status:', health.blockchain.status);
  
  if (health.status !== 'healthy') {
    console.warn('⚠️ System not healthy:', health.issues);
    console.log('Recommendations:', health.recommendations);
  }

  // 4. Discover available nodes
  console.log('\n4️⃣ Discovering nodes...');
  const nodes = await sdk.discoverNodes({
    modelId: 'llama-3.2-1b-instruct',
    maxLatency: 1000, // Max 1 second latency
    minReputation: 70, // Minimum reputation score
  });
  
  console.log(`Found ${nodes.length} suitable nodes:`);
  nodes.slice(0, 3).forEach(node => {
    console.log(`\n  Node: ${node.peerId}`);
    console.log(`  Models: ${node.capabilities.models.join(', ')}`);
    console.log(`  Price: ${ethers.utils.formatUnits(node.capabilities.pricePerToken, 18)} ETH/token`);
    console.log(`  Latency: ${node.latency}ms`);
    console.log(`  Reputation: ${node.reputation}/100`);
  });

  // 5. Check wallet balance
  console.log('\n5️⃣ Checking wallet balance...');
  const balance = await sdk.getBalance();
  console.log('Balance:', ethers.utils.formatEther(balance), 'ETH');
  
  if (balance.lt(ethers.utils.parseEther('0.01'))) {
    console.error('❌ Insufficient balance. Please fund your wallet with at least 0.01 ETH');
    return;
  }

  // 6. Submit a job with negotiation
  console.log('\n6️⃣ Submitting job with negotiation...');
  try {
    const result = await sdk.submitJobWithNegotiation({
      prompt: 'Explain the concept of blockchain in simple terms.',
      modelId: 'llama-3.2-1b-instruct',
      maxTokens: 150,
      temperature: 0.7,
      maxBudget: ethers.utils.parseEther('0.001'), // Max 0.001 ETH
      stream: true, // Enable streaming
    });
    
    console.log('\n✅ Job submitted successfully!');
    console.log('Job ID:', result.jobId);
    console.log('Selected node:', result.selectedNode);
    console.log('Negotiated price:', ethers.utils.formatEther(result.negotiatedPrice), 'ETH');
    
    if (result.txHash) {
      console.log('Transaction hash:', result.txHash);
    }
    
    // 7. Handle streaming response
    if (result.stream) {
      console.log('\n7️⃣ Streaming response...\n');
      
      let tokenCount = 0;
      const startTime = Date.now();
      
      result.stream.on('token', (token) => {
        process.stdout.write(token.content);
        tokenCount++;
      });
      
      result.stream.on('end', (summary) => {
        const duration = Date.now() - startTime;
        console.log('\n\n✅ Stream completed!');
        console.log(`Total tokens: ${summary.totalTokens}`);
        console.log(`Duration: ${duration}ms`);
        console.log(`Tokens per second: ${(tokenCount / (duration / 1000)).toFixed(2)}`);
      });
      
      result.stream.on('error', (error) => {
        console.error('\n❌ Stream error:', error);
      });
      
      result.stream.on('metrics', (metrics) => {
        console.log('\nStream metrics:', {
          tokensPerSecond: metrics.tokensPerSecond,
          averageLatency: `${metrics.averageLatency}ms`
        });
      });
      
      // Wait for stream to complete
      await new Promise(resolve => {
        result.stream.on('end', resolve);
        result.stream.on('error', resolve);
      });
    }
    
  } catch (error) {
    console.error('❌ Job submission failed:', error.message);
    
    // Handle specific error codes
    if (error.code === 'NO_NODES_AVAILABLE') {
      console.log('No nodes available for the requested model');
    } else if (error.code === 'INSUFFICIENT_BALANCE') {
      console.log('Insufficient balance for job payment');
    }
  }

  // 8. Monitor job events
  console.log('\n8️⃣ Monitoring events...');
  
  sdk.on('node:discovered', (nodes) => {
    console.log(`📡 Discovered ${nodes.length} new nodes`);
  });
  
  sdk.on('job:completed', (data) => {
    console.log('✅ Job completed:', data);
  });
  
  sdk.on('payment:released', (data) => {
    console.log('💰 Payment released:', {
      jobId: data.jobId,
      amount: ethers.utils.formatEther(data.amount),
      recipient: data.recipient
    });
  });

  // 9. Get performance metrics
  console.log('\n9️⃣ Performance metrics...');
  const metrics = await sdk.getPerformanceMetrics();
  console.log('Total operations:', metrics.totalOperations);
  console.log('Average connection time:', `${metrics.operations.connect.averageTime}ms`);
  console.log('Average discovery time:', `${metrics.operations.discover.averageTime}ms`);
  console.log('Average job submission time:', `${metrics.operations.submitJob.averageTime}ms`);

  // 10. Disconnect
  console.log('\n🔟 Disconnecting...');
  await sdk.disconnect();
  console.log('✅ Disconnected\n');

  console.log('🎉 Production mode example completed!');
}

// Run the example
main().catch(console.error);

/* Example Output:

🚀 Fabstir SDK Production Mode Example

1️⃣ Initializing SDK in production mode...
2️⃣ Connecting wallet...
✅ Connected to blockchain and P2P network
Wallet address: 0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1
Network: base-sepolia (Chain ID: 84532)

3️⃣ Checking system health...
System status: healthy
P2P status: connected
Connected peers: 5
Blockchain status: connected

4️⃣ Discovering nodes...
Found 3 suitable nodes:

  Node: 12D3KooWRm8J3iL796zPFi2EtGGtUJn58AG67gcRzQ4FENEemvpg
  Models: llama-3.2-1b-instruct, gpt-4
  Price: 0.000001 ETH/token
  Latency: 45ms
  Reputation: 95/100

  Node: 12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V
  Models: llama-3.2-1b-instruct
  Price: 0.0000008 ETH/token
  Latency: 62ms
  Reputation: 88/100

5️⃣ Checking wallet balance...
Balance: 0.15 ETH

6️⃣ Submitting job with negotiation...

✅ Job submitted successfully!
Job ID: 42
Selected node: 12D3KooWQH5gJ9YjDfRpLnBKY7vtkbPQkxQ5XbVJHmENw5YjLs2V
Negotiated price: 0.00012 ETH
Transaction hash: 0x123...abc

7️⃣ Streaming response...

Blockchain is a revolutionary technology that acts like a digital ledger or record book that is shared among many people. 
Instead of being stored in one central location, copies of this ledger exist on thousands of computers around the world. 
Each "block" contains a list of transactions, and these blocks are linked together in a "chain" using cryptography. 
This makes it extremely difficult to alter past records, creating a transparent and secure system for recording information.

✅ Stream completed!
Total tokens: 97
Duration: 4823ms
Tokens per second: 20.11

9️⃣ Performance metrics...
Total operations: 4
Average connection time: 342ms
Average discovery time: 865ms
Average job submission time: 1243ms

🔟 Disconnecting...
✅ Disconnected

🎉 Production mode example completed!
*/