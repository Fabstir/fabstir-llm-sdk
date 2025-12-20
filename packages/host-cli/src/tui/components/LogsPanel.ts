// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * LogsPanel Component
 * Formats log entries for display in the dashboard
 */

import { LogEntry } from '../types';

/**
 * Formats an ISO timestamp to HH:MM:SS format
 */
export function formatTimestamp(timestamp: string): string {
  if (!timestamp) return '--:--:--';

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return '--:--:--';
    }
    return date.toTimeString().slice(0, 8);
  } catch {
    return '--:--:--';
  }
}

/**
 * Gets the log level label with appropriate formatting
 */
function getLevelLabel(level: LogEntry['level']): string {
  switch (level) {
    case 'info':
      return '[INFO]';
    case 'warn':
      return '[WARN]';
    case 'error':
      return '[ERROR]';
    case 'stdout':
      return '[OUT]';
    case 'stderr':
      return '[ERR]';
    default:
      return '[LOG]';
  }
}

/**
 * Formats a log entry for display in the logs panel
 */
export function formatLogEntry(entry: LogEntry): string {
  const time = formatTimestamp(entry.timestamp);
  const level = getLevelLabel(entry.level);
  return `${time} ${level} ${entry.message}`;
}
