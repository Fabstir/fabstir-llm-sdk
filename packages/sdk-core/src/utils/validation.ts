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