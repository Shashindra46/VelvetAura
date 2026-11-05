/**
 * VelvetAura - PayHere Webhook (IPN / Notify) Integration Test Suite
 * 
 * Verifies server-to-server callback processing, signature validation,
 * order state mutation, inventory rollback on failed payments, and idempotency.
 */

const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const Order = require('../../src/models/Order');
const Product = require('../../src/models/Product');
const User = require('../../src/models/User');

describe('PayHere Webhook / Notify Endpoint (Integration Suite)', () => {
  const merchantId = '1211149';
  const merchantSecret = '4Mm8k8abc12345xyzSecretToken';
  let testUser;
  let testProduct;

  beforeAll(() => {
    process.env.PAYHERE_MERCHANT_ID = merchantId;
    process.env.PAYHERE_MERCHANT_SECRET = merchantSecret;
  });

  beforeEach(async () => {
    testUser = await User.create({
      name: 'Kasun Perera',
      email: `kasun_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
    });

    testProduct = await Product.create({
      name: 'Sulwhasoo Activating Serum',
      brand: 'Sulwhasoo',
      origin: 'South Korea',
      category: 'skincare',
      price: 15000.0,
      stock: 20,
      description: 'Luxury Korean activating serum.',
    });
  });

  function generateSignature({
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    secret = merchantSecret,
  }) {
    const hashedSecret = crypto
      .createHash('md5')
      .update(secret)
      .digest('hex')
      .toUpperCase();
    const raw = `${merchant_id}${order_id}${payhere_amount}${payhere_currency}${status_code}${hashedSecret}`;
    return crypto.createHash('md5').update(raw).digest('hex').toUpperCase();
  }

  test('POST /api/payments/payhere/notify with status_code 2 marks order as paid', async () => {
    const order = await Order.create({
      orderNumber: `VA-PAYHERE-${Date.now()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          name: testProduct.name,
          brand: testProduct.brand,
          origin: testProduct.origin,
          price: testProduct.price,
          quantity: 1,
        },
      ],
      shippingAddress: {
        fullName: 'Kasun Perera',
        street: 'No. 45, Galle Road',
        city: 'Colombo',
        state: 'Western Province',
        zip: '00300',
        country: 'Sri Lanka',
      },
      currency: 'LKR',
      pricing: {
        subtotal: 15000.0,
        tax: 1200.0,
        shipping: 0.0,
        grandTotal: 16200.0,
      },
      paymentMethod: 'payhere',
      paymentStatus: 'pending',
      status: 'pending',
    });

    const payload = {
      merchant_id: merchantId,
      order_id: order.orderNumber,
      payment_id: '320025112233',
      payhere_amount: '16200.00',
      payhere_currency: 'LKR',
      status_code: 2,
      method: 'VISA',
      status_message: 'Successfully completed',
    };
    payload.md5sig = generateSignature(payload);

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('paid');
    expect(updatedOrder.status).toBe('processing');
    expect(updatedOrder.gatewayTransactionId).toBe('320025112233');
    expect(updatedOrder.payment.paidAt).toBeDefined();
    expect(updatedOrder.payment.status).toBe('paid');
  });

  test('POST /api/payments/payhere/notify with status_code 0 leaves order pending', async () => {
    const order = await Order.create({
      orderNumber: `VA-PENDING-${Date.now()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          name: testProduct.name,
          brand: testProduct.brand,
          price: testProduct.price,
          quantity: 1,
        },
      ],
      shippingAddress: {
        street: '14 Rue de Rivoli',
        city: 'Paris',
        state: 'IDF',
        zip: '75001',
        country: 'France',
      },
      pricing: {
        subtotal: 15000.0,
        tax: 1200.0,
        shipping: 0.0,
        grandTotal: 16200.0,
      },
      paymentMethod: 'payhere',
      paymentStatus: 'pending',
      status: 'pending',
    });

    const payload = {
      merchant_id: merchantId,
      order_id: order.orderNumber,
      payment_id: '320025112234',
      payhere_amount: '16200.00',
      payhere_currency: 'LKR',
      status_code: 0,
    };
    payload.md5sig = generateSignature(payload);

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(200);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('pending');
    expect(updatedOrder.status).toBe('pending');
  });

  test('POST /api/payments/payhere/notify with status_code -1 marks order failed and restores stock', async () => {
    const initialStock = testProduct.stock;

    const order = await Order.create({
      orderNumber: `VA-FAIL-${Date.now()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          name: testProduct.name,
          brand: testProduct.brand,
          price: testProduct.price,
          quantity: 2,
        },
      ],
      shippingAddress: {
        street: '14 Rue de Rivoli',
        city: 'Paris',
        state: 'IDF',
        zip: '75001',
        country: 'France',
      },
      pricing: {
        subtotal: 30000.0,
        tax: 2400.0,
        shipping: 0.0,
        grandTotal: 32400.0,
      },
      paymentMethod: 'payhere',
      paymentStatus: 'pending',
      status: 'pending',
    });

    const payload = {
      merchant_id: merchantId,
      order_id: order.orderNumber,
      payment_id: '320025112235',
      payhere_amount: '32400.00',
      payhere_currency: 'LKR',
      status_code: -1,
      status_message: 'Canceled by customer',
    };
    payload.md5sig = generateSignature(payload);

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(200);

    const updatedOrder = await Order.findById(order._id);
    expect(updatedOrder.paymentStatus).toBe('failed');
    expect(updatedOrder.status).toBe('cancelled');

    // Verify stock rollback: +2 quantity restored
    const updatedProduct = await Product.findById(testProduct._id);
    expect(updatedProduct.stock).toBe(initialStock + 2);
  });

  test('rejects tampered signature with HTTP 400', async () => {
    const payload = {
      merchant_id: merchantId,
      order_id: 'VA-TEST-TAMPER',
      payment_id: '320025112236',
      payhere_amount: '1000.00',
      payhere_currency: 'LKR',
      status_code: 2,
      md5sig: 'INVALID_SIGNATURE_TAMPERED',
    };

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Invalid PayHere signature');
  });

  test('returns HTTP 404 for non-existent order number', async () => {
    const payload = {
      merchant_id: merchantId,
      order_id: 'VA-DOES-NOT-EXIST-99999',
      payment_id: '320025112237',
      payhere_amount: '5000.00',
      payhere_currency: 'LKR',
      status_code: 2,
    };
    payload.md5sig = generateSignature(payload);

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('Order not found');
  });

  test('idempotency guard: duplicate status 2 webhook acknowledges without redundant mutations', async () => {
    const order = await Order.create({
      orderNumber: `VA-IDEM-${Date.now()}`,
      user: testUser._id,
      items: [
        {
          product: testProduct._id,
          name: testProduct.name,
          brand: testProduct.brand,
          price: testProduct.price,
          quantity: 1,
        },
      ],
      shippingAddress: {
        street: '14 Rue de Rivoli',
        city: 'Paris',
        state: 'IDF',
        zip: '75001',
        country: 'France',
      },
      pricing: {
        subtotal: 15000.0,
        tax: 1200.0,
        shipping: 0.0,
        grandTotal: 16200.0,
      },
      paymentMethod: 'payhere',
      paymentStatus: 'paid', // Already paid
      status: 'processing',
    });

    const payload = {
      merchant_id: merchantId,
      order_id: order.orderNumber,
      payment_id: '320025112238',
      payhere_amount: '16200.00',
      payhere_currency: 'LKR',
      status_code: 2,
    };
    payload.md5sig = generateSignature(payload);

    const res = await request(app)
      .post('/api/payments/payhere/notify')
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('already marked as paid');
  });

  test('GET /api/payments/payhere/config returns public gateway config', async () => {
    const res = await request(app).get('/api/payments/payhere/config');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.merchantId).toBe(merchantId);
    expect(res.body.data.currency).toBe('LKR');
    expect(res.body.data.checkoutUrl).toBeDefined();
  });
});
