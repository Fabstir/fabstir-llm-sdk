// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Display formatting module
 * Formats status output for terminal display
 */

import chalk from 'chalk';
import { StatusResult } from '../commands/status';
import { HostStatus } from './tracker';
import { ethers } from 'ethers';

/**
 * Format status for terminal display
 */
export function formatStatusDisplay(status: StatusResult | HostStatus | any): string {
  const lines: string[] = [];

  // Header
  lines.push(chalk.blue.bold('\n╔════════════════════════════════════════════╗'));
  lines.push(chalk.blue.bold('║           HOST STATUS REPORT               ║'));
  lines.push(chalk.blue.bold('╚════════════════════════════════════════════╝\n'));

  // Registration Status
  lines.push(formatSection('Registration'));
  if (status.registration || status.isRegistered !== undefined) {
    const reg = status.registration || status;
    if (reg.isRegistered) {
      lines.push(chalk.green('  ✓ Registered'));
      lines.push(chalk.gray(`  Address: ${reg.hostAddress}`));
      if (reg.apiUrl) {
        lines.push(chalk.gray(`  API URL: ${reg.apiUrl}`));
      }
      if (reg.models && reg.models.length > 0) {
        lines.push(chalk.gray(`  Models: ${reg.models.join(', ')}`));
      }
      if (reg.registrationDate) {
        lines.push(chalk.gray(`  Since: ${formatDate(reg.registrationDate)}`));
      }
    } else {
      lines.push(chalk.yellow('  ⚠ Not registered'));
    }
  }

  // Staking Information
  lines.push(formatSection('Staking'));
  if (status.staking) {
    lines.push(chalk.gray(`  Amount: ${status.staking.formatted || formatFAB(status.staking.amount)}`));
    if (status.staking.amount >= 1000000000000000000000n) {
      lines.push(chalk.green('  ✓ Meets minimum requirement'));
    } else {
      lines.push(chalk.yellow('  ⚠ Below minimum requirement'));
    }
  }

  // Earnings Information
  if (status.earnings) {
    lines.push(formatSection('Earnings'));
    lines.push(chalk.gray(`  Total Earned: ${status.earnings.totalEarnedFormatted || '0 ETH'}`));
    lines.push(chalk.gray(`  Available: ${formatETH(status.earnings.available)}`));
    lines.push(chalk.gray(`  Withdrawn: ${formatETH(status.earnings.withdrawn)}`));

    if (status.earnings.hostEarnings) {
      lines.push(chalk.gray(`  Host Share (${status.earnings.hostEarnings.percentage}%): ${status.earnings.hostEarnings.formatted}`));
    }
    if (status.earnings.treasuryEarnings) {
      lines.push(chalk.gray(`  Treasury Share (${status.earnings.treasuryEarnings.percentage}%): ${status.earnings.treasuryEarnings.formatted}`));
    }
  }

  // Session Metrics
  if (status.sessions) {
    lines.push(formatSection('Sessions'));
    lines.push(chalk.gray(`  Total: ${status.sessions.total}`));
    lines.push(chalk.gray(`  Successful: ${status.sessions.successful}`));
    lines.push(chalk.gray(`  Failed: ${status.sessions.failed}`));

    if (status.sessions.total > 0) {
      const successColor = status.sessions.successRate >= 90 ? chalk.green :
                          status.sessions.successRate >= 70 ? chalk.yellow :
                          chalk.red;
      lines.push(successColor(`  Success Rate: ${status.sessions.successRate}%`));
    }

    // Recent sessions
    if (status.sessions.recent && status.sessions.recent.length > 0) {
      lines.push(chalk.gray('\n  Recent Sessions:'));
      status.sessions.recent.slice(0, 5).forEach((session: any) => {
        const statusIcon = session.status === 'success' ? '✓' : '✗';
        const statusColor = session.status === 'success' ? chalk.green : chalk.red;
        lines.push(chalk.gray(`    ${statusColor(statusIcon)} Job ${session.jobId}: ${formatETH(session.earnings)}`));
      });
    }
  }

  // Uptime Information
  if (status.uptime) {
    lines.push(formatSection('Uptime'));
    const statusColor = status.uptime.status === 'online' ? chalk.green : chalk.red;
    lines.push(statusColor(`  Status: ${status.uptime.status.toUpperCase()}`));
    lines.push(chalk.gray(`  Since: ${formatDate(status.uptime.since)}`));
    lines.push(chalk.gray(`  Duration: ${formatDuration(status.uptime.duration)}`));

    const uptimeColor = status.uptime.percentage >= 95 ? chalk.green :
                       status.uptime.percentage >= 80 ? chalk.yellow :
                       chalk.red;
    lines.push(uptimeColor(`  Uptime: ${status.uptime.percentage}%`));
  }

  // Footer
  lines.push(chalk.blue('\n────────────────────────────────────────────'));
  lines.push(chalk.gray(`Generated: ${new Date().toLocaleString()}`));
  lines.push('');

  return lines.join('\n');
}

/**
 * Format as JSON
 */
export function formatJSON(data: any): string {
  // Convert BigInt to string for JSON serialization
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value,
    2
  );
}

/**
 * Format section header
 */
function formatSection(title: string): string {
  return chalk.cyan(`\n${title}\n${'-'.repeat(title.length)}`);
}

/**
 * Format ETH amount
 */
function formatETH(amount: bigint): string {
  return ethers.formatEther(amount) + ' ETH';
}

/**
 * Format FAB amount
 */
function formatFAB(amount: bigint): string {
  const formatted = ethers.formatUnits(amount, 18);
  const parts = formatted.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.') + ' FAB';
}

/**
 * Format date
 */
function formatDate(date: Date): string {
  if (!(date instanceof Date)) {
    date = new Date(date);
  }
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

/**
 * Format duration in seconds to human readable
 */
function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

/**
 * Create a progress bar
 */
export function createProgressBar(
  current: number,
  total: number,
  width: number = 30
): string {
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const filled = Math.round((width * percentage) / 100);
  const empty = width - filled;

  const bar = chalk.green('█').repeat(filled) + chalk.gray('░').repeat(empty);
  return `[${bar}] ${percentage.toFixed(1)}%`;
}

/**
 * Format a table
 */
export function formatTable(
  headers: string[],
  rows: string[][]
): string {
  // Calculate column widths
  const widths = headers.map((h, i) => {
    const headerWidth = h.length;
    const maxRowWidth = Math.max(...rows.map(r => (r[i] || '').length));
    return Math.max(headerWidth, maxRowWidth);
  });

  const lines: string[] = [];

  // Header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' │ ');
  lines.push(chalk.bold(headerLine));
  lines.push('─'.repeat(headerLine.length));

  // Rows
  rows.forEach(row => {
    const rowLine = row.map((c, i) => (c || '').padEnd(widths[i])).join(' │ ');
    lines.push(rowLine);
  });

  return lines.join('\n');
}

/**
 * Format earnings chart
 */
export function formatEarningsChart(
  data: Array<{ date: Date; amount: bigint }>,
  width: number = 50,
  height: number = 10
): string {
  if (data.length === 0) {
    return chalk.gray('No earnings data available');
  }

  const lines: string[] = [];
  const maxAmount = data.reduce((max, d) => d.amount > max ? d.amount : max, 0n);

  // Simple ASCII chart
  lines.push(chalk.cyan('Earnings Over Time'));
  lines.push('');

  // Scale values
  const scaled = data.map(d => ({
    date: d.date,
    value: maxAmount > 0n ? Number((d.amount * BigInt(height) / maxAmount)) : 0
  }));

  // Draw chart
  for (let y = height; y >= 0; y--) {
    const row = scaled.map(d => d.value >= y ? '█' : ' ').join('');
    const label = y === height ? formatETH(maxAmount) :
                 y === 0 ? '0 ETH' : '';
    lines.push(chalk.green(row) + ' ' + chalk.gray(label));
  }

  lines.push('─'.repeat(width));
  lines.push(chalk.gray('Time →'));

  return lines.join('\n');
}

/**
 * Format status comparison
 */
export function formatComparison(
  current: any,
  previous: any
): string {
  const lines: string[] = [];

  lines.push(chalk.blue.bold('\n╔════════════════════════════════════════════╗'));
  lines.push(chalk.blue.bold('║          STATUS COMPARISON                 ║'));
  lines.push(chalk.blue.bold('╚════════════════════════════════════════════╝\n'));

  // Compare earnings
  const currentEarnings = current.earnings?.totalEarned || 0n;
  const previousEarnings = previous.earnings?.totalEarned || 0n;
  const earningsChange = currentEarnings - previousEarnings;
  const earningsChangePercent = previousEarnings > 0n ?
    Number((earningsChange * 100n) / previousEarnings) : 0;

  lines.push(formatSection('Earnings Change'));
  lines.push(formatChange('Total', previousEarnings, currentEarnings, earningsChangePercent));

  // Compare sessions
  const currentSessions = current.sessions?.total || 0;
  const previousSessions = previous.sessions?.total || 0;
  const sessionsChange = currentSessions - previousSessions;
  const sessionsChangePercent = previousSessions > 0 ?
    ((sessionsChange / previousSessions) * 100) : 0;

  lines.push(formatSection('Sessions Change'));
  lines.push(formatChange('Total', previousSessions, currentSessions, sessionsChangePercent));

  return lines.join('\n');
}

/**
 * Format a change comparison
 */
function formatChange(
  label: string,
  previous: any,
  current: any,
  percentChange: number
): string {
  const arrow = percentChange > 0 ? '↑' : percentChange < 0 ? '↓' : '→';
  const color = percentChange > 0 ? chalk.green : percentChange < 0 ? chalk.red : chalk.gray;

  return chalk.gray(`  ${label}: `) +
         chalk.white(`${previous} → ${current} `) +
         color(`${arrow} ${Math.abs(percentChange).toFixed(1)}%`);
}