// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/** The identity the sealed-storage suites share: the .env.test seed and a fixed wallet address. */
import { EncryptionManager } from '../../src/managers/EncryptionManager';

export const SEED = 'yield organic score bishop free juice atop village video element unless sneak care rock update';
export const ADDR = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
export const encryptionManager = () => EncryptionManager.fromSeed(SEED, ADDR);
export const sealer = () => encryptionManager().getStorageSealer();
