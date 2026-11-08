// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { SessionGroup } from '../types/session-groups.types';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { EncryptedStorage } from '../interfaces/IEncryptionManager';
import type { StorageManager } from '../managers/StorageManager';
import { mapWithConcurrency } from '../utils/concurrency';
import { rethrowDisposal } from '../utils/disposal';
import { SDKError } from '../types';
import type { StorageSealer } from './sealed/StorageSealer';
import { isS5Absent } from './sealed/sealed-io';

/**
 * Options for saving session groups
 */
export interface SessionGroupSaveOptions {
  /**
   * Timeout in milliseconds for S5 operations (default: 15000)
   */
  timeoutMs?: number;

  /**
   * Wait for network persistence verification before returning success.
   * When true (default), the save operation verifies the data is accessible
   * from the S5 network, not just written to local IndexedDB cache.
   *
   * Set to false for non-critical operations where local-first is acceptable.
   *
   * @default true
   */
  waitForNetwork?: boolean;

  /**
   * Maximum retries for network verification (default: 3)
   */
  verifyRetries?: number;

  /**
   * Delay between verification retries in ms (default: 1000)
   */
  verifyRetryDelayMs?: number;
}

/**
 * Session Group Storage Layer
 *
 * Groups are sealed with the identity's StorageSealer (1.39.24), one file per group, at
 *   home/session-groups/v2/{deriveId('owner', 'storage')}/{deriveId('group', groupId)}
 * — the path names neither the wallet nor the group, and each identity on a shared S5 seed has its own directory. Each file is `{ kind: 'cbor', value: group }` sealed under
 * `group/v1/{opaqueId}` (bound to the opaque id, so a listing opens a file without knowing the group id; the id is in
 * the payload). The sealer is the StorageManager's (`getSealer()`): without one nothing is read or written.
 *
 * The legacy layout, home/session-groups/{userAddress}/{groupId}.json (EncryptionManager-encrypted), is still read:
 * a legacy group is moved on first touch (`load`, `loadAll`) — sealed, written, read back, then the legacy file is
 * deleted. Of the two copies the newer by `updatedAt` wins (an older SDK may still edit the legacy file), the sealed
 * copy is re-read fresh just before a move writes it (another tab may have moved and edited it), and the legacy file
 * is re-read fresh before it is deleted. `delete` and `exists` cover both layouts.
 *
 * Features:
 * - In-memory caching for performance
 * - Revision-conflict retry on writes
 * - Auto-reconnect on S5 connection issues (v1.4.26+)
 * - Network persistence verification (v1.11.2+) - ensures data survives browser close
 */
export class SessionGroupStorage {
  private static readonly STORAGE_PATH = 'home/session-groups';
  /** The sealed layout (1.39.24): `{SEALED_ROOT}/{ownerSegment}/{opaqueId}`. */
  private static readonly SEALED_ROOT = 'home/session-groups/v2';
  /**
   * Concurrency cap for parallel S5 fetches in `loadAll`. Raised from 10 to
   * 20 in 1.20.0 after empirical confirmation that the S5 portal handles the
   * higher fan-out without rate-limiting; ~2x cold-path speedup for users
   * with many session groups.
   */
  private static readonly LOAD_ALL_CONCURRENCY = 20;

  private s5Client: any;
  private storageManager?: StorageManager;
  private userSeed: string;
  private userAddress: string;
  private encryptionManager?: EncryptionManager;
  private cache: Map<string, SessionGroup> = new Map();
  private hostPubKey?: string;

  /**
   * Initialize Session Group Storage
   *
   * @param s5Client - S5 client instance
   * @param userSeed - User's S5 seed phrase
   * @param userAddress - User's wallet address (names the legacy directory only)
   * @param encryptionManager - Reads legacy (pre-1.39.24) groups
   * @param storageManager - Supplies the sealer, and retry/reconnect support. Required for every read and write.
   */
  constructor(
    s5Client: any,
    userSeed: string,
    userAddress: string,
    encryptionManager?: EncryptionManager,
    storageManager?: StorageManager
  ) {
    this.s5Client = s5Client;
    this.storageManager = storageManager;
    this.userSeed = userSeed;
    this.userAddress = userAddress;
    this.encryptionManager = encryptionManager;

    // Get host public key from encryption manager if available
    if (encryptionManager) {
      this.hostPubKey = encryptionManager.getPublicKey();
    }
  }

  /**
   * Save session group to S5, sealed
   *
   * @param group - Session group to save
   * @param options - Save options (timeoutMs, waitForNetwork, verifyRetries)
   * @throws SDKError STORAGE_SEALER_MISSING if there is no sealer
   * @throws Error if S5 write fails
   * @throws Error if S5 operation times out
   * @throws Error if network verification fails (when waitForNetwork is true)
   */
  async save(group: SessionGroup, options: SessionGroupSaveOptions | number = {}): Promise<void> {
    // Under the group's lock: a move from the legacy layout never writes its older copy over this save (round 3).
    return this.withGroupLock(group.id, () => this.saveUnlocked(group, options));
  }

  /** `save` without the lock — for a caller already holding it (the move; Web Locks are not re-entrant). */
  private async saveUnlocked(group: SessionGroup, options: SessionGroupSaveOptions | number = {}): Promise<void> {
    // Support legacy signature: save(group, timeoutMs)
    const opts: SessionGroupSaveOptions = typeof options === 'number'
      ? { timeoutMs: options }
      : options;

    const timeoutMs = opts.timeoutMs ?? 15000;
    const waitForNetwork = opts.waitForNetwork ?? true; // Default: verify network persistence
    const verifyRetries = opts.verifyRetries ?? 3;
    const verifyRetryDelayMs = opts.verifyRetryDelayMs ?? 1000;

    const sealer = this.sealer();
    const opaqueId = sealer.deriveId('group', group.id);
    const sealed = sealer.seal({ kind: 'cbor', value: group }, SessionGroupStorage.sealContext(opaqueId));
    const path = this.sealedPath(opaqueId);

    console.log(`[SessionGroupStorage] 💾 Saving sealed session group (${sealed.length} bytes) to ${path}, waitForNetwork=${waitForNetwork}`);

    const startTime = performance.now();

    await this.putWithRevisionRetry(path, sealed, timeoutMs);

    const writeDuration = Math.round(performance.now() - startTime);
    console.log(`[SessionGroupStorage] 📝 Local write completed in ${writeDuration}ms`);

    // Update cache immediately (local-first)
    this.cache.set(group.id, group);

    // Verify network persistence if requested (default: true for session groups)
    if (waitForNetwork) {
      console.log(`[SessionGroupStorage] 🔄 Verifying network persistence for "${group.name}"...`);
      const verified = await this.verifyNetworkPersistence(group.id, verifyRetries, verifyRetryDelayMs, timeoutMs);

      if (!verified) {
        // Data is saved locally but network sync not confirmed
        console.warn(`[SessionGroupStorage] ⚠️ Network verification failed for "${group.name}" - data saved locally but may not persist across browser sessions`);
        throw new Error(`Session group "${group.name}" saved locally but network persistence could not be verified. Keep browser open until sync completes.`);
      }

      const totalDuration = Math.round(performance.now() - startTime);
      console.log(`[SessionGroupStorage] ✅ Session group "${group.name}" saved and network-verified in ${totalDuration}ms`);
    } else {
      console.log(`[SessionGroupStorage] ✅ Session group saved locally in ${writeDuration}ms (network sync pending)`);
    }
  }

  /**
   * Put sealed bytes to S5 (`application/octet-stream`) with automatic retry on revision/directory conflicts.
   *
   * S5.js can throw "Revision number too low" or "DirectoryTransactionException"
   * when concurrent writes race on the same path. This method retries with
   * exponential backoff (100ms, 200ms, 400ms) to let the previous write settle.
   * The write goes to the S5 client directly (as the sealed conversation log does): `putWithRetry` takes no
   * media type.
   *
   * @param path - S5 filesystem path
   * @param data - Sealed bytes to write
   * @param timeoutMs - Timeout per attempt in milliseconds
   * @param maxRetries - Maximum number of attempts (default: 3)
   */
  private async putWithRevisionRetry(
    path: string,
    data: Uint8Array,
    timeoutMs: number,
    maxRetries = 3,
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await withTimeout(
          this.s5Client.fs.put(path, data, { mediaType: 'application/octet-stream' }),
          timeoutMs,
          `S5 put operation timed out after ${timeoutMs}ms`,
        );
        return; // Success
      } catch (error: any) {
        const msg = error?.message || '';
        const isRevisionError =
          msg.includes('Revision number too low') ||
          msg.includes('DirectoryTransactionException') ||
          msg.includes('same name');
        if (!isRevisionError || attempt === maxRetries - 1) {
          throw error;
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
      }
    }
  }

  /**
   * Verify that a session group is persisted on the S5 network (not just local cache)
   *
   * This is critical for ensuring data survives browser close. S5.js uses local-first
   * architecture where put() returns after local IndexedDB write, before network sync.
   *
   * @param groupId - Session group ID to verify
   * @param maxRetries - Maximum verification attempts (default: 3)
   * @param retryDelayMs - Delay between retries in ms (default: 1000)
   * @param timeoutMs - Timeout per attempt in ms (default: 15000)
   * @returns true if network persistence verified, false otherwise
   */
  private async verifyNetworkPersistence(
    groupId: string,
    maxRetries: number = 3,
    retryDelayMs: number = 1000,
    timeoutMs: number = 15000
  ): Promise<boolean> {
    // Clear local cache to force network read
    this.cache.delete(groupId);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[SessionGroupStorage] 🔍 Network verification attempt ${attempt}/${maxRetries} for ${groupId}`);

        // Try to load from network (cache was cleared, so this must hit network)
        await this.loadFromNetwork(groupId, timeoutMs);

        console.log(`[SessionGroupStorage] ✅ Network verification successful on attempt ${attempt}`);
        return true;
      } catch (error: any) {
        rethrowDisposal(error);
        console.log(`[SessionGroupStorage] ⏳ Verification attempt ${attempt} failed: ${error.message}`);

        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          const delay = retryDelayMs * attempt;
          console.log(`[SessionGroupStorage] 🔄 Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    console.error(`[SessionGroupStorage] ❌ Network verification failed after ${maxRetries} attempts`);
    return false;
  }

  /**
   * Load a sealed session group directly from S5, bypassing local cache
   *
   * Used for network persistence verification (the read-back after every write).
   *
   * @param groupId - Session group ID
   * @param timeoutMs - Timeout in milliseconds
   * @returns The opened session group
   * @throws Error if group not found on network, SEALED_OPEN_FAILED if it does not open
   */
  private async loadFromNetwork(groupId: string, timeoutMs: number = 15000): Promise<SessionGroup> {
    const sealer = this.sealer();
    const opaqueId = sealer.deriveId('group', groupId);

    // Direct S5 call - do NOT check cache
    const value = await withTimeout(
      this.s5Client.fs.get(this.sealedPath(opaqueId)),
      timeoutMs,
      `S5 network read timed out after ${timeoutMs}ms`,
    );

    if (value === undefined || value === null) {
      throw new Error(`Session group not found on network: ${groupId}`);
    }

    // Opening checks integrity: the context binds the file to its opaque id, and the id inside to the path.
    const group = SessionGroupStorage.openSealed(sealer, value, opaqueId);
    this.cache.set(groupId, group);
    return group;
  }

  /**
   * Load a session group: the sealed copy and any legacy copy, the newer winning; a legacy copy is then moved to the
   * sealed layout (written, read back, legacy deleted) — see `reconcileLegacy`.
   *
   * @param groupId - Session group ID
   * @param timeoutMs - Timeout in milliseconds (default: 15000 = 15s) - used for direct S5 writes and read-backs
   * @returns The session group
   * @throws Error if group not found
   * @throws SDKError SEALED_OPEN_FAILED if the sealed file does not open; STORAGE_SEALER_MISSING without a sealer
   * @throws Error if a legacy group cannot be decrypted, or its move cannot be verified
   */
  async load(groupId: string, timeoutMs: number = 15000): Promise<SessionGroup> {
    // Check cache first
    if (this.cache.has(groupId)) {
      console.log(`[SessionGroupStorage] ⚡ Session group loaded from cache: ${groupId}`);
      return this.cache.get(groupId)!;
    }

    const sealed = await this.readSealed(groupId, false);
    const group = await this.reconcileLegacy(groupId, sealed, timeoutMs);
    if (!group) {
      throw new Error(`Session group not found: ${groupId}`);
    }
    return group;
  }

  /** The sealed copy of a group, opened; undefined when there is none. */
  private async readSealed(groupId: string, fresh: boolean): Promise<SessionGroup | undefined> {
    const sealer = this.sealer();
    const opaqueId = sealer.deriveId('group', groupId);
    const value = await this.read(this.sealedPath(opaqueId), groupId, fresh);
    return value === undefined ? undefined : SessionGroupStorage.openSealed(sealer, value, opaqueId);
  }

  /**
   * Settle a group's two copies: `sealed` (already read, or undefined) and the legacy file (read here).
   *
   * - No legacy file: the sealed copy (or undefined).
   * - The legacy copy is not newer (by `updatedAt`): the sealed copy wins, and the legacy file is a leftover.
   * - Otherwise the legacy copy is moved — unless a fresh re-read of the sealed copy, just before writing, finds one
   *   at least as new (another tab moved it, and perhaps edited it, meanwhile): that one wins and is not overwritten.
   * - The legacy file is deleted only if a fresh re-read finds it no newer than the winner (an older SDK may have
   *   written it again); otherwise it is left for the next touch.
   *
   * A legacy file that does not decrypt is reported and left alone; with no sealed copy that is the caller's error.
   */
  private async reconcileLegacy(groupId: string, sealed: SessionGroup | undefined, timeoutMs: number): Promise<SessionGroup | undefined> {
    // One tab at a time per group, `delete` included: two moves racing could write the older copy over an edit, and a
    // delete landing mid-move could be undone by it (1.39.24 review round 2). The legacy read is inside the lock.
    return this.withGroupLock(groupId, () => this.reconcileLegacyLocked(groupId, sealed, timeoutMs));
  }

  private async reconcileLegacyLocked(groupId: string, sealed: SessionGroup | undefined, timeoutMs: number): Promise<SessionGroup | undefined> {
    const legacyPath = this.buildLegacyPath(groupId);
    const legacyValue = await this.read(legacyPath, groupId);
    if (legacyValue === undefined) {
      // No sealed copy when the caller looked, and no legacy one now: another tab may have moved it while this one
      // waited for the lock — look again, fresh.
      const found = sealed ?? await this.readSealed(groupId, true);
      if (found) this.cache.set(groupId, found);
      return found;
    }

    let legacy: SessionGroup;
    try {
      legacy = await this.decryptLegacy(legacyValue, groupId);
    } catch (error: any) {
      rethrowDisposal(error);
      if (!sealed) throw error;
      SessionGroupStorage.reportUnreadable(`legacy session group ${groupId} (the sealed copy is used)`, error);
      this.cache.set(groupId, sealed);
      return sealed;
    }

    let winner = sealed;
    if (!winner || newerThan(legacy, winner)) {
      const current = await this.readSealed(groupId, true);
      if (current && !newerThan(legacy, current)) {
        winner = current;
      } else {
        console.log(`[SessionGroupStorage] 🔒 Moving legacy session group ${groupId} to the sealed layout`);
        // save() reads the sealed copy back (waitForNetwork) and throws if it cannot; only then is the legacy file deleted.
        await this.saveUnlocked(legacy, { timeoutMs, waitForNetwork: true });
        winner = legacy;
      }
    }

    const again = await this.read(legacyPath, groupId, true);
    let drop = again !== undefined;
    if (again !== undefined && again !== legacyValue) {
      try {
        drop = !newerThan(await this.decryptLegacy(again, groupId), winner);
      } catch (error: any) {
        rethrowDisposal(error);
        drop = false;
      }
      if (!drop) console.warn(`[SessionGroupStorage] legacy session group ${groupId} changed during its move; it is left for the next read`);
    }
    if (drop) await this.deleteFile(legacyPath, groupId);

    this.cache.set(groupId, winner);
    return winner;
  }

  /**
   * Load all session groups for current user: every sealed file, plus every legacy group (moved as in `load`).
   * De-duplicated by group id, the newer copy by `updatedAt` winning (the sealed one on a tie) — a legacy file left
   * behind by an interrupted move is deleted, one an older SDK edited since is adopted (`reconcileLegacy`).
   *
   * Per-entry failures (a sealed file that does not open, a legacy file that does not decrypt or move) are isolated:
   * each is reported with console.error (its code and message) and left out, so one bad group does not reject the
   * whole batch; nothing is deleted on a failure. A disposal (sign-out) rejects the whole call.
   *
   * @param timeoutMs - Timeout for each directory listing in milliseconds (default: 30000 = 30s)
   * @returns Array of all session groups
   * @throws Error if a directory read fails or times out (an absent directory is empty)
   */
  async loadAll(timeoutMs: number = 30000): Promise<SessionGroup[]> {
    const sealer = this.sealer();

    const [sealedEntries, legacyEntries] = await Promise.all([
      this.listFiles(this.sealedDir(), timeoutMs),
      this.listFiles(this.buildDirPath(), timeoutMs),
    ]);

    // Each load is an independent S5 fetch + open; bounded concurrency keeps the cold path at
    // ~ceil(N/20) * single-load-time instead of N * single-load-time.
    const sealedGroups = await mapWithConcurrency(
      sealedEntries,
      SessionGroupStorage.LOAD_ALL_CONCURRENCY,
      async (opaqueId) => {
        try {
          const value = await this.read(this.sealedPath(opaqueId), opaqueId);
          if (value === undefined) return null; // deleted between the listing and the read
          const group = SessionGroupStorage.openSealed(sealer, value, opaqueId);
          this.cache.set(group.id, group);
          return group;
        } catch (error: any) {
          rethrowDisposal(error); // a sign-out is never "this group is unreadable" (§28 II3)
          SessionGroupStorage.reportUnreadable(`sealed session group file ${opaqueId}`, error);
          return null;
        }
      },
    );

    const byId = new Map<string, SessionGroup>();
    for (const g of sealedGroups) if (g !== null) byId.set(g.id, g);

    const legacyIds = legacyEntries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));

    const migrated = await mapWithConcurrency(
      legacyIds,
      SessionGroupStorage.LOAD_ALL_CONCURRENCY,
      async (groupId) => {
        try {
          return (await this.reconcileLegacy(groupId, byId.get(groupId), 15000)) ?? null;
        } catch (error: any) {
          rethrowDisposal(error); // a sign-out is never "this group is unreadable" (§28 II3)
          SessionGroupStorage.reportUnreadable(`legacy session group ${groupId}`, error);
          return null;
        }
      },
    );

    for (const group of migrated) {
      if (group !== null) byId.set(group.id, group);
    }

    return [...byId.values()];
  }

  /**
   * Delete session group from S5 (both layouts) and cache (hard delete)
   *
   * @param groupId - Session group ID to delete
   * @throws Error if S5 delete fails
   */
  async delete(groupId: string): Promise<void> {
    const opaqueId = this.sealer().deriveId('group', groupId);
    // Legacy first: left behind by a failed second delete, a legacy copy with no sealed one would be moved back on the
    // next load (1.39.24 review round 2). Under the group's lock, so no move is half done meanwhile.
    await this.withGroupLock(groupId, async () => {
      await this.deleteFile(this.buildLegacyPath(groupId), groupId);
      await this.deleteFile(this.sealedPath(opaqueId), groupId);
    });

    // Remove from cache
    this.cache.delete(groupId);
  }

  /**
   * Check if session group exists (in either layout) without loading
   *
   * @param groupId - Session group ID
   * @returns True if group exists
   */
  async exists(groupId: string): Promise<boolean> {
    // Check cache first
    if (this.cache.has(groupId)) {
      return true;
    }

    const opaqueId = this.sealer().deriveId('group', groupId);
    for (const path of [this.sealedPath(opaqueId), this.buildLegacyPath(groupId)]) {
      try {
        if (await this.s5Client.fs.getMetadata(path)) return true;
      } catch (error) {
        if (!isS5Absent(error)) throw error;
      }
    }
    return false;
  }

  /** The group's cross-tab lock (the StorageManager's), named by its opaque id. */
  private async withGroupLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
    const key = `group:${this.sealer().deriveId('group', groupId)}`;   // STORAGE_SEALER_MISSING first, without a manager
    return this.storageManager!.withStorageLock(key, fn);
  }

  /** The identity's sealer. Session groups are only ever stored sealed: no StorageManager, no sealer, no storage. */
  private sealer(): StorageSealer {
    if (!this.storageManager) {
      throw new SDKError(
        'Session groups are only ever stored sealed, and no StorageManager (which holds the sealer) was given',
        'STORAGE_SEALER_MISSING',
        { retryable: false },
      );
    }
    return this.storageManager.getSealer();
  }

  /**
   * One read through the StorageManager's retry/reconnect. @returns undefined when S5 says the file is not there;
   * any other failure throws.
   */
  private async read(path: string, label: string, fresh = false): Promise<unknown> {
    let value: unknown;
    try {
      value = await (fresh ? this.storageManager!.getWithRetry(path, { fresh: true }) : this.storageManager!.getWithRetry(path));
    } catch (error: any) {
      if (isS5Absent(error)) return undefined;
      console.error(`[SessionGroupStorage] ❌ read of ${label} failed after retries:`, error?.message);
      throw error;
    }
    return value === null ? undefined : value;
  }

  /** The names of the files in `dir` (an absent directory has none), with the listing under a timeout. */
  private async listFiles(dir: string, timeoutMs: number): Promise<string[]> {
    const names: string[] = [];
    const listing = (async () => {
      for await (const entry of this.s5Client.fs.list(dir)) {
        if (entry.type === 'file') names.push(entry.name);
      }
    })();
    try {
      await withTimeout(listing, timeoutMs, `S5 directory listing timed out after ${timeoutMs}ms - S5 connection may be stale`);
    } catch (error: any) {
      if (isS5Absent(error)) return [];
      if (error.message?.includes('timed out')) {
        console.error(`[SessionGroupStorage] ⏰ loadAll timed out - S5 connection may need reconnection`);
      }
      throw error;
    }
    return names;
  }

  /** Delete one file through the StorageManager's retry/reconnect; one that is not there is already deleted. */
  private async deleteFile(path: string, label: string): Promise<void> {
    try {
      await this.storageManager!.deleteWithRetry(path);
    } catch (error: any) {
      if (isS5Absent(error)) return;
      console.error(`[SessionGroupStorage] ❌ delete(${label}) failed after retries:`, error?.message);
      throw error;
    }
  }

  /** Decrypt a legacy (EncryptionManager) group file and check it is the group asked for. */
  private async decryptLegacy(value: unknown, groupId: string): Promise<SessionGroup> {
    if (!this.encryptionManager) {
      throw new Error('EncryptionManager required for storage operations');
    }
    const { data: group } = await this.encryptionManager.decryptFromStorage<SessionGroup>(value as EncryptedStorage);
    if (!group || typeof group !== 'object' || group.id !== groupId) {
      throw new Error(`Data integrity check failed: expected ${groupId}, got ${(group as any)?.id}`);
    }
    return reviveDates(group);
  }

  /**
   * Open a sealed group file. The context binds it to its opaque id, and the id inside must derive that same opaque
   * id — a file moved, swapped or tampered with throws SEALED_OPEN_FAILED.
   */
  private static openSealed(sealer: StorageSealer, value: unknown, opaqueId: string): SessionGroup {
    if (!ArrayBuffer.isView(value)) {
      throw new SDKError(`Session group file ${opaqueId} is not sealed`, 'SEALED_OPEN_FAILED', { reason: 'not a sealed envelope', retryable: false });
    }
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    const payload = sealer.open(bytes, SessionGroupStorage.sealContext(opaqueId));
    const group = payload.value as SessionGroup;
    if (payload.kind !== 'cbor' || !group || typeof group !== 'object' || typeof group.id !== 'string' || sealer.deriveId('group', group.id) !== opaqueId) {
      throw new SDKError(`Session group file ${opaqueId} does not hold the group its path names`, 'SEALED_OPEN_FAILED', { reason: 'not this group', retryable: false });
    }
    return reviveDates(group);
  }

  private static reportUnreadable(what: string, error: any): void {
    console.error(`[SessionGroupStorage] ❌ ${what} cannot be read and is left out (${error?.code ?? 'ERROR'}):`, error?.message ?? error);
  }

  /** This identity's directory: identities sharing an S5 seed never list or overwrite each other's groups. */
  private sealedDir(): string {
    return `${SessionGroupStorage.SEALED_ROOT}/${this.sealer().deriveId('owner', 'storage')}`;
  }

  private sealedPath(opaqueId: string): string {
    return `${this.sealedDir()}/${opaqueId}`;
  }

  private static sealContext(opaqueId: string): string {
    return `group/v1/${opaqueId}`;
  }

  /**
   * Legacy S5 path for a session group (read, moved and deleted — never written)
   *
   * @param groupId - Session group ID
   * @returns Full S5 path
   */
  private buildLegacyPath(groupId: string): string {
    return `${SessionGroupStorage.STORAGE_PATH}/${this.userAddress}/${groupId}.json`;
  }

  /**
   * Legacy S5 directory of the user's session groups
   *
   * @returns Directory path
   */
  private buildDirPath(): string {
    return `${SessionGroupStorage.STORAGE_PATH}/${this.userAddress}`;
  }

  /**
   * Clear in-memory cache (useful for testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (useful for monitoring)
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

/** `a` was updated after `b` (an unreadable date counts as the oldest). */
function newerThan(a: SessionGroup, b: SessionGroup): boolean {
  const t = (g: SessionGroup) => { const n = new Date(g.updatedAt).getTime(); return Number.isFinite(n) ? n : -Infinity; };
  return t(a) > t(b);
}

/** Dates come back as Dates from CBOR and as strings from the legacy JSON; either way they leave as Dates. */
function reviveDates(group: SessionGroup): SessionGroup {
  group.createdAt = new Date(group.createdAt);
  group.updatedAt = new Date(group.updatedAt);
  return group;
}

/** `promise`, or a rejection with `message` after `timeoutMs` (the timer is cleared either way). */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
