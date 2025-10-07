/**
 * Serve Command (Sub-phase 3.1)
 * Starts the management API server for browser-based control
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { ManagementServer } from '../server/api';
import { LogWebSocketServer } from '../server/ws';
import { getLogsDir } from '../config/paths';

/**
 * Server state for graceful shutdown
 */
let managementServer: ManagementServer | null = null;
let wsServer: LogWebSocketServer | null = null;
let shutdownHandlers: Array<() => void> = [];

/**
 * Register serve command with commander
 */
export function registerServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start management API server for browser control')
    .option('-p, --port <number>', 'Server port (default: 3001)', '3001')
    .option('--api-key <key>', 'API key for authentication (or set FABSTIR_API_KEY env var)')
    .option('--cors <origins>', 'Comma-separated CORS origins (default: http://localhost:3000)', 'http://localhost:3000')
    .action(async (options) => {
      try {
        await startServer(options);
      } catch (error: any) {
        console.error(chalk.red('❌ Error starting server:'), error.message);
        process.exit(1);
      }
    });
}

/**
 * Start the management server
 * Exported for testing
 */
export async function startServer(options: {
  port: string;
  apiKey?: string;
  cors: string;
}): Promise<void> {
  const port = parseInt(options.port, 10);

  // Get API key from option or environment
  const apiKey = options.apiKey || process.env.FABSTIR_API_KEY;

  // Parse CORS origins (comma-separated)
  const corsOrigins = options.cors.split(',').map(origin => origin.trim());

  console.log(chalk.blue('🚀 Starting management server...'));
  console.log(chalk.gray(`   Port: ${port}`));
  console.log(chalk.gray(`   CORS: ${corsOrigins.join(', ')}`));
  if (apiKey) {
    console.log(chalk.gray('   Auth: API key enabled'));
  }

  try {
    // Create ManagementServer instance
    managementServer = new ManagementServer({
      port,
      corsOrigins,
      apiKey
    });

    // Start management server (this creates and starts the HTTP server)
    await managementServer.start();

    // Get the HTTP server from ManagementServer to attach WebSocket
    const httpServer = managementServer.getHttpServer();

    // Create LogWebSocketServer instance (attached to same HTTP server)
    const logsDir = getLogsDir();
    wsServer = new LogWebSocketServer(httpServer, apiKey, '/ws/logs', logsDir);

    // Start WebSocket server (attaches to same HTTP server)
    wsServer.start();

    // Setup graceful shutdown handlers
    setupShutdownHandlers();

    // Log success
    console.log(chalk.green('✅ Management server started'));
    console.log(chalk.blue(`   HTTP API: http://localhost:${port}`));
    console.log(chalk.blue(`   WebSocket: ws://localhost:${port}/ws/logs`));
    console.log(chalk.gray('\nPress Ctrl+C to stop\n'));

    // Keep process alive (prevent exit)
    await keepAlive();

  } catch (error: any) {
    if (error.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. Use --port to specify a different port.`);
    }
    throw error;
  }
}

/**
 * Setup graceful shutdown handlers for SIGTERM and SIGINT
 */
function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    console.log(chalk.yellow(`\n⚠️  Received ${signal}, shutting down gracefully...`));

    try {
      // Stop WebSocket server first
      if (wsServer) {
        wsServer.stop();
        wsServer = null;
        console.log(chalk.gray('   WebSocket server stopped'));
      }

      // Stop management server
      if (managementServer) {
        await managementServer.stop();
        managementServer = null;
        console.log(chalk.gray('   Management server stopped'));
      }

      console.log(chalk.green('✅ Shutdown complete'));

      // Remove shutdown handlers
      removeShutdownHandlers();

      // Only exit in non-test environment
      if (process.env.NODE_ENV !== 'test') {
        process.exit(0);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Error during shutdown:'), error.message);

      // Remove shutdown handlers
      removeShutdownHandlers();

      // Only exit in non-test environment
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
    }
  };

  const sigtermHandler = () => shutdown('SIGTERM');
  const sigintHandler = () => shutdown('SIGINT');

  // Handle SIGTERM (docker stop, kill command)
  process.on('SIGTERM', sigtermHandler);

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', sigintHandler);

  // Store handlers for later removal
  shutdownHandlers = [
    () => process.removeListener('SIGTERM', sigtermHandler),
    () => process.removeListener('SIGINT', sigintHandler)
  ];
}

/**
 * Remove shutdown handlers
 */
function removeShutdownHandlers(): void {
  for (const remove of shutdownHandlers) {
    remove();
  }
  shutdownHandlers = [];
}

/**
 * Keep process alive indefinitely
 * Returns a promise that never resolves (unless shutdown is triggered)
 */
async function keepAlive(): Promise<void> {
  return new Promise(() => {
    // This promise never resolves, keeping the process alive
    // Shutdown handlers will exit the process when needed
  });
}

/**
 * Cleanup servers and handlers (for testing)
 * @internal
 */
export async function cleanupServers(): Promise<void> {
  // Stop WebSocket server
  if (wsServer) {
    wsServer.stop();
    wsServer = null;
  }

  // Stop management server
  if (managementServer) {
    await managementServer.stop();
    managementServer = null;
  }

  // Remove shutdown handlers
  removeShutdownHandlers();
}
