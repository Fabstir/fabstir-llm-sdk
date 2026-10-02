// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * App-level sealing for everything the SDK stores on S5 for RAG and the conversation log.
 *
 * s5js's own `{ encryption }` option keeps each file's key in a plaintext directory entry, so it hides
 * nothing from whoever holds the blobs. This envelope is sealed under a key only the user's seed can
 * derive:
 *
 *   FF 53 45 4C | version 01 | kind | nonce (24) | XChaCha20-Poly1305 ciphertext ‖ tag (16)
 *
 * AAD = the six header bytes ‖ a context string naming the file's role (built by `rag-layout.ts`, e.g.
 * `rag/v1/{dbId}/{incarnation}/chunk/3`), so a swapped or misplaced file fails authentication instead of
 * decoding as the wrong thing. The 0xFF lead byte makes s5js's CBOR → JSON → UTF-8 guessing fail, so an
 * old reader only ever sees opaque bytes.
 */

import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { hkdf } from '@noble/hashes/hkdf';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { concatBytes } from '@noble/ciphers/utils';
import { Encoder, decode } from 'cbor-x';
import { SDKError } from '../../types';
import { bytesToHex, hexToBytes } from '../../crypto/utilities';
import { deriveEncryptionKeyFromSeed } from '../../utils/encryption-key-derivation';

export type SealedPayload =
  | { kind: 'cbor'; value: unknown }
  | { kind: 'text'; value: string }
  | { kind: 'bytes'; value: Uint8Array };

export interface StorageSealer {
  seal(payload: SealedPayload, context: string): Uint8Array;
  /** @throws SDKError SEALED_OPEN_FAILED — not an envelope, wrong context, wrong key, or tampered */
  open(bytes: Uint8Array, context: string): SealedPayload;
  /** Magic + version only — says "this is an envelope", not "this envelope is authentic". */
  isSealed(bytes: Uint8Array): boolean;
  /** Keyed, deterministic 128-bit id (32 hex chars) — names on S5 without revealing the input. */
  deriveId(label: 'db' | 'doc' | 'heads' | 'conv', input: string): string;
}

const MAGIC = [0xff, 0x53, 0x45, 0x4c];
const VERSION = 0x01;
const KIND_BYTE = { cbor: 0x01, text: 0x02, bytes: 0x03 } as const;
const KIND_OF_BYTE = Object.fromEntries(Object.entries(KIND_BYTE).map(([k, b]) => [b, k])) as Record<number, SealedPayload['kind']>;
const HEADER_LEN = 6;
const NONCE_LEN = 24;
const TAG_LEN = 16;
export const SEAL_OVERHEAD = HEADER_LEN + NONCE_LEN + TAG_LEN;

const utf8 = new TextEncoder();
// ignoreBOM: a leading U+FEFF is part of the text — bytes stay exact (§16 V7).
const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const HKDF_SALT = utf8.encode('fabstir-sealed-storage');

// In `u` mode a surrogate class matches only an unpaired surrogate (a pair is one code point) — no lookbehind, which
// Safari/iOS before 16.4 cannot parse: one in any module stops the whole SDK loading there (§23 DD2).
const LONE_SURROGATE = /[\uD800-\uDFFF]/gu;
/** Whether UTF-8 carries `s` exactly: a lone surrogate encodes as U+FFFD, so it would read back altered. */
export const isWellFormed = (s: string) => s.search(LONE_SURROGATE) === -1;

/**
 * WTF-8: UTF-8 for every well-formed string (so no id derived from one ever changes), and a lone surrogate as its own
 * three bytes instead of U+FFFD's — ids are derived losslessly, so `x\uD83D` and `x\uFFFD` never share one (§22 CC1).
 */
function wtf8(s: string): Uint8Array {
  if (isWellFormed(s)) return utf8.encode(s);
  const parts: Uint8Array[] = [];
  let last = 0;
  for (const m of s.matchAll(LONE_SURROGATE)) {
    const unit = m[0].charCodeAt(0);
    parts.push(utf8.encode(s.slice(last, m.index)), Uint8Array.of(0xe0 | (unit >> 12), 0x80 | ((unit >> 6) & 0x3f), 0x80 | (unit & 0x3f)));
    last = m.index! + 1;
  }
  parts.push(utf8.encode(s.slice(last)));
  return concatBytes(...parts);
}

function openFailed(reason: string, cause?: unknown): SDKError {
  return new SDKError(`Sealed storage: cannot open (${reason})`, 'SEALED_OPEN_FAILED', { reason, cause, retryable: false });
}

/**
 * Maps carry their true size (§35 PP1): cbor-x's default writes every object as a 16-bit-length map and keeps the key
 * count modulo 65,536 — an object of 65,536 keys or more (a manifest's `bodies`) was sealed unreadable. Both decoders
 * read both forms, so what was sealed before opens as it did. No records: plain CBOR, as before.
 */
const cbor = new Encoder({ useRecords: false, variableMapSize: true });

function encodeBody(payload: SealedPayload): Uint8Array {
  if (payload.kind === 'cbor') {
    // cbor-x returns a Node Buffer; a plain view of it is a Uint8Array in any realm (jsdom's too — §16 V9).
    const b = cbor.encode(payload.value);
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  }
  if (payload.kind === 'text') return utf8.encode(payload.value);
  return payload.value;
}

function decodeBody(kind: SealedPayload['kind'], body: Uint8Array): SealedPayload {
  if (kind === 'cbor') return { kind, value: decode(body) };
  if (kind === 'text') return { kind, value: strictUtf8.decode(body) };
  return { kind, value: body };
}

/** Magic + version only — "this is an envelope", not "this envelope is authentic". Needs no key. */
export function isSealedBytes(bytes: Uint8Array): boolean {
  return bytes.length >= SEAL_OVERHEAD && MAGIC.every((b, i) => bytes[i] === b) && bytes[4] === VERSION;
}

/**
 * The sealer for an S5 seed and the address whose data it seals — the same keys
 * `EncryptionManager.fromSeed(seed, address).getStorageSealer()` holds, without building a whole EncryptionManager.
 */
export function storageSealerFromSeed(seedPhrase: string, address: string): StorageSealer {
  return createStorageSealer(hexToBytes(deriveEncryptionKeyFromSeed(seedPhrase)), address);
}

/**
 * @param rootKey 32 secret bytes (the EncryptionManager private key); only HKDF-derived keys are kept.
 * @param address the wallet whose data this seals. Paths on S5 are per address while one seed can serve several
 *   (`s5Config.seedPhrase`, the vault), so the keys and ids are bound to it — lowercased, as one address is one
 *   wallet in any casing (plan §19 Z8).
 */
export function createStorageSealer(rootKey: Uint8Array, address: string): StorageSealer {
  if (typeof address !== 'string' || address.length === 0) {
    throw new SDKError('A storage sealer needs the address whose data it seals', 'STORAGE_SEALER_MISSING', { retryable: false });
  }
  const owner = address.toLowerCase();
  const aeadKey = hkdf(sha256, rootKey, HKDF_SALT, utf8.encode(`fabstir/sealed-storage/v1/aead/${owner}`), 32);
  const idKey = hkdf(sha256, rootKey, HKDF_SALT, utf8.encode(`fabstir/sealed-storage/v1/ids/${owner}`), 32);

  const isSealed = isSealedBytes;

  return {
    seal(payload, context) {
      const body = encodeBody(payload);
      // One allocation: header ‖ nonce, then the cipher writes ciphertext ‖ tag straight into the rest.
      const out = new Uint8Array(SEAL_OVERHEAD + body.length);
      out.set([...MAGIC, VERSION, KIND_BYTE[payload.kind]], 0);
      const nonce = crypto.getRandomValues(out.subarray(HEADER_LEN, HEADER_LEN + NONCE_LEN));
      xchacha20poly1305(aeadKey, nonce, concatBytes(out.subarray(0, HEADER_LEN), utf8.encode(context)))
        .encrypt(body, out.subarray(HEADER_LEN + NONCE_LEN));
      return out;
    },

    open(bytes, context) {
      if (!isSealed(bytes)) throw openFailed('not a sealed envelope');
      const kind = KIND_OF_BYTE[bytes[5]];
      if (!kind) throw openFailed(`unknown kind 0x${bytes[5].toString(16)}`);
      const nonce = bytes.subarray(HEADER_LEN, HEADER_LEN + NONCE_LEN);
      let body: Uint8Array;
      try {
        // decrypt allocates its output, so nothing returned aliases the input (s5js can hand back a
        // just-uploaded blob by reference from its cache).
        body = xchacha20poly1305(aeadKey, nonce, concatBytes(bytes.subarray(0, HEADER_LEN), utf8.encode(context)))
          .decrypt(bytes.subarray(HEADER_LEN + NONCE_LEN));
      } catch (cause) {
        throw openFailed('authentication failed — wrong key, wrong context, or tampered', cause);
      }
      try {
        return decodeBody(kind, body);
      } catch (cause) {
        throw openFailed(`authentic ${kind} body did not decode`, cause);
      }
    },

    isSealed,

    deriveId(label, input) {
      return bytesToHex(hmac(sha256, idKey, wtf8(`${label}\u0000${input}`)).subarray(0, 16));
    },
  };
}
