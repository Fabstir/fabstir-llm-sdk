import http from 'http';
import { handleChatCompletions } from './openai-handler';
import { handleImageGeneration } from './image-handler';
import { handleResponses } from './responses-handler';
import type { SessionBridge } from './session-bridge';

export class BridgeServer {
  private server?: http.Server;
  private port: number;
  private bridge: SessionBridge;
  private modelName: string;
  private apiKey?: string;
  private actualPort = 0;

  constructor(port: number, bridge: SessionBridge, modelName: string, apiKey?: string) {
    this.port = port;
    this.bridge = bridge;
    this.modelName = modelName;
    this.apiKey = apiKey;
  }

  async start(): Promise<void> {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    return new Promise((resolve) => {
      this.server!.listen(this.port, '0.0.0.0', () => {
        const addr = this.server!.address() as { port: number };
        this.actualPort = addr.port;
        resolve();
      });
    });
  }

  getPort(): number { return this.actualPort; }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.server = undefined;
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = (req.url || '').split('?')[0];
    const method = req.method || '';
    console.log(`[${new Date().toISOString()}] ${method} ${url} | ct=${req.headers['content-type'] || '-'} | auth=${req.headers['authorization'] ? 'yes' : 'no'}`);

    // CORS preflight
    if (method === 'OPTIONS') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, authorization',
      });
      res.end();
      return;
    }

    // Health check
    if (url === '/health' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Models list
    if (url === '/v1/models' && method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: this.modelName, object: 'model' }] }));
      return;
    }

    // POST endpoints: validate content-type and API key
    if (method === 'POST' && (url === '/v1/chat/completions' || url === '/v1/images/generations' || url === '/v1/responses')) {
      const ct = req.headers['content-type'] || '';
      if (!ct.includes('application/json')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'Content-Type must be application/json', type: 'invalid_request_error' } }));
        return;
      }
      if (this.apiKey) {
        const auth = req.headers['authorization'] || '';
        const token = auth.replace(/^Bearer\s+/i, '');
        if (token !== this.apiKey) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Invalid API key', type: 'authentication_error' } }));
          return;
        }
      }

      const handler = url === '/v1/chat/completions' ? handleChatCompletions
        : url === '/v1/responses' ? handleResponses : handleImageGeneration;
      handler(req, res, this.bridge).catch((err) => {
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Internal server error', type: 'server_error' } }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Not found', type: 'not_found_error' } }));
  }
}
