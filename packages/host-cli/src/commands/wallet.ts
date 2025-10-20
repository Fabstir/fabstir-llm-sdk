// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Wallet command implementation
 * Handles wallet management operations
 */

import { Command } from 'commander';
import { ethers } from 'ethers';
import chalk from 'chalk';
import * as ConfigStorage from '../config/storage';
import * as WalletManager from '../wallet/manager';

/**
 * Register wallet command with subcommands
 */
export function registerWalletCommand(program: Command): void {
  const wallet = program
    .command('wallet')
    .description('Manage host wallet');

  // Address subcommand
  wallet
    .command('address')
    .description('Display wallet address')
    .option('--qr', 'Display as QR code')
    .action(async (options) => {
      try {
        await displayWalletAddress(options.qr);
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });

  // Balance subcommand
  wallet
    .command('balance')
    .description('Check wallet balances')
    .option('--json', 'Output as JSON')
    .action(async (options) => {
      try {
        await displayWalletBalance(options.json);
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });

  // Export subcommand
  wallet
    .command('export')
    .description('Export wallet private key (USE WITH CAUTION)')
    .option('--force', 'Skip security warning')
    .action(async (options) => {
      try {
        await exportWallet(options.force);
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });

  // Import subcommand
  wallet
    .command('import')
    .description('Import wallet from private key')
    .option('--key <privateKey>', 'Private key to import')
    .option('--mnemonic <phrase>', 'Mnemonic phrase to import')
    .action(async (options) => {
      try {
        await importWallet(options);
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Display wallet address
 */
async function displayWalletAddress(showQr: boolean): Promise<void> {
  const config = await ConfigStorage.loadConfig();
  if (!config) {
    throw new Error('Configuration not found. Run "fabstir-host init" first');
  }

  if (!config.walletAddress || !config.privateKey) {
    throw new Error('Wallet not configured. Run "fabstir-host wallet import" first');
  }

  console.log(chalk.blue('\n💼 Wallet Information\n'));
  console.log(chalk.white('Address:'), chalk.cyan(config.walletAddress));

  if (showQr) {
    // QR code generation would go here
    console.log(chalk.gray('QR code generation not yet implemented'));
  }

  console.log();
}

/**
 * Display wallet balance
 */
async function displayWalletBalance(asJson: boolean): Promise<void> {
  const config = await ConfigStorage.loadConfig();
  if (!config) {
    throw new Error('Configuration not found. Run "fabstir-host init" first');
  }

  if (!config.privateKey) {
    throw new Error('Wallet not configured. Run "fabstir-host wallet import" first');
  }

  // Connect to provider
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);

  // Get ETH balance
  const ethBalance = await provider.getBalance(wallet.address);
  const ethFormatted = ethers.formatEther(ethBalance);

  // Get FAB balance
  let fabBalance = BigInt(0);
  let fabFormatted = '0.0';

  if (config.contracts?.fabToken) {
    const fabTokenAbi = [
      'function balanceOf(address owner) view returns (uint256)'
    ];
    const fabToken = new ethers.Contract(
      config.contracts.fabToken,
      fabTokenAbi,
      provider
    );

    try {
      fabBalance = await fabToken.balanceOf(wallet.address);
      fabFormatted = ethers.formatEther(fabBalance);
    } catch (error) {
      console.warn(chalk.yellow('⚠️  Could not fetch FAB balance'));
    }
  }

  const balances = {
    address: wallet.address,
    eth: ethFormatted,
    fab: fabFormatted,
    network: config.network
  };

  if (asJson) {
    console.log(JSON.stringify(balances, null, 2));
  } else {
    console.log(chalk.blue('\n💰 Wallet Balances\n'));
    console.log(chalk.white('Address:'), chalk.cyan(wallet.address));
    console.log(chalk.white('Network:'), chalk.gray(config.network));
    console.log();
    console.log(chalk.white('ETH Balance:'), chalk.green(`${ethFormatted} ETH`));
    console.log(chalk.white('FAB Balance:'), chalk.green(`${fabFormatted} FAB`));

    // Check requirements
    const minEth = 0.01;
    const minFab = 1000;

    if (parseFloat(ethFormatted) < minEth) {
      console.log(chalk.yellow(`\n⚠️  ETH balance below minimum (${minEth} ETH required for gas)`));
    }

    if (parseFloat(fabFormatted) < minFab) {
      console.log(chalk.yellow(`⚠️  FAB balance below minimum (${minFab} FAB required for staking)`));
    }

    console.log();
  }
}

/**
 * Export wallet private key
 */
async function exportWallet(force: boolean): Promise<void> {
  if (!force) {
    console.log(chalk.red('\n⚠️  SECURITY WARNING ⚠️'));
    console.log(chalk.yellow('Exporting your private key can be dangerous!'));
    console.log(chalk.yellow('Anyone with access to your private key can:'));
    console.log(chalk.yellow('  • Control your wallet'));
    console.log(chalk.yellow('  • Transfer your funds'));
    console.log(chalk.yellow('  • Impersonate your host'));
    console.log();
    console.log(chalk.gray('Use --force to skip this warning'));
    process.exit(1);
  }

  const config = await ConfigStorage.loadConfig();
  if (!config) {
    throw new Error('Configuration not found. Run "fabstir-host init" first');
  }

  if (!config.privateKey) {
    throw new Error('Wallet not configured');
  }

  console.log(chalk.blue('\n🔑 Private Key Export\n'));
  console.log(chalk.red('KEEP THIS SECRET - DO NOT SHARE'));
  console.log(chalk.white('Private Key:'), chalk.gray(config.privateKey));
  console.log();
}

/**
 * Import wallet from private key or mnemonic
 */
async function importWallet(options: any): Promise<void> {
  const config = await ConfigStorage.loadConfig() || {
    version: '1.0.0',
    network: 'base-sepolia',
    rpcUrl: 'https://sepolia.base.org',
    inferencePort: 8080,
    publicUrl: 'http://localhost:8080',
    models: ['gpt-3.5-turbo'],
    pricePerToken: 0.0001,
    minJobDeposit: 0.001
  };

  let wallet: ethers.Wallet;

  if (options.key) {
    // Import from private key
    try {
      wallet = new ethers.Wallet(options.key);
      console.log(chalk.green('✅ Wallet imported from private key'));
    } catch (error) {
      throw new Error('Invalid private key');
    }
  } else if (options.mnemonic) {
    // Import from mnemonic
    try {
      wallet = ethers.Wallet.fromPhrase(options.mnemonic) as ethers.Wallet;
      console.log(chalk.green('✅ Wallet imported from mnemonic'));
    } catch (error) {
      throw new Error('Invalid mnemonic phrase');
    }
  } else {
    // Interactive import
    const inquirer = (await import('inquirer')).default;
    const { importMethod } = await inquirer.prompt([
      {
        type: 'list',
        name: 'importMethod',
        message: 'How would you like to import your wallet?',
        choices: [
          { name: 'Private key', value: 'privateKey' },
          { name: 'Mnemonic phrase', value: 'mnemonic' }
        ]
      }
    ]);

    if (importMethod === 'privateKey') {
      const { privateKey } = await inquirer.prompt([
        {
          type: 'password',
          name: 'privateKey',
          message: 'Enter your private key:',
          mask: '*',
          validate: (input: string) => {
            try {
              new ethers.Wallet(input);
              return true;
            } catch {
              return 'Invalid private key';
            }
          }
        }
      ]);
      wallet = new ethers.Wallet(privateKey);
    } else {
      const { mnemonic } = await inquirer.prompt([
        {
          type: 'password',
          name: 'mnemonic',
          message: 'Enter your mnemonic phrase:',
          mask: '*',
          validate: (input: string) => {
            try {
              ethers.Wallet.fromPhrase(input);
              return true;
            } catch {
              return 'Invalid mnemonic phrase';
            }
          }
        }
      ]);
      wallet = ethers.Wallet.fromPhrase(mnemonic) as ethers.Wallet;
    }
  }

  // Update configuration
  config.walletAddress = wallet.address;
  config.privateKey = wallet.privateKey;

  // Save configuration
  await ConfigStorage.saveConfig(config);

  console.log(chalk.green('\n✅ Wallet imported successfully'));
  console.log(chalk.white('Address:'), chalk.cyan(wallet.address));
  console.log(chalk.gray('\nConfiguration saved to:'), ConfigStorage.getConfigPath());
}