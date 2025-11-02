/**
 * Database Service Types
 * Shared types for database metadata and permissions
 */

/**
 * Database type discriminator
 */
export type DatabaseType = 'vector' | 'graph';

/**
 * Database metadata structure
 */
export interface DatabaseMetadata {
  /** Unique database name */
  databaseName: string;

  /** Database type (vector, graph, etc.) */
  type: DatabaseType;

  /** Timestamp when database was created */
  createdAt: number;

  /** Timestamp of last access (read or write) */
  lastAccessedAt: number;

  /** Owner's address */
  owner: string;

  /** Number of vectors stored (0 for non-vector databases) */
  vectorCount: number;

  /** Storage size in bytes */
  storageSizeBytes: number;

  /** Optional human-readable description */
  description?: string;
}

/**
 * Metadata fields that can be updated
 * Excludes immutable fields: databaseName, type, owner, createdAt
 */
export type UpdateMetadata = Partial<Pick<DatabaseMetadata, 'description' | 'vectorCount' | 'storageSizeBytes'>>;

/**
 * Options for creating database metadata
 */
export interface CreateMetadataOptions {
  description?: string;
  vectorCount?: number;
  storageSizeBytes?: number;
}

/**
 * Options for listing databases
 */
export interface ListDatabaseOptions {
  /** Filter by database type */
  type?: DatabaseType;
}

/**
 * Permission role types
 */
export type PermissionRole = 'owner' | 'writer' | 'reader';

/**
 * Permission record for a user on a database
 */
export interface PermissionRecord {
  /** Database name */
  databaseName: string;

  /** User's address */
  userAddress: string;

  /** Permission role */
  role: PermissionRole;

  /** Timestamp when permission was granted */
  grantedAt: number;
}
