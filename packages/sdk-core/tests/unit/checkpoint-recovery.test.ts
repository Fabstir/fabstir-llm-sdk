/**
 * Tests for checkpoint recovery utilities
 * Phase 3: Recovery Logic Implementation
 *
 * These tests verify that the SDK can recover conversation state
 * from node-published checkpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CheckpointIndex, CheckpointDelta, CheckpointIndexEntry } from '../../src/types';

/**
 * Sub-phase 3.1: Fetch Checkpoint Index Tests
 *
 * Tests for fetching checkpoint index from S5 storage.
 */
describe('Fetch Checkpoint Index', () => {
  // Mock S5 client
  let mockS5Client: {
    fs: {
      get: ReturnType<typeof vi.fn>;
    };
  };

  // Mock StorageManager
  let mockStorageManager: {
    getS5Client: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockS5Client = {
      fs: {
        get: vi.fn(),
      },
    };

    mockStorageManager = {
      getS5Client: vi.fn().mockReturnValue(mockS5Client),
      isInitialized: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when no index exists', async () => {
    // Arrange: S5 returns null (file not found)
    mockS5Client.fs.get.mockResolvedValue(null);

    // Act: Import and test the fetch function
    const { fetchCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    const result = await fetchCheckpointIndex(
      mockStorageManager as any,
      '0x1234567890123456789012345678901234567890',
      '123'
    );

    // Assert
    expect(result).toBeNull();
    expect(mockS5Client.fs.get).toHaveBeenCalledWith(
      'home/checkpoints/0x1234567890123456789012345678901234567890/123/index.json'
    );
  });

  it('should return parsed CheckpointIndex on success', async () => {
    // Arrange: S5 returns valid index
    const validIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: '0x1234567890123456789012345678901234567890',
      checkpoints: [
        {
          index: 0,
          proofHash: '0xabc123',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: Date.now(),
        },
      ],
      hostSignature: '0xsig123',
    };
    mockS5Client.fs.get.mockResolvedValue(validIndex);

    // Act
    const { fetchCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    const result = await fetchCheckpointIndex(
      mockStorageManager as any,
      '0x1234567890123456789012345678901234567890',
      '123'
    );

    // Assert
    expect(result).toEqual(validIndex);
    expect(result?.sessionId).toBe('123');
    expect(result?.checkpoints).toHaveLength(1);
    expect(result?.checkpoints[0].proofHash).toBe('0xabc123');
  });

  it('should construct correct S5 path', async () => {
    // Arrange
    mockS5Client.fs.get.mockResolvedValue(null);
    const hostAddress = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
    const sessionId = '456';

    // Act
    const { fetchCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    await fetchCheckpointIndex(mockStorageManager as any, hostAddress, sessionId);

    // Assert: Verify lowercase normalization of address
    expect(mockS5Client.fs.get).toHaveBeenCalledWith(
      'home/checkpoints/0xabcdef1234567890abcdef1234567890abcdef12/456/index.json'
    );
  });

  it('should throw on malformed JSON response', async () => {
    // Arrange: S5 returns invalid structure
    const malformedData = {
      // Missing required fields
      sessionId: '123',
      // hostAddress, checkpoints, hostSignature missing
    };
    mockS5Client.fs.get.mockResolvedValue(malformedData);

    // Act & Assert
    const { fetchCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      fetchCheckpointIndex(
        mockStorageManager as any,
        '0x1234567890123456789012345678901234567890',
        '123'
      )
    ).rejects.toThrow('Invalid checkpoint index structure');
  });
});

/**
 * Sub-phase 3.2: Verify Checkpoint Index Tests
 *
 * Tests for verifying checkpoint index signature and on-chain proof hashes.
 */
describe('Verify Checkpoint Index', () => {
  // Mock contract for on-chain queries
  let mockContract: {
    getProofSubmission: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockContract = {
      getProofSubmission: vi.fn(),
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for valid index with matching proofs', async () => {
    // Arrange: Create valid index with matching on-chain proofs
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    const validIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: testHostAddress,
      checkpoints: [
        {
          index: 0,
          proofHash: '0xabc1234567890000000000000000000000000000000000000000000000000000',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: Date.now(),
        },
      ],
      hostSignature: '0x1234', // Will be verified by mock
    };

    // Mock on-chain proof query
    mockContract.getProofSubmission.mockResolvedValue({
      proofHash: '0xabc1234567890000000000000000000000000000000000000000000000000000',
      tokensClaimed: 1000n,
      timestamp: BigInt(Date.now()),
      verified: true,
    });

    // Act
    const { verifyCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    const result = await verifyCheckpointIndex(
      validIndex,
      BigInt(123),
      mockContract as any,
      testHostAddress, // Use the same address that will be recovered
    );

    // Assert
    expect(result).toBe(true);
    expect(mockContract.getProofSubmission).toHaveBeenCalledWith(BigInt(123), 0);
  });

  it('should throw INVALID_INDEX_SIGNATURE on invalid signature', async () => {
    // Arrange: Index with invalid signature
    const invalidIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: '0x1234567890123456789012345678901234567890',
      checkpoints: [],
      hostSignature: '0xinvalid', // Invalid signature
    };

    // Act & Assert
    const { verifyCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      verifyCheckpointIndex(
        invalidIndex,
        BigInt(123),
        mockContract as any,
        '0xDifferentAddress12345678901234567890abcd', // Mismatch address
      )
    ).rejects.toThrow('INVALID_INDEX_SIGNATURE');
  });

  it('should throw PROOF_HASH_MISMATCH when on-chain hash differs', async () => {
    // Arrange: Checkpoint proofHash doesn't match on-chain
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    const mismatchIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: testHostAddress,
      checkpoints: [
        {
          index: 0,
          proofHash: '0xabc1234567890000000000000000000000000000000000000000000000000000',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: Date.now(),
        },
      ],
      hostSignature: '0x1234',
    };

    // Mock on-chain returns DIFFERENT proofHash
    mockContract.getProofSubmission.mockResolvedValue({
      proofHash: '0xDIFFERENT_HASH_0000000000000000000000000000000000000000000000000',
      tokensClaimed: 1000n,
      timestamp: BigInt(Date.now()),
      verified: true,
    });

    // Act & Assert
    const { verifyCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      verifyCheckpointIndex(
        mismatchIndex,
        BigInt(123),
        mockContract as any,
        testHostAddress,
      )
    ).rejects.toThrow('PROOF_HASH_MISMATCH');
  });

  it('should query on-chain proofs correctly for multiple checkpoints', async () => {
    // Arrange
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    const multiIndex: CheckpointIndex = {
      sessionId: '456',
      hostAddress: testHostAddress,
      checkpoints: [
        {
          index: 0,
          proofHash: '0x0000000000000000000000000000000000000000000000000000000000000001',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: 1000,
        },
        {
          index: 1,
          proofHash: '0x0000000000000000000000000000000000000000000000000000000000000002',
          deltaCID: 's5://delta2',
          tokenRange: [1000, 2000] as [number, number],
          timestamp: 2000,
        },
        {
          index: 2,
          proofHash: '0x0000000000000000000000000000000000000000000000000000000000000003',
          deltaCID: 's5://delta3',
          tokenRange: [2000, 3000] as [number, number],
          timestamp: 3000,
        },
      ],
      hostSignature: '0x1234',
    };

    // Mock on-chain returns matching proofHashes
    mockContract.getProofSubmission
      .mockResolvedValueOnce({ proofHash: '0x0000000000000000000000000000000000000000000000000000000000000001', tokensClaimed: 1000n, timestamp: 1000n, verified: true })
      .mockResolvedValueOnce({ proofHash: '0x0000000000000000000000000000000000000000000000000000000000000002', tokensClaimed: 1000n, timestamp: 2000n, verified: true })
      .mockResolvedValueOnce({ proofHash: '0x0000000000000000000000000000000000000000000000000000000000000003', tokensClaimed: 1000n, timestamp: 3000n, verified: true });

    // Act
    const { verifyCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    await verifyCheckpointIndex(multiIndex, BigInt(456), mockContract as any, testHostAddress);

    // Assert: Verify all proofs were queried
    expect(mockContract.getProofSubmission).toHaveBeenCalledTimes(3);
    expect(mockContract.getProofSubmission).toHaveBeenCalledWith(BigInt(456), 0);
    expect(mockContract.getProofSubmission).toHaveBeenCalledWith(BigInt(456), 1);
    expect(mockContract.getProofSubmission).toHaveBeenCalledWith(BigInt(456), 2);
  });

  it('should return true for empty checkpoints array', async () => {
    // Arrange: Valid index with no checkpoints
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    const emptyIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: testHostAddress,
      checkpoints: [],
      hostSignature: '0x1234',
    };

    // Act
    const { verifyCheckpointIndex } = await import('../../src/utils/checkpoint-recovery');
    const result = await verifyCheckpointIndex(
      emptyIndex,
      BigInt(123),
      mockContract as any,
      testHostAddress,
    );

    // Assert: Should pass without querying anything
    expect(result).toBe(true);
    expect(mockContract.getProofSubmission).not.toHaveBeenCalled();
  });
});

/**
 * Sub-phase 3.3: Fetch and Verify Deltas Tests
 *
 * Tests for fetching and verifying checkpoint deltas from S5.
 */
describe('Fetch and Verify Deltas', () => {
  // Mock S5 client
  let mockS5Client: {
    fs: {
      get: ReturnType<typeof vi.fn>;
    };
  };

  // Mock StorageManager
  let mockStorageManager: {
    getS5Client: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockS5Client = {
      fs: {
        get: vi.fn(),
      },
    };

    mockStorageManager = {
      getS5Client: vi.fn().mockReturnValue(mockS5Client),
      isInitialized: vi.fn().mockReturnValue(true),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return delta on valid structure and matching host', async () => {
    // Arrange: S5 returns valid delta
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    const validDelta: CheckpointDelta = {
      sessionId: '123',
      checkpointIndex: 0,
      proofHash: '0xabc123',
      startToken: 0,
      endToken: 1000,
      messages: [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi there!', timestamp: 2000 },
      ],
      hostSignature: '0xsig123',
    };
    mockS5Client.fs.get.mockResolvedValue(validDelta);

    // Act
    const { fetchAndVerifyDelta } = await import('../../src/utils/checkpoint-recovery');
    const result = await fetchAndVerifyDelta(
      mockStorageManager as any,
      's5://delta1',
      testHostAddress
    );

    // Assert
    expect(result).toEqual(validDelta);
    expect(result.messages).toHaveLength(2);
    expect(result.checkpointIndex).toBe(0);
  });

  it('should throw INVALID_DELTA_SIGNATURE when host signature mismatch', async () => {
    // Arrange: Delta with mismatched host signature indicator
    // In this implementation, we verify by checking hostSignature is present
    // and that the delta structure is valid
    const invalidDelta = {
      sessionId: '123',
      checkpointIndex: 0,
      proofHash: '0xabc123',
      startToken: 0,
      endToken: 1000,
      messages: [],
      hostSignature: '', // Empty signature should be invalid
    };
    mockS5Client.fs.get.mockResolvedValue(invalidDelta);

    // Act & Assert
    const { fetchAndVerifyDelta } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      fetchAndVerifyDelta(
        mockStorageManager as any,
        's5://delta1',
        '0x1234567890123456789012345678901234567890'
      )
    ).rejects.toThrow('INVALID_DELTA_SIGNATURE');
  });

  it('should throw DELTA_FETCH_FAILED on S5 fetch failure', async () => {
    // Arrange: S5 throws an error
    mockS5Client.fs.get.mockRejectedValue(new Error('Network error'));

    // Act & Assert
    const { fetchAndVerifyDelta } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      fetchAndVerifyDelta(
        mockStorageManager as any,
        's5://delta1',
        '0x1234567890123456789012345678901234567890'
      )
    ).rejects.toThrow('DELTA_FETCH_FAILED');
  });

  it('should throw INVALID_DELTA_STRUCTURE for malformed delta', async () => {
    // Arrange: S5 returns incomplete structure
    const malformedDelta = {
      sessionId: '123',
      // Missing required fields: checkpointIndex, proofHash, startToken, endToken, messages, hostSignature
    };
    mockS5Client.fs.get.mockResolvedValue(malformedDelta);

    // Act & Assert
    const { fetchAndVerifyDelta } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      fetchAndVerifyDelta(
        mockStorageManager as any,
        's5://delta1',
        '0x1234567890123456789012345678901234567890'
      )
    ).rejects.toThrow('INVALID_DELTA_STRUCTURE');
  });
});

/**
 * Sub-phase 3.4: Merge Deltas into Conversation Tests
 *
 * Tests for merging multiple deltas into a single conversation.
 */
describe('Merge Deltas into Conversation', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should combine messages from multiple deltas in order', async () => {
    // Arrange: Multiple deltas with different messages
    const deltas: CheckpointDelta[] = [
      {
        sessionId: '123',
        checkpointIndex: 0,
        proofHash: '0x001',
        startToken: 0,
        endToken: 1000,
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'assistant', content: 'Hi there!', timestamp: 2000 },
        ],
        hostSignature: '0xsig1',
      },
      {
        sessionId: '123',
        checkpointIndex: 1,
        proofHash: '0x002',
        startToken: 1000,
        endToken: 2000,
        messages: [
          { role: 'user', content: 'How are you?', timestamp: 3000 },
          { role: 'assistant', content: 'I am doing well!', timestamp: 4000 },
        ],
        hostSignature: '0xsig2',
      },
    ];

    // Act
    const { mergeDeltas } = await import('../../src/utils/checkpoint-recovery');
    const result = mergeDeltas(deltas);

    // Assert: Messages should be combined in order
    expect(result.messages).toHaveLength(4);
    expect(result.messages[0].content).toBe('Hello');
    expect(result.messages[1].content).toBe('Hi there!');
    expect(result.messages[2].content).toBe('How are you?');
    expect(result.messages[3].content).toBe('I am doing well!');
    expect(result.tokenCount).toBe(2000);
  });

  it('should concatenate partial assistant messages', async () => {
    // Arrange: Deltas where assistant message is split across checkpoints
    const deltas: CheckpointDelta[] = [
      {
        sessionId: '123',
        checkpointIndex: 0,
        proofHash: '0x001',
        startToken: 0,
        endToken: 1000,
        messages: [
          { role: 'user', content: 'Tell me a story', timestamp: 1000 },
          { role: 'assistant', content: 'Once upon a time,', timestamp: 2000, metadata: { partial: true } },
        ],
        hostSignature: '0xsig1',
      },
      {
        sessionId: '123',
        checkpointIndex: 1,
        proofHash: '0x002',
        startToken: 1000,
        endToken: 2000,
        messages: [
          { role: 'assistant', content: ' there was a brave knight', timestamp: 3000, metadata: { partial: true } },
        ],
        hostSignature: '0xsig2',
      },
      {
        sessionId: '123',
        checkpointIndex: 2,
        proofHash: '0x003',
        startToken: 2000,
        endToken: 3000,
        messages: [
          { role: 'assistant', content: ' who lived in a castle.', timestamp: 4000 },
        ],
        hostSignature: '0xsig3',
      },
    ];

    // Act
    const { mergeDeltas } = await import('../../src/utils/checkpoint-recovery');
    const result = mergeDeltas(deltas);

    // Assert: Assistant messages should be concatenated
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe('Tell me a story');
    expect(result.messages[1].content).toBe('Once upon a time, there was a brave knight who lived in a castle.');
    expect(result.tokenCount).toBe(3000);
  });

  it('should handle single delta (no merge needed)', async () => {
    // Arrange: Single delta
    const deltas: CheckpointDelta[] = [
      {
        sessionId: '123',
        checkpointIndex: 0,
        proofHash: '0x001',
        startToken: 0,
        endToken: 1000,
        messages: [
          { role: 'user', content: 'Hello', timestamp: 1000 },
          { role: 'assistant', content: 'Hi!', timestamp: 2000 },
        ],
        hostSignature: '0xsig1',
      },
    ];

    // Act
    const { mergeDeltas } = await import('../../src/utils/checkpoint-recovery');
    const result = mergeDeltas(deltas);

    // Assert
    expect(result.messages).toHaveLength(2);
    expect(result.tokenCount).toBe(1000);
  });

  it('should return correct total token count', async () => {
    // Arrange: Multiple deltas with specific token ranges
    const deltas: CheckpointDelta[] = [
      {
        sessionId: '123',
        checkpointIndex: 0,
        proofHash: '0x001',
        startToken: 0,
        endToken: 1500,
        messages: [{ role: 'user', content: 'First message', timestamp: 1000 }],
        hostSignature: '0xsig1',
      },
      {
        sessionId: '123',
        checkpointIndex: 1,
        proofHash: '0x002',
        startToken: 1500,
        endToken: 3200,
        messages: [{ role: 'assistant', content: 'Response', timestamp: 2000 }],
        hostSignature: '0xsig2',
      },
    ];

    // Act
    const { mergeDeltas } = await import('../../src/utils/checkpoint-recovery');
    const result = mergeDeltas(deltas);

    // Assert: Token count should be from the last delta's endToken
    expect(result.tokenCount).toBe(3200);
  });
});

/**
 * Sub-phase 3.5: Recover From Checkpoints Tests
 *
 * Tests for the full recovery flow that combines all components.
 */
describe('Recover From Checkpoints (Full Flow)', () => {
  // Mock S5 client
  let mockS5Client: {
    fs: {
      get: ReturnType<typeof vi.fn>;
      put: ReturnType<typeof vi.fn>;
    };
  };

  // Mock StorageManager
  let mockStorageManager: {
    getS5Client: ReturnType<typeof vi.fn>;
    isInitialized: ReturnType<typeof vi.fn>;
    saveConversation: ReturnType<typeof vi.fn>;
  };

  // Mock contract
  let mockContract: {
    getProofSubmission: ReturnType<typeof vi.fn>;
  };

  // Mock session info
  let mockGetSessionInfo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockS5Client = {
      fs: {
        get: vi.fn(),
        put: vi.fn(),
      },
    };

    mockStorageManager = {
      getS5Client: vi.fn().mockReturnValue(mockS5Client),
      isInitialized: vi.fn().mockReturnValue(true),
      saveConversation: vi.fn().mockResolvedValue('cid123'),
    };

    mockContract = {
      getProofSubmission: vi.fn(),
    };

    mockGetSessionInfo = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty when no checkpoints exist', async () => {
    // Arrange: Session exists but no checkpoint index
    mockGetSessionInfo.mockResolvedValue({
      hostAddress: '0x1234567890123456789012345678901234567890',
      status: 'active',
    });
    mockS5Client.fs.get.mockResolvedValue(null); // No index

    // Act
    const { recoverFromCheckpointsFlow } = await import('../../src/utils/checkpoint-recovery');
    const result = await recoverFromCheckpointsFlow(
      mockStorageManager as any,
      mockContract as any,
      mockGetSessionInfo,
      BigInt(123)
    );

    // Assert
    expect(result.messages).toHaveLength(0);
    expect(result.tokenCount).toBe(0);
    expect(result.checkpoints).toHaveLength(0);
  });

  it('should return recovered conversation on success', async () => {
    // Arrange
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    mockGetSessionInfo.mockResolvedValue({
      hostAddress: testHostAddress,
      status: 'active',
    });

    // Mock checkpoint index
    const checkpointIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: testHostAddress,
      checkpoints: [
        {
          index: 0,
          proofHash: '0xproof1',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: 1000,
        },
      ],
      hostSignature: '0xsig',
    };

    // Mock delta
    const delta: CheckpointDelta = {
      sessionId: '123',
      checkpointIndex: 0,
      proofHash: '0xproof1',
      startToken: 0,
      endToken: 1000,
      messages: [
        { role: 'user', content: 'Hello', timestamp: 1000 },
        { role: 'assistant', content: 'Hi!', timestamp: 2000 },
      ],
      hostSignature: '0xdeltasig',
    };

    // Mock S5 responses
    mockS5Client.fs.get
      .mockResolvedValueOnce(checkpointIndex) // Index fetch
      .mockResolvedValueOnce(delta); // Delta fetch

    // Mock on-chain proof
    mockContract.getProofSubmission.mockResolvedValue({
      proofHash: '0xproof1',
      tokensClaimed: 1000n,
      timestamp: 1000n,
      verified: true,
    });

    // Act
    const { recoverFromCheckpointsFlow } = await import('../../src/utils/checkpoint-recovery');
    const result = await recoverFromCheckpointsFlow(
      mockStorageManager as any,
      mockContract as any,
      mockGetSessionInfo,
      BigInt(123)
    );

    // Assert
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].content).toBe('Hello');
    expect(result.messages[1].content).toBe('Hi!');
    expect(result.tokenCount).toBe(1000);
    expect(result.checkpoints).toHaveLength(1);
  });

  it('should throw SESSION_NOT_FOUND when session not found', async () => {
    // Arrange: No session
    mockGetSessionInfo.mockResolvedValue(null);

    // Act & Assert
    const { recoverFromCheckpointsFlow } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      recoverFromCheckpointsFlow(
        mockStorageManager as any,
        mockContract as any,
        mockGetSessionInfo,
        BigInt(123)
      )
    ).rejects.toThrow('SESSION_NOT_FOUND');
  });

  it('should propagate verification errors', async () => {
    // Arrange
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    mockGetSessionInfo.mockResolvedValue({
      hostAddress: testHostAddress,
      status: 'active',
    });

    // Mock checkpoint index with different host
    const checkpointIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: '0xDIFFERENT_HOST_ADDRESS_1234567890ABCDEF12', // Mismatch
      checkpoints: [],
      hostSignature: '0xsig',
    };

    mockS5Client.fs.get.mockResolvedValueOnce(checkpointIndex);

    // Act & Assert
    const { recoverFromCheckpointsFlow } = await import('../../src/utils/checkpoint-recovery');
    await expect(
      recoverFromCheckpointsFlow(
        mockStorageManager as any,
        mockContract as any,
        mockGetSessionInfo,
        BigInt(123)
      )
    ).rejects.toThrow('INVALID_INDEX_SIGNATURE');
  });

  it('should include checkpoint metadata in result', async () => {
    // Arrange
    const testHostAddress = '0x1234567890123456789012345678901234567890';
    mockGetSessionInfo.mockResolvedValue({
      hostAddress: testHostAddress,
      status: 'active',
    });

    // Mock checkpoint index with multiple checkpoints
    const checkpointIndex: CheckpointIndex = {
      sessionId: '123',
      hostAddress: testHostAddress,
      checkpoints: [
        {
          index: 0,
          proofHash: '0xproof1',
          deltaCID: 's5://delta1',
          tokenRange: [0, 1000] as [number, number],
          timestamp: 1000,
        },
        {
          index: 1,
          proofHash: '0xproof2',
          deltaCID: 's5://delta2',
          tokenRange: [1000, 2000] as [number, number],
          timestamp: 2000,
        },
      ],
      hostSignature: '0xsig',
    };

    // Mock deltas
    const delta1: CheckpointDelta = {
      sessionId: '123',
      checkpointIndex: 0,
      proofHash: '0xproof1',
      startToken: 0,
      endToken: 1000,
      messages: [{ role: 'user', content: 'Hello', timestamp: 1000 }],
      hostSignature: '0xsig1',
    };

    const delta2: CheckpointDelta = {
      sessionId: '123',
      checkpointIndex: 1,
      proofHash: '0xproof2',
      startToken: 1000,
      endToken: 2000,
      messages: [{ role: 'assistant', content: 'Hi!', timestamp: 2000 }],
      hostSignature: '0xsig2',
    };

    // Mock S5 responses in order
    mockS5Client.fs.get
      .mockResolvedValueOnce(checkpointIndex)
      .mockResolvedValueOnce(delta1)
      .mockResolvedValueOnce(delta2);

    // Mock on-chain proofs
    mockContract.getProofSubmission
      .mockResolvedValueOnce({ proofHash: '0xproof1', tokensClaimed: 1000n, timestamp: 1000n, verified: true })
      .mockResolvedValueOnce({ proofHash: '0xproof2', tokensClaimed: 1000n, timestamp: 2000n, verified: true });

    // Act
    const { recoverFromCheckpointsFlow } = await import('../../src/utils/checkpoint-recovery');
    const result = await recoverFromCheckpointsFlow(
      mockStorageManager as any,
      mockContract as any,
      mockGetSessionInfo,
      BigInt(123)
    );

    // Assert: Checkpoint metadata should be included
    expect(result.checkpoints).toHaveLength(2);
    expect(result.checkpoints[0].proofHash).toBe('0xproof1');
    expect(result.checkpoints[1].proofHash).toBe('0xproof2');
    expect(result.tokenCount).toBe(2000);
  });
});
