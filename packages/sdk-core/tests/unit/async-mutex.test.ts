import { describe, it, expect } from 'vitest';
import { AsyncMutex } from '../../src/utils/AsyncMutex';

describe('AsyncMutex', () => {
  it('should serialize operations with the same key', async () => {
    const mutex = new AsyncMutex();
    const order: number[] = [];

    const op1 = mutex.withLock('key-a', async () => {
      order.push(1);
      await new Promise(r => setTimeout(r, 50));
      order.push(2);
      return 'first';
    });

    const op2 = mutex.withLock('key-a', async () => {
      order.push(3);
      return 'second';
    });

    const [r1, r2] = await Promise.all([op1, op2]);
    expect(r1).toBe('first');
    expect(r2).toBe('second');
    // op2 must not start (push 3) until op1 finishes (push 2)
    expect(order).toEqual([1, 2, 3]);
  });

  it('should allow parallel operations with different keys', async () => {
    const mutex = new AsyncMutex();
    const running: string[] = [];

    const op1 = mutex.withLock('key-a', async () => {
      running.push('a-start');
      await new Promise(r => setTimeout(r, 50));
      running.push('a-end');
    });

    const op2 = mutex.withLock('key-b', async () => {
      running.push('b-start');
      await new Promise(r => setTimeout(r, 50));
      running.push('b-end');
    });

    await Promise.all([op1, op2]);
    // Both should have started before either ended
    const aStart = running.indexOf('a-start');
    const bStart = running.indexOf('b-start');
    const aEnd = running.indexOf('a-end');
    const bEnd = running.indexOf('b-end');
    expect(bStart).toBeLessThan(aEnd);
    expect(aStart).toBeLessThan(bEnd);
  });

  it('should continue after previous operation fails', async () => {
    const mutex = new AsyncMutex();

    const op1 = mutex.withLock('key-a', async () => {
      throw new Error('op1 failed');
    });
    await expect(op1).rejects.toThrow('op1 failed');

    const result = await mutex.withLock('key-a', async () => 'recovered');
    expect(result).toBe('recovered');
  });

  it('should clean up lock map after completion', async () => {
    const mutex = new AsyncMutex();

    await mutex.withLock('key-a', async () => 'done');
    expect((mutex as any).locks.size).toBe(0);
  });

  it('should handle 10 rapid sequential calls on same key in order', async () => {
    const mutex = new AsyncMutex();
    const results: number[] = [];

    const ops = Array.from({ length: 10 }, (_, i) =>
      mutex.withLock('key-a', async () => {
        results.push(i);
      })
    );

    await Promise.all(ops);
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});
