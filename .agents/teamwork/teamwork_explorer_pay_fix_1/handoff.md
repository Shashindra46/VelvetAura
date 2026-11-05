# Handoff Report — PayHere Webhook Idempotency & Inventory Rollback Remediation

**Agent**: `teamwork_explorer_pay_fix_1`  
**Role**: teamwork_explorer (Read-only Investigation & Synthesis)  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_fix_1\`  
**Target File**: `src/controllers/paymentController.js`  
**Test Suite**: `tests/adversarial_payhere_stress.test.js`  
**Date**: 2026-11-05T09:58:00Z  
**Parent Agent**: `6b4fd1bc-f6a8-4599-80c7-b21287b6826b`  
**Handoff Type**: Hard (Investigation & Strategy Complete)  

---

## Executive Summary

The investigation into the two test failures in `tests/adversarial_payhere_stress.test.js` has isolated the exact root cause in `src/controllers/paymentController.js` lines 71–78 and 105–114.

1. **Failure 1 (Double Inventory Rollback)**: The controller only checks idempotency for `order.paymentStatus === 'paid' && Number(status_code) === 2`. Repeated or replayed status `-1` (canceled) or `-2` (failed) webhooks bypass this check, evaluate `else if (newPaymentStatus === 'failed')`, and execute stock increment (`Product.findByIdAndUpdate(..., { $inc: { stock: item.quantity } })`) repeatedly, turning stock 50 into 52.
2. **Failure 2 (Stale Downgrade of Paid Orders)**: Out-of-order or delayed cancelation notifications (status `-1` / `-2`) bypass the `Number(status_code) === 2` check and overwrite an already `paid` order to `failed`/`cancelled`, illegally restocking already sold merchandise.

This report formulates the precise 2-stage guard strategy and provides exact before-and-after code modifications for `src/controllers/paymentController.js` and a patch file (`proposed_paymentController.patch`).

---

## 1. Observation

### 1.1 Verbatim Jest Test Failures
From `tests/adversarial_payhere_stress.test.js`:
```
FAIL tests/adversarial_payhere_stress.test.js
  ● Adversarial PayHere & Webhook Stress Suite › 2. Webhook Callback IPN Adversarial Tests › CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback

    expect(received).toBe(expected) // Object.is equality

    Expected: 50
    Received: 52

      659 |       // If the stock increases to 52, double inventory rollback bug is empirically proven!
      660 |       const stockAfterReplay = (await Product.findById(testProduct1._id)).stock;
    > 661 |       expect(stockAfterReplay).toBe(baselineStock);
          |                                ^
      662 |     });

      at Object.toBe (tests/adversarial_payhere_stress.test.js:661:32)

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
      720 |   });

      at Object.toBe (tests/adversarial_payhere_stress.test.js:717:40)

Test Suites: 1 failed, 15 passed, 16 total
Tests:       2 failed, 236 passed, 238 total
```

### 1.2 Code Inspection: `src/controllers/paymentController.js`
Lines 69–118 in `src/controllers/paymentController.js`:
```javascript
69:    const newPaymentStatus = mapPayHereStatus(status_code);
70:
71:    // 4. Idempotency check: if already marked 'paid' and incoming is status 2 (success)
72:    if (order.paymentStatus === 'paid' && Number(status_code) === 2) {
73:      return res.status(200).json({
74:        success: true,
75:        message: 'Order already marked as paid',
76:        orderId: order.orderNumber,
77:      });
78:    }
79:
80:    // 5. Update Order payment status and fields
81:    order.paymentMethod = 'payhere';
82:    order.paymentStatus = newPaymentStatus;
83:    order.gatewayTransactionId = payment_id || order.gatewayTransactionId || `PH-VA-${order_id}`;
84:    order.gatewayHash = md5sig || order.gatewayHash;
...
101:   } else if (newPaymentStatus === 'failed') {
102:     order.status = 'cancelled';
103:     order.paymentNotes = `PayHere payment failed or canceled: ${status_message || 'Status ' + status_code}`;
104:
105:     // Stock rollback compensation for canceled orders
106:     if (order.items && order.items.length > 0) {
107:       for (const item of order.items) {
108:         if (item.product && item.quantity) {
109:           await Product.findByIdAndUpdate(item.product, {
110:             $inc: { stock: item.quantity },
111:           });
112:         }
113:       }
114:     }
115:   }
```

### 1.3 Key Contract & Test Requirements
- `tests/integration/payhere_webhook.test.js:319`:
  - `expect(res.body.message).toContain('already marked as paid')` on duplicate status 2.
- `tests/adversarial_payhere_stress.test.js:587`:
  - `expect(res2.body.message).toContain('already marked as paid')` on duplicate status 2.
- `tests/adversarial_payhere_stress.test.js:656, 661`:
  - Webhook returns HTTP 200 on duplicate status -1 / -2; product stock remains at baseline (50), not 52.
- `tests/adversarial_payhere_stress.test.js:710, 717-718`:
  - Webhook returns HTTP 200 on stale status -1 for an order already marked `paymentStatus === 'paid'`; order remains `paid`, stock remains `baselineStock - orderedQty`.

---

## 2. Logic Chain

1. **Defect 1: Duplicate status -1/-2 replay causes phantom inventory**:
   - *Premise*: When a customer cancels or fails payment, `mapPayHereStatus(status_code)` resolves to `'failed'`.
   - *Premise*: First webhook notification arrives: `order.paymentStatus` transitions from `'pending'` to `'failed'`, `order.status` transitions from `'pending'` to `'cancelled'`, and lines 106–114 restore product inventory (+2).
   - *Inference from Obs 1.2*: When the gateway retries or network replays the exact same status `-1` webhook, `order.paymentStatus === 'paid'` evaluates to `false`. Line 72 is bypassed.
   - *Inference*: Execution falls into line 101 (`newPaymentStatus === 'failed'`), which evaluates to `true`.
   - *Inference*: Lines 106–114 execute again, invoking `Product.findByIdAndUpdate(..., { $inc: { stock: 2 } })`.
   - *Result*: Stock becomes 48 + 2 + 2 = 52. Verbatim assertion error: `Expected: 50, Received: 52`.

2. **Defect 2: Stale status -1 downgrades paid orders**:
   - *Premise*: An order was successfully authorized with status 2, setting `order.paymentStatus = 'paid'` and deducting inventory.
   - *Inference from Obs 1.2*: When a delayed, out-of-order status `-1` notification arrives (e.g. from an aborted previous checkout attempt or network lag), line 72 checks `Number(status_code) === 2`. Because `-1 !== 2`, line 72 evaluates to `false`.
   - *Inference*: Execution proceeds to line 82 (`order.paymentStatus = 'failed'`), line 102 (`order.status = 'cancelled'`), and lines 106–114.
   - *Result*: The paid order is cancelled, and inventory is released back into the catalog. Verbatim assertion error: `Expected: "paid", Received: "failed"`.

3. **Remediation Inferences**:
   - **Step A (Terminal Paid Guard)**: If `order.paymentStatus === 'paid'`, the order has reached a terminal paid state. No incoming notification (status 2, -1, -2, 0) should mutate the order or change inventory.
     - If `Number(status_code) === 2`: Return HTTP 200 with `message: 'Order already marked as paid'`.
     - If `Number(status_code) !== 2`: Return HTTP 200 with `message: 'Order already paid; ignoring stale or conflicting status notification'`.
   - **Step B (Terminal Failed/Cancelled Guard)**: Before processing status updates, inspect if the order was already failed or cancelled:
     `const wasAlreadyFailed = order.paymentStatus === 'failed' || order.status === 'cancelled';`
     - If `newPaymentStatus === 'failed' && wasAlreadyFailed`: Return HTTP 200 with `message: 'Order already marked as failed/cancelled; duplicate notification ignored'`.
   - **Step C (Defense-in-Depth Stock Rollback Guard)**: Wrap the inventory rollback loop in `if (!wasAlreadyFailed && order.items && order.items.length > 0)` so that stock compensation executes strictly on the initial transition.

---

## 3. Caveats

1. **Read-only Investigation**: In accordance with the Explorer archetype rules, no changes have been committed directly to `src/controllers/paymentController.js`. The implementation must be applied by the designated implementation worker.
2. **Order Schema Consistency**: `Order.js` pre-validate hook maintains two-way synchronization between top-level `paymentStatus` and nested `payment.status`. By returning early in guards 4a and 4b, neither `order.save()` nor pre-hooks run, ensuring zero mutation of timestamps, notes, or statuses on replayed webhooks.
3. **No Caveats on Root Cause**: The failure modes, line numbers, and test assertions are 100% reproducible and unambiguous.

---

## 4. Conclusion & Precise Code Modifications

### 4.1 Target File & Exact Snippet Replacement

**Target File**: `g:\VelvetAura\src\controllers\paymentController.js`  
**Patch Location 1**: Replace lines 71–78 (the idempotency check) with the unified terminal state guards.  
**Patch Location 2**: Update line 106 to guard the rollback loop with `!wasAlreadyFailed`.

#### Before (`src/controllers/paymentController.js:71-78`):
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

#### After (`src/controllers/paymentController.js:71-98`):
```javascript
    // 4. Idempotency and State Transition Guards

    // 4a. If order is already paid, ignore duplicate success or late/stale cancel/fail/pending notifications
    if (order.paymentStatus === 'paid') {
      return res.status(200).json({
        success: true,
        message:
          Number(status_code) === 2
            ? 'Order already marked as paid'
            : 'Order already paid; ignoring stale or conflicting status notification',
        orderId: order.orderNumber,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
      });
    }

    // 4b. If order is already failed or cancelled, ignore duplicate failure callbacks
    // to prevent double inventory rollback and redundant updates
    const wasAlreadyFailed =
      order.paymentStatus === 'failed' || order.status === 'cancelled';
    if (newPaymentStatus === 'failed' && wasAlreadyFailed) {
      return res.status(200).json({
        success: true,
        message:
          'Order already marked as failed/cancelled; duplicate notification ignored',
        orderId: order.orderNumber,
        orderNumber: order.orderNumber,
        paymentStatus: order.paymentStatus,
      });
    }
```

#### Before (`src/controllers/paymentController.js:105-106`):
```javascript
      // Stock rollback compensation for canceled orders
      if (order.items && order.items.length > 0) {
```

#### After (`src/controllers/paymentController.js:125-126`):
```javascript
      // Stock rollback compensation strictly on initial transition to failed/cancelled
      if (!wasAlreadyFailed && order.items && order.items.length > 0) {
```

### 4.2 Patch Artifact
A complete unified diff patch has also been saved to:  
`g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_fix_1\proposed_paymentController.patch`

---

## 5. Verification Method

Once the implementation worker applies this fix to `src/controllers/paymentController.js`:

1. **Verify Adversarial PayHere Test Suite**:
   ```powershell
   npx jest tests/adversarial_payhere_stress.test.js
   ```
   *Expected Result*: All 13 tests pass (100% pass rate, exit code 0).
   - Test `CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback` passes with `stockAfterReplay === 50`.
   - Test `STALE WEBHOOK CHALLENGE: stale status -1 on an already paid order must NOT corrupt paid order or restore stock` passes with `finalOrder.paymentStatus === 'paid'` and `finalStock === 48`.

2. **Verify Full PayHere Integration Suite**:
   ```powershell
   npx jest tests/integration/payhere_webhook.test.js
   ```
   *Expected Result*: All 7 integration tests pass.

3. **Verify Complete Test Suite**:
   ```powershell
   npm test
   ```
   *Expected Result*: All 16 test suites pass, 238/238 tests pass.
