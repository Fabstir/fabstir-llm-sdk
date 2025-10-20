// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { ConfigData } from './types';
import * as ConfigValidator from './validator';

const ENV_PREFIX = 'FABSTIR_';

const ENV_MAPPING: Record<string, keyof ConfigData> = {
  [`${ENV_PREFIX}NETWORK`]: 'network',
  [`${ENV_PREFIX}RPC_URL`]: 'rpcUrl',
  [`${ENV_PREFIX}INFERENCE_PORT`]: 'inferencePort',
  [`${ENV_PREFIX}PUBLIC_URL`]: 'publicUrl',
  [`${ENV_PREFIX}MODELS`]: 'models',
  [`${ENV_PREFIX}PRICE_PER_TOKEN`]: 'pricePerToken',
  [`${ENV_PREFIX}MIN_SESSION_DEPOSIT`]: 'minSessionDeposit'
};

export function applyEnvOverrides(config: ConfigData): ConfigData {
  const overridden = { ...config };

  for (const [envKey, configKey] of Object.entries(ENV_MAPPING)) {
    const envValue = process.env[envKey];
    if (!envValue) continue;

    // Skip wallet address for security
    if (configKey === 'walletAddress') continue;

    const parsedValue = parseEnvValue(configKey, envValue);
    if (parsedValue !== undefined && validateEnvValue(configKey, envValue)) {
      (overridden as any)[configKey] = parsedValue;
    }
  }

  return overridden;
}

export function getEnvMapping(): Record<string, string> {
  return { ...ENV_MAPPING };
}

export function validateEnvValue(key: string, value: string): boolean {
  switch (key) {
    case 'network':
      return ['base-mainnet', 'base-sepolia'].includes(value);

    case 'inferencePort':
      const port = parseInt(value, 10);
      return !isNaN(port) && ConfigValidator.isValidPort(port);

    case 'rpcUrl':
    case 'publicUrl':
      return ConfigValidator.isValidUrl(value);

    case 'pricePerToken':
    case 'minSessionDeposit':
      const num = parseFloat(value);
      return !isNaN(num) && num > 0;

    case 'models':
      return true; // Array values are always valid

    default:
      return true;
  }
}

export function exportEnvTemplate(config: ConfigData): string {
  const lines: string[] = [
    '# Fabstir Host Configuration',
    '# Copy this file to .env and update values as needed',
    '',
    '# Network: base-mainnet or base-sepolia',
    `${ENV_PREFIX}NETWORK=${config.network}`,
    '',
    '# RPC URL for blockchain connection',
    `${ENV_PREFIX}RPC_URL=${config.rpcUrl}`,
    '',
    '# Port for inference service',
    `${ENV_PREFIX}INFERENCE_PORT=${config.inferencePort}`,
    '',
    '# Public URL for host',
    `${ENV_PREFIX}PUBLIC_URL=${config.publicUrl}`,
    '',
    '# Supported models (comma-separated)',
    `${ENV_PREFIX}MODELS=${config.models.join(',')}`,
    '',
    '# Pricing configuration',
    `${ENV_PREFIX}PRICE_PER_TOKEN=${config.pricePerToken}`,
    `${ENV_PREFIX}MIN_SESSION_DEPOSIT=${config.minSessionDeposit}`
  ];

  return lines.join('\n');
}

function parseEnvValue(key: keyof ConfigData, value: string): any {
  switch (key) {
    case 'inferencePort':
      const port = parseInt(value, 10);
      return isNaN(port) ? undefined : port;

    case 'pricePerToken':
    case 'minSessionDeposit':
      const num = parseFloat(value);
      return isNaN(num) ? undefined : num;

    case 'models':
      return value.split(',').map(s => s.trim()).filter(s => s);

    case 'network':
      return ['base-mainnet', 'base-sepolia'].includes(value) ? value : undefined;

    default:
      return value;
  }
}