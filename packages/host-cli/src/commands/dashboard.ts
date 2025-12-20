// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Dashboard Command
 * Opens interactive TUI dashboard for node management
 */

import { Command } from 'commander';

export interface DashboardOptions {
  url: string;
  refreshInterval: string;
}

export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('Open interactive TUI dashboard for node management')
    .option(
      '--url <url>',
      'Node URL (fabstir-llm-node)',
      'http://localhost:8080'
    )
    .option(
      '--refresh-interval <ms>',
      'Status refresh interval in milliseconds',
      '5000'
    )
    .action(async (options: DashboardOptions) => {
      // Import dynamically to avoid loading blessed on every CLI invocation
      const { createDashboard } = await import('../tui/Dashboard');
      await createDashboard({
        nodeUrl: options.url,
        refreshInterval: parseInt(options.refreshInterval, 10),
      });
    });
}
