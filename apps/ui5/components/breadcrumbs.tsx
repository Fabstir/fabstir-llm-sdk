'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href: string;
}

/**
 * Breadcrumbs Component
 *
 * Automatically generates navigation breadcrumbs based on current path
 * Shows: Home > Parent > Current Page
 */
export function Breadcrumbs() {
  const pathname = usePathname();

  // Don't show breadcrumbs on home page or if pathname is null
  if (!pathname || pathname === '/') {
    return null;
  }

  const pathSegments = pathname.split('/').filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [
    { label: 'Home', href: '/' },
  ];

  // Build breadcrumbs from path segments
  let currentPath = '';
  pathSegments.forEach((segment, index) => {
    currentPath += `/${segment}`;

    // Skip dynamic segments like [id] or [sessionId]
    if (segment.startsWith('[') && segment.endsWith(']')) {
      return;
    }

    // Decode URL-encoded segment (e.g., "Movie%20Info" -> "Movie Info")
    const decodedSegment = decodeURIComponent(segment);

    // Format segment label
    let label = decodedSegment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Special cases
    if (segment === 'session-groups') {
      label = 'Session Groups';
    } else if (segment === 'vector-databases') {
      label = 'Vector Databases';
    } else if (segment === 'settings') {
      label = 'Settings';
    } else if (segment === 'upload') {
      label = 'Upload Documents';
    } else if (segment === 'databases') {
      label = 'Databases';
    }

    // Check if this is a dynamic ID (starts with db-, group-, sess-)
    if (decodedSegment.match(/^(db-|group-|sess-)/)) {
      // Try to get the name from localStorage
      const storedName = getResourceName(decodedSegment);
      if (storedName) {
        label = storedName;
      } else {
        // Generic label for IDs
        if (decodedSegment.startsWith('db-')) label = 'Database';
        else if (decodedSegment.startsWith('group-')) label = 'Session Group';
        else if (decodedSegment.startsWith('sess-')) label = 'Chat Session';
      }
    }

    breadcrumbs.push({
      label,
      href: index === pathSegments.length - 1 ? '' : currentPath, // Last item is not clickable
    });
  });

  return (
    <nav className="flex items-center gap-2 text-sm text-gray-600 mb-6">
      {breadcrumbs.map((crumb, index) => (
        <div key={index} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400" />}

          {index === 0 ? (
            <Link
              href={crumb.href}
              className="flex items-center gap-1 hover:text-gray-900 transition-colors"
            >
              <Home className="h-4 w-4" />
              <span>{crumb.label}</span>
            </Link>
          ) : crumb.href ? (
            <Link
              href={crumb.href}
              className="hover:text-gray-900 transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="font-medium text-gray-900">{crumb.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}

/**
 * Try to get the resource name from localStorage
 */
function getResourceName(id: string): string | null {
  try {
    // Check if running in browser
    if (typeof window === 'undefined') {
      return null;
    }

    // Session groups
    if (id.startsWith('group-')) {
      const groups = localStorage.getItem('mock_session_groups');
      if (groups) {
        const groupsList = JSON.parse(groups);
        const group = groupsList.find((g: any) => g.id === id);
        return group?.name || null;
      }
    }

    // Vector databases
    if (id.startsWith('db-')) {
      const dbs = localStorage.getItem('mock_vector_databases');
      if (dbs) {
        const dbsList = JSON.parse(dbs);
        const db = dbsList.find((d: any) => d.id === id);
        return db?.name || null;
      }
    }

    // Chat sessions (need group ID to find session)
    if (id.startsWith('sess-')) {
      // Extract group ID from pathname if possible
      const pathname = window.location.pathname;
      const groupMatch = pathname.match(/session-groups\/(group-[^/]+)/);
      if (groupMatch) {
        const groupId = groupMatch[1];
        const sessionsKey = `mock_sessions_${groupId}`;
        const sessions = localStorage.getItem(sessionsKey);
        if (sessions) {
          const sessionsList = JSON.parse(sessions);
          const session = sessionsList.find((s: any) => s.id === id);
          return session?.title || null;
        }
      }
    }
  } catch (err) {
    console.error('Failed to get resource name:', err);
  }

  return null;
}
