import { nanoid } from 'nanoid';
import type { DB, Quote } from '../db/database.js';
import { ASPClient } from '../ark/aspClient.js';
import type { Config } from '../config.js';

export interface QuoteRequest {
  endpoint: string;
  units?: Record<string, number>;
}

export interface QuoteResponse {
  endpoint: string;
  units: Record<string, number>;
  price_sats: number;
  expires_at: string;
  quote_id: string;
  ark: {
    asp_url: string;
    receiver_pubkey: string;
    round_hint: string;
  };
}

/**
 * Pricing configuration for different endpoints
 */
const PRICING_RULES: Record<string, (units: Record<string, number>) => number> = {
  // Summarize: 5 sats per 100 tokens
  summarize: (units) => {
    const tokens = units.tokens || 1000;
    return Math.ceil((tokens / 100) * 5);
  },
  
  // Image generation: 50 sats per image
  generate_image: (units) => {
    const images = units.images || 1;
    return images * 50;
  },
  
  // Translation: 3 sats per 100 characters
  translate: (units) => {
    const chars = units.characters || 500;
    return Math.ceil((chars / 100) * 3);
  },
  
  // Generic compute: 10 sats per second
  compute: (units) => {
    const seconds = units.seconds || 1;
    return seconds * 10;
  },
  
  // Default fallback
  default: (units) => {
    const amount = units.amount || 1;
    return amount * 10;
  },
};

export class QuotesService {
  private db: DB;
  private aspClient: ASPClient;

  constructor(db: DB, _config: Config, aspClient: ASPClient) {
    this.db = db;
    this.aspClient = aspClient;
  }

  /**
   * Create a new price quote
   */
  async createQuote(req: QuoteRequest): Promise<QuoteResponse> {
    // Validate endpoint
    if (!req.endpoint) {
      throw new Error('endpoint is required');
    }

    // Calculate price based on endpoint and units
    const units = req.units || { tokens: 1000 };
    const pricingFn = PRICING_RULES[req.endpoint] || PRICING_RULES.default;
    const priceSats = pricingFn(units);

    // Get current round info from ASP
    const round = await this.aspClient.getCurrentRound();

    // Create quote with expiration (30 seconds default)
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30_000);
    
    const quoteId = `q_${nanoid(16)}`;
    const nonce = nanoid(32);

    const quote: Omit<Quote, 'created_at'> = {
      id: quoteId,
      endpoint: req.endpoint,
      units: JSON.stringify(units),
      price_sats: priceSats,
      expires_at: expiresAt.toISOString(),
      nonce,
      receiver_pubkey: this.aspClient.getReceiverPubkey(),
      asp_url: this.aspClient.getAspUrl(),
      status: 'active',
    };

    this.db.createQuote(quote);

    return {
      endpoint: req.endpoint,
      units,
      price_sats: priceSats,
      expires_at: expiresAt.toISOString(),
      quote_id: quoteId,
      ark: {
        asp_url: this.aspClient.getAspUrl(),
        receiver_pubkey: this.aspClient.getReceiverPubkey(),
        round_hint: round.roundId,
      },
    };
  }

  /**
   * Get and validate a quote
   */
  getValidQuote(quoteId: string): Quote | null {
    const quote = this.db.getQuote(quoteId);
    
    if (!quote) {
      return null;
    }

    // Check if expired
    if (new Date(quote.expires_at) < new Date()) {
      this.db.updateQuoteStatus(quoteId, 'expired');
      return null;
    }

    // Check if already used
    if (quote.status !== 'active') {
      return null;
    }

    return quote;
  }

  /**
   * Mark quote as used
   */
  markQuoteUsed(quoteId: string): void {
    this.db.updateQuoteStatus(quoteId, 'used');
  }

  /**
   * Clean up expired quotes periodically
   */
  cleanupExpired(): void {
    this.db.cleanupExpired();
  }
}
