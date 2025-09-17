/**
 * Status command implementation
 * Displays comprehensive host status information
 */

import { Command } from 'commander';
import { getHostStatus, HostStatus } from '../monitoring/tracker';
import { getEarningsInfo, EarningsInfo } from '../monitoring/metrics';
import { formatStatusDisplay, formatJSON } from '../monitoring/display';
import { getSDK, getAuthenticatedAddress } from '../sdk/client';
import chalk from 'chalk';

/**
 * Register the status command with the CLI
 */
export function registerStatusCommand(program: Command): void {
  program
    .command('status')
    .description('Display current host status and statistics')
    .option('--detailed', 'Show detailed information')
    .option('--metrics', 'Include performance metrics')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await executeStatus({
          json: options.json,
          verbose: options.detailed || options.metrics
        });
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Status command options
 */
export interface StatusOptions {
  json?: boolean;
  verbose?: boolean;
  refresh?: number;
}

/**
 * Status result structure
 */
export interface StatusResult {
  timestamp: Date | string;
  version: string;
  registration: {
    isRegistered: boolean;
    hostAddress: string | null;
    apiUrl?: string;
    models?: string[];
    registrationDate?: Date | string;
  };
  staking: {
    amount: bigint | string;
    formatted: string;
  };
  earnings: EarningsInfo;
  sessions: {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    recent: Array<{
      timestamp: Date | string;
      jobId: string;
      earnings: bigint | string;
      status: 'success' | 'failed';
    }>;
  };
  uptime: {
    since: Date | string;
    duration: number;
    percentage: number;
    status: 'online' | 'offline';
  };
  detailedMetrics?: any;
  sessionHistory?: any[];
}

/**
 * Execute status command
 */
export async function executeStatus(options: StatusOptions = {}): Promise<StatusResult> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated. Please authenticate first.');
  }

  const address = getAuthenticatedAddress();
  if (!address) {
    throw new Error('No authenticated address');
  }

  try {
    // Gather all status information
    const hostStatus = await getHostStatus();
    const earnings = await getEarningsInfo();

    // Build result object
    let result: StatusResult = {
      timestamp: new Date(),
      version: '1.0.0',
      registration: {
        isRegistered: hostStatus.isRegistered,
        hostAddress: hostStatus.hostAddress,
        apiUrl: hostStatus.apiUrl,
        models: hostStatus.models,
        registrationDate: hostStatus.registrationDate
      },
      staking: hostStatus.staking,
      earnings,
      sessions: hostStatus.sessions,
      uptime: hostStatus.uptime
    };

    // Add detailed metrics if verbose
    if (options.verbose) {
      result.detailedMetrics = await getDetailedMetrics();
      result.sessionHistory = await getSessionHistory();
    }

    // Convert BigInt to string for JSON compatibility if needed
    if (options.json) {
      result = JSON.parse(formatJSON(result));
    }

    // Output based on format
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatStatusDisplay(result));
    }

    // Handle refresh
    if (options.refresh && options.refresh > 0) {
      setTimeout(() => executeStatus(options), options.refresh * 1000);
    }

    return result;
  } catch (error: any) {
    console.error(chalk.red('Error fetching status:'), error.message);
    throw error;
  }
}

/**
 * Get detailed metrics for verbose output
 */
async function getDetailedMetrics(): Promise<any> {
  // This will be expanded with more detailed metrics
  return {
    performance: {
      averageResponseTime: 0,
      tokensPerSecond: 0,
      successRate: 0
    },
    resources: {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0
    }
  };
}

/**
 * Get session history
 */
async function getSessionHistory(limit: number = 10): Promise<any[]> {
  // This will fetch actual session history from blockchain events
  return [];
}

/**
 * Display quick status summary
 */
export async function displayQuickStatus(): Promise<void> {
  const sdk = getSDK();
  if (!sdk.isAuthenticated()) {
    console.log(chalk.yellow('Not authenticated'));
    return;
  }

  try {
    const status = await getHostStatus();

    if (!status.isRegistered) {
      console.log(chalk.yellow('⚠️  Host not registered'));
      return;
    }

    console.log(chalk.green('✓ Host Active'));
    console.log(chalk.gray(`Address: ${status.hostAddress}`));
    console.log(chalk.gray(`Stake: ${status.staking.formatted}`));

    const earnings = await getEarningsInfo();
    console.log(chalk.gray(`Earnings: ${earnings.totalEarnedFormatted}`));
    console.log(chalk.gray(`Sessions: ${status.sessions.total} (${status.sessions.successRate}% success)`));
  } catch (error: any) {
    console.error(chalk.red('Error:'), error.message);
  }
}

/**
 * Monitor status with live updates
 */
export async function monitorStatus(interval: number = 5): Promise<void> {
  console.log(chalk.blue(`Monitoring status (updating every ${interval}s)...`));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  const options: StatusOptions = {
    refresh: interval
  };

  await executeStatus(options);
}

/**
 * Export status to file
 */
export async function exportStatus(filepath: string): Promise<void> {
  const result = await executeStatus({ json: true });
  const fs = await import('fs/promises');

  await fs.writeFile(
    filepath,
    JSON.stringify(result, null, 2),
    'utf-8'
  );

  console.log(chalk.green(`✓ Status exported to ${filepath}`));
}

/**
 * Compare status between time periods
 */
export async function compareStatus(
  period1: { start: Date; end: Date },
  period2: { start: Date; end: Date }
): Promise<void> {
  // This will compare metrics between two time periods
  console.log(chalk.blue('Comparing status between periods...'));

  // Placeholder implementation
  const comparison = {
    period1: {
      earnings: 0n,
      sessions: 0,
      uptime: 0
    },
    period2: {
      earnings: 0n,
      sessions: 0,
      uptime: 0
    },
    changes: {
      earnings: '0%',
      sessions: '0%',
      uptime: '0%'
    }
  };

  console.log(formatStatusDisplay(comparison as any));
}