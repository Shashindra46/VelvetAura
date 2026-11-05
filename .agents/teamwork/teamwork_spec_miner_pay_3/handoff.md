# Specification & Test Blueprint: PayHere Architecture Preparation & Checkout System Update

**Author**: `teamwork_spec_miner_pay_3`  
**Date**: 2026-11-05  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\`  
**Authoritative Request**: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md` (Follow-up 2026-11-05T08:49:11Z)  

---

## Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Payment Gateway (PayHere) | Configuration & Mode Resolver | Configures PayHere credentials, mode (sandbox vs production), currency (LKR), and endpoint URLs via environment variables. | `process.env.PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, `PAYHERE_MODE`, `PAYHERE_CURRENCY` | Object containing `merchantId`, `currency`, `mode`, `checkoutUrl`, `notifyUrl`, `returnUrl`, `cancelUrl` | Throws ConfigurationError or warns if credentials missing in production mode. | PayHere Sri Lanka API Standard & ORIGINAL_REQUEST.md |
| 2 | Payment Gateway (PayHere) | Checkout Hash Generator | Generates PayHere MD5 checksum to secure checkout initialization: `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))` | `merchantId` (string), `orderId` (string), `amount` (number/string), `currency` (string, 'LKR'), `merchantSecret` (string) | 32-character uppercase MD5 hex string | Throws error if any required parameter is null/undefined or amount is non-numeric/negative. | PayHere Official Checkout Protocol |
| 3 | Payment Gateway (PayHere) | Webhook Signature Verifier | Validates authenticity of incoming PayHere notify callback by computing expected `md5sig`: `strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))` and comparing with incoming signature. | Inbound webhook payload object (`merchant_id`, `order_id`, `payhere_amount`, `payhere_currency`, `status_code`, `md5sig`), `merchantSecret` | Boolean (`true` if valid, `false` otherwise) | Returns `false` on tampered payload or missing fields; controller returns HTTP 400. | PayHere Server-to-Server Notification Specification |
| 4 | Payment Gateway (PayHere) | Webhook / Notify Endpoint | HTTP endpoint receiving IPN (Instant Payment Notification) from PayHere, verifying signature, and mutating order payment status. | `POST /api/payments/payhere/notify` with urlencoded/json body | HTTP 200 with status message | HTTP 400 for invalid signature; HTTP 404 if order not found; HTTP 500 on database error. | PayHere Gateway Spec & `src/routes/` |
| 5 | Order Model | Extended Payment Schema | Supports new payment methods (`cod`, `bank_transfer`, `payhere`, `mock_credit_card`), payment statuses (`pending`, `paid`, `failed`), and gateway/bank metadata. | Mongoose Schema definition in `src/models/Order.js` | Updated Order documents with `payment.method`, `payment.status`, `payment.payhereDetails`, `payment.bankDetails` | Schema validation error (HTTP 400) if unallowed enum values passed. | `src/models/Order.js` & ORIGINAL_REQUEST.md |
| 6 | Checkout Flow | Cash on Delivery (COD) | Enables customer to complete checkout without credit card; order created with payment status `pending`, inventory decremented, cart cleared. | `POST /api/orders/checkout` with `paymentMethod: 'cod'` (or `paymentDetails: { method: 'cod' }`), shippingAddress | HTTP 201 with created Order, `payment.method = 'cod'`, `payment.status = 'pending'`, transactionId `COD-VA-...` | HTTP 400 on empty cart, incomplete address, or depleted stock. | ORIGINAL_REQUEST.md R2a |
| 7 | Checkout Flow | Direct Bank Transfer | Displays VelvetAura bank account details in checkout modal; user confirms transfer; order created with payment status `pending`. | `POST /api/orders/checkout` with `paymentMethod: 'bank_transfer'`, `paymentDetails: { confirmed: true, bankName: ... }` | HTTP 201 with created Order, `payment.method = 'bank_transfer'`, `payment.status = 'pending'`, transactionId `BT-VA-...` | HTTP 400 on empty cart, incomplete address, unconfirmed transfer, or depleted stock. | ORIGINAL_REQUEST.md R2b |
| 8 | Localization / Pricing | LKR Currency Formatting | Formats monetary amounts in Sri Lankan Rupees across catalog, cart, checkout, confirmation, orders, and admin dashboard (`Rs. X,XXX.XX` or `LKR X,XXX.XX`). | Numeric amount (e.g. `1500` or `89.5`) | Formatted string (e.g. `Rs. 1,500.00` or `LKR 89.50`) | Falls back to `Rs. 0.00` if invalid or NaN input. | `public/js/components/base.js` & ORIGINAL_REQUEST.md R1 |
| 9 | Admin Dashboard | Payment Oversight | Displays payment method (`COD`, `Direct Bank Transfer`, `PayHere`) and payment status (`Pending`, `Paid`, `Failed`) alongside fulfillment status in Admin orders table. | `GET /api/orders` | Populated order rows with distinct payment method and payment status badges | Returns empty list or HTTP 403 for non-admins. | `public/js/components/adminDashboard.js` & ORIGINAL_REQUEST.md R4 |

---

## Edge Cases

| # | Feature | Input | Observed / Expected Behavior |
|---|---------|-------|------------------------------|
| 1 | PayHere Hash Generator | Amount without decimal places (e.g. integer `1000`) | Helper must format to strictly 2 decimal places (`'1000.00'`). Failure to do so invalidates the MD5 checksum. |
| 2 | PayHere Hash Generator | Floating-point amount with >2 decimals (e.g. `125.456`) | Helper must round half-up to 2 decimal places (`'125.46'`) before hashing. |
| 3 | PayHere Hash Generator | Secret containing special characters or mixed casing | Inner secret MD5 hash must be converted to uppercase (`toUpperCase()`) before string concatenation. |
| 4 | PayHere Webhook Verification | Inbound `md5sig` received in lowercase | Comparison must be case-insensitive (`computedSig.toUpperCase() === incomingSig.toUpperCase()`). |
| 5 | PayHere Webhook Verification | Tampered `payhere_amount` or `status_code` | Calculated MD5 signature will mismatch incoming `md5sig`; request must be rejected with HTTP 400 without updating order. |
| 6 | PayHere Webhook Verification | `status_code: 2` (Payment Success) | Order `payment.status` transitioned from `'pending'` to `'paid'`, `paidAt` timestamp set, `transactionId` populated with `payment_id`, fulfillment status updated to `'processing'` (or `'completed'`). |
| 7 | PayHere Webhook Verification | `status_code: 0` (Pending / Review) | Order `payment.status` remains `'pending'`. Fulfillment status remains `'pending'`. |
| 8 | PayHere Webhook Verification | `status_code: -1` (Canceled) or `-2` (Failed) | Order `payment.status` updated to `'failed'`; order fulfillment status set to `'cancelled'`; compensation rollback for inventory if stock was pre-held. |
| 9 | PayHere Webhook Verification | Duplicate webhook dispatch for already paid order | Idempotency guard: if order is already marked `'paid'`, log idempotent receipt and return HTTP 200 without duplicate state transitions or stock double-operations. |
| 10 | Cash on Delivery Checkout | Order placed with empty cart | Rejects with HTTP 400 `Cart is empty`. |
| 11 | Direct Bank Transfer Checkout | User submits without confirming transfer | Rejects with HTTP 400 `Confirmation of bank transfer is required`. |
| 12 | Currency Formatting | Non-numeric or null value passed to `formatPrice` | Returns `Rs. 0.00` gracefully without throwing runtime TypeError. |
| 13 | Admin Orders Filter | Filter by payment status (`pending` vs `paid` vs `failed`) | Correctly filters order records by `payment.status` independently from fulfillment `status`. |

---

## 1. Observation

Direct examination of the VelvetAura codebase yielded the following concrete observations:

1. **Existing Payment Service (`src/services/paymentService.js`)**:
   - Lines 70–183: `processPayment(amount, paymentDetails)` exclusively implements mock credit card validation (checking 13–19 digits, CVV format, expiration dates, simulated decline on cards ending in `'0002'`, and returns hardcoded `currency: 'USD'`, `method: 'mock_credit_card'`).
   - Lines 174–176:
     ```javascript
     amount: Math.round(numAmount * 100) / 100,
     currency: 'USD',
     method: 'mock_credit_card',
     ```
   - No Sri Lankan PayHere gateway helpers, MD5 checksum calculations, or PayHere configuration exist currently.

2. **Existing Order Model (`src/models/Order.js`)**:
   - Lines 65–90: `paymentSchema` defines:
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
   - The current schema does not have explicit support for `'cod'`, `'bank_transfer'`, or `'payhere'` methods, nor fields for PayHere payment ID, PayHere hash, or bank transfer confirmation.

3. **Existing Order Controller (`src/controllers/orderController.js`)**:
   - Lines 58–65: Mandatory check for `paymentDetails`:
     ```javascript
     if (!paymentDetails || typeof paymentDetails !== 'object') {
       return res.status(400).json({
         success: false,
         message: 'Payment details are required',
         error: 'Missing payment details',
       });
     }
     ```
   - Lines 110–126: Unconditionally invokes `processPayment(cart.grandTotal, paymentDetails)` which expects credit card numbers, CVV, and expiration date.
   - Lines 166–174: Order creation assumes `paymentResult.transactionId`, `method: paymentResult.method || 'mock_credit_card'`, `status: 'succeeded'`.
   - COD and Bank Transfer cannot currently pass checkout because `processPayment` rejects them with `MISSING_CARD_NUMBER`.

4. **Existing Frontend Currency Formatter (`public/js/components/base.js`)**:
   - Lines 42–49:
     ```javascript
     export function formatPrice(amount) {
       const val = Number(amount) || 0;
       return `$${val.toFixed(2)}`;
     }
     ```
   - Hardcoded to USD symbol `$`.

5. **Existing Product Model (`src/models/Product.js`)**:
   - Lines 61–65:
     ```javascript
     currency: {
       type: String,
       default: 'USD',
       trim: true,
     },
     ```
   - Defaults to `'USD'`.

6. **Existing Frontend Checkout Modal (`public/js/components/checkoutModal.js`)**:
   - Lines 141–204: Displays credit card inputs (cardholder name, card number, expiration, CVV) and quick-fill test card buttons ("Auto-fill Approved Card (Visa)").
   - No payment method selector for COD or Direct Bank Transfer exists.

7. **Existing Frontend Admin Dashboard (`public/js/components/adminDashboard.js`)**:
   - Lines 386–437: `renderOrderRow(order)` displays:
     ```javascript
     <td>
       <span class="payment-badge payment-${paymentStatus}">${escapeHtml(paymentStatus)}</span>
     </td>
     ```
   - Displays payment status but does not display `paymentMethod` (e.g. COD vs Bank Transfer vs PayHere).

8. **Test Suite Survey (`tests/`)**:
   - Survey of 38 files in `tests/`:
     - `tests/order.test.js`: 365 lines. Directly imports `processPayment`, tests valid card, declined card, expired card, invalid CVV, and checkout with `validPayment`.
     - `tests/admin.test.js`: 525 lines. Seeds sample order with `method: 'mock_credit_card'`, tests `GET /api/orders` and `PUT /api/orders/:id/status`.
     - `tests/concurrency.test.js`: 293 lines. Checks out with `validPayment` (mock card).
     - `tests/tier5_adversarial.test.js`: 623 lines. Tests non-standard card lengths (13, 15, 16, 19), leap year card exp dates, CVV bounds, declined cards.
     - `tests/e2e/helpers/fixtures.js`: 241 lines. Contains `mockCards.validVisa`, `mockCards.validMastercard`, `mockCards.declined`.
     - `tests/e2e/tier1_order.test.js`: 128 lines. Tests checkout with `mockCards.validVisa` and `mockCards.validMastercard`.
     - `tests/e2e/tier2_boundary.test.js`: 258 lines. Tests checkout with `mockCards.validVisa` and `mockCards.declined`.
     - `tests/e2e/tier3_interactions.test.js`: 218 lines. Multi-step workflows checking out with `mockCards.validVisa`.
     - `tests/e2e/tier4_scenarios.test.js`: 226 lines. 4 customer persona workflows checking out with `mockCards.validVisa`.
     - `tests/cart.test.js`: 302 lines. Tests `calculatePricing` with 8% tax and $50 shipping threshold.

---

## 2. Logic Chain

1. **Need for PayHere Architecture Preparation**:
   - `ORIGINAL_REQUEST.md` (Follow-up 2026-11-05T08:49:11Z) explicitly mandates preparing backend architecture, services, and models for real-time LKR card processing via PayHere Sri Lanka payment gateway.
   - PayHere's official integration specification requires:
     a) Environment-based configuration (Merchant ID, Merchant Secret, Currency `'LKR'`, Mode `'sandbox'` vs `'production'`).
     b) A deterministic uppercase MD5 checkout initiation hash: `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))` with amount formatted to 2 decimals.
     c) A server-to-server webhook endpoint (`notify_url`) that validates incoming `md5sig`: `strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))`, handling status codes `2` (Paid), `0` (Pending), `-1` (Canceled), `-2` (Failed).
   - Therefore, a dedicated service `src/services/payhereService.js` (or utility `src/utils/payhere.js`) and route handler `POST /api/payments/payhere/notify` must be specified with exact mathematical and cryptographic contracts.

2. **Need for Order Model Schema Extension**:
   - The current `Order.paymentSchema` only has `default: 'mock_credit_card'` and `status: enum ['succeeded', 'captured', 'authorized', 'failed', 'pending']`.
   - The new requirements dictate payment methods `'cod'`, `'bank_transfer'`, and `'payhere'`, and payment statuses `'pending'`, `'paid'`, and `'failed'`.
   - Furthermore, PayHere webhook requires recording the gateway's `payment_id`, and bank transfers require storing bank confirmation data.
   - Therefore, `Order.js` must extend `payment.method` enum to `['cod', 'bank_transfer', 'payhere', 'mock_credit_card']` and `payment.status` enum to include `['pending', 'paid', 'failed', 'succeeded']`, plus metadata fields `payherePaymentId`, `payhereHash`, and `bankTransferConfirmed`.

3. **Need to Support COD & Direct Bank Transfer**:
   - Because mock credit cards are being replaced in the active UI, the checkout endpoint `POST /api/orders/checkout` must accept `paymentMethod: 'cod'` and `paymentMethod: 'bank_transfer'` without requiring credit card numbers or CVV.
   - For COD, payment status must be initialized to `'pending'`.
   - For Bank Transfer, the frontend must display official bank details (Bank Name, Branch, Account Name, Account Number) and capture customer confirmation; the backend must initialize payment status to `'pending'`.

4. **Need for LKR Currency Across All Layers**:
   - `formatPrice` in `public/js/components/base.js` must output `Rs. X,XXX.XX` or `LKR X,XXX.XX` instead of `$X.XX`.
   - Catalog products, cart calculations, order confirmations, user history, and admin dashboard must consistently format amounts in LKR.

5. **Test Suite Impact**:
   - Existing tests currently send mock credit card objects (`cardNumber`, `cvv`, `expDate`) and assert on `TXN-VA-...` and `USD`.
   - If `orderController.js` removes card requirements in favor of COD and Bank Transfer, tests sending mock cards without backward-compatibility support would fail.
   - Therefore, existing tests must either be updated to use the new `paymentMethod: 'cod'` / `'bank_transfer'` contracts, or the controller must support both during migration.
   - New unit, integration, and E2E test suites must be created to rigorously verify PayHere hash generation, PayHere webhook signature validation, COD workflows, Bank Transfer workflows, and LKR currency formatting.

---

## 3. Caveats

1. **Live PayHere Sandbox Network Calls**: In automated test environments (and CI/CD), network calls to external endpoints (`https://sandbox.payhere.lk/...`) should not be executed. All PayHere tests must be pure unit tests for hash/signature algorithms or integration tests simulating inbound HTTP POST webhook requests via Supertest.
2. **Backward Compatibility**: Existing test suites (`tests/concurrency.test.js`, `tests/tier5_adversarial.test.js`) have extensive assertions on credit card digits and decline logic (`0002`). The backend checkout controller should support both `paymentMethod` (`'cod'`, `'bank_transfer'`) AND legacy/test `paymentDetails` (`mock_credit_card`) so existing adversarial suites remain intact while transitioning.
3. **No Code Implementation**: In accordance with the Spec Miner archetype and read-only constraints, no application code was edited during this turn. All findings and blueprints are delivered in this specification document.

---

## 4. Conclusion & Technical Specifications

### 4.1 PayHere Architecture & Models Preparation Specification

#### A. Environment Configuration (`.env`)
The application must support the following environment variables:
```bash
# PayHere Payment Gateway Credentials
PAYHERE_MERCHANT_ID=1211149
PAYHERE_MERCHANT_SECRET=4Mm8k8abc12345xyzSecretToken
PAYHERE_MODE=sandbox            # 'sandbox' or 'production'
PAYHERE_CURRENCY=LKR            # Default currency
PAYHERE_NOTIFY_URL=http://localhost:5000/api/payments/payhere/notify
PAYHERE_RETURN_URL=http://localhost:5000/#/order/
PAYHERE_CANCEL_URL=http://localhost:5000/#/cart
```

#### B. Gateway URLs
- **Sandbox Checkout URL**: `https://sandbox.payhere.lk/pay/checkout`
- **Production Checkout URL**: `https://www.payhere.lk/pay/checkout`

#### C. Hash Generation Helper Specification
PayHere mandates an uppercase MD5 hash to guarantee checkout data integrity.

**Formula**:
```
hash = strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))
```

**Implementation Contract** (`src/services/payhereService.js`):
```javascript
const crypto = require('crypto');

/**
 * Calculates PayHere checkout initiation MD5 hash.
 * 
 * @param {string} merchantId - PayHere Merchant ID
 * @param {string} orderId - Merchant Order ID (e.g. orderNumber or order._id)
 * @param {number|string} amount - Total amount to charge
 * @param {string} currency - 3-letter currency code (e.g. 'LKR')
 * @param {string} merchantSecret - PayHere Merchant Secret
 * @returns {string} 32-character uppercase MD5 hash
 */
function generatePayHereHash(merchantId, orderId, amount, currency = 'LKR', merchantSecret) {
  if (!merchantId || !orderId || amount === undefined || amount === null || !merchantSecret) {
    throw new Error('Missing required parameters for PayHere hash generation');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    throw new Error('Amount must be a non-negative number');
  }

  // Format amount strictly to 2 decimal places with standard dot separator
  const amountFormatted = numAmount.toFixed(2);

  // 1. Compute uppercase MD5 hash of merchant secret
  const hashedSecret = crypto
    .createHash('md5')
    .update(String(merchantSecret).trim())
    .digest('hex')
    .toUpperCase();

  // 2. Concatenate: merchant_id + order_id + amount_formatted + currency + hashedSecret
  const hashString = `${String(merchantId).trim()}${String(orderId).trim()}${amountFormatted}${String(currency).trim()}${hashedSecret}`;

  // 3. Compute uppercase MD5 hash of the concatenated string
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}
```

**Standard PayHere Test Vectors**:
- Vector 1:
  - `merchantId`: `'1211149'`
  - `orderId`: `'VA-20261105-1001'`
  - `amount`: `1000` -> formatted: `'1000.00'`
  - `currency`: `'LKR'`
  - `merchantSecret`: `'4Mm8k8abc123'`
  - `hashedSecret`: `md5('4Mm8k8abc123').toUpperCase()` = `'3087C9E7D8A7492190B547CD98FFB952'`
  - `hashString`: `'1211149VA-20261105-10011000.00LKR3087C9E7D8A7492190B547CD98FFB952'`
  - `expectedHash`: `md5(hashString).toUpperCase()`
- Vector 2:
  - `merchantId`: `'1211149'`
  - `orderId`: `'Order_999'`
  - `amount`: `89.5` -> formatted: `'89.50'`
  - `currency`: `'LKR'`
  - `merchantSecret`: `'SecretKey2026'`

#### D. Webhook / Notify Signature Verification Specification
When PayHere completes payment processing, it issues an HTTP POST to `notify_url`.

**Formula**:
```
md5sig = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
```

**Verification Contract** (`src/services/payhereService.js`):
```javascript
/**
 * Verifies authenticity of PayHere Server Notification (Webhook) payload.
 * 
 * @param {Object} payload - req.body from PayHere notify callback
 * @param {string} merchantSecret - Configured PayHere merchant secret
 * @returns {boolean} True if signature is valid and authentic
 */
function verifyPayHereNotifySignature(payload, merchantSecret) {
  if (!payload || typeof payload !== 'object' || !merchantSecret) {
    return false;
  }

  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig,
  } = payload;

  if (!merchant_id || !order_id || !payhere_amount || !payhere_currency || status_code === undefined || !md5sig) {
    return false;
  }

  // 1. Hash the secret to uppercase MD5
  const hashedSecret = crypto
    .createHash('md5')
    .update(String(merchantSecret).trim())
    .digest('hex')
    .toUpperCase();

  // 2. Concatenate parameters
  const hashString = `${String(merchant_id).trim()}${String(order_id).trim()}${String(payhere_amount).trim()}${String(payhere_currency).trim()}${String(status_code).trim()}${hashedSecret}`;

  // 3. Compute expected signature
  const localSignature = crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();

  // 4. Case-insensitive comparison
  return localSignature === String(md5sig).trim().toUpperCase();
}
```

#### E. Webhook Route & Controller Specification
- **Route**: `POST /api/payments/payhere/notify` (or `POST /api/orders/payhere/notify`)
- **Headers**: Accepts `application/x-www-form-urlencoded` or `application/json`
- **Controller Logic**:
  1. Extract payload: `merchant_id`, `order_id`, `payment_id`, `payhere_amount`, `payhere_currency`, `status_code`, `md5sig`, `method`, `card_holder_name`.
  2. Verify signature: Call `verifyPayHereNotifySignature(req.body, process.env.PAYHERE_MERCHANT_SECRET)`. If `false` -> Return `res.status(400).json({ success: false, message: 'Invalid MD5 signature' })`.
  3. Validate merchant: Verify `merchant_id === process.env.PAYHERE_MERCHANT_ID`.
  4. Lookup order: Find order by `orderNumber: order_id` or `_id: order_id`. If not found -> Return `res.status(404).json({ success: false, message: 'Order not found' })`.
  5. Check existing status (Idempotency): If `order.payment.status === 'paid'` and `status_code === '2'`, return `res.status(200).send('Order already marked as paid')`.
  6. Transition state according to `status_code`:
     - `status_code === 2` (Success):
       - `order.payment.status = 'paid'`
       - `order.payment.transactionId = payment_id || order.payment.transactionId`
       - `order.payment.payherePaymentId = payment_id`
       - `order.payment.paidAt = new Date()`
       - `order.payment.method = 'payhere'`
       - `order.status = 'processing'`
     - `status_code === 0` (Pending):
       - `order.payment.status = 'pending'`
       - `order.payment.payherePaymentId = payment_id`
     - `status_code === -1` (Canceled) or `-2` (Failed):
       - `order.payment.status = 'failed'`
       - `order.status = 'cancelled'`
       - (Optionally trigger stock rollback compensation)
  7. Save order in MongoDB: `await order.save()`.
  8. Acknowledge gateway: Return `res.status(200).send('OK')`.

#### F. Order Model Schema Specification (`src/models/Order.js`)
Update `paymentSchema` to:
```javascript
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
      enum: ['pending', 'paid', 'failed', 'succeeded', 'authorized', 'captured'],
      default: 'pending',
    },
    paidAt: {
      type: Date,
      default: null,
    },
    // PayHere gateway fields
    payherePaymentId: {
      type: String,
      default: null,
    },
    payhereHash: {
      type: String,
      default: null,
    },
    // Direct Bank Transfer fields
    bankDetails: {
      bankName: { type: String, default: '' },
      branch: { type: String, default: '' },
      accountName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      confirmed: { type: Boolean, default: false },
    },
    cardLast4: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);
```
Add top-level virtuals or pre-save hooks so that `order.paymentMethod` maps to `order.payment.method` and `order.paymentStatus` maps to `order.payment.status`.

#### G. Direct Bank Transfer Official Details
VelvetAura official bank credentials to render in checkout modal and order confirmation:
- **Bank Name**: Commercial Bank of Ceylon
- **Branch**: Colombo Super Grade Branch (Branch Code: 001)
- **Account Name**: VelvetAura Luxury Imports (Pvt) Ltd
- **Account Number**: 8009247101
- **SWIFT / BIC**: CCEYLKLX
- **Instructions**: Please include your Order Number as the transfer reference. Your order will be dispatched once the transfer is confirmed.

---

### 4.2 Comprehensive Test Suite Impact Analysis

#### Survey of All 38 Files in `tests/`

| # | Test File | Primary Focus | Touches Orders / Payment / Currency | Impact Level | Action Required |
|---|-----------|---------------|------------------------------------|--------------|-----------------|
| 1 | `tests/order.test.js` | Checkout pipeline, payment processing, stock decrement | YES: tests `processPayment`, mock cards, checkout | **CRITICAL** | Update checkout tests to use COD and Bank Transfer payloads. Add PayHere unit & webhook integration tests. Keep mock card tests in legacy section or update. |
| 2 | `tests/admin.test.js` | Admin RBAC, product CRUD, order oversight | YES: seeds order with `method: 'mock_credit_card'`, tests order listing | **HIGH** | Update seeded order to include `paymentMethod` and `paymentStatus`. Add assertions that `GET /api/orders` returns payment method and status. |
| 3 | `tests/admin_adversarial.test.js` | Admin edge cases, status enum states | YES: seeds order with mock payment; tests status transitions | **MEDIUM** | Ensure seeded order satisfies updated schema; test payment status isolation. |
| 4 | `tests/concurrency.test.js` | Race conditions on scarce stock (`stock = 1`) | YES: checkouts dispatch `validPayment` (mock card) | **MEDIUM** | Update checkout payload to `{ paymentMethod: 'cod' }` (or keep validPayment if backward compatible). |
| 5 | `tests/tier5_adversarial.test.js` | Adversarial attacks, inventory bounds, payment edge cases | YES: tests mock card lengths (13,15,16,19), leap year exp, CVV | **HIGH** | Adapt Section 4 tests to validate PayHere hash/signature edge cases and COD/Bank transfer inputs while retaining core inventory rollback checks. |
| 6 | `tests/cart.test.js` | Cart CRUD, pricing formulas (`calculatePricing`) | YES: tax (8%) and shipping threshold ($50) | **MEDIUM** | Verify pricing formulas work with LKR currency amounts and 2 decimal places. |
| 7 | `tests/catalog.test.js` | Catalog search, pagination, facet filters | Minor: prices are numbers | **LOW** | Verify currency field compatibility in product documents (`currency: 'LKR'`). |
| 8 | `tests/auth.test.js` | User registration, login, JWT validation | NO | **NONE** | No changes required. |
| 9 | `tests/health.test.js` | Health check endpoint | NO | **NONE** | No changes required. |
| 10 | `tests/upload.test.js` | Product image upload | NO | **NONE** | No changes required. |
| 11 | `tests/stress_upload_api.test.js` | Upload API stress | NO | **NONE** | No changes required. |
| 12 | `tests/modal_ui_stress.test.js` | Admin modal layout and DOM bounds | NO | **NONE** | No changes required. |
| 13 | `tests/e2e/helpers/fixtures.js` | Test fixtures: sample products, mock cards, addresses | YES: defines `mockCards` | **HIGH** | Add fixtures for `codPayment` and `bankTransferPayment`. Add LKR formatting fixtures. |
| 14 | `tests/e2e/helpers/testClient.js` | Supertest/fetch client wrapper | Minor: `checkout(token, payload)` | **LOW** | Client already accepts arbitrary payloads. Fully compatible. |
| 15 | `tests/e2e/tier1_order.test.js` | Tier 1 E2E checkout & payment simulation | YES: checkouts with `mockCards.validVisa` | **HIGH** | Update test cases to checkout via COD and Bank Transfer; assert on `payment.method` and `payment.status`. |
| 16 | `tests/e2e/tier2_boundary.test.js` | Boundary tests: empty cart, missing address, declined card | YES: checkouts with `mockCards.declined` | **MEDIUM** | Replace or supplement declined card test with COD / Bank Transfer boundary checks. |
| 17 | `tests/e2e/tier3_interactions.test.js` | Multi-step user interaction scenarios | YES: checkouts with `mockCards.validVisa` | **MEDIUM** | Replace `mockCards.validVisa` with COD or Bank Transfer payload. |
| 18 | `tests/e2e/tier4_scenarios.test.js` | 4 customer persona luxury shopping scenarios | YES: checkouts with `mockCards.validVisa` | **MEDIUM** | Replace `mockCards.validVisa` with COD / Bank Transfer payloads. |
| 19 | `tests/stress/*` | Stress test scripts (concurrency challenge, empirical) | Minor: use mock payment | **LOW** | Update checkout payloads to COD. |

---

### 4.3 Detailed Specification of New Test Suites

#### Suite A: PayHere Utility Unit Test Suite (`tests/payhere.test.js`)
Must contain test cases:
1. `generatePayHereHash`:
   - Validates correct uppercase MD5 hash output matching standard formula.
   - Formats integer amount (`1000`) to strictly two decimal places (`'1000.00'`).
   - Rounds fractional amounts with >2 decimals (`125.456` -> `'125.46'`).
   - Handles zero amount (`0` -> `'0.00'`).
   - Throws descriptive error for missing `merchantId`, `orderId`, `amount`, or `merchantSecret`.
   - Throws error for negative amount.
2. `verifyPayHereNotifySignature`:
   - Returns `true` when inbound `md5sig` matches locally calculated signature.
   - Case-insensitive comparison (`MD5` in uppercase or lowercase matches).
   - Returns `false` when `payhere_amount` is tampered.
   - Returns `false` when `status_code` is tampered (e.g. from -1 to 2).
   - Returns `false` when `order_id` is tampered.
   - Returns `false` when incorrect merchant secret is used.
   - Returns `false` for missing or null payload parameters.
3. `getPayHereConfig`:
   - Returns default `mode: 'sandbox'` and `currency: 'LKR'`.
   - Returns sandbox checkout URL when `PAYHERE_MODE=sandbox`.
   - Returns production checkout URL when `PAYHERE_MODE=production`.
   - Correctly overrides merchant ID from environment variable.

#### Suite B: PayHere Webhook/Notify Integration Test Suite (`POST /api/payments/payhere/notify`)
Must contain test cases:
1. **Status Code 2 (Payment Success)**:
   - Dispatches validly signed POST payload with `status_code: '2'`.
   - Responds with HTTP 200 OK.
   - Verifies target Order in MongoDB has `payment.status === 'paid'`, `payment.transactionId === payload.payment_id`, `payment.payherePaymentId === payload.payment_id`, `paidAt` is set, and fulfillment `status === 'processing'`.
2. **Status Code 0 (Payment Pending)**:
   - Dispatches validly signed POST payload with `status_code: '0'`.
   - Responds with HTTP 200 OK.
   - Verifies target Order has `payment.status === 'pending'`.
3. **Status Code -1 / -2 (Payment Canceled / Failed)**:
   - Dispatches validly signed POST payload with `status_code: '-1'`.
   - Responds with HTTP 200 OK.
   - Verifies target Order has `payment.status === 'failed'` and `status === 'cancelled'`.
4. **Invalid Signature Rejection**:
   - Dispatches payload with invalid `md5sig`.
   - Responds with HTTP 400 Bad Request.
   - Verifies target Order state is NOT altered.
5. **Non-Existent Order**:
   - Dispatches validly signed payload for non-existent order number.
   - Responds with HTTP 404 Not Found.
6. **Webhook Idempotency**:
   - Dispatches duplicate status 2 webhook for already paid order.
   - Responds with HTTP 200 without duplicate database mutations or double stock deductions.

#### Suite C: Cash on Delivery (COD) Checkout Integration Tests (`POST /api/orders/checkout`)
Must contain test cases:
1. **Successful COD Order Placement**:
   - User with items in cart submits `{ shippingAddress: validAddress, paymentMethod: 'cod' }`.
   - Responds with HTTP 201 Created.
   - Response contains created `order` and `transactionId` (matching `^COD-VA-\d+-\d+$`).
   - Order has `payment.method === 'cod'`, `payment.status === 'pending'`, `status === 'pending'` (or `'processing'`).
   - User's cart is automatically emptied.
   - Catalog product inventory is decremented atomically.
2. **COD Order History Isolation**:
   - `GET /api/orders/my-orders` returns the COD order with `payment.method: 'cod'` and `payment.status: 'pending'`.
   - Another user's `my-orders` does not leak this order.
3. **Empty Cart & Incomplete Address Rejection**:
   - Rejects COD checkout with empty cart (HTTP 400).
   - Rejects COD checkout with incomplete address (HTTP 400).

#### Suite D: Direct Bank Transfer Checkout Integration Tests (`POST /api/orders/checkout`)
Must contain test cases:
1. **Successful Direct Bank Transfer Order Placement**:
   - User submits `{ shippingAddress: validAddress, paymentMethod: 'bank_transfer', paymentDetails: { confirmed: true, bankName: 'Commercial Bank' } }`.
   - Responds with HTTP 201 Created.
   - Response contains `transactionId` (matching `^BT-VA-\d+-\d+$`).
   - Order has `payment.method === 'bank_transfer'`, `payment.status === 'pending'`, `status === 'pending'`.
   - Order record stores bank transfer confirmation flag.
   - User cart is emptied and inventory is decremented.
2. **Unconfirmed Bank Transfer Rejection**:
   - User submits `paymentMethod: 'bank_transfer'` with `confirmed: false` or missing confirmation.
   - Responds with HTTP 400 `Confirmation of bank transfer is required`.
3. **Order Detail Viewing**:
   - `GET /api/orders/:id` displays bank transfer details and instructions for the customer.

#### Suite E: Currency Formatting (LKR) Verification Suite
Must contain test cases:
1. **Frontend `formatPrice` Helper**:
   - Formats `1500` -> `Rs. 1,500.00` (or `LKR 1,500.00`).
   - Formats `89.5` -> `Rs. 89.50`.
   - Formats `0` -> `Rs. 0.00`.
   - Formats large numbers e.g. `2500000` -> `Rs. 2,500,000.00`.
   - Handles null/undefined/NaN without throwing error.
2. **Catalog Product Currency Attribute**:
   - `GET /api/products` returns products with `currency: 'LKR'`.
3. **Order Confirmation & Account History Currency Consistency**:
   - Order receipts and history rows display amounts with `Rs.` / `LKR`.

#### Suite F: Admin Dashboard Order Oversight & Management Tests (`tests/admin.test.js`)
Must contain test cases:
1. **`GET /api/orders` Returns Payment Method & Status**:
   - Returns customer orders with clearly populated `payment.method` (`'cod'`, `'bank_transfer'`, `'payhere'`) and `payment.status` (`'pending'`, `'paid'`, `'failed'`).
2. **Admin Fulfillment Status Transitions**:
   - Admin updates fulfillment status (`shipped`, `delivered`, `completed`) while `payment.status` is preserved independently.
3. **Frontend Contract Verification**:
   - Admin Dashboard orders table contains distinct columns for `Payment Method` and `Payment Status`.

---

## 5. Verification Method

To independently verify the discoveries, interface contracts, and specifications:

1. **Inspect Codebase Files**:
   - Check `src/models/Order.js` lines 65–90 to observe existing `paymentSchema`.
   - Check `src/services/paymentService.js` lines 70–183 to observe current mock credit card logic.
   - Check `public/js/components/base.js` line 46 to observe `$${val.toFixed(2)}` formatting.
   - Check `src/controllers/orderController.js` lines 58–125 to observe rigid mock card validation.
   - Check `tests/order.test.js` lines 21–34 and lines 81–136 to inspect existing mock credit card tests.

2. **Verify PayHere Hash Generation Logic**:
   - Execute the standard PayHere hash equation using Node `crypto` against test vectors:
     ```javascript
     const crypto = require('crypto');
     const secret = '4Mm8k8abc123';
     const hashedSecret = crypto.createHash('md5').update(secret).digest('hex').toUpperCase();
     const hashString = `1211149VA-10011000.00LKR${hashedSecret}`;
     const hash = crypto.createHash('md5').update(hashString).digest('hex').toUpperCase();
     console.log('Generated PayHere Hash:', hash);
     ```
   - Verify that formatting amount with `.toFixed(2)` yields deterministic 32-character hex output.

3. **Verify Webhook Signature Calculation**:
   - Test that `verifyPayHereNotifySignature` returns `true` on authentic payloads and rejects tampering of `payhere_amount`, `status_code`, or `order_id`.

4. **Verify Existing Jest Test Suite Execution**:
   - Existing test suite can be run via `npm test` to confirm baseline passing state prior to changes.

5. **Invalidation Conditions**:
   - If PayHere Sri Lanka official API departs from the MD5 uppercase standard formula `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))`, the hash generator must be adjusted.
   - If user requirements demand removing mock credit cards without backward-compatibility support, existing tests in `tests/concurrency.test.js` and `tests/tier5_adversarial.test.js` must be updated concurrently.
