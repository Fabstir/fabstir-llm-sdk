// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { HostMetadata } from '../utils/metadata-validator';

export interface MetadataTemplate {
  name: string;
  description: string;
  template: HostMetadata;
}

export const templates: Record<string, MetadataTemplate> = {
  basic: {
    name: 'Basic',
    description: 'Minimal metadata with just required fields',
    template: {
      name: 'My LLM Host',
      description: 'Fast and reliable LLM inference service'
    }
  },

  professional: {
    name: 'Professional',
    description: 'Full-featured metadata for professional hosts',
    template: {
      name: 'Professional LLM Service',
      description: 'Enterprise-grade LLM inference with high availability',
      location: 'US-East',
      costPerToken: 0.0001,
      minJobDeposit: 100,
      supportedFeatures: ['streaming', 'batch', 'custom-models'],
      performance: {
        avgResponseTime: 120,
        uptime: 99.9
      },
      contact: {
        email: 'support@example.com',
        discord: 'example#1234'
      },
      website: 'https://example.com'
    }
  },

  minimal: {
    name: 'Minimal',
    description: 'Bare minimum configuration',
    template: {
      name: 'LLM Node',
      description: 'LLM inference node'
    }
  },

  performance: {
    name: 'Performance-focused',
    description: 'Emphasizes performance metrics',
    template: {
      name: 'High-Performance LLM Host',
      description: 'Optimized for speed and reliability',
      location: 'Global',
      supportedFeatures: ['streaming', 'parallel-processing', 'gpu-acceleration'],
      performance: {
        avgResponseTime: 50,
        uptime: 99.99
      },
      costPerToken: 0.00015
    }
  },

  budget: {
    name: 'Budget-friendly',
    description: 'Cost-effective hosting option',
    template: {
      name: 'Budget LLM Host',
      description: 'Affordable LLM inference for everyone',
      location: 'Various',
      costPerToken: 0.00005,
      minJobDeposit: 10,
      supportedFeatures: ['batch'],
      contact: {
        email: 'budget@example.com'
      }
    }
  }
};

export function getTemplate(name: string): HostMetadata | null {
  const template = templates[name.toLowerCase()];
  return template ? { ...template.template } : null;
}

export function listTemplates(): string[] {
  return Object.keys(templates);
}

export function getTemplateDescription(name: string): string {
  const template = templates[name.toLowerCase()];
  return template ? template.description : 'Template not found';
}