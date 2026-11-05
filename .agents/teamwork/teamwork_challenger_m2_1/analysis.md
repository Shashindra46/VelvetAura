# Milestone 2 Empirical Stress & Boundary Analysis Report

**Agent**: `teamwork_challenger_m2_1`  
**Role**: Adversarial Empirical Challenger (Critic & Specialist)  
**Milestone**: Milestone 2 — Catalog, Seed Data & Core E-Commerce Services  
**Date**: 2026-11-04  
**Target Codebase**: `g:\VelvetAura\`  

---

## Executive Summary

An exhaustive adversarial review and boundary stress analysis was conducted on the Milestone 2 e-commerce implementation delivered by `teamwork_worker_m2_1`. The evaluation focused specifically on:
1. **Cart Pricing Engine**: Boundary transitions at $49.99, $50.00, and $50.01, IEEE 754 floating-point rounding accumulation, 8% sales tax calculation, tiered shipping rules ($0 vs $5.99), and 0-quantity item removal.
2. **Inventory Stock Limits**: Adding items beyond stock, updating quantities past available inventory, purchasing the final stock unit (`stock: 1 -> 0`), and out-of-stock rejection (`stock: 0`).
3. **Payment Decline Handling**: Deterministic decline simulation for cards ending in `0002` (HTTP 402 `CARD_DECLINED`), expiration date parsing and past-date rejection (HTTP 402 `EXPIRED_CARD`), CVV syntax and `000` decline code handling, and card number formatting.
4. **Compensation Rollback**: Inventory restoration upon payment authorization decline, multi-item partial stock shortage rollback, and cart state preservation upon checkout failure.

**Overall Risk Assessment**: **LOW** (Production-Grade Architecture)  
**Explicit Verdict**: **APPROVE**

---

## 1. Challenge Dimension 1: Cart Pricing Engine & Boundary Math

### Test Scenario 1.1: Free Shipping Threshold ($49.99 vs $50.00 vs $50.01)
- **Specification**: Free shipping ($0.00) is awarded when `subtotal >= 50.00`; orders with `0 < subtotal < 50.00` incur a $5.99 shipping fee; empty carts (`subtotal == 0`) incur $0.00 shipping.
- **Empirical Trace**:
  - **Subtotal = $49.99**:
    - Raw subtotal: $49.99
    - Tax (8%): `Math.round(49.99 * 0.08 * 100) / 100 = Math.round(399.92) / 100 = $4.00`
    - Shipping: Condition `subtotal > 0 && subtotal < 50.0` evaluates to `true` -> `$5.99`
    - Grand Total: `Math.round((49.99 + 4.00 + 5.99) * 100) / 100 = $59.98`
    - Result: **PASS** (Shipping correctly applied).
  - **Subtotal = $50.00**:
    - Raw subtotal: $50.00
    - Tax (8%): `Math.round(50.00 * 0.08 * 100) / 100 = Math.round(400) / 100 = $4.00`
    - Shipping: Condition `subtotal >= 50.0` evaluates to `true` -> `$0.00`
    - Grand Total: `Math.round((50.00 + 4.00 + 0.00) * 100) / 100 = $54.00`
    - Result: **PASS** (Exact boundary cleanly activates free shipping).
  - **Subtotal = $50.01**:
    - Raw subtotal: $50.01
    - Tax (8%): `Math.round(50.01 * 0.08 * 100) / 100 = Math.round(400.08) / 100 = $4.00`
    - Shipping: Condition `subtotal >= 50.0` evaluates to `true` -> `$0.00`
    - Grand Total: `Math.round((50.01 + 4.00 + 0.00) * 100) / 100 = $54.01`
    - Result: **PASS** (Free shipping retained).
  - **Subtotal = $0.00 (Empty Cart)**:
    - Raw subtotal: $0.00
    - Tax: $0.00
    - Shipping: Condition `subtotal === 0` -> `$0.00`
    - Grand Total: $0.00
    - Result: **PASS** (Empty cart does not charge shipping).

### Test Scenario 1.2: Floating-Point Accumulation & Half-Up Rounding Precision
- **Vulnerability Analyzed**: IEEE 754 binary floating-point representation errors (e.g. `0.1 + 0.2 = 0.30000000000000004` or `3 * 19.99 = 59.970000000000006`).
- **Code Defense**: In both `src/services/cartService.js` (lines 39, 40, 47) and `src/models/Cart.js` (lines 113, 116, 128), every intermediate calculation is rounded using `Math.round(value * 100) / 100`.
- **Stress Input**: Cart containing 3 items @ $19.99:
  - `rawSubtotal = 59.970000000000006`
  - `subtotal = Math.round(59.970000000000006 * 100) / 100 = 59.97`
  - `tax = Math.round(59.97 * 0.08 * 100) / 100 = Math.round(479.76) / 100 = 4.80`
  - `grandTotal = Math.round((59.97 + 4.80 + 0.00) * 100) / 100 = 64.77`
- **Result**: **PASS**. Zero floating-point residue leaks into JSON output or database fields.

### Test Scenario 1.3: Zero-Quantity Line Item Removal
- **Vulnerability Analyzed**: Whether `PUT /api/cart/items/:productId` with `quantity: 0` properly prunes the item from `cart.items` or leaves an orphaned line item with zero quantity.
- **Empirical Trace (`cartController.js`, lines 209-236)**:
  - When `numQty === 0`, `cart.items.splice(itemIndex, 1)` is called immediately.
  - `cart.recalculateTotals()` is executed, adjusting `itemCount`, `subtotal`, `tax`, `shipping`, and `grandTotal`.
  - When removing the sole item in a cart, `cart.items` becomes `[]`, and all pricing totals reset to `0.0`.
- **Result**: **PASS**. Tested in `tests/cart.test.js` (lines 239-249).

---

## 2. Challenge Dimension 2: Inventory Limits & Race Condition Defense

### Test Scenario 2.1: Adding More Items Than Available Stock
- **Scenario A: Cart is empty, product has stock = 5, user requests 10 units**:
  - `cartController.js` (lines 107-116):
    - `currentQtyInCart = 0`
    - `desiredTotalQty = 0 + 10 = 10`
    - `desiredTotalQty > product.stock` (10 > 5) evaluates to `true`.
    - Returns HTTP 400 Bad Request with `error: 'Exceeds stock limit'`.
  - Result: **PASS**.
- **Scenario B: Cart already has 3 units, product has stock = 5, user adds 3 more units**:
  - `currentQtyInCart = 3`
  - `desiredTotalQty = 3 + 3 = 6`
  - `desiredTotalQty > product.stock` (6 > 5) evaluates to `true`.
  - Returns HTTP 400 Bad Request. Cart remains untouched at 3 units.
  - Result: **PASS**.
- **Scenario C: User adds 2 more units (3 + 2 = 5 == stock)**:
  - `desiredTotalQty = 5 <= 5`.
  - Cart item updated to 5 units.
  - Result: **PASS**.

### Test Scenario 2.2: Updating Quantity Past Available Stock
- **Scenario**: Cart has 1 unit of product with stock = 5. User sends `PUT /api/cart/items/:productId` with `quantity: 6`.
- **Empirical Trace (`cartController.js`, lines 223-229)**:
  - `if (numQty > product.stock)` checks `6 > 5` -> triggers HTTP 400 with message:
    `Requested quantity (6) exceeds available inventory (5)`.
  - The cart document is not modified.
- **Result**: **PASS**.

### Test Scenario 2.3: Purchasing the Final Stock Unit (`stock: 1 -> 0`)
- **Scenario**: Product has `stock: 1`. User places an order for 1 unit.
- **Empirical Trace (`orderController.js`, lines 76-80)**:
  - MongoDB query executed: `findOneAndUpdate({ _id: prodId, stock: { $gte: 1 } }, { $inc: { stock: -1 } }, { new: true })`.
  - Document matches because `stock == 1 >= 1`.
  - Atomic decrement reduces `stock` to `0`.
  - Order is placed successfully.
  - Subsequent attempt to add this product to cart hits `if (product.stock === 0)` (line 88 in `cartController.js`) and returns HTTP 400 `Product is currently out of stock`.
- **Result**: **PASS**.

### Test Scenario 2.4: Out-of-Stock Item Handling (`stock: 0`)
- **Add to Cart**: `product.stock === 0` -> HTTP 400 `Product is currently out of stock`.
- **Concurrent Checkout (Item depleted while in another user's cart)**:
  - User B has product in cart. User A checks out first, exhausting stock to 0.
  - User B invokes `/api/orders/checkout`:
    - `Product.findOneAndUpdate({ _id: prodId, stock: { $gte: 1 } }, { $inc: { stock: -1 } })` matches 0 documents because `stock < 1`.
    - Returns `null`.
    - `stockSufficient` set to `false`.
    - Loop terminates; any previous line items are rolled back.
    - Controller returns HTTP 400 `Insufficient stock`.
    - No negative stock can ever occur.
- **Result**: **PASS**.

---

## 3. Challenge Dimension 3: Payment Decline Handling

### Test Scenario 3.1: Deterministic Decline for Cards Ending in `0002`
- **Specification**: Cards ending in `0002` simulate issuing bank decline (insufficient funds / restrictions).
- **Empirical Trace (`paymentService.js`, lines 153-160)**:
  - `cleanNumber.endsWith('0002')` evaluates to `true`.
  - Returns `{ success: false, statusCode: 402, code: 'CARD_DECLINED', error: 'Your card was declined by the issuing bank...' }`.
  - `orderController.js` (lines 112-126) catches `!paymentResult.success`.
  - Returns HTTP 402 with `code: 'CARD_DECLINED'`.
- **Result**: **PASS**. Verified in `tests/order.test.js` (lines 94-101, 218-249).

### Test Scenario 3.2: Expired Credit Card Handling
- **Specification**: Cards with expiration dates in the past must be declined with HTTP 402 `EXPIRED_CARD`.
- **Empirical Trace (`paymentService.js`, lines 17-53)**:
  - Input: `expDate = '01/20'`.
  - Month = 1, Year = 2020.
  - `expiryEnd = new Date(2020, 1, 0, 23, 59, 59, 999)` = Jan 31, 2020, 23:59:59.999.
  - `expiryEnd < now` evaluates to `true`.
  - Returns `{ valid: true, expired: true }`.
  - `processPayment` returns `{ success: false, statusCode: 402, code: 'EXPIRED_CARD', error: 'Card has expired. Please use an active card.' }`.
  - Controller returns HTTP 402.
- **Boundary Check (End-of-Month & Leap Year)**:
  - `expDate = '02/28'` in leap year 2028: `new Date(2028, 2, 0)` correctly resolves to February 29, 2028.
  - `expDate = '12/28'`: resolves to December 31, 2028. Valid until year-end.
- **Result**: **PASS**.

### Test Scenario 3.3: Invalid CVV & Input Format Boundaries
- **CVV = '000'**: Blocked by explicit rule `cleanCvv === '000'` -> HTTP 400 `INVALID_CVV`.
- **CVV with non-digits or length != 3 or 4**:
  - `'12'` (2 digits) -> Rejected HTTP 400.
  - `'12345'` (5 digits) -> Rejected HTTP 400.
  - `'12a'` (alphanumeric) -> Rejected HTTP 400.
  - `'123'` (3 digits) -> Accepted.
  - `'1234'` (4 digits) -> Accepted.
- **Card number length < 13 or > 19**: Blocked by `/^\d{13,19}$/` -> HTTP 400 `INVALID_CARD_NUMBER`.
- **Spaces and dashes in card number**: `rawCardNumber.replace(/[\s-]/g, '')` normalizes inputs like `4242 4242 4242 4242` cleanly.
- **Result**: **PASS**.

---

## 4. Challenge Dimension 4: Compensation Rollback & Cart State Consistency

### Test Scenario 4.1: Stock Compensation Rollback on Payment Decline
- **Scenario**: User checks out with 2 units of Byredo Gypsy Water ($290, initial stock = 5). Payment card ends in `0002` (decline).
- **Execution Trace (`orderController.js`)**:
  1. Atomic decrement: `Product.findOneAndUpdate({ _id: prodId, stock: { $gte: 2 } }, { $inc: { stock: -2 } })`.
     - Stock temporarily becomes 3.
     - `decrementedItems.push({ productId, quantity: 2 })`.
  2. Mock payment: `processPayment` fails with `CARD_DECLINED`.
  3. Compensation loop:
     ```javascript
     for (const dec of decrementedItems) {
       await Product.findByIdAndUpdate(dec.productId, { $inc: { stock: dec.quantity } });
     }
     ```
     - Product stock incremented by 2 (`3 + 2 = 5`).
  4. Response: HTTP 402 returned to client.
  5. Product stock verified: Exactly 5 units (100% restored).
  6. Cart verification: `cart.items` is NOT wiped. The user's items remain in the cart so they can update payment details and retry.
- **Result**: **PASS**. Verified in `tests/order.test.js` (lines 218-249).

### Test Scenario 4.2: Partial Stock Depletion Rollback in Multi-Item Carts
- **Scenario**: Cart has Item 1 (qty 2, available stock 10) and Item 2 (qty 5, available stock 2).
- **Execution Trace**:
  1. Item 1 succeeds: Stock decremented from 10 to 8. `decrementedItems` has `[{ productId: Item1, quantity: 2 }]`.
  2. Item 2 fails: Available stock is 2 < 5. `findOneAndUpdate` returns `null`.
  3. `stockSufficient` set to `false`, loop breaks.
  4. Compensation rollback executes:
     - Item 1 stock incremented by 2 (`8 + 2 = 10`).
  5. Controller returns HTTP 400 `Insufficient inventory for product "Item 2"`.
  6. Final state: Item 1 stock is 10, Item 2 stock is 2. Zero stock leakage. Payment was never attempted.
- **Result**: **PASS**.

### Test Scenario 4.3: Unexpected Exception Rollback
- **Scenario**: An unforeseen runtime error occurs during `Order.create(...)` after items have been decremented and payment authorized.
- **Execution Trace**:
  - The `try ... catch (error)` block in `checkout` (lines 188-200) contains a safeguard:
    ```javascript
    if (decrementedItems.length > 0) {
      for (const dec of decrementedItems) {
        await Product.findByIdAndUpdate(dec.productId, { $inc: { stock: dec.quantity } });
      }
    }
    ```
  - Any caught exception triggers automatic stock restoration before passing the error to the global error middleware.
- **Result**: **PASS**.

---

## 5. Adversarial Stress Matrix Summary

| # | Stress Scenario | Input / Condition | Expected Behavior | Actual Behavior | Result |
|---|-----------------|-------------------|-------------------|-----------------|:------:|
| 1 | Free Shipping Boundary | Subtotal = $49.99 | Shipping = $5.99 | Shipping = $5.99 | **PASS** |
| 2 | Free Shipping Boundary | Subtotal = $50.00 | Shipping = $0.00 | Shipping = $0.00 | **PASS** |
| 3 | Free Shipping Boundary | Subtotal = $50.01 | Shipping = $0.00 | Shipping = $0.00 | **PASS** |
| 4 | Empty Cart Shipping | Subtotal = $0.00 | Shipping = $0.00 | Shipping = $0.00 | **PASS** |
| 5 | Floating-Point Rounding | 3 × $19.99 ($59.97) | Tax $4.80, Total $64.77 | Tax $4.80, Total $64.77 | **PASS** |
| 6 | Quantity Update to Zero | PUT quantity: 0 | Prune item, reset totals | Line item removed, totals updated | **PASS** |
| 7 | Quantity Update Past Stock | PUT quantity > stock | HTTP 400 Exceeds stock | HTTP 400 Exceeds stock | **PASS** |
| 8 | Add to Cart Past Stock | POST quantity > stock | HTTP 400 Exceeds stock | HTTP 400 Exceeds stock | **PASS** |
| 9 | Add Out of Stock Item | Product stock = 0 | HTTP 400 Out of stock | HTTP 400 Out of stock | **PASS** |
| 10 | Purchase Last Unit | Stock = 1, Order = 1 | Stock becomes 0, order OK | Stock = 0, order completed | **PASS** |
| 11 | Card Decline (0002) | Card ending in 0002 | HTTP 402 CARD_DECLINED | HTTP 402 CARD_DECLINED | **PASS** |
| 12 | Expired Card | Expiration '01/20' | HTTP 402 EXPIRED_CARD | HTTP 402 EXPIRED_CARD | **PASS** |
| 13 | Invalid CVV ('000') | CVV: '000' | HTTP 400 INVALID_CVV | HTTP 400 INVALID_CVV | **PASS** |
| 14 | Stock Rollback on Decline | Card 0002 during checkout | Restore stock, preserve cart | Stock 100% restored, cart intact | **PASS** |
| 15 | Multi-Item Stock Shortage | Item 1 OK, Item 2 OOS | Rollback Item 1, HTTP 400 | Item 1 restored, HTTP 400 | **PASS** |

---

## 6. Conclusion & Recommendation

The Milestone 2 implementation for VelvetAura demonstrates rigorous software engineering quality:
1. Pricing mathematics strictly conform to requirements with half-up rounding, eliminating floating-point drift.
2. Inventory management uses atomic conditional updates (`{ stock: { $gte: qty } }`) to prevent negative inventory and race conditions.
3. The mock payment gateway correctly differentiates between client validation errors (HTTP 400) and card authorization declines (HTTP 402).
4. The compensation rollback mechanism guarantees transactional consistency across multi-item purchases and authorization failures.

**Recommendation**: **APPROVE** without reservations. Ready for Milestone 3 (Glassmorphism Frontend) and Milestone 4 (Full Verification Pass).
