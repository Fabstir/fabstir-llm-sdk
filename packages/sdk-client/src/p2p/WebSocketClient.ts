import { ConnectionOptions, ConnectionState, P2PMessage, ResponseHandler } from './types';
export class WebSocketClient {
  private ws?: WebSocket;
  private state = ConnectionState.DISCONNECTED;
  private options: Required<ConnectionOptions>;
  private responseHandlers: ResponseHandler[] = [];
  private messageQueue: P2PMessage[] = [];
  private url?: string;
  private retryCount = 0;
  constructor(options: ConnectionOptions = {}) {
    this.options = { maxRetries: options.maxRetries ?? 3, retryDelay: options.retryDelay ?? 1000, timeout: options.timeout ?? 30000 };
  }

  async connect(url: string): Promise<void> {
    if (!url.startsWith('ws://') && !url.startsWith('wss://')) throw new Error('Invalid WebSocket URL');
    this.url = url; this.state = ConnectionState.CONNECTING; this.retryCount = 0;
    return this.attemptConnection();
  }

  private async attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url!);
        this.ws.onopen = () => {
          this.state = ConnectionState.CONNECTED; this.retryCount = 0;
          this.processQueue(); resolve();
        };
        this.ws.onmessage = (event) => {
          const msg = JSON.parse(event.data) as P2PMessage;
          this.responseHandlers.forEach(h => h(msg));
        };
        this.ws.onclose = (event) => {
          if (event.code !== 1000 && this.retryCount < this.options.maxRetries) {
            this.state = ConnectionState.RECONNECTING;
            setTimeout(() => {
              this.retryCount++;
              this.attemptConnection().catch(() => {});
            }, this.options.retryDelay * Math.pow(2, this.retryCount));
          } else this.state = ConnectionState.DISCONNECTED;
        };
        this.ws.onerror = () => {
          if (this.retryCount >= this.options.maxRetries) {
            this.state = ConnectionState.DISCONNECTED;
            reject(new Error('Max retries reached'));
          }
        };
      } catch (error) {
        if (this.retryCount < this.options.maxRetries) {
          const delay = this.options.retryDelay * Math.pow(2, this.retryCount);
          this.retryCount++;
          setTimeout(() => this.attemptConnection().then(resolve).catch(reject), delay);
        } else reject(new Error('Max retries reached'));
      }
    });
  }

  async send(data: string | object): Promise<void> {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    if (this.state === ConnectionState.CONNECTED && this.ws?.readyState === 1) {
      this.ws.send(message);
    } else {
      // Queue as P2PMessage for later processing
      const msg: P2PMessage = { 
        type: 'queued', 
        index: 0, 
        content: message, 
        timestamp: Date.now() 
      };
      this.messageQueue.push(msg);
      if (this.state === ConnectionState.CONNECTED) setTimeout(() => this.processQueue(), 10);
    }
  }

  async sendPrompt(prompt: string, index: number): Promise<void> {
    const msg: P2PMessage = { type: 'prompt', index, content: prompt, timestamp: Date.now() };
    if (this.state === ConnectionState.CONNECTED && this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
      if (this.state === ConnectionState.CONNECTED) setTimeout(() => this.processQueue(), 10);
    }
  }

  private processQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === 1) {
      const msg = this.messageQueue.shift()!;
      this.ws.send(JSON.stringify(msg));
    }
  }

  onResponse(callback: ResponseHandler): void { this.responseHandlers.push(callback); }
  isConnected(): boolean { return this.state === ConnectionState.CONNECTED; }
  getState(): string { return this.state; }
  disconnect(): void {
    this.state = ConnectionState.DISCONNECTED;
    if (this.ws) { this.ws.close(); this.ws = undefined; }
  }
}