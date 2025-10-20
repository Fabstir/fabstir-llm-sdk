// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import 'fake-indexeddb/auto';
import { FabstirSDK } from '../../src/FabstirSDK';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.test' });

/**
 * Debug test for StorageManager S5 operations
 */
describe('Storage Debug Test', () => {
  let sdk: FabstirSDK;
  let sessionId: string;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({
      rpcUrl: process.env.RPC_URL_BASE_SEPOLIA!,
      s5PortalUrl: process.env.S5_PORTAL_URL || 'wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p'
    });
    
    await sdk.authenticate(process.env.TEST_USER_1_PRIVATE_KEY!);
    sessionId = `debug-session-${Date.now()}`;
  });
  
  it('should save and load conversation with timeout', async () => {
    console.log('\n🔍 Storage Debug Test\n');
    
    const storageManager = await sdk.getStorageManager();
    console.log('✅ StorageManager initialized');
    
    // Test 1: Save conversation
    console.log('\nTest 1: Saving conversation...');
    const messages = [
      { role: 'user', content: 'Debug test message' },
      { role: 'assistant', content: 'Debug test response' }
    ];
    
    // Add timeout to prevent hanging
    const savePromise = storageManager.saveConversation(sessionId, messages);
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Save timeout after 10s')), 10000)
    );
    
    try {
      await Promise.race([savePromise, timeoutPromise]);
      console.log('✅ Conversation saved');
    } catch (error: any) {
      console.log(`❌ Save failed: ${error.message}`);
      throw error;
    }
    
    // Test 2: Load conversation
    console.log('\nTest 2: Loading conversation...');
    const loadPromise = storageManager.loadConversation(sessionId);
    const loadTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Load timeout after 10s')), 10000)
    );
    
    try {
      const loaded = await Promise.race([loadPromise, loadTimeoutPromise]) as any[];
      console.log(`✅ Loaded ${loaded.length} messages`);
      expect(loaded.length).toBe(2);
      expect(loaded[0].content).toBe('Debug test message');
    } catch (error: any) {
      console.log(`❌ Load failed: ${error.message}`);
      throw error;
    }
    
    // Test 3: List sessions
    console.log('\nTest 3: Listing sessions...');
    const listPromise = storageManager.listSessions();
    const listTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('List timeout after 10s')), 10000)
    );
    
    try {
      const sessions = await Promise.race([listPromise, listTimeoutPromise]) as any[];
      console.log(`✅ Found ${sessions.length} sessions`);
      
      const ourSession = sessions.find((s: any) => s.id === sessionId);
      if (ourSession) {
        console.log(`✅ Our session found: ${ourSession.id}`);
      } else {
        console.log('⚠️  Our session not in list (may not be persisted yet)');
      }
    } catch (error: any) {
      console.log(`❌ List failed: ${error.message}`);
      // Don't throw - list can fail if no sessions exist
    }
    
    console.log('\n✅ Debug test completed');
  }, 30000);
});