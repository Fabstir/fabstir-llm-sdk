// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/helpers/mock-p2p.ts
// Mock P2PClient for testing without actual libp2p

import { EventEmitter } from "events";
import { P2PResponseStream, ResponseStreamOptions, StreamToken, StreamEndSummary, StreamMetrics } from "../../src/types";

export class MockP2PClient extends EventEmitter {
  private started: boolean = false;
  private registeredProtocols: string[] = [];
  
  constructor(config: any) {
    super();
  }
  
  async start(): Promise<void> {
    // Mock start - no actual libp2p
    this.started = true;
    this.registeredProtocols = ["/fabstir/job/1.0.0", "/fabstir/stream/1.0.0"];
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  async stop(): Promise<void> {
    this.started = false;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  
  isStarted(): boolean {
    return this.started;
  }
  
  getRegisteredProtocols(): string[] {
    return [...this.registeredProtocols];
  }
  
  async createResponseStream(nodeId: string, options: ResponseStreamOptions): Promise<P2PResponseStream> {
    // Return a mock stream
    const stream = new MockP2PResponseStream(nodeId, options);
    return stream;
  }
}

class MockP2PResponseStream extends EventEmitter implements P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error" = "active";
  startTime: number;
  bytesReceived: number = 0;
  tokensReceived: number = 0;
  
  private tokenTimer?: NodeJS.Timeout;
  private tokenIndex: number = 0;
  
  constructor(nodeId: string, options: ResponseStreamOptions) {
    super();
    this.nodeId = nodeId;
    this.jobId = options.jobId;
    this.startTime = Date.now();
    
    // Start emitting tokens
    this.startTokenGeneration();
  }
  
  private startTokenGeneration(): void {
    const tokens = ["Hello", " ", "world", "!"];
    
    this.tokenTimer = setInterval(() => {
      if (this.status === "paused" || this.status === "closed") return;
      
      if (this.tokenIndex < tokens.length) {
        const token: StreamToken = {
          content: tokens[this.tokenIndex],
          index: this.tokenIndex,
          timestamp: Date.now(),
          type: "content"
        };
        
        this.tokensReceived++;
        this.bytesReceived += token.content.length;
        this.tokenIndex++;
        
        this.emit("token", token);
      } else {
        const summary: StreamEndSummary = {
          totalTokens: this.tokensReceived,
          duration: Date.now() - this.startTime,
          finalStatus: "completed"
        };
        
        this.emit("end", summary);
        this.status = "closed";
        if (this.tokenTimer) {
          clearInterval(this.tokenTimer);
        }
      }
    }, 50);
  }
  
  pause(): void {
    if (this.status === "active") {
      this.status = "paused";
    }
  }
  
  resume(): void {
    if (this.status === "paused") {
      this.status = "active";
    }
  }
  
  close(): void {
    if (this.status !== "closed") {
      this.status = "closed";
      if (this.tokenTimer) {
        clearInterval(this.tokenTimer);
      }
    }
  }
  
  getMetrics(): StreamMetrics {
    return {
      tokensReceived: this.tokensReceived,
      bytesReceived: this.bytesReceived,
      tokensPerSecond: this.tokensReceived / ((Date.now() - this.startTime) / 1000),
      averageLatency: 50,
      startTime: this.startTime
    };
  }
}