import type { 
  Host, SelectionCriteria, Weights, Requirements, 
  HostScore, SelectionStats, HostWithReliability 
} from '../types/discovery';

export default class HostSelector {
  private weights: Weights = { price: 0.33, latency: 0.33, reliability: 0.34 };
  private roundRobinIndex = 0;
  private lastHostsList = '';
  private selectionHistory = new Map<string, number>();
  private successHistory = new Map<string, { success: number; total: number }>();
  private totalSelections = 0;

  constructor(strategy?: string) {
    if (strategy === 'price-focused') this.weights = { price: 0.7, latency: 0.2, reliability: 0.1 };
    else if (strategy === 'latency-focused') this.weights = { price: 0.2, latency: 0.7, reliability: 0.1 };
  }

  selectOptimalHost(hosts: Host[], criteria: SelectionCriteria): Host | null {
    if (!hosts.length) return null;
    let candidates = [...hosts];

    // Apply constraints
    if (criteria.maxPrice !== undefined)
      candidates = candidates.filter(h => (h.pricePerToken || Infinity) <= criteria.maxPrice!);
    if (criteria.maxLatency !== undefined)
      candidates = candidates.filter(h => (h.latency || Infinity) <= criteria.maxLatency!);
    if (criteria.requiredModel)
      candidates = candidates.filter(h => h.models?.includes(criteria.requiredModel!));
    if (criteria.requiredCapabilities?.length)
      candidates = candidates.filter(h => 
        criteria.requiredCapabilities!.every(cap => h.capabilities?.includes(cap)));

    if (!candidates.length) return null;

    let selected: Host | null = null;
    switch (criteria.strategy) {
      case 'price': selected = this.selectByPrice(candidates); break;
      case 'latency': selected = this.selectByLatency(candidates, criteria.preferredRegion); break;
      case 'capability': selected = this.selectByCapability(candidates, criteria.preferredCapabilities); break;
      case 'composite': selected = this.rankHosts(candidates, this.weights)[0]?.host || null; break;
      case 'round-robin': selected = this.loadBalance(candidates); break;
      default: selected = candidates[0];
    }

    if (selected?.id) this.recordSelection(selected.id);
    return selected;
  }

  rankHosts(hosts: Host[], weights: Weights): HostScore[] {
    const prices = hosts.map(h => h.pricePerToken ?? Infinity);
    const latencies = hosts.map(h => h.latency ?? Infinity);
    const reliabilities = hosts.map(h => (h as HostWithReliability).reliability ?? 0.5);

    const validPrices = prices.filter(p => p !== Infinity);
    const validLatencies = latencies.filter(l => l !== Infinity);
    
    const minPrice = validPrices.length ? Math.min(...validPrices) : 0;
    const maxPrice = validPrices.length ? Math.max(...validPrices) : 1;
    const minLatency = validLatencies.length ? Math.min(...validLatencies) : 0;
    const maxLatency = validLatencies.length ? Math.max(...validLatencies) : 1000;
    const minRel = Math.min(...reliabilities);
    const maxRel = Math.max(...reliabilities);

    return hosts.map((host, i) => {
      const priceScore = prices[i] === Infinity ? 0 : 
        this.normalize(prices[i], minPrice, maxPrice, true);
      const latencyScore = latencies[i] === Infinity ? 0 : 
        this.normalize(latencies[i], minLatency, maxLatency, true);
      const reliabilityScore = this.normalize(reliabilities[i], minRel, maxRel, false);
      const score = weights.price * priceScore + weights.latency * latencyScore + 
                   weights.reliability * reliabilityScore;
      return { host, score, breakdown: { priceScore, latencyScore, reliabilityScore } };
    }).sort((a, b) => b.score - a.score);
  }

  filterByRequirements(hosts: Host[], req: Requirements): Host[] {
    let filtered = [...hosts];
    if (req.models?.length)
      filtered = filtered.filter(h => h.models?.some(m => req.models!.includes(m)));
    if (req.capabilities?.length)
      filtered = filtered.filter(h => req.capabilities!.every(cap => h.capabilities?.includes(cap)));
    if (req.maxPrice !== undefined)
      filtered = filtered.filter(h => (h.pricePerToken || 0) <= req.maxPrice!);
    if (req.maxLatency !== undefined)
      filtered = filtered.filter(h => h.latency !== undefined && h.latency <= req.maxLatency!);
    if (req.region)
      filtered = filtered.filter(h => h.region === req.region);
    return filtered;
  }

  loadBalance(hosts: Host[]): Host | null {
    if (!hosts.length) return null;
    const key = hosts.map(h => h.id).join(',');
    if (key !== this.lastHostsList) {
      this.roundRobinIndex = 0;
      this.lastHostsList = key;
    }
    return hosts[this.roundRobinIndex++ % hosts.length];
  }

  setWeights(weights: Weights): void { this.weights = weights; }

  recordSuccess(hostId: string, success: boolean): void {
    const current = this.successHistory.get(hostId) || { success: 0, total: 0 };
    current.total++;
    if (success) current.success++;
    this.successHistory.set(hostId, current);
  }

  getSelectionStats(): SelectionStats {
    const hostSelectionCounts: Record<string, number> = {};
    const hostReliabilityScores: Record<string, number> = {};
    
    this.selectionHistory.forEach((count, id) => hostSelectionCounts[id] = count);
    
    let totalSuccess = 0, totalAttempts = 0;
    this.successHistory.forEach((stats, id) => {
      hostReliabilityScores[id] = stats.total > 0 ? stats.success / stats.total : 0;
      totalSuccess += stats.success;
      totalAttempts += stats.total;
    });

    return {
      totalSelections: this.totalSelections,
      successRate: totalAttempts > 0 ? totalSuccess / totalAttempts : 0,
      hostSelectionCounts,
      hostReliabilityScores
    };
  }

  private selectByPrice(hosts: Host[]): Host | null {
    return hosts.reduce((best, host) => {
      const price = host.pricePerToken ?? Infinity;
      return price < (best?.pricePerToken ?? Infinity) ? host : best;
    }, null as Host | null);
  }

  private selectByLatency(hosts: Host[], region?: string): Host | null {
    return hosts.reduce((best, host) => {
      const lat = host.latency ?? Infinity;
      const bestLat = best?.latency ?? Infinity;
      if (region && Math.abs(lat - bestLat) < 10 && 
          host.region === region && best?.region !== region) return host;
      return lat < bestLat ? host : best;
    }, null as Host | null);
  }

  private selectByCapability(hosts: Host[], caps?: string[]): Host | null {
    if (!caps?.length) return hosts[0];
    return hosts.reduce((best, host) => {
      const matches = caps.filter(c => host.capabilities?.includes(c)).length;
      const bestMatches = caps.filter(c => best?.capabilities?.includes(c)).length;
      return matches > bestMatches ? host : best;
    }, null as Host | null);
  }

  private normalize(val: number, min: number, max: number, inv: boolean): number {
    if (val === Infinity) return 0;
    if (min === max) return 0.5;
    let norm = (val - min) / (max - min);
    if (inv) norm = 1 - norm;
    return Math.max(0, Math.min(1, norm));
  }

  private recordSelection(hostId: string): void {
    this.totalSelections++;
    this.selectionHistory.set(hostId, (this.selectionHistory.get(hostId) || 0) + 1);
  }
}