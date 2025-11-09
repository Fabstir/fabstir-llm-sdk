/**
 * Mock Data Fixtures
 *
 * Provides realistic test data for:
 * - Session Groups
 * - Vector Databases
 * - Chat Sessions
 */

import type { SessionGroup, DatabaseMetadata } from '../types';

export function generateMockSessionGroups(): SessionGroup[] {
  const now = Date.now();

  return [
    {
      id: 'group-engineering-001',
      name: 'Engineering Project',
      description: 'All engineering-related discussions and documentation',
      databases: ['api-documentation', 'design-specifications'],
      defaultDatabaseId: 'default-engineering-001',
      chatSessions: [
        {
          sessionId: 'sess-001',
          title: 'How to implement authentication for mobile apps?',
          timestamp: now - 5 * 60 * 1000, // 5 min ago
          messageCount: 12,
          active: true,
          lastMessage: 'What about token refresh strategies?'
        },
        {
          sessionId: 'sess-002',
          title: 'Database migration strategy',
          timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago
          messageCount: 8,
          active: false,
          lastMessage: "Let's use blue-green deployment approach"
        },
        {
          sessionId: 'sess-003',
          title: 'API versioning best practices',
          timestamp: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
          messageCount: 20,
          active: false,
          lastMessage: 'Use semantic versioning with backward compatibility'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 7 * 24 * 60 * 60 * 1000, // 7 days ago
      updated: now - 5 * 60 * 1000,
      permissions: {
        readers: [],
        writers: ['0xABCDEF1234567890ABCDEF1234567890ABCDEF12']
      }
    },
    {
      id: 'group-research-001',
      name: 'Product Research',
      description: 'Market analysis and competitor research',
      databases: ['research-papers', 'market-analysis', 'competitor-data'],
      defaultDatabaseId: 'default-research-001',
      chatSessions: [
        {
          sessionId: 'sess-004',
          title: 'Analyze competitor pricing strategies',
          timestamp: now - 2 * 60 * 60 * 1000,
          messageCount: 15,
          active: false,
          lastMessage: 'Summary: Most competitors use tiered pricing...'
        },
        {
          sessionId: 'sess-005',
          title: 'User feedback analysis Q4 2024',
          timestamp: now - 3 * 24 * 60 * 60 * 1000,
          messageCount: 25,
          active: false,
          lastMessage: 'Key insight: Users want better mobile experience'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 14 * 24 * 60 * 60 * 1000,
      updated: now - 2 * 60 * 60 * 1000,
      permissions: {
        readers: [],
        writers: []
      }
    },
    {
      id: 'group-design-shared',
      name: 'Design Brainstorming',
      description: 'UI/UX design discussions',
      databases: ['design-system'],
      defaultDatabaseId: 'default-design-shared',
      chatSessions: [
        {
          sessionId: 'sess-006',
          title: 'Color palette recommendations for mobile app',
          timestamp: now - 24 * 60 * 60 * 1000, // Yesterday
          messageCount: 4,
          active: false,
          lastMessage: 'I like the blue gradient approach'
        }
      ],
      owner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // Different owner (shared)
      created: now - 3 * 24 * 60 * 60 * 1000,
      updated: now - 24 * 60 * 60 * 1000,
      permissions: {
        readers: ['0x1234567890ABCDEF1234567890ABCDEF12345678'], // Shared with current user
        writers: []
      }
    },
    {
      id: 'group-ml-training',
      name: 'ML Model Training',
      description: 'Machine learning experiments and model training logs',
      databases: ['training-data'],
      defaultDatabaseId: 'default-ml-training',
      chatSessions: [
        {
          sessionId: 'sess-007',
          title: 'Compare BERT vs RoBERTa performance',
          timestamp: now - 3 * 24 * 60 * 60 * 1000,
          messageCount: 6,
          active: false,
          lastMessage: 'RoBERTa shows 2% improvement on our dataset'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 10 * 24 * 60 * 60 * 1000,
      updated: now - 3 * 24 * 60 * 60 * 1000,
      permissions: {
        readers: [],
        writers: []
      }
    },
    {
      id: 'group-personal',
      name: 'Personal Notes',
      description: 'Personal learning and random thoughts',
      databases: [],
      defaultDatabaseId: 'default-personal',
      chatSessions: [
        {
          sessionId: 'sess-008',
          title: 'Summarize meeting notes from client call',
          timestamp: now - 7 * 24 * 60 * 60 * 1000,
          messageCount: 2,
          active: false,
          lastMessage: 'Action items: Follow up on pricing, send proposal'
        }
      ],
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 30 * 24 * 60 * 60 * 1000,
      updated: now - 7 * 24 * 60 * 60 * 1000,
      permissions: {
        readers: [],
        writers: []
      }
    }
  ];
}

export function generateMockVectorDatabases(): DatabaseMetadata[] {
  const now = Date.now();

  return [
    {
      name: 'api-documentation',
      dimensions: 384,
      vectorCount: 2345,
      storageSizeBytes: 3600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 30 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 2 * 60 * 60 * 1000,
      description: 'Complete API documentation and implementation guides',
      folderStructure: true
    },
    {
      name: 'design-specifications',
      dimensions: 384,
      vectorCount: 1823,
      storageSizeBytes: 2800000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 25 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 1 * 24 * 60 * 60 * 1000,
      description: 'Design specs, wireframes, and UI component documentation',
      folderStructure: true
    },
    {
      name: 'research-papers',
      dimensions: 384,
      vectorCount: 5621,
      storageSizeBytes: 8600000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 60 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 3 * 24 * 60 * 60 * 1000,
      description: 'Academic and industry research papers on AI and machine learning',
      folderStructure: true
    },
    {
      name: 'personal-knowledge',
      dimensions: 384,
      vectorCount: 892,
      storageSizeBytes: 1400000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 45 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 7 * 24 * 60 * 60 * 1000,
      description: 'Personal notes, learning materials, and bookmarks',
      folderStructure: true
    },
    {
      name: 'market-analysis',
      dimensions: 384,
      vectorCount: 1234,
      storageSizeBytes: 1900000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 20 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 2 * 24 * 60 * 60 * 1000,
      description: 'Market research reports and competitive analysis',
      folderStructure: true
    },
    {
      name: 'competitor-data',
      dimensions: 384,
      vectorCount: 987,
      storageSizeBytes: 1500000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 15 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 2 * 24 * 60 * 60 * 1000,
      description: 'Competitor product features, pricing, and positioning',
      folderStructure: true
    },
    {
      name: 'design-system',
      dimensions: 384,
      vectorCount: 3421,
      storageSizeBytes: 5200000,
      owner: '0xDEADBEEFDEADBEEFDEADBEEFDEADBEEFDEADBEEF', // Shared by someone else
      created: now - 40 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 1 * 24 * 60 * 60 * 1000,
      description: 'Complete design system documentation and component library',
      folderStructure: true
    },
    {
      name: 'training-data',
      dimensions: 384,
      vectorCount: 1203,
      storageSizeBytes: 1850000,
      owner: '0x1234567890ABCDEF1234567890ABCDEF12345678',
      created: now - 10 * 24 * 60 * 60 * 1000,
      lastAccessed: now - 3 * 24 * 60 * 60 * 1000,
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
