/**
 * Collaboration Tests
 * Tests for collaborative scenarios with sharing
 * Max 300 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SharingManager } from '../../src/sharing/SharingManager.js';
import { PermissionManager } from '../../src/permissions/PermissionManager.js';
import { PermissionService } from '../../src/database/PermissionService.js';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import { VectorRAGManager } from '../../src/managers/VectorRAGManager.js';
import { DatabaseMetadataService } from '../../src/database/DatabaseMetadataService.js';
import type { RAGConfig } from '../../src/rag/types.js';
import type { VectorInput } from '../../src/rag/vector-operations.js';

describe('Collaboration Scenarios', () => {
  let sharingManager: SharingManager;
  let permissionManager: PermissionManager;
  let metadataService: DatabaseMetadataService;
  let ownerRAGManager: VectorRAGManager;
  const owner = 'owner-0x123';
  const collaborator1 = 'collab1-0x456';
  const collaborator2 = 'collab2-0x789';
  const testSeedPhrase = 'test seed phrase for collaboration';

  const defaultConfig: RAGConfig = {
    s5Portal: 'http://localhost:5522',
    encryptAtRest: true,
    chunkSize: 10000,
    cacheSizeMb: 150
  };

  beforeEach(() => {
    const permissionService = new PermissionService();
    const auditLogger = new AuditLogger();
    permissionManager = new PermissionManager(permissionService, auditLogger);
    metadataService = new DatabaseMetadataService();
    sharingManager = new SharingManager(permissionManager);

    ownerRAGManager = new VectorRAGManager({
      userAddress: owner,
      seedPhrase: testSeedPhrase,
      config: defaultConfig,
      metadataService,
      permissionManager
    });
  });

  describe('Invitation-Based Collaboration', () => {
    it('should allow collaborator to read after accepting invitation', async () => {
      const dbName = 'team-knowledge-base';

      // Owner creates database and adds data (need at least 3 vectors for IVF index)
      await ownerRAGManager.createSession(dbName);
      const vectors: VectorInput[] = [
        {
          id: 'doc-1',
          values: new Array(384).fill(0.5),
          metadata: { title: 'Team Document 1' }
        },
        {
          id: 'doc-2',
          values: new Array(384).fill(0.6),
          metadata: { title: 'Team Document 2' }
        },
        {
          id: 'doc-3',
          values: new Array(384).fill(0.7),
          metadata: { title: 'Team Document 3' }
        }
      ];
      await ownerRAGManager.addVectors(dbName, vectors);

      // Owner creates invitation for collaborator
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator1,
        role: 'reader'
      });

      // Collaborator accepts invitation
      sharingManager.acceptInvitation(invitation.id, collaborator1);

      // Collaborator can now search
      const collabManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await collabManager.createSession(dbName);
      expect(sessionId).toBeDefined();

      // Search should work (though results may be empty due to in-memory data)
      const results = await collabManager.search(dbName, new Array(384).fill(0.5), 3);
      expect(results).toBeDefined();
    });

    it('should allow collaborator to write after accepting writer invitation', async () => {
      const dbName = 'shared-workspace';

      // Owner creates database
      await ownerRAGManager.createSession(dbName);

      // Owner invites collaborator as writer
      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator1,
        role: 'writer'
      });

      sharingManager.acceptInvitation(invitation.id, collaborator1);

      // Collaborator can add vectors (need at least 3 for IVF index)
      const collabManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const vectors: VectorInput[] = [
        {
          id: 'collab-doc-1',
          values: new Array(384).fill(0.3),
          metadata: { author: collaborator1 }
        },
        {
          id: 'collab-doc-2',
          values: new Array(384).fill(0.4),
          metadata: { author: collaborator1 }
        },
        {
          id: 'collab-doc-3',
          values: new Array(384).fill(0.5),
          metadata: { author: collaborator1 }
        }
      ];

      const result = await collabManager.addVectors(dbName, vectors);
      expect(result.added).toBe(3);
    });

    it('should deny access after invitation is revoked', async () => {
      const dbName = 'revokable-db';

      await ownerRAGManager.createSession(dbName);

      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator1,
        role: 'reader'
      });

      sharingManager.acceptInvitation(invitation.id, collaborator1);

      // Verify access granted
      const collabManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      await collabManager.createSession(dbName); // Should succeed

      // Owner revokes invitation
      sharingManager.revokeInvitation(invitation.id, owner);

      // Collaborator should no longer have access
      await expect(
        collabManager.addVectors(dbName, [
          { id: 'test', values: new Array(384).fill(0.1), metadata: {} }
        ])
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('Token-Based Collaboration', () => {
    it('should allow temporary access via token', async () => {
      const dbName = 'token-shared-db';

      await ownerRAGManager.createSession(dbName);

      // Owner generates access token
      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000 // 1 hour
      });

      // Collaborator uses token
      sharingManager.useToken(token.token, collaborator1);

      // Collaborator can now access database
      const collabManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const sessionId = await collabManager.createSession(dbName);
      expect(sessionId).toBeDefined();
    });

    it('should enforce token usage limits', async () => {
      const dbName = 'limited-token-db';

      await ownerRAGManager.createSession(dbName);

      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000,
        maxUses: 2
      });

      // First two uses should succeed
      sharingManager.useToken(token.token, collaborator1);
      sharingManager.useToken(token.token, collaborator2);

      // Third use should fail
      expect(() => {
        sharingManager.useToken(token.token, 'user3-0xabc');
      }).toThrow('Token is not valid');
    });

    it('should remove access after token is revoked', async () => {
      const dbName = 'revokable-token-db';

      await ownerRAGManager.createSession(dbName);

      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      // Grant access via token
      sharingManager.useToken(token.token, collaborator1);

      const collabManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      await collabManager.createSession(dbName); // Should succeed

      // Revoke token
      sharingManager.revokeToken(token.id, owner);

      // Access should be removed
      await expect(
        collabManager.addVectors(dbName, [
          { id: 'test', values: new Array(384).fill(0.1), metadata: {} }
        ])
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('Multi-User Collaboration', () => {
    it('should support multiple collaborators with different roles', async () => {
      const dbName = 'multi-collab-db';

      await ownerRAGManager.createSession(dbName);

      // Invite multiple collaborators
      const readerInv = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator1,
        role: 'reader'
      });

      const writerInv = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator2,
        role: 'writer'
      });

      sharingManager.acceptInvitation(readerInv.id, collaborator1);
      sharingManager.acceptInvitation(writerInv.id, collaborator2);

      // Reader can read
      const readerManager = new VectorRAGManager({
        userAddress: collaborator1,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      await readerManager.createSession(dbName);

      // Writer can write (need at least 3 vectors for IVF index)
      const writerManager = new VectorRAGManager({
        userAddress: collaborator2,
        seedPhrase: testSeedPhrase,
        config: defaultConfig,
        metadataService,
        permissionManager
      });

      const result = await writerManager.addVectors(dbName, [
        { id: 'writer-doc-1', values: new Array(384).fill(0.7), metadata: {} },
        { id: 'writer-doc-2', values: new Array(384).fill(0.8), metadata: {} },
        { id: 'writer-doc-3', values: new Array(384).fill(0.9), metadata: {} }
      ]);

      expect(result.added).toBe(3);

      // Reader cannot write
      await expect(
        readerManager.addVectors(dbName, [
          { id: 'reader-doc', values: new Array(384).fill(0.8), metadata: {} }
        ])
      ).rejects.toThrow('Permission denied');
    });

    it('should track usage across multiple users', async () => {
      const dbName = 'usage-tracking-db';

      await ownerRAGManager.createSession(dbName);

      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 3600000
      });

      // Multiple users use the same token
      sharingManager.useToken(token.token, collaborator1);
      sharingManager.useToken(token.token, collaborator2);
      sharingManager.useToken(token.token, 'user3-0xabc');

      const tokenData = sharingManager.getTokenById(token.id);
      expect(tokenData?.usageCount).toBe(3);
    });
  });

  describe('Expiration Handling', () => {
    it('should automatically deny access when invitation expires', async () => {
      const dbName = 'expiring-invitation-db';

      await ownerRAGManager.createSession(dbName);

      const invitation = sharingManager.createInvitation({
        databaseName: dbName,
        inviterAddress: owner,
        inviteeAddress: collaborator1,
        role: 'reader',
        expiresAt: Date.now() + 100 // Expires in 100ms
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should not be able to accept expired invitation
      expect(() => {
        sharingManager.acceptInvitation(invitation.id, collaborator1);
      }).toThrow('Invitation has expired');
    });

    it('should automatically deny access when token expires', async () => {
      const dbName = 'expiring-token-db';

      await ownerRAGManager.createSession(dbName);

      const token = sharingManager.generateToken({
        databaseName: dbName,
        issuerAddress: owner,
        role: 'reader',
        expiresAt: Date.now() + 100 // Expires in 100ms
      });

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should not be able to use expired token
      expect(() => {
        sharingManager.useToken(token.token, collaborator1);
      }).toThrow('Token is not valid');
    });
  });
});
