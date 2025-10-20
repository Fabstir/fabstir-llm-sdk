// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { WebSocketServer, WebSocket } from 'ws';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class MockInferenceServer {
  private wss?: WebSocketServer;
  private clients: Map<string, WebSocket> = new Map();
  private sessions: Map<string, any> = new Map();
  private port: number;

  constructor(port: number = 8081) {
    this.port = port;
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port: this.port });
      
      this.wss.on('connection', (ws: WebSocket) => {
        ws.on('message', async (data: Buffer) => {
          try {
            const message = JSON.parse(data.toString());
            await this.handleMessage(ws, message);
          } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
              type: 'error',
              error: 'Invalid message format',
              code: 'INVALID_MESSAGE'
            }));
          }
        });

        ws.on('close', () => {
          // Clean up session when client disconnects
          for (const [sessionId, client] of this.clients.entries()) {
            if (client === ws) {
              this.clients.delete(sessionId);
              this.sessions.delete(sessionId);
              break;
            }
          }
        });
      });

      this.wss.on('listening', () => {
        console.log(`Mock inference server listening on port ${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => {
          console.log('Mock inference server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private async handleMessage(ws: WebSocket, message: any): Promise<void> {
    switch (message.type) {
      case 'session_init':
        await this.handleSessionInit(ws, message);
        break;
      
      case 'session_resume':
        await this.handleSessionResume(ws, message);
        break;
      
      case 'prompt':
        await this.handlePrompt(ws, message);
        break;
      
      case 'batch_prompt':
        await this.handleBatchPrompt(ws, message);
        break;
      
      case 'session_end':
        await this.handleSessionEnd(ws, message);
        break;
      
      default:
        ws.send(JSON.stringify({
          type: 'error',
          error: `Unknown message type: ${message.type}`,
          code: 'UNKNOWN_MESSAGE_TYPE'
        }));
    }
  }

  private async handleSessionInit(ws: WebSocket, message: any): Promise<void> {
    const { session_id, job_id } = message;
    
    // Store client and session
    this.clients.set(session_id, ws);
    this.sessions.set(session_id, {
      job_id,
      messages: [],
      token_count: 0,
      created_at: Date.now()
    });

    // Send acknowledgment with JWT token
    ws.send(JSON.stringify({
      type: 'session_init_ack',
      session_id,
      jwt_token: `mock-jwt-token-${session_id}`,
      expires_in: 300
    }));
  }

  private async handleSessionResume(ws: WebSocket, message: any): Promise<void> {
    const { session_id, job_id, conversation_context } = message;
    
    // Store client and session with context
    this.clients.set(session_id, ws);
    this.sessions.set(session_id, {
      job_id,
      messages: conversation_context || [],
      token_count: 0,
      created_at: Date.now()
    });

    // Send acknowledgment
    ws.send(JSON.stringify({
      type: 'session_resume_ack',
      session_id,
      message_count: conversation_context?.length || 0
    }));
  }

  private async handlePrompt(ws: WebSocket, message: any): Promise<void> {
    const { session_id, content: rawContent, message_index, compressed, streaming, signature, nonce } = message;
    
    // Handle compressed content
    let content = rawContent;
    if (compressed) {
      const buffer = Buffer.from(rawContent, 'base64');
      const decompressed = await gunzip(buffer);
      content = decompressed.toString();
    }

    // Store message in session
    const session = this.sessions.get(session_id);
    if (session) {
      session.messages.push({ role: 'user', content });
    }

    // Generate response based on prompt
    const response = this.generateResponse(content);
    const tokens = response.split(' ').length;

    // Handle signature for secure sessions
    let responseSignature;
    if (signature) {
      // Mock signature verification and generation
      if (signature === 'invalid-signature') {
        ws.send(JSON.stringify({
          type: 'error',
          session_id,
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE'
        }));
        return;
      }
      responseSignature = Buffer.from([5, 6, 7, 8]).toString('base64');
    }

    // Check for rate limiting simulation
    if (content.includes('RATE_LIMIT_TEST')) {
      ws.send(JSON.stringify({
        type: 'error',
        session_id,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT',
        retry_after: 5000
      }));
      return;
    }

    // Check for error simulation
    if (content.includes('ERROR_TEST')) {
      ws.send(JSON.stringify({
        type: 'error',
        session_id,
        error: 'Simulated error',
        code: 'TEST_ERROR'
      }));
      return;
    }

    // Send response
    if (streaming || message.stream) {
      // Simulate streaming response
      const words = response.split(' ');
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? ' ' : '');
        await new Promise(resolve => setTimeout(resolve, 10)); // Small delay between chunks
        
        const chunkMessage: any = {
          type: 'response',
          session_id,
          content: chunk,
          streaming: true,
          done: i === words.length - 1
        };
        
        if (i === words.length - 1) {
          chunkMessage.tokens_used = tokens;
        }
        
        if (responseSignature) {
          chunkMessage.signature = responseSignature;
          chunkMessage.timestamp = Date.now();
        }
        
        ws.send(JSON.stringify(chunkMessage));
      }
    } else {
      // Send complete response
      let responseContent = response;
      
      // Compress response if needed
      if (compressed) {
        const compressedBuffer = await gzip(Buffer.from(response));
        responseContent = compressedBuffer.toString('base64');
      }
      
      const responseMessage: any = {
        type: 'response',
        session_id,
        content: responseContent,
        tokens_used: tokens,
        streaming: false
      };
      
      // Add cacheable flag for certain responses
      if (content.includes('2+2')) {
        responseMessage.cacheable = true;
      }
      
      if (compressed) {
        responseMessage.compressed = true;
      }
      
      if (responseSignature) {
        responseMessage.signature = responseSignature;
        responseMessage.timestamp = Date.now();
      }
      
      ws.send(JSON.stringify(responseMessage));
    }
    
    // Store response in session
    if (session) {
      session.messages.push({ role: 'assistant', content: response });
      session.token_count += tokens;
    }
  }

  private async handleBatchPrompt(ws: WebSocket, message: any): Promise<void> {
    const { session_id, prompts } = message;
    
    // Process each prompt in the batch
    const responses = prompts.map((prompt: string) => this.generateResponse(prompt));
    
    // Send batch response
    ws.send(JSON.stringify({
      type: 'batch_response',
      session_id,
      responses,
      tokens_used: responses.join(' ').split(' ').length
    }));
  }

  private async handleSessionEnd(ws: WebSocket, message: any): Promise<void> {
    const { session_id } = message;
    const session = this.sessions.get(session_id);
    
    ws.send(JSON.stringify({
      type: 'session_end',
      session_id,
      total_tokens: session?.token_count || 0,
      reason: 'completed'
    }));
    
    // Clean up
    this.clients.delete(session_id);
    this.sessions.delete(session_id);
  }

  private generateResponse(prompt: string): string {
    // Generate contextual responses based on prompt
    if (prompt.toLowerCase().includes('capital of france')) {
      return 'Paris is the capital of France';
    }
    if (prompt.toLowerCase().includes('2+2') || prompt.toLowerCase().includes('2 + 2')) {
      return '4';
    }
    if (prompt.toLowerCase().includes('hello')) {
      return 'Hi there! How can I help you today?';
    }
    if (prompt.toLowerCase().includes('test')) {
      return 'This is a test response';
    }
    
    // Default response
    return `Response to: ${prompt}`;
  }

  // Helper method to simulate server-initiated messages
  sendToSession(sessionId: string, message: any): void {
    const client = this.clients.get(sessionId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  }
}