// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Basic Usage Example for Fabstir LLM SDK
 * 
 * This example demonstrates the simplest way to:
 * 1. Initialize the SDK
 * 2. Authenticate with a private key
 * 3. Create a compute session
 * 4. Store and retrieve data
 */

import { FabstirSDK } from '@fabstir/llm-sdk';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function main() {
  // 1. Initialize SDK with configuration
  const sdk = new FabstirSDK({
    rpcUrl: process.env.RPC_URL_BASE_SEPOLIA || 
      'https://base-sepolia.g.alchemy.com/v2/your-key',
    s5PortalUrl: process.env.S5_PORTAL_URL || 
      'wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p'
  });

  // 2. Authenticate with private key
  if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required');
  }
  
  const authResult = await sdk.authenticate(process.env.PRIVATE_KEY);
  console.log('✅ Authenticated as:', authResult.userAddress);
  console.log('   Network:', authResult.network?.name);

  // 3. Create a compute session
  const sessionManager = await sdk.getSessionManager();
  
  const session = await sessionManager.createSession({
    paymentType: 'ETH',
    amount: '0.005', // 0.005 ETH
    pricePerToken: 5000,
    duration: 3600, // 1 hour
    hostAddress: process.env.HOST_ADDRESS || '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7'
  });

  console.log('✅ Session created:');
  console.log('   Session ID:', session.sessionId);
  console.log('   Job ID:', session.jobId);
  console.log('   Host:', session.hostAddress);
  console.log('   Transaction:', session.txHash);

  // 4. Store session data
  const storageManager = await sdk.getStorageManager();
  
  const sessionData = {
    prompt: 'Hello, this is a test prompt for the AI model.',
    temperature: 0.7,
    maxTokens: 100,
    timestamp: new Date().toISOString()
  };

  const cid = await sessionManager.storeSessionData(
    session.sessionId,
    sessionData
  );

  console.log('✅ Session data stored:');
  console.log('   CID:', cid);

  // 5. Retrieve session data
  const retrievedData = await sessionManager.getSessionData(session.sessionId);
  console.log('✅ Retrieved session data:');
  console.log('  ', JSON.stringify(retrievedData, null, 2));

  // 6. Check session status
  const status = await sessionManager.getSessionStatus(session.sessionId);
  console.log('✅ Session status:', status);

  // 7. List active sessions
  const activeSessions = await sessionManager.getActiveSessions();
  console.log('✅ Active sessions:', activeSessions);

  // Note: In a real application, you would:
  // - Submit proofs periodically during computation
  // - Complete the session when done
  // - Handle errors and retries

  console.log('\n🎉 Basic SDK usage complete!');
}

// Run the example
main()
  .then(() => {
    console.log('\n✨ Example completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error('   Error code:', error.code);
    }
    if (error.details) {
      console.error('   Details:', error.details);
    }
    process.exit(1);
  });

/**
 * Required Environment Variables:
 * 
 * PRIVATE_KEY=0x... (Your Ethereum private key)
 * RPC_URL_BASE_SEPOLIA=https://base-sepolia.g.alchemy.com/v2/your-key
 * S5_PORTAL_URL=wss://z2DcjTLqfj6PTMsDbFfgtuHtYmrKeibFTkvqY8QZeyR3YmE@s5.platformlessai.ai/s5/p2p
 * HOST_ADDRESS=0x... (Optional: specific host address)
 */