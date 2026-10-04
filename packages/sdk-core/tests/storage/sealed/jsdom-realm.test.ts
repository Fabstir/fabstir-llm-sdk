// @vitest-environment jsdom
// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * §16 V9 — sealing works across realms. Under jsdom, cbor-x's Node `Buffer` is not the realm's Uint8Array, and
 * noble rejected it ("Uint8Array expected"): every CBOR seal (manifest, chunk, log) failed in consumers' jsdom
 * suites.
 */

import { test, expect } from 'vitest';
import { storageSealerFromSeed } from '../../../src/storage/sealed/StorageSealer';

const SEED = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

test('a CBOR payload seals and opens under jsdom', () => {
  const sealer = storageSealerFromSeed(SEED, ADDR);
  const sealed = sealer.seal({ kind: 'cbor', value: { name: 'db', n: 1 } }, 'rag/v1/x/manifest');
  expect(sealer.open(sealed, 'rag/v1/x/manifest').value).toEqual({ name: 'db', n: 1 });
});

test('text keeps a leading BOM (§16 V7)', () => {
  const sealer = storageSealerFromSeed(SEED, ADDR);
  const sealed = sealer.seal({ kind: 'text', value: '﻿hello' }, 'c');
  expect(sealer.open(sealed, 'c').value).toBe('﻿hello');
});
