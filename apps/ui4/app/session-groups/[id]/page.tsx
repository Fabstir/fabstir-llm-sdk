"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Trash2, X, FileText, Database } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useSDK } from "@/hooks/use-sdk";
import { useSessionGroups } from "@/hooks/use-session-groups";
import { useVectorDatabases } from "@/hooks/use-vector-databases";

interface ChatSession {
  sessionId: string;
  title: string;
  lastMessage?: string;
  messageCount: number;
  timestamp: number;
  active: boolean;
}

/**
 * Session Group Detail Page
 *
 * Displays session group details and list of chat sessions
 */
export default function SessionGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isConnected } = useWallet();
  const { isInitialized } = useSDK();
  const {
    selectedGroup,
    selectGroup,
    startChat,
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

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showLinkDatabaseModal, setShowLinkDatabaseModal] = useState(false);

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

  // --- Delete Session ---
  const handleDeleteSession = async (
    sessionId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    if (!confirm("Delete this session? This action cannot be undone.")) return;

    try {
      await deleteChat(groupId, sessionId);
      await selectGroup(groupId);
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  // --- Load session group on mount ---
  useEffect(() => {
    // Wait for both wallet connection AND SDK initialization
    if (isConnected && isInitialized && groupId) {
      selectGroup(groupId);
    }
  }, [isConnected, isInitialized, groupId, selectGroup]);

  // --- Load chat sessions when selectedGroup changes ---
  useEffect(() => {
    async function loadChatSessions() {
      if (selectedGroup && groupId) {
        try {
          const sessions = await listChatSessionsWithData(groupId);
          // Convert ChatSession to local ChatSession format with computed properties
          const formattedSessions = sessions.map((s) => ({
            sessionId: s.sessionId,
            title: s.title,
            lastMessage: s.messages.length > 0 ? s.messages[s.messages.length - 1].content.substring(0, 100) : undefined,
            messageCount: s.messages.length,
            timestamp: s.updated,
            active: true, // All sessions are active by default
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
  }, [selectedGroup, groupId, listChatSessionsWithData]);

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
                + New Chat
              </button>
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

              {(selectedGroup.groupDocuments || []).length > 0 ? (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(selectedGroup.groupDocuments || []).map((doc) => (
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
                      <div
                        key={session.sessionId}
                        className="group border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() =>
                          router.push(
                            `/session-groups/${groupId}/${session.sessionId}`
                          )
                        }
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="font-medium text-gray-900">
                            {session.title}
                          </h4>
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-xs px-2 py-1 rounded ${
                                session.active
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {session.active ? "Active" : "Archived"}
                            </span>
                            <button
                              onClick={(e) =>
                                handleDeleteSession(session.sessionId, e)
                              }
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
                      </div>
                    ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-600 mb-4">No chat sessions yet</p>
                  <button
                    onClick={() => {
                      const newSessionId = `sess-${Date.now()}`;
                      router.push(`/session-groups/${groupId}/${newSessionId}`);
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                  >
                    Start Your First Chat
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
