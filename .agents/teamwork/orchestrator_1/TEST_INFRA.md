# E2E Testing Infrastructure Specification: VelvetAura

**Track**: Requirement-Driven Opaque-Box E2E Testing  
**Status**: APPROVED & PUBLISHED  
**Date**: 2026-11-04  
**Target Application**: VelvetAura Luxury Imported Beauty E-Commerce  
**Document Location**: `g:\VelvetAura\.agents\teamwork\orchestrator_1\TEST_INFRA.md`  

---

## 1. Executive Summary & Testing Philosophy

The VelvetAura E2E Testing Track establishes a rigorous, requirement-driven, opaque-box test architecture. In strict accordance with the testing guidelines:
- **Opaque-Box Independence**: Tests interact with VelvetAura solely through external interfaces (HTTP requests, status codes, JSON payload contracts). Tests possess zero knowledge of internal controller functions, database collections, or service implementations.
- **Requirement-Driven**: All test expectations, assertions, and boundary checks are derived strictly from `ORIGINAL_REQUEST.md` and `PROJECT.md` contracts.
- **Progressive and Dual-Mode Execution**: The test suite can run in two primary modes:
  1. *In-Process Mode*: Leverages Express app mounting and in-memory MongoDB (`mongodb-memory-server`), ensuring 100% test independence and hermetic zero-leakage test runs.
  2. *Live Server Mode*: Executes over the network against any running HTTP endpoint via `BASE_URL=http://localhost:5000`, enabling smoke, staging, and production verification.
- **Authoritative Oracles**: Expected mathematical calculations (subtotal, 8% sales tax, $50.00 free shipping threshold, stock decrement) are computed from explicit formulas defined in the specification, not reverse-engineered from implementation artifacts.

---

## 2. Test Architecture & Runner Design

```
                     +---------------------------------------+
                     |         E2E Test Execution            |
                     |  (npm run test:e2e or node runner.js) |
                     +---------------------------------------+
                                         |
                                         v
                     +---------------------------------------+
                     |         Test Client Abstraction       |
                     |  (Opaque HTTP Request / Assertion)    |
                     +---------------------------------------+
                                    /        \
              (In-Process Supertest)          (Live HTTP / Network)
                        /                          \
                       v                            v
             +--------------------+       +--------------------+
             | Express App Target |       | Live Server Target |
             |   (src/app.js)     |       |   (:5000 / remote) |
             +--------------------+       +--------------------+
                       |                            |
                       v                            v
             +--------------------+       +--------------------+
             | In-Memory MongoDB  |       | Running DB Cluster |
             +--------------------+       +--------------------+
```

### 2.1 Runner Components
- **`tests/e2e/helpers/testClient.js`**: Reusable HTTP client wrapping Supertest/Fetch with automated auth header injection, response JSON parsing, cookie handling, and standardized error assertion utilities.
- **`tests/e2e/helpers/testDb.js`**: Database isolation lifecycle helper that initializes `mongodb-memory-server` for test isolation, seeds standard beauty catalog products, and cleanly resets collections between suites.
- **`tests/e2e/helpers/fixtures.js`**: Deterministic test fixtures (luxury user credentials, beauty product queries, valid and invalid mock credit cards, valid shipping addresses).
- **`tests/e2e/runner.js`**: Standalone dual-mode test runner that runs all test suites with rich console reporting, timings, and pass/fail statistics, complementing Jest test execution.

---

## 3. Feature-to-Test Mapping Matrix

All 30 features from `PROJECT.md` are accounted for in the E2E test plan across the 4 tiers:

| Feature # | Feature Name | Primary Endpoint(s) | Tier 1 Coverage | Tier 2 Coverage | Tier 3 & 4 Coverage |
|:---:|:---|:---|:---|:---|:---|
| F1 | Express Server & App Config | All endpoints | `tier1_health.test.js` | 404 & malformed route handling | Global middleware in all tests |
| F2 | Dual-Mode MongoDB Connection | `/api/health` | `tier1_health.test.js` | Fallback timeout simulation | Verified during test startup |
| F3 | Mongoose Schemas & Validation | All API endpoints | Model validation via API | Schema boundary violations | Enforced across all tiers |
| F4 | User Registration API | `POST /api/auth/register` | `tier1_auth.test.js` | Duplicate email, short password | Cross-tier user creation |
| F5 | User Login API | `POST /api/auth/login` | `tier1_auth.test.js` | Invalid password, non-existent user | Multi-session login in T3 & T4 |
| F6 | JWT Auth Middleware | `GET /api/auth/me`, Protected | `tier1_auth.test.js` | Missing token, malformed Bearer | Protected route guards in T1-T4 |
| F7 | Health Check API | `GET /api/health` | `tier1_health.test.js` | DB disconnected status check | Pre-flight server sanity check |
| F8 | Curated Seed Dataset | `GET /api/products` | `tier1_catalog.test.js` | Empty DB detection | 20+ luxury items validated in T1-T4 |
| F9 | Seed Script Command | CLI `npm run seed` | Seed runner validation | Re-seed idempotency | Verified during test setup |
| F10 | Auto-Seed on Memory Boot | App init | `tier1_catalog.test.js` | Startup auto-population | Baseline for in-memory runs |
| F11 | Product Listing API | `GET /api/products` | `tier1_catalog.test.js` | Negative/zero page numbers | Used in all browse workflows |
| F12 | Product Category/Origin Filter | `GET /api/products?category=..` | `tier1_catalog.test.js` | Unknown category/origin | Persona filtering in T3 & T4 |
| F13 | Product Search API | `GET /api/products?q=..` | `tier1_catalog.test.js` | Special characters, no-match | Search before purchase in T3 & T4 |
| F14 | Product Detail API | `GET /api/products/:id` | `tier1_catalog.test.js` | Invalid ObjectId, 404 ID | Product spec inspection in T3 & T4 |
| F15 | Cart Management API | `/api/cart`, `/api/cart/items` | `tier1_cart.test.js` | Zero/negative quantities | Core e-commerce flow in T3 & T4 |
| F16 | Cart Pricing Engine | `/api/cart` (subtotal/tax/ship) | `tier1_cart.test.js` | $49.99 vs $50.00 vs $50.01 threshold | Multi-item price calculation |
| F17 | Order Creation API | `POST /api/orders/checkout` | `tier1_order.test.js` | Empty cart, invalid address | Checkout completion in T3 & T4 |
| F18 | Mock Payment Simulation | `POST /api/orders/checkout` | `tier1_order.test.js` | Declined cards, invalid card format | Simulated card payment in T3 & T4 |
| F19 | Order History API | `GET /api/orders/my-orders` | `tier1_order.test.js` | Unauthenticated user access | Order persistence verified in T3 & T4 |
| F20-F27 | Frontend Glassmorphism & UI | `GET /` & Static assets | Static asset health check | Missing asset 404 | Frontend bundle verification |
| F28-F30 | Test Suites & Hardening | Test runner commands | All test files | Edge case suite | Multi-persona stress tests |

---

## 4. Four-Tier Opaque-Box Coverage Structure

### Tier 1: Comprehensive Feature Coverage
Every inventoried feature must have at least 5 distinct test cases covering its primary functional behavior:
- **`tier1_auth.test.js`** (>= 5 cases):
  1. Successful user registration with valid payload returns 201/200, user object (sans password), and valid JWT token.
  2. Successful user login with valid credentials returns 200 and valid JWT token.
  3. Fetch current user profile (`GET /api/auth/me`) with valid Bearer token returns 200 and matching profile.
  4. Password security verification: returned user object does NOT expose hashed or plain password.
  5. User profile update / address persistence: saving shipping address updates user record.
- **`tier1_catalog.test.js`** (>= 5 cases):
  1. Product listing returns seeded items with complete attributes (name, brand, origin, category, price, stock, specs).
  2. Product filtering by category (e.g. `skincare`, `fragrances`, `cosmetics`, `haircare`).
  3. Product filtering by imported origin country (e.g. `France`, `Japan`, `South Korea`, `Italy`).
  4. Product full-text search by keyword (e.g. `hydrating`, `serum`, `lipstick`).
  5. Product detail by ID returns full specifications and current inventory stock level.
- **`tier1_cart.test.js`** (>= 5 cases):
  1. Fetch active cart for newly registered user returns empty cart with 0 total.
  2. Add product item to cart with quantity returns updated cart with line item and recalculations.
  3. Update existing cart item quantity adjusts line price and cart subtotal.
  4. Remove specific item from cart removes line item and recalculates totals.
  5. Clear active cart removes all items and resets totals to zero.
- **`tier1_order.test.js`** (>= 5 cases):
  1. Checkout with valid cart, shipping address, and mock payment succeeds, returning 201/200 and order details.
  2. Mock payment simulation generates unique transaction ID (e.g. `TXN-...` or `MOCK-PAY-...`) and marks payment status `completed`.
  3. Order creation verifies stock decrement in product catalog.
  4. Order history (`GET /api/orders/my-orders`) lists placed order with item snapshots.
  5. Active cart is cleared automatically upon successful checkout.
- **`tier1_health.test.js`** (>= 5 cases):
  1. `GET /api/health` returns status 200 with `{ status: "ok" }`.
  2. Health check reports active database connection state.
  3. Health check reports database connection mode (`memory` or `external`).
  4. Non-existent API route returns HTTP 404 with standard error message.
  5. Application returns proper JSON headers (`Content-Type: application/json; charset=utf-8`).

### Tier 2: Boundary & Corner Cases
Boundary tests deliberately push input domains, limits, and edge conditions (>= 5 cases per boundary category):
- **Authentication & Authorization Boundaries**:
  1. Registration with duplicate email fails with 400 or 409 Conflict.
  2. Registration with missing required fields (empty email, missing password) fails with 400.
  3. Registration with short password (< 6 chars) fails with 400 validation error.
  4. Login with invalid password fails with 401 Unauthorized.
  5. Protected endpoint access without Authorization header fails with 401.
  6. Protected endpoint access with malformed Authorization header (no `Bearer ` prefix, gibberish token) fails with 401.
- **Catalog & Search Boundaries**:
  1. Requesting product with invalid MongoDB ObjectId string (e.g. `/api/products/not-an-id`) returns 400 or 404, never 500 crash.
  2. Requesting non-existent valid ObjectId returns 404 Not Found.
  3. Search query with empty string returns full or default catalog page.
  4. Search query with special characters (`<script>`, SQL fragments, unicode emojis) returns 200 with 0 matches or safe results, never 500.
  5. Filter by non-existent category or origin returns 200 with empty array `[]`.
- **Cart & Quantity Boundaries**:
  1. Adding item with quantity 0 fails with 400 Bad Request.
  2. Adding item with negative quantity (`quantity: -3`) fails with 400 Bad Request.
  3. Adding item with non-numeric quantity (`quantity: "abc"`) fails with 400 Bad Request.
  4. Adding quantity exceeding available product inventory stock fails with 400 Bad Request.
  5. Updating item to quantity 0 either removes the item or fails with 400.
  6. Removing an item not in the user's cart returns 404 or safe no-op.
- **Pricing & Shipping Threshold Boundaries**:
  1. Exact boundary subtotal = $49.99 incurs standard shipping fee of $5.99.
  2. Exact boundary subtotal = $50.00 receives free shipping ($0.00).
  3. Subtotal = $50.01 receives free shipping ($0.00).
  4. Exact 8% tax calculation verification across decimal fractions (proper half-up rounding to 2 decimal places).
- **Checkout & Order Boundaries**:
  1. Attempting checkout with an empty cart fails with 400 Bad Request.
  2. Checkout with missing shipping address fields fails with 400.
  3. Checkout with declining mock credit card (e.g. card ending in `0002` or expired) returns 400/402 Payment Required.
  4. Checkout attempting to purchase items that became out-of-stock fails gracefully without data corruption.

### Tier 3: Cross-Feature Interactions & Pairwise Workflows
Verifies system coherence across multi-module sequences:
- **Interaction 1: Full Lifecycle Customer Journey**
  - Register new account -> Authenticate via login -> Query catalog with category filter -> Fetch product detail -> Add 2 distinct items to cart -> Update quantity of item 1 -> Verify real-time cart recalculation -> Place order via mock checkout -> Confirm active cart is empty -> Query `/api/orders/my-orders` -> Verify purchased items and stock changes in catalog.
- **Interaction 2: Multi-User Session Isolation**
  - User A and User B register concurrently -> User A adds luxury perfume to cart -> User B queries cart and receives empty cart -> User A checks out -> User B's state remains untouched -> User A's order history contains order, User B's order history is empty.
- **Interaction 3: Catalog Stock & Inventory Synchronization**
  - Read initial product stock -> User buys quantity N -> Complete checkout -> Query product detail -> Verify stock = initial - N -> Attempt to add remaining stock + 1 to cart -> Verification of stock guard.
- **Interaction 4: Cart Mutation & Abandonment Recovery**
  - Add items -> Delete one item -> Fetch cart -> Log out / token switch -> Re-authenticate with original user -> Verify preserved cart state -> Clear cart -> Verify empty state.

### Tier 4: Real-World Luxury Beauty Shopping Workloads
Simulates complete realistic user journeys for luxury imported beauty personas:
- **Persona 1: "The French Skincare Aficionado"**
  - Customer registers as French skincare specialist.
  - Searches catalog for French imports (`origin: "France"`).
  - Selects luxury French serum and moisturizer.
  - Verifies cart qualifies for free shipping (subtotal > $50.00).
  - Executes checkout with French shipping destination.
  - Verifies order receipt, 8% tax calculation, and tracking status.
- **Persona 2: "The K-Beauty Glow Seeker"**
  - Customer browses Korean cosmetics & sheet masks.
  - Adds items totaling $38.00 (below $50.00 threshold) -> Observes $5.99 shipping fee.
  - Adds a Korean essence worth $22.00 (subtotal becomes $60.00) -> Observes shipping fee drops to $0.00.
  - Completes payment using mock Visa card.
  - Validates order confirmation summary.
- **Persona 3: "The Japanese Haircare Connoisseur"**
  - Customer filters catalog by `category: "haircare"` and `origin: "Japan"`.
  - Views individual product specifications (ingredients, volume, imported origin).
  - Adds item, increases quantity to 3, and verifies subtotal multiplication.
  - Completes purchase and verifies order in account order history.
- **Persona 4: "The High-End Fragrance Collector"**
  - Customer places multi-bottle luxury Italian & French fragrance order.
  - Verifies line item breakdown, mock payment authorization code, and order status transitions.

---

## 5. Authoritative Expected Output Derivation

All expected test values are mathematically derived from first principles:
1. **Subtotal Calculation**:
   $$\text{Subtotal} = \sum_{i=1}^{n} (\text{item.price}_i \times \text{item.quantity}_i)$$
2. **Sales Tax (8%)**:
   $$\text{Tax} = \text{round}(\text{Subtotal} \times 0.08, 2)$$
3. **Shipping Fee Schedule**:
   $$\text{Shipping} = \begin{cases} 0.00 & \text{if } \text{Subtotal} \ge 50.00 \\ 5.99 & \text{if } \text{Subtotal} < 50.00 \end{cases}$$
4. **Grand Total**:
   $$\text{Grand Total} = \text{Subtotal} + \text{Tax} + \text{Shipping}$$
5. **Inventory Decrement**:
   $$\text{Stock}_{\text{new}} = \text{Stock}_{\text{initial}} - \text{Quantity}_{\text{purchased}}$$
6. **HTTP Status Code Contracts**:
   - `200 OK`: Successful read, update, or login.
   - `201 Created`: Successful resource creation (registration, order creation).
   - `400 Bad Request`: Validation failure, zero/negative quantities, empty cart checkout.
   - `401 Unauthorized`: Missing, invalid, or expired authentication token.
   - `404 Not Found`: Non-existent route, product, or order.
   - `409 Conflict`: Duplicate registration email.

---

## 6. Execution Commands & Environment Setup

### 6.1 Running the E2E Test Suite
- **Full E2E Suite via Jest**:
  ```bash
  npm run test:e2e
  ```
  *(or `npx jest --config jest.e2e.config.js --runInBand`)*
- **Full E2E Suite via Standalone Runner**:
  ```bash
  node tests/e2e/runner.js
  ```
- **Running Against Live Server**:
  ```bash
  BASE_URL=http://localhost:5000 node tests/e2e/runner.js
  ```

### 6.2 Test Independence & Isolation
- Each test suite initializes or connects to an isolated in-memory MongoDB database instance.
- Catalog items are freshly seeded using the official luxury beauty seed dataset.
- Dynamic user accounts and tokens are generated per test using unique timestamps and random UUID suffixes, ensuring zero state leakage across test runs.

---

## 7. Quality Gate Acceptance Thresholds

For Milestone 4 integration sign-off:
- **Tier 1 (Feature Coverage)**: 100% pass across all 25+ feature test cases.
- **Tier 2 (Boundary & Corner Cases)**: 100% pass across all 20+ boundary test cases.
- **Tier 3 (Cross-Feature Interactions)**: 100% pass across all pairwise test workflows.
- **Tier 4 (Real-World Scenarios)**: 100% pass across all luxury beauty shopping persona flows.
- **Total Test Count**: Minimum 60 test cases across Tiers 1-4.
- **Zero Crash Tolerance**: No test may cause unhandled exceptions or 500 Internal Server Errors on valid or invalid inputs.
