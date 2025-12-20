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

/**
 * NodeStatus matches fabstir-llm-node /status endpoint response
 */
export interface NodeStatus {
  status: 'active' | 'busy' | 'maintenance';
  node_id?: string;
  peer_id?: string;
  uptime_seconds: number;
  active_sessions: number;
  total_jobs_completed: number;
  capabilities?: {
    inference: boolean;
    encryption: boolean;
    rag: boolean;
    s5_vector_loading: boolean;
    proof_generation: string;
  };
  models_loaded: string[];
  chain_id: number;
  version: string;
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
