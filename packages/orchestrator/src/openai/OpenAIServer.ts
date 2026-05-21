// OpenAI-compatible HTTP surface — a sibling express app that owns its own
// SessionPool + ModelRouter directly (NOT via OrchestratorManager.initialize(),
// which forces a planning model + maxConcurrentSessions≥2 a chat daemon needn't).
import express from 'express';
import type { Express, Request, Response } from 'express';
import type { Server } from 'http';
import type { SessionPool } from '../core/SessionPool';
import type { ModelRouter } from '../core/ModelRouter';
import { ChatCompletionsHandler, ChatHandlerConfig } from './chat-completions';
import { ImagesHandler, ImagesConfig } from './images';
import { ResponsesHandler, ResponsesConfig } from './responses';
import { makeAuthGate, AuthGate } from './gating';

export interface OpenAIServerDeps {
  pool: SessionPool;
  modelRouter: Pick<ModelRouter, 'getAvailableModels'>;
  config: ChatHandlerConfig & Pick<ImagesConfig, 'imageModel'> & Pick<ResponsesConfig, 'defaultModel'>;
  /** Optional authorize-gate; when set, gates the inference routes (5.3). */
  gate?: AuthGate;
}

export class OpenAIServer {
  readonly app: Express;
  private readonly chat: ChatCompletionsHandler;
  private readonly images: ImagesHandler;
  private readonly responses: ResponsesHandler;
  private server: Server | null = null;

  constructor(private readonly deps: OpenAIServerDeps) {
    this.chat = new ChatCompletionsHandler({ pool: deps.pool, config: deps.config });
    this.images = new ImagesHandler({ pool: deps.pool, config: deps.config });
    this.responses = new ResponsesHandler({ pool: deps.pool, config: deps.config });
    this.app = express();
    this.app.use(express.json({ limit: '10mb' }));
    this.registerRoutes();
  }

  private registerRoutes(): void {
    // Gate inference routes (NOT /v1/models or the control plane) until authorized.
    const gated = this.deps.gate ? [makeAuthGate(this.deps.gate)] : [];
    this.app.post('/v1/chat/completions', ...gated, (req: Request, res: Response) => this.chat.handle(req, res as any));
    this.app.post('/v1/images/generations', ...gated, (req: Request, res: Response) => this.images.handle(req, res as any));
    this.app.post('/v1/responses', ...gated, (req: Request, res: Response) => this.responses.handle(req, res as any));
    this.app.get('/v1/models', (req: Request, res: Response) => this.handleModels(req, res));
  }

  /** GET /v1/models — the models the pool can actually serve (≥1 host), OpenAI-shaped. */
  async handleModels(_req: any, res: any): Promise<void> {
    const created = Math.floor(Date.now() / 1000);
    const data = this.deps.modelRouter.getAvailableModels().map(id => ({
      id, object: 'model', created, owned_by: 'fabstir',
    }));
    res.status(200).json({ object: 'list', data });
  }

  async start(port: number, host = '127.0.0.1'): Promise<void> {
    await new Promise<void>(resolve => { this.server = this.app.listen(port, host, () => resolve()); });
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => this.server!.close(err => (err ? reject(err) : resolve())));
    this.server = null;
  }
}
