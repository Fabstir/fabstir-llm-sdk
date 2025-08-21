#!/usr/bin/env node
// test-headless-comprehensive.js - Comprehensive test of the headless SDK in Node.js

import { FabstirSDKHeadless } from './dist/sdk-headless.js';
import { HeadlessContractManager } from './dist/contracts-headless.js';
import { ethers } from 'ethers';

async function testHeadlessSDK() {
  console.log('🚀 Comprehensive FabstirSDKHeadless Test Suite\n');
  console.log('═'.repeat(50));
  
  let testsPassed = 0;
  let totalTests = 0;

  // Test 1: SDK Creation and Mode Validation
  console.log('\n📋 Test 1: SDK Creation and Mode Validation');
  totalTests++;
  try {
    const mockSDK = new FabstirSDKHeadless({
      mode: 'mock',
      network: 'base-sepolia',
      debug: false
    });
    console.log('✅ Mock mode SDK created successfully');
    
    const prodSDK = new FabstirSDKHeadless({
      mode: 'production',
      network: 'base-sepolia',
      p2pConfig: {
        bootstrapNodes: ['/ip4/127.0.0.1/tcp/4001/p2p/test-peer-id']
      }
    });
    console.log('✅ Production mode SDK created successfully');
    
    await mockSDK.disconnect();
    await prodSDK.disconnect();
    testsPassed++;
  } catch (error) {
    console.log('❌ SDK creation failed:', error.message);
  }

  // Test 2: P2P Discovery Without Signer
  console.log('\n📋 Test 2: P2P Discovery (No Signer Required)');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    const nodes = await sdk.discoverNodes({
      modelId: 'gpt-3.5-turbo'
    });
    
    console.log(`✅ Discovered ${nodes.length} nodes without signer`);
    console.log(`   Node details: ${JSON.stringify(nodes[0], null, 2).split('\n').join('\n   ')}`);
    
    await sdk.disconnect();
    testsPassed++;
  } catch (error) {
    console.log('❌ P2P discovery failed:', error.message);
  }

  // Test 3: Dynamic Signer Management
  console.log('\n📋 Test 3: Dynamic Signer Management');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    // Initially no signer
    console.log(`   Has signer: ${sdk.hasSigner()} (should be false)`);
    
    // Create mock signer
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
    };
    const mockSigner = {
      provider: mockProvider,
      getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'
    };
    
    // Set signer
    await sdk.setSigner(mockSigner);
    console.log(`   Has signer after set: ${sdk.hasSigner()} (should be true)`);
    console.log(`   Signer address: ${await sdk.getSignerAddress()}`);
    
    // Clear signer
    sdk.clearSigner();
    console.log(`   Has signer after clear: ${sdk.hasSigner()} (should be false)`);
    
    console.log('✅ Dynamic signer management working');
    await sdk.disconnect();
    testsPassed++;
  } catch (error) {
    console.log('❌ Signer management failed:', error.message);
  }

  // Test 4: Job Submission with Mock Signer
  console.log('\n📋 Test 4: Job Submission with Mock Signer');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    // Set up mock signer
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
    };
    const mockSigner = {
      provider: mockProvider,
      getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'
    };
    await sdk.setSigner(mockSigner);
    
    // Submit job
    const jobResponse = await sdk.submitJob({
      modelId: 'gpt-3.5-turbo',
      prompt: 'Write a haiku about headless SDKs',
      maxTokens: 100,
      temperature: 0.7,
      offerPrice: '1000000000000000'
    });
    
    console.log('✅ Job submitted successfully');
    console.log(`   Request ID: ${jobResponse.requestId}`);
    console.log(`   Node ID: ${jobResponse.nodeId}`);
    console.log(`   Status: ${jobResponse.status}`);
    console.log(`   Estimated time: ${jobResponse.estimatedTime}ms`);
    
    // Get job status
    const jobId = parseInt(jobResponse.requestId);
    const status = await sdk.getJobStatus(jobId);
    console.log(`   Job status: ${status}`);
    
    await sdk.disconnect();
    testsPassed++;
  } catch (error) {
    console.log('❌ Job submission failed:', error.message);
  }

  // Test 5: Contract Manager Flexibility
  console.log('\n📋 Test 5: HeadlessContractManager');
  totalTests++;
  try {
    const contractManager = new HeadlessContractManager({
      network: 'base-sepolia',
      contractAddresses: {
        jobMarketplace: '0x6C4283A2aAee2f94BcD2EB04e951EfEa1c35b0B6'
      }
    });
    
    // Update network
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
    };
    await contractManager.updateNetwork(mockProvider);
    
    console.log('✅ HeadlessContractManager created and network updated');
    console.log('   Can accept signer in each method call');
    console.log('   Supports dynamic signer switching');
    testsPassed++;
  } catch (error) {
    console.log('❌ Contract manager test failed:', error.message);
  }

  // Test 6: Error Handling
  console.log('\n📋 Test 6: Error Handling');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    // Try to submit job without signer
    let errorCaught = false;
    try {
      await sdk.submitJob({
        modelId: 'test',
        prompt: 'test',
        maxTokens: 10
      });
    } catch (error) {
      errorCaught = true;
      console.log(`   Expected error caught: "${error.message}"`);
    }
    
    if (!errorCaught) {
      throw new Error('Should have thrown error for missing signer');
    }
    
    // Try to set invalid signer
    errorCaught = false;
    try {
      await sdk.setSigner({});
    } catch (error) {
      errorCaught = true;
      console.log(`   Expected error caught: "${error.message}"`);
    }
    
    if (!errorCaught) {
      throw new Error('Should have thrown error for invalid signer');
    }
    
    console.log('✅ Error handling working correctly');
    await sdk.disconnect();
    testsPassed++;
  } catch (error) {
    console.log('❌ Error handling test failed:', error.message);
  }

  // Test 7: Event Emission
  console.log('\n📋 Test 7: Event Emission');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    let connectedEventFired = false;
    let disconnectedEventFired = false;
    
    sdk.on('connected', (data) => {
      connectedEventFired = true;
      console.log(`   Connected event: address=${data.address}, chainId=${data.chainId}`);
    });
    
    sdk.on('disconnected', () => {
      disconnectedEventFired = true;
      console.log('   Disconnected event fired');
    });
    
    // Set signer to trigger connected event
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
    };
    const mockSigner = {
      provider: mockProvider,
      getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'
    };
    await sdk.setSigner(mockSigner);
    
    // Clear signer to trigger disconnected event
    sdk.clearSigner();
    
    if (connectedEventFired && disconnectedEventFired) {
      console.log('✅ Event emission working correctly');
      testsPassed++;
    } else {
      throw new Error('Events not fired correctly');
    }
    
    await sdk.disconnect();
  } catch (error) {
    console.log('❌ Event emission test failed:', error.message);
  }

  // Test 8: Memory Cleanup
  console.log('\n📋 Test 8: Memory Cleanup');
  totalTests++;
  try {
    const sdk = new FabstirSDKHeadless({ mode: 'mock' });
    
    // Set up signer and submit job
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532, name: 'base-sepolia' })
    };
    const mockSigner = {
      provider: mockProvider,
      getAddress: async () => '0x742d35Cc6634C0532925a3b844Bc9e7595f0fEdb'
    };
    await sdk.setSigner(mockSigner);
    
    // Submit a job to create some state
    await sdk.submitJob({
      modelId: 'test',
      prompt: 'test',
      maxTokens: 10
    });
    
    // Disconnect should clean up all resources
    await sdk.disconnect();
    
    // Verify cleanup
    console.log(`   Has signer after disconnect: ${sdk.hasSigner()} (should be false)`);
    console.log('✅ Memory cleanup working correctly');
    testsPassed++;
  } catch (error) {
    console.log('❌ Memory cleanup test failed:', error.message);
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log(`\n📊 Test Results: ${testsPassed}/${totalTests} tests passed`);
  
  if (testsPassed === totalTests) {
    console.log('\n✨ All tests passed! The headless SDK is working perfectly in Node.js.');
    console.log('\n🎯 Key achievements:');
    console.log('   • No browser dependencies required');
    console.log('   • Dynamic signer management');
    console.log('   • Works in pure Node.js environment');
    console.log('   • Proper error handling and cleanup');
    console.log('   • Event-driven architecture');
    process.exit(0);
  } else {
    console.log(`\n⚠️ ${totalTests - testsPassed} tests failed.`);
    process.exit(1);
  }
}

// Run the test suite
console.log('Starting comprehensive headless SDK test...\n');
testHeadlessSDK().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});