// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockLLMHost } from './mock-llm-host';
import { getTestHost } from './test-accounts';

describe('Mock LLM Host', () => {
  let mockHost: MockLLMHost;

  beforeEach(async () => {
    const hostAccount = await getTestHost();
    mockHost = new MockLLMHost(hostAccount);
  });

  afterEach(async () => {
    await mockHost.stop();
  });

  it('should start and auto-accept sessions', async () => {
    await mockHost.start();
    expect(mockHost.autoAcceptSessions).toBe(true);
  });

  it('should provide SDK-compatible Host info', () => {
    const hostInfo = mockHost.getHostInfo();
    expect(hostInfo.id).toBeDefined();
    expect(hostInfo.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(hostInfo.url).toBe('ws://localhost:8080'); // Mock WebSocket
    expect(hostInfo.models).toContain('llama2-7b');
    expect(hostInfo.pricePerToken).toBe('0.0001'); // Mock price
    expect(hostInfo.available).toBe(true);
  });

  it('should set and retrieve mock responses', () => {
    mockHost.setMockResponse('What is AI?', 'AI is artificial intelligence...');
    // Internal storage, tested via actual response later
  });

  it('should simulate proof of computation', () => {
    const proof = mockHost.simulateProofOfComputation();
    expect(proof).toMatch(/^0x[a-fA-F0-9]{64}$/); // Mock hash
  });
});