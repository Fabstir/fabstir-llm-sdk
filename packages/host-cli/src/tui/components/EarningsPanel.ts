// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * EarningsPanel Component
 * Formats host earnings for display in the dashboard
 */

import { EarningsData } from '../types.js';

/**
 * Formats earnings data for display in the earnings panel
 * @param earnings The earnings data or null
 * @param hostAddress The host's wallet address (for display)
 * @returns Formatted string for the panel
 */
export function formatEarningsPanel(
  earnings: EarningsData | null,
  hostAddress?: string
): string {
  if (!earnings) {
    return 'Unable to fetch earnings\n\nSet HOST_PRIVATE_KEY\nenvironment variable';
  }

  const ethNum = parseFloat(earnings.eth);
  const usdcNum = parseFloat(earnings.usdc);

  if (ethNum === 0 && usdcNum === 0) {
    const lines = ['No earnings yet', '', 'Complete jobs to', 'earn rewards'];
    if (hostAddress) {
      lines.push('', `Host: ${hostAddress.slice(0, 6)}...${hostAddress.slice(-4)}`);
    }
    return lines.join('\n');
  }

  // Format with appropriate decimal places
  const ethFormatted = ethNum < 0.0001 ? ethNum.toExponential(2) : ethNum.toFixed(6);
  const usdcFormatted = usdcNum.toFixed(2);

  const lines: string[] = ['Available Balance', ''];

  if (ethNum > 0) {
    lines.push(`ETH:  ${ethFormatted}`);
  }
  if (usdcNum > 0) {
    lines.push(`USDC: $${usdcFormatted}`);
  }
  if (ethNum === 0 && usdcNum === 0) {
    lines.push('(empty)');
  }

  lines.push('', '[W] to withdraw');

  return lines.join('\n');
}
