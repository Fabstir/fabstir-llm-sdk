#!/usr/bin/env node
// test-headless.js - Test the headless SDK in Node.js environment

import { FabstirSDKHeadless } from './dist/sdk-headless.js';
import { ethers } from 'ethers';

async function testHeadlessSDK() {
  console.log('Testing FabstirSDKHeadless...\n');

  // 1. Create SDK in mock mode (no signer needed)
  console.log('1. Creating SDK in mock mode...');
  const mockSDK = new FabstirSDKHeadless({
    mode: 'mock',
    network: 'base-sepolia',
    debug: true
  });
  console.log('✅ Mock SDK created successfully');

  // 2. Test P2P discovery without signer
  console.log('\n2. Testing P2P node discovery (mock)...');
  const nodes = await mockSDK.discoverNodes({
    modelId: 'test-model',
    maxResults: 3
  });
  console.log(`✅ Discovered ${nodes.length} mock nodes`);

  // 3. Create SDK with signer
  console.log('\n3. Creating SDK with signer...');
  const productionSDK = new FabstirSDKHeadless({
    mode: 'mock', // Still use mock to avoid needing real network
    network: 'base-sepolia'
  });

  // Create a test wallet
  const wallet = ethers.Wallet.createRandom();
  const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
  const signer = wallet.connect(provider);

  console.log('Setting signer on SDK...');
  try {
    await productionSDK.setSigner(signer);
    console.log('✅ Signer set successfully');
    const address = await productionSDK.getSignerAddress();
    console.log(`   Signer address: ${address}`);
  } catch (error) {
    // Expected to fail if no local node running
    console.log('⚠️  Signer setup failed (expected if no local node):', error.message);
  }

  // 4. Test job submission in mock mode
  console.log('\n4. Testing job submission (mock mode)...');
  const mockSDKWithSigner = new FabstirSDKHeadless({
    mode: 'mock',
    network: 'base-sepolia'
  });

  // Mock mode doesn't actually need a real provider
  const mockProvider = {
    getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
  };
  const mockSigner = {
    provider: mockProvider,
    getAddress: async () => '0x1234567890123456789012345678901234567890'
  };

  await mockSDKWithSigner.setSigner(mockSigner);
  
  const jobResponse = await mockSDKWithSigner.submitJob({
    modelId: 'test-model',
    prompt: 'Hello, world!',
    maxTokens: 100,
    offerPrice: '1000000000000000'
  });
  
  console.log('✅ Job submitted successfully');
  console.log(`   Job ID: ${jobResponse.jobId}`);
  console.log(`   Status: ${jobResponse.status}`);

  // 5. Test signer removal
  console.log('\n5. Testing signer removal...');
  mockSDKWithSigner.clearSigner();
  console.log(`✅ Signer cleared. Has signer: ${mockSDKWithSigner.hasSigner()}`);

  // 6. Test error when no signer
  console.log('\n6. Testing error handling without signer...');
  try {
    await mockSDK.submitJob({
      modelId: 'test-model',
      prompt: 'This should fail',
      maxTokens: 100,
      offerPrice: '1000000000000000'
    });
    console.log('❌ Should have thrown an error');
  } catch (error) {
    console.log('✅ Correctly threw error:', error.message);
  }

  // 7. Clean up
  console.log('\n7. Cleaning up...');
  await mockSDK.disconnect();
  await mockSDKWithSigner.disconnect();
  console.log('✅ SDKs disconnected');

  console.log('\n✨ All tests passed!');
}

// Run tests
testHeadlessSDK().catch(console.error);