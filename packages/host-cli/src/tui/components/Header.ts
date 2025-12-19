// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Header Component
 * Formats and displays host information in the dashboard header
 */

/**
 * Truncates an Ethereum address to 0x1234...5678 format
 */
export function truncateAddress(address: string): string {
  if (!address || address.length <= 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a number with comma separators for thousands
 */
function formatNumber(value: string): string {
  const num = parseInt(value, 10);
  if (isNaN(num)) return value;
  return num.toLocaleString('en-US');
}

/**
 * Formats the dashboard header with host information
 */
export function formatHeader(
  hostAddress: string,
  chainName: string,
  stake: string
): string {
  const truncatedAddr = truncateAddress(hostAddress);
  const formattedStake = formatNumber(stake);
  return ` Host: ${truncatedAddr} | Chain: ${chainName} | Stake: ${formattedStake} FAB `;
}
