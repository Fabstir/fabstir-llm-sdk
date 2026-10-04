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
   * Not yet covered: TranscodeManager.submitTranscodeWithLoadBalancing (planned, Milestone B).
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
} as const);
