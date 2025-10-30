// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// Load environment variables from .env.test
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envPath = join(__dirname, '../../../.env.test');
  const envFile = readFileSync(envPath, 'utf-8');

  envFile.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim();
        // Remove quotes if present
        const cleanValue = value.replace(/^["']|["']$/g, '');
        process.env[key.trim()] = cleanValue;
      }
    }
  });
  console.log('✓ Loaded environment variables from .env.test');
} catch (error) {
  console.warn('⚠️  Could not load .env.test:', error);
}

