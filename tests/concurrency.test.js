/**
 * VelvetAura - Concurrency, Race Condition & DB Resilience Verification Suite
 * 
 * Specifically challenges:
 * 1. Concurrency & Race Conditions on Checkout:
 *    - Binary race: 2 concurrent checkouts against limited inventory (stock = 1)
 *    - Stampede race: 5 concurrent checkouts against limited inventory (stock = 1)
 *    - Multi-item partial decrement compensation rollback under race
 * 2. Dual-mode DB Resilience:
 *    - In-memory detection and connection idempotency
 * 3. Seed Verification:
 *    - Verifies 24 products and 3 demo accounts (with bcrypt hashing) seeded cleanly
 */

const request = require('supertest');
const app = require('../src/app');
const { connectDB, getDbMode, isInMemory } = require('../src/config/db');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');
const { seedInitialData } = require('../src/data/seed');

describe('Concurrency, Race Condition & System Resilience Verification Suite', () => {
  const validPayment = {
    cardNumber: '4242424242424242',
    expDate: '12/28',
    cvv: '123',
    cardHolder: 'Concurrency Customer',
    brand: 'Visa',
  };

  const validAddress = {
    fullName: 'Concurrency Customer',
    street: '100 Boulevard Saint-Germain',
    city: 'Paris',
    state: 'Ile-de-France',
    zip: '75005',
    country: 'France',
  };

  // Helper to register and login a test user
  async function createTestCustomer(emailPrefix) {
    const email = `${emailPrefix}_${Date.now()}_${Math.random()}@velvetaura.test`;
    const user = await User.create({
      name: `User ${emailPrefix}`,
      email,
      password: 'Password123!',
      address: validAddress,
    });
    const loginRes = await request(app).post('/api/auth/login').send({
      email,
      password: 'Password123!',
    });
    return { user, token: loginRes.body.token };
  }

  describe('1. Concurrency & Race Conditions on Limited Inventory (stock = 1)', () => {
    test('Binary Race: 2 concurrent checkouts against stock = 1 -> exactly 1 succeeds, 1 returns HTTP 400, stock never negative', async () => {
      // 1. Create limited inventory product with stock = 1
      const product = await Product.create({
        name: 'Single Unit Elixir',
        brand: 'Maison Rare',
        origin: 'France',
        category: 'skincare',
        price: 120.00,
        stock: 1,
        description: 'Single stock test item.',
      });

      // 2. Create 2 test users
      const customerA = await createTestCustomer('race_a');
      const customerB = await createTestCustomer('race_b');

      // 3. Both users add 1 unit to their carts
      const addResA = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({ productId: product._id, quantity: 1 });
      expect(addResA.status).toBe(200);

      const addResB = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({ productId: product._id, quantity: 1 });
      expect(addResB.status).toBe(200);

      // 4. Dispatch concurrent checkout requests simultaneously
      const [resA, resB] = await Promise.all([
        request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${customerA.token}`)
          .send({ shippingAddress: validAddress, paymentDetails: validPayment }),
        request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${customerB.token}`)
          .send({ shippingAddress: validAddress, paymentDetails: validPayment }),
      ]);

      const responses = [resA, resB];
      const successes = responses.filter((r) => r.status === 201 || r.status === 200);
      const failures = responses.filter((r) => r.status === 400);

      // Assertions on response statuses
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // Successful request assertions
      const successRes = successes[0];
      expect(successRes.body.success).toBe(true);
      expect(successRes.body.order).toBeDefined();
      expect(successRes.body.transactionId).toMatch(/^TXN-VA-/);

      // Failed request assertions
      const failRes = failures[0];
      expect(failRes.body.success).toBe(false);
      expect(failRes.body.error).toBe('Insufficient stock');
      expect(failRes.body.message).toMatch(/insufficient/i);

      // Database state verification
      const updatedProduct = await Product.findById(product._id);
      expect(updatedProduct.stock).toBe(0);
      expect(updatedProduct.stock).not.toBeLessThan(0);

      // Exactly 1 order created in database
      const createdOrders = await Order.find({ 'items.product': product._id });
      expect(createdOrders).toHaveLength(1);

      // Winner cart is cleared
      const winnerToken = successRes === resA ? customerA.token : customerB.token;
      const winnerCart = await request(app).get('/api/cart').set('Authorization', `Bearer ${winnerToken}`);
      expect(winnerCart.body.cart.items).toHaveLength(0);

      // Loser cart is retained
      const loserToken = failRes === resA ? customerA.token : customerB.token;
      const loserCart = await request(app).get('/api/cart').set('Authorization', `Bearer ${loserToken}`);
      expect(loserCart.body.cart.items).toHaveLength(1);
    });

    test('Stampede Race: 5 concurrent checkouts against stock = 1 -> exactly 1 succeeds, 4 return HTTP 400, stock strictly 0', async () => {
      const stampedeProduct = await Product.create({
        name: 'Single Unit Truffle Cream',
        brand: 'Alba Rare',
        origin: 'Italy',
        category: 'skincare',
        price: 250.00,
        stock: 1,
        description: 'Single unit stampede product.',
      });

      const stampedeCustomers = [];
      for (let i = 0; i < 5; i++) {
        const c = await createTestCustomer(`stampede_${i}`);
        await request(app)
          .post('/api/cart/items')
          .set('Authorization', `Bearer ${c.token}`)
          .send({ productId: stampedeProduct._id, quantity: 1 });
        stampedeCustomers.push(c);
      }

      // Dispatch 5 concurrent checkouts simultaneously
      const results = await Promise.all(
        stampedeCustomers.map((c) =>
          request(app)
            .post('/api/orders/checkout')
            .set('Authorization', `Bearer ${c.token}`)
            .send({ shippingAddress: validAddress, paymentDetails: validPayment })
        )
      );

      const successes = results.filter((r) => r.status === 201 || r.status === 200);
      const failures = results.filter((r) => r.status === 400);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(4);

      // Product stock strictly 0
      const finalProduct = await Product.findById(stampedeProduct._id);
      expect(finalProduct.stock).toBe(0);

      // Total orders created strictly 1
      const totalOrders = await Order.find({ 'items.product': stampedeProduct._id });
      expect(totalOrders).toHaveLength(1);
    });

    test('Multi-Item Race with Partial Decrement Compensation Rollback', async () => {
      // Product A has ample stock (5 units)
      const prodA = await Product.create({
        name: 'Ample Stock Serum',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        price: 50.00,
        stock: 5,
        description: 'Abundant stock item.',
      });

      // Product B has limited stock (1 unit bottleneck)
      const prodB = await Product.create({
        name: 'Bottleneck Night Oil',
        brand: 'Byredo',
        origin: 'Sweden',
        category: 'fragrances',
        price: 150.00,
        stock: 1,
        description: 'Bottleneck item.',
      });

      const user1 = await createTestCustomer('multi_race_1');
      const user2 = await createTestCustomer('multi_race_2');

      // User 1 cart: 2 of prodA, 1 of prodB
      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${user1.token}`).send({ productId: prodA._id, quantity: 2 });
      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${user1.token}`).send({ productId: prodB._id, quantity: 1 });

      // User 2 cart: 2 of prodA, 1 of prodB
      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${user2.token}`).send({ productId: prodA._id, quantity: 2 });
      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${user2.token}`).send({ productId: prodB._id, quantity: 1 });

      // Dispatch concurrent checkout
      const [res1, res2] = await Promise.all([
        request(app).post('/api/orders/checkout').set('Authorization', `Bearer ${user1.token}`).send({ shippingAddress: validAddress, paymentDetails: validPayment }),
        request(app).post('/api/orders/checkout').set('Authorization', `Bearer ${user2.token}`).send({ shippingAddress: validAddress, paymentDetails: validPayment }),
      ]);

      const successes = [res1, res2].filter((r) => r.status === 201 || r.status === 200);
      const failures = [res1, res2].filter((r) => r.status === 400);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // Initial prodA stock was 5. One order bought 2.
      // If partial decrement failed to rollback on the failed checkout, prodA stock would be 1!
      // With proper rollback compensation, prodA stock must be exactly 3 (5 - 2 = 3).
      const updatedProdA = await Product.findById(prodA._id);
      expect(updatedProdA.stock).toBe(3);

      const updatedProdB = await Product.findById(prodB._id);
      expect(updatedProdB.stock).toBe(0);
    });
  });

  describe('2. Dual-Mode DB Resilience & Mode Verification', () => {
    test('should report memory mode and connection idempotency', async () => {
      expect(isInMemory()).toBe(true);
      expect(getDbMode()).toBe('memory');

      const c1 = await connectDB();
      const c2 = await connectDB();
      expect(c1).toBe(c2);
    });
  });

  describe('3. Seed Verification (Programmatic Execution & Models)', () => {
    test('seedInitialData should populate 24 items and 3 demo accounts with bcrypt passwords', async () => {
      const result = await seedInitialData({ silent: true, forceReset: true });

      expect(result.success).toBe(true);
      expect(result.productsCount).toBe(24);

      // Verify product count in DB
      const count = await Product.countDocuments();
      expect(count).toBe(24);

      // Verify demo admin
      const admin = await User.findOne({ email: 'admin@velvetaura.com' }).select('+password');
      expect(admin).not.toBeNull();
      expect(admin.role).toBe('admin');
      const isAdminPassValid = await admin.matchPassword('AdminPassword123!');
      expect(isAdminPassValid).toBe(true);

      // Verify demo customer
      const customer = await User.findOne({ email: 'customer@velvetaura.com' }).select('+password');
      expect(customer).not.toBeNull();
      expect(customer.role).toBe('customer');
      const isCustPassValid = await customer.matchPassword('Password123!');
      expect(isCustPassValid).toBe(true);

      // Verify minji customer
      const minji = await User.findOne({ email: 'minji@velvetaura.com' }).select('+password');
      expect(minji).not.toBeNull();
      const isMinjiPassValid = await minji.matchPassword('Password123!');
      expect(isMinjiPassValid).toBe(true);

      // Verify carts exist
      const adminCart = await Cart.findOne({ user: admin._id });
      const customerCart = await Cart.findOne({ user: customer._id });
      expect(adminCart).not.toBeNull();
      expect(customerCart).not.toBeNull();
    });
  });
});
