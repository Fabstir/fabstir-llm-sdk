// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Update-pricing command
 * Phase 18: Deprecated — per-host base pricing replaced by per-model per-token pricing.
 * Redirects users to set-model-pricing command.
 */

import { Command } from 'commander';
import chalk from 'chalk';

export function registerUpdatePricingCommand(program: Command): void {
  program
    .command('update-pricing')
    .description('[Deprecated] Use set-model-pricing instead (Phase 18: all pricing is per-model per-token)')
    .requiredOption('--price <amount>', 'New minimum price per token')
    .option('-k, --private-key <key>', 'Private key to use')
    .option('-r, --rpc-url <url>', 'RPC URL')
    .action(async () => {
      console.error(chalk.red('\n❌ update-pricing is deprecated (Phase 18).\n'));
      console.log(chalk.yellow('Per-host base pricing has been replaced by per-model per-token pricing.'));
      console.log(chalk.cyan('\nUse instead:'));
      console.log(chalk.cyan('  fabstir-host set-model-pricing --model "repo:file" --price 5.00 --price-type usdc'));
      console.log(chalk.cyan('  fabstir-host set-model-pricing --model "repo:file" --price 0.5 --price-type eth'));
      process.exit(1);
    });
}
