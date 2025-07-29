// tests/test_node_selection.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, NodeInfo, NodeSelectionCriteria } from "../src";

describe("Node Selection and Routing", () => {
  let sdk: FabstirSDK;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);
  });

  it("should discover nodes offering specific model", async () => {
    const nodes = await sdk.discoverNodes("llama2-7b");

    expect(nodes.length).toBeGreaterThan(0);
    nodes.forEach((node) => {
      expect(node.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(node.models).toContain("llama2-7b");
      expect(node.online).toBe(true);
    });
  });

  it("should select best node based on criteria", async () => {
    const criteria: NodeSelectionCriteria = {
      modelId: "llama2-7b",
      maxLatency: 100, // ms
      minReputation: 80,
      maxPrice: 0.0001,
    };

    const node = await sdk.selectBestNode(criteria);
    expect(node).toBeDefined();
    expect(node.reputation).toBeGreaterThanOrEqual(80);
    expect(node.latency).toBeLessThanOrEqual(100);
  });

  it("should measure node latency", async () => {
    const nodeAddress = "0x1234567890123456789012345678901234567890";
    const latency = await sdk.measureNodeLatency(nodeAddress);

    expect(latency).toBeGreaterThan(0);
    expect(latency).toBeLessThan(1000); // Less than 1 second
  });

  it("should handle node failover", async () => {
    const primaryNode = "0x1111111111111111111111111111111111111111";
    const backupNodes = await sdk.getBackupNodes(primaryNode, "llama2-7b");

    expect(backupNodes.length).toBeGreaterThan(0);
    expect(backupNodes[0].address).not.toBe(primaryNode);
  });

  it("should load balance across multiple nodes", async () => {
    const nodes = await sdk.discoverNodes("llama2-7b");
    const selectedNodes = [];

    // Simulate multiple job submissions
    for (let i = 0; i < 10; i++) {
      const node = await sdk.selectNodeWithLoadBalancing("llama2-7b");
      selectedNodes.push(node.address);
    }

    // Check that different nodes were selected
    const uniqueNodes = new Set(selectedNodes);
    expect(uniqueNodes.size).toBeGreaterThan(1);
  });
});
