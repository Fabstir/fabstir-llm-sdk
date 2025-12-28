// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Setup Wizard command implementation
 * Guided interactive setup for new host operators
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';
import { checkAllPrerequisites, getRecommendedModels, GPUInfo } from '../services/PrerequisiteChecker.js';
import { fetchAllModels, ModelInfo, validateModelString } from '../services/ModelRegistryClient.js';
import { downloadModel, getModelsDirectory, createProgressBar, formatBytes } from '../services/ModelDownloader.js';
import { initializeSDK, authenticateSDK } from '../sdk/client.js';
import { registerHost, RegistrationConfig } from '../registration/manager.js';
import { ethers } from 'ethers';
import { DEFAULT_PRICE_PER_TOKEN } from '@fabstir/sdk-core';

const DEFAULT_RPC_URL = process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org';

/**
 * Print wizard header
 */
function printHeader(title: string): void {
  const width = 74;
  console.log('');
  console.log(chalk.blue('╔' + '═'.repeat(width) + '╗'));
  console.log(chalk.blue('║') + chalk.bold.white(title.padStart((width + title.length) / 2).padEnd(width)) + chalk.blue('║'));
  console.log(chalk.blue('╚' + '═'.repeat(width) + '╝'));
  console.log('');
}

/**
 * Print step header
 */
function printStep(step: number, total: number, title: string): void {
  console.log('');
  console.log(chalk.bold.blue(`Step ${step}/${total}: ${title}`));
  console.log(chalk.gray('─'.repeat(74)));
}

/**
 * Step 1: Check Prerequisites
 */
async function step1CheckPrerequisites(): Promise<{ passed: boolean; gpuInfo?: GPUInfo }> {
  printStep(1, 5, 'Check Prerequisites');

  console.log(chalk.gray('Checking system requirements...\n'));

  const results = await checkAllPrerequisites();

  for (const result of results.results) {
    if (result.passed) {
      console.log(chalk.green(`  ✓ ${result.message}`));
    } else {
      console.log(chalk.red(`  ✗ ${result.message}`));
      if (result.details) {
        console.log(chalk.gray(`    ${result.details}`));
      }
    }
  }

  if (!results.allPassed) {
    console.log('');
    console.log(chalk.yellow('⚠️  Some prerequisites are not met.'));

    const { continueAnyway } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway? (not recommended)',
        default: false,
      },
    ]);

    if (!continueAnyway) {
      console.log(chalk.gray('\nPlease install missing prerequisites and try again.'));
      return { passed: false };
    }
  }

  return { passed: true, gpuInfo: results.gpuInfo };
}

/**
 * Step 2: Select Model
 */
async function step2SelectModel(rpcUrl: string, gpuInfo?: GPUInfo): Promise<ModelInfo | null> {
  printStep(2, 5, 'Select Model');

  console.log(chalk.gray('Fetching approved models from blockchain...\n'));

  const models = await fetchAllModels(rpcUrl);

  if (models.length === 0) {
    console.log(chalk.red('No approved models found in ModelRegistry.'));
    return null;
  }

  // Get recommended models based on GPU
  let recommendedNames: string[] = [];
  if (gpuInfo) {
    recommendedNames = getRecommendedModels(gpuInfo.memoryGB);
    console.log(chalk.cyan(`Based on your GPU (${gpuInfo.memoryGB} GB VRAM), compatible models:\n`));
  }

  // Build choices with recommendations marked
  const choices = models.map((model, index) => {
    const isRecommended = recommendedNames.some(name =>
      model.displayName.toLowerCase().includes(name.toLowerCase())
    );
    const label = isRecommended
      ? `${index + 1}. ${model.displayName} ${chalk.green('(recommended)')}`
      : `${index + 1}. ${model.displayName}`;

    return {
      name: `${label} - ${model.huggingfaceRepo}`,
      value: model,
      short: model.displayName,
    };
  });

  const { selectedModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModel',
      message: 'Select a model to host:',
      choices,
      pageSize: 10,
    },
  ]);

  console.log(chalk.green(`\n✓ Selected: ${selectedModel.displayName}`));
  return selectedModel;
}

/**
 * Step 3: Download Model
 */
async function step3DownloadModel(model: ModelInfo, rpcUrl: string): Promise<boolean> {
  printStep(3, 5, 'Download Model');

  const outputDir = getModelsDirectory();
  const filePath = path.join(outputDir, model.fileName);

  // Check if already downloaded
  if (fs.existsSync(filePath)) {
    console.log(chalk.yellow(`Model file already exists: ${filePath}`));

    const { redownload } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'redownload',
        message: 'Re-download and verify?',
        default: false,
      },
    ]);

    if (!redownload) {
      console.log(chalk.green('✓ Using existing model file'));
      return true;
    }

    fs.unlinkSync(filePath);
  }

  // Check for HuggingFace token
  let hfToken = process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN;

  if (!hfToken) {
    console.log(chalk.yellow('\nHuggingFace token not found. Some models require authentication.'));

    const { provideToken } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'provideToken',
        message: 'Do you have a HuggingFace token?',
        default: true,
      },
    ]);

    if (provideToken) {
      const { token } = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'Enter your HuggingFace token:',
          mask: '*',
        },
      ]);
      hfToken = token;
    }
  }

  console.log('');
  console.log(chalk.blue(`Downloading ${model.displayName}...`));
  console.log(chalk.gray(`URL: ${model.downloadUrl}`));
  console.log('');

  let lastPercent = -1;

  const result = await downloadModel(
    model.downloadUrl,
    model.fileName,
    model.modelId,
    rpcUrl,
    {
      outputDir,
      hfToken,
      onProgress: (progress) => {
        const percent = Math.floor(progress.percent);
        if (percent !== lastPercent) {
          lastPercent = percent;
          const bar = createProgressBar(percent);
          const downloaded = formatBytes(progress.downloaded);
          const total = formatBytes(progress.total);
          const speed = formatBytes(progress.speed) + '/s';
          process.stdout.write(`\r${bar} ${percent}% | ${downloaded}/${total} | ${speed}   `);
        }
      },
    }
  );

  process.stdout.write('\n');

  if (result.success) {
    console.log('');
    if (result.hashVerified) {
      console.log(chalk.green('✓ Downloaded and verified'));
    } else {
      console.log(chalk.green('✓ Downloaded'));
      console.log(chalk.yellow('⚠ Hash verification skipped (no hash on-chain)'));
    }
    return true;
  } else {
    console.log('');
    console.log(chalk.red(`✗ Download failed: ${result.error}`));

    if (result.error?.includes('401') || result.error?.includes('Unauthorized')) {
      console.log(chalk.yellow('\nThis model requires HuggingFace authentication.'));
      console.log(chalk.gray('Get your token at: https://huggingface.co/settings/tokens'));
    }
    return false;
  }
}

/**
 * Step 4: Configure Node
 */
async function step4ConfigureNode(): Promise<{
  url: string;
  price: string;
  stake: string;
  privateKey?: string;
} | null> {
  printStep(4, 5, 'Configure Node');

  // Check if private key is already provided via environment variable
  const envPrivateKey = process.env.HOST_PRIVATE_KEY;
  if (envPrivateKey) {
    console.log(chalk.green('✓ Using private key from HOST_PRIVATE_KEY environment variable'));
  }

  // Build prompts - only include private key prompt if not already provided
  const prompts: any[] = [
    {
      type: 'input',
      name: 'url',
      message: "Enter your server's public URL:",
      default: 'http://localhost:8080',
      validate: (input: string) => {
        try {
          new URL(input);
          return true;
        } catch {
          return 'Please enter a valid URL (e.g., https://my-node.example.com:8080)';
        }
      },
    },
    {
      type: 'input',
      name: 'price',
      message: 'Enter pricing (per million tokens, range 100-100000000):',
      default: DEFAULT_PRICE_PER_TOKEN,
      validate: (input: string) => {
        const num = parseInt(input, 10);
        if (isNaN(num) || num < 100 || num > 100000000) {
          return 'Price must be between 100 and 100,000,000';
        }
        return true;
      },
    },
    {
      type: 'input',
      name: 'stake',
      message: 'Enter stake amount (FAB tokens):',
      default: '1000',
      validate: (input: string) => {
        const num = parseFloat(input);
        if (isNaN(num) || num <= 0) {
          return 'Stake must be a positive number';
        }
        return true;
      },
    },
  ];

  // Only prompt for private key if not provided via environment variable
  if (!envPrivateKey) {
    prompts.push({
      type: 'password',
      name: 'privateKey',
      message: 'Enter your private key (for registration):',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.length < 64) {
          return 'Please enter a valid private key';
        }
        return true;
      },
    });
  }

  const answers = await inquirer.prompt(prompts);

  // Use environment variable if prompt was skipped
  if (envPrivateKey && !answers.privateKey) {
    answers.privateKey = envPrivateKey;
  }

  // Display pricing info
  const priceNum = parseInt(answers.price, 10);
  const PRICE_PRECISION = 1000;
  const pricePerMillion = (priceNum / PRICE_PRECISION).toFixed(3);

  console.log('');
  console.log(chalk.cyan('Configuration Summary:'));
  console.log(chalk.gray(`  Public URL: ${answers.url}`));
  console.log(chalk.gray(`  Price: ${priceNum} ($${pricePerMillion}/million tokens)`));
  console.log(chalk.gray(`  Stake: ${answers.stake} FAB`));

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Proceed with this configuration?',
      default: true,
    },
  ]);

  if (!confirm) {
    return null;
  }

  return answers;
}

/**
 * Step 5: Register on Blockchain
 */
async function step5Register(
  model: ModelInfo,
  config: { url: string; price: string; stake: string; privateKey?: string },
  rpcUrl: string
): Promise<boolean> {
  printStep(5, 5, 'Register on Blockchain');

  console.log(chalk.cyan('Registering node with:'));
  console.log(chalk.gray(`  - Model: ${model.modelString}`));
  console.log(chalk.gray(`  - URL: ${config.url}`));
  console.log(chalk.gray(`  - Stake: ${config.stake} FAB`));
  console.log(chalk.gray(`  - Price: ${config.price}`));
  console.log('');

  const { proceed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'proceed',
      message: 'Proceed with registration?',
      default: true,
    },
  ]);

  if (!proceed) {
    console.log(chalk.yellow('Registration cancelled.'));
    return false;
  }

  try {
    console.log('');
    console.log(chalk.gray('Initializing SDK...'));
    await initializeSDK('base-sepolia');
    await authenticateSDK(config.privateKey);

    // Convert stable price to native price (wei)
    // Stable price is in USDC units per million tokens (e.g., 5000 = $5 per million)
    // Native price is in wei per token
    // Assuming ETH ~$2200, calculate equivalent wei per token
    const ETH_PRICE_USD = 2200;
    const stablePrice = parseInt(config.price);
    // stablePrice / 1e6 = USD per token
    // USD per token / ETH price = ETH per token
    // ETH per token * 1e18 = wei per token
    const nativePriceWei = BigInt(Math.floor((stablePrice / 1e6 / ETH_PRICE_USD) * 1e18));

    const registrationConfig: RegistrationConfig = {
      stakeAmount: ethers.parseEther(config.stake),
      apiUrl: config.url,
      models: [model.modelString],
      minPricePerTokenNative: nativePriceWei.toString(),
      minPricePerTokenStable: config.price,
      onProgress: (message: string) => {
        console.log(chalk.gray(`  ${message}`));
      },
    };

    console.log(chalk.gray('Submitting registration transaction...'));
    const result = await registerHost(registrationConfig);

    console.log('');
    console.log(chalk.green('✓ Registration confirmed'));
    console.log(chalk.green(`✓ Transaction: ${result.transactionHash}`));

    return true;
  } catch (error: any) {
    console.log('');
    console.log(chalk.red(`✗ Registration failed: ${error.message}`));
    return false;
  }
}

/**
 * Generate docker-compose.yml file
 */
function generateDockerCompose(model: ModelInfo, config: { url: string; price: string }): string {
  const modelPath = path.join(getModelsDirectory(), model.fileName);

  return `version: '3.8'

services:
  fabstir-node:
    image: ghcr.io/fabstir/fabstir-llm-node:latest
    ports:
      - "8080:8080"
    volumes:
      - ${modelPath}:/models/${model.fileName}:ro
    environment:
      - MODEL_PATH=/models/${model.fileName}
      - MODEL_NAME=${model.displayName}
      - PUBLIC_URL=${config.url}
      - PRICE_PER_TOKEN=${config.price}
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
    restart: unless-stopped
`;
}

/**
 * Generate .env file
 */
function generateEnvFile(model: ModelInfo, config: { url: string; price: string }): string {
  return `# Fabstir Node Configuration
# Generated by fabstir-host setup

MODEL_NAME=${model.displayName}
MODEL_STRING=${model.modelString}
PUBLIC_URL=${config.url}
PRICE_PER_TOKEN=${config.price}

# Add your private key here (keep this file secure!)
# PRIVATE_KEY=your_private_key_here

# HuggingFace token (if needed for model downloads)
# HF_TOKEN=your_huggingface_token_here
`;
}

/**
 * Print setup complete message
 */
function printComplete(outputDir: string): void {
  const width = 74;
  console.log('');
  console.log(chalk.green('╔' + '═'.repeat(width) + '╗'));
  console.log(chalk.green('║') + chalk.bold.white('Setup Complete!'.padStart((width + 15) / 2).padEnd(width)) + chalk.green('║'));
  console.log(chalk.green('╚' + '═'.repeat(width) + '╝'));
  console.log('');
  console.log(chalk.cyan('Generated files:'));
  console.log(chalk.green(`  ✓ ${path.join(outputDir, 'docker-compose.yml')}`));
  console.log(chalk.green(`  ✓ ${path.join(outputDir, '.env')}`));
  console.log('');
  console.log(chalk.cyan('To start your node:'));
  console.log(chalk.white(`  cd ${outputDir}`));
  console.log(chalk.white('  docker-compose up -d'));
  console.log('');
  console.log(chalk.cyan('To view logs:'));
  console.log(chalk.white('  docker-compose logs -f'));
  console.log('');
  console.log(chalk.cyan('To monitor via TUI dashboard:'));
  console.log(chalk.white('  fabstir-host dashboard'));
  console.log('');
}

/**
 * Main setup wizard
 */
async function runSetupWizard(options: { rpcUrl?: string; outputDir?: string }): Promise<void> {
  const rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;
  const outputDir = options.outputDir || path.join(homedir(), 'fabstir-node');

  printHeader('Fabstir Host Setup Wizard');

  // Step 1: Check Prerequisites
  const prereqResult = await step1CheckPrerequisites();
  if (!prereqResult.passed) {
    process.exit(1);
  }

  // Step 2: Select Model
  const selectedModel = await step2SelectModel(rpcUrl, prereqResult.gpuInfo);
  if (!selectedModel) {
    console.log(chalk.red('No model selected. Exiting.'));
    process.exit(1);
  }

  // Step 3: Download Model
  const downloadSuccess = await step3DownloadModel(selectedModel, rpcUrl);
  if (!downloadSuccess) {
    const { continueWithoutDownload } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'continueWithoutDownload',
        message: 'Continue without successful download?',
        default: false,
      },
    ]);

    if (!continueWithoutDownload) {
      process.exit(1);
    }
  }

  // Step 4: Configure Node
  const nodeConfig = await step4ConfigureNode();
  if (!nodeConfig) {
    console.log(chalk.yellow('Configuration cancelled. Exiting.'));
    process.exit(1);
  }

  // Step 5: Register on Blockchain
  const registerSuccess = await step5Register(selectedModel, nodeConfig, rpcUrl);

  // Generate configuration files
  console.log('');
  console.log(chalk.blue('Generating configuration files...'));

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write docker-compose.yml
  const dockerCompose = generateDockerCompose(selectedModel, nodeConfig);
  const dockerComposePath = path.join(outputDir, 'docker-compose.yml');
  fs.writeFileSync(dockerComposePath, dockerCompose);

  // Write .env
  const envFile = generateEnvFile(selectedModel, nodeConfig);
  const envPath = path.join(outputDir, '.env');
  fs.writeFileSync(envPath, envFile);

  // Print completion message
  if (registerSuccess) {
    printComplete(outputDir);
  } else {
    console.log('');
    console.log(chalk.yellow('⚠️  Registration was not completed, but configuration files have been generated.'));
    console.log(chalk.gray(`Files saved to: ${outputDir}`));
    console.log('');
    console.log(chalk.cyan('To complete registration later, run:'));
    console.log(chalk.white('  fabstir-host register --model "' + selectedModel.modelString + '" --url "' + nodeConfig.url + '"'));
  }
}

/**
 * Register the setup command with the CLI
 */
export function registerSetupCommand(program: Command): void {
  program
    .command('setup')
    .description('Interactive setup wizard for new host operators')
    .option('-r, --rpc-url <url>', 'RPC URL', DEFAULT_RPC_URL)
    .option('-o, --output-dir <path>', 'Output directory for generated files')
    .action(runSetupWizard);
}
