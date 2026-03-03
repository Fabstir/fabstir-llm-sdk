import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionAdapter } from '../../src/core/SessionAdapter';
import type { SessionAdapterConfig, OrchestratorSession } from '../../src/types';

function createMockSDK() {
  const sessionManager = {
    startSession: vi.fn().mockResolvedValue({ sessionId: 1n, jobId: 10n }),
    sendPromptStreaming: vi.fn().mockResolvedValue('test response'),
    endSession: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getSessionManager: vi.fn().mockReturnValue(sessionManager),
    _sessionManager: sessionManager,
  };
}

describe('SessionAdapter', () => {
  let sdk: ReturnType<typeof createMockSDK>;
  let adapter: SessionAdapter;
  const config: SessionAdapterConfig = {
    chainId: 84532,
    depositAmount: '0.001',
    encryption: true,
  };

  beforeEach(() => {
    sdk = createMockSDK();
    adapter = new SessionAdapter(sdk as any);
  });

  it('constructor accepts FabstirSDKCore instance', () => {
    expect(adapter).toBeDefined();
  });

  it('createSession calls startSession with model and chainId', async () => {
    await adapter.createSession('repo:file.gguf', config);
    expect(sdk._sessionManager.startSession).toHaveBeenCalledWith(
      expect.objectContaining({ chainId: 84532 }),
    );
  });

  it('createSession passes chainId, deposit, encryption to startSession', async () => {
    await adapter.createSession('repo:file.gguf', config);
    const call = sdk._sessionManager.startSession.mock.calls[0][0];
    expect(call.chainId).toBe(84532);
    expect(call.depositAmount).toBe('0.001');
    expect(call.encryption).toBe(true);
  });

  it('createSession returns OrchestratorSession with sessionId and jobId', async () => {
    const session = await adapter.createSession('repo:file.gguf', config);
    expect(session.sessionId).toBe(1n);
    expect(session.jobId).toBe(10n);
    expect(session.model).toBe('repo:file.gguf');
    expect(session.chainId).toBe(84532);
  });

  it('sendPrompt calls sendPromptStreaming with correct sessionId', async () => {
    await adapter.sendPrompt(1n, 'Hello');
    expect(sdk._sessionManager.sendPromptStreaming).toHaveBeenCalledWith(
      1n, 'Hello', undefined, expect.any(Object),
    );
  });

  it('sendPrompt prepends systemPrompt to prompt', async () => {
    await adapter.sendPrompt(1n, 'Hello', 'You are helpful');
    const call = sdk._sessionManager.sendPromptStreaming.mock.calls[0];
    expect(call[1]).toBe('System: You are helpful\n\nHello');
  });

  it('sendPrompt returns response string', async () => {
    const result = await adapter.sendPrompt(1n, 'Hello');
    expect(result.response).toBe('test response');
  });

  it('endSession calls sessionManager.endSession', async () => {
    await adapter.endSession(1n);
    expect(sdk._sessionManager.endSession).toHaveBeenCalledWith(1n);
  });

  it('sendPrompt with onToken streams tokens', async () => {
    const onToken = vi.fn();
    await adapter.sendPrompt(1n, 'Hello', undefined, onToken);
    expect(sdk._sessionManager.sendPromptStreaming).toHaveBeenCalledWith(
      1n, 'Hello', onToken, expect.any(Object),
    );
  });

  it('sendPrompt passes PromptOptions with AbortSignal', async () => {
    const controller = new AbortController();
    await adapter.sendPrompt(1n, 'Hello', undefined, undefined, { signal: controller.signal });
    const call = sdk._sessionManager.sendPromptStreaming.mock.calls[0];
    expect(call[3].signal).toBe(controller.signal);
  });

  it('createSession passes modelId field (not modelName or model)', async () => {
    await adapter.createSession('CohereForAI/TinyVicuna:tiny.gguf', config);
    const call = sdk._sessionManager.startSession.mock.calls[0][0];
    expect(call.modelId).toBe('CohereForAI/TinyVicuna:tiny.gguf');
    expect(call.modelName).toBeUndefined();
    expect(call.model).toBeUndefined();
  });

  it('sendPrompt returns tokensUsed from onTokenUsage callback', async () => {
    sdk._sessionManager.sendPromptStreaming.mockImplementation(
      async (_sid: bigint, _p: string, _onToken: any, options: any) => {
        if (options?.onTokenUsage) {
          options.onTokenUsage({ totalTokens: 42 });
        }
        return 'response';
      },
    );
    const result = await adapter.sendPrompt(1n, 'Hello');
    expect(result.tokensUsed).toBe(42);
  });
});
