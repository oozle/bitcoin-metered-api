import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { initDatabase, DB } from '../../src/db/database.js';
import { QuotesService } from '../../src/payments/quotes.js';
import { ASPClient } from '../../src/ark/aspClient.js';
import { loadConfig } from '../../src/config.js';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

describe('QuotesService', () => {
  let db: DB;
  let service: QuotesService;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'test-'));
    db = await initDatabase(join(tmpDir, 'test.db'));
    
    const config = loadConfig();
    const aspClient = new ASPClient(config);
    service = new QuotesService(db, config, aspClient);
  });

  afterEach(async () => {
    db.close();
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe('createQuote', () => {
    it('should create a quote for summarize endpoint', async () => {
      const quote = await service.createQuote({
        endpoint: 'summarize',
        units: { tokens: 1000 },
      });

      expect(quote.endpoint).toBe('summarize');
      expect(quote.units).toEqual({ tokens: 1000 });
      expect(quote.price_sats).toBe(50);
      expect(quote.quote_id).toMatch(/^q_/);
    });

    it('should calculate correct prices', async () => {
      const summarizeQuote = await service.createQuote({
        endpoint: 'summarize',
        units: { tokens: 1000 }
      });
      expect(summarizeQuote.price_sats).toBe(50);

      const imageQuote = await service.createQuote({
        endpoint: 'generate_image',
        units: { images: 3 }
      });
      expect(imageQuote.price_sats).toBe(150);
    });
  });

  describe('getValidQuote', () => {
    it('should return valid quote', async () => {
      const created = await service.createQuote({ endpoint: 'summarize' });
      const quote = service.getValidQuote(created.quote_id);

      expect(quote).not.toBeNull();
      expect(quote?.status).toBe('active');
    });

    it('should return null for expired quote', async () => {
      const created = await service.createQuote({ endpoint: 'summarize' });
      db.updateQuoteStatus(created.quote_id, 'expired');
      
      const quote = service.getValidQuote(created.quote_id);
      expect(quote).toBeNull();
    });
  });
});