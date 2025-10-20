// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { SessionManager } from '../packages/sdk-client/src/session/SessionManager';
import { JobMarketplaceContract } from '../packages/sdk-client/src/contracts/JobMarketplaceContract';
import { WebSocketClient } from '../packages/sdk-client/src/p2p/WebSocketClient';
import { HostDiscovery } from '../packages/sdk-client/src/p2p/HostDiscovery';
import { S5ConversationStore } from './storage/S5ConversationStore';
import { SessionCache } from './storage/SessionCache';
import type { SDKConfig, Session, PaymentReceipt, Host } from './session-types';
import type { Message } from './storage/types';
import type { SessionParams as ComponentSessionParams, SessionJob, TxReceipt } from '../packages/sdk-client/src/session/types';

export class FabstirSessionSDK extends EventEmitter {
  private manager: SessionManager;
  private contract: JobMarketplaceContract;
  private wsClient: WebSocketClient;
  private discovery: HostDiscovery;
  private store?: S5ConversationStore;
  private cache: SessionCache<Message[]>;
  private sessions = new Map<number, Session>();
  private currentSession?: Session;

  constructor(private config: SDKConfig, private signer: ethers.Signer) {
    super();
    this.manager = new SessionManager(signer, config.contractAddress);
    this.contract = new JobMarketplaceContract(signer, config.contractAddress);
    this.wsClient = new WebSocketClient();
    this.discovery = new HostDiscovery(config.discoveryUrl);
    if (config.enableS5 !== false) {
      this.store = new S5ConversationStore({ seedPhrase: config.s5SeedPhrase, portalUrl: config.s5PortalUrl });
      this.store.connect().catch(console.error);
    }
    this.cache = new SessionCache<Message[]>(config.cacheConfig);
  }

  isInitialized(): boolean { return true; }

  async startSession(host: Host, deposit: number): Promise<Session> {
    const cParams: ComponentSessionParams = { hostAddress: host.address,
      depositAmount: ethers.utils.parseEther(deposit.toString()).toString(),
      pricePerToken: host.pricePerToken, maxDuration: 3600 };
    const job = await this.manager.createSession(cParams);
    await this.wsClient.connect(host.url);
    const session: Session = { jobId: job.jobId, client: await this.signer.getAddress(),
      status: job.status, params: { duration: 3600, maxInactivity: 900, messageLimit: 100,
      checkpointInterval: 10 }, checkpointCount: 0, lastCheckpoint: 0, currentCost: '0',
      host, messages: [], websocketUrl: host.url, tokensUsed: 0 };
    this.sessions.set(job.jobId, session); this.currentSession = session;
    this.wsClient.onResponse((msg) => this.handleWsMessage(msg.content, session));
    this.emit('session:created', session); this.emit('session:connected', session);
    return session;
  }

  async sendPrompt(content: string): Promise<void> {
    if (!this.currentSession) throw new Error('No active session');
    const msg: Message = { id: Date.now().toString(), sessionId: this.currentSession.jobId,
      role: 'user', content, timestamp: Date.now() };
    this.currentSession.messages.push(msg);
    if (this.store) await this.store.savePrompt(this.currentSession.jobId, msg).catch(() => {});
    this.cache.set(this.currentSession.jobId, this.currentSession.messages);
    await this.wsClient.sendPrompt(content, this.currentSession.messages.length);
    this.emit('prompt:sent', msg);
  }
  private handleWsMessage(data: string, session: Session) {
    const resp: Message = { id: Date.now().toString(), sessionId: session.jobId,
      role: 'assistant', content: data, timestamp: Date.now() };
    session.messages.push(resp); session.tokensUsed += data.split(' ').length;
    this.emit('response:received', resp);
  }

  onResponse(handler: (msg: Message) => void): void { this.on('response:received', handler); }
  async endSession(): Promise<PaymentReceipt> {
    if (!this.currentSession) throw new Error('No active session');
    const tx = await this.manager.completeSession(this.currentSession.jobId, this.currentSession.tokensUsed);
    const receipt: PaymentReceipt = { sessionId: this.currentSession.jobId,
      totalTokens: this.currentSession.tokensUsed, totalCost: this.calculateCost(this.currentSession),
      transactionHash: tx.transactionHash };
    this.wsClient.disconnect(); this.emit('session:completed', this.currentSession);
    this.currentSession = undefined; return receipt;
  }
  async findHosts(criteria: any): Promise<Host[]> {
    const hosts = await this.discovery.discoverHosts({ model: criteria.model, maxPrice: criteria.maxPrice });
    return hosts.filter((h: Host) => h.models.includes(criteria.model));
  }
  async saveConversation(): Promise<void> {
    if (!this.currentSession || !this.store) return;
    for (const msg of this.currentSession.messages) {
      msg.role === 'user' ? await this.store.savePrompt(this.currentSession.jobId, msg) :
        await this.store.saveResponse(this.currentSession.jobId, msg);
    }
  }
  async loadPreviousSession(sessionId: number): Promise<{ sessionId: number; messages: Message[] }> {
    let msgs = this.cache.get(sessionId);
    if (!msgs && this.store) { msgs = await this.store.loadSession(sessionId).catch(() => []); this.cache.set(sessionId, msgs || []); }
    return { sessionId, messages: msgs || [] };
  }
  getActiveSessions(): Session[] { return Array.from(this.sessions.values()); }
  getActiveSession(id: number): Session | undefined { return this.sessions.get(id); }
  private calculateCost(session: Session): string {
    return ethers.utils.formatEther(ethers.BigNumber.from(session.host.pricePerToken).mul(session.tokensUsed));
  }
  async cleanup(): Promise<void> { if (this.store) await this.store.disconnect().catch(() => {}); }
}