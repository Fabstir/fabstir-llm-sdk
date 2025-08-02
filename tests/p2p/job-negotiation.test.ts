// tests/p2p/job-negotiation.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";
import { P2PClient } from "../../src/p2p/client";
import { BigNumber } from "ethers";
import type { 
  JobRequest, 
  JobResponse,
  DiscoveredNode
} from "../../src/types";

describe("P2P Job Negotiation - Sub-phase 2.7", () => {
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

  describe("Job Request Protocol", () => {
    it("should define JobRequest interface", () => {
      // This test ensures the interface exists
      const jobRequest: JobRequest = {
        id: "job-123",
        requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        modelId: "llama-3.2-1b-instruct",
        prompt: "Hello, world!",
        maxTokens: 100,
        temperature: 0.7,
        topP: 0.9,
        estimatedCost: BigNumber.from("100000000"), // 0.1 ETH
        timestamp: Date.now(),
      };

      expect(jobRequest).toBeDefined();
      expect(jobRequest.id).toBe("job-123");
    });

    it("should define JobResponse interface", () => {
      const jobResponse: JobResponse = {
        requestId: "job-123",
        nodeId: "12D3KooWNode1",
        status: "accepted",
        estimatedTime: 5000, // 5 seconds
        actualCost: BigNumber.from("95000000"),
        message: "Job accepted, starting inference",
      };

      expect(jobResponse).toBeDefined();
      expect(jobResponse.status).toBe("accepted");
    });

    it("should implement sendJobRequest in P2PClient", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should have sendJobRequest method
      expect(typeof client.sendJobRequest).toBe("function");

      const response = await client.sendJobRequest("12D3KooWNode1", {
        id: "job-123",
        requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        modelId: "llama-3.2-1b-instruct",
        prompt: "Hello, world!",
        maxTokens: 100,
        temperature: 0.7,
        estimatedCost: BigNumber.from("100000000"),
        timestamp: Date.now(),
      });

      expect(response).toBeDefined();
      expect(response.requestId).toBe("job-123");

      await client.stop();
    });
  });

  describe("Job Negotiation Flow", () => {
    it("should handle accepted job responses", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const response = await client.sendJobRequest("12D3KooWNode1", {
        id: "job-123",
        requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        modelId: "llama-3.2-1b-instruct",
        prompt: "Hello, world!",
        maxTokens: 100,
        estimatedCost: BigNumber.from("100000000"),
        timestamp: Date.now(),
      });

      expect(response.status).toBe("accepted");
      expect(response.estimatedTime).toBeGreaterThan(0);
      expect(response.actualCost).toBeDefined();

      await client.stop();
    });

    it("should handle rejected job responses", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Mock a rejection scenario
      const response = await client.sendJobRequest("12D3KooWBusyNode", {
        id: "job-456",
        requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        modelId: "llama-3.2-70b", // Large model
        prompt: "Complex prompt",
        maxTokens: 1000,
        estimatedCost: BigNumber.from("10000000"), // Too low
        timestamp: Date.now(),
      });

      // Node might reject for various reasons
      if (response.status === "rejected") {
        expect(response.message).toBeTruthy();
        expect(response.reason).toBeDefined();
      }

      await client.stop();
    });

    it("should handle negotiation timeouts", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        requestTimeout: 1000, // 1 second
      });

      await client.start();

      // Should handle timeout gracefully
      try {
        await client.sendJobRequest(
          "12D3KooWOfflineNode",
          {
            id: "job-789",
            requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
            modelId: "llama-3.2-1b-instruct",
            prompt: "Test",
            maxTokens: 10,
            estimatedCost: BigNumber.from("100000000"),
            timestamp: Date.now(),
          },
          { timeout: 100 }
        ); // Very short timeout
      } catch (error: any) {
        expect(error.message).toContain("timeout");
      }

      await client.stop();
    });
  });

  describe("Automatic Node Selection", () => {
    it("should implement selectBestNode in SDK", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Should have selectBestNode method
      expect(typeof sdk.selectBestNode).toBe("function");

      const selectedNode = await sdk.selectBestNode({
        modelId: "llama-3.2-1b-instruct",
        estimatedTokens: 100,
        maxBudget: BigNumber.from("1000000000"), // 1 ETH
      });

      expect(selectedNode).toBeDefined();
      expect(selectedNode.peerId).toBeTruthy();
      expect(selectedNode.capabilities.models).toContain(
        "llama-3.2-1b-instruct"
      );
    });

    it("should negotiate with multiple nodes for best offer", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Negotiate with top N nodes
      const negotiations = await sdk.negotiateWithNodes({
        modelId: "llama-3.2-1b-instruct",
        prompt: "Hello, world!",
        maxTokens: 100,
        maxNodes: 3, // Try top 3 nodes
      });

      expect(Array.isArray(negotiations)).toBe(true);
      expect(negotiations.length).toBeLessThanOrEqual(3);

      // Should be sorted by best offer
      if (negotiations.length > 1) {
        const firstOffer = negotiations[0];
        const secondOffer = negotiations[1];

        if (
          firstOffer.response.status === "accepted" &&
          secondOffer.response.status === "accepted"
        ) {
          // First offer should be better (lower cost or faster)
          const firstScore =
            Number(firstOffer.response.actualCost) /
            (firstOffer.response.estimatedTime || 1);
          const secondScore =
            Number(secondOffer.response.actualCost) /
            (secondOffer.response.estimatedTime || 1);
          expect(firstScore).toBeLessThanOrEqual(secondScore);
        }
      }
    });

    it("should fallback to next node if first choice rejects", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const result = await sdk.submitJobWithNegotiation({
        prompt: "Hello, world!",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        maxRetries: 3, // Try up to 3 nodes
      });

      expect(result).toBeDefined();
      expect(result.jobId).toBeTruthy();
      expect(result.selectedNode).toBeTruthy();
      expect(result.negotiationAttempts).toBeGreaterThanOrEqual(1);
    });
  });

  describe("SDK Integration", () => {
    it("should integrate negotiation with submitJob", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // When no nodeAddress specified, should auto-negotiate
      const jobId = await sdk.submitJob({
        prompt: "Hello, world!",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        // No nodeAddress - will trigger negotiation
      });

      expect(jobId).toBeTruthy();
    });

    it("should emit negotiation events", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const eventSpy = vi.fn();
      sdk.on("negotiation:start", eventSpy);
      sdk.on("negotiation:offer", eventSpy);
      sdk.on("negotiation:complete", eventSpy);

      await sdk.connect(mockProvider);

      await sdk.submitJobWithNegotiation({
        prompt: "Test",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 50,
      });

      // Should emit lifecycle events
      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "negotiation:start" })
      );
    });

    it("should handle all nodes rejecting", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Impossible requirements
      await expect(
        sdk.submitJobWithNegotiation({
          prompt: "Generate 1 million tokens",
          modelId: "llama-3.2-70b",
          maxTokens: 1000000,
          maxBudget: BigNumber.from("1"), // 1 wei - too low
        })
      ).rejects.toThrow("No nodes accepted");
    });
  });

  describe("Protocol Messages", () => {
    it("should support job protocol registration", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should register job negotiation protocol
      expect(client.getRegisteredProtocols()).toContain("/fabstir/job/1.0.0");

      await client.stop();
    });

    it("should handle protocol version mismatch", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Try to communicate with incompatible version
      const response = await client.sendJobRequest("12D3KooWOldNode", {
        id: "job-999",
        requester: "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        modelId: "llama-3.2-1b-instruct",
        prompt: "Test",
        maxTokens: 10,
        estimatedCost: BigNumber.from("100000000"),
        timestamp: Date.now(),
      });

      // Should handle gracefully
      if (response.status === "error") {
        expect(response.reason).toContain("version");
      }

      await client.stop();
    });
  });
});

// Type definitions are now imported from src/types.ts
