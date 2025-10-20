// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import 'fake-indexeddb/auto';
import { S5 } from '@s5-dev/s5js';
import type { Message, StorageConfig, AccessGrant } from './types';

export class S5ConversationStore {
  private s5: S5 | null = null;
  constructor(private config: StorageConfig) {
    if (!config.seedPhrase) throw new Error('Seed phrase is required in config');
  }
  
  async connect(): Promise<void> {
    try {
      this.s5 = await S5.create({
        initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
      });
      await this.s5.recoverIdentityFromSeedPhrase(this.config.seedPhrase);
      if (this.config.portalUrl) {
        try {
          await this.s5.registerOnNewPortal(this.config.portalUrl);
        } catch (e: any) {
          if (!e.message?.includes('already has an account')) throw e;
        }
      }
      await this.s5.fs.ensureIdentityInitialized();
    } catch (error) {
      throw new Error(`Failed to connect to S5: ${error}`);
    }
  }
  
  async disconnect(): Promise<void> { this.s5 = null; }
  
  private async saveMessage(sessionId: number, message: Message): Promise<void> {
    if (sessionId < 0) throw new Error('Invalid session ID');
    if (!this.s5) throw new Error('Not connected to S5');
    await this.s5.fs.put(`home/sessions/${sessionId}/messages/${message.timestamp}-${message.id}.json`, message);
  }
  
  async savePrompt(sessionId: number, message: Message): Promise<void> {
    await this.saveMessage(sessionId, message);
  }
  
  async saveResponse(sessionId: number, message: Message): Promise<void> {
    await this.saveMessage(sessionId, message);
  }
  
  async loadSession(sessionId: number): Promise<Message[]> {
    if (!this.s5) throw new Error('Not connected to S5');
    const messages: Message[] = [];
    try {
      for await (const item of this.s5.fs.list(`home/sessions/${sessionId}/messages`)) {
        if (item.type === 'file' && item.name.endsWith('.json')) {
          const msg = await this.s5.fs.get(`home/sessions/${sessionId}/messages/${item.name}`);
          if (msg) messages.push(msg);
        }
      }
    } catch {}
    return messages.sort((a, b) => a.timestamp - b.timestamp);
  }
  
  async grantAccess(sessionId: number, hostAddress: string): Promise<void> {
    if (!this.s5) throw new Error('Not connected to S5');
    await this.s5.fs.put(`home/sessions/${sessionId}/access/${hostAddress}.json`, 
      { sessionId, grantedTo: hostAddress, timestamp: Date.now() } as AccessGrant);
  }
  
  async checkAccess(sessionId: number, hostAddress: string): Promise<boolean> {
    if (!this.s5) throw new Error('Not connected to S5');
    return await this.s5.fs.get(`home/sessions/${sessionId}/access/${hostAddress}.json`) !== undefined;
  }
}