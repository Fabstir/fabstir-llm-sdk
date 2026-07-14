// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * GUARD: every `vi.mock('<bare-specifier>')` must name a REAL dependency.
 *
 * Why this exists.
 * `StorageManager` imports '@julesl23/s5js', but two suites mocked '@s5-dev/s5js' — a stale
 * alias left behind by a package rename. Vitest does not warn when you mock a package that
 * nothing imports; it simply fails to resolve the phantom module, the whole FILE fails to
 * collect, and the suite reports ZERO TESTS. Those two files were dead for months.
 *
 * That is how `store({ encrypt: true })` shipped uploading plaintext: the encryption tests
 * that should have caught it were never executing. A silent-by-construction failure mode.
 *
 * THE RULE: a bare vi.mock() specifier must name a module that `src/` actually imports.
 * Not "must be a declared dependency" — that gives false positives on legitimately-undeclared
 * optional deps. The real defect is mocking a module nothing imports: such a mock can never
 * intercept anything, so it is dead weight at best and a collection failure at worst.
 * '@s5-dev/s5js' was imported by NOTHING once the package was renamed. That is the signal.
 *
 * Deterministic, needs no test run.
 */

import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const PKG_ROOT = resolve(__dirname, '..', '..');
const TESTS_DIR = join(PKG_ROOT, 'tests');

/** Recursively collect every .test.ts file under tests/. */
function testFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) testFiles(full, acc);
    else if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) acc.push(full);
  }
  return acc;
}

/** Bare (non-relative) specifiers only — relative mocks point at our own source. */
function bareMockSpecifiers(src: string): string[] {
  const out: string[] = [];
  const re = /vi\.mock\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const spec = m[1];
    if (!spec.startsWith('.') && !spec.startsWith('/')) out.push(spec);
  }
  return out;
}

/** A specifier belongs to a declared package: '@scope/pkg/sub' -> '@scope/pkg'. */
function packageOf(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Every bare package `src/` imports — static, dynamic, or require.resolve'd. */
function packagesImportedBySrc(dir: string, acc = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      packagesImportedBySrc(full, acc);
      continue;
    }
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    const src = readFileSync(full, 'utf8');
    const re = /(?:from\s*|import\(\s*|require(?:\.resolve)?\(\s*)['"]([^'"]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (!spec.startsWith('.') && !spec.startsWith('/')) acc.add(packageOf(spec));
    }
  }
  return acc;
}

/**
 * KNOWN pre-existing phantom mocks. Each entry is a real defect, deliberately quarantined so
 * this tripwire stays GREEN and therefore keeps catching NEW rot. A permanently-red check is
 * one everybody learns to ignore — which is how the s5js rot survived in the first place.
 * Do not add to this list to silence a new failure. Fix the mock.
 *
 * - 'mammoth': tests/documents/extraction.test.ts mocks it, but src/documents/extractors.ts
 *   only mentions mammoth in a COMMENT — DOCX extraction was never implemented and throws
 *   'DOCX processing is not supported in this environment'. Those DOCX tests already fail
 *   honestly (they are not passing vacuously). Remove the mock when DOCX is implemented or
 *   the tests are dropped.
 */
const KNOWN_PHANTOM_MOCKS = new Set(['mammoth']);

describe('vi.mock() specifiers must name modules src actually imports', () => {
  const importedBySrc = packagesImportedBySrc(join(PKG_ROOT, 'src'));
  const SELF = resolve(__filename); // this file documents phantom mocks; don't self-match

  const offenders: Array<{ file: string; specifier: string }> = [];
  for (const file of testFiles(TESTS_DIR)) {
    if (resolve(file) === SELF) continue;
    for (const specifier of bareMockSpecifiers(readFileSync(file, 'utf8'))) {
      const pkgName = packageOf(specifier);
      if (!importedBySrc.has(pkgName) && !KNOWN_PHANTOM_MOCKS.has(pkgName)) {
        offenders.push({ file: file.replace(PKG_ROOT + '/', ''), specifier });
      }
    }
  }

  test('no suite mocks a module that nothing in src imports', () => {
    // A phantom mock does not throw — it silently prevents the file from collecting,
    // so the suite reports ZERO tests and nobody notices. Fail loudly instead.
    expect(
      offenders,
      offenders.length
        ? `Phantom vi.mock() target(s) — nothing in src/ imports these, so the mock can never ` +
            `apply and the suite may collect ZERO tests:\n` +
            offenders
              .map((o) => `  ${o.file}\n    mocks '${o.specifier}' — not imported by src/`)
              .join('\n')
        : ''
    ).toEqual([]);
  });

  test('the storage suites mock the specifier StorageManager actually imports', () => {
    // Regression pin for the exact rename that caused the plaintext-upload bug.
    const storageManager = readFileSync(join(PKG_ROOT, 'src/managers/StorageManager.ts'), 'utf8');
    const imported = /import\(\s*['"]([^'"]*s5js)['"]\s*\)/.exec(storageManager)?.[1];
    expect(imported, 'StorageManager should dynamically import an s5js package').toBeTruthy();

    for (const file of testFiles(TESTS_DIR)) {
      const mocks = bareMockSpecifiers(readFileSync(file, 'utf8')).filter((s) => s.includes('s5js'));
      for (const spec of mocks) {
        expect(spec, `${file.replace(PKG_ROOT + '/', '')} mocks a stale s5js alias`).toBe(imported);
      }
    }
  });
});
