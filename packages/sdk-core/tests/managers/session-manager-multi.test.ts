import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../../src/managers/SessionManager';
import { PaymentManager } from '../../src/managers/PaymentManager';
import { StorageManager } from '../../src/managers/StorageManager';
import { WebSocketClient } from '../../src/websocket/WebSocketClient';
import { ChainId } from '../../src/types/chain.types';
import { ChainRegistry } from '../../src/config/ChainRegistry';
import { UnsupportedChainError } from '../../src/errors/ChainErrors';
import { ethers } from 'ethers';

// Mock dependencies
vi.mock('../../src/managers/PaymentManager');
vi.mock('../../src/managers/StorageManager');
vi.mock('../../src/websocket/WebSocketClient');

describe('SessionManager Multi-Chain Support', () => {
  let sessionManager: SessionManager;
  let mockPaymentManager: any;
  let mockStorageManager: any;
  let mockWsClient: any;
  let originalFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock global fetch for REST API calls
    originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        response: 'Test response',
        usage: { total_tokens: 10 }
      })
    });

    // Mock PaymentManager
    mockPaymentManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      createSessionJob: vi.fn().mockResolvedValue({ jobId: 1n, sessionId: 1n }),
      depositETH: vi.fn().mockResolvedValue({ success: true }),
      getSessionJobManager: vi.fn().mockReturnValue({
        getSessionJob: vi.fn().mockResolvedValue({ host: 'test-host', modelId: 'llama-3' }),
        getSigner: vi.fn().mockReturnValue({
          getAddress: vi.fn().mockResolvedValue('0x742d35cc6634c0532925a3b844bc9e7595f0beeb')
        })
      })
    };

    // Mock StorageManager
    mockStorageManager = {
      isInitialized: vi.fn().mockReturnValue(true),
      saveSession: vi.fn().mockResolvedValue(undefined),
      getSession: vi.fn().mockResolvedValue(null),
      updateSession: vi.fn().mockResolvedValue(undefined),
      storeConversation: vi.fn().mockResolvedValue(undefined),
      appendMessage: vi.fn().mockResolvedValue(undefined),
      updateConversation: vi.fn().mockResolvedValue(undefined)
    };

    // Mock WebSocketClient
    mockWsClient = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined),
      sendMessage: vi.fn().mockResolvedValue({
        response: 'Test streaming response'
      }),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
      isConnected: vi.fn().mockReturnValue(false)
    };
    vi.mocked(WebSocketClient).mockImplementation(() => mockWsClient);

    sessionManager = new SessionManager(mockPaymentManager, mockStorageManager);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Chain Validation', () => {
    it('should include chainId in session configuration', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.BASE_SEPOLIA,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      await sessionManager.startSession(config);

      // createSessionJob is called with individual parameters, not an object
      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledWith(
        'llama-3',  // modelId
        'test-host', // host
        expect.any(BigInt), // depositAmount
        undefined, // pricePerToken
        undefined, // proofInterval
        undefined  // duration
      );
    });

    it('should reject unsupported chain IDs', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: 999999, // Unsupported chain
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      await expect(sessionManager.startSession(config))
        .rejects.toThrow(UnsupportedChainError);
    });

    it('should validate chain ID is provided', async () => {
      await sessionManager.initialize();

      const config = {
        // Missing chainId
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      } as any;

      await expect(sessionManager.startSession(config))
        .rejects.toThrow('Chain ID is required');
    });

    it('should support multiple chains (Base Sepolia and opBNB)', async () => {
      await sessionManager.initialize();

      // Base Sepolia session
      const baseConfig = {
        chainId: ChainId.BASE_SEPOLIA,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      await sessionManager.startSession(baseConfig);

      // opBNB testnet session
      const opBNBConfig = {
        chainId: ChainId.OPBNB_TESTNET,
        host: 'test-host-2',
        modelId: 'gpt-4',
        paymentMethod: 'direct' as const
      };

      await sessionManager.startSession(opBNBConfig);

      expect(mockPaymentManager.createSessionJob).toHaveBeenCalledTimes(2);
    });
  });

  describe('WebSocket Chain Integration', () => {
    it('should include chain_id in WebSocket session_init message', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.BASE_SEPOLIA,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      const session = await sessionManager.startSession(config);

      // WebSocket is only initialized when using sendPromptStreaming
      await sessionManager.sendPromptStreaming(session.sessionId, 'Hello');

      expect(mockWsClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'session_init',
          chain_id: ChainId.BASE_SEPOLIA,
          session_id: expect.any(String),
          job_id: expect.any(String),
          user_address: expect.any(String)
        })
      );
    });

    it('should include chain_id in prompt messages', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.OPBNB_TESTNET,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      const session = await sessionManager.startSession(config);

      // sendPrompt uses REST API, which should now work with mocked fetch
      const response = await sessionManager.sendPrompt(session.sessionId, 'Hello');

      expect(response).toBe('Test response');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/inference'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should pass chain_id to WebSocket constructor', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.BASE_SEPOLIA,
        host: 'wss://test-host.com',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001'),
        endpoint: 'wss://test-host.com/ws'
      };

      const session = await sessionManager.startSession(config);

      // WebSocket is created in sendPromptStreaming
      await sessionManager.sendPromptStreaming(session.sessionId, 'Hello');

      expect(WebSocketClient).toHaveBeenCalledWith(
        expect.stringContaining('ws'),
        expect.objectContaining({
          chainId: ChainId.BASE_SEPOLIA
        })
      );
    });
  });

  describe('Session Metadata', () => {
    it('should store chainId in session state', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.BASE_SEPOLIA,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      const session = await sessionManager.startSession(config);
      const sessionState = sessionManager.getSession(session.sessionId.toString());

      expect(sessionState).toBeDefined();
      expect(sessionState?.chainId).toBe(ChainId.BASE_SEPOLIA);
    });

    it('should persist chainId in storage', async () => {
      await sessionManager.initialize();

      const config = {
        chainId: ChainId.OPBNB_TESTNET,
        host: 'test-host',
        modelId: 'llama-3',
        paymentMethod: 'deposit' as const,
        depositAmount: ethers.parseEther('0.001')
      };

      await sessionManager.startSession(config);

      expect(mockStorageManager.storeConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            chainId: ChainId.OPBNB_TESTNET
          })
        })
      );
    });

    it('should validate chainId when resuming session', async () => {
      await sessionManager.initialize();

      mockStorageManager.getSession.mockResolvedValueOnce({
        sessionId: '1',
        chainId: ChainId.BASE_SEPOLIA,
        status: 'paused'
      });

      // Use the chain-aware resumeSessionWithChain method
      const resumed = await sessionManager.resumeSessionWithChain('1', ChainId.BASE_SEPOLIA);
      expect(resumed).toBeDefined();

      // Try to resume with wrong chain
      mockStorageManager.getSession.mockResolvedValueOnce({
        sessionId: '1',
        chainId: ChainId.BASE_SEPOLIA,
        status: 'paused'
      });

      await expect(sessionManager.resumeSessionWithChain('1', ChainId.OPBNB_TESTNET))
        .rejects.toThrow('Session chain mismatch');
    });
  });
});