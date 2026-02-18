import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAIBridgeConfig } from '../src/config';

const mockAuthenticate = vi.fn();
const mockGetSessionManager = vi.fn();
const mockStartSession = vi.fn();
const mockSendPromptStreaming = vi.fn();
const mockEndSession = vi.fn();
const mockGetLastTokenUsage = vi.fn();

const mockSessionManager = {
  startSession: mockStartSession,
  sendPromptStreaming: mockSendPromptStreaming,
  endSession: mockEndSession,
  getLastTokenUsage: mockGetLastTokenUsage,
};

const mockSdkInstance = {
  authenticate: mockAuthenticate,
  getSessionManager: mockGetSessionManager,
};

vi.mock('@fabstir/sdk-core', () => ({
  FabstirSDKCore: vi.fn().mockImplementation(() => mockSdkInstance),
  ChainRegistry: {
    getChain: vi.fn().mockReturnValue({
      rpcUrl: 'https://mock-rpc.example.com',
      contracts: { jobMarketplace: '0xMockJob', nodeRegistry: '0xMockNode', paymentEscrow: '0xMockPay' },
    }),
  },
  ChainId: { BASE_SEPOLIA: 84532 },
}));

import { SessionBridge } from '../src/session-bridge';

const testConfig: OpenAIBridgeConfig = {
  port: 3457,
  privateKey: '0xTestPrivateKey123',
  hostAddress: '0xTestHost456',
  modelName: 'TestOrg/TestModel:test.gguf',
  chainId: 84532,
  depositAmount: '0.0002',
  pricePerToken: 5000,
  proofInterval: 100,
  duration: 86400,
};

describe('SessionBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionManager.mockReturnValue(mockSessionManager);
    mockStartSession.mockResolvedValue({ sessionId: 42n, jobId: 1n });
    mockSendPromptStreaming.mockResolvedValue('Hello from node');
    mockGetLastTokenUsage.mockReturnValue({ llmTokens: 10, vlmTokens: 0, totalTokens: 10 });
  });

  it('initialize() creates SDK and authenticates', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    expect(mockAuthenticate).toHaveBeenCalledWith('privatekey', { privateKey: '0xTestPrivateKey123' });
  });

  it('ensureSession() starts session on first call', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const sessionId = await bridge.ensureSession();
    expect(sessionId).toBe(42n);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('ensureSession() returns cached sessionId on subsequent calls', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const first = await bridge.ensureSession();
    const second = await bridge.ensureSession();
    expect(first).toBe(42n);
    expect(second).toBe(42n);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('sendPrompt() calls sessionManager.sendPromptStreaming()', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const onToken = vi.fn();
    await bridge.sendPrompt('Hello world', onToken);
    expect(mockSendPromptStreaming).toHaveBeenCalledWith(42n, 'Hello world', onToken, undefined);
  });

  it('sendPrompt() with onToken callback streams tokens', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const onToken = vi.fn();
    const result = await bridge.sendPrompt('test', onToken);
    expect(result.response).toBe('Hello from node');
    expect(result.tokenUsage).toEqual({ llmTokens: 10, vlmTokens: 0, totalTokens: 10 });
  });

  it('sendPrompt() without callback returns complete response', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const result = await bridge.sendPrompt('test');
    expect(result.response).toBe('Hello from node');
    expect(mockSendPromptStreaming).toHaveBeenCalledWith(42n, 'test', undefined, undefined);
  });

  it('auto-recovery: clears session on SESSION_NOT_FOUND and retries', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    await bridge.ensureSession();

    const err = new Error('SESSION_NOT_FOUND');
    (err as any).code = 'SESSION_NOT_FOUND';
    mockSendPromptStreaming.mockRejectedValueOnce(err).mockResolvedValueOnce('Recovered');
    mockStartSession.mockResolvedValueOnce({ sessionId: 99n, jobId: 2n });

    const result = await bridge.sendPrompt('test');
    expect(result.response).toBe('Recovered');
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });

  it('queue: serialises concurrent requests', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    const order: number[] = [];
    mockSendPromptStreaming.mockImplementation(async () => {
      order.push(order.length);
      return 'ok';
    });
    await Promise.all([bridge.sendPrompt('a'), bridge.sendPrompt('b')]);
    expect(order).toEqual([0, 1]);
  });

  it('shutdown() ends session cleanly', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    await bridge.ensureSession();
    await bridge.shutdown();
    expect(mockEndSession).toHaveBeenCalledWith(42n);
  });

  it('getSessionManager() returns manager after initialisation', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    expect(bridge.getSessionManager()).toBe(mockSessionManager);
  });

  it('auto-recovery: treats decryption errors as session errors and resets', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    await bridge.ensureSession();

    const err = new Error('Failed to decrypt message: Decryption failed (authentication error): aead::Error');
    mockSendPromptStreaming.mockRejectedValueOnce(err).mockResolvedValueOnce('Recovered');
    mockStartSession.mockResolvedValueOnce({ sessionId: 99n, jobId: 2n });

    const result = await bridge.sendPrompt('test');
    expect(result.response).toBe('Recovered');
    expect(mockStartSession).toHaveBeenCalledTimes(2); // original + reset
  });

  it('error cooldown: fails fast on repeated errors within cooldown window', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    await bridge.ensureSession();

    const err = new Error('Failed to decrypt message: aead::Error');
    // All attempts fail — persistent decryption error
    mockSendPromptStreaming.mockRejectedValue(err);
    mockStartSession.mockResolvedValue({ sessionId: 99n, jobId: 2n });

    // First call: detects error, resets session, retry also fails → throws
    await expect(bridge.sendPrompt('test1')).rejects.toThrow('aead::Error');
    // Second call within cooldown: should fail fast without re-attempting session init
    const startCallsBefore = mockStartSession.mock.calls.length;
    await expect(bridge.sendPrompt('test2')).rejects.toThrow();
    // Should NOT have created another session during cooldown
    expect(mockStartSession.mock.calls.length).toBe(startCallsBefore);
  });

  it('circuit breaker: opens after consecutive failures, isCircuitOpen() returns true', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    await bridge.ensureSession();

    expect(bridge.isCircuitOpen()).toBe(false);

    const err = new Error('Failed to decrypt message: aead::Error');
    mockSendPromptStreaming.mockRejectedValue(err);
    mockStartSession.mockResolvedValue({ sessionId: 99n, jobId: 2n });

    // Trigger failure (first attempt + recovery attempt = 2 consecutive failures)
    await expect(bridge.sendPrompt('test')).rejects.toThrow();

    expect(bridge.isCircuitOpen()).toBe(true);
    expect(bridge.getCircuitError()).toContain('decrypt');
  });

  it('circuit breaker: getCircuitError() returns null when circuit is closed', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();
    expect(bridge.isCircuitOpen()).toBe(false);
    expect(bridge.getCircuitError()).toBeNull();
  });
});
