// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * What the SDK enforces on every S5 instance it creates, at the one point all S5 traffic passes (plan §18 X1, §19):
 *
 * - **Redaction.** s5js path errors embed the root URI `fs5://write:<rootWriteKey>@<base32 CID>`, and the CID carries
 *   the root encryption key: a logged or reported message would hand out write access to the user's whole S5 home
 *   and the keys to its directory tree. Every error is scrubbed before any SDK code sees it; the logical path after
 *   the URI's authority, and the wording and codes the SDK classifies by, are kept. Remove once s5js puts logical
 *   paths in its messages (requested, `S5JS-REPLY-BETA56-REGISTRY-COHERENCE.md` §1).
 * - **No plaintext in a RAG root.** A `put` under `home/vector-databases/` (the SDK only ever deletes there) or an
 *   unsealed `put` under `home/rag/` is refused, and so is `createFile` under either: through the SDK's instance
 *   (the UI's direct `s5Client.fs.put`) and through s5js's own writers that call `put` on it (`putImage`,
 *   galleries — §19 Z17, §20 AA5). s5js's copy/move paths are not guarded.
 * - **The s5js it can run on.** Sealed storage relies on s5js beta.56 (no same-origin lost update, fresh reads, a
 *   registry miss is a failure); on beta.55 it would lose whole databases and logs (Z1).
 */

import { SDKError } from '../types';
import { isSealedBytes } from './sealed/StorageSealer';

/** A URI's authority — everything between `fs5://` and the first `/` — holds both keys. */
const FS5_AUTHORITY = /fs5:\/\/[^/\s"'`]*/g;

export function redactS5Text(text: string): string {
  return text.replace(FS5_AUTHORITY, 'fs5://[redacted]');
}

/**
 * Refuse an s5js without beta.56's semantics — detected by its root export `isS5RegistryUnavailableError`, which
 * beta.55 lacks (§19 Z1). Called before an S5 instance is created.
 */
export function assertSupportedS5js(s5Module: Record<string, unknown>): void {
  // `in` first: a module namespace (or a test double of one) may refuse a read of an export it lacks.
  if (!('isS5RegistryUnavailableError' in s5Module) || typeof s5Module.isS5RegistryUnavailableError !== 'function') {
    throw new SDKError(
      'Sealed storage needs @julesl23/s5js 0.9.0-beta.56 or later (this build lacks its registry coherence) — pin s5js to 0.9.0-beta.56',
      'S5JS_UNSUPPORTED_VERSION', { retryable: false },
    );
  }
}

/**
 * Write `value` to `obj[key]` without throwing, even where `key` is a prototype accessor with no setter (a
 * DOMException's `message`): an own property shadows it. False when the object refuses (frozen, non-extensible).
 */
function rewrite(obj: object, key: string, value: unknown): boolean {
  try {
    Object.defineProperty(obj, key, { value, writable: true, configurable: true, enumerable: Object.prototype.propertyIsEnumerable.call(obj, key) });
    return (obj as Record<string, unknown>)[key] === value;
  } catch {
    return false;
  }
}

const COPIED = ['code', 'reason', 'retryable'] as const;

/**
 * Scrub `err` and return it: every own string property (message, stack, …), the `cause` chain and an
 * AggregateError's `errors`, in place — so its class, `code`, `reason` and `retryable` survive. Nothing unchanged
 * is written, and scrubbing never throws (§19 Z6): an error that cannot be rewritten comes back as a new Error with
 * the redacted text and the original's name, code, reason and retryable (never the original, which leaks).
 */
export function redactS5Error(err: unknown, seen: Set<unknown> = new Set()): unknown {
  if (typeof err === 'string') return redactS5Text(err);
  if (err === null || typeof err !== 'object' || seen.has(err)) return err;
  seen.add(err);
  const e = err as Record<string, unknown>;
  let rewritable = true;
  for (const key of new Set([...Object.getOwnPropertyNames(e), 'message', 'stack'])) {
    const value = e[key];
    if (typeof value !== 'string') continue;
    const text = redactS5Text(value);
    if (text !== value && !rewrite(e, key, text)) rewritable = false;
  }
  if (e.cause !== undefined) {
    const cause = redactS5Error(e.cause, seen);
    if (cause !== e.cause && !rewrite(e, 'cause', cause)) rewritable = false;
  }
  if (Array.isArray(e.errors)) {
    e.errors.forEach((inner, i) => {
      const scrubbed = redactS5Error(inner, seen);
      if (scrubbed !== inner) { try { (e.errors as unknown[])[i] = scrubbed; } catch { rewritable = false; } }
    });
  }
  if (rewritable) return err;
  const replacement = new Error(redactS5Text(String(e.message ?? '')));
  replacement.name = typeof e.name === 'string' ? e.name : 'Error';
  for (const key of COPIED) if (e[key] !== undefined) (replacement as unknown as Record<string, unknown>)[key] = e[key];
  return replacement;
}

const RAG_ROOT = /^home\/(vector-databases|rag)(\/|$)/;

function refusePlaintextRag(path: unknown, data: unknown): void {
  const p = typeof path === 'string' ? path.replace(/\/+/g, '/').replace(/^\//, '') : '';
  const root = RAG_ROOT.exec(p)?.[1];
  if (!root || (root === 'rag' && data instanceof Uint8Array && isSealedBytes(data))) return;
  throw new SDKError(`Refusing to write ${root === 'rag' ? 'unsealed bytes' : 'to the legacy plaintext layout'} at ${p}`,
    'RAG_PLAINTEXT_WRITE_REFUSED', { path: p, retryable: false });
}

/**
 * `s5` with every method — its own and those of `s5.fs`, where every URI-bearing message originates — rethrowing
 * scrubbed errors, whether they throw, reject, or reject from `list`'s async iterator. The RAG write refusal is
 * installed on the real `fs` object itself — its `put` refuses anything under the legacy root and plaintext under the
 * sealed one, its `createFile` any file under either (§19 Z17) — so s5js's own writers are refused too (§20 AA5). Methods run on the real object; results and non-function
 * properties pass through untouched. Wrappers are cached per underlying object and function, so a new `fs` (s5js replaces it on identity
 * recovery) or a reassigned method is always the one used (§19 Z12).
 */
export function withS5Guards<T extends object>(s5: T): T {
  return guarded(s5, true);
}

const guardedObjects = new WeakMap<object, object>();

function guarded<T extends object>(target: T, isInstance: boolean): T {
  const known = guardedObjects.get(target);
  if (known) return known as T;
  const methods = new WeakMap<Function, Function>();
  if (!isInstance) refuseRagWritesOn(target);
  const proxy = new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (isInstance && prop === 'fs' && value !== null && typeof value === 'object') return guarded(value, false);
      if (typeof value !== 'function') return value;
      let wrapped = methods.get(value);
      if (!wrapped) {
        wrapped = scrubbed(value, obj);
        methods.set(value, wrapped);
      }
      return wrapped;
    },
  });
  guardedObjects.set(target, proxy);
  return proxy;
}

/**
 * The refusal is installed on the real `fs` object, not only on the SDK's view of it, so s5js's own writers — which
 * call `this.put` on the object they hold — go through it too (§20 AA5). A refusal is a rejection, like any failure.
 */
function refuseRagWritesOn(fs: object): void {
  const target = fs as Record<string, unknown>;
  // A Proxy with only an `apply` trap: the method's own properties (a test double's `mock`) pass through.
  const refusing = (name: string, check: (args: unknown[]) => void) => {
    const fn = target[name];
    if (typeof fn !== 'function') return;
    Object.defineProperty(fs, name, {
      configurable: true, writable: true,
      value: new Proxy(fn, {
        apply(original, thisArg, args) {
          try {
            check(args);
          } catch (refusal) {
            return Promise.reject(refusal); // async like the method: a refusal is a rejection, like any failure
          }
          return Reflect.apply(original, thisArg, args);
        },
      }),
    });
  };
  refusing('put', ([path, data]) => refusePlaintextRag(path, data));
  // A directory entry for an already-uploaded blob: never the SDK's way to write under a RAG root.
  refusing('createFile', ([dir, name]) => refusePlaintextRag(`${dir}/${name}`, undefined));
}

const rethrowScrubbed = (err: unknown): never => { throw redactS5Error(err); };

/** Only calls are intercepted: the method's own properties (`name`, `length`, a test double's `mock`) pass through. */
function scrubbed(fn: Function, self: object): Function {
  return new Proxy(fn, {
    apply(target, _thisArg, args) {
      let result: any;
      try {
        result = Reflect.apply(target, self, args);
      } catch (err) {
        rethrowScrubbed(err);
      }
      if (typeof result?.then === 'function') return result.then(undefined, rethrowScrubbed);
      if (typeof result?.[Symbol.asyncIterator] === 'function' && typeof result.next === 'function') {
        return scrubbedIterator(result);
      }
      return result;
    },
  });
}

function scrubbedIterator(it: AsyncIterator<unknown>): AsyncIterableIterator<unknown> {
  const step = (p: Promise<IteratorResult<unknown>>) => p.then(undefined, rethrowScrubbed);
  return {
    next: (...args: [] | [unknown]) => step(it.next(...args)),
    return: it.return && ((value?: unknown) => step(it.return!(value))),
    throw: it.throw && ((e?: unknown) => step(it.throw!(e))),
    [Symbol.asyncIterator]() { return this; },
  };
}
