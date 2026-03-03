import express from 'express';
import type { Request, Response, Express } from 'express';
import type { Server } from 'http';
import type { OrchestratorManager } from '../../core/OrchestratorManager';
import { buildAgentCard } from './agentCard';
import type { A2AAgentCard } from '../types';

export interface A2AServerOptions {
  publicUrl: string;
  port?: number;
  agentName?: string;
  walletAddress?: string;
}

interface RouteEntry {
  path: string;
  method: string;
  handler: (req: Request, res: Response) => Promise<void>;
}

export class OrchestratorA2AServer {
  private readonly manager: OrchestratorManager;
  private readonly options: A2AServerOptions;
  private readonly app: Express;
  private readonly card: A2AAgentCard;
  private readonly routes: RouteEntry[] = [];
  private server: Server | null = null;
  private jwtVerifier: (token: string) => boolean = () => false;

  constructor(manager: OrchestratorManager, options: A2AServerOptions) {
    this.manager = manager;
    this.options = options;
    this.app = express();
    this.app.use(express.json());

    this.card = buildAgentCard({
      publicUrl: options.publicUrl,
      agentName: options.agentName,
    });

    this.setupRoutes();
  }

  private setupRoutes(): void {
    const agentCardHandler = async (_req: Request, res: Response) => {
      res.json(this.card);
    };
    this.routes.push({ path: '/.well-known/agent.json', method: 'GET', handler: agentCardHandler });
    this.app.get('/.well-known/agent.json', agentCardHandler);

    const orchestrateHandler = async (req: Request, res: Response) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
      }

      const token = authHeader.slice(7);
      if (!this.jwtVerifier(token)) {
        res.status(401).json({ error: 'Invalid JWT token' });
        return;
      }

      const { goal } = req.body;
      if (!goal) {
        res.status(400).json({ error: 'Missing goal in request body' });
        return;
      }

      try {
        const result = await this.manager.orchestrate(goal);
        res.json({
          taskGraphId: result.taskGraphId,
          synthesis: result.synthesis,
          proofCIDs: result.proofCIDs,
          totalTokensUsed: result.totalTokensUsed,
        });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    };
    this.routes.push({ path: '/v1/orchestrate', method: 'POST', handler: orchestrateHandler });
    this.app.post('/v1/orchestrate', orchestrateHandler);
  }

  async start(): Promise<void> {
    const port = this.options.port ?? 3000;
    return new Promise((resolve) => {
      this.server = this.app.listen(port, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      return new Promise((resolve) => {
        this.server!.close(() => resolve());
        this.server = null;
      });
    }
  }

  isListening(): boolean {
    return this.server !== null && this.server.listening;
  }

  getApp(): Express {
    return this.app;
  }

  getRoutes(): RouteEntry[] {
    return this.routes;
  }

  getRouteHandler(path: string): (req: Request, res: Response) => Promise<void> {
    const route = this.routes.find(r => r.path === path);
    if (!route) throw new Error(`No route for ${path}`);
    return route.handler;
  }

  getAgentCard(): A2AAgentCard {
    return this.card;
  }

  setJwtVerifier(verifier: (token: string) => boolean): void {
    this.jwtVerifier = verifier;
  }
}
