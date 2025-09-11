/**
 * Unified Bridge Server - Combines P2P and Proof services
 * Provides a single endpoint for browser clients to access server-only features
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { P2PBridgeServer } from '../p2p/P2PBridgeServer';
import { ProofBridgeServer } from '../proof/ProofBridgeServer';
import { EventEmitter } from 'events';

export interface BridgeConfig {
  port?: number;
  p2pConfig?: any;
  proofConfig?: any;
  corsOrigin?: string;
}

export class UnifiedBridgeServer extends EventEmitter {
  private app: express.Application;
  private httpServer: any;
  private wss?: WebSocketServer;
  private p2pBridge: P2PBridgeServer;
  private proofBridge: ProofBridgeServer;
  private running = false;
  private config: BridgeConfig;
  
  constructor(config: BridgeConfig = {}) {
    super();
    this.config = {
      port: config.port || 3000,
      corsOrigin: config.corsOrigin || '*',
      ...config
    };
    
    this.app = express();
    this.p2pBridge = new P2PBridgeServer(config.p2pConfig);
    this.proofBridge = new ProofBridgeServer(config.proofConfig);
    
    this.setupMiddleware();
    this.setupRoutes();
  }
  
  private setupMiddleware(): void {
    // JSON body parser
    this.app.use(express.json());
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', this.config.corsOrigin);
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      
      next();
    });
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }
  
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        services: {
          p2p: this.p2pBridge ? 'available' : 'unavailable',
          proof: this.proofBridge ? 'available' : 'unavailable',
          websocket: this.wss ? 'available' : 'unavailable'
        },
        uptime: process.uptime()
      });
    });
    
    // Service info
    this.app.get('/info', (req, res) => {
      res.json({
        name: '@fabstir/sdk-node Bridge Server',
        version: '1.0.0',
        capabilities: [
          'p2p-networking',
          'ezkl-proof-generation',
          'websocket-streaming'
        ],
        endpoints: {
          p2p: '/api/p2p',
          proof: '/api/proof',
          websocket: `ws://localhost:${this.config.port}/ws`
        }
      });
    });
    
    // Mount proof service routes
    this.app.use('/api/proof', this.createProofRouter());
    
    // P2P endpoints (REST fallback for non-WebSocket operations)
    this.app.use('/api/p2p', this.createP2PRouter());
  }
  
  private createProofRouter(): express.Router {
    const router = express.Router();
    
    // Forward to proof bridge
    router.post('/generate', async (req, res) => {
      try {
        // The proof bridge handles this internally
        // Here we just forward the request
        const proofApp = (this.proofBridge as any).app;
        const handler = proofApp._router.stack.find((r: any) => 
          r.route && r.route.path === '/proof/generate'
        );
        
        if (handler) {
          handler.route.stack[0].handle(req, res);
        } else {
          res.status(500).json({ error: 'Proof service not available' });
        }
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    router.get('/status/:id', (req, res) => {
      const proofApp = (this.proofBridge as any).app;
      const handler = proofApp._router.stack.find((r: any) => 
        r.route && r.route.path === '/proof/status/:id'
      );
      
      if (handler) {
        handler.route.stack[0].handle(req, res);
      } else {
        res.status(500).json({ error: 'Proof service not available' });
      }
    });
    
    router.get('/result/:id', (req, res) => {
      const proofApp = (this.proofBridge as any).app;
      const handler = proofApp._router.stack.find((r: any) => 
        r.route && r.route.path === '/proof/result/:id'
      );
      
      if (handler) {
        handler.route.stack[0].handle(req, res);
      } else {
        res.status(500).json({ error: 'Proof service not available' });
      }
    });
    
    return router;
  }
  
  private createP2PRouter(): express.Router {
    const router = express.Router();
    
    router.get('/status', async (req, res) => {
      try {
        // Get P2P status
        const status = {
          connected: true, // Would check actual P2P node
          peers: 0,
          nodeId: 'mock-node-id'
        };
        res.json(status);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    router.post('/discover', async (req, res) => {
      try {
        // Mock discovery for now
        const nodes = [
          {
            id: 'node-1',
            address: 'ws://localhost:8080',
            capabilities: ['llm-inference']
          }
        ];
        res.json({ nodes, source: 'mock' });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    return router;
  }
  
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Server already running');
    }
    
    const port = this.config.port!;
    
    // Create HTTP server
    this.httpServer = createServer(this.app);
    
    // Setup WebSocket server for P2P bridge
    this.wss = new WebSocketServer({ 
      server: this.httpServer,
      path: '/ws'
    });
    
    // Start P2P bridge with WebSocket server
    await this.p2pBridge.start(port + 1); // Use different port for P2P
    
    // WebSocket connection handling
    this.wss.on('connection', (ws, req) => {
      console.log('WebSocket client connected');
      
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Route to appropriate service
          if (message.service === 'p2p') {
            // Forward to P2P bridge
            this.handleP2PMessage(ws, message);
          } else if (message.service === 'proof') {
            // Forward to proof bridge
            this.handleProofMessage(ws, message);
          } else {
            ws.send(JSON.stringify({
              error: 'Unknown service',
              service: message.service
            }));
          }
        } catch (error: any) {
          ws.send(JSON.stringify({
            error: error.message
          }));
        }
      });
      
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
      });
    });
    
    // Start HTTP server
    await new Promise<void>((resolve, reject) => {
      this.httpServer.listen(port, () => {
        this.running = true;
        console.log(`Unified Bridge Server listening on port ${port}`);
        console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
        console.log(`REST endpoints: http://localhost:${port}/api/*`);
        resolve();
      }).on('error', reject);
    });
  }
  
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    
    // Stop P2P bridge
    await this.p2pBridge.stop();
    
    // Stop proof bridge
    await this.proofBridge.stop();
    
    // Close WebSocket server
    if (this.wss) {
      this.wss.close();
    }
    
    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          resolve();
        });
      });
    }
    
    this.running = false;
    console.log('Unified Bridge Server stopped');
  }
  
  private handleP2PMessage(ws: any, message: any): void {
    // Forward P2P messages to P2P bridge
    // In a real implementation, would maintain connection to P2P bridge
    ws.send(JSON.stringify({
      type: 'p2p_response',
      data: {
        message: 'P2P message received',
        original: message
      }
    }));
  }
  
  private handleProofMessage(ws: any, message: any): void {
    // Forward proof messages to proof bridge
    ws.send(JSON.stringify({
      type: 'proof_response',
      data: {
        message: 'Proof message received',
        original: message
      }
    }));
  }
}