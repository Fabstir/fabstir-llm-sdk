/**
 * Database Metadata Service
 * Manages metadata for all database types (vector, graph, etc.)
 * Max 350 lines
 */

import type {
  DatabaseMetadata,
  CreateMetadataOptions,
  UpdateMetadata,
  ListDatabaseOptions,
  DatabaseType
} from './types.js';

/**
 * Shared metadata service for all database types
 */
export class DatabaseMetadataService {
  private metadata: Map<string, DatabaseMetadata> = new Map();

  /**
   * Create metadata for a new database
   */
  create(
    databaseName: string,
    type: DatabaseType,
    owner: string,
    options?: CreateMetadataOptions
  ): void {
    // Validate database name
    const trimmedName = databaseName.trim();
    if (trimmedName.length === 0) {
      throw new Error('Database name cannot be empty');
    }

    // Check for duplicates
    if (this.metadata.has(databaseName)) {
      throw new Error('Database already exists');
    }

    // Create metadata record
    const now = Date.now();
    const metadata: DatabaseMetadata = {
      databaseName,
      type,
      createdAt: now,
      lastAccessedAt: now,
      owner,
      vectorCount: options?.vectorCount ?? 0,
      storageSizeBytes: options?.storageSizeBytes ?? 0,
      description: options?.description,
      isPublic: options?.isPublic ?? false
    };

    this.metadata.set(databaseName, metadata);
  }

  /**
   * Get metadata for a database
   * Updates lastAccessedAt timestamp
   */
  get(databaseName: string): DatabaseMetadata | null {
    const metadata = this.metadata.get(databaseName);
    if (!metadata) {
      return null;
    }

    // Update last accessed time
    metadata.lastAccessedAt = Date.now();

    // Return copy to prevent external mutations
    return { ...metadata };
  }

  /**
   * Update metadata for a database
   * Only updates mutable fields (description, vectorCount, storageSizeBytes, isPublic)
   */
  update(databaseName: string, updates: UpdateMetadata): void {
    const metadata = this.metadata.get(databaseName);
    if (!metadata) {
      throw new Error('Database not found');
    }

    // Apply updates (only mutable fields)
    if (updates.description !== undefined) {
      metadata.description = updates.description;
    }
    if (updates.vectorCount !== undefined) {
      metadata.vectorCount = updates.vectorCount;
    }
    if (updates.storageSizeBytes !== undefined) {
      metadata.storageSizeBytes = updates.storageSizeBytes;
    }
    if (updates.isPublic !== undefined) {
      metadata.isPublic = updates.isPublic;
    }

    // Update last accessed time
    metadata.lastAccessedAt = Date.now();
  }

  /**
   * Delete metadata for a database
   */
  delete(databaseName: string): void {
    const exists = this.metadata.has(databaseName);
    if (!exists) {
      throw new Error('Database not found');
    }

    this.metadata.delete(databaseName);
  }

  /**
   * Check if database exists
   */
  exists(databaseName: string): boolean {
    return this.metadata.has(databaseName);
  }

  /**
   * List all databases with optional filtering
   * Returns sorted by creation time (newest first)
   */
  list(options?: ListDatabaseOptions): DatabaseMetadata[] {
    let databases = Array.from(this.metadata.values());

    // Filter by type if specified
    if (options?.type) {
      databases = databases.filter(db => db.type === options.type);
    }

    // Sort by creation time (newest first)
    databases.sort((a, b) => b.createdAt - a.createdAt);

    // Return copies to prevent external mutations
    return databases.map(db => ({ ...db }));
  }
}
