#!/usr/bin/env node

/**
 * Fabstir Host CLI
 * Entry point for the host node management tool
 */

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';

const program = new Command();

program
  .name('fabstir-host')
  .description('CLI tool for managing Fabstir host nodes')
  .version('1.0.0');

// Register init command
registerInitCommand(program);

program
  .command('start')
  .description('Start the host node')
  .action(() => {
    console.log('Start command - to be implemented');
  });

program
  .command('stop')
  .description('Stop the host node')
  .action(() => {
    console.log('Stop command - to be implemented');
  });

program
  .command('status')
  .description('Check host status')
  .action(() => {
    console.log('Status command - to be implemented');
  });

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Parse command line arguments
program.parse(process.argv);

export default program;