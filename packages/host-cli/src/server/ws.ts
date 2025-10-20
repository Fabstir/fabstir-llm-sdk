// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * WebSocket Log Server (Sub-phases 2.1 & 2.2)
 * Provides real-time log streaming via WebSocket with log file tailing
 */

import WebSocket, { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { parse as parseUrl } from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { Tail } from 'tail';

/**
 * Configuration for WebSocket server
 */
export interface WebSocketConfig {
  path?: string;
  apiKey?: string;
  logDir?: string;
}

/**
 * LogTailer class for tailing log files and emitting new lines
 * Watches both stdout and stderr log files
 */
class LogTailer {
  private stdoutTail: Tail | null = null;
  private stderrTail: Tail | null = null;
  private logDir: string;
  private callback: (line: string, level: 'stdout' | 'stderr') => void;
  private stdoutPath: string = '';
  private stderrPath: string = '';

  constructor(logDir: string, callback: (line: string, level: 'stdout' | 'stderr') => void) {
    this.logDir = logDir;
    this.callback = callback;
  }

  /**
   * Start tailing log files
   * Finds the most recent .out.log and .err.log files in the log directory
   */
  start(): void {
    if (!fs.existsSync(this.logDir)) {
      console.warn(`Log directory does not exist: ${this.logDir}`);
      return;
    }

    // Find most recent log files
    this.stdoutPath = this.findMostRecentLog('.out.log');
    this.stderrPath = this.findMostRecentLog('.err.log');

    // Start tailing stdout if file exists
    if (this.stdoutPath && fs.existsSync(this.stdoutPath)) {
      this.stdoutTail = new Tail(this.stdoutPath, {
        follow: true,
        useWatchFile: true, // More reliable than fs.watch
        fsWatchOptions: {
          interval: 100 // Poll every 100ms
        }
      });

      this.stdoutTail.on('line', (line: string) => {
        this.callback(line, 'stdout');
      });

      this.stdoutTail.on('error', (error: Error) => {
        console.error('Stdout tail error:', error);
      });
    }

    // Start tailing stderr if file exists
    if (this.stderrPath && fs.existsSync(this.stderrPath)) {
      this.stderrTail = new Tail(this.stderrPath, {
        follow: true,
        useWatchFile: true,
        fsWatchOptions: {
          interval: 100
        }
      });

      this.stderrTail.on('line', (line: string) => {
        this.callback(line, 'stderr');
      });

      this.stderrTail.on('error', (error: Error) => {
        console.error('Stderr tail error:', error);
      });
    }
  }

  /**
   * Stop tailing log files
   */
  stop(): void {
    if (this.stdoutTail) {
      this.stdoutTail.unwatch();
      this.stdoutTail = null;
    }
    if (this.stderrTail) {
      this.stderrTail.unwatch();
      this.stderrTail = null;
    }
  }

  /**
   * Read last N lines from both stdout and stderr log files
   * @param lines - Number of lines to read from each file
   * @returns Array of historical log lines
   */
  readLastLines(lines: number = 50): string[] {
    const result: string[] = [];

    // Read from stdout log
    if (this.stdoutPath && fs.existsSync(this.stdoutPath)) {
      const stdoutLines = this.readLastLinesFromFile(this.stdoutPath, lines);
      result.push(...stdoutLines.map(line => `[stdout] ${line}`));
    }

    // Read from stderr log
    if (this.stderrPath && fs.existsSync(this.stderrPath)) {
      const stderrLines = this.readLastLinesFromFile(this.stderrPath, lines);
      result.push(...stderrLines.map(line => `[stderr] ${line}`));
    }

    return result;
  }

  /**
   * Read last N lines from a single file
   * @private
   */
  private readLastLinesFromFile(filepath: string, lines: number): string[] {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const allLines = content.split('\n').filter(line => line.trim() !== '');
      return allLines.slice(-lines);
    } catch (error) {
      console.error(`Error reading file ${filepath}:`, error);
      return [];
    }
  }

  /**
   * Find most recent log file with given extension
   * @private
   */
  private findMostRecentLog(extension: string): string {
    try {
      const files = fs.readdirSync(this.logDir)
        .filter(f => f.endsWith(extension))
        .map(f => ({
          name: f,
          path: path.join(this.logDir, f),
          mtime: fs.statSync(path.join(this.logDir, f)).mtime
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      return files.length > 0 ? files[0].path : '';
    } catch (error) {
      console.error(`Error finding log files in ${this.logDir}:`, error);
      return '';
    }
  }
}

/**
 * LogWebSocketServer manages WebSocket connections for log streaming
 *
 * Features:
 * - Optional API key authentication
 * - Broadcast messages to all connected clients
 * - Clean disconnection handling
 * - Connection lifecycle management
 * - Real-time log file tailing and broadcasting
 * - Historical log delivery on connection
 */
export class LogWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private httpServer: Server;
  private apiKey?: string;
  private path: string;
  private logDir?: string;
  private tailer: LogTailer | null = null;

  /**
   * Create a new LogWebSocketServer
   *
   * @param server - HTTP server to attach WebSocket server to
   * @param apiKey - Optional API key for authentication
   * @param path - WebSocket endpoint path (default: /ws/logs)
   * @param logDir - Optional log directory to tail (default: /root/.fabstir/logs)
   */
  constructor(server: Server, apiKey?: string, path: string = '/ws/logs', logDir?: string) {
    this.httpServer = server;
    this.apiKey = apiKey;
    this.path = path;
    this.logDir = logDir || '/root/.fabstir/logs';
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
      verifyClient: (info: { origin: string; secure: boolean; req: any }) => {
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

    // Stop log tailing
    if (this.tailer) {
      this.tailer.stop();
      this.tailer = null;
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

    // Start tailing if this is the first client
    if (this.clients.size === 1 && !this.tailer && this.logDir) {
      this.tailer = new LogTailer(this.logDir, (line: string, level: 'stdout' | 'stderr') => {
        this.onLogLine(line, level);
      });
      this.tailer.start();
    }

    // Send historical logs on connection
    if (this.logDir && this.tailer) {
      const historicalLines = this.tailer.readLastLines(50);
      if (historicalLines.length > 0) {
        ws.send(JSON.stringify({
          type: 'history',
          lines: historicalLines
        }));
      }
    }

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

    // Stop tailing if no clients remain
    if (this.clients.size === 0 && this.tailer) {
      this.tailer.stop();
      this.tailer = null;
    }
  }

  /**
   * Handle new log line from tailer
   * Broadcast to all connected clients
   *
   * @private
   */
  private onLogLine(line: string, level: 'stdout' | 'stderr'): void {
    const message = {
      type: 'log',
      timestamp: new Date().toISOString(),
      level,
      message: line
    };

    this.broadcast(message);
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
