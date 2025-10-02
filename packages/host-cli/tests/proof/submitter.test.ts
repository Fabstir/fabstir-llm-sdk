import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProofSubmitter, ProofData } from '../../src/proof/submitter';
import * as sdkClient from '../../src/sdk/client';

// Mock SDK client module
vi.mock('../../src/sdk/client', () => ({
  getSDK: vi.fn(),
  getSessionManager: vi.fn(),
  authenticateSDK: vi.fn(),
  initializeSDK: vi.fn(),
}));

describe('ProofSubmitter SDK Integration', () => {
  const mockSessionManager = {
    submitCheckpoint: vi.fn(),
  };

  const mockSDK = {
    isAuthenticated: vi.fn(),
  };

  const validProofData: ProofData = {
    sessionId: 'sess_123',
    jobId: BigInt(1),
    tokensClaimed: 100,
    proof: '0x' + '1'.repeat(64),
    timestamp: Date.now(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (sdkClient.getSDK as any).mockReturnValue(mockSDK);
    (sdkClient.getSessionManager as any).mockReturnValue(mockSessionManager);
    mockSDK.isAuthenticated.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call SessionManager.submitCheckpoint() with correct params', async () => {
    const txHash = '0xabcdef1234567890';
    mockSessionManager.submitCheckpoint.mockResolvedValue(txHash);

    const submitter = new ProofSubmitter();
    const result = await submitter.submitProof(validProofData);

    // Verify SessionManager.submitCheckpoint was called
    expect(mockSessionManager.submitCheckpoint).toHaveBeenCalledWith(
      validProofData.jobId,
      {
        checkpoint: 0,
        tokensGenerated: validProofData.tokensClaimed,
        proofData: validProofData.proof,
        timestamp: validProofData.timestamp,
      }
    );

    // Verify result
    expect(result.success).toBe(true);
    expect(result.txHash).toBe(txHash);
  });

  it('should validate proof data structure', async () => {
    const submitter = new ProofSubmitter();

    // Test invalid sessionId
    const invalidSessionId: ProofData = {
      ...validProofData,
      sessionId: '',
    };
    const result1 = await submitter.submitProof(invalidSessionId);
    expect(result1.success).toBe(false);
    expect(result1.error).toBe('Invalid proof data');

    // Test invalid jobId
    const invalidJobId: ProofData = {
      ...validProofData,
      jobId: BigInt(0),
    };
    const result2 = await submitter.submitProof(invalidJobId);
    expect(result2.success).toBe(false);
    expect(result2.error).toBe('Invalid proof data');

    // Test invalid tokensClaimed
    const invalidTokens: ProofData = {
      ...validProofData,
      tokensClaimed: 0,
    };
    const result3 = await submitter.submitProof(invalidTokens);
    expect(result3.success).toBe(false);
    expect(result3.error).toBe('Invalid proof data');

    // Test invalid proof (no 0x prefix)
    const invalidProof: ProofData = {
      ...validProofData,
      proof: '1234567890',
    };
    const result4 = await submitter.submitProof(invalidProof);
    expect(result4.success).toBe(false);
    expect(result4.error).toBe('Invalid proof data');
  });

  it('should validate proof hash format (0x + 64 hex chars)', async () => {
    const submitter = new ProofSubmitter();

    // Valid hash
    const validHash = '0x' + 'a'.repeat(64);
    expect(submitter.isValidProofHash(validHash)).toBe(true);

    // Invalid: no 0x prefix
    expect(submitter.isValidProofHash('a'.repeat(64))).toBe(false);

    // Invalid: wrong length
    expect(submitter.isValidProofHash('0x' + 'a'.repeat(63))).toBe(false);
    expect(submitter.isValidProofHash('0x' + 'a'.repeat(65))).toBe(false);

    // Invalid: non-hex characters
    expect(submitter.isValidProofHash('0x' + 'z'.repeat(64))).toBe(false);
  });

  it('should emit proof-submitted event on success', async () => {
    const txHash = '0xabcdef1234567890';
    mockSessionManager.submitCheckpoint.mockResolvedValue(txHash);

    const submitter = new ProofSubmitter();

    // Set up event listener
    let emittedData: any;
    submitter.on('proof-submitted', (data) => {
      emittedData = data;
    });

    await submitter.submitProof(validProofData);

    // Verify event was emitted
    expect(emittedData).toBeDefined();
    expect(emittedData.proofData).toEqual(validProofData);
    expect(emittedData.txHash).toBe(txHash);
    expect(emittedData.timestamp).toBeDefined();
  });

  it('should emit proof-failed event on failure', async () => {
    const errorMessage = 'SDK submission failed';
    mockSessionManager.submitCheckpoint.mockRejectedValue(new Error(errorMessage));

    const submitter = new ProofSubmitter();

    // Set up event listener
    let emittedData: any;
    submitter.on('proof-failed', (data) => {
      emittedData = data;
    });

    const result = await submitter.submitProof(validProofData);

    // Verify event was emitted
    expect(emittedData).toBeDefined();
    expect(emittedData.proofData).toEqual(validProofData);
    expect(emittedData.error).toContain(errorMessage);
    expect(emittedData.timestamp).toBeDefined();

    // Verify result
    expect(result.success).toBe(false);
    expect(result.error).toContain(errorMessage);
  });

  it('should update statistics on success/failure', async () => {
    const submitter = new ProofSubmitter();

    // Initial statistics
    let stats = submitter.getStatistics();
    expect(stats.totalSubmissions).toBe(0);
    expect(stats.successfulSubmissions).toBe(0);
    expect(stats.failedSubmissions).toBe(0);

    // Successful submission
    mockSessionManager.submitCheckpoint.mockResolvedValue('0xabc123');
    await submitter.submitProof(validProofData);

    stats = submitter.getStatistics();
    expect(stats.totalSubmissions).toBe(1);
    expect(stats.successfulSubmissions).toBe(1);
    expect(stats.failedSubmissions).toBe(0);
    expect(stats.totalTokensClaimed).toBe(validProofData.tokensClaimed);
    expect(stats.successRate).toBe(1);

    // Failed submission
    mockSessionManager.submitCheckpoint.mockRejectedValue(new Error('Failed'));
    await submitter.submitProof(validProofData);

    stats = submitter.getStatistics();
    expect(stats.totalSubmissions).toBe(2);
    expect(stats.successfulSubmissions).toBe(1);
    expect(stats.failedSubmissions).toBe(1);
    expect(stats.successRate).toBe(0.5);
  });

  it('should wait for confirmations in submitProofWithConfirmation()', async () => {
    const txHash = '0xabcdef1234567890';
    const blockNumber = 1000;

    // Mock submitCheckpoint to return tx hash
    mockSessionManager.submitCheckpoint.mockResolvedValue(txHash);

    const submitter = new ProofSubmitter();
    const result = await submitter.submitProofWithConfirmation(validProofData, 3);

    // Verify SessionManager.submitCheckpoint was called
    expect(mockSessionManager.submitCheckpoint).toHaveBeenCalled();

    // Verify result includes confirmation details
    expect(result.success).toBe(true);
    expect(result.txHash).toBe(txHash);
    expect(result.confirmed).toBe(true);
    // Note: blockNumber will be mocked in implementation
  });

  it('should require authenticated SDK', async () => {
    // Mock SDK as not authenticated
    mockSDK.isAuthenticated.mockReturnValue(false);

    const submitter = new ProofSubmitter();
    const result = await submitter.submitProof(validProofData);

    // Verify submission failed due to authentication
    expect(result.success).toBe(false);
    expect(result.error).toContain('SDK not authenticated');

    // Verify SessionManager.submitCheckpoint was NOT called
    expect(mockSessionManager.submitCheckpoint).not.toHaveBeenCalled();
  });
});
