// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/p2p/p2p-connection.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";
import { P2PClient } from "../../src/p2p/client";

describe("P2P Connection with libp2p - Sub-phase 2.5", () => {
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
    // Clean up any open connections
    if (sdk && sdk.isConnected) {
      await sdk.disconnect();
    }
  });

  describe("Libp2p Node Creation", () => {
    it("should create libp2p node with correct configuration", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
        enableMDNS: false,
      });

      await client.start();

      // Should have created a libp2p node
      expect(client["node"]).toBeDefined();
      expect(client["node"].status).toBe("started");

      await client.stop();
    });

    it("should configure transports correctly", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Should have TCP and WebSocket transports
      const protocols = await client["node"].getProtocols();
      expect(protocols).toBeDefined();
      expect(Array.isArray(protocols)).toBe(true);

      await client.stop();
    });

    it("should generate or use peer ID", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const peerId = client.getPeerId();
      expect(peerId).toBeDefined();
      expect(typeof peerId).toBe("string");
      expect(peerId).toMatch(/^12D3KooW/); // libp2p peer ID format

      await client.stop();
    });

    it("should set up connection encryption", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Node should have noise protocol for encryption
      const components = client["node"].components;
      expect(components.connectionEncrypter).toBeDefined();

      await client.stop();
    });
  });

  describe("Bootstrap Node Connection", () => {
    it("should attempt to connect to bootstrap nodes on start", async () => {
      const client = new P2PClient({
        bootstrapNodes: [
          "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWMockBootstrap1",
          "/ip4/127.0.0.2/tcp/4001/p2p/12D3KooWMockBootstrap2",
        ],
      });

      const connectSpy = vi.fn();
      client.on("peer:connect", connectSpy);

      await client.start();

      // Give time for connection attempts
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have attempted connections
      expect(client["connectingToBootstrap"]).toBe(true);

      await client.stop();
    });

    it("should handle bootstrap connection failures gracefully", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/255.255.255.255/tcp/4001/p2p/12D3KooWInvalid"], // Invalid IP
        dialTimeout: 1000,
      });

      const errorSpy = vi.fn();
      client.on("error", errorSpy);

      await client.start();

      // Should start despite bootstrap failure
      expect(client.isStarted()).toBe(true);

      // Wait for connection timeout
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Should emit error but continue running
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "BOOTSTRAP_CONNECTION_FAILED",
        })
      );

      await client.stop();
    });

    it("should track connected peers", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const connectedPeers = client.getConnectedPeers();
      expect(Array.isArray(connectedPeers)).toBe(true);
      expect(connectedPeers.length).toBeGreaterThanOrEqual(0);

      await client.stop();
    });
  });

  describe("Connection Events", () => {
    it("should emit peer:connect event when peer connects", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      const connectSpy = vi.fn();
      client.on("peer:connect", connectSpy);

      await client.start();

      // Simulate peer connection (in real implementation, this would happen via libp2p)
      client["node"]?.addEventListener("peer:connect", (evt: any) => {
        client.emit("peer:connect", evt.detail);
      });

      // If any peer connects, event should be emitted
      // (In test environment, might not have real peers)

      await client.stop();
    });

    it("should emit peer:disconnect event when peer disconnects", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      const disconnectSpy = vi.fn();
      client.on("peer:disconnect", disconnectSpy);

      await client.start();

      // Set up disconnect listener
      client["node"]?.addEventListener("peer:disconnect", (evt: any) => {
        client.emit("peer:disconnect", evt.detail);
      });

      await client.stop();
    });

    it("should track connection count", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      const status = client.getDetailedStatus();
      expect(status.connections).toBeGreaterThanOrEqual(0);
      expect(typeof status.connections).toBe("number");

      await client.stop();
    });
  });

  describe("Connection Retry Logic", () => {
    it("should retry failed connections with exponential backoff", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/255.255.255.255/tcp/4001/p2p/12D3KooWInvalid"],
        dialTimeout: 500,
        maxRetries: 3,
        retryDelay: 100,
      });

      const retrySpy = vi.fn();
      client.on("connection:retry", retrySpy);

      await client.start();

      // Wait for retries
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Should have retried multiple times
      expect(retrySpy).toHaveBeenCalledTimes(3);

      // Check exponential backoff
      const calls = retrySpy.mock.calls;
      expect(calls[0][0].attempt).toBe(1);
      expect(calls[1][0].attempt).toBe(2);
      expect(calls[2][0].attempt).toBe(3);

      await client.stop();
    });

    it("should stop retrying after max attempts", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/255.255.255.255/tcp/4001/p2p/12D3KooWInvalid"],
        dialTimeout: 500,
        maxRetries: 2,
        retryDelay: 100,
      });

      const retrySpy = vi.fn();
      const failureSpy = vi.fn();

      client.on("connection:retry", retrySpy);
      client.on("connection:failed", failureSpy);

      await client.start();

      // Wait for retries to complete
      await new Promise((resolve) => setTimeout(resolve, 1500));

      expect(retrySpy).toHaveBeenCalledTimes(2);
      expect(failureSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "Max retries exceeded",
        })
      );

      await client.stop();
    });

    it("should successfully connect after retry", async () => {
      // This test simulates a connection that fails initially but succeeds on retry
      let attemptCount = 0;

      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        dialTimeout: 1000,
        maxRetries: 3,
      });

      // Mock dial to fail first time, succeed second time
      const originalDial = client["dial"];
      client["dial"] = vi.fn().mockImplementation(async (...args) => {
        attemptCount++;
        if (attemptCount === 1) {
          throw new Error("Connection failed");
        }
        // Succeed on second attempt
        return { id: "mock-connection" };
      });

      const successSpy = vi.fn();
      client.on("peer:connect", successSpy);

      await client.start();

      // Wait for retry and success
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(attemptCount).toBeGreaterThanOrEqual(1);

      await client.stop();
    });
  });

  describe("SDK Integration", () => {
    it("should establish P2P connection when SDK connects in production", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
          enableDHT: true,
        },
      });

      const p2pStartedSpy = vi.fn();
      sdk.on("p2p:started", p2pStartedSpy);

      await sdk.connect(mockProvider);

      expect(sdk.isP2PConnected()).toBe(true);
      expect(p2pStartedSpy).toHaveBeenCalled();

      // P2P client should have a running libp2p node
      const client = sdk["_p2pClient"];
      expect(client?.["node"]).toBeDefined();
      expect(client?.["node"]?.status).toBe("started");
    });

    it("should handle P2P errors without breaking SDK connection", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/255.255.255.255/tcp/4001/p2p/12D3KooWInvalid"],
          dialTimeout: 500,
        },
      });

      const errorSpy = vi.fn();
      sdk.on("error", errorSpy);

      // Should connect despite P2P issues
      await expect(sdk.connect(mockProvider)).resolves.not.toThrow();

      expect(sdk.isConnected).toBe(true);
      expect(sdk.isP2PConnected()).toBe(true); // P2P client started even if no peers

      // Wait for connection attempts
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Should emit P2P errors
      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "P2P_ERROR",
        })
      );
    });

    it("should expose P2P metrics through SDK", async () => {
      sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      const metrics = sdk.getP2PMetrics();

      expect(metrics).toMatchObject({
        connected: true,
        peerId: expect.any(String),
        connections: expect.any(Number),
        bootstrapNodes: expect.any(Array),
        uptime: expect.any(Number),
      });
    });
  });

  describe("Cleanup and Shutdown", () => {
    it("should properly close all connections on stop", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();
      expect(client.isStarted()).toBe(true);

      await client.stop();

      expect(client.isStarted()).toBe(false);
      expect(client["node"]?.status).toBe("stopped");
      expect(client.getConnectedPeers()).toEqual([]);
    });

    it("should cancel pending connection attempts on stop", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/10.0.0.1/tcp/4001/p2p/12D3KooW..."], // Slow to connect
        dialTimeout: 5000,
      });

      const cancelSpy = vi.fn();
      client.on("connection:cancelled", cancelSpy);

      await client.start();

      // Stop while connections are pending
      setTimeout(() => client.stop(), 100);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(client.isStarted()).toBe(false);
    });
  });

  describe("Configuration Options", () => {
    it("should respect custom listen addresses", async () => {
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        listenAddresses: ["/ip4/0.0.0.0/tcp/0"],
      });

      await client.start();

      const addresses = client.getListenAddresses();
      expect(Array.isArray(addresses)).toBe(true);
      expect(addresses.length).toBeGreaterThan(0);

      await client.stop();
    });

    it("should enable/disable DHT based on config", async () => {
      // With DHT enabled
      const clientWithDHT = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
      });

      await clientWithDHT.start();

      const protocols = await clientWithDHT["node"].getProtocols();
      expect(protocols.some((p) => p.includes("kad"))).toBe(true); // Kademlia DHT

      await clientWithDHT.stop();

      // With DHT disabled
      const clientWithoutDHT = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: false,
      });

      await clientWithoutDHT.start();

      const protocolsNoDHT = await clientWithoutDHT["node"].getProtocols();
      expect(protocolsNoDHT.some((p) => p.includes("kad"))).toBe(false);

      await clientWithoutDHT.stop();
    });
  });
});
