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

// ERC20 ABI for FAB token
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.test');
dotenv.config({ path: envPath });

export function registerAddStakeCommand(program: Command): void {
  program
    .command('add-stake')
    .description('Add additional stake to your host node registration')
    .argument('<amount>', 'Amount of FAB tokens to add')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .option('--skip-approval', 'Skip token approval (if already approved)')
    .action(async (amountStr: string, options) => {
      try {
        // Validate amount
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) {
          throw new Error(`Invalid amount: ${amountStr}. Amount must be greater than 0`);
        }

        console.log(chalk.blue('\n💰 Adding stake to host node...\n'));

        // Get the wallet
        const wallet = await getWallet(options.privateKey);

        // Connect to provider
        const provider = new ethers.JsonRpcProvider(options.rpcUrl);
        const signer = wallet.connect(provider);
        const address = await signer.getAddress();

        console.log(chalk.cyan(`📍 Address: ${address}`));
        console.log(chalk.cyan(`🌐 Network: Base Sepolia`));

        // Get contract addresses
        const nodeRegistryAddress = process.env.CONTRACT_NODE_REGISTRY;
        const fabTokenAddress = process.env.CONTRACT_FAB_TOKEN;

        if (!nodeRegistryAddress || !fabTokenAddress) {
          throw new Error('Contract addresses not found in environment');
        }

        // Get contracts
        const nodeRegistry = new ethers.Contract(
          nodeRegistryAddress,
          NodeRegistryABI,
          signer
        );

        const fabToken = new ethers.Contract(
          fabTokenAddress,
          ERC20_ABI,
          signer
        );

        // Check if the node is registered
        const nodeInfo = await nodeRegistry.nodes(address);
        if (!nodeInfo.active) {
          throw new Error('This address is not registered as a host node');
        }

        // Convert amount to wei
        const amountWei = ethers.parseUnits(amountStr, 18);

        // Check FAB balance
        const fabBalance = await fabToken.balanceOf(address);
        if (fabBalance < amountWei) {
          throw new Error(
            `Insufficient FAB balance. Have: ${ethers.formatUnits(fabBalance, 18)} FAB, ` +
            `Need: ${amountStr} FAB`
          );
        }

        // Display current and new stake amounts
        const currentStake = ethers.formatUnits(nodeInfo.stakedAmount, 18);
        const newTotal = parseFloat(currentStake) + amount;

        console.log(chalk.gray(`\nCurrent stake: ${currentStake} FAB`));
        console.log(chalk.cyan(`Adding:        ${amountStr} FAB`));
        console.log(chalk.green(`New total:     ${newTotal} FAB`));

        // Check and handle token approval
        if (!options.skipApproval) {
          const currentAllowance = await fabToken.allowance(address, nodeRegistryAddress);

          if (currentAllowance < amountWei) {
            console.log(chalk.blue('\n📝 Approving FAB tokens...'));

            const approveTx = await fabToken.approve(nodeRegistryAddress, amountWei);
            console.log(chalk.cyan(`📋 Approval tx: ${approveTx.hash}`));

            const approveReceipt = await approveTx.wait(3);
            if (!approveReceipt || approveReceipt.status !== 1) {
              throw new Error('Token approval failed');
            }

            console.log(chalk.green('✓ Token approval successful'));
          } else {
            console.log(chalk.gray('✓ Sufficient token allowance exists'));
          }
        }

        // Add the stake
        console.log(chalk.blue('\n📝 Adding stake...'));
        const tx = await nodeRegistry.stake(amountWei);

        console.log(chalk.cyan(`📋 Transaction hash: ${tx.hash}`));
        console.log(chalk.blue('⏳ Waiting for confirmation...'));

        const receipt = await tx.wait(3);

        if (receipt && receipt.status === 1) {
          console.log(chalk.green('\n✅ Successfully added stake!'));
          console.log(chalk.cyan(`🔗 Transaction: ${receipt.hash}`));

          // Verify the new stake amount
          const updatedNodeInfo = await nodeRegistry.nodes(address);
          const newStake = ethers.formatUnits(updatedNodeInfo.stakedAmount, 18);
          console.log(chalk.green(`✓ New stake amount: ${newStake} FAB`));

          // Show remaining FAB balance
          const newFabBalance = await fabToken.balanceOf(address);
          console.log(chalk.gray(`💳 Remaining FAB balance: ${ethers.formatUnits(newFabBalance, 18)} FAB`));
        } else {
          throw new Error('Transaction failed');
        }

      } catch (error: any) {
        console.error(chalk.red('\n❌ Add stake failed:'), error.message);

        // Check for specific revert reasons
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to add stake'));
        } else if (error.message.includes('Insufficient')) {
          console.log(chalk.yellow('\nℹ️  You need more FAB tokens to add this stake'));
        } else if (error.message.includes('allowance')) {
          console.log(chalk.yellow('\nℹ️  Token approval required. Try without --skip-approval'));
        } else if (error.message.includes('insufficient funds')) {
          console.log(chalk.yellow('\nℹ️  Insufficient gas (ETH) for transaction'));
        }

        process.exit(1);
      }
    });
}