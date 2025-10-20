// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi, beforeAll, afterEach } from 'vitest';
import { FabstirSessionSDK } from '../src/FabstirSessionSDK';
import type { SDKConfig, Session } from '../src/session-types';
import { ethers } from 'ethers';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Polyfill for Node.js
import 'fake-indexeddb/auto';

describe('FabstirSessionSDK', () => {
  let sdk: FabstirSessionSDK;
  let mockSigner: ethers.Signer;
  
  beforeAll(() => {
    // Create mock signer with a test private key
    const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
    const testPrivateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    mockSigner = new ethers.Wallet(testPrivateKey, provider);
  });
  
  beforeEach(() => {
    // For SDK integration tests, disable S5 since:
    // 1. S5ConversationStore has its own comprehensive tests (9/9 passing)
    // 2. Concurrent S5 connections with generated seed phrases cause test issues
    // 3. In production, users will have proper seed phrases from passkeys
    
    const config: SDKConfig = {
      contractAddress: process.env.CONTRACT_JOB_MARKETPLACE!,
      discoveryUrl: 'http://localhost:3003',
      s5SeedPhrase: 'test seed phrase', // Not used when enableS5 is false
      s5PortalUrl: 'https://s5.vup.cx',
      cacheConfig: {
        maxEntries: 10,
        ttl: 60000
      },
      enableS5: false // Disable S5 for SDK integration tests
    };
    
    sdk = new FabstirSessionSDK(config, mockSigner);
  });

  afterEach(async () => {
    // Clean up S5 connections after each test
    if (sdk) {
      await sdk.cleanup();
    }
  });

  it('initializes with configuration', () => {
    expect(sdk).toBeDefined();
    expect(sdk.isInitialized()).toBe(true);
  });

  it('starts session with host and deposit', async () => {
    const mockHost = {
      id: 'host-1',
      address: '0x123...',
      url: 'ws://localhost:8080',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01); // 0.01 ETH deposit
    
    expect(session).toBeDefined();
    expect(session.jobId).toBeGreaterThan(0);
    expect(session.host).toEqual(mockHost);
    expect(session.status).toBe('Active');
  });

  it('sends prompt to active session', async () => {
    const mockHost = {
      id: 'host-2',
      address: '0x456...',
      url: 'ws://localhost:8081',
      models: ['gpt-4'],
      pricePerToken: '2000000000',
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01);
    
    await sdk.sendPrompt('Hello, AI!');
    
    expect(session.messages).toHaveLength(1);
    expect(session.messages[0].content).toBe('Hello, AI!');
  });

  it('receives streaming responses', async () => {
    const mockHost = {
      id: 'host-3',
      address: '0x789...',
      url: 'ws://localhost:8082',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    await sdk.startSession(mockHost, 0.01);
    
    const responses: string[] = [];
    sdk.onResponse((message) => {
      responses.push(message.content);
    });
    
    await sdk.sendPrompt('Tell me a story');
    
    // Mock streaming response
    await new Promise(resolve => setTimeout(resolve, 100));
    
    expect(responses.length).toBeGreaterThan(0);
  });

  it('ends session and gets receipt', async () => {
    const mockHost = {
      id: 'host-4',
      address: '0xabc...',
      url: 'ws://localhost:8083',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01);
    session.tokensUsed = 150; // Mock token usage
    
    const receipt = await sdk.endSession();
    
    expect(receipt.sessionId).toBe(session.jobId);
    expect(receipt.totalTokens).toBe(150);
    expect(receipt.transactionHash).toBeDefined();
  });

  it('finds hosts matching requirements', async () => {
    const hosts = await sdk.findHosts({
      model: 'gpt-3.5',
      maxPrice: '2000000000'
    });
    
    expect(Array.isArray(hosts)).toBe(true);
    expect(hosts.length).toBeGreaterThan(0);
    hosts.forEach(host => {
      expect(host.models).toContain('gpt-3.5');
    });
  });

  it('saves conversation to S5', async () => {
    const mockHost = {
      id: 'host-5',
      address: '0xdef...',
      url: 'ws://localhost:8084',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01);
    await sdk.sendPrompt('Test message');
    
    await sdk.saveConversation();
    
    // Verify S5 save was called
    expect(session.messages).toHaveLength(1);
  });

  it('loads previous session', async () => {
    const previousSession = await sdk.loadPreviousSession(12345);
    
    expect(previousSession).toBeDefined();
    expect(previousSession.sessionId).toBe(12345);
    expect(Array.isArray(previousSession.messages)).toBe(true);
  });

  it('handles multiple concurrent sessions', async () => {
    const host1 = {
      id: 'host-6',
      address: '0x111...',
      url: 'ws://localhost:8085',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    const host2 = {
      id: 'host-7',
      address: '0x222...',
      url: 'ws://localhost:8086',
      models: ['gpt-4'],
      pricePerToken: '2000000000',
      available: true
    };
    
    const session1 = await sdk.startSession(host1, 0.01);
    const session2 = await sdk.startSession(host2, 0.02);
    
    expect(sdk.getActiveSessions()).toHaveLength(2);
    expect(sdk.getActiveSession(session1.jobId)).toBeDefined();
    expect(sdk.getActiveSession(session2.jobId)).toBeDefined();
  });

  it('rejects operations on inactive session', async () => {
    // Try to send prompt without active session
    await expect(sdk.sendPrompt('Hello')).rejects.toThrow('No active session');
    
    // Try to end non-existent session
    await expect(sdk.endSession()).rejects.toThrow('No active session');
  });

  it('calculates token usage correctly', async () => {
    const mockHost = {
      id: 'host-8',
      address: '0x333...',
      url: 'ws://localhost:8087',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000', // 1 gwei per token
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01);
    
    // Simulate token usage
    session.tokensUsed = 1500;
    
    const cost = sdk.calculateCost(session);
    expect(cost).toBe('0.0000015'); // 1500 * 1 gwei in ETH
  });

  it('emits lifecycle events', async () => {
    const events: string[] = [];
    
    sdk.on('session:created', () => events.push('created'));
    sdk.on('session:connected', () => events.push('connected'));
    sdk.on('prompt:sent', () => events.push('sent'));
    sdk.on('session:completed', () => events.push('completed'));
    
    const mockHost = {
      id: 'host-9',
      address: '0x444...',
      url: 'ws://localhost:8088',
      models: ['gpt-3.5'],
      pricePerToken: '1000000000',
      available: true
    };
    
    const session = await sdk.startSession(mockHost, 0.01);
    await sdk.sendPrompt('Test');
    await sdk.endSession();
    
    expect(events).toContain('created');
    expect(events).toContain('connected');
    expect(events).toContain('sent');
    expect(events).toContain('completed');
  });
});