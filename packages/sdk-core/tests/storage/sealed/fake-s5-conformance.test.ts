// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Pins the fake (tests/helpers/fake-s5.ts) to s5js 0.9.0-beta.56 behaviour. Every sealed-storage suite is only as
 * good as this fake, so each rule here is one the design relies on, verified against the beta.56 dist (plan §18).
 */

import { describe, test, expect } from 'vitest';
import { FakeS5Network, S5DirectoryLoadError, FAKE_ROOT_URI, hex } from '../../helpers/fake-s5';
import { blake3 } from '@noble/hashes/blake3';

async function collect(it: AsyncIterable<any>) {
  const out: any[] = [];
  for await (const e of it) out.push(e);
  return out;
}
const names = async (it: AsyncIterable<any>) => (await collect(it)).map((e) => e.name as string).sort();

describe('fake-s5 conformance (beta.56): values', () => {
  test('get() corrupts text exactly as the request reports: "cats"→"ats", "42"→42, "7"→-24', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/a', 'cats');
    await fs.put('home/d/b', '42');
    await fs.put('home/d/c', '7');
    expect(await fs.get('home/d/a')).toBe('ats');
    expect(await fs.get('home/d/b')).toBe(42);
    expect(await fs.get('home/d/c')).toBe(-24);
  });

  test('a Uint8Array without a mapped extension reads back as the same bytes (octet-stream default)', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/blob', new Uint8Array([0x63, 0x61, 0x74, 0x73]));
    expect(Array.from((await fs.get('home/d/blob')) as Uint8Array)).toEqual([0x63, 0x61, 0x74, 0x73]);
  });

  test('the extension wins over the bytes default: a .json-named Uint8Array is guessed', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/x.json', new TextEncoder().encode('42'));
    expect(await fs.get('home/d/x.json')).toBe(42);
  });

  test('objects round-trip through CBOR', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/m.json', { a: 1, b: ['x'] });
    expect(await fs.get('home/d/m.json')).toEqual({ a: 1, b: ['x'] });
  });

  test('list yields files (sorted) then directories', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/b', 'x');
    await fs.put('home/d/a', 'x');
    await fs.put('home/d/sub/c', 'x');
    expect((await collect(fs.list('home/d'))).map((e) => `${e.type}:${e.name}`)).toEqual(['file:a', 'file:b', 'directory:sub']);
  });

  test('downloadByCID returns the exact bytes for the BLAKE3 hash; pathToHash throws "Path not found"', async () => {
    const tab = new FakeS5Network().tab();
    const bytes = new Uint8Array([1, 2, 3]);
    await tab.fs.put('home/d/f', bytes);
    const h = await tab.pathToHash('home/d/f');
    expect(hex(h)).toBe(hex(blake3(bytes)));
    expect(Array.from(await tab.downloadByCID(h))).toEqual([1, 2, 3]);
    await expect(tab.pathToHash('home/d/none')).rejects.toThrow('Path not found: home/d/none');
  });

  test('the write log records the exact stored bytes', async () => {
    const net = new FakeS5Network();
    await net.tab().fs.put('home/d/f', 'plain text');
    expect(new TextDecoder().decode(net.writes[0].bytes)).toBe('plain text');
  });
});

describe('fake-s5 conformance (beta.56): absence and failure', () => {
  test('missing file → undefined; a directory its parent does not link → `Directory "<root URI>/…" does not exist`, S5_PATH_NOT_FOUND (fs5.js:1578-1581)', async () => {
    const fs = new FakeS5Network().tab().fs;
    await fs.put('home/d/a', 'x');
    expect(await fs.get('home/d/nope')).toBeUndefined();
    const err: any = await fs.get('home/nodir/a').catch((e) => e);
    expect(err.message).toBe(`Directory "${FAKE_ROOT_URI}/home/nodir" does not exist`);
    expect(err.code).toBe('S5_PATH_NOT_FOUND');
    await expect(collect(fs.list('home/nodir'))).rejects.toThrow('does not exist');
  });

  test('injected faults: a blob 404 is a retryable blob-unavailable load error (errors.js:75-84); a network error', async () => {
    const net = new FakeS5Network();
    const fs = net.tab().fs;
    await fs.put('home/d/f', 'x');
    net.fail('get', 'home/d/f', 'dir404');
    const err: any = await fs.get('home/d/f').catch((e) => e);
    expect(err).toBeInstanceOf(S5DirectoryLoadError);
    expect(err).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', retryable: true, reason: 'blob-unavailable' });
    expect(err.message).toContain('404');
    net.fail('put', /home\/d/, 'network');
    await expect(fs.put('home/d/g', 'x')).rejects.toThrow('WebSocket');
    await fs.put('home/d/g', 'x'); // fault consumed
  });

  test('a registry miss on a LINKED directory is retryable entry-unavailable, never empty — reads and writes (fs5.js:1880-1897, 2047-2057)', async () => {
    const net = new FakeS5Network();
    const fs = net.tab().fs;
    await fs.put('home/d/f', 'x');
    net.registryMiss('home/d', 4);
    for (const attempt of [fs.get('home/d/f'), collect(fs.list('home/d')), fs.getMetadata('home/d/f', { fresh: true }), fs.put('home/d/g', 'y')]) {
      const err: any = await attempt.catch((e: unknown) => e);
      expect(err).toMatchObject({ code: 'S5_DIRECTORY_LOAD_ERROR', retryable: true, reason: 'entry-unavailable' });
      expect(err.message).not.toMatch(/does not exist|Path not found|same name/);
    }
    expect(net.filePaths()).toEqual(['home/d/f']);           // the refused write wrote nothing
    expect(await fs.get('home/d/f')).toBe('x');              // the miss was not cached
  });

  test('a registry miss on the ROOT reads as unvouched: a path below throws `Parent Directory of "…" does not exist`, S5_PATH_NOT_FOUND (fs5.js:1564-1577)', async () => {
    const net = new FakeS5Network();
    const fs = net.tab().fs;
    await fs.put('home/d/f', 'x');
    net.registryMiss('', 1);
    const err: any = await fs.get('home/d/f', { fresh: true }).catch((e) => e);
    expect(err.message).toBe(`Parent Directory of "${FAKE_ROOT_URI}/home" does not exist`);
    expect(err.code).toBe('S5_PATH_NOT_FOUND');
  });
});

describe('fake-s5 conformance (beta.56): caches and coherence', () => {
  test("another tab's write is invisible to a default read for 30 s; own writes are visible at once (fs5.js:1822-1829)", async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/f', 'v1');
    expect(await b.fs.get('home/d/f')).toBe('v1');           // b caches the dir
    await a.fs.put('home/d/f', 'v2');
    expect(await a.fs.get('home/d/f')).toBe('v2');           // own write evicts
    expect(await b.fs.get('home/d/f')).toBe('v1');           // stale in b
    net.advance(30_000);
    expect(await b.fs.get('home/d/f')).toBe('v2');
  });

  test('a fresh read sees the newest entry at once and evicts the stale cached copy, so default reads never go back (fs5.js:1838-1841, 1905-1915)', async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/f', 'v1');
    expect(await b.fs.get('home/d/f')).toBe('v1');
    await a.fs.put('home/d/f', 'v2');
    expect(await b.fs.get('home/d/f', { fresh: true })).toBe('v2');
    expect(await b.fs.get('home/d/f')).toBe('v2');
    await a.fs.put('home/d/g', 'x');
    expect(await names(b.fs.list('home/d', { fresh: true }))).toEqual(['f', 'g']);
    expect(await b.fs.getMetadata('home/d/g', { fresh: true })).toMatchObject({ type: 'file' });
    expect(hex(await b.pathToHash('home/d/g', { fresh: true }))).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a child is found through its PARENT's view: another tab's new directory \"does not exist\" through a cached parent until a fresh read (fs5.js:1564-1581)", async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/f', 'x');
    expect(await names(b.fs.list('home/d'))).toEqual(['f']);   // b caches home/d
    await a.fs.put('home/d/sub/g', 'y');
    await expect(b.fs.get('home/d/sub/g')).rejects.toThrow('does not exist');
    expect(await b.fs.get('home/d/sub/g', { fresh: true })).toBe('y');
  });

  test("a directory another tab deleted still resolves through a cached parent, as empty (its registry entry outlives the delete)", async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/sub/g', 'y');
    expect(await names(b.fs.list('home/d'))).toEqual(['sub']);
    await a.fs.delete('home/d/sub/g');
    expect(await a.fs.delete('home/d/sub')).toBe(true);
    expect(await names(b.fs.list('home/d/sub'))).toEqual([]);  // still linked in b's cached home/d
    await expect(collect(b.fs.list('home/d/sub', { fresh: true }))).rejects.toThrow('does not exist');
  });

  test('P0: two tabs writing one directory within 60 s both land (registry.js get/put; the transaction merges)', async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await b.fs.put('home/d/fromB1', 'x');
    net.advance(10_000);
    await a.fs.put('home/d/fromA', 'x');
    net.advance(10_000);
    await b.fs.put('home/d/fromB2', 'x');
    expect(net.filePaths()).toEqual(['home/d/fromA', 'home/d/fromB1', 'home/d/fromB2']);
  });

  test('a write resolves its path fresh: it creates missing directories, re-creates one another tab just deleted, and lands linked (fs5.js:2078-2182)', async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/sub/g', 'y');
    expect(await names(b.fs.list('home/d/sub'))).toEqual(['g']);   // b caches home/d and home/d/sub
    await a.fs.delete('home/d/sub/g');
    await a.fs.delete('home/d/sub');
    await b.fs.put('home/d/sub/h', 'z');
    expect(net.filePaths()).toEqual(['home/d/sub/h']);
    expect(await names(a.fs.list('home/d/sub', { fresh: true }))).toEqual(['h']);
  });

  test("even a write that changes nothing reads fresh, evicting stale cached copies on its path", async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/f', 'x');
    await a.fs.put('home/d/keep', 'y');
    expect(await names(b.fs.list('home/d'))).toEqual(['f', 'keep']);
    await a.fs.delete('home/d/f');
    expect(await b.fs.delete('home/d/f')).toBe(false);          // NotModified: nothing written
    expect(await names(b.fs.list('home/d'))).toEqual(['keep']);  // but b's stale copy was evicted
  });
});

describe('fake-s5 conformance (beta.56): delete', () => {
  test('false for a non-empty directory or a missing item; true otherwise; never throws', async () => {
    const net = new FakeS5Network();
    const fs = net.tab().fs;
    await fs.put('home/d/sub/c', 'x');
    expect(await fs.delete('home/d/sub')).toBe(false);
    expect(await fs.delete('home/d/sub/c')).toBe(true);
    expect(await fs.delete('home/d/sub')).toBe(true);
    expect(await fs.delete('home/d/sub')).toBe(false);
  });

  test('a delete whose parent is missing writes nothing and creates nothing (fs5.js:588-661, createParents: false)', async () => {
    const net = new FakeS5Network();
    const before = net.dirPaths();
    expect(await net.tab().fs.delete('home/ghost/vectors')).toBe(false);
    expect(net.dirPaths()).toEqual(before);
    expect(net.writes).toEqual([]);
  });

  test("emptiness is judged fresh (fs5.js:647): another tab's new child keeps the directory, its removed last child lets it go", async () => {
    const net = new FakeS5Network();
    const a = net.tab();
    const b = net.tab();
    await a.fs.put('home/d/sub/f', 'x');
    await a.fs.delete('home/d/sub/f');
    expect(await names(b.fs.list('home/d/sub'))).toEqual([]);   // b caches home/d/sub as empty
    await a.fs.put('home/d/sub/g', 'x');
    expect(await b.fs.delete('home/d/sub')).toBe(false);         // a fresh read sees g
    expect(net.filePaths()).toEqual(['home/d/sub/g']);
    expect(await names(b.fs.list('home/d/sub'))).toEqual(['g']);
    await a.fs.delete('home/d/sub/g');
    expect(await b.fs.delete('home/d/sub')).toBe(true);           // b's cached copy still shows g
  });

  test('a registry miss on the directory being deleted is a retryable failure, not "not empty"', async () => {
    const net = new FakeS5Network();
    const fs = net.tab().fs;
    await fs.put('home/d/sub/f', 'x');
    await fs.delete('home/d/sub/f');
    net.registryMiss('home/d/sub', 1);
    await expect(fs.delete('home/d/sub')).rejects.toMatchObject({ reason: 'entry-unavailable' });
    expect(await fs.delete('home/d/sub')).toBe(true);
  });
});
