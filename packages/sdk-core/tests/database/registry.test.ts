/**
 * Database Registry Tests
 * Tests for unified database registration across all types
 * Max 250 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseRegistry } from '../../src/database/DatabaseRegistry.js';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';

describe('DatabaseRegistry', () => {
  let registry: DatabaseRegistry;
  let metadataService: DatabaseMetadataService;
  const testOwner = 'owner-0x123';

  beforeEach(() => {
    metadataService = new DatabaseMetadataService();
    registry = new DatabaseRegistry(metadataService);
  });

  describe('Register Databases', () => {
    it('should register a vector database', () => {
      registry.register('my-vectors', 'vector', testOwner);

      expect(registry.exists('my-vectors')).toBe(true);
      const db = registry.get('my-vectors');
      expect(db).not.toBeNull();
      expect(db!.type).toBe('vector');
    });

    it('should register a graph database', () => {
      registry.register('my-graph', 'graph', testOwner);

      expect(registry.exists('my-graph')).toBe(true);
      const db = registry.get('my-graph');
      expect(db).not.toBeNull();
      expect(db!.type).toBe('graph');
    });

    it('should register multiple databases of different types', () => {
      registry.register('vec-1', 'vector', testOwner);
      registry.register('graph-1', 'graph', testOwner);
      registry.register('vec-2', 'vector', testOwner);

      expect(registry.exists('vec-1')).toBe(true);
      expect(registry.exists('graph-1')).toBe(true);
      expect(registry.exists('vec-2')).toBe(true);
    });

    it('should throw error when registering duplicate database', () => {
      registry.register('duplicate-db', 'vector', testOwner);

      expect(() => {
        registry.register('duplicate-db', 'vector', testOwner);
      }).toThrow('Database already exists');
    });

    it('should create metadata when registering', () => {
      registry.register('with-metadata', 'vector', testOwner);

      const metadata = metadataService.get('with-metadata');
      expect(metadata).not.toBeNull();
      expect(metadata!.owner).toBe(testOwner);
    });
  });

  describe('Unregister Databases', () => {
    it('should unregister a database', () => {
      registry.register('temp-db', 'vector', testOwner);
      expect(registry.exists('temp-db')).toBe(true);

      registry.unregister('temp-db');

      expect(registry.exists('temp-db')).toBe(false);
      expect(registry.get('temp-db')).toBeNull();
    });

    it('should delete metadata when unregistering', () => {
      registry.register('meta-delete', 'vector', testOwner);

      registry.unregister('meta-delete');

      const metadata = metadataService.get('meta-delete');
      expect(metadata).toBeNull();
    });

    it('should throw error when unregistering non-existent database', () => {
      expect(() => {
        registry.unregister('non-existent');
      }).toThrow('Database not found');
    });

    it('should allow re-registration after unregistration', () => {
      registry.register('reuse-db', 'vector', testOwner);
      registry.unregister('reuse-db');

      // Should not throw
      registry.register('reuse-db', 'vector', testOwner);
      expect(registry.exists('reuse-db')).toBe(true);
    });
  });

  describe('Get Database', () => {
    it('should get registered database', () => {
      registry.register('get-test', 'vector', testOwner);

      const db = registry.get('get-test');
      expect(db).not.toBeNull();
      expect(db!.databaseName).toBe('get-test');
      expect(db!.type).toBe('vector');
    });

    it('should return null for non-existent database', () => {
      const db = registry.get('non-existent');
      expect(db).toBeNull();
    });

    it('should return metadata from metadataService', () => {
      registry.register('meta-test', 'vector', testOwner);

      const db = registry.get('meta-test');
      const metadata = metadataService.get('meta-test');

      expect(db!.owner).toBe(metadata!.owner);
      expect(db!.createdAt).toBe(metadata!.createdAt);
    });
  });

  describe('List Databases', () => {
    it('should return empty list when no databases registered', () => {
      const databases = registry.list();
      expect(databases).toHaveLength(0);
    });

    it('should list all registered databases', () => {
      registry.register('db-1', 'vector', testOwner);
      registry.register('db-2', 'graph', testOwner);
      registry.register('db-3', 'vector', testOwner);

      const databases = registry.list();
      expect(databases).toHaveLength(3);

      const names = databases.map(db => db.databaseName).sort();
      expect(names).toEqual(['db-1', 'db-2', 'db-3']);
    });

    it('should list databases filtered by type (vector)', () => {
      registry.register('vec-1', 'vector', testOwner);
      registry.register('graph-1', 'graph', testOwner);
      registry.register('vec-2', 'vector', testOwner);

      const vectorDbs = registry.list({ type: 'vector' });
      expect(vectorDbs).toHaveLength(2);
      expect(vectorDbs.every(db => db.type === 'vector')).toBe(true);
    });

    it('should list databases filtered by type (graph)', () => {
      registry.register('vec-1', 'vector', testOwner);
      registry.register('graph-1', 'graph', testOwner);
      registry.register('graph-2', 'graph', testOwner);

      const graphDbs = registry.list({ type: 'graph' });
      expect(graphDbs).toHaveLength(2);
      expect(graphDbs.every(db => db.type === 'graph')).toBe(true);
    });

    it('should return sorted databases (newest first)', () => {
      registry.register('db-old', 'vector', testOwner);
      setTimeout(() => {
        registry.register('db-mid', 'vector', testOwner);
        setTimeout(() => {
          registry.register('db-new', 'vector', testOwner);

          const databases = registry.list();
          expect(databases[0].databaseName).toBe('db-new');
          expect(databases[1].databaseName).toBe('db-mid');
          expect(databases[2].databaseName).toBe('db-old');
        }, 10);
      }, 10);
    });
  });

  describe('Check Existence', () => {
    it('should return true for registered database', () => {
      registry.register('exists-test', 'vector', testOwner);

      expect(registry.exists('exists-test')).toBe(true);
    });

    it('should return false for non-existent database', () => {
      expect(registry.exists('non-existent')).toBe(false);
    });

    it('should return false after unregistration', () => {
      registry.register('temp-exists', 'vector', testOwner);
      registry.unregister('temp-exists');

      expect(registry.exists('temp-exists')).toBe(false);
    });
  });

  describe('Integration with MetadataService', () => {
    it('should use metadataService for storage', () => {
      registry.register('integration-test', 'vector', testOwner);

      // Direct check in metadataService
      const metadata = metadataService.get('integration-test');
      expect(metadata).not.toBeNull();
      expect(metadata!.databaseName).toBe('integration-test');
    });

    it('should reflect metadataService updates', () => {
      registry.register('update-test', 'vector', testOwner);

      // Update via metadataService
      metadataService.update('update-test', {
        description: 'Updated via service'
      });

      // Should be reflected in registry
      const db = registry.get('update-test');
      expect(db!.description).toBe('Updated via service');
    });

    it('should handle 10+ databases', () => {
      for (let i = 0; i < 12; i++) {
        registry.register(`db-${i}`, 'vector', testOwner);
      }

      const databases = registry.list();
      expect(databases).toHaveLength(12);
    });
  });
});
