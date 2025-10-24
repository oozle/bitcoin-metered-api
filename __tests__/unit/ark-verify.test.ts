import { describe, it, expect } from '@jest/globals';
import { ArkVerifier } from '../../src/ark/verify.js';
import { ASPClient } from '../../src/ark/aspClient.js';
import { loadConfig } from '../../src/config.js';

describe('ArkVerifier', () => {
  let verifier: ArkVerifier;
  let aspClient: ASPClient;

  beforeEach(() => {
    const config = loadConfig();
    aspClient = new ASPClient(config);
    verifier = new ArkVerifier(config, aspClient);
  });

  describe('verifySpend', () => {
    it('should succeed in free mode', async () => {
      const result = await verifier.verifySpend({
        aspUrl: 'https://asp.test.com',
        receiver: 'ark1qtest',
        expectedSats: 100,
        spendBlob: 'dGVzdHNwZW5k',
        proof: 'dGVzdHByb29m',
      });

      expect(result.ok).toBe(true);
      expect(result.settlementRef).toContain('ark:round:');
      expect(result.actualSats).toBe(100);
    });

    it('should reject missing payment data', async () => {
      const result = await verifier.verifySpend({
        aspUrl: 'https://asp.test.com',
        receiver: 'ark1qtest',
        expectedSats: 100,
        spendBlob: '',
        proof: '',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing_payment_data');
    });

    it('should reject invalid format', async () => {
      const result = await verifier.verifySpend({
        aspUrl: 'https://asp.test.com',
        receiver: 'ark1qtest',
        expectedSats: 100,
        spendBlob: 'short',
        proof: 'short',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payment_format');
    });

    it('should validate base64 format', async () => {
      const result = await verifier.verifySpend({
        aspUrl: 'https://asp.test.com',
        receiver: 'ark1qtest',
        expectedSats: 100,
        spendBlob: 'invalid-chars!@#',
        proof: 'invalid-chars!@#',
      });

      expect(result.ok).toBe(false);
      expect(result.reason).toBe('invalid_payment_format');
    });
  });
});