// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Clear-model-pricing command
 * Reverts a model to default host pricing
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';
import { validateModelString } from '../services/ModelRegistryClient';

export function registerClearModelPricingCommand(program: Command): void {
  program
    .command('clear-model-pricing')
    .description('Clear per-model pricing (revert to default host pricing)')
    .requiredOption('--model <modelString>', 'Model string in "repo:fileName" format')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        console.log(chalk.blue('\n🔄 Clearing Model Pricing...\n'));

        // Initialize SDK
        await initializeSDK('base-sepolia');
        await authenticateSDK(options.privateKey);

        const address = getAuthenticatedAddress();
        if (!address) {
          throw new Error('Failed to authenticate SDK');
        }

        // Validate model string
        const rpcUrl = options.rpcUrl || process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org';
        const validation = await validateModelString(rpcUrl, options.model);
        if (!validation.valid) {
          throw new Error(validation.error || 'Model validation failed');
        }

        const modelId = validation.modelId!;

        console.log(chalk.cyan(`📍 Address: ${address}`));
        console.log(chalk.cyan(`🎯 Model: ${options.model}`));

        // Get HostManager and verify registration
        const hostManager = getHostManager();
        const hostStatus = await hostManager.getHostStatus(address);
        if (!hostStatus.isRegistered || !hostStatus.isActive) {
          throw new Error('This address is not registered as a host node');
        }

        // Submit transaction
        console.log(chalk.blue('\n📝 Clearing model pricing...'));
        const txHash = await hostManager.clearModelPricing(modelId);

        console.log(chalk.green('\n✅ Successfully cleared model pricing!'));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));
        console.log(chalk.gray('Model will now use your default host pricing.'));

      } catch (error: any) {
        console.error(chalk.red('\n❌ Clear model pricing failed:'), error.message);

        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to clear model pricing'));
        } else if (error.message.includes('not approved')) {
          console.log(chalk.yellow('\nℹ️  The model must be approved in the ModelRegistry'));
        }

        process.exit(1);
      }
    });
}
