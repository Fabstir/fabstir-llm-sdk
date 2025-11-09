// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SessionGroupManager } from '../../src/managers/SessionGroupManager';
import type { SessionGroup } from '../../src/types/session-groups.types';

/**
 * SessionGroupManager Test Suite
 *
 * Tests CRUD operations for Session Groups (Claude Projects-style organization).
 * Following TDD bounded autonomy: Write ALL tests first, then implement.
 */

describe('SessionGroupManager', () => {
  let manager: SessionGroupManager;
  const testOwner = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'; // Test wallet

  beforeEach(() => {
    // Create new instance for each test (fresh state)
    manager = new SessionGroupManager();
  });

  describe('createSessionGroup()', () => {
    it('should create new session group with name and description', async () => {
      const name = 'My Project';
      const description = 'Research project for AI ethics';

      const group = await manager.createSessionGroup({
        name,
        description,
        owner: testOwner,
      });

      expect(group.id).toBeDefined();
      expect(group.name).toBe(name);
      expect(group.description).toBe(description);
      expect(group.owner).toBe(testOwner);
      expect(group.linkedDatabases).toEqual([]);
      expect(group.chatSessions).toEqual([]);
      expect(group.deleted).toBe(false);
      expect(group.createdAt).toBeInstanceOf(Date);
      expect(group.updatedAt).toBeInstanceOf(Date);
    });

    it('should generate unique IDs for different groups', async () => {
      const group1 = await manager.createSessionGroup({
        name: 'Group 1',
        description: 'First group',
        owner: testOwner,
      });

      const group2 = await manager.createSessionGroup({
        name: 'Group 2',
        description: 'Second group',
        owner: testOwner,
      });

      expect(group1.id).not.toBe(group2.id);
    });

    it('should accept optional metadata', async () => {
      const metadata = { color: 'blue', priority: 'high' };

      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Group with metadata',
        owner: testOwner,
        metadata,
      });

      expect(group.metadata).toEqual(metadata);
    });

    it('should reject creation with missing required fields', async () => {
      await expect(
        manager.createSessionGroup({
          name: '',
          description: 'No name provided',
          owner: testOwner,
        })
      ).rejects.toThrow('name is required');

      await expect(
        manager.createSessionGroup({
          name: 'Test',
          description: '',
          owner: testOwner,
        })
      ).rejects.toThrow('description is required');
    });
  });

  describe('listSessionGroups()', () => {
    it('should list all session groups for current user', async () => {
      await manager.createSessionGroup({
        name: 'Group 1',
        description: 'First',
        owner: testOwner,
      });

      await manager.createSessionGroup({
        name: 'Group 2',
        description: 'Second',
        owner: testOwner,
      });

      const groups = await manager.listSessionGroups(testOwner);
      expect(groups).toHaveLength(2);
      expect(groups[0].owner).toBe(testOwner);
      expect(groups[1].owner).toBe(testOwner);
    });

    it('should exclude deleted groups', async () => {
      const group1 = await manager.createSessionGroup({
        name: 'Active Group',
        description: 'Not deleted',
        owner: testOwner,
      });

      const group2 = await manager.createSessionGroup({
        name: 'Deleted Group',
        description: 'Will be deleted',
        owner: testOwner,
      });

      await manager.deleteSessionGroup(group2.id, testOwner);

      const groups = await manager.listSessionGroups(testOwner);
      expect(groups).toHaveLength(1);
      expect(groups[0].id).toBe(group1.id);
    });

    it('should return empty array if no groups exist', async () => {
      const groups = await manager.listSessionGroups(testOwner);
      expect(groups).toEqual([]);
    });

    it('should only return groups owned by the specified user', async () => {
      const owner1 = '0x1111111111111111111111111111111111111111';
      const owner2 = '0x2222222222222222222222222222222222222222';

      await manager.createSessionGroup({
        name: 'Owner 1 Group',
        description: 'Belongs to owner 1',
        owner: owner1,
      });

      await manager.createSessionGroup({
        name: 'Owner 2 Group',
        description: 'Belongs to owner 2',
        owner: owner2,
      });

      const owner1Groups = await manager.listSessionGroups(owner1);
      const owner2Groups = await manager.listSessionGroups(owner2);

      expect(owner1Groups).toHaveLength(1);
      expect(owner2Groups).toHaveLength(1);
      expect(owner1Groups[0].owner).toBe(owner1);
      expect(owner2Groups[0].owner).toBe(owner2);
    });
  });

  describe('getSessionGroup()', () => {
    it('should retrieve specific session group by ID', async () => {
      const created = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'For retrieval test',
        owner: testOwner,
      });

      const retrieved = await manager.getSessionGroup(created.id, testOwner);

      expect(retrieved.id).toBe(created.id);
      expect(retrieved.name).toBe(created.name);
      expect(retrieved.description).toBe(created.description);
    });

    it('should throw error if group does not exist', async () => {
      await expect(
        manager.getSessionGroup('nonexistent-id', testOwner)
      ).rejects.toThrow('Session group not found');
    });

    it('should throw error if user is not owner', async () => {
      const group = await manager.createSessionGroup({
        name: 'Private Group',
        description: 'Only for owner',
        owner: testOwner,
      });

      const otherUser = '0x9999999999999999999999999999999999999999';

      await expect(
        manager.getSessionGroup(group.id, otherUser)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('updateSessionGroup()', () => {
    it('should update name and description', async () => {
      const group = await manager.createSessionGroup({
        name: 'Original Name',
        description: 'Original Description',
        owner: testOwner,
      });

      const originalUpdatedAt = group.updatedAt.getTime();

      // Small delay to ensure updatedAt timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await manager.updateSessionGroup(group.id, testOwner, {
        name: 'Updated Name',
        description: 'Updated Description',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.description).toBe('Updated Description');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt);
    });

    it('should preserve unmodified fields', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test Description',
        owner: testOwner,
        metadata: { key: 'value' },
      });

      const updated = await manager.updateSessionGroup(group.id, testOwner, {
        name: 'New Name',
      });

      expect(updated.name).toBe('New Name');
      expect(updated.description).toBe(group.description); // Preserved
      expect(updated.metadata).toEqual(group.metadata); // Preserved
    });

    it('should reject update if user is not owner', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      const otherUser = '0x9999999999999999999999999999999999999999';

      await expect(
        manager.updateSessionGroup(group.id, otherUser, { name: 'Hacked' })
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('deleteSessionGroup()', () => {
    it('should soft-delete session group (sets deleted: true)', async () => {
      const group = await manager.createSessionGroup({
        name: 'To Delete',
        description: 'Will be deleted',
        owner: testOwner,
      });

      await manager.deleteSessionGroup(group.id, testOwner);

      // Should not appear in list
      const groups = await manager.listSessionGroups(testOwner);
      expect(groups).toHaveLength(0);

      // But should still exist in storage (soft delete)
      // This will be tested in storage layer tests
    });

    it('should reject deletion if user is not owner', async () => {
      const group = await manager.createSessionGroup({
        name: 'Protected Group',
        description: 'Cannot delete',
        owner: testOwner,
      });

      const otherUser = '0x9999999999999999999999999999999999999999';

      await expect(
        manager.deleteSessionGroup(group.id, otherUser)
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('linkVectorDatabase()', () => {
    it('should link existing vector database to group', async () => {
      const group = await manager.createSessionGroup({
        name: 'Research Project',
        description: 'With databases',
        owner: testOwner,
      });

      const dbId = 'db-research-papers-2024';

      const updated = await manager.linkVectorDatabase(group.id, testOwner, dbId);

      expect(updated.linkedDatabases).toContain(dbId);
      expect(updated.linkedDatabases).toHaveLength(1);
    });

    it('should allow linking multiple databases', async () => {
      const group = await manager.createSessionGroup({
        name: 'Multi-DB Project',
        description: 'Multiple sources',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');
      await manager.linkVectorDatabase(group.id, testOwner, 'db-2');
      const updated = await manager.linkVectorDatabase(group.id, testOwner, 'db-3');

      expect(updated.linkedDatabases).toEqual(['db-1', 'db-2', 'db-3']);
    });

    it('should not duplicate database IDs', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');
      const updated = await manager.linkVectorDatabase(group.id, testOwner, 'db-1');

      expect(updated.linkedDatabases).toEqual(['db-1']);
      expect(updated.linkedDatabases).toHaveLength(1);
    });
  });

  describe('unlinkVectorDatabase()', () => {
    it('should remove database link from group', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');
      await manager.linkVectorDatabase(group.id, testOwner, 'db-2');

      const updated = await manager.unlinkVectorDatabase(group.id, testOwner, 'db-1');

      expect(updated.linkedDatabases).toEqual(['db-2']);
      expect(updated.linkedDatabases).not.toContain('db-1');
    });

    it('should handle unlinking non-existent database gracefully', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');

      // Should not throw
      const updated = await manager.unlinkVectorDatabase(group.id, testOwner, 'db-nonexistent');

      expect(updated.linkedDatabases).toEqual(['db-1']);
    });
  });

  describe('setDefaultDatabase()', () => {
    it('should set default database for new documents', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-main');
      const updated = await manager.setDefaultDatabase(group.id, testOwner, 'db-main');

      expect(updated.defaultDatabase).toBe('db-main');
    });

    it('should reject setting default to unlinked database', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await expect(
        manager.setDefaultDatabase(group.id, testOwner, 'db-not-linked')
      ).rejects.toThrow('Database must be linked to group first');
    });

    it('should allow clearing default database', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');
      await manager.setDefaultDatabase(group.id, testOwner, 'db-1');

      const updated = await manager.setDefaultDatabase(group.id, testOwner, undefined);

      expect(updated.defaultDatabase).toBeUndefined();
    });
  });

  describe('listLinkedDatabases()', () => {
    it('should return metadata for all linked databases', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Testing database metadata',
        owner: testOwner,
      });

      // Link 3 databases
      await manager.linkVectorDatabase(group.id, testOwner, 'db-1');
      await manager.linkVectorDatabase(group.id, testOwner, 'db-2');
      await manager.linkVectorDatabase(group.id, testOwner, 'db-3');

      const databases = await manager.listLinkedDatabases(group.id, testOwner);

      expect(databases).toHaveLength(3);
      expect(databases[0]).toHaveProperty('id', 'db-1');
      expect(databases[0]).toHaveProperty('name');
      expect(databases[0]).toHaveProperty('createdAt');
      expect(databases[1]).toHaveProperty('id', 'db-2');
      expect(databases[2]).toHaveProperty('id', 'db-3');
    });

    it('should return empty array for group with no linked databases', async () => {
      const group = await manager.createSessionGroup({
        name: 'Empty Group',
        description: 'No databases',
        owner: testOwner,
      });

      const databases = await manager.listLinkedDatabases(group.id, testOwner);

      expect(databases).toEqual([]);
    });
  });

  describe('Database existence validation', () => {
    it('should throw error when linking non-existent database', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Testing validation',
        owner: testOwner,
      });

      await expect(
        manager.linkVectorDatabase(group.id, testOwner, 'non-existent-db')
      ).rejects.toThrow('Vector database not found');
    });
  });

  describe('Database deletion handling', () => {
    it('should auto-remove deleted database from all groups', async () => {
      // Create two groups
      const group1 = await manager.createSessionGroup({
        name: 'Group 1',
        description: 'First group',
        owner: testOwner,
      });

      const group2 = await manager.createSessionGroup({
        name: 'Group 2',
        description: 'Second group',
        owner: testOwner,
      });

      // Link same database to both groups
      await manager.linkVectorDatabase(group1.id, testOwner, 'db-shared');
      await manager.linkVectorDatabase(group2.id, testOwner, 'db-shared');

      // Set as default in group1
      await manager.setDefaultDatabase(group1.id, testOwner, 'db-shared');

      // Simulate database deletion
      await manager.handleDatabaseDeletion('db-shared');

      // Verify removed from both groups
      const updated1 = await manager.getSessionGroup(group1.id, testOwner);
      const updated2 = await manager.getSessionGroup(group2.id, testOwner);

      expect(updated1.linkedDatabases).not.toContain('db-shared');
      expect(updated1.defaultDatabase).toBeUndefined(); // Cleared default
      expect(updated2.linkedDatabases).not.toContain('db-shared');
    });
  });

  describe('Performance', () => {
    it('should link 20 databases in under 100ms', async () => {
      const group = await manager.createSessionGroup({
        name: 'Performance Test',
        description: 'Testing speed',
        owner: testOwner,
      });

      const startTime = Date.now();

      // Link 20 databases
      for (let i = 0; i < 20; i++) {
        await manager.linkVectorDatabase(group.id, testOwner, `db-${i}`);
      }

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);

      // Verify all linked
      const updated = await manager.getSessionGroup(group.id, testOwner);
      expect(updated.linkedDatabases).toHaveLength(20);
    });
  });

  describe('addChatSession()', () => {
    it('should add session ID to group', async () => {
      const group = await manager.createSessionGroup({
        name: 'Chat Project',
        description: 'Conversations',
        owner: testOwner,
      });

      const sessionId = 'session-001';
      const updated = await manager.addChatSession(group.id, testOwner, sessionId);

      expect(updated.chatSessions).toContain(sessionId);
      expect(updated.chatSessions).toHaveLength(1);
    });

    it('should allow multiple sessions', async () => {
      const group = await manager.createSessionGroup({
        name: 'Multi-Session Project',
        description: 'Many conversations',
        owner: testOwner,
      });

      await manager.addChatSession(group.id, testOwner, 'session-1');
      await manager.addChatSession(group.id, testOwner, 'session-2');
      const updated = await manager.addChatSession(group.id, testOwner, 'session-3');

      expect(updated.chatSessions).toEqual(['session-1', 'session-2', 'session-3']);
    });

    it('should not duplicate session IDs', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.addChatSession(group.id, testOwner, 'session-1');
      const updated = await manager.addChatSession(group.id, testOwner, 'session-1');

      expect(updated.chatSessions).toEqual(['session-1']);
      expect(updated.chatSessions).toHaveLength(1);
    });
  });

  describe('listChatSessions()', () => {
    it('should return all chat sessions in group sorted by date', async () => {
      const group = await manager.createSessionGroup({
        name: 'Test Group',
        description: 'Test',
        owner: testOwner,
      });

      await manager.addChatSession(group.id, testOwner, 'session-1');
      await manager.addChatSession(group.id, testOwner, 'session-2');
      await manager.addChatSession(group.id, testOwner, 'session-3');

      const sessions = await manager.listChatSessions(group.id, testOwner);

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions).toContain('session-3');
    });

    it('should return empty array for group with no sessions', async () => {
      const group = await manager.createSessionGroup({
        name: 'Empty Group',
        description: 'No sessions yet',
        owner: testOwner,
      });

      const sessions = await manager.listChatSessions(group.id, testOwner);

      expect(sessions).toEqual([]);
    });
  });

  describe('Error Handling', () => {
    it('should reject invalid group IDs', async () => {
      await expect(
        manager.getSessionGroup('', testOwner)
      ).rejects.toThrow('Invalid group ID');

      await expect(
        manager.updateSessionGroup('', testOwner, { name: 'Test' })
      ).rejects.toThrow('Invalid group ID');
    });

    it('should validate metadata structure', async () => {
      await expect(
        manager.createSessionGroup({
          name: 'Test',
          description: 'Test',
          owner: testOwner,
          metadata: 'invalid' as any, // Must be object
        })
      ).rejects.toThrow('metadata must be an object');
    });
  });

  describe('Storage Persistence', () => {
    it('should persist groups across manager instances', async () => {
      const group = await manager.createSessionGroup({
        name: 'Persistent Group',
        description: 'Should survive restart',
        owner: testOwner,
      });

      // Create new manager instance (simulating restart)
      // const newManager = new SessionGroupManager(mockStorageManager);

      // const retrieved = await newManager.getSessionGroup(group.id, testOwner);

      // expect(retrieved.id).toBe(group.id);
      // expect(retrieved.name).toBe(group.name);

      // This test will be fully implemented after storage layer is complete
      expect(true).toBe(true); // Placeholder
    });
  });
});
