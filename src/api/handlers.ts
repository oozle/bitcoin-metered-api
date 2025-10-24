import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import type { DB } from '../db/database.js';
import { QuotesService } from '../payments/quotes.js';
import { ArkVerifier } from '../ark/verify.js';
import { JobsService } from '../worker/jobs.js';
import type { Config } from '../config.js';
import { ASPClient } from '../ark/aspClient.js';

// Request schemas
const QuoteQuerySchema = z.object({
  endpoint: z.string().min(1),
  tokens: z.coerce.number().optional(),
  images: z.coerce.number().optional(),
  characters: z.coerce.number().optional(),
  seconds: z.coerce.number().optional(),
  amount: z.coerce.number().optional(),
});

const PayCallBodySchema = z.object({
  quote_id: z.string().min(1),
  ark_payment: z.object({
    vtxo_spend: z.string().min(1),
    proof: z.string().min(1),
    sender_pubkey: z.string().min(1),
  }),
  request: z.object({
    endpoint: z.string().min(1),
    args: z.record(z.any()),
  }),
});

export interface AppServices {
  db: DB;
  config: Config;
  aspClient: ASPClient;
  quotes: QuotesService;
  verifier: ArkVerifier;
  jobs: JobsService;
}

export function registerRoutes(app: FastifyInstance, services: AppServices) {
  /**
   * GET /v1/quote - Get a price quote
   */
  app.get('/v1/quote', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = QuoteQuerySchema.parse(req.query);
      
      // Build units object from query params
      const units: Record<string, number> = {};
      if (query.tokens) units.tokens = query.tokens;
      if (query.images) units.images = query.images;
      if (query.characters) units.characters = query.characters;
      if (query.seconds) units.seconds = query.seconds;
      if (query.amount) units.amount = query.amount;

      const quote = await services.quotes.createQuote({
        endpoint: query.endpoint,
        units: Object.keys(units).length > 0 ? units : undefined,
      });

      req.log.info({ quote_id: quote.quote_id, endpoint: query.endpoint, price_sats: quote.price_sats }, 'quote created');

      return reply.code(200).send(quote);
    } catch (error) {
      req.log.error({ error }, 'quote creation failed');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'validation_error',
          details: error.errors,
        });
      }

      return reply.code(500).send({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });

  /**
   * POST /v1/paycall - Pay and execute API call
   */
  app.post('/v1/paycall', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      // Check idempotency key
      const idempotencyKey = (req.headers['idempotency-key'] as string) || '';
      
      if (idempotencyKey) {
        const cached = services.db.getIdempotencyKey(idempotencyKey);
        if (cached) {
          req.log.info({ idempotency_key: idempotencyKey }, 'returning cached response');
          return reply.code(200).send(JSON.parse(cached.response_json));
        }
      }

      const body = PayCallBodySchema.parse(req.body);

      // Validate quote
      const quote = services.quotes.getValidQuote(body.quote_id);
      
      if (!quote) {
        return reply.code(409).send({
          error: 'expired_or_missing_quote',
          message: 'Quote has expired, been used, or does not exist',
        });
      }

      // Verify endpoint matches
      if (quote.endpoint !== body.request.endpoint) {
        return reply.code(400).send({
          error: 'endpoint_mismatch',
          message: 'Request endpoint does not match quote',
        });
      }

      // Verify payment
      req.log.info({ quote_id: body.quote_id }, 'verifying payment');
      
      const verified = await services.verifier.verifySpend({
        aspUrl: quote.asp_url,
        receiver: quote.receiver_pubkey,
        expectedSats: quote.price_sats,
        spendBlob: body.ark_payment.vtxo_spend,
        proof: body.ark_payment.proof,
      });

      if (!verified.ok) {
        return reply.code(402).send({
          error: 'payment_invalid',
          details: verified.reason,
        });
      }

      req.log.info({ settlement_ref: verified.settlementRef }, 'payment verified');

      // Record payment
      const paymentId = `pay_${nanoid(16)}`;
      services.db.createPayment({
        id: paymentId,
        quote_id: body.quote_id,
        sender_pubkey: body.ark_payment.sender_pubkey,
        paid_sats: verified.actualSats || quote.price_sats,
        ark_ref: verified.settlementRef || '',
        vtxo_spend: body.ark_payment.vtxo_spend,
        proof: body.ark_payment.proof,
        status: 'verified',
      });

      // Mark quote as used
      services.quotes.markQuoteUsed(body.quote_id);

      // Create and execute job
      const job = await services.jobs.createJob({
        endpoint: body.request.endpoint,
        args: body.request.args,
        paymentId,
      });

      req.log.info({ job_id: job.id }, 'executing job');

      // Execute job synchronously
      const result = await services.jobs.executeJob(job.id);

      if (result.status === 'error') {
        return reply.code(500).send({
          error: 'job_execution_failed',
          message: result.error,
        });
      }

      const response = {
        status: 'ok',
        result: result.result,
        receipt: {
          settlement_ref: verified.settlementRef,
          paid_sats: verified.actualSats || quote.price_sats,
          job_id: job.id,
          payment_id: paymentId,
        },
      };

      // Cache response for idempotency
      if (idempotencyKey) {
        services.db.setIdempotencyKey(idempotencyKey, JSON.stringify(response), 120);
      }

      req.log.info({ job_id: job.id, settlement_ref: verified.settlementRef }, 'job completed');

      return reply.code(200).send(response);
    } catch (error) {
      req.log.error({ error }, 'paycall failed');
      
      if (error instanceof z.ZodError) {
        return reply.code(400).send({
          error: 'validation_error',
          details: error.errors,
        });
      }

      return reply.code(500).send({
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });

  /**
   * GET /health - Health check
   */
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    const aspHealth = await services.aspClient.checkHealth();
    
    return reply.code(200).send({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      payments_mode: services.config.paymentsMode,
      asp: {
        url: aspHealth.url,
        healthy: aspHealth.healthy,
        latency_ms: aspHealth.latencyMs,
        last_round: aspHealth.lastRound,
      },
    });
  });

  /**
   * GET / - API info
   */
  app.get('/', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      name: 'Bitcoin Metered API',
      version: '1.0.0',
      description: 'Pay-per-request API using Arkade (Bitcoin L2)',
      endpoints: {
        quote: 'GET /v1/quote?endpoint=<name>&tokens=<n>',
        paycall: 'POST /v1/paycall',
        health: 'GET /health',
      },
      docs: 'https://github.com/your-repo/bitcoin-metered-api',
      payments_mode: services.config.paymentsMode,
    });
  });
}
