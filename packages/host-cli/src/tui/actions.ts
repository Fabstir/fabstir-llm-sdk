// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Action Handlers
 * Keyboard action handlers for the TUI dashboard
 */

export interface ActionResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * Shows a success message (for use with blessed log widget)
 */
export function showMessage(message: string): string {
  return `✅ ${message}`;
}

/**
 * Shows an error message (for use with blessed log widget)
 */
export function showError(error: string): string {
  return `❌ ${error}`;
}

/**
 * Handles the start node action
 */
export async function handleStart(
  mgmtUrl: string,
  onComplete: () => void
): Promise<ActionResult> {
  try {
    const response = await fetch(`${mgmtUrl}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ daemon: true }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return {
        success: false,
        error: data.error || 'Unknown error',
      };
    }

    onComplete();
    return {
      success: true,
      message: 'Node started',
    };
  } catch (e) {
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Handles the stop node action
 */
export async function handleStop(
  mgmtUrl: string,
  onComplete: () => void
): Promise<ActionResult> {
  try {
    const response = await fetch(`${mgmtUrl}/api/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      return {
        success: false,
        error: data.error || 'Unknown error',
      };
    }

    onComplete();
    return {
      success: true,
      message: 'Node stopped',
    };
  } catch (e) {
    return {
      success: false,
      error: String(e),
    };
  }
}

/**
 * Handles the withdraw action
 * Placeholder - full implementation in future phase
 */
export async function handleWithdraw(
  mgmtUrl: string,
  onComplete: () => void
): Promise<ActionResult> {
  // Placeholder - not yet implemented
  return {
    success: false,
    error: 'Withdrawal not yet implemented',
  };
}

/**
 * Handles the update pricing action
 * Placeholder - full implementation in future phase
 */
export async function handleUpdatePricing(
  mgmtUrl: string,
  onComplete: () => void
): Promise<ActionResult> {
  // Placeholder - not yet implemented
  return {
    success: false,
    error: 'Pricing update not yet implemented',
  };
}
