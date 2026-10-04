// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// Training M0 dataset sharding, manifest canonicalisation and the client-side plausibility
// pre-check — pure, no I/O. Conforms to
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.12 §§D.1/D.2/D.3, §C.2, §C.6
// (all re-verified byte-identical to v0.3.8, at which this was written).
// Counting is NOT here: the splitter takes BYTES, never tokens — that is Phase 7 (C.2).
import { sha256, toUtf8Bytes } from 'ethers';
import { TrainingError } from '../errors/training-errors';

/**
 * §D.1: 24 MiB − 4 KiB. It is deliberately NOT a multiple of the 256 KiB AEAD
 * chunk — the pinned chunk scheme REFUSES to encrypt or to fetch any blob whose plaintext
 * is an exact 262,144-byte multiple. Rounding this to a "nicer" 24 MiB (25,165,824) is
 * exactly the v0.1 bug, so the constant must stay as arbitrary as it looks.
 */
export const SHARD_PLAINTEXT_MAX_BYTES = 25_161_728;

/**
 * The AEAD chunk `SHARD_PLAINTEXT_MAX_BYTES` must never be a multiple of. The doc PRINTS
 * this number (§D.1) but never names a constant for it, so the identifier is ours and
 * only the value is the doc's.
 */
export const AEAD_CHUNK_BYTES = 262_144;

/** §C.6: the node's pre-fetch plausibility gate is `totalBytes ≤ declaredTokens × 8`. */
export const PLAUSIBILITY_MAX_BYTES_PER_TOKEN = 8;

/** C.4: every dataset-shape failure is a VALIDATION_FAILED carrying `datasetFormat`. It must
 *  never surface as a moderation hold — the pre-training pipeline never ran. */
function datasetFormatError(message: string): TrainingError {
  return new TrainingError(message, 'VALIDATION_FAILED', { reason: 'datasetFormat' });
}

/**
 * D.1 shard schedule over a plaintext byte length. Cut at EXACTLY the max; the remainder
 * becomes the final shard — EXCEPT when that remainder is itself an exact chunk multiple,
 * where the splitter emits `(remainder − 1)` and a trailing 1-byte shard.
 *
 * ⚠️ THE ORDER OF THE TWO TESTS BELOW IS LOAD-BEARING (D.1 clause, v0.3.8). Zero IS
 * arithmetically a multiple of 262,144, so the natural defensive form — modulo first —
 * asks for a shard of −1 bytes on an input that divides evenly, and is correct on every
 * other input. Testing for zero FIRST is the whole point of the clause.
 */
export function splitShardSizes(totalBytes: number): number[] {
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) {
    throw datasetFormatError(
      `a dataset must be a positive whole number of bytes; got ${totalBytes}`,
    );
  }
  const full = Math.floor(totalBytes / SHARD_PLAINTEXT_MAX_BYTES);
  const remainder = totalBytes - full * SHARD_PLAINTEXT_MAX_BYTES;
  const sizes = new Array<number>(full).fill(SHARD_PLAINTEXT_MAX_BYTES);
  if (remainder === 0) return sizes;                                   // MUST precede the modulo
  if (remainder % AEAD_CHUNK_BYTES === 0) return [...sizes, remainder - 1, 1];
  return [...sizes, remainder];
}

/**
 * Split plaintext into D.1 shards. The parts are VIEWS over `data`, not copies: a 256 MiB
 * dataset (A.4's `maxDatasetBytes`) would otherwise be duplicated in memory on the way to
 * encryption. Callers must not mutate `data` while holding the parts.
 */
export function splitShards(data: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (const size of splitShardSizes(data.length)) {
    parts.push(data.subarray(offset, offset + size));
    offset += size;
  }
  return parts;
}

/**
 * §D.1: "Reassembly is concatenation in manifest order, so boundaries are free."
 * Shards cut mid-line and mid-codepoint by design, so a reader MUST concatenate before it
 * decodes — decoding a shard on its own can split a UTF-8 sequence.
 */
export function reassembleShards(shards: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(shards.reduce((sum, s) => sum + s.length, 0));
  let offset = 0;
  for (const shard of shards) {
    out.set(shard, offset);
    offset += shard.length;
  }
  return out;
}

/**
 * §C.2 `jsonl-text-v1`: UTF-8, no BOM; one JSON object per line, exactly
 * `{"text": <non-empty string>}`; blank lines forbidden; trailing final newline allowed.
 * Returns the sample count (the manifest's `samples` field, D.2) AND the parsed sample texts,
 * so a caller counting tokens does not parse a quarter-gigabyte dataset a second time.
 */
export function validateJsonlTextV1(text: string): { samples: number; texts: string[] } {
  if (text.charCodeAt(0) === 0xfeff) {
    throw datasetFormatError('jsonl-text-v1 forbids a BOM; the file must open with its first JSON object');
  }
  // The doc is SILENT on line endings, and rejecting is the safe direction rather than a
  // guess: a CR is JSON whitespace, so `{"text":"a"}\r` parses clean — but the CR byte is
  // counted into `totalBytes` and hashed into the shard, so a node that strips it recounts
  // differently and the mismatch surfaces POST-ESCROW as DECLARED_TOKENS_MISMATCH. Failing
  // here is free; failing there costs a funded session. Raised with the node developer.
  if (text.includes('\r')) {
    throw datasetFormatError('jsonl-text-v1 lines must end LF-only; a CR is hashed into the shard and recounted differently by the node');
  }
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  const lines = body.split('\n');
  const texts: string[] = [];
  lines.forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (line.length === 0) throw datasetFormatError(`jsonl-text-v1 forbids blank lines (${at})`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw datasetFormatError(`${at} is not valid JSON`);
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw datasetFormatError(`${at} must be a JSON object, exactly {"text": <non-empty string>}`);
    }
    const keys = Object.keys(parsed);
    if (keys.length !== 1 || keys[0] !== 'text') {
      throw datasetFormatError(
        `${at} must carry exactly one key, "text" (found: ${keys.join(', ') || 'none'})`,
      );
    }
    const value = (parsed as { text: unknown }).text;
    if (typeof value !== 'string') throw datasetFormatError(`${at}: "text" must be a string`);
    if (value.length === 0) throw datasetFormatError(`${at}: "text" must be a non-empty string`);
    texts.push(value);
  });
  return { samples: lines.length, texts };
}

/** Recursively sort object keys; ARRAY ORDER IS PRESERVED — `shards` is ordered and D.1's
 *  reassembly depends on it, so sorting an array would corrupt the dataset. */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * §D.2, the ONE canonicalisation rule for every manifest on this interface:
 * keys sorted, compact separators, UTF-8. `JSON.stringify` already emits compact separators
 * and does NOT \u-escape non-ASCII, so it satisfies "UTF-8" as written.
 *
 * This deliberately does NOT reuse `ltx-utils`' private `sortKeysDeep`. The two are separate
 * FROZEN contracts that merely agree today; coupling them would let a refactor of LTX's
 * bundle hashing silently move training's manifest hashes. See the Phase 4 record.
 */
export function canonicaliseManifest(manifest: unknown): Uint8Array {
  return toUtf8Bytes(JSON.stringify(sortKeysDeep(manifest)));
}

/**
 * D.2: `manifestSha256 = SHA256(exact stored bytes)`, and "no re-canonicalisation on read,
 * ever". Takes BYTES, never an object, so the type makes the mistake hard: parsing a fetched
 * manifest and re-serialising it before hashing breaks verification even when the object is
 * identical in spirit. Hash what was fetched.
 */
export function manifestSha256(storedBytes: Uint8Array): string {
  return sha256(storedBytes);
}

/**
 * C.6 pre-check, run client-side BEFORE escrow. The node applies this gate before fetching a
 * single shard, and a failure there burns a funded session; here it costs nothing.
 *
 * A.4's own bounds (`maxSamples`, `maxDatasetBytes`) are NOT checked here — they come from
 * the host bundle, which this pure module never sees. They belong to bundle pre-validation
 * (the lifecycle section, step 1).
 */
export function verifyPlausibility(manifest: {
  totalBytes: number;
  declaredTokens: number;
}): { ok: boolean; limit: number; bytesPerToken: number } {
  const { totalBytes, declaredTokens } = manifest;
  const limit = declaredTokens * PLAUSIBILITY_MAX_BYTES_PER_TOKEN;
  return {
    ok: declaredTokens > 0 && totalBytes <= limit,
    limit,
    bytesPerToken: declaredTokens > 0 ? totalBytes / declaredTokens : Infinity,
  };
}
