// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/error/recovery.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";
import { P2PClient } from "../../src/p2p/client";
import { BigNumber, ethers } from "ethers";
import type {
  NodeReliabilityRecord,
  RetryOptions,
  JobRecoveryInfo,
  FailoverStrategy,
} from "../../src/types";

// Mock P2PClient with controllable failures
vi.mock("../../src/p2p/client", () => ({
  P2PClient: vi.fn().mockImplementation(() => {
    let failCount = 0;
    const maxFails = 2;

    return {
      start: vi.fn().mockImplementation(async () => {
        if (failCount < maxFails) {
          failCount++;
          throw new Error("Connection failed");
        }
        return;
      }),
      stop: vi.fn().mockResolvedValue(undefined),
      isStarted: vi.fn().mockReturnValue(true),
      on: vi.fn(),
      sendJobRequest: vi.fn().mockImplementation(async (nodeId, request) => {
        // Simulate node-specific failures
        if (nodeId === "12D3KooWUnreliable") {
          throw new Error("Node timeout");
        }
        return {
          requestId: request.id,
          nodeId,
          status: "accepted",
          actualCost: BigNumber.from("100000000"),
          estimatedTime: 3000,
        };
      }),
      findProviders: vi.fn().mockResolvedValue([
        {
          peerId: "12D3KooWNode1",
          multiaddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWNode1"],
          capabilities: {
            models: ["llama-3.2-1b-instruct"],
            maxTokens: 4096,
            pricePerToken: "1000000",
          },
          latency: 50,
          reputation: 90,
          lastSeen: Date.now(),
        },
        {
          peerId: "12D3KooWNode2",
          multiaddrs: ["/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWNode2"],
          capabilities: {
            models: ["llama-3.2-1b-instruct"],
            maxTokens: 4096,
            pricePerToken: "1200000",
          },
          latency: 60,
          reputation: 85,
          lastSeen: Date.now(),
        },
        {
          peerId: "12D3KooWUnreliable",
          multiaddrs: ["/ip4/127.0.0.1/tcp/4003/p2p/12D3KooWUnreliable"],
          capabilities: {
            models: ["llama-3.2-1b-instruct"],
            maxTokens: 4096,
            pricePerToken: "800000",
          },
          latency: 40,
          reputation: 60,
          lastSeen: Date.now(),
        },
      ]),
      getStreamForJob: vi.fn(),
      submitJob: vi.fn().mockResolvedValue(123),
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
              // Emit some tokens
              const timer = setInterval(() => {
                if (tokenCount < 10) {
                  handler({ content: `token ${tokenCount}`, index: tokenCount });
                  tokenCount++;
                } else {
                  clearInterval(timer);
                }
              }, 50);
            }
          }),
          pause: vi.fn().mockImplementation(() => { stream.status = "paused"; }),
          resume: vi.fn().mockImplementation(() => { stream.status = "active"; }),
          close: vi.fn().mockImplementation(() => { stream.status = "closed"; }),
          getMetrics: vi.fn().mockReturnValue({
            tokensReceived: tokenCount,
            bytesReceived: tokenCount * 10,
            tokensPerSecond: 10,
            averageLatency: 50,
            startTime: Date.now()
          }),
          emit: vi.fn()
        };
        return stream;
      })
    };
  }),
}));

describe("Error Recovery - Sub-phase 2.10", () => {
  let sdk: FabstirSDK;
  let mockProvider: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

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

  describe("Retry Mechanisms", () => {
    it("should retry failed P2P connections with exponential backoff", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        retryOptions: {
          maxRetries: 3,
          initialDelay: 100,
          maxDelay: 5000,
          backoffFactor: 2,
        },
      });

      // Should eventually succeed after retries
      await expect(sdk.connect(mockProvider)).resolves.not.toThrow();
      expect(sdk.isConnected).toBe(true);
    });

    it("should retry failed job submissions with configurable options", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Mock temporary failures
      let attempts = 0;
      sdk.submitJob = vi.fn().mockImplementation(async (params) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary network error");
        }
        return 123;
      });

      const retryOptions: RetryOptions = {
        maxRetries: 3,
        shouldRetry: (error, attemptNumber) => {
          return error.message.includes("Temporary") && attemptNumber < 3;
        },
        onRetry: vi.fn(),
      };

      const result = await sdk.submitJobWithRetry(
        {
          prompt: "Test with retry",
          modelId: "llama-3.2-1b-instruct",
          maxTokens: 100,
        },
        retryOptions
      );

      expect(result).toBe(123);
      expect(attempts).toBe(3);
      expect(retryOptions.onRetry).toHaveBeenCalledTimes(2);
    });

    it("should respect retry timeouts and cancellation", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Create abort controller
      const abortController = new AbortController();

      // Abort after 200ms
      setTimeout(() => abortController.abort(), 200);

      // Mock slow failures
      sdk.submitJob = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        throw new Error("Network timeout");
      });

      await expect(
        sdk.submitJobWithRetry(
          {
            prompt: "Test abort",
            modelId: "llama-3.2-1b-instruct",
            maxTokens: 100,
          },
          {
            maxRetries: 5,
            signal: abortController.signal,
          }
        )
      ).rejects.toThrow("aborted");
    });
  });

  describe("Node Failure Handling", () => {
    it("should detect and handle node failures during job execution", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const failureSpy = vi.fn();
      sdk.on("node:failure", failureSpy);

      // Simulate node failure during job
      const jobId = await sdk.submitJob({
        prompt: "Test node failure",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        nodeAddress: "12D3KooWNode1",
      });

      // Simulate node going offline
      sdk.handleNodeDisconnection("12D3KooWNode1", "Connection lost");

      expect(failureSpy).toHaveBeenCalledWith({
        nodeId: "12D3KooWNode1",
        reason: "Connection lost",
        activeJobs: [jobId],
        timestamp: expect.any(Number),
      });
    });

    it("should automatically failover to another node on failure", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        failoverStrategy: "automatic",
      });

      await sdk.connect(mockProvider);

      const failoverSpy = vi.fn();
      sdk.on("job:failover", failoverSpy);

      // Submit to unreliable node
      const result = await sdk.submitJobWithNegotiation({
        prompt: "Test failover",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        preferredNodes: [
          "12D3KooWUnreliable",
          "12D3KooWNode1",
          "12D3KooWNode2",
        ],
      });

      // Should have failed over to a reliable node
      expect(result.selectedNode).not.toBe("12D3KooWUnreliable");
      expect(failoverSpy).toHaveBeenCalledWith({
        originalNode: "12D3KooWUnreliable",
        newNode: result.selectedNode,
        reason: "Node timeout",
        jobId: expect.any(String),
      });
    });

    it("should maintain node blacklist for repeated failures", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        nodeBlacklistDuration: 300000, // 5 minutes
      });

      await sdk.connect(mockProvider);

      // Simulate multiple failures from same node
      for (let i = 0; i < 3; i++) {
        sdk.recordNodeFailure("12D3KooWBadNode", "Timeout");
      }

      // Check if node is blacklisted
      const isBlacklisted = await sdk.isNodeBlacklisted("12D3KooWBadNode");
      expect(isBlacklisted).toBe(true);

      // Should not select blacklisted node
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });

      expect(nodes.every((n) => n.peerId !== "12D3KooWBadNode")).toBe(true);
    });
  });

  describe("Job Recovery", () => {
    it("should support resuming interrupted streaming jobs", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enableJobRecovery: true
      });

      await sdk.connect(mockProvider);

      // Start a streaming job
      const stream = await sdk.createResponseStream({
        jobId: "job-123",
        requestId: "req-123",
      });

      let tokensReceived = 0;
      stream.on("token", () => tokensReceived++);

      // Simulate interruption after 5 tokens
      setTimeout(() => {
        stream.pause();
        stream.emit("error", {
          code: "STREAM_INTERRUPTED",
          message: "Connection lost",
        });
      }, 500);

      // Wait for interruption
      await new Promise((resolve) => setTimeout(resolve, 600));

      const firstBatchTokens = tokensReceived;
      expect(firstBatchTokens).toBeGreaterThan(0);

      // Resume from last position
      const resumedStream = await sdk.resumeResponseStream({
        jobId: "job-123",
        requestId: "req-123",
        resumeFrom: firstBatchTokens,
      });

      let resumedTokens = 0;
      resumedStream.on("token", () => resumedTokens++);

      // Wait for more tokens
      await new Promise((resolve) => setTimeout(resolve, 1000));

      expect(resumedTokens).toBeGreaterThan(0);
    });

    it("should store job recovery information", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enableJobRecovery: true,
      });

      await sdk.connect(mockProvider);

      const jobId = await sdk.submitJob({
        prompt: "Test recovery",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
      });

      // Get recovery info
      const recoveryInfo: JobRecoveryInfo = await sdk.getJobRecoveryInfo(jobId);

      expect(recoveryInfo).toMatchObject({
        jobId,
        nodeId: expect.any(String),
        requestParams: {
          prompt: "Test recovery",
          modelId: "llama-3.2-1b-instruct",
          maxTokens: 100,
        },
        lastCheckpoint: expect.any(Number),
        tokensProcessed: 0,
        canResume: true,
      });
    });

    it("should clean up stale recovery data", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        recoveryDataTTL: 3600000, // 1 hour
      });

      await sdk.connect(mockProvider);

      // Add some recovery data
      const oldJobId = 100;
      sdk._jobRecoveryData.set(oldJobId, {
        jobId: oldJobId,
        nodeId: "12D3KooWOldNode",
        requestParams: {},
        lastCheckpoint: Date.now() - 7200000, // 2 hours ago
        tokensProcessed: 50,
        canResume: false,
      });

      // Cleanup should remove stale data
      await sdk.cleanupRecoveryData();

      const recoveryInfo = await sdk.getJobRecoveryInfo(oldJobId);
      expect(recoveryInfo).toBeUndefined();
    });
  });

  describe("Node Reliability Tracking", () => {
    it("should track node performance metrics", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Submit successful job
      await sdk.submitJobWithNegotiation({
        prompt: "Track success",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
      });

      // Get reliability record
      const record: NodeReliabilityRecord = await sdk.getNodeReliability(
        "12D3KooWNode1"
      );

      expect(record).toMatchObject({
        nodeId: "12D3KooWNode1",
        totalJobs: 1,
        successfulJobs: 1,
        failedJobs: 0,
        averageResponseTime: expect.any(Number),
        successRate: 100,
        lastSuccess: expect.any(Number),
        reliability: expect.any(Number), // Calculated score
      });
    });

    it("should calculate reliability scores based on history", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Simulate job history
      const nodeId = "12D3KooWNode1";

      // Record successes
      for (let i = 0; i < 8; i++) {
        sdk.recordJobOutcome(nodeId, true, 2000 + i * 100);
      }

      // Record failures
      for (let i = 0; i < 2; i++) {
        sdk.recordJobOutcome(nodeId, false, 0);
      }

      const reliability = await sdk.calculateNodeReliability(nodeId);

      // 80% success rate, should affect reliability score
      expect(reliability.successRate).toBe(80);
      expect(reliability.reliability).toBeGreaterThan(0);
      expect(reliability.reliability).toBeLessThan(100);
    });

    it("should prefer reliable nodes in selection", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        nodeSelectionStrategy: "reliability-weighted",
      });

      await sdk.connect(mockProvider);

      // Set up reliability history
      sdk.recordJobOutcome("12D3KooWNode1", true, 1000);
      sdk.recordJobOutcome("12D3KooWNode1", true, 1200);
      sdk.recordJobOutcome("12D3KooWNode2", false, 0);
      sdk.recordJobOutcome("12D3KooWUnreliable", false, 0);

      // Should prefer Node1 due to better reliability
      const result = await sdk.submitJobWithNegotiation({
        prompt: "Prefer reliable",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
      });

      expect(result.selectedNode).toBe("12D3KooWNode1");
    });

    it("should emit reliability alerts for degraded nodes", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        reliabilityThreshold: 70, // Alert below 70%
      });

      await sdk.connect(mockProvider);

      const alertSpy = vi.fn();
      sdk.on("node:reliability-alert", alertSpy);

      const nodeId = "12D3KooWDegrading";

      // Simulate degrading performance
      for (let i = 0; i < 10; i++) {
        sdk.recordJobOutcome(nodeId, i < 6, i < 6 ? 2000 : 0);
      }

      expect(alertSpy).toHaveBeenCalled();
      const alert = alertSpy.mock.calls[0][0];
      expect(alert.nodeId).toBe(nodeId);
      expect(alert.threshold).toBe(70);
      expect(alert.action).toBe("degraded");
      // The reliability should be less than 70 but might not be exactly 60 due to penalties
      expect(alert.reliability).toBeLessThan(70);
    });
  });

  describe("Integrated Error Recovery", () => {
    it("should handle cascading failures gracefully", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        maxCascadingRetries: 3,
      });

      await sdk.connect(mockProvider);

      // Mock all nodes failing initially
      let globalFailCount = 0;
      let nodeAttempts = new Map();
      
      sdk._p2pClient.sendJobRequest = vi.fn().mockImplementation(async (nodeId, request) => {
        globalFailCount++;
        
        // Track attempts per node
        const attempts = (nodeAttempts.get(nodeId) || 0) + 1;
        nodeAttempts.set(nodeId, attempts);
        
        // Each node rejects on first 2 attempts
        if (attempts <= 2) {
          return {
            requestId: request.id,
            nodeId,
            status: "rejected",
            message: "Node is busy",
            reason: "busy"
          };
        }
        
        // On third attempt, node accepts
        return {
          requestId: request.id,
          nodeId,
          status: "accepted",
          actualCost: ethers.BigNumber.from("100000000"),
          estimatedTime: 3000
        };
      });

      // Should eventually succeed after retrying all nodes
      const result = await sdk.submitJobWithNegotiation({
        prompt: "Cascading retry test",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
      });

      expect(result.jobId).toBeTruthy();
      expect(globalFailCount).toBeGreaterThanOrEqual(6);
    });

    it("should provide detailed error recovery report", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        enableRecoveryReports: true,
      });

      await sdk.connect(mockProvider);

      // Generate some recovery events
      sdk.recordNodeFailure("12D3KooWNode1", "Timeout");
      sdk.recordJobOutcome("12D3KooWNode2", true, 1500);

      const report = await sdk.getErrorRecoveryReport();

      expect(report).toMatchObject({
        period: {
          start: expect.any(Number),
          end: expect.any(Number),
        },
        totalRetries: expect.any(Number),
        successfulRecoveries: expect.any(Number),
        failedRecoveries: expect.any(Number),
        blacklistedNodes: expect.any(Array),
        nodeReliability: expect.any(Object),
        recommendations: expect.any(Array),
      });
    });
  });
});

// Type definitions to be implemented
export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: Error, attemptNumber: number) => boolean;
  onRetry?: (error: Error, attemptNumber: number) => void;
  signal?: AbortSignal;
}

export interface NodeReliabilityRecord {
  nodeId: string;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageResponseTime: number;
  successRate: number;
  lastSuccess?: number;
  lastFailure?: number;
  reliability: number; // 0-100 score
}

export interface JobRecoveryInfo {
  jobId: number | string;
  nodeId: string;
  requestParams: any;
  lastCheckpoint: number;
  tokensProcessed: number;
  canResume: boolean;
  resultHash?: string;
}

export interface ErrorRecoveryReport {
  period: {
    start: number;
    end: number;
  };
  totalRetries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  blacklistedNodes: string[];
  nodeReliability: Record<string, NodeReliabilityRecord>;
  recommendations: string[];
}

export type FailoverStrategy = "automatic" | "manual" | "disabled";
