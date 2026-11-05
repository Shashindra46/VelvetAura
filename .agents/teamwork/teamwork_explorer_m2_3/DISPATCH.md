# DISPATCH — Milestone 2 Explorer 3: Orders, Checkout & Mock Payment

## Objective
Analyze and plan the implementation for VelvetAura's Orders and Checkout services:
1. `src/services/paymentService.js`:
   - Mock payment authorization simulation.
   - Accept payment details (cardNumber, expDate, cvv, billingZip, amount).
   - Simulate success for valid test cards (e.g. standard sandbox cards like 4242...), generating realistic transaction IDs `txn_va_...` or `TXN-...`.
   - Simulate rejection (402 or 400) for declining test cards (e.g., cards ending in 0002, expired dates, empty CVV).
2. `src/controllers/orderController.js` and `src/routes/orderRoutes.js`:
   - `POST /api/orders/checkout`:
     - Validate authenticated user cart (reject if cart empty with 400).
     - Validate stock availability for all cart items.
     - Decrement stock atomically in product catalog (`$inc: { stock: -item.quantity }`).
     - Invoke `paymentService.processPayment(amount, paymentDetails)`.
     - Create and persist `Order` document with frozen item snapshots (name, brand, price, quantity, image).
     - Empty the active cart upon successful order creation.
     - Return HTTP 201 with created order and transaction details.
   - `GET /api/orders/my-orders`: Retrieve all orders for authenticated user, sorted by `createdAt` descending.
   - `GET /api/orders/:id`: Retrieve single order by ID for the authorized owner.
3. Test suite design: `tests/catalog.test.js`, `tests/cart.test.js`, `tests/order.test.js`.

## Scope Boundaries
- Read-only analysis and architecture planning.
- DO NOT write implementation code directly.
- Deliver findings in `analysis.md` and `handoff.md`.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- E2E Test Suite Contracts: `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_INFRA.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\`

## Completion Criteria
- Comprehensive blueprint with payment simulation engine, checkout transaction flows, and controller templates.
- Complete `handoff.md` and notify parent.


## 2026-11-04T11:57:21Z
You are teamwork_explorer_m2_3.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\DISPATCH.md, g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md, and g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Plan the implementation of:
- Payment mock service (src/services/paymentService.js) with test card simulation and decline simulation
- Order creation & checkout controller (src/controllers/orderController.js, src/routes/orderRoutes.js) with stock decrement and cart clearing
- Order history endpoints (/api/orders/my-orders, /api/orders/:id)
- Integration test suite structure (tests/catalog.test.js, tests/cart.test.js, tests/order.test.js)
Deliver analysis.md and a self-contained handoff.md, and notify your parent.
