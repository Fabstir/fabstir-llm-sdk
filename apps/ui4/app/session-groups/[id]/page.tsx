"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { Trash2, X, FileText } from "lucide-react";
import { useWallet } from "@/hooks/use-wallet";
import { useSessionGroups } from "@/hooks/use-session-groups";

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
  const {
    selectedGroup,
    selectGroup,
    startChat,
    deleteChat,
    addGroupDocument,
    removeGroupDocument,
    isLoading,
    error,
  } = useSessionGroups();

  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [uploading, setUploading] = useState(false);

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
    if (isConnected && groupId) {
      selectGroup(groupId);
    }
  }, [isConnected, groupId, selectGroup]);

  // --- Update chat sessions when selectedGroup changes ---
  useEffect(() => {
    if (selectedGroup && selectedGroup.chatSessions) {
      const formattedSessions = selectedGroup.chatSessions.map((s) => ({
        sessionId: s.sessionId,
        title: s.title,
        lastMessage: s.lastMessage,
        messageCount: s.messageCount || 0,
        timestamp: s.timestamp,
        active: s.active !== undefined ? s.active : true,
      }));
      setChatSessions(formattedSessions);
    } else {
      setChatSessions([]);
    }
  }, [selectedGroup]);

  // --- Fix: prevent reload when window regains focus after file picker ---
  useEffect(() => {
    const handleFocus = () => {
      if (fileDialogOpen.current) return;
      if (isConnected && groupId) {
        selectGroup(groupId);
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [isConnected, groupId, selectGroup]);

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

  const lastUpdate = formatDistanceToNow(new Date(selectedGroup.updated), {
    addSuffix: true,
  });

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
                    {selectedGroup.databases.length}
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
                            {formatDistanceToNow(new Date(session.timestamp), {
                              addSuffix: true,
                            })}
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
    </div>
  );
}
