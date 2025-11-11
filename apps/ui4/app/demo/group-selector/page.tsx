'use client';

import { useState, useEffect } from 'react';
import { GroupSelector } from '@/components/session-groups/group-selector';
import { useSessionGroups } from '@/hooks/use-session-groups';

/**
 * Group Selector Demo Page
 *
 * Demonstrates the GroupSelector component functionality:
 * - Select active group from dropdown
 * - Search/filter groups
 * - Create new group
 * - Persist selection to localStorage
 */
export default function GroupSelectorDemoPage() {
  const { sessionGroups, isLoading } = useSessionGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  // Load saved group selection from localStorage on mount
  useEffect(() => {
    const savedGroupId = localStorage.getItem('active_session_group');
    if (savedGroupId && sessionGroups.some((g) => g.id === savedGroupId)) {
      setActiveGroupId(savedGroupId);
    }
  }, [sessionGroups]);

  const activeGroup = sessionGroups.find((g) => g.id === activeGroupId);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Group Selector Demo
          </h1>
          <p className="text-gray-600">
            Select a session group from the dropdown to organize your chat sessions
          </p>
        </div>

        {/* Group Selector */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Active Session Group
          </h2>

          {isLoading ? (
            <div className="flex items-center gap-2 text-gray-600">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
              Loading groups...
            </div>
          ) : (
            <GroupSelector
              groups={sessionGroups}
              activeGroupId={activeGroupId}
              onGroupSelect={setActiveGroupId}
              className="max-w-md"
            />
          )}
        </div>

        {/* Selected Group Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Selected Group Details
          </h2>

          {activeGroup ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-600">Name:</p>
                <p className="text-lg font-medium text-gray-900">{activeGroup.name}</p>
              </div>

              {activeGroup.description && (
                <div>
                  <p className="text-sm text-gray-600">Description:</p>
                  <p className="text-gray-800">{activeGroup.description}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-3 border-t border-gray-200">
                <div>
                  <p className="text-sm text-gray-600">Chat Sessions:</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {activeGroup.chatSessions.length}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Linked Databases:</p>
                  <p className="text-2xl font-bold text-green-600">
                    {activeGroup.databases.length}
                  </p>
                </div>
              </div>

              {activeGroup.databases.length > 0 && (
                <div className="pt-3 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Databases:</p>
                  <ul className="space-y-1">
                    {activeGroup.databases.map((db) => (
                      <li key={db} className="text-sm text-gray-700 flex items-center gap-2">
                        <span className="text-green-600">•</span>
                        {db}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="mb-2">No group selected</p>
              <p className="text-sm">Select a group from the dropdown above</p>
            </div>
          )}
        </div>

        {/* Usage Example */}
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Usage Example
          </h2>

          <pre className="bg-white p-4 rounded border border-gray-200 overflow-x-auto text-sm">
{`import { GroupSelector } from '@/components/session-groups/group-selector';
import { useSessionGroups } from '@/hooks/use-session-groups';

function MyComponent() {
  const { sessionGroups } = useSessionGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  return (
    <GroupSelector
      groups={sessionGroups}
      activeGroupId={activeGroupId}
      onGroupSelect={setActiveGroupId}
    />
  );
}`}
          </pre>

          <div className="mt-4 space-y-2 text-sm text-gray-700">
            <p><strong>Features:</strong></p>
            <ul className="list-disc ml-5 space-y-1">
              <li>Dropdown showing current group name</li>
              <li>Search bar to filter groups</li>
              <li>&quot;No Group&quot; option for standalone sessions</li>
              <li>Active group highlighted with checkmark</li>
              <li>&quot;Create New Group&quot; button</li>
              <li>Persists selection to localStorage</li>
              <li>Keyboard navigation (Escape to close)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
