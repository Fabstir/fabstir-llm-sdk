// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StorageManager.store() Encryption Tests — SECURITY REGRESSION
 *
 * Reported by the node team against 1.32.1: `store(data, { encrypt: true })`
 * recorded `metadata.encrypted = true` and then uploaded the payload in
 * plaintext, because it never passed `options.encryption` through to FS5.put().
 *
 * WHY THIS GAP SURVIVED, AND HOW THESE TESTS CLOSE IT:
 * FS5.put() performs the encryption *internally* (XChaCha20-Poly1305) — the
 * plaintext blob is what gets handed to it. So at the mock boundary the data
 * argument is plaintext whether or not encryption is on, and NO assertion on
 * the uploaded payload (or on a store->retrieve round-trip, which passes
 * either way) can distinguish the two branches.
 *
 * The only observable that separates them is the CALL ITSELF:
 *     expect(putOptions?.encryption).toBeDefined()
 *
 * Every test below therefore asserts on the arguments handed to fs.put(),
 * never on the returned value.
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { ethers } from 'ethers';
import { StorageManager } from '../../src/managers/StorageManager';
import 'fake-indexeddb/auto';

// Mock S5.js.
// NOTE: the specifier MUST be '@julesl23/s5js' — that is what StorageManager.initialize()
// dynamically imports. The older suites in this directory still mock '@s5-dev/s5js', a stale
// alias, so their mock never applies and Vite cannot resolve the stub package; those files
// collect ZERO tests. That is the root cause of how the plaintext-upload bug shipped.
vi.mock('@julesl23/s5js', () => ({
  S5: {
    create: vi.fn().mockResolvedValue({
      recoverIdentityFromSeedPhrase: vi.fn().mockResolvedValue(undefined),
      registerOnNewPortal: vi.fn().mockResolvedValue(undefined),
      fs: {
        ensureIdentityInitialized: vi.fn().mockResolvedValue(undefined),
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        getMetadata: vi.fn().mockResolvedValue({ cid: 'mock-cid' }),
        delete: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockReturnValue({
          async *[Symbol.asyncIterator]() {}
        })
      }
    })
  }
}));

/** FS5.put(path, data, options) — pull the options argument off the recorded call. */
function putCall(mockS5Client: any, callIndex = 0) {
  const call = mockS5Client.fs.put.mock.calls[callIndex];
  if (!call) throw new Error('fs.put was never called');
  return { path: call[0] as string, data: call[1] as any, options: call[2] as any };
}

describe('StorageManager.store() encryption (security regression)', () => {
  let storageManager: StorageManager;
  let wallet: ethers.Wallet;
  let mockS5Client: any;

  beforeEach(async () => {
    wallet = ethers.Wallet.createRandom();
    storageManager = new StorageManager();
    await storageManager.initialize('test seed phrase for store encryption', wallet.address);
    mockS5Client = (storageManager as any).s5Client;
    mockS5Client.fs.put.mockClear();
  });

  describe('encryption is actually requested from FS5', () => {
    test('store({ encrypt: true }) passes options.encryption to fs.put', async () => {
      await storageManager.store({ secret: 'classified' }, { encrypt: true });

      const { options } = putCall(mockS5Client);
      // THE assertion the old suite was missing. Pre-fix this is `undefined`.
      expect(options?.encryption).toBeDefined();
    });

    test('encryption is the DEFAULT — omitting the flag must fail safe, not fail open', async () => {
      await storageManager.store({ secret: 'classified' });

      const { options } = putCall(mockS5Client);
      expect(options?.encryption).toBeDefined();
    });

    test('binary payloads (e.g. video clips) are encrypted too', async () => {
      const clip = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]); // mp4 ftyp
      await storageManager.store(clip);

      const { options } = putCall(mockS5Client);
      expect(options?.encryption).toBeDefined();
    });
  });

  describe('explicit opt-out', () => {
    test('store({ encrypt: false }) uploads plaintext (no encryption option)', async () => {
      await storageManager.store({ public: 'data' }, { encrypt: false });

      const { options } = putCall(mockS5Client);
      expect(options?.encryption).toBeUndefined();
    });
  });

  describe('metadata must not lie about what happened', () => {
    test('metadata.encrypted is true when encryption was actually requested', async () => {
      await storageManager.store({ secret: 'x' }, { encrypt: true });

      const { data, options } = putCall(mockS5Client);
      // The recorded boolean and the real behaviour must agree.
      expect(data.metadata.encrypted).toBe(!!options?.encryption);
      expect(data.metadata.encrypted).toBe(true);
    });

    test('metadata.encrypted is false when the caller opted out', async () => {
      await storageManager.store({ public: 'x' }, { encrypt: false });

      const { data, options } = putCall(mockS5Client);
      expect(data.metadata.encrypted).toBe(!!options?.encryption);
      expect(data.metadata.encrypted).toBe(false);
    });
  });

  describe('namespace', () => {
    test('store() defaults into the conversations namespace (documented legacy behaviour)', async () => {
      await storageManager.store({ a: 1 });

      const { path } = putCall(mockS5Client);
      expect(path).toContain('home/conversations');
    });

    test('an explicit path keeps non-conversation data out of the conversations namespace', async () => {
      await storageManager.store(new Uint8Array([1, 2, 3]), {
        path: 'home/platformless/clips/job-42.mp4'
      });

      const { path } = putCall(mockS5Client);
      expect(path).toBe('home/platformless/clips/job-42.mp4');
      expect(path).not.toContain('home/conversations');
    });

    test('an explicit path is still encrypted by default', async () => {
      await storageManager.store(new Uint8Array([1, 2, 3]), {
        path: 'home/platformless/clips/job-42.mp4'
      });

      const { options } = putCall(mockS5Client);
      expect(options?.encryption).toBeDefined();
    });
  });
});
