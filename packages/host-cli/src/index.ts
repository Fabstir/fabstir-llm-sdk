// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1


/**
 * Fabstir Host CLI
 * Entry point for the host node management tool
 */

// Auto-load .env.contracts for contract addresses (before any other imports)
import * as fs from 'fs';
import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Look for .env.contracts in current directory, parent, or /app (Docker)
const envContractsPaths = [
  path.join(process.cwd(), '.env.contracts'),
  path.join(process.cwd(), '..', '.env.contracts'),
  '/app/.env.contracts',
  path.join(__dirname, '..', '.env.contracts'),
];

for (const envPath of envContractsPaths) {
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath });
    break;
  }
}

// Also load .env if present (for HOST_PRIVATE_KEY, etc.)
const envPaths = [
  path.join(process.cwd(), '.env'),
  path.join(process.cwd(), '..', '.env'),
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenvConfig({ path: envPath });
    break;
  }
}

// Polyfill IndexedDB for Node.js (required for S5 storage in SDK)
import 'fake-indexeddb/auto';

// Polyfill WebSocket for Node.js (required for S5 storage in SDK)
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { Command } from 'commander';
import { registerInitCommand } from './commands/init';
import { registerConfigCommand } from './commands/config';
import { registerWalletCommand } from './commands/wallet';
import { registerStartCommand } from './commands/start';
import { registerRegisterCommand } from './commands/register';
import { registerUnregisterCommand } from './commands/unregister';
import { registerInfoCommand } from './commands/info';
import { registerUpdateUrlCommand } from './commands/update-url';
import { registerUpdateModelsCommand } from './commands/update-models';
import { registerAddStakeCommand } from './commands/add-stake';
import { registerUpdateMetadataCommand } from './commands/update-metadata';
import { registerUpdatePricingCommand } from './commands/update-pricing';
import { registerStatusCommand } from './commands/status';
import { registerWithdrawCommand } from './commands/withdraw';
import { registerLogsCommand } from './commands/logs';
import { registerStopCommand } from './commands/stop';
import { registerServeCommand } from './commands/serve';
import { registerDashboardCommand } from './commands/dashboard';
import { registerModelsCommand } from './commands/models';
import { registerSetupCommand } from './commands/setup';
import { registerSetModelPricingCommand } from './commands/set-model-pricing';
import { registerClearModelPricingCommand } from './commands/clear-model-pricing';

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
registerInfoCommand(program);
registerUpdateUrlCommand(program);
registerUpdateModelsCommand(program);
registerAddStakeCommand(program);
registerUpdateMetadataCommand(program);
registerUpdatePricingCommand(program);
registerStatusCommand(program);
registerWithdrawCommand(program);
registerLogsCommand(program);
registerStopCommand(program);
registerServeCommand(program);
registerDashboardCommand(program);
registerModelsCommand(program);
registerSetupCommand(program);
registerSetModelPricingCommand(program);
registerClearModelPricingCommand(program);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

// Parse command line arguments
program.parse(process.argv);

export default program;