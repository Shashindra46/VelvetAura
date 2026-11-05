/**
 * VelvetAura - Adversarial PayHere & Webhook Stress Harness
 * 
 * Comprehensive empirical test suite targeting:
 * 1. PayHere Hash Generation & Signatures (edge amounts, formatting, bit-flip tamper sensitivity)
 * 2. Webhook Callback IPN (spoofed signatures, non-existent orders, status codes 2, -1, -2,
 *    and duplicate/replay idempotency with stock compensation verification).
 */

const request = require('supertest');
const crypto = require('crypto');
const app = require('../src/app');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const {
  generatePayHereHash,
  verifyPayHereSignature,
  getPayHereConfig,
  mapPayHereStatus,
} = require('../src/services/payhereService');

describe('Adversarial PayHere & Webhook Stress Suite', () => {
  const merchantId = '1211149';
  const merchantSecret = '4Mm8k8abc12345xyzSecretToken';
  let testUser;
  let testProduct1;
  let testProduct2;

  beforeAll(() => {
    process.env.PAYHERE_MERCHANT_ID = merchantId;
    process.env.PAYHERE_MERCHANT_SECRET = merchantSecret;
  });

  beforeEach(async () => {
    testUser = await User.create({
      name: 'Adversarial Tester',
      email: `adversary_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'SecurePassword123!',
    });

    testProduct1 = await Product.create({
      name: 'SK-II Facial Treatment Essence',
      brand: 'SK-II',
      origin: 'Japan',
      category: 'skincare',
      price: 28500.0,
      stock: 50,
      description: 'Iconic Japanese essence formulated with Pitera.',
    });

    testProduct2 = await Product.create({
      name: 'Dior Sauvage Elixir',
      brand: 'Dior',
      origin: 'France',
      category: 'fragrances',
      price: 45000.0,
      stock: 30,
      description: 'Intense and concentrated men luxury elixir.',
    });
  });

  function computeValidNotifySig(payload, secret = merchantSecret) {
    const hashedSecret = crypto
      .createHash('md5')
      .update(String(secret).trim())
      .digest('hex')
      .toUpperCase();
    const raw = `${String(payload.merchant_id).trim()}${String(payload.order_id).trim()}${String(payload.payhere_amount).trim()}${String(payload.payhere_currency).trim().toUpperCase()}${String(payload.status_code).trim()}${hashedSecret}`;
    return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
  }

  // =========================================================================
  // SECTION 1: PAYHERE HASH GENERATION & SIGNATURE VERIFICATION
  // =========================================================================
  describe('1. PayHere Hash Generation & Signature Stress', () => {
    test('strictly generates 32-character uppercase MD5 hex string (no lowercase)', () => {
      const amounts = [0, 0.01, 1, 50, 1000, 12500.5, 9999999.99];
      for (const amt of amounts) {
        const hash = generatePayHereHash({
          merchantId,
          orderId: `VA-TEST-${amt}`,
          amount: amt,
          currency: 'LKR',
          merchantSecret,
        });
        expect(hash).toMatch(/^[0-9A-F]{32}$/);
        expect(hash).not.toMatch(/[a-f]/);
        expect(hash.length).toBe(32);
      }
    });

    test('handles edge amounts correctly with 2-decimal formatting', () => {
      // 0 -> 0.00
      const hashZero = generatePayHereHash({
        merchantId,
        orderId: 'VA-0',
        amount: 0,
        currency: 'LKR',
        merchantSecret,
      });
      const expectedZero = crypto
        .createHash('md5')
        .update(`${merchantId}VA-00.00LKR${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`)
        .digest('hex')
        .toUpperCase();
      expect(hashZero).toBe(expectedZero);

      // 0.01 -> 0.01
      const hashPenny = generatePayHereHash({
        merchantId,
        orderId: 'VA-PENNY',
        amount: 0.01,
        currency: 'LKR',
        merchantSecret,
      });
      const expectedPenny = crypto
        .createHash('md5')
        .update(`${merchantId}VA-PENNY0.01LKR${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`)
        .digest('hex')
        .toUpperCase();
      expect(hashPenny).toBe(expectedPenny);

      // 1000 -> 1000.00
      const hashInt = generatePayHereHash({
        merchantId,
        orderId: 'VA-1000',
        amount: 1000,
        currency: 'LKR',
        merchantSecret,
      });
      const expectedInt = crypto
        .createHash('md5')
        .update(`${merchantId}VA-10001000.00LKR${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`)
        .digest('hex')
        .toUpperCase();
      expect(hashInt).toBe(expectedInt);

      // 12500.5 -> 12500.50
      const hashFrac = generatePayHereHash({
        merchantId,
        orderId: 'VA-12500.5',
        amount: 12500.5,
        currency: 'LKR',
        merchantSecret,
      });
      const expectedFrac = crypto
        .createHash('md5')
        .update(`${merchantId}VA-12500.512500.50LKR${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`)
        .digest('hex')
        .toUpperCase();
      expect(hashFrac).toBe(expectedFrac);

      // Very large amount: 999999999.99
      const hashLarge = generatePayHereHash({
        merchantId,
        orderId: 'VA-LARGE',
        amount: 999999999.99,
        currency: 'LKR',
        merchantSecret,
      });
      const expectedLarge = crypto
        .createHash('md5')
        .update(`${merchantId}VA-LARGE999999999.99LKR${crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase()}`)
        .digest('hex')
        .toUpperCase();
      expect(hashLarge).toBe(expectedLarge);
    });

    test('rejects negative, NaN, and invalid amounts with descriptive error', () => {
      expect(() => {
        generatePayHereHash({ merchantId, orderId: 'VA-NEG', amount: -0.01, currency: 'LKR', merchantSecret });
      }).toThrow('Amount must be a non-negative number');

      expect(() => {
        generatePayHereHash({ merchantId, orderId: 'VA-NAN', amount: 'not_a_number', currency: 'LKR', merchantSecret });
      }).toThrow('Amount must be a non-negative number');

      expect(() => {
        generatePayHereHash({ merchantId, orderId: 'VA-NULL', amount: null, currency: 'LKR', merchantSecret });
      }).toThrow('Missing required parameters');
    });

    test('tamper sensitivity: single character or bit flip in any field invalidates signature', () => {
      const basePayload = {
        merchant_id: '1211149',
        order_id: 'VA-20261105-001',
        payhere_amount: '14500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      const validSig = computeValidNotifySig(basePayload, merchantSecret);

      // Baseline verification
      expect(verifyPayHereSignature({ ...basePayload, md5sig: validSig }, merchantSecret)).toBe(true);

      // 1. Flip single char in merchant_id
      expect(
        verifyPayHereSignature({ ...basePayload, merchant_id: '1211148', md5sig: validSig }, merchantSecret)
      ).toBe(false);

      // 2. Flip single char in order_id
      expect(
        verifyPayHereSignature({ ...basePayload, order_id: 'VA-20261105-002', md5sig: validSig }, merchantSecret)
      ).toBe(false);

      // 3. Flip single char in payhere_amount
      expect(
        verifyPayHereSignature({ ...basePayload, payhere_amount: '14500.01', md5sig: validSig }, merchantSecret)
      ).toBe(false);

      // 4. Flip single char in payhere_currency
      expect(
        verifyPayHereSignature({ ...basePayload, payhere_currency: 'USD', md5sig: validSig }, merchantSecret)
      ).toBe(false);

      // 5. Flip status_code
      expect(
        verifyPayHereSignature({ ...basePayload, status_code: -1, md5sig: validSig }, merchantSecret)
      ).toBe(false);
      expect(
        verifyPayHereSignature({ ...basePayload, status_code: 0, md5sig: validSig }, merchantSecret)
      ).toBe(false);

      // 6. Flip single char in secret
      const tamperedSecret = merchantSecret + 'X';
      expect(
        verifyPayHereSignature({ ...basePayload, md5sig: validSig }, tamperedSecret)
      ).toBe(false);

      // 7. Flip single hex char in md5sig
      const flippedSig = (validSig[0] === 'A' ? 'B' : 'A') + validSig.slice(1);
      expect(
        verifyPayHereSignature({ ...basePayload, md5sig: flippedSig }, merchantSecret)
      ).toBe(false);
    });

    test('avalanche effect: 20 randomized single-bit changes all result in 100% signature rejection', () => {
      const basePayload = {
        merchant_id: '1211149',
        order_id: 'VA-AVALANCHE-TEST',
        payhere_amount: '28500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      const validSig = computeValidNotifySig(basePayload, merchantSecret);

      for (let i = 0; i < 20; i++) {
        const orderIdTampered = `VA-AVALANCHE-TEST-${i}`;
        const isValid = verifyPayHereSignature(
          { ...basePayload, order_id: orderIdTampered, md5sig: validSig },
          merchantSecret
        );
        expect(isValid).toBe(false);
      }
    });
  });

  // =========================================================================
  // SECTION 2: WEBHOOK CALLBACK IPN (POST /api/payments/payhere/notify)
  // =========================================================================
  describe('2. Webhook Callback IPN Adversarial Tests', () => {
    test('adversarially rejects spoofed, tampered, or missing signatures with HTTP 400', async () => {
      // Case A: Random junk signature
      const res1 = await request(app)
        .post('/api/payments/payhere/notify')
        .send({
          merchant_id: merchantId,
          order_id: 'VA-TEST-SPOOF',
          payment_id: '999999',
          payhere_amount: '1000.00',
          payhere_currency: 'LKR',
          status_code: 2,
          md5sig: 'DEADBEEF1234567890ABCDEF12345678',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.message).toContain('Invalid PayHere signature');

      // Case B: Missing signature field
      const res2 = await request(app)
        .post('/api/payments/payhere/notify')
        .send({
          merchant_id: merchantId,
          order_id: 'VA-TEST-SPOOF',
          payhere_amount: '1000.00',
          payhere_currency: 'LKR',
          status_code: 2,
        });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);

      // Case C: Empty request body
      const res3 = await request(app)
        .post('/api/payments/payhere/notify')
        .send({});
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);

      // Case D: Mismatched merchant ID signed with attacker merchant secret
      const attackerPayload = {
        merchant_id: '9999999', // Attacker merchant ID
        order_id: 'VA-TEST-SPOOF',
        payhere_amount: '1000.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      attackerPayload.md5sig = computeValidNotifySig(attackerPayload, 'attacker_secret');
      const res4 = await request(app)
        .post('/api/payments/payhere/notify')
        .send(attackerPayload);
      expect(res4.status).toBe(400);
      expect(res4.body.success).toBe(false);
    });

    test('gracefully handles non-existent order numbers with HTTP 404 without crashing', async () => {
      const payload = {
        merchant_id: merchantId,
        order_id: 'VA-NON-EXISTENT-ORDER-99999999',
        payment_id: '12345678',
        payhere_amount: '15000.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidNotifySig(payload);

      const res = await request(app)
        .post('/api/payments/payhere/notify')
        .send(payload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Order not found');
    });

    test('gracefully handles malformed / injection payloads without server crash', async () => {
      const injectionPayload = {
        merchant_id: merchantId,
        order_id: 'VA-SQL-INJECT--\' OR 1=1;--',
        payment_id: '12345678',
        payhere_amount: '15000.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      injectionPayload.md5sig = computeValidNotifySig(injectionPayload);

      const res = await request(app)
        .post('/api/payments/payhere/notify')
        .send(injectionPayload);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('status code 2 (paid): transitions order to paymentStatus paid and status processing', async () => {
      const order = await Order.create({
        orderNumber: `VA-STRESS-PAID-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            origin: testProduct1.origin,
            price: testProduct1.price,
            quantity: 2,
          },
        ],
        shippingAddress: {
          fullName: 'Adversarial Tester',
          street: '123 Galle Road',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: {
          subtotal: 57000.0,
          tax: 0.0,
          shipping: 0.0,
          grandTotal: 57000.0,
        },
        paymentMethod: 'payhere',
        paymentStatus: 'pending',
        status: 'pending',
      });

      const payload = {
        merchant_id: merchantId,
        order_id: order.orderNumber,
        payment_id: 'PH-TXN-SUCCESS-9988',
        payhere_amount: '57000.00',
        payhere_currency: 'LKR',
        status_code: 2,
        method: 'VISA',
        status_message: 'Payment received successfully',
      };
      payload.md5sig = computeValidNotifySig(payload);

      const res = await request(app)
        .post('/api/payments/payhere/notify')
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.paymentStatus).toBe('paid');

      const verifiedOrder = await Order.findById(order._id);
      expect(verifiedOrder.paymentStatus).toBe('paid');
      expect(verifiedOrder.status).toBe('processing');
      expect(verifiedOrder.gatewayTransactionId).toBe('PH-TXN-SUCCESS-9988');
      expect(verifiedOrder.payment.paidAt).toBeDefined();
      expect(verifiedOrder.paymentNotes).toContain('Paid via PayHere gateway');
    });

    test('status codes -1 and -2: transitions to paymentStatus failed, cancels order, and rolls back stock', async () => {
      const stock1Before = testProduct1.stock; // 50
      const stock2Before = testProduct2.stock; // 30

      // Simulate order placed with 3x product1 and 2x product2
      // In checkout flow, product stock was decremented
      await Product.findByIdAndUpdate(testProduct1._id, { $inc: { stock: -3 } });
      await Product.findByIdAndUpdate(testProduct2._id, { $inc: { stock: -2 } });

      const orderMinus1 = await Order.create({
        orderNumber: `VA-STRESS-FAIL-M1-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            price: testProduct1.price,
            quantity: 3,
          },
          {
            product: testProduct2._id,
            name: testProduct2.name,
            brand: testProduct2.brand,
            price: testProduct2.price,
            quantity: 2,
          },
        ],
        shippingAddress: {
          fullName: 'Test User',
          street: '123 Test St',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: { subtotal: 175500.0, tax: 0, shipping: 0, grandTotal: 175500.0 },
        paymentMethod: 'payhere',
        paymentStatus: 'pending',
        status: 'pending',
      });

      const payloadM1 = {
        merchant_id: merchantId,
        order_id: orderMinus1.orderNumber,
        payment_id: 'PH-TXN-CANCEL-M1',
        payhere_amount: '175500.00',
        payhere_currency: 'LKR',
        status_code: -1,
        status_message: 'User canceled payment on PayHere gateway',
      };
      payloadM1.md5sig = computeValidNotifySig(payloadM1);

      const resM1 = await request(app)
        .post('/api/payments/payhere/notify')
        .send(payloadM1);

      expect(resM1.status).toBe(200);
      expect(resM1.body.success).toBe(true);

      const verifiedOrderM1 = await Order.findById(orderMinus1._id);
      expect(verifiedOrderM1.paymentStatus).toBe('failed');
      expect(verifiedOrderM1.status).toBe('cancelled');

      // Verify stock was restored by +3 and +2
      const restoredP1 = await Product.findById(testProduct1._id);
      const restoredP2 = await Product.findById(testProduct2._id);
      expect(restoredP1.stock).toBe(stock1Before);
      expect(restoredP2.stock).toBe(stock2Before);

      // Repeat test for status_code -2 (Charged back / failed)
      await Product.findByIdAndUpdate(testProduct1._id, { $inc: { stock: -1 } });
      const orderMinus2 = await Order.create({
        orderNumber: `VA-STRESS-FAIL-M2-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            price: testProduct1.price,
            quantity: 1,
          },
        ],
        shippingAddress: {
          fullName: 'Test User',
          street: '123 Test St',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: { subtotal: 28500.0, tax: 0, shipping: 0, grandTotal: 28500.0 },
        paymentMethod: 'payhere',
        paymentStatus: 'pending',
        status: 'pending',
      });

      const payloadM2 = {
        merchant_id: merchantId,
        order_id: orderMinus2.orderNumber,
        payment_id: 'PH-TXN-FAIL-M2',
        payhere_amount: '28500.00',
        payhere_currency: 'LKR',
        status_code: -2,
        status_message: 'Card charge failed',
      };
      payloadM2.md5sig = computeValidNotifySig(payloadM2);

      const resM2 = await request(app)
        .post('/api/payments/payhere/notify')
        .send(payloadM2);

      expect(resM2.status).toBe(200);
      const verifiedOrderM2 = await Order.findById(orderMinus2._id);
      expect(verifiedOrderM2.paymentStatus).toBe('failed');
      expect(verifiedOrderM2.status).toBe('cancelled');

      const restoredP1AfterM2 = await Product.findById(testProduct1._id);
      expect(restoredP1AfterM2.stock).toBe(stock1Before);
    });

    test('idempotency / replay stress: duplicate status 2 does not corrupt state or re-process', async () => {
      const order = await Order.create({
        orderNumber: `VA-IDEM-PAID-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            price: testProduct1.price,
            quantity: 1,
          },
        ],
        shippingAddress: {
          fullName: 'Test User',
          street: '123 Test St',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: { subtotal: 28500.0, tax: 0, shipping: 0, grandTotal: 28500.0 },
        paymentMethod: 'payhere',
        paymentStatus: 'pending',
        status: 'pending',
      });

      const payload = {
        merchant_id: merchantId,
        order_id: order.orderNumber,
        payment_id: 'PH-IDEM-9911',
        payhere_amount: '28500.00',
        payhere_currency: 'LKR',
        status_code: 2,
      };
      payload.md5sig = computeValidNotifySig(payload);

      // Webhook 1
      const res1 = await request(app).post('/api/payments/payhere/notify').send(payload);
      expect(res1.status).toBe(200);
      expect(res1.body.paymentStatus).toBe('paid');

      // Webhook 2 (Replay / Duplicate notification)
      const res2 = await request(app).post('/api/payments/payhere/notify').send(payload);
      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('already marked as paid');

      // Verify database state remains stable
      const finalOrder = await Order.findById(order._id);
      expect(finalOrder.paymentStatus).toBe('paid');
      expect(finalOrder.status).toBe('processing');
    });

    test('CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback', async () => {
      // 1. Initial product stock: 50
      const baselineStock = testProduct1.stock; // 50
      const orderedQty = 2;

      // Simulate product stock decremented at checkout
      await Product.findByIdAndUpdate(testProduct1._id, { $inc: { stock: -orderedQty } }); // 48
      const stockAfterCheckout = (await Product.findById(testProduct1._id)).stock;
      expect(stockAfterCheckout).toBe(baselineStock - orderedQty); // 48

      // Create order with paymentStatus: 'pending'
      const order = await Order.create({
        orderNumber: `VA-DOUBLE-ROLLBACK-TEST-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            price: testProduct1.price,
            quantity: orderedQty,
          },
        ],
        shippingAddress: {
          fullName: 'Test User',
          street: '123 Test St',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: { subtotal: 57000.0, tax: 0, shipping: 0, grandTotal: 57000.0 },
        paymentMethod: 'payhere',
        paymentStatus: 'pending',
        status: 'pending',
      });

      const payload = {
        merchant_id: merchantId,
        order_id: order.orderNumber,
        payment_id: 'PH-CANCEL-REPLAY-101',
        payhere_amount: '57000.00',
        payhere_currency: 'LKR',
        status_code: -1,
        status_message: 'Payment canceled by user',
      };
      payload.md5sig = computeValidNotifySig(payload);

      // First webhook notification arrives
      const res1 = await request(app).post('/api/payments/payhere/notify').send(payload);
      expect(res1.status).toBe(200);

      // Verify stock restored back to baseline (48 + 2 = 50)
      const stockAfterFirstNotify = (await Product.findById(testProduct1._id)).stock;
      expect(stockAfterFirstNotify).toBe(baselineStock); // Exactly 50

      // Now simulate a DUPLICATE / RETRIED webhook notification with status -1
      // In real-world PayHere integration, gateways retry notifications when ACKs timeout,
      // or network proxies retransmit duplicate packets.
      const res2 = await request(app).post('/api/payments/payhere/notify').send(payload);
      expect(res2.status).toBe(200);

      // CRITICAL ASSERTION: The stock MUST NOT increase a second time!
      // If the stock increases to 52, double inventory rollback bug is empirically proven!
      const stockAfterReplay = (await Product.findById(testProduct1._id)).stock;
      expect(stockAfterReplay).toBe(baselineStock);
    });

    test('STALE WEBHOOK CHALLENGE: stale status -1 on an already paid order must NOT corrupt paid order or restore stock', async () => {
      const baselineStock = testProduct1.stock; // 50
      const orderedQty = 2;

      // Simulate product stock decremented at checkout
      await Product.findByIdAndUpdate(testProduct1._id, { $inc: { stock: -orderedQty } }); // 48

      // Order was already successfully paid
      const order = await Order.create({
        orderNumber: `VA-STALE-NOTIFY-${Date.now()}`,
        user: testUser._id,
        items: [
          {
            product: testProduct1._id,
            name: testProduct1.name,
            brand: testProduct1.brand,
            price: testProduct1.price,
            quantity: orderedQty,
          },
        ],
        shippingAddress: {
          fullName: 'Test User',
          street: '123 Test St',
          city: 'Colombo',
          state: 'Western',
          zip: '00300',
          country: 'Sri Lanka',
        },
        currency: 'LKR',
        pricing: { subtotal: 57000.0, tax: 0, shipping: 0, grandTotal: 57000.0 },
        paymentMethod: 'payhere',
        paymentStatus: 'paid', // Already paid!
        status: 'processing',
      });

      const stalePayload = {
        merchant_id: merchantId,
        order_id: order.orderNumber,
        payment_id: 'PH-STALE-CANCEL',
        payhere_amount: '57000.00',
        payhere_currency: 'LKR',
        status_code: -1,
        status_message: 'Stale delayed cancel notification',
      };
      stalePayload.md5sig = computeValidNotifySig(stalePayload);

      const res = await request(app).post('/api/payments/payhere/notify').send(stalePayload);

      // Check whether paid order was corrupted to cancelled/failed and stock falsely increased
      const finalOrder = await Order.findById(order._id);
      const finalStock = (await Product.findById(testProduct1._id)).stock;

      // An order that is already paid should NOT be downgraded to failed by a stale -1 notification
      expect(finalOrder.paymentStatus).toBe('paid');
      expect(finalStock).toBe(baselineStock - orderedQty);
    });
  });
});
