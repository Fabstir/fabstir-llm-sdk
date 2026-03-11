import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { X402PaymentPayload } from '../../src/x402/types';

const mockWait = vi.fn().mockResolvedValue({ hash: '0xTxHash123' });
const mockTransferWithAuth = vi.fn().mockResolvedValue({ wait: mockWait });
const mockSignatureFrom = vi.fn().mockReturnValue({ v: 27, r: '0xR', s: '0xS' });

vi.mock('ethers', () => {
  function MockContract() { return { transferWithAuthorization: mockTransferWithAuth }; }
  return { ethers: { Contract: MockContract, Signature: { from: mockSignatureFrom } } };
});

function validPayload(): X402PaymentPayload {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'base-sepolia',
    payload: {
      signature: '0xFullSignature',
      authorization: {
        from: '0xPayer',
        to: '0xRecipient',
        value: '1000000',
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 3600),
        nonce: '0x01',
      },
    },
  };
}

describe('X402PaymentValidator', () => {
  let X402PaymentValidator: typeof import('../../src/x402/server/X402PaymentValidator').X402PaymentValidator;
  let ethers: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockWait.mockResolvedValue({ hash: '0xTxHash123' });
    mockTransferWithAuth.mockResolvedValue({ wait: mockWait });
    const mod = await import('../../src/x402/server/X402PaymentValidator');
    X402PaymentValidator = mod.X402PaymentValidator;
    ethers = (await import('ethers')).ethers;
  });

  it('validate calls transferWithAuthorization on USDC contract', async () => {
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    await validator.validate(validPayload());
    expect(mockTransferWithAuth).toHaveBeenCalledTimes(1);
    const args = mockTransferWithAuth.mock.calls[0];
    expect(args[0]).toBe('0xPayer'); // from
    expect(args[1]).toBe('0xRecipient'); // to
    expect(args[2]).toBe('1000000'); // value
  });

  it('validate waits for 3 confirmations', async () => {
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    await validator.validate(validPayload());
    expect(mockWait).toHaveBeenCalledWith(3);
  });

  it('validate returns success response with tx hash on success', async () => {
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    const result = await validator.validate(validPayload());
    expect(result.success).toBe(true);
    expect(result.transaction).toBe('0xTxHash123');
    expect(result.network).toBe('base-sepolia');
    expect(result.payer).toBe('0xPayer');
  });

  it('validate returns failure response on revert', async () => {
    mockTransferWithAuth.mockRejectedValueOnce(new Error('execution reverted'));
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    const result = await validator.validate(validPayload());
    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('execution reverted');
    expect(result.network).toBe('base-sepolia');
  });

  it('validate propagates contract errors gracefully', async () => {
    mockTransferWithAuth.mockRejectedValueOnce(new Error('insufficient funds'));
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    const result = await validator.validate(validPayload());
    expect(result.success).toBe(false);
    expect(result.errorReason).toContain('insufficient funds');
  });

  it('validate extracts v, r, s from signature', async () => {
    const validator = new X402PaymentValidator({} as any, '0xUSDC');
    await validator.validate(validPayload());
    expect(mockSignatureFrom).toHaveBeenCalledWith('0xFullSignature');
    const args = mockTransferWithAuth.mock.calls[0];
    expect(args[6]).toBe(27); // v
    expect(args[7]).toBe('0xR'); // r
    expect(args[8]).toBe('0xS'); // s
  });

});
