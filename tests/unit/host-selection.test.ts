// Copyright (c) 2025 Fabstir
// SPDX-License-Identifier: BUSL-1.1

import { describe, it, expect, beforeEach, vi } from 'vitest';
import HostSelector from '../../src/discovery/HostSelector';
import type { 
  Host, SelectionCriteria, Weights, Requirements, 
  SelectionStrategy, HostScore 
} from '../../src/types/discovery';

describe('Optimal Host Selection', () => {
  let selector: HostSelector;
  let mockHosts: Host[];

  beforeEach(() => {
    selector = new HostSelector();
    mockHosts = [
      {
        id: 'host-1',
        url: 'wss://host1.test',
        models: ['llama-70b', 'gpt-4'],
        pricePerToken: 0.001,
        latency: 50,
        region: 'us-east',
        capabilities: ['streaming', 'batch']
      },
      {
        id: 'host-2',
        url: 'wss://host2.test',
        models: ['gpt-4'],
        pricePerToken: 0.002,
        latency: 100,
        region: 'eu-west',
        capabilities: ['streaming']
      },
      {
        id: 'host-3',
        url: 'wss://host3.test',
        models: ['llama-70b'],
        pricePerToken: 0.0005,
        latency: 150,
        region: 'us-west',
        capabilities: ['batch', 'embedding']
      },
      {
        id: 'host-4',
        url: 'wss://host4.test',
        models: ['claude-3'],
        pricePerToken: 0.003,
        latency: 25,
        region: 'us-east',
        capabilities: ['streaming', 'vision']
      },
      {
        id: 'host-5',
        url: 'wss://host5.test',
        models: ['gpt-4', 'llama-70b'],
        pricePerToken: 0.0015,
        latency: 75,
        region: 'asia-pac',
        capabilities: ['streaming', 'batch', 'embedding']
      }
    ];
  });

  describe('Selection by Price', () => {
    it('should select host with lowest price', () => {
      const criteria: SelectionCriteria = { strategy: 'price' };
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.id).toBe('host-3');
      expect(selected?.pricePerToken).toBe(0.0005);
    });

    it('should handle hosts without price information', () => {
      const hostsWithMissingPrice = [
        ...mockHosts,
        { id: 'host-6', url: 'wss://host6.test' }
      ];
      
      const criteria: SelectionCriteria = { strategy: 'price' };
      const selected = selector.selectOptimalHost(hostsWithMissingPrice, criteria);
      
      expect(selected?.id).toBe('host-3');
    });

    it('should apply maximum price constraint', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'price',
        maxPrice: 0.001
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.pricePerToken).toBeLessThanOrEqual(0.001);
    });

    it('should return null when no hosts meet price constraint', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'price',
        maxPrice: 0.0001
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected).toBeNull();
    });

    it('should rank hosts by price in ascending order', () => {
      const weights: Weights = { price: 1.0, latency: 0, reliability: 0 };
      const ranked = selector.rankHosts(mockHosts, weights);
      
      expect(ranked[0].host.id).toBe('host-3');
      expect(ranked[1].host.id).toBe('host-1');
      expect(ranked[ranked.length - 1].host.id).toBe('host-4');
    });
  });

  describe('Selection by Latency', () => {
    it('should select host with lowest latency', () => {
      const criteria: SelectionCriteria = { strategy: 'latency' };
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.id).toBe('host-4');
      expect(selected?.latency).toBe(25);
    });

    it('should handle hosts without latency information', () => {
      const hostsWithMissingLatency = [
        { id: 'host-0', url: 'wss://host0.test', pricePerToken: 0.001 },
        ...mockHosts
      ];
      
      const criteria: SelectionCriteria = { strategy: 'latency' };
      const selected = selector.selectOptimalHost(hostsWithMissingLatency, criteria);
      
      expect(selected?.id).toBe('host-4');
    });

    it('should apply maximum latency constraint', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'latency',
        maxLatency: 80
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.latency).toBeLessThanOrEqual(80);
    });

    it('should prefer hosts in specific region when latency is similar', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'latency',
        preferredRegion: 'us-east'
      };
      
      const similarLatencyHosts = [
        { id: 'host-a', latency: 50, region: 'eu-west' },
        { id: 'host-b', latency: 51, region: 'us-east' },
        { id: 'host-c', latency: 52, region: 'asia-pac' }
      ];
      
      const selected = selector.selectOptimalHost(similarLatencyHosts, criteria);
      
      expect(selected?.id).toBe('host-b');
    });

    it('should rank hosts by latency in ascending order', () => {
      const weights: Weights = { price: 0, latency: 1.0, reliability: 0 };
      const ranked = selector.rankHosts(mockHosts, weights);
      
      expect(ranked[0].host.id).toBe('host-4');
      expect(ranked[1].host.id).toBe('host-1');
      expect(ranked[ranked.length - 1].host.id).toBe('host-3');
    });
  });

  describe('Selection by Capability', () => {
    it('should select host with required model', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'capability',
        requiredModel: 'claude-3'
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.id).toBe('host-4');
      expect(selected?.models).toContain('claude-3');
    });

    it('should select host with all required capabilities', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'capability',
        requiredCapabilities: ['batch', 'embedding']
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.id).toBe('host-3');
      expect(selected?.capabilities).toContain('batch');
      expect(selected?.capabilities).toContain('embedding');
    });

    it('should filter hosts by requirements', () => {
      const requirements: Requirements = {
        models: ['llama-70b'],
        capabilities: ['streaming'],
        maxPrice: 0.002,
        maxLatency: 100
      };
      
      const filtered = selector.filterByRequirements(mockHosts, requirements);
      
      // Should filter to hosts that meet ALL requirements
      expect(filtered.length).toBeGreaterThan(0);
      
      // All filtered hosts should meet the requirements
      filtered.forEach(host => {
        expect(host.models?.some(m => requirements.models!.includes(m))).toBe(true);
        expect(host.capabilities).toContain('streaming');
        expect(host.pricePerToken! <= 0.002).toBe(true);
        expect(host.latency! <= 100).toBe(true);
      });
    });

    it('should return empty array when no hosts meet requirements', () => {
      const requirements: Requirements = {
        models: ['gpt-5'],
        capabilities: ['quantum-computing']
      };
      
      const filtered = selector.filterByRequirements(mockHosts, requirements);
      
      expect(filtered).toHaveLength(0);
    });

    it('should prioritize hosts with more matching capabilities', () => {
      const criteria: SelectionCriteria = { 
        strategy: 'capability',
        preferredCapabilities: ['streaming', 'batch', 'embedding', 'vision']
      };
      
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected?.id).toBe('host-5'); // Has 3 matching capabilities
    });
  });

  describe('Multi-Criteria Scoring', () => {
    it('should use composite scoring with equal weights', () => {
      const criteria: SelectionCriteria = { strategy: 'composite' };
      const weights: Weights = { price: 0.33, latency: 0.33, reliability: 0.34 };
      
      selector.setWeights(weights);
      const selected = selector.selectOptimalHost(mockHosts, criteria);
      
      expect(selected).toBeDefined();
      expect(selected?.id).toMatch(/host-[1-5]/);
    });

    it('should apply custom weights for scoring', () => {
      const weights: Weights = { 
        price: 0.7,  // Heavily favor price
        latency: 0.2,
        reliability: 0.1
      };
      
      const ranked = selector.rankHosts(mockHosts, weights);
      
      // The top-ranked host should have one of the lowest prices
      const topHost = ranked[0].host;
      const lowestPriceHosts = mockHosts
        .sort((a, b) => (a.pricePerToken || Infinity) - (b.pricePerToken || Infinity))
        .slice(0, 2); // Get two hosts with lowest prices
      
      expect(lowestPriceHosts.map(h => h.id)).toContain(topHost.id);
      expect(ranked[0].score).toBeGreaterThan(0);
      
      // Verify that price has significant impact on scoring
      expect(ranked[0].breakdown?.priceScore).toBeGreaterThan(0.5);
    });

    it('should normalize scores across different metrics', () => {
      const weights: Weights = { price: 0.5, latency: 0.5, reliability: 0 };
      const ranked = selector.rankHosts(mockHosts, weights);
      
      // All scores should be between 0 and 1
      ranked.forEach(item => {
        expect(item.score).toBeGreaterThanOrEqual(0);
        expect(item.score).toBeLessThanOrEqual(1);
      });
    });

    it('should consider reliability scores when available', () => {
      const hostsWithReliability = mockHosts.map((h, i) => ({
        ...h,
        reliability: 0.9 - (i * 0.1) // Decreasing reliability
      }));
      
      const weights: Weights = { price: 0, latency: 0, reliability: 1.0 };
      const ranked = selector.rankHosts(hostsWithReliability, weights);
      
      expect(ranked[0].host.id).toBe('host-1'); // Highest reliability
    });

    it('should handle missing metrics gracefully', () => {
      const incompleteHosts = [
        { id: 'host-a', pricePerToken: 0.001 },
        { id: 'host-b', latency: 50 },
        { id: 'host-c', url: 'wss://hostc.test' }
      ];
      
      const weights: Weights = { price: 0.5, latency: 0.5, reliability: 0 };
      const ranked = selector.rankHosts(incompleteHosts, weights);
      
      expect(ranked).toHaveLength(3);
      ranked.forEach(item => {
        expect(item.score).toBeDefined();
      });
    });
  });

  describe('Load Balancing', () => {
    it('should distribute requests using round-robin', () => {
      const selected1 = selector.loadBalance(mockHosts);
      const selected2 = selector.loadBalance(mockHosts);
      const selected3 = selector.loadBalance(mockHosts);
      
      expect(selected1?.id).not.toBe(selected2?.id);
      expect(selected2?.id).not.toBe(selected3?.id);
    });

    it('should cycle through all hosts in round-robin', () => {
      const selectedIds = new Set<string>();
      
      for (let i = 0; i < mockHosts.length; i++) {
        const selected = selector.loadBalance(mockHosts);
        if (selected?.id) selectedIds.add(selected.id);
      }
      
      expect(selectedIds.size).toBe(mockHosts.length);
    });

    it('should reset round-robin when hosts list changes', () => {
      selector.loadBalance(mockHosts);
      selector.loadBalance(mockHosts);
      
      const newHosts = mockHosts.slice(0, 3);
      const selected = selector.loadBalance(newHosts);
      
      expect(selected?.id).toBe('host-1'); // Should start from beginning
    });

    it('should track selection history', () => {
      const criteria: SelectionCriteria = { strategy: 'price' };
      
      selector.selectOptimalHost(mockHosts, criteria);
      selector.selectOptimalHost(mockHosts, criteria);
      
      const stats = selector.getSelectionStats();
      
      expect(stats.totalSelections).toBe(2);
      expect(stats.hostSelectionCounts['host-3']).toBe(2);
    });

    it('should calculate success rate from feedback', () => {
      const criteria: SelectionCriteria = { strategy: 'latency' };
      
      const host1 = selector.selectOptimalHost(mockHosts, criteria);
      selector.recordSuccess(host1!.id!, true);
      
      const host2 = selector.selectOptimalHost(mockHosts, criteria);
      selector.recordSuccess(host2!.id!, false);
      
      const stats = selector.getSelectionStats();
      
      expect(stats.successRate).toBe(0.5);
      expect(stats.hostReliabilityScores[host1!.id!]).toBeDefined();
    });
  });
});