// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { S5 } from '@s5-dev/s5js';
interface ConversationData { prompt: string; response: string; jobId: number; timestamp: number; tokensUsed: number; }
interface StorageResult { success: boolean; cid?: string; error?: string; }

export class S5ConversationStore {
  private s5Client: S5 | null = null;
  private seedPhrase: string;
  private portalUrl: string;
  
  constructor(seedPhrase: string, portalUrl: string = 'https://s5.vup.cx') {
    if (!seedPhrase) throw new Error('Seed phrase is required for S5 storage');
    this.seedPhrase = seedPhrase;
    this.portalUrl = portalUrl;
  }

  async initializeS5(): Promise<void> {
    try {
      this.s5Client = await S5.create({
        initialPeers: ["wss://z2DWuPbL5pweybXnEB618pMnV58ECj2VPDNfVGm3tFqBvjF@s5.ninja/s5/p2p"]
      });
      await this.s5Client.recoverIdentityFromSeedPhrase(this.seedPhrase);
      await this.s5Client.registerOnNewPortal(this.portalUrl);
      await this.s5Client.fs.ensureIdentityInitialized();
    } catch (error: any) { throw new Error(`Failed to initialize S5: ${error.message}`); }
  }

  async saveConversation(data: ConversationData): Promise<StorageResult> {
    try {
      if (!this.s5Client) await this.initializeS5();
      const metadata = {
        prompt: data.prompt,
        response: data.response,
        jobId: data.jobId,
        timestamp: data.timestamp || Date.now(),
        tokensUsed: data.tokensUsed,
        type: 'conversation',
        version: '1.0'
      };
      const path = `home/conversations/${data.jobId}-${Date.now()}.json`;
      await this.s5Client!.fs.put(path, metadata);
      return { success: true, cid: path };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  async retrieveConversation(cid: string): Promise<ConversationData | null> {
    try {
      if (!this.s5Client) await this.initializeS5();
      return await this.s5Client!.fs.get(cid) as ConversationData;
    } catch (error) { console.error('Failed to retrieve conversation:', error); return null; }
  }

  async disconnect(): Promise<void> { this.s5Client = null; }
}