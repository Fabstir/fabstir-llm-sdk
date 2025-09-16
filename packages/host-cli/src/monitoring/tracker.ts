/**
 * Host monitoring and tracking module
 * Tracks host status, sessions, and uptime
 */

import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import { checkRegistrationStatus } from '../registration/manager';
import { checkStakedAmount } from '../registration/staking';
import { formatFABBalance } from '../balance/checker';
import { ethers } from 'ethers';

/**
 * Host status structure
 */
export interface HostStatus {
  isRegistered: boolean;
  isActive: boolean;
  hostAddress: string | null;
  apiUrl?: string;
  models?: string[];
  registrationDate?: Date;
  staking: {
    amount: bigint;
    formatted: string;
  };
  sessions: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    recent: SessionInfo[];
  };
  uptime: {
    since: Date;
    duration: number;
    percentage: number;
    status: 'online' | 'offline';
  };
}

/**
 * Session information
 */
export interface SessionInfo {
  timestamp: Date;
  jobId: string;
  earnings: bigint;
  status: 'success' | 'failed';
  model?: string;
  duration?: number;
  tokensGenerated?: number;
}

/**
 * Uptime tracker data
 */
interface UptimeData {
  startTime: Date;
  totalUptime: number;
  totalDowntime: number;
  lastCheck: Date;
  currentStatus: 'online' | 'offline';
  statusHistory: Array<{
    timestamp: Date;
    status: 'online' | 'offline';
  }>;
}

// In-memory storage (will be enhanced with persistence)
const uptimeData: UptimeData = {
  startTime: new Date(),
  totalUptime: 0,
  totalDowntime: 0,
  lastCheck: new Date(),
  currentStatus: 'offline',
  statusHistory: []
};

const sessionCache: SessionInfo[] = [];

/**
 * Get comprehensive host status
 */
export async function getHostStatus(): Promise<HostStatus> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  // Get registration status
  const regStatus = await checkRegistrationStatus();

  // Get staking information
  const stakedAmount = await checkStakedAmount();
  const formattedStake = formatFABBalance(stakedAmount, 0, true);

  // Get session information
  const sessions = await getSessionMetrics();

  // Get uptime information
  const uptime = await getUptimeInfo();

  // Build registration date (placeholder - will fetch from blockchain)
  const registrationDate = regStatus.isRegistered
    ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago for now
    : undefined;

  return {
    isRegistered: regStatus.isRegistered,
    isActive: regStatus.isActive || false,
    hostAddress: regStatus.hostAddress,
    apiUrl: regStatus.apiUrl,
    models: regStatus.models,
    registrationDate,
    staking: {
      amount: stakedAmount,
      formatted: formattedStake
    },
    sessions,
    uptime
  };
}

/**
 * Get session metrics
 */
async function getSessionMetrics(): Promise<HostStatus['sessions']> {
  const sdk = getSDK();
  const address = getAuthenticatedAddress();

  if (!address) {
    return {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      recent: []
    };
  }

  try {
    // Fetch session data from blockchain events
    const sessions = await fetchSessionHistory(address);

    const total = sessions.length;
    const successful = sessions.filter(s => s.status === 'success').length;
    const failed = total - successful;
    const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;

    return {
      total,
      successful,
      failed,
      successRate,
      recent: sessions.slice(0, 10) // Last 10 sessions
    };
  } catch (error) {
    console.debug('Error fetching session metrics:', error);
    return {
      total: 0,
      successful: 0,
      failed: 0,
      successRate: 0,
      recent: []
    };
  }
}

/**
 * Fetch session history from blockchain
 */
async function fetchSessionHistory(hostAddress: string): Promise<SessionInfo[]> {
  // For now, return cached data as we don't have direct contract access
  // This would normally fetch from blockchain events
  return sessionCache;
}

/**
 * Get uptime information
 */
async function getUptimeInfo(): Promise<HostStatus['uptime']> {
  const now = new Date();
  const duration = now.getTime() - uptimeData.startTime.getTime();

  // Check current status (simplified - will be enhanced)
  const isOnline = await checkHostOnlineStatus();

  if (isOnline !== uptimeData.currentStatus) {
    // Status changed
    uptimeData.statusHistory.push({
      timestamp: now,
      status: isOnline
    });
    uptimeData.currentStatus = isOnline;
  }

  // Update uptime/downtime
  const timeSinceLastCheck = now.getTime() - uptimeData.lastCheck.getTime();
  if (uptimeData.currentStatus === 'online') {
    uptimeData.totalUptime += timeSinceLastCheck;
  } else {
    uptimeData.totalDowntime += timeSinceLastCheck;
  }
  uptimeData.lastCheck = now;

  const totalTime = uptimeData.totalUptime + uptimeData.totalDowntime;
  const percentage = totalTime > 0
    ? Math.round((uptimeData.totalUptime / totalTime) * 100)
    : 0;

  return {
    since: uptimeData.startTime,
    duration: Math.floor(duration / 1000), // in seconds
    percentage,
    status: uptimeData.currentStatus
  };
}

/**
 * Check if host is currently online
 */
async function checkHostOnlineStatus(): Promise<'online' | 'offline'> {
  const sdk = getSDK();
  const address = getAuthenticatedAddress();

  if (!address) {
    return 'offline';
  }

  try {
    const hostManager = sdk.getHostManager();
    const hostInfo = await hostManager.getHostInfo?.(address);

    return hostInfo?.isActive ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

/**
 * Track a new session
 */
export async function trackSession(session: SessionInfo): Promise<void> {
  sessionCache.unshift(session);

  // Keep only last 100 sessions in cache
  if (sessionCache.length > 100) {
    sessionCache.length = 100;
  }
}

/**
 * Reset tracking data
 */
export function resetTracking(): void {
  uptimeData.startTime = new Date();
  uptimeData.totalUptime = 0;
  uptimeData.totalDowntime = 0;
  uptimeData.lastCheck = new Date();
  uptimeData.currentStatus = 'offline';
  uptimeData.statusHistory = [];
  sessionCache.length = 0;
}

/**
 * Get tracking statistics
 */
export function getTrackingStats(): {
  uptimeData: UptimeData;
  sessionCount: number;
} {
  return {
    uptimeData: { ...uptimeData },
    sessionCount: sessionCache.length
  };
}