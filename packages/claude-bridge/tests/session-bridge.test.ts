import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BridgeConfig } from '../src/config';

// Mock @fabstir/sdk-core
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
      contracts: {
        jobMarketplace: '0xMockJob',
        nodeRegistry: '0xMockNode',
        paymentEscrow: '0xMockPay',
      },
    }),
  },
  ChainId: { BASE_SEPOLIA: 84532 },
}));

// Must import after mocks
import { SessionBridge } from '../src/session-bridge';
import { FabstirSDKCore, ChainRegistry } from '@fabstir/sdk-core';

const testConfig: BridgeConfig = {
  port: 3456,
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

  it('constructor stores config correctly', () => {
    const bridge = new SessionBridge(testConfig);
    expect(bridge).toBeDefined();
    // Config is stored internally — verified by initialize() using it
  });

  it('initialize() creates FabstirSDKCore with correct chainId and contractAddresses', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    expect(FabstirSDKCore).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 84532,
        contractAddresses: expect.objectContaining({
          jobMarketplace: '0xMockJob',
        }),
      })
    );
  });

  it('initialize() calls authenticate with config private key', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    expect(mockAuthenticate).toHaveBeenCalledWith('privatekey', {
      privateKey: '0xTestPrivateKey123',
    });
  });

  it('ensureSession() calls startSession() on first invocation', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    const sessionId = await bridge.ensureSession();
    expect(sessionId).toBe(42n);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(mockStartSession).toHaveBeenCalledWith(
      expect.objectContaining({
        chainId: 84532,
        host: '0xTestHost456',
        modelId: 'TestOrg/TestModel:test.gguf',
        paymentMethod: 'deposit',
        encryption: true,
      })
    );
  });

  it('ensureSession() returns same sessionId on second invocation without calling startSession again', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    const first = await bridge.ensureSession();
    const second = await bridge.ensureSession();
    expect(first).toBe(42n);
    expect(second).toBe(42n);
    expect(mockStartSession).toHaveBeenCalledTimes(1);
  });

  it('sendPrompt() calls sendPromptStreaming() with correct args', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    const onToken = vi.fn();
    await bridge.sendPrompt('Hello world', onToken);

    expect(mockSendPromptStreaming).toHaveBeenCalledWith(
      42n,
      'Hello world',
      onToken,
      undefined
    );
  });

  it('sendPrompt() returns response and tokenUsage from SDK', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    const result = await bridge.sendPrompt('Hello');
    expect(result.response).toBe('Hello from node');
    expect(result.tokenUsage).toEqual({ llmTokens: 10, vlmTokens: 0, totalTokens: 10 });
  });

  it('auto-recreates session on SESSION_NOT_FOUND error', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    // First ensureSession creates session 42n
    await bridge.ensureSession();

    // sendPromptStreaming fails with SESSION_NOT_FOUND
    const notFoundError = new Error('SESSION_NOT_FOUND');
    (notFoundError as any).code = 'SESSION_NOT_FOUND';
    mockSendPromptStreaming
      .mockRejectedValueOnce(notFoundError)
      .mockResolvedValueOnce('Recovered response');

    // New startSession returns new session
    mockStartSession.mockResolvedValueOnce({ sessionId: 99n, jobId: 2n });

    const result = await bridge.sendPrompt('test');
    expect(result.response).toBe('Recovered response');
    // startSession called twice: initial + recovery
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });

  it('auto-recreates session on SESSION_NOT_ACTIVE error', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    await bridge.ensureSession();

    const notActiveError = new Error('SESSION_NOT_ACTIVE');
    (notActiveError as any).code = 'SESSION_NOT_ACTIVE';
    mockSendPromptStreaming
      .mockRejectedValueOnce(notActiveError)
      .mockResolvedValueOnce('Recovered again');

    mockStartSession.mockResolvedValueOnce({ sessionId: 100n, jobId: 3n });

    const result = await bridge.sendPrompt('test');
    expect(result.response).toBe('Recovered again');
    expect(mockStartSession).toHaveBeenCalledTimes(2);
  });

  it('shutdown() calls endSession() on active session', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    await bridge.ensureSession();
    await bridge.shutdown();

    expect(mockEndSession).toHaveBeenCalledWith(42n);
  });

  it('ensureSession() omits host from startSession when hostAddress not configured', async () => {
    const noHostConfig: BridgeConfig = { ...testConfig, hostAddress: undefined };
    const bridge = new SessionBridge(noHostConfig);
    await bridge.initialize();

    await bridge.ensureSession();

    const callArg = mockStartSession.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('host');
    expect(callArg.modelId).toBe('TestOrg/TestModel:test.gguf');
    expect(callArg.encryption).toBe(true);
  });

  it('ensureSession() includes host in startSession when hostAddress is configured', async () => {
    const bridge = new SessionBridge(testConfig);
    await bridge.initialize();

    await bridge.ensureSession();

    const callArg = mockStartSession.mock.calls[0][0];
    expect(callArg.host).toBe('0xTestHost456');
  });
});
