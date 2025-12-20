// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StatusPanel Component
 * Formats node status for display in the dashboard
 */

import { NodeStatus } from '../types';

/**
 * Formats seconds to human-readable "Xd Xh Xm" format
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

/**
 * Get status indicator based on node status
 */
function getStatusIndicator(status: string): string {
  switch (status) {
    case 'active':
      return '🟢';
    case 'busy':
      return '🟡';
    case 'maintenance':
      return '🟠';
    default:
      return '🔴';
  }
}

/**
 * Formats node status for display in the status panel
 */
export function formatStatusPanel(status: NodeStatus): string {
  const indicator = getStatusIndicator(status.status);
  const lines: string[] = [
    `Status: ${indicator} ${status.status.toUpperCase()}`,
    '',
    `Uptime: ${formatUptime(status.uptime_seconds)}`,
    `Active Sessions: ${status.active_sessions}`,
    `Jobs Completed: ${status.total_jobs_completed}`,
    '',
    `Version: ${status.version}`,
    `Chain ID: ${status.chain_id}`,
  ];

  // Add models if loaded
  if (status.models_loaded && status.models_loaded.length > 0) {
    lines.push('');
    lines.push(`Models: ${status.models_loaded.join(', ')}`);
  }

  // Show health issues if present (from /health fallback)
  if (status.health_issues && status.health_issues.length > 0) {
    lines.push('');
    lines.push(`⚠️ Issues: ${status.health_issues.join(', ')}`);
  }

  return lines.join('\n');
}
