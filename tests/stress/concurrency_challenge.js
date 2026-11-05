/**
 * VelvetAura - Concurrency, Fault-Injection & State Boundary Stress Suite
 * 
 * Empirically challenges:
 * 1. Seed verification (24 products, 3 demo users, bcrypt hashing)
 * 2. Concurrency & Race Conditions:
 *    - Binary concurrent checkout (2 concurrent requests, stock = 1)
 *    - 5-way stampede concurrent checkout (5 concurrent requests, stock = 1)
 *    - Multi-item partial decrement compensation rollback under race
 * 3. Dual-mode DB resilience:
 *    - Unreachable external MongoDB timeout and graceful fallback to MongoMemoryServer
 *    - Idempotent connect / disconnect lifecycle
 *    - Auto-seeding on fresh memory boot
 */

const { execSync } = require('child_process');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const {
  connectDB,
  disconnectDB,
  getDbMode,
  isInMemory,
} = require('../../src/config/db');
const Product = require('../../src/models/Product');
const User = require('../../src/models/User');
const Cart = require('../../src/models/Cart');
const Order = require('../../src/models/Order');
const { seedInitialData, demoUsers } = require('../../src/data/seed');

const validPayment = {
  cardNumber: '4242424242424242',
  expDate: '12/28',
  cvv: '123',
  cardHolder: 'Stress Customer',
  brand: 'Visa',
};

const validAddress = {
  fullName: 'Stress Customer',
  street: '100 Concorde Blvd',
  city: 'Paris',
  state: 'Ile-de-France',
  zip: '75008',
  country: 'France',
};

async function runConcurrencyAndFaultInjectionSuite() {
  console.log('===============================================================');
  console.log(' VelvetAura Concurrency, Fault-Injection & Resilience Suite    ');
  console.log('===============================================================\n');

  let passedAssertions = 0;
  let failedAssertions = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  [FAIL] ✗ ${message}`);
      failedAssertions++;
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  [PASS] ✓ ${message}`);
      passedAssertions++;
    }
  }

  // =========================================================================
  // CHALLENGE 1: Seed Verification (CLI & Programmatic)
  // =========================================================================
  console.log('\n--- Challenge 1: Seed Script & Data Integrity Verification ---');
  {
    // Test CLI execution
    console.log('[Test 1.1] Executing npm run seed via CLI...');
    const seedOutput = execSync('npm run seed', { encoding: 'utf8', cwd: process.cwd() });
    assert(seedOutput.includes('Products seeded: 24') || seedOutput.includes('24'), 'CLI seed output reports 24 products seeded');
    assert(seedOutput.includes('Demo users created') || seedOutput.includes('3 demo customer'), 'CLI seed output reports demo accounts created');

    // Connect DB to verify persistence
    await connectDB({ forceMemory: true });

    // Verify Product count
    const productCount = await Product.countDocuments();
    assert(productCount === 24, `MongoDB holds exactly 24 luxury beauty products (actual: ${productCount})`);

    // Verify Demo Users
    const userCount = await User.countDocuments();
    assert(userCount >= 3, `MongoDB holds at least 3 seeded users (actual: ${userCount})`);

    // Verify demo admin
    const adminUser = await User.findOne({ email: 'admin@velvetaura.com' });
    assert(adminUser !== null, 'Admin account admin@velvetaura.com exists');
    assert(adminUser.role === 'admin', 'Admin account has role="admin"');
    const adminAuth = await adminUser.matchPassword('AdminPassword123!');
    assert(adminAuth === true, 'Admin password hashes and validates correctly with bcrypt');

    // Verify demo customer
    const customerUser = await User.findOne({ email: 'customer@velvetaura.com' });
    assert(customerUser !== null, 'Customer account customer@velvetaura.com exists');
    assert(customerUser.role === 'customer', 'Customer account has role="customer"');
    const customerAuth = await customerUser.matchPassword('Password123!');
    assert(customerAuth === true, 'Customer password hashes and validates correctly with bcrypt');

    // Verify demo customer minji
    const minjiUser = await User.findOne({ email: 'minji@velvetaura.com' });
    assert(minjiUser !== null, 'Customer account minji@velvetaura.com exists');
    const minjiAuth = await minjiUser.matchPassword('Password123!');
    assert(minjiAuth === true, 'Min-ji password hashes and validates correctly with bcrypt');

    // Verify Carts were provisioned for demo users
    const adminCart = await Cart.findOne({ user: adminUser._id });
    const customerCart = await Cart.findOne({ user: customerUser._id });
    assert(adminCart !== null && customerCart !== null, 'Active Carts exist for seeded demo users');

    // Verify REST API login works for demo accounts
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'customer@velvetaura.com',
      password: 'Password123!',
    });
    assert(loginRes.status === 200, 'REST API login succeeds for seeded customer');
    assert(typeof loginRes.body.token === 'string', 'JWT token returned on customer login');
  }

  // =========================================================================
  // CHALLENGE 2: Concurrency & Race Conditions on Checkout (stock = 1)
  // =========================================================================
  console.log('\n--- Challenge 2: Concurrency & Race Conditions (Limited Inventory stock = 1) ---');
  {
    // Test 2A: Binary Race (2 simultaneous checkouts for stock = 1)
    console.log('[Test 2A] Binary Race: 2 simultaneous checkouts competing for product with stock = 1...');
    
    // Create unique limited stock product
    const limitedProduct = await Product.create({
      name: 'Ultra Rare Orchid Elixir',
      brand: 'Guerlain Exclusive',
      origin: 'France',
      category: 'skincare',
      price: 450.00,
      stock: 1, // Only 1 in stock!
      description: 'Single bottle vault item.',
    });

    // Create 2 test users
    const userA = await User.create({
      name: 'Racer A',
      email: `racer_a_${Date.now()}@velvetaura.test`,
      password: 'Password123!',
      address: validAddress,
    });
    const userB = await User.create({
      name: 'Racer B',
      email: `racer_b_${Date.now()}@velvetaura.test`,
      password: 'Password123!',
      address: validAddress,
    });

    const tokenA = (await request(app).post('/api/auth/login').send({ email: userA.email, password: 'Password123!' })).body.token;
    const tokenB = (await request(app).post('/api/auth/login').send({ email: userB.email, password: 'Password123!' })).body.token;

    // Both users add 1 unit to their carts
    const addResA = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ productId: limitedProduct._id.toString(), quantity: 1 });
    assert(addResA.status === 200, 'User A successfully added product to cart');

    const addResB = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ productId: limitedProduct._id.toString(), quantity: 1 });
    assert(addResB.status === 200, 'User B successfully added product to cart');

    // Trigger concurrent checkouts simultaneously
    console.log('  Firing Promise.all([checkoutA, checkoutB]) simultaneously...');
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ shippingAddress: validAddress, paymentDetails: validPayment }),
      request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ shippingAddress: validAddress, paymentDetails: validPayment }),
    ]);

    const statuses = [resA.status, resB.status];
    console.log(`  Received HTTP statuses: User A = ${resA.status}, User B = ${resB.status}`);

    const successes = [resA, resB].filter((r) => r.status === 201 || r.status === 200);
    const failures = [resA, resB].filter((r) => r.status === 400);

    assert(successes.length === 1, `Exactly ONE concurrent checkout succeeded (expected 1, got ${successes.length})`);
    assert(failures.length === 1, `Exactly ONE concurrent checkout failed with HTTP 400 (expected 1, got ${failures.length})`);
    
    assert(successes[0].body.success === true, 'Successful response has success: true');
    assert(typeof successes[0].body.transactionId === 'string', 'Successful response includes transactionId');
    assert(failures[0].body.success === false, 'Failed response has success: false');
    assert(
      failures[0].body.error === 'Insufficient stock' || failures[0].body.message.includes('Insufficient'),
      `Failed response indicates Insufficient stock (got error: "${failures[0].body.error}", message: "${failures[0].body.message}")`
    );

    // Verify database stock state
    const postRaceProduct = await Product.findById(limitedProduct._id);
    assert(postRaceProduct.stock === 0, `Product stock is strictly 0 (never negative, actual: ${postRaceProduct.stock})`);

    // Verify orders created in DB
    const matchingOrders = await Order.find({ 'items.product': limitedProduct._id });
    assert(matchingOrders.length === 1, `Exactly 1 order exists in database for limited product (actual: ${matchingOrders.length})`);

    // Determine winner and loser
    const winnerUser = successes[0] === resA ? userA : userB;
    const loserUser = successes[0] === resA ? userB : userA;
    const winnerToken = successes[0] === resA ? tokenA : tokenB;
    const loserToken = successes[0] === resA ? tokenB : tokenA;

    // Verify winner cart is cleared
    const winnerCartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${winnerToken}`);
    assert(winnerCartRes.body.cart.items.length === 0, 'Winner cart is cleared after successful checkout');

    // Verify loser cart still retains item for graceful recovery
    const loserCartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${loserToken}`);
    assert(loserCartRes.body.cart.items.length === 1, 'Loser cart retains items for retry/removal');

    // Test 2B: High Concurrency Stampede (5 simultaneous checkouts competing for stock = 1)
    console.log('\n[Test 2B] Stampede: 5 simultaneous checkouts competing for product with stock = 1...');
    const stampedeProduct = await Product.create({
      name: 'Single Batch Truffle Balm',
      brand: 'Alba Botanica Luxury',
      origin: 'Italy',
      category: 'skincare',
      price: 320.00,
      stock: 1, // Only 1!
      description: 'Ultra-rare formulation.',
    });

    const stampedeUsers = [];
    const stampedeTokens = [];

    for (let i = 0; i < 5; i++) {
      const u = await User.create({
        name: `Stampede User ${i}`,
        email: `stampede_${i}_${Date.now()}@velvetaura.test`,
        password: 'Password123!',
        address: validAddress,
      });
      const t = (await request(app).post('/api/auth/login').send({ email: u.email, password: 'Password123!' })).body.token;
      
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${t}`)
        .send({ productId: stampedeProduct._id.toString(), quantity: 1 });

      stampedeUsers.push(u);
      stampedeTokens.push(t);
    }

    console.log('  Dispatching 5 simultaneous checkout requests via Promise.all...');
    const stampedeResponses = await Promise.all(
      stampedeTokens.map((tok) =>
        request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${tok}`)
          .send({ shippingAddress: validAddress, paymentDetails: validPayment })
      )
    );

    const stampedeSuccesses = stampedeResponses.filter((r) => r.status === 201 || r.status === 200);
    const stampedeFailures = stampedeResponses.filter((r) => r.status === 400);

    console.log(`  Stampede results: Successes = ${stampedeSuccesses.length}, Failures = ${stampedeFailures.length}`);
    assert(stampedeSuccesses.length === 1, `Exactly ONE order succeeded out of 5 concurrent requests`);
    assert(stampedeFailures.length === 4, `Exactly 4 orders rejected with HTTP 400 Insufficient stock`);

    const postStampedeProduct = await Product.findById(stampedeProduct._id);
    assert(postStampedeProduct.stock === 0, `Stampede product stock is strictly 0 (never negative, actual: ${postStampedeProduct.stock})`);

    const stampedeOrders = await Order.find({ 'items.product': stampedeProduct._id });
    assert(stampedeOrders.length === 1, `Exactly 1 order exists in database (actual: ${stampedeOrders.length})`);

    // Test 2C: Multi-Item Atomic Decrement with Compensation Rollback under Race
    console.log('\n[Test 2C] Multi-Item Race with Partial Decrement Compensation Rollback...');
    // ProdA has stock = 5
    // ProdB has stock = 1 (bottleneck)
    const prodA = await Product.create({
      name: 'Common Rose Essence',
      brand: 'Velvet Rose',
      origin: 'Bulgaria',
      category: 'skincare',
      price: 40.00,
      stock: 5,
      description: 'Abundant stock product.',
    });
    const prodB = await Product.create({
      name: 'Bottleneck Night Oil',
      brand: 'Velvet Night',
      origin: 'Morocco',
      category: 'skincare',
      price: 150.00,
      stock: 1, // Bottleneck!
      description: 'Bottleneck product.',
    });

    const user1 = await User.create({
      name: 'Multi User 1',
      email: `multi_1_${Date.now()}@velvetaura.test`,
      password: 'Password123!',
      address: validAddress,
    });
    const user2 = await User.create({
      name: 'Multi User 2',
      email: `multi_2_${Date.now()}@velvetaura.test`,
      password: 'Password123!',
      address: validAddress,
    });

    const tok1 = (await request(app).post('/api/auth/login').send({ email: user1.email, password: 'Password123!' })).body.token;
    const tok2 = (await request(app).post('/api/auth/login').send({ email: user2.email, password: 'Password123!' })).body.token;

    // Both carts want ProdA (qty 2) and ProdB (qty 1)
    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${tok1}`).send({ productId: prodA._id.toString(), quantity: 2 });
    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${tok1}`).send({ productId: prodB._id.toString(), quantity: 1 });

    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${tok2}`).send({ productId: prodA._id.toString(), quantity: 2 });
    await request(app).post('/api/cart/items').set('Authorization', `Bearer ${tok2}`).send({ productId: prodB._id.toString(), quantity: 1 });

    console.log('  Dispatching 2 multi-item checkouts competing for bottleneck item ProdB...');
    const [multiRes1, multiRes2] = await Promise.all([
      request(app).post('/api/orders/checkout').set('Authorization', `Bearer ${tok1}`).send({ shippingAddress: validAddress, paymentDetails: validPayment }),
      request(app).post('/api/orders/checkout').set('Authorization', `Bearer ${tok2}`).send({ shippingAddress: validAddress, paymentDetails: validPayment }),
    ]);

    const multiSucc = [multiRes1, multiRes2].filter((r) => r.status === 201 || r.status === 200);
    const multiFail = [multiRes1, multiRes2].filter((r) => r.status === 400);

    assert(multiSucc.length === 1, 'Exactly one multi-item checkout succeeded');
    assert(multiFail.length === 1, 'The competing checkout failed with HTTP 400 Insufficient stock');

    const updatedProdA = await Product.findById(prodA._id);
    const updatedProdB = await Product.findById(prodB._id);

    // Initial prodA was 5. One successful order bought 2. Final must be EXACTLY 3.
    // If the failed order decremented prodA and didn't roll it back, stock would be 1!
    assert(updatedProdA.stock === 3, `Abundant ProdA stock rolled back properly to 3 (5 - 2 = 3, actual: ${updatedProdA.stock})`);
    assert(updatedProdB.stock === 0, `Bottleneck ProdB stock is strictly 0 (actual: ${updatedProdB.stock})`);
  }

  // =========================================================================
  // CHALLENGE 3: Dual-Mode DB Resilience & Fallback
  // =========================================================================
  console.log('\n--- Challenge 3: Dual-Mode DB Resilience & Fallback ---');
  {
    // Test 3A: Idempotent connection test
    console.log('[Test 3A] Testing connection idempotency...');
    const conn1 = await connectDB();
    const conn2 = await connectDB();
    assert(conn1 === conn2, 'Subsequent connectDB() calls return the identical active mongoose connection');
    assert(getDbMode() === 'memory', 'Current DB mode is reported as "memory"');
    assert(isInMemory() === true, 'isInMemory() returns true');

    // Test 3B: Graceful Disconnect
    console.log('[Test 3B] Testing disconnectDB() teardown...');
    await disconnectDB();
    assert(getDbMode() === 'disconnected', 'getDbMode() returns "disconnected" after teardown');
    assert(mongoose.connection.readyState === 0, 'Mongoose readyState is 0 (disconnected)');

    // Test 3C: Unreachable External MongoDB Fallback within timeout
    console.log('[Test 3C] Testing unreachable external MongoDB timeout and fallback to MongoMemoryServer...');
    // Configure unreachable external URI
    process.env.MONGODB_URI = 'mongodb://10.255.255.1:65432/velvetaura_unreachable';
    delete process.env.USE_MEMORY_DB; // Ensure forceMemory flag is not set

    const startTime = Date.now();
    const fallbackConn = await connectDB({
      forceMemory: false,
      timeoutMS: 1500, // Short timeout
      autoSeed: false,
    });
    const elapsed = Date.now() - startTime;

    console.log(`  Fallback resolved in ${elapsed}ms`);
    assert(fallbackConn !== null, 'Connection established successfully despite unreachable external URI');
    assert(getDbMode() === 'memory', 'Database gracefully fell back to in-memory mode ("memory")');
    assert(isInMemory() === true, 'isInMemory() returns true following fallback');
    assert(elapsed >= 1400, `External connection observed timeout period (elapsed: ${elapsed}ms >= 1400ms)`);

    // Verify operations execute properly on the fallback connection
    const testDoc = await User.create({
      name: 'Fallback Verification User',
      email: `fallback_${Date.now()}@velvetaura.test`,
      password: 'Password123!',
    });
    assert(testDoc._id !== undefined, 'Successfully executed write to in-memory fallback database');
    const fetchedDoc = await User.findById(testDoc._id);
    assert(fetchedDoc.email === testDoc.email, 'Successfully executed read from in-memory fallback database');

    // Clean up
    await disconnectDB();
    // Restore default URI
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/velvetaura';
  }

  console.log('\n===============================================================');
  console.log('      Concurrency & Resilience Verification Summary           ');
  console.log('===============================================================');
  console.log(`  Passed Assertions: ${passedAssertions}`);
  console.log(`  Failed Assertions: ${failedAssertions}`);
  console.log('===============================================================\n');

  if (failedAssertions > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Execute harness
runConcurrencyAndFaultInjectionSuite().catch((err) => {
  console.error('[Concurrency Suite FATAL Error]:', err);
  process.exit(1);
});
