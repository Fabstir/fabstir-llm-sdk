// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Models command implementation
 * Handles model discovery from the ModelRegistry contract
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { fetchAllModels, fetchModelById, ModelInfo } from '../services/ModelRegistryClient.js';

const DEFAULT_RPC_URL = process.env.RPC_URL_BASE_SEPOLIA || 'https://sepolia.base.org';

/**
 * Truncates a string to a max length with ellipsis
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
}

/**
 * Formats the model list as a table
 */
function formatModelTable(models: ModelInfo[]): string {
  if (models.length === 0) {
    return chalk.yellow('No approved models found.');
  }

  const lines: string[] = [];

  // Header
  lines.push(chalk.bold.blue('Approved Models for Fabstir Network'));
  lines.push(chalk.gray('━'.repeat(76)));
  lines.push('');

  // Column headers
  const numWidth = 4;
  const nameWidth = 24;
  const stringWidth = 46;

  lines.push(
    chalk.bold(
      `  ${'#'.padEnd(numWidth)}${'Model Name'.padEnd(nameWidth)}${'Model String'.padEnd(stringWidth)}`
    )
  );
  lines.push(chalk.gray(`  ${'─'.repeat(numWidth)}${'─'.repeat(nameWidth)}${'─'.repeat(stringWidth)}`));

  // Rows
  models.forEach((model, index) => {
    const num = `${index + 1}`.padEnd(numWidth);
    const name = truncate(model.displayName, nameWidth - 1).padEnd(nameWidth);
    const modelStr = truncate(model.modelString, stringWidth - 1);

    lines.push(`  ${chalk.cyan(num)}${chalk.white(name)}${chalk.gray(modelStr)}`);
  });

  lines.push('');
  lines.push(chalk.gray(`Total: ${models.length} approved model${models.length !== 1 ? 's' : ''}`));
  lines.push('');
  lines.push(chalk.gray("Use 'fabstir-host models info <number>' for details"));

  return lines.join('\n');
}

/**
 * Formats detailed model info
 */
function formatModelDetails(model: ModelInfo, index?: number): string {
  const lines: string[] = [];

  const title = index !== undefined ? `Model #${index + 1}: ${model.displayName}` : `Model: ${model.displayName}`;
  lines.push(chalk.bold.blue(title));
  lines.push(chalk.gray('━'.repeat(76)));
  lines.push('');

  lines.push(`${chalk.bold('Model String:')}  ${chalk.white(model.modelString)}`);
  lines.push(`${chalk.bold('Model ID:')}      ${chalk.gray(model.modelId)}`);
  lines.push(`${chalk.bold('Repository:')}    ${chalk.cyan(model.repoUrl)}`);
  lines.push(`${chalk.bold('Download URL:')}  ${chalk.cyan(model.downloadUrl)}`);
  lines.push(`${chalk.bold('SHA256 Hash:')}   ${chalk.gray(model.sha256Hash)}`);

  lines.push('');
  lines.push(chalk.bold('To register with this model:'));
  lines.push(chalk.white(`  fabstir-host register --model "${model.modelString}" --stake 1000 --url <your-url> --price 2000`));

  lines.push('');
  lines.push(chalk.bold('To download this model:'));
  lines.push(chalk.white(`  fabstir-host models download ${index !== undefined ? index + 1 : model.modelId}`));

  return lines.join('\n');
}

/**
 * List all approved models
 */
async function listModels(options: { rpcUrl?: string }): Promise<void> {
  const rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;

  console.log(chalk.gray('Fetching approved models from ModelRegistry...'));
  console.log('');

  try {
    const models = await fetchAllModels(rpcUrl);
    console.log(formatModelTable(models));
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`Failed to fetch models: ${errMsg}`));
    process.exit(1);
  }
}

/**
 * Show detailed info for a specific model
 */
async function showModelInfo(identifier: string, options: { rpcUrl?: string }): Promise<void> {
  const rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;

  console.log(chalk.gray('Fetching model details...'));
  console.log('');

  try {
    // Check if identifier is a number (index)
    const numId = parseInt(identifier, 10);

    if (!isNaN(numId) && numId > 0) {
      // Fetch by index
      const models = await fetchAllModels(rpcUrl);
      const index = numId - 1;

      if (index >= models.length) {
        console.error(chalk.red(`Model #${numId} not found. Only ${models.length} models available.`));
        process.exit(1);
      }

      console.log(formatModelDetails(models[index], index));
    } else if (identifier.startsWith('0x')) {
      // Fetch by model ID
      const model = await fetchModelById(rpcUrl, identifier);

      if (!model) {
        console.error(chalk.red(`Model ${identifier} not found or not active.`));
        process.exit(1);
      }

      console.log(formatModelDetails(model));
    } else {
      console.error(chalk.red('Invalid identifier. Use a number (e.g., 1) or model ID (0x...).'));
      process.exit(1);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`Failed to fetch model: ${errMsg}`));
    process.exit(1);
  }
}

/**
 * Download a model (placeholder for Phase 2)
 */
async function downloadModel(identifier: string, options: { rpcUrl?: string; output?: string }): Promise<void> {
  const rpcUrl = options.rpcUrl || DEFAULT_RPC_URL;

  console.log(chalk.yellow('Model download functionality coming soon.'));
  console.log('');

  // For now, just show the download URL
  try {
    const numId = parseInt(identifier, 10);
    let model: ModelInfo | null = null;

    if (!isNaN(numId) && numId > 0) {
      const models = await fetchAllModels(rpcUrl);
      const index = numId - 1;
      if (index < models.length) {
        model = models[index];
      }
    } else if (identifier.startsWith('0x')) {
      model = await fetchModelById(rpcUrl, identifier);
    }

    if (model) {
      console.log(chalk.blue(`To download ${model.displayName} manually:`));
      console.log('');
      console.log(chalk.white(`  wget "${model.downloadUrl}"`));
      console.log('');
      console.log(chalk.gray(`Expected SHA256: ${model.sha256Hash}`));
    } else {
      console.error(chalk.red('Model not found.'));
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(chalk.red(`Error: ${errMsg}`));
  }
}

/**
 * Register the models command with the CLI
 */
export function registerModelsCommand(program: Command): void {
  const modelsCmd = program
    .command('models')
    .description('Discover and manage approved models from the ModelRegistry');

  // fabstir-host models list
  modelsCmd
    .command('list')
    .description('List all approved models')
    .option('-r, --rpc-url <url>', 'RPC URL', DEFAULT_RPC_URL)
    .action(listModels);

  // fabstir-host models info <identifier>
  modelsCmd
    .command('info <identifier>')
    .description('Show detailed info for a model (by number or model ID)')
    .option('-r, --rpc-url <url>', 'RPC URL', DEFAULT_RPC_URL)
    .action(showModelInfo);

  // fabstir-host models download <identifier>
  modelsCmd
    .command('download <identifier>')
    .description('Download a model file (by number or model ID)')
    .option('-r, --rpc-url <url>', 'RPC URL', DEFAULT_RPC_URL)
    .option('-o, --output <path>', 'Output directory')
    .action(downloadModel);
}
