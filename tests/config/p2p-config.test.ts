// tests/config/p2p-config.test.ts
import { describe, it, expect } from "vitest";
import { FabstirSDK } from "../../src/index";

describe("P2P Configuration - Sub-phase 2.2", () => {
  describe("P2PConfig Interface", () => {
    it("should accept valid P2P configuration in production mode", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
            },
          })
      ).not.toThrow();
    });

    it("should accept P2P config with all optional fields", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              enableDHT: true,
              enableMDNS: false,
              listenAddresses: ["/ip4/0.0.0.0/tcp/0"],
              dialTimeout: 30000,
              requestTimeout: 60000,
            },
          })
      ).not.toThrow();
    });

    it("should store P2P config in SDK instance", () => {
      const config = {
        mode: "production" as const,
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
          enableDHT: true,
          enableMDNS: true,
        },
      };

      const sdk = new FabstirSDK(config);

      expect(sdk.config.p2pConfig).toBeDefined();
      expect(sdk.config.p2pConfig?.bootstrapNodes).toEqual([
        "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW...",
      ]);
      expect(sdk.config.p2pConfig?.enableDHT).toBe(true);
      expect(sdk.config.p2pConfig?.enableMDNS).toBe(true);
    });
  });

  describe("Production Mode P2P Requirements", () => {
    it("should require P2P config in production mode", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            // Missing p2pConfig
          })
      ).toThrow("P2P configuration required for production mode");
    });

    it("should throw clear error when P2P config is null in production", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: null as any,
          })
      ).toThrow("P2P configuration required for production mode");
    });

    it("should throw clear error when P2P config is undefined in production", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: undefined,
          })
      ).toThrow("P2P configuration required for production mode");
    });

    it("should not require P2P config in mock mode", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "mock",
            // No p2pConfig needed
          })
      ).not.toThrow();

      expect(
        () =>
          new FabstirSDK({
            mode: "mock",
            p2pConfig: undefined,
          })
      ).not.toThrow();
    });

    it("should ignore P2P config in mock mode", () => {
      const sdk = new FabstirSDK({
        mode: "mock",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      // P2P config can be present but is not validated in mock mode
      expect(sdk.config.mode).toBe("mock");
      expect(sdk.config.p2pConfig).toBeDefined();
    });
  });

  describe("Bootstrap Nodes Validation", () => {
    it("should require bootstrapNodes array in production P2P config", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              // Missing bootstrapNodes
            } as any,
          })
      ).toThrow("P2P configuration must include bootstrapNodes array");
    });

    it("should require at least one bootstrap node in production", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [],
            },
          })
      ).toThrow("At least one bootstrap node required for production mode");
    });

    it("should validate bootstrap nodes are strings", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [123] as any,
            },
          })
      ).toThrow("Bootstrap nodes must be strings");

      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [null] as any,
            },
          })
      ).toThrow("Bootstrap nodes must be strings");

      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [{}] as any,
            },
          })
      ).toThrow("Bootstrap nodes must be strings");
    });

    it("should validate bootstrap node format", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["invalid-address"],
            },
          })
      ).toThrow("Invalid bootstrap node format: invalid-address");

      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [""],
            },
          })
      ).toThrow("Invalid bootstrap node format: ");
    });

    it("should accept valid multiaddr formats", () => {
      const validAddresses = [
        "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWExample",
        "/ip6/::1/tcp/4001/p2p/12D3KooWExample",
        "/dns4/bootstrap.libp2p.io/tcp/443/wss/p2p/QmExample",
        "/dnsaddr/bootstrap.libp2p.io/p2p/QmExample",
      ];

      validAddresses.forEach((addr) => {
        expect(
          () =>
            new FabstirSDK({
              mode: "production",
              p2pConfig: {
                bootstrapNodes: [addr],
              },
            })
        ).not.toThrow();
      });
    });

    it("should accept multiple bootstrap nodes", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: [
                "/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW1",
                "/ip4/127.0.0.2/tcp/4001/p2p/12D3KooW2",
                "/dns4/bootstrap.example.com/tcp/443/wss/p2p/QmExample",
              ],
            },
          })
      ).not.toThrow();
    });
  });

  describe("P2P Config Validation", () => {
    it("should validate enableDHT is boolean when provided", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              enableDHT: "true" as any,
            },
          })
      ).toThrow("enableDHT must be a boolean");
    });

    it("should validate enableMDNS is boolean when provided", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              enableMDNS: 1 as any,
            },
          })
      ).toThrow("enableMDNS must be a boolean");
    });

    it("should validate dialTimeout is positive number when provided", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              dialTimeout: -1000,
            },
          })
      ).toThrow("dialTimeout must be a positive number");

      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              dialTimeout: "5000" as any,
            },
          })
      ).toThrow("dialTimeout must be a number");
    });

    it("should validate requestTimeout is positive number when provided", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              requestTimeout: 0,
            },
          })
      ).toThrow("requestTimeout must be a positive number");
    });

    it("should validate listenAddresses is array of strings when provided", () => {
      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              listenAddresses: "/ip4/0.0.0.0/tcp/0" as any,
            },
          })
      ).toThrow("listenAddresses must be an array");

      expect(
        () =>
          new FabstirSDK({
            mode: "production",
            p2pConfig: {
              bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
              listenAddresses: [123] as any,
            },
          })
      ).toThrow("listenAddresses must be strings");
    });

    it("should apply default values for optional P2P config fields", () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      // Should have sensible defaults
      expect(sdk.config.p2pConfig?.enableDHT).toBe(true); // Default to true
      expect(sdk.config.p2pConfig?.enableMDNS).toBe(true); // Default to true
      expect(sdk.config.p2pConfig?.dialTimeout).toBe(30000); // 30 seconds
      expect(sdk.config.p2pConfig?.requestTimeout).toBe(60000); // 60 seconds
    });
  });

  describe("Config Immutability", () => {
    it("should freeze P2P config object", () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.p2pConfig.bootstrapNodes = [];
      }).toThrow();

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.p2pConfig.enableDHT = false;
      }).toThrow();
    });

    it("should freeze nested arrays in P2P config", () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
          listenAddresses: ["/ip4/0.0.0.0/tcp/0"],
        },
      });

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.p2pConfig.bootstrapNodes.push("new-node");
      }).toThrow();

      expect(() => {
        // @ts-ignore - Testing runtime behavior
        sdk.config.p2pConfig.listenAddresses[0] = "modified";
      }).toThrow();
    });
  });

  describe("TypeScript Types", () => {
    it("should have proper TypeScript types for P2P config", () => {
      // This test ensures TypeScript compilation works with the new types
      const config = {
        mode: "production" as const,
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
          enableDHT: true,
          enableMDNS: false,
          listenAddresses: ["/ip4/0.0.0.0/tcp/0"],
          dialTimeout: 30000,
          requestTimeout: 60000,
        },
      };

      const sdk = new FabstirSDK(config);

      // Type checks
      const bootstrapNodes: string[] = sdk.config.p2pConfig!.bootstrapNodes;
      const enableDHT: boolean | undefined = sdk.config.p2pConfig?.enableDHT;
      const dialTimeout: number | undefined = sdk.config.p2pConfig?.dialTimeout;

      expect(bootstrapNodes).toBeDefined();
      expect(typeof enableDHT).toBe("boolean");
      expect(typeof dialTimeout).toBe("number");
    });
  });
});
