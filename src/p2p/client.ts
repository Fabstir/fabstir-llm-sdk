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
}