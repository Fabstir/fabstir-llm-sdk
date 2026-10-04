// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Plan §19 Z1 — sealed storage relies on s5js beta.56 (no same-origin lost update, fresh reads, a registry miss is
 * a failure). On beta.55 the SDK would lose whole databases and logs, so an s5js without beta.56's root export
 * `isS5RegistryUnavailableError` is refused before anything is created: S5JS_UNSUPPORTED_VERSION, not retryable.
 */

import { test, expect, vi } from 'vitest';

let created = 0;
// beta.55's root: S5, S5DirectoryLoadError — no isS5RegistryUnavailableError.
vi.mock('@julesl23/s5js', () => ({ S5: { create: async () => { created++; throw new Error('never reached'); } } }));

import { StorageManager } from '../../src/managers/StorageManager';
import { DocumentManager } from '../../src/managers/DocumentManager';
import { SEED, ADDR } from '../helpers/sealed-fixtures';

test('StorageManager refuses an s5js without beta.56 semantics', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await expect(new StorageManager().initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'S5JS_UNSUPPORTED_VERSION', details: { retryable: false } });
  expect(created).toBe(0);
});

test('DocumentManager refuses it too, never falling back', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(new DocumentManager().initialize(SEED, ADDR)).rejects.toMatchObject({ code: 'S5JS_UNSUPPORTED_VERSION', details: { retryable: false } });
  expect(created).toBe(0);
});
