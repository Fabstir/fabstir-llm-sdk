export class LLMWebSocketClient {
  private ws: WebSocket | null = null;
  private tokenCount = 0;
  private retries = 0;
  private maxRetries = 3;
  private hostUrl = '';
  private jobId = 0;
  private sessionId = '';
  private onToken?: (token: string) => void;
  private onComplete?: (response: string) => void;
  private onError?: (error: Error) => void;
  constructor() {}

  async connect(hostUrl: string, jobId: number): Promise<void> {
    this.hostUrl = hostUrl; this.jobId = jobId;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(hostUrl);
        this.ws.onopen = () => { this.retries = 0; this.initSession(); resolve(); };
        this.ws.onerror = (error) => {
          const err = new Error(`WebSocket error: ${error}`);
          this.onError?.(err); reject(err);
        };
        this.ws.onmessage = (event) => this.handleMessage(event.data);
        this.ws.onclose = () => this.handleDisconnect();
      } catch (error) { reject(error); }
    });
  }

  private initSession(resume = false): void {
    const msg: any = { job_id: this.jobId };
    if (resume && this.sessionId) { msg.session_id = this.sessionId; msg.resume = true; }
    this.send({ type: 'session_init', data: msg });
  }

  private handleMessage(data: string): void {
    const msg = JSON.parse(data);
    if (msg.type === 'stream' && msg.token) { this.tokenCount++; this.onToken?.(msg.token); }
    else if (msg.type === 'response_complete') this.onComplete?.(msg.response || '');
    else if (msg.type === 'session_started') this.sessionId = msg.session_id;
  }

  private handleDisconnect(): void { if (this.retries < this.maxRetries) this.reconnect(); }

  private async reconnect(): Promise<void> {
    this.retries++; await new Promise(r => setTimeout(r, 1000 * this.retries)); // retry delay
    await this.connect(this.hostUrl, this.jobId);
    if (this.sessionId) this.initSession(true);
  }

  disconnect(): void { if (this.ws?.readyState === WebSocket.OPEN) this.ws.close(); this.ws = null; }

  send(message: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  getTokenCount(): number { return this.tokenCount; }
  setOnToken(handler: (token: string) => void) { this.onToken = handler; }
  setOnComplete(handler: (response: string) => void) { this.onComplete = handler; }
  setOnError(handler: (error: Error) => void) { this.onError = handler; }
}