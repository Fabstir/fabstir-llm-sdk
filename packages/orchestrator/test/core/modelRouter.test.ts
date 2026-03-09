import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ModelRouter } from '../../src/core/ModelRouter';
import type { OrchestratorTask, ModelAssignment } from '../../src/types';

const FAST_MODEL = 'FastRepo/FastModel-GGUF:fast.gguf';
const DEEP_MODEL = 'DeepRepo/DeepModel-GGUF:deep.gguf';

function createMockSDK(hostCount = 2) {
  const modelManager = {
    getAvailableModelsWithHosts: vi.fn().mockResolvedValue([
      {
        model: { huggingfaceRepo: 'FastRepo/FastModel-GGUF', fileName: 'fast.gguf', modelId: '0xaaa' },
        hostCount,
        priceRange: { min: 1n, max: 2n, avg: 1n },
        isAvailable: hostCount > 0,
      },
      {
        model: { huggingfaceRepo: 'DeepRepo/DeepModel-GGUF', fileName: 'deep.gguf', modelId: '0xbbb' },
        hostCount,
        priceRange: { min: 2n, max: 4n, avg: 3n },
        isAvailable: hostCount > 0,
      },
    ]),
  };
  return {
    getModelManager: vi.fn().mockReturnValue(modelManager),
    _modelManager: modelManager,
  };
}

function makeTask(overrides: Partial<OrchestratorTask> = {}): OrchestratorTask {
  return {
    id: 't1',
    name: 'test task',
    prompt: 'do something',
    systemPrompt: 'you are helpful',
    taskType: 'analysis',
    blockedBy: [],
    ...overrides,
  };
}

describe('ModelRouter', () => {
  let sdk: ReturnType<typeof createMockSDK>;
  let router: ModelRouter;

  beforeEach(async () => {
    sdk = createMockSDK();
    router = new ModelRouter(sdk as any, { fast: FAST_MODEL, deep: DEEP_MODEL });
    await router.initialize();
  });

  it('routes tool-calling tasks to deep model', () => {
    const result = router.assign(makeTask({ taskType: 'tool-calling' }));
    expect(result.target).toBe('internal');
    expect(result.model).toBe(DEEP_MODEL);
  });

  it('routes analysis tasks to deep model', () => {
    const result = router.assign(makeTask({ taskType: 'analysis' }));
    expect(result.target).toBe('internal');
    expect(result.model).toBe(DEEP_MODEL);
  });

  it('routes synthesis tasks to deep model', () => {
    const result = router.assign(makeTask({ taskType: 'synthesis' }));
    expect(result.target).toBe('internal');
    expect(result.model).toBe(DEEP_MODEL);
  });

  it('routes small analysis (< 2000 tokens) to fast model', () => {
    const result = router.assign(
      makeTask({ taskType: 'analysis', hints: { estimatedTokens: 500 } }),
    );
    expect(result.target).toBe('internal');
    expect(result.model).toBe(FAST_MODEL);
  });

  it('respects explicit preferredModel hint', () => {
    const result = router.assign(
      makeTask({ taskType: 'external', hints: { preferredModel: 'deep' } }),
    );
    expect(result.target).toBe('internal');
    expect(result.model).toBe(DEEP_MODEL);
  });

  it('routes external tasks to external-a2a', () => {
    const result = router.assign(
      makeTask({
        taskType: 'external',
        hints: { externalAgentUrl: 'https://agent.example.com' },
      }),
    );
    expect(result.target).toBe('external-a2a');
    expect(result.reason).toContain('external');
  });

  it('defaults unknown taskType to fast model', () => {
    const result = router.assign(makeTask({ taskType: 'external' }));
    expect(result.target).toBe('internal');
    expect(result.model).toBe(FAST_MODEL);
  });

  it('initialize discovers available models via ModelManager', async () => {
    expect(sdk.getModelManager).toHaveBeenCalled();
    expect(sdk._modelManager.getAvailableModelsWithHosts).toHaveBeenCalled();
    const models = router.getAvailableModels();
    expect(models).toContain(FAST_MODEL);
    expect(models).toContain(DEEP_MODEL);
    expect(models).toHaveLength(2);
  });

  it('throws when configured model has no available hosts', async () => {
    const emptySdk = createMockSDK(0);
    const badRouter = new ModelRouter(emptySdk as any, {
      fast: FAST_MODEL,
      deep: DEEP_MODEL,
    });
    await expect(badRouter.initialize()).rejects.toThrow(/no available hosts/i);
  });
});
