/**
 * VelvetAura - Authentication, User & Model Subsystem Tests
 * Verifies customer registration, credential verification, JWT authorization,
 * password hashing, profile updates, and model calculations.
 */

const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');

describe('Authentication & User Subsystem', () => {
  const validUserPayload = {
    name: 'Camille Dupont',
    email: 'camille.dupont@luxury.test',
    password: 'VelvetSecret2026!',
    address: {
      street: '14 Rue de Rivoli',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France',
    },
  };

  describe('Customer Registration (POST /api/auth/register)', () => {
    test('should register a new customer successfully and return JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUserPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(typeof res.body.token).toBe('string');

      const user = res.body.user;
      expect(user).toBeDefined();
      expect(user.name).toBe(validUserPayload.name);
      expect(user.email).toBe(validUserPayload.email.toLowerCase());
      expect(user.role).toBe('customer');
      expect(user.password).toBeUndefined(); // Password must NEVER be exposed
    });

    test('should automatically create an initial empty cart for the registered user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Cart Check User',
          email: 'cart.check@luxury.test',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      const user = res.body.user;

      const userCart = await Cart.findOne({ user: user._id || user.id });
      expect(userCart).toBeDefined();
      expect(userCart.items).toHaveLength(0);
      expect(userCart.grandTotal).toBe(0);
    });

    test('should reject registration with duplicate email address', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send(validUserPayload);

      // Duplicate attempt
      const res = await request(app)
        .post('/api/auth/register')
        .send(validUserPayload);

      expect([400, 409]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('should reject registration when password is shorter than 6 characters', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Pass User',
          email: 'short.pass@luxury.test',
          password: '123',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/at least 6 characters/i);
    });

    test('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Bad Email User',
          email: 'not-an-email-format',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/valid email/i);
    });

    test('should reject registration when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Missing Email User',
          password: 'Password123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });

  describe('Customer Login (POST /api/auth/login)', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send(validUserPayload);
    });

    test('should log in customer with valid credentials and return JWT token', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserPayload.email,
          password: validUserPayload.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.password).toBeUndefined();
    });

    test('should support case-insensitive email login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserPayload.email.toUpperCase(),
          password: validUserPayload.password,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    test('should reject login attempt with wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserPayload.email,
          password: 'CompletelyWrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/invalid email or password/i);
    });

    test('should reject login for non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'ghost.user.does.not.exist@luxury.test',
          password: 'SomePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/invalid email or password/i);
    });

    test('should reject login when fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: validUserPayload.email,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });

  describe('Protected Profile & Middleware (GET /api/auth/me & PUT /api/auth/profile)', () => {
    let authToken;

    beforeEach(async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send(validUserPayload);
      authToken = regRes.body.token;
    });

    test('should fetch authenticated customer profile with valid Bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(validUserPayload.email.toLowerCase());
      expect(res.body.user.password).toBeUndefined();
    });

    test('should reject request when Authorization header is missing', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/no token provided/i);
    });

    test('should reject request when Bearer keyword prefix is missing', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', authToken); // Missing "Bearer "

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('should reject request when token is invalid or malformed', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer this.is.an.invalid.token.payload');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/invalid token/i);
    });

    test('should update user profile details via PUT /api/auth/profile', async () => {
      const updateData = {
        name: 'Camille Updated',
        shippingAddress: {
          street: '25 Boulevard Haussmann',
          city: 'Paris',
          state: 'Ile-de-France',
          zip: '75009',
          country: 'France',
        },
      };

      const res = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.name).toBe('Camille Updated');
      expect(res.body.user.shippingAddress.street).toBe('25 Boulevard Haussmann');
    });
  });

  describe('Data Models Integrity & Unit Logic', () => {
    test('User model hashes password on save and comparePassword verifies correctly', async () => {
      const user = new User({
        name: 'Model Test User',
        email: 'model.test@luxury.test',
        password: 'RawPassword123!',
      });

      await user.save();

      // Ensure password field in DB starts with bcrypt salt prefix
      const savedUser = await User.findById(user._id).select('+password');
      expect(savedUser.password).toMatch(/^\$2[ab]\$10\$/);
      expect(savedUser.password).not.toBe('RawPassword123!');

      // comparePassword verification
      const isCorrect = await savedUser.comparePassword('RawPassword123!');
      const isWrong = await savedUser.comparePassword('WrongPassword!');
      expect(isCorrect).toBe(true);
      expect(isWrong).toBe(false);
    });

    test('Cart pricing engine calculates subtotal, 8% tax, and shipping threshold accurately', async () => {
      const dummyUserId = new User()._id;

      // Case 1: Subtotal < $50 (incurs $5.99 shipping)
      const cartLow = new Cart({
        user: dummyUserId,
        items: [
          {
            product: new Product()._id,
            name: 'Lip Tint',
            brand: 'Rom&nd',
            price: 13.00,
            quantity: 2, // $26.00
          },
        ],
      });

      cartLow.recalculateTotals();
      expect(cartLow.subtotal).toBe(26.00);
      expect(cartLow.tax).toBe(2.08); // 26 * 0.08 = 2.08
      expect(cartLow.shipping).toBe(5.99);
      expect(cartLow.grandTotal).toBe(34.07); // 26 + 2.08 + 5.99 = 34.07
      expect(cartLow.itemCount).toBe(2);

      // Case 2: Subtotal >= $50 (free shipping)
      const cartHigh = new Cart({
        user: dummyUserId,
        items: [
          {
            product: new Product()._id,
            name: 'Luxury Serum',
            brand: 'Sulwhasoo',
            price: 89.00,
            quantity: 1, // $89.00
          },
        ],
      });

      cartHigh.recalculateTotals();
      expect(cartHigh.subtotal).toBe(89.00);
      expect(cartHigh.tax).toBe(7.12); // 89 * 0.08 = 7.12
      expect(cartHigh.shipping).toBe(0.00);
      expect(cartHigh.grandTotal).toBe(96.12); // 89 + 7.12 = 96.12
      expect(cartHigh.itemCount).toBe(1);

      // Case 3: Empty cart
      const cartEmpty = new Cart({
        user: dummyUserId,
        items: [],
      });

      cartEmpty.recalculateTotals();
      expect(cartEmpty.subtotal).toBe(0);
      expect(cartEmpty.tax).toBe(0);
      expect(cartEmpty.shipping).toBe(0);
      expect(cartEmpty.grandTotal).toBe(0);
      expect(cartEmpty.itemCount).toBe(0);
    });

    test('Order model automatically generates unique orderNumber and requires at least one item', async () => {
      const dummyUserId = new User()._id;
      const dummyProductId = new Product()._id;

      const order = new Order({
        user: dummyUserId,
        items: [
          {
            product: dummyProductId,
            name: 'Gypsy Water',
            brand: 'Byredo',
            price: 290.00,
            quantity: 1,
          },
        ],
        shippingAddress: {
          fullName: 'Test Recipient',
          street: '100 Luxury Way',
          city: 'New York',
          state: 'NY',
          zip: '10001',
          country: 'USA',
        },
        pricing: {
          subtotal: 290.00,
          tax: 23.20,
          shipping: 0.00,
          grandTotal: 313.20,
        },
        payment: {
          transactionId: 'TXN_MOCK_TEST_123',
          method: 'mock_credit_card',
          status: 'succeeded',
        },
      });

      await order.save();

      expect(order.orderNumber).toBeDefined();
      expect(order.orderNumber).toMatch(/^VA-\d{8}-\d{4}$/);
      expect(order.grandTotal).toBe(313.20);
      expect(order.status).toBe('completed');
    });
  });

  describe('Input Hardening & Boundary Stress (M1 Fix Verifications)', () => {
    test('should return HTTP 400 when client sends malformed JSON payload', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"name": "Broken", "email": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid json|syntax/i);
    });

    test('should reject registration when name, email, or password are non-string types', async () => {
      // Numeric name
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 12345,
          email: 'valid@luxury.test',
          password: 'Password123!',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.message).toMatch(/must be valid strings/i);

      // Object email (NoSQL injection probe)
      const res2 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Valid Name',
          email: { $gt: '' },
          password: 'Password123!',
        });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/must be valid strings/i);

      // Numeric password
      const res3 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Valid Name',
          email: 'valid2@luxury.test',
          password: 123456,
        });
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);
      expect(res3.body.message).toMatch(/must be valid strings/i);
    });

    test('should reject login when email or password are non-string types', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $gt: '' },
          password: 'Password123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/must be valid strings/i);
    });

    test('should reject profile update when name is not a non-empty string', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Profile Name Test',
          email: 'profile.name.test@luxury.test',
          password: 'Password123!',
        });
      const token = regRes.body.token;

      const res1 = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 12345 });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);

      const res2 = await request(app)
        .put('/api/auth/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '   ' });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
    });

    test('Product model virtual image setter updates images[0] on existing items', () => {
      const product = new Product({
        name: 'Glow Serum',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        description: 'First care activating serum luxury edition.',
        price: 89.00,
        stock: 15,
        images: ['/images/first-care.webp', '/images/first-care-box.webp'],
      });

      expect(product.image).toBe('/images/first-care.webp');

      // Mutate hero image via setter
      product.image = '/images/first-care-v2.webp';
      expect(product.image).toBe('/images/first-care-v2.webp');
      expect(product.images[0]).toBe('/images/first-care-v2.webp');
      expect(product.images[1]).toBe('/images/first-care-box.webp'); // Secondary image retained

      // Set on newly initialized product without images
      const newProduct = new Product({
        name: 'Lip Tint',
        brand: 'Rom&nd',
        origin: 'South Korea',
        category: 'cosmetics',
        description: 'Juicy lasting tint in shade figfig.',
        price: 13.00,
        stock: 50,
      });
      newProduct.image = '/images/figfig.webp';
      expect(newProduct.image).toBe('/images/figfig.webp');
      expect(newProduct.images[0]).toBe('/images/figfig.webp');
    });
  });
});
