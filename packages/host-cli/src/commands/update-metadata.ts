// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import inquirer from 'inquirer';
import { getWallet } from '../utils/wallet';
import {
  validateMetadata,
  mergeMetadata,
  HostMetadata,
  MetadataValidationError
} from '../utils/metadata-validator';
import { getTemplate, listTemplates, getTemplateDescription } from '../templates/metadata-templates';

// Load NodeRegistry ABI - read from file system
const abiPath = path.resolve(__dirname, '../../../sdk-core/src/contracts/abis/NodeRegistry.json');
const NodeRegistryABI = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.test');
dotenv.config({ path: envPath });

async function loadMetadataFromOptions(options: any): Promise<HostMetadata | null> {
  // Priority: file > json > template > interactive
  if (options.file) {
    if (!fs.existsSync(options.file)) {
      throw new Error(`File not found: ${options.file}`);
    }
    const content = fs.readFileSync(options.file, 'utf-8');
    return JSON.parse(content);
  }

  if (options.json) {
    return JSON.parse(options.json);
  }

  if (options.template) {
    const template = getTemplate(options.template);
    if (!template) {
      const available = listTemplates().join(', ');
      throw new Error(`Template not found: ${options.template}. Available: ${available}`);
    }
    return template;
  }

  if (options.interactive) {
    return await interactiveMetadataBuilder();
  }

  return null;
}

async function interactiveMetadataBuilder(): Promise<HostMetadata> {
  console.log(chalk.blue('\n📝 Interactive Metadata Builder\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Host name:',
      validate: (input) => input.trim().length > 0 || 'Name is required'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Host description:',
      validate: (input) => input.trim().length > 0 || 'Description is required'
    },
    {
      type: 'input',
      name: 'location',
      message: 'Location (optional):',
      default: ''
    },
    {
      type: 'number',
      name: 'costPerToken',
      message: 'Cost per token (optional, e.g., 0.0001):',
      default: 0
    },
    {
      type: 'number',
      name: 'minJobDeposit',
      message: 'Minimum job deposit (optional):',
      default: 0
    },
    {
      type: 'confirm',
      name: 'addContact',
      message: 'Add contact information?',
      default: false
    }
  ]);

  const metadata: HostMetadata = {
    name: answers.name,
    description: answers.description
  };

  if (answers.location) metadata.location = answers.location;
  if (answers.costPerToken > 0) metadata.costPerToken = answers.costPerToken;
  if (answers.minJobDeposit > 0) metadata.minJobDeposit = answers.minJobDeposit;

  if (answers.addContact) {
    const contact = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: 'Email (optional):',
        default: ''
      },
      {
        type: 'input',
        name: 'discord',
        message: 'Discord (optional):',
        default: ''
      }
    ]);

    if (contact.email || contact.discord) {
      metadata.contact = {};
      if (contact.email) metadata.contact.email = contact.email;
      if (contact.discord) metadata.contact.discord = contact.discord;
    }
  }

  return metadata;
}

export function registerUpdateMetadataCommand(program: Command): void {
  program
    .command('update-metadata')
    .description('Update host metadata on-chain')
    .option('-f, --file <path>', 'Load metadata from JSON file')
    .option('-j, --json <string>', 'Inline JSON metadata')
    .option('-i, --interactive', 'Interactive mode to build metadata')
    .option('-t, --template <name>', 'Use a template (basic, professional, minimal)')
    .option('--merge', 'Merge with existing metadata instead of replace')
    .option('-k, --private-key <key>', 'Private key to use (otherwise uses wallet file)')
    .option('-r, --rpc-url <url>', 'RPC URL', process.env.RPC_URL_BASE_SEPOLIA)
    .option('--skip-preview', 'Skip preview confirmation')
    .action(async (options) => {
      try {
        console.log(chalk.blue('\\n🔄 Updating host metadata...\\n'));

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

        // Parse current metadata
        let currentMetadata: any = {};
        try {
          if (nodeInfo.metadata && nodeInfo.metadata !== '{}') {
            currentMetadata = JSON.parse(nodeInfo.metadata);
          }
        } catch (e) {
          console.log(chalk.yellow('⚠️  Could not parse existing metadata'));
        }

        // Show current metadata
        if (Object.keys(currentMetadata).length > 0) {
          console.log(chalk.gray('\\nCurrent metadata:'));
          console.log(chalk.gray(JSON.stringify(currentMetadata, null, 2)));
        }

        // Load new metadata
        const newMetadata = await loadMetadataFromOptions(options);
        if (!newMetadata) {
          throw new Error('No metadata provided. Use -f, -j, -t, or -i option');
        }

        // Merge or replace
        let finalMetadata: HostMetadata;
        if (options.merge && Object.keys(currentMetadata).length > 0) {
          finalMetadata = mergeMetadata(currentMetadata, newMetadata);
          console.log(chalk.blue('\\n📊 Merging with existing metadata...'));
        } else {
          finalMetadata = newMetadata;
          console.log(chalk.blue('\\n🔄 Replacing metadata...'));
        }

        // Validate metadata
        try {
          finalMetadata = validateMetadata(finalMetadata);
        } catch (error: any) {
          if (error instanceof MetadataValidationError) {
            throw new Error(`Validation error: ${error.message}`);
          }
          throw error;
        }

        // Show preview
        console.log(chalk.cyan('\\nNew metadata:'));
        console.log(chalk.cyan(JSON.stringify(finalMetadata, null, 2)));

        // Confirm unless skipped
        if (!options.skipPreview) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Proceed with metadata update?',
              default: true
            }
          ]);

          if (!confirm) {
            console.log(chalk.yellow('\\n⚠️  Update cancelled'));
            return;
          }
        }

        // Convert to JSON string for contract
        const metadataStr = JSON.stringify(finalMetadata);

        // Submit transaction
        console.log(chalk.blue('\\n📝 Submitting transaction...'));
        const tx = await nodeRegistry.updateMetadata(metadataStr);

        console.log(chalk.cyan(`📋 Transaction hash: ${tx.hash}`));
        console.log(chalk.blue('⏳ Waiting for confirmation...'));

        const receipt = await tx.wait(3);

        if (receipt && receipt.status === 1) {
          console.log(chalk.green('\\n✅ Successfully updated metadata!'));
          console.log(chalk.cyan(`🔗 Transaction: ${receipt.hash}`));

          // Verify the update
          const updatedNodeInfo = await nodeRegistry.nodes(address);
          try {
            const verifiedMetadata = JSON.parse(updatedNodeInfo.metadata);
            console.log(chalk.green('\\n✓ Metadata verified on-chain'));
            console.log(chalk.gray('Size:', new TextEncoder().encode(updatedNodeInfo.metadata).length, 'bytes'));
          } catch (e) {
            console.log(chalk.yellow('⚠️  Could not verify metadata format'));
          }
        } else {
          throw new Error('Transaction failed');
        }

      } catch (error: any) {
        console.error(chalk.red('\\n❌ Metadata update failed:'), error.message);

        // Check for specific revert reasons
        if (error.message.includes('not registered')) {
          console.log(chalk.yellow('\\nℹ️  You must be registered as a host to update metadata'));
        } else if (error.message.includes('exceeds maximum size')) {
          console.log(chalk.yellow('\\nℹ️  Metadata is too large. Try removing some fields'));
        } else if (error.message.includes('required field')) {
          console.log(chalk.yellow('\\nℹ️  Make sure to include name and description'));
        } else if (error.message.includes('insufficient')) {
          console.log(chalk.yellow('\\nℹ️  Transaction failed due to insufficient gas'));
        }

        process.exit(1);
      }
    });
}