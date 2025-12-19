// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Log Stream Service
 * WebSocket client for real-time log streaming from management server
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import { LogEntry } from '../types';

export class LogStreamClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private shouldReconnect: boolean = true;

  constructor(mgmtUrl: string) {
    super();
    // Convert http/https to ws/wss
    this.url = mgmtUrl.replace(/^http/, 'ws') + '/ws/logs';
  }

  /**
   * Connect to the WebSocket log stream
   */
  connect(): void {
    this.shouldReconnect = true;
    this.ws = new WebSocket(this.url);

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'log') {
          this.emit('log', msg as LogEntry);
        } else if (msg.type === 'history') {
          // Handle initial log history
          if (Array.isArray(msg.lines)) {
            msg.lines.forEach((line: string) => {
              this.emit('log', {
                timestamp: '',
                level: 'info' as const,
                message: line,
              });
            });
          }
        }
      } catch {
        // Ignore parse errors
      }
    });

    this.ws.on('close', () => {
      this.emit('disconnect');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (error: Error) => {
      this.emit('error', error);
    });

    this.ws.on('open', () => {
      this.emit('connect');
    });
  }

  /**
   * Disconnect from the WebSocket log stream
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, 3000);
  }
}
