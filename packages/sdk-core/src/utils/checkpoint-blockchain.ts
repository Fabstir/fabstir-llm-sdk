/**
 * Blockchain-based checkpoint recovery utilities (Phase 9)
 *
 * Enables decentralized checkpoint recovery by querying ProofSubmitted events
 * from the blockchain to discover deltaCIDs, without requiring the host to be online.
 */

import { ethers } from 'ethers';
import type { BlockchainCheckpointEntry, CheckpointQueryOptions, CheckpointDelta, Message } from '../types';
import { isEncryptedDelta, decryptDeltaIfNeeded } from './checkpoint-encryption';
import { mergeDeltas } from './checkpoint-recovery';

/**
 * Interface for storage manager that can fetch by CID.
 */
export interface BlockchainRecoveryStorageManager {
  getByCID(cid: string): Promise<any>;
}

/**
 * Result of blockchain-based checkpoint recovery.
 */
export interface BlockchainRecoveredConversation {
  /** Merged messages from all deltas */
  messages: Message[];
  /** Total token count from last checkpoint */
  tokenCount: number;
  /** Blockchain checkpoint entries used for recovery */
  checkpoints: BlockchainCheckpointEntry[];
}

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
  let { fromBlock, toBlock = 'latest' } = options;

  // If fromBlock not specified, use a reasonable lookback to avoid RPC limits
  // Most RPCs limit eth_getLogs to 10,000 blocks, so we use 9,000 to be safe
  if (fromBlock === undefined || fromBlock === 0) {
    const provider = contract.runner?.provider;
    if (provider) {
      const currentBlock = await provider.getBlockNumber();
      // Look back ~9000 blocks (about 5 hours on Base at 2s blocks)
      fromBlock = Math.max(0, currentBlock - 9000);
    } else {
      fromBlock = 0; // Fallback, may fail on some RPCs
    }
  }

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

/**
 * Recover conversation from blockchain events (decentralized recovery).
 *
 * This function enables fully decentralized checkpoint recovery:
 * 1. Query ProofSubmitted events from blockchain for the job/session
 * 2. Extract deltaCIDs from events (skipping pre-upgrade proofs with empty deltaCID)
 * 3. Fetch checkpoint deltas from S5 using the deltaCIDs
 * 4. Decrypt deltas if encrypted (using userPrivateKey)
 * 5. Merge deltas chronologically into conversation
 *
 * This approach does NOT require the host to be online - deltaCIDs are
 * permanently recorded on-chain, providing non-repudiation and censorship resistance.
 *
 * @param contract - JobMarketplace contract instance with ProofSubmitted event
 * @param storageManager - Storage manager with getByCID method for S5 fetch
 * @param jobId - Session/job ID to recover
 * @param userPrivateKey - User's recovery private key (required for encrypted deltas)
 * @param options - Query options (block range)
 * @returns BlockchainRecoveredConversation with messages, token count, and checkpoint entries
 * @throws Error with code 'DELTA_FETCH_FAILED' if S5 fetch fails
 * @throws Error with code 'DECRYPTION_KEY_REQUIRED' if encrypted and no private key
 * @throws Error with code 'DECRYPTION_FAILED' if decryption fails
 *
 * @example
 * ```typescript
 * const contract = new ethers.Contract(address, abi, provider);
 * const result = await recoverFromBlockchain(contract, storageManager, 123n, userPrivateKey);
 *
 * console.log(`Recovered ${result.messages.length} messages from ${result.checkpoints.length} checkpoints`);
 * console.log(`Total tokens: ${result.tokenCount}`);
 * ```
 */
export async function recoverFromBlockchain(
  contract: ethers.Contract,
  storageManager: BlockchainRecoveryStorageManager,
  jobId: bigint,
  userPrivateKey?: string,
  options: CheckpointQueryOptions = {}
): Promise<BlockchainRecoveredConversation> {
  // Step 1: Query blockchain events
  const allEntries = await queryProofSubmittedEvents(contract, jobId, options);

  // Step 2: Filter to recoverable checkpoints (non-empty deltaCID)
  const recoverableEntries = filterRecoverableCheckpoints(allEntries);

  // No recoverable checkpoints - return empty result
  if (recoverableEntries.length === 0) {
    return {
      messages: [],
      tokenCount: 0,
      checkpoints: [],
    };
  }

  // Step 3: Fetch deltas from S5
  const deltas: CheckpointDelta[] = [];

  for (const entry of recoverableEntries) {
    let rawDelta: any;

    try {
      rawDelta = await storageManager.getByCID(entry.deltaCID);
    } catch (error: any) {
      throw new Error(`DELTA_FETCH_FAILED: Failed to fetch delta ${entry.deltaCID}: ${error.message}`);
    }

    if (!rawDelta) {
      throw new Error(`DELTA_FETCH_FAILED: Delta not found at ${entry.deltaCID}`);
    }

    // Step 4: Decrypt if encrypted
    let delta: CheckpointDelta;

    if (isEncryptedDelta(rawDelta)) {
      // Encrypted delta - requires private key
      delta = decryptDeltaIfNeeded(rawDelta, userPrivateKey);
    } else {
      // Plaintext delta
      delta = rawDelta as CheckpointDelta;
    }

    deltas.push(delta);
  }

  // Step 5: Merge deltas into conversation
  const { messages, tokenCount } = mergeDeltas(deltas);

  // Return result with blockchain checkpoint entries
  return {
    messages,
    tokenCount,
    checkpoints: recoverableEntries,
  };
}
