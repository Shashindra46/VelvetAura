# Adversarial Challenge & Stress Report — PayHere Service & Webhook IPN

**Agent**: `teamwork_challenger_pay_1`  
**Roles**: critic, specialist (Empirical Challenger)  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_challenger_pay_1\`  
**Target Scope**: PayHere MD5 hash calculation, signature verification, and webhook IPN (`POST /api/payments/payhere/notify`)  
**Verdict**: **`REQUEST_CHANGES`**  
**Date**: 2026-11-05T09:44:00Z  
**Parent Agent**: `6b4fd1bc-f6a8-4599-80c7-b21287b6826b`  
**Handoff Type**: Hard (Challenge Complete)  

---

## Challenge Summary

**Overall risk assessment**: **CRITICAL**

While the PayHere MD5 hash generation, formatting (`.00` precision, uppercase hex), tamper sensitivity (single bit/char flips), and spoofed signature rejection (HTTP 400) are rigorously implemented in `src/services/payhereService.js`, the webhook IPN controller in `src/controllers/paymentController.js` suffers from **two critical idempotency and state machine flaws**:
1. **Critical Inventory Corruption via Duplicate/Replayed Canceled/Failed Webhooks**: The idempotency check at line 72 ONLY guards `order.paymentStatus === 'paid' && Number(status_code) === 2`. When PayHere retries or a network client replays status codes `-1` (canceled) or `-2` (failed), the handler executes stock compensation repeatedly (`Product.findByIdAndUpdate(..., { $inc: { stock: item.quantity } })`), creating phantom inventory in MongoDB.
2. **High Financial & Order State Degradation via Stale/Delayed Notifications**: An order already marked as `'paid'` (`paymentStatus === 'paid'`) is not protected against stale or delayed status `-1` or `-2` callbacks. Receiving a delayed cancelation notification downgrades the paid order to `'failed'`, marks it `'cancelled'`, and inflates product stock, leaving customer accounts out-of-sync with collected payments.

---

## 1. Observation

Direct examination and empirical test execution confirmed the following exact facts:

### 1. Implementation Code Inspection: `src/controllers/paymentController.js`
Lines 69–120 in `src/controllers/paymentController.js`:
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

### 2. Empirical Verification Execution
- Test harness file created: `tests/adversarial_payhere_stress.test.js`
- Execution Command: `npm test`
- Exit Code: `1` (Failure)
- Verbatim Jest failure output:
```
FAIL tests/adversarial_payhere_stress.test.js (6.212 s)
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
Snapshots:   0 total
Time:        99.477 s, estimated 162 s
```

---

## 2. Logic Chain

1. **Hash Generation & Tamper Sensitivity Robustness**:
   - *Observation*: Tests 1–5 in `tests/adversarial_payhere_stress.test.js` verified amounts `0`, `0.01`, `1000`, `12500.5`, `999999999.99`, negative number rejection, and single-bit flips across merchantId, orderId, amount, currency, secret, and status_code.
   - *Logic*: `src/services/payhereService.js` strictly enforces `toFixed(2)`, uppercase MD5 formatting, and case-insensitive comparison, yielding 100% rejection across all single-bit mutations and spoofed signatures (HTTP 400).
   - *Conclusion*: Cryptographic hash generation and signature verification logic fully complies with requirements.

2. **Root Cause Analysis: Vulnerability 1 (Double Inventory Rollback)**:
   - *Observation*: In `src/controllers/paymentController.js:72`, idempotency is restricted to `if (order.paymentStatus === 'paid' && Number(status_code) === 2)`.
   - *Logic*: When status `-1` or `-2` is received for an order with 2 items, `order.paymentStatus` becomes `'failed'`, `order.status` becomes `'cancelled'`, and product stock is incremented by +2 (e.g. from 48 to 50).
   - *Logic*: When a retry or replayed webhook arrives for the same order, `order.paymentStatus === 'paid'` is `false`. The idempotency check is completely bypassed.
   - *Logic*: Execution proceeds to line 101 (`else if (newPaymentStatus === 'failed')`), which evaluates to `true` again.
   - *Logic*: Lines 109–111 re-execute `$inc: { stock: item.quantity }`, incrementing stock by +2 again (from 50 to 52).
   - *Direct Evidence*: Verbatim test assertion error `Expected: 50, Received: 52`.

3. **Root Cause Analysis: Vulnerability 2 (Downgrade of Paid Orders)**:
   - *Observation*: An order already marked `paymentStatus === 'paid'` has `order.paymentStatus === 'paid'`.
   - *Logic*: When an out-of-order, delayed, or replayed status `-1` notification arrives, line 72 checks `Number(status_code) === 2`, which evaluates to `false` (since status is -1).
   - *Logic*: Execution continues to line 82 (`order.paymentStatus = 'failed'`), line 102 (`order.status = 'cancelled'`), and lines 109–111 (stock restored).
   - *Direct Evidence*: Verbatim test assertion error `Expected: "paid", Received: "failed"`.

---

## 3. Adversarial Challenges & Concrete Mitigations

### [CRITICAL] Challenge 1: Double Inventory Rollback on Duplicate / Replayed Status -1 / -2 Webhooks
- **Assumption Challenged**: The worker handoff claimed idempotency was implemented to prevent double mutations. The code assumed only successful payments (status 2) could be duplicated.
- **Attack Scenario**: Network packet retransmission, PayHere automatic server retry on slow response, or an attacker replaying an authentic status -1 callback payload.
- **Blast Radius**: Phantom inventory generation. Stock is incremented repeatedly on every duplicate notification, causing physical stockouts, unfulfillable orders, and accounting deficits.
- **Mitigation**:
  In `src/controllers/paymentController.js`, update the idempotency guard to acknowledge duplicate failed/canceled notifications if the order was already failed/canceled, and ensure stock compensation ONLY triggers on the initial transition to failed:
  ```javascript
  // Idempotency check:
  // A) Duplicate success notification
  if (order.paymentStatus === 'paid' && Number(status_code) === 2) {
    return res.status(200).json({
      success: true,
      message: 'Order already marked as paid',
      orderId: order.orderNumber,
    });
  }

  // B) Duplicate failed / canceled notification
  const wasAlreadyFailed = order.paymentStatus === 'failed' || order.status === 'cancelled';
  if (newPaymentStatus === 'failed' && wasAlreadyFailed) {
    return res.status(200).json({
      success: true,
      message: 'Order already marked as failed/cancelled; duplicate notification ignored',
      orderId: order.orderNumber,
    });
  }

  // C) Prevent downgrading an already paid order
  if (order.paymentStatus === 'paid' && newPaymentStatus !== 'paid') {
    return res.status(200).json({
      success: true,
      message: 'Order already paid; ignoring stale or conflicting status notification',
      orderId: order.orderNumber,
    });
  }
  ```
  And wrap the stock rollback in `if (!wasAlreadyFailed)`:
  ```javascript
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
  }
  ```

### [HIGH] Challenge 2: Stale Failed/Canceled Notification Corrupts Already Paid Orders
- **Assumption Challenged**: The system assumed status notifications arrive in strict linear sequence and that late notifications cannot mutate paid orders.
- **Attack Scenario**: Customer opens payment gateway in two browser tabs; cancels on tab 1 and completes on tab 2. Tab 2 notification arrives first, marking order 'paid'. Tab 1 cancelation arrives second.
- **Blast Radius**: Order is marked canceled and inventory is restored, even though the merchant captured the customer's funds.
- **Mitigation**: Once `order.paymentStatus === 'paid'`, reject or gracefully ignore any transitions to `'failed'` or `'pending'` as outlined in Mitigation 1 above.

---

## 4. Stress Test Results Matrix

| # | Stress Scenario | Expected Behavior | Actual Behavior | Result |
|---|----------------|-------------------|-----------------|--------|
| 1 | Hash format: 32 hex uppercase (`^[0-9A-F]{32}$`), no lowercase `[a-f]` | Match 32 uppercase hex | Matches 32 uppercase hex | **PASS** |
| 2 | Edge amounts: `0`, `0.01`, `1000`, `12500.5`, `999999999.99` strictly formatted to `.00` | Exact 2-decimal formatting | Formatted with 2 decimals | **PASS** |
| 3 | Invalid amounts: `-0.01`, `"not_a_number"`, `null` | Throws Error | Throws Error | **PASS** |
| 4 | Tamper sensitivity: 1 char/bit flipped in merchantId, orderId, amount, currency, secret, status_code | Signature rejected (`false`) | Rejected (`false`) | **PASS** |
| 5 | Avalanche effect: 20 randomized bit flips | 100% rejection rate | 100% rejection rate | **PASS** |
| 6 | Spoofed / missing / junk signatures to `POST /api/payments/payhere/notify` | HTTP 400 | HTTP 400 | **PASS** |
| 7 | Non-existent order numbers (`VA-NON-EXISTENT-...`) | HTTP 404 without crash | HTTP 404 (`Order not found`) | **PASS** |
| 8 | Injection payload in order number (`VA-SQL-INJECT--' OR 1=1;--`) | HTTP 404 without crash | HTTP 404 | **PASS** |
| 9 | Valid status code 2 (paid) | Transitions to `'paid'`, `'processing'` | Transitions to `'paid'`, `'processing'` | **PASS** |
| 10 | Status code -1 and -2 initial failure | Transitions to `'failed'`, rolls back stock once | Transitions to `'failed'`, stock restored | **PASS** |
| 11 | Duplicate status 2 on already paid order | HTTP 200, no re-processing | HTTP 200, message: `'already marked as paid'` | **PASS** |
| 12 | **CRITICAL IDEMPOTENCY: Duplicate status -1/-2 replay** | **Stock restored once (50)** | **Stock restored twice (52)** | **FAIL** |
| 13 | **STALE NOTIFICATION: Status -1 on already paid order** | **Order remains 'paid', stock unchanged** | **Order changed to 'failed', stock restored** | **FAIL** |

---

## 5. Caveats

1. **Review-Only Constraint**: In strict adherence to the challenger archetype rules ("Review-only — do NOT modify implementation code"), I have not applied the code patch directly to `src/controllers/paymentController.js`. The test file `tests/adversarial_payhere_stress.test.js` remains in place to facilitate immediate validation once the worker implements the fix.
2. **Simulated PayHere Network**: Gateway interactions were verified via HTTP Supertest payloads and mathematical MD5 verifications rather than live connections to `sandbox.payhere.lk`, which is the intended design for automated testing in this workspace.

---

## 6. Conclusion & Verdict

**Verdict**: **`REQUEST_CHANGES`**

The implementation worker must modify `src/controllers/paymentController.js` to fix the idempotency check and status state machine:
1. Prevent duplicate status `-1` / `-2` notifications from executing inventory rollback more than once.
2. Protect already `'paid'` orders from being overwritten or canceled by stale status `-1` / `-2` / `0` notifications.

---

## 7. Verification Method

To reproduce these empirical findings and independently verify the fixes:

1. **Run Full Test Suite**:
   ```powershell
   npm test
   ```
   *Current Result*: `Test Suites: 1 failed, 15 passed, 16 total`, `Tests: 2 failed, 236 passed, 238 total`.
   *Expected Result After Worker Fix*: 16 test suites passed, 238 tests passed, 0 failures.

2. **Inspect Empirical Test Harness**:
   - File: `g:\VelvetAura\tests\adversarial_payhere_stress.test.js`
   - Test 1: `CRITICAL IDEMPOTENCY CHALLENGE: duplicate status -1 / -2 must NOT cause double inventory rollback` (line 602)
   - Test 2: `STALE WEBHOOK CHALLENGE: stale status -1 on an already paid order must NOT corrupt paid order or restore stock` (line 664)

3. **Targeted Code File**:
   - `src/controllers/paymentController.js`: lines 71–78 and lines 105–115.
