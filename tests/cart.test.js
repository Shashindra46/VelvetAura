/**
 * VelvetAura - Shopping Cart Integration Test Suite
 * 
 * Verifies cart management CRUD operations, user isolation, inventory stock limits,
 * and exact financial pricing calculations (subtotal, 8% tax, and $50 shipping threshold).
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const { calculatePricing } = require('../src/services/cartService');

describe('Shopping Cart & Pricing Engine (Integration Suite)', () => {
  let authToken;
  let user;
  let products = [];

  beforeEach(async () => {
    // 1. Create test user and obtain auth token
    user = await User.create({
      name: 'Test Cart Shopper',
      email: `cart_shopper_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
      address: {
        street: '14 Rue de Rivoli',
        city: 'Paris',
        state: 'Ile-de-France',
        zip: '75001',
        country: 'France',
      },
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: 'Password123!',
    });
    authToken = loginRes.body.token;

    // 2. Create test products
    products = await Product.insertMany([
      {
        name: 'French Hyaluronic Acid Serum',
        brand: 'La Roche-Posay',
        origin: 'France',
        category: 'skincare',
        price: 39.99,
        stock: 10,
        description: 'Anti-aging serum with pure hyaluronic acid.',
      },
      {
        name: 'Korean Snail Mucin Essence',
        brand: 'COSRX',
        origin: 'South Korea',
        category: 'skincare',
        price: 25.00,
        stock: 5,
        description: 'Hydrating snail essence.',
      },
      {
        name: 'Japanese Hair Mask',
        brand: 'Shiseido',
        origin: 'Japan',
        category: 'haircare',
        price: 18.50,
        stock: 0, // Out of stock product for boundary test
        description: 'Salon repair hair mask.',
      },
    ]);
  });

  describe('Pure Financial Calculation Engine (calculatePricing)', () => {
    test('should return all zeros for an empty line-item set', () => {
      const pricing = calculatePricing([]);
      expect(pricing.subtotal).toBe(0.0);
      expect(pricing.tax).toBe(0.0);
      expect(pricing.shipping).toBe(0.0);
      expect(pricing.grandTotal).toBe(0.0);
      expect(pricing.itemCount).toBe(0);
    });

    test('should apply $5.99 shipping when subtotal is strictly under $50.00', () => {
      // 1 unit @ $39.99
      const pricing = calculatePricing([{ price: 39.99, quantity: 1 }]);
      expect(pricing.subtotal).toBe(39.99);
      expect(pricing.tax).toBe(3.20); // 39.99 * 0.08 = 3.1992 -> 3.20
      expect(pricing.shipping).toBe(5.99);
      expect(pricing.grandTotal).toBe(49.18); // 39.99 + 3.20 + 5.99
      expect(pricing.itemCount).toBe(1);
    });

    test('should apply $0.00 free shipping when subtotal is $50.00 or greater', () => {
      // 2 units @ $39.99 = $79.98
      const pricing = calculatePricing([{ price: 39.99, quantity: 2 }]);
      expect(pricing.subtotal).toBe(79.98);
      expect(pricing.tax).toBe(6.40); // 79.98 * 0.08 = 6.3984 -> 6.40
      expect(pricing.shipping).toBe(0.0);
      expect(pricing.grandTotal).toBe(86.38);
      expect(pricing.itemCount).toBe(2);
    });

    test('should apply $0.00 free shipping at exact $50.00 boundary', () => {
      // 2 units @ $25.00 = $50.00
      const pricing = calculatePricing([{ price: 25.00, quantity: 2 }]);
      expect(pricing.subtotal).toBe(50.00);
      expect(pricing.tax).toBe(4.00);
      expect(pricing.shipping).toBe(0.0);
      expect(pricing.grandTotal).toBe(54.00);
    });
  });

  describe('GET /api/cart', () => {
    test('should reject cart retrieval when unauthenticated', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
    });

    test('should return empty cart for newly registered user', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.cart.items)).toBe(true);
      expect(res.body.cart.items).toHaveLength(0);
      expect(res.body.cart.subtotal).toBe(0);
      expect(res.body.cart.grandTotal).toBe(0);
    });
  });

  describe('POST /api/cart/items (Add to Cart)', () => {
    test('should add an item to the cart and recalculate totals', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: products[0]._id,
          quantity: 1,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      const cart = res.body.cart;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].product._id.toString()).toBe(products[0]._id.toString());
      expect(cart.items[0].quantity).toBe(1);
      expect(cart.subtotal).toBe(39.99);
      expect(cart.shipping).toBe(5.99); // < $50
    });

    test('should increment quantity when adding the same product again', async () => {
      // First addition
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });

      // Second addition
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 2 });

      expect(res.status).toBe(200);
      const cart = res.body.cart;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
      expect(cart.subtotal).toBe(Math.round(39.99 * 3 * 100) / 100);
      expect(cart.shipping).toBe(0.0); // > $50
    });

    test('should reject adding an out-of-stock product', async () => {
      const outOfStockProd = products[2]; // stock = 0
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: outOfStockProd._id, quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/out of stock/i);
    });

    test('should reject adding quantity exceeding available inventory', async () => {
      const limitedProd = products[1]; // stock = 5
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: limitedProd._id, quantity: 10 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/exceeds/i);
    });

    test('should reject invalid non-numeric or non-positive quantity', async () => {
      const res1 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 0 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: -2 });
      expect(res2.status).toBe(400);

      const res3 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 'two' });
      expect(res3.status).toBe(400);
    });
  });

  describe('PUT /api/cart/items/:productId (Update Quantity)', () => {
    beforeEach(async () => {
      // Add product to cart first
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });
    });

    test('should update item quantity and recalculate totals', async () => {
      const res = await request(app)
        .put(`/api/cart/items/${products[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 2 });

      expect(res.status).toBe(200);
      const cart = res.body.cart;
      expect(cart.items[0].quantity).toBe(2);
      expect(cart.subtotal).toBe(Math.round(39.99 * 2 * 100) / 100);
    });

    test('should remove item when quantity is updated to 0', async () => {
      const res = await request(app)
        .put(`/api/cart/items/${products[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 0 });

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(0);
      expect(res.body.cart.subtotal).toBe(0);
    });

    test('should reject updating to quantity exceeding available inventory', async () => {
      const res = await request(app)
        .put(`/api/cart/items/${products[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 999 });

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toMatch(/exceeds/i);
    });
  });

  describe('DELETE /api/cart/items/:productId (Remove Line Item)', () => {
    test('should remove line item from cart', async () => {
      // Add two items
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });

      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[1]._id, quantity: 1 });

      const res = await request(app)
        .delete(`/api/cart/items/${products[0]._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(1);
      expect(res.body.cart.items[0].product._id.toString()).toBe(products[1]._id.toString());
    });
  });

  describe('DELETE /api/cart (Clear Cart)', () => {
    test('should clear all items and reset all totals to zero', async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 2 });

      const res = await request(app)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.cart.items).toHaveLength(0);
      expect(res.body.cart.subtotal).toBe(0);
      expect(res.body.cart.grandTotal).toBe(0);
    });
  });
});
