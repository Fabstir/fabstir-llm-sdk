/**
 * Update-pricing command
 * Updates the minimum price per token for the host
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';

export function registerUpdatePricingCommand(program: Command): void {
  program
    .command('update-pricing')
    .description('Update minimum price per token for your host')
    .requiredOption('--price <amount>', 'New minimum price per token (100-100,000)')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        // Validate price format
        const newPrice = parseInt(options.price);
        if (isNaN(newPrice)) {
          throw new Error(`Invalid price format: ${options.price}. Must be a number.`);
        }

        // Validate price range (will also be validated by SDK)
        if (newPrice < 100 || newPrice > 100000) {
          throw new Error(`Price must be between 100 and 100,000. Got: ${newPrice}`);
        }

        console.log(chalk.blue('\n💰 Updating Host Pricing...\n'));

        // Initialize and authenticate SDK
        await initializeSDK('base-sepolia');
        await authenticateSDK(options.privateKey);

        const address = getAuthenticatedAddress();
        if (!address) {
          throw new Error('Failed to authenticate SDK');
        }

        console.log(chalk.cyan(`📍 Address: ${address}`));
        console.log(chalk.cyan(`🌐 Network: Base Sepolia`));

        // Get HostManager from SDK
        const hostManager = getHostManager();

        // Check if the host is registered
        const hostStatus = await hostManager.getHostStatus(address);
        if (!hostStatus.isRegistered || !hostStatus.isActive) {
          throw new Error('This address is not registered as a host node');
        }

        // Get current pricing
        const hostInfo = await hostManager.getHostInfo(address);
        const currentPrice = Number(hostInfo.minPricePerToken || 0n);

        // Display current and new pricing
        const currentPriceUSDC = (currentPrice / 1000000).toFixed(6);
        const newPriceUSDC = (newPrice / 1000000).toFixed(6);

        console.log(chalk.gray(`\nCurrent price: ${currentPrice} (${currentPriceUSDC} USDC/token)`));
        console.log(chalk.cyan(`New price:     ${newPrice} (${newPriceUSDC} USDC/token)`));

        // Update pricing using SDK
        console.log(chalk.blue('\n📝 Submitting transaction...'));
        const txHash = await hostManager.updatePricing(options.price);

        console.log(chalk.cyan(`📋 Transaction hash: ${txHash}`));
        console.log(chalk.green('\n✅ Successfully updated pricing!'));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));

        // Verify the update
        const updatedInfo = await hostManager.getHostInfo(address);
        const updatedPrice = Number(updatedInfo.minPricePerToken);
        const updatedPriceUSDC = (updatedPrice / 1000000).toFixed(6);
        console.log(chalk.green(`✓ New price: ${updatedPrice} (${updatedPriceUSDC} USDC/token)`));

      } catch (error: any) {
        console.error(chalk.red('\n❌ Update failed:'), error.message);

        // Check for specific error types
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to update pricing'));
        } else if (error.message.includes('between 100 and 100')) {
          console.log(chalk.yellow('\nℹ️  Price must be between 100 and 100,000'));
        } else if (error.message.includes('insufficient')) {
          console.log(chalk.yellow('\nℹ️  Transaction failed due to insufficient gas'));
        }

        process.exit(1);
      }
    });
}
