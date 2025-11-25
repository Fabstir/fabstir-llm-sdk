'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Share2, UserPlus, Trash2 } from 'lucide-react';
import type { SessionGroup } from '@fabstir/sdk-core';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: SessionGroup;
  onShare: (userAddress: string, role: 'reader' | 'writer') => Promise<void>;
  onUnshare: (userAddress: string) => Promise<void>;
}

/**
 * Share Modal Component
 *
 * Allows sharing session groups with other users
 */
export function ShareModal({ isOpen, onClose, group, onShare, onUnshare }: ShareModalProps) {
  const [mounted, setMounted] = useState(false);
  const [newUserAddress, setNewUserAddress] = useState('');
  const [selectedRole, setSelectedRole] = useState<'reader' | 'writer'>('reader');
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setNewUserAddress('');
      setSelectedRole('reader');
      setError(null);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen && !isSharing) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, isSharing, onClose]);

  if (!mounted || !isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newUserAddress.trim()) {
      setError('Please enter a wallet address');
      return;
    }

    // Basic Ethereum address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(newUserAddress.trim())) {
      setError('Invalid Ethereum address format');
      return;
    }

    try {
      setIsSharing(true);
      setError(null);
      await onShare(newUserAddress.trim(), selectedRole);
      setNewUserAddress('');
      setSelectedRole('reader');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share group');
    } finally {
      setIsSharing(false);
    }
  };

  const handleUnshare = async (userAddress: string) => {
    if (!confirm(`Remove access for ${userAddress.substring(0, 8)}...${userAddress.substring(userAddress.length - 6)}?`)) {
      return;
    }

    try {
      setIsSharing(true);
      setError(null);
      await onUnshare(userAddress);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove user');
    } finally {
      setIsSharing(false);
    }
  };

  // Get list of shared users from permissions
  const readers = (group as any).permissions?.readers || [];
  const writers = (group as any).permissions?.writers || [];
  const allSharedUsers = [
    ...readers.map((addr: any) => ({ address: addr, role: 'reader' as const })),
    ...writers.map((addr: any) => ({ address: addr, role: 'writer' as const }))
  ];

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
      onClick={!isSharing ? onClose : undefined}
    >
      <div
        className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
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
            <Share2 className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Share Session Group</h2>
              <p className="text-sm text-gray-600 mt-0.5">{group.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-200 transition-colors"
            disabled={isSharing}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Add User Form */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-blue-900 mb-3 flex items-center gap-2">
                <UserPlus className="h-4 w-4" />
                Share with New User
              </h3>
              <form onSubmit={handleShare} className="space-y-3">
                <div>
                  <label htmlFor="userAddress" className="block text-sm font-medium text-gray-700 mb-1">
                    Wallet Address
                  </label>
                  <input
                    id="userAddress"
                    type="text"
                    value={newUserAddress}
                    onChange={(e) => setNewUserAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-mono"
                    disabled={isSharing}
                  />
                </div>
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700 mb-1">
                    Access Level
                  </label>
                  <select
                    id="role"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'reader' | 'writer')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    disabled={isSharing}
                  >
                    <option value="reader">Reader (View Only)</option>
                    <option value="writer">Writer (View & Edit)</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isSharing || !newUserAddress.trim()}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSharing ? 'Sharing...' : 'Share Access'}
                </button>
              </form>
            </div>

            {/* Current Shared Users */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                People with Access ({allSharedUsers.length})
              </h3>
              {allSharedUsers.length > 0 ? (
                <div className="space-y-2">
                  {allSharedUsers.map((user) => (
                    <div
                      key={user.address}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-mono text-gray-900">
                          {user.address.substring(0, 8)}...{user.address.substring(user.address.length - 6)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {user.role === 'reader' ? '👁️ Reader (View Only)' : '✏️ Writer (View & Edit)'}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnshare(user.address)}
                        disabled={isSharing}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Remove access"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 border border-gray-200 rounded-lg bg-gray-50">
                  <Share2 className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600">Not shared with anyone yet</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Add wallet addresses above to share access
                  </p>
                </div>
              )}
            </div>

            {/* Info Panel */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                🔒 About Sharing
              </h4>
              <ul className="space-y-1.5 text-sm text-gray-600">
                <li>• <strong>Readers</strong> can view session groups and chat history</li>
                <li>• <strong>Writers</strong> can view, edit, and add new chats</li>
                <li>• Shared users can access linked vector databases</li>
                <li>• You can remove access at any time</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex justify-end bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSharing}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );

  // Only render portal in browser environment
  if (typeof document === 'undefined') return null;

  return createPortal(modalContent, document.body);
}
