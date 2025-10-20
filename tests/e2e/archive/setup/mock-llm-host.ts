// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { TestAccount } from './test-accounts';
import { ethers } from 'ethers';

export interface Host {
  id: string;
  address: string;
  url: string;
  models: string[];
  pricePerToken: string;
  available: boolean;
}

export class MockLLMHost {
  public autoAcceptSessions: boolean = true;
  private responses: Map<string, string> = new Map();
  private running: boolean = false;
  private activeSessions: Map<number, any> = new Map();
  
  constructor(private hostAccount: TestAccount) {}

  async start(): Promise<void> {
    this.running = true;
    // Mock staking - reduce balance by 1 USDC
    const { setMockBalance, checkBalance } = await import('./test-helpers');
    const currentBalance = await checkBalance(this.hostAccount);
    await setMockBalance(this.hostAccount.address, currentBalance - BigInt(1000000));
  }

  async stop(): Promise<void> {
    this.running = false;
    // Mock WebSocket server would stop here
  }

  setMockResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response);
  }

  simulateProofOfComputation(sessionId?: number): string {
    // Generate mock proof hash
    const proofData = `mock-proof-${sessionId || Date.now()}`;
    return '0x' + ethers.utils.keccak256(ethers.utils.toUtf8Bytes(proofData)).slice(2);
  }

  getHostInfo(): Host {
    return {
      id: `host-${this.hostAccount.address.slice(2, 8)}`,
      address: this.hostAccount.address,
      url: 'ws://localhost:8080',
      models: ['llama2-7b', 'mistral-7b', 'gpt-3.5'],
      pricePerToken: '100000000000000', // 0.0001 ETH in Wei
      available: true
    };
  }

  // Internal helpers for mock responses
  private generateResponse(prompt: string): string {
    if (this.responses.has(prompt)) {
      return this.responses.get(prompt)!;
    }
    return `Mock response to: ${prompt}`;
  }

  // Mock session handling
  async handleSession(sessionId: number, deposit: string): Promise<void> {
    if (!this.autoAcceptSessions) {
      throw new Error('Session not accepted');
    }
    // Mock session acceptance logic
  }

  // Get mock WebSocket endpoint
  getWebSocketEndpoint(): string {
    return this.getHostInfo().url;
  }

  // Check if host is running
  isRunning(): boolean {
    return this.running;
  }

  // Accept incoming session
  async acceptSession(jobId: number): Promise<boolean> {
    if (!this.autoAcceptSessions) return false;
    this.activeSessions.set(jobId, { jobId, status: 'active', startTime: Date.now() });
    return true;
  }

  // Get active session
  getActiveSession(jobId: number): any {
    return this.activeSessions.get(jobId);
  }

  // Process prompt for session
  async processPrompt(jobId: number, prompt: string): Promise<string> {
    if (!this.activeSessions.has(jobId)) throw new Error('Session not found');
    return this.generateResponse(prompt);
  }
}