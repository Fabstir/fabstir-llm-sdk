'use client';

import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Trash2 } from 'lucide-react';

export interface Session {
  id: string;
  groupId: string;
  title?: string;
  lastMessage?: string;
  messageCount: number;
  created: number;
  updated: number;
}

interface SessionCardProps {
  session: Session;
  isActive?: boolean;
  onClick: () => void;
  onDelete?: (id: string) => void;
}

/**
 * SessionCard - Preview of a single session in the history sidebar
 *
 * Shows title (or first message), message count, and timestamp
 */
export function SessionCard({ session, isActive = false, onClick, onDelete }: SessionCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete && confirm('Delete this session?')) {
      onDelete(session.id);
    }
  };

  // Generate title from last message if no title set
  const displayTitle = session.title || session.lastMessage?.substring(0, 50) || 'New Session';

  return (
    <div
      onClick={onClick}
      className={`group p-3 rounded-lg cursor-pointer transition-colors ${
        isActive
          ? 'bg-blue-50 border-2 border-blue-500'
          : 'hover:bg-gray-50 border-2 border-transparent'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4
            className={`font-medium text-sm truncate ${
              isActive ? 'text-blue-900' : 'text-gray-900'
            }`}
          >
            {displayTitle}
          </h4>
          {session.lastMessage && session.title && (
            <p className="text-xs text-gray-500 truncate mt-1">{session.lastMessage}</p>
          )}
        </div>

        {onDelete && (
          <button
            onClick={handleDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 transition-opacity"
          >
            <Trash2 className="h-4 w-4 text-red-600" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <MessageSquare className="h-3 w-3" />
          <span>{session.messageCount}</span>
        </div>
        <span>•</span>
        <span>{formatDistanceToNow(new Date(session.updated), { addSuffix: true })}</span>
      </div>
    </div>
  );
}
