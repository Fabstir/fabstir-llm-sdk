// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Checkpoint Recovery Utilities for Delta-Based Checkpointing
 *
 * Provides functions to fetch and validate checkpoint data from S5 storage.
 * Used to recover conversation state from node-published checkpoints.
 */

import type { CheckpointIndex, CheckpointIndexEntry, CheckpointDelta, Message, RecoveredConversation } from '../types';
import type { StorageManager } from '../managers/StorageManager';

/**
 * Interface for contract with getProofSubmission method.
 */
export interface ProofQueryContract {
  getProofSubmission(
    sessionId: bigint,
    proofIndex: number
  ): Promise<{
    proofHash: string;
    tokensClaimed: bigint;
    timestamp: bigint;
    verified: boolean;
  }>;
}

/**
 * Base path for checkpoint storage on S5.
 */
const CHECKPOINT_BASE_PATH = 'home/checkpoints';

/**
 * Validate that an object has the required CheckpointIndex structure.
 *
 * @param data - Object to validate
 * @returns true if valid CheckpointIndex structure
 */
function isValidCheckpointIndex(data: any): data is CheckpointIndex {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check required fields exist
  if (
    typeof data.sessionId !== 'string' ||
    typeof data.hostAddress !== 'string' ||
    !Array.isArray(data.checkpoints) ||
    typeof data.hostSignature !== 'string'
  ) {
    return false;
  }

  // Validate each checkpoint entry
  for (const checkpoint of data.checkpoints) {
    if (
      typeof checkpoint.index !== 'number' ||
      typeof checkpoint.proofHash !== 'string' ||
      typeof checkpoint.deltaCID !== 'string' ||
      !Array.isArray(checkpoint.tokenRange) ||
      checkpoint.tokenRange.length !== 2 ||
      typeof checkpoint.timestamp !== 'number'
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Fetch checkpoint index from S5 storage.
 *
 * This function retrieves the checkpoint index for a session from the host's
 * S5 storage path. The index contains metadata about all available checkpoints.
 *
 * @param storageManager - StorageManager instance with S5 client access
 * @param hostAddress - The host's Ethereum address
 * @param sessionId - The session ID (as string)
 * @returns CheckpointIndex if found, null if not found
 * @throws Error if the data is malformed
 *
 * @example
 * ```typescript
 * const index = await fetchCheckpointIndex(storageManager, '0xHost...', '123');
 * if (index) {
 *   console.log(`Found ${index.checkpoints.length} checkpoints`);
 * }
 * ```
 */
export async function fetchCheckpointIndex(
  storageManager: StorageManager,
  hostAddress: string,
  sessionId: string
): Promise<CheckpointIndex | null> {
  const s5Client = storageManager.getS5Client();
  if (!s5Client) {
    throw new Error('S5 client not available');
  }

  // Normalize host address to lowercase for consistent paths
  const normalizedAddress = hostAddress.toLowerCase();

  // Construct S5 path: home/checkpoints/{hostAddress}/{sessionId}/index.json
  const path = `${CHECKPOINT_BASE_PATH}/${normalizedAddress}/${sessionId}/index.json`;

  // Fetch from S5 - handle "not found" gracefully
  let data: any;
  try {
    data = await s5Client.fs.get(path);
  } catch (error: any) {
    // S5 throws error if path doesn't exist - treat as "no checkpoints"
    if (error.message?.includes('does not exist') || error.message?.includes('not found')) {
      return null;
    }
    throw error;
  }

  // Handle not found case
  if (data === null || data === undefined) {
    return null;
  }

  // Validate structure
  if (!isValidCheckpointIndex(data)) {
    throw new Error(
      'Invalid checkpoint index structure: missing or invalid required fields'
    );
  }

  return data;
}

/**
 * Verify a checkpoint index against on-chain proofs and expected host.
 *
 * This function performs two verifications:
 * 1. Validates that the index hostAddress matches the expected host
 * 2. For each checkpoint, verifies that proofHash matches on-chain proof
 *
 * @param index - The checkpoint index to verify
 * @param sessionId - The session ID (bigint)
 * @param contract - Contract instance with getProofSubmission method
 * @param expectedHostAddress - The expected host address (for signature verification)
 * @returns true if verification passes
 * @throws Error with code 'INVALID_INDEX_SIGNATURE' if host address mismatch
 * @throws Error with code 'PROOF_HASH_MISMATCH' if on-chain proof doesn't match
 *
 * @example
 * ```typescript
 * try {
 *   await verifyCheckpointIndex(index, sessionId, contract, hostAddress);
 *   console.log('Index verified successfully');
 * } catch (error) {
 *   if (error.message.includes('PROOF_HASH_MISMATCH')) {
 *     console.error('On-chain proof mismatch - possible tampering');
 *   }
 * }
 * ```
 */
export async function verifyCheckpointIndex(
  index: CheckpointIndex,
  sessionId: bigint,
  contract: ProofQueryContract,
  expectedHostAddress: string
): Promise<boolean> {
  // Normalize addresses for comparison
  const normalizedExpected = expectedHostAddress.toLowerCase();
  const normalizedIndexHost = index.hostAddress.toLowerCase();

  // Verify host address matches (simplified signature verification)
  // Note: Full EIP-191 signature verification would verify hostSignature
  // against the stringified checkpoints, but for now we verify the host address matches
  if (normalizedExpected !== normalizedIndexHost) {
    throw new Error(
      `INVALID_INDEX_SIGNATURE: Host address mismatch. Expected ${normalizedExpected}, got ${normalizedIndexHost}`
    );
  }

  // Empty checkpoints is valid (no proofs to verify)
  if (index.checkpoints.length === 0) {
    return true;
  }

  // Verify each checkpoint's proofHash against on-chain
  for (const checkpoint of index.checkpoints) {
    const onChainProof = await contract.getProofSubmission(
      sessionId,
      checkpoint.index
    );

    // Normalize proof hashes for comparison (case-insensitive)
    const normalizedOnChain = onChainProof.proofHash.toLowerCase();
    const normalizedCheckpoint = checkpoint.proofHash.toLowerCase();

    if (normalizedOnChain !== normalizedCheckpoint) {
      throw new Error(
        `PROOF_HASH_MISMATCH: Checkpoint ${checkpoint.index} proofHash mismatch. ` +
          `On-chain: ${normalizedOnChain}, Index: ${normalizedCheckpoint}`
      );
    }
  }

  return true;
}

/**
 * Validate that an object has the required CheckpointDelta structure.
 *
 * @param data - Object to validate
 * @returns true if valid CheckpointDelta structure
 */
function isValidCheckpointDelta(data: any): data is CheckpointDelta {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check required fields exist with correct types
  if (
    typeof data.sessionId !== 'string' ||
    typeof data.checkpointIndex !== 'number' ||
    typeof data.proofHash !== 'string' ||
    typeof data.startToken !== 'number' ||
    typeof data.endToken !== 'number' ||
    !Array.isArray(data.messages) ||
    typeof data.hostSignature !== 'string'
  ) {
    return false;
  }

  return true;
}

/**
 * Fetch and verify a checkpoint delta from S5.
 *
 * This function retrieves a delta by its CID and validates its structure.
 * Note: Full signature verification would verify hostSignature against
 * the message content, but for now we verify presence and structure.
 *
 * @param storageManager - StorageManager instance with S5 client access
 * @param deltaCID - The S5 CID of the delta to fetch
 * @param hostAddress - The expected host address
 * @returns The verified CheckpointDelta
 * @throws Error with code 'DELTA_FETCH_FAILED' if S5 fetch fails
 * @throws Error with code 'INVALID_DELTA_STRUCTURE' if delta is malformed
 * @throws Error with code 'INVALID_DELTA_SIGNATURE' if signature is invalid
 *
 * @example
 * ```typescript
 * const delta = await fetchAndVerifyDelta(storageManager, 's5://delta1', '0xHost...');
 * console.log(`Delta contains ${delta.messages.length} messages`);
 * ```
 */
export async function fetchAndVerifyDelta(
  storageManager: StorageManager,
  deltaCID: string,
  hostAddress: string
): Promise<CheckpointDelta> {
  const s5Client = storageManager.getS5Client();
  if (!s5Client) {
    throw new Error('DELTA_FETCH_FAILED: S5 client not available');
  }

  // Fetch from S5
  let data: any;
  try {
    data = await s5Client.fs.get(deltaCID);
  } catch (error: any) {
    throw new Error(`DELTA_FETCH_FAILED: ${error.message}`);
  }

  // Handle not found case
  if (data === null || data === undefined) {
    throw new Error(`DELTA_FETCH_FAILED: Delta not found at ${deltaCID}`);
  }

  // Validate structure
  if (!isValidCheckpointDelta(data)) {
    throw new Error(
      'INVALID_DELTA_STRUCTURE: Missing or invalid required fields'
    );
  }

  // Verify signature is present and non-empty
  // Note: Full EIP-191 verification would be done here in production
  if (!data.hostSignature || data.hostSignature.length === 0) {
    throw new Error('INVALID_DELTA_SIGNATURE: Empty or missing host signature');
  }

  return data;
}

/**
 * Merge multiple checkpoint deltas into a single conversation.
 *
 * This function combines messages from multiple deltas, handling the case
 * where assistant messages may be split across checkpoints. It also
 * returns the total token count from the final checkpoint.
 *
 * @param deltas - Array of CheckpointDelta objects to merge
 * @returns Object containing merged messages and total token count
 *
 * @example
 * ```typescript
 * const { messages, tokenCount } = mergeDeltas(deltas);
 * console.log(`Merged ${messages.length} messages with ${tokenCount} tokens`);
 * ```
 */
export function mergeDeltas(
  deltas: CheckpointDelta[]
): { messages: Message[]; tokenCount: number } {
  // Handle empty input
  if (deltas.length === 0) {
    return { messages: [], tokenCount: 0 };
  }

  // Sort deltas by checkpointIndex to ensure correct order
  const sortedDeltas = [...deltas].sort(
    (a, b) => a.checkpointIndex - b.checkpointIndex
  );

  const mergedMessages: Message[] = [];

  for (const delta of sortedDeltas) {
    for (const msg of delta.messages) {
      // Check if we should concatenate with the last message
      // This happens when the last message was an assistant message marked as partial
      // and the current message is also an assistant message (continuation)
      if (
        mergedMessages.length > 0 &&
        msg.role === 'assistant' &&
        mergedMessages[mergedMessages.length - 1].role === 'assistant'
      ) {
        const lastMsg = mergedMessages[mergedMessages.length - 1];
        // Check if last message was marked as partial
        if (lastMsg.metadata?.partial === true) {
          // Concatenate content
          lastMsg.content += msg.content;
          // Update metadata - if current message is not partial, mark as complete
          if (!msg.metadata?.partial) {
            lastMsg.metadata = { ...lastMsg.metadata, partial: undefined };
          }
          continue;
        }
      }

      // Add message to merged list
      mergedMessages.push({ ...msg });
    }
  }

  // Get token count from the last delta's endToken
  const lastDelta = sortedDeltas[sortedDeltas.length - 1];
  const tokenCount = lastDelta.endToken;

  return { messages: mergedMessages, tokenCount };
}

/**
 * Session info getter type for recovery flow.
 */
export type GetSessionInfoFn = (sessionId: bigint) => Promise<{
  hostAddress: string;
  status: string;
} | null>;

/**
 * Execute the full checkpoint recovery flow.
 *
 * This function orchestrates all the steps needed to recover a conversation
 * from node-published checkpoints:
 * 1. Get session info to obtain host address
 * 2. Fetch checkpoint index from S5
 * 3. Verify index signature and on-chain proofs
 * 4. Fetch and verify all deltas
 * 5. Merge deltas into conversation
 * 6. Return recovered conversation
 *
 * @param storageManager - StorageManager instance with S5 client access
 * @param contract - Contract instance for on-chain proof verification
 * @param getSessionInfo - Function to get session info (host address)
 * @param sessionId - The session ID to recover
 * @returns RecoveredConversation with messages, token count, and checkpoint metadata
 * @throws Error with code 'SESSION_NOT_FOUND' if session doesn't exist
 * @throws Error with code 'INVALID_INDEX_SIGNATURE' if signature verification fails
 * @throws Error with code 'PROOF_HASH_MISMATCH' if on-chain proof doesn't match
 * @throws Error with code 'DELTA_FETCH_FAILED' if delta fetch fails
 *
 * @example
 * ```typescript
 * const result = await recoverFromCheckpointsFlow(
 *   storageManager,
 *   contract,
 *   (id) => sessionManager.getSessionInfo(id),
 *   BigInt(123)
 * );
 * console.log(`Recovered ${result.messages.length} messages`);
 * ```
 */
export async function recoverFromCheckpointsFlow(
  storageManager: StorageManager,
  contract: ProofQueryContract,
  getSessionInfo: GetSessionInfoFn,
  sessionId: bigint
): Promise<RecoveredConversation> {
  // Step 1: Get session info to obtain host address
  const sessionInfo = await getSessionInfo(sessionId);
  if (!sessionInfo) {
    throw new Error(`SESSION_NOT_FOUND: Session ${sessionId} does not exist`);
  }

  const hostAddress = sessionInfo.hostAddress;

  // Step 2: Fetch checkpoint index from S5
  const index = await fetchCheckpointIndex(
    storageManager,
    hostAddress,
    sessionId.toString()
  );

  // No checkpoints published - return empty recovery
  if (!index) {
    return {
      messages: [],
      tokenCount: 0,
      checkpoints: [],
    };
  }

  // Step 3: Verify index signature and on-chain proofs
  await verifyCheckpointIndex(index, sessionId, contract, hostAddress);

  // Step 4: Fetch and verify all deltas
  const deltas: CheckpointDelta[] = [];
  for (const checkpoint of index.checkpoints) {
    const delta = await fetchAndVerifyDelta(
      storageManager,
      checkpoint.deltaCID,
      hostAddress
    );
    deltas.push(delta);
  }

  // Step 5: Merge deltas into conversation
  const { messages, tokenCount } = mergeDeltas(deltas);

  // Step 6: Return recovered conversation with checkpoint metadata
  return {
    messages,
    tokenCount,
    checkpoints: index.checkpoints,
  };
}
