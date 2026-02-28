// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Clear-model-pricing command
 * Phase 18: Clears per-model per-token pricing for a specific model
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';
import { validateModelString } from '../services/ModelRegistryClient';

export function registerClearModelPricingCommand(program: Command): void {
  program
    .command('clear-model-pricing')
    .description('Clear per-model pricing for a specific token type')
    .requiredOption('--model <modelString>', 'Model string in "repo:fileName" format')
    .option('--price-type <type>', 'Price type to clear: usdc, eth, or all', 'all')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        const priceType = options.priceType || 'all';
        if (!['usdc', 'eth', 'all'].includes(priceType)) {
          throw new Error('Price type must be "usdc", "eth", or "all"');
        }

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
        console.log(chalk.cyan(`🏷️  Clearing: ${priceType} pricing`));

        // Get HostManager and verify registration
        const hostManager = getHostManager();
        const hostStatus = await hostManager.getHostStatus(address);
        if (!hostStatus.isRegistered || !hostStatus.isActive) {
          throw new Error('This address is not registered as a host node');
        }

        // Phase 18: Clear per-token — must be called separately for each token
        const nativeToken = '0x0000000000000000000000000000000000000000';

        if (priceType === 'usdc' || priceType === 'all') {
          const usdcAddr = process.env.USDC_TOKEN;
          if (!usdcAddr) throw new Error('USDC_TOKEN not set');
          console.log(chalk.blue('\n📝 Clearing USDC pricing...'));
          const txHash = await hostManager.clearModelTokenPricing(modelId, usdcAddr);
          console.log(chalk.green(`✅ USDC pricing cleared! Tx: ${txHash}`));
        }

        if (priceType === 'eth' || priceType === 'all') {
          console.log(chalk.blue('\n📝 Clearing ETH pricing...'));
          const txHash = await hostManager.clearModelTokenPricing(modelId, nativeToken);
          console.log(chalk.green(`✅ ETH pricing cleared! Tx: ${txHash}`));
        }

        console.log(chalk.green('\n✅ Successfully cleared model pricing!'));

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
