// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Management API Client
 * Fetches node status from the management server
 */

import { NodeStatus } from '../types';

/**
 * Fetches node status from the management API
 * @param mgmtUrl Base URL of the management server
 * @returns NodeStatus object or null on error
 */
export async function fetchStatus(mgmtUrl: string): Promise<NodeStatus | null> {
  try {
    const response = await fetch(`${mgmtUrl}/api/status`);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as NodeStatus;
  } catch {
    return null;
  }
}

/**
 * Starts the node via management API
 */
export async function startNode(mgmtUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${mgmtUrl}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemon: true }),
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return { success: false, error: data.error || 'Unknown error' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

/**
 * Stops the node via management API
 */
export async function stopNode(mgmtUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${mgmtUrl}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return { success: false, error: data.error || 'Unknown error' };
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
