// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Node API Client
 * Fetches node status directly from fabstir-llm-node
 */

import { NodeStatus } from '../types';

/**
 * Fetches node status from fabstir-llm-node /status endpoint
 * @param nodeUrl Base URL of the node (e.g., http://localhost:8080)
 * @returns NodeStatus object or null on error
 */
export async function fetchStatus(nodeUrl: string): Promise<NodeStatus | null> {
  try {
    const response = await fetch(`${nodeUrl}/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NodeStatus;
  } catch {
    return null;
  }
}

/**
 * Fetches health status from fabstir-llm-node /health endpoint
 * @param nodeUrl Base URL of the node
 * @returns Health status or null on error
 */
export async function fetchHealth(nodeUrl: string): Promise<{ status: string; issues: string[] | null } | null> {
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
