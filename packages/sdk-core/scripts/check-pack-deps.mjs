// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * prepack: refuse to pack a tarball whose dependencies point at a local path. A consumer resolves s5js from this
 * package's spec, and `file:`/`link:`/`workspace:` resolve only on this machine (plan §19 Z1; s5js beta.56 was pinned
 * from a local tarball until it reached npm). Usage: node scripts/check-pack-deps.mjs [package.json]
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'package.json';
const pkg = JSON.parse(readFileSync(path, 'utf8'));
const local = [];
for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
  for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
    if (/^(file|link|workspace):/.test(String(spec))) local.push(`${field}.${name} = ${spec}`);
  }
}
if (local.length) {
  console.error(`Refusing to pack ${pkg.name}@${pkg.version}: local dependency specs would not resolve for consumers:\n  ${local.join('\n  ')}`);
  process.exit(1);
}
