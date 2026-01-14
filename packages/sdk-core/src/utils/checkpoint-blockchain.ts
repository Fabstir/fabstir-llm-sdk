/**
 * Blockchain-based checkpoint recovery utilities (Phase 9)
 *
 * Enables decentralized checkpoint recovery by querying ProofSubmitted events
 * from the blockchain to discover deltaCIDs, without requiring the host to be online.
 */

import { ethers } from 'ethers';
import type { BlockchainCheckpointEntry, CheckpointQueryOptions } from '../types';

/**
 * Query ProofSubmitted events from blockchain for a session.
 *
 * This enables decentralized checkpoint recovery - users can discover checkpoint
 * deltaCIDs from blockchain events even if the host node is offline.
 *
 * @param contract - JobMarketplace contract instance with ProofSubmitted event
 * @param jobId - Session/job ID to query events for
 * @param options - Query options (block range)
 * @returns Array of checkpoint entries with deltaCIDs, sorted by block number
 *
 * @example
 * ```typescript
 * const contract = new ethers.Contract(address, abi, provider);
 * const checkpoints = await queryProofSubmittedEvents(contract, 123n);
 *
 * for (const checkpoint of checkpoints) {
 *   console.log(`Checkpoint at block ${checkpoint.blockNumber}: deltaCID=${checkpoint.deltaCID}`);
 * }
 * ```
 */
export async function queryProofSubmittedEvents(
  contract: ethers.Contract,
  jobId: bigint,
  options: CheckpointQueryOptions = {}
): Promise<BlockchainCheckpointEntry[]> {
  const { fromBlock = 0, toBlock = 'latest' } = options;

  // Create event filter for ProofSubmitted events with specific jobId
  const filter = contract.filters.ProofSubmitted(jobId);

  // Query events from blockchain
  const events = await contract.queryFilter(filter, fromBlock, toBlock);

  // Parse events and extract checkpoint data
  const checkpoints: BlockchainCheckpointEntry[] = events.map((event: any) => ({
    jobId: event.args.jobId,
    host: event.args.host,
    tokensClaimed: event.args.tokensClaimed,
    proofHash: event.args.proofHash,
    proofCID: event.args.proofCID,
    deltaCID: event.args.deltaCID,
    blockNumber: event.blockNumber,
    transactionHash: event.transactionHash,
  }));

  // Sort by block number (chronological order)
  checkpoints.sort((a, b) => a.blockNumber - b.blockNumber);

  return checkpoints;
}

/**
 * Check if a checkpoint entry has a valid deltaCID (post-upgrade proof).
 *
 * Pre-upgrade proofs will have empty deltaCID strings. This helper determines
 * if the checkpoint can be used for decentralized recovery.
 *
 * @param entry - Blockchain checkpoint entry
 * @returns true if deltaCID is present and non-empty
 */
export function hasValidDeltaCID(entry: BlockchainCheckpointEntry): boolean {
  return typeof entry.deltaCID === 'string' && entry.deltaCID.length > 0;
}

/**
 * Filter checkpoint entries to only those with valid deltaCIDs.
 *
 * @param entries - Array of blockchain checkpoint entries
 * @returns Entries that have non-empty deltaCID values
 */
export function filterRecoverableCheckpoints(
  entries: BlockchainCheckpointEntry[]
): BlockchainCheckpointEntry[] {
  return entries.filter(hasValidDeltaCID);
}
