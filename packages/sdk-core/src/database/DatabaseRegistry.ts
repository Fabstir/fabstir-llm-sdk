/**
 * Database Registry
 * Unified registry for all database types (vector, graph, etc.)
 * Max 300 lines
 */

import type { DatabaseMetadata, DatabaseType, ListDatabaseOptions } from './types.js';
import { DatabaseMetadataService } from './DatabaseMetadataService.js';

/**
 * Unified database registry
 * Provides centralized access to all databases across types
 *
 * This is a thin wrapper around DatabaseMetadataService that provides
 * a unified API for database registration across vector and graph types.
 */
export class DatabaseRegistry {
  constructor(private metadataService: DatabaseMetadataService) {}

  /**
   * Register a new database
   * Creates metadata entry via DatabaseMetadataService
   */
  register(databaseName: string, type: DatabaseType, owner: string): void {
    this.metadataService.create(databaseName, type, owner);
  }

  /**
   * Unregister a database
   * Removes metadata entry via DatabaseMetadataService
   */
  unregister(databaseName: string): void {
    this.metadataService.delete(databaseName);
  }

  /**
   * Get database by name
   * Returns metadata from DatabaseMetadataService
   */
  get(databaseName: string): DatabaseMetadata | null {
    return this.metadataService.get(databaseName);
  }

  /**
   * List all databases with optional filtering
   * Returns sorted list from DatabaseMetadataService
   */
  list(options?: ListDatabaseOptions): DatabaseMetadata[] {
    return this.metadataService.list(options);
  }

  /**
   * Check if database exists
   */
  exists(databaseName: string): boolean {
    return this.metadataService.exists(databaseName);
  }
}
