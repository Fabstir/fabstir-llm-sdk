// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { SessionGroup } from '../types/session-groups.types';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { EncryptedStorage } from '../interfaces/IEncryptionManager';
import type { StorageManager } from '../managers/StorageManager';

/**
 * Session Group Storage Layer
 *
 * Handles S5 persistence for Session Groups with encryption.
 * Groups are stored at: home/session-groups/{userAddress}/{groupId}.json
 *
 * Features:
 * - End-to-end encryption using EncryptionManager
 * - In-memory caching for performance
 * - User isolation (each user has separate directory)
 * - Auto-sync on changes
 * - Auto-reconnect on S5 connection issues (v1.4.26+)
 */
export class SessionGroupStorage {
  private static readonly STORAGE_PATH = 'home/session-groups';

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
   * @param userAddress - User's wallet address (for directory isolation)
   * @param encryptionManager - Optional encryption manager for secure storage
   * @param storageManager - Optional StorageManager for retry/reconnect support (v1.4.26+)
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
   * Save session group to S5 with encryption
   *
   * @param group - Session group to save
   * @param timeoutMs - Timeout in milliseconds (default: 15000 = 15s) - only used if StorageManager not available
   * @throws Error if encryption manager not available
   * @throws Error if S5 write fails
   * @throws Error if S5 operation times out
   */
  async save(group: SessionGroup, timeoutMs: number = 15000): Promise<void> {
    if (!this.encryptionManager || !this.hostPubKey) {
      throw new Error('EncryptionManager required for storage operations');
    }

    const groupSize = JSON.stringify(group).length;
    console.log(`[SessionGroupStorage] 💾 Saving session group "${group.name}" (${groupSize} bytes plaintext)`);

    // Encrypt group data
    const encrypted = await this.encryptionManager.encryptForStorage(
      this.hostPubKey,
      group
    );

    // Build S5 path
    const path = this.buildPath(group.id);

    console.log(`[SessionGroupStorage] 📤 Uploading encrypted session group to S5: ${path}`);

    const startTime = performance.now();

    // Use StorageManager's retry/reconnect logic if available (v1.4.26+)
    if (this.storageManager) {
      try {
        await this.storageManager.putWithRetry(path, encrypted);
      } catch (error: any) {
        console.error(`[SessionGroupStorage] ❌ save(${group.id}) failed after retries:`, error.message);
        throw error;
      }
    } else {
      // Fallback: direct S5 call with timeout protection
      const putPromise = this.s5Client.fs.put(path, encrypted);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`S5 put operation timed out after ${timeoutMs}ms - S5 connection may be stale`));
        }, timeoutMs);
      });

      try {
        await Promise.race([putPromise, timeoutPromise]);
      } catch (error: any) {
        if (error.message?.includes('timed out')) {
          console.error(`[SessionGroupStorage] ⏰ save(${group.id}) timed out - S5 connection may need reconnection`);
        }
        throw error;
      }
    }

    const duration = Math.round(performance.now() - startTime);
    console.log(`[SessionGroupStorage] ✅ Session group saved to S5 in ${duration}ms (encrypted)`);

    // Update cache
    this.cache.set(group.id, group);
  }

  /**
   * Load session group from S5 and decrypt
   *
   * @param groupId - Session group ID
   * @param timeoutMs - Timeout in milliseconds (default: 15000 = 15s) - only used if StorageManager not available
   * @returns Decrypted session group
   * @throws Error if group not found
   * @throws Error if decryption fails
   * @throws Error if S5 operation times out
   */
  async load(groupId: string, timeoutMs: number = 15000): Promise<SessionGroup> {
    // Check cache first
    if (this.cache.has(groupId)) {
      console.log(`[SessionGroupStorage] ⚡ Session group loaded from cache: ${groupId}`);
      return this.cache.get(groupId)!;
    }

    if (!this.encryptionManager) {
      throw new Error('EncryptionManager required for storage operations');
    }

    // Build S5 path
    const path = this.buildPath(groupId);

    console.log(`[SessionGroupStorage] 📥 Downloading encrypted session group from S5: ${path}`);

    const startTime = performance.now();
    let encrypted: any;

    // Use StorageManager's retry/reconnect logic if available (v1.4.26+)
    if (this.storageManager) {
      try {
        encrypted = await this.storageManager.getWithRetry(path);
      } catch (error: any) {
        console.error(`[SessionGroupStorage] ❌ load(${groupId}) failed after retries:`, error.message);
        throw error;
      }
    } else {
      // Fallback: direct S5 call with timeout protection
      const getPromise = this.s5Client.fs.get(path);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`S5 get operation timed out after ${timeoutMs}ms - S5 connection may be stale`));
        }, timeoutMs);
      });

      try {
        encrypted = await Promise.race([getPromise, timeoutPromise]);
      } catch (error: any) {
        if (error.message?.includes('timed out')) {
          console.error(`[SessionGroupStorage] ⏰ load(${groupId}) timed out - S5 connection may need reconnection`);
        }
        throw error;
      }
    }

    const downloadDuration = Math.round(performance.now() - startTime);

    if (!encrypted) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    console.log(`[SessionGroupStorage] ✅ Encrypted data downloaded in ${downloadDuration}ms`);

    // Decrypt (encrypted is already an object from S5)
    const { data: group } = await this.encryptionManager.decryptFromStorage<SessionGroup>(
      encrypted as EncryptedStorage
    );

    // Deserialize dates (they may be strings after decryption)
    group.createdAt = new Date(group.createdAt);
    group.updatedAt = new Date(group.updatedAt);

    console.log(`[SessionGroupStorage] ✅ Session group "${group.name}" loaded and decrypted successfully`);

    // Update cache
    this.cache.set(groupId, group);

    return group;
  }

  /**
   * Load all session groups for current user
   *
   * @param timeoutMs - Timeout in milliseconds (default: 30000 = 30s)
   * @returns Array of all session groups
   * @throws Error if directory read fails or times out
   */
  async loadAll(timeoutMs: number = 30000): Promise<SessionGroup[]> {
    const dirPath = this.buildDirPath();

    // Wrap the async iteration in a timeout to prevent hanging
    const loadWithTimeout = async (): Promise<SessionGroup[]> => {
      const groups: SessionGroup[] = [];
      const entries: Array<{ type: string; name: string }> = [];

      // First, collect all entries from the iterator with timeout protection
      // This prevents hanging if the S5 WebSocket is in a bad state
      const listPromise = (async () => {
        for await (const entry of this.s5Client.fs.list(dirPath)) {
          entries.push(entry);
        }
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`S5 directory listing timed out after ${timeoutMs}ms - S5 connection may be stale`));
        }, timeoutMs);
      });

      try {
        await Promise.race([listPromise, timeoutPromise]);
      } catch (error: any) {
        if (error.message?.includes('timed out')) {
          console.error(`[SessionGroupStorage] ⏰ loadAll timed out - S5 connection may need reconnection`);
          throw error;
        }
        throw error;
      }

      // Now process the collected entries
      for (const entry of entries) {
        if (entry.type === 'file' && entry.name.endsWith('.json')) {
          const groupId = entry.name.replace('.json', '');
          try {
            const group = await this.load(groupId);
            groups.push(group);
          } catch (error: any) {
            // Log warning for groups that fail to load (corrupted, wrong key, deleted, etc.)
            // This helps debug cross-tab encryption issues
            console.warn(`[SessionGroupStorage] Failed to decrypt group ${groupId}:`, error.message);
            // Continue loading other groups - may be old data with different encryption key
          }
        }
      }

      return groups;
    };

    try {
      return await loadWithTimeout();
    } catch (error: any) {
      // Directory doesn't exist yet - return empty array
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete session group from S5 and cache (hard delete)
   *
   * @param groupId - Session group ID to delete
   * @throws Error if S5 delete fails
   */
  async delete(groupId: string): Promise<void> {
    const path = this.buildPath(groupId);

    // Use StorageManager's retry/reconnect logic if available (v1.4.26+)
    if (this.storageManager) {
      try {
        await this.storageManager.deleteWithRetry(path);
      } catch (error: any) {
        console.error(`[SessionGroupStorage] ❌ delete(${groupId}) failed after retries:`, error.message);
        throw error;
      }
    } else {
      // Fallback: direct S5 call
      await this.s5Client.fs.delete(path);
    }

    // Remove from cache
    this.cache.delete(groupId);
  }

  /**
   * Check if session group exists without loading
   *
   * @param groupId - Session group ID
   * @returns True if group exists
   */
  async exists(groupId: string): Promise<boolean> {
    // Check cache first
    if (this.cache.has(groupId)) {
      return true;
    }

    // Check S5 using getMetadata()
    const path = this.buildPath(groupId);
    const metadata = await this.s5Client.fs.getMetadata(path);
    return !!metadata;
  }

  /**
   * Build S5 path for a session group
   *
   * @param groupId - Session group ID
   * @returns Full S5 path
   */
  private buildPath(groupId: string): string {
    return `${SessionGroupStorage.STORAGE_PATH}/${this.userAddress}/${groupId}.json`;
  }

  /**
   * Build S5 directory path for user's session groups
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
