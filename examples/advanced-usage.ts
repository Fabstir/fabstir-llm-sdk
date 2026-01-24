// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Advanced Usage Example for Fabstir LLM SDK
 * 
 * This example demonstrates advanced features:
 * 1. Using all managers directly
 * 2. USDC payment flow with approval
 * 3. P2P node discovery
 * 4. Custom host selection criteria
 * 5. Session lifecycle management
 * 6. Error handling and retries
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import { ethers } from 'ethers';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

class AdvancedSDKExample {
  private sdk: FabstirSDK;
  
  constructor() {
    this.sdk = new FabstirSDK({
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA,
      s5PortalUrl: process.env.S5_PORTAL_URL,
      contractAddresses: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY,
        usdcToken: process.env.CONTRACT_USDC_TOKEN,
        fabToken: process.env.CONTRACT_FAB_TOKEN
      }
    });
  }

  async initialize() {
    console.log('🔧 Initializing SDK...');
    
    // Authenticate
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }
    
    const authResult = await this.sdk.authenticate(privateKey);
    console.log('✅ Authenticated:', authResult.userAddress);
    console.log('   S5 Seed generated:', authResult.s5Seed.substring(0, 20) + '...');
    
    return authResult;
  }

  async demonstrateAuthManager() {
    console.log('\n📝 AuthManager Demo');
    console.log('===================');
    
    const authManager = this.sdk.getAuthManager();
    
    // Get authenticated information
    console.log('User Address:', authManager.getUserAddress());
    console.log('Is Authenticated:', authManager.isAuthenticated());
    
    // Get signer for direct contract interaction
    const signer = authManager.getSigner();
    const balance = await signer.getBalance();
    console.log('ETH Balance:', ethers.utils.formatEther(balance), 'ETH');
  }

  async demonstratePaymentManager() {
    console.log('\n💰 PaymentManager Demo');
    console.log('======================');
    
    const paymentManager = this.sdk.getPaymentManager();
    
    // Example: USDC payment flow
    const usdcAddress = process.env.CONTRACT_USDC_TOKEN!;
    const hostAddress = process.env.HOST_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7';
    
    try {
      // Step 1: Approve USDC spending
      console.log('Approving USDC...');
      const approveTx = await paymentManager.approveUSDC(
        usdcAddress,
        '100' // 100 USDC
      );
      console.log('✅ USDC Approved:', approveTx);
      
      // Step 2: Create USDC job
      console.log('Creating USDC job...');
      const job = await paymentManager.createUSDCSessionJob(
        hostAddress,
        usdcAddress,
        '10', // 10 USDC
        5000, // price per token
        3600, // 1 hour duration
        300   // 5 minute proof interval
      );
      console.log('✅ USDC Job created:', job);
      
    } catch (error: any) {
      if (error.code === 'INSUFFICIENT_BALANCE') {
        console.log('⚠️  Insufficient USDC balance (expected in test environment)');
      } else {
        console.log('⚠️  USDC demo error:', error.message);
      }
    }
  }

  async demonstrateStorageManager() {
    console.log('\n💾 StorageManager Demo');
    console.log('======================');
    
    const storageManager = await this.sdk.getStorageManager();
    
    // Store complex data
    const conversationData = {
      id: 'conv-' + Date.now(),
      messages: [
        { role: 'user', content: 'What is quantum computing?' },
        { role: 'assistant', content: 'Quantum computing is...' }
      ],
      metadata: {
        model: 'llama-3.2-1b-instruct',
        temperature: 0.7,
        timestamp: new Date().toISOString()
      }
    };
    
    const key = `conversation-${conversationData.id}`;
    const cid = await storageManager.storeData(
      key,
      conversationData,
      { type: 'conversation', version: '1.0' }
    );
    console.log('✅ Stored conversation:', cid);
    
    // Retrieve data
    const retrieved = await storageManager.retrieveData(key);
    console.log('✅ Retrieved:', JSON.stringify(retrieved, null, 2).substring(0, 200) + '...');
    
    // List user data
    const userDataList = await storageManager.listUserData();
    console.log('✅ User data count:', userDataList.length);
    if (userDataList.length > 0) {
      console.log('   Latest entry:', userDataList[0]);
    }
  }

  async demonstrateDiscoveryManager() {
    console.log('\n🌐 DiscoveryManager Demo');
    console.log('========================');
    
    const discoveryManager = this.sdk.getDiscoveryManager();
    
    try {
      // Create P2P node
      console.log('Creating P2P node...');
      const peerId = await discoveryManager.createNode({
        listen: ['/ip4/127.0.0.1/tcp/0'],
        bootstrap: [] // No bootstrap nodes for demo
      });
      console.log('✅ P2P Node created:', peerId);
      
      // Check node status
      console.log('Node running:', discoveryManager.isRunning());
      
      // Get connected peers
      const peers = discoveryManager.getConnectedPeers();
      console.log('Connected peers:', peers.length);
      
      // Register message handler
      discoveryManager.onMessage((message) => {
        console.log('📨 Received message:', message);
      });
      
      // Simulate finding a host
      console.log('Finding suitable host...');
      const hostAddress = await discoveryManager.findHost({
        minReputation: 100,
        maxLatency: 500,
        requiredModels: ['llama-3.2-1b-instruct']
      });
      console.log('✅ Found host:', hostAddress);
      
      // Clean up
      await discoveryManager.stop();
      console.log('✅ P2P node stopped');
      
    } catch (error: any) {
      console.log('⚠️  Discovery demo note:', error.message);
    }
  }

  async demonstrateSessionManager() {
    console.log('\n🎮 SessionManager Demo');
    console.log('======================');
    
    const sessionManager = await this.sdk.getSessionManager();
    
    // Create session with host discovery
    console.log('Creating session with auto-discovery...');
    const session = await sessionManager.createSession({
      paymentType: 'ETH',
      amount: '0.005',
      pricePerToken: 5000,
      duration: 3600,
      hostCriteria: {
        minReputation: 50,
        preferredModels: ['llama-3.2-1b-instruct']
      }
    });
    
    console.log('✅ Session created:', {
      sessionId: session.sessionId,
      jobId: session.jobId,
      host: session.hostAddress
    });
    
    // Submit proof (simulated)
    console.log('Submitting proof...');
    const proofData = {
      tokensProcessed: 1000,
      checkpoint: 'QmX...',
      timestamp: Date.now()
    };
    const proofCid = await sessionManager.submitProof(
      session.sessionId,
      proofData
    );
    console.log('✅ Proof submitted:', proofCid);
    
    // Store conversation in session
    const conversation = {
      messages: [
        { role: 'user', content: 'Explain blockchain' },
        { role: 'assistant', content: 'Blockchain is a distributed ledger...' }
      ],
      totalTokens: 1000
    };
    
    await sessionManager.storeSessionData(
      session.sessionId,
      conversation
    );
    console.log('✅ Conversation stored');
    
    // Get session status
    const status = await sessionManager.getSessionStatus(session.sessionId);
    console.log('Session status:', status);
    
    // Complete session
    console.log('Completing session...');
    try {
      const completion = await sessionManager.completeSession(session.sessionId);
      console.log('✅ Session completed:');
      console.log('   Transaction:', completion.txHash);
      console.log('   Payment to host:', completion.paymentDistribution.host);
      console.log('   Payment to treasury:', completion.paymentDistribution.treasury);
    } catch (error: any) {
      console.log('⚠️  Session completion note:', error.message);
    }
  }

  async demonstrateErrorHandling() {
    console.log('\n⚠️  Error Handling Demo');
    console.log('=======================');
    
    // Example: Retry logic for network errors
    const retryOperation = async <T>(
      operation: () => Promise<T>,
      maxRetries: number = 3
    ): Promise<T> => {
      let lastError: any;
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await operation();
        } catch (error: any) {
          lastError = error;
          console.log(`Attempt ${i + 1} failed:`, error.message);
          
          // Don't retry certain errors
          if (error.code === 'INSUFFICIENT_BALANCE' ||
              error.code === 'AUTH_FAILED') {
            throw error;
          }
          
          // Exponential backoff
          const delay = Math.pow(2, i) * 1000;
          console.log(`Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      throw lastError;
    };
    
    // Example usage with retry
    try {
      const sessionManager = await this.sdk.getSessionManager();
      const session = await retryOperation(async () => {
        return sessionManager.createSession({
          paymentType: 'ETH',
          amount: '0.005',
          hostAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
        });
      });
      console.log('✅ Session created with retry logic:', session.sessionId);
    } catch (error: any) {
      console.log('❌ Failed after retries:', error.message);
    }
  }

  async run() {
    try {
      // Initialize
      await this.initialize();
      
      // Demonstrate each manager
      await this.demonstrateAuthManager();
      await this.demonstratePaymentManager();
      await this.demonstrateStorageManager();
      await this.demonstrateDiscoveryManager();
      await this.demonstrateSessionManager();
      await this.demonstrateErrorHandling();
      
      console.log('\n🎉 Advanced SDK demo complete!');
      
    } catch (error: any) {
      console.error('\n❌ Fatal error:', error);
      throw error;
    }
  }
}

// Run the example
async function main() {
  const example = new AdvancedSDKExample();
  await example.run();
}

main()
  .then(() => {
    console.log('\n✨ All demonstrations completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Example failed:', error.message);
    process.exit(1);
  });

/**
 * Required Environment Variables:
 * 
 * PRIVATE_KEY=0x...
 * RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/your-key
 * S5_PORTAL_URL=wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p
 * CONTRACT_JOB_MARKETPLACE=0xD937c594682Fe74E6e3d06239719805C04BE804A
 * CONTRACT_NODE_REGISTRY=0x87516C13Ea2f99de598665e14cab64E191A0f8c4
 * CONTRACT_USDC_TOKEN=0x036CbD53842c5426634e7929541eC2318f3dCF7e
 * CONTRACT_FAB_TOKEN=0xC78949004B4EB6dEf2D66e49Cd81231472612D62
 * HOST_ADDRESS=0x... (Optional)
 */