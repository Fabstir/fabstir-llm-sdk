// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Plan §18 X1 — s5js's path errors embed `fs5://write:<rootWriteKey>@<base32 CID carrying the root encryption key>`
 * (`Directory "…" does not exist`, `Parent Directory of "…" does not exist`, `Missing write access for …`). Nothing
 * the SDK throws or logs may carry either key: every error from the SDK's S5 instances is redacted in place, before
 * any SDK code sees it, and the logical path and wording the SDK classifies by are kept.
 */

import { describe, test, expect, vi, afterEach } from 'vitest';

const KEY = 'uAAsecretWriteKey_-9Zq';
const CID = 'bsecretrootcidwithencryptionkey';
const uri = (path: string) => `fs5://write:${KEY}@${CID}/${path}`;
const leaks = (text: string) => text.includes(KEY) || text.includes(CID);

/** Every string reachable from `value` (messages, stacks, causes, nested details), cycle-safe. */
function texts(value: unknown, seen = new Set<unknown>()): string[] {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  const out: string[] = [];
  for (const k of new Set([...Object.getOwnPropertyNames(value), 'message', 'stack', 'cause'])) {
    out.push(...texts((value as any)[k], seen));
  }
  return out;
}
const leaksAnywhere = (value: unknown) => texts(value).some(leaks);

function pathNotFound(message: string): Error {
  return Object.assign(new Error(message), { code: 'S5_PATH_NOT_FOUND' });
}

let fsImpl: Record<string, any> = {};
vi.mock('@julesl23/s5js', () => ({
  isS5RegistryUnavailableError: () => false, // beta.56's root export (§19 Z1)
  S5: {
    create: async () => ({
      recoverIdentityFromSeedPhrase: async () => undefined,
      registerOnNewPortal: async () => undefined,
      getConnectionStatus: () => 'connected',
      onConnectionChange: (cb: (s: string) => void) => { cb('connected'); return () => {}; },
      get fs() { return fsImpl; },
    }),
  },
}));

import { redactS5Text, redactS5Error, withS5Guards } from '../../src/storage/s5-guards';
import { SealedIO } from '../../src/storage/sealed/sealed-io';
import { StorageManager } from '../../src/managers/StorageManager';
import { DocumentManager } from '../../src/managers/DocumentManager';
import { SEED, ADDR, sealer } from '../helpers/sealed-fixtures';

afterEach(() => { fsImpl = {}; vi.restoreAllMocks(); });

describe('text and errors', () => {
  test('both keys go; the logical path and the wording stay', () => {
    const out = redactS5Text(`Directory "${uri('home/rag/v1/abc')}" does not exist`);
    expect(leaks(out)).toBe(false);
    expect(out).toBe('Directory "fs5://[redacted]/home/rag/v1/abc" does not exist');
  });

  test('a URI at the end of a message, and several in one', () => {
    expect(leaks(redactS5Text(`Missing write access for ${uri('home/x')}`))).toBe(false);
    expect(leaks(redactS5Text(`a ${uri('p')} b "${uri('q')}"`))).toBe(false);
  });

  test('in place: message, stack and every cause; code, reason and class survive', () => {
    class S5DirectoryLoadError extends Error {
      code = 'S5_DIRECTORY_LOAD_ERROR';
      retryable = true;
      reason = 'entry-unavailable';
    }
    const inner = pathNotFound(`Parent Directory of "${uri('home/a')}" does not exist`);
    const outer = new S5DirectoryLoadError(`cannot load ${uri('home')}`, { cause: inner });
    const agg = new AggregateError([outer], `both ${uri('x')}`);
    expect(redactS5Error(agg)).toBe(agg);
    expect(leaksAnywhere(agg)).toBe(false);
    expect(outer).toBeInstanceOf(S5DirectoryLoadError);
    expect([outer.code, outer.retryable, outer.reason, (inner as any).code])
      .toEqual(['S5_DIRECTORY_LOAD_ERROR', true, 'entry-unavailable', 'S5_PATH_NOT_FOUND']);
    expect(inner.message).toBe('Parent Directory of "fs5://[redacted]/home/a" does not exist');
  });

  test('an inherited stack (Firefox and Safari define `stack` on Error.prototype) is redacted too', () => {
    const e = Object.assign(Object.create({ stack: `Error: x\n    at ${uri('home/a')}` }), { message: 'x' });
    redactS5Error(e);
    expect(leaks(e.stack)).toBe(false);
  });

  test('a cause cycle terminates; a thrown string is redacted', () => {
    const e: any = new Error(`x ${uri('a')}`);
    e.cause = e;
    redactS5Error(e);
    expect(leaks(e.message)).toBe(false);
    expect(leaks(redactS5Error(`y ${uri('b')}`) as string)).toBe(false);
  });
});

describe('the instance wrapper', () => {
  const secretError = () => pathNotFound(`Directory "${uri('home/x')}" does not exist`);

  test('a rejected fs call is redacted, and it is the same error', async () => {
    const err = secretError();
    const s5 = withS5Guards({ fs: { get: async () => { throw err; } } });
    const caught = await s5.fs.get('home/x').catch((e: unknown) => e);
    expect(caught).toBe(err);
    expect(leaksAnywhere(caught)).toBe(false);
  });

  test("list's iterator: entries pass, a later rejection is redacted", async () => {
    const s5 = withS5Guards({
      fs: { async *list() { yield { name: 'a' }; throw secretError(); } },
    });
    const seen: string[] = [];
    const caught = await (async () => { for await (const e of s5.fs.list('home')) seen.push(e.name); })()
      .catch((e: unknown) => e);
    expect(seen).toEqual(['a']);
    expect(leaksAnywhere(caught)).toBe(false);
  });

  test('a synchronous throw is redacted; a top-level method too', async () => {
    const s5 = withS5Guards({
      recoverIdentityFromSeedPhrase: async () => { throw secretError(); },
      fs: { now: () => { throw secretError(); } },
    });
    expect(leaksAnywhere((() => { try { s5.fs.now(); } catch (e) { return e; } })())).toBe(false);
    expect(leaksAnywhere(await s5.recoverIdentityFromSeedPhrase('s').catch((e: unknown) => e))).toBe(false);
  });

  test('results, properties and `this` are untouched: methods run on the real object', async () => {
    const bytes = new Uint8Array([1, 2]);
    const api = { tag: 'api' };
    class Fs { #secret = bytes; api = api; async get() { return this.#secret; } }
    const fs = new Fs();
    const s5 = withS5Guards({ fs });
    expect(await s5.fs.get('p')).toBe(bytes);
    const { get } = s5.fs;
    expect(await get('p')).toBe(bytes);
    expect(s5.fs.api).toBe(api);
    expect(s5.fs).toBeInstanceOf(Fs);
  });

  test('the SDK still classifies a redacted absence as certain, and a parent miss as a failure', async () => {
    const io = (err: Error) => new SealedIO(
      withS5Guards({ fs: { get: async () => { throw err; } }, downloadByCID: async () => new Uint8Array() }) as any,
      () => true,
    );
    expect(await io(secretError()).readPath('home/x')).toEqual({ state: 'absent' });
    const failure = await io(pathNotFound(`Parent Directory of "${uri('home/x')}" does not exist`))
      .readPath('home/x').catch((e: unknown) => e);
    expect(failure).toMatchObject({ code: 'S5_IO_ERROR', details: { s5Code: 'S5_PATH_NOT_FOUND', retryable: true } });   // §19 Z19
    expect(leaksAnywhere(failure)).toBe(false);
    expect((failure as Error).message).toContain('home/x');
  });
});

describe("the SDK's S5 instances", () => {
  function captureConsole(): unknown[][] {
    const calls: unknown[][] = [];
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => { calls.push(args); });
    }
    return calls;
  }

  test('StorageManager hands every consumer a redacting instance', async () => {
    captureConsole();
    fsImpl = {
      ensureIdentityInitialized: async () => undefined,
      get: async () => { throw pathNotFound(`Directory "${uri('home/x')}" does not exist`); },
    };
    const sm = new StorageManager();
    await sm.initialize(SEED, ADDR);
    const caught = await sm.getS5Client().fs.get('home/x').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(leaksAnywhere(caught)).toBe(false);
  });

  test('a failing identity setup: neither the thrown error nor any log carries a key', async () => {
    const calls = captureConsole();
    fsImpl = {
      ensureIdentityInitialized: async () => {
        throw pathNotFound(`Parent Directory of "${uri('home/archive')}" does not exist`);
      },
    };
    const caught = await new StorageManager().initialize(SEED, ADDR).catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(leaksAnywhere(caught)).toBe(false);
    expect(calls.length).toBeGreaterThan(0);
    expect(leaksAnywhere(calls)).toBe(false);
  });

  test("DocumentManager's own instance is redacting too", async () => {
    captureConsole();
    fsImpl = {
      ensureIdentityInitialized: async () => undefined,
      get: async () => { throw pathNotFound(`Directory "${uri('home/documents/x')}" does not exist`); },
    };
    const dm = new DocumentManager();
    await dm.initialize(SEED, ADDR);
    const caught = await (dm as any).s5Client.fs.get('home/documents/x').catch((e: unknown) => e);
    expect(caught).toBeInstanceOf(Error);
    expect(leaksAnywhere(caught)).toBe(false);
  });
});

describe('§19 Z6 — scrubbing never throws, and never loses the error', () => {
  test('an error whose message has only a getter (a DOMException) is scrubbed in place, not replaced by a TypeError', async () => {
    const quota = new DOMException(`quota exceeded under ${uri('home/x')}`, 'QuotaExceededError');
    const s5 = withS5Guards({ fs: { get: async () => { throw quota; } } });
    const caught: any = await s5.fs.get('home/x/y').catch((e: unknown) => e);
    expect(caught).toBe(quota);
    expect(caught.name).toBe('QuotaExceededError');
    expect(leaksAnywhere(caught)).toBe(false);
  });

  test('a getter-only message with nothing to scrub is left alone', async () => {
    const aborted = new DOMException('The transaction was aborted', 'AbortError');
    const s5 = withS5Guards({ fs: { get: async () => { throw aborted; } } });
    const caught: any = await s5.fs.get('p').catch((e: unknown) => e);
    expect(caught).toBe(aborted);
    expect(caught.message).toBe('The transaction was aborted');
  });

  test('a frozen error with nothing to scrub comes back as it is', () => {
    const frozen = Object.freeze(Object.assign(new Error('The transaction was aborted'), { code: 'X' }));
    expect(redactS5Error(frozen)).toBe(frozen);
  });

  test('an error that cannot be rewritten is replaced by one with the redacted text and its name, code, reason and retryable', () => {
    const frozen = Object.freeze(Object.assign(new Error(`cannot load ${uri('home/a')}`), { code: 'S5_X', reason: 'entry-unavailable', retryable: true }));
    const out = redactS5Error(frozen) as any;
    expect(out).not.toBe(frozen);
    expect(leaksAnywhere(out)).toBe(false);
    expect(out.message).toBe('cannot load fs5://[redacted]/home/a');
    expect(out).toMatchObject({ name: 'Error', code: 'S5_X', reason: 'entry-unavailable', retryable: true });
  });
});

describe('§19 Z12 — wrappers follow the objects behind them', () => {
  test('a new fs behind the same instance is the one used (s5js resets its fs on identity recovery)', async () => {
    const raw: any = { _fs: { get: async () => 'alice' }, get fs() { return this._fs; } };
    const s5 = withS5Guards(raw);
    expect(await s5.fs.get('p')).toBe('alice');
    raw._fs = { get: async () => 'bob' };
    expect(await s5.fs.get('p')).toBe('bob');
  });

  test('a method reassigned after first use is the one called', async () => {
    const fs: any = { get: async () => 1 };
    const s5 = withS5Guards({ fs });
    expect(await s5.fs.get('p')).toBe(1);
    fs.get = async () => 2;
    expect(await s5.fs.get('p')).toBe(2);
  });
});

describe('§19 Z17 — the S5 instance refuses plaintext into a RAG root', () => {
  const sealed = () => sealer().seal({ kind: 'text', value: 'x' }, 'ctx');

  test('legacy RAG paths never, the sealed root only sealed bytes; everything else untouched', async () => {
    const puts: string[] = [];
    const s5 = withS5Guards({ fs: { put: async (p: string) => { puts.push(p); } } });
    for (const [path, data] of [
      [`home/vector-databases/${ADDR}/Notes/manifest.json`, { name: 'Notes' }],
      ['/home//rag/v1/abc/manifest', new Uint8Array([1, 2, 3])],
      ['home/rag/v1/abc/manifest', 'plain text'],
    ] as const) {
      await expect(s5.fs.put(path, data)).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED', details: { retryable: false } });
    }
    await expect(s5.fs.put(`home/vector-databases/${ADDR}/Notes/manifest.json`, sealed())).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await s5.fs.put('home/rag/v1/abc/manifest', sealed());
    await s5.fs.put('home/sessions/x/y.json', { a: 1 });
    expect(puts).toEqual(['home/rag/v1/abc/manifest', 'home/sessions/x/y.json']);
  });

  test("the UI's direct s5Client.fs.put through StorageManager's instance is refused too", async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const written: string[] = [];
    fsImpl = { ensureIdentityInitialized: async () => undefined, put: async (p: string) => { written.push(p); } };
    const sm = new StorageManager();
    await sm.initialize(SEED, ADDR);
    await expect(sm.getS5Client().fs.put(`home/vector-databases/${ADDR}/Notes/manifest.json`, { name: 'Notes' }))
      .rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    expect(written).toEqual([]);
  });
});

describe('§19 Z8 — the SDK binds its sealers to the address they serve', () => {
  test('StorageManager and DocumentManager seal for (seed, address)', async () => {
    const { storageSealerFromSeed } = await import('../../src/storage/sealed/StorageSealer');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fsImpl = { ensureIdentityInitialized: async () => undefined };
    const expected = storageSealerFromSeed(SEED, ADDR).deriveId('conv', '5');
    const sm = new StorageManager();
    await sm.initialize(SEED, ADDR);
    expect((sm as any).sealer.deriveId('conv', '5')).toBe(expected);
    const dm = new DocumentManager();
    await dm.initialize(SEED, ADDR);
    expect((dm as any).sealer.deriveId('conv', '5')).toBe(expected);
  });
});

describe('§20 AA5 — the refusal sits on the real fs, so s5js\'s own writers go through it', () => {
  test('putImage into a RAG root is refused, and so is createFile', async () => {
    const { FS5 } = await import('../../node_modules/@julesl23/s5js/dist/src/fs/fs5.js' as any);
    const writes: string[] = [];
    const realFs: any = Object.create(FS5.prototype);
    realFs.put = async (path: string) => { writes.push(path); };
    realFs.createFile = async (dir: string, name: string) => { writes.push(`${dir}/${name}`); };
    const s5: any = withS5Guards({ fs: realFs });
    const blob = new Blob([new TextEncoder().encode('plaintext RAG body')], { type: 'image/png' });
    await expect(s5.fs.putImage('home/rag/v1/abc/documents/leak', blob, { generateThumbnail: false, extractMetadata: false }))
      .rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await expect(s5.fs.createFile(`home/vector-databases/${ADDR}/Notes`, 'x.json', {})).rejects.toMatchObject({ code: 'RAG_PLAINTEXT_WRITE_REFUSED' });
    await s5.fs.createFile('home/other', 'x.json', {});
    expect(writes).toEqual(['home/other/x.json']);
  });
});

