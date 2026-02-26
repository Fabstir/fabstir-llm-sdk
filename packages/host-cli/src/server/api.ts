// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Management API Server (Sub-phases 1.1, 1.2 & 1.3)
 * Express server with health endpoint and CORS support
 */

import express, { type Request, type Response, type NextFunction, type Application } from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { PIDManager } from '../daemon/pid';
import { ConfigData } from '../config/types';
import { startHost } from '../commands/start';
import { stopCommand } from '../commands/stop';
import type { RegistrationConfig } from '../registration/manager';
import { withdrawHostEarnings } from '../commands/withdraw';
import { getSDK, getHostManager, authenticateSDK, initializeSDK } from '../sdk/client';
import { ethers } from 'ethers';
import { DEFAULT_PRICE_PER_TOKEN, MIN_PRICE_PER_TOKEN, MAX_PRICE_PER_TOKEN, DEFAULT_PRICE_PER_TOKEN_NUMBER } from '@fabstir/sdk-core';

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
    this.app.post('/api/update-pricing', this.handleUpdatePricing.bind(this));
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

      // Call existing startHost command with skipWait to return immediately
      await startHost({ daemon, skipWait: true });

      // Wait for PID file to be written
      // (startHost now verifies process is running before saving PID)
      await new Promise(resolve => setTimeout(resolve, 2500));

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
      const { walletAddress, publicUrl, models, stakeAmount, metadata, privateKey, minPricePerTokenNative, minPricePerTokenStable } = req.body;

      // Debug log incoming request
      console.log('[API] Register request body:', {
        walletAddress,
        publicUrl,
        models,
        stakeAmount,
        metadata,
        privateKey: privateKey ? '***' : undefined,
        minPricePerTokenNative,
        minPricePerTokenStable
      });

      // Validate required fields
      if (!publicUrl || !models) {
        res.status(400).json({
          error: 'Missing required fields: publicUrl, models'
        });
        return;
      }

      if (!privateKey) {
        res.status(400).json({
          error: 'Missing required field: privateKey (needed for registration)'
        });
        return;
      }

      // Validate and parse stakeAmount
      let stakeAmountBigInt: bigint | undefined;
      if (stakeAmount !== undefined && stakeAmount !== null && stakeAmount !== '') {
        try {
          // Convert string stake amount to BigInt (in wei)
          const stakeAmountStr = stakeAmount.toString().trim();
          if (stakeAmountStr && parseFloat(stakeAmountStr) > 0) {
            stakeAmountBigInt = ethers.parseEther(stakeAmountStr);
          }
        } catch (error) {
          res.status(400).json({
            error: `Invalid stake amount: ${stakeAmount}. Must be a valid number.`
          });
          return;
        }
      }

      // Initialize and authenticate SDK with provided private key
      await initializeSDK('base-sepolia');
      await authenticateSDK(privateKey);

      // Import necessary functions
      const { registerHost } = await import('../registration/manager');
      const { saveConfig, loadConfig } = await import('../config/storage');
      const { extractHostPort } = await import('../utils/network');

      // Validate dual pricing fields
      if (!minPricePerTokenNative || !minPricePerTokenStable) {
        res.status(400).json({
          error: 'Missing required pricing fields: minPricePerTokenNative, minPricePerTokenStable'
        });
        return;
      }

      // Prepare registration config with dual pricing
      const registrationConfig: RegistrationConfig = {
        apiUrl: publicUrl,
        models: Array.isArray(models) ? models : [models],
        stakeAmount: stakeAmountBigInt,  // Will use default in registerHost if undefined
        metadata,
        minPricePerTokenNative,
        minPricePerTokenStable
      };

      // Register on blockchain (WITHOUT starting node)
      const result = await registerHost(registrationConfig);

      // Save config file (so node can start later)
      const currentConfig = await loadConfig();
      const internalPort = process.env.INTERNAL_PORT
        ? parseInt(process.env.INTERNAL_PORT, 10)
        : extractHostPort(publicUrl).port;

      const configData: ConfigData = {
        version: '1.0',
        walletAddress: walletAddress || currentConfig?.walletAddress || '',
        network: 'base-sepolia' as const,
        rpcUrl: process.env.RPC_URL_BASE_SEPOLIA || '',
        inferencePort: internalPort,
        publicUrl: publicUrl,
        models: Array.isArray(models) ? models : [models],
        pricePerToken: 0.0001,
        minJobDeposit: 0.01,
        ...(currentConfig || {}), // Merge with existing config if it exists
      };
      await saveConfig(configData);

      res.json({
        transactionHash: result.transactionHash,
        hostAddress: walletAddress,
        success: true
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

  private async handleUpdatePricing(_req: Request, res: Response): Promise<void> {
    // Phase 18: Per-host base pricing removed. Use set-model-pricing command instead.
    res.status(501).json({
      error: 'Deprecated',
      message: 'Per-host base pricing removed in Phase 18. Use set-model-pricing (per-model per-token) instead.'
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
        // Bind to 0.0.0.0 for Docker compatibility (accessible from host)
        this.server = this.app.listen(this.config.port, '0.0.0.0', () => {
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
