/**
 * Audit Logger Tests
 * Tests for permission audit logging functionality
 * Max 200 lines
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger } from '../../src/permissions/audit-logger.js';
import type { AuditLog, AuditAction } from '../../src/permissions/audit-logger.js';

describe('AuditLogger', () => {
  let logger: AuditLogger;
  const testDatabase = 'test-db';
  const user1 = 'user1-0x123';
  const user2 = 'user2-0x456';

  beforeEach(() => {
    logger = new AuditLogger();
  });

  describe('Logging Grant Actions', () => {
    it('should log permission grant', () => {
      const beforeLog = Date.now();

      logger.logGrant(testDatabase, user1, 'writer');

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('grant');
      expect(logs[0].databaseName).toBe(testDatabase);
      expect(logs[0].userAddress).toBe(user1);
      expect(logs[0].role).toBe('writer');
      expect(logs[0].result).toBe('success');
      expect(logs[0].timestamp).toBeGreaterThanOrEqual(beforeLog);
    });

    it('should log multiple grants', () => {
      logger.logGrant(testDatabase, user1, 'writer');
      logger.logGrant(testDatabase, user2, 'reader');

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(2);
      expect(logs[0].userAddress).toBe(user1);
      expect(logs[1].userAddress).toBe(user2);
    });

    it('should log grants for different databases separately', () => {
      logger.logGrant('db-1', user1, 'writer');
      logger.logGrant('db-2', user1, 'reader');

      const db1Logs = logger.getDatabaseLogs('db-1');
      const db2Logs = logger.getDatabaseLogs('db-2');

      expect(db1Logs).toHaveLength(1);
      expect(db2Logs).toHaveLength(1);
      expect(db1Logs[0].role).toBe('writer');
      expect(db2Logs[0].role).toBe('reader');
    });
  });

  describe('Logging Revoke Actions', () => {
    it('should log permission revoke', () => {
      logger.logRevoke(testDatabase, user1);

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('revoke');
      expect(logs[0].databaseName).toBe(testDatabase);
      expect(logs[0].userAddress).toBe(user1);
      expect(logs[0].result).toBe('success');
    });

    it('should log multiple revokes', () => {
      logger.logRevoke(testDatabase, user1);
      logger.logRevoke(testDatabase, user2);

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(2);
    });
  });

  describe('Logging Access Attempts', () => {
    it('should log successful access attempt', () => {
      logger.logAccessAttempt(testDatabase, user1, 'read', true);

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('access');
      expect(logs[0].accessAction).toBe('read');
      expect(logs[0].result).toBe('success');
    });

    it('should log denied access attempt', () => {
      logger.logAccessAttempt(testDatabase, user1, 'write', false);

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('access');
      expect(logs[0].accessAction).toBe('write');
      expect(logs[0].result).toBe('denied');
    });

    it('should log multiple access attempts', () => {
      logger.logAccessAttempt(testDatabase, user1, 'read', true);
      logger.logAccessAttempt(testDatabase, user1, 'write', false);
      logger.logAccessAttempt(testDatabase, user1, 'read', true);

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(3);
      expect(logs[0].result).toBe('success');
      expect(logs[1].result).toBe('denied');
      expect(logs[2].result).toBe('success');
    });

    it('should track different action types', () => {
      logger.logAccessAttempt(testDatabase, user1, 'read', true);
      logger.logAccessAttempt(testDatabase, user1, 'write', true);
      logger.logAccessAttempt(testDatabase, user1, 'admin', false);

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(3);
      expect(logs[0].accessAction).toBe('read');
      expect(logs[1].accessAction).toBe('write');
      expect(logs[2].accessAction).toBe('admin');
    });
  });

  describe('Get Database Logs', () => {
    it('should return empty array for database with no logs', () => {
      const logs = logger.getDatabaseLogs('non-existent');
      expect(logs).toHaveLength(0);
    });

    it('should return all logs for a database', () => {
      logger.logGrant(testDatabase, user1, 'writer');
      logger.logGrant(testDatabase, user2, 'reader');
      logger.logRevoke(testDatabase, user1);
      logger.logAccessAttempt(testDatabase, user2, 'read', true);

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(4);
    });

    it('should return logs in chronological order', () => {
      logger.logGrant(testDatabase, user1, 'writer');
      logger.logRevoke(testDatabase, user1);
      logger.logGrant(testDatabase, user1, 'reader');

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs[0].action).toBe('grant');
      expect(logs[0].role).toBe('writer');
      expect(logs[1].action).toBe('revoke');
      expect(logs[2].action).toBe('grant');
      expect(logs[2].role).toBe('reader');
    });
  });

  describe('Get User Logs', () => {
    it('should return empty array for user with no logs', () => {
      const logs = logger.getUserLogs('non-existent');
      expect(logs).toHaveLength(0);
    });

    it('should return all logs for a user across databases', () => {
      logger.logGrant('db-1', user1, 'writer');
      logger.logGrant('db-2', user1, 'reader');
      logger.logAccessAttempt('db-1', user1, 'read', true);

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(3);
      expect(logs[0].databaseName).toBe('db-1');
      expect(logs[1].databaseName).toBe('db-2');
      expect(logs[2].databaseName).toBe('db-1');
    });

    it('should only return logs for specified user', () => {
      logger.logGrant(testDatabase, user1, 'writer');
      logger.logGrant(testDatabase, user2, 'reader');

      const user1Logs = logger.getUserLogs(user1);
      const user2Logs = logger.getUserLogs(user2);

      expect(user1Logs).toHaveLength(1);
      expect(user2Logs).toHaveLength(1);
      expect(user1Logs[0].userAddress).toBe(user1);
      expect(user2Logs[0].userAddress).toBe(user2);
    });
  });

  describe('Get All Logs', () => {
    it('should return empty array when no logs exist', () => {
      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(0);
    });

    it('should return all logs across all databases and users', () => {
      logger.logGrant('db-1', user1, 'writer');
      logger.logGrant('db-2', user2, 'reader');
      logger.logAccessAttempt('db-1', user1, 'read', true);
      logger.logRevoke('db-2', user2);

      const logs = logger.getAllLogs();
      expect(logs).toHaveLength(4);
    });

    it('should return logs in chronological order', () => {
      logger.logGrant(testDatabase, user1, 'writer');
      logger.logAccessAttempt(testDatabase, user1, 'read', true);
      logger.logRevoke(testDatabase, user1);

      const logs = logger.getAllLogs();
      expect(logs[0].action).toBe('grant');
      expect(logs[1].action).toBe('access');
      expect(logs[2].action).toBe('revoke');
      expect(logs[0].timestamp).toBeLessThanOrEqual(logs[1].timestamp);
      expect(logs[1].timestamp).toBeLessThanOrEqual(logs[2].timestamp);
    });
  });

  describe('Edge Cases', () => {
    it('should handle 100+ log entries', () => {
      for (let i = 0; i < 120; i++) {
        logger.logAccessAttempt(testDatabase, user1, 'read', true);
      }

      const logs = logger.getDatabaseLogs(testDatabase);
      expect(logs).toHaveLength(120);
    });

    it('should handle logs for 10+ databases', () => {
      for (let i = 0; i < 12; i++) {
        logger.logGrant(`db-${i}`, user1, 'reader');
      }

      const logs = logger.getUserLogs(user1);
      expect(logs).toHaveLength(12);
    });

    it('should preserve log immutability', () => {
      logger.logGrant(testDatabase, user1, 'writer');

      const logs1 = logger.getDatabaseLogs(testDatabase);
      const logs2 = logger.getDatabaseLogs(testDatabase);

      // Modifying returned array should not affect internal storage
      logs1.pop();

      expect(logs2).toHaveLength(1);
      expect(logger.getDatabaseLogs(testDatabase)).toHaveLength(1);
    });
  });
});
