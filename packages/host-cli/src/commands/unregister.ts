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

export function registerUnregisterCommand(program: Command): void {
  const cmd = program
    .command('unregister')
    .description('Unregister as a host node and recover staked FAB tokens')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .action(async (options) => {
      try {
        console.log(chalk.blue('\n🔓 Unregistering host node...\n'));

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
          console.log(chalk.yellow('⚠️  Node is not currently registered'));
          return;
        }

        const stakedAmount = ethers.formatUnits(nodeInfo.stakedAmount, 18);
        console.log(chalk.cyan(`💰 Current staked amount: ${stakedAmount} FAB`));

        // Unregister the node
        console.log(chalk.blue('\n📝 Submitting unregister transaction...'));
        const tx = await nodeRegistry.unregisterNode();

        console.log(chalk.cyan(`📋 Transaction hash: ${tx.hash}`));
        console.log(chalk.blue('⏳ Waiting for confirmation...'));

        const receipt = await tx.wait(3);

        if (receipt && receipt.status === 1) {
          console.log(chalk.green('\n✅ Successfully unregistered!'));
          console.log(chalk.green(`💸 Recovered ${stakedAmount} FAB tokens`));
          console.log(chalk.cyan(`🔗 Transaction: ${receipt.hash}`));

          // Verify the node is now unregistered
          const updatedNodeInfo = await nodeRegistry.nodes(address);
          if (!updatedNodeInfo.active) {
            console.log(chalk.green('✓ Node status: Inactive'));
          }
        } else {
          throw new Error('Transaction failed');
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