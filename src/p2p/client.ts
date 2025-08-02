// src/p2p/client.ts
import { P2PConfig } from "../types";

export interface P2PStatus {
  connected: boolean;
  bootstrapNodes: string[];
  peerId?: string;
  connections: number;
  startTime?: number;
}

export class P2PClient {
  private config: P2PConfig;
  private started: boolean = false;
  private startTime?: number;
  private _jobIdCounter: number = 1000; // Start at 1000 to differentiate from mock

  constructor(config: P2PConfig) {
    this.config = { ...config };
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    
    this.started = true;
    this.startTime = Date.now();
  }

  async stop(): Promise<void> {
    if (!this.started) {
      return;
    }
    
    this.started = false;
    this.startTime = undefined;
  }

  isStarted(): boolean {
    return this.started;
  }

  getStatus(): "started" | "stopped" {
    return this.started ? "started" : "stopped";
  }

  getDetailedStatus(): P2PStatus {
    return {
      connected: this.started,
      bootstrapNodes: this.config.bootstrapNodes,
      peerId: this.started ? "12D3KooWMockPeerId" : undefined,
      connections: this.started ? this.config.bootstrapNodes.length : 0,
      startTime: this.startTime
    };
  }

  // Stub methods for production mode
  async submitJob(params: any): Promise<number> {
    // Return mock job ID for now
    this._jobIdCounter++;
    return this._jobIdCounter;
  }

  async getJobStatus(jobId: number): Promise<string | null> {
    // Return 'PROCESSING' for all known jobs in production mode
    // Return null for unknown jobs
    if (jobId > 1000 && jobId <= this._jobIdCounter) {
      return 'PROCESSING';
    }
    return null;
  }

  createResponseStream(jobId: number): AsyncIterableIterator<any> {
    // Return mock stream for production mode
    const mockTokens = ["This ", "is ", "a ", "production ", "mode ", "response."];
    let index = 0;
    
    return {
      async next() {
        if (index < mockTokens.length) {
          const token = {
            content: mockTokens[index],
            index: index,
            timestamp: Date.now()
          };
          index++;
          return { done: false, value: token };
        }
        return { done: true, value: undefined };
      },
      
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  }
}