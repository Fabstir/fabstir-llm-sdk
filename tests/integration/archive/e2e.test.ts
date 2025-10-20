// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/integration/e2e.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";
import { ethers } from "ethers";
import type {
  SystemHealthReport,
  PerformanceMetrics,
  ModeTransitionReport,
} from "../../src/types";

// Mock P2PClient for fast testing
vi.mock("../../src/p2p/client", () => ({
  P2PClient: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isStarted: vi.fn().mockReturnValue(true),
    on: vi.fn(),
    sendJobRequest: vi.fn().mockResolvedValue({
      requestId: "req-123",
      nodeId: "12D3KooWNode1",
      status: "accepted",
      actualCost: ethers.BigNumber.from("100000000"),
      estimatedTime: 1500,
    }),
    findProviders: vi.fn().mockResolvedValue([
      {
        peerId: "12D3KooWNode1",
        multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWNode1"],
        capabilities: {
          models: ["llama-3.2-1b-instruct", "gpt-4"],
          maxTokens: 4096,
          pricePerToken: "1000000",
        },
        latency: 50,
        reputation: 95,
        lastSeen: Date.now(),
      },
    ]),
    createResponseStream: vi.fn().mockImplementation(async (nodeId, options) => {
      let tokenCount = 0;
      const stream = {
        jobId: options.jobId,
        nodeId,
        status: "active",
        startTime: Date.now(),
        bytesReceived: 0,
        tokensReceived: 0,
        on: vi.fn().mockImplementation((event, handler) => {
          if (event === "token") {
            const timer = setInterval(() => {
              if (tokenCount < 20) {
                handler({ content: `token ${tokenCount}`, index: tokenCount });
                tokenCount++;
              } else {
                clearInterval(timer);
              }
            }, 50); // Fast token generation for testing
          }
        }),
        pause: vi.fn(),
        resume: vi.fn(),
        close: vi.fn(),
        getMetrics: vi.fn().mockReturnValue({
          tokensReceived: tokenCount,
          bytesReceived: tokenCount * 10,
          tokensPerSecond: 20,
          averageLatency: 50,
          startTime: Date.now(),
        }),
      };
      return stream;
    }),
  })),
}));

describe("End-to-End Integration Tests", () => {
  let sdk: FabstirSDK;
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue("0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1"),
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
    vi.clearAllMocks();
  });

  describe("System Health Monitoring", () => {
    it("should provide comprehensive health report", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const health: SystemHealthReport = await sdk.getSystemHealthReport();

      expect(health).toMatchObject({
        status: "healthy",
        mode: "production",
        isConnected: true,
        p2p: {
          status: "connected",
          connectedPeers: expect.any(Number),
          discoveredNodes: expect.any(Number),
        },
        blockchain: {
          status: "connected",
          chainId: 84532,
          latestBlock: expect.any(Number),
        },
        jobs: {
          active: 0,
          completed: 0,
          failed: 0,
          queued: 0,
        },
        performance: {
          averageConnectionTime: expect.any(Number),
          averageDiscoveryTime: expect.any(Number),
          averageJobSubmissionTime: expect.any(Number),
          averageTokenLatency: expect.any(Number),
        },
        timestamp: expect.any(Number),
      });
    });

    it("should detect degraded health conditions", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Simulate some failures
      sdk.recordNodeFailure("12D3KooWNode1", "Timeout");
      sdk.recordNodeFailure("12D3KooWNode2", "Connection lost");

      const health = await sdk.getSystemHealthReport();

      expect(health.status).toBe("degraded");
      expect(health.issues).toContain("Multiple node failures detected");
    });
  });

  describe("Mode Transitions", () => {
    it("should handle mock to production mode transition", async () => {
      // Start in mock mode
      sdk = new FabstirSDK({
        mode: "mock",
      });

      await sdk.connect(mockProvider);

      // Submit a job in mock mode
      const mockJobId = await sdk.submitJob({
        prompt: "Test in mock mode",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 50,
      });

      expect(mockJobId).toBe(1);

      // Transition to production mode
      const transitionReport: ModeTransitionReport = await sdk.transitionMode({
        from: "mock",
        to: "production",
        preserveState: true,
      });

      // Log details if failed
      if (!transitionReport.success) {
        console.log("Transition failed:", transitionReport);
      }

      expect(transitionReport.success).toBe(true);
      expect(transitionReport.from).toBe("mock");
      expect(transitionReport.to).toBe("production");
      expect(transitionReport.statePreserved).toBe(true);

      // Verify production mode works
      const prodResult = await sdk.submitJobWithNegotiation({
        prompt: "Test in production mode",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 50,
      });

      expect(prodResult.selectedNode).toBeTruthy();
    });

    it("should validate mode transitions", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Try invalid transition
      await expect(
        sdk.transitionMode({
          from: "production",
          to: "invalid" as any,
        })
      ).rejects.toThrow("Invalid mode");
    });
  });

  describe("Performance Tracking", () => {
    it("should meet performance targets", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enablePerformanceTracking: true,
      });

      // Track connection time
      const connectStart = Date.now();
      await sdk.connect(mockProvider);
      const connectTime = Date.now() - connectStart;

      expect(connectTime).toBeLessThan(500);

      // Track discovery time
      const discoveryStart = Date.now();
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });
      const discoveryTime = Date.now() - discoveryStart;

      expect(discoveryTime).toBeLessThan(1000);
      expect(nodes.length).toBeGreaterThan(0);

      // Track job submission time
      const submitStart = Date.now();
      const result = await sdk.submitJobWithNegotiation({
        prompt: "Performance test",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
      });
      const submitTime = Date.now() - submitStart;

      expect(submitTime).toBeLessThan(2000);

      // Get performance metrics
      const metrics: PerformanceMetrics = await sdk.getPerformanceMetrics();

      expect(metrics.operations.connect.averageTime).toBeLessThan(500);
      expect(metrics.operations.discover.averageTime).toBeLessThan(1000);
      expect(metrics.operations.submitJob.averageTime).toBeLessThan(2000);
    });

    it("should track streaming performance", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enablePerformanceTracking: true,
      });

      await sdk.connect(mockProvider);

      const stream = await sdk.createResponseStream({
        jobId: "job-123",
        requestId: "req-123",
      });

      const tokenLatencies: number[] = [];
      let lastTokenTime = Date.now();

      stream.on("token", (token) => {
        const now = Date.now();
        tokenLatencies.push(now - lastTokenTime);
        lastTokenTime = now;
      });

      // Wait for some tokens
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Calculate average latency
      const avgLatency = tokenLatencies.reduce((a, b) => a + b, 0) / tokenLatencies.length;
      expect(avgLatency).toBeLessThan(200);

      const metrics = await sdk.getPerformanceMetrics();
      expect(metrics.streaming.averageTokenLatency).toBeLessThan(200);
    });
  });

  describe("Concurrent Operations", () => {
    it("should handle multiple concurrent jobs", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Submit 10 concurrent jobs
      const jobPromises = [];
      for (let i = 0; i < 10; i++) {
        jobPromises.push(
          sdk.submitJobWithNegotiation({
            prompt: `Concurrent job ${i}`,
            modelId: "llama-3.2-1b-instruct",
            maxTokens: 50,
          })
        );
      }

      const results = await Promise.all(jobPromises);

      expect(results).toHaveLength(10);
      results.forEach((result) => {
        expect(result.jobId).toBeTruthy();
        expect(result.selectedNode).toBeTruthy();
      });

      // Check system can report on concurrent jobs
      const health = await sdk.getSystemHealthReport();
      expect(health.jobs.active).toBeGreaterThanOrEqual(0);
    });

    it("should handle concurrent streaming jobs", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Create multiple streams
      const streams = [];
      for (let i = 0; i < 5; i++) {
        streams.push(
          sdk.createResponseStream({
            jobId: `job-${i}`,
            requestId: `req-${i}`,
          })
        );
      }

      const allStreams = await Promise.all(streams);

      // Verify all streams are active
      allStreams.forEach((stream) => {
        expect(stream.status).toBe("active");
      });

      // Clean up
      allStreams.forEach((stream) => stream.close());
    });
  });

  describe("Error Recovery Integration", () => {
    it("should recover from various failure scenarios", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        retryOptions: {
          maxRetries: 3,
          initialDelay: 100,
        },
      });

      await sdk.connect(mockProvider);

      // Override the submitJobWithRetry to test retry logic
      let attempts = 0;
      const originalSubmit = sdk.submitJob.bind(sdk);
      sdk.submitJob = vi.fn().mockImplementation(async (params) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary network error");
        }
        // Return a job ID on success
        return 123;
      });

      const retryOptions: RetryOptions = {
        maxRetries: 3,
        shouldRetry: (error, attemptNumber) => {
          return error.message.includes("Temporary") && attemptNumber < 3;
        },
        onRetry: vi.fn(),
      };

      // Should succeed after retry
      const result = await sdk.submitJobWithRetry({
        prompt: "Recovery test",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 50,
      }, retryOptions);

      expect(result).toBe(123);
      expect(attempts).toBe(3);
      expect(retryOptions.onRetry).toHaveBeenCalledTimes(2);
    });

    it("should maintain system stability under load", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Simulate heavy load with some failures
      const operations = [];
      for (let i = 0; i < 20; i++) {
        operations.push(
          sdk.submitJobWithNegotiation({
            prompt: `Load test ${i}`,
            modelId: i % 3 === 0 ? "invalid-model" : "llama-3.2-1b-instruct",
            maxTokens: 50,
          }).catch((error) => ({ error, index: i }))
        );
      }

      const results = await Promise.allSettled(operations);

      // System should remain healthy despite some failures
      const health = await sdk.getSystemHealthReport();
      expect(["healthy", "degraded"]).toContain(health.status);

      // Performance should still be acceptable
      const metrics = await sdk.getPerformanceMetrics();
      expect(metrics.operations.submitJob.averageTime).toBeLessThan(3000);
    });
  });

  describe("Full Workflow Integration", () => {
    it("should complete end-to-end job lifecycle", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enablePerformanceTracking: true,
      });

      const eventLog: any[] = [];
      
      // Listen to specific events since wildcard isn't supported by default
      const events = ["connected", "p2p:started", "job:negotiated", "stream:start", "stream:token", "stream:end"];
      events.forEach(event => {
        sdk.on(event, (data) => {
          eventLog.push({ event, data, timestamp: Date.now() });
        });
      });

      await sdk.connect(mockProvider);

      // 1. Discover nodes
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });
      expect(nodes.length).toBeGreaterThan(0);

      // 2. Submit job with negotiation
      const jobResult = await sdk.submitJobWithNegotiation({
        prompt: "What is the capital of France?",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        stream: true,
      });

      expect(jobResult.jobId).toBeTruthy();
      expect(jobResult.stream).toBeTruthy();

      // 3. Process streaming response
      const tokens: string[] = [];
      jobResult.stream.on("token", (token) => {
        tokens.push(token.content);
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(tokens.length).toBeGreaterThan(0);

      // 4. Get final metrics
      const health = await sdk.getSystemHealthReport();
      expect(health.status).toBe("healthy");

      const metrics = await sdk.getPerformanceMetrics();
      expect(metrics.totalOperations).toBeGreaterThan(0);

      // 5. Verify events were emitted
      expect(eventLog.some((e) => e.event === "p2p:started")).toBe(true);
      expect(eventLog.some((e) => e.event === "job:negotiated")).toBe(true);
    });

    it("should handle complex multi-model workflow", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Submit jobs to different models
      const models = ["llama-3.2-1b-instruct", "gpt-4"];
      const jobs = [];

      for (const model of models) {
        const job = await sdk.submitJobWithNegotiation({
          prompt: `Test prompt for ${model}`,
          modelId: model,
          maxTokens: 50,
        });
        jobs.push(job);
      }

      expect(jobs).toHaveLength(2);
      jobs.forEach((job) => {
        expect(job.jobId).toBeTruthy();
      });

      // Check system handled multi-model load
      const health = await sdk.getSystemHealthReport();
      expect(health.status).toBe("healthy");
    });
  });
});