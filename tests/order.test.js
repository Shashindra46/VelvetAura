/**
 * VelvetAura - Order Management & Payment Processing Integration Test Suite
 * 
 * Verifies checkout pipeline, atomic inventory decrement with compensation rollback,
 * mock payment authorization (successes, declines, expirations), order history,
 * and order detail authorization guards.
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Cart = require('../src/models/Cart');
const { processPayment } = require('../src/services/paymentService');

describe('Order Management & Payment Processing (Integration Suite)', () => {
  let authToken;
  let user;
  let products = [];

  const validPayment = {
    cardNumber: '4242424242424242',
    expDate: '12/28',
    cvv: '123',
    cardHolder: 'Camille Dupont',
  };

  const declinedPayment = {
    cardNumber: '4000000000000002', // Card ending in 0002 triggers decline
    expDate: '12/28',
    cvv: '123',
    cardHolder: 'Declined Customer',
  };

  const validAddress = {
    street: '14 Rue de Rivoli',
    city: 'Paris',
    state: 'Ile-de-France',
    zip: '75001',
    country: 'France',
  };

  beforeEach(async () => {
    // 1. Create test user and obtain auth token
    user = await User.create({
      name: 'Order Test Customer',
      email: `order_customer_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
      address: validAddress,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: user.email,
      password: 'Password123!',
    });
    authToken = loginRes.body.token;

    // 2. Create test products
    products = await Product.insertMany([
      {
        name: 'Sulwhasoo First Care Activating Serum',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        price: 89.00,
        stock: 10,
        description: 'Luxury Korean post-cleanse serum.',
      },
      {
        name: 'Byredo Gypsy Water Eau de Parfum',
        brand: 'Byredo',
        origin: 'Sweden',
        category: 'fragrances',
        price: 290.00,
        stock: 5,
        description: 'Cult woody aromatic fragrance.',
      },
    ]);
  });

  describe('Mock Payment Engine (paymentService.processPayment)', () => {
    test('should authorize valid credit card and generate TXN-VA transaction receipt', async () => {
      const result = await processPayment(150.00, validPayment);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.status).toBe('succeeded');
      expect(result.transactionId).toMatch(/^TXN-VA-\d+-\d+$/);
      expect(result.cardBrand).toBe('Visa');
      expect(result.cardLast4).toBe('4242');
      expect(result.amount).toBe(150.00);
    });

    test('should simulate deterministic card decline for cards ending in 0002', async () => {
      const result = await processPayment(100.00, declinedPayment);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(402);
      expect(result.code).toBe('CARD_DECLINED');
      expect(result.error).toMatch(/declined/i);
    });

    test('should reject expired credit card with HTTP 402', async () => {
      const expiredCard = {
        cardNumber: '4242424242424242',
        expDate: '01/20', // past date
        cvv: '123',
      };
      const result = await processPayment(50.00, expiredCard);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(402);
      expect(result.code).toBe('EXPIRED_CARD');
      expect(result.error).toMatch(/expired/i);
    });

    test('should reject invalid CVV code with HTTP 400', async () => {
      const badCvv = {
        cardNumber: '4242424242424242',
        expDate: '12/28',
        cvv: '000', // Standard decline CVV
      };
      const result = await processPayment(50.00, badCvv);

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('INVALID_CVV');
    });

    test('should reject non-positive transaction amounts', async () => {
      const result = await processPayment(0, validPayment);
      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.code).toBe('INVALID_AMOUNT');
    });
  });

  describe('POST /api/orders/checkout (Order Creation & Pipeline)', () => {
    test('should complete checkout, decrement stock, and clear cart for valid order', async () => {
      const targetProduct = products[0];
      const initialStock = targetProduct.stock;
      const orderQty = 2;

      // 1. Add item to user cart
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: targetProduct._id, quantity: orderQty });

      // 2. Submit checkout
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validPayment,
        });

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body.order).toBeDefined();
      expect(res.body.transactionId).toBeDefined();

      const order = res.body.order;
      expect(order.orderNumber).toMatch(/^VA-\d+-\d+$/);
      expect(order.status).toBe('completed');
      expect(order.items).toHaveLength(1);
      expect(order.items[0].product.toString()).toBe(targetProduct._id.toString());
      expect(order.items[0].quantity).toBe(orderQty);
      expect(order.payment.transactionId).toBe(res.body.transactionId);

      // 3. Verify active cart was cleared
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);
      expect(cartRes.body.cart.items).toHaveLength(0);
      expect(cartRes.body.cart.subtotal).toBe(0);

      // 4. Verify catalog product stock was decremented
      const updatedProduct = await Product.findById(targetProduct._id);
      expect(updatedProduct.stock).toBe(initialStock - orderQty);
    });

    test('should reject checkout when cart is empty', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validPayment,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/empty/i);
    });

    test('should reject checkout when shipping address is incomplete', async () => {
      // Add item to cart first
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: { street: '', city: 'Paris' }, // Missing state, zip, country
          paymentDetails: validPayment,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/address/i);
    });

    test('should rollback inventory stock decrement when payment is declined', async () => {
      const targetProduct = products[1];
      const initialStock = targetProduct.stock;

      // Add item to cart
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: targetProduct._id, quantity: 2 });

      // Checkout with declined payment card
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: declinedPayment,
        });

      expect([400, 402]).toContain(res.status);
      expect(res.body.success).toBe(false);

      // Verify stock was ROLLED BACK to initial stock
      const checkedProduct = await Product.findById(targetProduct._id);
      expect(checkedProduct.stock).toBe(initialStock);

      // Verify cart remains intact for customer to retry payment
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);
      expect(cartRes.body.cart.items).toHaveLength(1);
    });
  });

  describe('GET /api/orders/my-orders (Order History)', () => {
    test('should retrieve order history for authenticated customer', async () => {
      // Create an order first
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });

      await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validPayment,
        });

      const res = await request(app)
        .get('/api/orders/my-orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBe(1);
      expect(res.body.orders[0].items).toHaveLength(1);
    });

    test('should ensure strict user isolation in order history', async () => {
      // Register Second User
      const user2 = await User.create({
        name: 'Second Customer',
        email: 'second_customer@velvetaura.test',
        password: 'Password123!',
      });
      const login2 = await request(app).post('/api/auth/login').send({
        email: user2.email,
        password: 'Password123!',
      });
      const token2 = login2.body.token;

      // User 2 checks my-orders -> should have 0 orders
      const res = await request(app)
        .get('/api/orders/my-orders')
        .set('Authorization', `Bearer ${token2}`);

      expect(res.status).toBe(200);
      expect(res.body.orders).toHaveLength(0);
    });
  });

  describe('GET /api/orders/:id (Order Detail & Authorization)', () => {
    let createdOrderId;

    beforeEach(async () => {
      // Create an order for primary user
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: products[0]._id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validPayment,
        });

      createdOrderId = checkoutRes.body.order._id;
    });

    test('should allow owner to view order details', async () => {
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order._id.toString()).toBe(createdOrderId.toString());
      expect(res.body.order.shippingAddress.city).toBe('Paris');
    });

    test('should return 403 Forbidden when another user attempts to view the order', async () => {
      const otherUser = await User.create({
        name: 'Unauthorized User',
        email: 'unauth_user@velvetaura.test',
        password: 'Password123!',
      });
      const otherLogin = await request(app).post('/api/auth/login').send({
        email: otherUser.email,
        password: 'Password123!',
      });

      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${otherLogin.body.token}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/authorized|forbidden/i);
    });

    test('should return 404 for non-existent valid ObjectId', async () => {
      const nonExistentId = '654321654321654321654321';
      const res = await request(app)
        .get(`/api/orders/${nonExistentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
