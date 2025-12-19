// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * StatusPanel Component
 * Formats node status for display in the dashboard
 */

import { NodeStatus } from '../types';

/**
 * Formats seconds to human-readable "Xh Ym" format
 */
export function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/**
 * Formats node status for display in the status panel
 */
export function formatStatusPanel(status: NodeStatus): string {
  const indicator = status.status === 'running' ? '🟢' : '🔴';
  const lines: string[] = [
    `Status: ${indicator} ${status.status.toUpperCase()}`,
  ];

  if (status.status === 'running') {
    if (status.pid !== undefined) {
      lines.push(`PID: ${status.pid}`);
    }
    if (status.uptime !== undefined) {
      lines.push(`Uptime: ${formatUptime(status.uptime)}`);
    }
    if (status.publicUrl) {
      lines.push(`URL: ${status.publicUrl}`);
    }
    if (status.version) {
      lines.push(`Version: ${status.version}`);
    }
  }

  return lines.join('\n');
}
