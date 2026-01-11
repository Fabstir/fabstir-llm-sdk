// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * HTTP-based Checkpoint Index Fetching
 *
 * Fetches checkpoint index from node's HTTP API instead of S5 path.
 * This is necessary because S5's home/ directory is per-user (private namespace),
 * so the SDK cannot access the node's S5 storage directly.
 *
 * Flow:
 * 1. SDK calls GET /v1/checkpoints/{sessionId} on node
 * 2. Node returns checkpoint index (including delta CIDs)
 * 3. SDK fetches deltas from S5 using globally-addressable CIDs
 */

import type { CheckpointIndex, CheckpointIndexEntry } from '../types';

/**
 * Default timeout for HTTP requests (10 seconds).
 */
const DEFAULT_TIMEOUT_MS = 10000;

/**
 * Validate that an object has the required CheckpointIndexEntry structure.
 */
function isValidCheckpointEntry(entry: any): entry is CheckpointIndexEntry {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  return (
    typeof entry.index === 'number' &&
    typeof entry.proofHash === 'string' &&
    typeof entry.deltaCID === 'string' &&
    Array.isArray(entry.tokenRange) &&
    entry.tokenRange.length === 2 &&
    typeof entry.tokenRange[0] === 'number' &&
    typeof entry.tokenRange[1] === 'number' &&
    typeof entry.timestamp === 'number'
  );
}

/**
 * Validate that an object has the required CheckpointIndex structure.
 */
function isValidCheckpointIndex(data: any): data is CheckpointIndex {
  if (!data || typeof data !== 'object') {
    return false;
  }

  // Check required fields exist with correct types
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
    if (!isValidCheckpointEntry(checkpoint)) {
      return false;
    }
  }

  return true;
}

/**
 * Fetch checkpoint index from node's HTTP API.
 *
 * This function queries the node's checkpoint endpoint to retrieve the
 * checkpoint index for a session. The index contains metadata about all
 * available checkpoints, including delta CIDs for S5 retrieval.
 *
 * @param hostUrl - The node's base URL (e.g., 'http://localhost:8080')
 * @param sessionId - The session ID to fetch checkpoints for
 * @param timeoutMs - Optional timeout in milliseconds (default: 10000)
 * @returns CheckpointIndex if found, null if no checkpoints exist (404)
 * @throws Error with code 'CHECKPOINT_FETCH_FAILED' on network/server error
 * @throws Error with code 'INVALID_CHECKPOINT_INDEX' on malformed response
 *
 * @example
 * ```typescript
 * const index = await fetchCheckpointIndexFromNode('http://localhost:8080', '123');
 * if (index) {
 *   console.log(`Found ${index.checkpoints.length} checkpoints`);
 *   for (const cp of index.checkpoints) {
 *     console.log(`  Checkpoint ${cp.index}: ${cp.deltaCID}`);
 *   }
 * }
 * ```
 */
export async function fetchCheckpointIndexFromNode(
  hostUrl: string,
  sessionId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<CheckpointIndex | null> {
  // Normalize host URL (remove trailing slash)
  const normalizedHostUrl = hostUrl.replace(/\/+$/, '');

  // Construct endpoint URL
  const url = `${normalizedHostUrl}/v1/checkpoints/${sessionId}`;

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Handle 404 - no checkpoints exist yet
    if (response.status === 404) {
      return null;
    }

    // Handle other non-OK responses
    if (!response.ok) {
      throw new Error(
        `CHECKPOINT_FETCH_FAILED: Server returned ${response.status} ${response.statusText}`
      );
    }

    // Parse JSON response
    let data: any;
    try {
      data = await response.json();
    } catch (parseError) {
      throw new Error(
        `CHECKPOINT_FETCH_FAILED: Failed to parse JSON response - ${parseError}`
      );
    }

    // Validate response structure
    if (!isValidCheckpointIndex(data)) {
      throw new Error(
        'INVALID_CHECKPOINT_INDEX: Response missing or has invalid required fields'
      );
    }

    return data;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Re-throw our custom errors
    if (error.message?.startsWith('CHECKPOINT_FETCH_FAILED') ||
        error.message?.startsWith('INVALID_CHECKPOINT_INDEX')) {
      throw error;
    }

    // Handle abort (timeout)
    if (error.name === 'AbortError') {
      throw new Error(
        `CHECKPOINT_FETCH_FAILED: Request timed out after ${timeoutMs}ms`
      );
    }

    // Handle network errors
    throw new Error(
      `CHECKPOINT_FETCH_FAILED: Network error - ${error.message}`
    );
  }
}
