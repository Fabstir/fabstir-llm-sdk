/**
 * Tests for blockchain-based checkpoint recovery (Phase 9)
 *
 * Sub-phase 9.3: Type definitions for blockchain checkpoint entries
 * Sub-phase 9.4: Query ProofSubmitted events from blockchain
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ethers } from 'ethers';

// Types to be created in Sub-phase 9.3
import type {
  BlockchainCheckpointEntry,
  CheckpointQueryOptions,
} from '../../src/types';

// Function to be created in Sub-phase 9.4
import { queryProofSubmittedEvents } from '../../src/utils/checkpoint-blockchain';

describe('Sub-phase 9.3: Blockchain Checkpoint Types', () => {
  describe('BlockchainCheckpointEntry', () => {
    it('should have all required fields from ProofSubmitted event', () => {
      const entry: BlockchainCheckpointEntry = {
        jobId: 123n,
        host: '0x1234567890123456789012345678901234567890',
        tokensClaimed: 1000n,
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'baaaaaaa...',
        deltaCID: 'blobbbbb...',
        blockNumber: 12345678,
        transactionHash: '0x' + 'cd'.repeat(32),
      };

      expect(entry.jobId).toBe(123n);
      expect(entry.host).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(entry.tokensClaimed).toBe(1000n);
      expect(entry.proofHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(entry.proofCID).toBeDefined();
      expect(entry.deltaCID).toBeDefined();
      expect(entry.blockNumber).toBeGreaterThan(0);
      expect(entry.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should support empty deltaCID for legacy proofs', () => {
      const entry: BlockchainCheckpointEntry = {
        jobId: 123n,
        host: '0x1234567890123456789012345678901234567890',
        tokensClaimed: 1000n,
        proofHash: '0x' + 'ab'.repeat(32),
        proofCID: 'baaaaaaa...',
        deltaCID: '', // Empty for pre-upgrade proofs
        blockNumber: 12345678,
        transactionHash: '0x' + 'cd'.repeat(32),
      };

      expect(entry.deltaCID).toBe('');
    });
  });

  describe('CheckpointQueryOptions', () => {
    it('should support fromBlock option', () => {
      const options: CheckpointQueryOptions = {
        fromBlock: 1000000,
      };

      expect(options.fromBlock).toBe(1000000);
      expect(options.toBlock).toBeUndefined();
    });

    it('should support toBlock as number', () => {
      const options: CheckpointQueryOptions = {
        fromBlock: 1000000,
        toBlock: 2000000,
      };

      expect(options.toBlock).toBe(2000000);
    });

    it('should support toBlock as "latest"', () => {
      const options: CheckpointQueryOptions = {
        toBlock: 'latest',
      };

      expect(options.toBlock).toBe('latest');
    });

    it('should allow empty options (defaults)', () => {
      const options: CheckpointQueryOptions = {};

      expect(options.fromBlock).toBeUndefined();
      expect(options.toBlock).toBeUndefined();
    });
  });
});

describe('Sub-phase 9.4: Query ProofSubmitted Events', () => {
  let mockContract: any;

  beforeEach(() => {
    mockContract = {
      filters: {
        ProofSubmitted: vi.fn().mockReturnValue('mock-filter'),
      },
      queryFilter: vi.fn(),
    };
  });

  describe('queryProofSubmittedEvents', () => {
    it('should query events filtered by jobId', async () => {
      const mockEvents = [
        createMockEvent(123n, '0xHost1', 1000n, 'proof1', 'delta1', 100),
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      await queryProofSubmittedEvents(mockContract, 123n);

      expect(mockContract.filters.ProofSubmitted).toHaveBeenCalledWith(123n);
      expect(mockContract.queryFilter).toHaveBeenCalledWith('mock-filter', 0, 'latest');
    });

    it('should extract deltaCID from events', async () => {
      const mockEvents = [
        createMockEvent(123n, '0xHost1', 1000n, 'proofCID1', 'deltaCID1', 100),
        createMockEvent(123n, '0xHost1', 1000n, 'proofCID2', 'deltaCID2', 200),
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      const result = await queryProofSubmittedEvents(mockContract, 123n);

      expect(result).toHaveLength(2);
      expect(result[0].deltaCID).toBe('deltaCID1');
      expect(result[1].deltaCID).toBe('deltaCID2');
    });

    it('should sort events by block number (chronological)', async () => {
      const mockEvents = [
        createMockEvent(123n, '0xHost1', 1000n, 'proof3', 'delta3', 300),
        createMockEvent(123n, '0xHost1', 1000n, 'proof1', 'delta1', 100),
        createMockEvent(123n, '0xHost1', 1000n, 'proof2', 'delta2', 200),
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      const result = await queryProofSubmittedEvents(mockContract, 123n);

      expect(result[0].blockNumber).toBe(100);
      expect(result[1].blockNumber).toBe(200);
      expect(result[2].blockNumber).toBe(300);
    });

    it('should return empty array when no events found', async () => {
      mockContract.queryFilter.mockResolvedValue([]);

      const result = await queryProofSubmittedEvents(mockContract, 999n);

      expect(result).toEqual([]);
    });

    it('should respect fromBlock option', async () => {
      mockContract.queryFilter.mockResolvedValue([]);

      await queryProofSubmittedEvents(mockContract, 123n, { fromBlock: 5000000 });

      expect(mockContract.queryFilter).toHaveBeenCalledWith('mock-filter', 5000000, 'latest');
    });

    it('should respect toBlock option', async () => {
      mockContract.queryFilter.mockResolvedValue([]);

      await queryProofSubmittedEvents(mockContract, 123n, { toBlock: 6000000 });

      expect(mockContract.queryFilter).toHaveBeenCalledWith('mock-filter', 0, 6000000);
    });

    it('should handle events with empty deltaCID (pre-upgrade)', async () => {
      const mockEvents = [
        createMockEvent(123n, '0xHost1', 1000n, 'proofCID1', '', 100), // Empty deltaCID
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      const result = await queryProofSubmittedEvents(mockContract, 123n);

      expect(result[0].deltaCID).toBe('');
    });

    it('should include transaction hash in result', async () => {
      const mockEvents = [
        createMockEvent(123n, '0xHost1', 1000n, 'proofCID1', 'deltaCID1', 100, '0x' + 'ab'.repeat(32)),
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      const result = await queryProofSubmittedEvents(mockContract, 123n);

      expect(result[0].transactionHash).toBe('0x' + 'ab'.repeat(32));
    });

    it('should parse all event fields correctly', async () => {
      const hostAddress = '0x1234567890123456789012345678901234567890';
      const proofHash = '0x' + 'ef'.repeat(32);
      const mockEvents = [
        {
          args: {
            jobId: 456n,
            host: hostAddress,
            tokensClaimed: 2500n,
            proofHash: proofHash,
            proofCID: 'baaaaaProofCID',
            deltaCID: 'blobbbDeltaCID',
          },
          blockNumber: 12345678,
          transactionHash: '0x' + 'cd'.repeat(32),
        },
      ];
      mockContract.queryFilter.mockResolvedValue(mockEvents);

      const result = await queryProofSubmittedEvents(mockContract, 456n);

      expect(result[0]).toEqual({
        jobId: 456n,
        host: hostAddress,
        tokensClaimed: 2500n,
        proofHash: proofHash,
        proofCID: 'baaaaaProofCID',
        deltaCID: 'blobbbDeltaCID',
        blockNumber: 12345678,
        transactionHash: '0x' + 'cd'.repeat(32),
      });
    });
  });
});

// Helper function to create mock events
function createMockEvent(
  jobId: bigint,
  host: string,
  tokensClaimed: bigint,
  proofCID: string,
  deltaCID: string,
  blockNumber: number,
  transactionHash: string = '0x' + '00'.repeat(32)
) {
  return {
    args: {
      jobId,
      host,
      tokensClaimed,
      proofHash: '0x' + 'ab'.repeat(32),
      proofCID,
      deltaCID,
    },
    blockNumber,
    transactionHash,
  };
}
