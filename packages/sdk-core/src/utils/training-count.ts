// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// `count-v1` (§C.2) — the client-side count that becomes the manifest's `declaredTokens` and,
// through it, the bill. Implemented STRICTLY from the node's shipped vectors.
// docs/node-reference/DESIGN-TRAINING-M0-INTERFACE.md v0.3.12 §C.2.
//
// Open 7 is closed on this side as **@huggingface/tokenizers, version 0.1.3**, verified against
// BOTH the 15-case frozen fixture and the 158-case differential corpus — 173/173, every group
// clean including `non-bmp` (27), where a code-unit walk instead of a code-point walk would
// fail. Chosen over `@huggingface/transformers` (which also passes 173/173) because it is the
// tokenizer ALONE: zero dependencies and a browser export, where transformers drags in
// onnxruntime-node, onnxruntime-web and sharp for inference this SDK never performs.
// The pin covers the tokenizer DATA, never the IMPLEMENTATION that reads it — two readers of
// the same tokenizer.json can disagree — so the corpus is the real contract and MUST be re-run
// on every bump of that dependency, not once at adoption.
import { sha256 } from 'ethers';
import { TrainingError } from '../errors/training-errors';

/** Both shapes in the wild: `@huggingface/tokenizers` returns an `Encoding` object, while
 *  transformers.js and several ports return the id array directly. */
export type TokenizerEncoding = ArrayLike<number> | { ids: ArrayLike<number> };

/** The narrow slice of a tokenizer this recipe uses. Anything satisfying it works, so a caller
 *  that already holds a loaded tokenizer need not pay twelve megabytes twice. */
export interface TrainingTokenizer {
  encode(text: string, options?: { add_special_tokens?: boolean }): TokenizerEncoding;
}

/** Accept either shape. This is an interface adapter, NOT a fallback masking an error: both
 *  are correct returns from real tokenizers, and neither is a failure state. */
function idsOf(encoding: TokenizerEncoding): ArrayLike<number> {
  return (encoding as { ids?: ArrayLike<number> }).ids ?? (encoding as ArrayLike<number>);
}

/**
 * Verify supplied tokenizer bytes against the template's pin. Called BEFORE any load, and the
 * ordering is the point: a wrong tokenizer produces a plausible-looking count that survives
 * every local check and is rejected by the node's recount POST-ESCROW. A hash costs nothing.
 */
export function assertTokenizerPin(tokenizerJsonBytes: Uint8Array, expectedSha256: string): void {
  const actual = sha256(tokenizerJsonBytes);
  if (actual.toLowerCase() !== String(expectedSha256).toLowerCase()) {
    throw new TrainingError(
      `tokenizer.json hashes to ${actual}, not the template's pinned tokenizerSha256 ${expectedSha256}`,
      // NOT `sessionParams`: that reason is pinned to A.3's ON-CHAIN session-state rejects, and
      // every pinned reason makes `isReshoppable` false. A wrong tokenizer file is a purely
      // local problem — it is our fault, so it is terminal, but for its own reason.
      'VALIDATION_FAILED', { reason: 'tokenizerPin' },
    );
  }
}

/**
 * Verify, then construct a tokenizer from raw `tokenizer.json` bytes.
 *
 * The 12 MB file is deliberately NOT vendored by this SDK. It belongs to the TEMPLATE, not to
 * us, and templates multiply — vendoring would mean a new 12 MB per template forever, couple
 * our release cycle to template authoring, and raise a redistribution question about shipping
 * someone else's tokenizer. The caller supplies the bytes and we verify them, which is the
 * part that actually secures parity. Callers should cache by the sha256: it is exactly the
 * identity being verified, so a template change invalidates the cache for free.
 */
export async function loadTrainingTokenizer(
  tokenizerJsonBytes: Uint8Array, expectedSha256: string,
): Promise<TrainingTokenizer> {
  assertTokenizerPin(tokenizerJsonBytes, expectedSha256);
  let mod: { Tokenizer: new (json: unknown, config: unknown) => TrainingTokenizer };
  try {
    mod = (await import('@huggingface/tokenizers')) as never;
  } catch {
    // Optional peer dep: one canonical, actionable error — never a raw MODULE_NOT_FOUND.
    throw new TrainingError(
      'count-v1 needs the optional peer dependency @huggingface/tokenizers (>=0.1.3). '
      + 'Install it, or pass an already-constructed tokenizer to the counting functions.',
      'VALIDATION_FAILED', { reason: 'missingDependency' },
    );
  }
  const json = JSON.parse(new TextDecoder().decode(tokenizerJsonBytes));
  return new mod.Tokenizer(json, {});
}

/**
 * C.2: `tokens(sample) = len(encode(text, addSpecialTokens = false)) + specialsPerSample`.
 *
 * `add_special_tokens: false` is not a detail — leaving it default makes the tokenizer add its
 * own specials AND we add ours, double-counting on every sample.
 */
export function countSampleTokens(
  tokenizer: TrainingTokenizer, text: string, specialsPerSample: number,
): number {
  return idsOf(tokenizer.encode(text, { add_special_tokens: false })).length + specialsPerSample;
}

/**
 * C.2: `declaredTokens = Σ tokens(sample)`.
 *
 * The specials are per SAMPLE, not per dataset — adding them once for the whole file
 * under-declares by (samples − 1) and walks into a `DECLARED_TOKENS_MISMATCH` on a funded
 * session. That reject is terminal with zero proofs and the deposit freed, and it hands back
 * both the declared and the actual number, so it announces itself — but it still costs the
 * user a round trip they did not need to make.
 */
export function countDatasetTokens(
  tokenizer: TrainingTokenizer, samples: readonly string[], specialsPerSample: number,
): number {
  let total = 0;
  for (const sample of samples) total += countSampleTokens(tokenizer, sample, specialsPerSample);
  return total;
}
