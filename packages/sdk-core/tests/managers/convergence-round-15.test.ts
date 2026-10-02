// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Convergence round 15 — SDK-level classes (plan §28 II1–II4, II7–II9). Every SDK here is a real instance.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ethers } from 'ethers';

vi.mock('../../src/contracts/ContractManager', () => ({ ContractManager: class { async setSigner() {} } }));
import { StorageManager } from '../../src/managers/StorageManager';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';
import { AuthManager } from '../../src/managers/AuthManager';
import { UnifiedBridgeClient } from '../../src/services/UnifiedBridgeClient';
import { reportProgress } from '../../src/storage/sealed/rag-migration';
import * as seeds from '../../src/utils/s5-seed-derivation';
import { SDKError } from '../../src/types';
import { FakeS5Network, FakeS5Tab } from '../helpers/fake-s5';
import { SEED, ADDR, sealer, encryptionManager as em } from '../helpers/sealed-fixtures';
import { realSdk } from '../helpers/sdk-instance';
import { __resetInProcessCoherenceForTests } from '../../src/storage/sealed/rag-coherence';

const tick = () => new Promise((r) => setTimeout(r, 0));
const logPath = (id: string) => `home/sessions/${ADDR}/${id}/conversation.json`;
const conversation = (id: string, messages: any[] = []) => ({
  id, messages, metadata: { model: 'm', jobId: '7', status: 'active' }, createdAt: 1, updatedAt: 1,
});
const disposed = () => new SDKError('signed out', 'STORAGE_MANAGER_DISPOSED', { retryable: false });

async function caught(p: Promise<unknown>): Promise<any> {
  try { await p; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

function sm(tab: FakeS5Tab): StorageManager {
  const s = new StorageManager();
  Object.assign(s as any, { initialized: true, s5Client: tab, userAddress: ADDR, connectionStatus: 'connected', sealer: sealer() });
  return s;
}

/** Rejections nobody handled while `run` ran (and a turn after). */
async function unhandledDuring(run: () => Promise<unknown>): Promise<unknown[]> {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => { seen.push(reason); };
  process.on('unhandledRejection', listener);
  try {
    await run();
    await new Promise((r) => setTimeout(r, 20));
  } finally {
    process.off('unhandledRejection', listener);
  }
  return seen;
}

beforeEach(() => {
  __resetInProcessCoherenceForTests();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('II1 — no console line lets anyone rebuild a seed', () => {
  /** Every 16-byte window of every hex run in `line` (spaced, colon- or dash-separated, or contiguous). */
  function candidateEntropies(line: string): Uint8Array[] {
    const out: Uint8Array[] = [];
    for (const run of line.match(/(?:[0-9a-fA-F]{2}[\s:,-]?){16,}/g) ?? []) {
      const hex = run.replace(/[^0-9a-fA-F]/g, '');
      for (let i = 0; i + 32 <= hex.length; i += 2) out.push(ethers.getBytes('0x' + hex.slice(i, i + 32)));
    }
    return out;
  }

  test('address, private key, signature and the exported entropyToS5Phrase: nothing logged rebuilds the phrase', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'info', 'warn', 'debug', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => { logged.push(args.map(String).join(' ')); });
    }
    const ls = new Map<string, string>();
    const localStorage = { getItem: (k: string) => ls.get(k) ?? null, setItem: (k: string, v: string) => { ls.set(k, v); }, removeItem: (k: string) => { ls.delete(k); } };
    vi.stubGlobal('window', { localStorage });
    vi.stubGlobal('localStorage', localStorage);
    const wallet = ethers.Wallet.createRandom();
    const derived = [
      await seeds.generateS5SeedFromAddress(wallet.address, 84532),
      await seeds.generateS5SeedFromPrivateKey(wallet.privateKey),
      await seeds.getOrGenerateS5Seed(wallet, true),
      seeds.entropyToS5Phrase(ethers.randomBytes(16)),
    ];
    const rebuilt = logged.flatMap((line) => candidateEntropies(line).map((e) => seeds.entropyToS5Phrase(e)));
    expect(rebuilt.filter((phrase) => derived.includes(phrase))).toEqual([]);
    const prefixes = derived.map((seed) => seed.split(' ').slice(0, 3).join(' '));
    expect(logged.filter((line) => prefixes.some((p) => line.includes(p)))).toEqual([]);
  });
});

describe('II2 — an async onProgress that rejects, through sdk.migrateToSealedStorage', () => {
  test('both sides finish, and no rejection is left unhandled', async () => {
    const net = new FakeS5Network();
    for (let i = 1; i <= 3; i++) await net.tab().fs.put(logPath(String(i)), conversation(String(i), [{ role: 'user', content: `q${i}`, timestamp: 1 }]));
    const rag = {
      dispose: async () => {},
      migrateLegacyRagStorage: async (o: any) => {
        reportProgress(o.onProgress, { phase: 'rag', done: 1, total: 1, item: 'kb' });
        return { databases: [{ name: 'kb', status: 'migrated' }] };
      },
    };
    const s = realSdk({ authenticated: true, vectorRAGManager: rag, storageManager: sm(net.tab()), vectorRAGReady: Promise.resolve() });
    let result: any;
    const unhandled = await unhandledDuring(async () => {
      result = await s.migrateToSealedStorage({ onProgress: async () => { throw new Error('UI state update failed'); } });
    });
    expect(result.logs).toMatchObject({ sealed: 3, failed: [] });
    expect(unhandled).toEqual([]);
  });
});

describe('II3/II4 — every session-group storage step stops on a disposal and says so', () => {
  function refusing() {
    const state = { refuse: false };
    const guard = async () => { if (state.refuse) throw disposed(); };
    const storage = {
      save: async () => guard(),
      load: async () => { await guard(); throw new Error('not found'); },
      loadAll: async () => { await guard(); return []; },
      delete: async () => {},
    };
    return { state, storage };
  }

  async function withChat() {
    const { state, storage } = refusing();
    const groups = new SessionGroupManager(storage as any);
    const group = await groups.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
    const chat = await groups.startChatSession(group.id, 'hello');
    return { state, groups, group, chat };
  }

  for (const [site, run] of [
    ['createSessionGroup', async () => {
      const { state, storage } = refusing(); state.refuse = true;
      return new SessionGroupManager(storage as any).createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
    }],
    ['listSessionGroups', async () => {
      const { state, storage } = refusing(); state.refuse = true;
      return new SessionGroupManager(storage as any).listSessionGroups(ADDR);
    }],
    ['getSessionGroup (not cached)', async () => {
      const { state, storage } = refusing(); state.refuse = true;
      return new SessionGroupManager(storage as any).getSessionGroup('sg-1', ADDR);
    }],
    ['startChatSession', async () => {
      const { state, storage } = refusing();
      const groups = new SessionGroupManager(storage as any);
      const group = await groups.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
      state.refuse = true;
      return groups.startChatSession(group.id, 'hello');
    }],
    ['getChatSessionsBulk (not cached)', async () => {
      const { state, storage } = refusing(); state.refuse = true;
      return new SessionGroupManager(storage as any).getChatSessionsBulk('sg-1', ['sess-1'], ADDR);
    }],
    ['getChatSession (not cached)', async () => {
      const { state, storage } = refusing(); state.refuse = true;
      return new SessionGroupManager(storage as any).getChatSession('sg-1', 'sess-1', ADDR);
    }],
    ['addMessage', async () => {
      const { state, groups, group, chat } = await withChat(); state.refuse = true;
      return groups.addMessage(group.id, chat.sessionId, { role: 'user', content: 'x', timestamp: 1 } as any);
    }],
    ['deleteChatSession', async () => {
      const { state, groups, group, chat } = await withChat(); state.refuse = true;
      return groups.deleteChatSession(group.id, chat.sessionId);
    }],
    ['SessionGroupStorage.loadAll (a group in the listing)', async () => {
      const s5Client = { fs: { list: async function* () { yield { type: 'file', name: 'sg-1.json' }; } } };
      const store = { getWithRetry: async () => { throw disposed(); } };
      return new SessionGroupStorage(s5Client, SEED, ADDR, em(), store as any).loadAll();
    }],
  ] as const) {
    test(`${site}: rejects STORAGE_MANAGER_DISPOSED — never a resolved "nothing" or a cache fallback`, async () => {
      expect(await caught((run as () => Promise<unknown>)())).toMatchObject({ code: 'STORAGE_MANAGER_DISPOSED' });
    });
  }

  test('a disposal during addMessage keeps what the calls in flight read: both messages, asked for before it, are saved', async () => {
    let open!: () => void;
    let gate: Promise<void> = Promise.resolve();
    const saved: string[][] = [];
    const storage = {
      save: async (g: any) => { const snapshot = Object.values(g.chatSessionsData ?? {}).flatMap((s: any) => s.messages.map((m: any) => m.content)); await gate; saved.push(snapshot); },
      load: async () => { throw new Error('not found'); }, loadAll: async () => [], delete: async () => {},
    };
    const groups = new SessionGroupManager(storage as any);
    const group = await groups.createSessionGroup({ name: 'g', description: '', owner: ADDR } as any);
    const chat = await groups.startChatSession(group.id, 'hello');
    gate = new Promise<void>((r) => { open = r; });
    const q = groups.addMessage(group.id, chat.sessionId, { role: 'user', content: 'Q', timestamp: 1 } as any);
    const a = groups.addMessage(group.id, chat.sessionId, { role: 'assistant', content: 'A', timestamp: 2 } as any);
    await tick();
    groups.dispose();
    open();
    await Promise.all([q, a]);
    expect(saved.at(-1)).toEqual(['Q', 'A']);
  });
});

describe('II7 — a kept AuthManager refuses with a code', () => {
  test('after a sign-out its getters throw NOT_AUTHENTICATED, not retryable', async () => {
    const held = new AuthManager({ getAddress: async () => ADDR } as any, {} as any, ADDR, SEED);
    const s = realSdk({ authenticated: true, authManager: held });
    await s.disconnect();
    for (const read of [() => held.getS5Seed(), () => held.getSigner(), () => held.getUserAddress()]) {
      expect(read).toThrow(expect.objectContaining({ code: 'NOT_AUTHENTICATED', details: expect.objectContaining({ retryable: false }) }));
    }
  });
});

describe('II8/II9 — a failed bridge connect closes what it opened, and says why', () => {
  function bridgeWith(proof: () => Promise<void>, health: () => Promise<{ healthy: boolean }> = async () => ({ healthy: true })) {
    const bridge = new UnifiedBridgeClient({ bridgeUrl: 'http://bridge.invalid' } as any);
    const p2p = { connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}) };
    Object.assign(bridge as any, { checkHealth: health, p2pClient: p2p, proofClient: { connect: proof, isAvailable: () => true }, startHealthMonitoring: vi.fn() });
    return { bridge, p2p };
  }

  test('a proof step that fails: the P2P socket it opened is closed; the error carries its cause and verdict', async () => {
    const { bridge, p2p } = bridgeWith(async () => { throw new Error('proof service down'); });
    expect(await caught(bridge.connect())).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { message: 'proof service down' }, retryable: true } });
    expect(p2p.disconnect).toHaveBeenCalledTimes(1);
  });

  test('superseded by a disconnect, then the proof step fails: still closed — and BRIDGE_CLOSED is not retryable', async () => {
    let fail!: () => void;
    const { bridge, p2p } = bridgeWith(() => new Promise<void>((_r, f) => { fail = () => f(new Error('proof service down')); }));
    const connecting = bridge.connect().catch((e: unknown) => e);
    await tick();
    await bridge.disconnect();
    fail();
    expect(await connecting).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED' });
    expect(p2p.disconnect).toHaveBeenCalled();                        // closed (since §32 MM3 at the sign-out itself)
    const { bridge: other } = bridgeWith(async () => {});
    let healthy!: () => void;
    (other as any).checkHealth = () => new Promise((r) => { healthy = () => r({ healthy: true }); });
    const superseded = other.connect().catch((e: unknown) => e);
    await tick();
    await other.disconnect();
    healthy();
    expect(await superseded).toMatchObject({ code: 'BRIDGE_CONNECTION_FAILED', details: { cause: { code: 'BRIDGE_CLOSED' }, retryable: false } });
  });
});
