/**
 * VelvetAura - Cash on Delivery & Direct Bank Transfer Empirical Challenger Suite
 * Author: teamwork_challenger_pay_2
 * Focus:
 * 1. Bank Transfer Confirmation Guard (API HTTP 400 enforcement & Frontend UI blocking)
 * 2. COD Checkout Flow (paymentStatus: pending, fulfillment: pending, inventory decrement, cart clear)
 * 3. Currency Display & Formatting (LKR / Rs. X,XXX.XX, edge prices, NaN/undefined elimination)
 * 4. Admin Status Updates & RBAC (paymentStatus: pending->paid, status: pending->shipped, RBAC 403)
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'velvetaura_luxury_secret_jwt_key_2026_secure';

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const mongoose = require('mongoose');

// Backend modules
const app = require('../src/app');
const { connectDB, disconnectDB, clearDatabase } = require('../src/config/db');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');

// Empirical test results tracker
const tracker = {
  passed: 0,
  failed: 0,
  suites: [],
};

let currentSuite = null;

function startSuite(name) {
  currentSuite = { name, passed: 0, failed: 0 };
  tracker.suites.push(currentSuite);
  console.log(`\n======================================================================`);
  console.log(`  ${name}`);
  console.log(`======================================================================`);
}

function assert(condition, testName, details = '') {
  if (condition) {
    tracker.passed++;
    if (currentSuite) currentSuite.passed++;
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    tracker.failed++;
    if (currentSuite) currentSuite.failed++;
    console.error(`  ✗ FAIL: ${testName} ${details ? '- ' + details : ''}`);
    throw new Error(`Assertion failed: ${testName} - ${details}`);
  }
}

// =========================================================================
// Deterministic DOM Mock for Frontend Component Verification
// =========================================================================

class MockClassList {
  constructor(owner) {
    this.owner = owner;
    this.classes = new Set();
  }
  add(...cls) {
    cls.forEach((c) => c && this.classes.add(c));
  }
  remove(...cls) {
    cls.forEach((c) => c && this.classes.delete(c));
  }
  contains(cls) {
    return this.classes.has(cls);
  }
  toggle(cls, force) {
    if (force !== undefined) {
      if (force) this.add(cls);
      else this.remove(cls);
      return force;
    }
    if (this.contains(cls)) {
      this.remove(cls);
      return false;
    } else {
      this.add(cls);
      return true;
    }
  }
  toString() {
    return Array.from(this.classes).join(' ');
  }
}

class MockElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.classList = new MockClassList(this);
    this.attributes = {};
    this.children = [];
    this.parentElement = null;
    this.eventListeners = {};
    this.dataset = {};
    this.style = {};
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this.name = '';
    this.type = '';
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this._parseAndAttach(html);
  }

  get textContent() {
    return this._innerHTML.replace(/<[^>]*>/g, '').trim();
  }

  set textContent(text) {
    this._innerHTML = text;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') this.id = String(val);
    if (name === 'name') this.name = String(val);
    if (name === 'type') this.type = String(val);
    if (name === 'value') this.value = String(val);
    if (name === 'class') {
      this.classList.classes.clear();
      String(val).split(/\s+/).forEach((c) => c && this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  async dispatchEvent(eventObj) {
    const eventType = typeof eventObj === 'string' ? eventObj : eventObj.type;
    const evt = typeof eventObj === 'string' ? { type: eventObj, target: this, preventDefault: () => {} } : eventObj;
    if (!evt.target) evt.target = this;
    if (!evt.preventDefault) evt.preventDefault = () => {};

    if (this.eventListeners[eventType]) {
      for (const h of this.eventListeners[eventType]) {
        await h(evt);
      }
    }

    if (this.parentElement && !evt.propagationStopped) {
      await this.parentElement.dispatchEvent(evt);
    }
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      if (matches(el, selector)) {
        results.push(el);
      }
      for (const child of el.children) {
        check(child);
      }
    };
    for (const child of this.children) {
      check(child);
    }
    return results;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (matches(curr, selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  _parseAndAttach(html) {
    this.children = [];
    if (!html || typeof html !== 'string') return;

    const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1];
      const attrsStr = match[2];

      const el = new MockElement(tagName);
      el.parentElement = this;

      const idMatch = attrsStr.match(/id=["']([^"']+)["']/i);
      if (idMatch) el.setAttribute('id', idMatch[1]);

      const classMatch = attrsStr.match(/class=["']([^"']+)["']/i);
      if (classMatch) el.setAttribute('class', classMatch[1]);

      const nameMatch = attrsStr.match(/name=["']([^"']+)["']/i);
      if (nameMatch) el.setAttribute('name', nameMatch[1]);

      const typeMatch = attrsStr.match(/type=["']([^"']+)["']/i);
      if (typeMatch) el.setAttribute('type', typeMatch[1]);

      const valMatch = attrsStr.match(/value=["']([^"']*)["']/i);
      if (valMatch) el.value = valMatch[1];

      if (/\bchecked\b/i.test(attrsStr)) el.checked = true;
      if (/\bdisabled\b/i.test(attrsStr)) el.disabled = true;

      this.children.push(el);
    }
  }
}

function matches(el, selector) {
  if (!el || !selector) return false;
  selector = selector.trim();
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (/^[a-zA-Z0-9\-]+$/.test(selector)) return el.tagName.toLowerCase() === selector.toLowerCase();
  return false;
}

// Global browser mock environment
const mockBody = new MockElement('body');
const mockModalContainer = new MockElement('div', 'checkout-modal-container');
mockBody.appendChild(mockModalContainer);

global.document = {
  getElementById: (id) => mockBody.querySelector(`#${id}`),
  querySelector: (sel) => (sel === '#checkout-modal-container' ? mockModalContainer : mockBody.querySelector(sel)),
  querySelectorAll: (sel) => mockBody.querySelectorAll(sel),
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  body: mockBody,
};
global.window = {
  location: { hash: '' },
  localStorage: {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  },
};

// =========================================================================
// Main Empirical Stress Runner
// =========================================================================

async function runEmpiricalStress() {
  console.log('\n======================================================================');
  console.log(' VelvetAura: COD & Bank Transfer Empirical Stress Harness');
  console.log('======================================================================\n');

  await connectDB({ forceMemory: true });
  await clearDatabase();

  // 1. Seed Customer 1, Customer 2, Admin
  const customer1 = await User.create({
    name: 'Dilshan Silva',
    email: 'dilshan@velvetaura.test',
    password: 'Password123!',
    role: 'customer',
  });
  const cust1Login = await request(app).post('/api/auth/login').send({
    email: customer1.email,
    password: 'Password123!',
  });
  const customer1Token = cust1Login.body.token;

  const customer2 = await User.create({
    name: 'Anuki Perera',
    email: 'anuki@velvetaura.test',
    password: 'Password123!',
    role: 'customer',
  });
  const cust2Login = await request(app).post('/api/auth/login').send({
    email: customer2.email,
    password: 'Password123!',
  });
  const customer2Token = cust2Login.body.token;

  const adminUser = await User.create({
    name: 'Admin Commander',
    email: 'admin.finance@velvetaura.test',
    password: 'AdminPassword123!',
    role: 'admin',
  });
  const adminLogin = await request(app).post('/api/auth/login').send({
    email: adminUser.email,
    password: 'AdminPassword123!',
  });
  const adminToken = adminLogin.body.token;

  // 2. Seed Test Products
  const serumProduct = await Product.create({
    name: 'Sulwhasoo First Care Activating Serum VI',
    brand: 'Sulwhasoo',
    origin: 'South Korea',
    category: 'skincare',
    price: 18500.0,
    currency: 'LKR',
    stock: 10,
    description: 'Pre-serum formulated with JAUM Activator.',
  });

  const perfumeProduct = await Product.create({
    name: 'Maison Francis Kurkdjian Baccarat Rouge 540',
    brand: 'Maison Francis Kurkdjian',
    origin: 'France',
    category: 'fragrances',
    price: 98000.0,
    currency: 'LKR',
    stock: 5,
    description: 'Amber floral fragrance with luminous cedar.',
  });

  const validShipping = {
    fullName: 'Dilshan Silva',
    street: 'No. 12, Flower Road',
    city: 'Colombo',
    state: 'Western Province',
    zip: '00700',
    country: 'Sri Lanka',
    phone: '+94712345678',
  };

  // -------------------------------------------------------------------------
  // SUITE 1: Bank Transfer Confirmation Guard (API & UI blocking)
  // -------------------------------------------------------------------------
  startSuite('Suite 1: Bank Transfer Confirmation Guard (Backend & Frontend UI)');

  // 1.1 Backend Guard: bankTransferConfirmed omitted
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({ productId: serumProduct._id, quantity: 1 });

  const resOmitted = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      // bankTransferConfirmed omitted
    });
  assert(resOmitted.status === 400, '1.1 Rejects bank transfer with omitted bankTransferConfirmed (HTTP 400)');
  assert(resOmitted.body.error === 'Confirmation of bank transfer is required', '1.1 Error text matches requirement');

  // 1.2 Backend Guard: bankTransferConfirmed: false
  const resFalse = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      bankTransferConfirmed: false,
    });
  assert(resFalse.status === 400, '1.2 Rejects bankTransferConfirmed: false with HTTP 400');

  // 1.3 Backend Guard: bankTransferConfirmed: null
  const resNull = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      bankTransferConfirmed: null,
    });
  assert(resNull.status === 400, '1.3 Rejects bankTransferConfirmed: null with HTTP 400');

  // 1.4 Backend Guard: bankTransferConfirmed: "true" (string instead of boolean)
  const resStrTrue = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      bankTransferConfirmed: 'true',
    });
  assert(resStrTrue.status === 400, '1.4 Rejects bankTransferConfirmed: "true" (string) with HTTP 400');

  // 1.5 Backend Guard: bankTransferConfirmed: 1 (number instead of boolean)
  const resNum1 = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      bankTransferConfirmed: 1,
    });
  assert(resNum1.status === 400, '1.5 Rejects bankTransferConfirmed: 1 (number) with HTTP 400');

  // 1.6 Verify cart items and stock remain intact after all failed guard attempts
  const checkCart = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer1Token}`);
  assert(checkCart.body.cart.items.length === 1, '1.6 Cart item count preserved after failed attempts');
  const checkStock = await Product.findById(serumProduct._id);
  assert(checkStock.stock === 10, '1.6 Product stock untouched (10 units)');

  // 1.7 Backend Guard: Successful Bank Transfer when confirmed: true
  const resBtSuccess = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'bank_transfer',
      bankTransferConfirmed: true,
      paymentNotes: 'CDM deposit slip attached',
    });
  assert(resBtSuccess.status === 201, '1.7 Bank transfer checkout succeeds with HTTP 201 when confirmed: true');
  const btOrder = resBtSuccess.body.order;
  assert(btOrder.paymentMethod === 'bank_transfer', '1.7 Order paymentMethod is "bank_transfer"');
  assert(btOrder.paymentStatus === 'pending', '1.7 Order paymentStatus initialized to "pending"');
  assert(btOrder.status === 'pending', '1.7 Order fulfillment status initialized to "pending"');
  assert(resBtSuccess.body.transactionId.startsWith('BT-VA-'), '1.7 Transaction ID prefixed with BT-VA-');

  // 1.8 Verify cart is emptied and stock decremented on successful bank transfer
  const postBtCart = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer1Token}`);
  assert(postBtCart.body.cart.items.length === 0, '1.8 Cart emptied after successful bank transfer');
  const postBtStock = await Product.findById(serumProduct._id);
  assert(postBtStock.stock === 9, '1.8 Stock decremented from 10 to 9');

  // 1.9 Frontend Checkout Modal Guard: UI blocking test
  const checkoutModalJsPath = path.resolve(__dirname, '../public/js/components/checkoutModal.js');
  const storeJsPath = path.resolve(__dirname, '../public/js/store.js');

  const { CheckoutModalComponent } = await import(`file:///${checkoutModalJsPath.replace(/\\/g, '/')}`);
  const storeModule = await import(`file:///${storeJsPath.replace(/\\/g, '/')}`);
  const store = storeModule.default || storeModule;

  // Configure store state with active cart
  store.setState('auth', { user: customer1, token: customer1Token, isAuthenticated: true });
  store.setState('cart', {
    items: [{ product: serumProduct, price: 18500, quantity: 1 }],
    subtotal: 18500,
    tax: 1480,
    shipping: 0,
    grandTotal: 19980,
    itemCount: 1,
  });
  store.setState('checkout', {
    isOpen: true,
    isSubmitting: false,
    error: null,
    shippingAddress: validShipping,
  });

  const modal = new CheckoutModalComponent('#checkout-modal-container');
  modal.init();

  // Switch to Bank Transfer
  modal.selectedMethod = 'bank_transfer';
  modal.render();

  const renderedHtml = mockModalContainer.innerHTML;
  assert(renderedHtml.includes('Commercial Bank of Ceylon'), '1.9 Bank modal renders "Commercial Bank of Ceylon"');
  assert(renderedHtml.includes('Colombo Fort Premier Branch'), '1.9 Bank modal renders branch');
  assert(renderedHtml.includes('VelvetAura (Pvt) Ltd'), '1.9 Bank modal renders account name');
  assert(renderedHtml.includes('1000 8924 7712'), '1.9 Bank modal renders account number 1000 8924 7712');
  assert(renderedHtml.includes('id="bank-transfer-confirm-checkbox"'), '1.9 Checkbox #bank-transfer-confirm-checkbox present');

  // Verify UI blocks unconfirmed submission
  const confirmCheckbox = mockModalContainer.querySelector('#bank-transfer-confirm-checkbox');
  confirmCheckbox.checked = false;

  // Spy on store.submitCheckout to verify it is NOT called when unconfirmed
  let submitCheckoutCalled = false;
  const originalSubmitCheckout = store.submitCheckout;
  store.submitCheckout = async () => {
    submitCheckoutCalled = true;
    return { success: false };
  };

  const form = mockModalContainer.querySelector('#checkout-form');
  const formSubmitEvent = {
    type: 'submit',
    target: { id: 'checkout-form' },
    preventDefault: () => {},
  };
  await mockModalContainer.dispatchEvent(formSubmitEvent);

  assert(submitCheckoutCalled === false, '1.9 UI blocks submission when checkbox is unchecked: store.submitCheckout NOT called');
  const checkoutStateAfter = store.getState('checkout');
  assert(
    checkoutStateAfter.error && checkoutStateAfter.error.includes('Please confirm that you have transferred'),
    '1.9 UI sets error banner message requesting bank transfer confirmation'
  );

  // Restore store.submitCheckout
  store.submitCheckout = originalSubmitCheckout;

  // -------------------------------------------------------------------------
  // SUITE 2: COD Checkout Flow & Invariants
  // -------------------------------------------------------------------------
  startSuite('Suite 2: Cash on Delivery (COD) Checkout Flow & Invariants');

  // 2.1 Customer 2 places COD order with multiple quantities
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${customer2Token}`)
    .send({ productId: perfumeProduct._id, quantity: 2 });

  const initialPerfumeStock = (await Product.findById(perfumeProduct._id)).stock; // 5

  const codRes = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer2Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'cod',
    });

  assert(codRes.status === 201, '2.1 COD checkout responds HTTP 201');
  const codOrder = codRes.body.order;
  assert(codOrder.currency === 'LKR', '2.1 COD order currency is "LKR"');
  assert(codOrder.paymentMethod === 'cod', '2.1 COD order paymentMethod is "cod"');
  assert(codOrder.paymentStatus === 'pending', '2.1 COD order paymentStatus is "pending"');
  assert(codOrder.status === 'pending', '2.1 COD order fulfillment status is "pending"');
  assert(codRes.body.transactionId.startsWith('COD-VA-'), '2.1 COD transaction ID starts with COD-VA-');
  assert(codOrder.paymentNotes.includes('Cash on Delivery'), '2.1 Doorstep payment notes recorded');

  // Financial snapshot verification
  assert(codOrder.pricing.subtotal === 196000.0, '2.1 Pricing subtotal accurate (98,000 * 2 = 196,000)');
  assert(codOrder.pricing.tax === 15680.0, '2.1 Tax accurate (8% of 196,000 = 15,680)');
  assert(codOrder.pricing.shipping === 0.0, '2.1 Free shipping for orders over Rs. 50');
  assert(codOrder.pricing.grandTotal === 211680.0, '2.1 Grand total accurate (211,680.00)');

  // 2.2 Inventory decrement verification
  const updatedPerfume = await Product.findById(perfumeProduct._id);
  assert(updatedPerfume.stock === initialPerfumeStock - 2, `2.2 Stock decremented exactly: ${initialPerfumeStock} - 2 = ${updatedPerfume.stock}`);

  // 2.3 Cart clearance verification
  const cust2Cart = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer2Token}`);
  assert(cust2Cart.body.cart.items.length === 0, '2.3 Cart items array cleared');
  assert(cust2Cart.body.cart.subtotal === 0, '2.3 Cart subtotal reset to 0');
  assert(cust2Cart.body.cart.grandTotal === 0, '2.3 Cart grandTotal reset to 0');

  // 2.4 Customer order history reflects COD order
  const myOrdersRes = await request(app).get('/api/orders/my-orders').set('Authorization', `Bearer ${customer2Token}`);
  assert(myOrdersRes.status === 200, '2.4 my-orders responds HTTP 200');
  assert(myOrdersRes.body.orders.length === 1, '2.4 Single order in history');
  assert(myOrdersRes.body.orders[0].paymentMethod === 'cod', '2.4 Order has paymentMethod "cod"');
  assert(myOrdersRes.body.orders[0].paymentStatus === 'pending', '2.4 Order has paymentStatus "pending"');

  // 2.5 Edge Case: Attempt COD checkout with empty cart
  const emptyCartRes = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer2Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'cod',
    });
  assert(emptyCartRes.status === 400, '2.5 Empty cart checkout rejected with HTTP 400');
  assert(emptyCartRes.body.message.includes('Cannot checkout with an empty cart'), '2.5 Empty cart error message verified');

  // 2.6 Edge Case: Insufficient inventory during COD checkout
  // Request 10 units when only 3 remain
  await request(app)
    .post('/api/cart')
    .set('Authorization', `Bearer ${customer2Token}`)
    .send({ productId: perfumeProduct._id, quantity: 2 }); // Cart has 2

  // Another process secretly depletes stock to 1
  await Product.findByIdAndUpdate(perfumeProduct._id, { stock: 1 });

  const stockDepletedRes = await request(app)
    .post('/api/orders/checkout')
    .set('Authorization', `Bearer ${customer2Token}`)
    .send({
      shippingAddress: validShipping,
      paymentMethod: 'cod',
    });
  assert(stockDepletedRes.status === 400, '2.6 Stock depletion causes HTTP 400');
  assert(stockDepletedRes.body.error === 'Insufficient stock', '2.6 Insufficient stock error code returned');

  // Verify stock rolled back to 1 (not negative)
  const rolledBackStock = (await Product.findById(perfumeProduct._id)).stock;
  assert(rolledBackStock === 1, '2.6 Stock rolled back cleanly to 1 unit');

  // Restore stock for remaining tests
  await Product.findByIdAndUpdate(perfumeProduct._id, { stock: 10 });
  await Cart.findOneAndUpdate({ user: customer2._id }, { items: [], subtotal: 0, grandTotal: 0 });

  // -------------------------------------------------------------------------
  // SUITE 3: Currency Display & Formatting (Rs. X,XXX.XX & Edge Prices)
  // -------------------------------------------------------------------------
  startSuite('Suite 3: Currency Display & Formatting Across Components');

  const baseJsPath = path.resolve(__dirname, '../public/js/components/base.js');
  const { formatPrice, formatPaymentMethod, formatPaymentStatus } = await import(`file:///${baseJsPath.replace(/\\/g, '/')}`);

  // 3.1 Normal positive amounts
  assert(formatPrice(100) === 'Rs. 100.00', '3.1 formatPrice(100) -> "Rs. 100.00"');
  assert(formatPrice(12500) === 'Rs. 12,500.00', '3.1 formatPrice(12500) -> "Rs. 12,500.00" (comma thousands separator)');
  assert(formatPrice(28500.5) === 'Rs. 28,500.50', '3.1 formatPrice(28500.5) -> "Rs. 28,500.50"');

  // 3.2 Decimals and fractions
  assert(formatPrice(0.5) === 'Rs. 0.50', '3.2 formatPrice(0.5) -> "Rs. 0.50"');
  assert(formatPrice(12.3456) === 'Rs. 12.35', '3.2 formatPrice(12.3456) -> "Rs. 12.35" (rounds to 2 decimals)');
  assert(formatPrice(99.999) === 'Rs. 100.00', '3.2 formatPrice(99.999) -> "Rs. 100.00"');

  // 3.3 Zero values
  assert(formatPrice(0) === 'Rs. 0.00', '3.3 formatPrice(0) -> "Rs. 0.00"');
  assert(formatPrice(-0) === 'Rs. 0.00', '3.3 formatPrice(-0) -> "Rs. 0.00"');

  // 3.4 Large numbers (millions and hundred millions)
  assert(formatPrice(1000000) === 'Rs. 1,000,000.00', '3.4 formatPrice(1000000) -> "Rs. 1,000,000.00"');
  assert(formatPrice(123456789.99) === 'Rs. 123,456,789.99', '3.4 formatPrice(123456789.99) -> "Rs. 123,456,789.99"');

  // 3.5 String input numbers
  assert(formatPrice('4500.50') === 'Rs. 4,500.50', '3.5 formatPrice("4500.50") -> "Rs. 4,500.50"');
  assert(formatPrice('0') === 'Rs. 0.00', '3.5 formatPrice("0") -> "Rs. 0.00"');

  // 3.6 Edge cases: NaN, null, undefined, invalid strings (MUST NEVER RETURN NaN or broken text)
  assert(formatPrice(null) === 'Rs. 0.00', '3.6 formatPrice(null) -> "Rs. 0.00" (no NaN/crash)');
  assert(formatPrice(undefined) === 'Rs. 0.00', '3.6 formatPrice(undefined) -> "Rs. 0.00" (no undefined)');
  assert(formatPrice(NaN) === 'Rs. 0.00', '3.6 formatPrice(NaN) -> "Rs. 0.00" (no "Rs. NaN")');
  assert(formatPrice('') === 'Rs. 0.00', '3.6 formatPrice("") -> "Rs. 0.00"');
  assert(formatPrice('invalid_string') === 'Rs. 0.00', '3.6 formatPrice("invalid_string") -> "Rs. 0.00"');
  assert(formatPrice(false) === 'Rs. 0.00', '3.6 formatPrice(false) -> "Rs. 0.00"');

  // 3.7 Custom prefix option
  assert(formatPrice(1500, { prefix: 'LKR ' }) === 'LKR 1,500.00', '3.7 formatPrice custom prefix option supported');

  // 3.8 Payment method and status label mappings
  assert(formatPaymentMethod('cod') === '💵 Cash on Delivery', '3.8 formatPaymentMethod("cod") returns luxury icon badge');
  assert(formatPaymentMethod('bank_transfer') === '🏦 Direct Bank Transfer', '3.8 formatPaymentMethod("bank_transfer") returns icon badge');
  assert(formatPaymentMethod('payhere') === '💳 PayHere Gateway', '3.8 formatPaymentMethod("payhere") returns icon badge');
  assert(formatPaymentMethod('unknown_method').includes('unknown_method'), '3.8 formatPaymentMethod handles unknown method gracefully');

  assert(formatPaymentStatus('pending') === 'Pending Payment', '3.8 formatPaymentStatus("pending") -> "Pending Payment"');
  assert(formatPaymentStatus('paid') === 'Payment Received', '3.8 formatPaymentStatus("paid") -> "Payment Received"');
  assert(formatPaymentStatus('succeeded') === 'Payment Completed', '3.8 formatPaymentStatus("succeeded") -> "Payment Completed"');
  assert(formatPaymentStatus('failed') === 'Payment Failed', '3.8 formatPaymentStatus("failed") -> "Payment Failed"');
  assert(formatPaymentStatus(null) === 'Pending', '3.8 formatPaymentStatus(null) defaults gracefully to "Pending"');

  // 3.9 Static verification of public HTML / JS files for dollar sign elimination
  const filesToAudit = [
    'public/index.html',
    'public/js/components/catalog.js',
    'public/js/components/cartDrawer.js',
    'public/js/components/checkoutModal.js',
    'public/js/components/orderConfirmation.js',
    'public/js/components/accountView.js',
    'public/js/components/adminDashboard.js',
  ];

  for (const relFile of filesToAudit) {
    const fullPath = path.resolve(__dirname, '..', relFile);
    assert(fs.existsSync(fullPath), `3.9 File exists: ${relFile}`);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Check for raw dollar signs followed by digits e.g. $10, $50.00, etc.
    const dollarPriceMatches = content.match(/\$\d+(\.\d+)?/g);
    assert(
      !dollarPriceMatches,
      `3.9 No hardcoded dollar prices found in ${relFile}`,
      dollarPriceMatches ? `Found: ${dollarPriceMatches.join(', ')}` : ''
    );
  }

  // -------------------------------------------------------------------------
  // SUITE 4: Admin Status Updates & RBAC Security
  // -------------------------------------------------------------------------
  startSuite('Suite 4: Admin Status Updates & RBAC Security');

  // 4.1 Admin updates paymentStatus: 'pending' -> 'paid'
  const targetOrder = btOrder; // Created in Suite 1

  const adminPayUpdate = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      paymentStatus: 'paid',
      notes: 'Customer transferred via Commercial Bank online banking. Slip verified.',
    });

  assert(adminPayUpdate.status === 200, '4.1 Admin updates paymentStatus responds HTTP 200');
  assert(adminPayUpdate.body.order.paymentStatus === 'paid', '4.1 Top-level paymentStatus is "paid"');
  assert(adminPayUpdate.body.order.payment.status === 'paid', '4.1 Subdocument payment.status is "paid"');
  assert(adminPayUpdate.body.order.payment.paidAt !== null, '4.1 Subdocument payment.paidAt timestamp recorded');
  assert(adminPayUpdate.body.order.paymentNotes.includes('Slip verified'), '4.1 Admin paymentNotes saved');

  // 4.2 Admin updates fulfillment status: 'pending' -> 'processing' -> 'shipped' -> 'delivered'
  const statuses = ['processing', 'shipped', 'delivered'];
  for (const st of statuses) {
    const fulfillUpdate = await request(app)
      .put(`/api/orders/${targetOrder._id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: st });

    assert(fulfillUpdate.status === 200, `4.2 Admin updates status to "${st}" (HTTP 200)`);
    assert(fulfillUpdate.body.order.status === st, `4.2 Order status is "${st}"`);
    assert(fulfillUpdate.body.order.paymentStatus === 'paid', '4.2 Payment status remains "paid" during fulfillment updates');
  }

  // 4.3 Admin updates paymentStatus back to 'pending' (e.g. payment reversal/investigation)
  const adminPayRevert = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      paymentStatus: 'pending',
      notes: 'Payment under dispute',
    });
  assert(adminPayRevert.status === 200, '4.3 Admin reverts paymentStatus to "pending" (HTTP 200)');
  assert(adminPayRevert.body.order.paymentStatus === 'pending', '4.3 paymentStatus reverted to "pending"');
  assert(adminPayRevert.body.order.payment.paidAt === null, '4.3 payment.paidAt cleared when reverted to "pending"');

  // 4.4 Admin attempts invalid status values
  const invalidStatusRes = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'invalid_status_xyz' });
  assert(invalidStatusRes.status === 400, '4.4 Invalid status rejected with HTTP 400');
  assert(invalidStatusRes.body.error === 'Invalid order status', '4.4 Error indicates invalid order status');

  const invalidPayStatusRes = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ paymentStatus: 'invalid_pay_status' });
  assert(invalidPayStatusRes.status === 400, '4.4 Invalid paymentStatus rejected with HTTP 400');
  assert(invalidPayStatusRes.body.error === 'Invalid payment status', '4.4 Error indicates invalid payment status');

  const emptyUpdateRes = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({});
  assert(emptyUpdateRes.status === 400, '4.4 Empty update payload rejected with HTTP 400');

  // 4.5 RBAC: Customer attempts to update order status (MUST BE 403 FORBIDDEN)
  const custAttemptPut = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({ paymentStatus: 'paid' });
  assert(custAttemptPut.status === 403, '4.5 Customer PUT /api/orders/:id/status rejected with HTTP 403 Forbidden');
  assert(custAttemptPut.body.error === 'Forbidden', '4.5 Error payload is Forbidden');

  const custAttemptPatch = await request(app)
    .patch(`/api/orders/${targetOrder._id}/status`)
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({ status: 'delivered' });
  assert(custAttemptPatch.status === 403, '4.5 Customer PATCH /api/orders/:id/status rejected with HTTP 403 Forbidden');

  const custAttemptPayStatus = await request(app)
    .put(`/api/orders/${targetOrder._id}/payment-status`)
    .set('Authorization', `Bearer ${customer1Token}`)
    .send({ paymentStatus: 'paid' });
  assert(custAttemptPayStatus.status === 403, '4.5 Customer PUT /api/orders/:id/payment-status rejected with HTTP 403 Forbidden');

  // 4.6 RBAC: Unauthenticated requests
  const unauthRes = await request(app)
    .put(`/api/orders/${targetOrder._id}/status`)
    .send({ paymentStatus: 'paid' });
  assert(unauthRes.status === 401, '4.6 Unauthenticated status update rejected with HTTP 401 Unauthorized');

  // 4.7 RBAC: Customer attempts to list all orders (GET /api/orders)
  const custAllOrdersRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${customer1Token}`);
  assert(custAllOrdersRes.status === 403, '4.7 Customer GET /api/orders rejected with HTTP 403 Forbidden');

  const adminAllOrdersRes = await request(app)
    .get('/api/orders')
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminAllOrdersRes.status === 200, '4.7 Admin GET /api/orders succeeds with HTTP 200');
  assert(Array.isArray(adminAllOrdersRes.body.orders), '4.7 Admin receives all customer orders array');
  assert(adminAllOrdersRes.body.orders.length >= 2, '4.7 Admin sees multiple customer orders');

  // 4.8 Ownership: Customer accessing order detail
  // Customer 1 owns targetOrder
  const cust1Detail = await request(app)
    .get(`/api/orders/${targetOrder._id}`)
    .set('Authorization', `Bearer ${customer1Token}`);
  assert(cust1Detail.status === 200, '4.8 Customer 1 can view own order (HTTP 200)');

  // Customer 2 attempts to view Customer 1's order -> 403
  const cust2Detail = await request(app)
    .get(`/api/orders/${targetOrder._id}`)
    .set('Authorization', `Bearer ${customer2Token}`);
  assert(cust2Detail.status === 403, '4.8 Customer 2 cannot view Customer 1 order (HTTP 403 Forbidden)');

  // Admin can view Customer 1's order -> 200
  const adminDetail = await request(app)
    .get(`/api/orders/${targetOrder._id}`)
    .set('Authorization', `Bearer ${adminToken}`);
  assert(adminDetail.status === 200, '4.8 Admin can view any customer order (HTTP 200)');

  // 4.9 Invalid parameter formats
  const badIdRes = await request(app)
    .put('/api/orders/not-a-valid-hex-id/status')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'shipped' });
  assert(badIdRes.status === 400, '4.9 Malformed ObjectId rejected with HTTP 400');

  const nonExistentId = new mongoose.Types.ObjectId();
  const notFoundRes = await request(app)
    .put(`/api/orders/${nonExistentId}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ status: 'shipped' });
  assert(notFoundRes.status === 404, '4.9 Non-existent order ID rejected with HTTP 404');

  await disconnectDB();

  console.log('\n======================================================================');
  console.log(` EMPIRICAL CHALLENGE SUMMARY:`);
  console.log(` Total Assertions: ${tracker.passed + tracker.failed}`);
  console.log(` Passed: ${tracker.passed}`);
  console.log(` Failed: ${tracker.failed}`);
  console.log('======================================================================\n');

  if (tracker.failed > 0) {
    process.exit(1);
  }
}

runEmpiricalStress().catch((err) => {
  console.error('\n[FATAL ERROR in runEmpiricalStress]:', err);
  process.exit(1);
});
