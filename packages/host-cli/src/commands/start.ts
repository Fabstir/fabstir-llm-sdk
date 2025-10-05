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
    console.log(chalk.yellow(`⚠️  Node already running (PID: ${existingPid.pid})`));
    console.log(chalk.gray(`URL: ${existingPid.publicUrl}`));
    return;
  }

  // Clean up stale PID
  pidManager.cleanupStalePID();

  // 3. Extract config
  const { port } = extractHostPort(config.publicUrl);

  console.log(chalk.blue('🚀 Starting Fabstir host node...'));
  console.log(chalk.gray(`  URL: ${config.publicUrl}`));
  console.log(chalk.gray(`  Models: ${config.models.join(', ')}`));

  // 4. Start node
  const handle = await spawnInferenceServer({
    port,
    host: '0.0.0.0',
    publicUrl: config.publicUrl,
    models: config.models,
    logLevel: options.logLevel || 'info',
  });

  // 5. Save PID
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
    return; // Exit, node keeps running
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