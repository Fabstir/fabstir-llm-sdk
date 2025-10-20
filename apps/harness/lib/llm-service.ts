// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { LLMWebSocketClient } from './websocket-client';
const DEFAULT_PROMPT = "1 + 1 = ?";
interface LLMResponse { response: string; tokens: number; prompt: string; }

export class LLMService {
  private client = new LLMWebSocketClient();
  private fullResponse = '';
  private tokenCount = 0;
  private maxRetries = 3;
  private timeout = 30000;

  async sendPrompt(hostUrl: string, jobId: number, prompt: string = DEFAULT_PROMPT): Promise<LLMResponse> {
    let retries = 0;
    while (retries < this.maxRetries) {
      try { return await this.attemptSendPrompt(hostUrl, jobId, prompt); }
      catch (error) {
        if (++retries >= this.maxRetries) throw error;
        await new Promise(r => setTimeout(r, 1000 * retries)); // retry delay
      }
    }
    throw new Error('Max retries exceeded');
  }

  private attemptSendPrompt(hostUrl: string, jobId: number, prompt: string): Promise<LLMResponse> {
    return new Promise(async (resolve, reject) => {
      this.fullResponse = ''; this.tokenCount = 0;
      const timeoutId = setTimeout(() => {
        this.client.disconnect();
        reject(new Error('Request timeout after 30000ms'));
      }, this.timeout);
      try {
        this.client.setOnToken((token: string) => { // onToken handler
          this.fullResponse += token; this.tokenCount++;
        });
        this.client.setOnComplete(() => {
          clearTimeout(timeoutId);
          resolve({ response: this.fullResponse, tokens: this.tokenCount || this.client.getTokenCount(), prompt });
        });
        this.client.setOnError((error: Error) => { clearTimeout(timeoutId); reject(error); });
        await this.client.connect(hostUrl, jobId);
        this.client.send({ type: "prompt", data: { prompt, timestamp: Date.now() } });
      } catch (error) { clearTimeout(timeoutId); reject(error); }
    });
  }

  getTokenCount(): number { return this.tokenCount; }
  disconnect(): void { this.client.disconnect(); }
}