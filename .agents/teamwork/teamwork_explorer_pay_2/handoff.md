# Handoff Report — Order Schema, Checkout Controller & Seed Data Investigation

## 1. Observation

### 1.1 Baseline Test Suite Status
Executed command: `npm test` (`jest --runInBand --detectOpenHandles --forceExit`).
Result:
- **Test Suites**: 12 passed, 12 total (`admin.test.js`, `stress_upload_api.test.js`, `admin_adversarial.test.js`, `tier5_adversarial.test.js`, `order.test.js`, `cart.test.js`, `upload.test.js`, `concurrency.test.js`, `catalog.test.js`, `auth.test.js`, `modal_ui_stress.test.js`, `health.test.js`).
- **Tests**: 198 passed, 198 total (0 failures).
- **Duration**: ~83.6 seconds.
- All baseline tests rely on `mongodb-memory-server` and verify auth, cart, order creation, and admin routes.

---

### 1.2 Current Order Data Model (`src/models/Order.js`)
File inspected: `g:\VelvetAura\src\models\Order.js` (208 lines).

Direct observations:
1. **Currency**:
   - `orderSchema` (lines 102-160) currently has **no currency field**.
   - `pricingSchema` (lines 92-100) records only `{ subtotal, tax, shipping, grandTotal }` without a currency indicator.
   - Contrast with `src/models/Product.js` line 63 which explicitly has `currency: { type: String, default: 'USD', trim: true }`.
2. **Payment Schema & Method**:
   - Lines 65-90 define `paymentSchema`:
     ```javascript
     const paymentSchema = new mongoose.Schema(
       {
         transactionId: { type: String, required: true },
         method: { type: String, default: 'mock_credit_card' },
         status: {
           type: String,
           enum: ['succeeded', 'captured', 'authorized', 'failed', 'pending'],
           default: 'succeeded',
         },
         paidAt: { type: Date, default: Date.now },
         cardLast4: { type: String, default: '4242' },
       },
       { _id: false }
     );
     ```
   - The method is hardcoded to `'mock_credit_card'`. There are no enum restrictions for `'cod'`, `'bank_transfer'`, or `'payhere'`.
   - There is no first-class `paymentMethod` field directly on `orderSchema`.
3. **Payment Status**:
   - `paymentSchema.status` defaults to `'succeeded'` (line 79).
   - There is no top-level `paymentStatus` enum (`['pending', 'paid', 'failed']`) on `orderSchema`.
   - New orders for Cash on Delivery (COD) and Bank Transfer should start as `'pending'`, not `'succeeded'`.
4. **Order Fulfillment Status**:
   - Lines 141-153 define `status`:
     ```javascript
     status: {
       type: String,
       enum: [
         'pending',
         'confirmed',
         'processing',
         'completed',
         'shipped',
         'delivered',
         'cancelled',
       ],
       default: 'completed',
     },
     ```
   - `status` currently defaults to `'completed'`. For COD and Bank Transfer, initial status should be `'pending'`.
5. **Gateway Fields & Virtual Aliases**:
   - No fields exist for `gatewayTransactionId`, `gatewayHash`, `paymentNotes`, or custom payment metadata.
   - Lines 167-169 define a virtual alias:
     ```javascript
     orderSchema.virtual('paymentDetails').get(function () {
       return this.payment;
     });
     ```
     Because this getter returns `this.payment`, any schema property named `paymentDetails` would collide with the virtual unless properly structured.

---

### 1.3 Order Controller & Routes (`src/controllers/orderController.js`, `src/routes/orderRoutes.js`)
Files inspected: `g:\VelvetAura\src\controllers\orderController.js` (347 lines) and `g:\VelvetAura\src\routes\orderRoutes.js` (38 lines).

Direct observations:
1. **Checkout Endpoint (`POST /api/orders/checkout`)**:
   - Lines 23-24:
     ```javascript
     const { shippingAddress, paymentDetails } = req.body;
     ```
   - Lines 58-65 strictly enforce that `paymentDetails` is a non-empty object.
   - Lines 109-126 invoke `await processPayment(cart.grandTotal, paymentDetails)` from `src/services/paymentService.js`, which requires credit card attributes (`cardNumber`, `expDate`, `cvv`). If missing, it returns HTTP 400 (`MISSING_CARD_NUMBER`, `INVALID_CVV`).
   - Lines 152-174 create the `Order` with `status: 'completed'` and `payment.status: 'succeeded'`.
   - Inventory stock decrement (lines 67-107) uses atomic `findOneAndUpdate` with `{ stock: { $gte: quantityToDeduct } }` and rollback compensation.
2. **Order History (`GET /api/orders/my-orders`)**:
   - Lines 209-221 query `Order.find({ user: req.user._id }).sort({ createdAt: -1 })`.
   - Customer isolation is enforced by checking `req.user._id`.
3. **Admin Order Oversight (`GET /api/orders`)**:
   - Lines 273-287 query all orders and populate `user` (`name`, `email`, `role`).
4. **Admin Order Status Updates (`PUT /api/orders/:id/status`, `PATCH /api/orders/:id/status`)**:
   - Lines 294-338:
     ```javascript
     const updateOrderStatus = async (req, res, next) => {
       try {
         const { id } = req.params;
         const { status } = req.body;
         ...
         const validStatuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];
         ...
         order.status = cleanStatus;
         await order.save();
     ```
   - It only updates `order.status` (fulfillment status).
   - **It does NOT support updating `paymentStatus`** (e.g. marking Bank Transfer verified/paid or marking COD paid upon delivery).
   - The route mappings in `src/routes/orderRoutes.js` (lines 30-32):
     ```javascript
     router.get('/', admin, getAllOrders);
     router.put('/:id/status', admin, updateOrderStatus);
     router.patch('/:id/status', admin, updateOrderStatus);
     ```

---

### 1.4 Frontend Integration Points
Files inspected:
- `public/js/components/base.js`:
  Line 46 defines `formatPrice`:
  ```javascript
  export function formatPrice(amount) {
    const val = Number(amount) || 0;
    return `$${val.toFixed(2)}`;
  }
  ```
  Currently formats all prices with the `$` USD symbol.
- `public/js/components/adminDashboard.js`:
  Lines 357-438 render the orders table:
  - Line 365-366 has table headers: `Payment`, `Fulfillment Status`.
  - Line 392: `const paymentStatus = order.payment?.status || 'succeeded';`
  - Line 423: `<span class="payment-badge payment-${paymentStatus}">${escapeHtml(paymentStatus)}</span>`
  - Line 427: Status dropdown only mutates `order.status`.
  - Does NOT display `paymentMethod` (`COD`, `Bank Transfer`, `PayHere`) and does NOT permit changing `paymentStatus`.
- `public/js/components/checkoutModal.js`:
  Lines 86-250 implement credit card inputs (Cardholder, Card Number, Expiry, CVV) with sandbox quick-fill buttons.
- `public/js/components/accountView.js`:
  Line 126 has hardcoded `<span class="status-pill status-completed">● Completed</span>`. Does not show `paymentMethod` or `paymentStatus`.

---

### 1.5 Product and Seed Data (`src/data/seed.js`, `src/data/seedProducts.js`)
Files inspected: `src/data/seed.js` (168 lines) and `src/data/seedProducts.js` (660 lines).

Direct observations:
1. **Product Prices & Currency**:
   - `src/data/seedProducts.js` contains 24 luxury beauty products.
   - All 24 items have `currency: 'USD'`.
   - Prices range from `13.00` (Rom&nd tint) to `345.00` (Maison Francis Kurkdjian).
   - In `Product.js` line 63, `currency: { type: String, default: 'USD', trim: true }`.
2. **Seed Orders**:
   - In `src/data/seed.js` line 89: `await Order.deleteMany({});`.
   - `seedInitialData` creates 24 products and 3 demo users (`admin@velvetaura.com`, `customer@velvetaura.com`, `minji@velvetaura.com`).
   - **`seed.js` currently seeds zero orders.**

---

## 2. Logic Chain

1. **Requirement Alignment**:
   - ORIGINAL_REQUEST specifies:
     - Primary currency: Sri Lankan Rupees (LKR / "Rs." / "LKR").
     - New Checkout payment options: Cash on Delivery (COD) and Direct Bank Transfer (with VelvetAura bank details), removing mock card UI.
     - PayHere gateway architecture preparation: update `Order` schema for `paymentMethod` (`['cod', 'bank_transfer', 'payhere']`), `paymentStatus` (`['pending', 'paid', 'failed']`), gateway transaction/hash fields.
     - Admin oversight: view payment method and payment status, update orderStatus and paymentStatus (e.g. verifying bank transfers or marking COD paid).
2. **Schema Design Rationale**:
   - Having top-level fields `currency`, `paymentMethod`, `paymentStatus`, `gatewayTransactionId`, `gatewayHash`, `paymentNotes` on `orderSchema` makes queries, indexing, and sorting straightforward.
   - For backwards compatibility with existing integration tests (which inspect `order.payment.status` and `order.payment.transactionId`), the `payment` subdocument must be maintained in sync via Mongoose `pre('validate')` hooks.
   - Initial `paymentStatus` for COD and Bank Transfer must default to `'pending'`.
   - Default fulfillment `status` should be `'pending'` for newly placed COD and Bank Transfer orders.
3. **Controller & Route Refactoring Rationale**:
   - `checkout` in `orderController.js` must accept `paymentMethod` (`'cod'`, `'bank_transfer'`, `'payhere'`).
   - If `paymentMethod === 'cod'`, no card validation is performed; initial `paymentStatus = 'pending'`, fulfillment `status = 'pending'`.
   - If `paymentMethod === 'bank_transfer'`, user confirms transfer; initial `paymentStatus = 'pending'`, fulfillment `status = 'pending'`, and optional `bankReference` or notes are saved.
   - If `paymentMethod === 'payhere'`, initial `paymentStatus = 'pending'` awaiting gateway webhook/IPN callback.
   - To preserve backward compatibility with existing tests that send `paymentDetails: { cardNumber: ... }`, a fallback branch in `checkout` should handle legacy mock card payments, mapping them cleanly.
   - `updateOrderStatus` must be extended (or paired with a payment-status update) so administrators can verify bank transfers (`paymentStatus = 'paid'`) and mark COD deliveries paid (`status = 'delivered'`, `paymentStatus = 'paid'`).
4. **Seed Data Enhancement Rationale**:
   - Updating `Product.currency` default to `'LKR'` aligns the catalog.
   - Adding seed orders in `seed.js` for demo users allows immediate end-to-end verification of the Admin Dashboard and Account View without having to place test orders first.

---

## 3. Caveats

1. **Existing Test Suite Invariants**:
   - Existing tests (`tests/order.test.js`, `tests/concurrency.test.js`, `tests/tier5_adversarial.test.js`) submit `{ shippingAddress, paymentDetails: validPayment }` expecting mock credit card validation. The backend `checkout` controller must maintain fallback support so that if `paymentDetails.cardNumber` is provided without an explicit `paymentMethod`, it continues to process successfully without breaking existing tests.
2. **Cart Pricing Thresholds**:
   - `cartService.calculatePricing` currently uses a `$50.00` threshold for free shipping and `$5.99` for standard shipping. If numeric values in seed products remain e.g. `89.00`, the currency symbol changes to `Rs.`/`LKR` in formatting (`formatPrice`), keeping existing numeric assertions in `cart.test.js` intact.
3. **PayHere Webhook Security**:
   - Real-world PayHere webhooks require public IP reachability (via ngrok/tunnel in production). For local and unit test execution, the PayHere service must support deterministic hash validation and mock IPN payloads.

---

## 4. Conclusion & Architectural Recommendations

### 4.1 Proposed Order Schema (`src/models/Order.js`)

```javascript
// Add to Order.js:

const paymentSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      enum: ['cod', 'bank_transfer', 'payhere', 'mock_credit_card'],
      default: 'cod',
    },
    status: {
      type: String,
      enum: ['pending', 'paid', 'failed', 'succeeded', 'captured', 'authorized'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    cardLast4: {
      type: String,
      default: '',
    },
    gatewayTransactionId: {
      type: String,
      default: null,
    },
    gatewayHash: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

// In orderSchema:
const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: [
        (val) => val && val.length > 0,
        'An order must contain at least one item',
      ],
    },
    shippingAddress: {
      type: orderAddressSchema,
      required: true,
    },
    currency: {
      type: String,
      default: 'LKR',
      trim: true,
      uppercase: true,
    },
    pricing: {
      type: pricingSchema,
      required: true,
    },
    subtotal: { type: Number, min: 0 },
    tax: { type: Number, min: 0 },
    shipping: { type: Number, min: 0 },
    grandTotal: { type: Number, min: 0 },
    
    // First-class Payment Fields
    paymentMethod: {
      type: String,
      enum: ['cod', 'bank_transfer', 'payhere'],
      default: 'cod',
      required: [true, 'Payment method is required'],
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['pending', 'paid', 'failed'],
      default: 'pending',
      index: true,
    },
    gatewayTransactionId: {
      type: String,
      default: null,
      trim: true,
    },
    gatewayHash: {
      type: String,
      default: null,
      trim: true,
    },
    paymentNotes: {
      type: String,
      default: '',
      trim: true,
    },
    paymentMetadata: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    
    payment: {
      type: paymentSchema,
      required: true,
    },
    status: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'processing',
        'completed',
        'shipped',
        'delivered',
        'cancelled',
      ],
      default: 'pending',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);
```

**Pre-validate synchronization hook in `Order.js`**:
```javascript
orderSchema.pre('validate', function (next) {
  // Sync currency
  if (!this.currency) {
    this.currency = 'LKR';
  }

  // Generate orderNumber if missing
  if (!this.orderNumber) {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.orderNumber = `VA-${dateStr}-${randomSuffix}`;
  }

  // Ensure top-level pricing syncs
  if (this.pricing) {
    this.subtotal = this.pricing.subtotal;
    this.tax = this.pricing.tax;
    this.shipping = this.pricing.shipping;
    this.grandTotal = this.pricing.grandTotal;
  } else if (this.subtotal !== undefined && this.tax !== undefined && this.shipping !== undefined && this.grandTotal !== undefined) {
    this.pricing = {
      subtotal: this.subtotal,
      tax: this.tax,
      shipping: this.shipping,
      grandTotal: this.grandTotal,
    };
  }

  // Synchronize payment subdocument with top-level fields
  if (!this.payment) {
    const prefix = this.paymentMethod === 'bank_transfer' ? 'BT-VA' : (this.paymentMethod === 'payhere' ? 'PH-VA' : 'COD-VA');
    this.payment = {
      transactionId: `${prefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
      method: this.paymentMethod || 'cod',
      status: this.paymentStatus || 'pending',
      paidAt: this.paymentStatus === 'paid' ? new Date() : null,
      cardLast4: '',
      gatewayTransactionId: this.gatewayTransactionId || null,
      gatewayHash: this.gatewayHash || null,
      notes: this.paymentNotes || '',
    };
  } else {
    // Bi-directional sync
    if (this.paymentMethod && !this.payment.method) {
      this.payment.method = this.paymentMethod;
    } else if (!this.paymentMethod && this.payment.method) {
      this.paymentMethod = this.payment.method === 'mock_credit_card' ? 'payhere' : this.payment.method;
    }

    if (this.paymentStatus && !this.payment.status) {
      this.payment.status = this.paymentStatus;
    } else if (!this.paymentStatus && this.payment.status) {
      this.paymentStatus = ['succeeded', 'paid', 'captured'].includes(this.payment.status) ? 'paid' : (this.payment.status === 'failed' ? 'failed' : 'pending');
    }

    if (this.paymentStatus === 'paid' && !this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }
  }

  next();
});
```

---

### 4.2 Proposed Controller Updates (`src/controllers/orderController.js`)

1. **Refactor `checkout`**:
   - Extract `paymentMethod`, `paymentNotes`, `bankReference`, `paymentDetails` from `req.body`.
   - Validate `paymentMethod` is one of `['cod', 'bank_transfer', 'payhere']` (with graceful fallback for `'mock_credit_card'`).
   - If `paymentMethod === 'cod'`:
     - `paymentStatus = 'pending'`, `orderStatus = 'pending'`, `paidAt = null`.
     - `transactionId = COD-VA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`.
   - If `paymentMethod === 'bank_transfer'`:
     - `paymentStatus = 'pending'`, `orderStatus = 'pending'`, `paidAt = null`.
     - `gatewayTransactionId = bankReference || null`.
     - `transactionId = BT-VA-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`.
     - `paymentNotes = paymentNotes || `Bank transfer reference: ${bankReference || 'Pending verification'}`.
   - If `paymentMethod === 'payhere'`:
     - `paymentStatus = 'pending'`, `orderStatus = 'pending'`.
     - Generate PayHere hash using `payhereService.generateHash(orderId, amount, 'LKR')`.
   - Retain inventory stock check and atomic decrement with rollback.
   - Create order with `currency: 'LKR'`.
2. **Refactor `updateOrderStatus`**:
   - Allow updating both `status` (fulfillment) and `paymentStatus` (payment):
     ```javascript
     const { status, paymentStatus, paymentNotes, notes } = req.body;
     
     if (status) {
       const cleanStatus = status.trim().toLowerCase();
       if (!validStatuses.includes(cleanStatus)) {
         return res.status(400).json({ success: false, message: 'Invalid order status' });
       }
       order.status = cleanStatus;
     }

     if (paymentStatus) {
       const cleanPaymentStatus = paymentStatus.trim().toLowerCase();
       const validPaymentStatuses = ['pending', 'paid', 'failed'];
       if (!validPaymentStatuses.includes(cleanPaymentStatus)) {
         return res.status(400).json({ success: false, message: 'Invalid payment status' });
       }
       order.paymentStatus = cleanPaymentStatus;
       if (cleanPaymentStatus === 'paid') {
         order.payment.status = 'paid';
         order.payment.paidAt = new Date();
       } else if (cleanPaymentStatus === 'pending') {
         order.payment.status = 'pending';
         order.payment.paidAt = null;
       } else if (cleanPaymentStatus === 'failed') {
         order.payment.status = 'failed';
       }
     }

     if (paymentNotes || notes) {
       order.paymentNotes = (paymentNotes || notes).trim();
     }

     await order.save();
     ```

---

### 4.3 Proposed Route Updates (`src/routes/orderRoutes.js`)

Keep existing endpoints and add convenience endpoints:
```javascript
// Admin-only order oversight & status updates
router.get('/', admin, getAllOrders);
router.put('/:id/status', admin, updateOrderStatus);
router.patch('/:id/status', admin, updateOrderStatus);
router.put('/:id/payment-status', admin, updateOrderStatus); // convenience alias
```

---

### 4.4 Proposed Seed Data Updates (`src/data/seed.js` and `src/data/seedProducts.js`)

1. **`src/models/Product.js`**: Update default `currency` to `'LKR'`.
2. **`src/data/seedProducts.js`**: Update `currency: 'LKR'` across all 24 catalog items.
3. **`src/data/seed.js`**:
   Add seeding of 3 realistic customer orders upon `forceReset`:
   - **Order 1 (COD - Pending)**:
     - Customer: `Camille Dupont` (`customer@velvetaura.com`).
     - Product: `Sulwhasoo First Care Activating Serum VI`.
     - `paymentMethod: 'cod'`, `paymentStatus: 'pending'`, `status: 'processing'`.
     - `currency: 'LKR'`.
   - **Order 2 (Bank Transfer - Verified & Paid)**:
     - Customer: `Camille Dupont` (`customer@velvetaura.com`).
     - Product: `Augustinus Bader The Rich Cream with TFC8®`.
     - `paymentMethod: 'bank_transfer'`, `paymentStatus: 'paid'`, `status: 'completed'`.
     - `gatewayTransactionId: 'COMBANK-COL7-994821'`.
     - `paymentNotes: 'Direct bank transfer verified by finance admin on 2026-11-04'`.
   - **Order 3 (Bank Transfer - Pending Verification)**:
     - Customer: `Min-ji Park` (`minji@velvetaura.com`).
     - Product: `Rom&nd Zero Velvet Tint #06 Deepsoul`.
     - `paymentMethod: 'bank_transfer'`, `paymentStatus: 'pending'`, `status: 'pending'`.
     - `paymentNotes: 'Awaiting customer deposit slip upload'`.

---

## 5. Verification Method

To independently verify these findings and test future implementations:
1. **Automated Test Suite**:
   Execute `npm test` from project root. All 12 test suites must continue passing.
2. **Schema Verification**:
   Inspect `src/models/Order.js` to confirm:
   - `currency: { type: String, default: 'LKR' }`
   - `paymentMethod: { type: String, enum: ['cod', 'bank_transfer', 'payhere'] }`
   - `paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'] }`
   - `gatewayTransactionId`, `gatewayHash`, `paymentNotes`
3. **API Integration Testing**:
   - `POST /api/orders/checkout` with `paymentMethod: 'cod'` returns HTTP 201, `order.paymentMethod === 'cod'`, `order.paymentStatus === 'pending'`, `order.currency === 'LKR'`.
   - `POST /api/orders/checkout` with `paymentMethod: 'bank_transfer'` returns HTTP 201, `order.paymentMethod === 'bank_transfer'`, `order.paymentStatus === 'pending'`, `order.currency === 'LKR'`.
   - `PUT /api/orders/:id/status` as admin with `{ paymentStatus: 'paid' }` updates `order.paymentStatus` to `'paid'` and sets `paidAt`.
4. **Invalidation Conditions**:
   - If `order.paymentMethod` does not reject unrecognized payment types (e.g. `'bitcoin'`).
   - If newly created COD or Bank Transfer orders start with `paymentStatus: 'paid'` or `status: 'completed'` instead of `'pending'`.
   - If `npm test` breaks on existing order/admin tests.
