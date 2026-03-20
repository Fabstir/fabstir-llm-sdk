// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

describe('SDK Core Transcode Integration', () => {
  it('ITranscodeManager is exported from interfaces', async () => {
    const interfaces = await import('../../src/interfaces');
    expect(interfaces).toHaveProperty('ITranscodeManager');
  });

  it('TranscodeManager is exported from managers', async () => {
    const { TranscodeManager } = await import('../../src/managers/TranscodeManager');
    expect(TranscodeManager).toBeDefined();
    expect(typeof TranscodeManager).toBe('function');
  });

  it('FabstirSDKCore has getTranscodeManager method', async () => {
    const { FabstirSDKCore } = await import('../../src/FabstirSDKCore');
    expect(FabstirSDKCore.prototype.getTranscodeManager).toBeDefined();
    expect(typeof FabstirSDKCore.prototype.getTranscodeManager).toBe('function');
  });
});
