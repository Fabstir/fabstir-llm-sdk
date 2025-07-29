// tests/test_error_handling.ts
import { describe, it, expect, beforeAll, vi } from "vitest";
import { FabstirSDK, FabstirError, ErrorCode } from "../src";
import { ethers } from "ethers";

describe("Error Handling and Recovery", () => {
  let sdk: FabstirSDK;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
  });

  it("should handle network connection errors", async () => {
    const badProvider = new ethers.providers.JsonRpcProvider(
      "http://invalid:8545"
    );

    await expect(sdk.connect(badProvider)).rejects.toThrow(FabstirError);
  });

  it("should handle insufficient funds error", async () => {
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);

    const expensiveJob = {
      prompt: "Test",
      modelId: "llama2-70b",
      maxTokens: 10000,
      maxPrice: ethers.utils.parseUnits("0.00001", 6), // Too low
    };

    await expect(sdk.submitJob(expensiveJob)).rejects.toMatchObject({
      code: ErrorCode.INSUFFICIENT_FUNDS,
      message: expect.stringContaining("Insufficient"),
    });
  });

  it("should retry failed requests with backoff", async () => {
    let attempts = 0;
    const mockFailingCall = vi.fn(() => {
      attempts++;
      if (attempts < 3) throw new Error("Network error");
      return Promise.resolve("success");
    });

    const result = await sdk.withRetry(mockFailingCall, { maxAttempts: 3 });
    expect(result).toBe("success");
    expect(attempts).toBe(3);
  });

  it("should handle job timeout gracefully", async () => {
    const jobId = 999; // Non-existent job

    await expect(
      sdk.waitForJobCompletion(jobId, { timeout: 1000 })
    ).rejects.toMatchObject({
      code: ErrorCode.TIMEOUT,
      message: expect.stringContaining("timeout"),
    });
  });

  it("should validate input parameters", () => {
    const invalidJob = {
      prompt: "", // Empty prompt
      modelId: "llama2-7b",
      maxTokens: -1, // Invalid token count
    };

    expect(() => sdk.validateJobRequest(invalidJob)).toThrow(
      "Invalid job request"
    );
  });
});
