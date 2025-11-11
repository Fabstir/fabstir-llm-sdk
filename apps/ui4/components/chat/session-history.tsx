'use client';

import { Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { SessionCard, Session } from './session-card';

interface SessionHistoryProps {
  sessions: Session[];
  activeSessionId?: string;
  onSessionClick: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession?: (sessionId: string) => void;
}

/**
 * SessionHistory - Sidebar showing past chat sessions
 *
 * Features:
 * - Search sessions
 * - Create new session
 * - Delete sessions
 * - Highlight active session
 */
export function SessionHistory({
  sessions,
  activeSessionId,
  onSessionClick,
  onNewSession,
  onDeleteSession,
}: SessionHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter sessions by search query
  const filteredSessions = sessions.filter((session) => {
    const query = searchQuery.toLowerCase();
    return (
      session.title?.toLowerCase().includes(query) ||
      session.lastMessage?.toLowerCase().includes(query)
    );
  });

  // Sort by most recent first
  const sortedSessions = [...filteredSessions].sort((a, b) => b.updated - a.updated);

  return (
    <div className="h-full flex flex-col bg-gray-50 border-r border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <button
          onClick={onNewSession}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <Plus className="h-5 w-5" />
          New Session
        </button>
      </div>

      {/* Search */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {sortedSessions.length > 0 ? (
          sortedSessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => onSessionClick(session.id)}
              onDelete={onDeleteSession}
            />
          ))
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-sm">
              {searchQuery ? 'No sessions found' : 'No sessions yet'}
            </p>
            {!searchQuery && (
              <p className="text-gray-400 text-xs mt-2">Start a new conversation</p>
            )}
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-gray-200 bg-white">
        <p className="text-xs text-gray-500 text-center">
          {sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}
        </p>
      </div>
    </div>
  );
}
