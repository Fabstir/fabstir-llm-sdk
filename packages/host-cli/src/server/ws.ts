/**
 * WebSocket Log Server (Sub-phase 2.1)
 * Provides real-time log streaming via WebSocket
 */

import WebSocket, { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { parse as parseUrl } from 'url';

/**
 * Configuration for WebSocket server
 */
export interface WebSocketConfig {
  path?: string;
  apiKey?: string;
}

/**
 * LogWebSocketServer manages WebSocket connections for log streaming
 *
 * Features:
 * - Optional API key authentication
 * - Broadcast messages to all connected clients
 * - Clean disconnection handling
 * - Connection lifecycle management
 */
export class LogWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private httpServer: Server;
  private apiKey?: string;
  private path: string;

  /**
   * Create a new LogWebSocketServer
   *
   * @param server - HTTP server to attach WebSocket server to
   * @param apiKey - Optional API key for authentication
   * @param path - WebSocket endpoint path (default: /ws/logs)
   */
  constructor(server: Server, apiKey?: string, path: string = '/ws/logs') {
    this.httpServer = server;
    this.apiKey = apiKey;
    this.path = path;
  }

  /**
   * Start the WebSocket server
   */
  start(): void {
    if (this.wss) {
      throw new Error('WebSocket server already started');
    }

    // Create WebSocket server with authentication verification
    this.wss = new WebSocketServer({
      server: this.httpServer,
      path: this.path,
      verifyClient: (info) => {
        // If API key is required, verify it before accepting connection
        if (this.apiKey) {
          return this.authenticate(info.req);
        }
        return true;
      }
    });

    // Handle new connections (already authenticated by verifyClient)
    this.wss.on('connection', (ws: WebSocket, request) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket server error:', error);
    });
  }

  /**
   * Stop the WebSocket server and close all connections
   */
  stop(): void {
    if (!this.wss) {
      return;
    }

    // Close all client connections
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    // Close WebSocket server
    this.wss.close();
    this.wss = null;
  }

  /**
   * Broadcast a message to all connected clients
   *
   * @param message - Message object to broadcast (will be JSON stringified)
   */
  broadcast(message: any): void {
    if (!this.wss) {
      return;
    }

    const data = JSON.stringify(message);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (error) {
          console.error('Error sending message to client:', error);
        }
      }
    }
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Handle new WebSocket connection
   * Note: Authentication already handled by verifyClient in start()
   *
   * @private
   */
  private handleConnection(ws: WebSocket, request: any): void {
    // Add client to set
    this.clients.add(ws);

    // Handle client messages (if needed for future features)
    ws.on('message', (data: WebSocket.RawData) => {
      // For now, just acknowledge receipt
      // Future: Could handle client commands here
    });

    // Handle client disconnection
    ws.on('close', () => {
      this.handleDisconnection(ws);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket client error:', error);
      this.handleDisconnection(ws);
    });
  }

  /**
   * Handle client disconnection
   *
   * @private
   */
  private handleDisconnection(ws: WebSocket): void {
    this.clients.delete(ws);
  }

  /**
   * Authenticate a WebSocket connection
   *
   * @private
   * @param request - HTTP upgrade request
   * @returns true if authenticated, false otherwise
   */
  private authenticate(request: any): boolean {
    if (!this.apiKey) {
      return true; // No authentication required
    }

    // Parse URL to get query parameters
    const url = parseUrl(request.url || '', true);
    const queryApiKey = url.query.apiKey as string | undefined;

    // Check query parameter
    if (queryApiKey === this.apiKey) {
      return true;
    }

    // Check authorization header
    const authHeader = request.headers['authorization'];
    if (authHeader === `Bearer ${this.apiKey}`) {
      return true;
    }

    return false;
  }
}
