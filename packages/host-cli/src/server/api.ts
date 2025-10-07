/**
 * Management API Server (Sub-phase 1.1)
 * Express server with health endpoint and CORS support
 */

import express, { type Request, type Response, type NextFunction, type Application } from 'express';
import cors from 'cors';
import type { Server } from 'http';

/**
 * Server configuration interface
 */
export interface ServerConfig {
  port: number;
  corsOrigins: string[];
  apiKey?: string;
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

  constructor(config: ServerConfig) {
    this.config = config;
    this.app = express();

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
