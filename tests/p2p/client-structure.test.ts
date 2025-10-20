// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// tests/p2p/client-structure.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK } from "../../src/index";

describe("P2P Client Structure - Sub-phase 2.3", () => {
  let mockProvider: any;

  beforeEach(() => {
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi
          .fn()
          .mockResolvedValue("0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1"),
        signMessage: vi.fn().mockResolvedValue("0xmocksignature"),
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
    };
  });

  describe("P2PClient Class", () => {
    it("should have P2PClient class available for import", async () => {
      // This will fail until P2PClient is created
      const { P2PClient } = await import("../../src/p2p/client");
      expect(P2PClient).toBeDefined();
      expect(typeof P2PClient).toBe("function"); // It's a class/constructor
    });

    it("should be able to instantiate P2PClient with config", async () => {
      const { P2PClient } = await import("../../src/p2p/client");

      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        enableDHT: true,
        enableMDNS: false,
      });

      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(P2PClient);
    });
  });

  describe("SDK P2P Integration", () => {
    it("should not create P2P client in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });
      await sdk.connect(mockProvider);

      // P2P client should not exist
      expect(sdk["_p2pClient"]).toBeUndefined();
      expect(sdk.isP2PEnabled()).toBe(false);
    });

    it("should prepare P2P client in production mode but not start it automatically", () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      // P2P should be enabled but not started
      expect(sdk.isP2PEnabled()).toBe(true);
      expect(sdk.isP2PConnected()).toBe(false);
    });

    it("should create P2P client when connecting in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);

      // P2P client should be created
      expect(sdk["_p2pClient"]).toBeDefined();
      expect(sdk.isP2PEnabled()).toBe(true);
    });
  });

  describe("Client Lifecycle", () => {
    it("should have start method on P2PClient", async () => {
      const { P2PClient } = await import("../../src/p2p/client");
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      expect(typeof client.start).toBe("function");

      // Start should return a promise
      const startPromise = client.start();
      expect(startPromise).toBeInstanceOf(Promise);
      await startPromise; // Should resolve without error
    });

    it("should have stop method on P2PClient", async () => {
      const { P2PClient } = await import("../../src/p2p/client");
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      expect(typeof client.stop).toBe("function");

      // Stop should return a promise
      const stopPromise = client.stop();
      expect(stopPromise).toBeInstanceOf(Promise);
      await stopPromise; // Should resolve without error
    });

    it("should track connection state", async () => {
      const { P2PClient } = await import("../../src/p2p/client");
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      // Initially not started
      expect(client.isStarted()).toBe(false);
      expect(client.getStatus()).toBe("stopped");

      // After start
      await client.start();
      expect(client.isStarted()).toBe(true);
      expect(client.getStatus()).toBe("started");

      // After stop
      await client.stop();
      expect(client.isStarted()).toBe(false);
      expect(client.getStatus()).toBe("stopped");
    });

    it("should handle multiple start calls gracefully", async () => {
      const { P2PClient } = await import("../../src/p2p/client");
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      await client.start();

      // Second start should not throw
      await expect(client.start()).resolves.not.toThrow();

      // Should still be started
      expect(client.isStarted()).toBe(true);
    });

    it("should handle stop when not started", async () => {
      const { P2PClient } = await import("../../src/p2p/client");
      const client = new P2PClient({
        bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
      });

      // Stop without start should not throw
      await expect(client.stop()).resolves.not.toThrow();
      expect(client.isStarted()).toBe(false);
    });
  });

  describe("SDK P2P Lifecycle", () => {
    it("should start P2P client when SDK connects in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      expect(sdk.isP2PConnected()).toBe(false);

      await sdk.connect(mockProvider);

      // P2P should be started
      expect(sdk.isP2PConnected()).toBe(true);
      expect(sdk["_p2pClient"]?.isStarted()).toBe(true);
    });

    it("should stop P2P client when SDK disconnects", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(mockProvider);
      expect(sdk.isP2PConnected()).toBe(true);

      await sdk.disconnect();

      expect(sdk.isP2PConnected()).toBe(false);
      expect(sdk["_p2pClient"]?.isStarted()).toBe(false);
    });

    it("should expose P2P status through SDK", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      expect(sdk.getP2PStatus()).toBe("disabled");

      await sdk.connect(mockProvider);
      expect(sdk.getP2PStatus()).toBe("connected");

      await sdk.disconnect();
      expect(sdk.getP2PStatus()).toBe("disconnected");
    });
  });

  describe("Error Handling", () => {
    it("should handle P2P client creation errors gracefully", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["invalid-bootstrap-node"], // This should still create client
        },
      });

      // Should not throw during SDK creation
      expect(() => sdk).not.toThrow();

      // Connection might have issues but shouldn't crash
      await expect(sdk.connect(mockProvider)).resolves.not.toThrow();
    });

    it("should emit P2P events through SDK", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const startedSpy = vi.fn();
      const stoppedSpy = vi.fn();

      sdk.on("p2p:started", startedSpy);
      sdk.on("p2p:stopped", stoppedSpy);

      await sdk.connect(mockProvider);
      expect(startedSpy).toHaveBeenCalled();

      await sdk.disconnect();
      expect(stoppedSpy).toHaveBeenCalled();
    });
  });

  describe("Configuration Passing", () => {
    it("should pass P2P config to client correctly", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
          enableDHT: false,
          enableMDNS: true,
          dialTimeout: 15000,
          requestTimeout: 30000,
        },
      });

      await sdk.connect(mockProvider);

      const client = sdk["_p2pClient"];
      expect(client).toBeDefined();

      // Client should have received the config
      const config = client["config"];
      expect(config.bootstrapNodes).toEqual([
        "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...",
      ]);
      expect(config.enableDHT).toBe(false);
      expect(config.enableMDNS).toBe(true);
      expect(config.dialTimeout).toBe(15000);
      expect(config.requestTimeout).toBe(30000);
    });
  });

  describe("Backward Compatibility", () => {
    it("should not affect mock mode behavior", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      // These methods should exist but work for mock mode
      expect(sdk.isP2PEnabled()).toBe(false);
      expect(sdk.isP2PConnected()).toBe(false);
      expect(sdk.getP2PStatus()).toBe("disabled");

      await sdk.connect(mockProvider);

      // Still no P2P in mock mode
      expect(sdk.isP2PEnabled()).toBe(false);
      expect(sdk.isP2PConnected()).toBe(false);
      expect(sdk.getP2PStatus()).toBe("disabled");

      // All existing functionality should work
      const jobId = await sdk.submitJob({
        prompt: "test",
        modelId: "llama2-7b",
        maxTokens: 100,
      });

      expect(jobId).toBeGreaterThan(0);
    });

    it("should maintain all existing SDK methods", () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      // All existing methods should still exist
      expect(typeof sdk.connect).toBe("function");
      expect(typeof sdk.disconnect).toBe("function");
      expect(typeof sdk.submitJob).toBe("function");
      expect(typeof sdk.getJobStatus).toBe("function");
      expect(typeof sdk.createResponseStream).toBe("function");

      // New P2P methods
      expect(typeof sdk.isP2PEnabled).toBe("function");
      expect(typeof sdk.isP2PConnected).toBe("function");
      expect(typeof sdk.getP2PStatus).toBe("function");
    });
  });
});
