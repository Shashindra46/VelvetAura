# Full Test Suite Regression Impact & Adversarial Stress Analysis Report

**Agent**: `teamwork_explorer_pay_fix_3`  
**Roles**: explorer, synthesizer  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_fix_3\`  
**Milestone**: Iteration 2 Pre-Implementation Test Suite & Regression Investigation  
**Date**: 2026-11-05T10:10:00Z  
**Parent Agent**: `6b4fd1bc-f6a8-4599-80c7-b21287b6826b`  
**Handoff Type**: Hard (Investigation Complete)  

---

## Executive Summary

A comprehensive static analysis and cross-dependency audit of all **17 Jest test suites** and **8 E2E test suites** in `tests/` was performed to:
1. Deeply analyze the two test failures in `tests/adversarial_payhere_stress.test.js` (double inventory rollback on replayed status -1/-2 and paid order state downgrade on stale status -1).
2. Measure the exact regression blast radius when modifying `src/controllers/paymentController.js` and frontend currency files (`public/js/components/adminDashboard.js`, `public/js/components/catalog.js`, `public/js/store.js`, and `public/index.html`).
3. Formulate the definitive **Verification Matrix** required for the implementation worker in Iteration 2.

**Primary Finding**:
The blast radius of modifying `src/controllers/paymentController.js` is **strictly isolated**. A global codebase search confirmed that only **3 files** in the entire test repository touch `/api/payments/`:
1. `tests/unit/payhere.test.js` (only checks configuration URL string `/api/payments/payhere/notify`)
2. `tests/integration/payhere_webhook.test.js` (webhook IPN contracts)
3. `tests/adversarial_payhere_stress.test.js` (adversarial stress harness)

Existing suites such as `tests/order.test.js`, `tests/admin.test.js`, `tests/integration/checkout_payment.test.js`, `tests/integration/checkout_adversarial.test.js`, and all 8 E2E test suites do **NOT** invoke `paymentController.js` or the `/api/payments/payhere/notify` endpoint. Modifying `paymentController.js` to implement idempotency guards for failed/cancelled webhooks and state transition protections for paid orders carries **ZERO regression risk** on existing suites, provided that:
- HTTP 200 is returned for acknowledged duplicate notifications.
- The success message string for duplicate status 2 continues to contain `'already marked as paid'`.
- Status codes (200, 400, 404) and JSON response shapes remain intact.

Similarly, fixing the stale `Retail Price (USD) *` label in `adminDashboard.js`, aligning catalog price ranges in `catalog.js`, and updating hero shipping text in `index.html` has zero regression risk on existing test suites.

---

## 1. Observation

Direct examination of test suites, backend controllers, and frontend templates revealed the following exact observations:

### 1.1 Analysis of Failing Tests in `tests/adversarial_payhere_stress.test.js`

#### Failing Test 1: Critical Idempotency Challenge (Duplicate Status -1 / -2 Webhook)
- **File & Line**: `tests/adversarial_payhere_stress.test.js`, lines 595–662
- **Test Title**: `CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback`
- **Setup**:
  - `testProduct1.stock`: baseline 50.
  - Decrement 2 items at checkout -> stock becomes 48.
  - Order created with `paymentMethod: 'payhere'`, `paymentStatus: 'pending'`, `status: 'pending'`, quantity: 2.
  - Webhook payload signed with authentic MD5 signature: `status_code: -1`, `status_message: 'Payment canceled by user'`.
- **Execution & Verbatim Failure**:
  - Webhook 1 sent: HTTP 200, stock restored by +2 to 50 (`expect(stockAfterFirstNotify).toBe(50)`).
  - Webhook 2 (replay/retry) sent: HTTP 200.
  - Assertion:
    ```javascript
    660: const stockAfterReplay = (await Product.findById(testProduct1._id)).stock;
    661: expect(stockAfterReplay).toBe(baselineStock); // Expected: 50, Received: 52
    ```
- **Code Defect in `src/controllers/paymentController.js`**:
  Lines 71–78:
  ```javascript
  // 4. Idempotency check: if already marked 'paid' and incoming is status 2 (success)
  if (order.paymentStatus === 'paid' && Number(status_code) === 2) {
    return res.status(200).json({
      success: true,
      message: 'Order already marked as paid',
      orderId: order.orderNumber,
    });
  }
  ```
  And lines 101–114:
  ```javascript
  } else if (newPaymentStatus === 'failed') {
    order.status = 'cancelled';
    order.paymentNotes = `PayHere payment failed or canceled: ${status_message || 'Status ' + status_code}`;

    // Stock rollback compensation for canceled orders
    if (order.items && order.items.length > 0) {
      for (const item of order.items) {
        if (item.product && item.quantity) {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: item.quantity },
          });
        }
      }
    }
  }
  ```
  On webhook 2, `order.paymentStatus === 'paid'` is false (it is `'failed'`). Line 72 does not catch it. Execution falls through to line 101 (`newPaymentStatus === 'failed'`), which executes `$inc: { stock: item.quantity }` again, adding another +2 to stock (50 -> 52).

#### Failing Test 2: Stale Webhook Challenge (Stale Status -1 on Paid Order)
- **File & Line**: `tests/adversarial_payhere_stress.test.js`, lines 664–719
- **Test Title**: `STALE WEBHOOK CHALLENGE: stale status -1 on an already paid order must NOT corrupt paid order or restore stock`
- **Setup**:
  - `testProduct1.stock`: baseline 50, decremented by 2 to 48.
  - Order created with `paymentStatus: 'paid'` and `status: 'processing'`.
  - Stale webhook payload sent: `status_code: -1`, `status_message: 'Stale delayed cancel notification'`.
- **Execution & Verbatim Failure**:
  ```javascript
  717: expect(finalOrder.paymentStatus).toBe('paid'); // Expected: "paid", Received: "failed"
  718: expect(finalStock).toBe(baselineStock - orderedQty); // Expected: 48, Received: 50
  ```
- **Code Defect in `src/controllers/paymentController.js`**:
  Line 72 checks `order.paymentStatus === 'paid' && Number(status_code) === 2`. When `status_code` is `-1`, the check evaluates to `false`. Execution proceeds to line 82 (`order.paymentStatus = 'failed'`), line 102 (`order.status = 'cancelled'`), and lines 109–111 (stock restored by +2 from 48 to 50), downgrading an already-paid order.

---

### 1.2 Inspection of Existing Test Suites & Dependencies

#### A. Webhook & Payment Utility Suites
1. **`tests/integration/payhere_webhook.test.js`** (332 lines, 7 tests):
   - Lines 61–120: `POST /api/payments/payhere/notify` with status 2 -> expects `updatedOrder.paymentStatus === 'paid'`, `status === 'processing'`, `payment.paidAt` defined.
   - Lines 122–172: status 0 leaves order `pending`.
   - Lines 174–231: status -1 marks order `failed`, `status: 'cancelled'`, restores stock once.
   - Lines 233–251: invalid signature -> HTTP 400 (`Invalid PayHere signature`).
   - Lines 253–271: non-existent order number -> HTTP 404 (`Order not found`).
   - Lines 273–320: duplicate status 2 on paid order -> HTTP 200, expects `expect(res.body.message).toContain('already marked as paid')`.
   - Lines 322–330: `GET /api/payments/payhere/config` -> HTTP 200.
2. **`tests/unit/payhere.test.js`** (303 lines, 15 tests):
   - Tests pure functions: `generatePayHereHash`, `verifyPayHereSignature`, `getPayHereConfig`, `mapPayHereStatus`.
   - Line 273: asserts `expect(config.notifyUrl).toBe('/api/payments/payhere/notify')`.
   - Does NOT invoke `paymentController.js`.
3. **`tests/integration/checkout_payment.test.js`** (279 lines, 5 tests):
   - Tests COD checkout: `POST /api/orders/checkout` with `paymentMethod: 'cod'`, expects 201, `order.paymentStatus === 'pending'`, stock decremented, cart cleared.
   - Tests Bank Transfer checkout: `paymentMethod: 'bank_transfer'`, `bankTransferConfirmed: true`, expects 201, bank details recorded.
   - Tests rejection when `bankTransferConfirmed: false` -> HTTP 400.
   - Tests Admin updating paymentStatus to `'paid'` via `PUT /api/orders/:id/status`.
4. **`tests/integration/checkout_adversarial.test.js`** (624 lines, 14 tests):
   - Tests strict boolean requirement for `bankTransferConfirmed: true` (rejects null, 1, 'true', false with HTTP 400).
   - Tests `formatPrice` edge cases (`0`, fractions, `NaN`, `null`, `undefined` -> `Rs. 0.00`).
   - Tests `formatPaymentMethod` and `formatPaymentStatus` badge text.
   - Lines 413–435: scans all 8 frontend files (`public/index.html`, `catalog.js`, `cartDrawer.js`, `checkoutModal.js`, `orderConfirmation.js`, `accountView.js`, `adminDashboard.js`, `productDetail.js`) to assert zero occurrences of `$\d+`.
   - Tests Admin status updates (`PUT /api/orders/:id/status`), verifying paidAt timestamping, reverting to pending, and RBAC 403 enforcement.

#### B. Core Application Suites
5. **`tests/order.test.js`** (365 lines, 11 tests):
   - Tests mock payment engine `processPayment(amount, paymentDetails)` in `src/services/paymentService.js`.
   - Tests `POST /api/orders/checkout` with credit card `paymentDetails`, cart clearing, stock rollback on card decline.
   - Tests `GET /api/orders/my-orders` and `GET /api/orders/:id`.
   - No call to `/api/payments/*`.
6. **`tests/admin.test.js`** (525 lines, 16 tests):
   - Tests admin RBAC (401/403/200), product CRUD (POST, PUT, DELETE), order listing (`GET /api/orders`), order status update (`PUT /api/orders/:id/status`).
   - Lines 493–523: checks `index.html` contains `#admin-view-container`, `navbar.js` contains `#nav-admin-link`, `app.js` contains route guard, `adminDashboard.js` contains `class AdminDashboardComponent`.
   - Does NOT assert on `Retail Price (USD) *`.
7. **`tests/admin_adversarial.test.js`** (518 lines, 18 tests):
   - Tests admin boundary inputs, price bounds, stock limits, and concurrent order updates.
8. **`tests/catalog.test.js`** (211 lines, 12 tests):
   - Tests `GET /api/products`, pagination, sorting, category/origin/brand filtering.
   - Lines 106–114: tests `GET /api/products?minPrice=50&maxPrice=100`.
   - Does NOT assert on frontend dropdown labels.
9. **`tests/cart.test.js`** (10 tests):
   - Tests cart addition, updates, removals, subtotals, and stock constraints.
10. **`tests/auth.test.js`** (14 tests):
    - Tests user registration, login, JWT issuance, password hashing, and `/api/auth/me`.
11. **`tests/concurrency.test.js`** (4 tests):
    - Tests simultaneous checkouts preventing negative inventory.
12. **`tests/health.test.js`** (3 tests):
    - Tests `/api/health` dual-mode database status.
13. **`tests/modal_ui_stress.test.js`**, **`tests/stress_upload_api.test.js`**, **`tests/tier5_adversarial.test.js`**, **`tests/upload.test.js`**:
    - Product image upload handling, modal layout assertions, and input sanitization.

#### C. E2E Test Suites (`tests/e2e/runner.js`)
- All 8 suites (`tier1_auth.test.js`, `tier1_catalog.test.js`, `tier1_cart.test.js`, `tier1_order.test.js`, `tier1_health.test.js`, `tier2_boundary.test.js`, `tier3_interactions.test.js`, `tier4_scenarios.test.js`) execute end-to-end user journeys against `testClient.js`.
- `testClient.js` endpoints used: `/api/auth/*`, `/api/products/*`, `/api/cart/*`, `/api/orders/*`, `/api/health`.
- None of the E2E suites call `/api/payments/payhere/notify`.

---

### 1.3 Inspection of Frontend Currency & Copy Files

1. **`public/js/components/adminDashboard.js:540`**:
   - Current: `<label for="form-prod-price">Retail Price (USD) *</label>`
   - Discrepancy: Retains `(USD)` text in admin product creation/editing modal.
2. **`public/js/components/catalog.js:50-54 & 102-105`**:
   - Current labels: `Under Rs. 5,000` (value `"0-50"`), `Rs. 5,000 – Rs. 10,000` (value `"50-100"`).
   - In `store.js:482-490`: value `"0-50"` queries `minPrice: 0, maxPrice: 50`.
   - Seed data prices: `89.00`, `290.00`, `65.00`.
   - Discrepancy: Filtering by "Under Rs. 5,000" hides Rs. 89.00 products because query boundary is 0–50.
3. **`public/index.html:109`**:
   - Current: `<span class="hero-perk-badge">✨ Free Islandwide Shipping Over Rs. 5,000.00</span>`
   - In `store.js:592`: `const shipping = subtotal >= 50.0 || subtotal === 0 ? 0.0 : 5.99;`
   - In `cartDrawer.js:37`: `const freeShippingThreshold = 50.0;`
   - Discrepancy: Marketing banner states Rs. 5,000.00 while cart threshold triggers at Rs. 50.00.

---

## 2. Logic Chain

1. **Idempotency & State Machine Flaw in `paymentController.js`**:
   - *Observation*: Lines 71–78 only intercept `order.paymentStatus === 'paid' && Number(status_code) === 2`.
   - *Step 1*: When status `-1` or `-2` is replayed on an already-failed order, line 72 evaluates to false. Execution reaches lines 105–114 and increments product stock repeatedly.
   - *Step 2*: When status `-1` or `-2` arrives delayed for an already-paid order, line 72 evaluates to false. Execution reaches line 82 and overwrites `paymentStatus = 'failed'`, cancelling the order and refunding stock.
   - *Deduction*: Adding two explicit guard conditions in `paymentController.js` completely resolves both failures:
     1. If `order.paymentStatus === 'paid'`, reject any state changes and return HTTP 200.
     2. If incoming status is `-1` or `-2` and the order was already failed/cancelled, return HTTP 200 without executing stock rollback.
     3. Restrict stock compensation to only execute on the initial transition to failed (`!wasAlreadyFailed`).

2. **Zero Regression Blast Radius on Existing Backend Suites**:
   - *Observation*: Global grep confirmed that only `payhere_webhook.test.js`, `adversarial_payhere_stress.test.js`, and `unit/payhere.test.js` touch `/api/payments/`.
   - *Step 1*: `tests/order.test.js` and `tests/integration/checkout_payment.test.js` interact exclusively with `orderController.js` (`POST /api/orders/checkout`) and mock card/COD/bank transfer flows.
   - *Step 2*: In `tests/integration/payhere_webhook.test.js`, line 319 asserts `expect(res.body.message).toContain('already marked as paid')`. Keeping this exact substring in the HTTP 200 response ensures 100% compliance with existing webhook tests.
   - *Deduction*: The proposed changes to `paymentController.js` cannot induce any regressions in `order.test.js`, `admin.test.js`, `checkout_payment.test.js`, or other backend suites.

3. **Zero Regression Blast Radius on Frontend Currency Updates**:
   - *Observation*: Changing `Retail Price (USD) *` to `Retail Price (LKR) *` in `adminDashboard.js:540`.
   - *Step 1*: `tests/admin.test.js` checks component class and export signatures, not the label text.
   - *Step 2*: `tests/integration/checkout_adversarial.test.js:413` checks for the absence of `$\d+`. Removing `USD` further satisfies currency cleanliness.
   - *Step 3*: Updating `catalog.js` dropdown labels to `Under Rs. 50.00`, `Rs. 50.00 – Rs. 100.00`, etc. aligns the UI with `store.js` query boundaries (`0-50`, `50-100`). No test asserts the literal string "Under Rs. 5,000".
   - *Step 4*: Updating `index.html:109` to `Over Rs. 50.00` matches `store.js:592` (`subtotal >= 50.0`). No test asserts the literal string "5,000.00".
   - *Deduction*: Modifying these frontend labels eliminates user discrepancies with zero regression impact on automated tests.

---

## 3. Caveats

1. **Read-Only Scope**: In strict accordance with the explorer archetype, no source files or test scripts were edited during this investigation.
2. **Backward Compatibility for Duplicate Status 2 Message**: `tests/integration/payhere_webhook.test.js` specifically asserts that `res.body.message` contains `'already marked as paid'`. The implementation worker must ensure this exact substring is maintained in the response payload when status 2 is replayed.
3. **Database Seed Price Scale**: Catalog product prices in `seedProducts.js` are configured in the tens and hundreds (`89.00`, `290.00`). Updating the dropdown labels in `catalog.js` to match this scale (`Under Rs. 50.00`, `Rs. 50.00 – Rs. 100.00`) is cleaner and lower risk than re-scaling the entire seed dataset and database prices.

---

## 4. Conclusion & Specific Recommendations for Implementation Worker

The Iteration 2 implementation worker should apply the following targeted changes:

### 1. `src/controllers/paymentController.js` (Lines 71–115)
Replace the existing idempotency and failure blocks with:

```javascript
    // 4. Idempotency & State Machine Guards
    // A) Prevent downgrading an already-paid order or re-processing duplicate success
    if (order.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message: Number(status_code) === 2
          ? 'Order already marked as paid'
          : 'Order already paid; ignoring stale or conflicting status notification',
        orderId: order.orderNumber,
        paymentStatus: 'paid',
      });
    }

    // B) Prevent duplicate inventory rollback on replayed status -1 / -2
    const wasAlreadyFailed = order.paymentStatus === 'failed' || order.status === 'cancelled';
    if (newPaymentStatus === 'failed' && wasAlreadyFailed) {
      return res.status(200).json({
        success: true,
        message: 'Order already marked as failed/cancelled; duplicate notification ignored',
        orderId: order.orderNumber,
        paymentStatus: 'failed',
      });
    }

    // 5. Update Order payment status and fields
    order.paymentMethod = 'payhere';
    order.paymentStatus = newPaymentStatus;
    order.gatewayTransactionId = payment_id || order.gatewayTransactionId || `PH-VA-${order_id}`;
    order.gatewayHash = md5sig || order.gatewayHash;

    if (!order.payment) {
      order.payment = {};
    }
    order.payment.method = 'payhere';
    order.payment.status = newPaymentStatus;
    order.payment.transactionId = order.gatewayTransactionId;
    order.payment.payherePaymentId = payment_id || null;
    order.payment.payhereHash = md5sig || null;
    order.payment.gatewayTransactionId = order.gatewayTransactionId;
    order.payment.gatewayHash = order.gatewayHash;

    if (newPaymentStatus === 'paid') {
      order.payment.paidAt = new Date();
      order.status = 'processing';
      order.paymentNotes = `Paid via PayHere gateway (${method || 'Card'}). Payment ID: ${payment_id || 'N/A'}`;
    } else if (newPaymentStatus === 'failed') {
      order.status = 'cancelled';
      order.paymentNotes = `PayHere payment failed or canceled: ${status_message || 'Status ' + status_code}`;

      // Stock rollback compensation ONLY if not already failed/cancelled
      if (!wasAlreadyFailed && order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (item.product && item.quantity) {
            await Product.findByIdAndUpdate(item.product, {
              $inc: { stock: item.quantity },
            });
          }
        }
      }
    } else {
      order.paymentNotes = `PayHere payment pending review. Status code: ${status_code}`;
    }
```

### 2. `public/js/components/adminDashboard.js` (Line 540)
Change:
```html
<label for="form-prod-price">Retail Price (USD) *</label>
```
To:
```html
<label for="form-prod-price">Retail Price (LKR) *</label>
```

### 3. `public/js/components/catalog.js` (Lines 50–54 & Lines 102–105)
Change option labels and `priceLabels` map to:
```javascript
      const priceLabels = {
        '0-50': 'Under Rs. 50.00',
        '50-100': 'Rs. 50.00 – Rs. 100.00',
        '100-250': 'Rs. 100.00 – Rs. 250.00',
        '250-9999': 'Rs. 250.00+',
      };
```
and:
```html
      <option value="all" ${priceRange === 'all' ? 'selected' : ''}>All Prices</option>
      <option value="0-50" ${priceRange === '0-50' ? 'selected' : ''}>Under Rs. 50.00</option>
      <option value="50-100" ${priceRange === '50-100' ? 'selected' : ''}>Rs. 50.00 – Rs. 100.00</option>
      <option value="100-250" ${priceRange === '100-250' ? 'selected' : ''}>Rs. 100.00 – Rs. 250.00</option>
      <option value="250-9999" ${priceRange === '250-9999' ? 'selected' : ''}>Rs. 250.00+</option>
```

### 4. `public/index.html` (Line 109)
Change:
```html
<span class="hero-perk-badge">✨ Free Islandwide Shipping Over Rs. 5,000.00</span>
```
To:
```html
<span class="hero-perk-badge">✨ Free Islandwide Shipping Over Rs. 50.00</span>
```

---

## 5. Verification Matrix for Implementation Worker in Iteration 2

The implementation worker must execute and satisfy the following verification matrix:

| Tier | Test Suite File | Command | Scope / Key Invariants | Expected Result |
|------|-----------------|---------|------------------------|-----------------|
| **T1: Targeted Stress** | `tests/adversarial_payhere_stress.test.js` | `npx jest tests/adversarial_payhere_stress.test.js` | Duplicate status -1 does NOT roll back stock twice (stock stays 50); Stale status -1 does NOT downgrade paid order (remains 'paid', stock 48); MD5 tamper & spoofing checks | **13/13 tests pass** (0 failures) |
| **T1: Webhook Integration** | `tests/integration/payhere_webhook.test.js` | `npx jest tests/integration/payhere_webhook.test.js` | Status 2 transitions to 'paid'; Status -1 transitions to 'failed'; Duplicate status 2 returns 'already marked as paid'; 400 signature; 404 order not found | **7/7 tests pass** |
| **T1: PayHere Unit** | `tests/unit/payhere.test.js` | `npx jest tests/unit/payhere.test.js` | Uppercase 32-hex MD5 formula; 2-decimal formatting (`.00`); status code mapping | **15/15 tests pass** |
| **T1: Checkout Payment** | `tests/integration/checkout_payment.test.js` | `npx jest tests/integration/checkout_payment.test.js` | COD checkout (pending status); Bank Transfer checkout with confirmation; missing confirmation rejected (400); Admin status update | **5/5 tests pass** |
| **T1: Checkout Adversarial** | `tests/integration/checkout_adversarial.test.js` | `npx jest tests/integration/checkout_adversarial.test.js` | Non-boolean bankTransferConfirmed rejected; zero hardcoded `$`; formatPrice edge values; admin RBAC 403 | **14/14 tests pass** |
| **T2: Full Jest Regression** | Full Jest Suite (`tests/*.test.js`, `tests/unit/`, `tests/integration/`) | `npm test` | All 17 Jest test suites (`order.test.js`, `admin.test.js`, `cart.test.js`, `catalog.test.js`, `auth.test.js`, `concurrency.test.js`, etc.) | **17/17 suites pass, 238+ tests pass, Exit 0** |
| **T3: E2E Regression** | `tests/e2e/runner.js` | `npm run test:e2e` | 8 Opaque-Box E2E suites: `tier1_auth`, `tier1_catalog`, `tier1_cart`, `tier1_order`, `tier1_health`, `tier2_boundary`, `tier3_interactions`, `tier4_scenarios` | **8/8 suites pass, 56/56 tests pass, Exit 0** |
| **T4: Static UI Verification** | `public/js/components/adminDashboard.js` | Text search | Confirm `Retail Price (USD)` is replaced with `Retail Price (LKR)` | **0 occurrences of 'USD' in admin form** |
| **T4: Static UI Verification** | `public/index.html` | Text search | Confirm free shipping badge says `Over Rs. 50.00` | **Matches store.js shipping threshold** |
| **T4: Static UI Verification** | `public/js/components/catalog.js` | Code inspection | Confirm dropdown option values `0-50`, `50-100`, etc. match labels `Under Rs. 50.00`, `Rs. 50.00 – Rs. 100.00` | **Values match labels and store.js** |

### Invalidation Conditions
- Any occurrence of `Expected: 50, Received: 52` in Jest.
- Any occurrence of `Expected: "paid", Received: "failed"` in Jest.
- Any exit code other than `0` for `npm test` or `npm run test:e2e`.
- Any regression in `tests/integration/payhere_webhook.test.js` caused by altered message strings.
