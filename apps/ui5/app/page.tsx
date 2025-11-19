'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/contexts/wallet-context';
import { useSDK } from '@/hooks/use-sdk';
import { StatsCard } from '@/components/dashboard/stats-card';
import {
  MessageSquare,
  Database,
  Activity,
  FileText,
  Clock,
  Plus,
  Upload,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DashboardStats {
  sessionGroups: number;
  totalSessions: number;
  vectorDatabases: number;
  totalDocuments: number;
}

interface ActivityItem {
  id: string;
  type: 'session_created' | 'group_created' | 'database_created' | 'file_uploaded';
  description: string;
  timestamp: number;
  link?: string;
}

export default function HomePage() {
  const router = useRouter();
  const { isConnected } = useWallet();
  const { managers, isInitialized } = useSDK();
  const [stats, setStats] = useState<DashboardStats>({
    sessionGroups: 0,
    totalSessions: 0,
    vectorDatabases: 0,
    totalDocuments: 0,
  });
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Debug logging
  useEffect(() => {
    const state = { isConnected, isInitialized, loading, managers: !!managers };
    console.log('[Dashboard] State:', state);

    // Also log to see in server logs
    if (typeof window !== 'undefined') {
      console.warn('[Dashboard] VISIBLE LOG:', JSON.stringify(state));
    }
  }, [isConnected, isInitialized, loading, managers]);

  // Retry handler
  const handleRetry = () => {
    console.log('[Dashboard] User triggered retry, attempt:', retryCount + 1);
    setLoadError(null);
    setRetryCount(prev => prev + 1);
  };

  // Load dashboard stats
  useEffect(() => {
    async function loadStats() {
      // Keep loading true until both wallet connected AND SDK initialized
      if (!isConnected) {
        setLoading(false);
        return;
      }

      if (!isInitialized || !managers) {
        setLoading(true);  // Show loading spinner while SDK initializes
        return;
      }

      try {
        setLoading(true);
        setLoadError(null); // Clear previous errors

        // Get user address for filtering
        const userAddress = managers.authManager?.userAddress;
        if (!userAddress) {
          console.warn('[Dashboard] No user address available, cannot load session groups');
          setLoading(false);
          return;
        }

        // Get session groups with extended timeout (S5 can be slow on first load)
        // Get timeout from environment (default 60 seconds)
        const dashboardTimeout = parseInt(process.env.NEXT_PUBLIC_DASHBOARD_LOAD_TIMEOUT || '60', 10) * 1000;

        console.log('[Dashboard] Loading session groups for user:', userAddress);
        const groupsPromise = managers.sessionGroupManager.listSessionGroups(userAddress);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Session groups load timeout after ${dashboardTimeout / 1000}s`)), dashboardTimeout)
        );
        const groups = await Promise.race([groupsPromise, timeoutPromise]) as any[];
        console.log('[Dashboard] Loaded session groups:', groups.length, groups);

        // Get vector databases (if available)
        let databases: any[] = [];
        if (managers.vectorRAGManager && typeof managers.vectorRAGManager.listDatabases === 'function') {
          databases = await managers.vectorRAGManager.listDatabases();
          console.log('[Dashboard] Loaded vector databases:', databases.length, databases);
        }

        // Calculate total sessions across all groups
        const totalSessions = groups.reduce((sum, group) => {
          const sessionCount = group.chatSessions?.length || 0;
          console.log(`[Dashboard] Group "${group.name}" has ${sessionCount} sessions`);
          return sum + sessionCount;
        }, 0);

        // Calculate total vectors across all databases
        // Note: vectorCount represents document chunks (embedded vectors), not raw files
        const totalDocuments = databases.reduce((sum, db) => {
          const vectorCount = db.vectorCount || 0;
          console.log(`[Dashboard] Database "${db.name}" has ${vectorCount} vectors`);
          return sum + vectorCount;
        }, 0);

        console.log('[Dashboard] Final stats:', {
          sessionGroups: groups.length,
          totalSessions,
          vectorDatabases: databases.length,
          totalDocuments
        });

        setStats({
          sessionGroups: groups.length,
          totalSessions,
          vectorDatabases: databases.length,
          totalDocuments,
        });

        // Load recent activity from localStorage
        const activity: ActivityItem[] = [];

        // Helper to validate timestamp
        const isValidTimestamp = (ts: any): boolean => {
          return ts && typeof ts === 'number' && ts > 0;
        };

        // Recent session groups
        groups.forEach(group => {
          if (isValidTimestamp(group.created)) {
            activity.push({
              id: `group-${group.id}`,
              type: 'group_created',
              description: `Created group "${group.name}"`,
              timestamp: group.created,
              link: `/session-groups/${group.id}`,
            });
          }

          // Recent chat sessions within each group
          if (group.chatSessions && group.chatSessions.length > 0) {
            group.chatSessions.forEach(session => {
              // Chat session metadata uses 'timestamp' not 'created'
              const sessionTime = session.timestamp || session.created;
              if (isValidTimestamp(sessionTime)) {
                activity.push({
                  id: `session-${session.sessionId}`,
                  type: 'session_created',
                  description: `Started chat "${session.title}" in "${group.name}"`,
                  timestamp: sessionTime,
                  link: `/session-groups/${group.id}`,
                });
              }
            });
          }
        });

        // Recent databases
        databases.forEach(db => {
          if (isValidTimestamp(db.created)) {
            activity.push({
              id: `db-${db.name}`,
              type: 'database_created',
              description: `Created database "${db.name}"`,
              timestamp: db.created,
              link: `/vector-databases/${encodeURIComponent(db.name)}`,
            });
          }

          // Files uploaded to this database (if available)
          if (db.files && Array.isArray(db.files) && db.files.length > 0) {
            db.files.forEach((file: any) => {
              const fileTimestamp = file.uploadedAt || db.created;
              if (isValidTimestamp(fileTimestamp)) {
                activity.push({
                  id: `file-${db.name}-${file.name || file}`,
                  type: 'file_uploaded',
                  description: `Uploaded "${file.name || file}" to ${db.name}`,
                  timestamp: fileTimestamp,
                  link: `/vector-databases/${encodeURIComponent(db.name)}`,
                });
              }
            });
          }
        });

        // Sort by timestamp and take last 10
        activity.sort((a, b) => b.timestamp - a.timestamp);
        setRecentActivity(activity.slice(0, 10));

      } catch (error) {
        console.error('[Dashboard] Failed to load dashboard stats:', error);

        // Set user-friendly error message
        const errorMsg = error instanceof Error ? error.message : 'Failed to load dashboard data';
        setLoadError(errorMsg);

        // Show empty stats on error/timeout
        setStats({
          sessionGroups: 0,
          totalSessions: 0,
          vectorDatabases: 0,
          totalDocuments: 0,
        });
        setRecentActivity([]);
      } finally {
        console.log('[Dashboard] Setting loading to false');
        setLoading(false);
      }
    }

    loadStats();
  }, [isConnected, isInitialized, managers, retryCount]);

  return (
    <div className="space-y-8">
      {/* Header - always visible */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Overview of your AI sessions and vector databases
        </p>
      </div>

      {/* Not connected state */}
      {!isConnected ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight">
              Welcome to Fabstir UI5
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Connect your wallet to get started
            </p>
          </div>
        </div>
      ) : loading ? (
        /* Loading state - inline, doesn't block navigation */
        <div className="text-center py-12">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="mt-4 text-muted-foreground">
            {!isInitialized ? 'Initializing SDK...' : 'Loading dashboard...'}
          </p>
        </div>
      ) : loadError ? (
        /* Error state - show error message with retry button */
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center max-w-md">
            <AlertCircle className="h-16 w-16 mx-auto mb-4 text-red-500" />
            <h2 className="text-2xl font-bold tracking-tight mb-2">
              Failed to Load Dashboard
            </h2>
            <p className="text-muted-foreground mb-6">
              {loadError}
            </p>
            <button
              onClick={handleRetry}
              className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors font-medium"
            >
              <RefreshCw className="h-5 w-5" />
              Retry Loading
            </button>
            <p className="text-xs text-muted-foreground mt-4">
              Attempt {retryCount > 0 ? retryCount + 1 : 1}
              {retryCount > 2 && ' - If this persists, try refreshing the page'}
            </p>
          </div>
        </div>
      ) : (
        /* Dashboard content */
        <>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => router.push('/session-groups')}
          className="cursor-pointer transition-transform active:scale-95 touch-manipulation"
        >
          <StatsCard
            title="Session Groups"
            value={stats.sessionGroups}
            icon={MessageSquare}
            description="Active conversation groups"
          />
        </div>
        <div
          onClick={() => router.push('/session-groups')}
          className="cursor-pointer transition-transform active:scale-95 touch-manipulation"
        >
          <StatsCard
            title="Total Sessions"
            value={stats.totalSessions}
            icon={Activity}
            description="Individual chat sessions"
          />
        </div>
        <div
          onClick={() => router.push('/vector-databases')}
          className="cursor-pointer transition-transform active:scale-95 touch-manipulation"
        >
          <StatsCard
            title="Vector Databases"
            value={stats.vectorDatabases}
            icon={Database}
            description="Knowledge bases"
          />
        </div>
        <div
          onClick={() => router.push('/vector-databases')}
          className="cursor-pointer transition-transform active:scale-95 touch-manipulation"
        >
          <StatsCard
            title="Vectors"
            value={stats.totalDocuments}
            icon={FileText}
            description="Document chunks"
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-lg border bg-card p-4 sm:p-6">
        <h2 className="text-lg sm:text-xl font-semibold">Quick Actions</h2>
        <div className="mt-4 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          <a
            href="/session-groups"
            className="rounded-lg border p-4 transition-all hover:bg-muted active:scale-98 touch-manipulation"
          >
            <MessageSquare className="h-8 w-8 text-primary" />
            <h3 className="mt-2 font-medium">New Session Group</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Start a new AI conversation
            </p>
          </a>
          <a
            href="/vector-databases?returnTo=%2F"
            className="rounded-lg border p-4 transition-all hover:bg-muted active:scale-98 touch-manipulation"
          >
            <Database className="h-8 w-8 text-primary" />
            <h3 className="mt-2 font-medium">New Database</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a vector knowledge base
            </p>
          </a>
          <a
            href="/settings"
            className="rounded-lg border p-4 transition-all hover:bg-muted active:scale-98 touch-manipulation sm:col-span-2 lg:col-span-1"
          >
            <Activity className="h-8 w-8 text-primary" />
            <h3 className="mt-2 font-medium">Settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure your preferences
            </p>
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Recent Activity</h2>
        </div>

        {recentActivity.length > 0 ? (
          <div className="space-y-3">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                onClick={() => item.link && router.push(item.link)}
                className={`flex items-start gap-3 p-3 rounded-md transition-colors ${
                  item.link ? 'cursor-pointer hover:bg-muted' : ''
                }`}
              >
                <div className="mt-0.5">
                  {item.type === 'group_created' && (
                    <MessageSquare className="h-5 w-5 text-blue-600" />
                  )}
                  {item.type === 'database_created' && (
                    <Database className="h-5 w-5 text-green-600" />
                  )}
                  {item.type === 'session_created' && (
                    <Activity className="h-5 w-5 text-purple-600" />
                  )}
                  {item.type === 'file_uploaded' && (
                    <FileText className="h-5 w-5 text-orange-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{item.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No recent activity</p>
            <p className="text-xs mt-1">Create a session group or database to get started</p>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
