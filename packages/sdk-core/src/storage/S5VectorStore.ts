// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { S5 } from '@julesl23/s5js';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { Vector, SearchResult } from '../types';
import { SDKError } from '../types';
import type { DatabaseMetadata } from '../database/types';
import { mapWithConcurrency } from '../utils/concurrency';
import type { StorageSealer } from './sealed/StorageSealer';
import { SealedIO, retryableOf, type PathToHash } from './sealed/sealed-io';
import { createRagCoherence, headNotRecorded, type RagCoherence, type RagHead } from './sealed/rag-coherence';
import {
  migrateAllLegacy, migrateDatabaseLocked,
  type DiscardUnreadable, type MigrationProgress, type RagMigrationHost, type RagMigrationReport,
} from './sealed/rag-migration';
import {
  sealedLayout, legacyLayout, dbIdOf, docKeyOf, ragHeadScopeOf, randomHex, textOrBytes, legacyManifestFrom, isWellFormed, isLegacyVectorList,
  type DatabaseManifest, type VectorChunk,
} from './sealed/rag-layout';

/**
 * Statistics for a folder in a vector database
 */
export interface FolderStats {
  path: string;
  vectorCount: number;
  sizeBytes: number;
  lastModified: number;
}

export interface S5VectorStoreOptions {
  s5Client: S5;
  userAddress: string;
  encryptionManager: EncryptionManager;
  cacheEnabled?: boolean;
  /** Cross-tab lock + head record. Default: Web Locks + IndexedDB in a browser, in-process elsewhere. */
  coherence?: RagCoherence;
  /** `FS5Advanced.pathToCID` — byte-exact reads of legacy files (migration). */
  pathToHash?: PathToHash;
  /** Vectors per chunk file (default 10 000). */
  chunkSize?: number;
  /** S5 connection state; while it reports offline every RAG write fails fast with STORAGE_OFFLINE. */
  isOnline?: () => boolean;
}

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';
export type DocumentStatusUpdates = { vectorCount?: number; embeddingProgress?: number; embeddingError?: string };

type Loaded = { kind: 'sealed' | 'legacy'; dbId: string; manifest: DatabaseManifest };
type Current = Loaded | { kind: 'absent'; dbId: string; tombstone?: RagHead };

const notFound = (name: string) => new SDKError(`Database "${name}" not found`, 'RAG_DATABASE_NOT_FOUND', { database: name, retryable: false });
// Logic errors: coded and not retryable, like every failure (§22 CC5).
const dimensionMismatch = (name: string, expected: number, got: number) =>
  new SDKError(`Vector dimension mismatch (expected ${expected}, got ${got})`, 'RAG_VECTOR_DIMENSION_MISMATCH', { database: name, expected, got, retryable: false });
const vectorNotFound = (name: string, vectorId: string) =>
  new SDKError(`Vector "${vectorId}" not found`, 'RAG_VECTOR_NOT_FOUND', { database: name, vectorId, retryable: false });
/**
 * Something a discovery could not read: `dbId` when it is one database; `database`, the name, for a legacy database —
 * so the UI can offer to delete one that never reads (§19 Z7).
 */
interface DiscoveryFailure { what: string; code: string; dbId?: string; database?: string }

/**
 * Whether a head vouches for a cached manifest: at its revision AND incarnation — the same revision of a re-created
 * database is another manifest (§20 AA4). The one rule for the read and the listing (§21 BB2).
 */
function headVouches(head: RagHead, manifest: DatabaseManifest): boolean {
  return !head.deleted && head.revision === manifest.revision && head.incarnation === manifest.incarnation;
}

/**
 * The incarnation a tombstone records when no sealed one was deleted (§29 JJ1). Real incarnations are random hex, so a
 * sealed manifest never has it: such a tombstone covers legacy manifests only.
 */
const LEGACY_INCARNATION = 'legacy';

/**
 * Whether a tombstone deletes this manifest: a legacy manifest (no incarnation) always — its database was deleted
 * since (§19 Z10); a sealed one of the same incarnation (§15 T2 — another incarnation is a new database, whatever its
 * revision; the `legacy` sentinel matches none — §29 JJ1). The revision branch is for a tombstone that recorded no
 * incarnation: an earlier build's, still in a browser's heads within the trust window (this build always records one).
 */
function tombstoneCovers(tombstone: RagHead, manifest: DatabaseManifest): boolean {
  if (!manifest.incarnation) return true;
  return tombstone.incarnation !== undefined ? manifest.incarnation === tombstone.incarnation : (manifest.revision ?? -1) <= tombstone.revision;
}

/**
 * Head keys that are RAG databases. RAG heads live in this identity's scope (`ragHeadScopeOf`), apart from log
 * heads (root keys from `logHeadKeyOf`); the check keeps anything else out of discovery.
 */
const DB_ID = /^[0-9a-f]{32}$/;
/**
 * Vectors to add: a list of records with a string id and a list of numbers, metadata absent or an object — refused
 * before anything runs, never an uncoded failure inside the lock after an upgrade on write (§38 SS3).
 */
export function assertVectorList(databaseName: string, vectors: unknown): asserts vectors is Vector[] {
  if (!isLegacyVectorList(vectors)) {
    throw new SDKError('Vectors to add are a list of { id, vector: number[], metadata? }', 'RAG_VECTORS_INVALID', { database: databaseName, retryable: false });
  }
}

/**
 * A legacy read another tab's or device's migration (or a delete) overtook: the retry reads where the database lives
 * (§38 SS2). A migration that another device — or an outdated tab's legacy write — overtook says the same: it committed
 * nothing (§39 TT2, §40 UU1, §41 VV4).
 */
const moved = (name: string) =>
  new SDKError(`Database "${name}" moved to sealed storage (or was deleted) while it was read — retry`, 'RAG_DATABASE_MOVED', { database: name, retryable: true });
const documentNotFound = (name: string, documentId: string) =>
  new SDKError(`Document "${documentId}" not found in "${name}"`, 'RAG_DOCUMENT_NOT_FOUND', { database: name, documentId, retryable: false });
/** A listed document whose body has not been uploaded (D16: a body may come after its entry) — §19 Z15. */
const bodyMissing = (name: string, documentId: string) =>
  new SDKError(`Document "${documentId}" in "${name}" has no body yet`, 'RAG_DOCUMENT_BODY_MISSING', { database: name, documentId, retryable: false });
/** A new document id UTF-8 cannot carry exactly (a lone surrogate) — refused where it would be created (§23 DD9). */
const illFormedId = (name: string, documentId: string) =>
  new SDKError('A document id must be well-formed Unicode (it has a lone surrogate)', 'RAG_DOCUMENT_INVALID', { database: name, documentId, retryable: false });
/**
 * A folder a call matches, or renames to: a non-blank string — an undefined one would match every vector without a
 * folder (§27 HH7). Checked before anything is read.
 */
function assertFolderPath(databaseName: string, folderPath: unknown): void {
  if (typeof folderPath !== 'string' || folderPath.trim() === '') {
    throw new SDKError('A folder path is a non-blank string', 'RAG_FOLDER_PATH_INVALID', { database: databaseName, retryable: false });
  }
}
/** A metadata filter: a plain object with at least one field, none undefined (§26 GG7). */
const isFilter = (filter: unknown): filter is Record<string, unknown> =>
  typeof filter === 'object' && filter !== null && !Array.isArray(filter)
  && Object.keys(filter).length > 0 && Object.values(filter).every((value) => value !== undefined);
const isListed = (manifest: DatabaseManifest, documentId: string) =>
  [...(manifest.pendingDocuments ?? []), ...(manifest.readyDocuments ?? [])].some((d: any) => d?.id === documentId);
/** Failures that no retry can fix: wrong key/context, or bytes that are not a manifest. */
const NOT_RETRYABLE = new Set(['SEALED_OPEN_FAILED', 'RAG_MANIFEST_CORRUPT']);

/**
 * Vector databases on S5, sealed.
 *
 * Layout: `home/rag/v1/{dbId}/manifest` and `…/chunk-{n}`, where `dbId` is a keyed hash of the name —
 * no database name, file name or wallet address appears in any path, and every file is a sealed envelope
 * (see `sealed/StorageSealer`). The manifest is the only source of truth: it records each chunk's blob
 * hash, and chunks are read by hash, so a stale or lost directory entry cannot serve old data.
 *
 * Every mutation is one read-modify-write under the database's cross-tab lock, on a manifest checked
 * against the head record another tab committed (see `sealed/rag-coherence`). Databases still in the
 * legacy plaintext layout (`home/vector-databases/{address}/{name}/…`) are readable; the SDK never writes
 * there.
 */
export class S5VectorStore {
  /**
   * Concurrency cap for parallel manifest fetches in `initialize()`. Raised
   * from 10 to 20 in 1.20.0 after empirical confirmation that the S5 portal
   * handles the higher fan-out without rate-limiting; ~2x cold-path speedup
   * for users with many vector databases.
   */
  private static readonly INIT_CONCURRENCY = 20;

  private readonly s5Client: S5;
  private readonly userAddress: string;
  private readonly encryptionManager: EncryptionManager;
  private readonly cacheEnabled: boolean;
  private readonly coherence: RagCoherence;
  private readonly pathToHash: PathToHash;
  private readonly chunkSize: number;
  private readonly isOnline?: () => boolean;
  private manifestCache: Map<string, DatabaseManifest>;
  private vectorCache: Map<string, { signature: string; vectors: Map<string, Vector> }>;
  private initialized = false;
  /** What the last discovery could not read (empty = complete). See `_doInitialize`. */
  private discoveryFailures: DiscoveryFailure[] = [{ what: 'not discovered yet', code: 'RAG_DISCOVERY_INCOMPLETE' }];
  /** When the cached discovery started, and when each cached manifest was read (coherence clock — §16 V2). */
  private discoveredAt = -Infinity;
  private readonly cachedAt = new Map<string, number>();
  private sealedIO?: SealedIO;
  private scopedHeads?: RagCoherence;
  /** A discovery and the store's state belong to one generation; every reset starts a new one (§17 W9). */
  private generation = 0;
  /**
   * In-flight initialize() promise. When the SDK kicks off init in the
   * background (deferred init via FabstirSDKCore.getVectorRAGReady), the
   * consumer may also call initialize() directly. Without this, both calls
   * would each fan out a fresh batch of S5 manifest fetches. With this,
   * the second caller joins the first's promise.
   */
  private initInFlight?: { generation: number; promise: Promise<void> };

  constructor(options: S5VectorStoreOptions) {
    this.s5Client = options.s5Client;
    this.userAddress = options.userAddress;
    this.encryptionManager = options.encryptionManager;
    this.cacheEnabled = options.cacheEnabled !== false;
    this.coherence = options.coherence ?? createRagCoherence();
    this.pathToHash = options.pathToHash ?? (async (path, readOptions) => {
      const { FS5Advanced } = await import('@julesl23/s5js');
      return new FS5Advanced((this.s5Client as any).fs).pathToCID(path, readOptions);
    });
    this.chunkSize = options.chunkSize ?? 10000;
    this.isOnline = options.isOnline;
    this.manifestCache = new Map();
    this.vectorCache = new Map();
  }

  // The sealer and I/O are resolved on first use, so constructing a store never touches key material.
  private get sealer(): StorageSealer {
    return this.encryptionManager.getStorageSealer();
  }

  /** This identity's heads (S9); locks stay on `coherence`. */
  private get heads(): RagCoherence {
    this.scopedHeads ??= this.coherence.scoped(ragHeadScopeOf(this.sealer));
    return this.scopedHeads;
  }

  private get io(): SealedIO {
    this.sealedIO ??= new SealedIO(this.s5Client as any, (b) => this.sealer.isSealed(b), this.pathToHash);
    return this.sealedIO;
  }

  /**
   * Initialize vector store by loading existing databases from S5
   *
   * **Usage**: Call once at startup, not after every operation
   * - Skips once a complete discovery has run (`invalidateCaches()` resets that); after a transient failure the
   *   next call looks again
   * - Retries with exponential backoff to handle blob propagation delays
   */
  async initialize(): Promise<void> {
    await this._initialize();
  }

  /**
   * @returns the generation this discovery answers for (§21 BB1) — a caller that compares it with the current one
   * later sees every reset since. Never the generation from before the call: a stale discovery resets on entry.
   */
  private async _initialize(): Promise<number> {
    // Skip if already initialized (prevents redundant S5 calls; invalidateCaches() resets it)
    if (this.cacheEnabled && this.initialized) {
      // A complete discovery is trusted as long as heads are (§16 V2): older than that, other tabs' and devices'
      // creates and deletes may be invisible to it — look again, from scratch. The vector cache stays: its entries
      // are checked against the manifest they are read for (§17 W10).
      if (this.coherence.now() - this.discoveredAt <= this.coherence.trustMs()) return this.generation;
      this._resetDiscovery();
    }

    // Join the current generation's discovery in flight — never one a reset has since superseded (§17 W9).
    const generation = this.generation;
    if (this.initInFlight?.generation !== generation) {
      const promise = (async () => {
        // Only a complete discovery is remembered as one: after a transient failure the next call looks again.
        const startedAt = this.coherence.now();
        const seen = new Set<string>();
        const failures = await this._doInitialize(generation, startedAt, seen);
        if (generation !== this.generation) return; // reset meanwhile: its answer may miss what was cleared
        this.discoveryFailures = failures;
        if (failures.length === 0) {
          this.initialized = true;
          this.discoveredAt = startedAt;
          // Complete: what it did not find, among the entries read before it began, is gone (§39 TT5).
          for (const name of [...this.manifestCache.keys()]) {
            if (!seen.has(name) && (this.cachedAt.get(name) ?? -Infinity) < startedAt) this._forget(name);
          }
        }
      })();
      this.initInFlight = { generation, promise };
      promise.finally(() => { if (this.initInFlight?.promise === promise) this.initInFlight = undefined; }).catch(() => {});
    }
    await this.initInFlight!.promise;
    // A reset while we waited: this answer belongs to the new generation's discovery.
    if (generation !== this.generation) return this._initialize();
    return generation;
  }

  /**
   * @returns what it could not read — empty when the discovery is complete (only then is it cached). Every read is
   * fresh and a registry miss is a failure (§18 B1, s5js D3b), so an empty listing or a missing manifest is certain:
   * a listed directory without a manifest is no database (being created, being deleted, or an interrupted
   * migration's orphan — §16 V5) — but a legacy one may have moved, and the sealed side decides (§39 TT1); the legacy
   * root is listed before the sealed one (§40 UU2). Permanent failures (a manifest that will not open under this key, a corrupt one)
   * do not make the discovery incomplete: such a database can never be read — `deleteDatabase` removes it.
   */
  private async _doInitialize(generation: number, startedAt: number, seen: Set<string>): Promise<DiscoveryFailure[]> {
    const failures: DiscoveryFailure[] = [];
    // A superseded discovery caches nothing: its reads may be older than the current one's (§19 Z18). What it caches is
    // as old as the discovery's start (§38 SS1).
    const cache = (name: string, manifest: DatabaseManifest) => {
      seen.add(name);
      if (this.cacheEnabled && generation === this.generation) this._cacheManifest(name, manifest, startedAt);
    };
    const attempt = async <T>(what: string, fn: () => Promise<T>, id: { dbId?: string; database?: string } = {}): Promise<T | undefined> => {
      try {
        return await this._withRetries(fn);
      } catch (error: any) {
        console.warn(`[S5VectorStore] ⚠️ Failed to load ${what}:`, error);
        if (!NOT_RETRYABLE.has(error?.code)) failures.push({ what, code: error?.code ?? 'S5_IO_ERROR', ...id });
        return undefined;
      }
    };
    /** Undefined only when the listing failed (recorded); a directory that is not there lists as empty. */
    const directories = async (label: string, dir: string) =>
      (await attempt(`the ${label} listing`, async () => (await this.io.list(dir)) ?? []))?.filter((e) => e.type === 'directory').map((e) => e.name);
    // The legacy root first, then the sealed one (§40 UU2): a migration commits before it purges, so a sealed listing
    // served after the legacy one holds every database the legacy listing missed — never one in neither.
    const legacyDirs = await directories('legacy', legacyLayout.base(this.userAddress));
    const [sealedListing, allHeads] = await Promise.all([
      directories('sealed', sealedLayout.root),
      this.heads.listHeads(),
    ]);
    const heads = allHeads.filter(([id]) => DB_ID.test(id));
    const listed = sealedListing ?? [];

    // 1. Sealed databases: the (fresh) listing ∪ this browser's heads — a tombstone among them is evidence below.
    const headOf = new Map(heads);
    const ids = new Set([...listed, ...heads.filter(([, h]) => !h.deleted).map(([id]) => id)]);
    const noManifest = new Set<string>();
    await mapWithConcurrency([...ids], S5VectorStore.INIT_CONCURRENCY, async (dbId) => {
      const found = await attempt(`sealed ${dbId}`, () => this._readSealedById(dbId, headOf.get(dbId)), { dbId });
      if (found === null) noManifest.add(dbId);
      if (found && 'manifest' in found) cache(found.manifest.name, found.manifest);
    });

    // 2. Legacy databases with no sealed evidence at all — listed, or a head (a tombstone included): a sealed
    //    database that failed to load, or was deleted, is never replaced by its legacy copy (I3, R4, R5). A listed
    //    directory certainly without a manifest (an interrupted migration's orphan) is no evidence (§17 W8).
    const evidence = new Set([...listed.filter((id) => !noManifest.has(id)), ...heads.map(([id]) => id)]);
    // Only when the sealed listing succeeded: without it, the sealed database a legacy copy stands for may be one
    // this discovery never saw (§19 Z4). The failure is recorded, so the discovery is incomplete and looks again.
    const legacy = sealedListing === undefined ? [] : (legacyDirs ?? []).filter((name) => !evidence.has(this._dbId(name)));
    await mapWithConcurrency(legacy, S5VectorStore.INIT_CONCURRENCY, async (name) => {
      const manifest = await attempt(`legacy "${name}"`, () => this._loadManifest(name), { database: name });
      if (manifest && !manifest.deleted) return cache(name, manifest);
      if (manifest !== null) return; // a failed read (recorded), or a legacy delete marker
      // Its manifest gone since the listing: a migration may have moved it — the sealed side decides (§39 TT1).
      const found = await attempt(`sealed "${name}"`, () => this._readSealedById(this._dbId(name)), { database: name });
      if (found && 'manifest' in found) cache(found.manifest.name, found.manifest);
    });
    return failures;
  }

  /** Retry with exponential backoff (200…1600 ms) for blob propagation delays; throws the last error. */
  private async _withRetries<T>(fn: () => Promise<T>): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (i === 4 || NOT_RETRYABLE.has(error?.code)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 200 * Math.pow(2, i)));
      }
    }
  }

  /**
   * Bring the cached list in line with the heads another tab committed: drop what a tombstone deleted (its own incarnation),
   * load what is new or newer. A failed read keeps the cached entry (never absence, I2).
   */
  private async _reconcileWithHeads(): Promise<DiscoveryFailure[]> {
    if (!this.cacheEnabled) return [];
    const failures: DiscoveryFailure[] = [];
    const nameOf = new Map([...this.manifestCache.keys()].map((name) => [this._dbId(name), name]));
    for (const [dbId, head] of await this.heads.listHeads()) {
      if (!DB_ID.test(dbId)) continue;
      const name = nameOf.get(dbId);
      const cached = name !== undefined ? this.manifestCache.get(name) : undefined;
      if (head.deleted) {
        if (name !== undefined && cached && tombstoneCovers(head, cached)) this._forget(name);
        continue;
      }
      if (cached && headVouches(head, cached)) continue;
      try {
        const readAt = this.coherence.now();
        const found = await this._readSealedById(dbId, head);
        if (found && 'manifest' in found) this._cacheManifest(found.manifest.name, found.manifest, readAt);
      } catch (error: any) {
        // The cached entry (if any) stays; the view is incomplete — callers deciding on "all" hear it (T3).
        if (!NOT_RETRYABLE.has(error?.code)) failures.push({ what: `sealed ${dbId}`, code: error?.code ?? 'S5_IO_ERROR', dbId });
      }
    }
    return failures;
  }

  /**
   * Create a new vector database
   *
   * @throws Error if database name is empty or database already exists
   */
  async createDatabase(config: { name: string; owner: string; description?: string }): Promise<DatabaseMetadata> {
    // An empty name cannot be listed; a blank one is refused below, only where nothing exists (§24 EE6).
    if (typeof config.name !== 'string' || config.name === '') {
      throw new SDKError('Database name cannot be empty', 'RAG_DATABASE_NAME_INVALID', { database: config.name, retryable: false });
    }
    const dbId = this._dbId(config.name);
    return this._withWriteLock(dbId, async () => {
      const cur = await this._readCurrent(config.name);
      // Existing first: a listed database an older client named that way is opened as EXISTS (§23 DD7).
      if (cur.kind !== 'absent') {
        throw new SDKError(`Database "${config.name}" already exists`, 'RAG_DATABASE_EXISTS', { database: config.name, retryable: false });
      }
      if (!config.name.trim()) {
        throw new SDKError('Database name cannot be empty', 'RAG_DATABASE_NAME_INVALID', { database: config.name, retryable: false });
      }
      // Refused where a name is created (§22 CC1): a lone surrogate would not survive every platform's CBOR.
      if (!isWellFormed(config.name)) {
        throw new SDKError('A database name must be well-formed Unicode (it has a lone surrogate)', 'RAG_DATABASE_NAME_INVALID', { database: config.name, retryable: false });
      }
      const now = Date.now();
      const manifest: DatabaseManifest = {
        name: config.name,
        owner: config.owner,
        description: config.description,
        vectorCount: 0,
        storageSizeBytes: 0,
        created: now,
        lastAccessed: now,
        updated: now,
        chunks: [],
        chunkCount: 0,
        folderPaths: [],
        incarnation: randomHex(8), // a re-created database must not accept an earlier incarnation's files
      };
      await this._commitLocked(config.name, dbId, cur.tombstone?.revision ?? 0, manifest);
      return this._manifestToMetadata(manifest);
    });
  }

  /**
   * List all databases for current user
   *
   * @returns Array of database metadata (excluding deleted databases)
   */
  async listDatabases(): Promise<DatabaseMetadata[]> {
    // Ensure databases are loaded from S5, then catch up with what other tabs committed since
    await this.initialize();
    await this._reconcileWithHeads();
    return this._cachedList();
  }

  private _cachedList(): DatabaseMetadata[] {
    const databases: DatabaseMetadata[] = [];
    for (const manifest of this.manifestCache.values()) {
      if (!manifest.deleted) databases.push(this._manifestToMetadata(manifest));
    }
    return databases;
  }

  /**
   * Every database, for callers that decide on "all" (a search, the pending documents): throws
   * RAG_DISCOVERY_INCOMPLETE `{ retryable: true, failed: [{ what, code, dbId?, database? }] }` when one could not be read —
   * a partial list is never "all" (I2, §15 T3).
   */
  async listAllDatabases(): Promise<DatabaseMetadata[]> {
    if (!this.cacheEnabled) {
      // Discovery keeps what it finds in the manifest cache: without it there is no "all" to answer (§16 V11).
      throw new SDKError('listAllDatabases needs the manifest cache (cacheEnabled)', 'RAG_DISCOVERY_INCOMPLETE', { retryable: false, failed: [] });
    }
    for (;;) {
      // The generation the discovery answered for: a reset since — one queued behind it (§20 AA2), an invalidation
      // or a refresh while the heads were read — emptied the cache this would answer from: look again rather than
      // answer "all" with part of it (§19 Z3). A discovery that outlasts the trust window is still an answer (§21 BB1).
      const generation = await this._initialize();
      const failed = [...this.discoveryFailures, ...(await this._reconcileWithHeads())];
      if (generation !== this.generation) continue;
      if (failed.length) {
        throw new SDKError('Some RAG databases could not be read — retry', 'RAG_DISCOVERY_INCOMPLETE', { retryable: true, failed });
      }
      return this._cachedList();
    }
  }

  /**
   * Get metadata for a specific database
   *
   * @returns Database metadata or null if not found/deleted
   */
  async getDatabase(databaseName: string): Promise<DatabaseMetadata | null> {
    const loaded = await this._load(databaseName);
    return loaded ? this._manifestToMetadata(loaded.manifest) : null;
  }

  /**
   * Delete a database: every file under its sealed directory AND its legacy directory, then a tombstone
   * head so a tab with a stale directory view cannot resurrect it.
   *
   * @throws Error if database not found; SDKError RAG_DELETE_INCOMPLETE if anything remains
   */
  async deleteDatabase(databaseName: string): Promise<void> {
    const dbId = this._dbId(databaseName);
    await this._withWriteLock(dbId, async () => {
      // The sealed side is read only to name the incarnation the tombstone deletes. A manifest that will never open
      // (another key, corrupt) does not stop a delete (§15 T5); one that cannot be read NOW does: a tombstone without
      // its incarnation could resurrect or hide the database (§16 V4). The legacy side is deleted from its listings
      // and its manifest is never read, so one that never reads cannot block its own deletion (§19 Z7).
      // The head is read once, before anything is deleted (§35 PP8): failing to read it leaves everything in place.
      const known = await this.heads.getHead(dbId);
      let sealed: Awaited<ReturnType<S5VectorStore['_readSealedById']>> | undefined;
      let readError: unknown;
      try {
        sealed = await this._readSealedById(dbId, known);
      } catch (error: any) {
        if (!NOT_RETRYABLE.has(error?.code)) throw error;
        readError = error;
      }
      // The legacy tree first, then the sealed one, each manifest last: an interrupted delete leaves the database
      // still listed and deletable again — never a nameless directory (§16 V5), and never its stale legacy copy in
      // the sealed one's place (§17 W7). A name that is not one path segment has no legacy directory (§19 Z2).
      const hadLegacy = legacyLayout.isName(databaseName)
        && await this.io.deleteTree(this._legacyDir(databaseName), { last: ['manifest.json'] });
      const hadSealed = await this.io.deleteTree(sealedLayout.dir(dbId), { last: ['manifest'] });
      if (!hadSealed && !hadLegacy) {
        if (readError) throw readError;
        if (!sealed || 'tombstone' in sealed) throw notFound(databaseName);
      }
      const previous = Math.max(
        known?.revision ?? 0,
        !sealed ? 0 : 'tombstone' in sealed ? sealed.tombstone.revision ?? 0 : sealed.manifest.revision ?? 0,
      );
      // The incarnation deleted — or, deleting again, the one the tombstone already names: a tombstone naming it is
      // kept at any age, and never becomes one that is not (§21 BB13). With no sealed one to name (a legacy-only
      // database, or a sealed manifest that cannot be read), the sentinel: kept at any age too, it covers every legacy
      // manifest and never a sealed one (§29 JJ1).
      const incarnation = (!sealed ? undefined : 'manifest' in sealed ? sealed.manifest.incarnation : sealed.tombstone.incarnation)
        ?? LEGACY_INCARNATION;
      // Deleted on S5: this tab forgets it even when its head cannot be recorded, then says the delete landed (§34 OO4).
      const unrecorded = await this.heads.putHead(dbId, { revision: previous + 1, deleted: true, incarnation }).then(() => undefined, headNotRecorded);
      this._forget(databaseName);
      if (unrecorded) throw unrecorded;
    });
  }

  /**
   * Update database metadata (description, dimensions, counts) in one locked commit. Document lists change
   * only through the keyed document methods: a caller-built array would overwrite another tab's additions.
   *
   * @throws Error if database not found; SDKError RAG_DOCUMENT_ARRAYS_READONLY for document arrays
   */
  async updateDatabaseMetadata(databaseName: string, metadata: Partial<DatabaseMetadata>): Promise<void> {
    if (metadata.pendingDocuments !== undefined || metadata.readyDocuments !== undefined) {
      throw new SDKError(
        'pendingDocuments/readyDocuments change only through addPendingDocument, updateDocumentStatus and removeDocument',
        'RAG_DOCUMENT_ARRAYS_READONLY',
        { database: databaseName, retryable: false },
      );
    }
    await this._mutate(databaseName, (manifest) => {
      if (metadata.vectorCount !== undefined) manifest.vectorCount = metadata.vectorCount;
      if (metadata.storageSizeBytes !== undefined) manifest.storageSizeBytes = metadata.storageSizeBytes;
      if (metadata.description !== undefined) manifest.description = metadata.description;
      if (metadata.dimensions !== undefined) manifest.dimensions = metadata.dimensions;
      manifest.lastAccessed = Date.now();
    });
  }

  // ===== DOCUMENTS =====
  // Keyed operations under the database lock, so two tabs adding documents never overwrite each other.

  /** Add (or, for the same id, replace) a pending document — retry-safe. */
  async addPendingDocument(databaseName: string, doc: { id: string; [key: string]: unknown }): Promise<void> {
    if (!doc || typeof doc.id !== 'string' || doc.id === '') {
      throw new SDKError('A document needs a non-empty string id', 'RAG_DOCUMENT_INVALID', { database: databaseName, retryable: false });
    }
    await this._mutate(databaseName, (manifest) => {
      // Refused where an id is created (§21 BB7, §23 DD9): one an older client already listed is still a document.
      if (!isWellFormed(doc.id) && !isListed(manifest, doc.id)) throw illFormedId(databaseName, doc.id);
      if (manifest.readyDocuments?.some((d) => d.id === doc.id)) {
        throw new SDKError(`Document "${doc.id}" is already ready`, 'RAG_DOCUMENT_ALREADY_READY', { database: databaseName, documentId: doc.id, retryable: false });
      }
      const pending = manifest.pendingDocuments ?? [];
      const i = pending.findIndex((d) => d.id === doc.id);
      if (i >= 0) pending[i] = { ...doc };
      else pending.push({ ...doc });
      manifest.pendingDocuments = pending;
    });
  }

  /** Set a document's embedding status; `ready` moves it from pending to ready. */
  async updateDocumentStatus(databaseName: string, documentId: string, status: DocumentStatus, updates?: DocumentStatusUpdates): Promise<void> {
    await this._mutate(databaseName, (manifest) => {
      const pending = manifest.pendingDocuments ?? [];
      const ready = manifest.readyDocuments ?? [];
      const pi = pending.findIndex((d) => d.id === documentId);
      const ri = ready.findIndex((d) => d.id === documentId);
      const current = pi >= 0 ? pending[pi] : ri >= 0 ? ready[ri] : undefined;
      if (!current) throw documentNotFound(databaseName, documentId);
      const updated = {
        ...current,
        embeddingStatus: status,
        lastEmbeddingAttempt: Date.now(),
        ...(updates?.vectorCount !== undefined && { vectorCount: updates.vectorCount }),
        ...(updates?.embeddingProgress !== undefined && { embeddingProgress: updates.embeddingProgress }),
        ...(updates?.embeddingError !== undefined && { embeddingError: updates.embeddingError }),
      };
      if (pi >= 0 && status === 'ready') {
        pending.splice(pi, 1);
        ready.push(updated);
      } else if (pi >= 0) {
        pending[pi] = updated;
      } else {
        ready[ri] = updated;
      }
      manifest.pendingDocuments = pending;
      manifest.readyDocuments = ready;
    });
  }

  /** Remove a document's entry and its sealed body. Its vectors are the caller's (deleteByMetadata). */
  async removeDocument(databaseName: string, documentId: string): Promise<void> {
    await this._mutate(databaseName, (manifest, _load, dbId) => {
      const before = (manifest.pendingDocuments?.length ?? 0) + (manifest.readyDocuments?.length ?? 0);
      manifest.pendingDocuments = manifest.pendingDocuments?.filter((d) => d.id !== documentId);
      manifest.readyDocuments = manifest.readyDocuments?.filter((d) => d.id !== documentId);
      const after = (manifest.pendingDocuments?.length ?? 0) + (manifest.readyDocuments?.length ?? 0);
      const key = docKeyOf(this.sealer, dbId, documentId);
      const hadBody = manifest.bodies?.[key] !== undefined;
      if (hadBody) delete manifest.bodies![key];
      if (before === after && !hadBody) throw documentNotFound(databaseName, documentId);
      // Re-added under this id, it is a new document: never given the removed one's legacy body (§43 XX2).
      const missing = manifest.migratedFrom?.missingBodies;
      if (missing?.includes(documentId)) manifest.migratedFrom!.missingBodies = missing.filter((id) => id !== documentId);
    });
  }

  /** Store a document body sealed. It reads back with exactly this type and these bytes. */
  async putDocumentBody(databaseName: string, documentId: string, body: string | Uint8Array): Promise<void> {
    if (typeof body !== 'string' && !(body instanceof Uint8Array)) {
      throw new SDKError('A document body is a string or a Uint8Array', 'RAG_DOCUMENT_INVALID', { database: databaseName, documentId, retryable: false });
    }
    // A lone surrogate cannot be stored as UTF-8 — it would read back altered, and a body reads back exactly (§20 AA9).
    if (typeof body === 'string' && !isWellFormed(body)) {
      throw new SDKError('A text body must be well-formed Unicode (it has a lone surrogate)', 'RAG_DOCUMENT_INVALID', { database: databaseName, documentId, retryable: false });
    }
    const payload = typeof body === 'string' ? { kind: 'text' as const, value: body } : { kind: 'bytes' as const, value: body };
    await this._mutate(databaseName, (manifest, _load, dbId) => {
      if (!isWellFormed(documentId) && !isListed(manifest, documentId)) throw illFormedId(databaseName, documentId); // §23 DD9
      return this._writeBodyLocked(dbId, manifest, documentId, payload);
    });
  }

  /**
   * A document body, read by the hash the manifest recorded (legacy databases: the plaintext file, raw) — only for a
   * listed document (a body whose entry was removed, or never came, is not served — §19 Z11).
   * @throws RAG_DOCUMENT_NOT_FOUND for an unlisted id; RAG_DOCUMENT_BODY_MISSING for a listed one with no body yet.
   */
  async getDocumentBody(databaseName: string, documentId: string): Promise<string | Uint8Array> {
    const loaded = await this._require(databaseName);
    if (!isListed(loaded.manifest, documentId)) throw documentNotFound(databaseName, documentId);
    if (loaded.kind === 'legacy') {
      const dir = this._legacyDir(databaseName);
      const raw = await this.io.readRaw(`${legacyLayout.documentsDir(dir)}/${legacyLayout.bodyFile(documentId)}`);
      if (!raw) throw (await this._moved(databaseName)) ? moved(databaseName) : bodyMissing(databaseName, documentId);
      return textOrBytes(raw).value;
    }
    const key = docKeyOf(this.sealer, loaded.dbId, documentId);
    const entry = loaded.manifest.bodies?.[key];
    if (!entry) throw bodyMissing(databaseName, documentId);
    const bytes = await this.io.readHash(entry.hash);
    const context = sealedLayout.docContext(loaded.dbId, loaded.manifest.incarnation!, key);
    return this.sealer.open(bytes, context).value as string | Uint8Array;
  }

  /**
   * Move every legacy plaintext database to sealed storage (or purge it, when it was deleted), then delete
   * the plaintext. Idempotent and resumable; run it on every unlock — it also cleans up after outdated tabs.
   * The final purge runs once all databases are migrated (§16 V1). `discardUnreadable`:
   * per database, the exact unreadable items the user consented to leave out (§16 V6).
   */
  async migrateLegacyStorage(opts: { onProgress?: (e: MigrationProgress) => void; discardUnreadable?: DiscardUnreadable } = {}): Promise<RagMigrationReport> {
    this._assertOnline();
    const report = await migrateAllLegacy(this._migrationHost(), opts.onProgress, opts.discardUnreadable);
    if (report.databases.length > 0) this.invalidateCaches();
    return report;
  }

  /** Drop every cached manifest and vector map; the next read goes back to S5. */
  invalidateCaches(): void {
    this._resetDiscovery();
    this.vectorCache.clear();
  }

  /** Forget the discovery and the manifests, in a new generation (§17 W9). */
  private _resetDiscovery(): void {
    this.generation++;
    this.manifestCache.clear();
    this.cachedAt.clear();
    this.initialized = false;
  }

  /**
   * Check if a database exists. A failed read throws — it is never reported as "does not exist".
   */
  async databaseExists(databaseName: string): Promise<boolean> {
    return (await this._load(databaseName)) !== null;
  }

  /**
   * Add multiple vectors to database (batch operation), chunked into `chunkSize`-vector files.
   *
   * @returns the database's vector count once committed — its total, not the number added (also `details.result` of a
   *   `committed: true` error, §37 RR2)
   * @throws Error if database not found or vector dimensions mismatch; SDKError RAG_VECTORS_INVALID (not retryable)
   *   unless `vectors` is a list of vectors (§38 SS3)
   */
  async addVectors(databaseName: string, vectors: Vector[]): Promise<number> {
    assertVectorList(databaseName, vectors);
    // The committed count, from the write itself — never a second read that could fail after it landed (§37 RR2).
    return this._mutate(databaseName, async (manifest, load) => {
      if (vectors.length > 0) {
        const firstDim = vectors[0].vector.length;
        for (const vec of vectors) {
          if (vec.vector.length !== firstDim) throw dimensionMismatch(databaseName, firstDim, vec.vector.length);
        }
        if (!manifest.dimensions) manifest.dimensions = firstDim;
        else if (manifest.dimensions !== firstDim) throw dimensionMismatch(databaseName, manifest.dimensions, firstDim);
      }
      const all = await load();
      for (const vector of vectors) {
        all.set(vector.id, vector);
        const folderPath = vector.metadata?.folderPath;
        if (folderPath && !manifest.folderPaths.includes(folderPath)) manifest.folderPaths.push(folderPath);
      }
      return all.size;
    });
  }

  /**
   * Retrieve a single vector by ID
   *
   * @returns Vector with metadata or null if not found
   */
  async getVector(databaseName: string, vectorId: string): Promise<Vector | null> {
    const loaded = await this._load(databaseName);
    if (!loaded) return null;
    return (await this._vectors(databaseName, loaded)).get(vectorId) || null;
  }

  /**
   * Delete a single vector by ID
   *
   * @throws Error if database not found
   */
  async deleteVector(databaseName: string, vectorId: string): Promise<void> {
    await this._mutate(databaseName, async (_manifest, load) => {
      (await load()).delete(vectorId);
    });
  }

  /**
   * Delete these vectors in one write (§36 QQ1): it lands whole or not at all — a `committed: true` covers every id.
   * An id that is not there is no error; an empty list writes nothing (§37 RR3).
   *
   * @throws SDKError RAG_VECTOR_IDS_INVALID (not retryable) unless `vectorIds` is a list
   */
  async deleteVectors(databaseName: string, vectorIds: string[]): Promise<void> {
    if (!Array.isArray(vectorIds)) {
      throw new SDKError('Vector ids to delete are a list', 'RAG_VECTOR_IDS_INVALID', { database: databaseName, retryable: false });
    }
    if (vectorIds.length === 0) return;
    await this._mutate(databaseName, async (_manifest, load) => {
      const all = await load();
      for (const id of vectorIds) all.delete(id);
    });
  }

  /**
   * Delete all vectors matching a metadata filter (key-value exact match)
   *
   * @returns Number of vectors deleted
   * @throws SDKError RAG_FILTER_INVALID (not retryable) unless the filter is a non-empty object of defined values:
   *   `{}` would match every vector, and an undefined value (`{ documentId: doc?.id }`) every one lacking the key
   *   (§26 GG7).
   */
  async deleteByMetadata(databaseName: string, filter: Record<string, any>): Promise<number> {
    if (!isFilter(filter)) {
      throw new SDKError('A delete filter is a non-empty object of defined values', 'RAG_FILTER_INVALID', { retryable: false });
    }
    return this._mutate(databaseName, async (_manifest, load) => {
      const all = await load();
      let deletedCount = 0;
      for (const [id, vector] of all.entries()) {
        if (this._matchesFilter(vector.metadata, filter)) {
          all.delete(id);
          deletedCount++;
        }
      }
      return deletedCount;
    });
  }

  /**
   * Update metadata for a specific vector (merged with existing)
   *
   * @throws Error if vector not found
   */
  async updateMetadata(databaseName: string, vectorId: string, metadata: Record<string, any>): Promise<void> {
    await this._mutate(databaseName, async (_manifest, load) => {
      const all = await load();
      const vector = all.get(vectorId);
      if (!vector) throw vectorNotFound(databaseName, vectorId);
      all.set(vectorId, { ...vector, metadata: { ...vector.metadata, ...metadata } });
    });
  }

  /**
   * List all vectors in database
   *
   * Warning: Loads ALL vectors into memory - use with caution for large databases
   */
  async listVectors(databaseName: string): Promise<Vector[]> {
    const loaded = await this._require(databaseName);
    return Array.from((await this._vectors(databaseName, loaded)).values());
  }

  async getStats(databaseName: string) {
    const { manifest } = await this._require(databaseName);
    return {
      vectorCount: manifest.vectorCount,
      chunkCount: manifest.chunkCount,
      storageSizeBytes: manifest.storageSizeBytes,
      lastUpdated: manifest.updated,
    };
  }

  async getDatabaseMetadata(databaseName: string): Promise<DatabaseMetadata> {
    const db = await this.getDatabase(databaseName);
    if (!db) throw notFound(databaseName);
    return db;
  }

  async addVector(databaseName: string, id: string, vector: number[], metadata?: Record<string, any>): Promise<void> {
    await this.addVectors(databaseName, [{ id, vector, metadata: metadata || {} }]);
  }

  async getVectors(databaseName: string, vectorIds: string[]): Promise<Vector[]> {
    const loaded = await this._require(databaseName);
    const all = await this._vectors(databaseName, loaded);
    return vectorIds.map(id => all.get(id)).filter(v => v !== undefined) as Vector[];
  }

  // ===== FOLDER OPERATIONS (Mock SDK Parity) =====
  // Each is ONE locked commit — locks are not reentrant, and one commit per vector would rewrite every chunk each time.

  async listFolders(databaseName: string): Promise<string[]> {
    const { manifest } = await this._require(databaseName);
    return [...manifest.folderPaths].sort();
  }

  async getAllFoldersWithCounts(databaseName: string): Promise<Array<{ path: string; fileCount: number }>> {
    const { manifest } = await this._require(databaseName);
    const vectors = await this.listVectors(databaseName);
    const folderCounts = new Map<string, number>();

    vectors.forEach(v => {
      const folder = v.metadata?.folderPath;
      if (folder) {
        folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1);
      }
    });

    manifest.folderPaths.forEach(folder => {
      if (!folderCounts.has(folder)) {
        folderCounts.set(folder, 0);
      }
    });

    return Array.from(folderCounts.entries())
      .map(([path, fileCount]) => ({ path, fileCount }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async getFolderStatistics(databaseName: string, folderPath: string): Promise<FolderStats> {
    const vectors = await this.listVectors(databaseName);
    const folderVectors = vectors.filter(v => v.metadata?.folderPath === folderPath);

    return {
      path: folderPath,
      vectorCount: folderVectors.length,
      sizeBytes: folderVectors.length * (folderVectors[0]?.vector.length || 0) * 4,
      lastModified: Date.now(),
    };
  }

  async createFolder(databaseName: string, folderPath: string): Promise<void> {
    assertFolderPath(databaseName, folderPath);
    await this._mutate(databaseName, (manifest) => {
      if (!manifest.folderPaths.includes(folderPath)) manifest.folderPaths.push(folderPath);
    });
  }

  async renameFolder(databaseName: string, oldPath: string, newPath: string): Promise<number> {
    assertFolderPath(databaseName, oldPath);
    assertFolderPath(databaseName, newPath);
    return this._mutate(databaseName, async (manifest, load) => {
      const moved = this._moveFolder(await load(), oldPath, newPath);
      const idx = manifest.folderPaths.indexOf(oldPath);
      if (idx !== -1) manifest.folderPaths[idx] = newPath;
      return moved;
    });
  }

  async deleteFolder(databaseName: string, folderPath: string): Promise<number> {
    assertFolderPath(databaseName, folderPath);
    return this._mutate(databaseName, async (manifest, load) => {
      const all = await load();
      let deleted = 0;
      for (const [id, v] of all.entries()) {
        if (v.metadata?.folderPath === folderPath) {
          all.delete(id);
          deleted++;
        }
      }
      manifest.folderPaths = manifest.folderPaths.filter(f => f !== folderPath);
      return deleted;
    });
  }

  async moveToFolder(databaseName: string, vectorId: string, targetFolder: string): Promise<void> {
    await this._mutate(databaseName, async (_manifest, load) => {
      const all = await load();
      const vector = all.get(vectorId);
      if (!vector) throw vectorNotFound(databaseName, vectorId);
      all.set(vectorId, { ...vector, metadata: { ...vector.metadata, folderPath: targetFolder } });
    });
  }

  async moveFolderContents(databaseName: string, sourceFolder: string, targetFolder: string): Promise<number> {
    assertFolderPath(databaseName, sourceFolder);
    return this._mutate(databaseName, async (_manifest, load) => this._moveFolder(await load(), sourceFolder, targetFolder));
  }

  async searchInFolder(databaseName: string, folderPath: string, queryVector: number[], k?: number, threshold?: number): Promise<SearchResult[]> {
    throw new SDKError('searchInFolder() requires host-side support. Use search() and filter results client-side for now.', 'RAG_NOT_SUPPORTED', { retryable: false });
  }

  // ===== PRIVATE HELPERS =====

  private _dbId(databaseName: string): string {
    return dbIdOf(this.sealer, databaseName);
  }

  private _legacyDir(databaseName: string): string {
    return legacyLayout.dir(this.userAddress, databaseName);
  }

  private _migrationHost(): RagMigrationHost {
    return {
      sealer: this.sealer,
      io: this.io,
      userAddress: this.userAddress,
      readSealed: (dbId) => this._readSealedById(dbId),
      commit: (name, dbId, revision, manifest, vectors, beforeManifest) => this._commitLocked(name, dbId, revision, manifest, vectors, beforeManifest),
      vouch: async (dbId, manifest) => {
        // A head of this origin vouching for the manifest — recorded when there is none (§37 RR1): one this tab cannot
        // record leaves the legacy data where it is. Only for what is there now (§41 VV2, §42 WW1): the run read it long
        // ago, so it vouches for the manifest it reads fresh — a newer revision of the same incarnation included (another
        // device's writes; the leftover stays a leftover). No manifest, a tombstone or another incarnation (a delete,
        // a re-create) keeps the legacy data, and the next run looks again.
        const now = await this._readSealedById(dbId);
        if (!now || !('manifest' in now) || now.manifest.incarnation !== manifest.incarnation) return false;
        const fresh = now.manifest;
        try {
          const head = await this.heads.getHead(dbId);
          if (head && headVouches(head, fresh)) return true;
          await this.heads.putHead(dbId, { revision: fresh.revision ?? 0, incarnation: fresh.incarnation });
          return true;
        } catch (error: any) {
          if (error?.code !== 'RAG_COHERENCE_UNAVAILABLE') throw error;
          return false;
        }
      },
      writeBody: (dbId, manifest, documentId, payload) => this._writeBodyLocked(dbId, manifest, documentId, payload),
      withWriteLock: (dbId, fn) => this._withWriteLock(dbId, fn),
    };
  }

  private _assertOnline(): void {
    if (this.isOnline && !this.isOnline()) {
      throw new SDKError('S5 is offline — RAG writes need a live connection; retry after it reconnects', 'STORAGE_OFFLINE', { retryable: true });
    }
  }

  /**
   * Every RAG write takes the database's lock (I4) and checks the connection only once it holds it — a write
   * that queued behind another tab must not start into an outage that began while it waited.
   */
  private _withWriteLock<T>(dbId: string, fn: () => Promise<T>): Promise<T> {
    return this.coherence.withLock(dbId, async () => {
      this._assertOnline();
      return fn();
    });
  }

  /** Seal and write one document body, recording it in `manifest.bodies`. Caller holds the lock and commits. */
  private async _writeBodyLocked(
    dbId: string, manifest: DatabaseManifest, documentId: string,
    payload: { kind: 'text'; value: string } | { kind: 'bytes'; value: Uint8Array },
  ): Promise<void> {
    const key = docKeyOf(this.sealer, dbId, documentId);
    const sealed = this.sealer.seal(payload, sealedLayout.docContext(dbId, manifest.incarnation!, key));
    const hash = await this.io.write(sealedLayout.docPath(dbId, key), sealed);
    // Keyed by the document's derived key, never by its id: no caller's string is an object key (§24 EE2). Added in
    // place — `manifest` is the caller's working copy; a copy per body made a migration quadratic (§35 PP10).
    (manifest.bodies ??= {})[key] = { hash, kind: payload.kind, size: sealed.length };
  }

  private _moveFolder(all: Map<string, Vector>, from: string, to: string): number {
    let moved = 0;
    for (const [id, v] of all.entries()) {
      if (v.metadata?.folderPath === from) {
        all.set(id, { ...v, metadata: { ...v.metadata, folderPath: to } });
        moved++;
      }
    }
    return moved;
  }

  /** A legacy plaintext manifest by name: null when absent, throws on any other failure. */
  private async _loadManifest(databaseName: string): Promise<DatabaseManifest | null> {
    if (!legacyLayout.isName(databaseName)) return null; // no legacy directory can hold it (§19 Z2)
    const path = legacyLayout.manifestPath(this._legacyDir(databaseName));
    return legacyManifestFrom(await this.io.readPath(path), path);
  }

  private _openManifest(dbId: string, bytes: Uint8Array): DatabaseManifest {
    return this.sealer.open(bytes, sealedLayout.manifestContext(dbId)).value as DatabaseManifest;
  }

  /**
   * The sealed manifest at its path — a fresh read (§18 B1), which already holds every commit of this origin's tabs.
   * A head never overrides it (§19 Z5): a head newer than a fresh read can only be one another device has since
   * deleted or replaced. A tombstone covering the manifest's incarnation means deleted.
   */
  private async _readSealedById(dbId: string, knownHead?: RagHead): Promise<{ manifest: DatabaseManifest } | { tombstone: RagHead } | null> {
    const [head, read] = await Promise.all([
      knownHead ? Promise.resolve(knownHead) : this.heads.getHead(dbId),
      this.io.readPath(sealedLayout.manifestPath(dbId)),
    ]);
    if (read.state === 'plain') {
      throw new SDKError(`Plaintext found at a sealed manifest path (${dbId})`, 'RAG_MANIFEST_CORRUPT', { dbId, retryable: false });
    }
    const manifest = read.state === 'sealed' ? this._openManifest(dbId, read.bytes) : undefined;
    if (head?.deleted && (!manifest || tombstoneCovers(head, manifest))) return { tombstone: head };
    return manifest ? { manifest } : null;
  }

  /**
   * Where a database lives right now. Sealed wins over legacy (I3): the sealed read is fresh and a registry miss
   * fails it (§18 B1), so a legacy copy is served, or absence reported, only on a certain sealed absence (S1).
   */
  private async _readCurrent(databaseName: string): Promise<Current> {
    const dbId = this._dbId(databaseName);
    let sealed = await this._readSealedById(dbId);
    let legacy: DatabaseManifest | undefined;
    if (!sealed) {
      const found = await this._loadManifest(databaseName);
      legacy = found && !found.deleted ? found : undefined;
      // Absent twice: a migration may have committed and purged between the two reads — it commits before it purges,
      // so the sealed side read once more decides (§39 TT1).
      if (!legacy) sealed = await this._readSealedById(dbId);
    }
    if (sealed && 'manifest' in sealed) return { kind: 'sealed', dbId, manifest: sealed.manifest };
    // A tombstone makes the name absent: legacy data under it is only ever purged (R5).
    if (sealed && 'tombstone' in sealed) return { kind: 'absent', dbId, tombstone: sealed.tombstone };
    return legacy ? { kind: 'legacy', dbId, manifest: legacy } : { kind: 'absent', dbId };
  }

  /** A validated read: the cached manifest if the head says it is current, else a fresh read. */
  private async _load(databaseName: string): Promise<Loaded | null> {
    const cached = this.cacheEnabled ? this.manifestCache.get(databaseName) : undefined;
    const dbId = this._dbId(databaseName);
    if (cached) {
      // Something must vouch for a cached manifest (§16 V2): a trusted head at its revision, or — with no trusted
      // head — its own youth, within the same window (the coherence's `trustMs()`, §19 Z5); past it the path is read again.
      const head = await this.heads.getHead(dbId);
      const vouched = head ? headVouches(head, cached)
        : this.coherence.now() - (this.cachedAt.get(databaseName) ?? -Infinity) <= this.coherence.trustMs();
      if (vouched) return { kind: cached.incarnation ? 'sealed' : 'legacy', dbId, manifest: cached };
    }
    const readAt = this.coherence.now();
    const cur = await this._readCurrent(databaseName);
    this._remember(databaseName, cur, readAt);
    return cur.kind === 'absent' ? null : cur;
  }

  private async _require(databaseName: string): Promise<Loaded> {
    const loaded = await this._load(databaseName);
    if (!loaded) throw notFound(databaseName);
    return loaded;
  }

  /** `readAt`: when the read of `cur` began (§38 SS1). */
  private _remember(databaseName: string, cur: Current, readAt: number): void {
    if (cur.kind === 'absent') return this._forget(databaseName);
    if (this.cacheEnabled) this._cacheManifest(databaseName, cur.manifest, readAt);
  }

  private _forget(databaseName: string): void {
    this.manifestCache.delete(databaseName);
    this.cachedAt.delete(databaseName);
    this.vectorCache.delete(databaseName);
  }

  /**
   * Cache a manifest, stamped with when its read BEGAN (§16 V2, §38 SS1): a read that straddled another tab's commit is
   * then never younger than that commit's head — the head's trust window covers it, so no cache outlives its vouching.
   */
  private _cacheManifest(databaseName: string, manifest: DatabaseManifest, readAt: number): void {
    this.manifestCache.set(databaseName, manifest);
    this.cachedAt.set(databaseName, readAt);
  }

  /** Sealed chunks are identified by their hashes; a legacy chunk "cid" is a constant path, so `updated` stands in. */
  private _chunkSignature(kind: Loaded['kind'], manifest: DatabaseManifest): string {
    const cids = manifest.chunks.map((c) => c.cid).join(',');
    return kind === 'sealed' ? `sealed:${cids}` : `legacy:${cids}:${manifest.updated}`;
  }

  /** All vectors of a loaded database. Any unreadable chunk throws; nothing partial is cached (I2). */
  private async _vectors(databaseName: string, loaded: Loaded): Promise<Map<string, Vector>> {
    const { manifest, kind, dbId } = loaded;
    const signature = this._chunkSignature(kind, manifest);
    const cached = this.vectorCache.get(databaseName);
    if (this.cacheEnabled && cached?.signature === signature) return cached.vectors;

    const chunks = await Promise.all(manifest.chunks.map(async (c) => {
      try {
        if (kind === 'legacy') return await this._readLegacyChunk(databaseName, c.chunkId);
        const bytes = await this.io.readHash(c.cid);
        return this.sealer.open(bytes, sealedLayout.chunkContext(dbId, manifest.incarnation!, c.chunkId)).value as VectorChunk;
      } catch (cause: any) {
        if (cause?.code === 'RAG_DATABASE_MOVED') throw cause; // not this chunk's fault: the retry reads elsewhere
        throw new SDKError(`Chunk ${c.chunkId} of "${databaseName}" is unreadable`, 'RAG_CHUNK_UNREADABLE', {
          database: databaseName, chunkId: c.chunkId, cause, retryable: retryableOf(cause),
        });
      }
    }));

    const vectors = new Map<string, Vector>();
    for (const chunk of chunks) {
      for (const vector of chunk?.vectors ?? []) vectors.set(vector.id, vector);
    }
    if (this.cacheEnabled) this.vectorCache.set(databaseName, { signature, vectors });
    return vectors;
  }

  /**
   * A legacy file read missing under a manifest this tab holds: did the database move since — another tab's or
   * device's migration purged it, or a delete? A fresh sealed read decides (a manifest or a tombstone there); when it
   * moved, this tab now holds the sealed copy it read, stamped at that read's start — the retry reads it, and the
   * database stays listed; deleted (a tombstone), this tab forgets it (§38 SS2, §39 TT3). Only otherwise is the file
   * lost.
   */
  private async _moved(databaseName: string): Promise<boolean> {
    const readAt = this.coherence.now();
    const found = await this._readSealedById(this._dbId(databaseName));
    if (!found) return false;
    // Moved: this tab now holds the sealed copy it just read — listed still, the retry reads it (§39 TT3). Deleted: gone.
    if ('manifest' in found && this.cacheEnabled) this._cacheManifest(databaseName, found.manifest, readAt);
    else this._forget(databaseName);
    return true;
  }

  /**
   * A legacy plaintext chunk, or null when it provably does not exist (its vectors are already lost —
   * failing forever would only make the rest unusable, R8) — unless the database moved: RAG_DATABASE_MOVED (§38 SS2).
   * A failed or malformed read throws.
   */
  private async _readLegacyChunk(databaseName: string, chunkId: number): Promise<VectorChunk | null> {
    const read = await this.io.readPath(legacyLayout.chunkPath(this._legacyDir(databaseName), chunkId));
    if (read.state === 'absent') {
      if (await this._moved(databaseName)) throw moved(databaseName);
      console.warn(`[S5VectorStore] Legacy chunk ${chunkId} of "${databaseName}" does not exist — its vectors are lost`);
      return null;
    }
    const chunk = read.state === 'plain' ? (read.value as VectorChunk) : undefined;
    if (!isLegacyVectorList(chunk?.vectors)) { // its entries too (§24 EE3)
      // No retry reads it differently (§20 AA8).
      throw new SDKError(`Legacy chunk ${chunkId} is ${read.state === 'plain' ? 'malformed' : read.state}`, 'RAG_CHUNK_MALFORMED', { database: databaseName, chunkId, retryable: false });
    }
    return chunk!;
  }

  /**
   * One read-modify-write under the database's lock: read the current manifest (head-checked), apply `fn`
   * to a copy, commit. `load()` gives the vector map; if it is called, the chunks are rewritten. A legacy
   * database is migrated first (upgrade on write) — it is never written in place.
   */
  private async _mutate<T>(
    databaseName: string,
    fn: (manifest: DatabaseManifest, load: () => Promise<Map<string, Vector>>, dbId: string) => Promise<T> | T,
  ): Promise<T> {
    const dbId = this._dbId(databaseName);
    return this._withWriteLock(dbId, async () => {
      let readAt = this.coherence.now();
      let cur = await this._readCurrent(databaseName);
      if (cur.kind === 'legacy') {
        const entry = await migrateDatabaseLocked(this._migrationHost(), databaseName);
        if (entry?.status === 'anomaly') {
          // Something in it already carries the seal: no run moves it (§21 BB4). The entry says what.
          throw new SDKError(`Database "${databaseName}" cannot be moved to sealed storage: ${entry.error}`, 'RAG_MIGRATION_FAILED', {
            database: databaseName, entry, retryable: false,
          });
        }
        readAt = this.coherence.now();
        cur = await this._readCurrent(databaseName);
        if (cur.kind === 'legacy') {
          // It changed under the migration (another tab's purge, an outdated tab's write): a retry reads it again
          // (§19 Z14).
          throw new SDKError(`Database "${databaseName}" changed while it was being moved to sealed storage — retry`, 'RAG_MIGRATION_FAILED', {
            database: databaseName, retryable: true,
          });
        }
      }
      this._remember(databaseName, cur, readAt);
      if (cur.kind === 'absent') throw notFound(databaseName);
      const manifest = structuredClone(cur.manifest);
      let vectors: Map<string, Vector> | undefined;
      try {
        const result = await fn(manifest, async () => (vectors ??= new Map(await this._vectors(databaseName, cur))), dbId);
        const dropped = Object.keys(cur.manifest.bodies ?? {}).filter((key) => !manifest.bodies?.[key]);
        await this._commitLocked(databaseName, dbId, cur.manifest.revision ?? 0, manifest, vectors, undefined, dropped).catch((error: any) => {
          // A write that landed carries what it did — a count, … — so its caller can still say so (§37 RR2).
          if (error?.details?.committed === true) throw new SDKError(error.message, error.code, { ...error.details, result });
          throw error;
        });
        return result;
      } catch (error) {
        this.vectorCache.delete(databaseName); // `fn` may have touched shared vector objects
        throw error;
      }
    });
  }

  /**
   * Write the chunks (when given) and the manifest, then the head; then sweep the chunks past the new count and the
   * `droppedBodies`. Caller holds the lock. Once the manifest is written the commit has landed: a head this tab cannot
   * record still lets the cache take the manifest and the sweeps run, then throws `committed: true` (§34 OO4).
   */
  private async _commitLocked(
    databaseName: string,
    dbId: string,
    previousRevision: number,
    manifest: DatabaseManifest,
    vectors?: Map<string, Vector>,
    beforeManifest?: (manifest: DatabaseManifest) => Promise<void>,
    droppedBodies: string[] = [],
  ): Promise<void> {
    if (vectors) {
      const all = Array.from(vectors.values());
      const chunks: VectorChunk[] = [];
      for (let i = 0; i < all.length; i += this.chunkSize) {
        chunks.push({ chunkId: chunks.length, vectors: all.slice(i, i + this.chunkSize) });
      }
      // Two at a time: each sealed chunk can be ~40 MB, and sealing all of them at once holds them all in memory.
      manifest.chunks = await mapWithConcurrency(chunks, 2, async (chunk) => {
        const bytes = this.sealer.seal({ kind: 'cbor', value: chunk }, sealedLayout.chunkContext(dbId, manifest.incarnation!, chunk.chunkId));
        const cid = await this.io.write(sealedLayout.chunkPath(dbId, chunk.chunkId), bytes);
        return { chunkId: chunk.chunkId, cid, vectorCount: chunk.vectors.length, sizeBytes: bytes.length, updatedAt: Date.now() };
      });
      manifest.chunkCount = manifest.chunks.length;
      manifest.vectorCount = vectors.size;
    }
    // The commit point is the manifest: a caller that must verify what it wrote does so first (§16 V7).
    if (beforeManifest) await beforeManifest(manifest);
    manifest.revision = previousRevision + 1;
    manifest.updated = Date.now();
    const sealedManifest = this.sealer.seal({ kind: 'cbor', value: manifest }, sealedLayout.manifestContext(dbId));
    const manifestHash = await this.io.write(sealedLayout.manifestPath(dbId), sealedManifest);
    const unrecorded = await this.heads.putHead(dbId, { revision: manifest.revision, manifestHash, incarnation: manifest.incarnation })
      .then(() => undefined, headNotRecorded);

    if (this.cacheEnabled) this._cacheManifest(databaseName, manifest, this.coherence.now()); // our own commit
    if (vectors) {
      const dir = sealedLayout.dir(dbId);
      if (this.cacheEnabled) {
        this.vectorCache.set(databaseName, { signature: this._chunkSignature('sealed', manifest), vectors });
      }
      const orphans = ((await this.io.list(dir).catch(() => undefined)) ?? [])
        .map((e) => /^chunk-(\d+)$/.exec(e.name))
        .filter((m): m is RegExpExecArray => m !== null && Number(m[1]) >= manifest.chunkCount)
        .map((m) => m[0]);
      if (orphans.length) await this._deleteOrphans(dir, orphans);
    }
    if (droppedBodies.length) await this._deleteOrphans(sealedLayout.documentsDir(dbId), droppedBodies);
    if (unrecorded) throw unrecorded;
  }

  /**
   * After a commit, files the manifest no longer references (chunks past the new count, removed bodies) are
   * sealed leftovers: remove them. Best effort — the commit already succeeded; the chunk sweep reruns at
   * every vector commit and deleteDatabase removes everything.
   */
  private async _deleteOrphans(dir: string, names: string[]): Promise<void> {
    try {
      await this.io.deleteFiles(dir, names);
    } catch (error) {
      console.warn(`[S5VectorStore] Orphan sweep of ${dir} incomplete:`, error);
    }
  }

  private _manifestToMetadata(manifest: DatabaseManifest): DatabaseMetadata {
    return {
      databaseName: manifest.name,
      type: 'vector' as const,
      createdAt: manifest.created,
      lastAccessedAt: manifest.lastAccessed,
      owner: manifest.owner,
      vectorCount: manifest.vectorCount,
      storageSizeBytes: manifest.storageSizeBytes,
      description: manifest.description,
      dimensions: manifest.dimensions,
      // Preserve document metadata arrays for deferred embeddings workflow
      pendingDocuments: manifest.pendingDocuments,
      readyDocuments: manifest.readyDocuments,
    } as any;
  }

  /** A vector without metadata has no fields: it matches no field of a filter (§25 FF4). */
  private _matchesFilter(metadata: Record<string, any> | undefined, filter: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata?.[key] !== value) {
        return false;
      }
    }
    return true;
  }
}
