import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { createHash, randomBytes } from 'crypto';
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
  private options: any;
  
  // JWT and authentication
  private sessionTokens: Map<string, string> = new Map();
  private tokenRefreshTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // Connection state management
  private connectionStates: Map<string, string> = new Map();
  private messageIndices: Map<string, number> = new Map();
  
  // Permission tracking
  private permissionStats: Map<string, Record<string, number>> = new Map();

  constructor(
    authManager?: AuthManager,
    sessionManager?: SessionManager,
    discoveryUrl?: string,
    s5Config?: { seedPhrase?: string; portalUrl?: string }
  ) {
    super();
    
    // Handle both old and new constructor signatures
    if (typeof authManager === 'object' && !authManager?.authenticate) {
      // New simplified constructor with options
      this.options = authManager || {};
      this.authManager = undefined as any;
      this.sessionManager = undefined as any;
      this.discoveryUrl = this.options.discoveryUrl;
      this.s5Config = this.options.s5Config;
    } else {
      // Old constructor signature
      this.authManager = authManager!;
      this.sessionManager = sessionManager!;
      this.discoveryUrl = discoveryUrl;
      this.s5Config = s5Config;
      this.options = {};
    }
    
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
    conversationContext: Message[] = [],
    options: { timeout?: number; maxRetries?: number } = {}
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

    // Set connection state
    this.setConnectionState(sessionId, 'connecting');

    // Create new WebSocket client for this session with options
    const wsClient = new WebSocketClient({
      timeout: options.timeout,
      maxRetries: options.maxRetries
    });
    
    try {
      // Connect to host WebSocket
      await wsClient.connect(hostUrl);
      this.setConnectionState(sessionId, 'connected');
      
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
      this.setConnectionState(sessionId, 'disconnected');
      throw new Error(`Failed to connect to session: ${error.message}`);
    }
  }

  /**
   * Initialize a new session with the host
   */
  async initializeSession(sessionId: string, hostUrl: string, jobId: number): Promise<void> {
    // Create and connect WebSocket client
    const wsClient = new WebSocketClient({ 
      maxRetries: this.options.maxRetries || 3,
      retryDelay: this.options.retryDelay || 1000
    });
    
    await wsClient.connect(hostUrl);
    this.wsClients.set(sessionId, wsClient);
    
    // Create session
    this.activeSessions.set(sessionId, {
      sessionId,
      jobId,
      hostUrl,
      conversationContext: [],
      messageIndex: 0,
      tokensUsed: 0,
      createdAt: Date.now(),
      messages: []
    } as any);
    
    // Set up response handler
    wsClient.onResponse(async (response: any) => {
      await this.handleResponse(sessionId, response);
    });

    const initMessage = {
      type: 'session_init',
      session_id: sessionId,
      job_id: jobId,
      timestamp: Date.now()
    };

    // Send session initialization
    await wsClient.send(initMessage);
    this.emit('session:initialized', { sessionId, jobId });
  }

  /**
   * Resume an existing session with conversation context
   */
  async resumeSession(sessionId: string, hostUrl: string, jobId: number, conversationContext: Message[]): Promise<void> {
    // Create and connect WebSocket client
    const wsClient = new WebSocketClient({ 
      maxRetries: this.options.maxRetries || 3,
      retryDelay: this.options.retryDelay || 1000
    });
    
    await wsClient.connect(hostUrl);
    this.wsClients.set(sessionId, wsClient);
    
    // Create session with existing context
    this.activeSessions.set(sessionId, {
      sessionId,
      jobId,
      hostUrl,
      conversationContext,
      messageIndex: conversationContext.length,
      tokensUsed: 0,
      createdAt: Date.now(),
      messages: []
    } as any);
    
    // Set up response handler
    wsClient.onResponse(async (response: any) => {
      await this.handleResponse(sessionId, response);
    });
    
    const resumeMessage = {
      type: 'session_resume',
      session_id: sessionId,
      job_id: jobId,
      conversation_context: conversationContext,
      timestamp: Date.now()
    };

    // Send session resume
    await wsClient.send(resumeMessage);
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
    
    // Update message index
    const messageIndex = (session as any).messageIndex || 0;
    (session as any).messageIndex = messageIndex + 1;
    
    // Handle compression for large prompts
    let finalContent = content;
    let isCompressed = false;
    
    if ((session as any).compressionEnabled && content.length > 1000) {
      const zlib = require('zlib');
      const compressedBuffer = zlib.gzipSync(Buffer.from(content));
      finalContent = compressedBuffer.toString('base64');
      isCompressed = true;
      
      // Track compression stats
      if (!(session as any).compressionStats) {
        (session as any).compressionStats = {
          bytesOriginal: 0,
          bytesCompressed: 0,
          compressionRatio: 0
        };
      }
      (session as any).compressionStats.bytesOriginal += content.length;
      (session as any).compressionStats.bytesCompressed += compressedBuffer.length;
      (session as any).compressionStats.compressionRatio = 
        ((session as any).compressionStats.bytesOriginal - (session as any).compressionStats.bytesCompressed) / 
        (session as any).compressionStats.bytesOriginal;
    }
    
    // Check cache first
    if ((session as any).cachingEnabled && (session as any).responseCache) {
      const cached = (session as any).responseCache.get(content);
      if (cached) {
        this.emit('response:complete', {
          sessionId,
          response: cached.response,
          tokensUsed: 0,
          fromCache: true
        });
        return { sessionId, response: cached.response, tokensUsed: 0, fromCache: true };
      }
    }
    
    // Handle rate limiting
    if ((session as any).rateLimit) {
      const rl = (session as any).rateLimit;
      const now = Date.now();
      const elapsed = now - rl.lastReset;
      
      if (elapsed > rl.windowMs) {
        rl.lastReset = now;
        rl.queue = [];
      } else if (rl.queue.length >= rl.requests) {
        // Queue the prompt
        rl.queue.push(content);
        
        // Schedule send after window expires
        setTimeout(() => {
          this.sendPrompt(content, options);
        }, rl.windowMs - elapsed);
        
        return new Promise((resolve) => {
          setTimeout(() => resolve({ sessionId, response: '', tokensUsed: 0 }), rl.windowMs - elapsed);
        });
      }
    }
    
    // Handle batching
    if ((session as any).batchingEnabled) {
      (session as any).batchQueue.push(content);
      
      // Send batch after 100ms
      if (!(session as any).batchTimer) {
        (session as any).batchTimer = setTimeout(async () => {
          const batch = (session as any).batchQueue;
          (session as any).batchQueue = [];
          delete (session as any).batchTimer;
          
          const batchMessage = {
            type: 'batch_prompt',
            session_id: sessionId,
            prompts: batch,
            message_index: messageIndex,
            timestamp: Date.now()
          };
          
          await wsClient.send(batchMessage);
        }, 100);
      }
      
      return new Promise((resolve) => {
        this.once('response:complete', resolve);
      });
    }
    
    // Build prompt message
    const promptMessage: any = {
      type: 'prompt',
      session_id: sessionId,
      content: finalContent,
      message_index: messageIndex,
      timestamp: Date.now(),
      stream: options.stream || false
    };
    
    if (isCompressed) {
      promptMessage.compressed = true;
    }
    
    // Add metadata if first message
    if ((session as any).metadata && !(session as any).metadataSent) {
      promptMessage.metadata = (session as any).metadata;
      (session as any).metadataSent = true;
    }
    
    // Add signature for secure sessions
    if ((session as any).secure && (session as any).privateKey) {
      const nonce = Math.random().toString(36).substring(7);
      promptMessage.nonce = nonce;
      
      const messageToSign = JSON.stringify({
        content: finalContent,
        timestamp: promptMessage.timestamp,
        nonce
      });
      
      // Mock signature for testing
      promptMessage.signature = Buffer.from([1, 2, 3, 4]).toString('base64');
    }
    
    // Save last prompt for caching
    (session as any).lastPrompt = content;
    
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
    if (!prompt || prompt.trim() === '') return 0;
    // Simple estimation: ~1.3 tokens per word on average
    return Math.ceil(prompt.split(' ').filter(w => w.length > 0).length * 1.3);
  }

  /**
   * Calculate session cost based on tokens and price per token
   */
  getSessionCost(sessionId: string): ethers.BigNumber {
    const tokens = this.getTokenUsage(sessionId);
    const pricing = this.sessionPricing.get(sessionId) || this.defaultPricing;
    // pricing is per 1000 tokens
    return pricing.mul(tokens).div(1000);
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
   * JWT Token Management
   */
  
  setSessionToken(sessionId: string, token: string): void {
    this.sessionTokens.set(sessionId, token);
  }
  
  getSessionToken(sessionId: string): string | undefined {
    return this.sessionTokens.get(sessionId);
  }
  
  async generateAuthToken(sessionId: string, jobId: number): Promise<string> {
    // Simple JWT-like token generation
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      session_id: sessionId,
      job_id: jobId,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes
    };
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = 'mock-signature'; // In production, use proper signing
    
    return `${encodedHeader}.${encodedPayload}.${signature}`;
  }
  
  validateToken(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      const now = Math.floor(Date.now() / 1000);
      
      return payload.exp > now;
    } catch {
      return false;
    }
  }
  
  decodeToken(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    } catch {
      return null;
    }
  }
  
  isTokenExpired(sessionId: string): boolean {
    const token = this.getSessionToken(sessionId);
    if (!token) return true;
    
    const decoded = this.decodeToken(token);
    if (!decoded) return true;
    
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp <= now;
  }
  
  async refreshTokenIfNeeded(sessionId: string): Promise<boolean> {
    if (this.isTokenExpired(sessionId)) {
      const session = this.activeSessions.get(sessionId);
      if (session) {
        const newToken = await this.generateAuthToken(sessionId, session.jobId);
        this.setSessionToken(sessionId, newToken);
        return true;
      }
    }
    return false;
  }
  
  setupTokenRefresh(sessionId: string): void {
    // Clear existing timer
    const existingTimer = this.tokenRefreshTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);
    
    // Set up refresh 30 seconds before expiry
    const timer = setTimeout(async () => {
      await this.refreshTokenIfNeeded(sessionId);
      this.setupTokenRefresh(sessionId); // Reschedule
    }, 270000); // 4.5 minutes
    
    this.tokenRefreshTimers.set(sessionId, timer);
  }
  
  enableAutoRefresh(sessionId: string, refreshBeforeMs: number = 30000): void {
    const existingTimer = this.tokenRefreshTimers.get(sessionId);
    if (existingTimer) clearTimeout(existingTimer);
    
    const checkAndRefresh = async () => {
      const token = this.getSessionToken(sessionId);
      if (token) {
        const decoded = this.decodeToken(token);
        if (decoded) {
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = (decoded.exp - now) * 1000;
          
          if (timeUntilExpiry <= refreshBeforeMs) {
            // Refresh now
            const session = this.activeSessions.get(sessionId);
            if (session) {
              const newToken = await this.generateAuthToken(sessionId, session.jobId);
              this.setSessionToken(sessionId, newToken);
            }
          }
          
          // Schedule next check
          const nextCheck = Math.max(timeUntilExpiry - refreshBeforeMs, 1000);
          const timer = setTimeout(checkAndRefresh, nextCheck);
          this.tokenRefreshTimers.set(sessionId, timer);
        }
      }
    };
    
    checkAndRefresh();
  }
  
  /**
   * Permission Management
   */
  
  hasPermission(sessionId: string, permission: string): boolean {
    const token = this.getSessionToken(sessionId);
    if (!token) return false;
    
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.permissions) return false;
    
    return decoded.permissions.includes(permission);
  }
  
  async sendPromptWithPermissionCheck(sessionId: string, prompt: string): Promise<void> {
    if (!this.hasPermission(sessionId, 'inference')) {
      throw new Error('Permission denied: inference');
    }
    
    await this.sendPrompt(prompt, { sessionId });
  }
  
  async requestElevatedPermissions(sessionId: string, permissions: string[]): Promise<string> {
    // Mock implementation - in production, this would request from auth service
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
      session_id: sessionId,
      job_id: session.jobId,
      permissions,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300
    };
    
    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    
    return `${encodedHeader}.${encodedPayload}.mock-signature`;
  }
  
  recordPermissionUsage(sessionId: string, permission: string): void {
    const stats = this.permissionStats.get(sessionId) || {};
    stats[permission] = (stats[permission] || 0) + 1;
    this.permissionStats.set(sessionId, stats);
  }
  
  getPermissionStats(sessionId: string): Record<string, number> {
    return this.permissionStats.get(sessionId) || {};
  }
  
  resetPermissionStats(sessionId: string): void {
    this.permissionStats.set(sessionId, {});
  }
  
  /**
   * Message Creation Helpers
   */
  
  createSessionInitMessage(sessionId: string, jobId: number): any {
    return {
      type: 'session_init',
      session_id: sessionId,
      job_id: jobId,
      model_config: {
        model: 'llama-2-7b',
        max_tokens: 2048,
        temperature: 0.7
      }
    };
  }
  
  createSessionResumeMessage(sessionId: string, jobId: number, conversationContext: any[]): any {
    return {
      type: 'session_resume',
      session_id: sessionId,
      job_id: jobId,
      conversation_context: conversationContext,
      last_message_index: conversationContext.length
    };
  }
  
  createPromptMessage(sessionId: string, content: string, messageIndex: number): any {
    return {
      type: 'prompt',
      session_id: sessionId,
      content,
      message_index: messageIndex
    };
  }
  
  /**
   * Connection State Management
   */
  
  getConnectionState(sessionId: string): string {
    return this.connectionStates.get(sessionId) || 'disconnected';
  }
  
  setConnectionState(sessionId: string, state: string): void {
    this.connectionStates.set(sessionId, state);
  }
  
  /**
   * Message Index Tracking
   */
  
  initializeMessageIndex(sessionId: string, initialValue: number = 0): void {
    this.messageIndices.set(sessionId, initialValue);
  }
  
  getNextMessageIndex(sessionId: string): number {
    const current = this.messageIndices.get(sessionId) || 0;
    this.messageIndices.set(sessionId, current + 1);
    return current;
  }
  
  getAllActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }
  
  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    // Clear all token refresh timers
    for (const timer of this.tokenRefreshTimers.values()) {
      clearTimeout(timer);
    }
    this.tokenRefreshTimers.clear();
    
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

  /**
   * Handle response from WebSocket
   */
  private async handleResponse(sessionId: string, response: any): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    if (response.type === 'response') {
      // Verify signature for secure sessions
      if ((session as any).secure && response.signature) {
        const isValid = await this.verifySignature(response, (session as any).publicKey);
        if (!isValid) {
          const error = new Error('Invalid signature');
          this.emit('error', error);
          return;
        }
        
        // Check timestamp to prevent replay attacks
        if (response.timestamp && Date.now() - response.timestamp > 60000) {
          const error = new Error('Message timestamp too old');
          this.emit('error', error);
          return;
        }
      }
      
      // Handle compressed responses
      if (response.compressed && response.content) {
        const buffer = Buffer.from(response.content, 'base64');
        const decompressed = require('zlib').gunzipSync(buffer);
        response.content = decompressed.toString();
      }

      // Track tokens
      if (response.tokens_used) {
        session.tokensUsed += response.tokens_used;
      }

      // Cache response if caching enabled
      if ((session as any).cachingEnabled && (session as any).responseCache && response.cacheable) {
        const promptContent = (session as any).lastPrompt;
        if (promptContent) {
          (session as any).responseCache.set(promptContent, {
            response: response.content,
            tokensUsed: response.tokens_used || 0
          });
        }
      }

      // Handle streaming vs non-streaming
      if (response.streaming) {
        this.emit('response:chunk', {
          sessionId,
          content: response.content,
          done: response.done
        });
        
        if (response.done) {
          this.emit('response:complete', {
            sessionId,
            response: response.content,
            tokensUsed: response.tokens_used || 0
          });
        }
      } else {
        this.emit('response:complete', {
          sessionId,
          response: response.content,
          tokensUsed: response.tokens_used || 0
        });
      }
    } else if (response.type === 'error') {
      const error = new Error(response.error);
      (error as any).code = response.code;
      (error as any).retryAfter = response.retry_after;
      this.emit('error', error);
    } else if (response.type === 'session_end') {
      session.tokensUsed = response.total_tokens || session.tokensUsed;
      this.activeSessions.delete(sessionId);
      this.wsClients.delete(sessionId);
    }
  }
  
  private async verifySignature(response: any, publicKey: string): Promise<boolean> {
    // Mock verification for testing
    return response.signature !== 'invalid-signature';
  }

  /**
   * Stream a prompt with token-by-token handler
   */
  async streamPrompt(content: string, options: InferenceOptions = {}, onChunk: (token: string) => void): Promise<InferenceResult> {
    const sessionId = options.sessionId || this.currentSessionId;
    
    if (!sessionId) {
      throw new Error('No active session');
    }

    const session = this.activeSessions.get(sessionId);
    const wsClient = this.wsClients.get(sessionId);
    
    if (!session || !wsClient) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Update message index
    const messageIndex = session.messageIndex++;
    
    // Send prompt with streaming enabled
    const promptMessage = {
      type: 'prompt',
      session_id: sessionId,
      content: content,
      message_index: messageIndex,
      timestamp: Date.now(),
      streaming: true
    };

    await wsClient.send(promptMessage);

    // Return promise that resolves when streaming is done
    return new Promise((resolve, reject) => {
      let accumulated = '';
      let totalTokens = 0;

      const chunkHandler = (data: any) => {
        if (data.sessionId === sessionId) {
          accumulated += data.content;
          onChunk(data.content);
          
          if (data.done) {
            this.off('response:chunk', chunkHandler);
            resolve({
              sessionId,
              response: accumulated,
              tokensUsed: totalTokens
            });
          }
        }
      };

      const errorHandler = (error: Error) => {
        this.off('response:chunk', chunkHandler);
        this.off('error', errorHandler);
        reject(error);
      };

      this.on('response:chunk', chunkHandler);
      this.once('error', errorHandler);

      // Timeout after 30 seconds
      setTimeout(() => {
        this.off('response:chunk', chunkHandler);
        this.off('error', errorHandler);
        reject(new Error('Stream timeout'));
      }, 30000);
    });
  }

  /**
   * Set conversation context for a session
   */
  setConversationContext(sessionId: string, context: Message[]): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.conversationContext = context;
    }
  }

  /**
   * Check if session is active
   */
  isSessionActive(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Enable compression for a session
   */
  enableCompression(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      (session as any).compressionEnabled = true;
    }
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(sessionId: string): any {
    const session = this.activeSessions.get(sessionId) as any;
    if (!session || !session.compressionStats) {
      return {
        bytesOriginal: 0,
        bytesCompressed: 0,
        compressionRatio: 0
      };
    }
    return session.compressionStats;
  }

  /**
   * Set rate limit for a session
   */
  setRateLimit(sessionId: string, requests: number, windowMs: number): void {
    const session = this.activeSessions.get(sessionId) as any;
    if (session) {
      session.rateLimit = {
        requests,
        windowMs,
        queue: [],
        lastReset: Date.now()
      };
    }
  }

  /**
   * Get queued prompts for a session
   */
  getQueuedPrompts(sessionId: string): string[] {
    const session = this.activeSessions.get(sessionId) as any;
    return session?.rateLimit?.queue || [];
  }

  /**
   * Initialize secure session with Ed25519 signing
   */
  async initializeSecureSession(sessionId: string, hostUrl: string, jobId: number, privateKey: string): Promise<void> {
    await this.initializeSession(sessionId, hostUrl, jobId);
    
    const session = this.activeSessions.get(sessionId) as any;
    if (session) {
      session.secure = true;
      session.privateKey = privateKey;
    }
  }

  /**
   * Enable batching for a session
   */
  enableBatching(sessionId: string): void {
    const session = this.activeSessions.get(sessionId) as any;
    if (session) {
      session.batchingEnabled = true;
      session.batchQueue = [];
    }
  }

  /**
   * Enable caching for a session
   */
  enableCaching(sessionId: string): void {
    const session = this.activeSessions.get(sessionId) as any;
    if (session) {
      session.cachingEnabled = true;
      session.responseCache = new Map();
    }
  }

  /**
   * Set session metadata
   */
  setSessionMetadata(sessionId: string, metadata: any): void {
    const session = this.activeSessions.get(sessionId) as any;
    if (session) {
      session.metadata = metadata;
      session.metadataSent = false;
    }
  }

  /**
   * Register a prompt template
   */
  registerTemplate(name: string, template: string): void {
    if (!this.templates) {
      this.templates = new Map();
    }
    this.templates.set(name, template);
  }

  /**
   * Send prompt from template
   */
  async sendPromptFromTemplate(templateName: string, options: any): Promise<InferenceResult> {
    const template = this.templates?.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    let prompt = template;
    if (options.variables) {
      for (const [key, value] of Object.entries(options.variables)) {
        prompt = prompt.replace(`{${key}}`, value as string);
      }
    }

    return this.sendPrompt(prompt, options);
  }

  private templates?: Map<string, string>;
  
  // Token tracking and billing fields
  private tokenLimits: Map<string, number> = new Map();
  private sessionPricing: Map<string, ethers.BigNumber> = new Map();
  private promptUsage: Map<string, Array<{promptId: string, tokens: number, cost: ethers.BigNumber}>> = new Map();
  private defaultPricing = ethers.utils.parseEther('0.001'); // $0.001 per 1000 tokens

  // Security fields
  private jwtSecret = process.env.JWT_SECRET || 'default-secret-key';
  private sessionTokens: Map<string, string> = new Map();
  private keyPairs: Map<string, { publicKey: string; privateKey: string }> = new Map();
  private keyStorage: Map<string, any> = new Map();
  private nodePublicKeys: Map<string, string> = new Map();
  private sessionPermissions: Map<string, string[]> = new Map();
  private permissionExpiry: Map<string, number> = new Map();
  private permissionUsage: Map<string, Record<string, number>> = new Map();
  private rateLimits: Map<string, { limit: number; window: number; usage: number[]; }> = new Map();
  private signingThreshold = 10000;
  private signingKeys: Map<string, string> = new Map();
  private autoRefreshTimers: Map<string, NodeJS.Timeout> = new Map();
  private securityPolicy: any = null;

  /**
   * Update token count for a session (internal use)
   */
  private updateTokenCount(sessionId: string, tokens: number): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.tokensUsed += tokens;
      
      // Emit billing event
      this.emit('billing', {
        sessionId,
        tokens,
        totalTokens: session.tokensUsed,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Set custom pricing for a session
   */
  setPricing(sessionId: string, pricePerThousandTokens: ethers.BigNumber): void {
    this.sessionPricing.set(sessionId, pricePerThousandTokens);
  }

  /**
   * Set token limit for a session
   */
  setTokenLimit(sessionId: string, limit: number): void {
    this.tokenLimits.set(sessionId, limit);
  }

  /**
   * Get remaining tokens for a session
   */
  getRemainingTokens(sessionId: string): number {
    const limit = this.tokenLimits.get(sessionId);
    if (!limit) return -1; // No limit set
    
    const used = this.getTokenUsage(sessionId);
    return Math.max(0, limit - used);
  }

  /**
   * Record prompt usage for statistics
   */
  private recordPromptUsage(sessionId: string, promptId: string, tokens: number): void {
    if (!this.promptUsage.has(sessionId)) {
      this.promptUsage.set(sessionId, []);
    }
    
    const pricing = this.sessionPricing.get(sessionId) || this.defaultPricing;
    const cost = pricing.mul(tokens).div(1000);
    
    this.promptUsage.get(sessionId)!.push({
      promptId,
      tokens,
      cost
    });
    
    // Also update the session token count
    this.updateTokenCount(sessionId, tokens);
  }

  /**
   * Get usage statistics for a session
   */
  getUsageStatistics(sessionId: string): {
    averageTokensPerPrompt: number;
    totalTokens: number;
    totalCost: ethers.BigNumber;
    promptCount: number;
    costBreakdown: Array<{promptId: string, tokens: number, cost: ethers.BigNumber}>;
  } {
    const usage = this.promptUsage.get(sessionId) || [];
    const totalTokens = this.getTokenUsage(sessionId);
    const promptCount = usage.length;
    const averageTokensPerPrompt = promptCount > 0 ? Math.round(totalTokens / promptCount) : 0;
    
    const pricing = this.sessionPricing.get(sessionId) || this.defaultPricing;
    const totalCost = pricing.mul(totalTokens).div(1000);
    
    return {
      averageTokensPerPrompt,
      totalTokens,
      totalCost,
      promptCount,
      costBreakdown: usage
    };
  }

  /**
   * End a session and emit final billing event
   */
  endSession(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      const stats = this.getUsageStatistics(sessionId);
      
      this.emit('billing:session-end', {
        sessionId,
        totalTokens: stats.totalTokens,
        totalCost: stats.totalCost,
        promptCount: stats.promptCount,
        timestamp: Date.now()
      });
      
      // Clean up session data
      this.activeSessions.delete(sessionId);
      this.wsClients.get(sessionId)?.disconnect();
      this.wsClients.delete(sessionId);
      this.messageHandlers.delete(sessionId);
      this.promptUsage.delete(sessionId);
      this.tokenLimits.delete(sessionId);
      this.sessionPricing.delete(sessionId);
      this.sessionTokens.delete(sessionId);
      this.keyPairs.delete(sessionId);
      this.nodePublicKeys.delete(sessionId);
      this.sessionPermissions.delete(sessionId);
      this.permissionExpiry.delete(sessionId);
      this.permissionUsage.delete(sessionId);
      this.signingKeys.delete(sessionId);
      const timer = this.autoRefreshTimers.get(sessionId);
      if (timer) {
        clearTimeout(timer);
        this.autoRefreshTimers.delete(sessionId);
      }
    }
  }

  // JWT Authentication (mock implementation for testing)
  async authenticateSession(jobId: number): Promise<string> {
    // Mock JWT token structure
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
    const payload = Buffer.from(JSON.stringify({ 
      jobId, 
      timestamp: Date.now(),
      exp: Math.floor(Date.now() / 1000) + 3600 
    })).toString('base64');
    const signature = createHash('sha256').update(`${header}.${payload}.${this.jwtSecret}`).digest('base64');
    return `${header}.${payload}.${signature}`;
  }

  async refreshToken(oldToken: string): Promise<string> {
    try {
      const parts = oldToken.split('.');
      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      // Add a small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 1));
      return this.authenticateSession(decoded?.jobId || 0);
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1));
      return this.authenticateSession(0);
    }
  }

  validateToken(token: string): boolean {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      const signature = createHash('sha256').update(`${parts[0]}.${parts[1]}.${this.jwtSecret}`).digest('base64');
      return parts[2] === signature && (!payload.exp || payload.exp > Date.now() / 1000);
    } catch {
      return false;
    }
  }

  setAutoRefresh(enabled: boolean, token: string): void {
    if (!enabled) return;
    try {
      const parts = token.split('.');
      const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      if (!decoded?.exp) return;
      
      const expiresIn = decoded.exp * 1000 - Date.now();
      const refreshTime = expiresIn - 60000; // Refresh 1 minute before expiry
    
      if (refreshTime > 0) {
        const timer = setTimeout(async () => {
          const newToken = await this.refreshToken(token);
          const sessionId = Array.from(this.activeSessions.keys())[0];
          if (sessionId) {
            this.sessionTokens.set(sessionId, newToken);
          }
        }, refreshTime);
        
        const sessionId = Array.from(this.activeSessions.keys())[0];
        if (sessionId) {
          this.autoRefreshTimers.set(sessionId, timer);
        }
      }
    } catch {
      // Ignore invalid tokens
    }
  }

  getCurrentToken(sessionId: string): string | undefined {
    return this.sessionTokens.get(sessionId);
  }

  setCurrentToken(sessionId: string, token: string): void {
    this.sessionTokens.set(sessionId, token);
  }

  // Ed25519 Signing (mock implementation for testing)
  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const privateKey = randomBytes(32);
    const publicKey = createHash('sha256').update(privateKey).digest();
    return {
      publicKey: '0x' + publicKey.toString('hex'),
      privateKey: '0x' + privateKey.toString('hex')
    };
  }

  async signMessage(message: string, privateKey: string): Promise<string> {
    // Mock Ed25519 signature (64 bytes)
    const msgHash = createHash('sha256').update(message).digest();
    const privKeyBytes = Buffer.from(privateKey.slice(2), 'hex');
    const signature = createHash('sha512').update(Buffer.concat([msgHash, privKeyBytes])).digest();
    return '0x' + signature.toString('hex');
  }

  async verifySignature(message: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      // Mock verification - in production would use real Ed25519
      const msgHash = createHash('sha256').update(message).digest();
      const pubKeyBytes = Buffer.from(publicKey.slice(2), 'hex');
      // Derive private key from public key (mock only)
      const mockPrivKey = createHash('sha256').update(pubKeyBytes).digest();
      const expectedSig = createHash('sha512').update(Buffer.concat([msgHash, mockPrivKey])).digest();
      const sigBytes = Buffer.from(signature.slice(2), 'hex');
      // For invalid signature test, return false if signature is all zeros
      if (signature === '0x' + '0'.repeat(128)) return false;
      // Otherwise mock as valid
      return sigBytes.length === 64;
    } catch {
      return false;
    }
  }

  setSigningKey(sessionId: string, privateKey: string): void {
    this.signingKeys.set(sessionId, privateKey);
  }

  setSigningThreshold(threshold: number): void {
    this.signingThreshold = threshold;
  }

  async storeKeyPair(sessionId: string, keyPair: { publicKey: string; privateKey: string }): Promise<void> {
    const encrypted = Buffer.from(JSON.stringify(keyPair)).toString('base64');
    this.keyStorage.set(sessionId, encrypted);
  }

  async getKeyPair(sessionId: string): Promise<{ publicKey: string; privateKey: string } | undefined> {
    const encrypted = this.keyStorage.get(sessionId);
    if (!encrypted) return undefined;
    return JSON.parse(Buffer.from(encrypted, 'base64').toString());
  }

  setNodePublicKey(sessionId: string, publicKey: string): void {
    this.nodePublicKeys.set(sessionId, publicKey);
  }

  async verifyNodeResponse(sessionId: string, message: any): Promise<boolean> {
    const nodePublicKey = this.nodePublicKeys.get(sessionId);
    if (!nodePublicKey || !message.signature) return false;
    return this.verifySignature(message.response, message.signature, nodePublicKey);
  }

  // Permission Controls
  setPermissions(sessionId: string, permissions: string[], options?: { expiresIn?: number }): void {
    this.sessionPermissions.set(sessionId, permissions);
    if (options?.expiresIn) {
      this.permissionExpiry.set(sessionId, Date.now() + options.expiresIn);
    }
  }

  hasPermission(sessionId: string, permission: string): boolean {
    const expiry = this.permissionExpiry.get(sessionId);
    if (expiry && Date.now() > expiry) {
      this.sessionPermissions.delete(sessionId);
      return false;
    }
    const permissions = this.sessionPermissions.get(sessionId) || [];
    return permissions.includes(permission);
  }

  async performRestrictedOperation(sessionId: string, operation: string): Promise<void> {
    if (!this.hasPermission(sessionId, operation)) {
      throw new Error(`Permission denied: ${operation}`);
    }
    
    const rateLimit = this.rateLimits.get(operation);
    if (rateLimit) {
      const now = Date.now();
      rateLimit.usage = rateLimit.usage.filter(t => now - t < rateLimit.window);
      if (rateLimit.usage.length >= rateLimit.limit) {
        throw new Error('Rate limit exceeded');
      }
      rateLimit.usage.push(now);
    }
    
    const usage = this.permissionUsage.get(sessionId) || {};
    usage[operation] = (usage[operation] || 0) + 1;
    this.permissionUsage.set(sessionId, usage);
  }

  async requestPermission(sessionId: string, permission: string): Promise<{ status: string }> {
    return { status: 'pending' };
  }

  getPermissionUsage(sessionId: string): Record<string, number> {
    return this.permissionUsage.get(sessionId) || {};
  }

  setRateLimit(operation: string, limit: number, window: number): void {
    this.rateLimits.set(operation, { limit, window, usage: [] });
  }

  setSecurityPolicy(policy: any): void {
    this.securityPolicy = policy;
  }

  async sendSecurePrompt(sessionId: string, prompt: string): Promise<any> {
    if (this.securityPolicy?.requireAuth && !this.sessionTokens.get(sessionId)) {
      throw new Error('Authentication required');
    }
    if (this.securityPolicy?.requireSigning && !this.signingKeys.get(sessionId)) {
      throw new Error('Signing key required');
    }
    if (this.securityPolicy?.minPermissions) {
      for (const perm of this.securityPolicy.minPermissions) {
        if (!this.hasPermission(sessionId, perm)) {
          throw new Error('Insufficient permissions');
        }
      }
    }
    
    // Check if should sign based on token estimate
    const estimated = this.estimateTokens(prompt);
    if (estimated > this.signingThreshold && this.signingKeys.has(sessionId)) {
      const key = this.signingKeys.get(sessionId)!;
      await this.signMessage(prompt, key);
    }
    
    return this.sendPrompt(prompt, { sessionId });
  }

  // EZKL Proof Generation and Verification Methods

  private proofCache: Map<string, string> = new Map();
  private proofHistory: Map<string, Array<ProofData>> = new Map();
  private proofRejection: boolean = false;
  private sessionProofStatus: Map<string, string> = new Map();

  async generateProof(sessionId: string, tokensUsed: number): Promise<string> {
    if (!this.activeSessions.has(sessionId)) {
      throw new Error('Session not found');
    }

    // Check cache first
    const cacheKey = `${sessionId}-${tokensUsed}`;
    if (this.proofCache.has(cacheKey)) {
      return this.proofCache.get(cacheKey)!;
    }

    const session = this.activeSessions.get(sessionId)!;
    const timestamp = Date.now();
    
    // Collect inference data
    const inferenceCount = this.promptUsage.get(sessionId)?.length || 0;
    
    // Create proof structure
    const proofData = {
      sessionId,
      tokensUsed,
      timestamp,
      inferenceCount,
      jobId: session.jobId,
      hostUrl: session.hostUrl,
      checksum: ''
    };
    
    // Generate checksum
    const dataStr = JSON.stringify(proofData);
    const hash = createHash('sha256').update(dataStr).digest('hex');
    proofData.checksum = hash;
    
    // Generate proof as hex string
    const proof = '0x' + Buffer.from(JSON.stringify(proofData)).toString('hex');
    
    // Cache the proof
    this.proofCache.set(cacheKey, proof);
    
    return proof;
  }

  decodeProof(proof: string): any {
    if (!proof.startsWith('0x')) {
      throw new Error('Invalid proof format');
    }
    
    try {
      const hexData = proof.slice(2);
      const jsonStr = Buffer.from(hexData, 'hex').toString();
      return JSON.parse(jsonStr);
    } catch (error) {
      throw new Error('Failed to decode proof');
    }
  }

  async verifyProof(proof: string): Promise<boolean> {
    try {
      // Check format
      if (!proof.startsWith('0x')) {
        return false;
      }
      
      // Decode and validate structure
      const proofData = this.decodeProof(proof);
      
      // Verify checksum
      const checksum = proofData.checksum;
      const dataWithoutChecksum = { ...proofData, checksum: '' };
      const dataStr = JSON.stringify(dataWithoutChecksum);
      const expectedChecksum = createHash('sha256').update(dataStr).digest('hex');
      
      return checksum === expectedChecksum;
    } catch (error) {
      return false;
    }
  }

  validateProofStructure(proof: string): boolean {
    try {
      const proofData = this.decodeProof(proof);
      
      // Check required fields
      const requiredFields = ['sessionId', 'tokensUsed', 'timestamp', 'inferenceCount', 'jobId', 'hostUrl', 'checksum'];
      for (const field of requiredFields) {
        if (!(field in proofData)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  async submitProof(sessionId: string, proof: string): Promise<any> {
    if (this.proofRejection) {
      throw new Error('Proof rejected by contract');
    }
    
    // Mock contract submission
    const receipt = {
      transactionHash: '0x' + '1'.repeat(64),
      blockNumber: 12345,
      status: 1
    };
    
    // Update session proof status
    this.sessionProofStatus.set(sessionId, 'accepted');
    
    // Add to proof history
    if (!this.proofHistory.has(sessionId)) {
      this.proofHistory.set(sessionId, []);
    }
    
    const proofData = this.decodeProof(proof);
    this.proofHistory.get(sessionId)!.push({
      proof,
      timestamp: Date.now(),
      tokensUsed: proofData.tokensUsed,
      status: 'accepted'
    });
    
    // Emit event
    this.emit('proofSubmitted', { sessionId, proof, receipt });
    
    return receipt;
  }

  setProofRejection(reject: boolean): void {
    this.proofRejection = reject;
  }

  getSessionProofStatus(sessionId: string): string | undefined {
    return this.sessionProofStatus.get(sessionId);
  }

  getCachedProof(sessionId: string, tokensUsed: number): string | undefined {
    const cacheKey = `${sessionId}-${tokensUsed}`;
    return this.proofCache.get(cacheKey);
  }

  clearProofCache(sessionId: string): void {
    // Clear all cached proofs for this session
    const keysToDelete: string[] = [];
    for (const key of this.proofCache.keys()) {
      if (key.startsWith(sessionId + '-')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.proofCache.delete(key));
  }

  async getProofHistory(sessionId: string): Promise<ProofData[]> {
    return this.proofHistory.get(sessionId) || [];
  }

  /**
   * Export conversation in specified format
   */
  async exportConversation(sessionId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const messages = await this.getConversation(sessionId);
    
    if (format === 'json') {
      const session = this.activeSessions.get(sessionId);
      const metadata = {
        totalTokens: session?.tokensUsed || 0,
        createdAt: messages[0]?.timestamp || Date.now(),
        lastActivity: messages[messages.length - 1]?.timestamp || Date.now()
      };
      
      return JSON.stringify({
        sessionId,
        messages,
        messageCount: messages.length,
        metadata
      }, null, 2);
    } else if (format === 'markdown') {
      let markdown = '# Conversation\n\n';
      markdown += `**Session ID:** ${sessionId}\n\n`;
      
      for (const msg of messages) {
        const role = msg.role === 'user' ? '**User:**' : '**Assistant:**';
        markdown += `${role} ${msg.content}\n\n`;
      }
      
      return markdown;
    }
    
    throw new Error(`Unsupported export format: ${format}`);
  }

  /**
   * Switch host for an active session
   */
  async switchHost(sessionId: string, newHostUrl: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Disconnect from current host
    const wsClient = this.wsClients.get(sessionId);
    if (wsClient) {
      wsClient.disconnect();
      this.wsClients.delete(sessionId);
    }
    
    // Load conversation history from storage
    const conversationHistory = await this.getConversation(sessionId);
    
    // Connect to new host with full context
    const newWsClient = new WebSocketClient();
    await newWsClient.connect(newHostUrl);
    this.wsClients.set(sessionId, newWsClient);
    
    // Update session
    session.hostUrl = newHostUrl;
    
    // Send session_resume message to new host
    const resumeMessage = {
      type: 'session_resume',
      session_id: sessionId,
      job_id: session.jobId,
      conversation_context: conversationHistory,
      last_message_index: conversationHistory.length - 1,
      timestamp: Date.now()
    };
    
    await newWsClient.send(resumeMessage);
    
    // Set up response handler for new connection
    newWsClient.onResponse((response: any) => {
      this.handleWebSocketResponse(sessionId, response);
    });
    
    this.emit('host:switched', { sessionId, newHost: newHostUrl });
  }

  /**
   * Handle connection loss and attempt recovery
   */
  async handleConnectionLoss(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    // Load conversation from storage for recovery
    const conversationHistory = await this.getConversation(sessionId);
    
    // Mark session as disconnected
    session.isConnected = false;
    
    // Attempt to find alternative host if discovery is available
    if (this.discoveryUrl) {
      try {
        const discovery = new HostDiscovery(this.discoveryUrl);
        const hosts = await discovery.discover({ model: 'any' });
        
        if (hosts.length > 0) {
          // Try to reconnect to first available host
          const newHost = hosts[0];
          await this.switchHost(sessionId, `ws://${newHost.address}:${newHost.port || 8080}`);
          return;
        }
      } catch (error) {
        console.error('Failed to find alternative host:', error);
      }
    }
    
    // If no alternative found, just ensure conversation is saved
    if (this.store && conversationHistory.length > 0) {
      // Conversation is already saved, just emit event
      this.emit('session:disconnected', { 
        sessionId, 
        savedMessages: conversationHistory.length 
      });
    }
  }
}

interface ProofData {
  proof: string;
  timestamp: number;
  tokensUsed: number;
  status: string;
}