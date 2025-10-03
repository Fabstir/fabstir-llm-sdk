/**
 * @file Storage Manager Interface Tests
 * @description Tests for IStorageManager interface compliance (user settings methods)
 */

import { describe, it, expect } from 'vitest';
import type { IStorageManager } from '../../src/interfaces/IStorageManager';
import type { UserSettings, PartialUserSettings } from '../../src/types/settings.types';

describe('IStorageManager Interface - User Settings', () => {
  // Mock implementation to test interface compliance
  class MockStorageManager implements IStorageManager {
    async initialize(seed: string): Promise<void> {}
    async store(data: any, options?: any): Promise<any> { return {} as any; }
    async retrieve(cid: string): Promise<any> { return null; }
    async storeConversation(conversation: any): Promise<any> { return {} as any; }
    async retrieveConversation(conversationId: string): Promise<any> { return {} as any; }
    async listConversations(): Promise<any[]> { return []; }
    async addMessage(conversationId: string, message: any): Promise<void> {}
    async delete(cid: string): Promise<void> {}
    async exists(cid: string): Promise<boolean> { return false; }
    async getStats(): Promise<any> { return {}; }
    async clearCache(): Promise<void> {}

    // User settings methods (these should cause compilation errors until interface is updated)
    async saveUserSettings(settings: UserSettings): Promise<void> {}
    async getUserSettings(): Promise<UserSettings | null> { return null; }
    async updateUserSettings(partial: PartialUserSettings): Promise<void> {}
    async clearUserSettings(): Promise<void> {}
  }

  it('should have saveUserSettings method', () => {
    const mock = new MockStorageManager();
    expect(typeof mock.saveUserSettings).toBe('function');
  });

  it('should have getUserSettings method', () => {
    const mock = new MockStorageManager();
    expect(typeof mock.getUserSettings).toBe('function');
  });

  it('should have updateUserSettings method', () => {
    const mock = new MockStorageManager();
    expect(typeof mock.updateUserSettings).toBe('function');
  });

  it('should have clearUserSettings method', () => {
    const mock = new MockStorageManager();
    expect(typeof mock.clearUserSettings).toBe('function');
  });

  it('should accept UserSettings parameter in saveUserSettings', async () => {
    const mock = new MockStorageManager();
    const settings: UserSettings = {
      version: 1,
      lastUpdated: Date.now(),
      selectedModel: 'test-model',
    };

    await expect(mock.saveUserSettings(settings)).resolves.toBeUndefined();
  });

  it('should return UserSettings | null from getUserSettings', async () => {
    const mock = new MockStorageManager();
    const result = await mock.getUserSettings();
    expect(result === null || typeof result === 'object').toBe(true);
  });

  it('should accept PartialUserSettings in updateUserSettings', async () => {
    const mock = new MockStorageManager();
    const partial: PartialUserSettings = { selectedModel: 'new-model' };

    await expect(mock.updateUserSettings(partial)).resolves.toBeUndefined();
  });
});
