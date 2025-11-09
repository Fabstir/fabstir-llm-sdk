/**
 * Database Metadata Service Tests
 * Tests for shared metadata management across all database types
 * Max 300 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';
import type { DatabaseMetadata, DatabaseType } from '../../src/database/types.js';

describe('DatabaseMetadataService', () => {
  let service: DatabaseMetadataService;
  const testOwner = 'test-user-0x123';

  beforeEach(() => {
    service = new DatabaseMetadataService();
  });

  describe('Create Metadata', () => {
    it('should create metadata for vector database', () => {
      const beforeCreate = Date.now();

      service.create('my-vectors', 'vector', testOwner);

      const metadata = service.get('my-vectors');
      expect(metadata).not.toBeNull();
      expect(metadata!.databaseName).toBe('my-vectors');
      expect(metadata!.type).toBe('vector');
      expect(metadata!.owner).toBe(testOwner);
      expect(metadata!.createdAt).toBeGreaterThanOrEqual(beforeCreate);
      expect(metadata!.lastAccessedAt).toBe(metadata!.createdAt);
      expect(metadata!.vectorCount).toBe(0);
      expect(metadata!.storageSizeBytes).toBe(0);
      expect(metadata!.description).toBeUndefined();
    });

    it('should create metadata for graph database', () => {
      service.create('my-graph', 'graph', testOwner);

      const metadata = service.get('my-graph');
      expect(metadata).not.toBeNull();
      expect(metadata!.type).toBe('graph');
    });

    it('should create metadata with optional description', () => {
      service.create('described-db', 'vector', testOwner, {
        description: 'Project documentation'
      });

      const metadata = service.get('described-db');
      expect(metadata!.description).toBe('Project documentation');
    });

    it('should throw error when creating duplicate database', () => {
      service.create('duplicate-db', 'vector', testOwner);

      expect(() => {
        service.create('duplicate-db', 'vector', testOwner);
      }).toThrow('Database already exists');
    });

    it('should reject empty database name', () => {
      expect(() => {
        service.create('', 'vector', testOwner);
      }).toThrow('Database name cannot be empty');
    });

    it('should reject whitespace-only database name', () => {
      expect(() => {
        service.create('   ', 'vector', testOwner);
      }).toThrow('Database name cannot be empty');
    });
  });

  describe('Read Metadata', () => {
    it('should get existing metadata', () => {
      service.create('test-db', 'vector', testOwner);

      const metadata = service.get('test-db');
      expect(metadata).not.toBeNull();
      expect(metadata!.databaseName).toBe('test-db');
    });

    it('should return null for non-existent database', () => {
      const metadata = service.get('non-existent');
      expect(metadata).toBeNull();
    });

    it('should update lastAccessedAt on get', () => {
      service.create('access-test', 'vector', testOwner);

      const metadata1 = service.get('access-test');
      const firstAccess = metadata1!.lastAccessedAt;

      // Small delay
      const delay = new Promise(resolve => setTimeout(resolve, 10));
      delay.then(() => {
        const metadata2 = service.get('access-test');
        expect(metadata2!.lastAccessedAt).toBeGreaterThan(firstAccess);
      });
    });

    it('should check database existence', () => {
      service.create('exists-db', 'vector', testOwner);

      expect(service.exists('exists-db')).toBe(true);
      expect(service.exists('non-existent')).toBe(false);
    });
  });

  describe('Update Metadata', () => {
    it('should update description', () => {
      service.create('update-db', 'vector', testOwner);

      service.update('update-db', {
        description: 'Updated description'
      });

      const metadata = service.get('update-db');
      expect(metadata!.description).toBe('Updated description');
    });

    it('should update vectorCount', () => {
      service.create('count-db', 'vector', testOwner);

      service.update('count-db', {
        vectorCount: 100
      });

      const metadata = service.get('count-db');
      expect(metadata!.vectorCount).toBe(100);
    });

    it('should update storageSizeBytes', () => {
      service.create('size-db', 'vector', testOwner);

      service.update('size-db', {
        storageSizeBytes: 50000
      });

      const metadata = service.get('size-db');
      expect(metadata!.storageSizeBytes).toBe(50000);
    });

    it('should update multiple fields at once', () => {
      service.create('multi-db', 'vector', testOwner);

      service.update('multi-db', {
        description: 'Multi-update',
        vectorCount: 200,
        storageSizeBytes: 100000
      });

      const metadata = service.get('multi-db');
      expect(metadata!.description).toBe('Multi-update');
      expect(metadata!.vectorCount).toBe(200);
      expect(metadata!.storageSizeBytes).toBe(100000);
    });

    it('should preserve unchanged fields during update', () => {
      service.create('preserve-db', 'vector', testOwner);

      const originalCreatedAt = service.get('preserve-db')!.createdAt;

      service.update('preserve-db', {
        description: 'New description'
      });

      const updated = service.get('preserve-db');
      expect(updated!.createdAt).toBe(originalCreatedAt);
      expect(updated!.owner).toBe(testOwner);
      expect(updated!.type).toBe('vector');
    });

    it('should update lastAccessedAt on update', () => {
      service.create('time-db', 'vector', testOwner);

      const before = service.get('time-db')!.lastAccessedAt;

      service.update('time-db', {
        description: 'Updated'
      });

      const after = service.get('time-db')!.lastAccessedAt;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it('should throw error when updating non-existent database', () => {
      expect(() => {
        service.update('non-existent', { description: 'Fail' });
      }).toThrow('Database not found');
    });

    it('should not allow updating immutable fields', () => {
      service.create('immutable-db', 'vector', testOwner);

      // Attempting to update databaseName, owner, type, createdAt should be ignored
      service.update('immutable-db', {
        description: 'Valid update'
        // databaseName, owner, type, createdAt should not be in UpdateMetadata type
      } as any);

      const metadata = service.get('immutable-db');
      expect(metadata!.databaseName).toBe('immutable-db');
      expect(metadata!.owner).toBe(testOwner);
      expect(metadata!.type).toBe('vector');
    });
  });

  describe('Delete Metadata', () => {
    it('should delete existing database', () => {
      service.create('delete-db', 'vector', testOwner);

      expect(service.exists('delete-db')).toBe(true);

      service.delete('delete-db');

      expect(service.exists('delete-db')).toBe(false);
      expect(service.get('delete-db')).toBeNull();
    });

    it('should throw error when deleting non-existent database', () => {
      expect(() => {
        service.delete('non-existent');
      }).toThrow('Database not found');
    });

    it('should allow re-creation after deletion', () => {
      service.create('recreate-db', 'vector', testOwner);
      service.delete('recreate-db');

      // Should not throw
      service.create('recreate-db', 'vector', testOwner);

      expect(service.exists('recreate-db')).toBe(true);
    });
  });

  describe('List Metadata', () => {
    it('should return empty list when no databases exist', () => {
      const databases = service.list();
      expect(databases).toHaveLength(0);
    });

    it('should list all databases', () => {
      service.create('db-1', 'vector', testOwner);
      service.create('db-2', 'graph', testOwner);
      service.create('db-3', 'vector', testOwner);

      const databases = service.list();
      expect(databases).toHaveLength(3);

      const names = databases.map(db => db.databaseName).sort();
      expect(names).toEqual(['db-1', 'db-2', 'db-3']);
    });

    it('should list databases by type (vector)', () => {
      service.create('vec-1', 'vector', testOwner);
      service.create('graph-1', 'graph', testOwner);
      service.create('vec-2', 'vector', testOwner);

      const vectorDbs = service.list({ type: 'vector' });
      expect(vectorDbs).toHaveLength(2);
      expect(vectorDbs.every(db => db.type === 'vector')).toBe(true);
    });

    it('should list databases by type (graph)', () => {
      service.create('vec-1', 'vector', testOwner);
      service.create('graph-1', 'graph', testOwner);
      service.create('graph-2', 'graph', testOwner);

      const graphDbs = service.list({ type: 'graph' });
      expect(graphDbs).toHaveLength(2);
      expect(graphDbs.every(db => db.type === 'graph')).toBe(true);
    });

    it('should list databases sorted by creation time (newest first)', () => {
      service.create('db-old', 'vector', testOwner);
      // Small delay
      setTimeout(() => {
        service.create('db-mid', 'vector', testOwner);
        setTimeout(() => {
          service.create('db-new', 'vector', testOwner);

          const databases = service.list();
          expect(databases[0].databaseName).toBe('db-new');
          expect(databases[1].databaseName).toBe('db-mid');
          expect(databases[2].databaseName).toBe('db-old');
        }, 10);
      }, 10);
    });

    it('should include all metadata fields in list', () => {
      service.create('full-db', 'vector', testOwner, {
        description: 'Full metadata'
      });

      const databases = service.list();
      const db = databases[0];

      expect(db).toHaveProperty('databaseName');
      expect(db).toHaveProperty('type');
      expect(db).toHaveProperty('createdAt');
      expect(db).toHaveProperty('lastAccessedAt');
      expect(db).toHaveProperty('owner');
      expect(db).toHaveProperty('vectorCount');
      expect(db).toHaveProperty('storageSizeBytes');
      expect(db).toHaveProperty('description');
    });

    it('should handle 10+ databases', () => {
      for (let i = 0; i < 12; i++) {
        service.create(`db-${i}`, 'vector', testOwner);
      }

      const databases = service.list();
      expect(databases).toHaveLength(12);
    });
  });
});
