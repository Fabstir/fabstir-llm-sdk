// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Once a funding transaction has been sent, money may have moved: every failure from here carries the
 * transaction hash, and a session id is never reported as 0 — nobody can reclaim a deposit by id 0. No outcome
 * is `retryable` (§21 BB5): funding again could pay twice (unresolved, uncertain), or override the user's own
 * cancel in their wallet, or repeat a revert (not funded) — the caller acts on the code.
 *
 * A receipt failure is classified rather than assumed unknown (R11): a reverted, cancelled or replaced
 * transaction moved no money and is SESSION_NOT_FUNDED; a repriced one (sped up by the wallet) funded the
 * session through its replacement; anything else is SESSION_ID_UNRESOLVED — the outcome is not known. A send that
 * failed with no hash to name may still have been broadcast: SESSION_FUNDING_UNCERTAIN (§34 OO3).
 */

import { SDKError } from '../types';

/** `SESSION_ID_UNRESOLVED` — the entry-exported error class, so consumers read `details.txHash`. */
export function sessionIdUnresolved(message: string, txHash: string, cause?: unknown): SDKError {
  return new SDKError(message, 'SESSION_ID_UNRESOLVED', { txHash, ...(cause === undefined ? {} : { cause }), retryable: false });
}

function sessionNotFunded(message: string, txHash: string, details: Record<string, unknown>): SDKError {
  return new SDKError(message, 'SESSION_NOT_FUNDED', { txHash, ...details, retryable: false });
}

/**
 * ethers' codes for a send refused before anything was broadcast (§34 OO3): the user's rejection in the wallet (4001
 * when a wallet's error reaches us unmapped), a revert in gas estimation, and what the node refuses to accept — too
 * little to pay, a used nonce, an underpriced replacement. Not INVALID_ARGUMENT: ethers raises it after a broadcast
 * too, for a malformed reply to a read made with it (§35 PP4).
 */
const REFUSED_BEFORE_BROADCAST = new Set<unknown>([
  'ACTION_REJECTED', 4001, 'CALL_EXCEPTION', 'INSUFFICIENT_FUNDS', 'NONCE_EXPIRED', 'REPLACEMENT_UNDERPRICED',
]);

/**
 * A failure after a transaction was broadcast, marked with its hash the way ethers marks its own
 * (`info.sendTransactionHash`) — what `sendFunding` reads: SESSION_ID_UNRESOLVED with it (§35 PP5). For the SDK's
 * own signers, once they hold the hash.
 */
export function afterBroadcast(error: unknown, hash: string): Error {
  const marked: any = error instanceof Error ? error : new Error(String(error));
  marked.info = { ...marked.info, sendTransactionHash: hash };
  return marked;
}

/**
 * Send a funding transaction, re-armed for replacement detection (S3). The start block is taken before
 * sending: ethers' contract wrapper sets it to -1 (`provider.js:963`), which turns replacement scanning off
 * (`:1048-1053`, `:1196`) — a sped-up, cancelled or replaced funding transaction would be waited on forever.
 *
 * A failed send is classified too (§34 OO3): one that carries the hash it broadcast (a browser wallet's poll after
 * `eth_sendTransaction`) is SESSION_ID_UNRESOLVED; one refused before any broadcast is rethrown as it came — nothing
 * was funded; anything else may have been broadcast (a lost reply) — SESSION_FUNDING_UNCERTAIN, never "nothing funded".
 */
export async function sendFunding(provider: { getBlockNumber(): Promise<number> }, send: () => Promise<any>): Promise<any> {
  const startBlock = await provider.getBlockNumber();
  let tx: any;
  try {
    tx = await send();
  } catch (cause: any) {
    const hash = cause?.info?.sendTransactionHash;
    if (typeof hash === 'string') throw sessionIdUnresolved(`Session transaction ${hash} was sent but could not be read back`, hash, cause);
    if (REFUSED_BEFORE_BROADCAST.has(cause?.code)) throw cause;
    throw new SDKError(
      `The session transaction may have been sent (${cause?.message ?? cause}) — check the wallet's activity before starting again`,
      'SESSION_FUNDING_UNCERTAIN', { cause, retryable: false },
    );
  }
  return tx.replaceableTransaction(startBlock);
}

/**
 * This call's creation event (§35 PP7): logged by the marketplace and naming `sender` in its creator topic (`depositor`,
 * or `delegate` for a delegated session) — never another sender's creation from the same bundle (an ERC-4337 bundle
 * carries many). `creatorTopic`: each creation event's topic hash → the index of its creator topic. String comparisons
 * only: nothing here throws once money may have moved.
 */
export function ownCreationLog<L extends { address?: string; topics: readonly string[] }>(
  logs: readonly L[], market: string, sender: string, creatorTopic: Record<string, number>,
): L | undefined {
  const creator = String(sender).slice(-40).toLowerCase();
  return logs.find((log) => {
    const at = creatorTopic[log.topics[0]];
    return at !== undefined && String(log.address).toLowerCase() === String(market).toLowerCase()
      && String(log.topics[at]).slice(-40).toLowerCase() === creator;
  });
}

/**
 * The receipt of a sent funding transaction that succeeded, SESSION_NOT_FUNDED when it provably did not,
 * or SESSION_ID_UNRESOLVED carrying its hash when that cannot be told.
 */
export async function awaitFundingReceipt(tx: { hash: string; wait(confirmations?: number): Promise<any> }, confirmations?: number): Promise<any> {
  let receipt: any;
  try {
    receipt = await tx.wait(confirmations);
  } catch (cause: any) {
    if (cause?.code === 'TRANSACTION_REPLACED' && cause.reason === 'repriced' && cause.receipt) {
      receipt = cause.receipt; // the same call, mined under the replacement's hash
    } else if (cause?.code === 'TRANSACTION_REPLACED') {
      throw sessionNotFunded(`Session transaction ${tx.hash} was ${cause.reason ?? 'replaced'}; no session was funded`, tx.hash,
        { reason: cause.reason, replacementHash: cause.replacement?.hash ?? cause.receipt?.hash, cause });
    } else if (cause?.code === 'CALL_EXCEPTION' && cause.receipt?.status === 0) {
      throw sessionNotFunded(`Session transaction ${tx.hash} reverted; no session was funded`, tx.hash, { reason: 'reverted', cause });
    } else {
      throw sessionIdUnresolved(`Session transaction ${tx.hash} was sent but its receipt could not be read`, tx.hash, cause);
    }
  }
  if (receipt?.status === 0) {
    throw sessionNotFunded(`Session transaction ${receipt.hash ?? tx.hash} reverted; no session was funded`, tx.hash, { reason: 'reverted', receiptHash: receipt.hash });
  }
  return receipt;
}
