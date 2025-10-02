import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';

export function registerUnregisterCommand(program: Command): void {
  const cmd = program
    .command('unregister')
    .description('Unregister as a host node and recover staked FAB tokens')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        console.log(chalk.blue('\n🔓 Unregistering host node...\n'));

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
          console.log(chalk.yellow('⚠️  Node is not currently registered'));
          return;
        }

        const stakedAmount = ethers.formatUnits(hostStatus.stake, 18);
        console.log(chalk.cyan(`💰 Current staked amount: ${stakedAmount} FAB`));

        // Unregister the host using SDK
        console.log(chalk.blue('\n📝 Submitting unregister transaction...'));
        const txHash = await hostManager.unregisterHost();

        console.log(chalk.cyan(`📋 Transaction hash: ${txHash}`));
        console.log(chalk.green('\n✅ Successfully unregistered!'));
        console.log(chalk.green(`💸 Recovered ${stakedAmount} FAB tokens`));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));

        // Verify the host is now inactive
        const updatedStatus = await hostManager.getHostStatus(address);
        if (!updatedStatus.isActive) {
          console.log(chalk.green('✓ Node status: Inactive'));
        }

      } catch (error: any) {
        console.error(chalk.red('\n❌ Unregister failed:'), error.message);

        // Check for specific revert reasons
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  This address is not registered as a host node'));
        } else if (error.message.includes('insufficient')) {
          console.log(chalk.yellow('\nℹ️  Transaction failed due to insufficient gas'));
        }

        process.exit(1);
      }
    });
}