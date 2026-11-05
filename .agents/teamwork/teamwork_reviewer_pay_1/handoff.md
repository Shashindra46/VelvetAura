# Handoff Report — Frontend Currency & Checkout Overhaul Review

**Agent**: `teamwork_reviewer_pay_1`  
**Roles**: reviewer, critic  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_reviewer_pay_1\`  
**Date**: 2026-11-05T09:45:00Z  
**Parent Agent**: `6b4fd1bc-f6a8-4599-80c7-b21287b6826b`  
**Handoff Type**: Hard (Review Complete)  
**Verdict**: **`REQUEST_CHANGES`**

---

## Review Summary

**Verdict**: **`REQUEST_CHANGES`**

The implementation of the LKR currency formatting (`Rs. X,XXX.XX`), the removal of mock credit card inputs, the addition of Cash on Delivery (COD) and Direct Bank Transfer with Commercial Bank of Ceylon details, transfer confirmation validation, and dark-mode glassmorphic styling was largely achieved. However, the work product **CANNOT BE APPROVED** due to:
1. **A failing test suite during `npm test`** (`tests/adversarial_payhere_stress.test.js`) where 2 critical tests failed due to webhook idempotency flaws (double inventory rollback on duplicate -1 notifications and stale cancellation webhooks downgrading already-paid orders).
2. **Stale USD label** in the Admin Dashboard product form (`Retail Price (USD) *`).
3. **100x discrepancy** between the Catalog price filter dropdown labels (`Under Rs. 5,000`, `Rs. 5,000 – Rs. 10,000`) and the underlying numeric query bounds (`0-50`, `50-100`) against database product prices (`89.00`).
4. **Marketing banner vs. Cart calculation inconsistency** where `index.html` claims free shipping over `Rs. 5,000.00`, but `store.js` and `cartDrawer.js` enforce a `50.00` threshold.
5. **Worker Handoff Attestation Discrepancy**: Worker reported `15 passed, 15 total` test suites with `100% pass rate`, whereas executing `npm test` runs 16 suites and fails with exit code 1.

---

## 1. Observation

Direct examination and execution across the codebase revealed the following exact facts:

### 1.1 Automated Test Execution Failure
- **Command Executed**: `npm test` (`jest --runInBand --detectOpenHandles --forceExit`)
- **Execution Result**: Exited with **Code 1**
  ```
  Test Suites: 1 failed, 15 passed, 16 total
  Tests:       2 failed, 236 passed, 238 total
  Snapshots:   0 total
  Time:        112.599 s
  ```
- **Failing Suite**: `tests/adversarial_payhere_stress.test.js`
- **Verbatim Error 1 (Double Inventory Rollback on Duplicate Webhook)**:
  ```
  ● Adversarial PayHere & Webhook Stress Suite › 2. Webhook Callback IPN Adversarial Tests › CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback

    expect(received).toBe(expected) // Object.is equality

    Expected: 50
    Received: 52

      659 |       // If the stock increases to 52, double inventory rollback bug is empirically proven!
      660 |       const stockAfterReplay = (await Product.findById(testProduct1._id)).stock;
    > 661 |       expect(stockAfterReplay).toBe(baselineStock);
          |                                ^
      662 |     });
  ```
- **Verbatim Error 2 (Stale Cancellation Overwriting Paid Order)**:
  ```
  ● Adversarial PayHere & Webhook Stress Suite › 2. Webhook Callback IPN Adversarial Tests › STALE WEBHOOK CHALLENGE: stale status -1 on an already paid order must NOT corrupt paid order or restore stock

    expect(received).toBe(expected) // Object.is equality

    Expected: "paid"
    Received: "failed"

      715 |
      716 |       // An order that is already paid should NOT be downgraded to failed by a stale -1 notification
    > 717 |       expect(finalOrder.paymentStatus).toBe('paid');
          |                                        ^
      718 |       expect(finalStock).toBe(baselineStock - orderedQty);
      719 |     });
  ```

### 1.2 Root Cause in Webhook Handler (`src/controllers/paymentController.js`)
- Lines 71–78:
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
- Lines 101–114:
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
- **Defects Observed**:
  1. If `order.paymentStatus === 'paid'`, incoming status `-1` is not blocked; it downgrades the order to `failed`/`cancelled` and increments inventory.
  2. If an order was already marked `failed` (e.g., initial cancellation), a repeated or retried webhook notification with status `-1` increments inventory a second time.

### 1.3 Stale Currency Label in Admin Dashboard
- **File**: `public/js/components/adminDashboard.js`, Line 540:
  ```html
  539: <div class="form-group">
  540:   <label for="form-prod-price">Retail Price (USD) *</label>
  541:   <input type="number" step="0.01" min="0" id="form-prod-price" name="price" class="glass-input" required placeholder="0.00" value="${prod.price !== undefined ? prod.price : ''}" />
  542: </div>
  ```
- **Defect**: Explicit `(USD)` text remains in the Admin Edit/Add product form label.

### 1.4 Price Filter Scale Discrepancy in Catalog
- **File**: `public/js/components/catalog.js`, Lines 50–54 & 102–105:
  ```html
  <option value="0-50" ${priceRange === '0-50' ? 'selected' : ''}>Under Rs. 5,000</option>
  <option value="50-100" ${priceRange === '50-100' ? 'selected' : ''}>Rs. 5,000 – Rs. 10,000</option>
  <option value="100-250" ${priceRange === '100-250' ? 'selected' : ''}>Rs. 10,000 – Rs. 25,000</option>
  <option value="250-9999" ${priceRange === '250-9999' ? 'selected' : ''}>Rs. 25,000+</option>
  ```
- **File**: `public/js/store.js`, Lines 483–489:
  ```javascript
  if (rangeStr === '0-50') {
    this.setState('catalog', { priceRange: rangeStr, minPrice: 0, maxPrice: 50, page: 1 });
  } else if (rangeStr === '50-100') {
    this.setState('catalog', { priceRange: rangeStr, minPrice: 50, maxPrice: 100, page: 1 });
  }
  ```
- **Database Product Prices**: In `src/data/seedProducts.js`, prices are stored as `89.00`, `290.00`, etc., and rendered as `Rs. 89.00`, `Rs. 290.00`.
- **Defect**: Selecting `Under Rs. 5,000` sets query bounds `minPrice: 0, maxPrice: 50`, completely hiding products priced at `Rs. 89.00`. Selecting `Rs. 5,000 – Rs. 10,000` queries `50 <= price <= 100`, returning the `Rs. 89.00` product. The UI labels and backend query parameters disagree by a factor of 100x.

### 1.5 Shipping Threshold Copy vs. Logic Inconsistency
- **File**: `public/index.html`, Line 109:
  `<span class="hero-perk-badge">✨ Free Islandwide Shipping Over Rs. 5,000.00</span>`
- **File**: `public/js/components/cartDrawer.js`, Line 37:
  `freeShippingThreshold = 50.0`
- **File**: `public/js/store.js`, Line 592:
  `const shipping = subtotal >= 50.0 || subtotal === 0 ? 0.0 : 5.99;`
- **Defect**: The hero banner advertises free shipping over Rs. 5,000.00, but the cart meter and financial calculator trigger free shipping at Rs. 50.00.

### 1.6 Successful Implementations Directly Verified
- `public/js/components/base.js`: `formatPrice` correctly renders `Rs. X,XXX.XX` with commas and two decimals.
- `public/js/components/checkoutModal.js`:
  - Complete removal of mock credit card input fields and sandbox buttons.
  - Radio options for COD and Direct Bank Transfer.
  - Corporate bank details displayed: Commercial Bank of Ceylon, Colombo Fort Premier Branch, VelvetAura (Pvt) Ltd, Account `1000 8924 7712`, LKR.
  - Mandatory checkbox `#bank-transfer-confirm-checkbox` prevents submission if unchecked with inline error.
  - `src/controllers/orderController.js` validates `bankTransferConfirmed` and rejects with HTTP 400 if false.
- `public/css/components.css`: Contains complete dark-mode glassmorphic CSS rules for `.payment-options-grid`, `.payment-option-card`, `.bank-transfer-details-box`, `.method-badge`, `.payment-badge`.
- `public/js/components/adminDashboard.js` & `accountView.js`: Both render payment method and payment status badges.
- `npm run test:e2e`: All 8 test suites (56 tests) passed.

---

## 2. Logic Chain

1. **Test Failure Invalidates Approval**:
   - *Observation*: `npm test` exited with Code 1; 2 tests in `tests/adversarial_payhere_stress.test.js` failed.
   - *Logic*: Per project protocol, any automated test suite failure is a blocker. Furthermore, the worker handoff report claimed that `npm test` passed 100% across all 15 suites (225 tests), which failed to account for this active test suite.
   - *Deduction*: The work product cannot be approved until `npm test` passes completely without errors.

2. **Inventory Corruption Under Gateway Retries**:
   - *Observation*: `CRITICAL IDEMPOTENCY CHALLENGE` received 52 instead of 50 for stock after replaying a status `-1` webhook.
   - *Logic*: In production e-commerce, payment gateways resend webhooks until receiving a 200 ACK, or network retries deliver duplicates. Because `paymentController.js` unconditionally runs `$inc: { stock: item.quantity }` every time a failed webhook arrives without checking if the order is already `failed` or `cancelled`, inventory will falsely inflate with every retransmission.
   - *Deduction*: This is a high-severity bug in payment handling and inventory accounting.

3. **Paid Order Vulnerability to Out-of-Order Webhooks**:
   - *Observation*: `STALE WEBHOOK CHALLENGE` showed `finalOrder.paymentStatus` transitioned from `paid` to `failed`.
   - *Logic*: When an order has already completed and been marked `paid`, a delayed or stale status `-1` IPN notification must not downgrade the order or refund inventory.
   - *Deduction*: State transition guards must prevent already `paid` orders from being mutated to `failed`.

4. **UI Currency & Filter Discrepancies**:
   - *Observation*: `adminDashboard.js:540` contains `Retail Price (USD) *`. `catalog.js` labels `0-50` as `Under Rs. 5,000`, and `index.html` claims shipping threshold is `Rs. 5,000.00` while `store.js` uses `50.00`.
   - *Logic*: The dispatch specifically mandates "Verify absence of stale USD symbols" and "support Sri Lankan Rupees across the entire application". Retaining `(USD)` in admin forms and displaying price filters that hide products due to a 100x mismatch between label and numeric query boundaries breaks user experience.

---

## 3. Caveats

- The reviewer did NOT modify any application or test code, strictly abiding by the review-only constraint.
- The unit and integration tests written by the worker (`tests/unit/payhere.test.js`, `tests/integration/checkout_payment.test.js`, `tests/integration/payhere_webhook.test.js`) are well-structured and pass individually. The failures occur when the adversarial stress suite tests gateway retry edge cases.

---

## 4. Findings & Actionable Remediations

### Finding 1: Webhook Idempotency & Stock Rollback Flaw (Critical / Blocker)
- **Where**: `src/controllers/paymentController.js`, lines 71–118
- **Why**:
  1. Status `-1` duplicates cause double stock increments.
  2. Status `-1` arriving on an already-paid order corrupts the order to `failed` and erroneously restores stock.
- **Suggestion**:
  In `handlePayHereNotify`:
  - If `order.paymentStatus === 'paid'`, reject any status transition to `failed` or `pending` (return 200 with message `'Order is already marked as paid'`).
  - If `order.paymentStatus === 'failed'` or `order.status === 'cancelled'`, reject duplicate failed transitions and do NOT increment stock again (return 200 with message `'Order is already marked as failed'`).

### Finding 2: Stale USD Label in Admin Product Form (Major)
- **Where**: `public/js/components/adminDashboard.js`, line 540
- **Why**: Displays `Retail Price (USD) *` instead of `Retail Price (LKR) *` or `Retail Price (Rs.) *`.
- **Suggestion**:
  Change `<label for="form-prod-price">Retail Price (USD) *</label>` to `<label for="form-prod-price">Retail Price (LKR) *</label>`.

### Finding 3: Catalog Price Filter Label vs Query Mismatch (Major)
- **Where**: `public/js/components/catalog.js`, lines 50–54 & lines 102–105
- **Why**: Labels `Under Rs. 5,000` for value `0-50`, causing product prices like `Rs. 89.00` to be hidden under the `Under Rs. 5,000` filter.
- **Suggestion**:
  Either align the option values in `catalog.js` and `store.js` to match the actual price scale (e.g. `Under Rs. 100.00`, `Rs. 100.00 – Rs. 250.00`, etc.), or if 5,000–10,000 is desired, update the numeric filtering in `store.js` and database prices accordingly.

### Finding 4: Shipping Threshold Discrepancy (Minor)
- **Where**: `public/index.html` line 109 vs `public/js/store.js` line 592
- **Why**: Hero banner states `Over Rs. 5,000.00` while logic calculates threshold at `50.00`.
- **Suggestion**: Align `public/index.html` to reflect the actual configured threshold (or update the threshold in `store.js`, `Cart.js`, and `cartService.js`).

---

## 5. Verification Method

To independently verify after remediation:

1. **Execute Full Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: All 16 test suites pass, 238 tests pass, 0 failures.

2. **Execute E2E Test Suite**:
   ```powershell
   npm run test:e2e
   ```
   *Expected Result*: All 8 test suites pass, 56 tests pass, 0 failures.

3. **Verify Absence of Stale Currency**:
   ```powershell
   grep -rn "USD" public/
   ```
   *Expected Result*: No occurrences of `USD` in labels or user-facing templates.

4. **Verify Catalog Price Filter**:
   Open catalog view, filter by `Under Rs. ...` or inspect `catalog.js` to confirm options correctly filter products in the database.
