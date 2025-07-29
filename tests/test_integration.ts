// tests/test_integration.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FabstirSDK } from "../src";
import { ethers } from "ethers";

describe("End-to-End Integration Test", () => {
  let sdk: FabstirSDK;
  let provider: ethers.providers.JsonRpcProvider;
  let signer: ethers.Signer;

  beforeAll(async () => {
    // Setup
    sdk = new FabstirSDK({
      network: "base-sepolia",
      debug: true,
    });

    provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
    signer = provider.getSigner();
    await sdk.connect(provider);

    // Ensure test account has funds
    const balance = await provider.getBalance(await signer.getAddress());
    expect(balance.gt(0)).toBe(true);
  });

  it("should complete full job lifecycle", async () => {
    // 1. Discover available models
    const models = await sdk.listModels();
    expect(models.length).toBeGreaterThan(0);
    const model = models[0];

    // 2. Check node availability
    const nodes = await sdk.discoverNodes(model.id);
    expect(nodes.length).toBeGreaterThan(0);

    // 3. Estimate cost
    const jobRequest = {
      prompt: "Explain blockchain in one paragraph",
      modelId: model.id,
      maxTokens: 150,
      temperature: 0.7,
    };

    const estimate = await sdk.estimateJobCost(jobRequest);
    console.log(
      `Estimated cost: $${ethers.utils.formatUnits(estimate.estimatedCost, 6)}`
    );

    // 4. Approve payment
    const approveTx = await sdk.approvePayment(
      "USDC",
      estimate.estimatedCost.mul(2)
    );
    await approveTx.wait();

    // 5. Submit job
    console.log("Submitting job...");
    const jobId = await sdk.submitJob({
      ...jobRequest,
      paymentToken: "USDC",
      maxPrice: estimate.estimatedCost.mul(2),
    });
    console.log(`Job ID: ${jobId}`);

    // 6. Monitor job progress
    const statusUpdates = [];
    sdk.onJobStatusChange(jobId, (status) => {
      statusUpdates.push(status);
      console.log(`Job status: ${status}`);
    });

    // 7. Stream response
    const response = [];
    const stream = sdk.createResponseStream(jobId);

    console.log("Streaming response:");
    for await (const token of stream) {
      response.push(token.content);
      process.stdout.write(token.content);
    }
    console.log("\n");

    // 8. Get final result
    const result = await sdk.getJobResult(jobId);
    expect(result.response).toBe(response.join(""));
    expect(result.tokensUsed).toBeGreaterThan(0);

    // 9. Verify payment
    const payment = await sdk.getPaymentDetails(jobId);
    console.log(
      `Final cost: $${ethers.utils.formatUnits(payment.amount, 6)} for ${
        result.tokensUsed
      } tokens`
    );
    expect(payment.status).toBe("RELEASED");

    // 10. Check metrics
    const metrics = await sdk.getJobMetrics(jobId);
    console.log(`Performance: ${metrics.tokensPerSecond} tokens/sec`);
    expect(metrics.tokensPerSecond).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await sdk.disconnect();
  });
});
