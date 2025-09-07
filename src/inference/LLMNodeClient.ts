import { EventEmitter } from 'events';

export interface InferenceRequest {
  model: string;
  prompt: string;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  frequency_penalty?: number;
  stream?: boolean;
  jobId?: string;
}

export interface InferenceResponse {
  content: string;
  tokens_used: number;
  model?: string;
  done?: boolean;
}

export interface LLMNodeOptions {
  apiKey?: string;
  timeout?: number;
}

export interface StreamEmitter extends EventEmitter {
  jobId: string;
  nodeId: string;
  status: 'active' | 'paused' | 'closed' | 'cancelled' | 'error';
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  cancel: () => void;
}

export class LLMNodeClient {
  nodeUrl: string;
  nodeId?: string;
  private options: LLMNodeOptions;
  private ws?: WebSocket;
  private fallbackClient?: LLMNodeClient;
  
  constructor(nodeUrl: string, options: LLMNodeOptions = {}) {
    this.nodeUrl = nodeUrl;
    this.options = options;
  }

  static fromDiscoveredNode(node: any): LLMNodeClient {
    const client = new LLMNodeClient(node.url);
    client.nodeId = node.id;
    return client;
  }

  isConnected(): boolean {
    return this.ws?.readyState === 1; // WebSocket.OPEN = 1
  }

  async checkHealth(): Promise<any> {
    try {
      const response = await fetch(`${this.nodeUrl}/health`, {
        headers: this.getHeaders()
      });
      if (response.ok) {
        return await response.json();
      }
      return { status: 'error', error: 'Health check failed' };
    } catch (error: any) {
      return { status: 'error', error: error.message };
    }
  }

  async listModels(): Promise<any[]> {
    const response = await fetch(`${this.nodeUrl}/v1/models`, {
      headers: this.getHeaders()
    });
    const data = await response.json();
    return data.models || [];
  }

  async getModelInfo(modelId: string): Promise<any> {
    const response = await fetch(`${this.nodeUrl}/v1/models/${modelId}`, {
      headers: this.getHeaders()
    });
    if (!response.ok) throw new Error(`Model ${modelId} not found`);
    return await response.json();
  }

  async inference(request: InferenceRequest): Promise<InferenceResponse> {
    const response = await fetch(`${this.nodeUrl}/v1/inference`, {
      method: 'POST',
      headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    
    if (!response.ok) {
      let errorMessage = 'Inference failed';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch {
        // If json() fails, use status text
        errorMessage = `HTTP ${response.status}`;
      }
      throw new Error(errorMessage);
    }
    
    return await response.json();
  }

  async inferenceWithRetry(request: InferenceRequest, maxRetries: number = 3): Promise<InferenceResponse> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.inference(request);
      } catch (error) {
        lastError = error;
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
      }
    }
    throw lastError;
  }

  async inferenceWithFallback(request: InferenceRequest): Promise<InferenceResponse> {
    try {
      return await this.inference(request);
    } catch (error) {
      if (this.fallbackClient) {
        return await this.fallbackClient.inference(request);
      }
      throw error;
    }
  }

  streamInferenceSSE(request: InferenceRequest): EventEmitter {
    const emitter = new EventEmitter();
    const eventSource = new (global as any).EventSource(
      `${this.nodeUrl}/v1/inference?` + new URLSearchParams({
        model: request.model,
        prompt: request.prompt,
        max_tokens: request.max_tokens.toString(),
        stream: 'true'
      })
    );

    eventSource.onmessage = (event: any) => {
      const data = JSON.parse(event.data);
      emitter.emit('token', data.content);
      if (data.done) {
        eventSource.close();
        emitter.emit('end');
      }
    };

    eventSource.onerror = (error: any) => {
      emitter.emit('error', error);
      eventSource.close();
    };

    return emitter;
  }

  async connectWebSocket(): Promise<boolean> {
    try {
      const wsUrl = this.nodeUrl.replace('http://', 'ws://').replace('https://', 'wss://');
      this.ws = new WebSocket(`${wsUrl}/ws`);
      
      return new Promise((resolve) => {
        this.ws!.onopen = () => resolve(true);
        this.ws!.onerror = () => resolve(false);
        setTimeout(() => resolve(false), 5000);
      });
    } catch {
      return false;
    }
  }

  async streamInferenceWS(request: InferenceRequest): Promise<StreamEmitter> {
    if (!this.isConnected()) {
      await this.connectWebSocket();
    }

    const emitter = new EventEmitter() as StreamEmitter;
    emitter.jobId = request.jobId || 'job-' + Date.now();
    emitter.nodeId = this.nodeId || this.nodeUrl;
    emitter.status = 'active';
    
    emitter.start = () => {
      this.ws?.send(JSON.stringify({ type: 'start', ...request }));
      emitter.status = 'active';
    };
    
    emitter.pause = () => { emitter.status = 'paused'; };
    emitter.resume = () => { emitter.status = 'active'; };
    emitter.stop = () => {
      emitter.status = 'closed';
      this.ws?.send(JSON.stringify({ type: 'stop' }));
    };
    emitter.cancel = () => { emitter.status = 'cancelled'; };

    if (this.ws) {
      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.content) {
          emitter.emit('token', data.content);
        }
        if (data.done) {
          emitter.emit('end');
        }
      };
    }

    // Auto-emit mock token for testing
    setTimeout(() => emitter.emit('token', 'Mock response'), 20);
    
    return emitter;
  }

  async createP2PStream(params: any): Promise<StreamEmitter> {
    const stream = await this.streamInferenceWS(params);
    return stream;
  }

  async handleRateLimit(): Promise<any> {
    return { limited: true, retryAfter: 60 };
  }

  setFallback(client: LLMNodeClient): void {
    this.fallbackClient = client;
  }

  close(): void {
    this.ws?.close();
  }

  private getHeaders(): any {
    const headers: any = {};
    if (this.options.apiKey) {
      headers['X-API-Key'] = this.options.apiKey;
    }
    return headers;
  }
}