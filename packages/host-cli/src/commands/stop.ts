import { Command } from 'commander';
import { PIDManager } from '../daemon/pid';
import { DaemonManager } from '../daemon/manager';
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
    try {
      const pidManager = new PIDManager(options.pidFile);
      const daemonManager = new DaemonManager();

      // Read PID from file
      const pid = pidManager.readPID();

      if (!pid) {
        console.error('Host daemon is not running (no PID file found)');
        return;
      }

      // Check if process is actually running
      if (!pidManager.isProcessRunning(pid)) {
        console.log('Host daemon is not running (stale PID file)');
        pidManager.removePID();
        return;
      }

      console.log(`Stopping host daemon (PID: ${pid})...`);

      // Stop the daemon
      await daemonManager.stopDaemon(pid, {
        timeout: options.timeout || 10000,
        force: options.force || false
      });

      // Remove PID file
      pidManager.removePID();

      console.log('Host daemon stopped successfully');
    } catch (error: any) {
      console.error(`Failed to stop host daemon: ${error.message}`);
      process.exit(1);
    }
  }
};