/**
 * Mock Data Fixtures
 *
 * Provides realistic test data for:
 * - Session Groups
 * - Vector Databases
 * - Chat Sessions
 *
 * UPDATED: Aligned with real SDK types (Jan 2025)
 */

import type { SessionGroup, VectorDatabaseMetadata, ChatSessionSummary } from '../types';

/**
 * Generate mock session groups (aligned with real SDK)
 * Note: Returns groups with ChatSessionSummary[] for backward compat with UI4
 * SessionGroupManager.mock.ts handles conversion to string[] IDs
 */
export function generateMockSessionGroups(): SessionGroup[] {
  const now = new Date();

  // Helper to create dates relative to now
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

  return [
    {
      id: 'group-engineering-001',
      name: 'Engineering Project',
      description: 'All engineering-related discussions and documentation',
      createdAt: daysAgo(7),
      updatedAt: minutesAgo(5),
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      linkedDatabases: ['api-documentation', 'design-specifications'],
      defaultDatabase: 'api-documentation',
      chatSessions: [
        {
          sessionId: 'sess-001',
          title: 'How to implement authentication for mobile apps?',
          timestamp: now.getTime() - 5 * 60 * 1000,
          messageCount: 12,
          active: true,
          lastMessage: 'What about token refresh strategies?'
        },
        {
          sessionId: 'sess-002',
          title: 'Database migration strategy',
          timestamp: now.getTime() - 2 * 60 * 60 * 1000,
          messageCount: 8,
          active: false,
          lastMessage: "Let's use blue-green deployment approach"
        },
        {
          sessionId: 'sess-003',
          title: 'API versioning best practices',
          timestamp: now.getTime() - 7 * 24 * 60 * 60 * 1000,
          messageCount: 20,
          active: false,
          lastMessage: 'Use semantic versioning with backward compatibility'
        }
      ] as any, // Cast to any for backward compat (should be string[])
      metadata: {
        tags: ['engineering', 'backend', 'api']
      },
      deleted: false,
      groupDocuments: [],  // Empty initially, documents added via addGroupDocument()
      permissions: {
        readers: [],
        writers: []
      }
    },
    {
      id: 'group-research-001',
      name: 'Product Research',
      description: 'Market analysis and competitor research',
      createdAt: daysAgo(14),
      updatedAt: hoursAgo(2),
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      linkedDatabases: ['research-papers', 'market-analysis', 'competitor-data'],
      defaultDatabase: 'research-papers',
      chatSessions: [
        {
          sessionId: 'sess-004',
          title: 'Analyze competitor pricing strategies',
          timestamp: now.getTime() - 2 * 60 * 60 * 1000,
          messageCount: 15,
          active: false,
          lastMessage: 'Summary: Most competitors use tiered pricing...'
        },
        {
          sessionId: 'sess-005',
          title: 'User feedback analysis Q4 2024',
          timestamp: now.getTime() - 3 * 24 * 60 * 60 * 1000,
          messageCount: 25,
          active: false,
          lastMessage: 'Key insight: Users want better mobile experience'
        }
      ] as any,
      metadata: {
        tags: ['research', 'market-analysis']
      },
      deleted: false
    },
    {
      id: 'group-design-shared',
      name: 'Design Brainstorming',
      description: 'UI/UX design discussions',
      createdAt: daysAgo(3),
      updatedAt: daysAgo(1),
      owner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // Different owner (shared)
      linkedDatabases: ['design-system'],
      defaultDatabase: undefined,
      chatSessions: [
        {
          sessionId: 'sess-006',
          title: 'Color palette recommendations for mobile app',
          timestamp: now.getTime() - 24 * 60 * 60 * 1000,
          messageCount: 4,
          active: false,
          lastMessage: 'I like the blue gradient approach'
        }
      ] as any,
      metadata: {
        tags: ['design', 'ui', 'ux']
      },
      deleted: false
    },
    {
      id: 'group-ml-training',
      name: 'ML Model Training',
      description: 'Machine learning experiments and model training logs',
      createdAt: daysAgo(10),
      updatedAt: daysAgo(3),
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      linkedDatabases: ['training-data'],
      defaultDatabase: 'training-data',
      chatSessions: [
        {
          sessionId: 'sess-007',
          title: 'Compare BERT vs RoBERTa performance',
          timestamp: now.getTime() - 3 * 24 * 60 * 60 * 1000,
          messageCount: 6,
          active: false,
          lastMessage: 'RoBERTa shows 2% improvement on our dataset'
        }
      ] as any,
      metadata: {
        tags: ['machine-learning', 'nlp']
      },
      deleted: false
    },
    {
      id: 'group-personal',
      name: 'Personal Notes',
      description: 'Personal learning and random thoughts',
      createdAt: daysAgo(30),
      updatedAt: daysAgo(7),
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      linkedDatabases: [],
      defaultDatabase: undefined,
      chatSessions: [
        {
          sessionId: 'sess-008',
          title: 'Summarize meeting notes from client call',
          timestamp: now.getTime() - 7 * 24 * 60 * 60 * 1000,
          messageCount: 2,
          active: false,
          lastMessage: 'Action items: Follow up on pricing, send proposal'
        }
      ] as any,
      metadata: {
        tags: ['personal']
      },
      deleted: false
    }
  ];
}

/**
 * Generate mock vector databases (aligned with real SDK)
 */
export function generateMockVectorDatabases(): VectorDatabaseMetadata[] {
  const now = Date.now();
  const daysAgo = (days: number) => now - days * 24 * 60 * 60 * 1000;

  return [
    {
      id: 'api-documentation',
      name: 'api-documentation',
      dimensions: 384,
      vectorCount: 2345,
      storageSizeBytes: 3600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(30),
      lastAccessed: now - 2 * 60 * 60 * 1000,
      description: 'Complete API documentation and implementation guides',
      folderStructure: true
    },
    {
      id: 'design-specifications',
      name: 'design-specifications',
      dimensions: 384,
      vectorCount: 1823,
      storageSizeBytes: 2800000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(25),
      lastAccessed: daysAgo(1),
      description: 'Design specs, wireframes, and UI component documentation',
      folderStructure: true
    },
    {
      id: 'research-papers',
      name: 'research-papers',
      dimensions: 384,
      vectorCount: 5621,
      storageSizeBytes: 8600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(60),
      lastAccessed: daysAgo(3),
      description: 'Academic and industry research papers on AI and machine learning',
      folderStructure: true
    },
    {
      id: 'personal-knowledge',
      name: 'personal-knowledge',
      dimensions: 384,
      vectorCount: 892,
      storageSizeBytes: 1400000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(45),
      lastAccessed: daysAgo(7),
      description: 'Personal notes, learning materials, and bookmarks',
      folderStructure: true
    },
    {
      id: 'market-analysis',
      name: 'market-analysis',
      dimensions: 384,
      vectorCount: 1234,
      storageSizeBytes: 1900000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(20),
      lastAccessed: daysAgo(2),
      description: 'Market research reports and competitive analysis',
      folderStructure: true
    },
    {
      id: 'competitor-data',
      name: 'competitor-data',
      dimensions: 384,
      vectorCount: 987,
      storageSizeBytes: 1500000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(15),
      lastAccessed: daysAgo(2),
      description: 'Competitor product features, pricing, and positioning',
      folderStructure: true
    },
    {
      id: 'design-system',
      name: 'design-system',
      dimensions: 384,
      vectorCount: 3421,
      storageSizeBytes: 5200000,
      owner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // Shared by someone else
      created: daysAgo(40),
      lastAccessed: daysAgo(1),
      description: 'Complete design system documentation and component library',
      folderStructure: true
    },
    {
      id: 'training-data',
      name: 'training-data',
      dimensions: 384,
      vectorCount: 1203,
      storageSizeBytes: 1850000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: daysAgo(10),
      lastAccessed: daysAgo(3),
      description: 'ML training datasets and experiment results',
      folderStructure: true
    }
  ];
}

/**
 * Generate realistic mock chat messages
 */
export function generateMockChatMessages(topic: string): any[] {
  const now = Date.now();

  return [
    {
      role: 'user',
      content: topic,
      timestamp: now - 10 * 60 * 1000
    },
    {
      role: 'assistant',
      content: `Based on the information in your documents, here's a comprehensive answer to your question about "${topic.substring(0, 50)}...":\n\n1. **Key Point One**: This is a simulated response from the mock SDK that demonstrates realistic message formatting.\n\n2. **Key Point Two**: In production, this would be a real LLM response with context from your vector databases.\n\n3. **Key Point Three**: The mock maintains the same interface for seamless integration with the real SDK.\n\nWould you like me to elaborate on any of these points?`,
      timestamp: now - 9 * 60 * 1000,
      ragSources: [
        {
          id: 'vec-001',
          score: 0.92,
          metadata: {
            text: 'Relevant excerpt from document 1...',
            source: 'document-1.pdf',
            folderPath: '/guides'
          }
        },
        {
          id: 'vec-002',
          score: 0.87,
          metadata: {
            text: 'Relevant excerpt from document 2...',
            source: 'document-2.pdf',
            folderPath: '/guides'
          }
        }
      ]
    }
  ];
}
