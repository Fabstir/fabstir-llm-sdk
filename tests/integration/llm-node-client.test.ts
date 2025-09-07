import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { LLMNodeClient } from '../../src/inference/LLMNodeClient';
import { EventEmitter } from 'events';

// Mock fetch for testing
global.fetch = vi.fn();

// Mock WebSocket
class MockWebSocket extends EventEmitter {
  readyState: number = 0; // CONNECTING
  url: string;
  onopen: any = null;
  onerror: any = null;
  onmessage: any = null;
  onclose: any = null;
  
  constructor(url: string) {
    super();
    this.url = url;
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen();
      this.emit('open');
    }, 10);
  }
  
  send(data: string) {
    const message = JSON.parse(data);
    // Simulate response
    setTimeout(() => {
      this.emit('message', { data: JSON.stringify({
        type: 'response',
        content: 'Mock response',
        done: false
      })});
    }, 10);
  }
  
  close() {
    this.readyState = 3; // CLOSED
    this.emit('close');
  }
}

(global as any).WebSocket = MockWebSocket;
(global as any).WebSocket.OPEN = 1;
(global as any).WebSocket.CLOSED = 3;

describe('LLM Node Client', () => {
  let client: LLMNodeClient;
  const nodeUrl = 'http://localhost:8080';
  
  beforeAll(() => {
    client = new LLMNodeClient(nodeUrl);
  });
  
  afterAll(() => {
    client.close();
  });

  describe('Connection and Health', () => {
    it('should initialize with correct node URL', () => {
      expect(client.nodeUrl).toBe(nodeUrl);
      expect(client.isConnected()).toBe(false);
    });

    it('should check node health', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'healthy', models: ['llama-2-7b'] })
      });
      
      const health = await client.checkHealth();
      expect(health.status).toBe('healthy');
      expect(health.models).toContain('llama-2-7b');
    });

    it('should handle health check failures', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
      
      const health = await client.checkHealth();
      expect(health.status).toBe('error');
      expect(health.error).toBeDefined();
    });

    it('should connect to WebSocket for streaming', async () => {
      const connected = await client.connectWebSocket();
      expect(connected).toBe(true);
      expect(client.isConnected()).toBe(true);
    });

    it('should handle WebSocket connection failures', async () => {
      const badClient = new LLMNodeClient('http://invalid-host:9999');
      const connected = await badClient.connectWebSocket();
      expect(connected).toBe(false);
      badClient.close();
    });
  });

  describe('Model Information', () => {
    it('should list available models', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { id: 'llama-2-7b', name: 'Llama 2 7B', available: true },
            { id: 'gpt-j-6b', name: 'GPT-J 6B', available: true }
          ]
        })
      });
      
      const models = await client.listModels();
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama-2-7b');
    });

    it('should get specific model info', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'llama-2-7b',
          name: 'Llama 2 7B',
          context_length: 4096,
          available: true
        })
      });
      
      const model = await client.getModelInfo('llama-2-7b');
      expect(model.id).toBe('llama-2-7b');
      expect(model.context_length).toBe(4096);
    });

    it('should handle model not found', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404
      });
      
      await expect(client.getModelInfo('invalid-model')).rejects.toThrow();
    });
  });

  describe('HTTP Inference', () => {
    it('should send inference request via HTTP', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: 'Paris is the capital of France.',
          tokens_used: 8,
          model: 'llama-2-7b'
        })
      });
      
      const result = await client.inference({
        model: 'llama-2-7b',
        prompt: 'What is the capital of France?',
        max_tokens: 50,
        temperature: 0.7
      });
      
      expect(result.content).toContain('Paris');
      expect(result.tokens_used).toBe(8);
    });

    it('should handle inference errors', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Invalid prompt' })
      });
      
      await expect(client.inference({
        model: 'llama-2-7b',
        prompt: '',
        max_tokens: 50
      })).rejects.toThrow('Invalid prompt');
    });

    it('should support custom inference parameters', async () => {
      (global.fetch as any).mockImplementationOnce(async (url, options) => {
        const body = JSON.parse(options.body);
        expect(body.temperature).toBe(0.9);
        expect(body.top_p).toBe(0.95);
        expect(body.frequency_penalty).toBe(0.5);
        
        return {
          ok: true,
          json: async () => ({ content: 'Test response', tokens_used: 5 })
        };
      });
      
      await client.inference({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 100,
        temperature: 0.9,
        top_p: 0.95,
        frequency_penalty: 0.5
      });
    });
  });

  describe('Streaming Responses', () => {
    it('should stream inference via SSE', async () => {
      const mockEventSource = {
        onmessage: null as any,
        onerror: null as any,
        close: vi.fn()
      };
      
      (global as any).EventSource = vi.fn().mockImplementation(() => mockEventSource);
      
      const tokens: string[] = [];
      const stream = client.streamInferenceSSE({
        model: 'llama-2-7b',
        prompt: 'Hello',
        max_tokens: 10
      });
      
      stream.on('token', (token) => tokens.push(token));
      
      // Simulate SSE messages
      setTimeout(() => {
        mockEventSource.onmessage({ data: JSON.stringify({ content: 'Hello' }) });
        mockEventSource.onmessage({ data: JSON.stringify({ content: ' world', done: true }) });
      }, 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(tokens).toEqual(['Hello', ' world']);
    });

    it('should stream inference via WebSocket', async () => {
      await client.connectWebSocket();
      
      const tokens: string[] = [];
      const stream = await client.streamInferenceWS({
        model: 'llama-2-7b',
        prompt: 'Test prompt',
        max_tokens: 20
      });
      
      stream.on('token', (token) => tokens.push(token));
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(tokens.length).toBeGreaterThan(0);
    });

    it('should handle streaming errors', async () => {
      const stream = await client.streamInferenceWS({
        model: 'invalid-model',
        prompt: 'Test',
        max_tokens: 10
      });
      
      const errorHandler = vi.fn();
      stream.on('error', errorHandler);
      
      // Simulate error
      setTimeout(() => {
        stream.emit('error', new Error('Model not found'));
      }, 10);
      
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(errorHandler).toHaveBeenCalled();
    });

    it('should support stream cancellation', async () => {
      const stream = await client.streamInferenceWS({
        model: 'llama-2-7b',
        prompt: 'Long prompt',
        max_tokens: 1000
      });
      
      const tokens: string[] = [];
      stream.on('token', (token) => tokens.push(token));
      
      setTimeout(() => stream.cancel(), 20);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(stream.status).toBe('cancelled');
    });
  });

  describe('Authentication', () => {
    it('should send API key in headers when configured', async () => {
      const authClient = new LLMNodeClient(nodeUrl, { apiKey: 'test-key-123' });
      
      (global.fetch as any).mockImplementationOnce(async (url, options) => {
        expect(options.headers['X-API-Key']).toBe('test-key-123');
        return {
          ok: true,
          json: async () => ({ content: 'Authenticated response', tokens_used: 3 })
        };
      });
      
      await authClient.inference({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      });
      
      authClient.close();
    });

    it('should handle authentication failures', async () => {
      const authClient = new LLMNodeClient(nodeUrl, { apiKey: 'invalid-key' });
      
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid API key' })
      });
      
      await expect(authClient.inference({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      })).rejects.toThrow('Invalid API key');
      
      authClient.close();
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rate limit responses', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => '60' }
      });
      
      const result = await client.handleRateLimit();
      expect(result.limited).toBe(true);
      expect(result.retryAfter).toBe(60);
    });

    it('should implement exponential backoff on retries', async () => {
      let attempts = 0;
      (global.fetch as any).mockImplementation(async () => {
        attempts++;
        if (attempts < 3) {
          return { ok: false, status: 429, headers: { get: () => '1' } };
        }
        return {
          ok: true,
          json: async () => ({ content: 'Success after retries', tokens_used: 4 })
        };
      });
      
      const result = await client.inferenceWithRetry({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      }, 3);
      
      expect(attempts).toBe(3);
      expect(result.content).toContain('Success');
    });
  });

  describe('Error Recovery', () => {
    it('should retry on network errors', async () => {
      let attempts = 0;
      (global.fetch as any).mockImplementation(async () => {
        attempts++;
        if (attempts === 1) {
          throw new Error('Network error');
        }
        return {
          ok: true,
          json: async () => ({ content: 'Success', tokens_used: 1 })
        };
      });
      
      const result = await client.inferenceWithRetry({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      }, 2);
      
      expect(attempts).toBe(2);
      expect(result.content).toBe('Success');
    });

    it('should fail after max retries', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Persistent error'));
      
      await expect(client.inferenceWithRetry({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      }, 3)).rejects.toThrow('Persistent error');
    });

    it('should switch to fallback node on failure', async () => {
      const fallbackClient = new LLMNodeClient('http://fallback:8081');
      client.setFallback(fallbackClient);
      
      (global.fetch as any).mockImplementation(async (url) => {
        if (url.includes('localhost')) {
          throw new Error('Primary node down');
        }
        return {
          ok: true,
          json: async () => ({ content: 'Fallback response', tokens_used: 2 })
        };
      });
      
      const result = await client.inferenceWithFallback({
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 10
      });
      
      expect(result.content).toBe('Fallback response');
      fallbackClient.close();
    });
  });

  describe('Integration with P2P', () => {
    it('should create client from discovered node', () => {
      const discoveredNode = {
        id: 'node-123',
        url: 'http://192.168.1.100:8080',
        capabilities: ['llama-2-7b', 'gpt-j-6b']
      };
      
      const nodeClient = LLMNodeClient.fromDiscoveredNode(discoveredNode);
      expect(nodeClient.nodeUrl).toBe(discoveredNode.url);
      expect(nodeClient.nodeId).toBe(discoveredNode.id);
    });

    it('should integrate with P2PResponseStream', async () => {
      const stream = await client.createP2PStream({
        jobId: 'job-123',
        model: 'llama-2-7b',
        prompt: 'Test',
        max_tokens: 50
      });
      
      expect(stream.jobId).toBe('job-123');
      expect(stream.nodeId).toBe(client.nodeId || nodeUrl);
      expect(stream.status).toBe('active');
    });

    it('should handle P2P stream lifecycle', async () => {
      const stream = await client.createP2PStream({
        jobId: 'job-456',
        model: 'llama-2-7b',
        prompt: 'Test prompt',
        max_tokens: 100
      });
      
      const tokens: any[] = [];
      stream.on('token', (token) => tokens.push(token));
      
      // Start streaming
      stream.start();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Pause and resume
      stream.pause();
      expect(stream.status).toBe('paused');
      
      stream.resume();
      expect(stream.status).toBe('active');
      
      // Stop
      stream.stop();
      expect(stream.status).toBe('closed');
    });
  });
});