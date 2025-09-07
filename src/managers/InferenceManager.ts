import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import AuthManager from './AuthManager';
import SessionManager from './SessionManager';
import { WebSocketClient } from '../../packages/sdk-client/src/p2p/WebSocketClient';
import { HostDiscovery } from '../../packages/sdk-client/src/p2p/HostDiscovery';
import { S5ConversationStore } from '../storage/S5ConversationStore';
import { SessionCache } from '../storage/SessionCache';
import type { Host } from '../session-types';
import type { Message } from '../storage/types';

export interface InferenceSession {
  sessionId: string;
  jobId: number;
  hostUrl: string;
  hostAddress: string;
  messages: Message[];
  tokensUsed: number;
  isConnected: boolean;
  startTime: number;
}

export interface InferenceOptions {
  sessionId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface InferenceResult {
  response: string;
  tokensUsed: number;
  sessionId: string;
  messageId: string;
  timestamp: number;
}

export interface StreamCallback {
  (chunk: string, tokensUsed: number): void;
}

export default class InferenceManager extends EventEmitter {
  private wsClients: Map<string, WebSocketClient> = new Map();
  private activeSessions: Map<string, InferenceSession> = new Map();
  private messageHandlers: Map<string, (data: string) => void> = new Map();
  private cache: SessionCache<Message[]>;
  private store?: S5ConversationStore;
  private currentSessionId?: string;

  constructor(
    private authManager: AuthManager,
    private sessionManager: SessionManager,
    private discoveryUrl?: string,
    private s5Config?: { seedPhrase?: string; portalUrl?: string }
  ) {
    super();
    
    this.cache = new SessionCache<Message[]>({ maxEntries: 100, ttl: 3600000 });
    
    // Initialize S5 storage if config provided
    if (s5Config?.seedPhrase) {
      this.store = new S5ConversationStore(s5Config);
      this.store.connect().catch(console.error);
    }
  }

  /**
   * Connect to a host for an active session
   */
  async connectToSession(
    sessionId: string, 
    hostUrl: string, 
    jobId: number, 
    hostAddress: string,
    conversationContext: Message[] = []
  ): Promise<void> {
    if (!this.authManager.isAuthenticated()) {
      throw new Error('Must authenticate before connecting to session');
    }

    // Check if already connected to this session
    if (this.wsClients.has(sessionId)) {
      const existingSession = this.activeSessions.get(sessionId);
      if (existingSession?.isConnected) {
        console.log(`Already connected to session ${sessionId}`);
        return;
      }
    }

    // Create new WebSocket client for this session
    const wsClient = new WebSocketClient();
    
    try {
      // Connect to host WebSocket
      await wsClient.connect(hostUrl);
      
      // Store client and session info
      this.wsClients.set(sessionId, wsClient);
      
      const session: InferenceSession = {
        sessionId,
        jobId,
        hostUrl,
        hostAddress,
        messages: conversationContext,  // Initialize with existing context if provided
        tokensUsed: 0,
        isConnected: true,
        startTime: Date.now()
      };
      
      this.activeSessions.set(sessionId, session);
      this.currentSessionId = sessionId;
      
      // Set up response handler for this session
      const messageHandler = (data: string) => this.handleWsMessage(data, session);
      this.messageHandlers.set(sessionId, messageHandler);
      wsClient.onResponse((msg: any) => messageHandler(msg.content || msg));
      
      this.emit('session:connected', { sessionId, hostUrl });
      
      // Send session initialization or resume message based on context
      if (conversationContext.length > 0) {
        await this.resumeSession(sessionId, conversationContext);
      } else {
        await this.initializeSession(sessionId, jobId);
      }
      
    } catch (error: any) {
      throw new Error(`Failed to connect to session: ${error.message}`);
    }
  }

  /**
   * Initialize a new session with the host
   */
  private async initializeSession(sessionId: string, jobId: number): Promise<void> {
    const wsClient = this.wsClients.get(sessionId);
    if (!wsClient) throw new Error('WebSocket client not found');

    const initMessage = {
      type: 'session_init',
      session_id: sessionId,
      job_id: jobId,
      model_config: {
        model: 'llama-2-7b',
        max_tokens: 2048,
        temperature: 0.7
      }
    };

    // Send session initialization
    await wsClient.send(JSON.stringify(initMessage));
    this.emit('session:initialized', { sessionId, jobId });
  }

  /**
   * Resume an existing session with conversation context
   */
  private async resumeSession(sessionId: string, conversationContext: Message[]): Promise<void> {
    const wsClient = this.wsClients.get(sessionId);
    const session = this.activeSessions.get(sessionId);
    if (!wsClient || !session) throw new Error('Session not found');

    const resumeMessage = {
      type: 'session_resume',
      session_id: sessionId,
      job_id: session.jobId,
      conversation_context: conversationContext.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      last_message_index: conversationContext.length
    };

    // Send session resume
    await wsClient.send(JSON.stringify(resumeMessage));
    this.emit('session:resumed', { sessionId, contextSize: conversationContext.length });
  }

  /**
   * Send a prompt to the current or specified session
   */
  async sendPrompt(content: string, options: InferenceOptions = {}): Promise<InferenceResult> {
    const sessionId = options.sessionId || this.currentSessionId;
    
    if (!sessionId) {
      throw new Error('No active session. Call connectToSession first.');
    }
    
    const session = this.activeSessions.get(sessionId);
    const wsClient = this.wsClients.get(sessionId);
    
    if (!session || !wsClient) {
      throw new Error(`Session ${sessionId} not found or not connected`);
    }
    
    // Create message object
    const message: Message = {
      id: Date.now().toString(),
      sessionId: session.jobId,
      role: 'user',
      content,
      timestamp: Date.now()
    };
    
    // Add to session messages
    session.messages.push(message);
    
    // Save to storage if available
    if (this.store) {
      await this.store.savePrompt(session.jobId, message).catch(console.error);
    }
    
    // Cache messages
    this.cache.set(sessionId, session.messages);
    
    // Send prompt via WebSocket using proper protocol
    const promptMessage = {
      type: 'prompt',
      session_id: sessionId,
      content: content,
      message_index: session.messages.length - 1,
      stream: options.stream || false
    };
    
    await wsClient.send(promptMessage);
    
    this.emit('prompt:sent', message);
    
    // Return a promise that resolves when response is received
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Response timeout'));
      }, 30000); // 30 second timeout
      
      const responseHandler = (response: InferenceResult) => {
        if (response.sessionId === sessionId) {
          clearTimeout(timeout);
          this.off('response:complete', responseHandler);
          resolve(response);
        }
      };
      
      this.once('response:complete', responseHandler);
    });
  }

  /**
   * Stream a prompt response with callbacks for each chunk
   */
  async streamPrompt(content: string, onChunk: StreamCallback, options: InferenceOptions = {}): Promise<InferenceResult> {
    const sessionId = options.sessionId || this.currentSessionId;
    
    if (!sessionId) {
      throw new Error('No active session. Call connectToSession first.');
    }
    
    let accumulatedResponse = '';
    let totalTokens = 0;
    
    // Set up streaming handler
    const chunkHandler = (data: any) => {
      if (data.sessionId === sessionId) {
        const chunk = data.content;
        const tokens = chunk.split(' ').length;
        accumulatedResponse += chunk;
        totalTokens += tokens;
        onChunk(chunk, tokens);
      }
    };
    
    this.on('response:chunk', chunkHandler);
    
    try {
      // Send the prompt
      const result = await this.sendPrompt(content, { ...options, stream: true });
      
      // Clean up handler
      this.off('response:chunk', chunkHandler);
      
      return {
        ...result,
        response: accumulatedResponse || result.response,
        tokensUsed: totalTokens || result.tokensUsed
      };
    } catch (error) {
      this.off('response:chunk', chunkHandler);
      throw error;
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWsMessage(data: string, session: InferenceSession) {
    const response: Message = {
      id: Date.now().toString(),
      sessionId: session.jobId,
      role: 'assistant',
      content: data,
      timestamp: Date.now()
    };
    
    // Add to messages
    session.messages.push(response);
    
    // Count tokens (simple word-based counting)
    const tokens = data.split(' ').length;
    session.tokensUsed += tokens;
    
    // Save response to storage
    if (this.store) {
      this.store.saveResponse(session.jobId, response).catch(console.error);
    }
    
    // Emit events
    this.emit('response:chunk', {
      sessionId: session.sessionId,
      content: data,
      tokens
    });
    
    this.emit('response:received', response);
    
    // Create inference result
    const result: InferenceResult = {
      response: data,
      tokensUsed: tokens,
      sessionId: session.sessionId,
      messageId: response.id,
      timestamp: response.timestamp
    };
    
    this.emit('response:complete', result);
  }

  /**
   * Get conversation history for a session
   */
  async getConversation(sessionId: string): Promise<Message[]> {
    // Check cache first
    const cached = this.cache.get(sessionId);
    if (cached) {
      return cached;
    }
    
    // Check active session
    const session = this.activeSessions.get(sessionId);
    if (session) {
      return session.messages;
    }
    
    // Try loading from storage
    if (this.store) {
      const jobId = parseInt(sessionId.split('-').pop() || '0');
      const messages = await this.store.loadSession(jobId);
      this.cache.set(sessionId, messages);
      return messages;
    }
    
    return [];
  }

  /**
   * Resume a session with full conversation history from storage
   */
  async resumeSessionWithHistory(
    sessionId: string,
    hostUrl: string,
    jobId: number,
    hostAddress: string
  ): Promise<void> {
    // Load conversation history from storage
    const conversationHistory = await this.getConversation(sessionId);
    
    // Connect with the loaded context
    await this.connectToSession(sessionId, hostUrl, jobId, hostAddress, conversationHistory);
    
    this.emit('session:resumed:with-history', { 
      sessionId, 
      messageCount: conversationHistory.length 
    });
  }

  /**
   * Get token usage for a session
   */
  getTokenUsage(sessionId: string): number {
    const session = this.activeSessions.get(sessionId);
    return session?.tokensUsed || 0;
  }

  /**
   * Estimate tokens for a prompt (simple word count)
   */
  estimateTokens(prompt: string): number {
    // Simple estimation: ~1.3 tokens per word on average
    return Math.ceil(prompt.split(' ').length * 1.3);
  }

  /**
   * Calculate session cost based on tokens and price per token
   */
  getSessionCost(sessionId: string, pricePerToken: string): ethers.BigNumber {
    const tokens = this.getTokenUsage(sessionId);
    return ethers.BigNumber.from(pricePerToken).mul(tokens);
  }

  /**
   * Disconnect from a session
   */
  async disconnect(sessionId?: string): Promise<void> {
    const targetId = sessionId || this.currentSessionId;
    
    if (!targetId) {
      // Disconnect all sessions
      for (const [id, client] of this.wsClients.entries()) {
        client.disconnect();
        this.wsClients.delete(id);
        this.activeSessions.delete(id);
        this.messageHandlers.delete(id);
      }
      this.currentSessionId = undefined;
      this.emit('all:disconnected');
      return;
    }
    
    const client = this.wsClients.get(targetId);
    if (client) {
      client.disconnect();
      this.wsClients.delete(targetId);
      
      const session = this.activeSessions.get(targetId);
      if (session) {
        session.isConnected = false;
      }
      
      this.messageHandlers.delete(targetId);
      
      if (this.currentSessionId === targetId) {
        this.currentSessionId = undefined;
      }
      
      this.emit('session:disconnected', { sessionId: targetId });
    }
  }

  /**
   * Check if connected to a session
   */
  isConnected(sessionId?: string): boolean {
    const targetId = sessionId || this.currentSessionId;
    if (!targetId) return false;
    
    const session = this.activeSessions.get(targetId);
    return session?.isConnected || false;
  }

  /**
   * Get list of active session IDs
   */
  getActiveConnections(): string[] {
    return Array.from(this.activeSessions.keys()).filter(id => {
      const session = this.activeSessions.get(id);
      return session?.isConnected;
    });
  }

  /**
   * Set response handler for external use
   */
  onResponse(handler: (msg: Message) => void): void {
    this.on('response:received', handler);
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
    
    if (this.store) {
      await this.store.disconnect().catch(() => {});
    }
    
    this.removeAllListeners();
  }

  /**
   * Discover available hosts (delegate to HostDiscovery)
   */
  async discoverHosts(criteria: any): Promise<Host[]> {
    if (!this.discoveryUrl) {
      throw new Error('Discovery URL not configured');
    }
    
    const discovery = new HostDiscovery(this.discoveryUrl);
    const hosts = await discovery.discoverHosts({
      model: criteria.model,
      maxPrice: criteria.maxPrice,
      minAvailability: true
    });
    
    return hosts.filter((h: Host) => 
      !criteria.model || h.models.includes(criteria.model)
    );
  }
}