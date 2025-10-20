// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * Cryptographic module for end-to-end encryption.
 *
 * Provides ephemeral-static ECDH encryption with ECDSA signature recovery
 * for sender authentication integrated with Ethereum addresses.
 *
 * @module crypto
 */

// Type definitions
export * from './types';

// Core utilities
export * from './utilities';

// Encryption/decryption
export * from './encryption';

// Address recovery
export * from './recovery';
