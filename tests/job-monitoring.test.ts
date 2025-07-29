import { describe, it, expect, beforeAll, vi } from 'vitest';
import { FabstirSDK, JobStatus } from '../src';
import { ethers } from 'ethers';

describe('Job Monitoring and Status Updates', () => {
  let sdk: FabstirSDK;
  let jobId: number;
  
  beforeAll(async () => {
    sdk = new FabstirSDK({ network: 'base-sepolia' });
    
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 84532, name: 'base-sepolia' }),
      getSigner: vi.fn().mockReturnValue({
        getAddress: vi.fn().mockResolvedValue('0x1234567890123456789012345678901234567890')
      })
    };
    
    await sdk.connect(mockProvider as any);
    
    // Submit a test job
    jobId = await sdk.submitJob({
      prompt: 'Test prompt',
      modelId: 'llama2-7b',
      maxTokens: 100,
      temperature: 0.7,
      paymentToken: 'USDC',
      maxPrice: ethers.utils.parseUnits('0.001', 6)
    });
  });

  it('should get job details after submission', async () => {
    const jobDetails = await sdk.getJobDetails(jobId);
    
    expect(jobDetails.id).toBe(jobId);
    expect(jobDetails.status).toBe(JobStatus.POSTED);
    expect(jobDetails.prompt).toBe('Test prompt');
    expect(jobDetails.modelId).toBe('llama2-7b');
    expect(jobDetails.client).toBe('0x1234567890123456789012345678901234567890');
    expect(jobDetails.timestamp).toBeGreaterThan(0);
  });

  it('should get current job status', async () => {
    const status = await sdk.getJobStatus(jobId);
    expect(Object.values(JobStatus)).toContain(status);
  });

  it('should monitor job status changes', async () => {
    const statusUpdates: JobStatus[] = [];
    
    const unsubscribe = sdk.onJobStatusChange(jobId, (status) => {
      statusUpdates.push(status);
    });
    
    // Simulate status changes
    await sdk._simulateStatusChange(jobId, JobStatus.CLAIMED);
    await sdk._simulateStatusChange(jobId, JobStatus.PROCESSING);
    
    expect(statusUpdates).toContain(JobStatus.CLAIMED);
    expect(statusUpdates).toContain(JobStatus.PROCESSING);
    
    unsubscribe();
  });

  it('should stream job events in real-time', async () => {
    const events: any[] = [];
    
    const unsubscribe = sdk.streamJobEvents(jobId, (event) => {
      events.push(event);
    });
    
    // Simulate an event
    await sdk._simulateJobEvent(jobId, {
      type: 'claimed',
      timestamp: Date.now(),
      data: { host: '0x2222222222222222222222222222222222222222' }
    });
    
    expect(events.length).toBe(1);
    expect(events[0].type).toBe('claimed');
    expect(events[0].data.host).toBeDefined();
    
    unsubscribe();
  });

  it('should get job processing host info', async () => {
    // First simulate job being claimed
    await sdk._simulateStatusChange(jobId, JobStatus.CLAIMED);
    await sdk._simulateJobEvent(jobId, {
      type: 'claimed',
      timestamp: Date.now(),
      data: { host: '0x2222222222222222222222222222222222222222' }
    });
    
    const hostInfo = await sdk.getJobHost(jobId);
    expect(hostInfo).toBeDefined();
    expect(hostInfo.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(hostInfo.reputation).toBeGreaterThanOrEqual(0);
    expect(hostInfo.completedJobs).toBeGreaterThanOrEqual(0);
  });

  it('should detect job completion', async () => {
    // Simulate job completion
    await sdk._simulateStatusChange(jobId, JobStatus.COMPLETED);
    
    const completed = await sdk.waitForJobCompletion(jobId, { timeout: 1000 });
    expect(completed).toBe(true);
    
    const finalStatus = await sdk.getJobStatus(jobId);
    expect(finalStatus).toBe(JobStatus.COMPLETED);
  });

  it('should handle timeout when waiting for completion', async () => {
    const newJobId = await sdk.submitJob({
      prompt: 'Another test',
      modelId: 'llama2-7b',
      maxTokens: 100
    });
    
    // Don't complete this job, should timeout
    const completed = await sdk.waitForJobCompletion(newJobId, { timeout: 100 });
    expect(completed).toBe(false);
  });
});
