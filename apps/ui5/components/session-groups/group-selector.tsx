'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Search, Plus, Check, Folder } from 'lucide-react';
import type { SessionGroup } from '@fabstir/sdk-core';

interface GroupSelectorProps {
  groups: SessionGroup[];
  activeGroupId: string | null;
  onGroupSelect: (groupId: string | null) => void;
  onCreateGroup?: () => void;
  className?: string;
}

/**
 * Group Selector Dropdown
 *
 * Compact dropdown for selecting active session group
 * Features:
 * - Shows current group name in button
 * - Lists all groups with search
 * - "Create New Group" option
 * - Active group indicator (checkmark)
 * - Persists selection to localStorage
 */
export function GroupSelector({
  groups,
  activeGroupId,
  onGroupSelect,
  onCreateGroup,
  className = '',
}: GroupSelectorProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeGroup = groups.find((g) => g.id === activeGroupId);

  // Filter groups by search query
  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleGroupSelect = (groupId: string | null) => {
    onGroupSelect(groupId);
    setIsOpen(false);
    setSearchQuery('');

    // Save to localStorage
    if (groupId) {
      localStorage.setItem('active_session_group', groupId);
    } else {
      localStorage.removeItem('active_session_group');
    }
  };

  const handleCreateGroup = () => {
    setIsOpen(false);
    setSearchQuery('');
    if (onCreateGroup) {
      onCreateGroup();
    } else {
      router.push('/session-groups/new');
    }
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Dropdown Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <Folder className="h-4 w-4 text-gray-600" />
        <span className="text-sm font-medium text-gray-900">
          {activeGroup ? activeGroup.name : 'No Group Selected'}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-gray-600 transition-transform ${
            isOpen ? 'transform rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
          {/* Search Bar */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search groups..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          {/* Groups List */}
          <div className="overflow-y-auto flex-1">
            {/* No Group Option */}
            <button
              onClick={() => handleGroupSelect(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                activeGroupId === null ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex-shrink-0 w-5">
                {activeGroupId === null && (
                  <Check className="h-5 w-5 text-blue-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">No Group</p>
                <p className="text-xs text-gray-500">Standalone session</p>
              </div>
            </button>

            {/* Group Options */}
            {filteredGroups.length > 0 ? (
              filteredGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => handleGroupSelect(group.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-t border-gray-100 ${
                    activeGroupId === group.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex-shrink-0 w-5">
                    {activeGroupId === group.id && (
                      <Check className="h-5 w-5 text-blue-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {group.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {group.chatSessions.length} session
                      {group.chatSessions.length !== 1 ? 's' : ''} • {((group as any).databases || []).length} database
                      {((group as any).databases || []).length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </button>
              ))
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-gray-500">
                  {searchQuery ? 'No groups found' : 'No groups yet'}
                </p>
              </div>
            )}
          </div>

          {/* Create New Group Button */}
          <div className="p-3 border-t border-gray-200 bg-gray-50">
            <button
              onClick={handleCreateGroup}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium text-sm"
            >
              <Plus className="h-4 w-4" />
              Create New Group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
