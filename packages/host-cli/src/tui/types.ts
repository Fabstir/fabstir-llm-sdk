// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * TUI Dashboard Type Definitions
 */

export interface DashboardState {
  nodeStatus: NodeStatus | null;
  logs: LogEntry[];
  earnings: EarningsData | null;
  isRefreshing: boolean;
}

export interface NodeStatus {
  status: 'running' | 'stopped';
  pid?: number;
  uptime?: number;
  publicUrl?: string;
  version?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'stdout' | 'stderr';
  message: string;
}

export interface EarningsData {
  today: string;
  week: string;
  total: string;
  currency: string;
}
