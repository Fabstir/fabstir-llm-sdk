'use client';

import { useState, useEffect } from 'react';
import { useAppShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { ShortcutsModal } from '@/components/shortcuts-modal';
import { GlobalSearch } from '@/components/global-search';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ToastProvider } from '@/contexts/toast-context';

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Register application-wide keyboard shortcuts
  useAppShortcuts(() => setShowShortcuts(true));

  // Add global search trigger (Cmd/Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <ToastProvider>
      <Breadcrumbs />
      {children}
      <ShortcutsModal
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />
      <GlobalSearch
        isOpen={showSearch}
        onClose={() => setShowSearch(false)}
      />
    </ToastProvider>
  );
}
