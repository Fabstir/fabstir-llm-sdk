// tests/test_job_monitoring.ts
import { describe, it, expect, beforeAll } from "vitest";
import { FabstirSDK, JobStatus, JobEvent } from "../src";
import { ethers } from "ethers";

describe("Job Monitoring and Status Updates", () => {
  let sdk: FabstirSDK;
  let jobId: number;

  beforeAll(async () => {
    sdk = new FabstirSDK({ network: "base-sepolia" });
    const provider = new ethers.providers.JsonRpcProvider(
      "http://localhost:8545"
    );
    await sdk.connect(provider);

    // Submit a test job
    jobId = await sdk.submitJob({
      prompt: "Test prompt",
      modelId: "llama2-7b",
      maxTokens: 100,
    });
  });

  it("should monitor job status changes", async () => {
    const statusUpdates: JobStatus[] = [];

    const unsubscribe = sdk.onJobStatusChange(jobId, (status) => {
      statusUpdates.push(status);
    });

    // Wait for status updates
    await new Promise((resolve) => setTimeout(resolve, 5000));

    expect(statusUpdates.length).toBeGreaterThan(0);
    expect(statusUpdates).toContain(JobStatus.CLAIMED);

    unsubscribe();
  });

  it("should stream job events in real-time", async () => {
    const events: JobEvent[] = [];

    const unsubscribe = sdk.streamJobEvents(jobId, (event) => {
      events.push(event);
    });

    await new Promise((resolve) => setTimeout(resolve, 3000));

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBeDefined();
    expect(events[0].timestamp).toBeGreaterThan(0);

    unsubscribe();
  });

  it("should get current job status", async () => {
    const status = await sdk.getJobStatus(jobId);
    expect(Object.values(JobStatus)).toContain(status);
  });

  it("should get job processing host info", async () => {
    // Wait for job to be claimed
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const hostInfo = await sdk.getJobHost(jobId);
    if (hostInfo) {
      expect(hostInfo.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(hostInfo.reputation).toBeGreaterThanOrEqual(0);
      expect(hostInfo.completedJobs).toBeGreaterThanOrEqual(0);
    }
  });

  it("should detect job completion", async () => {
    const completed = await sdk.waitForJobCompletion(jobId, { timeout: 30000 });
    expect(completed).toBe(true);

    const finalStatus = await sdk.getJobStatus(jobId);
    expect(finalStatus).toBe(JobStatus.COMPLETED);
  });
});
