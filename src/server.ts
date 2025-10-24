import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig } from './config.js';
import { initDatabase } from './db/database.js';
import { ASPClient } from './ark/aspClient.js';
import { ArkVerifier } from './ark/verify.js';
import { QuotesService } from './payments/quotes.js';
import { JobsService } from './worker/jobs.js';
import { registerRoutes } from './api/handlers.js';

async function main() {
  // Load configuration
  const config = loadConfig();

  // Initialize Fastify
  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport:
        config.nodeEnv === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
    },
  });

  // Register CORS
  await app.register(cors, {
    origin: true,
  });

  // Initialize database
  const db = await initDatabase(config.database.path);
  app.log.info({ db_path: config.database.path }, 'database initialized');

  // Initialize services
  const aspClient = new ASPClient(config);
  const verifier = new ArkVerifier(config, aspClient);
  const quotes = new QuotesService(db, config, aspClient);
  const jobs = new JobsService(db);

  // Check ASP health on startup
  const aspHealth = await aspClient.checkHealth();
  app.log.info(
    {
      asp_url: aspHealth.url,
      healthy: aspHealth.healthy,
      latency_ms: aspHealth.latencyMs,
    },
    'ASP health check'
  );

  if (!aspHealth.healthy && config.paymentsMode !== 'free') {
    app.log.warn('ASP appears unhealthy, but continuing startup');
  }

  // Register routes
  registerRoutes(app, {
    db,
    config,
    aspClient,
    quotes,
    verifier,
    jobs,
  });

  // Periodic cleanup
  setInterval(() => {
    quotes.cleanupExpired();
    app.log.debug('cleaned up expired quotes and idempotency keys');
  }, 60_000); // Every minute

  // Graceful shutdown
  const signals = ['SIGINT', 'SIGTERM'];
  signals.forEach((signal) => {
    process.on(signal, async () => {
      app.log.info({ signal }, 'received shutdown signal');
      await app.close();
      db.close();
      process.exit(0);
    });
  });

  // Start server
  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    app.log.info(
      {
        port: config.port,
        payments_mode: config.paymentsMode,
        node_env: config.nodeEnv,
      },
      'server started'
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
