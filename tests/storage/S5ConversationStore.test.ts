// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { S5ConversationStore } from '../../src/storage/S5ConversationStore';
import type { Message } from '../../src/storage/types';
import dotenv from 'dotenv';

// Load test environment
dotenv.config({ path: '.env.test' });

// Polyfill IndexedDB for Node.js
import 'fake-indexeddb/auto';

describe('S5ConversationStore (Real S5)', () => {
  let store: S5ConversationStore;
  const testSessionId = Math.floor(Date.now() / 1000);
  
  beforeAll(() => {
    // Ensure we have required env vars
    if (!process.env.S5_SEED_PHRASE) {
      throw new Error('S5_SEED_PHRASE not set in .env.test');
    }
  });
  
  beforeEach(async () => {
    store = new S5ConversationStore({
      seedPhrase: process.env.S5_SEED_PHRASE!,
      portalUrl: 'https://s5.platformlessai.ai'
    });
    
    await store.connect();
  }, 60000); // 60s timeout for S5 connection
  
  afterEach(async () => {
    if (store) await store.disconnect();
  });

  it('saves prompt to S5', async () => {
    const prompt: Message = {
      id: `msg-${Date.now()}`,
      sessionId: testSessionId,
      role: 'user',
      content: 'Hello from SDK test',
      timestamp: Date.now()
    };
    
    await store.savePrompt(testSessionId, prompt);
    
    const messages = await store.loadSession(testSessionId);
    const saved = messages.find(m => m.id === prompt.id);
    expect(saved?.content).toBe('Hello from SDK test');
  });

  it('saves response to S5', async () => {
    const response: Message = {
      id: `resp-${Date.now()}`,
      sessionId: testSessionId + 1,
      role: 'assistant',
      content: 'AI response',
      timestamp: Date.now(),
      tokenCount: 3
    };
    
    await store.saveResponse(testSessionId + 1, response);
    
    const messages = await store.loadSession(testSessionId + 1);
    const saved = messages.find(m => m.id === response.id);
    expect(saved?.tokenCount).toBe(3);
  });

  it('loads full session history', async () => {
    const sessionId = testSessionId + 2;
    const messages: Message[] = [
      {
        id: `1-${Date.now()}`,
        sessionId,
        role: 'user',
        content: 'First message',
        timestamp: Date.now() - 2000
      },
      {
        id: `2-${Date.now() + 1}`,
        sessionId,
        role: 'assistant',
        content: 'First response',
        timestamp: Date.now() - 1000
      },
      {
        id: `3-${Date.now() + 2}`,
        sessionId,
        role: 'user',
        content: 'Second message',
        timestamp: Date.now()
      }
    ];
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        await store.savePrompt(sessionId, msg);
      } else {
        await store.saveResponse(sessionId, msg);
      }
    }
    
    const loaded = await store.loadSession(sessionId);
    expect(loaded).toHaveLength(3);
    expect(loaded[0].content).toBe('First message');
    expect(loaded[2].content).toBe('Second message');
  }, 60000);

  it('grants access to host address', async () => {
    const hostAddress = '0x4594F755F593B517Bb3194F4DeC20C48a3f04504';
    
    await store.grantAccess(testSessionId + 3, hostAddress);
    
    const hasAccess = await store.checkAccess(testSessionId + 3, hostAddress);
    expect(hasAccess).toBe(true);
  });

  it('handles S5 connection errors', async () => {
    const badStore = new S5ConversationStore({
      seedPhrase: 'invalid seed phrase that will fail',
      portalUrl: 'https://s5.platformlessai.ai'
    });
    
    await expect(badStore.connect()).rejects.toThrow();
  });

  it('validates session ID format', async () => {
    const invalidMessage: Message = {
      id: '1',
      sessionId: -1,
      role: 'user',
      content: 'Test',
      timestamp: Date.now()
    };
    
    await expect(store.savePrompt(-1, invalidMessage))
      .rejects.toThrow('Invalid session ID');
  });

  it('returns empty array for new session', async () => {
    const messages = await store.loadSession(999999999);
    expect(messages).toEqual([]);
  });

  it('maintains message ordering', async () => {
    const sessionId = testSessionId + 4;
    const unorderedMessages: Message[] = [
      {
        id: `3-${Date.now() + 200}`,
        sessionId,
        role: 'user',
        content: 'Third',
        timestamp: Date.now() + 2000
      },
      {
        id: `1-${Date.now()}`,
        sessionId,
        role: 'user',
        content: 'First',
        timestamp: Date.now()
      },
      {
        id: `2-${Date.now() + 100}`,
        sessionId,
        role: 'assistant',
        content: 'Second',
        timestamp: Date.now() + 1000
      }
    ];
    
    for (const msg of unorderedMessages) {
      if (msg.role === 'user') {
        await store.savePrompt(sessionId, msg);
      } else {
        await store.saveResponse(sessionId, msg);
      }
    }
    
    const loaded = await store.loadSession(sessionId);
    expect(loaded[0].content).toBe('First');
    expect(loaded[1].content).toBe('Second');
    expect(loaded[2].content).toBe('Third');
  });

  it('handles sequential saves', async () => {
    const sessionId = testSessionId + 5;
    
    // S5 registry doesn't handle concurrent writes well, so we save sequentially
    for (let i = 0; i < 5; i++) {
      const msg: Message = {
        id: `msg-${i}-${Date.now()}`,
        sessionId,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
        timestamp: Date.now() + i
      };
      
      if (msg.role === 'user') {
        await store.savePrompt(sessionId, msg);
      } else {
        await store.saveResponse(sessionId, msg);
      }
    }
    
    const loaded = await store.loadSession(sessionId);
    expect(loaded).toHaveLength(5);
  }, 60000);
});