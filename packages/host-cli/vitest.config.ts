// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import path from 'path';

// Load .env.test and map token variable names to match host node's .env convention
const envResult = config({ path: path.resolve(__dirname, '../../.env.test') });
const envVars: Record<string, string> = { NODE_ENV: 'test' };
if (envResult.parsed) {
  Object.assign(envVars, envResult.parsed);
  // Map CONTRACT_*_TOKEN → *_TOKEN to match host node .env convention
  if (envResult.parsed.CONTRACT_FAB_TOKEN) {
    envVars.FAB_TOKEN = envResult.parsed.CONTRACT_FAB_TOKEN;
  }
  if (envResult.parsed.CONTRACT_USDC_TOKEN) {
    envVars.USDC_TOKEN = envResult.parsed.CONTRACT_USDC_TOKEN;
  }
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: envVars
  }
});