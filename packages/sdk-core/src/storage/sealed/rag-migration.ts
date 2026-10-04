// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Migration of legacy plaintext RAG databases (`home/vector-databases/{address}/{name}/…`) to the sealed
 * layout, then deletion of the plaintext.
 *
 * Per database, under its lock: read everything first (a read failure leaves the legacy data untouched);
 * write the sealed bodies, then the chunks, then the manifest last — the commit point, carrying the legacy
 * document ids (`migratedFrom`); read every sealed file back (chunks: the set of vector ids; bodies: byte for
 * byte); only then delete the legacy files, the manifest last. The purge never deletes a listed document's
 * body it did not read (its read failed, or its file had not arrived: the next run adopts it — plan §14 S1), and
 * stops, keeping the manifest (`legacyKept`), when the manifest's hash changed (an outdated tab wrote) or a
 * delete left something behind; nothing is purged beside a sealed copy no head of this origin vouches for — this tab
 * records one, and keeps the legacy data when it cannot (§36 QQ2, §37 RR1). No lock spans devices: before it writes,
 * and again right before its manifest, a run checks that the legacy manifest and the sealed side are as it read them —
 * another device's migration, write or delete, or an outdated tab's legacy write, under it: RAG_DATABASE_MOVED,
 * nothing committed (§39 TT2, §40 UU1, §41 VV1) — except another device's write to a sealed copy a run commits beside:
 * the run decides again against it, and commits on its revision (§43 XX1). Bodies are copied as raw bytes: s5js
 * `get()` would "decode" a body that happens to be valid CBOR or JSON. Bytes that already carry the seal are never
 * sealed again.
 *
 * Legacy data found beside a sealed database — our own leftover after an interrupted purge, or an outdated
 * tab's write — never replaces or merges into the sealed database. Two exceptions: documents uploaded
 * after the migration (ids neither in the sealed manifest nor in the snapshot the migration recorded) are
 * adopted as pending; and a sealed document a migration or adoption recorded without a body gets its legacy body
 * (one the legacy copy listed before its file arrived — §14 S1, §43 XX2). Nothing the user deleted since is
 * resurrected, and legacy vectors are never merged (adopted documents are re-embedded). For our own leftover the snapshot equals the legacy list, so nothing
 * is adopted and it is simply purged — the sealed copies at once, the rest once every database is done (§16 V1).
 */

import { equalBytes } from '@noble/ciphers/utils';
import type { Vector } from '../../types';
import { SDKError } from '../../types';
import { mapWithConcurrency } from '../../utils/concurrency';
import type { StorageSealer } from './StorageSealer';
import { retryableOf, type SealedIO } from './sealed-io';
import type { RagHead } from './rag-coherence';
import {
  sealedLayout, legacyLayout, dbIdOf, docKeyOf, randomHex, textOrBytes, legacyManifestFrom, isLegacyVectorList, type DatabaseManifest,
} from './rag-layout';

export type RagMigrationStatus =
  | 'migrated' | 'purged-deleted' | 'purged-orphan' | 'purged-leftover' | 'purged-after-delete'
  | 'adopted-after-seal' | 'failed' | 'anomaly';

export interface RagMigrationEntry {
  name: string;
  status: RagMigrationStatus;
  vectors: number;
  documents: number;
  /** Documents uploaded by an outdated tab after the migration, now pending in the sealed database. */
  adopted?: string[];
  /** Legacy documents not carried over: bodies with no entry, or documents deleted since the migration. */
  discarded?: string[];
  /** Documents whose body is not in the sealed copy (not found, or not readable yet — kept for the next run). */
  missingBodies?: string[];
  /** Chunks the legacy manifest listed that did not exist (their vectors were already lost). */
  missingChunks?: number[];
  /** Sealed documents an earlier run left without a body (not there yet, or unreadable), given their legacy body now. */
  repairedBodies?: string[];
  /**
   * The plaintext directory was not fully removed — an outdated tab wrote to it, a delete failed, it holds a body the
   * sealed copy lacks, or this tab could not vouch for the sealed copy: its head could not be recorded (browser storage
   * full or blocked), or the database was deleted or re-created under the run (another device) with plaintext still
   * there — that delete removes the legacy copy, so only an outdated tab's write leaves any (§43 XX3) — another tab may
   * still read the legacy data; no `purgeError` then (§36 QQ2, §37 RR1, §42 WW1). The data is safe in the sealed copy
   * or kept; a later run finishes the purge — one that can record the head, for the storage reason (§38 SS5).
   */
  legacyKept?: boolean;
  /** Why the purge stopped, when a failure stopped it (the sealed copy is committed and verified regardless). */
  purgeError?: string;
  /**
   * Legacy items whose read failed. On a `failed` entry they stopped the migration (retry, or consent to
   * `discardUnreadable`); on a migrated or adopted entry they are kept for the next run (their data is not lost).
   */
  unreadable?: { chunks?: number[]; bodies?: string[] };
  /** Items left out with the user's consent (`discardUnreadable`). */
  discardedUnreadable?: { chunks?: number[]; bodies?: string[] };
  /** Files outside the legacy layout found in the directory — kept, never deleted (§19 Z13); the UI decides. */
  unrecognisedFiles?: string[];
  error?: string;
  /**
   * The error code of a `failed` entry — always set on one (e.g. RAG_LOCK_TIMEOUT, STORAGE_OFFLINE, S5_IO_ERROR,
   * S5_DIRECTORY_LOAD_ERROR; RAG_LEGACY_UNREADABLE with `unreadable`; RAG_DATABASE_MOVED, retryable — another device
   * moved, changed or deleted it, or an outdated tab of this browser rewrote its legacy manifest, under this run, which
   * committed nothing: run again — it repeats while an outdated tab keeps writing (§39 TT2, §40 UU1, §41 VV4). Beside a
   * sealed copy, another device's writes to it are rebased on instead — MOVED only after 3 rebases (§43 XX1); a delete
   * or re-create landing after this run's commit is MOVED too, nothing purged (§44 YY5);
   * RAG_MIGRATION_FAILED for an error that brought no code).
   */
  code?: string;
  /** On a `failed` entry: whether running the migration again may help (§16 V6, §17 W4). */
  retryable?: boolean;
}

export interface RagMigrationReport {
  startedAt: number;
  finishedAt: number;
  databases: RagMigrationEntry[];
  /** Whole legacy roots removed (the old DocumentManager's `home/documents/{address}`). */
  purgedRoots: string[];
  /**
   * Files the migration found but does not own — kept, never deleted (§19 Z13): under the old DocumentManager's root,
   * and in legacy directories that hold nothing else (§20 AA7). Files outside the layout beside a database's own are
   * on that database's entry (`unrecognisedFiles`).
   */
  unrecognisedFiles?: string[];
  /** Roots whose removal failed (the next run retries); the report is complete regardless. */
  purgeErrors?: Array<{ root: string; code: string }>;
}

/** Consent, per database, to migrate WITHOUT exactly these unreadable items (as a `failed` entry named them). */
export type DiscardUnreadable = Record<string, { chunks?: number[]; bodies?: string[] }>;

export interface MigrationProgress {
  phase: 'rag' | 'logs';
  done: number;
  total: number;
  item: string;
}

/**
 * A consumer's progress callback never decides a migration (§26 GG3): one that throws — or, `async`, rejects (§27
 * HH6) — is warned about, never propagated: otherwise every run would stop at the same item, and the plaintext would
 * stay (or the rejection would go unhandled).
 */
export function reportProgress(onProgress: ((e: MigrationProgress) => void) | undefined, event: MigrationProgress): void {
  if (!onProgress) return;
  const ignored = (error: unknown) => { console.warn('[migration] onProgress threw — ignored:', error); };
  try {
    const returned: unknown = onProgress(event);
    if (typeof (returned as PromiseLike<unknown> | undefined)?.then === 'function') (returned as PromiseLike<unknown>).then(undefined, ignored);
  } catch (error) {
    ignored(error);
  }
}

/**
 * What the migration needs from S5VectorStore — its reads, commit and body writer, so the sealed layout
 * has one implementation. Paths, contexts and ids come from `rag-layout`.
 */
export interface RagMigrationHost {
  sealer: StorageSealer;
  io: SealedIO;
  userAddress: string;
  readSealed(dbId: string): Promise<{ manifest: DatabaseManifest } | { tombstone: RagHead } | null>;
  /**
   * `beforeManifest` runs after the chunks are written and before the manifest is: verification (§16 V7), then the
   * re-check that what the run started from is still there (§40 UU1). A head this tab could not record after the
   * manifest is written throws `committed: true`: the sealed copy stands (§35 PP2).
   */
  commit(
    name: string, dbId: string, previousRevision: number, manifest: DatabaseManifest, vectors?: Map<string, Vector>,
    beforeManifest?: (manifest: DatabaseManifest) => Promise<void>,
  ): Promise<void>;
  writeBody(dbId: string, manifest: DatabaseManifest, documentId: string, payload: { kind: 'text'; value: string } | { kind: 'bytes'; value: Uint8Array }): Promise<void>;
  /**
   * Make sure this origin holds a head vouching for the sealed manifest as it is now — read fresh: this one, or a newer
   * revision of its incarnation — recording one when there is none (§37 RR1, §41 VV2, §42 WW1). False when there is no
   * manifest, a tombstone or another incarnation, or when the head cannot be recorded; a failing read throws (the run's
   * entry fails with its code and verdict). The caller holds the lock.
   */
  vouch(dbId: string, manifest: DatabaseManifest): Promise<boolean>;
  /** The database's cross-tab lock, with the connection checked once it is held. */
  withWriteLock<T>(dbId: string, fn: () => Promise<T>): Promise<T>;
}

class MigrationAnomaly extends Error {}

/** Legacy reads are independent downloads; a few in flight overlap the round trips without flooding the portal. */
const READ_CONCURRENCY = 5;
const utf8 = new TextEncoder();
const docsOf = (m: Partial<DatabaseManifest>) => [...(m.pendingDocuments ?? []), ...(m.readyDocuments ?? [])] as Array<{ id: string }>;

/**
 * Walk every legacy directory (not the manifests — deleted databases have none) and migrate or purge it. Each
 * database's sealed copy is committed and verified, and the files it holds deleted, under its lock (phase A);
 * everything else — the manifest, garbage, directories — once every database is done, re-reading what it acts on
 * (phase B, §16 V1; its reads are fresh — §18 B1 — so there is no s5js shadow or cache to wait out).
 * `discardUnreadable`: the user's consent, per database, to leave out exactly the named unreadable items (T6, V6).
 */
export async function migrateAllLegacy(
  host: RagMigrationHost, onProgress?: (e: MigrationProgress) => void, discardUnreadable: DiscardUnreadable = {},
): Promise<RagMigrationReport> {
  const startedAt = Date.now();
  const base = legacyLayout.base(host.userAddress);
  const listed = await host.io.list(base);
  const names = (listed ?? []).filter((e) => e.type === 'directory').map((e) => e.name);
  const databases: RagMigrationEntry[] = [];
  const unrecognisedFiles: string[] = [];
  const finals: Array<{ dbId: string; entry: RagMigrationEntry; purge: () => Promise<PurgeResult> }> = [];
  for (const [i, name] of names.entries()) {
    const dbId = dbIdOf(host.sealer, name);
    try {
      const entry = await host.withWriteLock(dbId, () =>
        migrateDatabaseLocked(host, name, discardUnreadable[name], (purge, e) => finals.push({ dbId, entry: e, purge }),
          (paths) => unrecognisedFiles.push(...paths)));
      if (entry) databases.push(entry);
    } catch (error: any) {
      // Every failed entry carries a code (R12): an error that brought none is RAG_MIGRATION_FAILED.
      const code = typeof error?.code === 'string' ? error.code : 'RAG_MIGRATION_FAILED';
      databases.push({
        name, status: 'failed', vectors: 0, documents: 0, error: error?.message ?? String(error), code, retryable: retryableOf(error),
        ...(error?.details?.unreadable ? { unreadable: error.details.unreadable } : {}),
      });
    }
    reportProgress(onProgress, { phase: 'rag', done: i + 1, total: names.length, item: name });
  }

  if (finals.length) {
    for (const f of finals) {
      const result = await host.withWriteLock(f.dbId, f.purge).catch((error: any): PurgeResult => ({ purged: false, error: codeOf(error) }));
      if (!result.purged) Object.assign(f.entry, { legacyKept: true }, result.error ? { purgeError: result.error } : {});
      else { delete f.entry.legacyKept; delete f.entry.purgeError; }
    }
  }

  const purgeErrors: Array<{ root: string; code: string }> = [];
  // The base (it names the wallet) goes only through s5js's own resolved-and-empty check (§15 T1).
  if (listed !== undefined) await host.io.deleteDir(base).catch((error) => { purgeErrors.push({ root: base, code: codeOf(error) }); });
  const purgedRoots: string[] = [];
  const oldDocumentsRoot = legacyLayout.documentManagerRoot(host.userAddress);
  try {
    const old = await purgeDocumentManagerRoot(host, oldDocumentsRoot);
    if (old.purged) purgedRoots.push(oldDocumentsRoot);
    unrecognisedFiles.push(...old.kept);
  } catch (error) {
    purgeErrors.push({ root: oldDocumentsRoot, code: codeOf(error) });
  }
  return {
    startedAt, finishedAt: Date.now(), databases, purgedRoots,
    ...(purgeErrors.length ? { purgeErrors } : {}), ...(unrecognisedFiles.length ? { unrecognisedFiles } : {}),
  };
}

/** Every file under `dir`, as full paths. */
async function filesUnder(host: RagMigrationHost, dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of (await host.io.list(dir)) ?? []) {
    const path = `${dir}/${e.name}`;
    out.push(...(e.type === 'directory' ? await filesUnder(host, path) : [path]));
  }
  return out;
}

/**
 * The old managers/DocumentManager's root: only the files it wrote (`{database}/{database}_{hash}_{ms}_{random}` —
 * plaintext originals) are deleted, then the directories s5js finds empty. Anything else is someone else's: kept and
 * reported (§19 Z13). @returns whether the root is gone, and what was kept.
 */
async function purgeDocumentManagerRoot(host: RagMigrationHost, root: string): Promise<{ purged: boolean; kept: string[] }> {
  const top = await host.io.list(root);
  if (top === undefined) return { purged: false, kept: [] };
  const kept: string[] = [];
  for (const e of top) {
    const path = `${root}/${e.name}`;
    if (e.type !== 'directory') { kept.push(path); continue; }
    const entries = (await host.io.list(path)) ?? [];
    const ours = entries.filter((f) => f.type !== 'directory' && legacyLayout.isDocumentManagerFile(e.name, f.name)).map((f) => f.name);
    await host.io.deleteFiles(path, ours);
    for (const f of entries.filter((x) => !ours.includes(x.name))) {
      kept.push(...(f.type === 'directory' ? await filesUnder(host, `${path}/${f.name}`) : [`${path}/${f.name}`]));
    }
    await host.io.deleteDir(path);
  }
  return { purged: kept.length === 0 && await host.io.deleteDir(root), kept };
}

const codeOf = (error: any): string => (typeof error?.code === 'string' ? error.code : 'RAG_MIGRATION_FAILED');

/** Phase B of one database, scheduled by `migrateDatabaseLocked` to run once every database is done. */
type ScheduleFinal = (purge: () => Promise<PurgeResult>, entry: RagMigrationEntry) => void;

/**
 * Migrate or purge one legacy database. The caller holds its lock. Returns undefined when there is nothing to do
 * this run; throws on any failure before the sealed commit, or at its read-back after it (the legacy data is then
 * untouched). Without `schedule` — an upgrade-on-write migration — nothing is purged: the next background run does it
 * (§16 V1).
 * `consent`: the unreadable items the user agreed to leave out (V6).
 */
export async function migrateDatabaseLocked(
  host: RagMigrationHost, name: string, consent?: { chunks?: number[]; bodies?: string[] }, schedule?: ScheduleFinal,
  foreignOnly?: (paths: string[]) => void,
): Promise<RagMigrationEntry | undefined> {
  const dir = legacyLayout.dir(host.userAddress, name);
  const top = await host.io.list(dir);
  if (top === undefined) return undefined; // certain: there is no such directory
  if (top.length === 0) {
    // Empty (a fresh listing; a registry miss throws — §18 B1): removed only through s5js's own resolved-and-empty
    // check, never recursively.
    if (!schedule) return undefined;
    return (await host.io.deleteDir(dir)) ? { name, status: 'purged-orphan', vectors: 0, documents: 0 } : undefined;
  }
  try {
    const dbId = dbIdOf(host.sealer, name);
    // Everything the purge may ever delete is listed now, before any decision (T1).
    const inventory = await takeInventory(host, dir, top);
    // Nothing of the SDK's own layout — only files it does not own: no database here, so no entry, no verification
    // and no purge, every run (§20 AA7). The files are reported.
    if (!inventory.files.some(inLayout)) {
      foreignOnly?.(inventory.files.map((rel) => `${dir}/${rel}`));
      return undefined;
    }
    let legacy: DatabaseManifest | undefined;
    let readHash: string | undefined;
    if (inventory.files.includes('manifest.json')) {
      // Its blob hash before we read it: an outdated tab can rewrite it meanwhile (R7).
      readHash = await host.io.hashOf(legacyLayout.manifestPath(dir));
      const read = await withRetries(() => host.io.readPath(legacyLayout.manifestPath(dir)));
      if (read.state === 'sealed') throw new MigrationAnomaly('the legacy manifest already carries the seal');
      if (read.state === 'absent' || readHash === undefined) return undefined; // gone since the listing: the next run looks again
      legacy = legacyManifestFrom(read, dir)!;
    }
    const sealed = await host.readSealed(dbId);
    const unrecognised = inventory.files.filter((rel) => !inLayout(rel));
    // Phase A deletes files whose content the sealed copy now holds; phase B (once every database is done) the rest.
    const purge: Purge = async (entry, sealedCopies = [], keep = () => false, headRecorded = true) => {
      const withUnrecognised = unrecognised.length ? { ...entry, unrecognisedFiles: unrecognised } : entry;
      if (!schedule) return withUnrecognised;
      // Kept until a run records the sealed copy's head (§36 QQ2): another tab may still read the legacy data, with
      // nothing to tell it the database moved — while some is left: a delete under the run removed it (§43 XX3).
      if (!headRecorded) {
        let left: string[];
        try {
          left = (await takeInventory(host, dir, (await host.io.list(dir)) ?? [])).files;
        } catch (error) {
          // A look that fails keeps the legacy data — after a commit, a purge failure is never `failed` (T1, §44 YY3).
          return { ...withUnrecognised, legacyKept: true, purgeError: codeOf(error) };
        }
        const foreignLeft = left.filter((rel) => !inLayout(rel)); // what is there now (§44 YY3)
        const now = foreignLeft.length ? { ...entry, unrecognisedFiles: foreignLeft } : entry;
        return foreignLeft.length < left.length ? { ...now, legacyKept: true } : now;
      }
      const a = await deleteListed(host, dir, sealedCopies);
      const result = a.error ? { ...withUnrecognised, legacyKept: true, purgeError: a.error } : withUnrecognised;
      schedule(() => finalPurge(host, dir, readHash, inventory, keep, (rel) => !inLayout(rel)), result);
      return result;
    };

    // What this run started from must still be there — checked before anything is written, and again right before the
    // manifest (§39 TT2, §40 UU1): the legacy manifest as read (a delete removes it last; an outdated tab's write changes
    // it — W5's rule), then the sealed side as read — last, so nothing but the manifest's own write follows it (§41 VV1:
    // the legacy hash walks the path twice on s5js). No lock spans devices; the window left is one round trip (D45).
    const unchanged = async (from: DatabaseManifest | undefined) => {
      if (await host.io.hashOf(legacyLayout.manifestPath(dir)) !== readHash) throw movedWhileMoving(name);
      await assertUnmoved(host, name, dbId, from);
    };

    if (sealed && 'manifest' in sealed) return await besideSealed(host, name, dbId, dir, sealed.manifest, legacy, inventory, purge, unchanged, consent);
    const empty = { name, vectors: 0, documents: 0 };
    if (sealed && 'tombstone' in sealed) {
      return purge({ ...empty, status: 'purged-after-delete', discarded: legacy ? docsOf(legacy).map((d) => d.id) : [] });
    }
    // An orphan only on a resolved listing (it had entries) without a manifest.
    if (!legacy) return purge({ ...empty, status: 'purged-orphan' });
    if (legacy.deleted) return purge({ ...empty, status: 'purged-deleted' });
    return await migrateFresh(host, name, dbId, dir, legacy, inventory, purge, () => unchanged(undefined), consent);
  } catch (error: any) {
    if (error instanceof MigrationAnomaly) return { name, status: 'anomaly', vectors: 0, documents: 0, error: error.message };
    throw error;
  }
}

/** The files and subdirectories a legacy database directory showed (paths relative to it; directories deepest first). */
interface Inventory { files: string[]; dirs: string[] }

async function takeInventory(host: RagMigrationHost, dir: string, top: Array<{ name: string; type: string }>): Promise<Inventory> {
  const files: string[] = [];
  const dirs: string[] = [];
  const walk = async (prefix: string, entries: Array<{ name: string; type: string }>): Promise<void> => {
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.type !== 'directory') { files.push(rel); continue; }
      await walk(rel, (await host.io.list(`${dir}/${rel}`)) ?? []);
      dirs.push(rel);
    }
  };
  await walk('', top);
  return { files, dirs };
}

/** A legacy read, retried before it counts as failed: one network blip is not "unreadable" (§16 V6). */
async function withRetries<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read();
    } catch (error: any) {
      if (attempt >= LEGACY_READ_ATTEMPTS || error?.details?.retryable === false || error instanceof MigrationAnomaly) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt));
    }
  }
}
const LEGACY_READ_ATTEMPTS = 3;

/**
 * Legacy bodies' exact bytes by document id. A body that already carries the seal is an anomaly, never re-sealed;
 * one that is absent is simply not returned; one whose read FAILS (after retries) is named in `unreadable` (I2).
 */
async function readLegacyBodies(host: RagMigrationHost, dir: string, ids: string[]): Promise<{ bodies: Map<string, Uint8Array>; unreadable: string[]; causes: Map<string, unknown> }> {
  const docsDir = legacyLayout.documentsDir(dir);
  const causes = new Map<string, unknown>();
  const read = await mapWithConcurrency(ids, READ_CONCURRENCY, async (id) => {
    try {
      const raw = await withRetries(() => host.io.readRaw(`${docsDir}/${legacyLayout.bodyFile(id)}`));
      if (raw && host.sealer.isSealed(raw)) throw new MigrationAnomaly(`legacy body ${id} already carries the seal`);
      return { id, raw };
    } catch (error) {
      if (error instanceof MigrationAnomaly) throw error;
      causes.set(id, error);
      return { id, failed: true as const };
    }
  });
  const bodies = new Map<string, Uint8Array>();
  const unreadable: string[] = [];
  for (const r of read) {
    if ('failed' in r) unreadable.push(r.id);
    else if (r.raw) bodies.set(r.id, r.raw);
  }
  return { bodies, unreadable, causes };
}

async function writeBodies(host: RagMigrationHost, dbId: string, manifest: DatabaseManifest, sources: Map<string, Uint8Array>): Promise<void> {
  for (const [id, raw] of sources) await host.writeBody(dbId, manifest, id, textOrBytes(raw));
}

/**
 * Report an entry's purge: phase A deletes `sealedCopies` (inventoried files whose content the sealed copy now
 * holds) at once; the rest of the inventory, minus `keep`, is scheduled for phase B. Returns the entry.
 */
type Purge = (entry: RagMigrationEntry, sealedCopies?: string[], keep?: (rel: string) => boolean, headRecorded?: boolean) => Promise<RagMigrationEntry>;
interface PurgeResult { purged: boolean; error?: string }

/** The legacy body file of a document, as a path relative to its database directory, → the document id. */
const bodyIdAt = (rel: string): string | undefined => {
  const m = /^documents\/([^/]+)$/.exec(rel);
  return m ? legacyLayout.bodyIdOf(m[1]) : undefined;
};
/** Only the exact name the layout writes (`chunk-7.json`, never `chunk-007.json` — §21 BB10) is a chunk. */
const chunkIdAt = (rel: string): number | undefined => {
  const m = /^chunk-(\d+)\.json$/.exec(rel);
  return m && chunkRel(Number(m[1])) === rel ? Number(m[1]) : undefined;
};
const inLayout = (rel: string) => rel === 'manifest.json' || chunkIdAt(rel) !== undefined || bodyIdAt(rel) !== undefined;
const bodyRel = (id: string) => `documents/${legacyLayout.bodyFile(id)}`;
const chunkRel = (n: number) => `chunk-${n}.json`;

/** Unreadable items the user consented to leave out, and those they did not. */
function splitConsent(unreadable: { chunks: number[]; bodies: string[] }, consent?: { chunks?: number[]; bodies?: string[] }) {
  const ok = { chunks: new Set(consent?.chunks ?? []), bodies: new Set(consent?.bodies ?? []) };
  const pick = (chunks: number[], bodies: string[]) => ({ ...(chunks.length ? { chunks } : {}), ...(bodies.length ? { bodies } : {}) });
  return {
    discarded: pick(unreadable.chunks.filter((c) => ok.chunks.has(c)), unreadable.bodies.filter((b) => ok.bodies.has(b))),
    refused: pick(unreadable.chunks.filter((c) => !ok.chunks.has(c)), unreadable.bodies.filter((b) => !ok.bodies.has(b))),
  };
}
const isEmpty = (x: { chunks?: number[]; bodies?: string[] }) => !x.chunks?.length && !x.bodies?.length;

/**
 * `causes`: one per refused item — never an item the user consented to leave out (§22 CC3). Retryable while any of
 * them may read on a retry; once only permanent ones remain, not — and consent names exactly those. The `cause`
 * reported is one that agrees with that verdict (§23 DD8).
 */
function legacyUnreadable(name: string, unreadable: { chunks?: number[]; bodies?: string[] }, causes: unknown[]): SDKError {
  const retryable = causes.some(retryableOf);
  return new SDKError(
    `Legacy database "${name}" has items that cannot be read — retry, or migrate it without exactly these (discardUnreadable)`,
    'RAG_LEGACY_UNREADABLE',
    { database: name, unreadable, retryable, cause: retryable ? causes.find(retryableOf) : causes[0] },
  );
}

async function migrateFresh(
  host: RagMigrationHost, name: string, dbId: string, dir: string, legacy: DatabaseManifest, inventory: Inventory,
  purge: Purge, unchanged: () => Promise<void>, consent?: { chunks?: number[]; bodies?: string[] },
): Promise<RagMigrationEntry> {
  // 1. Read everything first. Only the chunks the manifest lists are read; chunk files it no longer lists
  //    (left behind by a shrink) hold deleted vectors and are only purged. A listed chunk that is absent is
  //    reported (R8); one whose read FAILS after retries is unreadable — the migration stops, naming it, unless
  //    the user consented to leave out exactly that item (T6, V6, I2).
  const missingChunks: number[] = [];
  const unreadableChunks: number[] = [];
  const readChunks: number[] = [];
  const chunkCauses = new Map<number, unknown>();
  const chunks = await mapWithConcurrency(legacy.chunks, READ_CONCURRENCY, async (c) => {
    let read;
    try {
      read = await withRetries(() => host.io.readPath(legacyLayout.chunkPath(dir, c.chunkId)));
    } catch (error) {
      chunkCauses.set(c.chunkId, error);
      unreadableChunks.push(c.chunkId);
      return [];
    }
    if (read.state === 'absent') {
      missingChunks.push(c.chunkId);
      return [];
    }
    if (read.state === 'sealed') throw new MigrationAnomaly(`legacy chunk ${c.chunkId} already carries the seal`);
    const chunk = read.value as { vectors?: Vector[] };
    if (!isLegacyVectorList(chunk?.vectors)) {
      // The store's code for the same condition (§21 BB18); its entries checked too (§24 EE3).
      chunkCauses.set(c.chunkId, new SDKError(`Legacy chunk ${c.chunkId} is malformed`, 'RAG_CHUNK_MALFORMED', { chunkId: c.chunkId, retryable: false }));
      unreadableChunks.push(c.chunkId);
      return [];
    }
    readChunks.push(c.chunkId);
    return chunk.vectors!;
  });
  const vectors = new Map<string, Vector>(chunks.flat().map((v) => [v.id, v]));
  const ids = new Set(docsOf(legacy).map((d) => d.id));
  const bodyIds = inventory.files.map(bodyIdAt).filter((id): id is string => id !== undefined);
  const bodyRead = await readLegacyBodies(host, dir, bodyIds.filter((id) => ids.has(id)));
  const sources = bodyRead.bodies;
  const { discarded, refused } = splitConsent({ chunks: [...unreadableChunks].sort((a, b) => a - b), bodies: bodyRead.unreadable }, consent);
  const discardedBodies = new Set(discarded.bodies ?? []);
  // Listed without a body read: the only documents a later run gives their legacy body (S1, §43 XX2).
  const missingBodies = [...ids].filter((id) => !sources.has(id) && !discardedBodies.has(id));
  if (!isEmpty(refused)) {
    throw legacyUnreadable(name, refused, [...(refused.chunks ?? []).map((c) => chunkCauses.get(c)), ...(refused.bodies ?? []).map((b) => bodyRead.causes.get(b))]);
  }

  // Nothing sealed is written unless what this run read is still there (§39 TT2, §40 UU1).
  await unchanged();
  // 2. Bodies, then verify them; chunks, then verify them, then the manifest (the commit point) — nothing is
  //    committed that was not verified (§16 V7). Then purge.
  const now = Date.now();
  const manifest: DatabaseManifest = {
    name,
    owner: legacy.owner,
    description: legacy.description,
    dimensions: legacy.dimensions,
    vectorCount: vectors.size,
    storageSizeBytes: legacy.storageSizeBytes ?? 0,
    created: legacy.created ?? now,
    lastAccessed: legacy.lastAccessed ?? now,
    updated: now,
    chunks: [],
    chunkCount: 0,
    folderPaths: legacy.folderPaths,
    pendingDocuments: legacy.pendingDocuments ?? [],
    readyDocuments: legacy.readyDocuments ?? [],
    incarnation: randomHex(8),
    migratedFrom: { documentIds: [...ids], missingBodies },
  };
  await writeBodies(host, dbId, manifest, sources);
  await verifySealed(host, dbId, manifest, { bodies: sources, chunks: false });
  const headRecorded = await commitVerified(host, name, dbId, 0, manifest, vectors, async (m) => {
    await verifySealed(host, dbId, m, { vectorIds: new Set(vectors.keys()), bodies: false });
    await unchanged(); // again, right before the manifest — another device may have overtaken the writes (§40 UU1)
  });
  // A listed document's body that was not read — its read failed — is never deleted: the next run adopts it as that
  // document's body (S1).
  const unread = (rel: string) => { const id = bodyIdAt(rel); return id !== undefined && ids.has(id) && !sources.has(id) && !discardedBodies.has(id); };
  const sealedCopies = [...readChunks.map(chunkRel), ...[...sources.keys()].map(bodyRel), ...(discarded.chunks ?? []).map(chunkRel), ...[...discardedBodies].map(bodyRel)];
  return purge({
    name, status: 'migrated', vectors: vectors.size, documents: ids.size,
    discarded: bodyIds.filter((id) => !ids.has(id)),
    missingBodies,
    ...(missingChunks.length ? { missingChunks: missingChunks.sort((a, b) => a - b) } : {}),
    ...(!isEmpty(discarded) ? { discardedUnreadable: discarded } : {}),
  }, sealedCopies, unread, headRecorded);
}

async function besideSealed(
  host: RagMigrationHost, name: string, dbId: string, dir: string, sealed: DatabaseManifest, legacy: DatabaseManifest | undefined,
  inventory: Inventory, purge: Purge, unchanged: (from: DatabaseManifest) => Promise<void>, consent?: { chunks?: number[]; bodies?: string[] },
): Promise<RagMigrationEntry> {
  await verifySealed(host, dbId, sealed); // never delete legacy data beside a sealed copy we cannot read
  // Another device's write to the same database under the run (its incarnation, a newer revision) is not a move: the
  // decision is taken again against what it wrote, and committed on its revision (§43 XX1) — a few times; then
  // RAG_DATABASE_MOVED, as for a delete, a re-create or an outdated tab's legacy write.
  for (let rebases = 0; ; rebases++) {
    try {
      return await besideSealedAt(host, name, dbId, dir, sealed, legacy, inventory, purge, unchanged, consent);
    } catch (error) {
      if (!(error instanceof Overtaken)) throw error;
      if (rebases >= MAX_REBASES) throw movedWhileMoving(name);
      sealed = error.manifest; // its new chunks and bodies are that device's, trusted as vouch trusts them (§42 WW1)
    }
  }
}
const MAX_REBASES = 3;

/** One attempt of `besideSealed`, decided against `sealed` and committed on its revision. */
async function besideSealedAt(
  host: RagMigrationHost, name: string, dbId: string, dir: string, sealed: DatabaseManifest, legacy: DatabaseManifest | undefined,
  inventory: Inventory, purge: Purge, unchanged: (from: DatabaseManifest) => Promise<void>, consent?: { chunks?: number[]; bodies?: string[] },
): Promise<RagMigrationEntry> {
  // Repair (S1): a sealed document a migration or adoption recorded without a body, whose legacy body is readable now
  // — it arrived after the migration, or could not be read then. Only those: a document removed since and re-added
  // under its id is a new one (removeDocument forgets the id — §43 XX2).
  const current = new Set(docsOf(sealed).map((d) => d.id));
  const recorded = new Set(sealed.migratedFrom?.missingBodies ?? []);
  const bodiless = [...current].filter((id) => recorded.has(id) && !sealed.bodies?.[docKeyOf(host.sealer, dbId, id)]);
  const repairs = await readLegacyBodies(host, dir, bodiless);

  // Our leftover (snapshot = legacy list, nothing adopted) or an outdated tab's write after the migration.
  const snapshot = new Set(sealed.migratedFrom?.documentIds ?? []);
  const legacyDocs = (legacy && !legacy.deleted ? docsOf(legacy) : []) as Array<{ id: string; [k: string]: unknown }>;
  const candidates = legacyDocs.filter((d) => !current.has(d.id) && !snapshot.has(d.id));
  // Removed since the migration (in the snapshot, not the sealed copy), and bodies no entry names — garbage an old
  // UI's removal left behind; phase B deletes them, and the report names them all (V10, §17 W6).
  const named = new Set([...legacyDocs.map((d) => d.id), ...current]);
  const entryLess = inventory.files.map(bodyIdAt).filter((id): id is string => id !== undefined && !named.has(id));
  const discarded = [...legacyDocs.filter((d) => !current.has(d.id) && snapshot.has(d.id)).map((d) => d.id), ...entryLess];
  const adoptedBodies = await readLegacyBodies(host, dir, candidates.map((d) => d.id));
  // Unreadable bodies (V6): the ones consented to are left out (an adoption candidate without its body is not
  // adopted, and joins the snapshot); the others are kept and reported — never "missing", never deleted.
  const { discarded: consented, refused } = splitConsent({ chunks: [], bodies: [...repairs.unreadable, ...adoptedBodies.unreadable] }, consent);
  const consentedBodies = new Set(consented.bodies ?? []);
  const adopted = candidates.filter((d) => !consentedBodies.has(d.id));
  // A body the sealed copy still lacks after this run is never deleted (S1, §15 T1).
  const needed = new Set([
    ...bodiless.filter((id) => !repairs.bodies.has(id) && !consentedBodies.has(id)),
    ...adopted.map((d) => d.id).filter((id) => !adoptedBodies.bodies.has(id)),
  ]);
  const keep = (rel: string) => { const id = bodyIdAt(rel); return id !== undefined && needed.has(id); };
  const refusedBodies = new Set(refused.bodies ?? []);
  const report: RagMigrationEntry = {
    name, status: 'purged-leftover', vectors: 0, documents: 0,
    ...(legacyDocs.length || entryLess.length ? { discarded } : {}),
    ...(!isEmpty(refused) ? { unreadable: refused } : {}),
    ...(!isEmpty(consented) ? { discardedUnreadable: consented } : {}),
  };
  const missing = [...needed].filter((id) => !refusedBodies.has(id));
  if (missing.length) report.missingBodies = missing;
  const discardedCandidates = candidates.filter((d) => consentedBodies.has(d.id)).map((d) => d.id);
  if (adopted.length === 0 && repairs.bodies.size === 0 && discardedCandidates.length === 0) {
    // Nothing to commit — and so nothing that records a head: the purge waits for one vouching for the sealed copy
    // (§37 RR1), or another tab that listed the legacy data reads it as lost.
    return purge(report, [...consentedBodies].map(bodyRel), keep, await host.vouch(dbId, sealed));
  }

  await unchanged(sealed); // what this attempt read is still there (§39 TT2, §40 UU1)
  const manifest = structuredClone(sealed);
  const sources = new Map([...repairs.bodies, ...adoptedBodies.bodies]);
  if (adopted.length) (manifest.pendingDocuments ??= []).push(...adopted.map((d) => ({ ...d, embeddingStatus: 'pending' })));
  // Adopted (and consented-away) ids join the snapshot: removed later, they are never adopted again. The bodies still
  // missing are recorded for a later repair (§43 XX2).
  manifest.migratedFrom = { documentIds: [...snapshot, ...candidates.map((d) => d.id)], missingBodies: [...needed] };
  await writeBodies(host, dbId, manifest, sources);
  await verifySealed(host, dbId, manifest, { bodies: sources, chunks: false }); // before the commit (V7)
  const headRecorded = await commitVerified(host, name, dbId, sealed.revision ?? 0, manifest, undefined, () => unchanged(sealed)); // again, right before it
  if (adopted.length) Object.assign(report, { status: 'adopted-after-seal', documents: adopted.length, adopted: adopted.map((d) => d.id) });
  if (repairs.bodies.size) report.repairedBodies = [...repairs.bodies.keys()];
  return purge(report, [...[...sources.keys()].map(bodyRel), ...[...consentedBodies].map(bodyRel)], keep, headRecorded);
}

/**
 * The sealed side is still what this run found — absent, or the same revision and incarnation (§39 TT2). No lock spans
 * devices: another device's migration may have committed and purged under this run's reads, so a chunk or body read
 * as missing may only have moved; it commits before it purges, so this read sees it. Then nothing is committed:
 * RAG_DATABASE_MOVED (retryable) — a run's entry fails, an upgrade on write throws; the next read finds the sealed copy.
 * Beside a sealed copy, a newer revision of its incarnation (another device's write) is `Overtaken`: the run rebases on
 * it (§43 XX1).
 */
async function assertUnmoved(host: RagMigrationHost, name: string, dbId: string, from: DatabaseManifest | undefined): Promise<void> {
  const now = await host.readSealed(dbId);
  if (from === undefined ? now === null : now !== null && 'manifest' in now && now.manifest.revision === from.revision && now.manifest.incarnation === from.incarnation) return;
  // Written to since, by another device — the same incarnation, a newer revision: a run beside it rebases (§43 XX1).
  if (from !== undefined && now !== null && 'manifest' in now && now.manifest.incarnation === from.incarnation
    && (now.manifest.revision ?? 0) > (from.revision ?? 0)) throw new Overtaken(now.manifest);
  throw movedWhileMoving(name);
}

/** The sealed copy a run builds on was written to by another device: `manifest` is what it is now (§43 XX1). */
class Overtaken extends Error {
  constructor(readonly manifest: DatabaseManifest) { super('the sealed copy was written to under the run'); }
}

const movedWhileMoving = (name: string) =>
  new SDKError(`Database "${name}" moved to sealed storage (or changed) while it was being moved — retry`, 'RAG_DATABASE_MOVED', { database: name, retryable: true });

/**
 * Commit, then read the manifest back fresh (§35 PP1): its bodies and chunks were verified before the commit (§16 V7);
 * this proves the commit point itself opens — the legacy data is purged only beside a sealed copy that does, and that is
 * this run's (its incarnation): another device's delete or re-create since is RAG_DATABASE_MOVED (§44 YY5).
 *
 * Resolves whether this tab recorded the commit's head. One it could not record does not undo the commit — the sealed
 * copy stands, and an upgrade on write goes on to the write that asked for it (§35 PP2) — but a run then keeps the
 * legacy data (§36 QQ2).
 */
async function commitVerified(
  host: RagMigrationHost, name: string, dbId: string, previousRevision: number, manifest: DatabaseManifest,
  vectors?: Map<string, Vector>, beforeManifest?: (manifest: DatabaseManifest) => Promise<void>,
): Promise<boolean> {
  let headRecorded = true;
  try {
    await host.commit(name, dbId, previousRevision, manifest, vectors, beforeManifest);
  } catch (error: any) {
    if (error?.details?.committed !== true) throw error;
    console.warn(`[rag-migration] Moved to sealed storage; this tab could not record its head: ${error.message}`);
    headRecorded = false;
  }
  // Fresh: a manifest that does not open throws here. None, a tombstone or another incarnation is what another device
  // did in the round trip since (D45) — a delete, a delete and re-create: a move, never a failed verification; nothing
  // is purged, and the next run (or write) finds what is there (§44 YY5).
  const back = await host.readSealed(dbId);
  if (!(back && 'manifest' in back) || back.manifest.incarnation !== manifest.incarnation) throw movedWhileMoving(name);
  return headRecorded;
}

/**
 * Read every sealed chunk and body back by hash and open it; when sources are given, compare the chunks'
 * vector ids with the source set and each body byte for byte. s5js's upload integrity check (the portal
 * returns the hash of what it stored, and `put` compares it) already proves the portal holds our bytes; this
 * read-back proves the sealed copy opens under its contexts and holds what was read — the legacy data is
 * deleted only after both.
 */
async function verifySealed(
  host: RagMigrationHost, dbId: string, manifest: DatabaseManifest,
  expected: { vectorIds?: Set<string>; bodies?: Map<string, Uint8Array> | false; chunks?: boolean } = {},
): Promise<void> {
  const fail = (what: string) => new SDKError(`Sealed copy failed verification: ${what}`, 'RAG_MIGRATION_VERIFY_FAILED', { dbId, retryable: false });
  if (expected.chunks !== false) {
    const seen = new Set<string>();
    for (const c of manifest.chunks) {
      const bytes = await host.io.readHash(c.cid);
      const chunk = host.sealer.open(bytes, sealedLayout.chunkContext(dbId, manifest.incarnation!, c.chunkId)).value as { vectors: Vector[] };
      for (const v of chunk.vectors) seen.add(v.id);
    }
    if (expected.vectorIds && (seen.size !== expected.vectorIds.size || [...expected.vectorIds].some((id) => !seen.has(id)))) throw fail('vectors');
  }
  // Bodies, each once per migration (§19 Z23): with sources, exactly those, compared byte for byte; with none,
  // every recorded body must open; `false`, none (already verified).
  if (expected.bodies === false) return;
  const sources = expected.bodies;
  // Bodies are keyed by document key (§24 EE2): sources by id map to theirs.
  const entries = sources ? [...sources.keys()].map((id) => [id, docKeyOf(host.sealer, dbId, id)]) : Object.keys(manifest.bodies ?? {}).map((key) => [key, key]);
  for (const [id, key] of entries) {
    const b = manifest.bodies?.[key];
    if (!b) throw fail(`body ${id} not recorded`);
    const opened = host.sealer.open(await host.io.readHash(b.hash), sealedLayout.docContext(dbId, manifest.incarnation!, key));
    if (!sources) continue;
    const bytes = opened.kind === 'text' ? utf8.encode(opened.value) : (opened.value as Uint8Array);
    if (!equalBytes(bytes, sources.get(id)!)) throw fail(`body ${id}`);
  }
}

/** Phase A: delete these inventoried files (their content is in the sealed copy). */
async function deleteListed(host: RagMigrationHost, dir: string, rels: string[]): Promise<{ error?: string }> {
  const byDir = new Map<string, string[]>();
  for (const rel of rels) {
    const at = rel.lastIndexOf('/');
    const sub = at < 0 ? dir : `${dir}/${rel.slice(0, at)}`;
    let names = byDir.get(sub);
    if (!names) byDir.set(sub, names = []);
    names.push(rel.slice(at + 1)); // in place: a copy per file made a large purge quadratic (§35 PP10)
  }
  try {
    for (const [sub, names] of byDir) await host.io.deleteFiles(sub, names);
    return {};
  } catch (error) {
    return { error: codeOf(error) };
  }
}

/**
 * Phase B: a fresh view of the legacy directory decides (§16 V1, §18 B1). If its manifest CHANGED (an outdated tab
 * wrote) everything is kept — the next run adopts what is new. Otherwise our files go — the inventory minus `keep`
 * (files holding data the sealed copy lacks — S1) and minus `foreign` (files outside the layout, which the migration
 * never deletes — §19 Z13) — then the manifest LAST (R7), its hash checked again right before its delete (§17 W5;
 * nothing else runs between the two — §19 Z9), then the directories, only through s5js's own resolved-and-empty
 * check, so a file the inventory never listed keeps its directory. The residual window (s5js has no compare-and-swap)
 * is the one round trip from that check to the delete.
 */
async function finalPurge(
  host: RagMigrationHost, dir: string, readHash: string | undefined, inventory: Inventory,
  keep: (rel: string) => boolean, foreign: (rel: string) => boolean,
): Promise<PurgeResult> {
  const manifestPath = legacyLayout.manifestPath(dir);
  try {
    const now = await host.io.hashOf(manifestPath);
    if (now !== undefined && now !== readHash) return { purged: false };
    const ours = (rel: string) => rel !== 'manifest.json' && !foreign(rel);
    const a = await deleteListed(host, dir, inventory.files.filter((rel) => ours(rel) && !keep(rel)));
    if (a.error) return { purged: false, error: a.error };
    if (inventory.files.some((rel) => ours(rel) && keep(rel))) return { purged: false };
    if (inventory.files.includes('manifest.json')) {
      const before = await host.io.hashOf(manifestPath);
      if (before !== undefined && before !== readHash) return { purged: false };
      await host.io.deleteFile(manifestPath);
    }
    for (const sub of inventory.dirs) await host.io.deleteDir(`${dir}/${sub}`);
    // Our files are gone. The directory stays for files the migration does not own (reported), or is already gone:
    // another tab finished this purge (§19 Z20). With a foreign file in it, the directory is looked at again: a file of
    // the layout written since the inventory (an outdated tab's) is plaintext left — not purged (§42 WW2).
    if (inventory.files.some(foreign)) {
      const again = await takeInventory(host, dir, (await host.io.list(dir)) ?? []);
      return { purged: !again.files.some((rel) => !foreign(rel)) };
    }
    return { purged: (await host.io.deleteDir(dir)) || (await host.io.list(dir)) === undefined };
  } catch (error: any) {
    return { purged: false, error: codeOf(error) };
  }
}
