// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sealed-file I/O over s5js. Every rule here is a consequence of how s5js (0.9.0-beta.56) behaves:
 *
 * - Only sealed envelopes are written (a plaintext write is refused, so nothing unsealed reaches a RAG path).
 * - A sealed file read by path comes back byte-exact: its 0xFF lead byte fails s5js's CBOR, JSON and
 *   strict-UTF-8 guesses by construction, so `get()` returns the raw bytes.
 * - Content is addressed by its BLAKE3 hash — S5's own blob identity — so a stale directory view can never
 *   serve an old version of a file whose hash the manifest recorded.
 * - "Absent" is only what s5js reports as absent. A retryable failure is an error, never an empty result:
 *   treating it as absence is how a transient blip becomes an overwrite or a lost vector. Every read is fresh
 *   (§18 B1) and a registry miss throws (s5js D3b), so what s5js does report as absent is certain.
 * - Deletes act only on paths taken from a listing, or one just checked (`deleteFile`).
 * - Every failure carries a code: s5js's own (`S5_DIRECTORY_LOAD_ERROR`, with `retryable`), or `S5_IO_ERROR`.
 */

import { blake3 } from '@noble/hashes/blake3';
import { SDKError } from '../../types';
import { bytesToHex, hexToBytes } from '../../crypto/utilities';

/** s5js beta.56 reads: `fresh` resolves the whole path through the newest directories, not the 30 s cache. */
export interface S5ReadOptions { fresh?: boolean }

export interface S5FsLike {
  put(path: string, data: unknown, options?: { mediaType?: string }): Promise<void>;
  get(path: string, options?: S5ReadOptions): Promise<unknown>;
  list(path: string, options?: S5ReadOptions): AsyncIterable<{ name: string; type: string }>;
  delete(path: string): Promise<boolean>;
}

export interface S5Like {
  fs: S5FsLike;
  downloadByCID(hash: Uint8Array): Promise<Uint8Array>;
}

/** `FS5Advanced.pathToCID` — a file's 32-byte blob hash. */
export type PathToHash = (path: string, options?: S5ReadOptions) => Promise<Uint8Array>;

/**
 * §18 B1: every read here is fresh. beta.56 finds a directory through its parent's view, and a default read takes
 * that view from a 30 s per-tab cache — so a directory or file another tab or device wrote inside the window would
 * read as absent. Fresh, "absent" is certain (same origin), and so is every decision taken on it.
 */
const FRESH: S5ReadOptions = { fresh: true };

/**
 * `absent`: s5js threw its "does not exist" (a directory on the path is not there) or `get()` found nothing in the
 * directory. Both are certain: the read is fresh and a registry miss throws (§18 B1, s5js D3b).
 */
export type PathRead = { state: 'absent' } | { state: 'sealed'; bytes: Uint8Array } | { state: 'plain'; value: unknown };

export interface ListEntry { name: string; type: 'file' | 'directory'; mediaType?: string }

/**
 * True only when s5js says the thing is not there — its two absence shapes: `Path not found: …`
 * (FS5Advanced.pathToCID) and `Directory "…" does not exist` (a resolved parent that does not list it).
 * `Parent Directory of "…" does not exist` is NOT absence: the parent itself did not resolve (a registry
 * miss). Retryable, 404-flavoured and network failures (including a blob "not found") are errors.
 */
export function isS5Absent(err: unknown): boolean {
  const e = err as { message?: unknown; name?: unknown; retryable?: unknown } | undefined;
  if (!e || typeof e.message !== 'string' || e.retryable === true || e.name === 'S5DirectoryLoadError') return false;
  // The whole message has s5js's own shape, whatever the path inside it holds — a session "404", a database named
  // "Error 404 notes" (§17 W2). Anchored, so a network error merely quoting one ("HTTP 404: …") is not absence.
  return /^Directory ".*" does not exist$/s.test(e.message) || e.message.startsWith('Path not found: ');
}

/**
 * Whether retrying may help: the error's own verdict (an SDKError's `details.retryable`, s5js's `retryable`), else
 * true — an unclassified storage failure (a network drop, a registry miss) may pass. One rule everywhere (§17 W4).
 */
export function retryableOf(err: unknown): boolean {
  const e = err as { retryable?: unknown; details?: { retryable?: unknown } } | undefined;
  if (typeof e?.details?.retryable === 'boolean') return e.details.retryable;
  return typeof e?.retryable === 'boolean' ? e.retryable : true;
}

/**
 * One shape for every storage failure (§15 T7): an SDKError with `details.retryable` and `details.cause`. s5js's
 * own code is kept (S5_DIRECTORY_LOAD_ERROR); anything uncoded is S5_IO_ERROR. `retryable` is s5js's verdict
 * when it gives one, else true — an I/O failure (a network drop, a parent's registry miss) may pass.
 */
function ioFailure(op: string, path: string, err: unknown): unknown {
  if (err instanceof SDKError) return err;
  const e = err as { code?: unknown; retryable?: unknown; message?: unknown } | undefined;
  const s5Code = typeof e?.code === 'string' ? e.code : undefined;
  // s5js's S5_PATH_NOT_FOUND arriving here is the uncertain one — `Parent Directory of …`, an unvouched root; the
  // certain one was already absence. It must not read as "not found" (§19 Z19): S5_IO_ERROR, its code kept aside.
  const pathMiss = s5Code === 'S5_PATH_NOT_FOUND';
  const code = s5Code === undefined || pathMiss ? 'S5_IO_ERROR' : s5Code;
  const message = typeof e?.message === 'string' ? e.message : String(err);
  return new SDKError(`S5 ${op} of ${path} failed: ${message}`, code, {
    op, path, cause: err, retryable: retryableOf(err), ...(pathMiss ? { s5Code } : {}),
  });
}

/** S5's blob identity: BLAKE3 of the stored bytes, hex. */
export function sealedBlobHash(bytes: Uint8Array): string {
  return bytesToHex(blake3(bytes));
}

export class SealedIO {
  constructor(
    private readonly s5: S5Like,
    private readonly isSealed: (bytes: Uint8Array) => boolean,
    private readonly pathToHash?: PathToHash,
  ) {}

  /** @returns the blob hash (hex) of what was written. */
  async write(path: string, bytes: Uint8Array): Promise<string> {
    if (!this.isSealed(bytes)) {
      throw new SDKError(`Refusing to write unsealed bytes to ${path}`, 'RAG_PLAINTEXT_WRITE_REFUSED', { path, retryable: false });
    }
    await this.s5.fs.put(path, bytes, { mediaType: 'application/octet-stream' }).catch((err) => { throw ioFailure('put', path, err); });
    return sealedBlobHash(bytes);
  }

  async readPath(path: string): Promise<PathRead> {
    let value: unknown;
    try {
      value = await this.s5.fs.get(path, FRESH);
    } catch (err) {
      if (isS5Absent(err)) return { state: 'absent' };
      throw ioFailure('get', path, err);
    }
    if (value === undefined) return { state: 'absent' };
    // Returned as-is (no copy): nothing here mutates it, and open() decrypts into a new buffer.
    if (value instanceof Uint8Array && this.isSealed(value)) return { state: 'sealed', bytes: value };
    return { state: 'plain', value };
  }

  /** Content-addressed read. A hash the manifest references is never "absent": a failure throws. */
  async readHash(hashHex: string): Promise<Uint8Array> {
    return this.s5.downloadByCID(hexToBytes(hashHex)).catch((err) => { throw ioFailure('download', hashHex, err); });
  }

  /** The stored blob hash (hex) of the file at `path` — no download — or undefined if it is not there. */
  async hashOf(path: string): Promise<string | undefined> {
    if (!this.pathToHash) throw new SDKError('SealedIO.hashOf needs pathToHash', 'RAG_IO_MISCONFIGURED', { retryable: false });
    try {
      return bytesToHex(await this.pathToHash(path, FRESH));
    } catch (err) {
      if (isS5Absent(err)) return undefined;
      throw ioFailure('hash', path, err);
    }
  }

  /** A legacy file's exact bytes (never through `get()`'s format guessing), or undefined if it is not there. */
  async readRaw(path: string): Promise<Uint8Array | undefined> {
    if (!this.pathToHash) throw new SDKError('SealedIO.readRaw needs pathToHash', 'RAG_IO_MISCONFIGURED', { retryable: false });
    let hash: Uint8Array;
    try {
      hash = await this.pathToHash(path, FRESH);
    } catch (err) {
      if (isS5Absent(err)) return undefined;
      throw ioFailure('hash', path, err);
    }
    return this.s5.downloadByCID(hash).catch((err) => { throw ioFailure('download', path, err); });
  }

  async list(dir: string): Promise<ListEntry[] | undefined> {
    const out: ListEntry[] = [];
    try {
      for await (const e of this.s5.fs.list(dir, FRESH) as AsyncIterable<{ name: string; type: string; mediaType?: string }>) {
        out.push(e.type === 'directory' ? { name: e.name, type: 'directory' } : { name: e.name, type: 'file', mediaType: e.mediaType });
      }
    } catch (err) {
      if (isS5Absent(err)) return undefined;
      throw ioFailure('list', dir, err);
    }
    return out;
  }

  /**
   * Remove a directory only if s5js itself finds it empty, on a fresh read (fs5.js:647) — never recursive, so a file
   * written since keeps it. @returns whether it was removed.
   */
  async deleteDir(dir: string): Promise<boolean> {
    return this.s5.fs.delete(dir).catch((err) => { throw ioFailure('delete', dir, err); });
  }

  /**
   * Delete one file, with no listing first: a caller that has just checked it (a hash) needs nothing else to run in
   * between (§19 Z9). beta.56's delete writes nothing when the file or a parent is missing. @returns whether removed.
   */
  async deleteFile(path: string): Promise<boolean> {
    return this.s5.fs.delete(path).catch((err) => { throw ioFailure('delete', path, err); });
  }

  /**
   * Delete the named files from `dir`, but only those its listing shows. s5js's delete transaction reads the
   * directory fresh, so `false` means the file is already gone (§16 V1). Only a delete that THREW leaves a file in
   * doubt.
   */
  async deleteFiles(dir: string, names: string[]): Promise<void> {
    const entries = await this.list(dir);
    if (!entries) return;
    const present = new Set(entries.filter((e) => e.type === 'file').map((e) => e.name));
    let cause: unknown;
    const failed: string[] = [];
    for (const name of names.filter((n) => present.has(n))) {
      try {
        await this.s5.fs.delete(`${dir}/${name}`);
      } catch (error) {
        cause = error;
        failed.push(name);
      }
    }
    if (!failed.length) return;
    const still = new Set(((await this.list(dir)) ?? []).map((e) => e.name));
    const remaining = failed.filter((n) => still.has(n)).map((n) => `${dir}/${n}`);
    if (remaining.length) throw this.incomplete(dir, remaining, cause);
  }

  /**
   * Delete everything under `dir`, depth-first, then `dir` itself; top-level names in `last` go after everything
   * else (a sealed database's manifest — §16 V5). A missing `dir` is a no-op that creates nothing. A file whose
   * delete returns false is gone (see `deleteFiles`); after a thrown delete or a refused directory, what is
   * still listed — minus what s5js already said is gone — remains. @returns whether `dir` existed.
   */
  async deleteTree(dir: string, opts: { last?: string[] } = {}): Promise<boolean> {
    let cause: unknown;
    let doubtful = false;
    const gone = new Set<string>();
    const del = async (path: string, isDir: boolean) => {
      try {
        if (!(await this.s5.fs.delete(path))) {
          if (isDir) doubtful = true;
          else gone.add(path);
        }
      } catch (err) {
        cause = err;
        doubtful = true;
      }
    };
    const walk = async (d: string, top: boolean): Promise<boolean> => {
      const entries = await this.list(d);
      if (!entries) return false;
      const last = new Set(top ? opts.last ?? [] : []);
      for (const e of entries.filter((x) => !last.has(x.name))) {
        if (e.type === 'directory') await walk(`${d}/${e.name}`, false);
        await del(`${d}/${e.name}`, e.type === 'directory');
      }
      // Anything in doubt keeps the `last` names (and so the directory): it can be deleted again.
      if (!doubtful) for (const e of entries.filter((x) => last.has(x.name))) await del(`${d}/${e.name}`, e.type === 'directory');
      return true;
    };
    if (!(await walk(dir, true))) return false;
    if (!doubtful) await del(dir, true);
    if (!doubtful) return true;
    const remaining = (await this.listFiles(dir)).filter((p) => !gone.has(p));
    if (remaining.length) throw this.incomplete(dir, remaining, cause);
    return true;
  }

  /** Every file still listed under `dir`, or [] when `dir` is gone. */
  private async listFiles(dir: string): Promise<string[]> {
    const entries = await this.list(dir);
    if (!entries) return [];
    const out: string[] = [];
    for (const e of entries) {
      const path = `${dir}/${e.name}`;
      out.push(...(e.type === 'directory' ? await this.listFiles(path) : [path]));
    }
    return out;
  }

  private incomplete(dir: string, remaining: string[], cause: unknown): SDKError {
    return new SDKError(`Delete of ${dir} incomplete: ${remaining.length} item(s) remain`, 'RAG_DELETE_INCOMPLETE', { remaining, cause, retryable: true });
  }
}
