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
 * Handles the withdraw action
 * Placeholder - full implementation in future phase
 */
export async function handleWithdraw(
  nodeUrl: string,
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
  nodeUrl: string,
  onComplete: () => void
): Promise<ActionResult> {
  // Placeholder - not yet implemented
  return {
    success: false,
    error: 'Pricing update not yet implemented',
  };
}
