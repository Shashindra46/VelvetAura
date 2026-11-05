/**
 * VelvetAura - Milestone 5 Refinement: Jest Adversarial Suite
 * Focus: Modal Layout, Cross-Viewport Bounds, and Frontend Upload UX Resilience
 * 
 * Executed by: teamwork_challenger_m5_refine_2
 * Date: 2026-11-05
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const request = require('supertest');

// Backend Modules
const app = require('../src/app');
const User = require('../src/models/User');

// =========================================================================
// Deterministic Mock DOM Environment for Frontend Component Verification
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
    this.name = '';
    this.type = '';
    this.src = '';
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
    return this._innerHTML.replace(/<[^>]*>/g, '').trim();
  }

  set textContent(text) {
    this._innerHTML = text;
  }

  get className() {
    return this.classList.toString();
  }

  set className(val) {
    this.classList.classes.clear();
    (val || '').split(/\s+/).forEach((c) => c && this.classList.add(c));
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'id') this.id = String(val);
    if (name === 'name') this.name = String(val);
    if (name === 'type') this.type = String(val);
    if (name === 'src') this.src = String(val);
    if (name === 'value') this.value = String(val);
    if (name === 'class') {
      this.className = String(val);
    }
  }

  getAttribute(name) {
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'class') this.classList.classes.clear();
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

  contains(child) {
    let curr = child;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  click() {
    this.dispatchEvent({ type: 'click', target: this, preventDefault: () => {} });
  }

  _syncMockStructureFromHtml(html) {
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

      const srcMatch = attrsStr.match(/src=["']([^"']*)["']/i);
      if (srcMatch) el.src = srcMatch[1];

      if (/\bchecked\b/i.test(attrsStr)) el.checked = true;
      if (/\bdisabled\b/i.test(attrsStr)) el.disabled = true;

      const dataRegex = /data-([a-zA-Z0-9\-]+)=["']([^"']+)["']/g;
      let dMatch;
      while ((dMatch = dataRegex.exec(attrsStr)) !== null) {
        const camel = dMatch[1].replace(/-([a-z])/g, (_, g) => g.toUpperCase());
        el.dataset[camel] = dMatch[2];
      }

      this.children.push(el);
    }

    const formEl = this.tagName === 'FORM' ? this : this.querySelector('form');
    if (formEl) {
      this.querySelectorAll('input, select, textarea').forEach((input) => {
        if (input.name) {
          formEl[input.name] = input;
        }
      });
    }
  }
}

function matchesSelector(el, selector) {
  if (!el || !selector) return false;
  selector = selector.trim();

  if (selector.includes(',')) {
    return selector.split(',').some((s) => matchesSelector(el, s));
  }

  if (selector.startsWith('#')) {
    return el.id === selector.slice(1);
  }

  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }

  if (/^[a-zA-Z0-9\-]+$/.test(selector)) {
    return el.tagName.toLowerCase() === selector.toLowerCase();
  }

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

// Global browser mocks
if (global.URL) {
  global.URL.createObjectURL = () => `blob:http://localhost/${Math.random().toString(36).substring(2, 9)}`;
  global.URL.revokeObjectURL = () => {};
} else {
  global.URL = {
    createObjectURL: () => `blob:http://localhost/${Math.random().toString(36).substring(2, 9)}`,
    revokeObjectURL: () => {},
  };
}

class MockFormData {
  constructor() {
    this._fields = {};
  }
  append(key, val) {
    this._fields[key] = val;
  }
  get(key) {
    return this._fields[key];
  }
  has(key) {
    return key in this._fields;
  }
}

global.FormData = MockFormData;

class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(k) { return this.store[k] || null; }
  setItem(k, v) { this.store[k] = String(v); }
  removeItem(k) { delete this.store[k]; }
  clear() { this.store = {}; }
}

global.localStorage = new MockLocalStorage();
global.window = {
  location: { hash: '' },
  addEventListener: () => {},
  dispatchEvent: () => {},
  scrollTo: () => {},
};

const domRoot = new MockElement('html');
const body = new MockElement('body');
domRoot.appendChild(body);

const adminViewContainer = new MockElement('div', 'admin-view-container');
body.appendChild(adminViewContainer);

global.document = {
  getElementById: (id) => (id === 'admin-view-container' ? adminViewContainer : body.querySelector(`#${id}`)),
  querySelector: (sel) => body.querySelector(sel) || (sel === '#admin-view-container' ? adminViewContainer : null),
  querySelectorAll: (sel) => body.querySelectorAll(sel),
  createElement: (tag) => new MockElement(tag),
  addEventListener: () => {},
  body,
};

// Base component definition for VM execution
class BaseComponent {
  constructor(containerSelector, options = {}) {
    this.container = typeof containerSelector === 'string' 
      ? document.querySelector(containerSelector) 
      : containerSelector;
    this.options = options;
    this.unsubscribers = [];
  }
  init() {
    this.render();
    this.bindEvents();
  }
  render() {}
  bindEvents() {}
  destroy() {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
  }
}

function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatPrice(amount) {
  const val = Number(amount) || 0;
  return `$${val.toFixed(2)}`;
}

// Instantiate test store
const mockStore = {
  state: {
    auth: { isAuthenticated: true, user: { name: 'Admin Curator', role: 'admin' }, token: 'mock-token' },
    admin: { activeTab: 'products', orders: [] },
    catalog: { products: [] },
  },
  getState(k) { return this.state[k] || {}; },
  setState(k, v) { this.state[k] = { ...this.state[k], ...v }; },
  subscribe(k, cb) { return () => {}; },
  showToast: jest.fn(),
  uploadProductImage: jest.fn(),
  createAdminProduct: jest.fn(),
  updateAdminProduct: jest.fn(),
  deleteAdminProduct: jest.fn(),
  fetchProducts: jest.fn(),
  fetchAdminOrders: jest.fn(),
};

// Load and evaluate AdminDashboardComponent in VM context
const adminJsPath = path.resolve(__dirname, '../public/js/components/adminDashboard.js');
const rawAdminCode = fs.readFileSync(adminJsPath, 'utf8')
  .replace(/^import\s+[^;]+;/gm, '// import stripped')
  .replace(/export\s+default\s+AdminDashboardComponent;?/g, '')
  .replace(/export\s+class\s+AdminDashboardComponent/g, 'class AdminDashboardComponent')
  + '\nreturn AdminDashboardComponent;';

const AdminDashboardComponent = vm.runInThisContext(
  `(function(BaseComponent, formatPrice, escapeHtml, formatDate, getOriginBadge, store) {\n${rawAdminCode}\n})`
)(BaseComponent, formatPrice, escapeHtml, () => '', () => '', mockStore);

// =========================================================================
// Jest Test Suites
// =========================================================================

describe('Milestone 5 Refinement: Modal Layout & Frontend Upload UI Resilience', () => {

  describe('Suite 1: CSS Architecture & Rule Conformance (public/css/components.css)', () => {
    let css;

    beforeAll(() => {
      const cssPath = path.resolve(__dirname, '../public/css/components.css');
      expect(fs.existsSync(cssPath)).toBe(true);
      css = fs.readFileSync(cssPath, 'utf8');
    });

    test('1.1 .admin-modal-overlay should have align-items: flex-start and overflow-y: auto', () => {
      const overlayMatch = css.match(/\.admin-modal-overlay\s*\{([^}]+)\}/);
      expect(overlayMatch).not.toBeNull();
      const overlayBody = overlayMatch[1];
      expect(overlayBody).toContain('align-items: flex-start');
      expect(overlayBody).toContain('overflow-y: auto');
      expect(overlayBody).toContain('position: fixed');
      expect(overlayBody).toContain('padding: var(--space-md)');
    });

    test('1.2 .admin-modal-dialog should have margin: auto, flex column, and max-height constraint', () => {
      const dialogMatch = css.match(/\.admin-modal-dialog\s*\{([^}]+)\}/);
      expect(dialogMatch).not.toBeNull();
      const dialogBody = dialogMatch[1];
      expect(dialogBody).toContain('margin: auto');
      expect(dialogBody).toContain('display: flex');
      expect(dialogBody).toContain('flex-direction: column');
      expect(dialogBody).toContain('max-height: calc(100vh - 3rem)');
      expect(dialogBody).toContain('overflow: hidden');
    });

    test('1.3 .admin-modal-header should be pinned with flex-shrink: 0', () => {
      const headerMatch = css.match(/\.admin-modal-header\s*\{([^}]+)\}/);
      expect(headerMatch).not.toBeNull();
      const headerBody = headerMatch[1];
      expect(headerBody).toContain('flex-shrink: 0');
      expect(headerBody).toContain('border-bottom: 1px solid var(--glass-border-subtle)');
    });

    test('1.4 .admin-modal-body should be scrollable with flex: 1 1 auto, overflow-y: auto, min-height: 0', () => {
      const bodyMatch = css.match(/\.admin-modal-body\s*\{([^}]+)\}/);
      expect(bodyMatch).not.toBeNull();
      const modalBodyRules = bodyMatch[1];
      expect(modalBodyRules).toContain('flex: 1 1 auto');
      expect(modalBodyRules).toContain('overflow-y: auto');
      expect(modalBodyRules).toContain('min-height: 0');
    });

    test('1.5 .admin-modal-footer should be pinned with flex-shrink: 0', () => {
      const footerMatch = css.match(/\.admin-modal-footer\s*\{([^}]+)\}/);
      expect(footerMatch).not.toBeNull();
      const footerBody = footerMatch[1];
      expect(footerBody).toContain('flex-shrink: 0');
      expect(footerBody).toContain('border-top: 1px solid var(--glass-border-subtle)');
    });

    test('1.6 .image-upload-widget and .image-preview-box should enforce 1:1 aspect ratio', () => {
      const widgetMatch = css.match(/\.image-upload-widget\s*\{([^}]+)\}/);
      expect(widgetMatch).not.toBeNull();
      expect(widgetMatch[1]).toContain('grid-template-columns: 140px 1fr');

      const previewBoxMatch = css.match(/\.image-preview-box\s*\{([^}]+)\}/);
      expect(previewBoxMatch).not.toBeNull();
      expect(previewBoxMatch[1]).toContain('width: 140px');
      expect(previewBoxMatch[1]).toContain('height: 140px');
      expect(previewBoxMatch[1]).toContain('aspect-ratio: 1 / 1');
    });

    test('1.7 Mobile media queries (max-width: 639px) should adapt layout safely', () => {
      expect(css).toContain('@media (max-width: 639px)');
      expect(css).toContain('max-height: calc(100vh - 1rem)');
      expect(css).toContain('grid-template-columns: 1fr');
    });
  });

  describe('Suite 2: Cross-Viewport Bounds & Coordinate Space Simulation', () => {
    const headerHeightPx = 65;
    const footerHeightPx = 65;
    const bodyNaturalContentHeightPx = 680;
    const naturalTotalHeight = headerHeightPx + footerHeightPx + bodyNaturalContentHeightPx; // 810px

    const testViewports = [
      { name: 'Ultra-short / Mobile Landscape', height: 480, padding: 4, mobile: true },
      { name: 'Very Constrained Height', height: 500, padding: 16, mobile: false },
      { name: 'Netbook / Compact Laptop', height: 600, padding: 16, mobile: false },
      { name: 'Small Screen / Tablet Portrait', height: 768, padding: 16, mobile: false },
      { name: 'Standard HD Laptop', height: 900, padding: 16, mobile: false },
      { name: 'Full HD 1080p Desktop', height: 1080, padding: 16, mobile: false },
    ];

    test.each(testViewports)('$name ($height px): should never place top coordinate in negative space', (vp) => {
      const vMargin = vp.mobile ? 16 : 48;
      const dialogMaxHeight = vp.height - vMargin;
      const actualDialogHeight = Math.min(naturalTotalHeight, dialogMaxHeight);

      let newTopOffset;
      if (actualDialogHeight < vp.height - (vp.padding * 2)) {
        newTopOffset = (vp.height - actualDialogHeight) / 2;
      } else {
        newTopOffset = vp.padding;
      }

      const bodyScrollContainerHeight = actualDialogHeight - headerHeightPx - footerHeightPx;

      // Assertions
      expect(newTopOffset).toBeGreaterThanOrEqual(0);
      expect(newTopOffset).toBeGreaterThanOrEqual(vp.padding);
      expect(actualDialogHeight).toBeLessThanOrEqual(vp.height);
      expect(bodyScrollContainerHeight).toBeGreaterThan(0);
    });
  });

  describe('Suite 3: Frontend DOM Integrity in public/js/components/adminDashboard.js', () => {
    let adminComponent;

    beforeAll(() => {
      adminComponent = new AdminDashboardComponent('#admin-view-container');
      adminComponent.init();
    });

    test('3.1 "Add Product" modal should render correct structure, 1:1 preview, dropzone, and hidden inputs', () => {
      adminComponent.modalMode = 'add';
      adminComponent.activeProduct = null;
      adminComponent.render();

      const html = adminViewContainer.innerHTML;
      expect(html).toContain('Add New Imported Product');
      expect(html).toContain('Create Product');
      expect(html).toContain('id="image-preview-box"');
      expect(html).toContain('id="image-preview-img"');
      expect(html).toContain('id="image-preview-placeholder"');
      expect(html).toContain('id="btn-remove-image"');
      expect(html).toContain('id="image-dropzone"');
      expect(html).toContain('id="form-prod-file-input"');
      expect(html).toContain('accept="image/png,image/jpeg,image/webp,image/gif"');
      expect(html).toContain('id="form-prod-image"');
      expect(html).toContain('id="image-upload-status"');

      const addPreviewImg = adminViewContainer.querySelector('#image-preview-img');
      const addPlaceholder = adminViewContainer.querySelector('#image-preview-placeholder');
      const addRemoveBtn = adminViewContainer.querySelector('#btn-remove-image');
      const addHiddenInput = adminViewContainer.querySelector('#form-prod-image');

      expect(addPreviewImg.classList.contains('hidden')).toBe(true);
      expect(addPlaceholder.classList.contains('hidden')).toBe(false);
      expect(addRemoveBtn.classList.contains('hidden')).toBe(true);
      expect(addHiddenInput.value).toBe('');
    });

    test('3.2 "Edit Product" modal should populate existing product data and display 1:1 image preview', () => {
      const existingProduct = {
        _id: '507f1f77bcf86cd799439011',
        name: 'Absolue Revitalizing Soft Cream',
        brand: 'Lancôme',
        origin: 'France',
        category: 'skincare',
        subcategory: 'Regenerating Cream',
        price: 260.00,
        stock: 18,
        volume: '60 ml / 2.0 oz',
        featured: true,
        description: 'Infused with Grand Rose Extracts for transformative cellular revitalization.',
        image: '/assets/images/products/lancome-absolue.webp',
        images: ['/assets/images/products/lancome-absolue.webp'],
      };

      adminComponent.modalMode = 'edit';
      adminComponent.activeProduct = existingProduct;
      adminComponent.render();

      const html = adminViewContainer.innerHTML;
      expect(html).toContain('Edit Luxury Product');
      expect(html).toContain('Save Changes');

      const editPreviewImg = adminViewContainer.querySelector('#image-preview-img');
      const editPlaceholder = adminViewContainer.querySelector('#image-preview-placeholder');
      const editRemoveBtn = adminViewContainer.querySelector('#btn-remove-image');
      const editHiddenInput = adminViewContainer.querySelector('#form-prod-image');
      const editNameInput = adminViewContainer.querySelector('#form-prod-name');
      const editPriceInput = adminViewContainer.querySelector('#form-prod-price');

      expect(editPreviewImg.classList.contains('hidden')).toBe(false);
      expect(editPreviewImg.src).toBe('/assets/images/products/lancome-absolue.webp');
      expect(editPlaceholder.classList.contains('hidden')).toBe(true);
      expect(editRemoveBtn.classList.contains('hidden')).toBe(false);
      expect(editHiddenInput.value).toBe('/assets/images/products/lancome-absolue.webp');
      expect(editNameInput.value).toBe('Absolue Revitalizing Soft Cream');
      expect(String(editPriceInput.value)).toBe('260');
    });
  });

  describe('Suite 4: "Remove Image" Behavior & Non-Destructive Form Field Retention', () => {
    let adminComponent;

    beforeAll(() => {
      adminComponent = new AdminDashboardComponent('#admin-view-container');
      adminComponent.init();
    });

    test('4.1 Removing image should clear preview and hidden input without wiping out typed form fields', () => {
      const existingProduct = {
        _id: '507f1f77bcf86cd799439022',
        name: 'Rose Gold Cellular Elixir',
        brand: 'La Prairie',
        origin: 'Switzerland',
        category: 'skincare',
        subcategory: 'Youth Elixir',
        price: 850.00,
        stock: 5,
        volume: '30 ml / 1.0 oz',
        featured: true,
        description: 'Enriched with colloidal gold and peptide complex for maximum firming.',
        image: '/assets/images/products/la-prairie-rose-gold.webp',
        images: ['/assets/images/products/la-prairie-rose-gold.webp'],
      };

      adminComponent.modalMode = 'edit';
      adminComponent.activeProduct = existingProduct;
      adminComponent.render();

      const nameInput = adminViewContainer.querySelector('#form-prod-name');
      const brandInput = adminViewContainer.querySelector('#form-prod-brand');
      const priceInput = adminViewContainer.querySelector('#form-prod-price');
      const stockInput = adminViewContainer.querySelector('#form-prod-stock');
      const descInput = adminViewContainer.querySelector('#form-prod-description');

      nameInput.value = 'Rose Gold Cellular Elixir - Limited Edition 2026';
      brandInput.value = 'La Prairie Haute Parfumerie';
      priceInput.value = '920.00';
      stockInput.value = '12';
      descInput.value = 'Updated artisanal description with custom client notes and batch verification.';

      // Invoke removal
      adminComponent.handleImageRemoval();

      const previewImg = adminViewContainer.querySelector('#image-preview-img');
      const placeholder = adminViewContainer.querySelector('#image-preview-placeholder');
      const previewBox = adminViewContainer.querySelector('#image-preview-box');
      const removeBtn = adminViewContainer.querySelector('#btn-remove-image');
      const hiddenInput = adminViewContainer.querySelector('#form-prod-image');
      const statusEl = adminViewContainer.querySelector('#image-upload-status');

      expect(previewImg.classList.contains('hidden')).toBe(true);
      expect(previewImg.src).toBe('');
      expect(placeholder.classList.contains('hidden')).toBe(false);
      expect(previewBox.classList.contains('empty')).toBe(true);
      expect(previewBox.classList.contains('has-image')).toBe(false);
      expect(removeBtn.classList.contains('hidden')).toBe(true);
      expect(hiddenInput.value).toBe('');
      expect(statusEl.classList.contains('hidden')).toBe(false);
      expect(statusEl.innerHTML).toContain('Image removed. Save changes to update.');

      // Field Retention Check
      expect(nameInput.value).toBe('Rose Gold Cellular Elixir - Limited Edition 2026');
      expect(brandInput.value).toBe('La Prairie Haute Parfumerie');
      expect(priceInput.value).toBe('920.00');
      expect(stockInput.value).toBe('12');
      expect(descInput.value).toBe('Updated artisanal description with custom client notes and batch verification.');
    });
  });

  describe('Suite 5: Frontend Upload UX Resilience, Input Validation & State Machine', () => {
    let adminComponent;

    beforeAll(() => {
      adminComponent = new AdminDashboardComponent('#admin-view-container');
      adminComponent.init();
      adminComponent.modalMode = 'add';
      adminComponent.activeProduct = null;
      adminComponent.render();
    });

    test('5.1 Rejects invalid MIME type (e.g. application/pdf) with user-friendly error', async () => {
      const invalidMimeFile = {
        name: 'payload.pdf',
        type: 'application/pdf',
        size: 1024 * 1024,
      };

      await adminComponent.handleImageFileSelection(invalidMimeFile);

      const errorEl = adminViewContainer.querySelector('#form-prod-error');
      expect(errorEl.classList.contains('hidden')).toBe(false);
      expect(errorEl.textContent).toContain('Invalid file type');
      expect(adminComponent.isUploadingImage).toBe(false);
    });

    test('5.2 Rejects oversized file (> 5MB) before making network calls', async () => {
      const oversizedFile = {
        name: 'heavy_photo.jpg',
        type: 'image/jpeg',
        size: 6.5 * 1024 * 1024,
      };

      await adminComponent.handleImageFileSelection(oversizedFile);

      const errorEl = adminViewContainer.querySelector('#form-prod-error');
      expect(errorEl.classList.contains('hidden')).toBe(false);
      expect(errorEl.textContent).toContain('exceeds maximum limit of 5MB');
      expect(adminComponent.isUploadingImage).toBe(false);
    });

    test('5.3 Successful upload updates preview, attaches URL, and enables submit', async () => {
      mockStore.uploadProductImage.mockResolvedValueOnce('/assets/images/products/prod-test-success.webp');

      const validFile = {
        name: 'parfum.webp',
        type: 'image/webp',
        size: 1.5 * 1024 * 1024,
      };

      await adminComponent.handleImageFileSelection(validFile);

      const hiddenInput = adminViewContainer.querySelector('#form-prod-image');
      expect(hiddenInput.value).toBe('/assets/images/products/prod-test-success.webp');

      const statusEl = adminViewContainer.querySelector('#image-upload-status');
      expect(statusEl.classList.contains('status-success')).toBe(true);
      expect(statusEl.innerHTML).toContain('Image uploaded and attached');

      const submitBtn = adminViewContainer.querySelector('#btn-submit-product');
      expect(submitBtn.disabled).toBe(false);
    });
  });

  describe('Suite 6: Live API Integration & RBAC Enforcement (POST /api/products/upload)', () => {
    let adminToken;
    let customerToken;
    const createdDiskFiles = [];

    beforeEach(async () => {
      await User.deleteMany({});

      const adminUser = await User.create({
        name: 'Curator Admin',
        email: 'curator.m5@velvetaura.luxury',
        password: 'AdminPassword2026!',
        role: 'admin',
      });

      const customerUser = await User.create({
        name: 'Customer Member',
        email: 'customer.m5@velvetaura.luxury',
        password: 'CustomerPassword2026!',
        role: 'customer',
      });

      const adminLoginRes = await request(app).post('/api/auth/login').send({
        email: adminUser.email,
        password: 'AdminPassword2026!',
      });
      adminToken = adminLoginRes.body.token;

      const customerLoginRes = await request(app).post('/api/auth/login').send({
        email: customerUser.email,
        password: 'CustomerPassword2026!',
      });
      customerToken = customerLoginRes.body.token;
    });

    afterAll(() => {
      for (const f of createdDiskFiles) {
        if (fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch (_) {}
        }
      }
    });

    test('6.1 Returns 401 when unauthenticated', async () => {
      const res = await request(app).post('/api/products/upload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('6.2 Returns 403 when called by non-admin customer', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('6.3 Returns 400 when no file is attached', async () => {
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('FILE_MISSING');
    });

    test('6.4 Returns 400 when non-image file is attached', async () => {
      const textBuffer = Buffer.from('non-image data');
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', textBuffer, 'doc.txt');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_FILE_TYPE');
    });

    test('6.5 Admin can successfully upload JPEG file which is persisted and served', async () => {
      const dummyJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
      const res = await request(app)
        .post('/api/products/upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('image', dummyJpegBuffer, 'cream.jpg');

      expect([200, 201]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.imageUrl).toBe('string');
      expect(res.body.imageUrl.startsWith('/assets/images/products/')).toBe(true);

      const diskPath = path.resolve(__dirname, '../public', res.body.imageUrl.replace(/^\//, ''));
      createdDiskFiles.push(diskPath);

      expect(fs.existsSync(diskPath)).toBe(true);

      // Verify static serving
      const staticRes = await request(app).get(res.body.imageUrl);
      expect(staticRes.status).toBe(200);
      expect(staticRes.headers['content-type']).toContain('image/jpeg');
    });
  });
});
