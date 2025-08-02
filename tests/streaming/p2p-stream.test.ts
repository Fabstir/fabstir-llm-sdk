// tests/streaming/p2p-stream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Add polyfills for P2PClient tests
if (typeof globalThis.CustomEvent !== 'function') {
  (globalThis as any).CustomEvent = class CustomEvent extends Event {
    detail: any;
    constructor(type: string, params?: any) {
      super(type, params);
      this.detail = params?.detail;
    }
  };
}

import { FabstirSDK } from "../../src/index";
import { P2PClient } from "../../src/p2p/client";
import { BigNumber } from "ethers";

describe("P2P Response Streaming - Sub-phase 2.8", () => {
  let sdk: FabstirSDK;
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi
          .fn()
          .mockResolvedValue("0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1"),
        signMessage: vi.fn().mockResolvedValue("0xsignature"),
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
  });

  afterEach(async () => {
    if (sdk && sdk.isConnected) {
      await sdk.disconnect();
    }
  });

  describe("Stream Protocol", () => {
    it("should register stream protocol in P2PClient", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should register response stream protocol
      const protocols = client.getRegisteredProtocols();
      expect(protocols).toContain("/fabstir/stream/1.0.0");

      await client.stop();
    });

    it("should implement createResponseStream method", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should have createResponseStream method
      expect(typeof client.createResponseStream).toBe("function");

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      expect(stream).toBeDefined();
      expect(stream.jobId).toBe("job-123");

      await client.stop();
    });

    it("should define P2PResponseStream interface", () => {
      // Test the interface exists
      const stream: P2PResponseStream = {
        jobId: "job-123",
        nodeId: "12D3KooWNode1",
        status: "active",
        startTime: Date.now(),
        bytesReceived: 0,
        tokensReceived: 0,
        on: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        close: vi.fn(),
        getMetrics: vi.fn(),
      };

      expect(stream).toBeDefined();
      expect(stream.status).toBe("active");
    });
  });

  describe("Token Message Handling", () => {
    it("should emit token events as they arrive", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      const tokenSpy = vi.fn();
      stream.on("token", tokenSpy);

      // Simulate receiving tokens
      // (In real implementation, these would come from P2P stream)
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should have received some tokens
      expect(tokenSpy).toHaveBeenCalled();

      const firstCall = tokenSpy.mock.calls[0];
      if (firstCall) {
        const token: StreamToken = firstCall[0];
        expect(token).toHaveProperty("content");
        expect(token).toHaveProperty("index");
        expect(token).toHaveProperty("timestamp");
      }

      stream.close();
      await client.stop();
    });

    it("should handle different token types", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      const tokens: StreamToken[] = [];
      stream.on("token", (token: StreamToken) => {
        tokens.push(token);
      });

      // Wait for tokens
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should handle regular tokens and special tokens
      const regularTokens = tokens.filter((t) => t.type === "content");
      const metaTokens = tokens.filter((t) => t.type === "metadata");

      expect(regularTokens.length).toBeGreaterThan(0);
      // Meta tokens are optional

      stream.close();
      await client.stop();
    });

    it("should emit end event when stream completes", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      const endSpy = vi.fn();
      stream.on("end", endSpy);

      // Simulate stream completion
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(endSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          totalTokens: expect.any(Number),
          duration: expect.any(Number),
        })
      );

      await client.stop();
    });
  });

  describe("Stream Resumption", () => {
    it("should support pausing and resuming streams", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      let tokenCount = 0;
      stream.on("token", () => tokenCount++);

      // Let some tokens flow
      await new Promise((resolve) => setTimeout(resolve, 100));
      const countBeforePause = tokenCount;

      // Pause the stream
      stream.pause();
      expect(stream.status).toBe("paused");

      // Wait - no new tokens should arrive
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(tokenCount).toBe(countBeforePause);

      // Resume the stream
      stream.resume();
      expect(stream.status).toBe("active");

      // Should receive more tokens
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(tokenCount).toBeGreaterThan(countBeforePause);

      stream.close();
      await client.stop();
    });

    it("should resume from last received token after disconnect", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      const tokens: StreamToken[] = [];
      stream.on("token", (token) => tokens.push(token));

      // Receive some tokens
      await new Promise((resolve) => setTimeout(resolve, 150));
      const lastIndex = tokens[tokens.length - 1]?.index || 0;

      // Simulate disconnect
      stream.on("error", () => {});

      // Resume from checkpoint
      const resumedStream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
        resumeFrom: lastIndex + 1,
      });

      const resumedTokens: StreamToken[] = [];
      resumedStream.on("token", (token) => resumedTokens.push(token));

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should not receive duplicate tokens
      if (resumedTokens.length > 0) {
        expect(resumedTokens[0].index).toBeGreaterThan(lastIndex);
      }

      resumedStream.close();
      await client.stop();
    });

    it("should handle stream errors gracefully", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWUnreliable", {
        jobId: "job-789",
        requestId: "req-789",
      });

      const errorSpy = vi.fn();
      stream.on("error", errorSpy);

      // Wait for potential error
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should handle errors without crashing
      if (errorSpy.mock.calls.length > 0) {
        const error = errorSpy.mock.calls[0][0];
        expect(error).toHaveProperty("code");
        expect(error).toHaveProperty("message");
      }

      stream.close();
      await client.stop();
    });
  });

  describe("Streaming Metrics", () => {
    it("should track streaming metrics", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      // Wait for some streaming
      await new Promise((resolve) => setTimeout(resolve, 250));

      const metrics = stream.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.tokensReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.bytesReceived).toBeGreaterThanOrEqual(0);
      expect(metrics.tokensPerSecond).toBeGreaterThanOrEqual(0);
      expect(metrics.averageLatency).toBeGreaterThanOrEqual(0);
      expect(metrics.startTime).toBeLessThanOrEqual(Date.now());

      stream.close();
      await client.stop();
    });

    it("should emit metrics updates periodically", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const stream = await client.createResponseStream("12D3KooWNode1", {
        jobId: "job-123",
        requestId: "req-456",
      });

      const metricsSpy = vi.fn();
      stream.on("metrics", metricsSpy);

      // Wait for metrics updates
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should emit periodic metrics
      expect(metricsSpy).toHaveBeenCalled();

      const metricsUpdate = metricsSpy.mock.calls[0]?.[0];
      if (metricsUpdate) {
        expect(metricsUpdate).toHaveProperty("tokensPerSecond");
        expect(metricsUpdate).toHaveProperty("totalTokens");
      }

      stream.close();
      await client.stop();
    });
  });

  describe("SDK Integration", () => {
    it("should integrate streaming with SDK submitJob", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Submit job should return stream in production mode
      const result = await sdk.submitJob({
        prompt: "Hello, world!",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        stream: true, // Request streaming
      });

      expect(result.jobId).toBeTruthy();
      expect(result.stream).toBeDefined();

      if (result.stream) {
        const tokens: any[] = [];
        result.stream.on("token", (token) => tokens.push(token));

        await new Promise((resolve) => setTimeout(resolve, 200));
        expect(tokens.length).toBeGreaterThan(0);

        result.stream.close();
      }
    });

    it("should handle non-streaming jobs normally", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Without stream flag, should work as before
      const jobId = await sdk.submitJob({
        prompt: "Hello, world!",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        // stream: false (default)
      });

      expect(jobId).toBeTruthy();
      expect(typeof jobId).toBe("number");
    });

    it("should emit SDK-level streaming events", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const streamEventSpy = vi.fn();
      sdk.on("stream:start", streamEventSpy);
      sdk.on("stream:token", streamEventSpy);
      sdk.on("stream:end", streamEventSpy);

      await sdk.connect(mockProvider);

      const result = await sdk.submitJob({
        prompt: "Test streaming",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 50,
        stream: true,
      });

      if (result.stream) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        result.stream.close();
      }

      // Should have emitted streaming events
      expect(streamEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "stream:start" })
      );
    });

    it("should clean up streams on disconnect", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const result = await sdk.submitJob({
        prompt: "Test cleanup",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        stream: true,
      });

      // Disconnect should close all active streams
      await sdk.disconnect();

      if (result.stream) {
        expect(result.stream.status).toBe("closed");
      }
    });
  });
});

// Type definitions that should be implemented
export interface P2PResponseStream {
  jobId: string;
  nodeId: string;
  status: "active" | "paused" | "closed" | "error";
  startTime: number;
  bytesReceived: number;
  tokensReceived: number;

  on(event: "token", listener: (token: StreamToken) => void): void;
  on(event: "end", listener: (summary: StreamEndSummary) => void): void;
  on(event: "error", listener: (error: StreamError) => void): void;
  on(event: "metrics", listener: (metrics: StreamMetrics) => void): void;

  pause(): void;
  resume(): void;
  close(): void;
  getMetrics(): StreamMetrics;
}

export interface StreamToken {
  content: string;
  index: number;
  timestamp: number;
  type?: "content" | "metadata";
  metadata?: {
    modelId?: string;
    temperature?: number;
    jobId?: string;
  };
}

export interface StreamEndSummary {
  totalTokens: number;
  duration: number;
  finalStatus: "completed" | "interrupted" | "error";
  error?: string;
}

export interface StreamError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface StreamMetrics {
  tokensReceived: number;
  bytesReceived: number;
  tokensPerSecond: number;
  averageLatency: number;
  startTime: number;
  lastTokenTime?: number;
}

export interface ResponseStreamOptions {
  jobId: string;
  requestId: string;
  resumeFrom?: number;
}
