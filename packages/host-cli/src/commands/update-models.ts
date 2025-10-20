// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import fs from 'fs';
import { initializeSDK, authenticateSDK, getHostManager, getAuthenticatedAddress } from '../sdk/client';

export function registerUpdateModelsCommand(program: Command): void {
  program
    .command('update-models')
    .description('Update supported models for your host node')
    .argument('[models...]', 'Model IDs to support (hex format)')
    .option('-f, --file <path>', 'Load model IDs from JSON file')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .option('--skip-validation', 'Skip model approval validation')
    .action(async (modelArgs: string[], options) => {
      try {
        console.log(chalk.blue('\n🔄 Updating supported models...\n'));

        // Initialize and authenticate SDK
        await initializeSDK('base-sepolia');
        await authenticateSDK(options.privateKey);

        const address = getAuthenticatedAddress();
        if (!address) {
          throw new Error('Failed to authenticate SDK');
        }

        console.log(chalk.cyan(`📍 Address: ${address}`));
        console.log(chalk.cyan(`🌐 Network: Base Sepolia`));

        // Get model IDs from arguments or file
        let modelIds: string[] = [];

        if (options.file) {
          // Load from file
          if (!fs.existsSync(options.file)) {
            throw new Error(`File not found: ${options.file}`);
          }

          try {
            const fileContent = fs.readFileSync(options.file, 'utf-8');
            modelIds = JSON.parse(fileContent);

            if (!Array.isArray(modelIds)) {
              throw new Error('File must contain a JSON array of model IDs');
            }
          } catch (e: any) {
            throw new Error(`Invalid JSON in file: ${e.message}`);
          }
        } else if (modelArgs && modelArgs.length > 0) {
          modelIds = modelArgs;
        } else {
          throw new Error('No models provided. Use arguments or --file option');
        }

        // Validate and format model IDs
        const formattedModelIds = modelIds.map(id => {
          // If it's already a hex string starting with 0x, use it
          if (id.startsWith('0x')) {
            // Ensure it's 32 bytes
            if (id.length !== 66) { // 0x + 64 hex chars
              // Pad with zeros if needed
              return ethers.zeroPadValue(id, 32);
            }
            return id;
          }
          // Otherwise, convert to bytes32
          return ethers.zeroPadValue(ethers.toBeHex(BigInt(id)), 32);
        });

        // Get HostManager from SDK
        const hostManager = getHostManager();

        // Check if the host is registered
        const hostStatus = await hostManager.getHostStatus(address);
        if (!hostStatus.isRegistered || !hostStatus.isActive) {
          throw new Error('This address is not registered as a host node');
        }

        // Get current models
        let currentModels: string[] = [];
        try {
          currentModels = await hostManager.getHostModels(address);
        } catch (e) {
          console.log(chalk.yellow('⚠️  Could not fetch current models'));
        }

        // Display current and new models
        if (currentModels.length > 0) {
          console.log(chalk.gray('\nCurrent models:'));
          currentModels.forEach((model, i) => {
            console.log(chalk.gray(`  ${i + 1}. ${model}`));
          });
        }

        console.log(chalk.cyan('\nNew models:'));
        formattedModelIds.forEach((model, i) => {
          console.log(chalk.cyan(`  ${i + 1}. ${model}`));
        });

        // Update the models using SDK
        console.log(chalk.blue('\n📝 Submitting transaction...'));
        const txHash = await hostManager.updateSupportedModels(formattedModelIds);

        console.log(chalk.cyan(`📋 Transaction hash: ${txHash}`));
        console.log(chalk.green('\n✅ Successfully updated supported models!'));
        console.log(chalk.cyan(`🔗 Transaction: ${txHash}`));
        console.log(chalk.green(`✓ Now supporting ${formattedModelIds.length} model(s)`));

        // Verify the update
        try {
          const updatedModels = await hostManager.getHostModels(address);
          console.log(chalk.gray('\nVerified models:'));
          updatedModels.forEach((model: string, i: number) => {
            console.log(chalk.green(`  ${i + 1}. ${model}`));
          });
        } catch (e) {
          // Verification might fail on older contracts
        }

      } catch (error: any) {
        console.error(chalk.red('\n❌ Update failed:'), error.message);

        // Check for specific revert reasons
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\nℹ️  You must be registered as a host to update models'));
        } else if (error.message.includes('not approved')) {
          console.log(chalk.yellow('\nℹ️  One or more models are not approved in the registry'));
        } else if (error.message.includes('insufficient')) {
          console.log(chalk.yellow('\nℹ️  Transaction failed due to insufficient gas'));
        }

        process.exit(1);
      }
    });
}