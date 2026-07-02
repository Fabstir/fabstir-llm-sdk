// Copyright (c) 2025 Fabstir. SPDX-License-Identifier: BUSL-1.1
// LTX sidecar error surface — 5 wire codes (from ltx_error) + 4 client-side codes.
// Pre-MVP: no fallbacks — fail fast with a typed LtxError.

/** Node-emitted `ltx_error.error.code` values. */
export const LTX_WIRE_ERROR_CODES = [
  'VALIDATION_FAILED', 'SIDECAR_UNAVAILABLE', 'CAPACITY', 'GENERATION_FAILED', 'TIMEOUT',
] as const;

/** Client-side (SDK) failure codes: pre-validation, bundle drift, and verification mismatches. */
export const LTX_CLIENT_ERROR_CODES = [
  'LTX_BUNDLE_STALE', 'LTX_PREVALIDATION_FAILED', 'LTX_INPUT_BINDING_MISMATCH', 'LTX_PROOF_MISMATCH',
] as const;

/** All LTX error codes (wire + client). */
export const LTX_ERROR_CODES = [...LTX_WIRE_ERROR_CODES, ...LTX_CLIENT_ERROR_CODES] as const;

export type LtxWireErrorCode = (typeof LTX_WIRE_ERROR_CODES)[number];
export type LtxClientErrorCode = (typeof LTX_CLIENT_ERROR_CODES)[number];
export type LtxErrorCode = (typeof LTX_ERROR_CODES)[number];

/** Typed LTX error. `code` is one of the 9 wire/client codes; `details` carries context. */
export class LtxError extends Error {
  readonly code: LtxErrorCode;
  readonly details?: unknown;

  constructor(message: string, code: LtxErrorCode, details?: unknown) {
    super(message);
    this.name = 'LtxError';
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, LtxError.prototype);
  }
}
