#!/usr/bin/env node
// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Standalone Dashboard Entry Point
 * Minimal entry that only loads dashboard - no sdk-core dependency
 */

import { Command } from 'commander';

const program = new Command();

program
  .name('fabstir-dashboard')
  .description('Fabstir Host Node Dashboard')
  .version('1.0.0');

program
  .command('dashboard')
  .description('Open interactive TUI dashboard for node monitoring')
  .option('--url <url>', 'Node URL (fabstir-llm-node)', 'http://localhost:8080')
  .option('--refresh-interval <ms>', 'Status refresh interval in milliseconds', '5000')
  .action(async (options) => {
    const { createDashboard } = await import('./tui/Dashboard.js');
    await createDashboard({
      nodeUrl: options.url,
      refreshInterval: parseInt(options.refreshInterval, 10),
    });
  });

// If no command specified, default to dashboard
if (process.argv.length === 2) {
  process.argv.push('dashboard');
}

program.parse();
