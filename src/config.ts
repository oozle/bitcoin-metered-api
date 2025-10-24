import { z } from 'zod';

const configSchema = z.object({
  port: z.number().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  paymentsMode: z.enum(['free', 'testnet', 'mainnet']).default('free'),
  ark: z.object({
    aspUrl: z.string().default('https://asp.testnet.arkade.example'),
    receiverPubkey: z.string().default('ark1q...'),
  }),
  database: z.object({
    path: z.string().default('./data/metered-api.db'),
  }),
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
    password: z.string().optional(),
  }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  return configSchema.parse({
    port: Number(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    paymentsMode: process.env.PAYMENTS_MODE || 'free',
    ark: {
      aspUrl: process.env.ARK_ASP_URL || 'https://asp.testnet.arkade.example',
      receiverPubkey: process.env.ARK_RECEIVER_PUBKEY || 'ark1q...',
    },
    database: {
      path: process.env.DATABASE_PATH || './data/metered-api.db',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
    },
    logLevel: process.env.LOG_LEVEL || 'info',
  });
}
