// tests/mode/mode-behavior.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FabstirSDK, JobStatus } from "../../src/index";

describe("Mode-Specific Behavior - Sub-phase 2.4", () => {
  let mockProvider: any;
  let productionProvider: any;

  beforeEach(() => {
    // Mock provider for mock mode
    mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi
          .fn()
          .mockResolvedValue("0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1"),
      }),
    };

    // Production provider with full Web3Provider interface
    productionProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi
          .fn()
          .mockResolvedValue("0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1"),
        signMessage: vi.fn().mockResolvedValue("0xsignature"),
      }),
      on: vi.fn(),
      removeListener: vi.fn(),
      _isProvider: true, // Marker for production provider
    };
  });

  describe("Connect Method Mode Handling", () => {
    it("should use mock connection flow in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      await sdk.connect(mockProvider);

      // Should be connected without P2P
      expect(sdk.isConnected).toBe(true);
      expect(sdk.isP2PConnected()).toBe(false);
      expect(sdk["_p2pClient"]).toBeUndefined();

      // Mock provider methods should be called
      expect(mockProvider.getNetwork).toHaveBeenCalled();
    });

    it("should use production connection flow in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      await sdk.connect(productionProvider);

      // Should be connected with P2P
      expect(sdk.isConnected).toBe(true);
      expect(sdk.isP2PConnected()).toBe(true);
      expect(sdk["_p2pClient"]).toBeDefined();

      // Production provider methods should be called
      expect(productionProvider.getNetwork).toHaveBeenCalled();
      expect(productionProvider.on).toHaveBeenCalled();
    });

    it("should require signer in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const providerWithoutSigner = {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
        // No getSigner method
      };

      await expect(sdk.connect(providerWithoutSigner)).rejects.toThrow(
        "Production mode requires a provider with signer"
      );
    });

    it("should not require signer in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      const providerWithoutSigner = {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 84532 }),
      };

      // Should work without signer in mock mode
      await expect(sdk.connect(providerWithoutSigner)).resolves.not.toThrow();
      expect(sdk.isConnected).toBe(true);
    });
  });

  describe("SubmitJob Mode Routing", () => {
    it("should use mock job submission in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });
      await sdk.connect(mockProvider);

      const jobId = await sdk.submitJob({
        prompt: "Test prompt",
        modelId: "llama2-7b",
        maxTokens: 100,
      });

      // Mock mode returns numeric job IDs
      expect(typeof jobId).toBe("number");
      expect(jobId).toBeGreaterThan(0);

      // Should not attempt P2P operations
      expect(sdk["_p2pClient"]).toBeUndefined();
    });

    it("should prepare for P2P job submission in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await sdk.connect(productionProvider);

      // Mock the P2P client's submitJob method
      const p2pSubmitSpy = vi.fn().mockResolvedValue(12345);
      sdk["_p2pClient"].submitJob = p2pSubmitSpy;

      const jobId = await sdk.submitJob({
        prompt: "Test prompt",
        modelId: "llama2-7b",
        maxTokens: 100,
      });

      // Should use P2P client for submission
      expect(p2pSubmitSpy).toHaveBeenCalledWith({
        prompt: "Test prompt",
        modelId: "llama2-7b",
        maxTokens: 100,
      });

      expect(jobId).toBe(12345);
    });

    it("should handle P2P submission errors gracefully", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await sdk.connect(productionProvider);

      // Mock P2P client to throw error
      sdk["_p2pClient"].submitJob = vi
        .fn()
        .mockRejectedValue(new Error("P2P network error"));

      await expect(
        sdk.submitJob({
          prompt: "Test prompt",
          modelId: "llama2-7b",
          maxTokens: 100,
        })
      ).rejects.toThrow("P2P network error");
    });

    it("should validate job parameters in both modes", async () => {
      // Mock mode
      const mockSdk = new FabstirSDK({ mode: "mock" });
      await mockSdk.connect(mockProvider);

      await expect(
        mockSdk.submitJob({
          prompt: "", // Empty prompt
          modelId: "llama2-7b",
          maxTokens: 100,
        })
      ).rejects.toThrow("Prompt cannot be empty");

      // Production mode
      const prodSdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await prodSdk.connect(productionProvider);

      await expect(
        prodSdk.submitJob({
          prompt: "", // Empty prompt
          modelId: "llama2-7b",
          maxTokens: 100,
        })
      ).rejects.toThrow("Prompt cannot be empty");
    });
  });

  describe("Status Methods Mode Handling", () => {
    it("should use mock status in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });
      await sdk.connect(mockProvider);

      const jobId = await sdk.submitJob({
        prompt: "Test",
        modelId: "llama2-7b",
        maxTokens: 50,
      });

      const status = await sdk.getJobStatus(jobId);

      // Mock mode returns predefined status
      expect(status).toBe("POSTED");

      // Should not use P2P for status
      expect(sdk["_p2pClient"]).toBeUndefined();
    });

    it("should prepare for P2P status queries in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await sdk.connect(productionProvider);

      // Mock P2P client's getJobStatus
      const p2pStatusSpy = vi.fn().mockResolvedValue("PROCESSING");
      sdk["_p2pClient"].getJobStatus = p2pStatusSpy;

      const status = await sdk.getJobStatus(123);

      // Should use P2P client for status
      expect(p2pStatusSpy).toHaveBeenCalledWith(123);
      expect(status).toBe("PROCESSING");
    });

    it("should handle unknown job IDs appropriately", async () => {
      // Mock mode
      const mockSdk = new FabstirSDK({ mode: "mock" });
      await mockSdk.connect(mockProvider);

      await expect(mockSdk.getJobStatus(99999)).rejects.toThrow(
        "Job not found"
      );

      // Production mode
      const prodSdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await prodSdk.connect(productionProvider);

      // Mock P2P client to return null for unknown job
      prodSdk["_p2pClient"].getJobStatus = vi.fn().mockResolvedValue(null);

      await expect(prodSdk.getJobStatus(99999)).rejects.toThrow(
        "Job not found"
      );
    });
  });

  describe("Response Streaming Mode Handling", () => {
    it("should use mock streaming in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });
      await sdk.connect(mockProvider);

      const jobId = await sdk.submitJob({
        prompt: "Test",
        modelId: "llama2-7b",
        maxTokens: 50,
      });

      const stream = sdk.createResponseStream(jobId);

      // Mock mode returns async iterator
      expect(stream[Symbol.asyncIterator]).toBeDefined();

      // Start consuming stream
      const tokens = [];
      const consumePromise = (async () => {
        for await (const token of stream) {
          tokens.push(token);
          if (tokens.length >= 3) break;
        }
      })();

      // Simulate tokens for mock mode
      await sdk._simulateStreamToken(jobId, "Mock ");
      await sdk._simulateStreamToken(jobId, "streaming ");
      await sdk._simulateStreamToken(jobId, "works!");
      await sdk._simulateStatusChange(jobId, JobStatus.COMPLETED);

      await consumePromise;

      expect(tokens.length).toBe(3);
      expect(tokens[0]).toHaveProperty("content");
      expect(tokens[0].content).toBe("Mock ");
    });

    it("should prepare for P2P streaming in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await sdk.connect(productionProvider);

      // Mock P2P client's streaming
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield { content: "Hello", index: 0, timestamp: Date.now() };
          yield { content: " world", index: 1, timestamp: Date.now() };
        },
      };

      sdk["_p2pClient"].createResponseStream = vi
        .fn()
        .mockReturnValue(mockStream);

      const stream = sdk.createResponseStream(123);

      // Collect tokens
      const tokens = [];
      for await (const token of stream) {
        tokens.push(token);
      }

      expect(tokens).toHaveLength(2);
      expect(tokens[0].content).toBe("Hello");
      expect(tokens[1].content).toBe(" world");
    });
  });

  describe("Event Handling Mode Differences", () => {
    it("should emit appropriate events in mock mode", async () => {
      const sdk = new FabstirSDK({ mode: "mock" });

      const connectedSpy = vi.fn();
      const p2pStartedSpy = vi.fn();

      sdk.on("connected", connectedSpy);
      sdk.on("p2p:started", p2pStartedSpy);

      await sdk.connect(mockProvider);

      // Mock mode emits connected but not P2P events
      expect(connectedSpy).toHaveBeenCalled();
      expect(p2pStartedSpy).not.toHaveBeenCalled();
    });

    it("should emit P2P events in production mode", async () => {
      const sdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      const connectedSpy = vi.fn();
      const p2pStartedSpy = vi.fn();

      sdk.on("connected", connectedSpy);
      sdk.on("p2p:started", p2pStartedSpy);

      await sdk.connect(productionProvider);

      // Production mode emits both events
      expect(connectedSpy).toHaveBeenCalled();
      expect(p2pStartedSpy).toHaveBeenCalled();
    });
  });

  describe("Backward Compatibility Verification", () => {
    it("should maintain exact mock behavior for demo", async () => {
      const sdk = new FabstirSDK({
        network: "base-sepolia",
        debug: true,
        // No mode specified - defaults to mock
      });

      await sdk.connect(mockProvider);

      // Submit job
      const jobId = await sdk.submitJob({
        prompt: "Demo test",
        modelId: "llama2-7b",
        maxTokens: 150,
        temperature: 0.7,
      });

      expect(typeof jobId).toBe("number");

      // Get status
      const status = await sdk.getJobStatus(jobId);
      expect(status).toBe("POSTED");

      // Create stream
      const stream = sdk.createResponseStream(jobId);
      expect(stream[Symbol.asyncIterator]).toBeDefined();

      // All demo functionality works unchanged
    });

    it("should not break when switching between modes", () => {
      // Can create SDKs with different modes
      const mockSdk = new FabstirSDK({ mode: "mock" });
      const prodSdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });

      // Both instances work independently
      expect(mockSdk.config.mode).toBe("mock");
      expect(prodSdk.config.mode).toBe("production");

      expect(mockSdk.isP2PEnabled()).toBe(false);
      expect(prodSdk.isP2PEnabled()).toBe(true);
    });
  });

  describe("Error Handling Across Modes", () => {
    it("should handle connection errors consistently", async () => {
      const badProvider = {
        getNetwork: vi.fn().mockRejectedValue(new Error("Network error")),
      };

      // Mock mode
      const mockSdk = new FabstirSDK({ mode: "mock" });
      await expect(mockSdk.connect(badProvider)).rejects.toThrow(
        "Failed to connect"
      );

      // Production mode
      const prodSdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await expect(prodSdk.connect(badProvider)).rejects.toThrow(
        "Failed to connect"
      );
    });

    it("should validate inputs consistently across modes", async () => {
      const testInvalidInput = async (sdk: FabstirSDK) => {
        await sdk.connect(
          sdk.config.mode === "mock" ? mockProvider : productionProvider
        );

        // Invalid model ID
        await expect(
          sdk.submitJob({
            prompt: "Test",
            modelId: "",
            maxTokens: 100,
          })
        ).rejects.toThrow("Invalid model ID");

        // Invalid max tokens
        await expect(
          sdk.submitJob({
            prompt: "Test",
            modelId: "llama2-7b",
            maxTokens: -1,
          })
        ).rejects.toThrow("Max tokens must be positive");
      };

      // Test both modes
      const mockSdk = new FabstirSDK({ mode: "mock" });
      await testInvalidInput(mockSdk);

      const prodSdk = new FabstirSDK({
        mode: "production",
        p2pConfig: {
          bootstrapNodes: ["/ip4/127.0.0.1/tcp/4001/p2p/12D3KooW..."],
        },
      });
      await testInvalidInput(prodSdk);
    });
  });
});
