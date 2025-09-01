import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { S5ConversationStore } from './storage/S5ConversationStore';
import { SessionCache } from './storage/SessionCache';
import type { SDKConfig, Session, PaymentReceipt, Host } from './session-types';
import type { Message } from './storage/types';

export class FabstirSessionSDK extends EventEmitter {
  private store: S5ConversationStore;
  private cache: SessionCache<Message[]>;
  private sessions = new Map<number, Session>();
  private currentSession?: Session;
  private responseHandlers: ((msg: Message) => void)[] = [];
  private nextJobId = 1;
  private s5Connected = false;

  constructor(private config: SDKConfig, private signer: ethers.Signer) {
    super();
    this.store = new S5ConversationStore({ seedPhrase: config.s5SeedPhrase, portalUrl: config.s5PortalUrl });
    this.cache = new SessionCache<Message[]>(config.cacheConfig);
    this.store.connect().then(() => this.s5Connected = true).catch(() => this.s5Connected = false);
  }

  isInitialized(): boolean { return true; }

  async startSession(host: Host, deposit: number): Promise<Session> {
    const jobId = this.nextJobId++;
    const session: Session = {
      jobId, client: await this.signer.getAddress(), status: 'Active',
      params: { duration: 3600, maxInactivity: 900, messageLimit: 100, checkpointInterval: 10 },
      checkpointCount: 0, lastCheckpoint: Date.now(), currentCost: '0',
      host, messages: [], websocketUrl: host.url, tokensUsed: 0
    };
    this.sessions.set(jobId, session);
    this.currentSession = session;
    this.emit('session:created', session);
    this.emit('session:connected', session);
    return session;
  }

  async sendPrompt(content: string): Promise<void> {
    if (!this.currentSession) throw new Error('No active session');
    const msg: Message = { id: Date.now().toString(), sessionId: this.currentSession.jobId, 
      role: 'user', content, timestamp: Date.now() };
    this.currentSession.messages.push(msg);
    if (this.s5Connected) await this.store.savePrompt(this.currentSession.jobId, msg);
    this.cache.set(this.currentSession.jobId, this.currentSession.messages);
    this.emit('prompt:sent', msg);
    setTimeout(() => {
      const resp: Message = { id: (Date.now() + 1).toString(), sessionId: this.currentSession!.jobId,
        role: 'assistant', content: 'Mock response', timestamp: Date.now() };
      this.currentSession!.messages.push(resp);
      this.currentSession!.tokensUsed += 2;
      this.responseHandlers.forEach(h => h(resp));
      this.emit('response:received', resp);
    }, 50);
  }

  onResponse(handler: (msg: Message) => void): void { this.responseHandlers.push(handler); }
  async endSession(): Promise<PaymentReceipt> {
    if (!this.currentSession) throw new Error('No active session');
    const receipt: PaymentReceipt = { sessionId: this.currentSession.jobId, 
      totalTokens: this.currentSession.tokensUsed, totalCost: this.calculateCost(this.currentSession),
      transactionHash: '0x' + '0'.repeat(64) };
    this.emit('session:completed', this.currentSession);
    this.currentSession = undefined;
    return receipt;
  }
  async findHosts(criteria: any): Promise<Host[]> {
    return [{ id: 'mock-1', address: '0xmock', url: 'ws://mock', 
      models: [criteria.model], pricePerToken: '1000000000', available: true }];
  }
  async saveConversation(): Promise<void> {
    if (!this.currentSession || !this.s5Connected) return;
    for (const msg of this.currentSession.messages) {
      await this.store.savePrompt(this.currentSession.jobId, msg);
    }
  }
  async loadPreviousSession(sessionId: number): Promise<{ sessionId: number; messages: Message[] }> {
    const cached = this.cache.get(sessionId);
    if (cached) return { sessionId, messages: cached };
    const messages = this.s5Connected ? await this.store.loadSession(sessionId) : [];
    this.cache.set(sessionId, messages);
    return { sessionId, messages };
  }
  getActiveSessions(): Session[] { return Array.from(this.sessions.values()); }
  getActiveSession(id: number): Session | undefined { return this.sessions.get(id); }
  calculateCost(session: Session): string {
    return ethers.utils.formatEther(ethers.BigNumber.from(session.host.pricePerToken).mul(session.tokensUsed));
  }
}