/**
 * VelvetAura - Milestone 5: Admin Adversarial & Boundary Jest Test Suite
 * Executed by teamwork_challenger_m5_1
 * 
 * Comprehensive empirical tests covering:
 * 1. Security & RBAC Boundary Enforcement
 * 2. Product Management CRUD Boundary & Input Validation
 * 3. Order Status Boundary & Enum Verification
 * 4. High-Concurrency & Race Condition Verification
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

describe('Milestone 5 Adversarial & Empirical Stress Probes', () => {
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;
  let sampleProduct;
  let sampleOrder;

  beforeEach(async () => {
    // 1. Create genuine admin user
    adminUser = await User.create({
      name: 'Adversarial Admin',
      email: 'admin.adv@velvetaura.luxury',
      password: 'AdminPassword123!',
      role: 'admin',
    });

    // 2. Create genuine customer user
    customerUser = await User.create({
      name: 'Adversarial Customer',
      email: 'customer.adv@velvetaura.luxury',
      password: 'CustomerPassword123!',
      role: 'customer',
    });

    // 3. Obtain genuine tokens via auth endpoints
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin.adv@velvetaura.luxury', password: 'AdminPassword123!' });
    adminToken = adminLogin.body.token;

    const customerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'customer.adv@velvetaura.luxury', password: 'CustomerPassword123!' });
    customerToken = customerLogin.body.token;

    // 4. Create sample product
    sampleProduct = await Product.create({
      name: 'Orchidée Impériale Cream',
      brand: 'Guerlain',
      origin: 'France',
      category: 'skincare',
      description: 'Exceptional complete care cream targeting all signs of aging.',
      price: 490.0,
      stock: 20,
      featured: true,
    });

    // 5. Create sample order
    sampleOrder = await Order.create({
      orderNumber: `VA-ADV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user: customerUser._id,
      items: [
        {
          product: sampleProduct._id,
          name: sampleProduct.name,
          brand: sampleProduct.brand,
          origin: sampleProduct.origin,
          price: sampleProduct.price,
          quantity: 1,
          image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
        },
      ],
      shippingAddress: {
        fullName: 'Adversarial Customer',
        street: '68 Avenue des Champs-Élysées',
        city: 'Paris',
        state: 'Ile-de-France',
        zip: '75008',
        country: 'France',
      },
      pricing: {
        subtotal: 490.0,
        tax: 39.2,
        shipping: 0.0,
        grandTotal: 529.2,
      },
      payment: {
        transactionId: `mock_adv_tx_${Date.now()}`,
        method: 'mock_credit_card',
        status: 'succeeded',
        cardLast4: '4242',
      },
      status: 'pending',
    });
  });

  // =========================================================================
  // 1. Security & RBAC Boundary Testing
  // =========================================================================
  describe('1. Security & RBAC Boundary Testing', () => {
    test('Missing Authorization header on all admin endpoints returns 401 Unauthorized', async () => {
      const endpoints = [
        request(app).post('/api/products').send({ name: 'Hack Item' }),
        request(app).put(`/api/products/${sampleProduct._id}`).send({ price: 10 }),
        request(app).delete(`/api/products/${sampleProduct._id}`),
        request(app).get('/api/orders'),
        request(app).put(`/api/orders/${sampleOrder._id}/status`).send({ status: 'shipped' }),
      ];

      for (const reqPromise of endpoints) {
        const res = await reqPromise;
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/not authorized/i);
      }
    });

    test('Malformed and corrupted Bearer tokens return 401 Unauthorized', async () => {
      const malformedHeaders = [
        'Bearer ',
        'Bearer not-a-jwt',
        `Bearer ${adminToken.slice(0, -8)}invalid`,
        'Basic dXNlcjpwYXNz',
        'Token some-token',
      ];

      for (const header of malformedHeaders) {
        const res = await request(app)
          .get('/api/orders')
          .set('Authorization', header);
        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    });

    test('Regular customer token accessing admin endpoints returns 403 Forbidden with exact payload', async () => {
      const exactPayload = {
        success: false,
        message: 'Access denied: Administrator privileges required',
        error: 'Forbidden',
      };

      const adminCalls = [
        request(app).post('/api/products').set('Authorization', `Bearer ${customerToken}`).send({ name: 'Denied Product' }),
        request(app).put(`/api/products/${sampleProduct._id}`).set('Authorization', `Bearer ${customerToken}`).send({ price: 20 }),
        request(app).delete(`/api/products/${sampleProduct._id}`).set('Authorization', `Bearer ${customerToken}`),
        request(app).get('/api/orders').set('Authorization', `Bearer ${customerToken}`),
        request(app).put(`/api/orders/${sampleOrder._id}/status`).set('Authorization', `Bearer ${customerToken}`).send({ status: 'shipped' }),
      ];

      for (const reqPromise of adminCalls) {
        const res = await reqPromise;
        expect(res.status).toBe(403);
        expect(res.body.success).toBe(exactPayload.success);
        expect(res.body.message).toBe(exactPayload.message);
        expect(res.body.error).toBe(exactPayload.error);
      }
    });

    test('Tampered role claim in JWT signature mismatch returns 401 Unauthorized', async () => {
      const decoded = jwt.decode(customerToken, { complete: true });
      const tamperedPayload = { ...decoded.payload, role: 'admin' };
      const tamperedB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
      const tamperedToken = `${decoded.header}.${tamperedB64}.${decoded.signature}`;

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${tamperedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Rogue secret signed token returns 401 Unauthorized', async () => {
      const rogueToken = jwt.sign(
        { id: customerUser._id.toString(), role: 'admin' },
        'rogue_fake_secret_key'
      );

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${rogueToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Token claiming role:admin but referencing DB customer returns 403 Forbidden', async () => {
      const spoofedToken = jwt.sign(
        { id: customerUser._id.toString(), role: 'admin' },
        process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure'
      );

      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${spoofedToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. Product CRUD Boundary Testing
  // =========================================================================
  describe('2. Product CRUD Boundary Testing', () => {
    const validProductData = {
      name: 'La Crème Sublime',
      brand: 'Dior Prestige',
      origin: 'France',
      category: 'skincare',
      description: 'Regenerating and perfecting light cream enriched with Rose de Granville.',
      price: 430.0,
      stock: 15,
    };

    test('Negative prices (-10, -0.01) and non-numeric prices return 400 Bad Request', async () => {
      // Negative price on create
      const negRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, price: -10 });
      expect(negRes.status).toBe(400);

      // Negative price on update
      const negUpdateRes = await request(app)
        .put(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: -0.01 });
      expect(negUpdateRes.status).toBe(400);

      // Non-numeric price
      const strPriceRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, price: 'luxury' });
      expect(strPriceRes.status).toBe(400);
    });

    test('Zero price ($0.00) is handled as valid non-negative price', async () => {
      const zeroRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'Complimentary Discovery Serum', price: 0 });

      expect(zeroRes.status).toBe(201);
      expect(zeroRes.body.product.price).toBe(0);
    });

    test('Negative stock (-5) returns 400, float stock (3.5) is floored', async () => {
      // Negative stock on create
      const negStockRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, stock: -5 });
      expect(negStockRes.status).toBe(400);

      // Negative stock on update
      const negStockUpdateRes = await request(app)
        .put(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: -2 });
      expect(negStockUpdateRes.status).toBe(400);

      // Float stock on create floored to integer
      const floatStockRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'Float Stock Oil', stock: 3.5 });
      expect(floatStockRes.status).toBe(201);
      expect(floatStockRes.body.product.stock).toBe(3);

      // Float stock on update floored
      const floatUpdateRes = await request(app)
        .put(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ stock: 8.9 });
      expect(floatUpdateRes.status).toBe(200);
      expect(floatUpdateRes.body.product.stock).toBe(8);
    });

    test('Empty names, single-character names (< 2 chars), and overly long names (> 150 chars) return 400', async () => {
      // Empty name
      const emptyRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: '' });
      expect(emptyRes.status).toBe(400);

      // Single-character name
      const singleRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'A' });
      expect(singleRes.status).toBe(400);

      // Single-character on update
      const singleUpdateRes = await request(app)
        .put(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Z' });
      expect(singleUpdateRes.status).toBe(400);

      // Overly long name (151 chars)
      const longNameRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'X'.repeat(151) });
      expect(longNameRes.status).toBe(400);

      // Overly long on update
      const longUpdateRes = await request(app)
        .put(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Y'.repeat(155) });
      expect(longUpdateRes.status).toBe(400);

      // Valid boundary 2 characters
      const boundary2Res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'No' });
      expect(boundary2Res.status).toBe(201);

      // Valid boundary 150 characters
      const boundary150Res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'W'.repeat(150) });
      expect(boundary150Res.status).toBe(201);
    });

    test('Invalid categories return 400, valid categories succeed and normalize case', async () => {
      const invalidCategories = ['apparel', 'electronics', 'food', ''];
      for (const inv of invalidCategories) {
        const res = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...validProductData, category: inv });
        expect(res.status).toBe(400);
      }

      // Valid categories
      const validCategories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
      for (const cat of validCategories) {
        const res = await request(app)
          .post('/api/products')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ ...validProductData, name: `Valid Item ${cat}`, category: cat });
        expect(res.status).toBe(201);
        expect(res.body.product.category).toBe(cat);
      }

      // Case normalization
      const caseRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...validProductData, name: 'Case Normalized Item', category: 'FRAGRANCES' });
      expect(caseRes.status).toBe(201);
      expect(caseRes.body.product.category).toBe('fragrances');
    });

    test('Non-existent ObjectIds return 404, invalid hex IDs return 400', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();

      // PUT 404
      const put404 = await request(app)
        .put(`/api/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 });
      expect(put404.status).toBe(404);

      // DELETE 404
      const del404 = await request(app)
        .delete(`/api/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del404.status).toBe(404);

      // PUT 400 (invalid hex)
      const put400 = await request(app)
        .put('/api/products/invalid-hex-id-999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 });
      expect(put400.status).toBe(400);

      // DELETE 400 (invalid hex)
      const del400 = await request(app)
        .delete('/api/products/invalid-hex-id-999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(del400.status).toBe(400);
    });

    test('Deleting already deleted product returns 404', async () => {
      // First delete returns 200
      const firstDel = await request(app)
        .delete(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(firstDel.status).toBe(200);

      // Second delete returns 404
      const secondDel = await request(app)
        .delete(`/api/products/${sampleProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(secondDel.status).toBe(404);
    });
  });

  // =========================================================================
  // 3. Order Status Boundary Testing
  // =========================================================================
  describe('3. Order Status Boundary Testing', () => {
    test('Invalid status strings return 400 Bad Request', async () => {
      const invalidStatuses = ['refunded', 'unknown', '', 123, null, 'INVALID_STATUS'];
      for (const inv of invalidStatuses) {
        const res = await request(app)
          .put(`/api/orders/${sampleOrder._id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: inv });
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });

    test('All 7 valid status strings return 200 OK and persist', async () => {
      const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];
      for (const st of validStatuses) {
        const res = await request(app)
          .put(`/api/orders/${sampleOrder._id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: st });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.order.status).toBe(st);

        const dbOrder = await Order.findById(sampleOrder._id);
        expect(dbOrder.status).toBe(st);
      }
    });

    test('Non-existent order IDs return 404, invalid hex IDs return 400', async () => {
      const nonExistentOrderId = new mongoose.Types.ObjectId();
      const res404 = await request(app)
        .put(`/api/orders/${nonExistentOrderId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res404.status).toBe(404);

      const res400 = await request(app)
        .put('/api/orders/malformed-hex-order-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(res400.status).toBe(400);
    });
  });

  // =========================================================================
  // 4. High Concurrency & Race Conditions
  // =========================================================================
  describe('4. High Concurrency & Race Conditions', () => {
    test('Rapid concurrent product updates resolve cleanly without data corruption', async () => {
      const concurrentUpdates = [];
      for (let i = 1; i <= 15; i++) {
        concurrentUpdates.push(
          request(app)
            .put(`/api/products/${sampleProduct._id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ price: 400 + i, stock: 10 + i })
        );
      }

      const results = await Promise.all(concurrentUpdates);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const dbProduct = await Product.findById(sampleProduct._id);
      expect(dbProduct.price).toBeGreaterThanOrEqual(401);
      expect(dbProduct.price).toBeLessThanOrEqual(415);
      expect(dbProduct.stock).toBeGreaterThanOrEqual(11);
      expect(dbProduct.stock).toBeLessThanOrEqual(25);
    });

    test('Rapid concurrent order status updates resolve cleanly without deadlock', async () => {
      const allowedCycle = ['confirmed', 'processing', 'shipped', 'delivered'];
      const concurrentOrderUpdates = [];
      for (let i = 0; i < 12; i++) {
        const chosen = allowedCycle[i % allowedCycle.length];
        concurrentOrderUpdates.push(
          request(app)
            .put(`/api/orders/${sampleOrder._id}/status`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ status: chosen })
        );
      }

      const results = await Promise.all(concurrentOrderUpdates);
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      const dbOrder = await Order.findById(sampleOrder._id);
      expect(allowedCycle).toContain(dbOrder.status);
    });
  });
});
