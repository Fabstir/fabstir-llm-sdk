/**
 * Phase 7 — `count-v1` (§C.2) at v0.3.9.
 *
 * The recipe is implemented STRICTLY from the node's shipped vectors, and against BOTH sets:
 * the 15-case frozen fixture and the 158-case differential corpus. The corpus is the condition
 * under which transformers.js was accepted for Open 7 — the fixture alone is fifteen cases of
 * byte-level BPE, which is thin cover for arbitrary customer text.
 *
 * The group that matters most is `non-bmp`. JavaScript strings are UTF-16 and Rust strings are
 * UTF-8, so every character above the BMP is ONE char to the node's counter and TWO code units
 * to ours. An implementation that walks code units instead of code points is wrong on exactly
 * those inputs and right everywhere else — it passes a small fixture and fails on any dataset
 * containing emoji.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { sha256 } from 'ethers';
import fixture from './vectors/counting-fixture.json';
import corpus from './vectors/counting-corpus-differential.json';
import {
  assertTokenizerPin, countSampleTokens, countDatasetTokens, loadTrainingTokenizer,
} from '../../src/utils/training-count';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { manifestSha256 } from '../../src/utils/training-shard';

// The 12 MB tokenizer is deliberately NOT vendored: it belongs to the TEMPLATE, not the SDK,
// and templates multiply. Point TRAINING_TOKENIZER_JSON at a copy to run the parity suites.
const TOKENIZER_PATH = process.env.TRAINING_TOKENIZER_JSON;
const parity = TOKENIZER_PATH ? describe : describe.skip;

let tokenizer: Awaited<ReturnType<typeof loadTrainingTokenizer>>;
let bytes: Uint8Array;

beforeAll(async () => {
  if (!TOKENIZER_PATH) return;
  bytes = new Uint8Array(fs.readFileSync(TOKENIZER_PATH));
  tokenizer = await loadTrainingTokenizer(bytes, fixture.tokenizerSha256);
}, 120_000);

describe('the tokenizer pin (§C.2 / D.2) — verify BEFORE counting, never after', () => {
  it('rejects bytes that do not hash to the template’s pinned tokenizerSha256', () => {
    // A wrong tokenizer produces a plausible-looking count that the node's recount rejects
    // — post-escrow. Checking the bytes costs a hash; not checking costs a funded session.
    expect(() => assertTokenizerPin(new TextEncoder().encode('not the tokenizer'), fixture.tokenizerSha256))
      .toThrow(/tokenizer/i);
  });
  it('accepts bytes that DO match, and is case-insensitive about the 0x hex', () => {
    const b = new TextEncoder().encode('x');
    const h = sha256(b);
    expect(() => assertTokenizerPin(b, h)).not.toThrow();
    expect(() => assertTokenizerPin(b, h.toUpperCase().replace('0X', '0x'))).not.toThrow();
  });
  it('a tokenizer problem is OURS, not the session\'s — and must not claim non-reshoppable', () => {
    // `sessionParams` is pinned to A.3's ON-CHAIN session-state rejects, and any pinned reason
    // makes isReshoppable() false. A wrong tokenizer file or an uninstalled npm package is
    // neither a session fact nor host-specific — reporting it as "not re-shoppable" tells a
    // caller the wrong thing about a purely local problem.
    try { assertTokenizerPin(new TextEncoder().encode('nope'), fixture.tokenizerSha256); expect.unreachable(); }
    catch (e: any) {
      expect(e.code).toBe('VALIDATION_FAILED');
      expect(e.detail?.reason).not.toBe('sessionParams');
    }
  });
  it('refuses to load a tokenizer whose bytes fail the pin — the order is the point', async () => {
    await expect(loadTrainingTokenizer(new TextEncoder().encode('junk'), fixture.tokenizerSha256))
      .rejects.toThrow(/tokenizer/i);
  });
});

// A bare `vitest run` prints only "5 skipped" — not the block's name — so the reason has to be
// written to the output explicitly. Otherwise a fresh clone silently omits the parity suites
// and nobody has any reason to go looking for why. See vectors/README.md.
if (!TOKENIZER_PATH) {
  console.warn(
    '[training] count-v1 parity SKIPPED: set TRAINING_TOKENIZER_JSON=/path/to/tokenizer.json '
    + '(sha256 0x0997f410…, see tests/training/vectors/README.md) to run the 173 parity cases.',
  );
}

parity('count-v1 parity — the node’s own vectors are the oracle', () => {
  it('matches ALL 15 cases of the frozen counting fixture (§C.2)', () => {
    expect(fixture.countingRecipe).toBe('count-v1');
    const mismatches = fixture.cases
      .map((c) => ({ ...c, got: countSampleTokens(tokenizer, c.text, fixture.specialsPerSample) }))
      .filter((c) => c.got !== c.tokens);
    expect(mismatches).toEqual([]);
    expect(fixture.cases).toHaveLength(15);
  });

  it('matches ALL 158 cases of the differential corpus, group by group', () => {
    const byGroup: Record<string, { pass: number; fail: number; examples: unknown[] }> = {};
    for (const c of corpus.cases) {
      const got = countSampleTokens(tokenizer, c.text, corpus.specialsPerSample);
      byGroup[c.group] ??= { pass: 0, fail: 0, examples: [] };
      if (got === c.tokens) byGroup[c.group].pass += 1;
      else { byGroup[c.group].fail += 1; byGroup[c.group].examples.push({ text: c.text, want: c.tokens, got }); }
    }
    const failing = Object.entries(byGroup).filter(([, r]) => r.fail > 0);
    expect(failing).toEqual([]);
    expect(corpus.cases).toHaveLength(158);
  });

  it('matches the non-BMP group specifically — the UTF-16 vs UTF-8 hazard', () => {
    // Called out separately from the group sweep above so that a regression here is legible
    // as "the astral-plane bug" rather than as one line in a table of twelve groups.
    const nonBmp = corpus.cases.filter((c) => c.group === 'non-bmp');
    expect(nonBmp.length).toBeGreaterThanOrEqual(20);
    for (const c of nonBmp) {
      expect(countSampleTokens(tokenizer, c.text, corpus.specialsPerSample), JSON.stringify(c.text)).toBe(c.tokens);
    }
  });

  it('counts the NFC and NFD forms IDENTICALLY — the pinned tokenizer normalises', () => {
    // The one shape of cross-implementation drift both sides were most worried about: an
    // implementation that does NOT normalise gives a different count for the NFD form.
    const nfc = fixture.cases.find((c) => c.text.includes('NFC'))!;
    const nfd = fixture.cases.find((c) => c.text.includes('NFD'))!;
    expect(nfc.tokens).toBe(nfd.tokens);
    expect(countSampleTokens(tokenizer, nfc.text, 1)).toBe(countSampleTokens(tokenizer, nfd.text, 1));
  });

  it('declaredTokens is the SUM over samples, specials counted once PER SAMPLE', () => {
    // C.2: declaredTokens = Σ tokens(sample), and tokens(sample) includes specialsPerSample.
    // Adding the specials once for the whole dataset under-declares by (samples - 1).
    const samples = fixture.cases.slice(0, 4).map((c) => c.text);
    const expected = fixture.cases.slice(0, 4).reduce((a, c) => a + c.tokens, 0);
    expect(countDatasetTokens(tokenizer, samples, fixture.specialsPerSample)).toBe(expected);
  });
});

describe('the vectors are the ones the node shipped, proven by hash', () => {
  it('carries the pinned tokenizerSha256 and the generator that produced the counts', () => {
    expect(fixture.tokenizerSha256).toBe(corpus.tokenizerSha256);
    expect(fixture.specialsPerSample).toBe(1);
    // The pin covers the tokenizer DATA, never the IMPLEMENTATION that reads it — which is
    // exactly why the corpus exists and why it must run on every bump of transformers.js.
    expect(corpus.generator).toEqual({ library: 'tokenizers', version: '0.23.1' });
  });
});

describe('prepareDataset — the pre-escrow assembly (§C.2 → §D.1 → §D.2)', () => {
  // One token per character: deterministic, and independent of the 12 MB parity run above.
  const fake = { encode: (t: string) => ({ ids: new Array(t.length).fill(0) }) };
  const JSONL = '{"text":"aaaa"}\n{"text":"bbbb"}';

  const mgr = (uploads: string[] = []) => new TrainingManager({
    storageManager: { uploadEncryptedBlob: async (b: Uint8Array) => { uploads.push(`u${b.length}`); return `u${b.length}`; } },
    trainingModelId: `0x${'11'.repeat(32)}`, usdcAddress: `0x${'7c'.repeat(20)}`,
  } as never);

  it('returns the D.2 manifest fields and a sha256 over the EXACT stored bytes', async () => {
    const r = await mgr().prepareDataset({ jsonl: JSONL, tokenizer: fake, specialsPerSample: 1, tokenizerSha256: `0x${'aa'.repeat(32)}` });
    expect(r.manifest.schema).toBe('dataset-manifest-v1');
    expect(r.manifest.format).toBe('jsonl-text-v1');
    expect(r.manifest.countingRecipe).toBe('count-v1');
    expect(r.samples).toBe(2);
    expect(r.declaredTokens).toBe(10);                       // (4+1) + (4+1)
    expect(r.totalBytes).toBe(new TextEncoder().encode(JSONL).length);
    expect(r.manifestSha256).toBe(manifestSha256(r.manifestBytes));
    expect(r.manifest.shards[0]).toHaveProperty('cid');
    expect(Object.keys(r.manifest.shards[0]).sort()).toEqual(['cid', 'sha256', 'sizeBytes']);
  });

  it('REJECTS malformed jsonl BEFORE uploading anything — a bad line must cost no round trips', async () => {
    const uploads: string[] = [];
    await expect(mgr(uploads).prepareDataset({ jsonl: '{"text":""}', tokenizer: fake, specialsPerSample: 1, tokenizerSha256: '0x00' }))
      .rejects.toMatchObject({ code: 'VALIDATION_FAILED', detail: { reason: 'datasetFormat' } });
    expect(uploads).toEqual([]);
  });

  it('fails the C.6 plausibility gate LOCALLY rather than post-escrow', async () => {
    // 1 token per 100 chars blows past totalBytes <= declaredTokens x 8. The node applies this
    // gate before fetching a shard; hitting it there costs a funded session, here it costs nothing.
    const thin = { encode: (t: string) => ({ ids: new Array(Math.ceil(t.length / 100)).fill(0) }) };
    // 2 samples x 200 chars: ~423 bytes for 6 tokens = ~70 bytes/token, far past the x8 bound.
    // (The 31-byte JSONL above is 7.75 bytes/token and legitimately PASSES — the gate is tight.)
    const fat = `{"text":"${'a'.repeat(200)}"}\n{"text":"${'b'.repeat(200)}"}`;
    const uploads: string[] = [];
    await expect(mgr(uploads).prepareDataset({ jsonl: fat, tokenizer: thin, specialsPerSample: 1, tokenizerSha256: '0x00' }))
      .rejects.toThrow(/plausib|declaredTokens/i);
    expect(uploads).toEqual([]);
  });

  it('enforces A.4 maxDatasetBytes BEFORE uploading a single shard', async () => {
    // C.6 has the node apply "all A.4 bounds" before fetching a shard, and the lifecycle puts
    // them in SDK pre-validation. Without this the client counts, shards, encrypts and uploads
    // a quarter-gigabyte dataset and only then learns it was over the bound — post-escrow.
    const uploads: string[] = [];
    await expect(mgr(uploads).prepareDataset({
      jsonl: JSONL, tokenizer: fake, specialsPerSample: 1, tokenizerSha256: '0x00', maxDatasetBytes: 10,
    } as never)).rejects.toThrow(/maxDatasetBytes|too large|bytes/i);
    expect(uploads).toEqual([]);
  });
  it('remanifestWithActual keeps the SAME shards — the one-round-trip C.3 recourse', async () => {
    const r = await mgr().prepareDataset({ jsonl: JSONL, tokenizer: fake, specialsPerSample: 1, tokenizerSha256: `0x${'aa'.repeat(32)}` });
    const fixed = mgr().remanifestWithActual(r.manifest, 9);
    // The shards are already uploaded and their hashes already correct; only the count was
    // wrong. Re-uploading would be a second full dataset transfer for an arithmetic disagreement.
    expect(fixed.manifest.shards).toEqual(r.manifest.shards);
    expect(fixed.manifest.declaredTokens).toBe(9);
    expect(fixed.manifestSha256).not.toBe(r.manifestSha256);
  });
});
