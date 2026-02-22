// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Set-model-pricing command
 * Sets per-model pricing for a specific model on the host
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';
import { validateModelString } from '../services/ModelRegistryClient';

const PRICE_PRECISION = 1000;

export function registerSetModelPricingCommand(program: Command): void {
  program
    .command('set-model-pricing')
    .description('Set per-model pricing for a specific model')
    .requiredOption('--model <modelString>', 'Model string in "repo:fileName" format')
    .requiredOption('--price <amount>', 'Price per million tokens')
    .option('--price-type <type>', 'Price type: usdc or eth', 'usdc')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        // Validate price
        const price = parseFloat(options.price);
        if (isNaN(price) || price <= 0 || price > 100000000) {
          throw new Error('Price must be between 0 (exclusive) and 100,000,000');
        }

        // Validate price type
        const priceType = options.priceType || 'usdc';
        if (priceType !== 'usdc' && priceType !== 'eth') {
          throw new Error('Price type must be "usdc" or "eth"');
        }

        console.log(chalk.blue('\n💰 Setting Model Pricing...\n'));

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
        console.log(chalk.cyan(`🔑 Model ID: ${modelId.slice(0, 10)}...`));

        // Get HostManager and verify registration
        const hostManager = getHostManager();
        const hostStatus = await hostManager.getHostStatus(address);
        if (!hostStatus.isRegistered || !hostStatus.isActive) {
          throw new Error('This address is not registered as a host node');
        }

        // Calculate price values
        let nativePrice = '0';
        let stablePrice = '0';

        if (priceType === 'usdc') {
          stablePrice = Math.round(price * PRICE_PRECISION).toString();
          console.log(chalk.cyan(`💵 USDC Price: $${price}/million tokens (contract value: ${stablePrice})`));
        } else {
          nativePrice = BigInt(Math.round(price * 1e9)).toString();
          console.log(chalk.cyan(`⛽ ETH Price: ${price} Gwei/million tokens (contract value: ${nativePrice} wei)`));
        }

        // Submit transaction
        console.log(chalk.blue('\n📝 Submitting transaction...'));
        const txHash = await hostManager.setModelPricing(modelId, nativePrice, stablePrice);

        console.log(chalk.green('\n✅ Successfully set model pricing!'));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));

      } catch (error: any) {
        console.error(chalk.red('\n❌ Set model pricing failed:'), error.message);

        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to set model pricing'));
        } else if (error.message.includes('not approved')) {
          console.log(chalk.yellow('\nℹ️  The model must be approved in the ModelRegistry'));
        }

        process.exit(1);
      }
    });
}
