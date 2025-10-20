// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test'
    }
  }
});