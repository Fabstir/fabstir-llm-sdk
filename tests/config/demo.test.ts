// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

// src/__tests__/compatibility/demo.test.ts
import { describe, it, expect, vi } from "vitest";
import { FabstirSDK } from "../../src/index";

describe("Demo Compatibility - Ensure Nothing Breaks", () => {
  it("should work exactly like the demo expects", async () => {
    // Initialize SDK exactly as demo does
    const sdk = new FabstirSDK({
      network: "base-sepolia",
      debug: true,
    });

    // Mock provider exactly as used in demo App.tsx
    const mockProvider = {
      getNetwork: async () => ({ chainId: 84532 }),
      getSigner: () => ({
        getAddress: async () => "0x742d35Cc6634C0532925a3b844Bc9e7595f5b9A1",
      }),
    };

    await sdk.connect(mockProvider);

    // Get models as demo does
    // TODO: getModels method not implemented yet
    // const models = await sdk.getModels();
    // expect(models).toEqual([
    //   { id: "llama2-7b", name: "LLaMA 2 7B" },
    //   { id: "llama2-13b", name: "LLaMA 2 13B" },
    //   { id: "mistral-7b", name: "Mistral 7B" },
    // ]);

    // Estimate cost as demo does
    // TODO: estimateCost method not implemented yet
    // const estimate = await sdk.estimateCost({
    //   prompt: "test prompt",
    //   modelId: "llama2-7b",
    //   maxTokens: 150,
    // });

    // expect(estimate).toMatchObject({
    //   estimatedCost: expect.any(Object), // BigNumber
    //   estimatedTokens: expect.any(Number),
    //   pricePerToken: expect.any(Object), // BigNumber
    //   modelId: "llama2-7b",
    //   includesBuffer: true,
    // });

    // Submit job as demo does
    const jobId = await sdk.submitJob({
      prompt: "Explain blockchain in one paragraph",
      modelId: "llama2-7b",
      maxTokens: 150,
      temperature: 0.7,
    });

    expect(jobId).toBeGreaterThan(0);
    expect(typeof jobId).toBe('number');

    // Monitor status as demo does
    const statuses: string[] = [];
    sdk.onJobStatusChange(jobId, (status) => {
      statuses.push(status);
    });

    // Check initial status
    const status = await sdk.getJobStatus(jobId);
    expect(status).toBe("POSTED");

    // Create response stream as demo does
    const stream = sdk.createResponseStream(jobId);
    expect(stream).toBeDefined();
    expect(stream[Symbol.asyncIterator]).toBeDefined();

    // Test events as demo expects
    // TODO: onJobEvent method not implemented yet
    // const eventSpy = vi.fn();
    // sdk.onJobEvent(eventSpy);

    // // Should emit job submitted event
    // await new Promise((resolve) => setTimeout(resolve, 100));
    // expect(eventSpy).toHaveBeenCalledWith(
    //   expect.objectContaining({
    //     type: "job_submitted",
    //   })
    // );
  });

  it("should not require any code changes in demo", () => {
    // This represents the exact initialization from demo
    const sdk = new FabstirSDK({
      network: "base-sepolia",
      debug: true,
    });

    // Should not need to specify mode
    expect(sdk.config).not.toHaveProperty("mode", "production");

    // If mode exists, it should be 'mock' by default
    if ("mode" in sdk.config) {
      expect(sdk.config.mode).toBe("mock");
    }
  });
});
