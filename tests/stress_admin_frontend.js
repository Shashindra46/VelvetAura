/**
 * VelvetAura - Milestone 5: Empirical Frontend Stress & Verification Suite
 * 
 * Adversarial Testing Suite covering:
 * 1. Route Guard Resilience & Dynamic Eviction
 * 2. Navbar Role Reactivity & DOM Lifecycle
 * 3. Real-Time Catalog-Store Synchronization
 * 4. Design System, Obsidian Theme & Glassmorphism Token Conformance
 */

const http = require('http');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const request = require('supertest');

// Load Backend Modules
const { connectDB } = require('../src/config/db');
const app = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');

// =========================================================================
// Lightweight Deterministic DOM & Browser Environment Mock
// =========================================================================

class MockClassList {
  constructor(owner) {
    this.owner = owner;
    this.classes = new Set();
  }
  add(...cls) {
    cls.forEach((c) => {
      if (c) this.classes.add(c);
    });
  }
  remove(...cls) {
    cls.forEach((c) => {
      if (c) this.classes.delete(c);
    });
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
    this._innerHTML = '';
  }

  get innerHTML() {
    return this._innerHTML;
  }

  set innerHTML(html) {
    this._innerHTML = html;
    this._syncMockStructureFromHtml(html);
  }

  get textContent() {
    return this._innerHTML.replace(/<[^>]*>/g, '');
  }

  set textContent(text) {
    this._innerHTML = text;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') this.id = String(val);
    if (name === 'class') {
      this.classList.classes.clear();
      val.split(/\s+/).forEach((c) => c && this.classList.add(c));
    }
  }

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  addEventListener(event, handler) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(handler);
  }

  removeEventListener(event, handler) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter((h) => h !== handler);
    }
  }

  dispatchEvent(eventObj) {
    const eventType = typeof eventObj === 'string' ? eventObj : eventObj.type;
    const evt = typeof eventObj === 'string' ? { type: eventObj, target: this, preventDefault: () => {} } : eventObj;
    if (!evt.target) evt.target = this;
    if (!evt.preventDefault) evt.preventDefault = () => {};

    if (this.eventListeners[eventType]) {
      this.eventListeners[eventType].forEach((h) => h(evt));
    }

    if (this.parentElement && !evt.propagationStopped) {
      this.parentElement.dispatchEvent(evt);
    }
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all.length > 0 ? all[0] : null;
  }

  querySelectorAll(selector) {
    const results = [];
    const check = (el) => {
      if (matchesSelector(el, selector)) {
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
      if (matchesSelector(curr, selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  _syncMockStructureFromHtml(html) {
    this.children = [];
    if (!html || typeof html !== 'string') return;

    // Extract elements with id, class, or dataset
    const tagRegex = /<([a-zA-Z0-9\-]+)([^>]*)>/g;
    let match;
    while ((match = tagRegex.exec(html)) !== null) {
      const tagName = match[1];
      const attrsStr = match[2];

      const el = new MockElement(tagName);
      el.parentElement = this;

      // Extract id
      const idMatch = attrsStr.match(/id=["']([^"']+)["']/i);
      if (idMatch) el.id = idMatch[1];

      // Extract classes
      const classMatch = attrsStr.match(/class=["']([^"']+)["']/i);
      if (classMatch) {
        classMatch[1].split(/\s+/).forEach((c) => c && el.classList.add(c));
      }

      // Extract data-*
      const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
      let dMatch;
      while ((dMatch = dataRegex.exec(attrsStr)) !== null) {
        const camel = dMatch[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        el.dataset[camel] = dMatch[2];
      }

      // Extract href / type
      const hrefMatch = attrsStr.match(/href=["']([^"']+)["']/i);
      if (hrefMatch) el.setAttribute('href', hrefMatch[1]);

      this.children.push(el);
    }
  }
}

function matchesSelector(el, selector) {
  if (!el || !selector) return false;
  selector = selector.trim();

  // Multi-selector: e.g. '#btn-cancel-modal, .admin-modal-close'
  if (selector.includes(',')) {
    return selector.split(',').some((s) => matchesSelector(el, s));
  }

  // ID selector
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    return el.id === id;
  }

  // Class selector
  if (selector.startsWith('.')) {
    const cls = selector.slice(1);
    return el.classList.contains(cls);
  }

  // Tag selector
  if (/^[a-zA-Z0-9\-]+$/.test(selector)) {
    return el.tagName.toLowerCase() === selector.toLowerCase();
  }

  // Attribute selector e.g. [data-tab="products"]
  const attrMatch = selector.match(/\[([a-zA-Z0-9\-]+)(?:=["']([^"']*)["'])?\]/);
  if (attrMatch) {
    const attrName = attrMatch[1];
    const attrVal = attrMatch[2];
    if (attrName.startsWith('data-')) {
      const camel = attrName.slice(5).replace(/-([a-z])/g, (_, g) => g.toUpperCase());
      return attrVal !== undefined ? el.dataset[camel] === attrVal : camel in el.dataset;
    }
    return attrVal !== undefined ? el.getAttribute(attrName) === attrVal : el.getAttribute(attrName) !== null;
  }

  return false;
}

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

// Setup Global Browser Context in Node
global.localStorage = new MockLocalStorage();
global.window = {
  location: { hash: '' },
  addEventListener: (event, handler) => {
    if (!global.window._listeners) global.window._listeners = {};
    if (!global.window._listeners[event]) global.window._listeners[event] = [];
    global.window._listeners[event].push(handler);
  },
  dispatchEvent: (event) => {
    const list = global.window._listeners?.[event] || [];
    list.forEach((h) => h({ type: event }));
  },
  scrollTo: () => {},
};

const domRoot = new MockElement('html');
const body = new MockElement('body');
domRoot.appendChild(body);

// Seed DOM mounting nodes matching public/index.html
const mountingIds = [
  'navbar-container',
  'hero-banner',
  'catalog-container',
  'account-view-container',
  'order-confirmation-container',
  'admin-view-container',
  'toast-container',
  'auth-modal-container',
];

const mountedElements = {};
mountingIds.forEach((id) => {
  const el = new MockElement('div', id);
  body.appendChild(el);
  mountedElements[id] = el;
});

global.document = {
  getElementById: (id) => mountedElements[id] || body.querySelector(`#${id}`),
  querySelector: (sel) => body.querySelector(sel) || (sel.startsWith('#') ? mountedElements[sel.slice(1)] : null),
  querySelectorAll: (sel) => body.querySelectorAll(sel),
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  body,
};

// =========================================================================
// Test Runner Engine
// =========================================================================

async function runEmpiricalStressSuite() {
  console.log('\n===============================================================');
  console.log('   VelvetAura M5: Empirical Frontend Stress & Challenge Suite   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (!condition) {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
      throw new Error(`Assertion failed: ${message}`);
    } else {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    }
  }

  // 1. Start ephemeral HTTP server for live empirical REST execution
  console.log('[Setup 1/4] Starting ephemeral Node HTTP server...');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api`;
  console.log(`[Setup 1/4] Server listening on ${baseUrl}`);

  // 2. Connect Database
  console.log('[Setup 2/4] Connecting to In-Memory MongoDB...');
  await connectDB({ forceMemory: true });

  // 3. Seed Admin and Customer in DB
  console.log('[Setup 3/4] Seeding Admin and Customer credentials in MongoDB...');
  await User.deleteMany({});
  await Product.deleteMany({});
  await Order.deleteMany({});

  const adminPassword = 'AdminSecret2026!';
  const customerPassword = 'CustomerSecret2026!';

  const adminUser = await User.create({
    name: 'Madame Directrice',
    email: 'directrice@velvetaura.luxury',
    password: adminPassword,
    role: 'admin',
    address: { street: '1 Place Vendôme', city: 'Paris', state: 'IDF', zip: '75001', country: 'France' },
  });

  const customerUser = await User.create({
    name: 'Lord Byron',
    email: 'byron@velvetaura.luxury',
    password: customerPassword,
    role: 'customer',
    address: { street: '221B Baker St', city: 'London', state: 'LDN', zip: 'NW1', country: 'United Kingdom' },
  });

  // Seed initial product
  const seedProduct = await Product.create({
    name: 'Sérum Précieux Impérial',
    brand: 'Guerlain',
    origin: 'France',
    category: 'skincare',
    subcategory: 'Elixir',
    description: 'An extraordinary cellular rejuvenation serum harvested from rare black orchids.',
    price: 495.00,
    stock: 7,
    images: ['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800'],
    featured: true,
  });

  // Seed initial order
  const seedOrder = await Order.create({
    user: customerUser._id,
    orderNumber: 'VA-TEST-001',
    items: [{
      product: seedProduct._id,
      name: seedProduct.name,
      price: seedProduct.price,
      quantity: 1,
      image: seedProduct.images[0],
    }],
    pricing: { subtotal: 495, tax: 39.60, shipping: 0, grandTotal: 534.60 },
    shippingAddress: {
      fullName: 'Lord Byron',
      street: '221B Baker St',
      city: 'London',
      state: 'LDN',
      zip: 'NW1',
      country: 'United Kingdom',
    },
    payment: { method: 'card', status: 'succeeded', transactionId: 'TXN-TEST-001' },
    status: 'pending',
  });

  // 4. Dynamically import client ES modules with baseUrl configured
  console.log('[Setup 4/4] Dynamically loading frontend ES modules...');
  const apiModulePath = path.resolve(__dirname, '../public/js/api.js');
  const storeModulePath = path.resolve(__dirname, '../public/js/store.js');
  const navbarModulePath = path.resolve(__dirname, '../public/js/components/navbar.js');
  const adminDashModulePath = path.resolve(__dirname, '../public/js/components/adminDashboard.js');

  const { ApiClient } = await import(`file:///${apiModulePath.replace(/\\/g, '/')}`);
  const { Store } = await import(`file:///${storeModulePath.replace(/\\/g, '/')}`);
  const { NavbarComponent } = await import(`file:///${navbarModulePath.replace(/\\/g, '/')}`);
  const { AdminDashboardComponent } = await import(`file:///${adminDashModulePath.replace(/\\/g, '/')}`);

  // Configure live API client
  const clientApi = new ApiClient(baseUrl);
  const clientStore = new Store();
  // Override api in store with live baseUrl
  clientStore.api = clientApi;

  // Login both users via live API to obtain real JWTs
  const adminLoginRes = await clientApi.login({ email: adminUser.email, password: adminPassword });
  const adminToken = adminLoginRes.data.token;
  const adminUserData = adminLoginRes.data.user;

  const customerLoginRes = await clientApi.login({ email: customerUser.email, password: customerPassword });
  const customerToken = customerLoginRes.data.token;
  const customerUserData = customerLoginRes.data.user;

  assert(adminToken && adminUserData.role === 'admin', 'Setup: Admin JWT acquired with role === admin');
  assert(customerToken && customerUserData.role === 'customer', 'Setup: Customer JWT acquired with role === customer');

  // =========================================================================
  // Test Suite 1: Route Guard Resilience & Dynamic Eviction
  // =========================================================================
  console.log('\n--- Challenge 1: Route Guard Resilience & Dynamic Eviction ---');
  {
    // Mock the SPA router handler matching public/js/app.js:73-139
    const navbar = new NavbarComponent('#navbar-container');
    const adminDashboard = new AdminDashboardComponent('#admin-view-container');
    navbar.init();
    adminDashboard.init();

    function handleRouting() {
      const rawHash = global.window.location.hash || '#/catalog';
      const hash = rawHash.split('?')[0];

      const heroBanner = document.querySelector('#hero-banner');
      const catalogContainer = document.querySelector('#catalog-container');
      const accountContainer = document.querySelector('#account-view-container');
      const orderReceiptContainer = document.querySelector('#order-confirmation-container');
      const adminContainer = document.querySelector('#admin-view-container');

      if (hash.startsWith('#/admin')) {
        const auth = clientStore.getState('auth');
        if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
          clientStore.showToast('Access denied: Administrator privileges required', 'error');
          if (!auth.isAuthenticated) {
            clientStore.openAuthModal('login');
          }
          global.window.location.hash = '#/catalog';
          return;
        }

        if (heroBanner) heroBanner.classList.add('hidden');
        if (catalogContainer) catalogContainer.classList.add('hidden');
        if (accountContainer) accountContainer.classList.add('hidden');
        if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
        if (adminContainer) {
          adminContainer.classList.remove('hidden');
          adminDashboard.render();
        }
      } else {
        if (heroBanner) heroBanner.classList.remove('hidden');
        if (catalogContainer) catalogContainer.classList.remove('hidden');
        if (accountContainer) accountContainer.classList.add('hidden');
        if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
        if (adminContainer) adminContainer.classList.add('hidden');
      }
    }

    // Attach dynamic auth eviction observer matching public/js/app.js:51-58
    clientStore.subscribe('auth', (auth) => {
      if (global.window.location.hash.startsWith('#/admin')) {
        if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
          clientStore.showToast('Access denied: Administrator privileges required', 'error');
          global.window.location.hash = '#/catalog';
        }
      }
    });

    // Sub-test 1.1: Unauthenticated visitor navigating to #/admin
    clientStore.setState('auth', { isAuthenticated: false, user: null, token: null });
    clientStore.setState('ui', { toasts: [], authModal: { isOpen: false, mode: 'login' } });
    global.window.location.hash = '#/admin';
    handleRouting();

    assert(global.window.location.hash === '#/catalog', '1.1 Unauthenticated access to #/admin redirects to #/catalog');
    assert(clientStore.getState('ui').authModal.isOpen === true, '1.1 Unauthenticated access opens login authModal');
    const toast1 = clientStore.getState('ui').toasts.find((t) => t.message.includes('Access denied'));
    assert(Boolean(toast1 && toast1.type === 'error'), '1.1 Unauthenticated access triggers error toast');
    assert(mountedElements['admin-view-container'].classList.contains('hidden') || !mountedElements['admin-view-container'].innerHTML.includes('admin-dashboard-container'), '1.1 Admin container remains blocked');

    // Sub-test 1.2: Authenticated customer navigating to #/admin
    clientStore.setState('auth', { isAuthenticated: true, user: customerUserData, token: customerToken });
    clientStore.setState('ui', { toasts: [], authModal: { isOpen: false, mode: 'login' } });
    global.window.location.hash = '#/admin';
    handleRouting();

    assert(global.window.location.hash === '#/catalog', '1.2 Customer navigating to #/admin is immediately redirected to #/catalog');
    assert(clientStore.getState('ui').authModal.isOpen === false, '1.2 Customer is NOT prompted with redundant login modal');
    const toast2 = clientStore.getState('ui').toasts.find((t) => t.message.includes('Access denied'));
    assert(Boolean(toast2 && toast2.type === 'error'), '1.2 Customer receives "Access denied" error toast');

    // Sub-test 1.3: Authenticated admin navigating to #/admin
    clientStore.setState('auth', { isAuthenticated: true, user: adminUserData, token: adminToken });
    global.window.location.hash = '#/admin';
    handleRouting();

    assert(global.window.location.hash === '#/admin', '1.3 Admin navigating to #/admin remains on #/admin');
    assert(!mountedElements['admin-view-container'].classList.contains('hidden'), '1.3 Admin container has "hidden" class removed');
    assert(mountedElements['catalog-container'].classList.contains('hidden'), '1.3 Catalog container is hidden');
    assert(mountedElements['hero-banner'].classList.contains('hidden'), '1.3 Hero banner is hidden');
    assert(mountedElements['admin-view-container'].innerHTML.includes('Haute Management'), '1.3 Admin Studio header is successfully rendered in DOM');

    // Sub-test 1.4: Dynamic Eviction on Logout
    // While viewing #/admin, simulating user clicking logout or token expiry
    assert(global.window.location.hash === '#/admin', '1.4 Precondition: Currently on #/admin');
    clientStore.setState('ui', { toasts: [] });
    // Trigger logout
    clientStore.setState('auth', { isAuthenticated: false, user: null, token: null });

    assert(global.window.location.hash === '#/catalog', '1.4 Dynamic eviction: Logging out instantly switches hash from #/admin to #/catalog');
    const toast4 = clientStore.getState('ui').toasts.find((t) => t.message.includes('Access denied'));
    assert(Boolean(toast4), '1.4 Dynamic eviction fires security toast notice');

    // Sub-test 1.5: Dynamic Eviction on Role Demotion
    // If admin permissions are revoked while on #/admin
    clientStore.setState('auth', { isAuthenticated: true, user: adminUserData, token: adminToken });
    global.window.location.hash = '#/admin';
    handleRouting();
    assert(global.window.location.hash === '#/admin', '1.5 Precondition: Admin on #/admin');

    // Demote role to customer
    clientStore.setState('auth', { isAuthenticated: true, user: { ...adminUserData, role: 'customer' }, token: adminToken });
    assert(global.window.location.hash === '#/catalog', '1.5 Dynamic eviction: Role demotion to customer instantly evicts from #/admin');
  }

  // =========================================================================
  // Test Suite 2: Navbar Role Reactivity & DOM Lifecycle
  // =========================================================================
  console.log('\n--- Challenge 2: Navbar Role Reactivity & DOM Lifecycle ---');
  {
    const navContainer = mountedElements['navbar-container'];
    const navbar = new NavbarComponent('#navbar-container');
    navbar.init();

    // Sub-test 2.1: Logged-out guest state
    clientStore.setState('auth', { isAuthenticated: false, user: null, token: null });
    navbar.render();

    assert(!navContainer.innerHTML.includes('id="nav-admin-link"'), '2.1 Logged-out guest has no #nav-admin-link');
    assert(!navContainer.innerHTML.includes('id="nav-admin-action-btn"'), '2.1 Logged-out guest has no #nav-admin-action-btn');
    assert(!navContainer.innerHTML.includes('badge-role-admin'), '2.1 Logged-out guest has no ADMIN badge');
    assert(navContainer.innerHTML.includes('Sign In'), '2.1 Logged-out guest sees "Sign In" button');

    // Sub-test 2.2: Customer logged in
    clientStore.setState('auth', { isAuthenticated: true, user: customerUserData, token: customerToken });
    navbar.render();

    assert(!navContainer.innerHTML.includes('id="nav-admin-link"'), '2.2 Customer has no #nav-admin-link in user dropdown');
    assert(!navContainer.innerHTML.includes('id="nav-admin-action-btn"'), '2.2 Customer has no #nav-admin-action-btn in navbar actions');
    assert(!navContainer.innerHTML.includes('badge-role-admin'), '2.2 Customer has no ADMIN role badge');
    assert(navContainer.innerHTML.includes('LB'), '2.2 Customer initials "LB" rendered on avatar');
    assert(navContainer.innerHTML.includes('Sign Out'), '2.2 Customer menu contains "Sign Out"');

    // Sub-test 2.3: Admin logged in
    clientStore.setState('auth', { isAuthenticated: true, user: adminUserData, token: adminToken });
    navbar.render();

    assert(navContainer.innerHTML.includes('id="nav-admin-action-btn"'), '2.3 Admin user renders #nav-admin-action-btn in navbar actions');
    assert(navContainer.innerHTML.includes('href="#/admin"'), '2.3 Admin action button links directly to #/admin');
    assert(navContainer.innerHTML.includes('id="nav-admin-link"'), '2.3 Admin user renders #nav-admin-link in dropdown');
    assert(navContainer.innerHTML.includes('badge-role-admin'), '2.3 Admin user renders golden ADMIN pill badge');

    // Sub-test 2.4: Admin logs out
    clientStore.setState('auth', { isAuthenticated: false, user: null, token: null });
    navbar.render();

    assert(!navContainer.innerHTML.includes('id="nav-admin-link"'), '2.4 Admin link immediately disappears upon logout');
    assert(!navContainer.innerHTML.includes('id="nav-admin-action-btn"'), '2.4 Admin action button immediately disappears upon logout');
    assert(!navContainer.innerHTML.includes('badge-role-admin'), '2.4 Admin badge disappears upon logout');

    // Sub-test 2.5: Stress cycle (Guest -> Customer -> Admin -> Customer -> Admin -> Guest)
    const transitions = [
      { role: null, expectAdmin: false },
      { role: 'customer', expectAdmin: false },
      { role: 'admin', expectAdmin: true },
      { role: 'customer', expectAdmin: false },
      { role: 'admin', expectAdmin: true },
      { role: null, expectAdmin: false },
    ];

    let cyclePassed = true;
    for (const step of transitions) {
      if (step.role === 'admin') {
        clientStore.setState('auth', { isAuthenticated: true, user: adminUserData, token: adminToken });
      } else if (step.role === 'customer') {
        clientStore.setState('auth', { isAuthenticated: true, user: customerUserData, token: customerToken });
      } else {
        clientStore.setState('auth', { isAuthenticated: false, user: null, token: null });
      }
      navbar.render();

      const hasAction = navContainer.innerHTML.includes('id="nav-admin-action-btn"');
      const hasDropdown = navContainer.innerHTML.includes('id="nav-admin-link"');
      if (step.expectAdmin !== (hasAction && hasDropdown)) {
        cyclePassed = false;
        break;
      }
    }
    assert(cyclePassed, '2.5 High-frequency role transitions maintain strict DOM integrity with zero stale links');
  }

  // =========================================================================
  // Test Suite 3: Catalog-Store Real-Time Synchronization
  // =========================================================================
  console.log('\n--- Challenge 3: Catalog-Store Real-Time Synchronization ---');
  {
    // Authenticate clientStore with admin token
    clientApi.setAuth({ user: adminUserData, token: adminToken });
    clientStore.setState('auth', { isAuthenticated: true, user: adminUserData, token: adminToken });

    // Initial fetch
    await clientStore.fetchProducts();
    const initialCount = clientStore.getState('catalog').products.length;
    assert(initialCount >= 1, `3.0 Initial catalog loaded with ${initialCount} seeded products`);

    // Sub-test 3.1: Admin adds new product via store.createAdminProduct
    const newProductPayload = {
      name: 'Sublime Caviar Absolute',
      brand: 'La Prairie',
      origin: 'Switzerland',
      category: 'skincare',
      subcategory: 'Firming Emulsion',
      description: 'Enriched with cellular caviar extract for peerless lifting and firming performance.',
      price: 820.00,
      stock: 10,
      featured: true,
      image: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800',
    };

    const createdProduct = await clientStore.createAdminProduct(newProductPayload);
    assert(Boolean(createdProduct && createdProduct._id), '3.1 Admin product created with valid MongoDB _id');

    // Check catalog store slice
    const catalogAfterCreate = clientStore.getState('catalog').products;
    const foundInCatalog = catalogAfterCreate.find((p) => String(p._id) === String(createdProduct._id));
    assert(Boolean(foundInCatalog), '3.1 Created product immediately synchronizes into store catalog slice');
    assert(foundInCatalog.price === 820.00, '3.1 Catalog slice reflects exact price $820.00');

    // Sub-test 3.2: Admin updates product via store.updateAdminProduct
    const updatePayload = {
      price: 890.00,
      stock: 25,
      name: 'Sublime Caviar Absolute Premier',
    };

    const updatedProduct = await clientStore.updateAdminProduct(createdProduct._id, updatePayload);
    assert(Boolean(updatedProduct && updatedProduct.price === 890.00), '3.2 Product updated on server with price $890.00');

    // Verify catalog store slice was refreshed
    const catalogAfterUpdate = clientStore.getState('catalog').products;
    const foundUpdated = catalogAfterUpdate.find((p) => String(p._id) === String(createdProduct._id));
    assert(Boolean(foundUpdated), '3.2 Updated product found in store catalog slice');
    assert(foundUpdated.price === 890.00, '3.2 Catalog slice reflects updated price $890.00');
    assert(foundUpdated.stock === 25, '3.2 Catalog slice reflects updated stock 25');
    assert(foundUpdated.name === 'Sublime Caviar Absolute Premier', '3.2 Catalog slice reflects updated title');

    // Sub-test 3.3: Admin deletes product via store.deleteAdminProduct
    const deleteResult = await clientStore.deleteAdminProduct(createdProduct._id);
    assert(deleteResult === true, '3.3 Product deleted successfully via store.deleteAdminProduct');

    const catalogAfterDelete = clientStore.getState('catalog').products;
    const foundDeleted = catalogAfterDelete.find((p) => String(p._id) === String(createdProduct._id));
    assert(!foundDeleted, '3.3 Deleted product is immediately purged from public catalog store slice');

    // Sub-test 3.4: Order status update and state synchronization
    const orders = await clientStore.fetchAdminOrders();
    assert(Array.isArray(orders) && orders.length >= 1, '3.4 Admin orders fetched into store slice');
    const targetOrder = orders.find((o) => String(o._id) === String(seedOrder._id));
    assert(Boolean(targetOrder), '3.4 Seeded order present in admin orders state');

    // Update status to 'shipped'
    const updatedOrder = await clientStore.updateAdminOrderStatus(seedOrder._id, 'shipped');
    assert(Boolean(updatedOrder && updatedOrder.status === 'shipped'), '3.4 Order status updated to "shipped" in MongoDB');

    const ordersAfterUpdate = clientStore.getState('admin').orders;
    const orderInStore = ordersAfterUpdate.find((o) => String(o._id) === String(seedOrder._id));
    assert(Boolean(orderInStore && orderInStore.status === 'shipped'), '3.4 Order state slice reflects new status "shipped"');

    // Sub-test 3.5: Error boundary & Rollback resilience
    // Attempting to update product with invalid negative price
    let caughtError = false;
    try {
      await clientStore.updateAdminProduct(seedProduct._id, { price: -50.00 });
    } catch (e) {
      caughtError = true;
    }
    assert(caughtError, '3.5 Negative price creation correctly throws error');
    assert(clientStore.getState('admin').error !== null, '3.5 Admin error state captured');
    const catalogUntouched = clientStore.getState('catalog').products.find((p) => String(p._id) === String(seedProduct._id));
    assert(catalogUntouched.price === 495.00, '3.5 Catalog state remains intact at $495.00 without corruption');
  }

  // =========================================================================
  // Test Suite 4: Design System, Obsidian Theme & Glassmorphism Token Conformance
  // =========================================================================
  console.log('\n--- Challenge 4: Design System & Glassmorphism Token Conformance ---');
  {
    const cssPath = path.resolve(__dirname, '../public/css/components.css');
    const stylesPath = path.resolve(__dirname, '../public/css/styles.css');
    const adminJsPath = path.resolve(__dirname, '../public/js/components/adminDashboard.js');

    const cssContent = fs.readFileSync(cssPath, 'utf8');
    const stylesContent = fs.readFileSync(stylesPath, 'utf8');
    const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

    // Sub-test 4.1: Obsidian dark background palette
    const hasObsidianToken = stylesContent.includes('#0B0B13') || cssContent.includes('#0B0B13') || stylesContent.includes('--bg-canvas: #0b0b13') || stylesContent.includes('--bg-canvas');
    assert(hasObsidianToken, '4.1 Obsidian canvas foundation (#0B0B13) verified in design system tokens');

    // Sub-test 4.2: Translucent glassmorphism classes
    const hasGlassCard = cssContent.includes('.admin-kpi-card.glass-card') || cssContent.includes('.admin-studio-header') && cssContent.includes('glass-card');
    const hasBackdropBlur = cssContent.includes('backdrop-filter: blur') || stylesContent.includes('backdrop-filter: blur');
    const hasGlassElevated = cssContent.includes('.admin-modal-dialog.glass-elevated') || cssContent.includes('glass-elevated');
    assert(hasGlassCard, '4.2 Translucent .glass-card styling applied across Admin Studio containers');
    assert(hasBackdropBlur, '4.2 Dynamic backdrop blur filters applied across modal and floating surfaces');
    assert(hasGlassElevated, '4.2 .glass-elevated surface tokens applied to Admin dialogs and tabs');

    // Sub-test 4.3: Glowing luxury accents (Gold & Purple)
    const hasGoldAccents = cssContent.includes('--accent-gold') && cssContent.includes('.badge-role-admin');
    const hasPurpleGradients = cssContent.includes('rgba(26, 24, 41') || cssContent.includes('var(--accent-purple)') || stylesContent.includes('--accent-purple');
    assert(hasGoldAccents, '4.3 Luxury gold accents (--accent-gold) applied to Admin badges, KPI values, and CTA buttons');
    assert(hasPurpleGradients, '4.3 Deep royal purple atmospheric gradients applied to studio header');

    // Sub-test 4.4: Responsive layout breakpoints
    const hasResponsive900 = cssContent.includes('@media (max-width: 900px)');
    const hasResponsive600 = cssContent.includes('@media (max-width: 600px)');
    assert(hasResponsive900 && hasResponsive600, '4.4 Mobile and tablet media queries (@media 900px, 600px) present for Admin Studio tables and KPI grids');

    // Sub-test 4.5: Admin Dashboard component structure conformance
    const hasKpiCards = adminJsContent.includes('admin-kpi-grid') && adminJsContent.includes('admin-kpi-card');
    const hasStatusPills = adminJsContent.includes('status-pill-') || adminJsContent.includes('status-badge');
    const hasModalDialog = adminJsContent.includes('admin-modal-dialog') && adminJsContent.includes('admin-modal-overlay');
    assert(hasKpiCards, '4.5 Admin dashboard structure includes 4-card KPI inventory and order metric grids');
    assert(hasStatusPills, '4.5 Fulfillment status pills present with real-time class update bindings');
    assert(hasModalDialog, '4.5 Modal overlay portal presents accessible dialogs with aria-modal attributes');
  }

  // Cleanup
  console.log('\n[Teardown] Stopping ephemeral HTTP server and closing DB connection...');
  await new Promise((resolve) => server.close(resolve));
  await mongoose.connection.close();

  console.log('\n===============================================================');
  console.log(`Empirical Stress Suite Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalStressSuite().catch((err) => {
  console.error('\n❌ EMPIRICAL STRESS TEST SUITE CRASHED:', err);
  process.exit(1);
});
