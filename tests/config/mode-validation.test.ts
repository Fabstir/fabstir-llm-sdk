// tests/config/mode-validation.test.ts
import { describe, it, expect } from "vitest";
import { FabstirSDK } from "../../src/index";

describe("SDK Mode Configuration - Complete Sub-phase 2.1", () => {
  describe("Mode Validation", () => {
    it("should throw error for invalid mode values", () => {
      expect(() => {
        new FabstirSDK({ mode: "invalid" as any });
      }).toThrow('Invalid SDK mode: invalid. Must be "mock" or "production"');

      expect(() => {
        new FabstirSDK({ mode: "" as any });
      }).toThrow('Invalid SDK mode: . Must be "mock" or "production"');

      expect(() => {
        new FabstirSDK({ mode: null as any });
      }).toThrow("Invalid SDK mode");
    });

    it("should validate mode is string type", () => {
      expect(() => {
        new FabstirSDK({ mode: 123 as any });
      }).toThrow("Invalid SDK mode");

      expect(() => {
        new FabstirSDK({ mode: true as any });
      }).toThrow("Invalid SDK mode");

      expect(() => {
        new FabstirSDK({ mode: {} as any });
      }).toThrow("Invalid SDK mode");
    });

    it("should be case sensitive for mode values", () => {
      expect(() => {
        new FabstirSDK({ mode: "Mock" as any });
      }).toThrow("Invalid SDK mode: Mock");

      expect(() => {
        new FabstirSDK({ mode: "PRODUCTION" as any });
      }).toThrow("Invalid SDK mode: PRODUCTION");
    });
  });

  describe("FabstirConfig Interface Validation", () => {
    it("should accept all valid config combinations with mode", () => {
      // Mode only
      expect(() => new FabstirSDK({ mode: "mock" })).not.toThrow();
      expect(() => new FabstirSDK({ mode: "production" })).not.toThrow();

      // Mode with network
      expect(
        () =>
          new FabstirSDK({
            mode: "mock",
            network: "base-sepolia",
          })
      ).not.toThrow();

      // Mode with all options
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            network: "base-mainnet",
            rpcUrl: "https://mainnet.base.org",
            debug: true,
            contractAddresses: {
              jobMarketplace: "0x123",
              paymentEscrow: "0x456",
              nodeRegistry: "0x789",
            },
          })
      ).not.toThrow();
    });

    it("should maintain type safety for FabstirConfig", () => {
      const config = {
        mode: "mock" as const,
        network: "base-sepolia" as const,
        debug: true,
      };

      const sdk = new FabstirSDK(config);

      // TypeScript should enforce these types
      expect(sdk.config.mode).toBe("mock");
      expect(sdk.config.network).toBe("base-sepolia");
      expect(sdk.config.debug).toBe(true);
    });
  });

  describe("Extensive Backward Compatibility", () => {
    it("should work with empty config object", () => {
      const sdk = new FabstirSDK({});
      expect(sdk.config.mode).toBe("mock");
      expect(sdk.config.network).toBe("base-sepolia"); // default network
    });

    it("should work with undefined config", () => {
      const sdk = new FabstirSDK(undefined);
      expect(sdk.config.mode).toBe("mock");
    });

    it("should work with existing demo configurations", () => {
      // Configuration from actual demo
      const demoConfig = {
        network: "base-sepolia" as const,
        debug: true,
      };

      const sdk = new FabstirSDK(demoConfig);
      expect(sdk.config.mode).toBe("mock");
      expect(sdk.config.network).toBe("base-sepolia");
      expect(sdk.config.debug).toBe(true);
    });

    it("should preserve all existing config properties when mode is added", () => {
      const config = {
        mode: "mock" as const,
        network: "base-mainnet" as const,
        rpcUrl: "https://custom.rpc.url",
        debug: false,
        contractAddresses: {
          jobMarketplace: "0xabc",
          paymentEscrow: "0xdef",
          nodeRegistry: "0xghi",
        },
      };

      const sdk = new FabstirSDK(config);

      expect(sdk.config.mode).toBe("mock");
      expect(sdk.config.network).toBe("base-mainnet");
      expect(sdk.config.rpcUrl).toBe("https://custom.rpc.url");
      expect(sdk.config.debug).toBe(false);
      expect(sdk.config.contractAddresses).toEqual({
        jobMarketplace: "0xabc",
        paymentEscrow: "0xdef",
        nodeRegistry: "0xghi",
      });
    });

    it("should not break when config properties are accessed", () => {
      const sdk = new FabstirSDK({ network: "base-sepolia" });

      // These should not throw
      expect(() => sdk.config.mode).not.toThrow();
      expect(() => sdk.config.network).not.toThrow();
      expect(() => sdk.config.debug).not.toThrow();
      expect(() => sdk.config.rpcUrl).not.toThrow();
      expect(() => sdk.config.contractAddresses).not.toThrow();
    });

    it("should maintain immutability of config", () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.mode = "production";
      }).toThrow();

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.network = "base-mainnet";
      }).toThrow();
    });
  });

  describe("Mode-specific Initialization", () => {
    it("should not initialize P2P components in mock mode", () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      // P2P client should not exist in mock mode
      expect(sdk["_p2pClient"]).toBeUndefined();
    });

    it("should prepare for P2P initialization in production mode", () => {
      const sdk = new FabstirSDK({ mode: "production" });

      // Should be ready for P2P but not initialized yet (requires connect)
      expect(sdk.config.mode).toBe("production");
      expect(sdk["_isConnected"]).toBe(false);
    });

    it("should expose mode information through public API", () => {
      const mockSdk = new FabstirSDK({ mode: "mock" });
      const prodSdk = new FabstirSDK({ mode: "production" });

      expect(mockSdk.config.mode).toBe("mock");
      expect(prodSdk.config.mode).toBe("production");

      // Mode should be read-only
      expect(
        Object.getOwnPropertyDescriptor(mockSdk.config, "mode")?.writable
      ).toBe(false);
    });
  });
});
