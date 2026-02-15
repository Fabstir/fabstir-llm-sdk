import http from 'http';
import { handleMessages } from './handler';
import type { SessionBridge } from './session-bridge';

export class BridgeServer {
  private server?: http.Server;
  private port: number;
  private bridge: SessionBridge;
  private apiKey?: string;
  private actualPort = 0;

  constructor(port: number, bridge: SessionBridge, apiKey?: string) {
    this.port = port;
    this.bridge = bridge;
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

  getPort(): number {
    return this.actualPort;
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
      this.server = undefined;
    });
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const fullUrl = req.url || '';
    const method = req.method || '';
    const url = fullUrl.split('?')[0];

    console.log(`[BridgeServer] ${method} ${fullUrl}`);

    // CORS preflight
    if (method === 'OPTIONS' && url === '/v1/messages') {
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type, x-api-key, anthropic-version',
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

    // Messages endpoint
    if (url === '/v1/messages') {
      if (method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'Method not allowed' } }));
        return;
      }

      // API key check
      if (this.apiKey) {
        const key = req.headers['x-api-key'];
        if (key !== this.apiKey) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'Invalid API key' } }));
          return;
        }
      }

      handleMessages(req, res, this.bridge).catch((err) => {
        console.error('[BridgeServer] Unhandled error:', err);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: 'Internal server error' } }));
        }
      });
      return;
    }

    // 404
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'Not found' } }));
  }
}
