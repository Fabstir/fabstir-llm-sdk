/**
 * Stop command implementation
 * Stops the running host node
 *
 * Sub-phase 5.2: Enhance Stop Command
 */

import { Command } from 'commander';
import { PIDManager } from '../daemon/pid';
import { DaemonManager } from '../daemon/manager';
import * as ConfigStorage from '../config/storage';
import chalk from 'chalk';

interface StopOptions {
  pidFile?: string;
  force?: boolean;
  timeout?: number;
}

/**
 * Register the stop command with the CLI
 */
export function registerStopCommand(program: Command): void {
  program
    .command('stop')
    .description('Stop the running host node')
    .option('--force', 'Force stop without cleanup')
    .option('--timeout <ms>', 'Shutdown timeout in milliseconds', '10000')
    .action(async (options) => {
      try {
        await stopCommand.action({
          force: options.force,
          timeout: parseInt(options.timeout) || 10000
        });
      } catch (error: any) {
        console.error(chalk.red('❌ Error:'), error.message);
        process.exit(1);
      }
    });
}

export const stopCommand = {
  name: 'stop',
  description: 'Stop the Fabstir host daemon',

  async action(options: StopOptions = {}): Promise<void> {
    const pidManager = new PIDManager(options.pidFile);
    const daemonManager = new DaemonManager();

    // Read PID info with metadata (Sub-phase 5.2)
    const pidInfo = pidManager.getPIDInfo();

    if (!pidInfo) {
      console.log(chalk.yellow('Host daemon is not running'));
      pidManager.cleanupStalePID();
      return;
    }

    console.log(chalk.blue('\n🛑 Stopping host node...'));
    console.log(chalk.gray(`  PID: ${pidInfo.pid}`));
    console.log(chalk.gray(`  URL: ${pidInfo.publicUrl}`));

    // Stop the daemon
    await daemonManager.stopDaemon(pidInfo.pid, {
      timeout: options.timeout || 10000,
      force: options.force || false
    });

    // Remove PID file
    pidManager.removePID();

    // Clear PID from config (Sub-phase 5.2)
    const config = await ConfigStorage.loadConfig();
    if (config) {
      await ConfigStorage.saveConfig({
        ...config,
        processPid: undefined,
        nodeStartTime: undefined
      });
    }

    console.log(chalk.green('\n✅ Node stopped successfully'));
  }
};