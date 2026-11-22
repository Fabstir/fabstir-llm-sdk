// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Storage region (1.39.27) T1: the regional seed derivation and the region table.
 * Plan: docs/development/IMPLEMENTATION-STORAGE-REGION.md §0 S1, R1, R2, R5.
 *
 * The vectors were computed with an independent oracle (s5js's own validatePhrase to decode, @noble HKDF to derive):
 * they are the published contract, fixed for good once released.
 */

import { describe, test, expect } from 'vitest';
import {
  entropyToS5Phrase, generateS5SeedFromAddress, generateS5SeedFromPrivateKey,
  deriveRegionalS5Seed, s5PhraseToSeedBytes, REGION_SEED_INFO_PREFIX,
} from '../../src/utils/s5-seed-derivation';
import { STORAGE_REGIONS, resolveStorageRegion } from '../../src/config/storage-regions';
import { StorageManager } from '../../src/managers/StorageManager';

const VECTORS = [
  {
    base: 'abandon adjust boy rush advice believe inform achieve alter club rural educate address peace myself',
    uk: 'address will hate have public window job square action joke loud mixture bold code wedding',
  },
  {
    base: 'zone zone zone zone zone zone zone zone zone zone zone zone dump say blind',
    uk: 'obvious paper public rabbit alter time often quality night million come rage cable must tide',
  },
  {
    base: 'against onion flag author which north tell nobody suffer prepare wake vote circle bring safety',
    uk: 'joy cave sport cover history have hence gesture blue hair academy billion also nowhere error',
  },
];

async function s5js() {
  const s5 = await import('@julesl23/s5js');
  const { validatePhrase } = await import('../../node_modules/@julesl23/s5js/dist/src/identity/seed_phrase/seed_phrase.js' as any);
  const crypto = new (s5 as any).JSCryptoImplementation();
  const publicKey = async (phrase: string) => {
    const id = await (s5 as any).S5UserIdentity.fromSeedPhrase(phrase, crypto);
    return Buffer.from((await crypto.newKeyPairEd25519(id.signingKey)).publicKey).toString('hex');
  };
  return { validatePhrase: (p: string) => validatePhrase(p, crypto), publicKey };
}

describe('deriveRegionalS5Seed — the published vectors (S1)', () => {
  test('the label is versioned and names the region key', () => {
    expect(REGION_SEED_INFO_PREFIX).toBe('fabstir-s5-region-v1:');
  });

  test.each(VECTORS)('uk vector for "$base"', ({ base, uk }) => {
    expect(deriveRegionalS5Seed(base, 'uk')).toBe(uk);
  });

  test('stable on every call, and never the base', () => {
    for (const { base } of VECTORS) {
      expect(deriveRegionalS5Seed(base, 'uk')).toBe(deriveRegionalS5Seed(base, 'uk'));
      expect(deriveRegionalS5Seed(base, 'uk')).not.toBe(base);
    }
  });

  test('the regional S5 public key differs from the base one (s5js identity)', async () => {
    const { publicKey } = await s5js();
    for (const { base, uk } of VECTORS) {
      const [a, b] = [await publicKey(base), await publicKey(deriveRegionalS5Seed(base, 'uk'))];
      expect(a).not.toBe(b);
      expect(b).toBe(await publicKey(uk));
    }
  });

  test('the input is read as s5js reads it: case, spacing and word suffixes past the prefix do not change the result', () => {
    const base = VECTORS[0].base;
    const variant = '  ' + base.toUpperCase().split(' ').map((w) => w + 'xyz').join('   ') + ' ';
    expect(deriveRegionalS5Seed(variant, 'uk')).toBe(VECTORS[0].uk);
  });

  test('a phrase s5js rejects is rejected, never derived', () => {
    const words = VECTORS[0].base.split(' ');
    const badChecksum = [...words.slice(0, 14), words[14] === 'myself' ? 'abandon' : 'myself'].join(' ');
    const fourteen = words.slice(0, 14).join(' ');
    const unknown = ['qqq', ...words.slice(1)].join(' ');
    const lastSeedWordTooHigh = [...words.slice(0, 12), 'zone', ...words.slice(13)].join(' ');
    for (const bad of [badChecksum, fourteen, unknown, lastSeedWordTooHigh, '', '   ']) {
      expect(() => deriveRegionalS5Seed(bad, 'uk')).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
    }
    expect(() => deriveRegionalS5Seed(42 as any, 'uk')).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
  });

  test('M04: a 13th word past the first 256 is refused even when the checksum matches its low 8 bits (s5js agrees)', async () => {
    const { validatePhrase } = await s5js();
    const { wordlist } = await import('../../src/utils/s5-wordlist-correct');
    const words = VECTORS[0].base.split(' ');
    const k = wordlist.indexOf(words[12]);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(k).toBeLessThan(256);
    const high = [...words.slice(0, 12), wordlist[k + 256], ...words.slice(13)].join(' ');
    expect(validatePhrase(high)[0]).toBe(false);
    expect(() => s5PhraseToSeedBytes(high)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_SEED_REFUSED' }));
  });

  test("'global' is never derived, and a region not in the table is refused", () => {
    expect(() => deriveRegionalS5Seed(VECTORS[0].base, 'global' as any)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_INVALID' }));
    expect(() => deriveRegionalS5Seed(VECTORS[0].base, 'eu' as any)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_UNAVAILABLE' }));
    expect(() => deriveRegionalS5Seed(VECTORS[0].base, 'mars' as any)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_INVALID' }));
  });
});

describe('s5PhraseToSeedBytes — the 16 seed bytes, as s5js decodes them', () => {
  test('agrees with s5js validatePhrase on the vectors and on 50 generated phrases', async () => {
    const { validatePhrase } = await s5js();
    const phrases = [...VECTORS.map((v) => v.base), ...VECTORS.map((v) => v.uk)];
    for (let i = 0; i < 50; i++) phrases.push(entropyToS5Phrase(Uint8Array.from({ length: 16 }, (_, j) => (i * 31 + j * 7 + 3) & 0xff)));
    for (const p of phrases) {
      const [ok, , seed] = validatePhrase(p);
      expect(ok).toBe(true);
      expect(Buffer.from(s5PhraseToSeedBytes(p)).toString('hex')).toBe(Buffer.from(seed).toString('hex'));
      expect(entropyToS5Phrase(s5PhraseToSeedBytes(p))).toBe(p); // canonical phrases round-trip
    }
  });
});

describe("'global' is today's derivation, byte for byte (R2, acceptance f)", () => {
  // Frozen from the 1.39.26 tree (s5-seed-derivation.ts unchanged since 1.39.0).
  test('address-derived', async () => {
    expect(await generateS5SeedFromAddress('0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 84532))
      .toBe('house toll fever tunnel state joke unable ride story neck high fluid aunt please trouble');
  });
  test('private-key-derived', async () => {
    expect(await generateS5SeedFromPrivateKey('0x' + '11'.repeat(32)))
      .toBe('arise member exotic affect echo mother less abroad nation toilet write table bizarre turn bomb');
  });
});

describe('STORAGE_REGIONS (R1)', () => {
  test('global is today: the same peer and portal the SDK used before', () => {
    expect(STORAGE_REGIONS.global.peer).toBe(StorageManager.DEFAULT_S5_PORTAL);
    expect(STORAGE_REGIONS.global.portalUrl).toBe('https://s5.platformlessai.ai');
    expect(STORAGE_REGIONS.global.portalHost).toBe('s5.platformlessai.ai');
    expect(STORAGE_REGIONS.global.hosts).toBeNull(); // unrestricted, as today
  });
  test('uk: the brief\'s portal and peer; its host list is empty (every UK job refused)', () => {
    expect(STORAGE_REGIONS.uk.portalUrl).toBe('https://s5-uk.platformlessai.ai');
    expect(STORAGE_REGIONS.uk.portalHost).toBe('s5-uk.platformlessai.ai');
    expect(STORAGE_REGIONS.uk.peer).toBe('wss://z2DXG8VjbxzY23kt6nJuYPriFEjQKHXJSpnWGSc7SPCgwvc@s5-uk.platformlessai.ai/s5/p2p');
    expect(STORAGE_REGIONS.uk.hosts).toEqual([]);
  });
  test('no eu entry; the table cannot be changed at run time', () => {
    expect((STORAGE_REGIONS as any).eu).toBeUndefined();
    expect(Object.isFrozen(STORAGE_REGIONS)).toBe(true);
    expect(Object.isFrozen(STORAGE_REGIONS.uk)).toBe(true);
    expect(Object.isFrozen(STORAGE_REGIONS.uk.hosts)).toBe(true);
  });
  test('resolveStorageRegion: default global; eu unavailable; anything else invalid', () => {
    expect(resolveStorageRegion(undefined)).toBe('global');
    expect(resolveStorageRegion('global')).toBe('global');
    expect(resolveStorageRegion('uk')).toBe('uk');
    expect(() => resolveStorageRegion('eu')).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_UNAVAILABLE' }));
    for (const bad of ['UK', 'Global', '', 'us', null, 1, {}]) {
      expect(() => resolveStorageRegion(bad as any)).toThrow(expect.objectContaining({ code: 'STORAGE_REGION_INVALID' }));
    }
  });
});
