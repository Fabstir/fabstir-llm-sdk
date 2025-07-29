// tests/test_job_submission.ts
import { describe, it, expect, beforeAll } from "@jest/globals";
import { FabstirSDK, JobRequest, JobStatus } from "../src";
import { ethers } from "ethers";

describe("Job Submission Flow", () => {
  let sdk: FabstirSDK;
  let signer: ethers.Signer;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    signer = provider.getSigner();
    await sdk.connect(provider);
  });

  it("should create a job request object", () => {
    const jobRequest: JobRequest = {
      prompt: "Explain blockchain in one paragraph",
      modelId: "llama2-7b",
      maxTokens: 150,
      temperature: 0.7,
      paymentToken: "USDC",
      maxPrice: ethers.utils.parseUnits("0.001", 6), // $0.001 USDC
    };

    expect(jobRequest.prompt).toBeDefined();
    expect(jobRequest.modelId).toBe("llama2-7b");
  });

  it("should estimate job cost before submission", async () => {
    const jobRequest: JobRequest = {
      prompt: "Explain blockchain in one paragraph",
      modelId: "llama2-7b",
      maxTokens: 150,
    };

    const estimate = await sdk.estimateJobCost(jobRequest);
    expect(estimate.estimatedCost).toBeGreaterThan(0);
    expect(estimate.estimatedTokens).toBeGreaterThan(0);
    expect(estimate.pricePerToken).toBeGreaterThan(0);
  });

  it("should approve token spending for payment", async () => {
    const amount = ethers.utils.parseUnits("1", 6); // 1 USDC
    const tx = await sdk.approvePayment("USDC", amount);
    expect(tx.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);

    const receipt = await tx.wait();
    expect(receipt.status).toBe(1);
  });

  it("should submit job to marketplace", async () => {
    const jobRequest: JobRequest = {
      prompt: "Explain blockchain in one paragraph",
      modelId: "llama2-7b",
      maxTokens: 150,
      temperature: 0.7,
      paymentToken: "USDC",
      maxPrice: ethers.utils.parseUnits("0.001", 6),
    };

    const jobId = await sdk.submitJob(jobRequest);
    expect(jobId).toBeGreaterThan(0);
    expect(typeof jobId).toBe("number");
  });

  it("should get job details after submission", async () => {
    const jobId = 1;
    const jobDetails = await sdk.getJobDetails(jobId);

    expect(jobDetails.id).toBe(jobId);
    expect(jobDetails.status).toBe(JobStatus.POSTED);
    expect(jobDetails.prompt).toBeDefined();
    expect(jobDetails.client).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(jobDetails.timestamp).toBeGreaterThan(0);
  });
});
