/**
 * Management API Server (Sub-phases 1.1 & 1.2)
 * Express server with health endpoint and CORS support
 */

import express, { type Request, type Response, type NextFunction, type Application } from 'express';
import cors from 'cors';
import type { Server } from 'http';
import { PIDManager } from '../daemon/pid';

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

      this.server.close((error) => {
        this.server = null;
        this.startTime = 0;

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}
