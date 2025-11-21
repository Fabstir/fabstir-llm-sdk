"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Trash2, X, FileText, Database } from "lucide-react";
import { useWallet } from "@/contexts/wallet-context";
import { useSDK } from "@/hooks/use-sdk";
import { useSessionGroups } from "@/hooks/use-session-groups";
import { useVectorDatabases, type EmbeddingProgress } from "@/hooks/use-vector-databases";
import { useHostDiscovery } from "@/hooks/use-host-discovery";
import { downloadFromS5 } from "@/lib/s5-utils";
import { EmbeddingProgressBar } from "@/components/vector-databases/embedding-progress-bar";
import { PaymentPanel } from "@/components/payment/payment-panel";

interface ChatSession {
  sessionId: string;
  title: string;
  lastMessage?: string;
  messageCount: number;
  timestamp: number;
  active: boolean;
  metadata?: {
    sessionType?: 'ai' | 'mock';
    blockchainSessionId?: string;
    blockchainJobId?: string;
    blockchainStatus?: 'active' | 'ended' | 'completed';
    hostAddress?: string;
    hostEndpoint?: string;
    model?: string;
    pricing?: number;
  };
}

/**
 * Session Group Detail Page
 *
 * Displays session group details and list of chat sessions
 */
export default function SessionGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { isConnected, signer, address } = useWallet();
  const { managers, isInitialized } = useSDK();
  const {
    selectedGroup,
    selectGroup,
    startChat,
    startAIChat,
    deleteChat,
    listChatSessionsWithData,
    addGroupDocument,
    removeGroupDocument,
    linkDatabase,
    unlinkDatabase,
    isLoading,
    error,
  } = useSessionGroups();

  const { databases } = useVectorDatabases();

  // --- Host Discovery (Phase 2) ---
  const {
    hosts,
    selectedHost: discoveredHost,
    isDiscovering,
    error: hostDiscoveryError,
    selectHost,
  } = useHostDiscovery();

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showLinkDatabaseModal, setShowLinkDatabaseModal] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<EmbeddingProgress | null>(null);

  // --- AI Mode State (Phase 1) ---
  // Default to true in UI5 (production app) - users want real AI, not mock
  const [aiModeEnabled, setAiModeEnabled] = useState(true);

  // --- AI Session Creation State (Phase 3) ---
  const [isCreatingAISession, setIsCreatingAISession] = useState(false);
  const [aiSessionError, setAiSessionError] = useState<string | null>(null);

  // --- Sub-phase 5.4: Document Queue Tracking ---
  const [documentQueue, setDocumentQueue] = useState<string[]>([]); // List of document names in queue
  const [queuePosition, setQueuePosition] = useState<number>(0); // Current position (1-indexed)
  const [processingStartTimes, setProcessingStartTimes] = useState<Map<string, number>>(new Map()); // Track start time per document

  const groupId = params.id as string;

  // --- FIX: add refs to control focus behavior ---
  const fileDialogOpen = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- Upload Handler ---
  const handleGroupFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      fileDialogOpen.current = false;
      return;
    }

    setUploading(true);
    try {
      console.log(
        "Uploading files:",
        Array.from(files).map((f) => f.name)
      );

      // Add each file to the group via SDK
      for (const file of Array.from(files)) {
        const document = {
          id: `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          size: file.size,
          uploaded: Date.now(),
          contentType: file.type || undefined,
        };
        await addGroupDocument(groupId, document);
      }
    } catch (error) {
      console.error("Failed to upload:", error);
    } finally {
      setUploading(false);
      fileDialogOpen.current = false;
      if (e.target) e.target.value = "";
    }
  };

  // --- Trigger file dialog ---
  const triggerFileDialog = () => {
    fileDialogOpen.current = true;
    fileInputRef.current?.click();
  };

  // --- Remove Group Document ---
  const handleRemoveGroupDocument = async (docId: string) => {
    if (
      !confirm(
        "Remove this document from the group? It will no longer be available in any chat sessions."
      )
    ) {
      return;
    }

    try {
      console.log("[Mock] Removing document from group database:", docId);
      await removeGroupDocument(groupId, docId);
    } catch (error) {
      console.error("Failed to remove document:", error);
    }
  };

  // --- Link Vector Database ---
  const handleLinkDatabase = async (databaseName: string) => {
    try {
      console.log("[Mock] Linking database to group:", databaseName);
      await linkDatabase(groupId, databaseName);
      setShowLinkDatabaseModal(false);
    } catch (error) {
      console.error("Failed to link database:", error);
    }
  };

  // --- Unlink Vector Database ---
  const handleUnlinkDatabase = async (databaseName: string) => {
    if (
      !confirm(
        `Unlink database "${databaseName}"? It will no longer be available in chat sessions.`
      )
    ) {
      return;
    }

    try {
      console.log("[Mock] Unlinking database from group:", databaseName);
      await unlinkDatabase(groupId, databaseName);
    } catch (error) {
      console.error("Failed to unlink database:", error);
    }
  };

  // --- Embedding Progress Callback (Sub-phase 4.3 + 5.2 + 5.4) ---
  const handleEmbeddingProgress = (progress: EmbeddingProgress) => {
    console.log('[EmbeddingProgress]', progress);
    setEmbeddingProgress(progress);

    // Track processing start time (Sub-phase 5.4)
    if (progress.status === 'processing' && !processingStartTimes.has(progress.documentId)) {
      setProcessingStartTimes(prev => new Map(prev).set(progress.documentId, Date.now()));
    }

    // Update queue position when document completes (Sub-phase 5.4)
    if (progress.status === 'complete' || progress.status === 'failed') {
      setQueuePosition(prev => prev + 1);

      // Remove completed document from queue
      setDocumentQueue(prev => prev.filter(name => name !== progress.fileName));

      // Auto-hide progress bar 3 seconds after completion
      setTimeout(() => {
        setEmbeddingProgress(null);

        // Clear queue state if all documents processed
        if (documentQueue.length <= 1) {
          setDocumentQueue([]);
          setQueuePosition(0);
          setProcessingStartTimes(new Map());
        }
      }, 3000);
    }
  };

  // --- Start LLM Session (Sub-phase 4.2) ---
  // This function starts an LLM session with a host and triggers background embedding processing
  // Called when user creates a new chat session (after production SDK integration)
  const handleStartSession = async (
    hostUrl: string,
    modelId: string,
    pricePerToken?: number
  ): Promise<bigint | null> => {
    if (!managers || !isInitialized) {
      console.error('[handleStartSession] SDK not initialized');
      return null;
    }

    try {
      console.log('[handleStartSession] 🚀 Starting LLM session...', { hostUrl, modelId });

      // Start LLM session via SessionManager
      const sessionConfig = {
        host: hostUrl,
        modelId: modelId,
        chainId: 84532, // Base Sepolia (TODO: get from settings)
        paymentMethod: 'deposit' as const,
        depositAmount: '1000000', // 1 USDC (TODO: calculate based on expected usage)
        pricePerToken: pricePerToken || 2000, // Default 0.002 USDC per token
        encryption: true, // Enable E2EE by default
        groupId: groupId // Link session to current session group
      };

      const result = await managers.sessionManager.startSession(sessionConfig);
      const sessionId = result.sessionId;

      console.log('[handleStartSession] ✅ LLM session started:', sessionId.toString());

      // Trigger background embedding processing (non-blocking)
      processPendingEmbeddings(sessionId, hostUrl, handleEmbeddingProgress).catch((error) => {
        console.error('[handleStartSession] ⚠️  Background embedding processing failed:', error);
        // Don't throw - user can still chat even if embeddings fail
      });

      return sessionId;
    } catch (error) {
      console.error('[handleStartSession] ❌ Failed to start session:', error);
      throw error;
    }
  };

  // --- Process Pending Embeddings (Sub-phase 4.1) ---
  const processPendingEmbeddings = async (
    sessionId: bigint,
    hostUrl: string,
    onProgress?: (progress: EmbeddingProgress) => void
  ) => {
    if (!managers) {
      console.error('[ProcessPendingEmbeddings] SDK managers not available');
      return;
    }

    try {
      console.log('[ProcessPendingEmbeddings] 🚀 Starting background embedding generation...');

      // Get all pending documents via VectorRAGManager
      const vectorRAGManager = managers.vectorRAGManager;
      const sessionManager = managers.sessionManager;
      const storageManager = managers.storageManager;

      const pendingDocs = await vectorRAGManager.getPendingDocuments();

      if (pendingDocs.length === 0) {
        console.log('[ProcessPendingEmbeddings] ✅ No pending documents to process');
        return;
      }

      console.log(`[ProcessPendingEmbeddings] 📋 Found ${pendingDocs.length} pending documents`);

      // Initialize document queue (Sub-phase 5.4)
      setDocumentQueue(pendingDocs.map((doc: any) => doc.fileName));
      setQueuePosition(1); // Start at position 1 (1-indexed)

      // Process each document
      for (let i = 0; i < pendingDocs.length; i++) {
        const doc = pendingDocs[i];

        try {
          console.log(`[ProcessPendingEmbeddings] 📄 Processing document ${i + 1}/${pendingDocs.length}: ${doc.fileName}`);

          // Update status to 'processing'
          await vectorRAGManager.updateDocumentStatus(doc.id, 'processing', {
            embeddingProgress: 0
          });

          // Emit progress
          if (onProgress) {
            onProgress({
              sessionId: sessionId.toString(),
              databaseName: doc.databaseName,
              documentId: doc.id,
              fileName: doc.fileName,
              totalChunks: 0, // Will be updated after chunking
              processedChunks: 0,
              percentage: 0,
              status: 'processing'
            });
          }

          // Download document content from S5
          const s5 = storageManager.s5Client;
          const fileContent = await downloadFromS5(s5, doc.s5Cid);

          if (!fileContent) {
            throw new Error('Failed to download document from S5');
          }

          const contentString = typeof fileContent === 'string'
            ? fileContent
            : new TextDecoder().decode(fileContent);

          console.log(`[ProcessPendingEmbeddings] ✅ Downloaded ${contentString.length} chars from S5`);

          // Generate embeddings via SessionManager
          const vectors = await sessionManager.generateEmbeddings(sessionId, contentString);

          console.log(`[ProcessPendingEmbeddings] ✅ Generated ${vectors.length} vectors`);

          // Update progress mid-way
          if (onProgress) {
            onProgress({
              sessionId: sessionId.toString(),
              databaseName: doc.databaseName,
              documentId: doc.id,
              fileName: doc.fileName,
              totalChunks: vectors.length,
              processedChunks: Math.floor(vectors.length / 2),
              percentage: 50,
              status: 'processing'
            });
          }

          // Store vectors in S5 vector database
          // Note: Using the internal databaseName from the document
          for (const vector of vectors) {
            await vectorRAGManager.addVector(
              doc.databaseName,
              vector.id,
              vector.values,
              vector.metadata
            );
          }

          console.log(`[ProcessPendingEmbeddings] ✅ Stored ${vectors.length} vectors in S5`);

          // Update status to 'ready'
          await vectorRAGManager.updateDocumentStatus(doc.id, 'ready', {
            vectorCount: vectors.length,
            embeddingProgress: 100
          });

          // Emit final progress
          if (onProgress) {
            onProgress({
              sessionId: sessionId.toString(),
              databaseName: doc.databaseName,
              documentId: doc.id,
              fileName: doc.fileName,
              totalChunks: vectors.length,
              processedChunks: vectors.length,
              percentage: 100,
              status: 'complete'
            });
          }

          console.log(`[ProcessPendingEmbeddings] ✅ Document ${doc.fileName} complete`);

        } catch (error: any) {
          console.error(`[ProcessPendingEmbeddings] ❌ Failed to process ${doc.fileName}:`, error);

          // Mark document as failed
          await vectorRAGManager.updateDocumentStatus(doc.id, 'failed', {
            embeddingError: error.message
          });

          // Emit error progress
          if (onProgress) {
            onProgress({
              sessionId: sessionId.toString(),
              databaseName: doc.databaseName,
              documentId: doc.id,
              fileName: doc.fileName,
              totalChunks: 0,
              processedChunks: 0,
              percentage: 0,
              status: 'failed',
              error: error.message
            });
          }

          // Continue with next document
        }
      }

      console.log('[ProcessPendingEmbeddings] 🎉 All documents processed');

    } catch (error) {
      console.error('[ProcessPendingEmbeddings] ❌ Fatal error:', error);
    }
  };

  // --- Delete Session ---
  const handleDeleteSession = async (
    sessionId: string,
    e: React.MouseEvent
  ) => {
    console.log(`[handleDeleteSession] START: ${sessionId}`);
    e.stopPropagation();

    console.log('[handleDeleteSession] Showing confirm dialog...');
    if (!confirm("Delete this session? This action cannot be undone.")) {
      console.log('[handleDeleteSession] User cancelled');
      return;
    }
    console.log('[handleDeleteSession] User confirmed, calling deleteChat...');

    try {
      await deleteChat(groupId, sessionId);
      console.log('[handleDeleteSession] deleteChat completed, calling selectGroup...');
      await selectGroup(groupId);
      console.log('[handleDeleteSession] selectGroup completed');
    } catch (error) {
      console.error("[handleDeleteSession] ERROR:", error);
    }
  };

  // --- Start AI Chat Session (Phase 3) ---
  const handleStartAIChat = async () => {
    if (!discoveredHost) {
      setAiSessionError('No host selected. Please enable AI mode and wait for host discovery.');
      return;
    }

    setIsCreatingAISession(true);
    setAiSessionError(null);

    try {
      console.log('[handleStartAIChat] Starting AI chat session...');

      const aiSession = await startAIChat(
        groupId,
        {
          address: discoveredHost.address,
          endpoint: discoveredHost.endpoint,
          models: discoveredHost.models,
          pricing: discoveredHost.pricing,
        },
        '2', // $2 USDC deposit
        undefined // No initial message
      );

      console.log('[handleStartAIChat] ✅ AI session created:', aiSession.sessionId);

      // Navigate to the new AI session
      router.push(`/session-groups/${groupId}/${aiSession.sessionId}`);
    } catch (error: any) {
      console.error('[handleStartAIChat] ❌ Failed to create AI session:', error);
      setAiSessionError(error.message || 'Failed to create AI session');
    } finally {
      setIsCreatingAISession(false);
    }
  };

  // --- Load session group on mount ---
  useEffect(() => {
    // Wait for both wallet connection AND SDK initialization
    if (isConnected && isInitialized && groupId) {
      selectGroup(groupId);
    }
  }, [isConnected, isInitialized, groupId, selectGroup]);

  // --- Helper function to extract display text from embedded markers ---
  const extractDisplayText = (content: string): string => {
    const displayMatch = content.match(new RegExp('<<DISPLAY>>([\\s\\S]*?)<</DISPLAY>>'));
    if (displayMatch) {
      return displayMatch[1];
    }
    return content;
  };

  // --- Load chat sessions when selectedGroup changes ---
  useEffect(() => {
    async function loadChatSessions() {
      if (selectedGroup && groupId) {
        try {
          const sessions = await listChatSessionsWithData(groupId);
          // Convert ChatSession to local ChatSession format with computed properties
          const formattedSessions = await Promise.all(sessions.map(async (s) => {
            // Extract clean title from first user message (skip system messages)
            const firstUserMsg = s.messages.find(m => m.role === 'user');
            const rawTitle = firstUserMsg?.content || s.messages[0]?.content || '';
            const cleanTitle = extractDisplayText(rawTitle).substring(0, 50).trim();

            // Extract clean last message
            const lastMsg = s.messages.length > 0 ? s.messages[s.messages.length - 1] : null;
            const rawLastMsg = lastMsg?.content || '';
            const cleanLastMsg = extractDisplayText(rawLastMsg).substring(0, 100).trim();

            // Check if AI session is actually still active (similar to session detail page logic)
            let correctedMetadata = s.metadata;
            if (s.metadata?.sessionType === 'ai' && s.metadata?.blockchainSessionId && s.metadata?.blockchainStatus !== 'ended') {
              try {
                const sessionState = managers?.sessionManager?.getSession(s.metadata.blockchainSessionId);
                // Session is ended if not in memory or status is ended/completed/failed
                if (!sessionState || sessionState.status === 'ended' || sessionState.status === 'completed' || sessionState.status === 'failed') {
                  console.log(`[SessionGroupDetail] Session ${s.sessionId} blockchain status stale, correcting to 'ended'`);
                  correctedMetadata = {
                    ...s.metadata,
                    blockchainStatus: 'ended' as const,
                  };

                  // Update S5 storage with corrected status (async, don't wait)
                  if (managers?.sessionGroupManager && managers?.authManager) {
                    const userAddress = managers.authManager.getUserAddress();
                    if (userAddress) {
                      const updatedSession = { ...s, metadata: correctedMetadata };
                      const group = await managers.sessionGroupManager.getSessionGroup(groupId, userAddress);
                      if (group?.chatSessionsData?.[s.sessionId]) {
                        group.chatSessionsData[s.sessionId] = updatedSession;
                        (managers.sessionGroupManager as any).chatStorage.set(s.sessionId, updatedSession);
                        managers.sessionGroupManager.updateSessionGroup(groupId, userAddress, { chatSessionsData: group.chatSessionsData })
                          .catch(err => console.error('[SessionGroupDetail] Failed to update session status in S5:', err));
                      }
                    }
                  }
                }
              } catch (error) {
                console.warn(`[SessionGroupDetail] Failed to check session ${s.sessionId} status:`, error);
              }
            }

            return {
              sessionId: s.sessionId,
              title: cleanTitle || 'Untitled Session',
              lastMessage: cleanLastMsg || undefined,
              messageCount: s.messages.length,
              timestamp: s.updated,
              active: true, // All sessions are active by default
              metadata: correctedMetadata, // Use corrected metadata
            };
          }));
          setChatSessions(formattedSessions);
        } catch (err) {
          console.error('[SessionGroupDetail] Failed to load chat sessions:', err);
          setChatSessions([]);
        }
      } else {
        setChatSessions([]);
      }
    }

    loadChatSessions();
  }, [selectedGroup, groupId, listChatSessionsWithData, managers]);

  // --- Reload sessions when navigating back to this page (e.g., from session detail page) ---
  useEffect(() => {
    // When pathname changes back to this overview page, reload sessions
    // This catches status updates that happened on the session detail page
    if (pathname && pathname.match(/^\/session-groups\/[^\/]+\/?$/)) {
      console.log('[SessionGroupDetail] Route changed to overview page, will reload after delay...');

      // Clear SessionGroupManager cache to force fresh load from S5
      if (managers?.sessionGroupManager) {
        try {
          // Clear the internal cache
          const cache = (managers.sessionGroupManager as any).groupCache;
          const chatCache = (managers.sessionGroupManager as any).chatStorage;
          if (cache) {
            cache.clear();
            console.log('[SessionGroupDetail] ✅ Cleared group cache');
          }
          if (chatCache) {
            chatCache.clear();
            console.log('[SessionGroupDetail] ✅ Cleared chat cache');
          }
        } catch (error) {
          console.warn('[SessionGroupDetail] Failed to clear cache:', error);
        }
      }

      // Delay reload to ensure session page metadata update completes
      const timer = setTimeout(() => {
        if (groupId && isConnected && isInitialized) {
          console.log('[SessionGroupDetail] Reloading sessions from S5...');
          selectGroup(groupId); // Refresh group data and trigger session reload
        }
      }, 500); // 500ms delay

      return () => clearTimeout(timer);
    }
    // Note: Only pathname as dependency to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // --- Fix: prevent reload when window regains focus after file picker ---
  useEffect(() => {
    const handleFocus = () => {
      if (fileDialogOpen.current) return;
      // Wait for both wallet connection AND SDK initialization
      if (isConnected && isInitialized && groupId) {
        selectGroup(groupId);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isConnected, isInitialized, groupId, selectGroup]);

  // --- UI STATES ---

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to view this session group
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading session group...</p>
        </div>
      </div>
    );
  }

  if (error || !selectedGroup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Session Group Not Found
          </h2>
          <p className="text-gray-600 mb-6">
            {error || "The requested session group could not be found"}
          </p>
          <Link
            href="/session-groups"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Back to Session Groups
          </Link>
        </div>
      </div>
    );
  }

  const lastUpdate = selectedGroup.updatedAt && !isNaN(new Date(selectedGroup.updatedAt).getTime())
    ? formatDistanceToNow(new Date(selectedGroup.updatedAt), { addSuffix: true })
    : 'recently';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/session-groups"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Session Groups
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {selectedGroup.name}
              </h1>
              {selectedGroup.description && (
                <p className="text-gray-600 mb-2">
                  {selectedGroup.description}
                </p>
              )}
              <p className="text-sm text-gray-500">Updated {lastUpdate}</p>
            </div>

            <div className="flex gap-2">
              {/* AI Chat Button (Phase 3) */}
              {aiModeEnabled ? (
                <button
                  className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  onClick={handleStartAIChat}
                  disabled={isCreatingAISession || !discoveredHost}
                  title={discoveredHost ? "Create AI chat session with blockchain payment" : "Waiting for host discovery..."}
                >
                  {isCreatingAISession ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Creating AI Session...
                    </>
                  ) : !discoveredHost ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Discovering Hosts...
                    </>
                  ) : (
                    <>
                      💎 New AI Chat
                    </>
                  )}
                </button>
              ) : (
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  onClick={async () => {
                    try {
                      const session = await startChat(groupId);
                      router.push(
                        `/session-groups/${groupId}/${session.sessionId}`
                      );
                    } catch (err) {
                      console.error("Failed to start chat:", err);
                    }
                  }}
                >
                  + New Chat (Mock)
                </button>
              )}
              <button
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                onClick={() =>
                  router.push(`/session-groups/${groupId}/settings`)
                }
              >
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Payment Panel (Phase 1 + 2) */}
        <PaymentPanel
          signer={signer}
          address={address}
          aiModeEnabled={aiModeEnabled}
          onToggleAIMode={setAiModeEnabled}
          selectedHost={discoveredHost || undefined}
          hosts={hosts}
          onSelectHost={selectHost}
          isDiscovering={isDiscovering}
        />

        {/* Embedding Progress Bar (Sub-phase 5.3 + 5.4) */}
        {embeddingProgress && (
          <div className="mb-6">
            <EmbeddingProgressBar
              progress={embeddingProgress}
              queueSize={documentQueue.length > 0 ? documentQueue.length + queuePosition - 1 : undefined}
              queuePosition={queuePosition > 0 ? queuePosition : undefined}
              remainingDocuments={documentQueue.filter(name => name !== embeddingProgress.fileName)}
              estimatedTimeRemaining={(() => {
                // Calculate estimated time based on average processing time
                if (processingStartTimes.size === 0 || documentQueue.length <= 1) return undefined;

                // Calculate average time per document from completed documents
                const completedCount = processingStartTimes.size;
                const totalTime = Array.from(processingStartTimes.values()).reduce((sum, startTime) => {
                  return sum + (Date.now() - startTime);
                }, 0);
                const avgTimePerDoc = totalTime / completedCount / 1000; // Convert to seconds

                // Estimate remaining time
                const remainingDocs = documentQueue.length - 1; // Exclude current document
                return Math.round(avgTimePerDoc * remainingDocs);
              })()}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Stats Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Statistics
              </h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Chat Sessions</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {chatSessions.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Databases Linked</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {selectedGroup.linkedDatabases?.length || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Group Documents Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Group Documents
                </h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={handleGroupFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={triggerFileDialog}
                  disabled={uploading}
                  className={`text-sm px-3 py-1 rounded-md transition-colors ${
                    uploading
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "text-blue-600 hover:bg-blue-50"
                  }`}
                >
                  {uploading ? "Uploading..." : "+ Upload"}
                </button>
              </div>
              <p className="text-xs text-gray-600 mb-3">
                Documents uploaded here are available in ALL chat sessions
              </p>

              {(selectedGroup.documents || []).length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(selectedGroup.documents || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center gap-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 group"
                    >
                      <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {doc.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {Math.round(doc.size / 1024)}KB
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveGroupDocument(doc.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity"
                        title="Remove document"
                      >
                        <X className="h-3 w-3 text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No documents uploaded yet
                </p>
              )}
            </div>

            {/* Linked Databases Card */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  Linked Databases
                </h3>
                <button
                  type="button"
                  onClick={() => setShowLinkDatabaseModal(true)}
                  className="text-sm px-3 py-1 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                >
                  + Link Database
                </button>
              </div>
              <p className="text-xs text-gray-600 mb-3">
                Linked databases provide context for RAG-enhanced responses
              </p>

              {(selectedGroup.linkedDatabases?.length || 0) > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {selectedGroup.linkedDatabases?.map((dbName) => {
                    const dbInfo = databases.find(db => db.name === dbName);
                    return (
                      <div
                        key={dbName}
                        className="flex items-center gap-2 p-2 border border-gray-200 rounded-md hover:bg-gray-50 group"
                      >
                        <Database className="h-4 w-4 text-purple-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {dbName}
                          </p>
                          {dbInfo && (
                            <p className="text-xs text-gray-500">
                              {dbInfo.vectorCount.toLocaleString()} vectors
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleUnlinkDatabase(dbName)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity"
                          title="Unlink database"
                        >
                          <X className="h-3 w-3 text-red-600" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No databases linked yet
                </p>
              )}
            </div>
          </div>

          {/* Chat Sessions List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Chat Sessions ({chatSessions.length})
              </h3>

              {chatSessions.length > 0 ? (
                <div className="space-y-3">
                  {[...chatSessions]
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .map((session) => (
                      <Link
                        key={session.sessionId}
                        href={`/session-groups/${groupId}/${session.sessionId}`}
                        className="group border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer block"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-gray-900 flex items-center gap-2">
                            {/* Phase 5: AI session indicator */}
                            {(session as any).metadata?.sessionType === 'ai' && (
                              <span className="text-purple-600" title="AI Session (Blockchain)">💎</span>
                            )}
                            {session.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            {/* Session status badge - read from metadata.blockchainStatus */}
                            {(() => {
                              const status = (session as any).metadata?.blockchainStatus;
                              if (status === 'active') {
                                return (
                                  <span className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">
                                    🟢 Active
                                  </span>
                                );
                              } else if (status === 'ended') {
                                return (
                                  <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">
                                    🔴 Ended
                                  </span>
                                );
                              } else if (status === 'completed') {
                                return (
                                  <span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">
                                    ✅ Completed
                                  </span>
                                );
                              } else {
                                // Mock/local session (no blockchain status)
                                return (
                                  <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600">
                                    Local
                                  </span>
                                );
                              }
                            })()}
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteSession(session.sessionId, e);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity"
                              title="Delete session"
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </button>
                          </div>
                        </div>
                        {session.lastMessage && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                            {session.lastMessage}
                          </p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          <span>💬 {session.messageCount} messages</span>
                          <span>
                            {session.timestamp && !isNaN(new Date(session.timestamp).getTime())
                              ? formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })
                              : 'recently'}
                          </span>
                        </div>
                      </Link>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">No chat sessions yet</p>
                  {isConnected && aiModeEnabled ? (
                    <button
                      onClick={handleStartAIChat}
                      disabled={isCreatingAISession || !discoveredHost}
                      className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-md hover:from-purple-700 hover:to-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 mx-auto"
                      title={discoveredHost ? "Create AI chat session with blockchain payment" : "Waiting for host discovery..."}
                    >
                      {isCreatingAISession ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Creating AI Session...
                        </>
                      ) : !discoveredHost ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Discovering Hosts...
                        </>
                      ) : (
                        <>
                          💎 Start Your First Chat
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const session = await startChat(groupId);
                          router.push(`/session-groups/${groupId}/${session.sessionId}`);
                        } catch (err) {
                          console.error("Failed to start chat:", err);
                        }
                      }}
                      className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                    >
                      Start Your First Chat (Mock)
                    </button>
                  )}
                  {aiSessionError && (
                    <p className="text-red-600 text-sm mt-2">{aiSessionError}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Session Creation Loading Modal (Phase 3) */}
      {isCreatingAISession && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Creating AI Session...
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Please wait while we create your blockchain job and connect to the production host.
              </p>
              <div className="space-y-2 text-xs text-gray-500">
                <p>✓ Depositing USDC payment ($2)</p>
                <p>✓ Creating blockchain job</p>
                <p className="animate-pulse">⏳ Waiting for 3 confirmations...</p>
                <p>⏳ Connecting to host via WebSocket</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Session Error Modal (Phase 3) */}
      {aiSessionError && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setAiSessionError(null)}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-red-600 mb-2">
              Failed to Create AI Session
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {aiSessionError}
            </p>
            <button
              onClick={() => setAiSessionError(null)}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Link Database Modal */}
      {showLinkDatabaseModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowLinkDatabaseModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Link Vector Database
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Select a database to link to this session group. Linked databases
              provide context for RAG-enhanced chat responses.
            </p>

            <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
              {databases
                .filter((db) => !selectedGroup.linkedDatabases?.includes(db.name))
                .map((db) => (
                  <button
                    key={db.name}
                    onClick={() => handleLinkDatabase(db.name)}
                    className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-md hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                  >
                    <Database className="h-5 w-5 text-purple-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {db.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {db.vectorCount.toLocaleString()} vectors •{" "}
                        {(db.storageSize / (1024 * 1024)).toFixed(1)} MB
                      </p>
                    </div>
                  </button>
                ))}
              {databases.filter((db) => !selectedGroup.linkedDatabases?.includes(db.name))
                .length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  All available databases are already linked
                </p>
              )}
            </div>

            <button
              onClick={() => setShowLinkDatabaseModal(false)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
