// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import inquirer from 'inquirer';
import { ConfigData, WalletInfo } from './types';
import * as WalletManager from '../wallet/manager';

export async function runWizard(): Promise<ConfigData> {
  console.log('\n🚀 Fabstir Host Configuration Wizard\n');

  const wallet = await promptWalletSetup();
  const networkConfig = await promptNetworkConfig();
  const hostConfig = await promptHostConfig();
  const modelConfig = await promptModelConfig();

  const config: ConfigData = {
    version: '1.0.0',
    walletAddress: wallet?.address || 'existing',
    ...networkConfig,
    ...hostConfig,
    ...modelConfig
  };

  const confirmed = await confirmConfiguration(config);
  if (!confirmed) {
    throw new Error('Configuration cancelled by user');
  }

  return config;
}

export async function promptWalletSetup(): Promise<WalletInfo | null> {
  const { walletChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'walletChoice',
      message: 'How would you like to set up your wallet?',
      choices: [
        { name: 'Generate new wallet', value: 'generate' },
        { name: 'Import existing wallet', value: 'import' },
        { name: 'Use existing configured wallet', value: 'existing' }
      ]
    }
  ]);

  if (walletChoice === 'generate') {
    const wallet = await WalletManager.generateWallet();
    console.log('\n✅ New wallet generated');
    console.log(`Address: ${wallet.address}`);
    console.log('\n⚠️  IMPORTANT: Save your mnemonic phrase securely:');
    console.log(wallet.mnemonic?.phrase);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase
    };
  }

  if (walletChoice === 'import') {
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
          mask: '*'
        }
      ]);

      const wallet = await WalletManager.importFromPrivateKey(privateKey);
      return {
        address: wallet.address,
        privateKey: wallet.privateKey
      };
    }

    if (importMethod === 'mnemonic') {
      const { mnemonic } = await inquirer.prompt([
        {
          type: 'password',
          name: 'mnemonic',
          message: 'Enter your mnemonic phrase:',
          mask: '*'
        }
      ]);

      const wallet = await WalletManager.importFromMnemonic(mnemonic);
      return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        mnemonic: mnemonic
      };
    }
  }

  return null;
}

export async function promptNetworkConfig(): Promise<Pick<ConfigData, 'network' | 'rpcUrl'>> {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'network',
      message: 'Select network:',
      choices: ['base-mainnet', 'base-sepolia']
    },
    {
      type: 'input',
      name: 'rpcUrl',
      message: 'Enter RPC URL:',
      default: (answers: any) => {
        return answers.network === 'base-mainnet'
          ? 'https://mainnet.base.org'
          : 'https://sepolia.base.org';
      },
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    }
  ]);

  return answers;
}

export async function promptHostConfig(): Promise<Pick<ConfigData, 'inferencePort' | 'publicUrl'>> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'inferencePort',
      message: 'Enter inference port:',
      default: 8080,
      validate: (input: string) => {
        const port = parseInt(input);
        if (isNaN(port)) {
          return 'Please enter a valid port number';
        }
        if (port < 1 || port > 65535) {
          return 'Port must be between 1 and 65535';
        }
        return true;
      },
      filter: (input: string) => parseInt(input)
    },
    {
      type: 'input',
      name: 'publicUrl',
      message: 'Enter public URL for your host:',
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    }
  ]);

  return answers;
}

export async function promptModelConfig(): Promise<Pick<ConfigData, 'models' | 'pricePerToken' | 'minSessionDeposit'>> {
  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'models',
      message: 'Select models to support:',
      choices: [
        'llama-70b',
        'llama-13b',
        'llama-7b',
        'gpt-j-6b',
        'mistral-7b',
        'codellama-34b'
      ],
      validate: (input: string[]) => {
        if (input.length === 0) {
          return 'Please select at least one model';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'pricePerToken',
      message: 'Enter price per token (in ETH):',
      default: 0.0001,
      validate: (input: string) => {
        const price = parseFloat(input);
        if (isNaN(price) || price <= 0) {
          return 'Price must be positive';
        }
        return true;
      },
      filter: (input: string) => parseFloat(input)
    },
    {
      type: 'input',
      name: 'minSessionDeposit',
      message: 'Enter minimum session deposit (in ETH):',
      default: 0.01,
      validate: (input: string) => {
        const deposit = parseFloat(input);
        if (isNaN(deposit) || deposit <= 0) {
          return 'Deposit must be positive';
        }
        return true;
      },
      filter: (input: string) => parseFloat(input)
    }
  ]);

  return answers;
}

export async function confirmConfiguration(config: ConfigData): Promise<boolean> {
  console.log('\n📋 Configuration Summary:');
  console.log('========================');
  console.log(`Version: ${config.version}`);
  console.log(`Wallet: ${config.walletAddress}`);
  console.log(`Network: ${config.network}`);
  console.log(`RPC URL: ${config.rpcUrl}`);
  console.log(`Inference Port: ${config.inferencePort}`);
  console.log(`Public URL: ${config.publicUrl}`);
  console.log(`Models: ${config.models.join(', ')}`);
  console.log(`Price per token: ${config.pricePerToken} ETH`);
  console.log(`Min session deposit: ${config.minSessionDeposit} ETH`);

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Save this configuration?',
      default: true
    }
  ]);

  return confirm;
}