/**
 * Phase 4 — shard splitter, manifests, jsonl-text-v1 (§D.1/D.2/D.3, §C.2, §C.6) at v0.3.8.
 * D.1's zero-remainder clause (added v0.3.8 at our request) is pinned explicitly: a defensive
 * implementation that tests the modulo BEFORE testing for zero is correct on every input but
 * that one, which is the worst possible failure shape.
 */
import { describe, it, expect } from 'vitest';
import {
  SHARD_PLAINTEXT_MAX_BYTES, AEAD_CHUNK_BYTES, splitShardSizes, splitShards, reassembleShards,
  validateJsonlTextV1, canonicaliseManifest, manifestSha256, verifyPlausibility,
} from '../../src/utils/training-shard';

const MAX = 25_161_728;
const CHUNK = 262_144;
const sizes = (n: number) => splitShardSizes(n);
// `toEqual` on a 25 MB typed array builds an element-by-element diff and effectively hangs,
// so byte equality over the large fixtures goes through this instead.
const bytesEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

describe('the shard constant (D.1)', () => {
  it('is 25,161,728 and is deliberately NOT a chunk multiple', () => {
    expect(SHARD_PLAINTEXT_MAX_BYTES).toBe(25_161_728);
    expect(AEAD_CHUNK_BYTES).toBe(262_144);
    expect(SHARD_PLAINTEXT_MAX_BYTES % AEAD_CHUNK_BYTES).not.toBe(0);
    // 24 MiB (25,165,824) IS an exact multiple — it was the v0.1 constant and the pinned
    // scheme refuses to encrypt OR fetch such a blob. Rounding to a "nicer" number reinstates it.
    expect(25_165_824 % AEAD_CHUNK_BYTES).toBe(0);
  });
});

describe('splitShardSizes (D.1) — cut at exactly MAX, last absorbs, shift on a chunk multiple', () => {
  it('cuts at exactly MAX with the remainder as the final shard', () => {
    expect(sizes(MAX + 1)).toEqual([MAX, 1]);
    expect(sizes(18_900_000)).toEqual([18_900_000]);           // D.2's own example
  });
  it('ZERO REMAINDER is NOT the exception case (D.1 clause, v0.3.8)', () => {
    // Zero IS arithmetically a multiple of 262,144, so a modulo test written before a zero
    // test emits (0-1) = -1. An input dividing evenly yields N/MAX shards and NO remainder shard.
    expect(sizes(MAX)).toEqual([MAX]);
    expect(sizes(2 * MAX)).toEqual([MAX, MAX]);
    expect(sizes(3 * MAX)).toEqual([MAX, MAX, MAX]);
  });
  it('shifts when the remainder IS an exact chunk multiple: (r-1) then a 1-byte shard', () => {
    expect(sizes(MAX + CHUNK)).toEqual([MAX, CHUNK - 1, 1]);
    expect(sizes(CHUNK)).toEqual([CHUNK - 1, 1]);
    expect(sizes(2 * CHUNK)).toEqual([2 * CHUNK - 1, 1]);
  });
  it('never emits a shard that is an exact chunk multiple, zero, or over MAX', () => {
    const totals = [1, 2, CHUNK - 1, CHUNK, CHUNK + 1, MAX - 1, MAX, MAX + 1, MAX + CHUNK,
      2 * MAX, 2 * MAX + CHUNK, 3 * MAX - 1, 167_772_160, 18_900_000, 268_435_456];
    for (const n of totals) {
      const s = sizes(n);
      expect(s.reduce((a, b) => a + b, 0), `sum ${n}`).toBe(n);
      for (const x of s) {
        expect(x % CHUNK, `chunk multiple in ${n}`).not.toBe(0);
        expect(x, `size in ${n}`).toBeGreaterThan(0);
        expect(x, `size in ${n}`).toBeLessThanOrEqual(MAX);
      }
    }
  });
  it('puts a non-MAX shard only in the last one or two positions', () => {
    for (const n of [MAX + CHUNK, 2 * MAX + CHUNK, 3 * MAX + 7]) {
      const s = sizes(n);
      const nonMax = s.map((x, i) => (x === MAX ? -1 : i)).filter((i) => i >= 0);
      for (const i of nonMax) expect(i, `total ${n}`).toBeGreaterThanOrEqual(s.length - 2);
    }
  });
  it('a 1-byte trailing shard arises by TWO routes and does not identify the branch', () => {
    expect(sizes(MAX + 1)).toEqual([MAX, 1]);                  // natural: r === 1
    expect(sizes(MAX + CHUNK)).toEqual([MAX, CHUNK - 1, 1]);   // shifted
  });
  it('rejects a zero-byte, negative or fractional size with a C.4-MAPPED error', () => {
    // A bare `toThrow()` accepts `throw new Error('bad')`, which reaches a caller's mapper as
    // an unknown error and flattens to TRAIN_FAILED — i.e. reads as retryable. C.4 requires
    // VALIDATION_FAILED + datasetFormat, and it was asserted for the jsonl validator but never
    // for the splitter.
    for (const n of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      try { sizes(n); expect.unreachable(); } catch (e) {
        expect((e as { code: string }).code, String(n)).toBe('VALIDATION_FAILED');
        expect((e as { detail: { reason: string } }).detail.reason, String(n)).toBe('datasetFormat');
      }
    }
  });
});

describe('splitShards / reassembleShards — boundaries are free', () => {
  it('round-trips byte-identically ACROSS real boundaries, shift branch included', () => {
    // MAX + CHUNK is the smallest fixture exercising three shards AND the shift in one buffer.
    // Anything under MAX cannot fail this: `return [input]` passes it. (The original fixture
    // here was 786,509 bytes — a single shard — so it tested nothing it claimed to.)
    const data = new Uint8Array(MAX + CHUNK);
    for (let i = 0; i < data.length; i++) data[i] = (i * 31 + 7) & 0xff;
    const parts = splitShards(data);
    expect(parts.map((p) => p.length)).toEqual([MAX, CHUNK - 1, 1]);
    expect(bytesEqual(reassembleShards(parts), data)).toBe(true);
  });
  it('cuts mid-codepoint without complaint (a reader must concatenate BEFORE decoding)', () => {
    const unit = new TextEncoder().encode('{"text":"ééé"}\n'); // 18 bytes; each é is two
    const text = new Uint8Array(MAX + 1000);
    for (let i = 0; i < text.length; i++) text[i] = unit[i % unit.length];
    const parts = splitShards(text);
    expect(parts.map((p) => p.length)).toEqual([MAX, 1000]);
    // MAX-1 lands on unit[13] = 0xC3 and MAX on unit[14] = 0xA9 — the cut is INSIDE an é.
    expect(parts[0][MAX - 1]).toBe(0xc3);
    expect(parts[1][0]).toBe(0xa9);
    expect(bytesEqual(reassembleShards(parts), text)).toBe(true);
  });
});

describe('jsonl-text-v1 validation (C.2)', () => {
  const ok = '{"text":"a"}\n{"text":"b"}';
  it('accepts the pinned shape, with a trailing newline optional', () => {
    expect(() => validateJsonlTextV1(ok)).not.toThrow();
    expect(validateJsonlTextV1(`${ok}\n`).samples).toBe(2);
  });
  it('rejects a BOM, a blank line, and an empty string value', () => {
    expect(() => validateJsonlTextV1('﻿{"text":"a"}')).toThrow(/BOM/i);
    expect(() => validateJsonlTextV1('{"text":"a"}\n\n{"text":"b"}')).toThrow(/blank/i);
    expect(() => validateJsonlTextV1('{"text":""}')).toThrow(/non-empty/i);
  });
  it('rejects EXTRA keys — the first thing anyone adds to a training set', () => {
    expect(() => validateJsonlTextV1('{"text":"a","id":1}')).toThrow(/exactly/i);
    expect(() => validateJsonlTextV1('{"label":"a"}')).toThrow(/exactly/i);
  });
  it('rejects CRLF — the doc is SILENT, and rejecting is the safe direction', () => {
    // A CR is JSON whitespace, so `{"text":"a"}\r` parses clean and slips through. But the CR
    // byte is counted into totalBytes and hashed into the shard, so a node that strips it
    // recounts differently — DECLARED_TOKENS_MISMATCH, post-escrow, on a funded session.
    expect(() => validateJsonlTextV1('{"text":"a"}\r\n{"text":"b"}')).toThrow(/LF-only|CR/i);
  });
  it('rejects a non-object line and a non-string value', () => {
    expect(() => validateJsonlTextV1('["a"]')).toThrow();
    expect(() => validateJsonlTextV1('{"text":5}')).toThrow();
    expect(() => validateJsonlTextV1('not json')).toThrow();
  });
  it('throws a VALIDATION_FAILED-mapped error carrying detail.reason datasetFormat (C.4)', () => {
    // A malformed dataset must NEVER surface as a moderation hold: the pipeline never ran.
    try { validateJsonlTextV1('{"text":""}'); expect.unreachable(); } catch (e) {
      expect((e as { code: string }).code).toBe('VALIDATION_FAILED');
      expect((e as { detail: { reason: string } }).detail.reason).toBe('datasetFormat');
    }
  });
});

describe('manifest canonicalisation (D.2) — the stored bytes ARE the canonical form', () => {
  const m = { schema: 'dataset-manifest-v1', samples: 2, declaredTokens: 9, shards: [{ b: 1, a: 2 }] };
  it('sorts keys, uses compact separators, and emits UTF-8', () => {
    const bytes = canonicaliseManifest(m);
    const s = new TextDecoder().decode(bytes);
    expect(s).toBe('{"declaredTokens":9,"samples":2,"schema":"dataset-manifest-v1","shards":[{"a":2,"b":1}]}');
    expect(s).not.toContain(' ');
  });
  it('hashes the EXACT stored bytes and never re-canonicalises on read', () => {
    const bytes = canonicaliseManifest(m);
    expect(manifestSha256(bytes)).toMatch(/^0x[0-9a-f]{64}$/);
    // A parse -> re-serialise round trip before hashing breaks verification even when the
    // object is identical in spirit. Hash what was fetched, not what it re-serialises to.
    const pretty = new TextEncoder().encode(JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)), null, 2));
    expect(manifestSha256(pretty)).not.toBe(manifestSha256(bytes));
  });
  it('PRESERVES array order — sorting `shards` would corrupt D.1 reassembly', () => {
    // The single-element fixture above cannot catch a canonicaliser that sorts arrays too.
    // Shard order IS the dataset: D.1 reassembly is concatenation in manifest order.
    // The primitive array is what makes this bite. An array of OBJECTS cannot: bare `.sort()`
    // stringifies every element to "[object Object]", compares them equal, and a stable sort
    // leaves them in place — so an object-only fixture passes against a canonicaliser that
    // does sort arrays. Both shapes are pinned; only the first one fails the naive mutant.
    const out = new TextDecoder().decode(
      canonicaliseManifest({ order: ['b', 'a'], shards: [{ cid: 'uB' }, { cid: 'uA' }] }),
    );
    expect(out).toBe('{"order":["b","a"],"shards":[{"cid":"uB"},{"cid":"uA"}]}');
  });
  it('key order in the source object does not change the bytes', () => {
    expect(canonicaliseManifest({ b: 1, a: 2 })).toEqual(canonicaliseManifest({ a: 2, b: 1 }));
  });
});

describe('C.6 plausibility pre-check — free client-side, and it fails BEFORE escrow', () => {
  it('applies totalBytes <= declaredTokens x 8', () => {
    expect(verifyPlausibility({ totalBytes: 80, declaredTokens: 10 }).ok).toBe(true);
    expect(verifyPlausibility({ totalBytes: 81, declaredTokens: 10 }).ok).toBe(false);
  });
  it('catches the short-sample case the node agreed is uncomfortably tight', () => {
    // One escaped control char: 18 bytes / 2 tokens = 9.0. Legal jsonl-text-v1, fails the gate.
    // Checking it here costs nothing and turns a burned funded session into a local error.
    expect(verifyPlausibility({ totalBytes: 18, declaredTokens: 2 }).ok).toBe(false);
    expect(verifyPlausibility({ totalBytes: 16, declaredTokens: 2 }).ok).toBe(true); // emoji, exactly 8.0
  });
});
