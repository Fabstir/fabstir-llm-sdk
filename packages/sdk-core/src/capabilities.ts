// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

/**
 * What this SDK build can do, for consumers that must refuse to run without a capability (the UI types
 * managers loosely, so an unknown option would otherwise be ignored silently). Check a flag before relying
 * on the behaviour it names.
 */
export const SDK_CAPABILITIES = Object.freeze({
  /** RAG manifests, chunks and document bodies are sealed; paths carry no names. */
  sealedRagStorage: true,
  /** The S5 conversation log is sealed. */
  sealedConversationLog: true,
  /** `conversationLog: false` on a session config or on PromptOptions writes nothing to the log. */
  conversationLogOptOut: true,
  /** addPendingDocument / updateDocumentStatus / removeDocument / putDocumentBody / getDocumentBody / refreshDatabases. */
  ragDocumentApi: true,
  /** migrateToSealedStorage / migrateLegacyRagStorage / migrateLegacyConversationLogs. */
  ragLegacyMigration: true,
  /**
   * startSession / registerDelegatedSession: a failure after the session was funded throws
   * SESSION_FUNDED_SETUP_FAILED carrying sessionId and jobId; a funding transaction whose outcome is unknown
   * throws SESSION_ID_UNRESOLVED with its txHash, and one that provably funded nothing SESSION_NOT_FUNDED.
   * A send that may have been broadcast but names no hash throws SESSION_FUNDING_UNCERTAIN: check the wallet's
   * activity before starting again. TranscodeManager.createTranscodeJob funds last (nothing after it can fail).
   * TranscodeManager.submitTranscodeWithLoadBalancing reports the sessions it funded and could not use (1.39.20,
   * `transcodeOrphanedSessions`).
   */
  fundedSetupErrorCarriesIds: true,
  /**
   * sendPromptStreaming decides web search on the user's text: options.rawQuery, else the text after the last
   * RAG_CONTEXT_END_MARKER, else the whole prompt — the text the search query is built from (1.39.2).
   */
  searchIntentFromUserText: true,
  /** Image generation is never auto-routed when RAG_CONTEXT_END_MARKER appears at or after the start of the user turn
   *  the detector acts on (a turn that carries RAG context, where a document could have forged it) (1.39.2). */
  imageIntentSkipsRagTurns: true,
  /** LtxManager.validateJob applies a v26 entry's own fps list and resolutionRule (unknown rule names refused) (1.39.3). */
  ltxEntryFpsAndResolutionRule: true,
  /** Every LTX job runs on its own template's model, ltxModelIdFor(templateId, sidecar); config.ltxModelId is ignored (1.39.3). */
  ltxModelFromTemplate: true,
  /**
   * VFX Passes (bundle v27): the model family comes from the bundle entry's sidecar ("relight" → NVIDIA Cosmos), and
   * validateJob applies its rules — relight-fhd (1920 × 1088), output "exr-frames", no prompt; generate waits up to an
   * hour for a passes job unless timeoutMs is set (1.39.4).
   */
  ltxModelFamilyFromEntry: true,
  /** createLtxSession / generate take an optional proofTimeoutWindow (seconds, 60..3600) (1.39.4). */
  ltxProofTimeoutWindow: true,
  /** A VFX Passes session defaults to proofTimeoutWindow 3600 when the caller passes none; an explicit value wins (1.39.5). */
  ltxRelightProofWindowDefault: true,
  /**
   * createLtxSession / generate take an optional sessionDuration (seconds); a VFX Passes session defaults to 14400 and
   * generate waits at least as long as the session lives unless timeoutMs is longer; a closed socket ends any LTX wait
   * at once (GENERATION_FAILED, details.reason "WS_CLOSED") (1.39.6).
   */
  ltxSessionDuration: true,
  /** validateJob knows resolutionRule "refine-hd" (Refine Details: ÷64, long side ≤ 1536, area ≤ 1536 × 1024) (1.39.7). */
  ltxRefineHdRule: true,
  /** validateJob knows resolutionRule "div64-uhd" (Refine Details at 4K: ÷64, long side ≤ 3840, area ≤ 3840 × 2176) (1.39.8). */
  ltxDiv64UhdRule: true,
  /** LtxJob.speed (Slow Motion) is forwarded to the node, and validateJob refuses one outside [0.025, 1.0] (1.39.9). */
  ltxSpeedField: true,
  /** startSession with a host but no endpoint reads the host's apiUrl from the registry — never a localhost default (1.39.10). */
  hostEndpointFromRegistry: true,
  /**
   * Before funding, startSession probes GET /v1/health on a host whose endpoint it took from the registry (AUTO, or an
   * explicit host without an endpoint); one that does not answer (2xx with a status) is skipped (AUTO) or refused
   * (HOST_UNREACHABLE). An endpoint the caller passes is used as given and not probed (1.39.10).
   */
  hostLivenessBeforeFunding: true,
  /**
   * submitTranscode / submitLtx / submitTraining close a socket they opened themselves (a delegate session's) on every
   * outcome — result resolved or rejected, or a throw before the handle — so the node settles the session (1.39.11).
   */
  dedicatedSocketClosed: true,
  /** A dedicated socket's encrypted init works only on its own state and is not queued behind other inits, so concurrent
   *  submits on delegate sessions need no ordering by the caller (1.39.12). */
  dedicatedInitIsolated: true,
  /** On the shared socket, jobs (submitTranscode/submitLtx/submitTraining, generateImage) and chat draw from one live
   *  message counter per session key, so no index repeats under a key (1.39.12). */
  sharedSocketMessageIndex: true,
  /** submitTranscode's result rejects TRANSCODE_FAILED with details.reason 'WS_CLOSED' when its socket closes (1.39.12). */
  transcodeWsClosed: true,
  /** submitTranscode / submitLtx / submitTraining refuse a second concurrent job on a session (SESSION_JOB_IN_FLIGHT) until
   *  the node keys sessions by connection; per SessionManager instance (1.39.14). */
  sessionJobExclusive: true,
  /** On a node reporting `session-job-completion` in /v1/version, the one-job-per-session refusal is lifted (1.39.15). */
  jobCompletionNodes: true,
  /** On such a node, SessionManager.fetchTranscodeResult collects a dropped transcode's stored result, and a submitted
   *  transcode whose connection drops after the accept recovers it instead of rejecting WS_CLOSED (1.39.15). */
  transcodeResultFetch: true,
  /** TranscodeManager sizes a session to its source (sourceDurationSeconds, sizeTranscodeSession) from the model's rate cap on chain (1.39.17). */
  transcodeSessionSizing: true,
  /** SOURCE_TOO_LONG is lifted on a node reporting `transcode-final-wait-uncapped` (8.62.6) (1.39.18). */
  transcodeFinalWaitUncapped: true,
  /** submitTranscode with no timeoutMs waits until the session's on-chain expiry + 300 s; TRANSCODE_TIMEOUT is not retryable (1.39.18). */
  transcodeWaitFromSession: true,
  /** A transcode handle's cancel() settles its result at once (CANCELLED); the node sends nothing more after a cancel (1.39.18). */
  transcodeCancelSettles: true,
  /** Encrypted transcodes go only to the configured hosts, refused with none configured (1.39.18; the list is `confidentialHosts` since 1.39.19). */
  encryptedTranscodeAllowlist: true,
  /** One confidentialHosts list for encrypted transcodes, LTX and training, fail closed, checked before funding (1.39.19). */
  confidentialHosts: true,
  /** DelegatedSessionConfig.webSearch, and PromptOptions.webSearch forcing search on/off for one prompt (1.39.20). */
  delegatedWebSearchConfig: true,
  /** endSession / completeSession release only their own session: another session's shared socket, key and waiters are
   *  left alone (1.39.20). */
  sessionEndScoped: true,
  /** SESSION_INIT_ERROR carries details { nodeCode, sessionId } (1.39.20). */
  sessionInitErrorDetails: true,
  /** uploadVectors reports the node's own uploaded / rejected / errors; an ack without them throws
   *  UPLOAD_RESPONSE_MALFORMED (1.39.20). */
  uploadVectorsNodeCounts: true,
  /** SessionManager.getConnectionGeneration() (1.39.20). */
  connectionGenerationAccessor: true,
  /** On a `session-job-completion` node, a prompt, upload or search on a connection that already holds the session's key
   *  sends no re-init, so a reply in flight keeps its key (1.39.20). */
  sharedConnectionKeyReuse: true,
  /** submitTranscodeWithLoadBalancing: funded sessions it could not use travel as handle.orphanedSessions or
   *  details.orphanedSessions (1.39.20). */
  transcodeOrphanedSessions: true,
  /** TranscodeManager upload/download/createTranscodeJob/cancel/status use StorageManager and JobMarketplace APIs that
   *  exist (1.39.20). */
  transcodeStorageMethods: true,
  /** After an event at which the node may settle a session unannounced, the next new work on it reads its status on
   *  chain: settled → SESSION_NOT_ACTIVE (details.reason 'SETTLED_ON_CHAIN'); unreadable → SESSION_STATUS_UNREADABLE,
   *  retryable (1.39.21). */
  settledSessionGuard: true,
  /** The node's `session_settled` notice and `SESSION_SETTLED` refusal (8.63.0, `session-settled-notice`) settle the
   *  session locally (SESSION_NOT_ACTIVE, details.reason 'SETTLED_BY_NODE'); on such a node the chain is read only for
   *  what the node cannot see (1.39.22). */
  settledNotice: true,
  /** HTTP 409 SESSION_SETTLED from /v1/inference settles the session (SETTLED_BY_NODE); 403 SESSION_AUTH_DENIED reaches the
   *  caller as SESSION_AUTH_DENIED; on a `session-settled-rest` node REST prompts need no repeated chain reads; webSearch()
   *  uses REST /v1/search (1.39.23). */
  settledRest: true,
} as const);
