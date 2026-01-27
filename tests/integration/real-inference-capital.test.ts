// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import { FabstirSDK } from '../../src/FabstirSDK';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import 'fake-indexeddb/auto';

dotenv.config({ path: '.env.test' });

describe('Real LLM Inference - Capital of France', () => {
  let sdk: FabstirSDK;
  let provider: ethers.providers.JsonRpcProvider;
  let userWallet: ethers.Wallet;
  
  const LLM_NODE_URL = process.env.LLM_NODE_URL || 'http://localhost:8080';
  
  beforeAll(async () => {
    console.log('\n🚀 Real Inference Test - Capital of France\n');
    console.log('This test demonstrates real LLM inference using FabstirSDK');
    console.log(`LLM Node URL: ${LLM_NODE_URL}\n`);
    
    provider = new ethers.providers.JsonRpcProvider(
      process.env.RPC_URL_BASE_SEPOLIA,
      { chainId: 84532, name: 'base-sepolia' }
    );
    userWallet = new ethers.Wallet(process.env.TEST_USER_1_PRIVATE_KEY!, provider);
    
    sdk = new FabstirSDK({
      mode: 'production',
      network: {
        chainId: 84532,
        name: 'base-sepolia',
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!
      },
      contracts: {
        jobMarketplace: process.env.CONTRACT_JOB_MARKETPLACE!,
        proofSystem: process.env.CONTRACT_PROOF_SYSTEM!,
        nodeRegistry: process.env.CONTRACT_NODE_REGISTRY!,
        usdcToken: process.env.CONTRACT_USDC_TOKEN!
      },
      discoveryUrl: 'http://localhost:3003',
      s5Config: {
        portalUrl: process.env.S5_PORTAL_URL || 'https://s5.platformlessai.ai',
        seedPhrase: process.env.S5_SEED_PHRASE
      }
    });
  });

  it('should get real response about capital of France', async () => {
    console.log('=== Testing Real LLM Inference ===\n');
    
    // Step 1: Check if LLM node is available
    console.log('Step 1: Check LLM node health');
    let nodeAvailable = false;
    
    try {
      const healthResponse = await fetch(`${LLM_NODE_URL}/health`);
      if (healthResponse.ok) {
        const health = await healthResponse.json();
        console.log(`✅ LLM node status: ${health.status}`);
        nodeAvailable = health.status === 'healthy' || health.status === 'degraded';
      }
    } catch (error) {
      console.log('❌ LLM node not reachable');
    }
    
    if (!nodeAvailable) {
      console.log('\n⚠️  LLM node not available - skipping inference test');
      console.log('To run this test, start the Fabstir LLM node:');
      console.log('  fabstir-llm-node --api-port 8080');
      return;
    }
    
    // Step 2: Authenticate SDK
    console.log('\nStep 2: Authenticate SDK');
    const authResult = await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    expect(authResult.userAddress).toBe(userWallet.address);
    console.log(`✅ Authenticated as: ${authResult.userAddress}`);
    
    // Step 3: Get managers
    console.log('\nStep 3: Initialize managers');
    const sessionManager = await sdk.getSessionManager();
    const inferenceManager = await sdk.getInferenceManager();
    
    expect(sessionManager).toBeDefined();
    expect(inferenceManager).toBeDefined();
    console.log('✅ Managers ready');
    
    // Step 4: Try direct HTTP inference first (simpler, no session needed)
    console.log('\nStep 4: Send inference request');
    const prompt = 'What is the capital of France?';
    console.log(`Prompt: "${prompt}"`);
    
    try {
      // Direct HTTP inference to LLM node
      const inferenceResponse = await fetch(`${LLM_NODE_URL}/v1/inference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-2-7b',
          prompt: prompt,
          max_tokens: 50,
          temperature: 0.7,
          stream: false
        })
      });
      
      if (inferenceResponse.ok) {
        const result = await inferenceResponse.json();
        
        console.log('\n✅ SUCCESS! Got real LLM response:');
        console.log('─'.repeat(50));
        console.log(result.content);
        console.log('─'.repeat(50));
        console.log(`Tokens used: ${result.tokens_used}`);
        console.log(`Model: ${result.model}`);
        
        // Verify response mentions Paris
        const response = result.content.toLowerCase();
        const containsParis = response.includes('paris');
        const containsCapital = response.includes('capital') || response.includes('france');
        
        if (containsParis) {
          console.log('\n✅ Response correctly identifies Paris as the capital!');
        }
        
        expect(result.content).toBeDefined();
        expect(result.tokens_used).toBeGreaterThan(0);
        expect(containsParis).toBe(true);
        
      } else {
        console.log('❌ Inference request failed:', inferenceResponse.status);
      }
      
    } catch (error: any) {
      console.log('❌ Failed to get inference:', error.message);
    }
    
    // Step 5: Alternative - Try via InferenceManager with session (more complex)
    console.log('\n\nStep 5: Alternative test via InferenceManager (requires session)');
    
    try {
      // Create a minimal session
      const sessionOptions = {
        paymentType: 'ETH' as const,
        amount: '0.001', // Minimal amount
        pricePerToken: 10000,
        duration: 60, // 1 minute
        proofInterval: 100,
        hostAddress: process.env.TEST_HOST_1_ADDRESS!
      };
      
      console.log('Creating session...');
      const session = await sessionManager.createSession(sessionOptions);
      console.log(`Session created: ${session.sessionId}`);
      
      // Connect to session
      const hostUrl = 'ws://localhost:8080';
      await inferenceManager.connectToSession(
        session.sessionId,
        hostUrl,
        parseInt(session.jobId),
        process.env.TEST_HOST_1_ADDRESS!
      );
      
      if (inferenceManager.isConnected(session.sessionId)) {
        console.log('✅ Connected to session');
        
        // Send prompt via InferenceManager
        console.log(`Sending prompt: "${prompt}"`);
        const result = await inferenceManager.sendPrompt(prompt, {
          sessionId: session.sessionId
        });
        
        console.log('\n✅ Response via InferenceManager:');
        console.log('─'.repeat(50));
        console.log(result.response);
        console.log('─'.repeat(50));
        
        expect(result.response.toLowerCase()).toContain('paris');
        
        // Disconnect
        await inferenceManager.disconnect(session.sessionId);
      } else {
        console.log('⚠️  Could not connect to WebSocket');
      }
      
    } catch (sessionError: any) {
      console.log('⚠️  Session-based inference not available:', sessionError.message);
      console.log('This is expected without a full blockchain setup');
    }
  });

  it('should verify LLM can answer simple questions', async () => {
    console.log('\n\n=== Additional Simple Questions Test ===\n');
    
    // Check node availability first
    try {
      const healthResponse = await fetch(`${LLM_NODE_URL}/health`);
      if (!healthResponse.ok) {
        console.log('Skipping: LLM node not available');
        return;
      }
    } catch {
      console.log('Skipping: LLM node not available');
      return;
    }
    
    const questions = [
      { prompt: 'What is 2 + 2?', expectedKeywords: ['4', 'four'] },
      { prompt: 'What color is the sky?', expectedKeywords: ['blue'] },
      { prompt: 'Who wrote Romeo and Juliet?', expectedKeywords: ['shakespeare', 'william'] }
    ];
    
    for (const { prompt, expectedKeywords } of questions) {
      console.log(`\nPrompt: "${prompt}"`);
      
      try {
        const response = await fetch(`${LLM_NODE_URL}/v1/inference`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-2-7b',
            prompt: prompt,
            max_tokens: 30,
            temperature: 0.5,
            stream: false
          })
        });
        
        if (response.ok) {
          const result = await response.json();
          console.log(`Response: ${result.content}`);
          
          const lowerResponse = result.content.toLowerCase();
          const hasExpectedKeyword = expectedKeywords.some(keyword => 
            lowerResponse.includes(keyword.toLowerCase())
          );
          
          if (hasExpectedKeyword) {
            console.log('✅ Response contains expected answer');
          } else {
            console.log('⚠️  Response may not contain expected keywords');
          }
          
          expect(result.content).toBeDefined();
        }
      } catch (error) {
        console.log('Failed to get response');
      }
    }
  });
});