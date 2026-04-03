/**
 * Per-key async mutex using promise-chain serialization.
 * Extracted from StorageManager.withConversationLock().
 */
export class AsyncMutex {
  private locks: Map<string, Promise<any>> = new Map();

  async withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const existingLock = this.locks.get(key);

    const wrappedOperation = (async () => {
      if (existingLock) {
        try {
          await existingLock;
        } catch {
          // Previous operation failed, but we still proceed
        }
      }
      return operation();
    })();

    this.locks.set(key, wrappedOperation);

    try {
      return await wrappedOperation;
    } finally {
      if (this.locks.get(key) === wrappedOperation) {
        this.locks.delete(key);
      }
    }
  }
}
