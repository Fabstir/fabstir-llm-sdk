import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';
import type { P2PMessage } from '../../packages/sdk-client/src/p2p/types';

// Mock WebSocket
class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  
  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = 1; // OPEN
      if (this.onopen) this.onopen({});
    }, 10);
  }
  
  send(data: string) {
    if (this.readyState !== 1) throw new Error('WebSocket not open');
  }
  
  close() {
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose({ code: 1000 });
  }
}

// @ts-ignore - Replace global WebSocket with mock
global.WebSocket = MockWebSocket;

describe('WebSocketClient', () => {
  let client: WebSocketClient;
  
  afterEach(() => {
    if (client) client.disconnect();
  });

  it('connects to WebSocket URL', async () => {
    client = new WebSocketClient();
    await client.connect('ws://localhost:8080');
    expect(client.isConnected()).toBe(true);
  });

  it('sends prompt with index', async () => {
    client = new WebSocketClient();
    await client.connect('ws://localhost:8080');
    
    const sendSpy = vi.spyOn(MockWebSocket.prototype, 'send');
    await client.sendPrompt('Hello AI', 0);
    
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('"type":"prompt"')
    );
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('"index":0')
    );
  });

  it('receives streaming response', async () => {
    client = new WebSocketClient();
    const responses: P2PMessage[] = [];
    
    client.onResponse((msg) => responses.push(msg));
    await client.connect('ws://localhost:8080');
    
    // Simulate incoming message
    const ws = (client as any).ws as MockWebSocket;
    if (ws.onmessage) {
      ws.onmessage({ 
        data: JSON.stringify({ 
          type: 'response', 
          index: 0, 
          content: 'AI response'
        })
      });
    }
    
    expect(responses).toHaveLength(1);
    expect(responses[0].content).toBe('AI response');
  });

  it('handles connection drops with retry', async () => {
    client = new WebSocketClient({ maxRetries: 2, retryDelay: 10 });
    await client.connect('ws://localhost:8080');
    
    const ws = (client as any).ws as MockWebSocket;
    
    // Simulate connection drop
    if (ws.onclose) ws.onclose({ code: 1006 }); // Abnormal closure
    
    // Wait for reconnection attempt
    await new Promise(r => setTimeout(r, 20));
    
    // Should attempt to reconnect
    expect(client.getState()).toBe('reconnecting');
  });

  it('implements exponential backoff', async () => {
    const delays: number[] = [];
    const originalTimeout = global.setTimeout;
    
    global.setTimeout = ((fn: Function, delay: number) => {
      delays.push(delay);
      return originalTimeout(fn, 0); // Execute immediately for test
    }) as any;
    
    // Mock WebSocket to always fail
    const mockWS = vi.fn().mockImplementation(() => {
      throw new Error('Connection failed');
    });
    global.WebSocket = mockWS as any;
    
    client = new WebSocketClient({ maxRetries: 2, retryDelay: 100 });
    
    try {
      await client.connect('ws://localhost:8080');
    } catch {}
    
    // Check exponential backoff: 100ms, 200ms
    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays[0]).toBe(100);  // First retry: 100ms * 2^0 = 100ms
    expect(delays[1]).toBe(200);  // Second retry: 100ms * 2^1 = 200ms
    
    global.setTimeout = originalTimeout;
    global.WebSocket = MockWebSocket;  // Restore mock
  });

  it('calls response callback on data', async () => {
    client = new WebSocketClient();
    const callback = vi.fn();
    
    client.onResponse(callback);
    await client.connect('ws://localhost:8080');
    
    const ws = (client as any).ws as MockWebSocket;
    if (ws.onmessage) {
      ws.onmessage({ 
        data: JSON.stringify({ 
          type: 'response', 
          index: 1, 
          content: 'test'
        })
      });
    }
    
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'test' })
    );
  });

  it('disconnects cleanly', async () => {
    client = new WebSocketClient();
    await client.connect('ws://localhost:8080');
    
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('rejects invalid URLs', async () => {
    client = new WebSocketClient();
    
    await expect(client.connect('invalid-url')).rejects.toThrow('Invalid WebSocket URL');
    await expect(client.connect('http://example.com')).rejects.toThrow('Invalid WebSocket URL');
  });

  it('handles max retry limit', async () => {
    client = new WebSocketClient({ maxRetries: 1, retryDelay: 10 });
    
    // Mock connection to always fail
    const mockWS = vi.fn().mockImplementation(() => {
      throw new Error('Connection failed');
    });
    global.WebSocket = mockWS as any;
    
    await expect(client.connect('ws://localhost:8080')).rejects.toThrow('Max retries reached');
  });

  it('queues messages when disconnected', async () => {
    // Restore original MockWebSocket
    global.WebSocket = MockWebSocket;
    
    client = new WebSocketClient();
    const sendSpy = vi.spyOn(MockWebSocket.prototype, 'send');
    
    // Try to send before connecting
    await client.sendPrompt('Queued message', 0);
    
    // Connect
    await client.connect('ws://localhost:8080');
    
    // Wait for connection and queue to process
    await new Promise(r => setTimeout(r, 50));
    
    // Message should be sent after connection
    expect(sendSpy).toHaveBeenCalledWith(
      expect.stringContaining('Queued message')
    );
  });
});