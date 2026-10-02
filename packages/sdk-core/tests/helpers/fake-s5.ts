// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * A fake of @julesl23/s5js 0.9.0-beta.56 — the version sdk-core 1.39.0 pins — faithful in exactly the behaviours
 * the sealed-storage design depends on. Each rule cites the beta.56 dist it mirrors;
 * `tests/storage/sealed/fake-s5-conformance.test.ts` pins them so a drift in the fake fails loudly.
 *
 * One `FakeS5Network` is "the portal" together with the origin's shared registry: registry reads return the newest
 * entry and writes compare-and-put (registry.js, beta.56 P0), so tabs never lose each other's writes. Each `tab()`
 * is one browser tab's S5 instance with its own 30 s directory cache (fs5.js:1822-1867). A default read resolves a
 * path through cached parents; a fresh read (`{ fresh: true }`) and every write resolve it through the newest ones.
 */

import { encode, decode } from 'cbor-x';
import { blake3 } from '@noble/hashes/blake3';

type FileEntry = { type: 'file'; hash: string; size: number; mediaType: string };
type Entry = FileEntry | { type: 'directory' };
type Dir = Map<string, Entry>;
type Op = 'put' | 'get' | 'getMetadata' | 'list' | 'delete' | 'download';
type ReadOptions = { fresh?: boolean };

/** fs5.js:20-60 — extension wins over the data-type default. Subset used by the tests. */
const MEDIA_BY_EXT: Record<string, string> = {
  json: 'application/json', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
  pdf: 'application/pdf', png: 'image/png', html: 'text/html',
};

/** fs5.js `get` — the only media types it returns untouched. */
function isBinaryMediaType(mt: string): boolean {
  return mt === 'application/octet-stream' || /^(image|audio|video)\//.test(mt) ||
    ['application/zip', 'application/gzip', 'application/x-tar', 'application/x-7z-compressed',
      'application/pdf', 'application/x-msdownload'].includes(mt);
}

/**
 * The root write URI s5js embeds in its path errors (fs5.js `_buildRootWriteURI`). A fake key and CID, so the SDK's
 * scrubbing (plan §18 X1) is exercised by every suite; no digits, so no "404" can appear in it.
 */
export const FAKE_ROOT_URI = 'fs5://write:uFakeRootWriteKey_fake@bfakerootcidwithencryptionkey';
const uriOf = (dir: string) => `${FAKE_ROOT_URI}/${dir}`;

/** fs5.js:47-60 — `getKeySet`'s path misses carry a code; the message wording is kept for consumers. */
function pathNotFound(message: string): Error {
  return Object.assign(new Error(message), { code: 'S5_PATH_NOT_FOUND' });
}

const LOAD_MESSAGES = {
  // errors.js:75-84
  'blob-unavailable': 'directory blob is temporarily unavailable (404); likely a transient propagation failure — retry. Refusing to treat it as empty (that would drop data).',
  // fs5.js:1888-1890
  'entry-unavailable': 'Linked directory is unavailable: its parent links it (so it was published), but this node has no registry entry for it and no peer supplied one — likely a propagation delay; retry. Refusing to treat it as empty (that would orphan existing data).',
} as const;

/** errors.js — `S5DirectoryLoadError`: retryable, with a stable code and the reason it could not load. */
export class S5DirectoryLoadError extends Error {
  readonly name = 'S5DirectoryLoadError';
  readonly retryable = true;
  readonly code = 'S5_DIRECTORY_LOAD_ERROR';
  constructor(readonly reason: keyof typeof LOAD_MESSAGES, readonly path: string) {
    super(LOAD_MESSAGES[reason]);
  }
}

export const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h: string) => Uint8Array.from(h.match(/../g)!.map((x) => parseInt(x, 16)));
const norm = (p: string) => p.split('/').filter(Boolean).join('/');
const parentOf = (p: string) => p.split('/').slice(0, -1).join('/');
const nameOf = (p: string) => p.split('/').pop()!;
const isPathMiss = (e: unknown) => (e as { code?: unknown } | undefined)?.code === 'S5_PATH_NOT_FOUND';

function sameDir(a: Dir, b: Dir): boolean {
  if (a.size !== b.size) return false;
  for (const [name, e] of a) {
    const o = b.get(name);
    if (!o || o.type !== e.type || (e.type === 'file' && (o as FileEntry).hash !== e.hash)) return false;
  }
  return true;
}

export class FakeS5Network {
  readonly blobs = new Map<string, Uint8Array>();
  /** Authoritative directory tree — the newest registry entry of every directory. Key '' is the root. */
  readonly dirs = new Map<string, Dir>([['', new Map<string, Entry>([['home', { type: 'directory' }]])], ['home', new Map()]]);
  /** Every file write, in order, with the exact stored bytes — scanned by the confidentiality tests. */
  readonly writes: Array<{ path: string; bytes: Uint8Array }> = [];
  now = 0;
  /** Real (macrotask) delay per fs operation, so concurrent callers genuinely interleave. */
  latencyMs = 0;
  private faults: Array<{ op: Op; match: (p: string) => boolean; make: (p: string) => Error; times: number }> = [];
  private readonly misses = new Map<string, number>();

  advance(ms: number): void { this.now += ms; }

  /** Inject a failure for the next `times` calls of `op` on a matching path. */
  fail(op: Op, path: string | RegExp, kind: 'dir404' | 'network' | Error, times = 1): void {
    const match = typeof path === 'string' ? (p: string) => p === norm(path) : (p: string) => path.test(p);
    const make = (p: string) => kind === 'dir404' ? new S5DirectoryLoadError('blob-unavailable', p)
      : kind === 'network' ? new Error('WebSocket connection closed') : kind;
    this.faults.push({ op, match, make, times });
  }

  /**
   * The next `times` registry reads of directory `dir` get no answer. A linked directory (any but the root) then
   * fails with retryable `entry-unavailable` — reads and writes alike (fs5.js:1880-1897); the root reads as
   * unvouched, so a path below it throws `Parent Directory of "…" does not exist` (fs5.js:1564-1577). A read
   * this tab's cache answers consults no registry and consumes nothing.
   */
  registryMiss(dir: string, times = 1): void {
    this.misses.set(norm(dir), times);
  }

  /** @internal One registry read of `dir`: false when it gets no answer. */
  answers(dir: string): boolean {
    const left = this.misses.get(dir) ?? 0;
    if (left === 0) return true;
    this.misses.set(dir, left - 1);
    return false;
  }

  async tick(): Promise<void> {
    if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
  }

  fault(op: Op, path: string): void {
    const f = this.faults.find((x) => x.op === op && x.times > 0 && x.match(path));
    if (!f) return;
    f.times -= 1;
    throw f.make(path);
  }

  tab(opts: { dirCacheTtlMs?: number } = {}): FakeS5Tab {
    return new FakeS5Tab(this, opts.dirCacheTtlMs ?? 30_000);
  }

  /** Every file path currently in the authoritative tree. */
  filePaths(): string[] {
    const out: string[] = [];
    for (const [dir, entries] of this.dirs) {
      for (const [name, e] of entries) if (e.type === 'file') out.push(dir ? `${dir}/${name}` : name);
    }
    return out.sort();
  }

  dirPaths(): string[] { return [...this.dirs.keys()].filter(Boolean).sort(); }
}

export class FakeS5Tab {
  private cache = new Map<string, { at: number; snap: Dir }>();

  constructor(private readonly net: FakeS5Network, private readonly ttlMs: number) {}

  /** Let time pass on this tab's network (its caches age). */
  elapse = async (ms: number): Promise<void> => { this.net.advance(ms); };

  /**
   * `_getDirectoryMetadata` (fs5.js:1822-1867): a default read is answered by this tab's cache for 30 s; otherwise
   * the registry answers with the newest entry. A fresh read bypasses the cache and evicts a cached copy it has
   * proved stale (`_evictIfChanged`, :1905-1915). A directory another tab deleted, reached through a stale parent,
   * reads as empty: its registry entry outlives the delete, which only removes empty directories.
   */
  private load(dir: string, fresh: boolean): Dir | undefined {
    const hit = this.cache.get(dir);
    if (!fresh && hit && this.net.now - hit.at < this.ttlMs) return hit.snap;
    if (!this.net.answers(dir)) {
      if (fresh && hit) this.cache.delete(dir);
      if (dir === '') return undefined;
      throw new S5DirectoryLoadError('entry-unavailable', dir);
    }
    const snap = new Map(this.net.dirs.get(dir) ?? new Map());
    if (!fresh) this.cache.set(dir, { at: this.net.now, snap });
    else if (hit && !sameDir(hit.snap, snap)) this.cache.delete(dir);
    return snap;
  }

  /** `getKeySet` + `_loadDirectory` (fs5.js:1524-1581, 2047-2057): a directory is found through its parent's view. */
  private resolve(dir: string, fresh: boolean): Dir | undefined {
    if (dir === '') return this.load('', fresh);
    const parent = this.resolve(parentOf(dir), fresh);
    if (parent === undefined) throw pathNotFound(`Parent Directory of "${uriOf(dir)}" does not exist`);
    if (parent.get(nameOf(dir))?.type !== 'directory') throw pathNotFound(`Directory "${uriOf(dir)}" does not exist`);
    return this.load(dir, fresh);
  }

  /**
   * `_updateDirectory` (fs5.js:2078-2100): transaction-first. The directory is resolved fresh — a linked directory
   * without a registry answer refuses, writing nothing; only a path miss creates the missing directories
   * (`_createMissingDirectories`, :2102-2182, fresh, so one another tab deleted is re-created) and transacts again.
   * The transaction applies `fn` to the newest entry (registry P0), so no other tab's write is lost. `fn` returning
   * false is NotModified: nothing written. `createParents: false` (delete): a path miss writes nothing.
   */
  private write(dir: string, fn: (d: Dir) => boolean, createParents: boolean): boolean {
    try {
      this.resolve(dir, true);
    } catch (e) {
      if (!isPathMiss(e) || !createParents) {
        if (isPathMiss(e)) return false;
        throw e;
      }
      this.createMissing(dir);
    }
    const next = new Map(this.net.dirs.get(dir)!);
    if (!fn(next)) return false;
    this.net.dirs.set(dir, next);
    this.cache.delete(dir); // a write evicts its own directory
    return true;
  }

  private createMissing(dir: string): void {
    const segs = dir.split('/').filter(Boolean);
    for (let i = 1; i <= segs.length; i++) {
      const here = segs.slice(0, i).join('/');
      try {
        this.resolve(here, true);
        continue;
      } catch (e) {
        if (!isPathMiss(e)) throw e;
      }
      const parent = parentOf(here);
      const p = new Map(this.net.dirs.get(parent)!);
      p.set(segs[i - 1], { type: 'directory' });
      this.net.dirs.set(parent, p);
      if (!this.net.dirs.has(here)) this.net.dirs.set(here, new Map());
      this.cache.delete(parent);
    }
  }

  private entry(path: string, options?: ReadOptions): Entry | undefined {
    return this.resolve(parentOf(path), !!options?.fresh)?.get(nameOf(path));
  }

  readonly fs = {
    /** fs5.js `put` — Uint8Array raw, string UTF-8, anything else CBOR; mediaType option → extension → default. */
    put: async (path: string, data: unknown, options?: { mediaType?: string }): Promise<void> => {
      path = norm(path);
      await this.net.tick();
      this.net.fault('put', path);
      let bytes: Uint8Array;
      let def: string;
      if (data instanceof Uint8Array) { bytes = new Uint8Array(data); def = 'application/octet-stream'; }
      else if (typeof data === 'string') { bytes = new TextEncoder().encode(data); def = 'text/plain'; }
      else { bytes = new Uint8Array(encode(data ?? '')); def = 'application/cbor'; }
      const ext = nameOf(path).includes('.') ? nameOf(path).split('.').pop()!.toLowerCase() : '';
      const mediaType = options?.mediaType ?? MEDIA_BY_EXT[ext] ?? def;
      const hash = hex(blake3(bytes));
      // The blob is uploaded before the directory transaction: a refused write's bytes still reached the portal.
      this.net.blobs.set(hash, bytes);
      this.net.writes.push({ path, bytes: new Uint8Array(bytes) });
      this.write(parentOf(path), (d) => { d.set(nameOf(path), { type: 'file', hash, size: bytes.length, mediaType }); return true; }, true);
    },

    /** fs5.js `get` (:206) — binary media types return bytes; otherwise CBOR → JSON → strict UTF-8 → bytes. */
    get: async (path: string, options?: ReadOptions): Promise<unknown> => {
      path = norm(path);
      await this.net.tick();
      this.net.fault('get', path);
      const e = this.entry(path, options);
      if (!e || e.type !== 'file') return undefined;
      const bytes = new Uint8Array(this.net.blobs.get(e.hash)!);
      if (isBinaryMediaType(e.mediaType)) return bytes;
      try {
        const v = decode(bytes);
        return v instanceof Map ? Object.fromEntries(v) : v;
      } catch { /* not CBOR */ }
      try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { /* not JSON */ }
      try {
        const t = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!/[\x00-\x08\x0e-\x1f]/.test(t)) return t;
      } catch { /* not text */ }
      return bytes;
    },

    getMetadata: async (path: string, options?: ReadOptions): Promise<Record<string, unknown> | undefined> => {
      path = norm(path);
      this.net.fault('getMetadata', path);
      const e = this.entry(path, options);
      if (!e) return undefined;
      return e.type === 'file' ? { type: 'file', name: nameOf(path), size: e.size, mediaType: e.mediaType } : { type: 'directory', name: nameOf(path) };
    },

    /** fs5.js `list` (:669-673) — an async generator: a path miss surfaces on first iteration; an unvouched root is empty. */
    list: (path: string, options?: ReadOptions): AsyncIterable<Record<string, unknown>> => {
      const self = this;
      return (async function* () {
        const dir = norm(path);
        self.net.fault('list', dir);
        const d = self.resolve(dir, !!options?.fresh);
        if (!d) return;
        const files = [...d].filter(([, e]) => e.type === 'file').sort(([a], [b]) => a.localeCompare(b));
        const dirs = [...d].filter(([, e]) => e.type === 'directory');
        for (const [name, e] of [...files, ...dirs]) {
          yield e.type === 'file' ? { name, type: 'file', size: e.size, mediaType: e.mediaType } : { name, type: 'directory' };
        }
      })();
    },

    /**
     * fs5.js `delete` (:573-663) — false for a missing item or a non-empty directory; a missing parent writes
     * nothing (`createParents: false`); a directory's emptiness is judged fresh (:647).
     */
    delete: async (path: string): Promise<boolean> => {
      path = norm(path);
      await this.net.tick();
      this.net.fault('delete', path);
      return this.write(parentOf(path), (d) => {
        const e = d.get(nameOf(path));
        if (!e) return false;
        if (e.type === 'directory') {
          if (this.load(path, true)!.size > 0) return false;
          this.net.dirs.delete(path);
        }
        d.delete(nameOf(path));
        return true;
      }, false);
    },
  };

  /** s5.d.ts / api.js — a 32-byte BLAKE3 hash in, the exact stored bytes out. */
  downloadByCID = async (hash: Uint8Array): Promise<Uint8Array> => {
    const h = hex(hash);
    this.net.fault('download', h);
    if (hash.length !== 32) throw new Error(`Invalid CID size: expected 32 bytes, got ${hash.length} bytes`);
    const b = this.net.blobs.get(h);
    if (!b) throw new Error(`Blob ${h.slice(0, 16)}… 404 not found on any portal`);
    return new Uint8Array(b);
  };

  /** fs5-advanced.js:65 — `FS5Advanced.pathToCID(path, { fresh })`: the file's 32-byte hash, or `Path not found`. */
  pathToHash = async (path: string, options?: ReadOptions): Promise<Uint8Array> => {
    path = norm(path);
    const e = this.entry(path, options);
    if (!e || e.type !== 'file') throw new Error(`Path not found: ${path}`);
    return unhex(e.hash);
  };
}
