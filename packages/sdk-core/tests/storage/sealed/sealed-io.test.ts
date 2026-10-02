// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Phase 2 — sealed I/O over s5js (plan D7, D13, D14, I2, I5, I6).
 */

import { describe, test, expect } from 'vitest';
import { blake3 } from '@noble/hashes/blake3';
import { FakeS5Network, hex } from '../../helpers/fake-s5';
import { SealedIO, isS5Absent, sealedBlobHash } from '../../../src/storage/sealed/sealed-io';
import { createStorageSealer } from '../../../src/storage/sealed/StorageSealer';

const sealer = createStorageSealer(new Uint8Array(32).fill(3), '0x' + '3'.repeat(40));
const sealedText = (t: string) => sealer.seal({ kind: 'text', value: t }, 'ctx');

function setup() {
  const net = new FakeS5Network();
  const tab = net.tab();
  const io = new SealedIO(tab, sealer.isSealed, tab.pathToHash);
  return { net, tab, io };
}

describe('isS5Absent (I2 — a failed read is never absence)', () => {
  test('absence is only "Path not found" or "does not exist"', () => {
    expect(isS5Absent(new Error('Path not found: home/x'))).toBe(true);
    expect(isS5Absent(new Error('Directory "home/x" does not exist'))).toBe(true);
  });

  test('a typed retryable error, a network error quoting a 404, and anything not in s5js\'s absence shape are NOT absence (§17 W2)', () => {
    const typed = Object.assign(new Error('Directory "home/x" does not exist (404)'), { name: 'S5DirectoryLoadError', retryable: true });
    expect(isS5Absent(typed)).toBe(false);
    expect(isS5Absent(Object.assign(new Error('x does not exist'), { retryable: true }))).toBe(false);
    expect(isS5Absent(new Error('HTTP 404 not found'))).toBe(false);
    expect(isS5Absent(new Error('Path not found (404)'))).toBe(false);
    expect(isS5Absent(new Error('WebSocket connection closed'))).toBe(false);
    expect(isS5Absent(undefined)).toBe(false);
  });
});

describe('SealedIO.write', () => {
  test('stores the exact sealed bytes as octet-stream and returns their BLAKE3 hash', async () => {
    const { net, io } = setup();
    const bytes = sealedText('hello');
    const h = await io.write('home/rag/v1/db/manifest', bytes);
    expect(h).toBe(hex(blake3(bytes)));
    expect(sealedBlobHash(bytes)).toBe(h);
    expect(Array.from(net.writes[0].bytes)).toEqual(Array.from(bytes));
    const meta = await net.tab().fs.getMetadata('home/rag/v1/db/manifest');
    expect(meta?.mediaType).toBe('application/octet-stream');
  });

  test('refuses anything that is not a sealed envelope, and writes nothing (I1)', async () => {
    const { net, io } = setup();
    const err: any = await io.write('home/rag/v1/db/x', new TextEncoder().encode('plaintext')).catch((e) => e);
    expect(err.code).toBe('RAG_PLAINTEXT_WRITE_REFUSED');
    expect(net.writes).toHaveLength(0);
  });
});

describe('SealedIO.readPath (sealed, legacy, absent, failure)', () => {
  test('a sealed file reads back byte-exact even under a .json name (0xFF defeats get() guessing)', async () => {
    const { net, tab, io } = setup();
    const bytes = sealedText('confidential');
    await tab.fs.put('home/sessions/0xabc/1/conversation.json', bytes);
    const r = await io.readPath('home/sessions/0xabc/1/conversation.json');
    expect(r.state).toBe('sealed');
    expect(Array.from((r as any).bytes)).toEqual(Array.from(bytes));
    expect(net.writes).toHaveLength(1);
  });

  test('a legacy plaintext object reads as "plain" with the decoded value', async () => {
    const { tab, io } = setup();
    await tab.fs.put('home/vector-databases/0xabc/db/manifest.json', { name: 'db' });
    expect(await io.readPath('home/vector-databases/0xabc/db/manifest.json')).toEqual({ state: 'plain', value: { name: 'db' } });
  });

  test('legacy plaintext bytes (an octet-stream file) read as "plain", never as "sealed"', async () => {
    const { tab, io } = setup();
    const plain = new TextEncoder().encode('legacy bytes');
    await tab.fs.put('home/rag/v1/db/manifest', plain);
    const r = await io.readPath('home/rag/v1/db/manifest');
    expect(r.state).toBe('plain');
    expect(Array.from((r as any).value)).toEqual(Array.from(plain));
  });

  test('a missing file and a missing directory are both certainly "absent"; a registry miss is a failure (§14 S1, §18 B1)', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/chunk-0', sealedText('x'));
    expect(await io.readPath('home/rag/v1/db/manifest')).toEqual({ state: 'absent' });     // get() → undefined
    expect(await io.readPath('home/rag/v1/other/manifest')).toEqual({ state: 'absent' });  // "Directory … does not exist"
    net.registryMiss('home/rag/v1/db', 1);
    expect(await io.readPath('home/rag/v1/db/manifest').catch((e) => e)).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
  });

  test('a typed retryable 404 and a network error throw — never "absent"', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    net.fail('get', 'home/rag/v1/db/manifest', 'dir404');
    await expect(io.readPath('home/rag/v1/db/manifest')).rejects.toMatchObject({ details: { retryable: true } }); // one shape (§15 T7)
    net.fail('get', 'home/rag/v1/db/manifest', 'network');
    await expect(io.readPath('home/rag/v1/db/manifest')).rejects.toThrow('WebSocket');
  });
});

describe('SealedIO.readHash / readRaw (content-addressed, byte-exact)', () => {
  test('readHash returns the exact bytes for a recorded hash', async () => {
    const { io } = setup();
    const bytes = sealedText('chunk');
    const h = await io.write('home/rag/v1/db/chunk-0', bytes);
    expect(Array.from(await io.readHash(h))).toEqual(Array.from(bytes));
  });

  test('readHash of a hash the network does not have throws — a referenced blob is never "absent"', async () => {
    const { io } = setup();
    await expect(io.readHash('00'.repeat(32))).rejects.toThrow();
  });

  test('readRaw returns legacy text byte-exact where get() would corrupt it', async () => {
    const { tab, io } = setup();
    await tab.fs.put('home/vector-databases/0xabc/db/documents/d1.txt', 'cats');
    expect(await tab.fs.get('home/vector-databases/0xabc/db/documents/d1.txt')).toBe('ats');
    expect(new TextDecoder().decode(await io.readRaw('home/vector-databases/0xabc/db/documents/d1.txt') as Uint8Array)).toBe('cats');
  });

  test('readRaw: missing → undefined; a typed 404 while resolving → throws', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/v/db/documents/d1.txt', '42');
    expect(await io.readRaw('home/v/db/documents/nope.txt')).toBeUndefined();
    expect(await io.readRaw('home/v/nodb/documents/d1.txt')).toBeUndefined();
    net.fail('download', /.*/, 'dir404');
    await expect(io.readRaw('home/v/db/documents/d1.txt')).rejects.toMatchObject({ details: { retryable: true } }); // one shape (§15 T7)
  });
});

describe('SealedIO.list', () => {
  test('lists entries; a missing directory is undefined; a typed 404 throws', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/documents/k', sealedText('x'));
    expect(await io.list('home/rag/v1/db')).toEqual([
      { name: 'manifest', type: 'file', mediaType: 'application/octet-stream' },
      { name: 'documents', type: 'directory' },
    ]);
    expect(await io.list('home/rag/v1/none')).toBeUndefined();
    net.fail('list', 'home/rag/v1/db', 'dir404');
    await expect(io.list('home/rag/v1/db')).rejects.toMatchObject({ details: { retryable: true } }); // one shape (§15 T7)
  });
});

describe('SealedIO.deleteTree / deleteFiles (I6 — delete means delete)', () => {
  test('removes every file and directory under the root, depth-first', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/chunk-0', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/documents/a', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/documents/deep/b', sealedText('x'));
    await tab.fs.put('home/rag/v1/other/manifest', sealedText('x'));
    await io.deleteTree('home/rag/v1/db');
    expect(net.filePaths()).toEqual(['home/rag/v1/other/manifest']);
    expect(net.dirPaths().filter((d) => d.startsWith('home/rag/v1/db'))).toEqual([]);
  });

  test('a missing root is a no-op that creates nothing (never deletes a speculative path)', async () => {
    const { net, io } = setup();
    await io.deleteTree('home/vector-databases/0xabc/ghost');
    expect(net.dirPaths()).toEqual(['home']);
  });

  test('a directory s5js refuses to delete (a fresh check found a new file) → RAG_DELETE_INCOMPLETE listing what remains', async () => {
    // (A FILE delete returning false means already gone — s5js's transaction reads fresh; §16 V1.)
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/documents/d1', sealedText('x'));
    const del = tab.fs.delete;
    tab.fs.delete = async (path: string) => {
      const ok = await del(path);
      if (path.endsWith('/documents/d1')) await net.tab().fs.put('home/rag/v1/db/documents/d2', sealedText('y')); // another writer, after the walk listed
      return ok;
    };
    const err: any = await io.deleteTree('home/rag/v1/db', { last: ['manifest'] }).catch((e) => e);
    expect(err.code).toBe('RAG_DELETE_INCOMPLETE');
    expect(err.details.remaining).toEqual(expect.arrayContaining(['home/rag/v1/db/documents/d2', 'home/rag/v1/db/manifest']));
  });

  test('a doubtful delete whose re-list fails reports that failure — never success (§18 B4, §19 Z21)', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/chunk-0', sealedText('x'));
    net.fail('delete', 'home/rag/v1/db/chunk-0', 'network');
    const del = tab.fs.delete;
    tab.fs.delete = async (path: string) => {
      if (path === 'home/rag/v1/db/chunk-0') net.fail('list', 'home/rag/v1/db', 'network', 1);   // the re-list after it
      return del(path);
    };
    expect(await io.deleteTree('home/rag/v1/db', { last: ['manifest'] }).catch((e) => e))
      .toMatchObject({ code: 'S5_IO_ERROR', details: { retryable: true } });
    expect(net.filePaths()).toContain('home/rag/v1/db/manifest');
  });

  test('a listing that fails mid-walk fails the delete retryably, keeping the `last` names (§18 B4)', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/manifest', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/documents/d1', sealedText('x'));
    net.registryMiss('home/rag/v1/db/documents', 1);
    expect(await io.deleteTree('home/rag/v1/db', { last: ['manifest'] }).catch((e) => e))
      .toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', details: { retryable: true } });
    expect(net.filePaths()).toContain('home/rag/v1/db/manifest');
    expect(await io.deleteTree('home/rag/v1/db', { last: ['manifest'] })).toBe(true);
    expect(net.filePaths()).toEqual([]);
  });

  test('a delete that throws is still reported as incomplete, with the cause', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/chunk-0', sealedText('x'));
    net.fail('delete', 'home/rag/v1/db/chunk-0', 'network');
    const err: any = await io.deleteTree('home/rag/v1/db').catch((e) => e);
    expect(err.code).toBe('RAG_DELETE_INCOMPLETE');
    expect(err.details.remaining).toContain('home/rag/v1/db/chunk-0');
  });

  test('deleteFiles deletes only names present in the listing', async () => {
    const { net, tab, io } = setup();
    await tab.fs.put('home/rag/v1/db/chunk-0', sealedText('x'));
    await tab.fs.put('home/rag/v1/db/chunk-1', sealedText('x'));
    await io.deleteFiles('home/rag/v1/db', ['chunk-1', 'chunk-7']);
    expect(net.filePaths()).toEqual(['home/rag/v1/db/chunk-0']);
    await io.deleteFiles('home/rag/v1/nodir', ['chunk-0']);
    expect(net.dirPaths()).not.toContain('home/rag/v1/nodir');
  });
});
