/**
 * Host WebSocket Client (Sub-phase 4.2)
 * Browser-side WebSocket client for real-time log streaming
 */

export interface LogMessage {
  type: 'log';
  timestamp: string;
  level: 'stdout' | 'stderr';
  message: string;
}

export interface HistoryMessage {
  type: 'history';
  lines: string[];
}

type MessageCallback = (log: LogMessage) => void;
type HistoryCallback = (logs: string[]) => void;

/**
 * WebSocket client for Host Management API log streaming
 * Connects to /ws/logs endpoint for real-time log updates
 */
export class HostWsClient {
  private ws: WebSocket | null = null;
  private url: string;
  private apiKey?: string;
  private retries: number = 0;
  private maxRetries: number = 3;
  private reconnectDelay: number = 1000;
  private shouldReconnect: boolean = true;

  private onLogCallback?: MessageCallback;
  private onHistoryCallback?: HistoryCallback;

  constructor(url: string, apiKey?: string) {
    this.url = url;
    this.apiKey = apiKey;
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Add API key as query parameter if provided
        let wsUrl = this.url;
        if (this.apiKey) {
          const separator = wsUrl.includes('?') ? '&' : '?';
          wsUrl = `${wsUrl}${separator}apiKey=${this.apiKey}`;
        }

        this.ws = new WebSocket(wsUrl);
        let hasConnected = false;

        this.ws.onopen = () => {
          hasConnected = true;
          this.retries = 0;
          this.shouldReconnect = true;
          resolve();
        };

        this.ws.onerror = (error) => {
          if (!hasConnected) {
            // Initial connection failed - don't auto-reconnect
            this.shouldReconnect = false;
          }
          reject(new Error(`WebSocket connection failed: ${error}`));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onclose = () => {
          if (hasConnected) {
            // Only auto-reconnect if we had a successful connection before
            this.handleDisconnect();
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
  }

  /**
   * Register callback for log messages
   */
  onLog(callback: MessageCallback): void {
    this.onLogCallback = callback;
  }

  /**
   * Register callback for historical logs
   */
  onHistory(callback: HistoryCallback): void {
    this.onHistoryCallback = callback;
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      if (message.type === 'log') {
        this.onLogCallback?.(message as LogMessage);
      } else if (message.type === 'history') {
        this.onHistoryCallback?.(message.lines);
      }
    } catch (error) {
      // Silently ignore parse errors - could be malformed messages from an unexpected source
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    if (this.retries < this.maxRetries) {
      this.retries++;
      const delay = this.reconnectDelay * this.retries;

      setTimeout(() => {
        this.reconnect();
      }, delay);
    }
  }

  /**
   * Attempt to reconnect to WebSocket server
   */
  private async reconnect(): Promise<void> {
    try {
      await this.connect();
    } catch (error) {
      // Reconnection failed, handleDisconnect will retry if under max retries
      // Silently fail - the error is expected when the server isn't running
    }
  }
}
