// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Metrics calculation module
 * Calculates earnings, performance, and profitability metrics
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { ethers } from 'ethers';

/**
 * Earnings information structure
 */
export interface EarningsInfo {
  totalEarned: bigint;
  totalEarnedETH: bigint;
  totalEarnedUSD?: number;
  totalEarnedFormatted: string;
  available: bigint;
  pending: bigint;
  withdrawn: bigint;
  hostEarnings: {
    amount: bigint;
    percentage: number;
    formatted: string;
  };
  treasuryEarnings: {
    amount: bigint;
    percentage: number;
    formatted: string;
  };
}

/**
 * Earnings balance structure
 */
export interface EarningsBalance {
  total: bigint;
  available: bigint;
  pending: bigint;
  withdrawn: bigint;
}

/**
 * Treasury earnings structure
 */
export interface TreasuryEarnings {
  balance: bigint;
  percentage: number;
  totalReceived: bigint;
}

/**
 * Host earnings structure
 */
export interface HostEarnings {
  balance: bigint;
  percentage: number;
  totalReceived: bigint;
}

/**
 * Earnings history entry
 */
export interface EarningsEntry {
  timestamp: Date;
  amount: bigint;
  jobId: string;
  type: 'payment' | 'withdrawal' | 'bonus';
}

/**
 * Profitability metrics
 */
export interface ProfitabilityMetrics {
  totalRevenue: bigint;
  totalCosts: bigint;
  netProfit: bigint;
  profitMargin: number;
  dailyAverage: bigint;
  hourlyRate: bigint;
  stakingROI: {
    percentage: number;
    daysToBreakeven: number;
  };
  projections: {
    nextWeek: bigint;
    nextMonth: bigint;
    nextYear: bigint;
  };
}

/**
 * Session metrics structure
 */
export interface SessionMetrics {
  totalSessions: number;
  successfulSessions: number;
  failedSessions: number;
  successRate: number;
  byModel: Record<string, {
    count: number;
    earnings: bigint;
  }>;
  last24Hours: number;
  last7Days: number;
  last30Days: number;
}

/**
 * Performance metrics structure
 */
export interface PerformanceMetrics {
  overallScore: number;
  reliability: number;
  speed: number;
  ranking: {
    position: number;
    totalHosts: number;
    percentile: number;
  };
  trend: 'improving' | 'stable' | 'declining';
}

// Constants
const TREASURY_PERCENTAGE = 10;
const HOST_PERCENTAGE = 90;

/**
 * Get comprehensive earnings information
 */
export async function getEarningsInfo(): Promise<EarningsInfo> {
  const balance = await getEarningsBalance();
  const treasury = await getTreasuryEarnings();
  const host = await getHostEarnings();

  const totalEarnedETH = balance.total;
  const totalEarnedFormatted = ethers.formatEther(totalEarnedETH) + ' ETH';
  // Placeholder USD conversion (would fetch actual price)
  const ethPriceUSD = 2000; // $2000 per ETH
  const totalEarnedUSD = Number(ethers.formatEther(totalEarnedETH)) * ethPriceUSD;

  return {
    totalEarned: balance.total,
    totalEarnedETH,
    totalEarnedUSD,
    totalEarnedFormatted,
    available: balance.available,
    pending: balance.pending,
    withdrawn: balance.withdrawn,
    hostEarnings: {
      amount: host.balance,
      percentage: HOST_PERCENTAGE,
      formatted: ethers.formatEther(host.balance) + ' ETH'
    },
    treasuryEarnings: {
      amount: treasury.balance,
      percentage: TREASURY_PERCENTAGE,
      formatted: ethers.formatEther(treasury.balance) + ' ETH'
    }
  };
}

/**
 * Get earnings balance
 */
export async function getEarningsBalance(): Promise<EarningsBalance> {
  const sdk = getSDK();
  const address = getAuthenticatedAddress();

  if (!address) {
    return {
      total: 0n,
      available: 0n,
      pending: 0n,
      withdrawn: 0n
    };
  }

  try {
    // TODO: Implement proper earnings tracking when HostEarnings contract is integrated
    // For now, return stub values since ITreasuryManager doesn't have getHostEarnings method
    const hostEarnings = 0n;
    const treasuryBalance = 0n;

    const total = hostEarnings + treasuryBalance;
    const withdrawn = 0n; // Will be tracked from withdrawal events

    return {
      total,
      available: hostEarnings,
      pending: 0n,
      withdrawn
    };
  } catch (error) {
    console.debug('Error fetching earnings balance:', error);
    return {
      total: 0n,
      available: 0n,
      pending: 0n,
      withdrawn: 0n
    };
  }
}

/**
 * Get treasury earnings
 */
export async function getTreasuryEarnings(): Promise<TreasuryEarnings> {
  try {
    // TODO: Implement when token address is available
    // const treasuryManager = sdk.getTreasuryManager();
    // const balance = await treasuryManager.getBalance(tokenAddress);
    const balance = 0n;

    return {
      balance,
      percentage: TREASURY_PERCENTAGE,
      totalReceived: balance
    };
  } catch (error) {
    console.debug('Error fetching treasury earnings:', error);
    return {
      balance: 0n,
      percentage: TREASURY_PERCENTAGE,
      totalReceived: 0n
    };
  }
}

/**
 * Get host earnings
 */
export async function getHostEarnings(): Promise<HostEarnings> {
  const address = getAuthenticatedAddress();

  if (!address) {
    return {
      balance: 0n,
      percentage: HOST_PERCENTAGE,
      totalReceived: 0n
    };
  }

  try {
    // TODO: Implement proper host earnings tracking via HostEarnings contract
    // ITreasuryManager doesn't have getHostEarnings method
    const balance = 0n;

    return {
      balance,
      percentage: HOST_PERCENTAGE,
      totalReceived: balance
    };
  } catch (error) {
    console.debug('Error fetching host earnings:', error);
    return {
      balance: 0n,
      percentage: HOST_PERCENTAGE,
      totalReceived: 0n
    };
  }
}

/**
 * Get earnings history
 */
export async function getEarningsHistory(options?: {
  since?: Date;
  limit?: number;
}): Promise<EarningsEntry[]> {
  // Placeholder - will fetch from blockchain events
  const history: EarningsEntry[] = [];

  // Sort by timestamp descending
  history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  // Apply filters
  if (options?.since) {
    const since = options.since;
    return history.filter(entry => entry.timestamp >= since);
  }

  if (options?.limit) {
    return history.slice(0, options.limit);
  }

  return history;
}

/**
 * Calculate profitability metrics
 */
export async function calculateProfitability(): Promise<ProfitabilityMetrics> {
  const balance = await getEarningsBalance();
  const registrationDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const daysSinceRegistration = Math.floor(
    (Date.now() - registrationDate.getTime()) / (24 * 60 * 60 * 1000)
  );

  const totalRevenue = balance.total;
  const totalCosts = 0n; // Gas costs would be calculated here
  const netProfit = totalRevenue - totalCosts;
  const profitMargin = totalRevenue > 0n
    ? Number((netProfit * 100n) / totalRevenue)
    : 0;

  const dailyAverage = daysSinceRegistration > 0
    ? totalRevenue / BigInt(daysSinceRegistration)
    : 0n;

  const hourlyRate = dailyAverage / 24n;

  // ROI calculation (1000 FAB stake)
  const stakeValue = 1000000000000000000000n; // 1000 FAB in wei
  const roiPercentage = stakeValue > 0n
    ? Number((totalRevenue * 100n) / stakeValue)
    : 0;

  const daysToBreakeven = dailyAverage > 0n
    ? Number(stakeValue / dailyAverage)
    : 999999;

  return {
    totalRevenue,
    totalCosts,
    netProfit,
    profitMargin,
    dailyAverage,
    hourlyRate,
    stakingROI: {
      percentage: roiPercentage,
      daysToBreakeven
    },
    projections: {
      nextWeek: dailyAverage * 7n,
      nextMonth: dailyAverage * 30n,
      nextYear: dailyAverage * 365n
    }
  };
}

/**
 * Get session metrics
 */
export async function getSessionMetrics(): Promise<SessionMetrics> {
  // Placeholder implementation
  return {
    totalSessions: 0,
    successfulSessions: 0,
    failedSessions: 0,
    successRate: 0,
    byModel: {},
    last24Hours: 0,
    last7Days: 0,
    last30Days: 0
  };
}

/**
 * Calculate performance metrics
 */
export async function calculatePerformance(): Promise<PerformanceMetrics> {
  const sessions = await getSessionMetrics();

  // Calculate scores
  const reliability = sessions.successRate;
  const speed = 85; // Placeholder
  const overallScore = Math.round((reliability + speed) / 2);

  return {
    overallScore,
    reliability,
    speed,
    ranking: {
      position: 1,
      totalHosts: 10,
      percentile: 90
    },
    trend: 'stable'
  };
}

/**
 * Get uptime metrics
 */
export async function getUptimeMetrics(): Promise<any> {
  return {
    startTime: new Date(),
    totalUptime: 0,
    totalDowntime: 0,
    uptimePercentage: 100,
    currentStatus: 'online',
    lastStatusChange: new Date(),
    currentStreak: 0,
    longestStreak: 0,
    downtimeIncidents: []
  };
}

/**
 * Get average metrics
 */
export async function getAverageMetrics(): Promise<any> {
  return {
    sessionDuration: 0,
    earningsPerSession: 0n,
    responseTime: 0,
    tokensPerSecond: 0
  };
}