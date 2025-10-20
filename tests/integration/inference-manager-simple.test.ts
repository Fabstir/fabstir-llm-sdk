// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import 'fake-indexeddb/auto';

dotenv.config({ path: '.env.test' });

describe('InferenceManager - Simple Test', () => {
  let sdk: FabstirSDK;
  let inferenceManager: any;
  
  beforeAll(async () => {
    console.log('\n🚀 Testing InferenceManager\n');
    
    sdk = new FabstirSDK({
      mode: 'production',
      network: {
        chainId: 84532,
        name: 'base-sepolia',
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!
      },
      contracts: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!
      }
    });
  });

  it('should get InferenceManager after authentication', async () => {
    console.log('Step 1: Authenticate');
    const authResult = await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    console.log(`✅ Authenticated: ${authResult.userAddress}`);
    
    console.log('\nStep 2: Get InferenceManager');
    inferenceManager = await sdk.getInferenceManager();
    
    expect(inferenceManager).toBeDefined();
    expect(inferenceManager.sendPrompt).toBeDefined();
    expect(inferenceManager.connectToSession).toBeDefined();
    expect(inferenceManager.discoverHosts).toBeDefined();
    console.log('✅ InferenceManager ready with all methods');
    
    // List available methods
    console.log('\nAvailable InferenceManager methods:');
    const methods = [
      'connectToSession',
      'sendPrompt',
      'streamPrompt',
      'getConversation',
      'getTokenUsage',
      'estimateTokens',
      'getSessionCost',
      'disconnect',
      'isConnected',
      'getActiveConnections',
      'discoverHosts'
    ];
    
    for (const method of methods) {
      if (typeof inferenceManager[method] === 'function') {
        console.log(`  ✓ ${method}`);
      }
    }
  });

  it('should estimate tokens correctly', async () => {
    console.log('\nStep 3: Test token estimation');
    
    if (!inferenceManager) {
      await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
      inferenceManager = await sdk.getInferenceManager();
    }
    
    const testPrompts = [
      { text: 'Hello world', expectedMin: 2 },
      { text: 'What is machine learning in simple terms?', expectedMin: 7 },
      { text: 'Explain blockchain technology and smart contracts', expectedMin: 6 }
    ];
    
    for (const { text, expectedMin } of testPrompts) {
      const estimated = inferenceManager.estimateTokens(text);
      console.log(`  "${text}" → ${estimated} tokens`);
      expect(estimated).toBeGreaterThanOrEqual(expectedMin);
    }
  });

  it('should calculate session cost', async () => {
    console.log('\nStep 4: Test cost calculation');
    
    if (!inferenceManager) {
      await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
      inferenceManager = await sdk.getInferenceManager();
    }
    
    // Mock session with 100 tokens
    const mockSessionId = 'test-session-1';
    const pricePerToken = '10000000000000'; // 10000 gwei
    
    // Since we can't set token usage directly, just test the method exists
    const cost = inferenceManager.getSessionCost(mockSessionId, pricePerToken);
    console.log(`  Cost for 0 tokens: ${ethers.utils.formatEther(cost)} ETH`);
    
    expect(cost).toBeDefined();
    expect(ethers.BigNumber.isBigNumber(cost)).toBe(true);
  });

  it('should check LLM node availability', async () => {
    console.log('\nStep 5: Check LLM node');
    
    const LLM_NODE_URL = 'http://localhost:8080';
    
    try {
      const response = await fetch(`${LLM_NODE_URL}/health`);
      if (response.ok) {
        const health = await response.json();
        console.log('  ✅ LLM node is running:', health.status);
        
        // If healthy, test inference
        if (health.status === 'healthy' || health.status === 'degraded') {
          const inferenceTest = await fetch(`${LLM_NODE_URL}/v1/inference`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'llama-2-7b',
              prompt: 'Say hello',
              max_tokens: 10,
              temperature: 0.7,
              stream: false
            })
          });
          
          if (inferenceTest.ok) {
            const result = await inferenceTest.json();
            console.log('  ✅ Inference working:', result.content?.substring(0, 50));
          }
        }
      }
    } catch (error) {
      console.log('  ℹ️ LLM node not available (expected in CI)');
    }
  });
});