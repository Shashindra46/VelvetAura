# DISPATCH — Milestone 2 Worker: Catalog, Seed Data & Core E-Commerce Services

## Objective
Implement all Milestone 2 source code and test files for VelvetAura:
1. `src/data/seedProducts.js`: 24 curated luxury imported beauty products across 4 categories (Skincare, Cosmetics, Fragrances, Haircare) from 8 premier global origins (France, South Korea, Japan, Italy, UK, Sweden, USA, Germany), embedding all test fixture products from `tests/e2e/helpers/fixtures.js`.
2. `src/data/seed.js`: Standalone seed script callable from CLI via `node src/data/seed.js` / `npm run seed` or programmatically via `seedInitialData(options)`, creating demo users via `User.create()`, resetting collections, seeding products, and cleanly exiting via `disconnectDB()`.
3. `src/controllers/productController.js` & `src/routes/productRoutes.js`:
   - `GET /api/products`: listing with multi-facet filters (`category`, `origin`, `brand`), keyword search with regex escaping, multi-sort, pagination (`page`, `limit`), returning `{ success: true, count, total, page, pages, products }`.
   - `GET /api/products/categories`: distinct categories (mounted before `/:id`).
   - `GET /api/products/:id`: single product by ID, pre-validating ObjectId (returning 400 on malformed ID, 404 on not-found).
4. `src/services/cartService.js`: Pure financial calculation helper (`calculatePricing`), `getOrCreateCart`, `validateCartStock`, `clearUserCart`.
5. `src/controllers/cartController.js` & `src/routes/cartRoutes.js`:
   - `GET /api/cart`: get active cart for authenticated user (via `protect`).
   - `POST /api/cart/items`: add item with stock validation (`quantity <= product.stock`), auto-recalculate totals.
   - `PUT /api/cart/items/:productId`: update quantity (remove if 0, validate stock, recalculate).
   - `DELETE /api/cart/items/:productId`: remove line item, recalculate totals.
   - `DELETE /api/cart`: clear active cart.
6. `src/services/paymentService.js`:
   - Mock card authorization engine. Validate card format, CVV, and expiry date. Simulate decline (HTTP 402/400) for cards ending in `0002` or expired dates. Return `{ success: true, transactionId: 'TXN-VA-...', ... }` for valid test cards.
7. `src/controllers/orderController.js` & `src/routes/orderRoutes.js`:
   - `POST /api/orders/checkout`: validate cart is non-empty, atomic stock decrement (`$inc: { stock: -qty }`), compensation rollback if payment declines, call paymentService, create Order document with frozen snapshot items, clear active cart, return 201 with `{ success: true, order, transactionId }`.
   - `GET /api/orders/my-orders`: retrieve authenticated user's orders sorted by date descending.
   - `GET /api/orders/:id`: retrieve single order for owner (or 403 Forbidden).
8. `tests/catalog.test.js`, `tests/cart.test.js`, `tests/order.test.js`: Integration test suites verifying all M2 functionality.

## Exclusive File Ownership
You exclusively own and modify:
- `src/data/seedProducts.js`
- `src/data/seed.js`
- `src/controllers/productController.js`
- `src/routes/productRoutes.js`
- `src/services/cartService.js`
- `src/controllers/cartController.js`
- `src/routes/cartRoutes.js`
- `src/services/paymentService.js`
- `src/controllers/orderController.js`
- `src/routes/orderRoutes.js`
- `tests/catalog.test.js`
- `tests/cart.test.js`
- `tests/order.test.js`

All files MUST use CommonJS (`require` / `module.exports`) consistently.

## Inputs
- Authoritative User Request: `g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md`
- Master Project Specification: `g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md`
- Explorer 1 Blueprint: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_1\analysis.md`
- Explorer 2 Blueprint: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_2\analysis.md`
- Explorer 3 Blueprint: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\analysis.md`
- Working Directory: `g:\VelvetAura\.agents\teamwork\teamwork_worker_m2_1\`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Completion Criteria
- All 13 target files implemented with genuine logic.
- Deliver `handoff.md` and notify parent when complete.


## 2026-11-04T12:06:46Z
From: 4bf3fe76-4743-4e62-a1da-88651478076c
Content:
You are teamwork_worker_m2_1.
Your working directory is g:\VelvetAura\.agents\teamwork\teamwork_worker_m2_1\.
Read your instructions in g:\VelvetAura\.agents\teamwork\teamwork_worker_m2_1\DISPATCH.md, g:\VelvetAura\.agents\teamwork\orchestrator_1\PROJECT.md, and g:\VelvetAura\.agents\teamwork\ORIGINAL_REQUEST.md.
Also study the blueprints from the 3 M2 Explorers:
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_1\analysis.md
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_2\analysis.md
- g:\VelvetAura\.agents\teamwork\teamwork_explorer_m2_3\analysis.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Implement all Milestone 2 files using CommonJS (require / module.exports):
1. src/data/seedProducts.js (24 curated luxury items, 4 categories, 8 origins, embeds fixtures from tests/e2e/helpers/fixtures.js)
2. src/data/seed.js (standalone seeder for npm run seed & programmatic seedInitialData)
3. src/controllers/productController.js & src/routes/productRoutes.js (listing with filters/search/sort/pagination, categories, getById)
4. src/services/cartService.js (pure pricing calculator, getOrCreateCart, validateCartStock, clearUserCart)
5. src/controllers/cartController.js & src/routes/cartRoutes.js (getCart, addToCart, updateCartItem, removeCartItem, clearCart)
6. src/services/paymentService.js (mock payment authorization with decline simulations)
7. src/controllers/orderController.js & src/routes/orderRoutes.js (checkout with atomic stock decrement/rollback, order history, order detail)
8. tests/catalog.test.js, tests/cart.test.js, tests/order.test.js (integration test suites)

Deliver handoff.md and send a message to your parent when done.
