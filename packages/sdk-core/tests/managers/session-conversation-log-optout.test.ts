// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 7 — skipping the conversation log (plan D20, D21, D22, D30a).
 *
 * Every chat prompt carries its RAG context and an extraction run needs no log at all, so a session — or a
 * single prompt — can opt out. One gate (`logExchange`) serves every prompt path, so a new path cannot forget.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ethers } from 'ethers';
import { SessionManager } from '../../src/managers/SessionManager';
import * as entry from '../../src/index';
import 'fake-indexeddb/auto';

const HOST = ethers.Wallet.createRandom().address;
const src = (f: string) => readFileSync(resolve(__dirname, '../../src/managers', f), 'utf8');

function makeSM() {
  const storageManager = {
    isInitialized: () => true,
    storeConversation: vi.fn().mockResolvedValue(undefined),
    assertConversationLogWritable: vi.fn(),
    appendMessages: vi.fn().mockResolvedValue(undefined), // one call per exchange (§27 HH1)
    updateConversationMetadata: vi.fn().mockResolvedValue(undefined),
    loadConversation: vi.fn().mockResolvedValue(null),
    getUserAddress: () => '0xuser',
  };
  const paymentManager = {
    isInitialized: () => true,
    createSessionJob: vi.fn().mockResolvedValue(77),
    completeSession: vi.fn().mockResolvedValue('0xtx'),
  };
  const sm = new SessionManager(paymentManager as any, storageManager as any);
  return { sm, storageManager, paymentManager };
}

const startConfig = (over: Record<string, unknown> = {}) => ({
  chainId: 84532, host: HOST, modelId: 'tiny-model', endpoint: 'http://host.test:8080',
  pricePerToken: 1, depositAmount: '1', proofInterval: 100, duration: 3600, encryption: false, ...over,
});

const delegated = (over: Record<string, unknown> = {}) => ({
  sessionId: 88n, jobId: 88n, hostUrl: 'http://host.test:8080', hostAddress: HOST, model: 'tiny-model', chainId: 84532,
  depositAmount: '1', pricePerToken: 1, proofInterval: 100, duration: 3600, ...over,
});

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ response: 'the answer' }) })));
});
afterEach(() => vi.unstubAllGlobals());

describe('session-level opt-out: conversationLog: false', () => {
  test('startSession writes no log', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig({ conversationLog: false }));
    expect(storageManager.storeConversation).not.toHaveBeenCalled();
    expect(sm.getSession('77')?.conversationLog).toBe(false);
  });

  test('registerDelegatedSession writes no log', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.registerDelegatedSession(delegated({ conversationLog: false }) as any);
    expect(storageManager.storeConversation).not.toHaveBeenCalled();
    expect(sm.getSession('88')?.conversationLog).toBe(false);
  });

  test('prompts append nothing, and completeSession / endSession re-save nothing', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig({ conversationLog: false }));
    await sm.sendPrompt(77n, 'extract entities from this chunk');
    await sm.completeSession(77n, 10, '0xproof');
    await sm.endSession(77n);
    await new Promise((r) => setTimeout(r, 0));
    expect(storageManager.appendMessages).not.toHaveBeenCalled();
    expect(storageManager.updateConversationMetadata).not.toHaveBeenCalled();
  });

  test('the default is unchanged: the log is written and appended to', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig());
    await sm.sendPrompt(77n, 'hello');
    expect(storageManager.storeConversation).toHaveBeenCalledTimes(1);
    // The log write is not awaited by sendPrompt (§14 S6): wait for it here.
    await vi.waitFor(() => expect(storageManager.appendMessages.mock.calls.map((c) => c[1].map((m: any) => m.role))).toEqual([['user', 'assistant']]));
  });
});

describe('per-prompt opt-out: PromptOptions.conversationLog = false', () => {
  test('skips only that exchange', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig());
    await sm.sendPrompt(77n, 'extraction prompt', { conversationLog: false });
    expect(storageManager.appendMessages).not.toHaveBeenCalled();
    await sm.sendPrompt(77n, 'chat prompt');
    await vi.waitFor(() => expect(storageManager.appendMessages).toHaveBeenCalledTimes(1)); // one exchange; not awaited by sendPrompt (§14 S6)
  });

  test('the gate honours both flags', async () => {
    const { sm, storageManager } = makeSM();
    const session: any = { conversationLog: true };
    const user = { role: 'user', content: 'q', timestamp: 1 };
    await (sm as any).logExchange('1', session, { conversationLog: false }, [user]);
    await (sm as any).logExchange('1', { conversationLog: false }, undefined, [user]);
    expect(storageManager.appendMessages).not.toHaveBeenCalled();
    await (sm as any).logExchange('1', session, undefined, [user, { ...user, role: 'assistant' }]);
    expect(storageManager.appendMessages.mock.calls.map((c) => c[1].map((m: any) => m.role))).toEqual([['user', 'assistant']]);
  });
});

describe('completeSession / endSession use the locked metadata update (D20)', () => {
  test('completeSession patches status, tokens and end time', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig());
    await sm.completeSession(77n, 42, '0xproof');
    expect(storageManager.updateConversationMetadata).toHaveBeenCalledWith('77', expect.objectContaining({ status: 'completed', totalTokens: 42, endTime: expect.any(Number) }));
  });

  test('endSession patches status and end time', async () => {
    const { sm, storageManager } = makeSM();
    await sm.initialize();
    await sm.startSession(startConfig());
    await sm.endSession(77n);
    await new Promise((r) => setTimeout(r, 0));
    expect(storageManager.updateConversationMetadata).toHaveBeenCalledWith('77', expect.objectContaining({ status: 'ended', endTime: expect.any(Number) }));
  });
});

describe('structure — one gate, no bypass (the class, not the instance)', () => {
  test('every log append in SessionManager goes through logExchange; no load-then-save re-save remains', () => {
    const code = src('SessionManager.ts');
    expect(code.match(/this\.storageManager\.appendMessages\(/g)?.length).toBe(1);
    expect(code.match(/this\.storageManager\.appendMessage\(/g)).toBeNull();
    expect(code.match(/this\.storageManager\.saveConversation\(/g)).toBeNull();
  });

  test('internal funders (LTX, training, transcode) never write a chat log (D30a)', () => {
    for (const f of ['LtxManager.ts', 'TrainingManager.ts', 'TranscodeManager.ts']) {
      const code = src(f);
      const calls = [...code.matchAll(/sessionManager\.startSession\(\{([\s\S]*?)\}\)/g)];
      expect(calls.length, f).toBeGreaterThan(0);
      for (const c of calls) expect(c[1], `${f}: ${c[0].slice(0, 60)}`).toMatch(/conversationLog:\s*false/);
    }
  });
});

describe('SDK_CAPABILITIES (D22)', () => {
  test('is exported from the entry, frozen, and advertises this release\'s capabilities', () => {
    const caps = (entry as any).SDK_CAPABILITIES;
    expect(Object.isFrozen(caps)).toBe(true);
    expect(caps).toEqual({
      sealedRagStorage: true,
      sealedConversationLog: true,
      conversationLogOptOut: true,
      ragDocumentApi: true,
      ragLegacyMigration: true,
      fundedSetupErrorCarriesIds: true,
      searchIntentFromUserText: true,
      imageIntentSkipsRagTurns: true,
      ltxEntryFpsAndResolutionRule: true,
      ltxModelFromTemplate: true,
      ltxModelFamilyFromEntry: true,
      ltxProofTimeoutWindow: true,
    });
  });
});
