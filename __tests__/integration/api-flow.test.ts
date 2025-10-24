import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import { initDatabase, DB } from '../../src/db/database.js';
import { ASPClient } from '../../src/ark/aspClient.js';
import { ArkVerifier } from '../../src/ark/verify.js';
import { QuotesService } from '../../src/payments/quotes.js';
import { JobsService } from '../../src/worker/jobs.js';
import { registerRoutes } from '../../src/api/handlers.js';
import { loadConfig } from '../../src/config.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('API Integration Tests', () => {
  let app: any;
  let db: DB;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-'));
    db = await initDatabase(join(tmpDir, 'test.db'));
    
    const config = loadConfig();
    const aspClient = new ASPClient(config);
    const verifier = new ArkVerifier(config, aspClient);
    const quotes = new QuotesService(db, config, aspClient);
    const jobs = new JobsService(db);

    app = Fastify({ logger: false });
    registerRoutes(app, { db, config, aspClient, quotes, verifier, jobs });
    
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('Complete Quote → PayCall Flow', () => {
    it('should complete summarize flow end-to-end', async () => {
      // 1. Get quote
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      expect(quoteRes.statusCode).toBe(200);
      const quote = JSON.parse(quoteRes.body);
      expect(quote.price_sats).toBe(50);
      expect(quote.quote_id).toBeDefined();

      // 2. Pay and call
      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': 'test-key-123',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdHZveG9zcGVuZA==',
            proof: 'dGVzdHByb29m',
            sender_pubkey: 'ark1qtest',
          },
          request: {
            endpoint: 'summarize',
            args: {
              text: 'Bitcoin is a decentralized digital currency that enables peer-to-peer transactions without the need for intermediaries.',
            },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(200);
      const result = JSON.parse(paycallRes.body);
      expect(result.status).toBe('ok');
      expect(result.result.summary).toBeDefined();
      expect(result.receipt.settlement_ref).toBeDefined();
      expect(result.receipt.paid_sats).toBe(50);
    });

    it('should handle image generation', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=generate_image&images=1',
      });

      const quote = JSON.parse(quoteRes.body);
      expect(quote.price_sats).toBe(50);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'generate_image',
            args: { prompt: 'A sunset' },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(200);
      const result = JSON.parse(paycallRes.body);
      expect(result.result.image_url).toBeDefined();
    });

    it('should handle translation', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=translate&characters=100',
      });

      const quote = JSON.parse(quoteRes.body);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'translate',
            args: { text: 'Hello', from: 'en', to: 'es' },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(200);
      const result = JSON.parse(paycallRes.body);
      expect(result.result.translated).toBeDefined();
    });

    it('should handle compute', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=compute&seconds=2',
      });

      const quote = JSON.parse(quoteRes.body);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'compute',
            args: { operation: 'square', value: 10 },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(200);
      const result = JSON.parse(paycallRes.body);
      expect(result.result.output).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should reject expired quote', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      const quote = JSON.parse(quoteRes.body);
      
      // Mark as expired
      db.updateQuoteStatus(quote.quote_id, 'expired');

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'summarize',
            args: { text: 'test' },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(409);
      const error = JSON.parse(paycallRes.body);
      expect(error.error).toBe('expired_or_missing_quote');
    });

    it('should reject endpoint mismatch', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      const quote = JSON.parse(quoteRes.body);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'translate', // Different from quote
            args: { text: 'test' },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(400);
      const error = JSON.parse(paycallRes.body);
      expect(error.error).toBe('endpoint_mismatch');
    });

    it('should reject invalid payment data', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      const quote = JSON.parse(quoteRes.body);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'short', // Invalid
            proof: 'short', // Invalid
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'summarize',
            args: { text: 'test' },
          },
        },
      });

      expect(paycallRes.statusCode).toBe(402);
    });

    it('should handle missing required args', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      const quote = JSON.parse(quoteRes.body);

      const paycallRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdHZveG9zcGVuZA==',
            proof: 'dGVzdHByb29m',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'summarize',
            args: {}, // Missing text
          },
        },
      });

      expect(paycallRes.statusCode).toBe(500);
      const error = JSON.parse(paycallRes.body);
      expect(error.message).toContain('text is required');
    });
  });

  describe('Idempotency', () => {
    it('should return cached response for same idempotency key', async () => {
      const quoteRes = await app.inject({
        method: 'GET',
        url: '/v1/quote?endpoint=summarize&tokens=1000',
      });

      const quote = JSON.parse(quoteRes.body);
      const idempotencyKey = 'idempotent-test-123';

      // First request
      const firstRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        payload: {
          quote_id: quote.quote_id,
          ark_payment: {
            vtxo_spend: 'dGVzdGluZ3ZveG9zcGVuZGRhdGE=',
            proof: 'dGVzdGluZ3Byb29mZGF0YQ==',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'summarize',
            args: { text: 'test text' },
          },
        },
      });

      const firstResult = JSON.parse(firstRes.body);

      // Second request with same key
      const secondRes = await app.inject({
        method: 'POST',
        url: '/v1/paycall',
        headers: {
          'Content-Type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        payload: {
          quote_id: 'different-quote', // Different payload
          ark_payment: {
            vtxo_spend: 'different',
            proof: 'different',
            sender_pubkey: 'ark1q',
          },
          request: {
            endpoint: 'summarize',
            args: { text: 'different text' },
          },
        },
      });

      const secondResult = JSON.parse(secondRes.body);

      // Should return same result
      expect(secondResult).toEqual(firstResult);
    });
  });

  describe('Health and Info', () => {
    it('should return health status', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });

      expect(res.statusCode).toBe(200);
      const health = JSON.parse(res.body);
      expect(health.status).toBe('healthy');
      expect(health.payments_mode).toBe('free');
      expect(health.asp).toBeDefined();
    });

    it('should return API info', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/',
      });

      expect(res.statusCode).toBe(200);
      const info = JSON.parse(res.body);
      expect(info.name).toBe('Bitcoin Metered API');
      expect(info.endpoints).toBeDefined();
    });
  });
});
