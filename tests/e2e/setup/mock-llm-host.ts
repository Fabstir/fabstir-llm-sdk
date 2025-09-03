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
  
  constructor(private hostAccount: TestAccount) {}

  async start(): Promise<void> {
    this.running = true;
    // Mock WebSocket server would start here
  }

  async stop(): Promise<void> {
    this.running = false;
    // Mock WebSocket server would stop here
  }

  setMockResponse(prompt: string, response: string): void {
    this.responses.set(prompt, response);
  }

  simulateProofOfComputation(): string {
    // Generate mock proof hash
    return '0x' + ethers.utils.keccak256(ethers.utils.toUtf8Bytes('mock-proof')).slice(2);
  }

  getHostInfo(): Host {
    return {
      id: `host-${this.hostAccount.address.slice(2, 8)}`,
      address: this.hostAccount.address,
      url: 'ws://localhost:8080',
      models: ['llama2-7b', 'mistral-7b', 'gpt-3.5'],
      pricePerToken: '0.0001',
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
}