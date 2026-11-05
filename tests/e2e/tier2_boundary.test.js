/**
 * Tier 2: Boundary & Corner Cases Suite
 * Opaque-box adversarial testing of boundary conditions, malformed inputs,
 * threshold edge conditions, and authorization limits.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');
const { createUniqueUser, mockCards, shippingAddresses } = require('./helpers/fixtures');

describe('Tier 2: Boundary, Edge & Corner Cases', () => {
  let authToken;
  let products = [];
  let userFixture;

  beforeAll(async () => {
    await connectTestDb();
    await seedSampleProducts();

    userFixture = createUniqueUser('tier2_boundary');
    const authRes = await testClient.register(userFixture);
    authToken = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    const prodRes = await testClient.getProducts();
    products = Array.isArray(prodRes.body) ? prodRes.body : (prodRes.body.products || []);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  // ---------------------------------------------------------
  // 1. Authentication & Authorization Boundaries
  // ---------------------------------------------------------
  describe('Authentication Boundaries', () => {
    test('B1-1: should reject registration with duplicate email address', async () => {
      const res = await testClient.register(userFixture);
      expect([400, 409]).toContain(res.status);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B1-2: should reject registration when password is shorter than 6 characters', async () => {
      const shortPwdUser = createUniqueUser('short_pwd');
      shortPwdUser.password = '123';
      const res = await testClient.register(shortPwdUser);

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B1-3: should reject login for non-existent email', async () => {
      const res = await testClient.login({
        email: 'ghost_user_does_not_exist@velvetaura.test',
        password: 'Password123!'
      });

      expect(res.status).toBe(401);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B1-4: should reject protected access when Authorization header is missing', async () => {
      const res = await testClient.getProfile('');
      expect(res.status).toBe(401);
    });

    test('B1-5: should reject protected access when Bearer token is malformed', async () => {
      const res = await testClient.get('/api/auth/me', {
        Authorization: 'Bearer invalid.malformed.jwt.token.string'
      });
      expect(res.status).toBe(401);
    });

    test('B1-6: should reject protected access when Bearer keyword prefix is missing', async () => {
      const res = await testClient.get('/api/auth/me', {
        Authorization: authToken // Missing "Bearer " prefix
      });
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------
  // 2. Catalog & Discovery Boundaries
  // ---------------------------------------------------------
  describe('Catalog & Search Boundaries', () => {
    test('B2-1: should handle invalid non-ObjectId product parameter without 500 crash', async () => {
      const res = await testClient.getProductById('not-an-object-id-string');
      expect([400, 404]).toContain(res.status);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B2-2: should safely handle adversarial search query with script and SQL injections', async () => {
      const queries = [
        '<script>alert("xss")</script>',
        "' OR '1'='1' --",
        '{"$gt": ""}'
      ];

      for (const q of queries) {
        const res = await testClient.getProducts({ q });
        expect(res.status).toBe(200);
        const results = Array.isArray(res.body) ? res.body : (res.body.products || []);
        expect(Array.isArray(results)).toBe(true);
      }
    });

    test('B2-3: should return empty list when filtering by non-existent category', async () => {
      const res = await testClient.getProducts({ category: 'non_existent_cosmic_category' });
      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : (res.body.products || []);
      expect(results.length).toBe(0);
    });

    test('B2-4: should return empty list when filtering by non-existent origin country', async () => {
      const res = await testClient.getProducts({ origin: 'Atlantis' });
      expect(res.status).toBe(200);
      const results = Array.isArray(res.body) ? res.body : (res.body.products || []);
      expect(results.length).toBe(0);
    });
  });

  // ---------------------------------------------------------
  // 3. Cart & Quantity Boundaries
  // ---------------------------------------------------------
  describe('Cart & Quantity Boundaries', () => {
    test('B3-1: should reject adding item with quantity 0', async () => {
      const res = await testClient.addToCart(authToken, {
        productId: products[0]._id,
        quantity: 0
      });
      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B3-2: should reject adding item with negative quantity', async () => {
      const res = await testClient.addToCart(authToken, {
        productId: products[0]._id,
        quantity: -5
      });
      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B3-3: should reject adding item with non-numeric quantity', async () => {
      const res = await testClient.addToCart(authToken, {
        productId: products[0]._id,
        quantity: 'three'
      });
      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B3-4: should reject adding quantity exceeding product available stock', async () => {
      const res = await testClient.addToCart(authToken, {
        productId: products[0]._id,
        quantity: 999999
      });
      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B3-5: should reject adding non-existent product ID to cart', async () => {
      const res = await testClient.addToCart(authToken, {
        productId: '654321654321654321654321',
        quantity: 1
      });
      expect([400, 404]).toContain(res.status);
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });

  // ---------------------------------------------------------
  // 4. Pricing & Shipping Threshold Boundaries
  // ---------------------------------------------------------
  describe('Pricing Threshold Boundaries', () => {
    test('B4-1: should apply $5.99 shipping when subtotal is strictly under $50.00', async () => {
      // Clear cart
      await testClient.clearCart(authToken);

      // Find or pick cheap product (e.g. Rom&nd tint $13.00)
      const cheapProduct = products.find(p => p.price < 50) || products[0];
      await testClient.addToCart(authToken, {
        productId: cheapProduct._id,
        quantity: 1
      });

      const res = await testClient.getCart(authToken);
      const cart = res.body.cart || res.body;

      if (cart.subtotal < 50.0) {
        expect(Number(cart.shipping)).toBeCloseTo(5.99, 2);
      }
    });

    test('B4-2: should apply $0.00 free shipping when subtotal is $50.00 or greater', async () => {
      await testClient.clearCart(authToken);

      // Add expensive product or multiple units so subtotal >= $50
      const expensiveProduct = products.find(p => p.price >= 50) || products[0];
      const qtyNeeded = expensiveProduct.price >= 50 ? 1 : Math.ceil(50 / expensiveProduct.price);

      await testClient.addToCart(authToken, {
        productId: expensiveProduct._id,
        quantity: qtyNeeded
      });

      const res = await testClient.getCart(authToken);
      const cart = res.body.cart || res.body;

      expect(cart.subtotal).toBeGreaterThanOrEqual(50.0);
      expect(Number(cart.shipping)).toBeCloseTo(0.0, 2);
    });
  });

  // ---------------------------------------------------------
  // 5. Checkout & Order Boundaries
  // ---------------------------------------------------------
  describe('Checkout & Order Boundaries', () => {
    test('B5-1: should reject checkout attempt with empty cart', async () => {
      // Clear cart
      await testClient.clearCart(authToken);

      const res = await testClient.checkout(authToken, {
        shippingAddress: shippingAddresses.usa,
        paymentDetails: mockCards.validVisa
      });

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B5-2: should reject checkout when shipping address fields are missing', async () => {
      // Add valid item to cart
      await testClient.addToCart(authToken, {
        productId: products[0]._id,
        quantity: 1
      });

      const res = await testClient.checkout(authToken, {
        shippingAddress: shippingAddresses.incomplete,
        paymentDetails: mockCards.validVisa
      });

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('B5-3: should reject checkout when mock card is declined', async () => {
      const res = await testClient.checkout(authToken, {
        shippingAddress: shippingAddresses.usa,
        paymentDetails: mockCards.declined
      });

      expect([400, 402]).toContain(res.status);
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });
});
