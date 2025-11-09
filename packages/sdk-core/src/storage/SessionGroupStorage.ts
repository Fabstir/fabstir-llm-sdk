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

    // Encrypt group data
    const encrypted = await this.encryptionManager.encryptForStorage(
      this.hostPubKey,
      group
    );

    // Build S5 path
    const path = this.buildPath(group.id);

    // Serialize encrypted payload
    const data = JSON.stringify(encrypted);
    const bytes = new TextEncoder().encode(data);

    // Write to S5
    await this.s5Client.fs.writeFile(path, bytes);

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
      return this.cache.get(groupId)!;
    }

    if (!this.encryptionManager) {
      throw new Error('EncryptionManager required for storage operations');
    }

    // Build S5 path
    const path = this.buildPath(groupId);

    // Check if file exists
    const exists = await this.s5Client.fs.exists(path);
    if (!exists) {
      throw new Error(`Session group not found: ${groupId}`);
    }

    // Read encrypted data from S5
    const bytes = await this.s5Client.fs.readFile(path);
    const data = new TextDecoder().decode(bytes as Uint8Array);

    // Parse encrypted storage payload
    const encrypted: EncryptedStorage = JSON.parse(data);

    // Decrypt
    const { data: group } = await this.encryptionManager.decryptFromStorage<SessionGroup>(
      encrypted
    );

    // Deserialize dates (JSON.parse converts them to strings)
    group.createdAt = new Date(group.createdAt);
    group.updatedAt = new Date(group.updatedAt);

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
      // List directory
      const entries = await this.s5Client.fs.readdir(dirPath);

      // Filter for .json files only
      const jsonFiles = entries.filter(
        (entry: any) => entry.type === 1 && entry.name.endsWith('.json')
      );

      // Load each group
      const groups: SessionGroup[] = [];
      for (const file of jsonFiles) {
        const groupId = file.name.replace('.json', '');
        try {
          const group = await this.load(groupId);
          groups.push(group);
        } catch (error) {
          console.warn(`Failed to load group ${groupId}:`, error);
          // Continue loading other groups
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
    await this.s5Client.fs.rm(path, { recursive: false });

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

    // Check S5
    const path = this.buildPath(groupId);
    return await this.s5Client.fs.exists(path);
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
