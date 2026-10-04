// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/** The identity the sealed-storage suites share: the .env.test seed and a fixed wallet address. */
import { EncryptionManager } from '../../src/managers/EncryptionManager';

// The .env.test seed, read from the environment (never committed): rounds 9, 10 and 22 pin ids and sealed bytes
// derived under it, captured from earlier code — what existing data needs to keep opening.
export const SEED = process.env.S5_SEED_PHRASE!;
export const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const encryptionManager = () => EncryptionManager.fromSeed(SEED, ADDR);
export const sealer = () => encryptionManager().getStorageSealer();
