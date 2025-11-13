import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export interface KeyboardShortcut {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  description: string;
  action: () => void;
}

/**
 * Hook for registering keyboard shortcuts
 *
 * @param shortcuts - Array of keyboard shortcut configurations
 * @param enabled - Whether shortcuts are enabled (default: true)
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true'
      ) {
        // Exception: Allow Cmd+K even in input fields
        if (!(event.key === 'k' && (event.metaKey || event.ctrlKey))) {
          return;
        }
      }

      shortcuts.forEach((shortcut) => {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const ctrlMatches = shortcut.ctrlKey === undefined || event.ctrlKey === shortcut.ctrlKey;
        const metaMatches = shortcut.metaKey === undefined || event.metaKey === shortcut.metaKey;
        const shiftMatches = shortcut.shiftKey === undefined || event.shiftKey === shortcut.shiftKey;

        if (keyMatches && ctrlMatches && metaMatches && shiftMatches) {
          event.preventDefault();
          shortcut.action();
        }
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, enabled]);
}

/**
 * Hook for common application shortcuts
 *
 * Provides standard shortcuts:
 * - Cmd/Ctrl + Shift + G: New session group
 * - Cmd/Ctrl + N: New session (in current group)
 * - Cmd/Ctrl + K: Global search
 * - Cmd/Ctrl + ,: Settings
 * - ?: Show keyboard shortcuts help
 */
export function useAppShortcuts(onShowHelp?: () => void) {
  const router = useRouter();

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'g',
      metaKey: true,
      shiftKey: true,
      description: 'New Session Group',
      action: () => router.push('/session-groups'),
    },
    {
      key: 'k',
      metaKey: true,
      description: 'Global Search',
      action: () => {
        // Trigger global search modal
        const searchButton = document.querySelector('[data-search-trigger]') as HTMLButtonElement;
        if (searchButton) {
          searchButton.click();
        }
      },
    },
    {
      key: ',',
      metaKey: true,
      description: 'Settings',
      action: () => router.push('/settings'),
    },
    {
      key: '?',
      description: 'Show Keyboard Shortcuts',
      action: () => {
        if (onShowHelp) {
          onShowHelp();
        }
      },
    },
  ];

  useKeyboardShortcuts(shortcuts);
}

/**
 * Format shortcut display (e.g., "Cmd+Shift+G" or "Ctrl+Shift+G")
 */
export function formatShortcut(shortcut: KeyboardShortcut): string {
  const parts: string[] = [];
  const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;

  if (shortcut.ctrlKey) parts.push('Ctrl');
  if (shortcut.metaKey) parts.push(isMac ? 'Cmd' : 'Ctrl');
  if (shortcut.shiftKey) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());

  return parts.join('+');
}
