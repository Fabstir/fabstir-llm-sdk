// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Browser-compatible WebSocket Client
 * 
 * Handles real-time communication with LLM nodes using native WebSocket API.
 * Supports reconnection, message queuing, and event handling.
 */

import { SDKError } from '../types';

export interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export interface WebSocketOptions {
  reconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

export class WebSocketClient {
  private ws?: WebSocket;
  private url: string;
  private options: WebSocketOptions;
  private messageHandlers: Set<(data: any) => void> = new Set();
  private connectionPromise?: Promise<void>;
  private reconnectAttempts = 0;
  private heartbeatTimer?: number;
  private messageQueue: WebSocketMessage[] = [];
  private isReconnecting = false;

  constructor(url: string, options: WebSocketOptions = {}) {
    this.url = url;
    this.options = {
      reconnect: true,
      reconnectInterval: 5000,
      maxReconnectAttempts: 5,
      heartbeatInterval: 30000,
      ...options
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      try {
        // Use native WebSocket (works in browsers)
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.isReconnecting = false;
          
          // Start heartbeat
          this.startHeartbeat();
          
          // Send queued messages
          this.flushMessageQueue();
          
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error, 'Raw data:', event.data);
          }
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          if (!this.isReconnecting) {
            reject(new SDKError(
              'WebSocket connection failed',
              'WS_CONNECTION_ERROR',
              { originalError: error }
            ));
          }
        };

        this.ws.onclose = (event) => {
          this.stopHeartbeat();
          this.connectionPromise = undefined;

          if (this.options.reconnect && !this.isReconnecting) {
            this.handleReconnect();
          }
        };
      } catch (error: any) {
        reject(new SDKError(
          `Failed to create WebSocket: ${error.message}`,
          'WS_CREATE_ERROR',
          { originalError: error }
        ));
      }
    });

    return this.connectionPromise;
  }

  /**
   * Disconnect from WebSocket server
   */
  async disconnect(): Promise<void> {
    this.options.reconnect = false;
    this.stopHeartbeat();
    
    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws = undefined;
    }
    
    this.connectionPromise = undefined;
    this.messageHandlers.clear();
    this.messageQueue = [];
  }

  /**
   * Send a message without waiting for a response (fire-and-forget)
   * Used for encrypted messages where responses are handled by separate handlers
   */
  async sendWithoutResponse(message: WebSocketMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.options.reconnect) {
        // Queue message for sending after reconnection
        this.messageQueue.push(message);

        // Try to reconnect
        if (!this.isReconnecting) {
          await this.connect();
        }

        // Wait a bit for reconnection
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new SDKError('WebSocket not connected', 'WS_NOT_CONNECTED');
        }
      } else {
        throw new SDKError('WebSocket not connected', 'WS_NOT_CONNECTED');
      }
    }

    try {
      const messageStr = JSON.stringify(message);
      this.ws!.send(messageStr);
    } catch (error: any) {
      throw new SDKError(
        `Failed to send message: ${error.message}`,
        'WS_SEND_ERROR',
        { originalError: error }
      );
    }
  }

  /**
   * Send a message through WebSocket
   */
  async sendMessage(message: WebSocketMessage): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.options.reconnect) {
        // Queue message for sending after reconnection
        this.messageQueue.push(message);

        // Try to reconnect
        if (!this.isReconnecting) {
          await this.connect();
        }

        // Wait a bit for reconnection
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          throw new SDKError('WebSocket not connected', 'WS_NOT_CONNECTED');
        }
      } else {
        throw new SDKError('WebSocket not connected', 'WS_NOT_CONNECTED');
      }
    }

    return new Promise<string>((resolve, reject) => {
      try {
        // Add message ID for tracking
        const messageId = this.generateMessageId();
        const messageWithId = { ...message, id: messageId };

        // Track accumulated streaming content
        let streamContent = '';
        let isStreaming = false;

        // Timeout ID for cleanup (v1.3.29 fix)
        let timeoutId: number;

        // Set up one-time response handler
        const responseHandler = (data: any) => {
          // Handle plaintext streaming chunks
          if (data.type === 'stream_chunk') {
            isStreaming = true;
            if (data.content) {
              streamContent += data.content;
            }
            return; // Don't complete yet, wait for stream_end
          }

          // Handle encrypted streaming chunks
          if (data.type === 'encrypted_chunk') {
            isStreaming = true;
            // Note: Decryption happens at SessionManager level
            // Just acknowledge receipt for sendMessage() completion tracking
            return; // Don't complete yet, wait for encrypted_response
          }

          // Handle plaintext stream end
          if (data.type === 'stream_end' && isStreaming) {
            clearTimeout(timeoutId);  // Clear timeout (v1.3.29 fix)
            this.messageHandlers.delete(responseHandler);
            resolve(streamContent || 'Stream completed with no content');
            return;
          }

          // Handle encrypted response (complete response or stream end)
          if (data.type === 'encrypted_response') {
            clearTimeout(timeoutId);  // Clear timeout (v1.3.29 fix)
            this.messageHandlers.delete(responseHandler);
            // Return raw encrypted data - SessionManager will decrypt
            resolve(JSON.stringify(data));
            return;
          }

          // Handle session init acknowledgment (for encrypted_session_init)
          if (data.type === 'session_init_ack') {
            clearTimeout(timeoutId);  // Clear timeout (v1.3.29 fix)
            this.messageHandlers.delete(responseHandler);
            resolve('Session initialized');
            return;
          }

          // Handle response for our message ID or session-based responses
          if (data.id === messageId || data.responseId === messageId ||
              (message.type === 'prompt' && data.session_id === message.session_id &&
               (data.type === 'response' || data.type === 'stream_complete'))) {
            clearTimeout(timeoutId);  // Clear timeout (v1.3.29 fix)
            this.messageHandlers.delete(responseHandler);

            if (data.error || data.type === 'error') {
              reject(new SDKError(
                data.message || data.error?.message || 'Request failed',
                data.error_code || 'WS_REQUEST_ERROR',
                { originalError: data.error || data }
              ));
            } else {
              resolve(data.content || data.response || streamContent || JSON.stringify(data));
            }
          }
        };

        this.messageHandlers.add(responseHandler);

        // Send message
        const messageStr = JSON.stringify(messageWithId);
        this.ws!.send(messageStr);

        // Set timeout for response (v1.3.29: capture timeout ID for cleanup)
        timeoutId = window.setTimeout(() => {
          this.messageHandlers.delete(responseHandler);
          reject(new SDKError('Request timeout', 'WS_TIMEOUT'));
        }, 30000);
      } catch (error: any) {
        reject(new SDKError(
          `Failed to send message: ${error.message}`,
          'WS_SEND_ERROR',
          { originalError: error }
        ));
      }
    });
  }

  /**
   * Register a message handler
   */
  onMessage(handler: (data: any) => void): () => void {
    this.messageHandlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection state
   */
  getReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: any): void {

    // Call all registered handlers
    let handlerIndex = 0;
    for (const handler of this.messageHandlers) {
      handlerIndex++;
      try {
        handler(data);
      } catch (error) {
        console.error(`[WebSocketClient] Handler ${handlerIndex} error:`, error);
      }
    }
  }

  /**
   * Handle reconnection
   */
  private async handleReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    
    this.isReconnecting = true;
    
    while (
      this.reconnectAttempts < this.options.maxReconnectAttempts! &&
      this.options.reconnect
    ) {
      this.reconnectAttempts++;
      
      await new Promise(resolve => 
        setTimeout(resolve, this.options.reconnectInterval)
      );
      
      try {
        await this.connect();
        break;
      } catch (error) {
        console.error('Reconnection failed:', error);
      }
    }
    
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts!) {
      console.error('Max reconnection attempts reached');
      this.isReconnecting = false;
      throw new SDKError(
        'Failed to reconnect to WebSocket',
        'WS_RECONNECT_FAILED'
      );
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    
    this.heartbeatTimer = window.setInterval(() => {
      if (this.isConnected()) {
        try {
          this.ws!.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('Heartbeat failed:', error);
        }
      }
    }, this.options.heartbeatInterval!);
  }

  /**
   * Stop heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  /**
   * Flush message queue
   */
  private async flushMessageQueue(): Promise<void> {
    const queue = [...this.messageQueue];
    this.messageQueue = [];
    
    for (const message of queue) {
      try {
        await this.sendMessage(message);
      } catch (error) {
        console.error('Failed to send queued message:', error);
      }
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}