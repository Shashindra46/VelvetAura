/**
 * VelvetAura - Tier 5 Adversarial Coverage Hardening & White-Box Stress Test Suite
 * 
 * Verifies extreme boundaries, fault injection, and adversarial attacks:
 * 1. Extreme boundary carts: float precision limits, large item counts, rapid quantity toggling.
 * 2. Malformed/adversarial auth attempts: missing tokens, expired tokens, tokens with wrong secrets,
 *    deleted user tokens, SQL/NoSQL injections in login and registration.
 * 3. Inventory bounds & concurrency: zero-stock purchases, simultaneous decrements (stampede),
 *    and multi-item compensation rollback verification.
 * 4. Payment edge cases: non-standard card lengths (13, 15, 16, 19), leap year expiration dates,
 *    CVV edge cases, Luhn card decline (0002), and missing address boundary tests.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const User = require('../../src/models/User');
const Cart = require('../../src/models/Cart');
const Order = require('../../src/models/Order');
const { calculatePricing } = require('../../src/services/cartService');
const { processPayment, validateExpirationDate } = require('../../src/services/paymentService');

describe('Tier 5 Adversarial Coverage Hardening & Stress Suite (tests/stress)', () => {
  let customerUser;
  let customerToken;
  let testProducts = [];

  const validShipping = {
    fullName: 'Lady Genevieve',
    street: '72 Rue du Faubourg Saint-Honoré',
    city: 'Paris',
    state: 'Île-de-France',
    zip: '75008',
    country: 'France',
  };

  const validCard = {
    cardNumber: '4242424242424242',
    expDate: '12/28',
    cvv: '888',
    cardHolder: 'Lady Genevieve',
    brand: 'Visa',
  };

  beforeEach(async () => {
    customerUser = await User.create({
      name: 'Adversarial Tester',
      email: `adv_tester_${Date.now()}_${Math.random()}@velvetaura.luxury`,
      password: 'StrongPassword2026!',
      address: validShipping,
      shippingAddress: validShipping,
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: customerUser.email,
      password: 'StrongPassword2026!',
    });
    customerToken = loginRes.body.token;

    testProducts = await Product.insertMany([
      {
        name: 'Guerlain Orchidée Impériale Cream',
        brand: 'Guerlain',
        origin: 'France',
        category: 'skincare',
        price: 490.00,
        stock: 50,
        description: 'Exceptional complete care infused with orchid longevity science.',
      },
      {
        name: 'Sulwhasoo First Care Activating Serum',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        price: 89.00,
        stock: 10,
        description: 'Post-cleanse boosting serum with JAUM Balancing Complex.',
      },
      {
        name: 'Maison Francis Kurkdjian Baccarat Rouge 540',
        brand: 'Maison Francis Kurkdjian',
        origin: 'France',
        category: 'fragrances',
        price: 325.00,
        stock: 1,
        description: 'Luminous and sophisticated amber floral fragrance.',
      },
      {
        name: 'Augustinus Bader The Rich Cream',
        brand: 'Augustinus Bader',
        origin: 'Germany',
        category: 'skincare',
        price: 290.00,
        stock: 0,
        description: 'Intensely luxurious hydrator with TFC8 cellular renewal technology.',
      },
    ]);
  });

  describe('1. Extreme Boundary Carts & Pricing Precision', () => {
    it('1.1 should correctly calculate fractional prices and round half-up with zero NaN or floating inaccuracies', () => {
      const edgeCases = [
        { items: [{ price: 0.1, quantity: 1 }, { price: 0.2, quantity: 1 }], expectedSub: 0.3, expectedTax: 0.02, expectedShip: 5.99, expectedGrand: 6.31 },
        { items: [{ price: 49.99, quantity: 1 }], expectedSub: 49.99, expectedTax: 4.00, expectedShip: 5.99, expectedGrand: 59.98 },
        { items: [{ price: 50.00, quantity: 1 }], expectedSub: 50.00, expectedTax: 4.00, expectedShip: 0.00, expectedGrand: 54.00 },
        { items: [{ price: 50.01, quantity: 1 }], expectedSub: 50.01, expectedTax: 4.00, expectedShip: 0.00, expectedGrand: 54.01 },
        { items: [{ price: 33.33, quantity: 3 }], expectedSub: 99.99, expectedTax: 8.00, expectedShip: 0.00, expectedGrand: 107.99 },
        { items: [{ price: 19.995, quantity: 2 }], expectedSub: 39.99, expectedTax: 3.20, expectedShip: 5.99, expectedGrand: 49.18 },
      ];

      for (const tc of edgeCases) {
        const pricing = calculatePricing(tc.items);
        expect(pricing.subtotal).toBe(tc.expectedSub);
        expect(pricing.tax).toBe(tc.expectedTax);
        expect(pricing.shipping).toBe(tc.expectedShip);
        expect(pricing.grandTotal).toBe(tc.expectedGrand);
        expect(Number.isNaN(pricing.grandTotal)).toBe(false);
      }
    });

    it('1.2 should safely handle rapid quantity toggling (add -> update -> zero removal -> re-add)', async () => {
      const prod = testProducts[0];

      const res1 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: prod._id.toString(), quantity: 1 });
      expect(res1.status).toBe(200);
      expect(res1.body.cart.itemCount).toBe(1);

      const res2 = await request(app)
        .put(`/api/cart/items/${prod._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 5 });
      expect(res2.status).toBe(200);
      expect(res2.body.cart.itemCount).toBe(5);

      const res3 = await request(app)
        .put(`/api/cart/items/${prod._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 2 });
      expect(res3.status).toBe(200);
      expect(res3.body.cart.itemCount).toBe(2);

      const res4 = await request(app)
        .put(`/api/cart/items/${prod._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ quantity: 0 });
      expect(res4.status).toBe(200);
      expect(res4.body.cart.items.length).toBe(0);

      const res5 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: prod._id.toString(), quantity: 3 });
      expect(res5.status).toBe(200);
      expect(res5.body.cart.items.length).toBe(1);
      expect(res5.body.cart.itemCount).toBe(3);
    });

    it('1.3 should handle multi-item baskets with up to 15 distinct line items accurately', async () => {
      const extraProducts = [];
      for (let i = 1; i <= 12; i++) {
        extraProducts.push({
          name: `Luxury Beauty Asset Stress ${i}`,
          brand: 'Atelier Velvet',
          origin: 'France',
          category: 'skincare',
          price: 10.00 + i,
          stock: 20,
          description: `Luxury skincare formula number ${i}.`,
        });
      }
      const inserted = await Product.insertMany(extraProducts);
      const allProds = [testProducts[0], testProducts[1], ...inserted];

      let expectedSubtotal = 0;
      for (let i = 0; i < 14; i++) {
        const p = allProds[i];
        const res = await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({ productId: p._id.toString(), quantity: 1 });
        expect(res.status).toBe(200);
        expectedSubtotal += p.price;
      }

      expectedSubtotal = Math.round(expectedSubtotal * 100) / 100;
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(cartRes.status).toBe(200);
      expect(cartRes.body.cart.items.length).toBe(14);
      expect(cartRes.body.cart.itemCount).toBe(14);
      expect(cartRes.body.cart.subtotal).toBe(expectedSubtotal);
    });
  });

  describe('2. Malformed & Adversarial Auth Hardening', () => {
    it('2.1 should reject protected access when token is signed with wrong secret', async () => {
      const forgedToken = jwt.sign(
        { id: customerUser._id },
        'attacker_fake_jwt_secret_9999999',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Not authorized, invalid token');
    });

    it('2.2 should reject protected access when token has expired', async () => {
      const expiredToken = jwt.sign(
        { id: customerUser._id },
        process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure',
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('token has expired');
    });

    it('2.3 should reject protected access when token contains non-existent user ID', async () => {
      const randomObjectId = new mongoose.Types.ObjectId();
      const ghostToken = jwt.sign(
        { id: randomObjectId },
        process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure',
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${ghostToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('user not found');
    });

    it('2.4 should reject NoSQL injection attempts in login payload (object payloads)', async () => {
      const res1 = await request(app)
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: 'StrongPassword2026!' });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);

      const res2 = await request(app)
        .post('/api/auth/login')
        .send({ email: customerUser.email, password: { $ne: null } });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
    });

    it('2.5 should safely reject SQL injection payloads in login (401) and registration (400) without crashing or executing', async () => {
      const sqlPayloads = [
        "' OR '1'='1",
        "admin'--",
        "admin' /*",
        "' UNION SELECT * FROM users --",
      ];

      // In login: string payloads are queried safely via Mongoose without execution, finding no match -> HTTP 401
      for (const payload of sqlPayloads) {
        const loginRes = await request(app)
          .post('/api/auth/login')
          .send({ email: payload, password: 'password123' });
        expect(loginRes.status).toBe(401);
        expect(loginRes.body.success).toBe(false);
        expect(loginRes.body.error).toContain('Invalid email or password');
      }

      // In registration: email regex rejects SQL injection strings -> HTTP 400
      for (const payload of sqlPayloads) {
        const regRes = await request(app)
          .post('/api/auth/register')
          .send({ name: 'SQL Attacker', email: payload, password: 'StrongPassword123!' });
        expect(regRes.status).toBe(400);
        expect(regRes.body.success).toBe(false);
        expect(regRes.body.error).toContain('valid email address');
      }
    });

    it('2.6 should reject registration attempts with non-string type payloads', async () => {
      const badRegistrations = [
        { name: 12345, email: 'valid@velvetaura.luxury', password: 'Password123!' },
        { name: 'Valid Name', email: ['array@velvetaura.luxury'], password: 'Password123!' },
        { name: 'Valid Name', email: 'valid@velvetaura.luxury', password: { secret: true } },
      ];

      for (const bad of badRegistrations) {
        const res = await request(app).post('/api/auth/register').send(bad);
        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });
  });

  describe('3. Inventory Bounds, Concurrency & Rollback', () => {
    it('3.1 should reject adding out-of-stock product to cart (stock = 0)', async () => {
      const zeroStockProduct = testProducts[3];
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: zeroStockProduct._id.toString(), quantity: 1 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('3.2 should prevent double-spending in a 10-way concurrent checkout stampede for scarce stock = 1', async () => {
      const scarceProduct = testProducts[2];

      const shopperTokens = [];
      for (let i = 0; i < 10; i++) {
        const u = await User.create({
          name: `Shopper Concurrency ${i}`,
          email: `shopper_stampede_${i}_${Date.now()}@velvetaura.test`,
          password: 'Password123!',
          address: validShipping,
        });

        const lRes = await request(app).post('/api/auth/login').send({
          email: u.email,
          password: 'Password123!',
        });
        const tok = lRes.body.token;
        shopperTokens.push(tok);

        const cRes = await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${tok}`)
          .send({ productId: scarceProduct._id.toString(), quantity: 1 });
        expect(cRes.status).toBe(200);
      }

      const checkoutPromises = shopperTokens.map((token) =>
        request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${token}`)
          .send({
            shippingAddress: validShipping,
            paymentDetails: validCard,
          })
      );

      const results = await Promise.all(checkoutPromises);

      const successfulCheckouts = results.filter((r) => r.status === 201);
      const failedCheckouts = results.filter((r) => r.status === 400);

      expect(successfulCheckouts.length).toBe(1);
      expect(failedCheckouts.length).toBe(9);

      const updatedProduct = await Product.findById(scarceProduct._id);
      expect(updatedProduct.stock).toBe(0);
    });

    it('3.3 should rollback decremented items if a subsequent item in the cart has insufficient stock', async () => {
      const item1 = testProducts[1];
      const item2 = testProducts[2];

      await Product.findByIdAndUpdate(item2._id, { stock: 1 });

      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: item1._id.toString(), quantity: 2 });

      const cart = await Cart.findOne({ user: customerUser._id });
      cart.items.push({
        product: item2._id,
        name: item2.name,
        brand: item2.brand,
        price: item2.price,
        quantity: 2,
      });
      cart.recalculateTotals();
      await cart.save();

      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validShipping,
          paymentDetails: validCard,
        });

      expect(checkoutRes.status).toBe(400);

      const checkItem1 = await Product.findById(item1._id);
      expect(checkItem1.stock).toBe(10);

      const checkItem2 = await Product.findById(item2._id);
      expect(checkItem2.stock).toBe(1);
    });

    it('3.4 should rollback decremented stock when payment is declined (card ending in 0002)', async () => {
      const prod = testProducts[0];
      const initialStock = prod.stock;

      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: prod._id.toString(), quantity: 3 });

      const declinedCard = {
        cardNumber: '4242424242420002',
        expDate: '12/28',
        cvv: '123',
        cardHolder: 'Lady Genevieve',
      };

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validShipping,
          paymentDetails: declinedCard,
        });

      expect(res.status).toBe(402);
      expect(res.body.code).toBe('CARD_DECLINED');

      const refreshedProd = await Product.findById(prod._id);
      expect(refreshedProd.stock).toBe(initialStock);

      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cartRes.body.cart.items.length).toBe(1);
      expect(cartRes.body.cart.items[0].quantity).toBe(3);
    });
  });

  describe('4. Payment Edge Cases & Gateway Validation', () => {
    it('4.1 should accept valid non-standard card lengths (13, 15, 16, 19 digits) and reject 12 and 20 digits', async () => {
      const res13 = await processPayment(100, { cardNumber: '4111111111111', expDate: '12/28', cvv: '123' });
      expect(res13.success).toBe(true);

      const res15 = await processPayment(100, { cardNumber: '378282246310005', expDate: '12/28', cvv: '1234' });
      expect(res15.success).toBe(true);

      const res16 = await processPayment(100, { cardNumber: '5555555555555555', expDate: '12/28', cvv: '123' });
      expect(res16.success).toBe(true);

      const res19 = await processPayment(100, { cardNumber: '6221260000000000000', expDate: '12/28', cvv: '123' });
      expect(res19.success).toBe(true);

      const res12 = await processPayment(100, { cardNumber: '411111111111', expDate: '12/28', cvv: '123' });
      expect(res12.success).toBe(false);

      const res20 = await processPayment(100, { cardNumber: '41111111111111111111', expDate: '12/28', cvv: '123' });
      expect(res20.success).toBe(false);
    });

    it('4.2 should accurately validate leap year expiration dates (02/28, 02/2028) vs invalid/expired dates', () => {
      const leapCheck = validateExpirationDate('02/28');
      expect(leapCheck.valid).toBe(true);
      expect(leapCheck.expired).toBe(false);

      const leapCheck4Digit = validateExpirationDate('02/2028');
      expect(leapCheck4Digit.valid).toBe(true);
      expect(leapCheck4Digit.expired).toBe(false);

      const expiredCheck = validateExpirationDate('01/20');
      expect(expiredCheck.valid).toBe(true);
      expect(expiredCheck.expired).toBe(true);

      const invalidMonth = validateExpirationDate('13/28');
      expect(invalidMonth.valid).toBe(false);

      const zeroMonth = validateExpirationDate('00/28');
      expect(zeroMonth.valid).toBe(false);

      const nonDate = validateExpirationDate('not-a-date');
      expect(nonDate.valid).toBe(false);
    });

    it('4.3 should validate CVV format and reject decline CVV 000, alphabetic, or wrong length', async () => {
      const res000 = await processPayment(100, { cardNumber: '4242424242424242', expDate: '12/28', cvv: '000' });
      expect(res000.success).toBe(false);

      const resAlpha = await processPayment(100, { cardNumber: '4242424242424242', expDate: '12/28', cvv: 'abc' });
      expect(resAlpha.success).toBe(false);

      const resShort = await processPayment(100, { cardNumber: '4242424242424242', expDate: '12/28', cvv: '12' });
      expect(resShort.success).toBe(false);

      const resLong = await processPayment(100, { cardNumber: '4242424242424242', expDate: '12/28', cvv: '12345' });
      expect(resLong.success).toBe(false);
    });

    it('4.4 should reject checkout when required shipping address fields are missing or whitespace-only', async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: testProducts[0]._id.toString(), quantity: 1 });

      const testAddressCases = [
        { desc: 'Missing street', addr: { city: 'Paris', state: 'IDF', zip: '75008', country: 'France' } },
        { desc: 'Missing city', addr: { street: '14 Rue', state: 'IDF', zip: '75008', country: 'France' } },
        { desc: 'Missing state', addr: { street: '14 Rue', city: 'Paris', zip: '75008', country: 'France' } },
        { desc: 'Missing zip', addr: { street: '14 Rue', city: 'Paris', state: 'IDF', country: 'France' } },
        { desc: 'Missing country', addr: { street: '14 Rue', city: 'Paris', state: 'IDF', zip: '75008' } },
        { desc: 'Whitespace-only street', addr: { street: '   ', city: 'Paris', state: 'IDF', zip: '75008', country: 'France' } },
      ];

      for (const tc of testAddressCases) {
        const res = await request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${customerToken}`)
          .send({
            shippingAddress: tc.addr,
            paymentDetails: validCard,
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      }
    });
  });
});
