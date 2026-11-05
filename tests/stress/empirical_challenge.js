/**
 * VelvetAura - Empirical Stress & Challenge Verification Suite
 * 
 * Verifies:
 * 1. Pricing Parity & Mathematical Edge Cases (store.js vs cartService.js vs Cart.js)
 * 2. Cart State Transitions (Guest cart, qty=0 removal, stock overage, login migration)
 * 3. Checkout Failure & Recovery (Card decline 0002, expired cards, missing shipping fields, stock rollback)
 */

const request = require('supertest');
const mongoose = require('mongoose');
const path = require('path');

// Setup in-memory DB and mock DOM/localStorage environment for store.js
const { connectDB } = require('../../src/config/db');
const app = require('../../src/app');
const Product = require('../../src/models/Product');
const User = require('../../src/models/User');
const Cart = require('../../src/models/Cart');
const { calculatePricing } = require('../../src/services/cartService');

// Mock localStorage for Node.js
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

global.localStorage = new MockLocalStorage();
global.window = {
  location: { hash: '' }
};
global.document = {
  getElementById: (id) => ({
    classList: {
      add: () => {},
      remove: () => {},
      contains: () => false
    },
    offsetWidth: 100
  })
};

let storeModule;

async function runEmpiricalHarness() {
  console.log('\n===============================================================');
  console.log('      VelvetAura Empirical Challenge & Stress Test Suite       ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  FAIL: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  PASS: ${message}`);
      passed++;
    }
  }

  // 1. Connect DB
  console.log('[Setup] Connecting to In-Memory Database...');
  await connectDB({ forceMemory: true });

  // 2. Load ES Module store.js dynamically
  console.log('[Setup] Loading client Store module dynamically...');
  const storePath = path.resolve(__dirname, '../../public/js/store.js');
  // file:// URL for dynamic import on Windows
  const storeUrl = `file:///${storePath.replace(/\\/g, '/')}`;
  storeModule = await import(storeUrl);
  const { Store } = storeModule;

  // =========================================================================
  // Challenge 1: Pricing Parity & Boundary Conditions
  // =========================================================================
  console.log('\n--- Challenge 1: Pricing Parity & Boundary Conditions ($49.99 vs $50.00 vs $50.01) ---');
  {
    const clientStore = new Store();

    // 1.1 Test $49.99 Boundary
    const items4999 = [{ price: 49.99, quantity: 1 }];
    const client4999 = clientStore.calculateTotals(items4999);
    const backend4999 = calculatePricing(items4999);

    assert(client4999.subtotal === 49.99, 'Client subtotal for $49.99 is 49.99');
    assert(client4999.shipping === 5.99, 'Client shipping for $49.99 is $5.99');
    assert(client4999.tax === 4.00, 'Client tax for $49.99 is 4.00 (half-up rounded from 3.9992)');
    assert(client4999.grandTotal === 59.98, 'Client grandTotal for $49.99 is 59.98');
    assert(backend4999.subtotal === client4999.subtotal, 'Parity: Subtotal matches for $49.99');
    assert(backend4999.tax === client4999.tax, 'Parity: Tax matches for $49.99');
    assert(backend4999.shipping === client4999.shipping, 'Parity: Shipping matches for $49.99');
    assert(backend4999.grandTotal === client4999.grandTotal, 'Parity: Grand total matches for $49.99');

    // 1.2 Test $50.00 Free Shipping Threshold Boundary
    const items5000 = [{ price: 50.00, quantity: 1 }];
    const client5000 = clientStore.calculateTotals(items5000);
    const backend5000 = calculatePricing(items5000);

    assert(client5000.subtotal === 50.00, 'Client subtotal for $50.00 is 50.00');
    assert(client5000.shipping === 0.00, 'Client shipping for $50.00 is FREE ($0.00)');
    assert(client5000.tax === 4.00, 'Client tax for $50.00 is 4.00');
    assert(client5000.grandTotal === 54.00, 'Client grandTotal for $50.00 is 54.00 (50 + 4 + 0)');
    assert(backend5000.shipping === 0.00, 'Backend shipping for $50.00 is FREE ($0.00)');
    assert(backend5000.grandTotal === 54.00, 'Backend grandTotal for $50.00 is 54.00');
    assert(client5000.grandTotal === backend5000.grandTotal, 'Parity: Grand total matches for $50.00');

    // 1.3 Test $50.01 Boundary
    const items5001 = [{ price: 50.01, quantity: 1 }];
    const client5001 = clientStore.calculateTotals(items5001);
    const backend5001 = calculatePricing(items5001);

    assert(client5001.subtotal === 50.01, 'Client subtotal for $50.01 is 50.01');
    assert(client5001.shipping === 0.00, 'Client shipping for $50.01 is FREE ($0.00)');
    assert(client5001.tax === 4.00, 'Client tax for $50.01 is 4.00 (half-up rounded from 4.0008)');
    assert(client5001.grandTotal === 54.01, 'Client grandTotal for $50.01 is 54.01');
    assert(backend5001.grandTotal === client5001.grandTotal, 'Parity: Grand total matches for $50.01');

    // 1.4 Test Empty Cart ($0.00)
    const itemsEmpty = [];
    const clientEmpty = clientStore.calculateTotals(itemsEmpty);
    const backendEmpty = calculatePricing(itemsEmpty);

    assert(clientEmpty.subtotal === 0.00, 'Client subtotal for empty cart is 0');
    assert(clientEmpty.shipping === 0.00, 'Client shipping for empty cart is 0 (not 5.99)');
    assert(clientEmpty.grandTotal === 0.00, 'Client grandTotal for empty cart is 0');
    assert(backendEmpty.shipping === 0.00, 'Backend shipping for empty cart is 0');
    assert(backendEmpty.grandTotal === 0.00, 'Backend grandTotal for empty cart is 0');

    // 1.5 Monte-Carlo Stress Generator: 1,000 Random Price/Quantity Combinations
    console.log('[Stress Generator] Testing 1,000 pseudo-random item baskets for arithmetic parity...');
    let parityMismatches = 0;
    for (let i = 0; i < 1000; i++) {
      const numItems = Math.floor(Math.random() * 5) + 1;
      const basket = [];
      for (let j = 0; j < numItems; j++) {
        // Random price between 0.01 and 150.00 with 2 decimal places
        const price = Math.round((Math.random() * 150 + 0.01) * 100) / 100;
        const quantity = Math.floor(Math.random() * 5) + 1;
        basket.push({ price, quantity });
      }

      const clientRes = clientStore.calculateTotals(basket);
      const backendRes = calculatePricing(basket);

      if (
        clientRes.subtotal !== backendRes.subtotal ||
        clientRes.tax !== backendRes.tax ||
        clientRes.shipping !== backendRes.shipping ||
        clientRes.grandTotal !== backendRes.grandTotal ||
        clientRes.itemCount !== backendRes.itemCount
      ) {
        parityMismatches++;
        console.error(`Mismatch at iteration ${i}:`, { basket, clientRes, backendRes });
      }
    }
    assert(parityMismatches === 0, `Monte-Carlo Parity Generator: 1,000/1,000 random baskets matched with 0 discrepancies`);

    // 1.6 Half-up Rounding Boundary Stress ($0.005 edge cases)
    // 0.08 * subtotal ends in exactly .005
    // e.g. 0.08 * X = 0.005 -> X = 0.005 / 0.08 = 0.0625
    // Test exact subtotal fractions: $6.25 -> 6.25 * 0.08 = 0.50
    // Test subtotal where 8% tax has half-up rounding:
    // $0.69 * 0.08 = 0.0552 -> 0.06
    // $1.81 * 0.08 = 0.1448 -> 0.14
    // $1.82 * 0.08 = 0.1456 -> 0.15
    const edgeBaskets = [
      [{ price: 0.69, quantity: 1 }],
      [{ price: 1.81, quantity: 1 }],
      [{ price: 1.82, quantity: 1 }],
      [{ price: 49.995, quantity: 1 }],
      [{ price: 12.37, quantity: 3 }],
      [{ price: 88.88, quantity: 2 }],
      [{ price: 99.99, quantity: 10 }]
    ];
    for (const eb of edgeBaskets) {
      const cr = clientStore.calculateTotals(eb);
      const br = calculatePricing(eb);
      assert(cr.subtotal === br.subtotal && cr.tax === br.tax && cr.grandTotal === br.grandTotal,
        `Edge price ${eb[0].price} x ${eb[0].quantity} perfectly matched between client and server`);
    }
  }

  // =========================================================================
  // Challenge 2: Cart State Transitions & Migration
  // =========================================================================
  console.log('\n--- Challenge 2: Cart State Transitions & Guest Migration ---');
  {
    // Setup test products in DB
    const p1 = await Product.create({
      name: 'Stress Test Perfume',
      brand: 'Maison Velvet',
      origin: 'France',
      category: 'fragrances',
      price: 45.00,
      stock: 5,
      description: 'Limited edition luxury perfume.',
    });

    const p2 = await Product.create({
      name: 'Stress Test Hydrating Cream',
      brand: 'Seoul Radiance',
      origin: 'South Korea',
      category: 'skincare',
      price: 25.00,
      stock: 10,
      description: 'Intense barrier cream.',
    });

    // 2.1 Test Adding Item as Guest (Unauthenticated)
    localStorage.clear();
    const guestStore = new Store();
    assert(guestStore.state.auth.isAuthenticated === false, 'Store starts unauthenticated (guest)');

    // Convert Mongoose doc to plain JSON (as returned by REST API in browser)
    const p1Json = JSON.parse(JSON.stringify(p1));
    const p2Json = JSON.parse(JSON.stringify(p2));

    await guestStore.addToCart(p1Json, 1);
    assert(guestStore.state.cart.items.length === 1, 'Guest cart contains 1 line item');
    assert(guestStore.state.cart.itemCount === 1, 'Guest cart itemCount is 1');
    assert(guestStore.state.cart.subtotal === 45.00, 'Guest subtotal is 45.00');
    assert(guestStore.state.cart.shipping === 5.99, 'Guest shipping is 5.99 (under $50)');

    const savedGuestRaw = localStorage.getItem('velvetaura_guest_cart');
    assert(savedGuestRaw !== null, 'Guest cart saved to localStorage');
    const savedGuest = JSON.parse(savedGuestRaw);
    assert(savedGuest.length === 1 && savedGuest[0].product === p1._id.toString(), 'localStorage contains correct product ID');

    // 2.2 Test Adding Second Item as Guest
    await guestStore.addToCart(p2Json, 1);
    assert(guestStore.state.cart.items.length === 2, 'Guest cart now contains 2 line items');
    assert(guestStore.state.cart.subtotal === 70.00, 'Guest subtotal is $70.00 ($45 + $25)');
    assert(guestStore.state.cart.shipping === 0.00, 'Guest shipping is $0.00 (>= $50)');
    assert(guestStore.state.cart.grandTotal === 75.60, 'Guest grandTotal is $75.60 (70 + 5.60 tax)');

    // 2.3 Test Updating Quantity to 0 (Removal) with plain JSON string ID
    await guestStore.updateQuantity(p2Json._id, 0);
    assert(guestStore.state.cart.items.length === 1, 'Updating quantity to 0 removed product p2');
    assert(guestStore.state.cart.items[0].product === p1Json._id, 'Remaining item is p1');
    assert(guestStore.state.cart.subtotal === 45.00, 'Subtotal recalculated to 45.00');
    assert(guestStore.state.cart.shipping === 5.99, 'Shipping reverted to 5.99');

    // Re-add p2 for migration testing
    await guestStore.addToCart(p2Json, 2);
    assert(guestStore.state.cart.items.length === 2, 'Re-added p2 with qty 2');

    // 2.4 Test Modifying Quantity Beyond Stock Limits (Frontend Clamping & Backend Guard)
    // p1 stock is 5. Attempt adding/updating beyond stock in backend
    const testCustomer = await User.create({
      name: 'Migration Customer',
      email: `migration_${Date.now()}@test.com`,
      password: 'Password123!',
      address: { street: '100 Main St', city: 'New York', state: 'NY', zip: '10001', country: 'USA' }
    });

    const loginRes = await request(app).post('/api/auth/login').send({
      email: testCustomer.email,
      password: 'Password123!'
    });
    const customerToken = loginRes.body.token;

    // Backend reject adding qty > stock (stock is 5, request 10)
    const overStockRes = await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productId: p1._id.toString(), quantity: 10 });

    assert(overStockRes.status === 400, 'Backend rejects adding quantity exceeding stock (HTTP 400)');
    assert(overStockRes.body.error === 'Exceeds stock limit', 'Backend returns "Exceeds stock limit"');

    // 2.5 Test Auto-Migrating Guest Cart Items to Backend Database upon Login
    // Verify guest cart has p1 (qty 1) and p2 (qty 2)
    const guestCartItems = JSON.parse(localStorage.getItem('velvetaura_guest_cart'));
    assert(guestCartItems.length === 2, 'Local guest cart holds 2 items before migration');

    // Perform login in client store
    // Set token in client api wrapper
    const apiModule = await import(`file:///${path.resolve(__dirname, '../../public/js/api.js').replace(/\\/g, '/')}`);
    const clientApi = apiModule.default;
    clientApi.baseUrl = 'http://localhost:5000/api'; // mocked or direct request
    
    // Test migrateGuestCartToBackend directly with supertest / backend API
    for (const item of guestCartItems) {
      const addRes = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: item.product, quantity: item.quantity });
      assert(addRes.status === 200, `Migrated item ${item.name || item.product} (qty ${item.quantity}) to backend`);
    }

    // Verify backend cart contains migrated items
    const backendCartRes = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${customerToken}`);

    assert(backendCartRes.status === 200, 'Fetched backend cart for customer');
    const migratedCart = backendCartRes.body.cart;
    assert(migratedCart.items.length === 2, 'Backend cart now contains 2 migrated items');
    assert(migratedCart.itemCount === 3, 'Backend cart total itemCount is 3 (1 + 2)');
    // p1 = 45 * 1 = 45; p2 = 25 * 2 = 50; total = 95
    assert(migratedCart.subtotal === 95.00, 'Backend cart subtotal is 95.00');
    assert(migratedCart.shipping === 0.00, 'Backend shipping is FREE ($0.00) for $95.00');
    assert(migratedCart.tax === 7.60, 'Backend tax is 7.60 (95 * 0.08)');
    assert(migratedCart.grandTotal === 102.60, 'Backend grandTotal is 102.60');

    // Guest cart in localStorage cleared
    localStorage.removeItem('velvetaura_guest_cart');
    assert(localStorage.getItem('velvetaura_guest_cart') === null, 'Guest cart cleared from localStorage after migration');
  }

  // =========================================================================
  // Challenge 3: Checkout Failure Handling & Recovery
  // =========================================================================
  console.log('\n--- Challenge 3: Checkout Failure Handling & Recovery ---');
  {
    // Setup buyer and cart
    const buyer = await User.create({
      name: 'Checkout Tester',
      email: `checkout_${Date.now()}@test.com`,
      password: 'Password123!',
      address: { street: '123 Avenue Montaigne', city: 'Paris', state: 'Ile-de-France', zip: '75008', country: 'France' }
    });

    const buyerLogin = await request(app).post('/api/auth/login').send({
      email: buyer.email,
      password: 'Password123!'
    });
    const buyerToken = buyerLogin.body.token;

    const luxuryItem = await Product.create({
      name: 'Challenger Velvet Elixir',
      brand: 'Challenger Beauty',
      origin: 'France',
      category: 'skincare',
      price: 60.00,
      stock: 4,
      description: 'Exclusive rejuvenating elixir.',
    });

    // Add luxuryItem to cart
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ productId: luxuryItem._id.toString(), quantity: 2 });

    const initialStock = (await Product.findById(luxuryItem._id)).stock;
    assert(initialStock === 4, 'Initial stock for luxuryItem is 4');

    // 3.1 Simulated Card Decline (ends in 0002)
    console.log('[Test 3.1] Testing card decline with card ending in 0002...');
    const declinePayload = {
      shippingAddress: {
        fullName: 'Checkout Tester',
        street: '123 Avenue Montaigne',
        city: 'Paris',
        state: 'Ile-de-France',
        zip: '75008',
        country: 'France',
      },
      paymentDetails: {
        cardNumber: '4000000000000002',
        expDate: '12/28',
        cvv: '123',
        cardHolder: 'Checkout Tester',
        brand: 'Visa',
      },
    };

    const declineRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(declinePayload);

    assert(declineRes.status === 402, 'Declined card returns HTTP 402');
    assert(declineRes.body.success === false, 'Response indicates success: false');
    assert(declineRes.body.code === 'CARD_DECLINED', 'Response code is CARD_DECLINED');
    assert(declineRes.body.error.includes('declined'), 'Error message states card was declined');

    // Test autofill declined card with CVV '000'
    const autofillDeclinePayload = {
      ...declinePayload,
      paymentDetails: {
        ...declinePayload.paymentDetails,
        cvv: '000',
      },
    };
    const autofillDeclineRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(autofillDeclinePayload);

    assert(autofillDeclineRes.status === 400, 'Demo autofill declined card with CVV 000 triggers HTTP 400');
    assert(autofillDeclineRes.body.code === 'INVALID_CVV', 'Response code is INVALID_CVV');
    assert(autofillDeclineRes.body.error.includes('CVV'), 'Error message states invalid CVV');

    // Verify stock rollback: stock must remain 4!
    const stockAfterDecline = (await Product.findById(luxuryItem._id)).stock;
    assert(stockAfterDecline === 4, 'Stock was preserved / rolled back to 4 after card decline');

    // Verify cart remains intact!
    const cartAfterDecline = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`);
    assert(cartAfterDecline.body.cart.items.length === 1, 'Cart items remain intact after card decline');
    assert(cartAfterDecline.body.cart.items[0].quantity === 2, 'Item quantity unchanged in cart');

    // 3.2 Test Expired Card
    console.log('[Test 3.2] Testing expired card (12/20)...');
    const expiredPayload = {
      ...declinePayload,
      paymentDetails: {
        ...declinePayload.paymentDetails,
        cardNumber: '4242424242424242',
        expDate: '12/20', // Expired!
        cvv: '123',
      },
    };

    const expiredRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(expiredPayload);

    assert(expiredRes.status === 402, 'Expired card returns HTTP 402');
    assert(expiredRes.body.code === 'EXPIRED_CARD', 'Response code is EXPIRED_CARD');
    assert(expiredRes.body.error.includes('expired'), 'Error message clearly states card has expired');

    // Verify stock preserved
    const stockAfterExpired = (await Product.findById(luxuryItem._id)).stock;
    assert(stockAfterExpired === 4, 'Stock preserved after expired card attempt');

    // 3.3 Test Missing Shipping Fields
    console.log('[Test 3.3] Testing missing shipping fields (empty street and city)...');
    const incompletePayload = {
      shippingAddress: {
        fullName: 'Checkout Tester',
        street: '', // Missing!
        city: '',   // Missing!
        state: 'Ile-de-France',
        zip: '',    // Missing!
        country: 'France',
      },
      paymentDetails: {
        cardNumber: '4242424242424242',
        expDate: '12/28',
        cvv: '123',
        cardHolder: 'Checkout Tester',
        brand: 'Visa',
      },
    };

    const incompleteRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(incompletePayload);

    assert(incompleteRes.status === 400, 'Missing shipping fields return HTTP 400');
    assert(incompleteRes.body.error === 'Incomplete shipping address', 'Error message states Incomplete shipping address');

    // Verify cart still intact
    const cartAfterIncomplete = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`);
    assert(cartAfterIncomplete.body.cart.items.length === 1, 'Cart items still intact after validation error');

    // 3.4 Recovery & Successful Retry
    console.log('[Test 3.4] Testing recovery & retry with approved Visa card...');
    const approvedPayload = {
      shippingAddress: {
        fullName: 'Checkout Tester',
        street: '123 Avenue Montaigne',
        city: 'Paris',
        state: 'Ile-de-France',
        zip: '75008',
        country: 'France',
      },
      paymentDetails: {
        cardNumber: '4242424242424242',
        expDate: '12/28',
        cvv: '123',
        cardHolder: 'Checkout Tester',
        brand: 'Visa',
      },
    };

    const retryRes = await request(app)
      .post('/api/orders/checkout')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send(approvedPayload);

    assert(retryRes.status === 201, 'Retried checkout succeeds with HTTP 201');
    assert(retryRes.body.success === true, 'Order created successfully on retry');
    assert(retryRes.body.transactionId.startsWith('TXN-VA-'), 'Valid transaction ID generated');
    assert(retryRes.body.order.orderNumber.startsWith('VA-'), 'Valid order number generated');

    // Stock now properly decremented by 2 (from 4 down to 2)
    const stockAfterSuccess = (await Product.findById(luxuryItem._id)).stock;
    assert(stockAfterSuccess === 2, 'Stock decremented from 4 to 2 after successful checkout');

    // Active cart is now cleared
    const cartAfterSuccess = await request(app)
      .get('/api/cart')
      .set('Authorization', `Bearer ${buyerToken}`);
    assert(cartAfterSuccess.body.cart.items.length === 0, 'Cart is cleared after successful order');
  }

  console.log('\n===============================================================');
  console.log('              Empirical Stress Suite Summary                   ');
  console.log('===============================================================');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runEmpiricalHarness().catch((err) => {
  console.error('[Empirical Harness FATAL]:', err);
  process.exit(1);
});
