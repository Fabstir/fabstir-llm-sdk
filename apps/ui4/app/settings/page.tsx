'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import {
  User,
  Palette,
  Globe,
  Bell,
  Download,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  ArrowLeft,
} from 'lucide-react';

interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    mentions: boolean;
  };
}

const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  language: 'en',
  notifications: {
    email: true,
    push: true,
    mentions: true,
  },
};

/**
 * Settings Page
 *
 * User preferences, account info, and data management
 */
export default function SettingsPage() {
  const router = useRouter();
  const { isConnected, address } = useWallet();

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [showSeed, setShowSeed] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [copiedSeed, setCopiedSeed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    if (!isConnected) return;

    const stored = localStorage.getItem('user_settings');
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (err) {
        console.error('Failed to load settings:', err);
      }
    }
  }, [isConnected]);

  // Apply theme when settings change
  useEffect(() => {
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (settings.theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      // System theme - check user's OS preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [settings.theme]);

  // Save settings to localStorage
  const saveSettings = (newSettings: UserSettings) => {
    setSettings(newSettings);
    localStorage.setItem('user_settings', JSON.stringify(newSettings));
  };

  const handleThemeChange = (theme: 'light' | 'dark' | 'system') => {
    // Save settings - theme will be applied by useEffect
    saveSettings({ ...settings, theme });
  };

  const handleLanguageChange = (language: string) => {
    saveSettings({ ...settings, language });
  };

  const handleNotificationToggle = (key: keyof UserSettings['notifications']) => {
    saveSettings({
      ...settings,
      notifications: {
        ...settings.notifications,
        [key]: !settings.notifications[key],
      },
    });
  };

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    }
  };

  const handleCopySeed = async () => {
    const mockSeed = 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
    await navigator.clipboard.writeText(mockSeed);
    setCopiedSeed(true);
    setTimeout(() => setCopiedSeed(false), 2000);
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      // Gather all data from localStorage
      const data = {
        settings,
        sessionGroups: JSON.parse(localStorage.getItem('mock_session_groups') || '[]'),
        vectorDatabases: JSON.parse(localStorage.getItem('mock_vector_databases') || '[]'),
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
      };

      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fabstir-llm-export-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This will remove all your data and cannot be undone.')) {
      return;
    }

    if (!confirm('This is your final warning. All session groups, databases, and settings will be permanently deleted. Continue?')) {
      return;
    }

    setDeleting(true);
    try {
      // Clear all localStorage data
      const keysToRemove = Object.keys(localStorage).filter(key =>
        key.startsWith('mock_') || key === 'user_settings'
      );
      keysToRemove.forEach(key => localStorage.removeItem(key));

      alert('Account deleted successfully');
      router.push('/');
    } catch (err) {
      console.error('Delete failed:', err);
      alert('Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Not Connected</h2>
          <p className="text-gray-600">Please connect your wallet to access settings</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/"
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-2 text-gray-600">Manage your account and preferences</p>
      </div>

      {/* Account Section */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <User className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Account</h2>
        </div>

        <div className="space-y-4">
          {/* Wallet Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Wallet Address
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 rounded-md text-sm font-mono break-all">
                {address}
              </code>
              <button
                onClick={handleCopyAddress}
                className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                title="Copy address"
              >
                {copiedAddress ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-600" />
                )}
              </button>
            </div>
          </div>

          {/* S5 Seed */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              S5 Storage Seed
            </label>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 rounded-md text-sm font-mono">
                {showSeed
                  ? 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12'
                  : '••••• ••••• ••••• ••••• ••••• ••••• ••••• ••••• ••••• ••••• ••••• •••••'}
              </code>
              <button
                onClick={() => setShowSeed(!showSeed)}
                className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                title={showSeed ? 'Hide seed' : 'Show seed'}
              >
                {showSeed ? (
                  <EyeOff className="h-4 w-4 text-gray-600" />
                ) : (
                  <Eye className="h-4 w-4 text-gray-600" />
                )}
              </button>
              <button
                onClick={handleCopySeed}
                className="p-2 rounded-md hover:bg-gray-100 transition-colors"
                title="Copy seed"
              >
                {copiedSeed ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-600" />
                )}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500">
              Keep this seed phrase secure. It's required to access your S5 storage.
            </p>
          </div>
        </div>
      </div>

      {/* Preferences Section */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Palette className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Preferences</h2>
        </div>

        <div className="space-y-6">
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Theme
            </label>
            <div className="flex gap-3">
              {(['light', 'dark', 'system'] as const).map((theme) => (
                <button
                  key={theme}
                  onClick={() => handleThemeChange(theme)}
                  className={`px-4 py-2 rounded-md border transition-colors ${
                    settings.theme === theme
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {theme.charAt(0).toUpperCase() + theme.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 mb-2">
              Language
            </label>
            <select
              id="language"
              value={settings.language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="en">English</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="zh">中文</option>
            </select>
          </div>

          {/* Notifications */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-5 w-5 text-gray-600" />
              <label className="block text-sm font-medium text-gray-700">
                Notifications
              </label>
            </div>
            <div className="space-y-3">
              {Object.entries(settings.notifications).map(([key, value]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={() => handleNotificationToggle(key as keyof UserSettings['notifications'])}
                    className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">
                    {key.charAt(0).toUpperCase() + key.slice(1)} notifications
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Data Management Section */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-3 mb-6">
          <Globe className="h-6 w-6 text-blue-600" />
          <h2 className="text-xl font-semibold">Data Management</h2>
        </div>

        <div className="space-y-4">
          {/* Export Data */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-2">Export Your Data</h3>
            <p className="text-sm text-gray-600 mb-3">
              Download all your session groups, vector databases, and settings as JSON.
            </p>
            <button
              onClick={handleExportData}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              {exporting ? 'Exporting...' : 'Export Data'}
            </button>
          </div>

          <hr className="border-gray-200" />

          {/* Delete Account */}
          <div>
            <h3 className="text-sm font-medium text-red-900 mb-2">Delete Account</h3>
            <p className="text-sm text-gray-600 mb-3">
              Permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
