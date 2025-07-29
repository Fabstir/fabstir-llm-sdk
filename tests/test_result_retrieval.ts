import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, JobResult } from "../src";
import { ethers } from "ethers";

describe("Result Retrieval and Streaming", () => {
  let sdk: FabstirSDK;
  let completedJobId: number;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);

    // Assume we have a completed job
    completedJobId = 1;
  });

  it("should retrieve job result from chain/IPFS", async () => {
    const result = await sdk.getJobResult(completedJobId);

    expect(result).toBeDefined();
    expect(result.response).toBeDefined();
    expect(result.tokensUsed).toBeGreaterThan(0);
    expect(result.completionTime).toBeGreaterThan(0);
  });

  it("should stream response tokens in real-time", async () => {
    const tokens: string[] = [];

    await sdk.streamJobResponse(completedJobId, (token) => {
      tokens.push(token);
    });

    expect(tokens.length).toBeGreaterThan(0);
    expect(tokens.join("")).toContain("blockchain");
  });

  it("should get result metadata", async () => {
    const metadata = await sdk.getResultMetadata(completedJobId);

    expect(metadata.model).toBe("llama2-7b");
    expect(metadata.temperature).toBe(0.7);
    expect(metadata.inferenceTime).toBeGreaterThan(0);
    expect(metadata.tokensPerSecond).toBeGreaterThan(0);
  });

  it("should verify result proof if available", async () => {
    const proofValid = await sdk.verifyResultProof(completedJobId);
    expect(typeof proofValid).toBe("boolean");
  });

  it("should handle missing results gracefully", async () => {
    const invalidJobId = 99999;

    await expect(sdk.getJobResult(invalidJobId)).rejects.toThrow(
      "Job result not found"
    );
  });
});
