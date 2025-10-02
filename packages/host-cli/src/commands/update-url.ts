import { Command } from 'commander';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';

export function registerUpdateUrlCommand(program: Command): void {
  program
    .command('update-url')
    .description('Update the API URL for your host node')
    .argument('<url>', 'New API URL')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (url: string, options) => {
      try {
        // Validate URL format
        try {
          new URL(url);
        } catch (e) {
          throw new Error(`Invalid URL format: ${url}`);
        }

        console.log(chalk.blue('\n🔄 Updating API URL...\n'));

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

        // Display current and new URLs
        console.log(chalk.gray(`\nCurrent URL: ${hostStatus.apiUrl || 'Not set'}`));
        console.log(chalk.cyan(`New URL:     ${url}`));

        // Update the API URL using SDK
        console.log(chalk.blue('\n📝 Submitting transaction...'));
        const txHash = await hostManager.updateApiUrl(url);

        console.log(chalk.cyan(`📋 Transaction hash: ${txHash}`));
        console.log(chalk.green('\n✅ Successfully updated API URL!'));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));

        // Verify the update
        const updatedStatus = await hostManager.getHostStatus(address);
        console.log(chalk.green(`✓ New URL: ${updatedStatus.apiUrl}`));

      } catch (error: any) {
        console.error(chalk.red('\n❌ Update failed:'), error.message);

        // Check for specific revert reasons
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to update your API URL'));
        } else if (error.message.includes('insufficient')) {
          console.log(chalk.yellow('\nℹ️  Transaction failed due to insufficient gas'));
        }

        process.exit(1);
      }
    });
}