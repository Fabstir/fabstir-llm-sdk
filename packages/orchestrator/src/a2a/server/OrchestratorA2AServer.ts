import express from 'express';
import type { Request, Response, Express } from 'express';
import type { Server } from 'http';
import type { OrchestratorManager } from '../../core/OrchestratorManager';
import { OrchestratorExecutor } from './OrchestratorExecutor';
import { SSEEventBus } from './SSEEventBus';
import { buildAgentCard } from './agentCard';
import type { A2AAgentCard } from '../types';
import type { X402PricingConfig, X402PaymentResponse } from '../../x402/types';
import { decodeX402Payment, validatePayloadFields } from '../../x402/server/X402PaymentGate';

export interface A2AServerOptions {
  publicUrl: string;
  port?: number;
  agentName?: string;
  walletAddress?: string;
  x402Pricing?: X402PricingConfig;
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
  private readonly executor: OrchestratorExecutor;
  private readonly activeTasks = new Map<string, AbortController>();
  private server: Server | null = null;
  private jwtVerifier: (token: string) => boolean = () => false;

  constructor(manager: OrchestratorManager, options: A2AServerOptions) {
    this.manager = manager;
    this.options = options;
    this.app = express();
    this.app.use(express.json());
    this.executor = new OrchestratorExecutor(manager);

    this.card = buildAgentCard({
      publicUrl: options.publicUrl,
      agentName: options.agentName,
      x402Pricing: options.x402Pricing,
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
      const x402Cfg = this.options.x402Pricing;
      let paidViaX402 = false;

      if (x402Cfg) {
        const paymentHeader = req.headers['x-payment'] as string | undefined;
        if (paymentHeader) {
          try {
            const payload = decodeX402Payment(paymentHeader);
            validatePayloadFields(payload, x402Cfg);
            paidViaX402 = true;
          } catch {
            res.status(402).json({ x402Version: 1, accepts: this.card.x402!.accepts, error: 'Invalid payment' });
            return;
          }
        } else {
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ') || !this.jwtVerifier(authHeader.slice(7))) {
            res.status(402).json({ x402Version: 1, accepts: this.card.x402!.accepts, error: 'Payment required' });
            return;
          }
        }
      } else {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          res.status(401).json({ error: 'Missing or invalid authorization header' });
          return;
        }
        if (!this.jwtVerifier(authHeader.slice(7))) {
          res.status(401).json({ error: 'Invalid JWT token' });
          return;
        }
      }

      const { goal } = req.body;
      if (!goal) {
        res.status(400).json({ error: 'Missing goal in request body' });
        return;
      }

      if (req.headers.accept?.includes('text/event-stream')) {
        const taskId = globalThis.crypto.randomUUID();
        const bus = new SSEEventBus(res);
        const ctx = { task: { id: taskId }, message: { parts: [{ type: 'text', text: goal }] } };
        this.activeTasks.set(taskId, new AbortController());

        req.on('close', () => this.executor.cancelTask(taskId, bus));

        try {
          await this.executor.execute(ctx, bus);
        } finally {
          bus.close();
          this.activeTasks.delete(taskId);
        }
        return;
      }

      try {
        const result = await this.manager.orchestrate(goal);
        if (paidViaX402) {
          const payResp: X402PaymentResponse = { success: true, network: x402Cfg!.network };
          res.setHeader('X-PAYMENT-RESPONSE', btoa(JSON.stringify(payResp)));
        }
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

    const cancelHandler = async (req: Request, res: Response) => {
      const taskId = req.params.taskId as string;
      if (!this.activeTasks.has(taskId)) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }
      this.executor.cancelTask(taskId, { publish() {} });
      res.json({ status: 'cancelled', taskId });
    };
    this.routes.push({ path: '/v1/orchestrate/:taskId', method: 'DELETE', handler: cancelHandler });
    this.app.delete('/v1/orchestrate/:taskId', cancelHandler);
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
