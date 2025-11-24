// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { SessionGroup } from '../types/session-groups.types';
import type { EncryptionManager } from '../managers/EncryptionManager';
import type { EncryptedStorage } from '../interfaces/IEncryptionManager';

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
 */
export class SessionGroupStorage {
  private static readonly STORAGE_PATH = 'home/session-groups';

  private s5Client: any;
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
   */
  constructor(
    s5Client: any,
    userSeed: string,
    userAddress: string,
    encryptionManager?: EncryptionManager
  ) {
    this.s5Client = s5Client;
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
   * @throws Error if encryption manager not available
   * @throws Error if S5 write fails
   */
  async save(group: SessionGroup): Promise<void> {
    if (!this.encryptionManager || !this.hostPubKey) {
      throw new Error('EncryptionManager required for storage operations');
    }

    const groupSize = JSON.stringify(group).length;
    console.log(`[Enhanced S5.js] 💾 Saving session group "${group.name}" (${groupSize} bytes plaintext)`);

    // Encrypt group data
    const encrypted = await this.encryptionManager.encryptForStorage(
      this.hostPubKey,
      group
    );

    // Build S5 path
    const path = this.buildPath(group.id);

    console.log(`[Enhanced S5.js] 📤 Uploading encrypted session group to S5: ${path}`);

    // Write to S5 - S5 handles CBOR encoding automatically
    const startTime = performance.now();
    await this.s5Client.fs.put(path, encrypted);
    const duration = Math.round(performance.now() - startTime);

    console.log(`[Enhanced S5.js] ✅ Session group saved to S5 in ${duration}ms (encrypted)`);

    // Update cache
    this.cache.set(group.id, group);
  }

  /**
   * Load session group from S5 and decrypt
   *
   * @param groupId - Session group ID
   * @returns Decrypted session group
   * @throws Error if group not found
   * @throws Error if decryption fails
   */
  async load(groupId: string): Promise<SessionGroup> {
    // Check cache first
    if (this.cache.has(groupId)) {
      console.log(`[Enhanced S5.js] ⚡ Session group loaded from cache: ${groupId}`);
      return this.cache.get(groupId)!;
    }

    if (!this.encryptionManager) {
      throw new Error('EncryptionManager required for storage operations');
    }

    // Build S5 path
    const path = this.buildPath(groupId);

    console.log(`[Enhanced S5.js] 📥 Downloading encrypted session group from S5: ${path}`);

    // Read encrypted data from S5 - S5 decodes CBOR automatically
    const startTime = performance.now();
    const encrypted = await this.s5Client.fs.get(path);
    const downloadDuration = Math.round(performance.now() - startTime);

    if (!encrypted) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    console.log(`[Enhanced S5.js] ✅ Encrypted data downloaded in ${downloadDuration}ms`);

    // Decrypt (encrypted is already an object from S5)
    const { data: group } = await this.encryptionManager.decryptFromStorage<SessionGroup>(
      encrypted as EncryptedStorage
    );

    // Deserialize dates (they may be strings after decryption)
    group.createdAt = new Date(group.createdAt);
    group.updatedAt = new Date(group.updatedAt);

    console.log(`[Enhanced S5.js] ✅ Session group "${group.name}" loaded and decrypted successfully`);

    // Update cache
    this.cache.set(groupId, group);

    return group;
  }

  /**
   * Load all session groups for current user
   *
   * @returns Array of all session groups
   * @throws Error if directory read fails
   */
  async loadAll(): Promise<SessionGroup[]> {
    const dirPath = this.buildDirPath();

    try {
      const groups: SessionGroup[] = [];

      // List directory using async iterator
      for await (const entry of this.s5Client.fs.list(dirPath)) {
        if (entry.type === 'file' && entry.name.endsWith('.json')) {
          const groupId = entry.name.replace('.json', '');
          try {
            const group = await this.load(groupId);
            groups.push(group);
          } catch (error: any) {
            // Silently skip groups that fail to load (corrupted, wrong key, deleted, etc.)
            // This is expected during normal operation as users may have old/corrupted data
            // Continue loading other groups
          }
        }
      }

      return groups;
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

    // Remove from S5
    await this.s5Client.fs.delete(path);

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
