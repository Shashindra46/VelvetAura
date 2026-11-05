/**
 * VelvetAura - PayHere Utility Unit Test Suite
 * 
 * Verifies PayHere MD5 checkout initiation hash generation, 2-decimal formatting rules,
 * webhook signature verification, and gateway configuration resolver.
 */

const crypto = require('crypto');
const {
  generatePayHereHash,
  verifyPayHereSignature,
  getPayHereConfig,
  mapPayHereStatus,
} = require('../../src/services/payhereService');

describe('PayHere Payment Gateway Utility Service (Unit Tests)', () => {
  const merchantId = '1211149';
  const merchantSecret = '4Mm8k8abc12345xyzSecretToken';

  describe('generatePayHereHash', () => {
    test('generates 32-character uppercase MD5 hash matching official PayHere formula', () => {
      const orderId = 'VA-20261105-1001';
      const amount = 14500.5;
      const currency = 'LKR';

      const hash = generatePayHereHash({
        merchantId,
        orderId,
        amount,
        currency,
        merchantSecret,
      });

      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(32);
      expect(hash).toBe(hash.toUpperCase());

      // Independently compute expected MD5
      const hashedSecret = crypto
        .createHash('md5')
        .update(merchantSecret)
        .digest('hex')
        .toUpperCase();
      const rawString = `${merchantId}${orderId}14500.50${currency}${hashedSecret}`;
      const expectedHash = crypto
        .createHash('md5')
        .update(rawString)
        .digest('hex')
        .toUpperCase();

      expect(hash).toBe(expectedHash);
    });

    test('supports positional arguments as well as options object', () => {
      const orderId = 'VA-20261105-1002';
      const amount = 5000;

      const hashFromObj = generatePayHereHash({
        merchantId,
        orderId,
        amount,
        currency: 'LKR',
        merchantSecret,
      });

      const hashFromPositional = generatePayHereHash(
        merchantId,
        orderId,
        amount,
        'LKR',
        merchantSecret
      );

      expect(hashFromObj).toBe(hashFromPositional);
    });

    test('strictly formats amounts to 2 decimal places with dot separator', () => {
      const orderId = 'VA-INT-TEST';

      // Integer amount: 1000 -> 1000.00
      const hash1 = generatePayHereHash({
        merchantId,
        orderId,
        amount: 1000,
        currency: 'LKR',
        merchantSecret,
      });
      const hash1Manual = generatePayHereHash({
        merchantId,
        orderId,
        amount: '1000.00',
        currency: 'LKR',
        merchantSecret,
      });
      expect(hash1).toBe(hash1Manual);

      // Fractional amount: 125.456 -> 125.46
      const hash2 = generatePayHereHash({
        merchantId,
        orderId,
        amount: 125.456,
        currency: 'LKR',
        merchantSecret,
      });
      const hash2Manual = generatePayHereHash({
        merchantId,
        orderId,
        amount: '125.46',
        currency: 'LKR',
        merchantSecret,
      });
      expect(hash2).toBe(hash2Manual);

      // Zero amount: 0 -> 0.00
      const hash0 = generatePayHereHash({
        merchantId,
        orderId,
        amount: 0,
        currency: 'LKR',
        merchantSecret,
      });
      const hash0Manual = generatePayHereHash({
        merchantId,
        orderId,
        amount: '0.00',
        currency: 'LKR',
        merchantSecret,
      });
      expect(hash0).toBe(hash0Manual);
    });

    test('throws descriptive error on missing required parameters', () => {
      expect(() => {
        generatePayHereHash({ orderId: 'VA-1', amount: 100, merchantSecret });
      }).toThrow('Missing required parameters');

      expect(() => {
        generatePayHereHash({ merchantId, amount: 100, merchantSecret });
      }).toThrow('Missing required parameters');

      expect(() => {
        generatePayHereHash({ merchantId, orderId: 'VA-1', merchantSecret });
      }).toThrow('Missing required parameters');
    });

    test('throws error on negative or non-numeric amount', () => {
      expect(() => {
        generatePayHereHash({
          merchantId,
          orderId: 'VA-1',
          amount: -50,
          merchantSecret,
        });
      }).toThrow('Amount must be a non-negative number');

      expect(() => {
        generatePayHereHash({
          merchantId,
          orderId: 'VA-1',
          amount: 'invalid-amount',
          merchantSecret,
        });
      }).toThrow('Amount must be a non-negative number');
    });
  });

  describe('verifyPayHereSignature', () => {
    function computeValidSig(payload, secret) {
      const hashedSecret = crypto
        .createHash('md5')
        .update(secret)
        .digest('hex')
        .toUpperCase();
      const raw = `${payload.merchant_id}${payload.order_id}${payload.payhere_amount}${payload.payhere_currency}${payload.status_code}${hashedSecret}`;
      return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
    }

    test('returns true for authentic incoming webhook payload', () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-20261105-9988',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidSig(payload, merchantSecret);

      const isValid = verifyPayHereSignature(payload, merchantSecret);
      expect(isValid).toBe(true);
    });

    test('supports case-insensitive comparison (lowercase md5sig passes)', () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-20261105-9988',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidSig(payload, merchantSecret).toLowerCase();

      const isValid = verifyPayHereSignature(payload, merchantSecret);
      expect(isValid).toBe(true);
    });

    test('returns false when payhere_amount has been tampered', () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-20261105-9988',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidSig(payload, merchantSecret);

      // Tamper amount
      payload.payhere_amount = '100.00';
      const isValid = verifyPayHereSignature(payload, merchantSecret);
      expect(isValid).toBe(false);
    });

    test('returns false when status_code has been tampered', () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-20261105-9988',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: -1, // Failed
      };
      payload.md5sig = computeValidSig(payload, merchantSecret);

      // Tamper status_code to 2 (paid)
      payload.status_code = 2;
      const isValid = verifyPayHereSignature(payload, merchantSecret);
      expect(isValid).toBe(false);
    });

    test('returns false when invalid secret is used', () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-20261105-9988',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidSig(payload, 'wrong-secret');

      const isValid = verifyPayHereSignature(payload, merchantSecret);
      expect(isValid).toBe(false);
    });

    test('returns false on missing or null payload parameters', () => {
      expect(verifyPayHereSignature(null, merchantSecret)).toBe(false);
      expect(verifyPayHereSignature({}, merchantSecret)).toBe(false);
      expect(verifyPayHereSignature({ merchant_id: merchantId }, merchantSecret)).toBe(false);
    });
  });

  describe('getPayHereConfig', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    test('returns default sandbox configuration and URLs', () => {
      delete process.env.PAYHERE_MODE;
      const config = getPayHereConfig();

      expect(config.mode).toBe('sandbox');
      expect(config.currency).toBe('LKR');
      expect(config.checkoutUrl).toBe('https://sandbox.payhere.lk/pay/checkout');
      expect(config.notifyUrl).toBe('/api/payments/payhere/notify');
    });

    test('returns production URLs when PAYHERE_MODE=production', () => {
      process.env.PAYHERE_MODE = 'production';
      const config = getPayHereConfig();

      expect(config.mode).toBe('production');
      expect(config.checkoutUrl).toBe('https://www.payhere.lk/pay/checkout');
    });
  });

  describe('mapPayHereStatus', () => {
    test('maps status code 2 to paid', () => {
      expect(mapPayHereStatus(2)).toBe('paid');
      expect(mapPayHereStatus('2')).toBe('paid');
    });

    test('maps status code 0 to pending', () => {
      expect(mapPayHereStatus(0)).toBe('pending');
      expect(mapPayHereStatus('0')).toBe('pending');
    });

    test('maps negative status codes to failed', () => {
      expect(mapPayHereStatus(-1)).toBe('failed');
      expect(mapPayHereStatus(-2)).toBe('failed');
      expect(mapPayHereStatus('-1')).toBe('failed');
    });
  });
});
