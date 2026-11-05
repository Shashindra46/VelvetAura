# Technical Analysis & Implementation Blueprint: Orders, Checkout, Mock Payment & Integration Test Suite

**Agent**: `teamwork_explorer_m2_3`  
**Milestone**: Milestone 2 (Catalog, Seed Data & Core E-Commerce Services)  
**Date**: 2026-11-04  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\`  

---

## 1. Executive Summary & Problem Boundary

VelvetAura requires a robust, production-grade checkout and order management pipeline backed by MongoDB, a deterministic mock payment engine, and a comprehensive Jest/Supertest integration test suite to verify core backend capabilities under `npm test`.

This blueprint establishes:
1. **Payment Mock Service (`src/services/paymentService.js`)**: An isolated simulation service supporting valid test cards (Visa, Mastercard, Amex), deterministic card decline simulations (cards ending in `0002`), expired cards, CVV validations, and realistic transaction IDs formatted as `TXN-VA-<timestamp>-<random>`.
2. **Order Controller & Routes (`src/controllers/orderController.js`, `src/routes/orderRoutes.js`)**:
   - `POST /api/orders/checkout`: Validates cart state, checks inventory, decrements catalog stock with atomic rollback guards, authorizes payment, records immutable item snapshots and financial breakdowns, and resets the active cart.
   - `GET /api/orders/my-orders`: Retrieves authenticated customer order history sorted by creation date descending.
   - `GET /api/orders/:id`: Retrieves order details with strict ownership verification preventing cross-user data leakage.
3. **Integration Test Suites (`tests/catalog.test.js`, `tests/cart.test.js`, `tests/order.test.js`)**: Hermetic integration tests executing under Jest with in-memory MongoDB (`tests/setup.js`), providing 100% feature coverage and boundary defense.

---

## 2. Payment Mock Service Architecture (`src/services/paymentService.js`)

### 2.1 Interface & Normalization Contracts
The payment service must handle diverse client payload variations without brittle failures:
- Accept `cardNumber`, `cardHolder`, `expDate` or `expiryDate`, `cvv` or `cvc`, `billingZip` or `zip`, and `amount`.
- Strip spaces, dashes, and whitespace from card numbers and CVV codes.
- Detect card networks automatically (Visa `4...`, Mastercard `5...`/`2...`, Amex `3...`, Discover `6...`).

### 2.2 Simulation Rules & Matrix

| Input Condition | Card Pattern / Input | Result | Status Code | Error Code | Reason |
|---|---|---|---|---|---|
| **Standard Valid Visa** | `4242424242424242`, future date, valid CVV | **Success** | 200 | None | Authorized & captured (`TXN-VA-...`) |
| **Standard Valid Mastercard** | `5555555555554444`, future date, valid CVV | **Success** | 200 | None | Authorized & captured (`TXN-VA-...`) |
| **Declined Test Card** | Ending in `0002` (e.g. `4000000000000002`) | **Declined** | 402 | `CARD_DECLINED` | Issuer declined (insufficient funds) |
| **Expired Card** | Past expiration date (e.g. `01/20`) | **Declined** | 402 | `EXPIRED_CARD` | Card is past expiration |
| **Invalid CVV** | `000` or non-numeric or length < 3 | **Declined** | 400 | `INVALID_CVV` | Invalid CVV security code |
| **Invalid Card Format** | Length < 13 or > 19, or non-numeric | **Declined** | 400 | `INVALID_CARD_NUMBER` | Malformed card digits |
| **Invalid Amount** | `<= 0` or non-numeric | **Declined** | 400 | `INVALID_AMOUNT` | Transaction amount must be > 0 |

### 2.3 Proposed Implementation: `src/services/paymentService.js`

```javascript
/**
 * VelvetAura - Mock Payment Authorization & Processing Service
 * Simulates credit card authorization, capture, decline triggers, and transaction receipts.
 */

/**
 * Normalizes and validates credit card expiration date.
 * Supports MM/YY and MM/YYYY formats.
 * @param {string} expDate 
 * @returns {{ valid: boolean, expired: boolean, message?: string }}
 */
function validateExpirationDate(expDate) {
  if (!expDate || typeof expDate !== 'string') {
    return { valid: false, expired: false, message: 'Expiration date is required' };
  }

  const cleanExp = expDate.trim();
  const parts = cleanExp.split('/');
  if (parts.length !== 2) {
    return { valid: false, expired: false, message: 'Invalid expiration date format (expected MM/YY)' };
  }

  const month = parseInt(parts[0], 10);
  let year = parseInt(parts[1], 10);

  if (isNaN(month) || month < 1 || month > 12) {
    return { valid: false, expired: false, message: 'Invalid expiration month (must be 01-12)' };
  }

  // Handle 2-digit years (e.g. 26 -> 2026)
  if (year < 100) {
    year += 2000;
  }

  // End of the expiration month
  const expiryEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const now = new Date();

  if (expiryEnd < now) {
    return { valid: true, expired: true, message: 'Card has expired' };
  }

  return { valid: true, expired: false };
}

/**
 * Detects card network brand from card digits
 * @param {string} cleanNumber 
 * @returns {string} Brand name
 */
function detectCardBrand(cleanNumber) {
  if (/^4/.test(cleanNumber)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'American Express';
  if (/^6(011|5)/.test(cleanNumber)) return 'Discover';
  return 'Credit Card';
}

/**
 * Processes mock payment transaction.
 * 
 * @param {number} amount - Total transaction amount in USD
 * @param {Object} paymentDetails - Payment card and billing payload
 * @returns {Promise<Object>} Processed transaction receipt or rejection payload
 */
async function processPayment(amount, paymentDetails = {}) {
  // 1. Amount validation
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_AMOUNT',
      error: 'Transaction amount must be a positive number',
    };
  }

  // 2. Presence validation
  if (!paymentDetails || typeof paymentDetails !== 'object') {
    return {
      success: false,
      statusCode: 400,
      code: 'MISSING_PAYMENT_DETAILS',
      error: 'Payment details are required',
    };
  }

  const rawCardNumber = paymentDetails.cardNumber || paymentDetails.number || '';
  const rawExpDate = paymentDetails.expDate || paymentDetails.expiryDate || '';
  const rawCvv = paymentDetails.cvv || paymentDetails.cvc || '';

  // 3. Card number format validation
  const cleanNumber = String(rawCardNumber).replace(/[\s-]/g, '');
  if (!cleanNumber) {
    return {
      success: false,
      statusCode: 400,
      code: 'MISSING_CARD_NUMBER',
      error: 'Card number is required',
    };
  }

  if (!/^\d{13,19}$/.test(cleanNumber)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_CARD_NUMBER',
      error: 'Invalid credit card number format (must be 13-19 digits)',
    };
  }

  // 4. CVV validation (reject empty, non-numeric, or standard test decline CVV '000')
  const cleanCvv = String(rawCvv).trim();
  if (!cleanCvv || cleanCvv === '000' || !/^\d{3,4}$/.test(cleanCvv)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_CVV',
      error: 'Invalid CVV/CVC security code',
    };
  }

  // 5. Expiration date check
  const expCheck = validateExpirationDate(rawExpDate);
  if (!expCheck.valid) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_EXPIRATION',
      error: expCheck.message,
    };
  }

  if (expCheck.expired) {
    return {
      success: false,
      statusCode: 402,
      code: 'EXPIRED_CARD',
      error: 'Card has expired. Please use an active card.',
    };
  }

  // 6. Test card decline trigger (cards ending in 0002)
  if (cleanNumber.endsWith('0002')) {
    return {
      success: false,
      statusCode: 402,
      code: 'CARD_DECLINED',
      error: 'Your card was declined by the issuing bank (insufficient funds / restriction).',
    };
  }

  // 7. Successful authorization & capture simulation
  const cardBrand = paymentDetails.brand || detectCardBrand(cleanNumber);
  const cardLast4 = cleanNumber.slice(-4);
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const transactionId = `TXN-VA-${timestamp}-${randomSuffix}`;

  return {
    success: true,
    statusCode: 200,
    transactionId,
    status: 'succeeded',
    amount: Math.round(numAmount * 100) / 100,
    currency: 'USD',
    method: 'mock_credit_card',
    cardBrand,
    cardLast4,
    cardHolder: paymentDetails.cardHolder || 'Valued VelvetAura Customer',
    paidAt: new Date(),
    message: 'Payment authorized and captured successfully',
  };
}

module.exports = {
  processPayment,
  validateExpirationDate,
  detectCardBrand,
};
```

---

## 3. Order & Checkout Subsystem Architecture (`src/controllers/orderController.js` & `src/routes/orderRoutes.js`)

### 3.1 Checkout Process Flow & Concurrency Defense

```
[Client POST /api/orders/checkout]
                  |
         [JWT Auth (protect)]
                  |
     [Fetch User Active Cart] ---> Empty? ---> HTTP 400 Bad Request
                  |
     [Validate Shipping Address] -> Incomplete? -> HTTP 400 Bad Request
                  |
     [Validate Stock & Atomic Decrement]
       - For each item: findOneAndUpdate({ _id: prodId, stock: >= qty }, { $inc: { stock: -qty } })
       - If any fails: ROLLBACK all decremented items & return HTTP 400 Insufficient Stock
                  |
     [Invoke paymentService.processPayment(grandTotal, paymentDetails)]
       - If declined / error: ROLLBACK all decremented items & return HTTP 402 / 400
                  |
     [Create & Save Immutable Order Document]
       - Snapshot line items (name, brand, origin, price, qty, image)
       - Attach shippingAddress & pricing (subtotal, tax, shipping, grandTotal)
       - Attach payment (transactionId, cardLast4, status: 'succeeded')
                  |
     [Empty Active User Cart]
       - cart.items = []; recalculateTotals(); save();
                  |
     [Return HTTP 201 Created with { success: true, order, transactionId }]
```

### 3.2 Proposed Implementation: `src/controllers/orderController.js`

```javascript
/**
 * VelvetAura - Orders & Checkout Controller
 * Orchestrates checkout validation, atomic inventory decrement, mock payment authorization,
 * immutable order persistence, cart reset, and customer order history.
 */

const mongoose = require('mongoose');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const paymentService = require('../services/paymentService');

/**
 * @desc    Execute checkout for authenticated user's cart
 * @route   POST /api/orders/checkout
 * @access  Private (protect)
 */
const checkout = async (req, res, next) => {
  const decrementedItems = [];

  try {
    const { shippingAddress, paymentDetails } = req.body;

    // 1. Retrieve active user cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot checkout with an empty cart',
        error: 'Cannot checkout with an empty cart',
      });
    }

    // 2. Validate shipping address completeness
    if (!shippingAddress || typeof shippingAddress !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Please provide a complete shipping address',
        error: 'Missing shipping address',
      });
    }

    const street = (shippingAddress.street || shippingAddress.addressLine1 || '').trim();
    const city = (shippingAddress.city || '').trim();
    const zip = (shippingAddress.zip || shippingAddress.postalCode || '').trim();
    const country = (shippingAddress.country || 'USA').trim();

    if (!street || !city || !zip) {
      return res.status(400).json({
        success: false,
        message: 'Shipping address must include street, city, and zip/postalCode',
        error: 'Incomplete shipping address',
      });
    }

    // 3. Validate payment details presence
    if (!paymentDetails || typeof paymentDetails !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Please provide payment details',
        error: 'Missing payment details',
      });
    }

    // 4. Pre-check catalog inventory and perform atomic stock decrements
    for (const item of cart.items) {
      const updatedProduct = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );

      if (!updatedProduct) {
        // Concurrency or stock exhaustion failure! Rollback any prior items
        for (const dec of decrementedItems) {
          await Product.updateOne(
            { _id: dec.productId },
            { $inc: { stock: dec.quantity } }
          );
        }

        const currentProduct = await Product.findById(item.product);
        const availableStock = currentProduct ? currentProduct.stock : 0;

        return res.status(400).json({
          success: false,
          message: `Insufficient stock for product "${item.name}". Requested: ${item.quantity}, Available: ${availableStock}`,
          error: `Insufficient stock for product "${item.name}"`,
        });
      }

      decrementedItems.push({
        productId: item.product,
        quantity: item.quantity,
        origin: updatedProduct.origin || '',
      });
    }

    // 5. Execute mock payment authorization
    const paymentResult = await paymentService.processPayment(cart.grandTotal, paymentDetails);

    if (!paymentResult.success) {
      // Payment declined or invalid! Rollback all stock decrements
      for (const dec of decrementedItems) {
        await Product.updateOne(
          { _id: dec.productId },
          { $inc: { stock: dec.quantity } }
        );
      }

      const statusCode = paymentResult.statusCode || 402;
      return res.status(statusCode).json({
        success: false,
        message: paymentResult.error || 'Payment failed',
        error: paymentResult.error || 'Payment failed',
        code: paymentResult.code || 'PAYMENT_FAILED',
      });
    }

    // 6. Build immutable line item snapshots
    const orderItems = cart.items.map((item, index) => ({
      product: item.product,
      name: item.name,
      brand: item.brand,
      origin: decrementedItems[index]?.origin || item.origin || '',
      price: item.price,
      quantity: item.quantity,
      image: item.image || '',
    }));

    // 7. Construct and persist Order record
    const order = new Order({
      user: req.user._id,
      items: orderItems,
      shippingAddress: {
        fullName: (shippingAddress.fullName || req.user.name || '').trim(),
        street,
        addressLine1: street,
        addressLine2: (shippingAddress.addressLine2 || '').trim(),
        city,
        state: (shippingAddress.state || '').trim(),
        zip,
        postalCode: zip,
        country,
        phone: (shippingAddress.phone || '').trim(),
      },
      pricing: {
        subtotal: cart.subtotal,
        tax: cart.tax,
        shipping: cart.shipping,
        grandTotal: cart.grandTotal,
      },
      subtotal: cart.subtotal,
      tax: cart.tax,
      shipping: cart.shipping,
      grandTotal: cart.grandTotal,
      payment: {
        transactionId: paymentResult.transactionId,
        method: paymentResult.method || 'mock_credit_card',
        status: 'succeeded',
        paidAt: paymentResult.paidAt || new Date(),
        cardLast4: paymentResult.cardLast4 || '4242',
      },
      status: 'completed',
    });

    await order.save();

    // 8. Clear user's active shopping cart
    cart.items = [];
    cart.recalculateTotals();
    await cart.save();

    // 9. Respond with HTTP 201 Created and transaction receipt
    return res.status(201).json({
      success: true,
      message: 'Order created and payment authorized successfully',
      order,
      transactionId: paymentResult.transactionId,
    });
  } catch (error) {
    // Safety rollback in case of unanticipated runtime errors
    if (decrementedItems.length > 0) {
      for (const dec of decrementedItems) {
        try {
          await Product.updateOne(
            { _id: dec.productId },
            { $inc: { stock: dec.quantity } }
          );
        } catch (rollbackErr) {
          console.error('[Checkout] Stock rollback error:', rollbackErr);
        }
      }
    }
    next(error);
  }
};

/**
 * @desc    Get all orders placed by the authenticated customer
 * @route   GET /api/orders/my-orders
 * @access  Private (protect)
 */
const getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single order by ID for the authorized owner
 * @route   GET /api/orders/:id
 * @access  Private (protect)
 */
const getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        success: false,
        message: `Resource not found with ID: ${id}`,
        error: 'Invalid order ID format',
      });
    }

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
        error: 'Order not found',
      });
    }

    // Strict ownership verification: order owner or admin role only
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this order',
        error: 'Not authorized to access this order',
      });
    }

    return res.status(200).json({
      success: true,
      order,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkout,
  getMyOrders,
  getOrderById,
};
```

### 3.3 Proposed Implementation: `src/routes/orderRoutes.js`

```javascript
/**
 * VelvetAura - Orders & Checkout Routes
 * Exposes checkout execution, customer order history, and single order inspection.
 */

const express = require('express');
const {
  checkout,
  getMyOrders,
  getOrderById,
} = require('../controllers/orderController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/checkout', protect, checkout);
router.get('/my-orders', protect, getMyOrders);
router.get('/:id', protect, getOrderById);

module.exports = router;
```

---

## 4. Integration Test Suite Blueprints (`npm test` Integration)

The project's Jest runner (`package.json`) defines:
- `"testMatch": ["<rootDir>/tests/*.test.js"]`
- `"setupFilesAfterEnv": ["<rootDir>/tests/setup.js"]` (which manages MongoMemoryServer and clears collections after each test).

To provide complete hermetic verification alongside `tests/auth.test.js` and `tests/health.test.js`, three dedicated test suites are designed:
1. `tests/catalog.test.js`: Product browsing, category/origin/brand filters, full-text search, and pagination.
2. `tests/cart.test.js`: Cart lifecycle, stock checks, and pricing calculation engine (tax, shipping threshold).
3. `tests/order.test.js`: Checkout flow, payment simulation, stock decrement, cart reset, and order history.

### 4.1 `tests/catalog.test.js` Blueprint

```javascript
/**
 * VelvetAura - Catalog & Product Search Subsystem Integration Tests
 * Verifies catalog listing, category/origin filtering, search indexing, and detail retrieval.
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');

describe('Product Catalog Subsystem', () => {
  let seededProducts = [];

  beforeEach(async () => {
    // Seed standard test items across categories and origins
    seededProducts = await Product.insertMany([
      {
        name: 'Hyalu B5 Pure Hyaluronic Acid Serum',
        brand: 'La Roche-Posay',
        origin: 'France',
        category: 'skincare',
        price: 39.99,
        description: 'Anti-aging serum with pure hyaluronic acid for plump skin.',
        stock: 40,
        rating: 4.8,
        images: ['/images/hyalu-b5.webp'],
      },
      {
        name: 'First Care Activating Serum VI',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        price: 89.00,
        description: 'Post-cleanse boosting serum with JAUM Activator for youthful radiance.',
        stock: 25,
        rating: 4.9,
        images: ['/images/first-care.webp'],
      },
      {
        name: 'Gypsy Water Eau de Parfum',
        brand: 'Byredo',
        origin: 'Sweden',
        category: 'fragrances',
        price: 290.00,
        description: 'Iconic fragrance with notes of pine needle, sandalwood, and amber.',
        stock: 15,
        rating: 4.9,
        images: ['/images/gypsy-water.webp'],
      },
      {
        name: 'Fino Premium Touch Hair Mask',
        brand: 'Shiseido',
        origin: 'Japan',
        category: 'haircare',
        price: 18.50,
        description: 'Intense rinse-off treatment infused with royal jelly EX.',
        stock: 60,
        rating: 4.9,
        images: ['/images/fino.webp'],
      },
      {
        name: 'Rouge Allure Velvet Matte',
        brand: 'CHANEL',
        origin: 'France',
        category: 'cosmetics',
        price: 45.00,
        description: 'Luminous matte lipstick with concentrated pigments.',
        stock: 30,
        rating: 4.8,
        images: ['/images/chanel-rouge.webp'],
      },
    ]);
  });

  describe('GET /api/products', () => {
    test('should return all products with pagination metadata', async () => {
      const res = await request(app).get('/api/products');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBe(5);
      expect(res.body.total).toBe(5);
    });

    test('should filter products by category', async () => {
      const res = await request(app).get('/api/products?category=skincare');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(2);
      expect(res.body.products.every(p => p.category === 'skincare')).toBe(true);
    });

    test('should filter products by origin country', async () => {
      const res = await request(app).get('/api/products?origin=France');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(2);
      expect(res.body.products.every(p => p.origin === 'France')).toBe(true);
    });

    test('should perform full-text search across name, brand, and description', async () => {
      const res = await request(app).get('/api/products?q=serum');
      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(2);
    });

    test('should sort products by price ascending', async () => {
      const res = await request(app).get('/api/products?sort=price-asc');
      expect(res.status).toBe(200);
      expect(res.body.products[0].price).toBe(18.50);
      expect(res.body.products[res.body.products.length - 1].price).toBe(290.00);
    });
  });

  describe('GET /api/products/:id', () => {
    test('should return single product by ID', async () => {
      const target = seededProducts[0];
      const res = await request(app).get(`/api/products/${target._id}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.product.name).toBe(target.name);
    });

    test('should return 404 for non-existent product ID', async () => {
      const fakeId = new Product()._id;
      const res = await request(app).get(`/api/products/${fakeId}`);
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    test('should return 400 or 404 for invalid ObjectId string without crashing', async () => {
      const res = await request(app).get('/api/products/not-a-valid-id');
      expect([400, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });
  });
});
```

### 4.2 `tests/cart.test.js` Blueprint

```javascript
/**
 * VelvetAura - Shopping Cart Subsystem Integration Tests
 * Verifies cart item management, quantity updates, stock limits, and mathematical totals.
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');
const User = require('../src/models/User');

describe('Shopping Cart Subsystem', () => {
  let authToken;
  let testUser;
  let productCheap;
  let productLuxury;

  beforeEach(async () => {
    // 1. Create test user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Cart Customer',
        email: 'cart.customer@luxury.test',
        password: 'Password123!',
      });
    authToken = regRes.body.token;
    testUser = regRes.body.user;

    // 2. Create products with stock limits
    productCheap = await Product.create({
      name: 'Lip Velvet Tint',
      brand: 'Rom&nd',
      origin: 'South Korea',
      category: 'cosmetics',
      price: 13.00,
      stock: 10,
      description: 'Airy matte lip tint with intense color payoff.',
    });

    productLuxury = await Product.create({
      name: 'Activating Serum',
      brand: 'Sulwhasoo',
      origin: 'South Korea',
      category: 'skincare',
      price: 89.00,
      stock: 5,
      description: 'Luxury first-step rejuvenating serum.',
    });
  });

  describe('GET /api/cart', () => {
    test('should return an empty cart for newly registered user', async () => {
      const res = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const cart = res.body.cart || res.body;
      expect(cart.items).toHaveLength(0);
      expect(cart.grandTotal).toBe(0);
    });

    test('should reject request without authentication token', async () => {
      const res = await request(app).get('/api/cart');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/cart/items', () => {
    test('should add line item and calculate $5.99 shipping when subtotal < $50', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: productCheap._id,
          quantity: 2, // 2 * $13.00 = $26.00
        });

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.items).toHaveLength(1);
      expect(cart.subtotal).toBe(26.00);
      expect(cart.tax).toBe(2.08); // 26 * 0.08 = 2.08
      expect(cart.shipping).toBe(5.99);
      expect(cart.grandTotal).toBe(34.07);
    });

    test('should apply $0.00 free shipping when subtotal >= $50', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: productLuxury._id,
          quantity: 1, // $89.00
        });

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.subtotal).toBe(89.00);
      expect(cart.tax).toBe(7.12);
      expect(cart.shipping).toBe(0.00);
      expect(cart.grandTotal).toBe(96.12);
    });

    test('should increment existing item quantity if added multiple times', async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: productCheap._id, quantity: 1 });

      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: productCheap._id, quantity: 2 });

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].quantity).toBe(3);
    });

    test('should reject adding quantity exceeding available inventory stock', async () => {
      const res = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          productId: productLuxury._id,
          quantity: 100, // Stock is 5
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('should reject adding invalid or non-numeric quantity', async () => {
      const res1 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: productCheap._id, quantity: 0 });
      expect(res1.status).toBe(400);

      const res2 = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: productCheap._id, quantity: -2 });
      expect(res2.status).toBe(400);
    });
  });

  describe('PUT /api/cart/items/:productId & DELETE /api/cart', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ productId: productCheap._id, quantity: 2 });
    });

    test('should update item quantity and recalculate totals', async () => {
      const res = await request(app)
        .put(`/api/cart/items/${productCheap._id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ quantity: 4 });

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.items[0].quantity).toBe(4);
      expect(cart.subtotal).toBe(52.00); // Now >= 50 -> shipping free
      expect(cart.shipping).toBe(0.00);
    });

    test('should delete single cart item via DELETE /api/cart/items/:productId', async () => {
      const res = await request(app)
        .delete(`/api/cart/items/${productCheap._id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.items).toHaveLength(0);
      expect(cart.grandTotal).toBe(0);
    });

    test('should clear active cart via DELETE /api/cart', async () => {
      const res = await request(app)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      const cart = res.body.cart || res.body;
      expect(cart.items).toHaveLength(0);
    });
  });
});
```

### 4.3 `tests/order.test.js` Blueprint

```javascript
/**
 * VelvetAura - Order Creation, Mock Payment & Order History Integration Tests
 * Verifies checkout flow, stock decrement, mock card decline simulation, cart clearing, and history.
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');
const Cart = require('../src/models/Cart');
const Order = require('../src/models/Order');

describe('Order Creation & Mock Payment Subsystem', () => {
  let authToken;
  let testUser;
  let productItem;

  const validAddress = {
    fullName: 'Camille Dupont',
    street: '14 Rue de Rivoli',
    city: 'Paris',
    state: 'Ile-de-France',
    zip: '75001',
    country: 'France',
  };

  const validVisa = {
    cardNumber: '4242424242424242',
    expiryDate: '12/28',
    cvv: '123',
    cardHolder: 'Camille Dupont',
  };

  const declinedCard = {
    cardNumber: '4000000000000002',
    expiryDate: '12/28',
    cvv: '123',
    cardHolder: 'Declined User',
  };

  const expiredCard = {
    cardNumber: '4242424242424242',
    expiryDate: '01/20',
    cvv: '123',
    cardHolder: 'Expired User',
  };

  beforeEach(async () => {
    // 1. Create authenticated user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Order Tester',
        email: 'order.tester@luxury.test',
        password: 'Password123!',
      });
    authToken = regRes.body.token;
    testUser = regRes.body.user;

    // 2. Create catalog product with known stock
    productItem = await Product.create({
      name: 'Vinoperfect Dark Spot Serum',
      brand: 'Caudalie',
      origin: 'France',
      category: 'skincare',
      price: 82.00,
      stock: 20,
      description: 'Cult-favorite brightening serum with Viniferine.',
    });

    // 3. Populate cart
    await request(app)
      .post('/api/cart/items')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        productId: productItem._id,
        quantity: 2,
      });
  });

  describe('POST /api/orders/checkout', () => {
    test('should successfully checkout, return 201, generate transaction ID, and clear cart', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validVisa,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.order;
      expect(order).toBeDefined();
      expect(order.orderNumber).toMatch(/^VA-\d{8}-\d{4}$/);
      expect(order.items).toHaveLength(1);
      expect(order.items[0].name).toBe(productItem.name);
      expect(order.items[0].quantity).toBe(2);

      // Verify payment details
      expect(res.body.transactionId).toBeDefined();
      expect(order.payment.transactionId).toBe(res.body.transactionId);
      expect(order.payment.status).toBe('succeeded');
      expect(order.payment.cardLast4).toBe('4242');

      // Verify stock was decremented in database
      const updatedProduct = await Product.findById(productItem._id);
      expect(updatedProduct.stock).toBe(18); // 20 - 2 = 18

      // Verify cart was cleared
      const cartCheck = await Cart.findOne({ user: testUser._id || testUser.id });
      expect(cartCheck.items).toHaveLength(0);
      expect(cartCheck.grandTotal).toBe(0);
    });

    test('should reject checkout when cart is empty', async () => {
      // Clear cart first
      await request(app)
        .delete('/api/cart')
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validVisa,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toMatch(/empty cart/i);
    });

    test('should reject checkout when shipping address fields are missing', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: { street: '', city: 'Paris' }, // Missing zip & street
          paymentDetails: validVisa,
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('should reject checkout and preserve stock when card is declined (ending in 0002)', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: declinedCard,
        });

      expect([400, 402]).toContain(res.status);
      expect(res.body.success).toBe(false);

      // Verify stock rollback: stock must remain untouched at 20!
      const productCheck = await Product.findById(productItem._id);
      expect(productCheck.stock).toBe(20);
    });

    test('should reject checkout when card is expired', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: expiredCard,
        });

      expect([400, 402]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    test('should reject checkout when CVV is invalid (e.g. 000)', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: { ...validVisa, cvv: '000' },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/orders/my-orders & GET /api/orders/:id', () => {
    let createdOrderId;

    beforeEach(async () => {
      const checkoutRes = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          shippingAddress: validAddress,
          paymentDetails: validVisa,
        });
      createdOrderId = checkoutRes.body.order._id;
    });

    test('should retrieve customer order history sorted by newest first', async () => {
      const res = await request(app)
        .get('/api/orders/my-orders')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThanOrEqual(1);
      expect(res.body.orders[0]._id).toBe(createdOrderId);
    });

    test('should retrieve single order by ID for the authorized owner', async () => {
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order._id).toBe(createdOrderId);
    });

    test('should reject access to another customer\'s order (multi-user isolation)', async () => {
      // Create second customer
      const regRes2 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Intruder User',
          email: 'intruder@luxury.test',
          password: 'Password123!',
        });
      const intruderToken = regRes2.body.token;

      // Attempt to read first customer's order
      const res = await request(app)
        .get(`/api/orders/${createdOrderId}`)
        .set('Authorization', `Bearer ${intruderToken}`);

      expect([403, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    test('should return 404 for invalid order ObjectId format', async () => {
      const res = await request(app)
        .get('/api/orders/invalid-mongo-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });
});
```

---

## 5. Cross-Feature Interactions & Edge Case Matrix

| Edge Case | Risk / Threat | Mitigation / Solution |
|---|---|---|
| **Empty Cart Checkout** | Zero-value orders created in DB | Explicit check on `!cart || cart.items.length === 0` returning HTTP 400 Bad Request. |
| **Simultaneous Stock Contention** | Multiple users checkout last remaining item concurrently | Atomic conditional decrement: `Product.findOneAndUpdate({ _id, stock: { $gte: qty } }, { $inc: { stock: -qty } })`. Immediate rollback of previously decremented items if any fails. |
| **Payment Failure after Stock Decrement** | Inventory permanently leaked if card declines | If `paymentResult.success === false`, loop over all decremented items and restore stock: `Product.updateOne({ _id }, { $inc: { stock: qty } })`. |
| **Card Expiry Edge Cases** | Malformed strings, non-numeric months, 2-digit vs 4-digit years | `validateExpirationDate` standardizes 2-digit years (`2000 + YY`), validates month range (1-12), and tests against current Date. |
| **Cross-User Order Snooping** | Malicious users guessing other customers' order IDs | Strict ownership filter: `order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin'` yields HTTP 403 Forbidden. |
| **Dual Route Mounting in `src/app.js`** | `orderRoutes` and `cartRoutes` dynamic require fallbacks | `src/app.js` already has `try { orderRoutes = require('./routes/orderRoutes'); } catch(e) { ... }`. Creating `src/routes/orderRoutes.js` instantly activates the live router. |

---

## 6. Implementation Checklist for Worker Agent

1. **`src/services/paymentService.js`**:
   - Implement `processPayment(amount, paymentDetails)` with validation rules, card brand detection, expiration check, and decline test cards.
   - Return `{ success, transactionId, status, cardLast4, cardBrand, method, paidAt }` on success.
   - Return `{ success: false, statusCode, code, error }` on decline or error.
2. **`src/controllers/orderController.js`**:
   - Implement `checkout`: validate cart, validate address, atomic stock decrement with rollback, call `processPayment`, build snapshot Order, reset cart, return HTTP 201.
   - Implement `getMyOrders`: query orders by `req.user._id`, sort `{ createdAt: -1 }`, return `{ success: true, count, orders }`.
   - Implement `getOrderById`: validate ObjectId, check ownership, return `{ success: true, order }`.
3. **`src/routes/orderRoutes.js`**:
   - Wire `POST /checkout`, `GET /my-orders`, and `GET /:id` guarded by `protect`.
4. **Integration Test Suite**:
   - Create `tests/catalog.test.js`.
   - Create `tests/cart.test.js`.
   - Create `tests/order.test.js`.
   - Verify `npm test` runs all tests cleanly across all 5 test files.
