/**
 * VelvetAura - Adversarial Checkout, Payment & Currency Filter Challenge Harness
 * 
 * Specifically probes:
 * 1. Checkout flows: COD vs Direct Bank Transfer with bank confirmation requirement.
 * 2. Catalog pricing filters ('Under Rs. 50', 'Rs. 50 – Rs. 100', 'Rs. 100 – Rs. 250', 'Rs. 250+')
 *    ensuring that each returns non-empty result sets and correct bounded prices.
 * 3. Static asset integrity for admin product form (LKR) and hero banner copy (Over Rs. 50.00).
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const Order = require('../src/models/Order');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const seedProducts = require('../src/data/seedProducts');

describe('Adversarial Checkout, Payment & Currency Filter Challenge', () => {
  let customerUser;
  let customerToken;
  let sampleProductCheap;   // < 50
  let sampleProductMid1;    // 50 - 100
  let sampleProductMid2;    // 100 - 250
  let sampleProductLuxury;  // > 250

  beforeEach(async () => {
    // Ensure all 24 seed products are loaded so all price ranges have items in every test
    await Product.deleteMany({});
    await Product.insertMany(seedProducts);

    customerUser = await User.create({
      name: 'Adversarial Shopper',
      email: `adv_shopper_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'StrongPassword123!',
      role: 'customer',
      address: {
        street: '77 Galle Face Terrace',
        city: 'Colombo',
        state: 'Western Province',
        zip: '00300',
        country: 'Sri Lanka',
      },
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: customerUser.email,
      password: 'StrongPassword123!',
    });
    customerToken = loginRes.body.token;

    sampleProductCheap = await Product.findOne({ price: { $lt: 50 } });
    sampleProductMid1 = await Product.findOne({ price: { $gte: 50, $lte: 100 } });
    sampleProductMid2 = await Product.findOne({ price: { $gt: 100, $lte: 250 } });
    sampleProductLuxury = await Product.findOne({ price: { $gt: 250 } });
  });

  const validAddress = {
    fullName: 'Adversarial Shopper',
    street: '77 Galle Face Terrace',
    city: 'Colombo',
    state: 'Western Province',
    zip: '00300',
    country: 'Sri Lanka',
    phone: '+94770000000',
  };

  // =========================================================================
  // 1. CHECKOUT FLOWS: COD VS DIRECT BANK TRANSFER
  // =========================================================================
  describe('1. Checkout Payment Modes & Confirmation Enforcement', () => {
    test('COD flow: succeeds, records pending paymentStatus, decrements stock, and empties cart', async () => {
      expect(sampleProductCheap).toBeDefined();
      const initialStock = sampleProductCheap.stock;

      // Add to cart
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: sampleProductCheap._id, quantity: 2 });

      // Checkout with COD
      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validAddress,
          paymentMethod: 'cod',
        });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.success).toBe(true);

      const order = checkoutRes.body.order;
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('cod');
      expect(order.paymentStatus).toBe('pending');
      expect(order.status).toBe('pending');

      // Verify cart is empty
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cartRes.body.cart.items.length).toBe(0);

      // Verify stock was decremented by 2
      const updatedProduct = await Product.findById(sampleProductCheap._id);
      expect(updatedProduct.stock).toBe(initialStock - 2);
    });

    test('Bank Transfer flow: REJECTS with 400 when bankTransferConfirmed is false', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: sampleProductMid1._id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validAddress,
          paymentMethod: 'bank_transfer',
          bankTransferConfirmed: false,
        });

      expect(checkoutRes.status).toBe(400);
      expect(checkoutRes.body.success).toBe(false);
      expect(checkoutRes.body.message).toMatch(/confirmation of bank transfer is required/i);
    });

    test('Bank Transfer flow: REJECTS with 400 when bankTransferConfirmed is omitted/undefined', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: sampleProductMid1._id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validAddress,
          paymentMethod: 'bank_transfer',
        });

      expect(checkoutRes.status).toBe(400);
      expect(checkoutRes.body.success).toBe(false);
      expect(checkoutRes.body.message).toMatch(/confirmation of bank transfer is required/i);
    });

    test('Bank Transfer flow: SUCCEEDS when bankTransferConfirmed is true', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: sampleProductMid1._id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validAddress,
          paymentMethod: 'bank_transfer',
          bankTransferConfirmed: true,
          paymentNotes: 'Sent via Commercial Bank mobile app ref #88219',
        });

      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.success).toBe(true);

      const order = checkoutRes.body.order;
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('bank_transfer');
      expect(order.paymentStatus).toBe('pending');
      expect(order.paymentNotes).toContain('#88219');
    });

    test('Invalid paymentMethod: REJECTS with 400', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: sampleProductMid1._id, quantity: 1 });

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validAddress,
          paymentMethod: 'bitcoin',
        });

      expect(checkoutRes.status).toBe(400);
      expect(checkoutRes.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 2. CATALOG PRICING FILTERS
  // =========================================================================
  describe('2. Catalog Pricing Filters Across Real Seed Products', () => {
    test('Under Rs. 50 (minPrice=0, maxPrice=50) returns products and none exceed Rs. 50', async () => {
      const res = await request(app).get('/api/products?minPrice=0&maxPrice=50');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const products = res.body.products || res.body.data?.products;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.price).toBeLessThanOrEqual(50);
        expect(p.price).toBeGreaterThanOrEqual(0);
        expect(p.currency).toBe('LKR');
      }
    });

    test('Rs. 50 – Rs. 100 (minPrice=50, maxPrice=100) returns products within bounds', async () => {
      const res = await request(app).get('/api/products?minPrice=50&maxPrice=100');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const products = res.body.products || res.body.data?.products;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.price).toBeGreaterThanOrEqual(50);
        expect(p.price).toBeLessThanOrEqual(100);
      }
    });

    test('Rs. 100 – Rs. 250 (minPrice=100, maxPrice=250) returns products within bounds', async () => {
      const res = await request(app).get('/api/products?minPrice=100&maxPrice=250');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const products = res.body.products || res.body.data?.products;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.price).toBeGreaterThanOrEqual(100);
        expect(p.price).toBeLessThanOrEqual(250);
      }
    });

    test('Rs. 250+ (minPrice=250) returns luxury items with price >= 250', async () => {
      const res = await request(app).get('/api/products?minPrice=250');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const products = res.body.products || res.body.data?.products;
      expect(products.length).toBeGreaterThan(0);
      for (const p of products) {
        expect(p.price).toBeGreaterThanOrEqual(250);
      }
    });

    test('Inverted range (minPrice=100, maxPrice=50) safely returns empty list with HTTP 200 without error', async () => {
      const res = await request(app).get('/api/products?minPrice=100&maxPrice=50');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const products = res.body.products || res.body.data?.products;
      expect(products.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. ADMIN FORM & HERO BANNER STATIC COPY VERIFICATION
  // =========================================================================
  describe('3. Admin Product Form & Hero Banner Copy Verification', () => {
    test('public/index.html contains "Free Islandwide Shipping Over Rs. 50.00" and NO old "5,000.00"', () => {
      const indexHtml = fs.readFileSync(path.resolve(__dirname, '../public/index.html'), 'utf8');
      expect(indexHtml).toContain('Free Islandwide Shipping Over Rs. 50.00');
      expect(indexHtml).not.toContain('Free Islandwide Shipping Over Rs. 5,000.00');
    });

    test('public/js/components/adminDashboard.js contains "Retail Price (LKR) *" and NO "Retail Price (USD) *"', () => {
      const adminJs = fs.readFileSync(path.resolve(__dirname, '../public/js/components/adminDashboard.js'), 'utf8');
      expect(adminJs).toContain('Retail Price (LKR) *');
      expect(adminJs).not.toContain('Retail Price (USD) *');
    });

    test('public/js/components/catalog.js contains all updated LKR price labels and select options', () => {
      const catalogJs = fs.readFileSync(path.resolve(__dirname, '../public/js/components/catalog.js'), 'utf8');
      expect(catalogJs).toContain("'0-50': 'Under Rs. 50'");
      expect(catalogJs).toContain("'50-100': 'Rs. 50 – Rs. 100'");
      expect(catalogJs).toContain("'100-250': 'Rs. 100 – Rs. 250'");
      expect(catalogJs).toContain("'250-9999': 'Rs. 250+'");
      expect(catalogJs).toContain('<option value="0-50" ${priceRange === \'0-50\' ? \'selected\' : \'\'}>Under Rs. 50</option>');
      expect(catalogJs).not.toContain('Under Rs. 5,000');
      expect(catalogJs).not.toContain('Rs. 25,000+');
    });

    test('Order & Product models default currency is LKR', () => {
      const orderModel = fs.readFileSync(path.resolve(__dirname, '../src/models/Order.js'), 'utf8');
      expect(orderModel).toMatch(/default:\s*'LKR'/);

      const productModel = fs.readFileSync(path.resolve(__dirname, '../src/models/Product.js'), 'utf8');
      expect(productModel).toMatch(/default:\s*'LKR'/);
    });
  });
});
