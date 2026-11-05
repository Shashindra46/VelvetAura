# DISPATCH — Full-Stack Payment & Checkout Implementation Worker

## Timestamp
2026-11-05T09:07:00Z

## Role
teamwork_worker

## Working Directory
g:\VelvetAura\.agents\teamwork\teamwork_worker_pay_1\

## Original Request File
g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md

## Scope Document
g:\VelvetAura\.agents\teamwork\orchestrator_4\SCOPE.md

## Reference Reports
- Frontend investigation: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_1\handoff.md`
- Backend investigation: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_pay_2\handoff.md`
- PayHere & Test specification: `g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\handoff.md`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Detailed Implementation Tasks
1. **Frontend Currency (LKR) Standardization**:
   - `public/js/components/base.js`: Update `formatPrice(amount)` to format as `Rs. X,XXX.XX` using `toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })`.
   - `public/index.html`: Update hero banner free shipping text to LKR equivalent (e.g. `✨ Free Islandwide Shipping Over Rs. 5,000.00`).
   - `public/js/store.js`: Update shipping calculation threshold (Rs. 5,000.00 free shipping, Rs. 350.00 standard delivery) and catalog price filter ranges for LKR.
   - `public/js/components/catalog.js`: Update price filter options to LKR (Under Rs. 5,000, Rs. 5,000 – Rs. 10,000, etc.).
   - `public/js/components/cartDrawer.js`, `productDetail.js`, `orderConfirmation.js`: Ensure formatting and shipping progress bar align with LKR.

2. **Checkout Modal Overhaul (Remove Mock Card, Add COD & Bank Transfer)**:
   - `public/js/components/checkoutModal.js`:
     - Remove the mock credit card inputs, sandbox demo cards banner, auto-fill demo card buttons, and card formatters.
     - Implement two payment method selector cards:
       a) **Cash on Delivery (COD)**: default selection.
       b) **Direct Bank Transfer**: displays official VelvetAura corporate bank details:
          - Bank Name: Commercial Bank of Ceylon
          - Branch: Colombo Fort Premier Branch
          - Account Name: VelvetAura (Pvt) Ltd
          - Account Number: `1000 8924 7712`
          - Currency: LKR
          - Includes a required checkbox: `"I confirm that I have transferred / will transfer the total amount to the VelvetAura bank account above."`
     - Update submit button text to e.g. `🛍️ Place Order — ${formatPrice(grandTotal)}`.
     - Validate that if Direct Bank Transfer is selected, the confirmation checkbox is checked before allowing order submission.
   - `public/css/components.css`: Add dark-mode glassmorphic styling for `.payment-options-grid`, `.payment-option-card`, `.bank-transfer-details-box`, `.bank-transfer-note`, `.method-badge`, and `.payment-badge` variations.

3. **Backend Order Model & PayHere Preparation**:
   - `src/models/Order.js`:
     - Add `currency`: `{ type: String, default: 'LKR', uppercase: true, trim: true }`.
     - Update/add `paymentMethod`: `{ type: String, enum: ['cod', 'bank_transfer', 'payhere', 'mock_credit_card'], default: 'cod', required: true }`.
     - Update/add `paymentStatus`: `{ type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' }`.
     - Add `gatewayTransactionId`: `{ type: String, default: null }`.
     - Add `gatewayHash`: `{ type: String, default: null }`.
     - Add `paymentNotes`: `{ type: String, default: '' }`.
     - Maintain backward-compatibility for existing tests using the nested `payment` subdocument (sync `payment.method`, `payment.status`, `payment.transactionId` with top-level fields).
   - `src/models/Product.js`: default currency `'LKR'`.
   - `src/services/payhereService.js`:
     - Helper function `generatePayHereHash({ merchantId, orderId, amount, currency, merchantSecret })`: strictly MD5 hash uppercase `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))` with amount formatted to 2 decimals.
     - Helper function `verifyPayHereSignature({ merchantId, orderId, payhereAmount, payhereCurrency, statusCode, md5sig, merchantSecret })`.
     - Helper function `getPayHereConfig()` returning sandbox/production URLs and merchant ID from process.env.
   - `src/controllers/paymentController.js` & `src/routes/paymentRoutes.js`:
     - Endpoint `POST /api/payments/payhere/notify` to verify signature and update order `paymentStatus` to 'paid' (status 2) or 'failed' (-1/-2).
   - `src/app.js`: Mount `/api/payments` on `paymentRoutes`.
   - `src/controllers/orderController.js`:
     - Handle `paymentMethod` in `checkout`: set `paymentStatus: 'pending'`, fulfillment `status: 'pending'`, record notes.
     - Support admin `PUT /api/orders/:id/status` updating both `orderStatus` and `paymentStatus`.

4. **Admin Dashboard & Customer Account Payment Visibility**:
   - `public/js/components/adminDashboard.js`:
     - Render both `paymentMethod` (badge with icon: 💵 COD, 🏦 Bank Transfer, 💳 PayHere) and `paymentStatus` (badge: pending, paid, failed) in the Orders table.
     - Display gross revenue in LKR.
   - `public/js/components/accountView.js`:
     - Render payment method badge and payment status badge in user order history cards.
   - `public/js/components/orderConfirmation.js`:
     - Display payment method, payment status, and bank transfer instructions if bank_transfer was chosen.

5. **Test Suites Updates & Verification**:
   - Create `tests/unit/payhere.test.js`: Unit tests for hash generation, signature verification, decimal formatting, and sandbox URLs.
   - Create `tests/integration/payhere_webhook.test.js`: Integration tests for PayHere IPN webhook callback.
   - Create `tests/integration/checkout_payment.test.js`: Integration tests for COD and Bank Transfer checkout.
   - Update existing tests (`tests/order.test.js`, `tests/admin.test.js`, `tests/concurrency.test.js`, `tests/e2e/...`, etc.) so that all tests pass.
   - Run `npm test` and `npm run test:e2e` to verify 100% pass rate.

Produce a detailed completion report in `g:\VelvetAura\.agents\teamwork\teamwork_worker_pay_1\handoff.md`.
