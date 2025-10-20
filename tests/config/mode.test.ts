// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect } from "vitest";
import { FabstirSDK } from "../../src/index";

describe("SDK Mode Configuration - Sub-phase 2.1", () => {
  describe("Basic Mode Support", () => {
    it("should default to mock mode when no mode specified", () => {
      const sdk = new FabstirSDK();
      expect(sdk.config.mode).toBe("mock");
    });

    it("should accept mock mode explicitly", () => {
      const sdk = new FabstirSDK({ mode: "mock" });
      expect(sdk.config.mode).toBe("mock");
    });

    it("should accept production mode", () => {
      const sdk = new FabstirSDK({ 
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."]
        }
      });
      expect(sdk.config.mode).toBe("production");
    });

    it("should store mode in config object", () => {
      const sdk = new FabstirSDK({ 
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."]
        }
      });
      expect(sdk.config).toHaveProperty("mode", "production");
    });
  });

  describe("Backward Compatibility", () => {
    it("should work exactly as before when mode not specified", async () => {
      const sdk = new FabstirSDK({
        network: "base-sepolia",
        debug: true,
      });

      // Should still have all the same properties
      expect(sdk.config.network).toBe("base-sepolia");
      expect(sdk.config.debug).toBe(true);

      // Mock provider like demo uses
      const mockProvider = {
        getNetwork: async () => ({ chainId: 84532 }),
        getSigner: () => ({
          getAddress: async () => "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
        }),
      };

      // Should connect without issues
      await sdk.connect(mockProvider);

      // Should submit job as before
      const jobId = await sdk.submitJob({
        prompt: "test",
        modelId: "llama2-7b",
        maxTokens: 100,
      });

      expect(jobId).toBeGreaterThan(0);
      expect(typeof jobId).toBe('number');
    });

    it("should not require any new configuration in mock mode", () => {
      // This should work without any errors
      const sdk = new FabstirSDK();

      // All existing methods should be available
      expect(typeof sdk.connect).toBe("function");
      expect(typeof sdk.submitJob).toBe("function");
      expect(typeof sdk.getJobStatus).toBe("function");
      expect(typeof sdk.createResponseStream).toBe("function");
    });
  });
});
