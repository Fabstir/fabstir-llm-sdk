// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getWithdrawalHistory,
  addWithdrawalRecord,
  clearWithdrawalHistory,
  exportWithdrawalHistory,
  WithdrawalRecord,
  WithdrawalHistoryOptions
} from '../../src/withdrawal/history';
import { initializeSDK, authenticateSDK, cleanupSDK } from '../../src/sdk/client';
import * as path from 'path';
import { config } from 'dotenv';

// Load test environment
config({ path: path.join(__dirname, '../../../../.env.test') });

describe('Withdrawal History', () => {
  beforeEach(async () => {
    await cleanupSDK();
    await initializeSDK();
    await clearWithdrawalHistory();
  });

  afterEach(async () => {
    await clearWithdrawalHistory();
    await cleanupSDK();
  });

  describe('History Recording', () => {
    it('should record withdrawal transactions', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const record: WithdrawalRecord = {
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0x123...',
        status: 'confirmed',
        gasUsed: 21000n,
        gasCost: 420000000000000n
      };

      await addWithdrawalRecord(record);
      const history = await getWithdrawalHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        type: 'host',
        amount: 100000000000000000n,
        status: 'confirmed'
      });
    });

    it('should store multiple withdrawal records', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const records: WithdrawalRecord[] = [
        {
          timestamp: new Date(Date.now() - 3600000),
          type: 'host',
          amount: 50000000000000000n,
          transactionHash: '0xabc...',
          status: 'confirmed'
        },
        {
          timestamp: new Date(Date.now() - 1800000),
          type: 'treasury',
          amount: 20000000000000000n,
          transactionHash: '0xdef...',
          status: 'confirmed'
        },
        {
          timestamp: new Date(),
          type: 'host',
          amount: 100000000000000000n,
          transactionHash: '0x789...',
          status: 'pending'
        }
      ];

      for (const record of records) {
        await addWithdrawalRecord(record);
      }

      const history = await getWithdrawalHistory();
      expect(history).toHaveLength(3);
    });

    it('should persist history across sessions', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const record: WithdrawalRecord = {
        timestamp: new Date(),
        type: 'host',
        amount: 75000000000000000n,
        transactionHash: '0xpersist...',
        status: 'confirmed'
      };

      await addWithdrawalRecord(record);

      // Simulate new session
      await cleanupSDK();
      await initializeSDK();
      await authenticateSDK(privateKey);

      const history = await getWithdrawalHistory();
      expect(history).toHaveLength(1);
      expect(history[0].transactionHash).toBe('0xpersist...');
    });
  });

  describe('History Filtering', () => {
    it('should filter by withdrawal type', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0x1...',
        status: 'confirmed'
      });

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'treasury',
        amount: 50000000000000000n,
        transactionHash: '0x2...',
        status: 'confirmed'
      });

      const hostHistory = await getWithdrawalHistory({ type: 'host' });
      expect(hostHistory).toHaveLength(1);
      expect(hostHistory[0].type).toBe('host');

      const treasuryHistory = await getWithdrawalHistory({ type: 'treasury' });
      expect(treasuryHistory).toHaveLength(1);
      expect(treasuryHistory[0].type).toBe('treasury');
    });

    it('should filter by date range', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const now = Date.now();
      const records = [
        {
          timestamp: new Date(now - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          type: 'host' as const,
          amount: 100000000000000000n,
          transactionHash: '0xold...',
          status: 'confirmed' as const
        },
        {
          timestamp: new Date(now - 2 * 24 * 60 * 60 * 1000), // 2 days ago
          type: 'host' as const,
          amount: 100000000000000000n,
          transactionHash: '0xrecent...',
          status: 'confirmed' as const
        },
        {
          timestamp: new Date(now), // now
          type: 'host' as const,
          amount: 100000000000000000n,
          transactionHash: '0xnew...',
          status: 'confirmed' as const
        }
      ];

      for (const record of records) {
        await addWithdrawalRecord(record);
      }

      const options: WithdrawalHistoryOptions = {
        startDate: new Date(now - 3 * 24 * 60 * 60 * 1000),
        endDate: new Date()
      };

      const filtered = await getWithdrawalHistory(options);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.transactionHash)).toContain('0xrecent...');
      expect(filtered.map(r => r.transactionHash)).toContain('0xnew...');
    });

    it('should filter by status', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xpending...',
        status: 'pending'
      });

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xconfirmed...',
        status: 'confirmed'
      });

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xfailed...',
        status: 'failed'
      });

      const pending = await getWithdrawalHistory({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].status).toBe('pending');

      const confirmed = await getWithdrawalHistory({ status: 'confirmed' });
      expect(confirmed).toHaveLength(1);
      expect(confirmed[0].status).toBe('confirmed');
    });

    it('should limit number of records', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Add 10 records
      for (let i = 0; i < 10; i++) {
        await addWithdrawalRecord({
          timestamp: new Date(Date.now() - i * 1000000),
          type: 'host',
          amount: BigInt(i + 1) * 10000000000000000n,
          transactionHash: `0x${i}...`,
          status: 'confirmed'
        });
      }

      const limited = await getWithdrawalHistory({ limit: 5 });
      expect(limited).toHaveLength(5);

      // Should return most recent first
      expect(limited[0].transactionHash).toBe('0x0...');
    });
  });

  describe('History Statistics', () => {
    it('should calculate total withdrawn amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0x1...',
        status: 'confirmed'
      });

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 200000000000000000n,
        transactionHash: '0x2...',
        status: 'confirmed'
      });

      const history = await getWithdrawalHistory();
      const total = history.reduce((sum, record) => sum + record.amount, 0n);

      expect(total).toBe(300000000000000000n);
    });

    it('should calculate average withdrawal amount', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      const amounts = [100000000000000000n, 200000000000000000n, 300000000000000000n];

      for (let i = 0; i < amounts.length; i++) {
        await addWithdrawalRecord({
          timestamp: new Date(),
          type: 'host',
          amount: amounts[i],
          transactionHash: `0x${i}...`,
          status: 'confirmed'
        });
      }

      const history = await getWithdrawalHistory();
      const total = history.reduce((sum, record) => sum + record.amount, 0n);
      const average = total / BigInt(history.length);

      expect(average).toBe(200000000000000000n);
    });
  });

  describe('History Export', () => {
    it('should export history to JSON', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xexport...',
        status: 'confirmed'
      });

      const exported = await exportWithdrawalHistory('json');

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');

      const parsed = JSON.parse(exported);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].transactionHash).toBe('0xexport...');
    });

    it('should export history to CSV', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date('2024-01-15T10:30:00'),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xcsv...',
        status: 'confirmed',
        gasUsed: 21000n,
        gasCost: 420000000000000n
      });

      const csv = await exportWithdrawalHistory('csv');

      expect(csv).toBeDefined();
      expect(csv).toContain('timestamp,type,amount,transactionHash,status');
      expect(csv).toContain('0xcsv...');
      expect(csv).toContain('100000000000000000');
    });
  });

  describe('History Cleanup', () => {
    it('should clear all history records', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xclear...',
        status: 'confirmed'
      });

      let history = await getWithdrawalHistory();
      expect(history).toHaveLength(1);

      await clearWithdrawalHistory();

      history = await getWithdrawalHistory();
      expect(history).toHaveLength(0);
    });

    it('should clear old records', async () => {
      const privateKey = process.env.TEST_HOST_1_PRIVATE_KEY!;
      await authenticateSDK(privateKey);

      // Add old record
      await addWithdrawalRecord({
        timestamp: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000), // 100 days ago
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xold...',
        status: 'confirmed'
      });

      // Add recent record
      await addWithdrawalRecord({
        timestamp: new Date(),
        type: 'host',
        amount: 100000000000000000n,
        transactionHash: '0xnew...',
        status: 'confirmed'
      });

      await clearWithdrawalHistory({ olderThan: 90 });

      const history = await getWithdrawalHistory();
      expect(history).toHaveLength(1);
      expect(history[0].transactionHash).toBe('0xnew...');
    });
  });
});