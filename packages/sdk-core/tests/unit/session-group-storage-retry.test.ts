import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionGroupStorage } from '../../src/storage/SessionGroupStorage';

describe('SessionGroupStorage revision retry', () => {
  let storage: SessionGroupStorage;
  let mockPut: ReturnType<typeof vi.fn>;
  let mockEncryptionManager: any;
  let mockS5Client: any;

  const makeGroup = () => ({
    id: 'g1',
    name: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: 'test-user-address',
    linkedDatabases: [],
    chatSessions: [],
    chatSessionsData: {},
    documents: [],
    metadata: {},
    deleted: false,
  });

  beforeEach(() => {
    mockPut = vi.fn();
    mockS5Client = {
      fs: {
        put: mockPut,
        get: vi.fn(),
        delete: vi.fn(),
        ls: vi.fn().mockResolvedValue([]),
      },
    };
    mockEncryptionManager = {
      encryptForStorage: vi.fn().mockImplementation(async (_key: string, data: any) => data),
      decryptFromStorage: vi.fn().mockImplementation(async (_key: string, data: any) => ({ data })),
      getPublicKey: vi.fn().mockReturnValue('test-key'),
    };

    storage = new SessionGroupStorage(
      mockS5Client as any,
      'test-user-seed',
      'test-user-address',
      mockEncryptionManager,
    );
  });

  it('should retry on Revision number too low error', async () => {
    mockPut
      .mockRejectedValueOnce(new Error('Revision number too low'))
      .mockResolvedValueOnce(undefined);

    const group = makeGroup();
    await expect(storage.save(group, { waitForNetwork: false })).resolves.toBeUndefined();
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it('should retry on DirectoryTransactionException', async () => {
    mockPut
      .mockRejectedValueOnce(new Error('DirectoryTransactionException: already contains entry with same name'))
      .mockResolvedValueOnce(undefined);

    const group = makeGroup();
    await expect(storage.save(group, { waitForNetwork: false })).resolves.toBeUndefined();
    expect(mockPut).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries exhausted', async () => {
    mockPut.mockRejectedValue(new Error('Revision number too low'));

    const group = makeGroup();
    await expect(storage.save(group, { waitForNetwork: false })).rejects.toThrow('Revision number too low');
    expect(mockPut).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-revision errors', async () => {
    mockPut.mockRejectedValue(new Error('Invalid data format'));

    const group = makeGroup();
    await expect(storage.save(group, { waitForNetwork: false })).rejects.toThrow('Invalid data format');
    expect(mockPut).toHaveBeenCalledTimes(1);
  });
});
