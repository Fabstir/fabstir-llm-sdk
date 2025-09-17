/**
 * Register command implementation
 * Handles the host registration CLI command
 */

import { Command } from 'commander';
import { registerHost, checkRegistrationStatus, RegistrationConfig } from '../registration/manager';
import { handleRegistrationError } from '../registration/errors';
import { displayRequirements } from '../balance/display';
import { validateRegistrationRequirements } from '../registration/manager';
import { initializeSDK, authenticateSDK } from '../sdk/client';
import { ethers } from 'ethers';
import chalk from 'chalk';

/**
 * Register the register command with the CLI
 */
export function registerRegisterCommand(program: Command): void {
  program
    .command('register')
    .description('Register as a host on the blockchain')
    .option('--stake <amount>', 'Stake amount in FAB (default: 1000)', '1000')
    .option('--models <models>', 'Comma-separated list of supported models')
    .option('--url <url>', 'Public URL for your host')
    .option('--force', 'Skip confirmation prompts')
    .action(async (options) => {
      try {
        const config: RegistrationConfig = {
          stakeAmount: ethers.parseEther(options.stake),
          apiUrl: options.url || 'http://localhost:8080',
          models: options.models ? options.models.split(',') : ['gpt-3.5-turbo'],
          skipConfirmation: options.force
        };

        await executeRegistration(config);
      } catch (error: any) {
        console.error(chalk.red('❌ Registration failed:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Execute registration command
 */
export async function executeRegistration(
  config: RegistrationConfig
): Promise<{
  success: boolean;
  transactionHash: string;
  hostInfo: any;
}> {
  try {
    // Ensure SDK is initialized
    const sdk = await initializeSDK();

    if (!sdk.isAuthenticated()) {
      throw new Error('Please authenticate first using "fabstir-host auth"');
    }

    // Check if already registered
    console.log(chalk.blue('Checking registration status...'));
    const status = await checkRegistrationStatus();

    if (status.isRegistered) {
      console.log(chalk.yellow('⚠️  You are already registered as a host'));
      console.log(chalk.gray(`Address: ${status.hostAddress}`));
      console.log(chalk.gray(`API URL: ${status.apiUrl}`));
      console.log(chalk.gray(`Staked: ${ethers.formatUnits(status.stakedAmount, 18)} FAB`));

      throw new Error('Host already registered. Use update commands to modify registration.');
    }

    // Show requirements
    console.log(chalk.blue('\n📋 Checking requirements...'));
    config.onProgress?.('Checking requirements...');
    const validation = await validateRegistrationRequirements();

    if (!validation.canRegister) {
      console.log(chalk.red('\n❌ Cannot register - requirements not met:'));
      validation.errors.forEach(error => {
        console.log(chalk.red(`  • ${error}`));
      });

      // Show current balances
      const balanceDisplay = await displayRequirements();
      console.log('\n' + balanceDisplay);

      const error = new Error('Registration requirements not met');
      config.onProgress?.('Requirements not met');
      throw error;
    }

    console.log(chalk.green('✓ All requirements met'));

    // Show registration details
    console.log(chalk.blue('\n📝 Registration Details:'));
    console.log(chalk.gray(`  API URL: ${config.apiUrl}`));
    console.log(chalk.gray(`  Models: ${config.models.join(', ')}`));
    console.log(chalk.gray(`  Stake: ${ethers.formatUnits(config.stakeAmount || 1000000000000000000000n, 18)} FAB`));

    if (config.metadata?.name) {
      console.log(chalk.gray(`  Name: ${config.metadata.name}`));
    }
    if (config.metadata?.description) {
      console.log(chalk.gray(`  Description: ${config.metadata.description}`));
    }

    // Add progress callback if not provided
    if (!config.onProgress) {
      config.onProgress = (message: string) => {
        console.log(chalk.gray(`  ${message}`));
      };
    }

    // Execute registration
    console.log(chalk.blue('\n🚀 Starting registration...'));
    const result = await registerHost(config);

    // Show success
    console.log(chalk.green('\n✅ Registration successful!'));
    console.log(chalk.gray(`Transaction: ${result.transactionHash}`));
    console.log(chalk.gray(`Host Address: ${result.hostInfo.hostAddress}`));
    console.log(chalk.gray(`Staked Amount: ${ethers.formatUnits(result.hostInfo.stakedAmount, 18)} FAB`));

    console.log(chalk.blue('\n🎉 You are now registered as a Fabstir host!'));
    console.log(chalk.gray('You can now start accepting AI inference jobs.'));

    return result;
  } catch (error: any) {
    // Handle error
    const handled = handleRegistrationError(error);

    console.log(chalk.red('\n❌ Registration failed'));
    console.log(chalk.red(`Error: ${handled.message}`));
    console.log(chalk.yellow(`\n💡 ${handled.resolution}`));

    if (handled.retryable) {
      console.log(chalk.gray('\nThis error may be temporary. Please try again.'));
    }

    throw error;
  }
}

/**
 * Prepare registration data
 */
export async function prepareRegistrationData(
  config: RegistrationConfig
): Promise<{
  apiUrl: string;
  models: string[];
  metadata?: Record<string, any>;
  stakeAmount: bigint;
  hostAddress: string;
}> {
  // Validate API URL
  if (!config.apiUrl || config.apiUrl.trim() === '') {
    throw new Error('API URL is required');
  }

  try {
    const url = new URL(config.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid API URL: must use http or https');
    }
  } catch {
    throw new Error('Invalid API URL format');
  }

  // Validate models
  if (!config.models || config.models.length === 0) {
    throw new Error('At least one model is required');
  }

  const validModelPattern = /^[a-zA-Z0-9-_.]+$/;
  for (const model of config.models) {
    if (!model || !validModelPattern.test(model)) {
      throw new Error(`Invalid model name: ${model}`);
    }
  }

  // Get authenticated address
  const sdk = await initializeSDK();
  const address = sdk.getAddress ? await sdk.getAddress() : null;

  if (!address) {
    throw new Error('No authenticated address');
  }

  return {
    apiUrl: config.apiUrl,
    models: config.models,
    metadata: config.metadata,
    stakeAmount: config.stakeAmount || 1000000000000000000000n, // Default 1000 FAB
    hostAddress: address
  };
}

/**
 * Submit registration transaction
 */
export async function submitRegistration(
  config: RegistrationConfig
): Promise<{
  transactionHash: string;
  status: 'pending' | 'confirmed';
  blockNumber?: number;
}> {
  const sdk = await initializeSDK();

  if (!sdk.isAuthenticated()) {
    throw new Error('SDK not authenticated');
  }

  try {
    // Prepare data
    const data = await prepareRegistrationData(config);

    // Register with manager
    const result = await registerHost({
      ...config,
      stakeAmount: data.stakeAmount
    });

    return {
      transactionHash: result.transactionHash,
      status: 'confirmed',
      blockNumber: result.hostInfo.registrationBlock
    };
  } catch (error: any) {
    throw error;
  }
}

/**
 * Wait for registration confirmation
 */
export async function waitForRegistrationConfirmation(
  transactionHash: string,
  confirmations: number = 2
): Promise<{
  confirmed: boolean;
  blockNumber: number;
  gasUsed?: bigint;
}> {
  const sdk = await initializeSDK();
  const provider = sdk.getProvider();

  try {
    // Get transaction receipt
    const receipt = await provider.getTransactionReceipt(transactionHash);

    if (!receipt) {
      // Transaction not found yet
      return {
        confirmed: false,
        blockNumber: 0
      };
    }

    // Wait for confirmations
    await receipt.wait(confirmations);

    return {
      confirmed: true,
      blockNumber: receipt.blockNumber,
      gasUsed: BigInt(receipt.gasUsed.toString())
    };
  } catch (error: any) {
    console.error('Error waiting for confirmation:', error);
    throw error;
  }
}

/**
 * Interactive registration wizard
 */
export async function registrationWizard(): Promise<void> {
  console.log(chalk.blue('\n🧙 Host Registration Wizard\n'));

  // This would be implemented with inquirer or similar
  // For now, just show instructions
  console.log(chalk.gray('To register as a host, run:'));
  console.log(chalk.white('\n  fabstir-host register --api-url <url> --models <model1,model2>\n'));

  console.log(chalk.gray('Required parameters:'));
  console.log(chalk.white('  --api-url    Your API endpoint URL'));
  console.log(chalk.white('  --models     Comma-separated list of supported models'));

  console.log(chalk.gray('\nOptional parameters:'));
  console.log(chalk.white('  --name       Display name for your host'));
  console.log(chalk.white('  --desc       Description of your host'));
  console.log(chalk.white('  --stake      Amount of FAB to stake (default: 1000)'));

  console.log(chalk.gray('\nExample:'));
  console.log(chalk.white('  fabstir-host register \\'));
  console.log(chalk.white('    --api-url https://my-api.example.com \\'));
  console.log(chalk.white('    --models gpt-4,claude-3,llama-2 \\'));
  console.log(chalk.white('    --name "My AI Host" \\'));
  console.log(chalk.white('    --desc "High-performance GPU cluster"'));
}