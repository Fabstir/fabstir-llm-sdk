// tests/test_streaming.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, StreamOptions } from "../src";

describe("Real-time Streaming Support", () => {
  let sdk: FabstirSDK;
  let activeJobId: number;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);

    // Submit a job for streaming tests
    activeJobId = await sdk.submitJob({
      prompt: "Write a story about a robot",
      modelId: "llama2-7b",
      maxTokens: 200,
    });
  });

  it("should stream tokens as they are generated", async () => {
    const tokens: string[] = [];
    const timestamps: number[] = [];

    const stream = sdk.createResponseStream(activeJobId);

    for await (const token of stream) {
      tokens.push(token.content);
      timestamps.push(token.timestamp);

      if (tokens.length >= 10) break; // Test first 10 tokens
    }

    expect(tokens.length).toBeGreaterThanOrEqual(10);
    expect(tokens.join("")).toContain(" "); // Should contain spaces

    // Check timestamps are increasing
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
    }
  });

  it("should support stream configuration", async () => {
    const options: StreamOptions = {
      bufferSize: 5,
      flushInterval: 100,
      includeMetadata: true,
    };

    const stream = sdk.createResponseStream(activeJobId, options);
    const chunks = [];

    for await (const chunk of stream) {
      chunks.push(chunk);
      if (chunks.length >= 3) break;
    }

    expect(chunks[0].metadata).toBeDefined();
    expect(chunks[0].metadata.modelId).toBe("llama2-7b");
  });

  it("should handle stream interruption", async () => {
    const stream = sdk.createResponseStream(activeJobId);
    const controller = new AbortController();

    setTimeout(() => controller.abort(), 500);

    const tokens = [];
    try {
      for await (const token of stream.withSignal(controller.signal)) {
        tokens.push(token);
      }
    } catch (error) {
      expect(error.name).toBe("AbortError");
    }

    expect(tokens.length).toBeGreaterThan(0);
  });

  it("should reconnect to ongoing stream", async () => {
    // First connection
    const stream1 = sdk.createResponseStream(activeJobId);
    const tokens1 = [];

    for await (const token of stream1) {
      tokens1.push(token);
      if (tokens1.length >= 5) break;
    }

    // Reconnect from where we left off
    const stream2 = sdk.createResponseStream(activeJobId, {
      resumeFrom: tokens1.length,
    });

    const tokens2 = [];
    for await (const token of stream2) {
      tokens2.push(token);
      if (tokens2.length >= 5) break;
    }

    // Should not have duplicates
    expect(tokens2[0]).not.toBe(tokens1[tokens1.length - 1]);
  });
});
