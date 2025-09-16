import { EventEmitter } from 'events';

export interface SessionMessage {
  type: string;
  sessionId: string;
  jobId?: string;
  model?: string;
  maxTokens?: number;
  timestamp?: number;
  tokensGenerated?: number;
  duration?: number;
  success?: boolean;
  error?: string;
  code?: string;
  percentComplete?: number;
}

export interface SessionStats {
  sessionId: string;
  status: 'active' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
  tokensGenerated: number;
  duration?: number;
  error?: string;
}

export interface SessionProgress {
  tokensGenerated: number;
  percentComplete: number;
  status: string;
}

export interface AggregateStats {
  totalSessions: number;
  totalTokens: number;
  averageTokens: number;
  totalDuration: number;
  averageDuration: number;
}

export class MessageHandler extends EventEmitter {
  private sessions: Map<string, SessionStats> = new Map();
  private handlers: Map<string, Function[]> = new Map();

  constructor() {
    super();
  }

  parseMessage(rawMessage: string): any {
    try {
      return JSON.parse(rawMessage);
    } catch {
      return null;
    }
  }

  isValidMessage(message: any): boolean {
    return message && typeof message === 'object' && typeof message.type === 'string';
  }

  handleMessage(rawMessage: string | Buffer): void {
    if (Buffer.isBuffer(rawMessage)) {
      this.handleBinaryMessage(rawMessage);
      return;
    }

    const message = this.parseMessage(rawMessage);
    if (!message || !this.isValidMessage(message)) {
      this.emit('invalid-message', rawMessage);
      return;
    }

    // Route to specific handlers
    this.routeMessage(message);

    // Update session tracking
    this.updateSessionTracking(message);

    // Emit events
    this.emit(message.type, message);
    this.emit('*', message); // Wildcard event
  }

  handleBinaryMessage(buffer: Buffer): void {
    this.emit('binary', buffer);
  }

  binaryToBase64(buffer: Buffer): string {
    return buffer.toString('base64');
  }

  registerHandler(type: string, handler: Function): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  private routeMessage(message: SessionMessage): void {
    const handlers = this.handlers.get(message.type) || [];
    handlers.forEach(handler => handler(message));

    if (handlers.length === 0 && !this.listenerCount(message.type)) {
      this.emit('unknown-message', message);
    }
  }

  private updateSessionTracking(message: SessionMessage): void {
    if (!message.sessionId) return;

    let session = this.sessions.get(message.sessionId);

    switch (message.type) {
      case 'session-request':
      case 'session-start':
        if (!session) {
          session = {
            sessionId: message.sessionId,
            status: 'active',
            startTime: new Date(message.timestamp || Date.now()),
            tokensGenerated: 0
          };
          this.sessions.set(message.sessionId, session);
        }
        break;

      case 'progress':
        if (session) {
          session.tokensGenerated = message.tokensGenerated || session.tokensGenerated;
        }
        break;

      case 'inference-complete':
        if (session) {
          session.status = 'completed';
          session.endTime = new Date();
          session.tokensGenerated = message.tokensGenerated || session.tokensGenerated;
          session.duration = message.duration;
        } else {
          // Create session record even if we didn't see the start
          session = {
            sessionId: message.sessionId,
            status: 'completed',
            endTime: new Date(),
            tokensGenerated: message.tokensGenerated || 0,
            duration: message.duration
          };
          this.sessions.set(message.sessionId, session);
        }
        break;

      case 'session-error':
        if (session) {
          session.status = 'error';
          session.error = message.error;
          session.endTime = new Date();
        }
        break;
    }
  }

  getSessionStats(sessionId: string): SessionStats | undefined {
    return this.sessions.get(sessionId);
  }

  getSessionStatus(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.status;
  }

  getSessionProgress(sessionId: string): SessionProgress | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Find any progress message for this session
    const progress = session.tokensGenerated;
    const percentComplete = session.status === 'completed' ? 100 :
                           session.status === 'error' ? 0 : 25; // Default progress

    return {
      tokensGenerated: progress,
      percentComplete,
      status: session.status === 'active' ? 'in-progress' : session.status
    };
  }

  getAggregateStats(): AggregateStats {
    const sessions = Array.from(this.sessions.values());
    const completedSessions = sessions.filter(s => s.status === 'completed');

    const totalTokens = sessions.reduce((sum, s) => sum + s.tokensGenerated, 0);
    const totalDuration = completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0);

    return {
      totalSessions: sessions.length,
      totalTokens,
      averageTokens: sessions.length > 0 ? totalTokens / sessions.length : 0,
      totalDuration,
      averageDuration: completedSessions.length > 0 ? totalDuration / completedSessions.length : 0
    };
  }

  clearSessionStats(): void {
    this.sessions.clear();
  }

  removeAllListeners(): void {
    super.removeAllListeners();
    this.handlers.clear();
  }
}