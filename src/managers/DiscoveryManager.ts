import type AuthManager from './AuthManager';

// Dynamic imports to support mocking in tests
type Libp2p = any;
type CreateLibp2pFn = (config: any) => Promise<Libp2p>;

export interface DiscoveryOptions {
  listen?: string[];
  bootstrap?: string[];
}

export default class DiscoveryManager {
  private static readonly DEFAULT_LISTEN = ['/ip4/127.0.0.1/tcp/0'];
  private static readonly MIN_CONNECTIONS = 0;
  private static readonly MAX_CONNECTIONS = 10;
  private static readonly PROTOCOL_PREFIX = '/fabstir-llm/1.0.0';
  
  private node?: Libp2p;
  private messageHandler?: (message: any) => void;
  private running = false;

  constructor(private authManager: AuthManager) {}

  async createNode(options?: DiscoveryOptions): Promise<string> {
    try {
      // Dynamic imports for better testability
      const { createLibp2p } = await import('libp2p');
      const { tcp } = await import('@libp2p/tcp');
      const { noise } = await import('@chainsafe/libp2p-noise');
      const { yamux } = await import('@chainsafe/libp2p-yamux');

      const config = {
        addresses: {
          listen: options?.listen || DiscoveryManager.DEFAULT_LISTEN
        },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionManager: {
          minConnections: DiscoveryManager.MIN_CONNECTIONS,
          maxConnections: DiscoveryManager.MAX_CONNECTIONS
        }
      };

      if (options?.bootstrap?.length) {
        (config as any).bootstrap = options.bootstrap;
      }

      this.node = await createLibp2p(config as any);
      await this.node.start();
      this.running = true;

      return this.node.peerId.toString();
    } catch (error: any) {
      throw new Error(`Failed to create P2P node: ${error.message}`);
    }
  }

  async connectToPeer(multiaddr: string): Promise<void> {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    try {
      await this.node.dial(multiaddr);
    } catch (error: any) {
      throw new Error(`Failed to connect to peer: ${error.message}`);
    }
  }

  getConnectedPeers(): string[] {
    if (!this.node) {
      return [];
    }

    const connections = this.node.getConnections();
    return connections.map(conn => conn.remotePeer.toString());
  }

  async sendMessage(peerId: string, message: any): Promise<void> {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    try {
      const protocol = `${DiscoveryManager.PROTOCOL_PREFIX}/message`;
      const stream = await (this.node as any).dialProtocol(
        `/p2p/${peerId}`,
        protocol
      );

      const data = JSON.stringify(message);
      const encoder = new TextEncoder();
      await stream.sink([encoder.encode(data)]);
      stream.close();
    } catch (error: any) {
      throw new Error(`Failed to send message: ${error.message}`);
    }
  }

  onMessage(handler: (message: any) => void): void {
    if (!this.node) {
      throw new Error('Node not initialized');
    }

    this.messageHandler = handler;
    const protocol = `${DiscoveryManager.PROTOCOL_PREFIX}/message`;

    this.node.handle(protocol, async ({ stream }: any) => {
      try {
        const chunks: Uint8Array[] = [];
        for await (const chunk of stream.source) {
          chunks.push(chunk);
        }

        const decoder = new TextDecoder();
        const data = decoder.decode(Buffer.concat(chunks));
        const message = JSON.parse(data);

        if (this.messageHandler) {
          this.messageHandler(message);
        }
      } catch (error) {
        console.error('Failed to handle message:', error);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.node) {
      await this.node.stop();
      this.node = undefined;
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  getAuthManager(): AuthManager {
    if (!this.authManager.isAuthenticated()) {
      throw new Error('AuthManager not authenticated');
    }
    return this.authManager;
  }
}