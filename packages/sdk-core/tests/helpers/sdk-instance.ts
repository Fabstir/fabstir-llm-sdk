// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * A real FabstirSDKCore for lifecycle tests (plan §26 GG9): built by its constructor, so every class field has its
 * initialiser — `Object.create(prototype)` skips them, which once let a test pass for the wrong reason (§23 DD1).
 * The steps a test replaces (`authenticateWithPrivateKey`, `initializeManagers`, …) and the state it starts from are
 * own properties, which shadow the prototype's. Contract addresses are random: nothing here reaches a chain.
 */

import { ethers } from 'ethers';
import { FabstirSDKCore } from '../../src/FabstirSDKCore';

const address = () => ethers.Wallet.createRandom().address;

export function realSdk(fields: Record<string, unknown> = {}): any {
  const sdk: any = new FabstirSDKCore({
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 84532,
    contractAddresses: {
      jobMarketplace: address(), nodeRegistry: address(), proofSystem: address(), hostEarnings: address(), usdcToken: address(),
    },
  });
  return Object.assign(sdk, fields);
}
