/**
 * VelvetAura - Milestone 5: Empirical Adversarial Challenge & Stress Test Suite
 * Executed by teamwork_challenger_m5_1
 * 
 * Comprehensive probe of:
 * 1. Security & RBAC Boundaries:
 *    - Missing Authorization header on all admin routes (401)
 *    - Malformed / corrupted Bearer tokens (401)
 *    - Customer tokens accessing admin routes (403 with exact payload)
 *    - Tampered role claims, invalid signatures, forged JWTs (401/403)
 * 2. Product Management CRUD Boundaries:
 *    - Negative, non-numeric, and zero prices
 *    - Negative, non-numeric, and float stock handling
 *    - Empty, short (<2 chars), and overly long (>150 chars) names
 *    - Category enums and case-insensitivity
 *    - Non-existent (404) and invalid hex (400) ObjectIds
 *    - Double deletion / already deleted product handling (404)
 * 3. Order Status Boundaries:
 *    - Invalid status strings, numbers, booleans, and empty states (400)
 *    - Complete cycle of valid status strings (200)
 *    - Non-existent (404) and invalid hex (400) order IDs
 * 4. High Concurrency & Race Conditions:
 *    - Rapid concurrent product updates (20 concurrent requests)
 *    - Rapid concurrent order status updates (20 concurrent requests)
 *    - Concurrent product creation and bulk deletion
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure';

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { connectDB, disconnectDB, clearDatabase } = require('../src/config/db');
const { seedInitialData } = require('../src/data/seed');
const Product = require('../src/models/Product');
const User = require('../src/models/User');
const Order = require('../src/models/Order');

// Empirical test results tracker
const tracker = {
  passed: 0,
  failed: 0,
  tests: [],
};

function assert(condition, testName, details = '') {
  if (condition) {
    tracker.passed++;
    tracker.tests.push({ status: 'PASS', name: testName, details });
    console.log(`  [PASS] ✓ ${testName}`);
  } else {
    tracker.failed++;
    tracker.tests.push({ status: 'FAIL', name: testName, details });
    console.error(`  [FAIL] ✗ ${testName} - ${details}`);
    throw new Error(`Assertion failed: ${testName} - ${details}`);
  }
}

// Global test fixtures
let adminToken = '';
let customerToken = '';
let adminUser = null;
let customerUser = null;
let testProduct = null;
let testOrder = null;

async function setupFixtures() {
  console.log('\n--- Setting up DB and Test Personas ---');
  await connectDB({ forceMemory: true });
  await clearDatabase();
  await seedInitialData({ silent: true });

  adminUser = await User.findOne({ email: 'admin@velvetaura.com' });
  customerUser = await User.findOne({ email: 'customer@velvetaura.com' });

  assert(adminUser && adminUser.role === 'admin', 'Admin persona exists with role admin');
  assert(customerUser && customerUser.role === 'customer', 'Customer persona exists with role customer');

  // Obtain genuine JWT tokens via login
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'admin@velvetaura.com', password: 'AdminPassword123!' });
  assert(adminLogin.status === 200 && adminLogin.body.token, 'Admin login succeeds and returns token');
  adminToken = adminLogin.body.token;

  const customerLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'customer@velvetaura.com', password: 'Password123!' });
  assert(customerLogin.status === 200 && customerLogin.body.token, 'Customer login succeeds and returns token');
  customerToken = customerLogin.body.token;

  testProduct = await Product.findOne({});
  assert(testProduct !== null, 'Seeded test product available in MongoDB');

  // Create a seeded test order for order testing
  testOrder = await Order.create({
    orderNumber: `VA-STRESS-${Date.now()}`,
    user: customerUser._id,
    items: [
      {
        product: testProduct._id,
        name: testProduct.name,
        brand: testProduct.brand,
        origin: testProduct.origin,
        price: testProduct.price,
        quantity: 1,
        image: testProduct.images[0] || 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
      },
    ],
    shippingAddress: {
      fullName: 'Customer Stress',
      street: '14 Rue de Rivoli',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France',
    },
    pricing: {
      subtotal: testProduct.price,
      tax: 10.0,
      shipping: 0.0,
      grandTotal: testProduct.price + 10.0,
    },
    payment: {
      transactionId: `mock_tx_stress_${Date.now()}`,
      method: 'mock_credit_card',
      status: 'succeeded',
      cardLast4: '4242',
    },
    status: 'pending',
  });
  assert(testOrder !== null, 'Seeded test order created in MongoDB');
}

// =========================================================================
// SECTION 1: Security & RBAC Boundary Testing
// =========================================================================
async function probeSecurityAndRbacBoundaries() {
  console.log('\n=================================================================');
  console.log(' SECTION 1: Probing Security & RBAC Boundaries');
  console.log('=================================================================');

  const adminEndpoints = [
    { method: 'post', path: '/api/products', body: { name: 'Unauthorized Item' } },
    { method: 'put', path: `/api/products/${testProduct._id}`, body: { price: 999 } },
    { method: 'delete', path: `/api/products/${testProduct._id}`, body: {} },
    { method: 'get', path: '/api/orders', body: null },
    { method: 'put', path: `/api/orders/${testOrder._id}/status`, body: { status: 'shipped' } },
  ];

  // 1.1: Missing Authorization Header -> 401 Unauthorized
  console.log('\n[Probe 1.1] Missing Authorization Header');
  for (const ep of adminEndpoints) {
    const req = request(app)[ep.method](ep.path);
    if (ep.body) req.send(ep.body);
    const res = await req;
    assert(
      res.status === 401,
      `Unauthenticated ${ep.method.toUpperCase()} ${ep.path} returns 401 Unauthorized`,
      `Actual: ${res.status}`
    );
    assert(res.body.success === false, `Response body success is false for ${ep.path}`);
    assert(
      res.body.message && res.body.message.toLowerCase().includes('not authorized'),
      `Response mentions not authorized: "${res.body.message}"`
    );
  }

  // 1.2: Malformed / Corrupted Bearer Tokens -> 401 Unauthorized
  console.log('\n[Probe 1.2] Malformed & Corrupted Tokens');
  const malformedTokens = [
    { desc: 'Empty Bearer header', header: 'Bearer ' },
    { desc: 'Garbage string', header: 'Bearer totally_corrupt_jwt_not_even_base64' },
    { desc: 'Corrupted signature on admin token', header: `Bearer ${adminToken.slice(0, -6)}xxxxxx` },
    { desc: 'Basic auth header', header: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=' },
    { desc: 'Token scheme', header: `Token ${adminToken}` },
  ];

  for (const m of malformedTokens) {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', m.header);
    assert(res.status === 401, `${m.desc} returns 401 Unauthorized`, `Actual: ${res.status}`);
    assert(res.body.success === false, `${m.desc} response body indicates failure`);
  }

  // 1.3: Regular Customer Token (`customer@velvetaura.com`) -> 403 Forbidden with exact payload
  console.log('\n[Probe 1.3] Customer Token Access to Privileged Endpoints');
  const exactPayload = {
    success: false,
    message: 'Access denied: Administrator privileges required',
    error: 'Forbidden',
  };

  for (const ep of adminEndpoints) {
    const req = request(app)[ep.method](ep.path).set('Authorization', `Bearer ${customerToken}`);
    if (ep.body) req.send(ep.body);
    const res = await req;
    assert(
      res.status === 403,
      `Customer access to ${ep.method.toUpperCase()} ${ep.path} returns 403 Forbidden`,
      `Actual status: ${res.status}`
    );
    assert(
      res.body.success === exactPayload.success,
      `${ep.path} response success === false`
    );
    assert(
      res.body.message === exactPayload.message,
      `${ep.path} message matches exact requirement: "${res.body.message}"`
    );
    assert(
      res.body.error === exactPayload.error,
      `${ep.path} error matches exact requirement: "${res.body.error}"`
    );
  }

  // 1.4: Tampered Role Claim in JWT
  console.log('\n[Probe 1.4] Tampered Role Claims & Cryptographic Forgeries');

  // Case 1.4.1: Tampered signature (attacker modified payload JSON to role: admin without secret)
  const decodedCustomer = jwt.decode(customerToken, { complete: true });
  const tamperedPayload = { ...decodedCustomer.payload, role: 'admin' };
  const tamperedPayloadB64 = Buffer.from(JSON.stringify(tamperedPayload)).toString('base64url');
  const tamperedTokenUnsigned = `${decodedCustomer.header}.${tamperedPayloadB64}.${decodedCustomer.signature}`;

  const tamperedRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${tamperedTokenUnsigned}`);
  assert(
    tamperedRes.status === 401,
    'Unsigned tampered token claiming admin returns 401 Unauthorized',
    `Status: ${tamperedRes.status}`
  );

  // Case 1.4.2: Token signed with a rogue / attacker secret
  const rogueToken = jwt.sign(
    { id: customerUser._id.toString(), role: 'admin' },
    'attacker_rogue_secret_2026'
  );
  const rogueRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${rogueToken}`);
  assert(
    rogueRes.status === 401,
    'Rogue secret signed token claiming admin returns 401 Unauthorized',
    `Status: ${rogueRes.status}`
  );

  // Case 1.4.3: None algorithm attack
  const noneAlgHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const noneToken = `${noneAlgHeader}.${tamperedPayloadB64}.`;
  const noneRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${noneToken}`);
  assert(
    noneRes.status === 401,
    'Alg:none forged token returns 401 Unauthorized',
    `Status: ${noneRes.status}`
  );

  // Case 1.4.4: Valid signature with real secret claiming role: 'admin', but user in DB is 'customer'
  // (protect loads user from DB by decoded.id; req.user.role is 'customer', not admin)
  const spoofedRoleToken = jwt.sign(
    { id: customerUser._id.toString(), role: 'admin' },
    process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure'
  );
  const spoofedRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${spoofedRoleToken}`);
  assert(
    spoofedRes.status === 403,
    'Token claiming role:admin but DB customer returns 403 Forbidden (DB-backed RBAC)',
    `Status: ${spoofedRes.status}`
  );

  // Case 1.4.5: Valid signature with real secret, but non-existent user ID
  const fakeUserId = new mongoose.Types.ObjectId();
  const ghostUserToken = jwt.sign(
    { id: fakeUserId.toString(), role: 'admin' },
    process.env.JWT_SECRET || 'test_jwt_secret_key_velvetaura_2026_super_secure'
  );
  const ghostRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${ghostUserToken}`);
  assert(
    ghostRes.status === 401,
    'Token with non-existent user ID returns 401 (user not found)',
    `Status: ${ghostRes.status}`
  );
}

// =========================================================================
// SECTION 2: Product CRUD Boundary Testing
// =========================================================================
async function probeProductCrudBoundaries() {
  console.log('\n=================================================================');
  console.log(' SECTION 2: Probing Product CRUD Boundaries');
  console.log('=================================================================');

  const baseValidProduct = {
    name: 'Empirical Test Elixir',
    brand: 'Challenger Lab',
    origin: 'Switzerland',
    category: 'skincare',
    description: 'A scientifically validated cell-renewal serum for boundary testing.',
    price: 195.0,
    stock: 25,
  };

  // 2.1: Price Boundaries
  console.log('\n[Probe 2.1] Price Boundaries');

  // Negative price on creation (-10)
  const negPriceRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, price: -10 });
  assert(negPriceRes.status === 400, 'Negative price (-10) on creation returns 400 Bad Request');
  assert(negPriceRes.body.success === false, 'Negative price reports success: false');

  // Negative float price on update (-0.01)
  const negPriceUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ price: -0.01 });
  assert(negPriceUpdateRes.status === 400, 'Negative float price (-0.01) on update returns 400 Bad Request');

  // Non-numeric price ("expensive")
  const nonNumPriceRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, price: 'expensive' });
  assert(nonNumPriceRes.status === 400, 'Non-numeric price ("expensive") returns 400 Bad Request');

  // Non-numeric price on update (null / object)
  const nullPriceUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ price: null });
  assert(nullPriceUpdateRes.status === 400, 'Null price on update returns 400 Bad Request');

  // Zero price handling ($0.00)
  const zeroPriceRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: 'Complimentary Luxury Sample', price: 0 });
  assert(
    zeroPriceRes.status === 201 && zeroPriceRes.body.product.price === 0,
    'Zero price ($0.00) is valid non-negative price, returns 201 Created'
  );
  // Clean up
  if (zeroPriceRes.body.product?._id) {
    await Product.findByIdAndDelete(zeroPriceRes.body.product._id);
  }

  // 2.2: Stock Boundaries
  console.log('\n[Probe 2.2] Stock Boundaries');

  // Negative stock on creation (-5)
  const negStockRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, stock: -5 });
  assert(negStockRes.status === 400, 'Negative stock (-5) on creation returns 400 Bad Request');

  // Negative stock on update (-1)
  const negStockUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ stock: -1 });
  assert(negStockUpdateRes.status === 400, 'Negative stock (-1) on update returns 400 Bad Request');

  // Float stock (3.5) on creation -> floored to integer 3
  const floatStockRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: 'Float Stock Cream', stock: 3.5 });
  assert(floatStockRes.status === 201, 'Float stock (3.5) returns 201 Created');
  assert(floatStockRes.body.product.stock === 3, 'Float stock (3.5) is floored to integer 3');
  await Product.findByIdAndDelete(floatStockRes.body.product._id);

  // Float stock (9.8) on update -> floored to 9
  const floatStockUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ stock: 9.8 });
  assert(floatStockUpdateRes.status === 200, 'Float stock (9.8) on update returns 200 OK');
  assert(floatStockUpdateRes.body.product.stock === 9, 'Float stock on update is floored to integer 9');

  // Non-numeric stock ("in-stock")
  const nonNumStockRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, stock: 'in-stock' });
  assert(nonNumStockRes.status === 400, 'Non-numeric stock returns 400 Bad Request');

  // Negative float stock (-0.5)
  const negFloatStockRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, stock: -0.5 });
  assert(negFloatStockRes.status === 400, 'Negative float stock (-0.5) returns 400 Bad Request');

  // 2.3: Name Boundaries
  console.log('\n[Probe 2.3] Name Boundaries');

  // Empty string name
  const emptyNameRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: '' });
  assert(emptyNameRes.status === 400, 'Empty name ("") returns 400 Bad Request');

  // Whitespace-only name
  const wsNameRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: '    ' });
  assert(wsNameRes.status === 400, 'Whitespace name ("    ") returns 400 Bad Request');

  // Single-character name (< 2 chars, "X")
  const singleCharRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: 'X' });
  assert(singleCharRes.status === 400, 'Single-character name (< 2 chars) returns 400 Bad Request');

  // Single-character name on update
  const singleCharUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Z' });
  assert(singleCharUpdateRes.status === 400, 'Single-character name on update returns 400 Bad Request');

  // Exact 2-character valid boundary name
  const twoCharRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: 'BA' });
  assert(twoCharRes.status === 201, 'Exact 2-character name ("BA") returns 201 Created');
  await Product.findByIdAndDelete(twoCharRes.body.product._id);

  // Overly long name (> 150 chars: 151 chars)
  const longName151 = 'A'.repeat(151);
  const longNameRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: longName151 });
  assert(longNameRes.status === 400, 'Overly long name (151 chars) returns 400 Bad Request');

  // Overly long name on update (160 chars)
  const longNameUpdateRes = await request(app)
    .put(`/api/products/${testProduct._id}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'B'.repeat(160) });
  assert(longNameUpdateRes.status === 400, 'Overly long name (160 chars) on update returns 400 Bad Request');

  // Exact 150-character valid boundary name
  const exact150 = 'C'.repeat(150);
  const exact150Res = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: exact150 });
  assert(exact150Res.status === 201, 'Exact 150-character name returns 201 Created');
  await Product.findByIdAndDelete(exact150Res.body.product._id);

  // 2.4: Category Boundaries
  console.log('\n[Probe 2.4] Category Boundaries');
  const invalidCategories = ['electronics', 'apparel', 'automotive', 'unknown', '', 12345];
  for (const invCat of invalidCategories) {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseValidProduct, category: invCat });
    assert(res.status === 400, `Invalid category (${JSON.stringify(invCat)}) returns 400 Bad Request`);
  }

  const validCategories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
  for (const cat of validCategories) {
    const res = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ ...baseValidProduct, name: `Valid Cat Product ${cat}`, category: cat });
    assert(res.status === 201, `Valid category "${cat}" returns 201 Created`);
    assert(res.body.product.category === cat, `Persisted category is "${cat}"`);
    await Product.findByIdAndDelete(res.body.product._id);
  }

  // Case-insensitivity support ('SKINCARE', 'Cosmetics')
  const mixedCaseRes = await request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ ...baseValidProduct, name: 'Mixed Case Category Product', category: 'SKINCARE' });
  assert(mixedCaseRes.status === 201, 'Upper-case category "SKINCARE" accepted and returns 201');
  assert(mixedCaseRes.body.product.category === 'skincare', 'Category normalized to lowercase "skincare"');
  await Product.findByIdAndDelete(mixedCaseRes.body.product._id);

  // 2.5: Product ID Boundaries
  console.log('\n[Probe 2.5] Product ID Boundaries');
  const nonExistentId = new mongoose.Types.ObjectId();

  // Non-existent ObjectId for PUT -> 404
  const put404Res = await request(app)
    .put(`/api/products/${nonExistentId}`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ price: 299 });
  assert(put404Res.status === 404, 'PUT /api/products/:nonExistentId returns 404 Not Found');

  // Non-existent ObjectId for DELETE -> 404
  const delete404Res = await request(app)
    .delete(`/api/products/${nonExistentId}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(delete404Res.status === 404, 'DELETE /api/products/:nonExistentId returns 404 Not Found');

  // Invalid hex ObjectIds for PUT -> 400
  const malformedIds = ['invalid-id', '123', '66184a51e6b3dfa82c41890g', 'null'];
  for (const mId of malformedIds) {
    const resPut = await request(app)
      .put(`/api/products/${mId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ price: 100 });
    assert(resPut.status === 400, `PUT /api/products/${mId} returns 400 Bad Request`);

    const resDel = await request(app)
      .delete(`/api/products/${mId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    assert(resDel.status === 400, `DELETE /api/products/${mId} returns 400 Bad Request`);
  }

  // 2.6: Deleting Already Deleted Product
  console.log('\n[Probe 2.6] Double-Deletion / Idempotent 404 Verification');
  const tempProd = await Product.create({
    name: 'Ephemeral Double-Delete Test Product',
    brand: 'Ephemeral',
    origin: 'France',
    category: 'skincare',
    description: 'This product will be created, deleted once (200), and deleted again (404).',
    price: 150.0,
    stock: 5,
  });

  const firstDel = await request(app)
    .delete(`/api/products/${tempProd._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(firstDel.status === 200, 'First DELETE returns 200 OK');

  const secondDel = await request(app)
    .delete(`/api/products/${tempProd._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(secondDel.status === 404, 'Second DELETE of already deleted product returns 404 Not Found');
}

// =========================================================================
// SECTION 3: Order Status Boundary Testing
// =========================================================================
async function probeOrderStatusBoundaries() {
  console.log('\n=================================================================');
  console.log(' SECTION 3: Probing Order Status Boundaries');
  console.log('=================================================================');

  // 3.1: Invalid Status Strings -> 400 Bad Request
  console.log('\n[Probe 3.1] Invalid Order Status Strings');
  const invalidStatuses = ['refunded', 'unknown', '', 123, null, true, 'PENDING_EXTRA', 'returned'];
  for (const invStatus of invalidStatuses) {
    const res = await request(app)
      .put(`/api/orders/${testOrder._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: invStatus });
    assert(
      res.status === 400,
      `Status ${JSON.stringify(invStatus)} rejected with 400 Bad Request`,
      `Actual: ${res.status}`
    );
    assert(res.body.success === false, 'Invalid status response indicates failure');
    assert(res.body.message.includes('Allowed:'), 'Invalid status error message enumerates allowed values');
  }

  // 3.2: Valid Status Strings -> 200 OK across entire lifecycle
  console.log('\n[Probe 3.2] Valid Status Lifecycle Transitions');
  const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];

  for (const st of validStatuses) {
    const res = await request(app)
      .put(`/api/orders/${testOrder._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: st });
    assert(res.status === 200, `Order status transition to "${st}" returns 200 OK`);
    assert(res.body.success === true, `Status update to "${st}" response reports success: true`);
    assert(res.body.order.status === st, `Returned order document status is "${st}"`);

    // Verify database reflection
    const dbOrder = await Order.findById(testOrder._id);
    assert(dbOrder.status === st, `MongoDB document persisted status matches "${st}"`);
  }

  // PATCH alias support
  const patchRes = await request(app)
    .patch(`/api/orders/${testOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'processing' });
  assert(patchRes.status === 200, 'PATCH /api/orders/:id/status alias returns 200 OK');
  assert(patchRes.body.order.status === 'processing', 'PATCH alias updated status to processing');

  // 3.3: Order ID Boundaries
  console.log('\n[Probe 3.3] Order ID Boundaries');
  const nonExistentOrderId = new mongoose.Types.ObjectId();
  const order404Res = await request(app)
    .put(`/api/orders/${nonExistentOrderId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'shipped' });
  assert(order404Res.status === 404, 'PUT /api/orders/:nonExistentId/status returns 404 Not Found');

  const malformedOrderRes = await request(app)
    .put('/api/orders/bad-order-id-hex/status')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'shipped' });
  assert(malformedOrderRes.status === 400, 'PUT /api/orders/:malformedId/status returns 400 Bad Request');
}

// =========================================================================
// SECTION 4: High Concurrency / Race Condition Testing
// =========================================================================
async function probeHighConcurrency() {
  console.log('\n=================================================================');
  console.log(' SECTION 4: Probing High Concurrency & Race Conditions');
  console.log('=================================================================');

  // 4.1: Rapid Concurrent Product Updates (20 concurrent requests)
  console.log('\n[Probe 4.1] 20 Concurrent Product Updates on Same Document');
  const concurrentProduct = await Product.create({
    name: 'Concurrent Stress Cream',
    brand: 'StressLab',
    origin: 'France',
    category: 'skincare',
    description: 'A product designed to withstand simultaneous concurrent PUT requests.',
    price: 100.0,
    stock: 50,
  });

  const updatePromises = [];
  for (let i = 1; i <= 20; i++) {
    updatePromises.push(
      request(app)
        .put(`/api/products/${concurrentProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          price: 100 + i,
          stock: 50 + i,
          description: `Concurrent update iteration ${i} with enriched antioxidant formula.`,
        })
    );
  }

  const updateResults = await Promise.all(updatePromises);
  const allSuccessful = updateResults.every((res) => res.status === 200 && res.body.success === true);
  assert(allSuccessful, 'All 20 concurrent product updates succeeded with 200 OK');

  const finalDbProduct = await Product.findById(concurrentProduct._id);
  assert(
    finalDbProduct.price >= 101 && finalDbProduct.price <= 120,
    `Final product price is within concurrent range (${finalDbProduct.price})`
  );
  assert(
    finalDbProduct.stock >= 51 && finalDbProduct.stock <= 70,
    `Final product stock is within concurrent range (${finalDbProduct.stock})`
  );

  // 4.2: Rapid Concurrent Order Status Updates (20 concurrent requests)
  console.log('\n[Probe 4.2] 20 Concurrent Order Status Updates');
  const allowedCycle = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];
  const orderUpdatePromises = [];
  for (let i = 0; i < 20; i++) {
    const chosenStatus = allowedCycle[i % allowedCycle.length];
    orderUpdatePromises.push(
      request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: chosenStatus })
    );
  }

  const orderUpdateResults = await Promise.all(orderUpdatePromises);
  const allOrdersSuccessful = orderUpdateResults.every((res) => res.status === 200 && res.body.success === true);
  assert(allOrdersSuccessful, 'All 20 concurrent order status updates succeeded with 200 OK');

  const finalDbOrder = await Order.findById(testOrder._id);
  assert(
    allowedCycle.includes(finalDbOrder.status),
    `Final DB order status is a valid enum value ("${finalDbOrder.status}")`
  );

  // 4.3: Concurrent Product Creations & Concurrent Bulk Deletions
  console.log('\n[Probe 4.3] 10 Concurrent Product Creations followed by 10 Concurrent Deletions');
  const createPromises = [];
  for (let i = 1; i <= 10; i++) {
    createPromises.push(
      request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Concurrent Product Batch ${i}`,
          brand: 'ConcurrencyCorp',
          origin: 'Italy',
          category: 'fragrances',
          description: `Description for concurrent batch item number ${i} with fine notes.`,
          price: 50.0 + i,
          stock: 10 + i,
        })
    );
  }

  const createResults = await Promise.all(createPromises);
  const allCreationsSuccess = createResults.every((r) => r.status === 201 && r.body.success === true);
  assert(allCreationsSuccess, 'All 10 concurrent product creations succeeded with 201 Created');

  const createdIds = createResults.map((r) => r.body.product._id);
  assert(createdIds.length === 10, '10 unique product IDs generated');

  // Now delete all 10 concurrently
  const deletePromises = createdIds.map((id) =>
    request(app)
      .delete(`/api/products/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
  );

  const deleteResults = await Promise.all(deletePromises);
  const allDeletionsSuccess = deleteResults.every((r) => r.status === 200 && r.body.success === true);
  assert(allDeletionsSuccess, 'All 10 concurrent product deletions succeeded with 200 OK');

  const remainingInDb = await Product.find({ _id: { $in: createdIds } });
  assert(remainingInDb.length === 0, 'All 10 concurrently deleted products are completely purged from MongoDB');

  // Clean up concurrentProduct
  await Product.findByIdAndDelete(concurrentProduct._id);
}

// =========================================================================
// MAIN RUNNER
// =========================================================================
async function main() {
  console.log('=================================================================');
  console.log(' VelvetAura M5 Empirical Adversarial Stress Harness');
  console.log(' Challenger: teamwork_challenger_m5_1');
  console.log('=================================================================');

  try {
    await setupFixtures();
    await probeSecurityAndRbacBoundaries();
    await probeProductCrudBoundaries();
    await probeOrderStatusBoundaries();
    await probeHighConcurrency();

    console.log('\n=================================================================');
    console.log(` EMPIRICAL CHALLENGE SUMMARY: ${tracker.passed} PASSED, ${tracker.failed} FAILED`);
    console.log('=================================================================');

    await disconnectDB();
    process.exit(tracker.failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('\nCRITICAL EMPIRICAL CHALLENGE FAILURE:', err);
    try {
      await disconnectDB();
    } catch (e) {
      // Ignore disconnect error on failure
    }
    process.exit(1);
  }
}

main();
