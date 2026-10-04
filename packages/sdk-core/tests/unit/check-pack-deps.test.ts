// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/** Plan §19 Z1 — a tarball never ships a dependency spec that resolves only on this machine. */

import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (pkg: object) => {
  const file = join(mkdtempSync(join(tmpdir(), 'pack-deps-')), 'package.json');
  writeFileSync(file, JSON.stringify(pkg));
  return spawnSync(process.execPath, [join(__dirname, '../../scripts/check-pack-deps.mjs'), file], { encoding: 'utf8' });
};

test('a file: spec refuses the pack; registry specs pass', () => {
  const refused = run({ name: 'x', version: '1.0.0', dependencies: { '@julesl23/s5js': 'file:/workspace/julesl23-s5js-0.9.0-beta.56.tgz' } });
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain('@julesl23/s5js');
  expect(run({ name: 'x', version: '1.0.0', dependencies: { '@julesl23/s5js': '0.9.0-beta.56' } }).status).toBe(0);
});
