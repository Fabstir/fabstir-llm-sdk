/**
 * Sample Document Generator
 * Realistic test documents for E2E RAG testing
 * Max 250 lines
 */

/**
 * Document template with rich content
 */
export interface DocumentTemplate {
  title: string;
  content: string;
  metadata: {
    topic: string;
    category: string;
    tags: string[];
    author?: string;
    createdAt: number;
  };
}

/**
 * Technology documentation samples
 */
export const TECH_DOCUMENTS: DocumentTemplate[] = [
  {
    title: 'Introduction to Neural Networks',
    content: `# Introduction to Neural Networks

Neural networks are computational models inspired by the human brain's structure. They consist of interconnected nodes (neurons) organized in layers: input, hidden, and output layers.

## Key Components

1. **Neurons**: Basic processing units that receive inputs, apply weights, and produce outputs
2. **Layers**: Organizational structure including input, hidden, and output layers
3. **Activation Functions**: Non-linear transformations (ReLU, sigmoid, tanh)
4. **Backpropagation**: Algorithm for training networks by adjusting weights

## Applications

Neural networks excel at pattern recognition, classification, and prediction tasks. Common applications include:
- Image recognition and computer vision
- Natural language processing
- Speech recognition
- Time series prediction

## Training Process

Training involves feeding data through the network, comparing outputs to expected results, and adjusting weights to minimize error. This iterative process continues until the network achieves satisfactory accuracy.`,
    metadata: {
      topic: 'neural-networks',
      category: 'tech',
      tags: ['ai', 'machine-learning', 'deep-learning'],
      author: 'AI Research Team',
      createdAt: Date.now() - 86400000 * 30 // 30 days ago
    }
  },
  {
    title: 'Vector Databases Explained',
    content: `# Vector Databases Explained

Vector databases are specialized systems designed to store and query high-dimensional vector embeddings efficiently. They enable similarity search at scale.

## Why Vector Databases?

Traditional databases struggle with similarity search on high-dimensional data. Vector databases solve this with:
- **Approximate Nearest Neighbor (ANN)**: Fast similarity search algorithms
- **Indexing Strategies**: HNSW, IVF-FLAT for efficient retrieval
- **Scalability**: Handle millions of vectors with sub-100ms latency

## Use Cases

1. **Retrieval-Augmented Generation (RAG)**: Enhance LLM responses with relevant context
2. **Semantic Search**: Find documents by meaning, not just keywords
3. **Recommendation Systems**: Find similar items based on embeddings
4. **Anomaly Detection**: Identify outliers in vector space

## Performance Considerations

Vector database performance depends on:
- Index type (HNSW for accuracy, IVF for speed)
- Dimensionality (384-1536 typical for embeddings)
- Dataset size (millions of vectors require careful optimization)
- Query patterns (single vs batch queries)`,
    metadata: {
      topic: 'vector-databases',
      category: 'tech',
      tags: ['databases', 'embeddings', 'rag', 'search'],
      author: 'Database Engineering Team',
      createdAt: Date.now() - 86400000 * 15 // 15 days ago
    }
  },
  {
    title: 'Building RAG Applications',
    content: `# Building RAG Applications

Retrieval-Augmented Generation (RAG) combines large language models with external knowledge bases to produce accurate, contextual responses.

## RAG Architecture

The RAG pipeline consists of three stages:

1. **Indexing**: Convert documents to embeddings and store in vector database
2. **Retrieval**: Query vector database for relevant context
3. **Generation**: Feed context to LLM for final response

## Best Practices

### Document Chunking
- Chunk size: 500-1000 tokens optimal
- Overlap: 10-20% prevents context loss
- Semantic splitting: Split at paragraph boundaries

### Embedding Selection
- all-MiniLM-L6-v2: Fast, 384 dimensions
- text-embedding-ada-002: High quality, 1536 dimensions
- Consider domain-specific embeddings for specialized content

### Context Management
- Limit context to 5-10 most relevant chunks
- Rerank results for better relevance
- Include source attribution for transparency

## Evaluation Metrics

Track these metrics for RAG quality:
- **Retrieval Precision**: Percentage of relevant retrieved docs
- **Context Relevance**: How well context matches query
- **Answer Quality**: Correctness and completeness of response
- **Latency**: End-to-end response time`,
    metadata: {
      topic: 'rag-applications',
      category: 'tech',
      tags: ['rag', 'llm', 'ai', 'architecture'],
      author: 'AI Engineering Team',
      createdAt: Date.now() - 86400000 * 7 // 7 days ago
    }
  }
];

/**
 * Science documentation samples
 */
export const SCIENCE_DOCUMENTS: DocumentTemplate[] = [
  {
    title: 'Quantum Computing Fundamentals',
    content: `# Quantum Computing Fundamentals

Quantum computing leverages quantum mechanical phenomena to process information in fundamentally different ways than classical computers.

## Core Concepts

**Qubits**: Unlike classical bits (0 or 1), qubits exist in superposition, representing both states simultaneously until measured.

**Entanglement**: Qubits can be correlated such that measuring one instantly affects others, regardless of distance.

**Quantum Gates**: Operations that manipulate qubit states (Hadamard, CNOT, Pauli gates).

## Applications

Quantum computers excel at:
- Cryptography and security
- Drug discovery and molecular simulation
- Optimization problems
- Machine learning algorithms

## Current Limitations

Today's quantum computers face challenges:
- Decoherence: Qubits lose quantum state quickly
- Error rates: High error rates require correction
- Scalability: Building large-qubit systems is difficult`,
    metadata: {
      topic: 'quantum-computing',
      category: 'science',
      tags: ['quantum', 'physics', 'computing'],
      author: 'Quantum Research Lab',
      createdAt: Date.now() - 86400000 * 20
    }
  },
  {
    title: 'CRISPR Gene Editing',
    content: `# CRISPR Gene Editing

CRISPR-Cas9 is a revolutionary gene editing technology that enables precise modifications to DNA sequences.

## How It Works

1. **Guide RNA**: Designed to match target DNA sequence
2. **Cas9 Enzyme**: Acts as molecular scissors to cut DNA
3. **Repair Mechanism**: Cell repairs the cut, introducing desired changes

## Applications

- Disease treatment (sickle cell anemia, cancer)
- Agricultural improvements (drought-resistant crops)
- Basic research (gene function studies)

## Ethical Considerations

Gene editing raises important questions:
- Germline editing and heritable changes
- Access and equity in medical applications
- Potential for misuse or unintended consequences`,
    metadata: {
      topic: 'gene-editing',
      category: 'science',
      tags: ['biology', 'genetics', 'crispr'],
      author: 'Biotech Research Group',
      createdAt: Date.now() - 86400000 * 12
    }
  }
];

/**
 * Business documentation samples
 */
export const BUSINESS_DOCUMENTS: DocumentTemplate[] = [
  {
    title: 'Market Analysis Framework',
    content: `# Market Analysis Framework

Comprehensive market analysis requires understanding multiple dimensions: size, growth, competition, and customer needs.

## Market Sizing

**TAM (Total Addressable Market)**: Total revenue opportunity
**SAM (Serviceable Addressable Market)**: Segment you can reach
**SOM (Serviceable Obtainable Market)**: Realistically capturable share

## Competitive Analysis

Evaluate competitors across:
- Product features and differentiation
- Pricing strategy and positioning
- Market share and growth trajectory
- Strengths, weaknesses, opportunities, threats (SWOT)

## Customer Segmentation

Divide market into distinct groups:
- Demographics (age, income, location)
- Psychographics (values, lifestyle)
- Behavioral (usage patterns, brand loyalty)

## Growth Strategies

- Market penetration: Increase share in existing markets
- Market development: Enter new markets
- Product development: Create new offerings
- Diversification: New products in new markets`,
    metadata: {
      topic: 'market-analysis',
      category: 'business',
      tags: ['strategy', 'market-research', 'analysis'],
      author: 'Business Strategy Team',
      createdAt: Date.now() - 86400000 * 25
    }
  }
];

/**
 * Get all sample documents
 */
export function getAllSampleDocuments(): DocumentTemplate[] {
  return [...TECH_DOCUMENTS, ...SCIENCE_DOCUMENTS, ...BUSINESS_DOCUMENTS];
}

/**
 * Get documents by category
 */
export function getDocumentsByCategory(category: 'tech' | 'science' | 'business'): DocumentTemplate[] {
  const categoryMap = {
    tech: TECH_DOCUMENTS,
    science: SCIENCE_DOCUMENTS,
    business: BUSINESS_DOCUMENTS
  };
  return categoryMap[category] || [];
}

/**
 * Generate custom document with specified properties
 */
export function generateCustomDocument(
  title: string,
  paragraphs: number,
  topic: string,
  category: string
): DocumentTemplate {
  const content = `# ${title}\n\n` +
    Array(paragraphs)
      .fill(0)
      .map((_, i) => `Paragraph ${i + 1} discussing ${topic} in detail. This section covers important aspects and provides comprehensive information about the subject matter.`)
      .join('\n\n');

  return {
    title,
    content,
    metadata: {
      topic,
      category,
      tags: [topic, category, 'generated'],
      createdAt: Date.now()
    }
  };
}
