# Scope: VelvetAura Checkout & Payment System Update

## Architecture

VelvetAura is a full-stack e-commerce web application with an Express/Node.js/MongoDB backend and a dark-mode glassmorphic vanilla ES module frontend.

This update upgrades the currency to Sri Lankan Rupees (LKR / `Rs.`), replaces the mock credit card checkout flow with Cash on Delivery (COD) and Direct Bank Transfer (with corporate bank account details), prepares the PayHere payment gateway architecture and Order schema, exposes payment method and status across Admin and Account views, and updates the automated test suites.

```
Frontend (Vanilla ES Modules + Glassmorphism CSS)
  ├── base.js (formatPrice: Rs. X,XXX.XX)
  ├── store.js (calculateTotals in LKR, paymentMethod: 'cod'|'bank_transfer', submitCheckout)
  ├── components/checkoutModal.js (COD vs Bank Transfer radio cards, Bank Details card, Transfer confirmation)
  ├── components/cartDrawer.js (LKR formatting, shipping threshold in LKR)
  ├── components/catalog.js, productDetail.js, orderConfirmation.js (LKR formatting)
  ├── components/accountView.js (User order history with Payment Method & Status badges)
  └── components/adminDashboard.js (Admin orders table with Payment Method & Status badges, LKR revenue)

Backend (Express + Mongoose + PayHere Integration Prep)
  ├── models/Order.js (currency: 'LKR', paymentMethod: ['cod','bank_transfer','payhere'], paymentStatus: ['pending','paid','failed'], gatewayTransactionId, gatewayHash, paymentNotes)
  ├── models/Product.js (currency: 'LKR')
  ├── services/payhereService.js (MD5 hash generator, signature verifier, sandbox config)
  ├── routes/paymentRoutes.js (POST /api/payments/payhere/notify webhook callback)
  ├── controllers/paymentController.js (PayHere IPN handler, signature verification, status update)
  ├── controllers/orderController.js (COD & Bank Transfer order placement, admin status updates)
  └── data/seed.js, seedProducts.js (LKR currency, baseline seed orders)

Test Suites (Jest / Supertest / Puppeteer / Node test runners)
  ├── tests/unit/payhere.test.js (PayHere MD5 hash vectors, signature verification, config)
  ├── tests/integration/payhere_webhook.test.js (Webhook IPN callback, order status transition)
  ├── tests/integration/checkout_payment.test.js (COD and Bank Transfer order creation)
  ├── tests/order.test.js & tests/admin.test.js (Updated for LKR & new payment methods)
  └── tests/e2e/ (Opaque-box E2E test suites updated for LKR and new payment options)
```

## Feature Inventory

| # | Feature | Description | Milestone / Module | Source | Status |
|---|---------|-------------|-------------------|--------|--------|
| F1 | Currency Standardization (LKR) | Centralize currency formatting to `Rs. X,XXX.XX` across catalog, cart, product detail, checkout modal, confirmation, account, and admin views | Frontend & Store | ORIGINAL_REQUEST §1 | **DONE** |
| F2 | Shipping & Tax Calculations in LKR | Update shipping thresholds and tax calculations in `store.js` and order calculations to align with LKR | Store & Backend | ORIGINAL_REQUEST §1 | **DONE** |
| F3 | Mock Card Payment Removal | Remove mock credit card form inputs, card number formatting, and sandbox test card buttons from checkout | Frontend Checkout | ORIGINAL_REQUEST §2 | **DONE** |
| F4 | Cash on Delivery (COD) Flow | Radio selector for COD, order placed with initial payment status `'pending'`, fulfillment `'pending'` | Frontend & Backend | ORIGINAL_REQUEST §2.a | **DONE** |
| F5 | Direct Bank Transfer Flow | Radio selector for Bank Transfer, official VelvetAura bank details card (Commercial Bank of Ceylon), required confirmation checkbox | Frontend & Backend | ORIGINAL_REQUEST §2.b | **DONE** |
| F6 | Glassmorphic Styling for Payment Options | Consistent dark-mode glassmorphic styling for payment option selector cards, bank details box, and badges | CSS Components | ORIGINAL_REQUEST §2 | **DONE** |
| F7 | Order Model Schema Preparation | Add `currency: 'LKR'`, `paymentMethod` (`'cod'|'bank_transfer'|'payhere'`), `paymentStatus` (`'pending'|'paid'|'failed'`), gateway transaction & hash fields | Models (Order.js) | ORIGINAL_REQUEST §3 | **DONE** |
| F8 | PayHere Service & Utility Module | Implement PayHere uppercase MD5 hash generation helper, signature verifier, and sandbox environment configuration | Services (payhereService.js) | ORIGINAL_REQUEST §3 | **DONE** |
| F9 | PayHere Webhook / Notify Endpoint | Implement `POST /api/payments/payhere/notify` to verify signature and update order status for future PayHere transactions | Routes & Controllers | ORIGINAL_REQUEST §3 | **DONE** |
| F10 | Admin & User Order Payment Visibility | Expose `paymentMethod` and `paymentStatus` badges in Admin Dashboard orders table and Customer Account order history | Admin & Account Views | ORIGINAL_REQUEST §4 | **DONE** |
| F11 | Automated Test Suite Verification | Add PayHere unit/webhook tests, COD & Bank Transfer checkout tests, currency formatting tests, and update existing suites | Tests | ORIGINAL_REQUEST §4 | **DONE** |

## Interface Contracts

### 1. Currency Formatting
- `formatPrice(amount)`:
  - Input: number | string
  - Output: formatted string e.g. `Rs. 1,450.00`
  - Standard implementation:
    ```javascript
    export function formatPrice(amount) {
      const val = Number(amount) || 0;
      return `Rs. ${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    ```

### 2. Bank Details
Official corporate bank details for VelvetAura:
- **Bank Name**: Commercial Bank of Ceylon
- **Branch**: Colombo Fort Premier Branch
- **Account Name**: VelvetAura (Pvt) Ltd
- **Account Number**: `1000 8924 7712`
- **Currency**: LKR

### 3. Order Model Schema
- `currency`: `{ type: String, default: 'LKR', uppercase: true, trim: true }`
- `paymentMethod`: `{ type: String, enum: ['cod', 'bank_transfer', 'payhere'], required: true, default: 'cod' }`
- `paymentStatus`: `{ type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' }`
- `gatewayTransactionId`: `{ type: String, default: null }`
- `gatewayHash`: `{ type: String, default: null }`
- `paymentNotes`: `{ type: String, default: '' }`
- `payment`: backward-compatible nested subdocument synchronized with top-level fields:
  - `method`: synced with `paymentMethod`
  - `status`: synced with `paymentStatus`
  - `transactionId`: synced with `gatewayTransactionId`

### 4. Checkout API (`POST /api/orders/checkout`)
- **Payload**:
  ```json
  {
    "shippingAddress": {
      "fullName": "Kasun Perera",
      "addressLine1": "No. 45, Galle Road",
      "city": "Colombo",
      "state": "Western Province",
      "postalCode": "00300",
      "country": "Sri Lanka",
      "phone": "+94771234567"
    },
    "paymentMethod": "cod" | "bank_transfer" | "payhere",
    "bankTransferConfirmed": true,
    "paymentNotes": "Transferred via Commercial Bank online banking"
  }
  ```
- **Response** (HTTP 201):
  ```json
  {
    "success": true,
    "order": {
      "_id": "...",
      "orderNumber": "VA-...",
      "currency": "LKR",
      "grandTotal": 14500.00,
      "paymentMethod": "bank_transfer",
      "paymentStatus": "pending",
      "status": "pending",
      ...
    }
  }
  ```

### 5. PayHere Helper & Webhook (`src/services/payhereService.js`)
- **Hash Generation Formula**:
  `hash = strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))`
  - `amount_formatted`: strictly 2 decimal places with no thousands separators (`val.toFixed(2)` e.g. `'1000.00'`)
  - All concatenated, hashed with MD5, uppercase.
- **Webhook Signature Verification**:
  `local_md5sig = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))`
  - Compare with `req.body.md5sig`.
  - Status code mapping:
    - `2`: success (`paymentStatus = 'paid'`)
    - `0`: pending (`paymentStatus = 'pending'`)
    - `-1` or `-2`: canceled/failed (`paymentStatus = 'failed'`)

## Code Layout

- `public/js/components/base.js` — currency formatting helper (`formatPrice`).
- `public/js/components/checkoutModal.js` — checkout modal rendering COD & Bank Transfer selector, bank details, and transfer confirmation.
- `public/js/components/cartDrawer.js` — cart drawer with LKR totals and updated shipping message.
- `public/js/components/catalog.js` — catalog filter labels and price formatting.
- `public/js/components/adminDashboard.js` — admin orders table displaying `paymentMethod` and `paymentStatus`.
- `public/js/components/accountView.js` — user profile order history displaying `paymentMethod` and `paymentStatus`.
- `public/css/components.css` — dark-mode glassmorphism styling for `.payment-options-grid`, `.payment-option-card`, `.bank-transfer-details-box`, `.method-badge`, `.payment-badge`.
- `public/index.html` — hero banner shipping badge in LKR.
- `src/models/Order.js` — Order schema fields for LKR, paymentMethod, paymentStatus, and gateway fields.
- `src/models/Product.js` — default currency 'LKR'.
- `src/services/payhereService.js` — PayHere hash generation, verification, and sandbox URL helpers.
- `src/controllers/paymentController.js` — PayHere webhook IPN notify controller.
- `src/routes/paymentRoutes.js` — `POST /api/payments/payhere/notify` route.
- `src/controllers/orderController.js` — order creation handling COD, Bank Transfer, status updates.
- `src/app.js` — register `/api/payments` routes.
- `src/data/seed.js`, `src/data/seedProducts.js` — LKR seed data.
- `tests/unit/payhere.test.js` — unit tests for PayHere utility functions.
- `tests/integration/payhere_webhook.test.js` — integration tests for PayHere IPN notify endpoint.
- `tests/integration/checkout_payment.test.js` — tests for COD and Bank Transfer checkout flows.
- `tests/order.test.js`, `tests/admin.test.js`, `tests/e2e/` — updated test suites.

## Test Strategy

1. **Unit Tests (`tests/unit/payhere.test.js`)**:
   - Hash generation against verified test vectors.
   - 2-decimal formatting compliance.
   - Signature verification with matching and corrupted signatures.
   - Sandbox config helper returns correct URLs.
2. **Integration Tests (`tests/integration/payhere_webhook.test.js`, `tests/integration/checkout_payment.test.js`)**:
   - Placement of COD order: verifies `paymentMethod === 'cod'`, `paymentStatus === 'pending'`, `status === 'pending'`.
   - Placement of Bank Transfer order: verifies `paymentMethod === 'bank_transfer'`, `paymentStatus === 'pending'`, bank transfer confirmation.
   - PayHere Webhook: valid status 2 updates order to `paymentStatus === 'paid'`.
   - PayHere Webhook: invalid signature returns 400 and rejects update.
3. **Regression & E2E Tests**:
   - Ensure all existing test suites (`npm test` and `npm run test:e2e`) pass with LKR and new payment options.
