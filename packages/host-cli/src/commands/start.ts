// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Start command implementation
 * Starts the host node
 *
 * Sub-phase 5.1: Implement Start Command
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as ConfigStorage from '../config/storage';
import { PIDManager } from '../daemon/pid';
import { spawnInferenceServer } from '../process/manager';
import { extractHostPort } from '../utils/network';

/**
 * Register start command
 */
export function registerStartCommand(program: Command): void {
  program
    .command('start')
    .description('Start the host node')
    .option('-d, --daemon', 'Run in background as daemon')
    .option('--log-level <level>', 'Log level (error, warn, info, debug)')
    .action(async (options) => {
      try {
        await startHost(options);
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Start the host node (Sub-phase 5.1)
 * Exported for testing
 */
export async function startHost(options: any): Promise<void> {
  // 1. Load configuration
  const config = await ConfigStorage.loadConfig();
  if (!config) {
    throw new Error('No configuration found. Run "fabstir-host register" first.');
  }

  if (!config.publicUrl) {
    throw new Error('No public URL configured. Re-register your host.');
  }

  // 2. Check if already running
  const pidManager = new PIDManager();
  const existingPid = pidManager.getPIDInfo();
  if (existingPid && pidManager.isProcessRunning(existingPid.pid)) {
    const message = `Node already running (PID: ${existingPid.pid})`;
    console.log(chalk.yellow(`⚠️  ${message}`));
    console.log(chalk.gray(`URL: ${existingPid.publicUrl}`));

    // Don't throw error - this is not an error condition
    // Just return early to prevent starting duplicate node
    return;
  }

  // Clean up stale PID
  pidManager.cleanupStalePID();

  // 3. Use inferencePort from config (internal container port, not public URL port)
  const port = config.inferencePort;

  console.log(chalk.blue('🚀 Starting Fabstir host node...'));
  console.log(chalk.gray(`  Internal Port: ${port}`));
  console.log(chalk.gray(`  Public URL: ${config.publicUrl}`));
  console.log(chalk.gray(`  Models: ${config.models.join(', ')}`));

  // 4. Start node
  const handle = await spawnInferenceServer({
    port,
    host: '0.0.0.0',
    publicUrl: config.publicUrl,
    models: config.models,
    logLevel: options.logLevel || 'info',
    skipStartupWait: options.daemon, // Skip log monitoring in daemon mode
  });

  // 5. Verify process is still running after spawn
  // (catches immediate failures like "address already in use")
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

  if (!pidManager.isProcessRunning(handle.pid)) {
    throw new Error('Node process exited immediately after starting. Check logs for errors.');
  }

  // 6. Save PID (only if process is confirmed running)
  console.log(chalk.gray(`  DEBUG: Spawned process PID: ${handle.pid}`));
  console.log(chalk.gray(`  DEBUG: Process confirmed running, saving PID`));
  pidManager.savePIDWithUrl(handle.pid, config.publicUrl);
  await ConfigStorage.saveConfig({
    ...config,
    processPid: handle.pid,
    nodeStartTime: new Date().toISOString(),
  });

  console.log(chalk.green(`\n✅ Node started successfully (PID: ${handle.pid})`));
  console.log(chalk.gray(`Monitor logs: fabstir-host logs`));
  console.log(chalk.gray(`Stop node: fabstir-host stop`));

  // 6. Daemon vs foreground mode
  if (options.daemon) {
    console.log(chalk.blue('\n🔄 Running in daemon mode'));
    console.log(chalk.gray('Node is running in background'));
    console.log(chalk.gray(`PID: ${handle.pid}`));
    console.log(chalk.gray('Parent process will stay alive to keep daemon running'));
    console.log(chalk.gray('(This is required in Docker containers)'));

    // Detach from child process
    handle.process.unref();

    // If called from API (skipWait option), return immediately
    // If called from CLI, wait forever to keep container alive
    if (options.skipWait) {
      console.log(chalk.gray('API mode: returning immediately'));
      return; // Return immediately for API calls
    }

    // Keep parent alive but idle - REQUIRED for child to survive in Docker
    // The parent must not exit, but we don't need to do anything
    await new Promise(() => {}); // Infinite wait (until killed externally)
  } else {
    console.log(chalk.blue('\n🔄 Running in foreground mode (Ctrl+C to stop)'));

    // Stream logs to console
    handle.process.stdout?.on('data', (data) => {
      process.stdout.write(data);
    });
    handle.process.stderr?.on('data', (data) => {
      process.stderr.write(data);
    });

    // Wait forever (until Ctrl+C)
    await new Promise(() => {});
  }
}