// Copyright (c) 2026 Fabstir. SPDX-License-Identifier: BUSL-1.1
// M3 moderation publish gate — ships dark; NOT a security control until M5
// signing (see gate.ts module caveat).
export { validateModerationReport } from './validate';
export type { ModerationReportValidation, ValidateModerationReportOptions } from './validate';
export { checkModerationVerdict, evaluateModerationGate } from './gate';
export type { EvaluateModerationGateOptions } from './gate';
