// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Node API Client
 * Fetches node status directly from fabstir-llm-node
 */

import { NodeStatus } from '../types';

/**
 * Fetches health status from fabstir-llm-node /health endpoint
 * @param nodeUrl Base URL of the node
 * @returns Health status or null on error
 */
export async function fetchHealth(
  nodeUrl: string
): Promise<{ status: string; issues: string[] | null } | null> {
  try {
    const response = await fetch(`${nodeUrl}/health`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as { status: string; issues: string[] | null };
  } catch {
    return null;
  }
}

/**
 * Fetches version info from fabstir-llm-node /v1/version endpoint
 * @param nodeUrl Base URL of the node
 * @returns Version info or null on error
 */
export async function fetchVersion(
  nodeUrl: string
): Promise<{ version: string; build?: string; features?: string[]; chains?: number[] } | null> {
  try {
    const response = await fetch(`${nodeUrl}/v1/version`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as { version: string; build?: string; features?: string[]; chains?: number[] };
  } catch {
    return null;
  }
}

/**
 * Fetches node status from fabstir-llm-node
 * Tries /status first, falls back to combining /health + /v1/version
 * @param nodeUrl Base URL of the node (e.g., http://localhost:8080)
 * @returns NodeStatus object or null on error
 */
export async function fetchStatus(nodeUrl: string): Promise<NodeStatus | null> {
  // Try /status endpoint first
  try {
    const response = await fetch(`${nodeUrl}/status`);
    if (response.ok) {
      const text = await response.text();
      if (text && text.trim()) {
        const status = JSON.parse(text) as NodeStatus;
        if (status && status.status) {
          return status;
        }
      }
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: Combine /health and /v1/version endpoints
  const [health, version] = await Promise.all([fetchHealth(nodeUrl), fetchVersion(nodeUrl)]);

  if (!health) {
    return null;
  }

  // Map health status to NodeStatus format
  const statusMap: Record<string, 'active' | 'busy' | 'maintenance'> = {
    healthy: 'active',
    degraded: 'maintenance',
    unhealthy: 'maintenance',
  };

  return {
    status: statusMap[health.status] || 'maintenance',
    uptime_seconds: 0, // Not available from /health
    active_sessions: 0, // Not available from /health
    total_jobs_completed: 0, // Not available from /health
    models_loaded: [], // Not available from /health
    chain_id: version?.chains?.[0] || 0,
    version: version?.version || 'unknown',
    health_issues: health.issues, // Pass through for display
  } as NodeStatus;
}
