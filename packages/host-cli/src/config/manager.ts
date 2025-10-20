// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import inquirer from 'inquirer';
import { ConfigData } from './types';
import * as ConfigValidator from './validator';

export async function updateConfig(
  config: ConfigData,
  key: string,
  value: string
): Promise<ConfigData> {
  const updated = { ...config };

  // Parse the value based on the key
  const parsedValue = parseValue(key, value);

  // Set the value using path notation
  setNestedValue(updated, key, parsedValue);

  // Validate the updated config
  const validation = ConfigValidator.validatePartial({ [key]: parsedValue });
  if (!validation.isValid) {
    throw new Error(validation.errors[0] || `Invalid value for ${key}`);
  }

  return updated;
}

export async function confirmReset(): Promise<boolean> {
  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Are you sure you want to reset the configuration? This cannot be undone.',
      default: false
    }
  ]);

  return confirm;
}

function parseValue(key: string, value: string): any {
  // Try to parse as JSON first (for arrays and objects)
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      // If JSON parse fails, treat as string
      return value;
    }
  }

  // Handle specific keys
  switch (key) {
    case 'inferencePort':
      return parseInt(value, 10);

    case 'pricePerToken':
    case 'minSessionDeposit':
      return parseFloat(value);

    case 'models':
      // Allow comma-separated values for models
      if (!value.startsWith('[')) {
        return value.split(',').map(s => s.trim());
      }
      return value;

    case 'network':
      // Validate network value
      if (!['base-mainnet', 'base-sepolia'].includes(value)) {
        throw new Error(`Invalid network: ${value}. Must be base-mainnet or base-sepolia`);
      }
      return value;

    default:
      // For boolean-like values
      if (value === 'true') return true;
      if (value === 'false') return false;

      // Try to parse as number if it looks like one
      if (/^\d+$/.test(value)) {
        return parseInt(value, 10);
      }
      if (/^\d+\.\d+$/.test(value)) {
        return parseFloat(value);
      }

      return value;
  }
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    // Handle array indices
    if (/^\d+$/.test(keys[i + 1])) {
      if (!Array.isArray(current[key])) {
        current[key] = [];
      }
    } else {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
    }

    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (/^\d+$/.test(lastKey)) {
    current[parseInt(lastKey)] = value;
  } else {
    current[lastKey] = value;
  }
}

export async function mergeConfigs(
  base: ConfigData,
  override: Partial<ConfigData>
): Promise<ConfigData> {
  const merged = { ...base, ...override };

  // Validate the merged config
  const validation = ConfigValidator.validateConfig(merged);
  if (!validation.isValid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }

  return merged;
}