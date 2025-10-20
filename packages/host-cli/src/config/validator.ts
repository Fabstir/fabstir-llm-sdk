// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { isAddress } from 'ethers';
import { ConfigData, ValidationResult, PartialConfig } from './types';

export function validateConfig(config: ConfigData): ValidationResult {
  const errors: string[] = [];

  // Check required fields
  const requiredFields: (keyof ConfigData)[] = [
    'version', 'walletAddress', 'network', 'rpcUrl',
    'inferencePort', 'publicUrl', 'models', 'pricePerToken', 'minSessionDeposit'
  ];

  for (const field of requiredFields) {
    if (!config[field] && config[field] !== 0) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Validate wallet address
  if (config.walletAddress && !isValidAddress(config.walletAddress)) {
    errors.push('Invalid wallet address format');
  }

  // Validate network
  if (config.network && !['base-mainnet', 'base-sepolia'].includes(config.network)) {
    errors.push('Invalid network selection');
  }

  // Validate RPC URL
  if (config.rpcUrl && !isValidUrl(config.rpcUrl)) {
    errors.push('Invalid RPC URL format');
  }

  // Validate port
  if (config.inferencePort && !isValidPort(config.inferencePort)) {
    errors.push('Invalid port number');
  }

  // Validate public URL
  if (config.publicUrl && !isValidUrl(config.publicUrl)) {
    errors.push('Invalid public URL format');
  }

  // Validate models
  if (config.models && config.models.length === 0) {
    errors.push('At least one model must be configured');
  }

  // Validate prices
  if (config.pricePerToken !== undefined && config.pricePerToken < 0) {
    errors.push('Price per token must be positive');
  }

  if (config.minSessionDeposit !== undefined && config.minSessionDeposit < 0) {
    errors.push('Minimum session deposit must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validatePartial(config: PartialConfig): ValidationResult {
  const errors: string[] = [];

  // Only validate fields that are present
  if (config.walletAddress !== undefined && !isValidAddress(config.walletAddress)) {
    errors.push('Invalid wallet address format');
  }

  if (config.network !== undefined && !['base-mainnet', 'base-sepolia'].includes(config.network)) {
    errors.push('Invalid network selection');
  }

  if (config.rpcUrl !== undefined && !isValidUrl(config.rpcUrl)) {
    errors.push('Invalid RPC URL format');
  }

  if (config.inferencePort !== undefined && !isValidPort(config.inferencePort)) {
    errors.push('Invalid port number');
  }

  if (config.publicUrl !== undefined && !isValidUrl(config.publicUrl)) {
    errors.push('Invalid public URL format');
  }

  if (config.models !== undefined && config.models.length === 0) {
    errors.push('At least one model must be configured');
  }

  if (config.pricePerToken !== undefined && config.pricePerToken < 0) {
    errors.push('Price per token must be positive');
  }

  if (config.minSessionDeposit !== undefined && config.minSessionDeposit < 0) {
    errors.push('Minimum session deposit must be positive');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function isValidPort(port: number): boolean {
  return port > 0 && port <= 65535;
}

export function isValidAddress(address: string): boolean {
  return isAddress(address);
}