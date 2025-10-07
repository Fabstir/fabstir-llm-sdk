/**
 * Host API Client (Sub-phase 4.1)
 * Browser-side HTTP client for calling the management server API
 */

export interface HostApiConfig {
  baseUrl: string;
  apiKey?: string;
}

export interface NodeStatus {
  status: 'running' | 'stopped';
  pid?: number;
  publicUrl?: string;
  startTime?: string;
  uptime?: number;
}

export interface RegisterParams {
  walletAddress: string;
  publicUrl: string;
  models: string[];
  stakeAmount: string;
  metadata?: any;
}

export interface RegisterResponse {
  transactionHash: string;
  hostAddress: string;
  success: boolean;
}

export interface DiscoveredNode {
  address: string;
  apiUrl: string;
  models: string[];
  isActive: boolean;
}

export interface DiscoverNodesResponse {
  hosts: DiscoveredNode[];
  count: number;
}

/**
 * HTTP client for Host Management API
 * Wraps fetch() calls to management server endpoints
 */
export class HostApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: HostApiConfig) {
    this.baseUrl = config.baseUrl;
    this.headers = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      this.headers['X-API-Key'] = config.apiKey;
    }
  }

  /**
   * GET /api/status - Get node status
   */
  async getStatus(): Promise<NodeStatus> {
    const response = await fetch(`${this.baseUrl}/api/status`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * GET /api/discover-nodes - Discover all active nodes on network
   */
  async discoverNodes(): Promise<DiscoverNodesResponse> {
    const response = await fetch(`${this.baseUrl}/api/discover-nodes`, {
      method: 'GET',
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/start - Start node in daemon mode
   */
  async start(daemon = true): Promise<{ status: string; pid: number; publicUrl: string }> {
    const response = await fetch(`${this.baseUrl}/api/start`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ daemon }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Start failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/stop - Stop running node
   */
  async stop(force = false): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/stop`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ force }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Stop failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/register - Register host on blockchain
   */
  async register(params: RegisterParams): Promise<RegisterResponse> {
    const response = await fetch(`${this.baseUrl}/api/register`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/unregister - Unregister host from blockchain
   */
  async unregister(): Promise<{ transactionHash: string; success: boolean }> {
    const response = await fetch(`${this.baseUrl}/api/unregister`, {
      method: 'POST',
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unregister failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/add-stake - Add more stake to existing registration
   */
  async addStake(amount: string): Promise<{ transactionHash: string; newStake: string }> {
    const response = await fetch(`${this.baseUrl}/api/add-stake`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ amount }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Add stake failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/withdraw-earnings - Withdraw accumulated earnings
   */
  async withdrawEarnings(): Promise<{ success: boolean; amount: string; transactionHash: string }> {
    const response = await fetch(`${this.baseUrl}/api/withdraw-earnings`, {
      method: 'POST',
      headers: this.headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Withdraw failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/update-models - Update list of supported models
   */
  async updateModels(modelIds: string[]): Promise<{ transactionHash: string; updatedModels: string[] }> {
    const response = await fetch(`${this.baseUrl}/api/update-models`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ modelIds }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Update models failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * POST /api/update-metadata - Update host metadata
   */
  async updateMetadata(metadata: any): Promise<{ transactionHash: string; updatedMetadata: any }> {
    const response = await fetch(`${this.baseUrl}/api/update-metadata`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ metadata }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Update metadata failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }
}
