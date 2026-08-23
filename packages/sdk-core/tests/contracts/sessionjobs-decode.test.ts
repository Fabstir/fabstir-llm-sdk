// sessionJobs decode fix (2026-08-23): the wrapper's mapping carried a phantom `requester`
// at index 2, shifting every field from `host` onward (host ← paymentToken, deposit ←
// pricePerToken, …). Found independently from both sides of the seam; the node pinned the
// deployed word layout with a LIVE byte fixture. This test does the same client-side:
// fixtures/sessionjobs_931.hex is the RAW eth_call return for sessionJobs(931) on Base
// Sepolia (fetched 2026-08-23 against the .env.test deployment) — real bytes pin the
// chain, hand-written vectors pin only what their author believed.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Interface, isAddress } from 'ethers';
import JobMarketplaceABI from '../../src/contracts/abis/JobMarketplaceWithModelsUpgradeable-CLIENT-ABI.json';
import { mapSessionJob } from '../../src/contracts/JobMarketplace';

const raw = readFileSync(join(__dirname, 'fixtures', 'sessionjobs_931.hex'), 'utf8').trim();
const iface = new Interface((JobMarketplaceABI as any).abi ?? JobMarketplaceABI);
const named = iface.decodeFunctionResult('sessionJobs', raw);

describe('sessionJobs decode against live chain bytes (session 931)', () => {
  const job = mapSessionJob(named);

  it('maps every field to its NAMED decode counterpart — no phantom, no shift', () => {
    expect(job.id).toBe(Number(named.id));
    expect(job.depositor).toBe(named.depositor);
    expect(job.host).toBe(named.host);
    expect(job.paymentToken).toBe(named.paymentToken);
    expect(job.deposit).toBe(named.deposit.toString());
    expect(job.pricePerToken).toBe(Number(named.pricePerToken));
    expect(job.tokensUsed).toBe(Number(named.tokensUsed));
    expect(job.maxDuration).toBe(Number(named.maxDuration));
    expect(job.startTime).toBe(Number(named.startTime));
    expect(job.lastProofTime).toBe(Number(named.lastProofTime));
    expect(job.proofInterval).toBe(Number(named.proofInterval));
    expect(job.proofTimeoutWindow).toBe(Number(named.proofTimeoutWindow));
    expect(job.status).toBe(Number(named.status));
    expect(job.withdrawnByHost).toBe(named.withdrawnByHost.toString());
    expect(job.refundedToUser).toBe(named.refundedToUser.toString());
    expect(job.conversationCID).toBe(named.conversationCID);
  });

  it('pins the real session-931 values the layout note names (no addresses hardcoded)', () => {
    expect(job.id).toBe(931);
    expect(job.pricePerToken).toBe(904);          // the registered LTX price
    expect(job.tokensUsed).toBe(733225);
    expect(job.status).toBe(1);                   // Completed (0=Active,1=Completed,2=TimedOut)
    expect(job.proofTimeoutWindow).toBe(300);     // SECONDS — not to be confused with…
    expect(job.proofInterval).toBe(1000);         // …proofInterval, a TOKEN count
  });

  it('the three addresses are distinct real addresses — the shift bug made host a token', () => {
    for (const a of [job.depositor, job.host, job.paymentToken]) expect(isAddress(a)).toBe(true);
    expect(job.host).not.toBe(job.paymentToken);
    expect(job.depositor).not.toBe(job.host);
  });

  it('requester survives as a deprecated alias of depositor (the struct has no requester)', () => {
    expect(job.requester).toBe(named.depositor);
  });
});
