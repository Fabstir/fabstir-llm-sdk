// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/** Plan §18 B1 — the store's default `pathToHash` (FS5Advanced.pathToCID) passes the fresh read through. */

import { test, expect, vi } from 'vitest';

const calls: unknown[] = [];
vi.mock('@julesl23/s5js', () => ({
  FS5Advanced: class {
    async pathToCID(_path: string, options?: unknown) { calls.push(options); return new Uint8Array(32); }
  },
}));

import { S5VectorStore } from '../../../src/storage/S5VectorStore';
import { SealedIO } from '../../../src/storage/sealed/sealed-io';
import { ADDR, encryptionManager as em } from '../../helpers/sealed-fixtures';

test('hashOf reaches FS5Advanced.pathToCID with { fresh: true }', async () => {
  const store = new S5VectorStore({ s5Client: { fs: {} } as any, userAddress: ADDR, encryptionManager: em() });
  const io = new SealedIO({ fs: {} } as any, () => true, (store as any).pathToHash);
  await io.hashOf('home/rag/v1/x/manifest');
  expect(calls).toEqual([{ fresh: true }]);
});
