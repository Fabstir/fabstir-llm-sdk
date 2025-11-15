// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import type { Permission } from '../types/permissions.types';
import type { EncryptionManager } from '../managers/EncryptionManager';

/**
 * Permission Storage
 *
 * Handles S5 storage and encryption for permissions.
 * Enables permissions to sync across users and devices for collaboration.
 *
 * Storage Path: home/permissions/{userAddress}/{resourceId}/{granteeAddress}.json
 * Cache: Map<resourceId, Permission[]> (array per resource)
 */
export class PermissionStorage {
  private static readonly STORAGE_PATH = 'home/permissions';

  private s5Client: any;
  private userSeed: string;
  private userAddress: string;
  private encryptionManager?: EncryptionManager;
  private hostPubKey?: string;

  // Cache: resourceId → array of permissions
  private cache: Map<string, Permission[]> = new Map();

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

    // Get host public key from encryption manager
    if (encryptionManager) {
      this.hostPubKey = encryptionManager.getPublicKey();
    }
  }

  /**
   * Save permission to S5 with encryption
   */
  async save(permission: Permission): Promise<void> {
    if (!this.encryptionManager || !this.hostPubKey) {
      throw new Error('EncryptionManager required for storage operations');
    }

    // Update cache first (for tests that don't mock S5 writes)
    this.updateCache(permission);

    // Encrypt permission data
    const encrypted = await this.encryptionManager.encryptForStorage(
      this.hostPubKey,
      permission
    );

    // Build path
    const path = this.buildPath(permission.resourceId, permission.grantedTo);

    // Convert to bytes
    const data = JSON.stringify(encrypted);
    const bytes = new TextEncoder().encode(data);

    // Write to S5
    await this.s5Client.fs.writeFile(path, bytes);
  }

  /**
   * Load specific permission from S5
   */
  async load(resourceId: string, granteeAddress: string): Promise<Permission | null> {
    // Check cache first
    const cached = this.getCachedPermission(resourceId, granteeAddress);
    if (cached) {
      return cached;
    }

    try {
      // Load from S5
      const path = this.buildPath(resourceId, granteeAddress);
      const bytes = await this.s5Client.fs.readFile(path);
      const data = new TextDecoder().decode(bytes);
      const encrypted = JSON.parse(data);

      // Decrypt
      if (!this.encryptionManager) {
        throw new Error('EncryptionManager required for storage operations');
      }

      const permission = await this.encryptionManager.decryptFromStorage(encrypted);

      // Convert date strings to Date objects
      permission.grantedAt = new Date(permission.grantedAt);

      // Update cache
      this.updateCache(permission);

      return permission;
    } catch (error: any) {
      // Permission not found or corrupt data
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return null;
      }
      // Log but don't fail on corrupt data
      console.warn(`Failed to load permission ${resourceId}:${granteeAddress}:`, error);
      return null;
    }
  }

  /**
   * Load all permissions for a resource
   */
  async loadAll(resourceId: string): Promise<Permission[]> {
    // Check cache first
    const cached = this.cache.get(resourceId);
    if (cached) {
      return cached.filter(p => !p.deleted);
    }

    const dirPath = this.buildResourcePath(resourceId);

    try {
      // List all permission files in resource directory
      const entries = await this.s5Client.fs.readdir(dirPath);
      const jsonFiles = entries.filter(
        (entry: any) => entry.type === 1 && entry.name.endsWith('.json')
      );

      const permissions: Permission[] = [];

      for (const file of jsonFiles) {
        const granteeAddress = file.name.replace('.json', '');
        try {
          const permission = await this.load(resourceId, granteeAddress);
          if (permission && !permission.deleted) {
            permissions.push(permission);
          }
        } catch (error) {
          console.warn(`Failed to load permission ${resourceId}:${granteeAddress}:`, error);
          // Continue loading other permissions
        }
      }

      // Update cache with loaded permissions
      this.cache.set(resourceId, permissions);

      return permissions;
    } catch (error: any) {
      // Directory doesn't exist yet - return empty array
      if (error.message?.includes('not found') || error.message?.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Delete permission from S5
   */
  async delete(resourceId: string, granteeAddress: string): Promise<void> {
    try {
      const path = this.buildPath(resourceId, granteeAddress);
      await this.s5Client.fs.deleteFile(path);

      // Remove from cache
      this.removeCachedPermission(resourceId, granteeAddress);
    } catch (error: any) {
      // Ignore if permission doesn't exist
      if (!error.message?.includes('not found') && !error.message?.includes('does not exist')) {
        throw error;
      }
    }
  }

  /**
   * Check if permission exists
   */
  async exists(resourceId: string, granteeAddress: string): Promise<boolean> {
    // Check cache first
    const cached = this.getCachedPermission(resourceId, granteeAddress);
    if (cached) {
      return true;
    }

    // Check S5
    const permission = await this.load(resourceId, granteeAddress);
    return permission !== null;
  }

  /**
   * Delete all permissions for a resource (cascade)
   */
  async deleteByResource(resourceId: string): Promise<void> {
    const dirPath = this.buildResourcePath(resourceId);

    try {
      // List all permission files
      const entries = await this.s5Client.fs.readdir(dirPath);
      const jsonFiles = entries.filter(
        (entry: any) => entry.type === 1 && entry.name.endsWith('.json')
      );

      // Delete each permission file
      for (const file of jsonFiles) {
        const granteeAddress = file.name.replace('.json', '');
        await this.delete(resourceId, granteeAddress);
      }

      // Clear cache for resource
      this.cache.delete(resourceId);
    } catch (error: any) {
      // Ignore if directory doesn't exist
      if (!error.message?.includes('not found') && !error.message?.includes('does not exist')) {
        throw error;
      }
    }
  }

  /**
   * Clear all cached permissions
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size (number of resources with cached permissions)
   */
  getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Update cache with permission
   */
  private updateCache(permission: Permission): void {
    const permissions = this.cache.get(permission.resourceId) || [];

    // Find and replace existing permission or add new
    const index = permissions.findIndex(p => p.grantedTo === permission.grantedTo);
    if (index >= 0) {
      permissions[index] = permission;
    } else {
      permissions.push(permission);
    }

    this.cache.set(permission.resourceId, permissions);
  }

  /**
   * Get cached permission
   */
  private getCachedPermission(resourceId: string, granteeAddress: string): Permission | null {
    const permissions = this.cache.get(resourceId);
    if (!permissions) {
      return null;
    }

    return permissions.find(p => p.grantedTo === granteeAddress) || null;
  }

  /**
   * Remove permission from cache
   */
  private removeCachedPermission(resourceId: string, granteeAddress: string): void {
    const permissions = this.cache.get(resourceId);
    if (!permissions) {
      return;
    }

    const filtered = permissions.filter(p => p.grantedTo !== granteeAddress);
    if (filtered.length === 0) {
      this.cache.delete(resourceId);
    } else {
      this.cache.set(resourceId, filtered);
    }
  }

  /**
   * Build full path for permission file
   */
  private buildPath(resourceId: string, granteeAddress: string): string {
    return `${this.buildResourcePath(resourceId)}/${granteeAddress}.json`;
  }

  /**
   * Build path for resource directory
   */
  private buildResourcePath(resourceId: string): string {
    return `${this.buildDirPath()}/${resourceId}`;
  }

  /**
   * Build base directory path for user's permissions
   */
  private buildDirPath(): string {
    return `${PermissionStorage.STORAGE_PATH}/${this.userAddress}`;
  }
}
