/**
 * Phase 3 — estimate, deposit, and the early-complete fee (§C.1 money, §A.3 condition 1, Open 8).
 *
 * Phase 8 (2026-08-24): billing.json has LANDED, so the
 * C.1 money cases below are no longer DERIVED self-regression pins — the node's own numbers are
 * the oracle, asserted in the vector block at the foot of this file. The DERIVED cases are kept
 * beside them deliberately: they cover inputs the vector does not, and agreeing with the vector
 * on four cases while disagreeing nowhere else is stronger than either set alone.
 */
import { describe, it, expect, vi } from 'vitest';
import { TrainingManager } from '../../src/managers/TrainingManager';
import { tokensToUsdc } from '../../src/utils/transcode-utils';
import billing from './vectors/billing.json';

const MODEL = '0x' + '5a'.repeat(32);
// Synthetic, NOT a real deployment (CLAUDE.md bars hardcoded contract addresses in tests too).
const USDC = '0x7C7C7c7c7C7C7c7C7c7c7C7C7c7c7C7C7c7c7c7C';
const PRICE = 904n;                    // billing.json's sample price — now VECTOR-BACKED
const MIN_DEPOSIT = 500_000n;          // read from chain in production; fixed here for the maths
const job = (declaredTokens: number, epochs: number) => ({ dataset: { declaredTokens }, epochs });

function mgr(over: Record<string, unknown> = {}) {
  return new TrainingManager({
    sessionManager: { resolveModelPricePerToken: vi.fn().mockResolvedValue(PRICE) },
    paymentManager: { getTokenMinDeposit: vi.fn().mockResolvedValue(MIN_DEPOSIT) },
    jobMarketplace: { getMinTokensFee: vi.fn().mockResolvedValue(0n) },
    trainingModelId: MODEL, usdcAddress: USDC, chainId: 84532, ...over,
  } as never);
}

describe('estimateTrainingPrice (C.1) — FLOOR on the gross', () => {
  it('DERIVED from doc-pinned inputs: 9,600,000 tokens at 904 => 8,678,400 base units', () => {
    // The doc pins the INPUTS (904 at item 6; 9,600,000 at B.1) but prints neither product,
    // so the expected value is OUR computation — a self-regression pin, not a doc oracle.
    // billing.json supplies the authoritative case at Phase 8.
    expect(mgr().estimateTrainingPrice(job(3_200_000, 3), PRICE)).toBe(8_678_400n);
  });
  it('achieves byte-parity with the LTX/transcode maths on shared cases (C.1 "the LTX maths verbatim")', () => {
    for (const [tokens, price] of [[9_600_000, 904n], [10_000, 1n], [1_000_050, 77n], [15_000_000, 50_000n]] as const) {
      expect(mgr().estimateTrainingPrice(job(tokens, 1), price), `${tokens}@${price}`)
        .toBe(tokensToUsdc(tokens, price));
    }
  });
  it('DERIVED: floors rather than rounds — a gross fraction of .9 truncates down', () => {
    // 1,111 x 904 = 1,004,344 -> /1000 = 1004.344 ; and 10,001 x 904 = 9,040,904 -> 9040.904
    expect(mgr().estimateTrainingPrice(job(10_001, 1), PRICE)).toBe(9040n);   // NOT 9041
    expect(mgr().estimateTrainingPrice(job(1_111, 1), PRICE)).toBe(1004n);
  });
  it('multiplies declaredTokens by epochs before pricing', () => {
    expect(mgr().estimateTrainingPrice(job(3_200_000, 3), PRICE))
      .toBe(mgr().estimateTrainingPrice(job(9_600_000, 1), PRICE));
  });
});

describe('computeTrainingDeposit — max(on-chain floor, CEIL(gross x 1.05))', () => {
  it('DERIVED: the worked example deposits 9,112,320 (gross 8,678,400 x 1.05, exact)', () => {
    expect(mgr().computeTrainingDeposit(8_678_400n, MIN_DEPOSIT)).toBe(9_112_320n);
  });
  it('DERIVED: the ceil BITES when the 5% uplift is fractional', () => {
    // 1,001 x 1.05 = 1,051.05 -> 1,052. A floor or a round-to-nearest both give 1,051.
    expect(mgr().computeTrainingDeposit(1_001n, 0n)).toBe(1_052n);
    expect(mgr().computeTrainingDeposit(1n, 0n)).toBe(2n);
  });
  it('DERIVED: the min-floor BINDS on a small job (the branch nothing else exercises)', () => {
    expect(mgr().computeTrainingDeposit(1_000n, MIN_DEPOSIT)).toBe(MIN_DEPOSIT);
  });
  it('DERIVED: buffers the ALREADY-FLOORED gross, never the exact quotient', () => {
    // The C.1 chain is ceil(FLOOR(gross) x 1.05). Buffering the unfloored quotient diverges on
    // ~54% of totals above the min-floor; LtxManager.ts:148 pads est.totalCostBaseUnits, so the
    // floored reading is the pinned one. 600,001 tokens @904: gross 542,400 -> 569,520, not 569,521.
    expect(mgr().computeTrainingDeposit(mgr().estimateTrainingPrice(job(600_001, 1), PRICE), MIN_DEPOSIT))
      .toBe(569_520n);
  });
  it('is integer BigInt throughout — no float ever touches the money path', () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1: unrepresentable in f64
    expect(mgr().computeTrainingDeposit(huge, 0n)).toBe((huge * 105n + 99n) / 100n);
  });
});
describe('A.3 condition 1 — the deposit always covers the bill', () => {
  it('DERIVED: headroom >= trainingTokens under every rounding mode the doc leaves unpinned', () => {
    // A.3 gives (depositAmount x 1000 / pricePerToken) - tokensUsed >= trainingTokens(job) and
    // never pins the division's rounding. It does not matter ONLY because the 5% buffer dominates:
    // with an unbuffered deposit the three modes disagree on the verdict ~90% of the time.
    for (const price of [1n, 904n, 50_000n]) {
      for (const tokens of [10_000, 1_000_050, 9_600_000, 15_000_000]) {
        const dep = mgr().computeTrainingDeposit(mgr().estimateTrainingPrice(job(tokens, 1), price), MIN_DEPOSIT);
        const floorHr = (dep * 1000n) / price;
        const ceilHr = (dep * 1000n + price - 1n) / price;
        expect(floorHr, `floor ${tokens}@${price}`).toBeGreaterThanOrEqual(BigInt(tokens));
        expect(ceilHr, `ceil ${tokens}@${price}`).toBeGreaterThanOrEqual(BigInt(tokens));
      }
    }
  });
});
describe('estimateTrainingCost — resolves the price on chain', () => {
  it('prices on the TRAINING model id and returns tokens, price and deposit together', async () => {
    const m = mgr();
    const est = await m.estimateTrainingCost(job(3_200_000, 3), '0xHost');
    expect(est.tokens).toBe(9_600_000);
    expect(est.pricePerToken).toBe(PRICE);
    expect(est.totalCostBaseUnits).toBe('8678400');
    expect(est.depositBaseUnits).toBe('9112320');
  });
  it('reads the deposit floor from chain rather than assuming 0.5 USDC', async () => {
    const getTokenMinDeposit = vi.fn().mockResolvedValue(99_000_000n);
    const est = await mgr({ paymentManager: { getTokenMinDeposit } }).estimateTrainingCost(job(10_000, 1), '0xHost');
    expect(getTokenMinDeposit).toHaveBeenCalled();
    expect(est.depositBaseUnits).toBe('99000000');
  });
  it('throws rather than falling back when the model has no on-chain price', async () => {
    const m = mgr({ sessionManager: { resolveModelPricePerToken: vi.fn().mockResolvedValue(0n) } });
    await expect(m.estimateTrainingCost(job(10_000, 1), '0xHost')).rejects.toThrow(/price/i);
  });
});

describe('the early self-complete fee (Open 8) — surfaced honestly', () => {
  it('reads minTokensFee from chain and never hardcodes it', async () => {
    const getMinTokensFee = vi.fn().mockResolvedValue(7n);
    expect(await mgr({ jobMarketplace: { getMinTokensFee } }).getEarlySelfCompleteFee()).toBe(7n);
    expect(getMinTokensFee).toHaveBeenCalled();
  });
  it('passes a zero fee straight through rather than treating it as absent', async () => {
    // 0 is the live value today and is a REAL answer, not a missing one — it must not be
    // coerced, defaulted, or reported as unavailable.
    const getMinTokensFee = vi.fn().mockResolvedValue(0n);
    expect(await mgr({ jobMarketplace: { getMinTokensFee } }).getEarlySelfCompleteFee()).toBe(0n);
  });
});

describe('the jobMarketplace dependency is checked against the REAL wrapper, not a mock', () => {
  it('names the missing surface instead of throwing a bare TypeError', async () => {
    // The tests above mock getMinTokensFee, so they can only ever prove a mock returns what the
    // mock was told. This one asserts the behaviour when the method genuinely is not there.
    const m = mgr({ jobMarketplace: {} });
    await expect(m.getEarlySelfCompleteFee()).rejects.toThrow(/getMinTokensFee/);
    await expect(mgr({ jobMarketplace: undefined }).getEarlySelfCompleteFee())
      .rejects.toThrow(/getMinTokensFee/);
  });
  it('JobMarketplaceWrapper NOW carries getMinTokensFee — CP1 open item CLOSED at Phase 5', async () => {
    // This test was written at CP1 as an ABSENCE pin: it asserted the wrapper did NOT have the
    // method, so it would FLIP the moment someone added it rather than sit silently stale. It
    // flipped in Phase 5, which is the tripwire working. Inverted here to a presence pin, so
    // the manager stays wirable and a later removal fails loudly.
    const { JobMarketplaceWrapper } = await import('../../src/contracts/JobMarketplace');
    expect(typeof JobMarketplaceWrapper.prototype.getMinTokensFee).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.getTokenMinDeposit).toBe('function');
    expect(typeof JobMarketplaceWrapper.prototype.triggerSessionTimeout).toBe('function');
  });
});

describe('billing.json — the T1 vector, now the ORACLE for C.1 (Phase 8)', () => {
  // Landed 2026-08-24, sha256 0d0e503ab5ae6d2e374a04279f131fafc2efe7d775cdae5a9784900b58b4c1ff.
  // Every number below is the NODE's, not ours. Until this file existed these cases were our
  // own computations checked against themselves.
  const MIN = BigInt(billing.minDepositMicroUsdc);

  it('reproduces ALL FOUR cases exactly — gross AND deposit', () => {
    for (const [name, c] of Object.entries(billing.cases as Record<string, any>)) {
      const gross = mgr().estimateTrainingPrice(job(c.trainingTokens, 1), BigInt(c.pricePerToken));
      expect(gross, `${name} gross`).toBe(BigInt(c.grossMicroUsdc));
      expect(mgr().computeTrainingDeposit(gross, MIN), `${name} deposit`).toBe(BigInt(c.depositMicroUsdc));
    }
  });

  it('roundVsFloor settles the FLOOR question against the node, not against us', () => {
    // 1,000,053 x 904 = 904,047,912 -> /1000 = 904,047.912. We floor to 904,047; a
    // round-to-nearest gives 904,048. The node ships 904,047, so the reading is confirmed
    // rather than assumed — this is the case the vector exists to discriminate.
    const c = (billing.cases as any).roundVsFloor;
    expect(c.grossMicroUsdc).toBe(904_047);
    expect(mgr().estimateTrainingPrice(job(c.trainingTokens, 1), BigInt(c.pricePerToken))).toBe(904_047n);
  });

  it('confirms the uplift applies to the ALREADY-FLOORED gross (the Band A open question)', () => {
    // C.1 never defines `gross`, and the two orderings disagree on ~54% of totals above the
    // floor. We resolved it by reading LtxManager.ts:148 and logged it as a watch item for
    // exactly this vector. Only ONE of the four cases actually discriminates — checked all
    // four rather than assuming: `worked`, `roundingBites` and `minFloorBinds` give identical
    // answers under both orderings, so picking any of them would have "confirmed" nothing.
    const c = (billing.cases as any).roundVsFloor;
    const t = BigInt(c.trainingTokens), p = BigInt(c.pricePerToken);
    const flooredFirst = mgr().computeTrainingDeposit(mgr().estimateTrainingPrice(job(c.trainingTokens, 1), p), MIN);
    const unflooredQuotient = (t * p * 105n + 99_999n) / 100_000n;   // ceil over the UNfloored quotient
    expect(flooredFirst).toBe(BigInt(c.depositMicroUsdc));           // 949,250 — the node's number
    expect(unflooredQuotient).toBe(949_251n);                        // what the other ordering gives
    expect(unflooredQuotient).not.toBe(BigInt(c.depositMicroUsdc));
  });

  it('pins the on-chain deposit FLOOR at 500,000 base units', () => {
    expect(MIN).toBe(500_000n);   // C.1's "0.5 USDC floor", finally stated in base units
    expect(mgr().computeTrainingDeposit(9_040n, MIN)).toBe(MIN);
  });

  it('pins billing.pricePerToken as a DECIMAL STRING on the wire (the A1 question, closed)', () => {
    // The single highest-consequence open item in the build: our over-claim guard compares
    // train_accepted.billing.pricePerToken against the on-chain price. A bare number would make
    // "904" !== 904 and abandon a FUNDED session at slice zero on an honest accept.
    const w = (billing as any).wireShape;
    expect(typeof w['train_accepted.billing'].pricePerToken).toBe('string');
    expect(typeof w['train_complete.billing'].pricePerToken).toBe('string');
    expect(w.types.pricePerToken).toMatch(/string/);
    expect(w.types.tokens).toBe('number');       // tokens stays numeric — NOT symmetrical
  });
});
