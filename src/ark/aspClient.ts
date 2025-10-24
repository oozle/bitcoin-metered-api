import type { Config } from '../config.js';

export interface ASPHealth {
  url: string;
  healthy: boolean;
  latencyMs: number;
  lastRound?: string;
}

export interface RoundInfo {
  roundId: string;
  timestamp: string;
  status: 'pending' | 'active' | 'completed';
}

export class ASPClient {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Check ASP health and responsiveness
   */
  async checkHealth(): Promise<ASPHealth> {
    const start = Date.now();
    
    // In free mode, simulate healthy ASP
    if (this.config.paymentsMode === 'free') {
      return {
        url: this.config.ark.aspUrl,
        healthy: true,
        latencyMs: 10,
        lastRound: `r_${new Date().toISOString()}`,
      };
    }

    // TODO: Implement actual ASP health check when Arkade SDK is available
    // For now, simulate the check
    try {
      // Simulated HTTP request to ASP
      // const response = await fetch(`${this.config.ark.aspUrl}/health`);
      // const data = await response.json();
      
      return {
        url: this.config.ark.aspUrl,
        healthy: true,
        latencyMs: Date.now() - start,
        lastRound: `r_${new Date().toISOString()}`,
      };
    } catch {
      return {
        url: this.config.ark.aspUrl,
        healthy: false,
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Get current or upcoming round information
   */
  async getCurrentRound(): Promise<RoundInfo> {
    if (this.config.paymentsMode === 'free') {
      return {
        roundId: `r_${new Date().toISOString()}`,
        timestamp: new Date().toISOString(),
        status: 'active',
      };
    }

    // TODO: Implement actual round query when Arkade SDK is available
    return {
      roundId: `r_${new Date().toISOString()}`,
      timestamp: new Date().toISOString(),
      status: 'active',
    };
  }

  /**
   * Get receiver address for payments
   */
  getReceiverPubkey(): string {
    return this.config.ark.receiverPubkey;
  }

  /**
   * Get ASP URL
   */
  getAspUrl(): string {
    return this.config.ark.aspUrl;
  }
}
