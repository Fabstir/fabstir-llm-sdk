// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * AASigner — ethers v6 custom signer for ERC-4337 Smart Accounts.
 *
 * Routes all on-chain mutations through a caller-supplied `sendUserOp` callback
 * (bundler-agnostic) and delegates off-chain signing (`signMessage`,
 * `signTypedData`) to an internal EOA `ethers.Wallet`. Used internally by
 * FabstirSDKCore's `'aa-signer'` authentication mode.
 *
 * The EOA private key is constructed without a provider — it never broadcasts.
 * Asymmetric address surface: `getAddress()` returns the Smart Account; the
 * inner EOA wallet is exposed separately by FabstirSDKCore.getSigner().
 */

import { ethers } from 'ethers';
import { SDKError } from '../types';

export interface SendUserOpCall {
  to: string;
  data: string;
  /** wei (defaults to 0n when omitted) — per spec A.2 */
  value?: bigint;
}

export interface SendUserOpResult {
  /** Canonical L1 tx hash for the executed UserOp (NOT the EntryPoint relayer tx). */
  transactionHash: string;
  /** Spec A.2 permits the caller to include additional fields (userOpHash,
   * deployedAccount, etc.); sdk-core consumes only transactionHash. */
  [key: string]: unknown;
}

export type SendUserOpFn = (call: SendUserOpCall) => Promise<SendUserOpResult>;

export interface AASignerOptions {
  smartAccountAddress: string;
  eoaPrivateKey: string;
  sendUserOp: SendUserOpFn;
  chainId: number;
}

const RECEIPT_FETCH_ATTEMPTS = 5;
const RECEIPT_FETCH_DELAY_MS = 500;

// Type-2 tx params require a non-null `signature`. Consumers don't read this
// for AA-mined txs (it's not a real ECDSA sig over the inner call), but ethers'
// TransactionResponse constructor must see a syntactically-valid Signature.
// Built fresh per call — ethers Signature has public r/s/v setters, so a
// shared module-level instance could be mutated and bleed across responses.
const DUMMY_SIGNATURE_HEX = '0x' + '01'.repeat(32) + '01'.repeat(32) + '1c';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class AASigner extends ethers.AbstractSigner {
  private readonly _opts: AASignerOptions;
  private readonly _eoaWallet: ethers.Wallet;

  constructor(opts: AASignerOptions, provider?: ethers.Provider) {
    super(provider);
    this._opts = opts;
    // Providerless wallet — pure offline signer for signMessage / signTypedData.
    // The EOA holds no ETH; its sendTransaction must never run.
    this._eoaWallet = new ethers.Wallet(opts.eoaPrivateKey);
  }

  async getAddress(): Promise<string> {
    return this._opts.smartAccountAddress;
  }

  connect(provider: ethers.Provider | null): AASigner {
    return new AASigner(this._opts, provider ?? undefined);
  }

  async signTransaction(_tx: ethers.TransactionRequest): Promise<string> {
    throw new SDKError(
      'AASigner does not support raw signTransaction; use sendTransaction (routes through sendUserOp)',
      'AA_SIGN_TRANSACTION_UNSUPPORTED',
    );
  }

  async signMessage(message: string | Uint8Array): Promise<string> {
    return this._eoaWallet.signMessage(message);
  }

  async signTypedData(
    domain: ethers.TypedDataDomain,
    types: Record<string, Array<ethers.TypedDataField>>,
    value: Record<string, unknown>,
  ): Promise<string> {
    return this._eoaWallet.signTypedData(domain, types, value);
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    const provider = this.provider;
    if (!provider) {
      throw new SDKError('[AASigner] provider missing — cannot send tx', 'AA_PROVIDER_MISSING');
    }
    if (tx.to == null) {
      throw new SDKError('[AASigner] tx.to is required', 'AA_TX_TO_REQUIRED');
    }
    const to = tx.to as string;
    const data = (tx.data as string) ?? '0x';
    const value =
      typeof tx.value === 'bigint'
        ? tx.value
        : tx.value != null
          ? BigInt(tx.value.toString())
          : 0n;

    const { transactionHash } = await this._opts.sendUserOp({ to, data, value });
    const receipt = await this._fetchReceiptWithRetry(provider, transactionHash);

    const params: ethers.TransactionResponseParams = {
      hash: transactionHash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      index: 0,
      from: this._opts.smartAccountAddress,
      to,
      nonce: 0,
      type: 2,
      chainId: BigInt(this._opts.chainId),
      gasLimit: receipt.gasUsed,
      gasPrice: receipt.gasPrice ?? 0n,
      maxFeePerGas: receipt.gasPrice ?? 0n,
      maxPriorityFeePerGas: 0n,
      data,
      value,
      signature: ethers.Signature.from(DUMMY_SIGNATURE_HEX),
      accessList: null,
      maxFeePerBlobGas: null,
      blobVersionedHashes: null,
      authorizationList: null,
    };

    const response = new ethers.TransactionResponse(params, provider);
    // confirms > 1 → delegate so PaymentManager.sendEth, TreasuryManager.deposit
    // and other direct-call sites keep their N-confirmation reorg protection.
    (response as unknown as { wait: ethers.TransactionResponse['wait'] }).wait = async (
      confirms?: number,
      timeout?: number,
    ) => {
      if (confirms != null && confirms > 1) {
        return provider.waitForTransaction(transactionHash, confirms, timeout);
      }
      return receipt;
    };

    return response;
  }

  private async _fetchReceiptWithRetry(
    provider: ethers.Provider,
    hash: string,
  ): Promise<ethers.TransactionReceipt> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RECEIPT_FETCH_ATTEMPTS; attempt++) {
      try {
        const receipt = await provider.getTransactionReceipt(hash);
        if (receipt) return receipt;
      } catch (err) {
        lastError = err;
      }
      if (attempt < RECEIPT_FETCH_ATTEMPTS) {
        await sleep(RECEIPT_FETCH_DELAY_MS);
      }
    }
    const lastMessage = lastError instanceof Error ? lastError.message : 'none';
    throw new SDKError(
      `[AASigner] Receipt for tx ${hash} not visible on RPC after ${RECEIPT_FETCH_ATTEMPTS} attempts (~${(RECEIPT_FETCH_ATTEMPTS - 1) * RECEIPT_FETCH_DELAY_MS}ms wall time). UserOp may have succeeded on bundler view but the SDK's RPC node has not yet seen it. Last error: ${lastMessage}`,
      'AA_RECEIPT_NOT_VISIBLE',
    );
  }
}
