import 'fake-indexeddb/auto';
import WebSocket from 'ws';
(globalThis as any).WebSocket = WebSocket;

import { config as dotenvConfig } from 'dotenv';
import { Command } from 'commander';
import { validateConfig, loadConfigFromEnv, DEFAULT_PORT, DEFAULT_CHAIN_ID, DEFAULT_DEPOSIT_AMOUNT } from './config';
import { SessionBridge } from './session-bridge';
import { BridgeServer } from './server';

const program = new Command();
program
  .name('fabstir-openai-bridge')
  .version('0.1.0')
  .description('OpenAI-compatible API bridge routing through Fabstir SDK encrypted WebSocket')
  .option('--port <number>', 'HTTP server port', String(DEFAULT_PORT))
  .option('--private-key <key>', 'Ethereum private key (or OPENAI_BRIDGE_PRIVATE_KEY)')
  .option('--host <address>', 'Host node address (optional — auto-discovered if omitted)')
  .option('--model <name>', 'Model string (or OPENAI_BRIDGE_MODEL)')
  .option('--chain-id <number>', 'Chain ID', String(DEFAULT_CHAIN_ID))
  .option('--deposit <amount>', 'Deposit amount in ETH', DEFAULT_DEPOSIT_AMOUNT)
  .option('--rpc-url <url>', 'Override RPC URL')
  .option('--env-file <path>', 'Path to .env file', '.env.test')
  .option('--api-key <key>', 'Require Authorization: Bearer <key> from clients')
  .option('--localhost-override <host>', 'Docker: rewrite localhost in discovered host URLs')
  .action(async (opts) => {
    dotenvConfig({ path: opts.envFile });
    const envConfig = loadConfigFromEnv();
    const config = validateConfig({
      ...envConfig,
      port: parseInt(opts.port, 10),
      privateKey: opts.privateKey || envConfig.privateKey,
      hostAddress: opts.host || envConfig.hostAddress,
      modelName: opts.model || envConfig.modelName,
      chainId: parseInt(opts.chainId, 10),
      depositAmount: opts.deposit,
      rpcUrl: opts.rpcUrl || envConfig.rpcUrl,
      apiKey: opts.apiKey || envConfig.apiKey,
      localhostOverride: opts.localhostOverride,
    });

    const bridge = new SessionBridge(config);
    console.log('Initializing SDK...');
    await bridge.initialize();

    const server = new BridgeServer(config.port, bridge, config.modelName, config.apiKey);
    await server.start();
    const port = server.getPort();
    console.log(`\nOpenAI Bridge running on http://localhost:${port}`);
    console.log(`Set OPENAI_BASE_URL=http://localhost:${port}/v1 in your client\n`);

    const shutdown = async () => {
      console.log('\nShutting down...');
      await server.stop();
      await bridge.shutdown();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });

const argv = process.argv.filter((arg, i) => i < 2 || arg !== '--');
program.parse(argv);
