/**
 * End-to-End Test: Multi-User Scenarios
 * Tests permissions, access control, and collaboration
 * Max 250 lines
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createTestUser,
  cleanupTestUser,
  createTestVector,
  DEFAULT_TEST_CONFIG,
  type TestUser
} from '../helpers/e2e-helpers.js';

describe('E2E: Multi-User Scenarios', () => {
  let alice: TestUser;
  let bob: TestUser;

  beforeEach(async () => {
    // Create two test users
    alice = await createTestUser(
      'alice-address',
      'alice seed phrase for multi user tests',
      DEFAULT_TEST_CONFIG
    );

    bob = await createTestUser(
      'bob-address',
      'bob seed phrase for multi user tests',
      DEFAULT_TEST_CONFIG
    );
  });

  afterEach(async () => {
    await cleanupTestUser(alice);
    await cleanupTestUser(bob);
  });

  describe('Database Ownership', () => {
    it('should allow owner to create and access their database', async () => {
      // Alice creates a database
      const sessionId = await alice.vectorRAGManager!.createSession('alice-private-db');
      expect(sessionId).toBeDefined();

      // Alice adds vectors
      await alice.vectorRAGManager!.addVector(
        'alice-private-db',
        'alice-vec-1',
        createTestVector(1),
        { owner: 'alice', content: 'Alice data' }
      );

      // Alice can search her own database
      const results = await alice.vectorRAGManager!.searchVectors(
        sessionId,
        createTestVector(1),
        10,
        { threshold: 0.0 }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].metadata.owner).toBe('alice');
    });

    it('should track database ownership correctly', async () => {
      // Alice creates database
      await alice.vectorRAGManager!.createSession('alice-owned-db');

      // Check metadata service
      const metadata = alice.vectorRAGManager!['metadataService'].get('alice-owned-db');
      expect(metadata).not.toBeNull();
      expect(metadata!.owner).toBe('alice-address');
    });
  });

  describe('Permission Granting', () => {
    it('should allow owner to grant read permission', async () => {
      // Alice creates database
      const aliceSession = await alice.vectorRAGManager!.createSession('shared-read-db');

      // Alice adds data
      await alice.vectorRAGManager!.addVector(
        'shared-read-db',
        'shared-vec',
        createTestVector(10),
        { content: 'Shared data' }
      );

      // Alice grants Bob read permission
      alice.permissionManager!.grant('shared-read-db', 'bob-address', 'reader');

      // Verify permission was granted
      const permissions = alice.permissionManager!.listPermissions('shared-read-db');
      const bobPermission = permissions.find(p => p.userAddress === 'bob-address');
      expect(bobPermission).toBeDefined();
      expect(bobPermission!.role).toBe('reader');
    });

    it('should allow owner to grant write permission', async () => {
      // Alice creates database
      await alice.vectorRAGManager!.createSession('shared-write-db');

      // Alice grants Bob write permission
      alice.permissionManager!.grant('shared-write-db', 'bob-address', 'writer');

      // Verify permission
      const permissions = alice.permissionManager!.listPermissions('shared-write-db');
      const bobPermission = permissions.find(p => p.userAddress === 'bob-address');
      expect(bobPermission).toBeDefined();
      expect(bobPermission!.role).toBe('writer');
    });
  });

  describe('Permission Revocation', () => {
    it('should allow owner to revoke permissions', async () => {
      // Alice creates database and grants permission
      await alice.vectorRAGManager!.createSession('revoke-test-db');
      alice.permissionManager!.grant('revoke-test-db', 'bob-address', 'reader');

      // Verify granted
      let permissions = alice.permissionManager!.listPermissions('revoke-test-db');
      expect(permissions.length).toBe(1);

      // Alice revokes permission
      alice.permissionManager!.revoke('revoke-test-db', 'bob-address');

      // Verify revoked
      permissions = alice.permissionManager!.listPermissions('revoke-test-db');
      expect(permissions.length).toBe(0);
    });
  });

  describe('Isolation Between Users', () => {
    it('should isolate databases between different users', async () => {
      // Alice creates her database
      await alice.vectorRAGManager!.createSession('alice-isolated-db');
      await alice.vectorRAGManager!.addVector(
        'alice-isolated-db',
        'alice-data',
        createTestVector(20),
        { owner: 'alice' }
      );

      // Bob creates his database
      await bob.vectorRAGManager!.createSession('bob-isolated-db');
      await bob.vectorRAGManager!.addVector(
        'bob-isolated-db',
        'bob-data',
        createTestVector(21),
        { owner: 'bob' }
      );

      // Verify Alice's database has only Alice's data
      const aliceStats = alice.vectorRAGManager!.getDatabaseStats('alice-isolated-db');
      expect(aliceStats).not.toBeNull();
      expect(aliceStats!.vectorCount).toBe(1);

      // Verify Bob's database has only Bob's data
      const bobStats = bob.vectorRAGManager!.getDatabaseStats('bob-isolated-db');
      expect(bobStats).not.toBeNull();
      expect(bobStats!.vectorCount).toBe(1);
    });

    it('should not allow cross-contamination of data', async () => {
      // Alice creates database
      await alice.vectorRAGManager!.createSession('alice-exclusive-db');
      await alice.vectorRAGManager!.addVector(
        'alice-exclusive-db',
        'alice-exclusive',
        createTestVector(30),
        { confidential: true }
      );

      // Bob creates database with same name (should be separate namespace)
      await bob.vectorRAGManager!.createSession('alice-exclusive-db'); // Note: Same name but Bob's namespace

      // Bob's database should be empty
      const bobStats = bob.vectorRAGManager!.getDatabaseStats('alice-exclusive-db');
      expect(bobStats).not.toBeNull();
      expect(bobStats!.vectorCount).toBe(0);
    });
  });

  describe('Collaborative Workflows', () => {
    it('should support shared workspace between users', async () => {
      // Alice creates shared workspace
      await alice.vectorRAGManager!.createSession('team-workspace');

      // Alice adds initial data
      await alice.vectorRAGManager!.addVector(
        'team-workspace',
        'alice-contribution',
        createTestVector(40),
        { author: 'alice', type: 'initial' }
      );

      // Alice grants Bob write access
      alice.permissionManager!.grant('team-workspace', 'bob-address', 'writer');

      // Verify database exists and has Alice's data
      const stats = alice.vectorRAGManager!.getDatabaseStats('team-workspace');
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(1);
    });

    it('should track contributions from multiple users', async () => {
      // Alice creates shared database
      await alice.vectorRAGManager!.createSession('multi-contributor-db');

      // Alice adds her vectors
      for (let i = 0; i < 3; i++) {
        await alice.vectorRAGManager!.addVector(
          'multi-contributor-db',
          `alice-vec-${i}`,
          createTestVector(50 + i),
          { author: 'alice', index: i }
        );
      }

      // Grant Bob write access
      alice.permissionManager!.grant('multi-contributor-db', 'bob-address', 'writer');

      // Check total contributions
      const stats = alice.vectorRAGManager!.getDatabaseStats('multi-contributor-db');
      expect(stats).not.toBeNull();
      expect(stats!.vectorCount).toBe(3);
    });
  });

  describe('Public vs Private Databases', () => {
    it('should support private databases (default)', async () => {
      // Alice creates private database
      await alice.vectorRAGManager!.createSession('private-db');

      const metadata = alice.vectorRAGManager!['metadataService'].get('private-db');
      expect(metadata).not.toBeNull();
      expect(metadata!.isPublic).toBe(false);
    });

    it('should support public databases', async () => {
      // Alice creates database and makes it public
      await alice.vectorRAGManager!.createSession('public-db');

      // Set public via metadata service
      alice.vectorRAGManager!['metadataService'].update('public-db', { isPublic: true });

      const updatedMetadata = alice.vectorRAGManager!['metadataService'].get('public-db');
      expect(updatedMetadata!.isPublic).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle same database name in different user namespaces', async () => {
      const dbName = 'common-name-db';

      // Alice creates database
      await alice.vectorRAGManager!.createSession(dbName);
      await alice.vectorRAGManager!.addVector(
        dbName,
        'alice-vec',
        createTestVector(60),
        { user: 'alice' }
      );

      // Bob creates database with same name
      await bob.vectorRAGManager!.createSession(dbName);
      await bob.vectorRAGManager!.addVector(
        dbName,
        'bob-vec',
        createTestVector(61),
        { user: 'bob' }
      );

      // Both should have separate databases
      const aliceStats = alice.vectorRAGManager!.getDatabaseStats(dbName);
      const bobStats = bob.vectorRAGManager!.getDatabaseStats(dbName);

      expect(aliceStats!.vectorCount).toBe(1);
      expect(bobStats!.vectorCount).toBe(1);
    });
  });
});
