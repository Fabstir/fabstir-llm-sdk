/**
 * Management API Server (Sub-phases 1.1, 1.2 & 1.3)
 * Express server with health endpoint and CORS support
 */

import express, { type Request, type Response, type NextFunction, type Application } from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { PIDManager } from '../daemon/pid';
import { startHost } from '../commands/start';
import { stopCommand } from '../commands/stop';
import { executeRegistration } from '../commands/register';
import type { RegistrationConfig } from '../registration/manager';
import { withdrawHostEarnings } from '../commands/withdraw';
import { getSDK, getHostManager } from '../sdk/client';
import { ethers } from 'ethers';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  apiKey?: string;
  pidPath?: string;  // Optional custom PID file path (for testing)
}

/**
 * Management Server for Host CLI
 * Provides REST API endpoints for browser-based node management
 */
export class ManagementServer {
  private app: Application;
  private server: Server | null = null;
  private config: ServerConfig;
  private startTime: number = 0;
  private pidManager: PIDManager;

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();
    this.pidManager = new PIDManager(config.pidPath);

    // Setup middleware
    this.setupMiddleware();

    // Setup routes
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json());

    // CORS middleware
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true
    }));

    // Optional API key authentication for /api/* endpoints
    if (this.config.apiKey) {
      this.app.use('/api/*', this.authenticateApiKey.bind(this));
    }
  }

  /**
   * API key authentication middleware
   */
  private authenticateApiKey(req: Request, res: Response, next: NextFunction): void {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || apiKey !== this.config.apiKey) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    next();
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health endpoint (no auth required)
    this.app.get('/health', this.handleHealth.bind(this));

    // Node status endpoint (requires auth if enabled)
    this.app.get('/api/status', this.handleStatus.bind(this));

    // Lifecycle control endpoints (Sub-phase 1.3)
    this.app.post('/api/start', this.handleStart.bind(this));
    this.app.post('/api/stop', this.handleStop.bind(this));
    this.app.post('/api/register', this.handleRegister.bind(this));
    this.app.post('/api/unregister', this.handleUnregister.bind(this));

    // Host management endpoints (Sub-phase 1.3 - NEW)
    this.app.post('/api/add-stake', this.handleAddStake.bind(this));
    this.app.post('/api/withdraw-earnings', this.handleWithdrawEarnings.bind(this));
    this.app.post('/api/update-models', this.handleUpdateModels.bind(this));
    this.app.post('/api/update-metadata', this.handleUpdateMetadata.bind(this));
    this.app.get('/api/discover-nodes', this.handleDiscoverNodes.bind(this));
  }

  /**
   * Health check endpoint handler
   */
  private handleHealth(req: Request, res: Response): void {
    const uptime = this.startTime > 0 ? Math.floor((Date.now() - this.startTime) / 1000) : 0;

    res.json({
      status: 'ok',
      uptime
    });
  }

  /**
   * Node status endpoint handler (Sub-phase 1.2)
   * Returns current status of the inference node
   */
  private handleStatus(req: Request, res: Response): void {
    try {
      // Get PID info from file
      const pidInfo = this.pidManager.getPIDInfo();

      if (!pidInfo) {
        // No PID file or process not running
        res.json({
          status: 'stopped'
        });
        return;
      }

      // Calculate uptime in seconds
      const startTime = new Date(pidInfo.startTime);
      const uptime = Math.floor((Date.now() - startTime.getTime()) / 1000);

      // Return full status
      res.json({
        status: 'running',
        pid: pidInfo.pid,
        publicUrl: pidInfo.publicUrl,
        startTime: pidInfo.startTime,
        uptime
      });
    } catch (error) {
      // On any error, return stopped status
      res.json({
        status: 'stopped'
      });
    }
  }

  /**
   * Lifecycle control endpoint handlers (Sub-phase 1.3)
   * Wire API endpoints to existing CLI command functions
   */

  private async handleStart(req: Request, res: Response): Promise<void> {
    try {
      const { daemon = true } = req.body;

      // Call existing startHost command
      await startHost({ daemon });

      // If successful, get the PID info
      const pidInfo = this.pidManager.getPIDInfo();
      if (!pidInfo) {
        res.status(500).json({ error: 'Node started but PID not found' });
        return;
      }

      res.json({
        status: 'running',
        pid: pidInfo.pid,
        publicUrl: pidInfo.publicUrl
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to start node' });
    }
  }

  private async handleStop(req: Request, res: Response): Promise<void> {
    try {
      const { force = false, timeout = 10000 } = req.body;

      // Call existing stop command
      await stopCommand.action({ force, timeout });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to stop node' });
    }
  }

  private async handleRegister(req: Request, res: Response): Promise<void> {
    try {
      const { walletAddress, publicUrl, models, stakeAmount, metadata } = req.body;

      // Validate required fields
      if (!publicUrl || !models || !stakeAmount) {
        res.status(400).json({
          error: 'Missing required fields: publicUrl, models, stakeAmount'
        });
        return;
      }

      // Prepare registration config
      const config: RegistrationConfig = {
        apiUrl: publicUrl,
        models: Array.isArray(models) ? models : [models],
        stakeAmount: ethers.parseEther(stakeAmount.toString()),
        metadata
      };

      // Call existing registration command
      const result = await executeRegistration(config);

      res.json({
        transactionHash: result.transactionHash,
        hostAddress: walletAddress,
        success: result.success
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Registration failed' });
    }
  }

  private async handleUnregister(req: Request, res: Response): Promise<void> {
    // TODO: Refactor commands/unregister.ts to export executeUnregister() function
    // Current implementation has logic inside registerUnregisterCommand action
    // Need to extract core logic into exportable async function similar to executeRegistration()
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Unregister endpoint requires CLI command refactoring to export callable function'
    });
  }

  private async handleAddStake(req: Request, res: Response): Promise<void> {
    // TODO: Refactor commands/add-stake.ts to export executeAddStake(amount, options) function
    // Current implementation has logic inside registerAddStakeCommand action
    // Need to extract core logic into exportable async function
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Add-stake endpoint requires CLI command refactoring to export callable function'
    });
  }

  private async handleWithdrawEarnings(req: Request, res: Response): Promise<void> {
    try {
      const { amount } = req.body;

      // Parse amount if provided, otherwise withdraw all
      let amountBigInt: bigint | undefined;
      if (amount && amount !== 'all') {
        try {
          amountBigInt = ethers.parseEther(amount.toString());
        } catch {
          res.status(400).json({ error: 'Invalid amount format' });
          return;
        }
      }

      // Call existing withdraw command
      const result = await withdrawHostEarnings(amountBigInt);

      if (result.success) {
        res.json({
          success: true,
          amount: ethers.formatEther(result.actualAmount || 0n),
          transactionHash: result.transactionHash
        });
      } else {
        res.status(500).json({
          error: result.error || 'Withdrawal failed'
        });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to withdraw earnings' });
    }
  }

  private async handleUpdateModels(req: Request, res: Response): Promise<void> {
    // TODO: Refactor commands/update-models.ts to export executeUpdateModels(models, options) function
    // Current implementation has logic inside registerUpdateModelsCommand action
    // Need to extract core logic into exportable async function
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Update-models endpoint requires CLI command refactoring to export callable function'
    });
  }

  private async handleUpdateMetadata(req: Request, res: Response): Promise<void> {
    // TODO: Refactor commands/update-metadata.ts to export executeUpdateMetadata(metadata, options) function
    // Current implementation has logic inside registerUpdateMetadataCommand action
    // Need to extract core logic into exportable async function
    res.status(501).json({
      error: 'Not Implemented',
      message: 'Update-metadata endpoint requires CLI command refactoring to export callable function'
    });
  }

  private async handleDiscoverNodes(req: Request, res: Response): Promise<void> {
    try {
      // Get HostManager from SDK
      const sdk = getSDK();
      if (!sdk.isAuthenticated()) {
        res.status(401).json({ error: 'SDK not authenticated' });
        return;
      }

      const hostManager = getHostManager();

      // Discover all active hosts
      const hosts = await hostManager.discoverAllActiveHosts();

      res.json({
        hosts,
        count: hosts.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to discover nodes' });
    }
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.config.port, () => {
          this.startTime = Date.now();
          resolve();
        });

        this.server.on('error', (error) => {
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      const server = this.server;
      this.server = null;
      this.startTime = 0;

      server.close((error: any) => {
        // Ignore ERR_SERVER_NOT_RUNNING error (server already stopped)
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get the HTTP server instance
   * Used to attach WebSocket server to the same port
   */
  getHttpServer(): Server {
    if (!this.server) {
      throw new Error('Server not started. Call start() first.');
    }
    return this.server;
  }
}
