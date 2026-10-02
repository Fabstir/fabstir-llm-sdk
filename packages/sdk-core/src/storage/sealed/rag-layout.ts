// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * The sealed RAG layout in one place: the manifest shape, where each file lives, and the context string
 * (AAD) it is sealed under. Seal and open must build the same context byte for byte — a drifted copy
 * would make that data unreadable — so every seal and open site uses these builders.
 */

import type { Vector } from '../../types';
import { SDKError } from '../../types';
import { bytesToHex } from '../../crypto/utilities';
import type { StorageSealer } from './StorageSealer';
import type { PathRead } from './sealed-io';

export interface ChunkMetadata {
  chunkId: number;
  /** Sealed layout: the BLAKE3 hash (hex) of the sealed chunk file — reads go by this, never by path. */
  cid: string;
  vectorCount: number;
  sizeBytes: number;
  updatedAt: number;
}

export interface VectorChunk {
  chunkId: number;
  vectors: Vector[];
}

export interface DatabaseManifest {
  name: string;
  owner: string;
  description?: string;
  dimensions?: number;
  vectorCount: number;
  storageSizeBytes: number;
  created: number;
  lastAccessed: number;
  updated: number;
  chunks: ChunkMetadata[];
  chunkCount: number;
  folderPaths: string[];
  deleted?: boolean;
  // Document metadata for deferred embeddings workflow
  pendingDocuments?: any[];
  readyDocuments?: any[];
  // Sealed layout only — a manifest without an incarnation is a legacy (plaintext) one.
  /**
   * Document bodies by document KEY (`docKeyOf` — 32 hex), never by id: a caller's id is never an object key
   * (`__proto__`, `constructor` — §24 EE2). The sealed file's hash (reads go by it), its kind and size.
   */
  bodies?: Record<string, { hash: string; kind: 'text' | 'bytes'; size: number }>;
  revision?: number;
  incarnation?: string;
  /**
   * Set by the migration: the document ids the legacy copy held when it was sealed (D18), and those a migration or an
   * adoption found without a body — the only ones a later run gives their legacy body (S1); `removeDocument` forgets
   * an id there (§43 XX2).
   */
  migratedFrom?: { documentIds: string[]; missingBodies?: string[] };
}

const SEALED_ROOT = 'home/rag/v1';

/** `home/rag/v1/{dbId}/…` — paths carry no database name, file name or wallet address. */
export const sealedLayout = {
  root: SEALED_ROOT,
  dir: (dbId: string) => `${SEALED_ROOT}/${dbId}`,
  manifestPath: (dbId: string) => `${SEALED_ROOT}/${dbId}/manifest`,
  chunkPath: (dbId: string, n: number) => `${SEALED_ROOT}/${dbId}/chunk-${n}`,
  documentsDir: (dbId: string) => `${SEALED_ROOT}/${dbId}/documents`,
  docPath: (dbId: string, docKey: string) => `${SEALED_ROOT}/${dbId}/documents/${docKey}`,
  // The incarnation cannot be in the manifest's own context (it is read from inside the manifest).
  manifestContext: (dbId: string) => `rag/v1/${dbId}/manifest`,
  chunkContext: (dbId: string, incarnation: string, n: number) => `rag/v1/${dbId}/${incarnation}/chunk/${n}`,
  docContext: (dbId: string, incarnation: string, docKey: string) => `rag/v1/${dbId}/${incarnation}/doc/${docKey}`,
};

/** The plaintext layout earlier SDKs and UIs wrote: `home/vector-databases/{address}/{name}/…`. */
export const legacyLayout = {
  base: (userAddress: string) => `home/vector-databases/${userAddress}`,
  /**
   * Whether `name` can have a legacy directory: one non-empty path segment — the only shape a listing of the base
   * yields. Any other string would address something else (`''` the base itself, `a/b` a subdirectory — §19 Z2).
   */
  isName: (name: string) => name.length > 0 && !name.includes('/') && name !== '.' && name !== '..',
  dir: (userAddress: string, name: string) => {
    if (!legacyLayout.isName(name)) throw new SDKError(`No legacy directory for "${name}"`, 'RAG_DATABASE_NAME_INVALID', { database: name, retryable: false });
    return `home/vector-databases/${userAddress}/${name}`;
  },
  manifestPath: (dir: string) => `${dir}/manifest.json`,
  chunkPath: (dir: string, n: number) => `${dir}/chunk-${n}.json`,
  documentsDir: (dir: string) => `${dir}/documents`,
  bodyFile: (documentId: string) => `${documentId}.txt`,
  /** The document id a `documents/` file holds the body of — only `{id}.txt` is one (§19 Z13). */
  bodyIdOf: (file: string): string | undefined => (file.endsWith('.txt') && file.length > 4 ? file.slice(0, -4) : undefined),
  /**
   * A file the old managers/DocumentManager wrote under `{root}/{database}/`: `{database}_{nameHash}_{ms}_{random}` —
   * numbers as JS renders them, never with a leading zero (§22 CC4).
   */
  isDocumentManagerFile: (database: string, file: string) =>
    file.startsWith(`${database}_`) && /^(0|-?[1-9]\d*)_[1-9]\d*_[a-z0-9]*$/.test(file.slice(database.length + 1)),
  /** The old managers/DocumentManager upload root. */
  documentManagerRoot: (userAddress: string) => `home/documents/${userAddress}`,
};

export { isWellFormed } from './StorageSealer';

/**
 * A database's id — for any name, a listed one too: ids are derived losslessly (§22 CC1), so a name an older client
 * wrote with a lone surrogate has its own. Such names are refused only where they would be created (`createDatabase`).
 */
export const dbIdOf = (sealer: StorageSealer, name: string) => sealer.deriveId('db', name);
export const docKeyOf = (sealer: StorageSealer, dbId: string, documentId: string) => sealer.deriveId('doc', `${dbId}:${documentId}`);
/**
 * RAG heads are LISTED (discovery), so they live in an identity scope: an identity lists only its own in a
 * shared origin or process (S9).
 */
export const ragHeadScopeOf = (sealer: StorageSealer) => sealer.deriveId('heads', 'rag');
/**
 * Log heads are only ever read by key, and the key is derived from the identity: another identity's log with
 * the same id has another key, and IndexedDB never names a conversation (S9).
 */
export const logHeadKeyOf = (sealer: StorageSealer, conversationId: string) => sealer.deriveId('conv', conversationId);

export const randomHex = (bytes: number) => bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));

const strictUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }); // a leading BOM is kept (§16 V7)

/** Legacy bodies were written as strings: valid UTF-8 is text, anything else stays bytes. */
export function textOrBytes(raw: Uint8Array): { kind: 'text'; value: string } | { kind: 'bytes'; value: Uint8Array } {
  try {
    return { kind: 'text', value: strictUtf8.decode(raw) };
  } catch {
    return { kind: 'bytes', value: raw };
  }
}

const isEntry = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
/**
 * A legacy chunk's vectors: a list whose every entry has a string id, a numeric `vector` and — if any — object
 * `metadata` (§24 EE3, §25 FF4): anything else would only fail later, uncoded, in a search or a filter. A `null`
 * metadata is none, as every reader takes it (§26 GG6).
 */
export const isLegacyVectorList = (v: unknown): v is Vector[] => isDense(v) && v.every((e) =>
  isEntry(e) && typeof e.id === 'string'
  && isDense(e.vector) && e.vector.every((x) => typeof x === 'number')
  && (e.metadata == null || isEntry(e.metadata)));
/** An array with no holes: `every` skips them, so a sparse list would pass its element checks (§39 TT4, §44 YY4). */
export function isDense(v: unknown): v is unknown[] {
  if (!Array.isArray(v)) return false;
  for (let i = 0; i < v.length; i++) if (!(i in v)) return false;
  return true;
}
/** Absent, or a list whose every element passes (§23 DD4). */
const listOf = (value: unknown, ok: (entry: unknown) => boolean) => value == null || (Array.isArray(value) && value.every(ok));
const isDocumentEntry = (d: unknown) => isEntry(d) && typeof d.id === 'string';
const isChunkEntry = (c: unknown) => isEntry(c) && Number.isInteger(c.chunkId) && (c.chunkId as number) >= 0;

/**
 * A legacy manifest from a path read: null when absent. Anything but an object with a string `name` (what every
 * SDK wrote) — or one whose document or chunk lists are not lists of entries (another writer's, an old UI's
 * read-modify-write) — is corrupt: no retry reads it differently, nothing downstream may meet a `null` entry (§23 DD4),
 * and a database that cannot be read is never migrated as an empty one (its files purged — §24 EE1).
 */
export function legacyManifestFrom(read: PathRead, where: string): DatabaseManifest | null {
  if (read.state === 'absent') return null;
  const corrupt = (reason: string) =>
    new SDKError(`Unreadable legacy manifest (${where}): ${reason}`, 'RAG_MANIFEST_CORRUPT', { where, state: read.state, reason, retryable: false });
  if (read.state === 'sealed' || !isEntry(read.value)) throw corrupt('not a manifest');
  const m = read.value;
  // Raw bytes (s5js `get` returns them for undecodable content) and arrays have no name: refused here (§24 EE1).
  if (typeof m.name !== 'string') throw corrupt('no name');
  if (!listOf(m.pendingDocuments, isDocumentEntry) || !listOf(m.readyDocuments, isDocumentEntry)) throw corrupt('a document list of the wrong shape');
  if (!listOf(m.chunks, isChunkEntry)) throw corrupt('a chunk list of the wrong shape');
  if (!listOf(m.folderPaths, (p) => typeof p === 'string')) throw corrupt('a folder list of the wrong shape');
  const manifest = read.value as unknown as DatabaseManifest;
  return { ...manifest, chunks: manifest.chunks ?? [], chunkCount: manifest.chunkCount ?? 0, folderPaths: manifest.folderPaths ?? [] };
}
