'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Settings as SettingsIcon, Database, AlertTriangle } from 'lucide-react';
import type { SessionGroup } from '@fabstir/sdk-core-mock';
import { DatabaseLinker } from './database-linker';

interface GroupSettingsModalProps {
  group: SessionGroup;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<SessionGroup>) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
  availableDatabases: Array<{ id: string; name: string }>;
}

type TabType = 'general' | 'databases' | 'danger';

/**
 * Group Settings Modal
 *
 * Manage session group settings:
 * - General: Name, description
 * - Databases: Link/unlink databases, set default
 * - Danger Zone: Delete group
 */
export function GroupSettingsModal({
  group,
  isOpen,
  onClose,
  onSave,
  onDelete,
  availableDatabases,
}: GroupSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description || '');
  const [linkedDatabases, setLinkedDatabases] = useState<string[]>(group.linkedDatabases || []);
  const [defaultDatabase, setDefaultDatabase] = useState<string | null>(group.defaultDatabase || null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Handle mounting for SSR
  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen && mounted) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen, mounted]);

  // Reset form when group changes
  useEffect(() => {
    setName(group.name);
    setDescription(group.description || '');
    setLinkedDatabases(group.linkedDatabases || []);
    setDefaultDatabase(group.defaultDatabase || null);
    setError(null);
  }, [group]);

  const handleClose = () => {
    // Reset form to original group values
    setName(group.name);
    setDescription(group.description || '');
    setLinkedDatabases(group.linkedDatabases || []);
    setDefaultDatabase(group.defaultDatabase || null);
    setError(null);
    setActiveTab('general');
    onClose();
  };

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        handleClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, handleClose]);

  if (!mounted || !isOpen) return null;

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      setError('Group name is required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        linkedDatabases: linkedDatabases,
        defaultDatabase: defaultDatabase || undefined,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const confirmMessage = `Delete "${group.name}"? This will delete all ${group.chatSessions?.length || 0} chat sessions in this group. This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // Second confirmation for safety
    if (!confirm('Are you absolutely sure? This is your final warning.')) {
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      await onDelete(group.id);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setIsDeleting(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: 9999
      }}
      onClick={handleClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        style={{
          position: 'relative',
          zIndex: 10000,
          backgroundColor: 'white'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex items-center gap-3">
            <SettingsIcon className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Group Settings</h2>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            disabled={isSaving || isDeleting}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-6 bg-gray-50">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'general'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            General
          </button>
          <button
            onClick={() => setActiveTab('databases')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'databases'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Databases
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'danger'
                ? 'text-red-600 border-b-2 border-red-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Danger Zone
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* General Tab */}
          {activeTab === 'general' && (
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Group Name *
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Project Notes"
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  maxLength={100}
                  disabled={isSaving || isDeleting}
                />
                <p className="text-xs text-gray-500 mt-1">{name.length}/100 characters</p>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description for this group"
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                  maxLength={500}
                  disabled={isSaving || isDeleting}
                />
                <p className="text-xs text-gray-500 mt-1">{description.length}/500 characters</p>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">Metadata</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-600">Created</p>
                    <p className="text-gray-900">{group.createdAt ? new Date(group.createdAt).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Last Updated</p>
                    <p className="text-gray-900">{group.updatedAt ? new Date(group.updatedAt).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Chat Sessions</p>
                    <p className="text-gray-900">{group.chatSessions?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Linked Databases</p>
                    <p className="text-gray-900">{linkedDatabases.length}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Databases Tab */}
          {activeTab === 'databases' && (
            <DatabaseLinker
              availableDatabases={availableDatabases}
              linkedDatabases={linkedDatabases}
              defaultDatabase={defaultDatabase}
              onLink={(dbId) => setLinkedDatabases([...linkedDatabases, dbId])}
              onUnlink={(dbId) => setLinkedDatabases(linkedDatabases.filter((id) => id !== dbId))}
              onSetDefault={setDefaultDatabase}
              disabled={isSaving || isDeleting}
            />
          )}

          {/* Danger Zone Tab */}
          {activeTab === 'danger' && (
            <div className="space-y-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <div className="flex items-start gap-3 mb-4">
                  <AlertTriangle className="h-6 w-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-lg font-semibold text-red-900 mb-2">Delete Group</h3>
                    <p className="text-sm text-red-700 mb-4">
                      Once you delete a group, there is no going back. This will permanently delete:
                    </p>
                    <ul className="list-disc ml-5 space-y-1 text-sm text-red-700 mb-4">
                      <li>All {group.chatSessions.length} chat sessions</li>
                      <li>All conversation history</li>
                      <li>Links to {linkedDatabases.length} vector databases (databases themselves are kept)</li>
                      <li>All group settings and metadata</li>
                    </ul>
                    <p className="text-xs text-red-600 font-semibold">
                      ⚠️ This action cannot be undone!
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleDelete}
                  disabled={isSaving || isDeleting}
                  className="w-full px-4 py-3 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-5 w-5" />
                      Delete &quot;{group.name}&quot; Permanently
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={handleClose}
            disabled={isSaving || isDeleting}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isDeleting}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  // Only render portal in browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
