'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useWallet } from '@/hooks/use-wallet';
import { useSessionGroups } from '@/hooks/use-session-groups';
import { SessionGroupForm } from '@/components/session-groups/session-group-form';

/**
 * New Session Group Page
 *
 * Page for creating a new session group
 */
export default function NewSessionGroupPage() {
  const router = useRouter();
  const { isConnected } = useWallet();
  const { createGroup } = useSessionGroups();

  const handleSubmit = async (data: {
    name: string;
    description?: string;
    databases?: string[];
  }) => {
    const group = await createGroup(data.name, {
      description: data.description,
      databases: data.databases,
    });

    // Redirect to the new group's page
    router.push(`/session-groups/${group.id}`);
  };

  const handleCancel = () => {
    router.push('/session-groups');
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Connect Your Wallet
          </h2>
          <p className="text-gray-600 mb-6">
            Please connect your wallet to create a session group
          </p>
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 inline-block"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-2">
            <Link
              href="/session-groups"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← Back to Session Groups
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Create New Session Group
          </h1>
          <p className="mt-2 text-gray-600">
            Organize your conversations and link vector databases for enhanced AI responses
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <SessionGroupForm
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            submitLabel="Create Session Group"
          />
        </div>
      </div>
    </div>
  );
}
