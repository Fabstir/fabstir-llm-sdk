'use client';

import { useState } from 'react';
import { Database, Link as LinkIcon, Unlink, CheckCircle, Circle } from 'lucide-react';

interface DatabaseLinkerProps {
  availableDatabases: Array<{ id: string; name: string }>;
  linkedDatabases: string[];
  defaultDatabase: string | null;
  onLink: (dbId: string) => void;
  onUnlink: (dbId: string) => void;
  onSetDefault: (dbId: string | null) => void;
  disabled?: boolean;
}

/**
 * Database Linker Component
 *
 * Manages database links for a session group:
 * - List all available databases
 * - Checkboxes to link/unlink
 * - Radio buttons for default database
 * - Shows linked count
 */
export function DatabaseLinker({
  availableDatabases,
  linkedDatabases,
  defaultDatabase,
  onLink,
  onUnlink,
  onSetDefault,
  disabled = false,
}: DatabaseLinkerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter databases by search query
  const filteredDatabases = availableDatabases.filter((db) =>
    db.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate linked and unlinked databases
  const linkedDbList = filteredDatabases.filter((db) => linkedDatabases.includes(db.id));
  const unlinkedDbList = filteredDatabases.filter((db) => !linkedDatabases.includes(db.id));

  const handleToggleLink = (dbId: string) => {
    if (disabled) return;

    if (linkedDatabases.includes(dbId)) {
      onUnlink(dbId);
      // If this was the default database, clear default
      if (defaultDatabase === dbId) {
        onSetDefault(null);
      }
    } else {
      onLink(dbId);
    }
  };

  const handleSetDefault = (dbId: string) => {
    if (disabled) return;

    if (defaultDatabase === dbId) {
      onSetDefault(null);
    } else {
      onSetDefault(dbId);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Linked Databases</h3>
        <p className="text-sm text-gray-600 mb-4">
          Select which vector databases to use for RAG context in this group. Documents from linked
          databases will be searchable during chat sessions.
        </p>
        <div className="flex items-center gap-4 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm text-blue-900">
          <Database className="h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-medium">
              {linkedDatabases.length} database{linkedDatabases.length !== 1 ? 's' : ''} linked
            </p>
            {linkedDatabases.length > 0 && (
              <p className="text-xs text-blue-700 mt-0.5">
                Chat sessions in this group can search across all linked databases
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      <div>
        <input
          type="text"
          placeholder="Search databases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={disabled}
        />
      </div>

      {/* Linked Databases */}
      {linkedDbList.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            Linked ({linkedDbList.length})
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
            {linkedDbList.map((db) => (
              <div
                key={db.id}
                className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
              >
                {/* Checkbox */}
                <button
                  onClick={() => handleToggleLink(db.id)}
                  disabled={disabled}
                  className="flex-shrink-0"
                >
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </button>

                {/* Database Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{db.name}</p>
                  {defaultDatabase === db.id && (
                    <p className="text-xs text-blue-600 font-medium">Default database</p>
                  )}
                </div>

                {/* Set Default Button */}
                <button
                  onClick={() => handleSetDefault(db.id)}
                  disabled={disabled}
                  className={`px-3 py-1 text-xs rounded-md transition-colors ${
                    defaultDatabase === db.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {defaultDatabase === db.id ? 'Default' : 'Set Default'}
                </button>

                {/* Unlink Button */}
                <button
                  onClick={() => handleToggleLink(db.id)}
                  disabled={disabled}
                  className="flex-shrink-0 p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                  title="Unlink database"
                >
                  <Unlink className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Databases */}
      {unlinkedDbList.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-3">
            Available Databases ({unlinkedDbList.length})
          </h4>
          <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-md p-3">
            {unlinkedDbList.map((db) => (
              <button
                key={db.id}
                onClick={() => handleToggleLink(db.id)}
                disabled={disabled}
                className="w-full flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors text-left"
              >
                <Circle className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <p className="text-sm font-medium text-gray-900 truncate flex-1">{db.name}</p>
                <div className="text-xs text-gray-500 flex-shrink-0">Click to link</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredDatabases.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">
            {searchQuery ? 'No databases found matching your search' : 'No databases available'}
          </p>
          {!searchQuery && (
            <p className="text-xs mt-1">Create a vector database to link it to this group</p>
          )}
        </div>
      )}

      {/* Default Database Info */}
      {linkedDatabases.length > 0 && (
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-sm">
          <p className="text-gray-700 mb-2">
            <strong>Default Database:</strong>{' '}
            {defaultDatabase
              ? availableDatabases.find((db) => db.id === defaultDatabase)?.name || 'Unknown'
              : 'None selected'}
          </p>
          <p className="text-xs text-gray-600">
            The default database is used for uploading new documents when no specific database is
            selected. If no default is set, you&apos;ll be prompted to choose a database when
            uploading.
          </p>
        </div>
      )}
    </div>
  );
}
