// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { SDKError } from '../errors';

/**
 * Validates if a string is a valid Ethereum address
 */
export function isValidAddress(address: any): boolean {
  if (typeof address !== 'string') return false;
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return false;
  return true;
}

/**
 * Checks if an address is the zero address
 */
export function isZeroAddress(address: string): boolean {
  if (!isValidAddress(address)) return false;
  return address === '0x0000000000000000000000000000000000000000' ||
         address === '0x' + '0'.repeat(40);
}

/**
 * Validates a contract address and throws appropriate errors
 */
export function validateContractAddress(address: any, contractName: string): void {
  // Check if address is provided (handle null, undefined, empty string)
  if (address === null || address === undefined || address === '') {
    throw new SDKError(
      `${contractName} contract address is required`,
      'CONFIG_MISSING_CONTRACT'
    );
  }

  // Check if address format is valid
  if (!isValidAddress(address)) {
    throw new SDKError(
      `Invalid ${contractName} contract address`,
      'CONFIG_INVALID_ADDRESS'
    );
  }

  // Check if address is not zero
  if (isZeroAddress(address)) {
    throw new SDKError(
      `${contractName} cannot be zero address`,
      'CONFIG_ZERO_ADDRESS'
    );
  }
}

/**
 * Validates all required contract addresses
 */
export function validateRequiredAddresses(addresses: Record<string, any>): void {
  const requiredContracts = [
    'jobMarketplace',
    'nodeRegistry',
    'proofSystem',
    'hostEarnings',
    'usdcToken'
  ];

  for (const contractName of requiredContracts) {
    validateContractAddress(addresses[contractName], contractName);
  }
}

/**
 * Validates optional contract addresses (if provided, must be valid)
 */
export function validateOptionalAddress(address: any, contractName: string): void {
  if (!address || address === '') {
    // Optional - no validation needed
    return;
  }

  // If provided, must be valid
  if (!isValidAddress(address)) {
    throw new SDKError(
      `Invalid ${contractName} contract address`,
      'CONFIG_INVALID_ADDRESS'
    );
  }

  // If provided, should not be zero (warning, but allow)
  if (isZeroAddress(address)) {
    console.warn(`Warning: ${contractName} is set to zero address`);
  }
}

/**
 * Validates RPC URL format
 */
export function validateRpcUrl(url: any): void {
  if (!url || url === '') {
    throw new SDKError('RPC URL is required', 'CONFIG_MISSING_RPC');
  }

  if (typeof url !== 'string') {
    throw new SDKError('RPC URL must be a string', 'CONFIG_INVALID_RPC');
  }

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
      throw new SDKError(
        'RPC URL must use http, https, ws, or wss protocol',
        'CONFIG_INVALID_RPC'
      );
    }
  } catch (e) {
    throw new SDKError('Invalid RPC URL format', 'CONFIG_INVALID_RPC');
  }
}

/**
 * Normalise a node endpoint to the http(s) BASE form the WS derivation in
 * `SessionManager.acquireSessionTransport` can convert: trailing slashes stripped, scheme
 * lower-cased. Returns `undefined` for anything else — no endpoint, a non-string, a non-http(s)
 * scheme, a `ws://` / `wss://` substring ANYWHERE (the derivation is case-sensitive and treats
 * that substring as "already a WS URL", passing it through verbatim), or a query / fragment
 * (the derivation appends `/v1/ws` AFTER it, so the socket would open at the node root). Every
 * one of those is a silent mistarget of a paid session. Shared by the LTX and training
 * existingSession paths and by `registerExternalSession` (Q8: ONE nodeHttpUrl serves both
 * postSessionAuth and the submit).
 */
export function normalizeNodeHttpUrl(endpoint: string | undefined): string | undefined {
  if (typeof endpoint !== 'string') return undefined;
  // Whitespace anywhere is a copy-paste fault, not something to trim silently: the derived socket URL
  // would be built from it ("wss://host /v1/ws") and fail as a retryable transport error for ever.
  if (/\s/.test(endpoint)) return undefined;
  const normalized = endpoint
    .replace(/\/+$/, '')
    .replace(/^(https?):\/\//i, (_m, scheme: string) => `${scheme.toLowerCase()}://`);
  if (!/^https?:\/\//.test(normalized) || normalized.includes('ws://') || normalized.includes('wss://')) {
    return undefined;
  }
  if (/[?#\\]/.test(normalized)) return undefined;
  // A plain host[:port] authority: userinfo makes browsers refuse the WebSocket outright.
  const authority = normalized.slice(normalized.indexOf('://') + 3).split('/')[0];
  if (authority.length === 0 || authority.includes('@')) return undefined;
  // A BASE, not an API path: the SDK appends /v1/ws (and /v1/session-auth) itself, so a value that already
  // ENDS in the API prefix or one of those paths would connect to /v1/ws/v1/ws — a 404 reported as a retryable
  // transport fault. A reverse proxy that mounts nodes under /v1/<name> is a legitimate base and stays accepted.
  if (/\/v1(\/(ws|session-auth))?$/i.test(normalized)) return undefined;
  return normalized;
}
