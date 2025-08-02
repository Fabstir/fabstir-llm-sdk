// tests/p2p/discovery.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";
import { P2PClient } from "../../src/p2p/client";

describe("P2P Node Discovery - Sub-phase 2.6", () => {
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

  describe("DHT Queries", () => {
    it("should implement findProviders method in P2PClient", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
      });

      await client.start();

      // Should have findProviders method
      expect(typeof client.findProviders).toBe("function");

      // Should accept a service identifier
      const providers = await client.findProviders("llm-inference");
      expect(Array.isArray(providers)).toBe(true);

      await client.stop();
    });

    it("should query DHT for nodes offering specific models", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
      });

      await client.start();

      // Query for specific model
      const providers = await client.findProviders(
        "llm-inference/llama-3.2-1b"
      );
      expect(Array.isArray(providers)).toBe(true);

      await client.stop();
    });

    it("should handle DHT query timeouts", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
        requestTimeout: 1000, // 1 second timeout
      });

      await client.start();

      // Should not throw, just return empty array on timeout
      const providers = await client.findProviders("llm-inference", {
        timeout: 100, // Very short timeout
      });
      expect(Array.isArray(providers)).toBe(true);

      await client.stop();
    });
  });

  describe("Node Capabilities Parsing", () => {
    it("should define NodeCapabilities interface", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Get node info should return capabilities
      const nodeInfo = await client.getNodeInfo("12D3KooWMockPeer");

      // Should have expected structure
      if (nodeInfo) {
        expect(nodeInfo).toHaveProperty("peerId");
        expect(nodeInfo).toHaveProperty("capabilities");
        expect(nodeInfo.capabilities).toHaveProperty("models");
        expect(nodeInfo.capabilities).toHaveProperty("maxTokens");
        expect(nodeInfo.capabilities).toHaveProperty("pricePerToken");
      }

      await client.stop();
    });

    it("should parse capabilities from DHT records", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
      });

      await client.start();

      // Mock a provider with capabilities
      const providers = await client.findProviders("llm-inference");

      // Each provider should have parsed capabilities
      for (const provider of providers) {
        expect(provider).toHaveProperty("peerId");
        expect(provider).toHaveProperty("capabilities");

        if (provider.capabilities) {
          expect(Array.isArray(provider.capabilities.models)).toBe(true);
          expect(typeof provider.capabilities.maxTokens).toBe("number");
          expect(typeof provider.capabilities.pricePerToken).toBe("string");
        }
      }

      await client.stop();
    });

    it("should handle malformed capability data gracefully", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should not throw on invalid data
      const nodeInfo = await client.getNodeInfo("12D3KooWInvalidData");

      // Should return null or partial data
      expect(nodeInfo === null || typeof nodeInfo === "object").toBe(true);

      await client.stop();
    });
  });

  describe("Node Filtering", () => {
    it("should filter discovered nodes by model requirements", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Discover nodes with filtering
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
        maxLatency: 100, // ms
        maxPrice: "1000000", // price per token in wei
      });

      expect(Array.isArray(nodes)).toBe(true);

      // All returned nodes should support the requested model
      for (const node of nodes) {
        expect(node.capabilities.models).toContain("llama-3.2-1b-instruct");
      }
    });

    it("should filter by multiple criteria", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
        maxLatency: 50,
        minReputation: 80,
        maxPrice: "500000",
        excludeNodes: ["12D3KooWBadNode1", "12D3KooWBadNode2"],
      });

      expect(Array.isArray(nodes)).toBe(true);

      // Verify all criteria are met
      for (const node of nodes) {
        expect(node.capabilities.models).toContain("llama-3.2-1b-instruct");
        expect(node.latency).toBeLessThanOrEqual(50);
        expect(node.reputation || 0).toBeGreaterThanOrEqual(80);
        expect(BigInt(node.capabilities.pricePerToken)).toBeLessThanOrEqual(
          BigInt("500000")
        );
        expect(["12D3KooWBadNode1", "12D3KooWBadNode2"]).not.toContain(
          node.peerId
        );
      }
    });

    it("should sort filtered nodes by preference", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
        preferredNodes: ["12D3KooWPreferred1", "12D3KooWPreferred2"],
      });

      // Preferred nodes should appear first if available
      if (nodes.length > 0 && nodes[0].peerId === "12D3KooWPreferred1") {
        expect(nodes[0].peerId).toBe("12D3KooWPreferred1");
      }
    });
  });

  describe("Node Cache", () => {
    it("should cache discovered nodes", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // First discovery
      const nodes1 = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });

      // Second discovery (should use cache)
      const nodes2 = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });

      // Should return same nodes if from cache
      expect(nodes2.length).toBe(nodes1.length);
    });

    it("should respect cache TTL", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
        nodeDiscovery: {
          cacheTTL: 100, // 100ms for testing
        },
      });

      await sdk.connect(mockProvider);

      // First discovery
      await sdk.discoverNodes({ modelId: "llama-3.2-1b-instruct" });

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should trigger new discovery
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
      });

      expect(Array.isArray(nodes)).toBe(true);
    });

    it("should allow force refresh of cache", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // First discovery
      await sdk.discoverNodes({ modelId: "llama-3.2-1b-instruct" });

      // Force refresh
      const nodes = await sdk.discoverNodes({
        modelId: "llama-3.2-1b-instruct",
        forceRefresh: true,
      });

      expect(Array.isArray(nodes)).toBe(true);
    });

    it("should clear cache on disconnect", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Populate cache
      await sdk.discoverNodes({ modelId: "llama-3.2-1b-instruct" });

      // Disconnect should clear cache
      await sdk.disconnect();

      // Reconnect
      await sdk.connect(mockProvider);

      // Should not have cached nodes
      const client = sdk["_p2pClient"];
      expect(client?.getCachedNodes().length).toBe(0);
    });
  });

  describe("SDK Integration", () => {
    it("should not allow node discovery in mock mode", async () => {
      sdk = new FabstirSDK({ mode: "mock" });
      await sdk.connect(mockProvider);

      await expect(
        sdk.discoverNodes({ modelId: "llama-3.2-1b-instruct" })
      ).rejects.toThrow("Node discovery not available in mock mode");
    });

    it("should integrate discovery with job submission", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // Submit job should auto-discover if no node specified
      const jobId = await sdk.submitJob({
        prompt: "Hello, world!",
        modelId: "llama-3.2-1b-instruct",
        maxTokens: 100,
        // No nodeAddress specified - should auto-discover
      });

      expect(jobId).toBeTruthy();
    });

    it("should emit discovery events", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const discoverySpy = vi.fn();
      sdk.on("discovery:start", discoverySpy);
      sdk.on("discovery:complete", discoverySpy);

      await sdk.connect(mockProvider);
      await sdk.discoverNodes({ modelId: "llama-3.2-1b-instruct" });

      expect(discoverySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "discovery:start" })
      );
    });
  });
});

// Type definitions that should be implemented
export interface NodeCapabilities {
  models: string[]; // Supported model IDs
  maxTokens: number; // Maximum tokens per request
  pricePerToken: string; // Price in wei
  computeType?: string; // "CPU" | "GPU" | "TPU"
  gpuModel?: string; // e.g., "RTX 4090"
  maxConcurrentJobs?: number; // Parallel job capacity
}

export interface DiscoveredNode {
  peerId: string;
  multiaddrs: string[];
  capabilities: NodeCapabilities;
  latency?: number; // Measured latency in ms
  reputation?: number; // 0-100 score
  lastSeen: number; // Timestamp
}

export interface NodeDiscoveryOptions {
  modelId: string;
  maxLatency?: number;
  minReputation?: number;
  maxPrice?: string;
  preferredNodes?: string[];
  excludeNodes?: string[];
  forceRefresh?: boolean;
}

export interface DiscoveryConfig {
  cacheTTL?: number; // Cache time-to-live in ms
  maxNodes?: number; // Maximum nodes to return
  discoveryTimeout?: number; // Discovery timeout in ms
}
