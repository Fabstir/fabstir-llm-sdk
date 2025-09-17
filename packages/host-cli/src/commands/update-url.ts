import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { getWallet } from '../utils/wallet';

// Load NodeRegistry ABI - read from file system
const abiPath = path.resolve(__dirname, '../../../sdk-core/src/contracts/abis/NodeRegistry.json');
const NodeRegistryABI = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.test');
dotenv.config({ path: envPath });

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

        // Get the wallet
        const wallet = await getWallet(options.privateKey);

        // Connect to provider
        const provider = new ethers.JsonRpcProvider(options.rpcUrl);
        const signer = wallet.connect(provider);
        const address = await signer.getAddress();

        console.log(chalk.cyan(`📍 Address: ${address}`));
        console.log(chalk.cyan(`🌐 Network: Base Sepolia`));

        // Get NodeRegistry contract
        const nodeRegistryAddress = process.env.CONTRACT_NODE_REGISTRY;
        if (!nodeRegistryAddress) {
          throw new Error('CONTRACT_NODE_REGISTRY not found in environment');
        }

        const nodeRegistry = new ethers.Contract(
          nodeRegistryAddress,
          NodeRegistryABI,
          signer
        );

        // Check if the node is registered
        const nodeInfo = await nodeRegistry.nodes(address);
        if (!nodeInfo.active) {
          throw new Error('This address is not registered as a host node');
        }

        // Display current and new URLs
        console.log(chalk.gray(`\nCurrent URL: ${nodeInfo.apiUrl}`));
        console.log(chalk.cyan(`New URL:     ${url}`));

        // Update the API URL
        console.log(chalk.blue('\n📝 Submitting transaction...'));
        const tx = await nodeRegistry.updateApiUrl(url);

        console.log(chalk.cyan(`📋 Transaction hash: ${tx.hash}`));
        console.log(chalk.blue('⏳ Waiting for confirmation...'));

        const receipt = await tx.wait(3);

        if (receipt && receipt.status === 1) {
          console.log(chalk.green('\n✅ Successfully updated API URL!'));
          console.log(chalk.cyan(`🔗 Transaction: ${receipt.hash}`));

          // Verify the update
          const updatedNodeInfo = await nodeRegistry.nodes(address);
          console.log(chalk.green(`✓ New URL: ${updatedNodeInfo.apiUrl}`));
        } else {
          throw new Error('Transaction failed');
        }

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