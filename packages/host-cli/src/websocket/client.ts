// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

export interface WebSocketOptions {
  headers?: { [key: string]: string };
  timeout?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
  pongTimeout?: number;
}

export interface ConnectionConfig {
  url: string;
  options?: WebSocketOptions;
  maxReconnectAttempts?: number;
}

export interface ConnectionInfo {
  url: string;
  state: ConnectionState;
  connectedAt?: Date;
  disconnectedAt?: Date;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'disconnecting';

export class WebSocketClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string = '';
  private state: ConnectionState = 'disconnected';
  private connectedAt?: Date;
  private disconnectedAt?: Date;
  private connectionConfig?: ConnectionConfig;
  private pingTimer?: NodeJS.Timer;
  private pongTimer?: NodeJS.Timer;
  private lastPongTime?: Date;
  private options?: WebSocketOptions;

  constructor() {
    super();
  }

  async connect(url: string, options?: WebSocketOptions): Promise<void> {
    // Validate URL
    if (!this.isValidUrl(url)) {
      throw new Error('Invalid WebSocket URL');
    }

    // Prevent multiple connections
    if (this.ws && this.state !== 'disconnected') {
      throw new Error('Already connected');
    }

    this.url = url;
    this.options = options;
    this.state = 'connecting';
    this.connectionConfig = { url, options };

    return new Promise((resolve, reject) => {
      const timeout = options?.timeout || 30000;
      const timer = setTimeout(() => {
        this.cleanup();
        reject(new Error('Connection timeout'));
      }, timeout);

      try {
        // Create WebSocket with options
        const wsOptions: any = {};
        if (options?.headers) {
          wsOptions.headers = options.headers;
        }

        this.ws = new WebSocket(url, wsOptions);

        this.ws.on('open', () => {
          clearTimeout(timer);
          this.state = 'connected';
          this.connectedAt = new Date();
          this.disconnectedAt = undefined;

          // Setup ping/pong
          if (options?.pingInterval) {
            this.setupPingPong(options.pingInterval, options.pongTimeout || 3000);
          }

          this.emit('connected');
          resolve();
        });

        this.ws.on('close', (code, reason) => {
          clearTimeout(timer);
          this.handleDisconnection();
          this.emit('disconnected', { code, reason: reason?.toString() });
        });

        this.ws.on('error', (error) => {
          clearTimeout(timer);
          this.emit('error', error);
          if (this.state === 'connecting') {
            reject(error);
          }
        });

        this.ws.on('message', (data: WebSocket.RawData) => {
          this.emit('message', data);
        });

        this.ws.on('pong', () => {
          this.lastPongTime = new Date();
          if (this.pongTimer) {
            clearTimeout(this.pongTimer);
          }
        });

      } catch (error) {
        clearTimeout(timer);
        this.cleanup();
        reject(error);
      }
    });
  }

  async disconnect(force: boolean = false): Promise<void> {
    if (!this.ws || this.state === 'disconnected') {
      return;
    }

    this.state = 'disconnecting';
    this.clearPingPong();

    return new Promise((resolve) => {
      if (force || this.ws!.readyState !== WebSocket.OPEN) {
        this.ws!.terminate();
        this.handleDisconnection();
        resolve();
      } else {
        this.ws!.once('close', () => {
          this.handleDisconnection();
          resolve();
        });
        this.ws!.close();

        // Force terminate after 5 seconds
        setTimeout(() => {
          if (this.ws && this.state !== 'disconnected') {
            this.ws.terminate();
            this.handleDisconnection();
            resolve();
          }
        }, 5000);
      }
    });
  }

  send(data: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }

    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    this.ws.send(data);
  }

  isConnected(): boolean {
    return this.state === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  getState(): ConnectionState {
    return this.state;
  }

  getConnectionInfo(): ConnectionInfo | null {
    if (!this.url) {
      return null;
    }

    return {
      url: this.url,
      state: this.state,
      connectedAt: this.connectedAt,
      disconnectedAt: this.disconnectedAt
    };
  }

  getConnectionConfig(): ConnectionConfig | undefined {
    return this.connectionConfig;
  }

  getUptime(): number {
    if (!this.connectedAt || this.state !== 'connected') {
      return 0;
    }
    return Date.now() - this.connectedAt.getTime();
  }

  getLastPongTime(): Date | undefined {
    return this.lastPongTime;
  }

  private setupPingPong(pingInterval: number, pongTimeout: number): void {
    this.clearPingPong();

    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();

        // Setup pong timeout
        this.pongTimer = setTimeout(() => {
          this.emit('connection_lost');
          this.disconnect(true);
        }, pongTimeout);
      }
    }, pingInterval);
  }

  private clearPingPong(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = undefined;
    }
  }

  private handleDisconnection(): void {
    this.state = 'disconnected';
    this.disconnectedAt = new Date();
    this.clearPingPong();
    this.ws = null;
  }

  private cleanup(): void {
    this.clearPingPong();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
    } catch {
      return false;
    }
  }
}