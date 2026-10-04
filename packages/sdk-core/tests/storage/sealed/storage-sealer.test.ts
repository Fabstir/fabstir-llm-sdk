// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 1 — the storage sealer (IMPLEMENTATION-CONFIDENTIAL-RAG-STORAGE D1-D5).
 *
 * Everything the SDK writes to S5 for RAG and the conversation log goes through this envelope:
 * FF 53 45 4C | version | kind | nonce(24) | XChaCha20-Poly1305(body) | tag(16),
 * AAD = the six header bytes ‖ a context string that names the file's role.
 */

import { describe, test, expect } from 'vitest';
import { encode, decode } from 'cbor-x';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { EncryptionManager } from '../../../src/managers/EncryptionManager';
import {
  createStorageSealer,
  SEAL_OVERHEAD,
  type StorageSealer,
} from '../../../src/storage/sealed/StorageSealer';

const SEED_A = 'assume ego assume ego assume ego assume ego assume ego assume ego admit size total';
const SEED_B = 'abandon ability able about above absent absorb abstract absurd abuse access accident acid acoustic acquire';
const ADDR = '0x000000000000000000000000000000000000dEaD';
/** The address raw sealers are bound to (plan §19 Z8). */
const OWNER = ADDR;

function rootKey(fill: number): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function sealer(fill = 7): StorageSealer {
  return createStorageSealer(rootKey(fill), OWNER);
}

function expectOpenFails(fn: () => unknown) {
  let caught: any;
  try { fn(); } catch (e) { caught = e; }
  expect(caught, 'open must throw').toBeDefined();
  expect(caught.code).toBe('SEALED_OPEN_FAILED');
}

const manifest = () => ({
  name: 'divorce-lawyer-notes',
  owner: ADDR,
  description: undefined,
  vectorCount: 3,
  chunks: [{ chunkId: 0, cid: 'x', vectorCount: 3, sizeBytes: 0, updatedAt: 1 }],
  pendingDocuments: [{ id: 'doc-1', fileName: 'custody-plan.pdf', size: 1234 }],
  folderPaths: ['/private'],
});

describe('StorageSealer — round trips', () => {
  test('cbor payload round-trips to an equal value', () => {
    const s = sealer();
    const value = manifest();
    const opened = s.open(s.seal({ kind: 'cbor', value }, 'rag/v1/db/manifest'), 'rag/v1/db/manifest');
    expect(opened.kind).toBe('cbor');
    expect(opened.value).toEqual(value);
  });

  test('text payload round-trips exactly, including strings s5js get() would corrupt', () => {
    const s = sealer();
    for (const text of ['cats', '42', '7', '', 'naïve – ✓ 🙂']) {
      const opened = s.open(s.seal({ kind: 'text', value: text }, 'ctx'), 'ctx');
      expect(opened).toEqual({ kind: 'text', value: text });
    }
  });

  test('bytes payload round-trips byte-exact', () => {
    const s = sealer();
    const bytes = new Uint8Array([0, 255, 0x63, 0x61, 0x74, 0x73, 0xff, 0xfe]);
    const opened = s.open(s.seal({ kind: 'bytes', value: bytes }, 'ctx'), 'ctx');
    expect(opened.kind).toBe('bytes');
    expect(Array.from(opened.value as Uint8Array)).toEqual(Array.from(bytes));
  });

  test('two seals of the same payload differ (fresh nonce each time)', () => {
    const s = sealer();
    const a = s.seal({ kind: 'text', value: 'same' }, 'ctx');
    const b = s.seal({ kind: 'text', value: 'same' }, 'ctx');
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(Buffer.from(a.subarray(6, 30)).equals(Buffer.from(b.subarray(6, 30)))).toBe(false);
  });
});

describe('StorageSealer — envelope layout', () => {
  test('header is FF 53 45 4C, version 01, then the kind byte', () => {
    const s = sealer();
    expect(Array.from(s.seal({ kind: 'cbor', value: 1 }, 'c').subarray(0, 6))).toEqual([0xff, 0x53, 0x45, 0x4c, 1, 1]);
    expect(s.seal({ kind: 'text', value: 'x' }, 'c')[5]).toBe(2);
    expect(s.seal({ kind: 'bytes', value: new Uint8Array(1) }, 'c')[5]).toBe(3);
  });

  test('overhead is exactly 46 bytes (6 header + 24 nonce + 16 tag)', () => {
    expect(SEAL_OVERHEAD).toBe(46);
    const s = sealer();
    for (const n of [0, 1, 1000]) {
      expect(s.seal({ kind: 'bytes', value: new Uint8Array(n) }, 'c').length).toBe(n + 46);
    }
  });

  test('isSealed recognises envelopes and rejects plaintext of every legacy shape', () => {
    const s = sealer();
    expect(s.isSealed(s.seal({ kind: 'cbor', value: manifest() }, 'c'))).toBe(true);
    expect(s.isSealed(new Uint8Array(encode(manifest())))).toBe(false);
    expect(s.isSealed(new TextEncoder().encode(JSON.stringify(manifest())))).toBe(false);
    expect(s.isSealed(new TextEncoder().encode('cats'))).toBe(false);
    expect(s.isSealed(new Uint8Array([0xff, 0x53, 0x45, 0x4c, 1, 1]))).toBe(false); // too short to be an envelope
    expect(s.isSealed(new Uint8Array([0xff, 0x53, 0x45, 0x4c, 9, 1, ...new Uint8Array(40)]))).toBe(false); // unknown version
    expect(s.isSealed(new Uint8Array([0x00, 0x53, 0x45, 0x4c, 1, 1, ...new Uint8Array(40)]))).toBe(false); // wrong magic, right version
  });
});

describe('StorageSealer — authentication', () => {
  test('a different context string fails authentication', () => {
    const s = sealer();
    const sealed = s.seal({ kind: 'cbor', value: manifest() }, 'rag/v1/aaaa/chunk/0');
    expectOpenFails(() => s.open(sealed, 'rag/v1/aaaa/chunk/1'));
  });

  test('flipping any single byte (header, nonce, ciphertext, tag) fails', () => {
    const s = sealer();
    const sealed = s.seal({ kind: 'text', value: 'confidential chunk text' }, 'ctx');
    for (let i = 0; i < sealed.length; i++) {
      const tampered = new Uint8Array(sealed);
      tampered[i] ^= 0x01;
      expectOpenFails(() => s.open(tampered, 'ctx'));
    }
  });

  test('a truncated envelope fails', () => {
    const s = sealer();
    const sealed = s.seal({ kind: 'text', value: 'x' }, 'ctx');
    expectOpenFails(() => s.open(sealed.subarray(0, sealed.length - 1), 'ctx'));
    expectOpenFails(() => s.open(sealed.subarray(0, 20), 'ctx'));
  });

  test('plaintext bytes are never "opened" as if they were sealed', () => {
    const s = sealer();
    expectOpenFails(() => s.open(new Uint8Array(encode(manifest())), 'ctx'));
  });

  test("another root key cannot open the envelope", () => {
    const sealed = sealer(7).seal({ kind: 'text', value: 'secret' }, 'ctx');
    expectOpenFails(() => sealer(8).open(sealed, 'ctx'));
  });
});

describe('StorageSealer — never touches its inputs', () => {
  test('seal leaves the source bytes unchanged', () => {
    const s = sealer();
    const src = new Uint8Array([1, 2, 3, 4]);
    s.seal({ kind: 'bytes', value: src }, 'ctx');
    expect(Array.from(src)).toEqual([1, 2, 3, 4]);
  });

  test('open leaves the envelope unchanged and returns bytes that do not alias it', () => {
    // s5js serves a just-uploaded blob by reference from its cache — the result must be a copy.
    const s = sealer();
    const sealed = s.seal({ kind: 'bytes', value: new Uint8Array([9, 9, 9]) }, 'ctx');
    const before = new Uint8Array(sealed);
    const opened = s.open(sealed, 'ctx').value as Uint8Array;
    opened[0] = 0;
    expect(Array.from(sealed)).toEqual(Array.from(before));
    expect(opened.buffer === sealed.buffer).toBe(false);
  });
});

describe('StorageSealer — defeats s5js get() format guessing (plan §2.3)', () => {
  test('no envelope decodes as CBOR, JSON or strict UTF-8', () => {
    const s = sealer();
    const utf8 = new TextDecoder('utf-8', { fatal: true });
    for (let i = 0; i < 2000; i++) {
      const sealed = s.seal({ kind: 'bytes', value: crypto.getRandomValues(new Uint8Array(i % 200)) }, 'ctx');
      expect(() => decode(sealed)).toThrow();
      expect(() => JSON.parse(new TextDecoder().decode(sealed))).toThrow();
      expect(() => utf8.decode(sealed)).toThrow();
    }
  });
});

describe('StorageSealer — opaque ids (D6)', () => {
  test('deriveId is deterministic, 32 lowercase hex chars', () => {
    const s = sealer();
    const id = s.deriveId('db', 'divorce-lawyer-notes');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(sealer().deriveId('db', 'divorce-lawyer-notes')).toBe(id);
  });

  test('labels, inputs and root keys all separate the id space', () => {
    const s = sealer();
    const ids = new Set([
      s.deriveId('db', 'x'),
      s.deriveId('doc', 'x'),
      s.deriveId('db', 'y'),
      sealer(8).deriveId('db', 'x'),
    ]);
    expect(ids.size).toBe(4);
  });

  test('the id never contains the input', () => {
    expect(sealer().deriveId('db', 'abc')).not.toContain('abc');
  });
});

describe('StorageSealer — size (request §1 "seal binary, not JSON")', () => {
  test('a small manifest seals to at most its CBOR size + 64 bytes', () => {
    const value = manifest();
    const cborSize = encode(value).length;
    expect(sealer().seal({ kind: 'cbor', value }, 'ctx').length).toBeLessThanOrEqual(cborSize + 64);
  });

  test('a 10 000 × 384 vector chunk seals within 1.1× its CBOR size', () => {
    const vectors = Array.from({ length: 10000 }, (_, i) => ({
      id: `doc-${i}`,
      vector: Array.from({ length: 384 }, () => Math.random() * 2 - 1),
      metadata: { text: 'chunk text '.repeat(40), documentId: 'doc-1' },
    }));
    const value = { chunkId: 0, vectors };
    const cborSize = encode(value).length;
    const sealed = sealer().seal({ kind: 'cbor', value }, 'rag/v1/db/chunk/0');
    expect(sealed.length).toBeLessThanOrEqual(Math.ceil(cborSize * 1.1));
  }, 60000);
});

describe('EncryptionManager.getStorageSealer (D2)', () => {
  test('is memoised per manager', () => {
    const em = EncryptionManager.fromSeed(SEED_A, ADDR);
    expect(em.getStorageSealer()).toBe(em.getStorageSealer());
  });

  test('the same seed in two managers (two tabs) derives the same key and ids', () => {
    const a = EncryptionManager.fromSeed(SEED_A, ADDR).getStorageSealer();
    const b = EncryptionManager.fromSeed(SEED_A, ADDR).getStorageSealer();
    expect(b.open(a.seal({ kind: 'text', value: 'hello' }, 'ctx'), 'ctx').value).toBe('hello');
    expect(b.deriveId('db', 'x')).toBe(a.deriveId('db', 'x'));
  });

  test('a different seed can neither open nor reproduce ids', () => {
    const a = EncryptionManager.fromSeed(SEED_A, ADDR).getStorageSealer();
    const b = EncryptionManager.fromSeed(SEED_B, ADDR).getStorageSealer();
    expectOpenFails(() => b.open(a.seal({ kind: 'text', value: 'hello' }, 'ctx'), 'ctx'));
    expect(b.deriveId('db', 'x')).not.toBe(a.deriveId('db', 'x'));
  });

  test('the AEAD key is HKDF-derived — the raw private key does not decrypt the envelope', () => {
    const em = EncryptionManager.fromSeed(SEED_A, ADDR);
    const sealed = em.getStorageSealer().seal({ kind: 'text', value: 'x' }, 'ctx');
    const priv = Uint8Array.from(Buffer.from((em as any).clientPrivateKey as string, 'hex'));
    const aad = new Uint8Array([...sealed.subarray(0, 6), ...new TextEncoder().encode('ctx')]);
    expect(() => xchacha20poly1305(priv, sealed.subarray(6, 30), aad).decrypt(sealed.subarray(30))).toThrow();
  });

  test('the sealer holds no key material on any enumerable property', () => {
    const s = EncryptionManager.fromSeed(SEED_A, ADDR).getStorageSealer();
    for (const v of Object.values(s)) expect(v instanceof Uint8Array).toBe(false);
  });

  test('the sealer is rooted at the EncryptionManager private key (D2) and nothing else', () => {
    const em = EncryptionManager.fromSeed(SEED_A, ADDR);
    const sealed = em.getStorageSealer().seal({ kind: 'text', value: 'x' }, 'ctx');
    const privHex = (em as any).clientPrivateKey as string;
    const raw = createStorageSealer(Uint8Array.from(Buffer.from(privHex, 'hex')), OWNER);
    // Same root → same derived key: this proves the root is the private key...
    expect(raw.open(sealed, 'ctx').value).toBe('x');
    // ...and a sealer rooted at a different 32 bytes (e.g. the hash of the seed) cannot.
    expectOpenFails(() => createStorageSealer(rootKey(0x11), OWNER).open(sealed, 'ctx'));
  });
});
