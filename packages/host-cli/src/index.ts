#!/usr/bin/env node

/**
 * Fabstir Host CLI
 * Entry point for the host node management tool
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerConfigCommand } from './commands/config';
import { registerWalletCommand } from './commands/wallet';
import { registerStartCommand } from './commands/start';
import { registerRegisterCommand } from './commands/register';
import { registerUnregisterCommand } from './commands/unregister';
import { registerStatusCommand } from './commands/status';
import { registerWithdrawCommand } from './commands/withdraw';
import { registerLogsCommand } from './commands/logs';
import { registerStopCommand } from './commands/stop';

const program = new Command();

program
  .name('fabstir-host')
  .description('CLI tool for managing Fabstir host nodes')
  .version('1.0.0');

// Register commands
registerInitCommand(program);
registerConfigCommand(program);
registerWalletCommand(program);
registerStartCommand(program);
registerRegisterCommand(program);
registerUnregisterCommand(program);
registerStatusCommand(program);
registerWithdrawCommand(program);
registerLogsCommand(program);
registerStopCommand(program);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Parse command line arguments
program.parse(process.argv);

export default program;