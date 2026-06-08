// Copyright (c) 2026 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Sub-phase 2.3 — public export surface for the gasless building blocks (RED → GREEN).
 * The orchestrator (and chat/UI) construct the gasless delegate from sdk-core's
 * top-level entry, so AASigner (value) + the userop helpers must be exported there.
 */

import { describe, it, expect } from 'vitest';
import {
  AASigner,
  createBundlerSendUserOp,
  getCounterfactualAddress,
  encodeExecute,
  encodeFactoryData,
  userOpHashV07,
} from '../../src';

describe('sdk-core public exports (userop / gasless)', () => {
  it('exposes AASigner + the v0.7 gasless building blocks as callables', () => {
    const exported = [AASigner, createBundlerSendUserOp, getCounterfactualAddress, encodeExecute, encodeFactoryData, userOpHashV07];
    for (const fn of exported) expect(typeof fn).toBe('function');
  });
});
