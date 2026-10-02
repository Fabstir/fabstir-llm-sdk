// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Cross-tab coherence for sealed RAG databases.
 *
 * The Web Lock serialises every manifest read-modify-write across the tabs of an origin; the read inside it is fresh
 * (s5js beta.56 — plan §18 B1), so it sees the last holder's commit. Each commit also leaves a head record — revision
 * and manifest hash, or a tombstone — in IndexedDB; a migration that purges beside a sealed copy it did not commit
 * records one too, with no hash (plan §37 RR1). Heads never override a fresh read (§19 Z5): they let a tab trust
 * its in-memory manifest cache without re-reading (a head at the cached revision AND incarnation vouches for it —
 * §20 AA4), and a tombstone says which incarnation was deleted.
 *
 * The mechanism is chosen by capability: Web Locks and IndexedDB together (a tab, a Web Worker) mean other
 * contexts can share this origin. A browser document without them — an insecure origin, a browser too old — fails
 * closed rather than use a lock other tabs cannot see (D8, S7). Anywhere else — Node (even ≥ 24.5, which has Web
 * Locks but no IndexedDB — §17 W1), React Native — no other tab exists: a module-level mutex and head map, shared by
 * every SDK instance in the process, are the complete semantics. (Sealed RAG writes copy manifests with
 * `structuredClone`: React Native's Hermes needs it polyfilled — §26 GG9.)
 *
 * RAG heads are listed, so they live in an identity scope (`scoped`); log heads are read only by a key derived from
 * the identity (S9). A head is trusted for `HEAD_TRUST_MS` after its commit; past it, the path is read again.
 * Locks are not reentrant. Composite operations take the lock once and call `*Locked` internals.
 */

import { AsyncMutex } from '../../utils/AsyncMutex';
import { SDKError } from '../../types';

/**
 * `at`: when it was recorded (stamped by `putHead` — a commit's, or a migration's vouching for a sealed copy it did not
 * commit, §37 RR1). `incarnation`: on a commit (or that vouching), the incarnation of the manifest it vouches for (§20
 * AA4); on a tombstone, the incarnation it deleted — a manifest of another incarnation is a new
 * database (plan §15 T2) — or, when no sealed one could be named, the sentinel `legacy`, which covers legacy manifests
 * only (§29 JJ1). Tombstones are this browser profile's: another device never sees them (§30 KK4).
 */
export interface RagHead { revision: number; manifestHash?: string; deleted?: boolean; incarnation?: string; at?: number }

/**
 * How long this device's caches may miss another device's change: a head vouches for a cached manifest, and a
 * complete discovery is reused, for this long; past it they are read again, fresh (§19 Z5). Other tabs of this origin
 * never wait for it — their commits change the heads at once — and writes never rely on it: they always re-read.
 * Tombstones that recorded their incarnation are kept regardless (§16 V3).
 */
export const HEAD_TRUST_MS = 30_000;

export interface RagCoherence {
  /**
   * Rejects with RAG_COHERENCE_UNAVAILABLE when locks or heads cannot work here — checked before anything
   * irreversible. In a browser it opens the head store, so an origin where IndexedDB cannot open fails too.
   */
  assertUsable(): Promise<void>;
  withLock<T>(dbId: string, fn: () => Promise<T>): Promise<T>;
  getHead(dbId: string): Promise<RagHead | undefined>;
  /**
   * The head at any age — only to recover a sealed log an outdated tab overwrote with plaintext (S2, §20 AA3): that
   * recovery is never worse than the plaintext alone, however old the head (the plaintext's fields win — §21 BB9).
   */
  getHeadAnyAge(dbId: string): Promise<RagHead | undefined>;
  putHead(dbId: string, head: RagHead): Promise<void>;
  listHeads(): Promise<Array<[string, RagHead]>>;
  /** The same locks, with head keys confined to `scope` (an identity tag): `listHeads` sees only that scope's. */
  scoped(scope: string): RagCoherence;
  /** The clock head ages are measured on — callers age their own caches on it too (§16 V2). */
  now(): number;
  /** How long a head is trusted (`HEAD_TRUST_MS` unless configured) — callers' caches age on the same window (§22 CC9). */
  trustMs(): number;
}

interface LockManagerLike {
  request<T>(name: string, options: { signal?: AbortSignal }, callback: () => Promise<T>): Promise<T>;
}

export interface RagCoherenceOptions {
  /** Force the mechanism (tests): true = Web Locks + IndexedDB, false = in-process. Default: by capability. */
  isBrowser?: boolean;
  locks?: LockManagerLike;
  indexedDB?: IDBFactory;
  lockTimeoutMs?: number;
  /** Clock for head ages (tests move it with the fake network). Default: Date.now. */
  now?: () => number;
  /** Default HEAD_TRUST_MS. */
  headTrustMs?: number;
}

const LOCK_TIMEOUT_MS = 120_000;
const IDB_NAME = 'fabstir-rag-coherence';
const STORE = 'heads';

let processMutex = new AsyncMutex();
let processHeads = new Map<string, RagHead>();

export function __resetInProcessCoherenceForTests(): void {
  processMutex = new AsyncMutex();
  processHeads = new Map();
}

const lockName = (dbId: string) => `fabstir-rag:${dbId}`;
const timeoutError = (dbId: string, ms: number) =>
  new SDKError(`RAG database ${dbId} is busy (lock not acquired within ${ms} ms)`, 'RAG_LOCK_TIMEOUT', { dbId, timeoutMs: ms, retryable: true });
const unavailable = (missing: string, cause?: unknown) =>
  new SDKError(`Sealed storage needs ${missing} in this browser (a secure context and a browser with Web Locks)`, 'RAG_COHERENCE_UNAVAILABLE', {
    missing, retryable: false, ...(cause !== undefined ? { cause } : {}),
  });

/**
 * A head this tab could not record after the write it vouches for landed on S5 (§34 OO4): the head store's own error
 * (`RAG_COHERENCE_UNAVAILABLE`), saying the write stands — `committed: true`, never one to retry. The writer finishes
 * its bookkeeping first, so this tab reads what it wrote.
 */
export function headNotRecorded(error: SDKError): SDKError {
  return new SDKError(`${error.message} — the write landed; this tab could not record its head`, error.code, { ...error.details, committed: true });
}

interface Clock { now: () => number; trustMs: number }

/**
 * Head keys prefixed by `scope/` (the root scope '' has none); locks unchanged. Heads are stamped with their
 * commit time and dropped on read once older than the trust window (T2).
 */
function withScope(base: Omit<RagCoherence, 'scoped' | 'now' | 'trustMs' | 'getHeadAnyAge'>, scope: string, clock: Clock): RagCoherence {
  const prefix = scope === '' ? '' : `${scope}/`;
  // A tombstone that recorded an incarnation — the deleted one's, or the `legacy` sentinel (§29 JJ1) — never covers a
  // database re-created since, so it never goes stale (§16 V3 — legacy data under it is only ever purged); every other
  // head is trusted for the window only (§15 T2).
  const trusted = (head: RagHead | undefined) =>
    head && head.at !== undefined && ((head.deleted && head.incarnation !== undefined) || clock.now() - head.at <= clock.trustMs) ? head : undefined;
  return {
    assertUsable: () => base.assertUsable(),
    withLock: (key, fn) => base.withLock(key, fn),
    getHead: async (key) => trusted(await base.getHead(prefix + key)),
    getHeadAnyAge: (key) => base.getHead(prefix + key),
    putHead: (key, head) => base.putHead(prefix + key, { ...head, at: clock.now() }),
    listHeads: async () => (await base.listHeads())
      .filter(([key, head]) => key.startsWith(prefix) && trusted(head))
      .map(([key, head]): [string, RagHead] => [key.slice(prefix.length), head]),
    scoped: (inner) => withScope(base, prefix + inner, clock),
    now: () => clock.now(),
    trustMs: () => clock.trustMs,
  };
}

const guarded = <T>(p: Promise<T>): Promise<T> => p.catch((cause) => { throw unavailable('IndexedDB', cause); });

function idbRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

export function createRagCoherence(opts: RagCoherenceOptions = {}): RagCoherence {
  const g = globalThis as any;
  const timeoutMs = opts.lockTimeoutMs ?? LOCK_TIMEOUT_MS;
  const clock: Clock = { now: opts.now ?? Date.now, trustMs: opts.headTrustMs ?? HEAD_TRUST_MS };
  const detectedLocks = 'locks' in opts ? opts.locks : g.navigator?.locks;
  // A browser document (not React Native's bare `window`) without Web Locks: other tabs exist but cannot share
  // a lock — an insecure origin, or a browser without the API. Either way it fails closed (S7).
  const browserDocument = typeof g.window !== 'undefined' && (typeof g.document !== 'undefined' || typeof g.isSecureContext === 'boolean');
  // Web Locks alone are not a browser: Node ≥ 24.5 has navigator.locks and no IndexedDB (§17 W1) — the in-process
  // mechanism serves it. The browser mechanism needs the head store too, or a document (which fails closed — S7).
  const detectedIndexedDB = 'indexedDB' in opts ? opts.indexedDB : g.indexedDB;
  const isBrowser = opts.isBrowser ?? ((detectedLocks !== undefined && detectedIndexedDB !== undefined) || browserDocument);

  if (!isBrowser) {
    return withScope({
      async assertUsable() { /* the in-process mutex and head map always work */ },
      async withLock(dbId, fn) {
        let state: 'waiting' | 'running' | 'expired' = 'waiting';
        let timer: ReturnType<typeof setTimeout> | undefined;
        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            if (state !== 'waiting') return;
            state = 'expired';
            reject(timeoutError(dbId, timeoutMs));
          }, timeoutMs);
        });
        const run = processMutex.withLock(lockName(dbId), async () => {
          if (state === 'expired') return undefined as never; // timed out while queued: never run late
          state = 'running';
          clearTimeout(timer);
          return fn();
        });
        return Promise.race([run, expired]);
      },
      async getHead(dbId) { return processHeads.get(dbId); },
      async putHead(dbId, head) { processHeads.set(dbId, { ...head }); },
      async listHeads() { return [...processHeads]; },
    }, '', clock);
  }

  const locks = 'locks' in opts ? opts.locks : g.navigator?.locks;
  const factory: IDBFactory | undefined = 'indexedDB' in opts ? opts.indexedDB : g.indexedDB;
  let db: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (!db) {
      const opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = factory!.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => {
          // A connection the browser closes (storage cleared, version change) is dropped, not reused (§16 V8).
          req.result.onclose = () => { if (db === opening) db = undefined; };
          resolve(req.result);
        };
        req.onerror = () => reject(req.error);
      });
      db = opening;
      opening.catch(() => { if (db === opening) db = undefined; }); // a failed open is not cached (T8)
    }
    return db;
  };
  // Every head-store failure is RAG_COHERENCE_UNAVAILABLE (one error shape — §16 V8) — opening, a request, a commit
  // (§17 W3); a transaction on a connection that has closed is retried once on a fresh one.
  const store = async (mode: IDBTransactionMode) => {
    if (!factory) throw unavailable('IndexedDB');
    for (let attempt = 0; ; attempt++) {
      try {
        const current = open();
        const conn = await current;
        let tx: IDBTransaction;
        try {
          tx = conn.transaction(STORE, mode);
        } catch (error: any) {
          if (attempt === 0 && error?.name === 'InvalidStateError') { if (db === current) db = undefined; continue; }
          throw error;
        }
        const done = guarded(new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }));
        done.catch(() => {}); // reads never await their commit; a writer's `await done` still sees the failure
        return { os: tx.objectStore(STORE), done };
      } catch (cause) {
        throw unavailable('IndexedDB', cause);
      }
    }
  };

  return withScope({
    async assertUsable() {
      if (!locks) throw unavailable('Web Locks (navigator.locks)');
      if (!factory) throw unavailable('IndexedDB');
      await store('readonly');
    },
    async withLock(dbId, fn) {
      if (!locks) throw unavailable('Web Locks (navigator.locks)');
      const controller = new AbortController();
      let started = false;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await locks.request(lockName(dbId), { signal: controller.signal }, async () => {
          started = true;
          clearTimeout(timer);
          return fn();
        });
      } catch (err: any) {
        if (!started && err?.name === 'AbortError') throw timeoutError(dbId, timeoutMs);
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
    async getHead(dbId) {
      const { os } = await store('readonly');
      return (await guarded(idbRequest(os.get(dbId)))) as RagHead | undefined;
    },
    async putHead(dbId, head) {
      const { os, done } = await store('readwrite');
      os.put({ ...head }, dbId);
      await done; // committed before the caller releases its lock
    },
    async listHeads() {
      const { os } = await store('readonly');
      const [keys, values] = await guarded(Promise.all([idbRequest(os.getAllKeys()), idbRequest(os.getAll())]));
      return keys.map((k, i) => [String(k), values[i] as RagHead]);
    },
  }, '', clock);
}
