// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * @base-org/account is an OPTIONAL PEER DEPENDENCY.
 *
 * It is not bundled (esbuild marks it --external in every target), so a consumer who installs
 * @fabstir/sdk-core and does NOT install @base-org/account has no copy of it at runtime. The
 * EOA / private-key / MetaMask flows never touch it, so that is a legitimate install.
 *
 * If the package is optional, then EVERY call site must degrade to a clear, actionable error.
 * It did not:
 *   - SmartAccountProvider.ts:128   `await import(...).catch(() => null)`  -> nice error
 *   - BaseAccountIntegration.ts:50  `await import(...)`  (no catch)        -> raw MODULE_NOT_FOUND
 *
 * The second one is a hard crash with an unhelpful module-resolution stack trace. Reported from
 * the Platformless AI UI against dist/index.js:36180. A plain Node consumer with no bundler --
 * exactly what the Platformless helper is -- hits it under pnpm's strict node_modules layout.
 *
 * These tests pin BOTH call sites to the same clear failure.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Simulate the package being absent: the dynamic import rejects, exactly as it would for a
// consumer who never installed the optional peer.
vi.mock('@base-org/account', () => {
  throw new Error("Cannot find module '@base-org/account'");
});

describe('@base-org/account absent — every call site must degrade clearly', () => {
  beforeEach(() => {
    // Both call sites require a browser-ish environment before they reach the import.
    (globalThis as any).window = (globalThis as any).window ?? {};
  });

  afterEach(() => {
    vi.resetModules();
  });

  test('BaseAccountHelper.initialize() throws an actionable error, not MODULE_NOT_FOUND', async () => {
    const { BaseAccountHelper } = await import('../../src/utils/BaseAccountIntegration');
    const helper = new BaseAccountHelper({ appName: 'test', appChainIds: [84532] });

    await expect(helper.initialize()).rejects.toThrow(/Base Account SDK not available/i);
  });

  test('the error names the package and says how to fix it', async () => {
    const { BaseAccountHelper } = await import('../../src/utils/BaseAccountIntegration');
    const helper = new BaseAccountHelper({ appName: 'test', appChainIds: [84532] });

    const err = await helper.initialize().catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    // Must name the package and tell the consumer what to do — not a raw resolution failure.
    expect((err as Error).message).toMatch(/@base-org\/account/);
    expect((err as Error).message).toMatch(/install/i);
    // The raw Node/bundler failure must NOT be what surfaces.
    expect((err as Error).message).not.toMatch(/Cannot find module/i);
  });

  test('SmartAccountProvider.connect() surfaces the same actionable error', async () => {
    const { SmartAccountProvider } = await import('../../src/providers/SmartAccountProvider');
    const provider = new SmartAccountProvider();

    const err = await provider.connect(84532).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/Base Account SDK not available/i);
  });
});

describe('the optional peer dependency is declared', () => {
  test('package.json declares @base-org/account as an optional peerDependency', async () => {
    const pkg = (await import('../../package.json')).default as any;

    // Declared as a peer: the app owns the single instance. The Base Account SDK is stateful
    // (provider, popup lifecycle, sub-account state) — two live copies means duplicate popups
    // and divergent sub-account state, a correctness bug rather than mere bloat.
    expect(pkg.peerDependencies?.['@base-org/account']).toBeDefined();

    // Optional: EOA / private-key / MetaMask consumers must not be forced to install a wallet
    // SDK they never touch.
    expect(pkg.peerDependenciesMeta?.['@base-org/account']?.optional).toBe(true);

    // And it must NOT be a plain dependency — that would let a package manager hand sdk-core
    // its own second copy alongside the app's.
    expect(pkg.dependencies?.['@base-org/account']).toBeUndefined();
  });
});
