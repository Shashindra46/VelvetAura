# DISPATCH — PayHere Spec & Test Architecture Miner

## Timestamp
2026-11-05T08:53:00Z

## Role
teamwork_spec_miner

## Working Directory
g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\

## Original Request File
g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md

## Scope & Instructions
Investigate and specify:
1. PayHere Architecture & Utility Module:
   - Requirements for PayHere Sri Lanka payment gateway preparation:
     - Config: merchant ID, merchant secret, currency ('LKR'), mode (sandbox vs production) via environment variables.
     - Hash Generation Helper: Standard PayHere hash format: `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))`. Check exact specifications (2 decimal places formatting e.g. `1000.00`).
     - Webhook/Notify Handler structure: verify incoming md5sig from PayHere notify POST callback: `strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))`, validate status code (2: success, 0: pending, -1: canceled, -2: failed), update order paymentStatus to 'paid'/'failed', record gateway transaction ID.
     - Service architecture in `src/services/payhereService.js` (or `src/utils/payhere.js`) and routes/controllers.
2. Test Suite Impact & Audit:
   - Survey all existing test files in `tests/`: which ones test order creation, checkout, mock payment, admin orders, or e2e workflows.
   - Enumerate tests that must be updated (e.g. replacing mock credit card payloads with COD or Bank Transfer, checking currency formatting in LKR).
   - Enumerate new unit, integration, and E2E tests required for COD, Bank Transfer, PayHere hash generation, PayHere webhook verification, and currency formatting.

Produce a detailed specification and test blueprint in `g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\handoff.md`.

## 2026-11-05T08:53:26Z
You are teamwork_spec_miner_pay_3.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\
The authoritative user request is located at: g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md
Your dispatch instructions are at: g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\DISPATCH.md

You MUST read g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md and g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\DISPATCH.md before starting your specification mining and test analysis.

Your objective:
1. PayHere Architecture & Models Preparation Specification:
   - Formulate the exact specification for PayHere integration preparation:
     - Config: merchant ID, merchant secret, currency ('LKR'), sandbox vs production mode from environment variables (e.g. PAYHERE_MERCHANT_ID, PAYHERE_MERCHANT_SECRET, PAYHERE_MODE).
     - Hash generation helper: PayHere MD5 hash uppercase calculation for checkout initiation: `strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))` (with amount formatted to 2 decimal places e.g. 1000.00).
     - Webhook/Notify handler: structure, endpoint (e.g. POST /api/payments/payhere/notify or POST /api/orders/payhere/notify), verification of md5sig: `strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))`, handling status codes (2 = success/paid, 0 = pending, -1 = canceled, -2 = failed), updating Order paymentStatus.
2. Comprehensive Test Suite Impact Analysis:
   - Survey all test files in tests/ (unit, integration, and E2E).
   - Identify existing tests that check mock credit cards, USD currency, or order creation, and define how to update them.
   - Specify new unit, integration, and E2E test cases to verify:
     - Cash on Delivery (COD) order placement and pending payment status
     - Direct Bank Transfer order placement, bank details, and confirmation
     - Currency formatting in LKR (`Rs.` / `LKR`) across catalog, cart, checkout, confirmation, orders, admin
     - PayHere hash generation helper (validating against standard PayHere hash test vectors)
     - PayHere notify webhook handler (verifying md5sig verification, success status, invalid sig rejection)
     - Admin dashboard order management with paymentMethod and paymentStatus

Write your complete findings and testing blueprint to g:\VelvetAura\.agents\teamwork\teamwork_spec_miner_pay_3\handoff.md and notify me via send_message when complete.
