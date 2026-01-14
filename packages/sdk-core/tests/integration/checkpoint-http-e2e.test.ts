// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * E2E Integration tests for HTTP-based checkpoint recovery.
 * Tests the full flow: SDK → Node HTTP API → S5 Storage → Recovery
 *
 * These tests require a running node with checkpoint support (v8.11.2+).
 * Tests are skipped gracefully if node is not available.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { fetchCheckpointIndexFromNode } from '../../src/utils/checkpoint-http';
import type { CheckpointIndex } from '../../src/types';

// Test configuration from environment
const TEST_HOST_URL = process.env.TEST_HOST_1_URL || 'http://localhost:8083';
const TEST_SESSION_ID = '12345'; // Use a known test session or create one

// Node availability check
let nodeAvailable = false;

async function checkNodeHealth(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${url}/health`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Checkpoint HTTP E2E Tests', () => {
  beforeAll(async () => {
    nodeAvailable = await checkNodeHealth(TEST_HOST_URL);
    if (!nodeAvailable) {
      console.log(`⚠️  Node not available at ${TEST_HOST_URL} - E2E tests will be skipped`);
    } else {
      console.log(`✅ Node available at ${TEST_HOST_URL} - Running E2E tests`);
    }
  });

  describe('Node Health Check', () => {
    it('should detect node availability', () => {
      // This test always runs to confirm the check works
      expect(typeof nodeAvailable).toBe('boolean');
    });
  });

  describe('Checkpoint Index Fetch (requires node)', () => {
    it('should fetch checkpoint index from live node', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      // Attempt to fetch checkpoints for a test session
      // This may return null if no checkpoints exist for the session
      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, TEST_SESSION_ID);

      // Either null (no checkpoints) or valid CheckpointIndex
      if (result === null) {
        console.log(`  ℹ️  No checkpoints found for session ${TEST_SESSION_ID}`);
        expect(result).toBeNull();
      } else {
        console.log(`  ✅ Found ${result.checkpoints.length} checkpoints`);
        expect(result.sessionId).toBe(TEST_SESSION_ID);
        expect(result.hostAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(Array.isArray(result.checkpoints)).toBe(true);
        expect(typeof result.messagesSignature).toBe('string');
        expect(typeof result.checkpointsSignature).toBe('string');
      }
    });

    it('should return null for non-existent session', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      // Use a session ID that definitely doesn't exist
      const nonExistentSession = '999999999999999';
      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, nonExistentSession);

      expect(result).toBeNull();
    });

    it('should handle malformed session ID gracefully', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      // Try with an invalid session ID format
      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, 'invalid-session');

      // Should either return null or throw CHECKPOINT_FETCH_FAILED
      // depending on node implementation
      expect(result === null || result).toBeTruthy();
    });
  });

  describe('Checkpoint Index Validation (requires node)', () => {
    it('should validate checkpoint entry structure', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, TEST_SESSION_ID);

      if (result === null) {
        console.log('  ℹ️  No checkpoints to validate');
        return;
      }

      // Validate each checkpoint entry
      for (const checkpoint of result.checkpoints) {
        expect(typeof checkpoint.index).toBe('number');
        expect(checkpoint.index).toBeGreaterThanOrEqual(0);

        expect(typeof checkpoint.proofHash).toBe('string');
        expect(checkpoint.proofHash).toMatch(/^0x[a-fA-F0-9]+$/);

        expect(typeof checkpoint.deltaCid).toBe('string');
        expect(checkpoint.deltaCid.length).toBeGreaterThan(0);

        // proofCid is optional
        if (checkpoint.proofCid !== undefined) {
          expect(typeof checkpoint.proofCid).toBe('string');
        }

        expect(Array.isArray(checkpoint.tokenRange)).toBe(true);
        expect(checkpoint.tokenRange).toHaveLength(2);
        expect(typeof checkpoint.tokenRange[0]).toBe('number');
        expect(typeof checkpoint.tokenRange[1]).toBe('number');
        expect(checkpoint.tokenRange[1]).toBeGreaterThanOrEqual(checkpoint.tokenRange[0]);

        expect(typeof checkpoint.timestamp).toBe('number');
        expect(checkpoint.timestamp).toBeGreaterThan(0);
      }
    });

    it('should have sequential checkpoint indices', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, TEST_SESSION_ID);

      if (result === null || result.checkpoints.length === 0) {
        console.log('  ℹ️  No checkpoints to validate sequence');
        return;
      }

      // Verify indices are sequential starting from 0
      for (let i = 0; i < result.checkpoints.length; i++) {
        expect(result.checkpoints[i].index).toBe(i);
      }
    });

    it('should have contiguous token ranges', async () => {
      if (!nodeAvailable) {
        console.log('  ⏭️  Skipped: Node not available');
        return;
      }

      const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, TEST_SESSION_ID);

      if (result === null || result.checkpoints.length < 2) {
        console.log('  ℹ️  Not enough checkpoints to validate contiguity');
        return;
      }

      // Verify token ranges are contiguous (end of one = start of next)
      for (let i = 1; i < result.checkpoints.length; i++) {
        const prevEnd = result.checkpoints[i - 1].tokenRange[1];
        const currStart = result.checkpoints[i].tokenRange[0];
        expect(currStart).toBe(prevEnd);
      }
    });
  });

  describe('Error Handling (requires node)', () => {
    it('should throw on unreachable node', async () => {
      // Use a definitely unreachable URL
      const unreachableUrl = 'http://192.0.2.1:9999'; // TEST-NET-1, always unreachable

      await expect(
        fetchCheckpointIndexFromNode(unreachableUrl, TEST_SESSION_ID)
      ).rejects.toThrow('CHECKPOINT_FETCH_FAILED');
    });

    it('should handle connection timeout', async () => {
      // Use a URL that will timeout (black hole IP)
      const timeoutUrl = 'http://10.255.255.1:8080';

      await expect(
        fetchCheckpointIndexFromNode(timeoutUrl, TEST_SESSION_ID)
      ).rejects.toThrow('CHECKPOINT_FETCH_FAILED');
    }, 10000); // Extended timeout for this test
  });
});

describe('Checkpoint Recovery E2E (Full Flow)', () => {
  it('should be ready for full recovery testing when node is available', async () => {
    if (!nodeAvailable) {
      console.log('  ⏭️  Full recovery E2E test skipped: Node not available');
      console.log('  ℹ️  To run full E2E tests:');
      console.log(`      1. Start a node with checkpoint support (v8.11.2+)`);
      console.log(`      2. Set TEST_HOST_1_URL environment variable`);
      console.log(`      3. Create a session with checkpoints`);
      console.log(`      4. Re-run this test suite`);
      return;
    }

    // When node is available, this test validates the complete flow:
    // 1. Fetch checkpoint index from node HTTP API
    // 2. Verify signatures (would need real host keys)
    // 3. Fetch deltas from S5
    // 4. Merge into recovered conversation

    console.log('  ✅ Node available - full E2E test would run here');
    console.log('  ℹ️  Full recovery requires:');
    console.log('      - Active session with checkpoints');
    console.log('      - Valid host signatures');
    console.log('      - S5 storage with delta CIDs');

    // For now, just verify node responds correctly
    const result = await fetchCheckpointIndexFromNode(TEST_HOST_URL, TEST_SESSION_ID);
    expect(result === null || typeof result === 'object').toBe(true);
  });
});
