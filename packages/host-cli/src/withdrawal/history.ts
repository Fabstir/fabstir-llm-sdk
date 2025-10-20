// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Withdrawal history module
 * Tracks and manages withdrawal transaction history
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ethers } from 'ethers';

/**
 * Withdrawal record structure
 */
export interface WithdrawalRecord {
  timestamp: Date;
  type: 'host' | 'treasury';
  amount: bigint;
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  gasUsed?: bigint;
  gasCost?: bigint;
  error?: string;
  blockNumber?: number;
  fromAddress?: string;
  toAddress?: string;
}

/**
 * History query options
 */
export interface WithdrawalHistoryOptions {
  type?: 'host' | 'treasury';
  status?: 'pending' | 'confirmed' | 'failed';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  sortOrder?: 'asc' | 'desc';
}

// History file path
const HISTORY_FILE = path.join(
  process.env.HOME || process.env.USERPROFILE || '.',
  '.fabstir',
  'host-cli',
  'withdrawal-history.json'
);

// In-memory cache
let historyCache: WithdrawalRecord[] = [];
let cacheLoaded = false;

/**
 * Load history from file
 */
async function loadHistory(): Promise<WithdrawalRecord[]> {
  if (cacheLoaded) {
    return historyCache;
  }

  try {
    const dir = path.dirname(HISTORY_FILE);
    await fs.mkdir(dir, { recursive: true });

    const data = await fs.readFile(HISTORY_FILE, 'utf-8');
    const records = JSON.parse(data, (key, value) => {
      // Convert bigint strings back to bigint
      if (key === 'amount' || key === 'gasUsed' || key === 'gasCost') {
        return BigInt(value);
      }
      // Convert date strings back to Date objects
      if (key === 'timestamp') {
        return new Date(value);
      }
      return value;
    });

    historyCache = records;
    cacheLoaded = true;
    return records;
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet
      historyCache = [];
      cacheLoaded = true;
      return [];
    }
    throw error;
  }
}

/**
 * Save history to file
 */
async function saveHistory(records: WithdrawalRecord[]): Promise<void> {
  try {
    const dir = path.dirname(HISTORY_FILE);
    await fs.mkdir(dir, { recursive: true });

    const data = JSON.stringify(records, (key, value) => {
      // Convert bigint to string for JSON serialization
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);

    await fs.writeFile(HISTORY_FILE, data, 'utf-8');
    historyCache = records;
    cacheLoaded = true;
  } catch (error) {
    console.error('Error saving withdrawal history:', error);
    throw error;
  }
}

/**
 * Add a withdrawal record to history
 */
export async function addWithdrawalRecord(record: WithdrawalRecord): Promise<void> {
  const history = await loadHistory();
  history.push(record);
  await saveHistory(history);
}

/**
 * Get withdrawal history
 */
export async function getWithdrawalHistory(
  options: WithdrawalHistoryOptions = {}
): Promise<WithdrawalRecord[]> {
  let history = await loadHistory();

  // Filter by type
  if (options.type) {
    history = history.filter(r => r.type === options.type);
  }

  // Filter by status
  if (options.status) {
    history = history.filter(r => r.status === options.status);
  }

  // Filter by date range
  if (options.startDate) {
    history = history.filter(r => r.timestamp >= options.startDate!);
  }
  if (options.endDate) {
    history = history.filter(r => r.timestamp <= options.endDate!);
  }

  // Sort by timestamp
  const sortOrder = options.sortOrder || 'desc';
  history.sort((a, b) => {
    const diff = b.timestamp.getTime() - a.timestamp.getTime();
    return sortOrder === 'desc' ? diff : -diff;
  });

  // Apply offset and limit
  const offset = options.offset || 0;
  const limit = options.limit || history.length;

  return history.slice(offset, offset + limit);
}

/**
 * Clear withdrawal history
 */
export async function clearWithdrawalHistory(options?: {
  olderThan?: number; // Days
}): Promise<void> {
  if (options?.olderThan) {
    // Clear only old records
    const cutoffDate = new Date(Date.now() - options.olderThan * 24 * 60 * 60 * 1000);
    const history = await loadHistory();
    const filtered = history.filter(r => r.timestamp > cutoffDate);
    await saveHistory(filtered);
  } else {
    // Clear all records
    await saveHistory([]);
  }
}

/**
 * Export withdrawal history
 */
export async function exportWithdrawalHistory(
  format: 'json' | 'csv'
): Promise<string> {
  const history = await loadHistory();

  if (format === 'json') {
    return JSON.stringify(history, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    }, 2);
  } else {
    // CSV format
    const headers = [
      'timestamp',
      'type',
      'amount',
      'transactionHash',
      'status',
      'gasUsed',
      'gasCost',
      'blockNumber'
    ];

    const rows = history.map(record => {
      return [
        record.timestamp.toISOString(),
        record.type,
        record.amount.toString(),
        record.transactionHash,
        record.status,
        record.gasUsed?.toString() || '',
        record.gasCost?.toString() || '',
        record.blockNumber?.toString() || ''
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}

/**
 * Get withdrawal statistics
 */
export async function getWithdrawalStatistics(
  options: WithdrawalHistoryOptions = {}
): Promise<{
  totalCount: number;
  totalAmount: bigint;
  averageAmount: bigint;
  totalGasCost: bigint;
  successRate: number;
  byType: {
    host: { count: number; amount: bigint };
    treasury: { count: number; amount: bigint };
  };
  byStatus: {
    pending: number;
    confirmed: number;
    failed: number;
  };
}> {
  const history = await getWithdrawalHistory(options);

  const stats = {
    totalCount: history.length,
    totalAmount: BigInt(0),
    averageAmount: BigInt(0),
    totalGasCost: BigInt(0),
    successRate: 0,
    byType: {
      host: { count: 0, amount: BigInt(0) },
      treasury: { count: 0, amount: BigInt(0) }
    },
    byStatus: {
      pending: 0,
      confirmed: 0,
      failed: 0
    }
  };

  for (const record of history) {
    stats.totalAmount += record.amount;
    stats.totalGasCost += record.gasCost || BigInt(0);

    // By type
    if (record.type === 'host') {
      stats.byType.host.count++;
      stats.byType.host.amount += record.amount;
    } else {
      stats.byType.treasury.count++;
      stats.byType.treasury.amount += record.amount;
    }

    // By status
    stats.byStatus[record.status]++;
  }

  if (stats.totalCount > 0) {
    stats.averageAmount = stats.totalAmount / BigInt(stats.totalCount);
    stats.successRate = (stats.byStatus.confirmed / stats.totalCount) * 100;
  }

  return stats;
}

/**
 * Update withdrawal record status
 */
export async function updateWithdrawalStatus(
  transactionHash: string,
  status: 'confirmed' | 'failed',
  additionalData?: {
    gasUsed?: bigint;
    blockNumber?: number;
    error?: string;
  }
): Promise<boolean> {
  const history = await loadHistory();
  const index = history.findIndex(r => r.transactionHash === transactionHash);

  if (index === -1) {
    return false;
  }

  history[index].status = status;
  if (additionalData) {
    if (additionalData.gasUsed) {
      history[index].gasUsed = additionalData.gasUsed;
    }
    if (additionalData.blockNumber) {
      history[index].blockNumber = additionalData.blockNumber;
    }
    if (additionalData.error) {
      history[index].error = additionalData.error;
    }
  }

  await saveHistory(history);
  return true;
}

/**
 * Format withdrawal history for display
 */
export function formatWithdrawalHistory(records: WithdrawalRecord[]): string {
  if (records.length === 0) {
    return 'No withdrawal history found.';
  }

  const lines: string[] = [];
  lines.push('Withdrawal History:');
  lines.push('═'.repeat(80));

  for (const record of records) {
    lines.push(`Date: ${record.timestamp.toLocaleString()}`);
    lines.push(`Type: ${record.type === 'host' ? 'Host Earnings' : 'Treasury'}`);
    lines.push(`Amount: ${ethers.formatEther(record.amount)} ETH`);
    lines.push(`Status: ${record.status.toUpperCase()}`);
    lines.push(`Transaction: ${record.transactionHash}`);

    if (record.gasUsed && record.gasCost) {
      lines.push(`Gas Used: ${record.gasUsed} (${ethers.formatEther(record.gasCost)} ETH)`);
    }

    if (record.blockNumber) {
      lines.push(`Block: ${record.blockNumber}`);
    }

    if (record.error) {
      lines.push(`Error: ${record.error}`);
    }

    lines.push('─'.repeat(80));
  }

  return lines.join('\n');
}