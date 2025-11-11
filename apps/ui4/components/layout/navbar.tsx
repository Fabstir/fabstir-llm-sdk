'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/hooks/use-wallet';
import { useSDK } from '@/hooks/use-sdk';
import { useEffect, useState } from 'react';
import { cn, truncateAddress } from '@/lib/utils';
import { Bell, Menu, X } from 'lucide-react';

const navItems = [
  { href: '/', label: 'Dashboard' },
  { href: '/session-groups', label: 'Sessions' },
  { href: '/vector-databases', label: 'Databases' },
  { href: '/settings', label: 'Settings' },
];

export function Navbar() {
  const pathname = usePathname();
  const { address, isConnected, isConnecting, connect, disconnect } = useWallet();
  const { initialize, disconnect: disconnectSDK } = useSDK();
  const [unreadCount, setUnreadCount] = useState(0);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Initialize SDK when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      initialize(address).catch((err) => {
        console.error('Failed to initialize SDK:', err);
      });
    }
  }, [isConnected, address, initialize]);

  // Close mobile menu on navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Load unread notification count
  useEffect(() => {
    if (!isConnected || !address) {
      setUnreadCount(0);
      return;
    }

    const loadUnreadCount = () => {
      try {
        let totalCount = 0;

        const notificationsKey = `notifications_${address}`;
        const storedNotifications = localStorage.getItem(notificationsKey);
        if (storedNotifications) {
          const notifications = JSON.parse(storedNotifications);
          const unread = notifications.filter((n: any) => !n.read).length;
          totalCount += unread;
        }

        const invitationsKey = `invitations_${address}`;
        const storedInvitations = localStorage.getItem(invitationsKey);
        if (storedInvitations) {
          const invitations = JSON.parse(storedInvitations);
          const pending = invitations.filter((inv: any) => inv.status === 'pending').length;
          totalCount += pending;
        }

        setUnreadCount(totalCount);
      } catch (error) {
        console.error('Failed to load unread count:', error);
        setUnreadCount(0);
      }
    };

    loadUnreadCount();

    // Reload count when window regains focus (user comes back from notifications page)
    const handleFocus = () => loadUnreadCount();
    window.addEventListener('focus', handleFocus);

    return () => window.removeEventListener('focus', handleFocus);
  }, [isConnected, address, pathname]); // Reload when pathname changes

  const handleDisconnect = () => {
    disconnectSDK();
    disconnect();
  };

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo and Navigation */}
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-primary">
              Fabstir UI4
            </Link>

            {/* Desktop Navigation */}
            {isConnected && (
              <div className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      pathname === item.href
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Right Side: Notifications, Wallet, Mobile Menu */}
          <div className="flex items-center gap-3">
            {isConnected && (
              <Link
                href="/notifications"
                className="relative p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            )}

            {!isConnected ? (
              <button
                onClick={connect}
                disabled={isConnecting}
                className={cn(
                  'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-sm text-muted-foreground">
                  {truncateAddress(address || '')}
                </div>
                <button
                  onClick={handleDisconnect}
                  className={cn(
                    'px-4 py-2 rounded-md text-sm font-medium transition-colors',
                    'border border-border',
                    'hover:bg-muted'
                  )}
                >
                  Disconnect
                </button>
              </div>
            )}

            {/* Mobile Menu Button */}
            {isConnected && (
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6" />
                ) : (
                  <Menu className="h-6 w-6" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Menu Dropdown */}
        {isConnected && isMobileMenuOpen && (
          <div className="md:hidden border-t border-border">
            <div className="px-2 pt-2 pb-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'block px-3 py-2 rounded-md text-base font-medium transition-colors',
                    pathname === item.href
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
