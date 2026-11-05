# Technical Analysis: Test Infrastructure, Seed Data & Verification Strategy for Milestone 5 (Admin Dashboard)

**Author**: `teamwork_explorer_m5_3`  
**Parent Agent**: `orchestrator_1` (`849f40fb-cef2-4f46-a018-fd981286c6f0`)  
**Workspace**: `g:\VelvetAura`  
**Date**: 2026-11-04  

---

## Executive Summary

Milestone 5 introduces an administrative tier to VelvetAura, encompassing Role-Based Access Control (RBAC), Product Catalog Management (CRUD), Global Order Oversight & Status Lifecycle Management, and Dark-Glassmorphism Admin UI controls with client route guarding.

This investigation examined the existing test runners, in-memory database lifecycle, database seeder, authentication mechanisms, and API contracts. The current test infrastructure relies on **Jest 29.7.0**, **Supertest 6.3.4**, and **mongodb-memory-server 9.2.0**. It executes 97 backend tests across 7 suites (`npm test`) and 56 end-to-end tests across 8 suites (`npm run test:e2e`), with 100% pass rates.

This document details the exact technical blueprint for verifying Milestone 5 without regressing any prior milestone features.

---

## 1. Existing Test Infrastructure Analysis

### 1.1 Test Runners, Configuration & Assertion Libraries
- **Primary Test Runner**: Jest `^29.7.0` configured in `package.json`:
  ```json
  "jest": {
    "testEnvironment": "node",
    "setupFilesAfterEnv": [
      "<rootDir>/tests/setup.js"
    ],
    "testMatch": [
      "<rootDir>/tests/*.test.js"
    ],
    "testTimeout": 60000
  }
  ```
- **CLI Test Script**:
  - `npm test` -> `jest --runInBand --detectOpenHandles --forceExit`
  - `--runInBand` ensures serial execution across test suites, avoiding concurrency race conditions on port bindings or shared database resources.
  - `--detectOpenHandles` surfaces unclosed Mongoose connection sockets or active HTTP listeners.
  - `--forceExit` ensures deterministic exit after test suite completion.
- **HTTP Assertions**: `supertest` `^6.3.4` wrapping the exported Express instance (`src/app.js`), combined with Jest's native `expect()` assertion engine.
- **Secondary Runner**: `npm run test:e2e` -> `node tests/e2e/runner.js`, launching `tests/e2e/jest.e2e.config.js` targeting `tests/e2e/**/*.test.js`.

### 1.2 In-Memory Database Architecture (`mongodb-memory-server`)
- Defined in `src/config/db.js` and hooked into tests via `tests/setup.js`.
- **Startup Hook** (`beforeAll` in `tests/setup.js`):
  ```javascript
  await connectDB({
    forceMemory: true,
    autoSeed: false,
  });
  ```
  - Bypasses the 3000ms external MongoDB probe and immediately spawns a dedicated in-memory `mongod` daemon.
  - Sets `autoSeed: false` so that test suites have deterministic, unpolluted state control.
- **Isolation Hook** (`afterEach` in `tests/setup.js`):
  ```javascript
  afterEach(async () => {
    await clearDatabase();
  });
  ```
  - `clearDatabase()` iterates through all collections on `mongoose.connection.collections` and executes `deleteMany({})`.
  - **Critical Implication**: Collections are completely emptied between every single `test()` or `it()` block. Any test relying on users, products, or orders must seed them in `beforeEach()` or inline within the test.
- **Teardown Hook** (`afterAll` in `tests/setup.js`):
  ```javascript
  afterAll(async () => {
    await disconnectDB();
  });
  ```
  - Closes Mongoose connections cleanly and terminates the `MongoMemoryServer` daemon process.
- **Test Environment Variables** (`tests/setup.js` lines 9-12):
  - `process.env.NODE_ENV = 'test'` (suppresses morgan logging in `src/app.js`)
  - `process.env.JWT_SECRET = 'test_jwt_secret_key_velvetaura_2026_super_secure'`
  - `process.env.JWT_EXPIRES_IN = '1d'`
  - `process.env.PORT = '5001'`

### 1.3 Baseline Test Suite Status
Current execution results verified via empirical runs:
- `npm test`: **7 passed, 7 total suites; 97 passed, 97 total tests (100% PASS, ~65.6s)**
  1. `tests/tier5_adversarial.test.js` (20 tests)
  2. `tests/order.test.js` (15 tests)
  3. `tests/cart.test.js` (15 tests)
  4. `tests/concurrency.test.js` (4 tests)
  5. `tests/auth.test.js` (26 tests)
  6. `tests/catalog.test.js` (12 tests)
  7. `tests/health.test.js` (5 tests)
- `npm run test:e2e`: **8 passed, 8 total suites; 56 passed, 56 total tests (100% PASS, ~21.0s)**

---

## 2. Seed Data & Persona Authentication Strategy

### 2.1 Demo Personas in `src/data/seed.js`
The project's database seeder explicitly provides pre-configured admin and customer accounts:

| Persona | Name | Email | Password | Role | Address City/Country |
|---|---|---|---|---|---|
| **Admin** | VelvetAura Administrator | `admin@velvetaura.com` | `AdminPassword123!` | `admin` | Paris, France |
| **Customer 1** | Camille Dupont | `customer@velvetaura.com` | `Password123!` | `customer` | Paris, France |
| **Customer 2** | Min-ji Park | `minji@velvetaura.com` | `Password123!` | `customer` | Seoul, South Korea |

### 2.2 Model & Database Schema Alignment
- In `src/models/User.js`:
  ```javascript
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer',
  }
  ```
  The schema already defines `role` with an enum restricting values to `'customer'` and `'admin'`.
- In `src/controllers/authController.js`:
  - `register`: Intentionally does not allow client-supplied `role` inputs; defaults safely to `'customer'` to prevent privilege escalation.
  - `login`: Validates credentials, generates JWT token containing `{ id: user._id }`, and includes `user.role` in the response payload.
  - `getMe`: Returns the authenticated user's profile including `role: user.role`.

### 2.3 How Tests Authenticate as Admin vs Customer
Because `tests/setup.js` clears collections between each test, test suites should provision their test actors inside a `beforeEach` hook.

Recommended Authentication Pattern:
```javascript
let adminUser, adminToken;
let customerUser, customerToken;

beforeEach(async () => {
  // 1. Create Admin Persona
  adminUser = await User.create({
    name: 'VelvetAura Administrator',
    email: 'admin@velvetaura.com',
    password: 'AdminPassword123!',
    role: 'admin',
  });

  // 2. Create Regular Customer Persona
  customerUser = await User.create({
    name: 'Camille Dupont',
    email: 'customer@velvetaura.com',
    password: 'Password123!',
    role: 'customer',
  });

  // 3. Obtain Admin Token via Login API
  const adminLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'admin@velvetaura.com',
      password: 'AdminPassword123!',
    });
  adminToken = adminLoginRes.body.token;

  // 4. Obtain Customer Token via Login API
  const customerLoginRes = await request(app)
    .post('/api/auth/login')
    .send({
      email: 'customer@velvetaura.com',
      password: 'Password123!',
    });
  customerToken = customerLoginRes.body.token;
});
```
This pattern verifies the live bcrypt hashing and JWT issuance pipeline identically to production.

---

## 3. Milestone 5 Test Suite Architecture & Verification Design

The test suite must verify four essential domains:
1. **Route Protection & RBAC Guardrails**
2. **Product Catalog Management (CRUD)**
3. **Global Order Management & Lifecycle Status Transitions**
4. **Frontend Architecture & Client Route Guards**

### 3.1 Domain 1: Route Protection & RBAC Guardrails

#### Contract Rules:
- **No Token (Guest)** -> HTTP `401 Unauthorized`
- **Invalid / Expired Token** -> HTTP `401 Unauthorized`
- **Authenticated Non-Admin (`role: 'customer'`)** -> HTTP `403 Forbidden`
- **Authenticated Admin (`role: 'admin'`)** -> Passes through to handler (HTTP `200` / `201`)

#### Middleware Requirements:
Currently `src/middleware/authMiddleware.js` only exports `protect` and `optionalAuth`. An `admin` middleware must be added:
```javascript
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({
    success: false,
    message: 'Access denied: Administrator privileges required',
    error: 'Forbidden',
  });
};
```

#### Test Matrix for RBAC:
| Endpoint | Method | Unauthenticated (No Token) | Customer Token (`role: customer`) | Admin Token (`role: admin`) |
|---|---|---|---|---|
| `/api/products` | `POST` | `401 Unauthorized` | `403 Forbidden` | `201 Created` / `400 Bad Request` |
| `/api/products/:id` | `PUT` | `401 Unauthorized` | `403 Forbidden` | `200 OK` / `404 Not Found` |
| `/api/products/:id` | `DELETE` | `401 Unauthorized` | `403 Forbidden` | `200 OK` / `404 Not Found` |
| `/api/orders` | `GET` | `401 Unauthorized` | `403 Forbidden` | `200 OK` |
| `/api/orders/:id/status` | `PUT` | `401 Unauthorized` | `403 Forbidden` | `200 OK` / `400 Bad Request` |

---

### 3.2 Domain 2: Product Management Endpoints (CRUD)

#### 3.2.1 Product Creation (`POST /api/products`)
- **Success Criteria**:
  - Valid payload containing `name`, `brand`, `origin`, `category`, `description`, `price`, `stock`.
  - HTTP `201 Created`.
  - Response body contains `{ success: true, product: { ... } }`.
  - Record is immediately queryable in MongoDB via `Product.findById(res.body.product._id)`.
- **Validation Failures (HTTP 400)**:
  - Missing required fields: `name`, `price`, `category`, `brand`, `origin`, or `description`.
  - Invalid category: String not in `['skincare', 'cosmetics', 'fragrances', 'haircare']`.
  - Negative numeric values: `price < 0` or `stock < 0`.
  - Short fields: `name.length < 2` or `description.length < 10`.

#### 3.2.2 Product Modification (`PUT /api/products/:id`)
- **Success Criteria**:
  - Updating existing product with partial or full attributes (e.g. `{ price: 120.00, stock: 50 }`).
  - HTTP `200 OK`.
  - Response returns updated product document.
  - Direct database read confirms updated fields while unchanged fields remain intact.
- **Error Conditions**:
  - Non-existent valid ObjectId (`507f1f77bcf86cd799439011`) -> HTTP `404 Not Found`.
  - Malformed ObjectId format (`abc-123`) -> HTTP `400 Bad Request`.
  - Invalid update values (e.g. `price: -20` or unsupported category) -> HTTP `400 Bad Request`.

#### 3.2.3 Product Deletion (`DELETE /api/products/:id`)
- **Success Criteria**:
  - Existing product ID deleted by admin.
  - HTTP `200 OK` with `{ success: true, message: 'Product deleted successfully' }`.
  - Database verification: `Product.findById(id)` returns `null`.
  - Subsequent `GET /api/products/:id` returns HTTP `404 Not Found`.
- **Error Conditions**:
  - Non-existent valid ObjectId -> HTTP `404 Not Found`.
  - Malformed ObjectId format -> HTTP `400 Bad Request`.

---

### 3.3 Domain 3: Order Management Endpoints

#### 3.3.1 Global Order Listing (`GET /api/orders`)
- **Success Criteria**:
  - Admin retrieves all customer orders across all accounts.
  - HTTP `200 OK`.
  - Response shape: `{ success: true, count: N, orders: [...] }`.
  - Each order includes:
    - `orderNumber`
    - Populated customer details (`user` with `name`, `email`)
    - `items` array with snapshots
    - `shippingAddress`
    - `pricing` / `grandTotal`
    - `payment` receipt
    - `status`
  - Orders sorted chronologically (newest first: `createdAt: -1`).
- **Security Check**:
  - Non-admin calling `GET /api/orders` receives `403 Forbidden` (zero cross-tenant data leakage).

#### 3.3.2 Order Status Transition (`PUT /api/orders/:id/status`)
- **Allowed Status Enum**:
  From `src/models/Order.js`:
  `'pending'`, `'confirmed'`, `'processing'`, `'completed'`, `'shipped'`, `'delivered'`, `'cancelled'`.
- **Success Criteria**:
  - Admin submits `{ status: 'shipped' }` to `/api/orders/:id/status`.
  - HTTP `200 OK`.
  - Returned order reflects updated `status === 'shipped'`.
  - Database record reflects `status === 'shipped'`.
- **Validation Failures**:
  - Invalid status (e.g. `{ status: 'on_the_way' }` or `{ status: '' }`) -> HTTP `400 Bad Request`.
  - Non-existent order ID -> HTTP `404 Not Found`.
  - Malformed order ID -> HTTP `400 Bad Request`.
  - Customer trying to alter status on their own order -> HTTP `403 Forbidden`.

---

### 3.4 Domain 4: Frontend & Integration Verification

To test frontend components without requiring a heavy headless browser (consistent with existing `stress_frontend_dom.js`), tests must verify DOM contracts, event bindings, and route guard logic.

#### 3.4.1 Client Route Guard (`#/admin`)
- In `public/js/app.js`:
  - When `hash.startsWith('#/admin')`:
    - Reads `store.getState('auth')`.
    - If `!auth.isAuthenticated` or `auth.user.role !== 'admin'`:
      - Suppresses admin view.
      - Redirects to `#/catalog` (or displays auth modal).
      - Displays toast notification: `"Access denied. Administrator privileges required."`.
    - If `auth.user.role === 'admin'`:
      - Shows `#admin-view-container`.
      - Hides `#hero-banner`, `#catalog-container`, `#account-view-container`.
      - Mounts or renders `AdminDashboardComponent`.

#### 3.4.2 Navbar Admin Dashboard Link
- In `public/js/components/navbar.js`:
  - Subscribes to `auth` slice.
  - When `authState.user && authState.user.role === 'admin'`:
    - Renders `<a href="#/admin" class="dropdown-item" id="nav-admin-dashboard-link">Admin Dashboard</a>` (or dedicated navbar item).
  - When `authState.user.role !== 'admin'` (regular customer) or unauthenticated:
    - `#nav-admin-dashboard-link` is absent from DOM.

#### 3.4.3 HTML Shell Mounting Point
- In `public/index.html`:
  - Mounting container: `<section id="admin-view-container" class="admin-section hidden" aria-label="Admin Dashboard"></section>`.

---

## 4. Proposed Test File Specification (`tests/admin.test.js`)

Because `package.json` configures Jest with `"testMatch": ["<rootDir>/tests/*.test.js"]`, adding `tests/admin.test.js` guarantees that `npm test` will automatically pick up and execute all admin tests alongside the 7 existing suites.

### Detailed Test Structure

```javascript
/**
 * VelvetAura - Admin Subsystem & RBAC Integration Test Suite
 * 
 * Verifies:
 * - Route protection & role-based access control (RBAC: 401, 403, 200)
 * - Product management endpoints (create, update, delete)
 * - Order management endpoints (list all, update status)
 * - Frontend integration contracts (route guard & navbar visibility)
 */

describe('Admin Subsystem & RBAC (Integration Suite)', () => {
  // Setup: Create adminUser, customerUser, adminToken, customerToken, baselineProducts, baselineOrders
  
  describe('1. Role-Based Access Control (RBAC) & Route Protection', () => {
    // Unauthenticated (401)
    // Authenticated non-admin (403)
    // Authenticated admin (200/201)
  });

  describe('2. Admin Product Management (POST, PUT, DELETE /api/products)', () => {
    // POST /api/products: valid creation (201) + DB persistence check
    // POST /api/products: validation failures (missing fields, invalid category, negative price) (400)
    // PUT /api/products/:id: valid update (200) + DB persistence check
    // PUT /api/products/:id: 404 on non-existent, 400 on malformed ID
    // DELETE /api/products/:id: valid delete (200) + DB removal check + 404 verification
    // DELETE /api/products/:id: 404 on non-existent, 400 on malformed ID
  });

  describe('3. Admin Order Management (GET, PUT /api/orders)', () => {
    // GET /api/orders: admin retrieves all orders across all users (200) + population check
    // GET /api/orders: customer access denied (403)
    // PUT /api/orders/:id/status: valid status transitions (processing, shipped, delivered, cancelled) (200)
    // PUT /api/orders/:id/status: invalid status enum value (400)
    // PUT /api/orders/:id/status: 404 on non-existent, 400 on malformed ID
    // PUT /api/orders/:id/status: customer access denied (403)
  });

  describe('4. Frontend Admin Integration & Guardrail Contracts', () => {
    // DOM shell defines #admin-view-container
    // navbar.js renders Admin Dashboard link ONLY when user.role === 'admin'
    // app.js enforces route guard on #/admin, redirecting non-admins
  });
});
```

---

## 5. Implementation Roadmap & Zero-Regression Strategy

To ensure zero regressions across Milestones 1 through 4:

1. **Backend Middleware**:
   - Update `src/middleware/authMiddleware.js` to export `admin`.
   - Leave `protect` and `optionalAuth` unchanged.

2. **Product Controller & Routes**:
   - In `src/controllers/productController.js`: add `createProduct`, `updateProduct`, `deleteProduct`.
   - In `src/routes/productRoutes.js`:
     - Keep `GET /api/products`, `GET /api/products/categories`, and `GET /api/products/:id` public.
     - Mount `router.post('/', protect, admin, createProduct);`
     - Mount `router.put('/:id', protect, admin, updateProduct);`
     - Mount `router.delete('/:id', protect, admin, deleteProduct);`

3. **Order Controller & Routes**:
   - In `src/controllers/orderController.js`: add `getAllOrders`, `updateOrderStatus`.
   - In `src/routes/orderRoutes.js`:
     - Keep `router.use(protect);`
     - Keep `POST /checkout`, `GET /my-orders`, `GET /:id` intact.
     - Mount `router.get('/', admin, getAllOrders);`
     - Mount `router.put('/:id/status', admin, updateOrderStatus);` (and optionally `router.patch('/:id/status', admin, updateOrderStatus);`)

4. **Client API & Store**:
   - In `public/js/api.js`: add `createProduct`, `updateProduct`, `deleteProduct`, `getAllOrders`, `updateOrderStatus`.
   - In `public/js/store.js`: add admin state slice and CRUD actions.

5. **Client UI & Router**:
   - In `public/index.html`: add `<section id="admin-view-container" class="admin-section hidden" aria-label="Admin Dashboard"></section>`.
   - In `public/js/components/navbar.js`: conditionally render `#nav-admin-dashboard-link` when `user.role === 'admin'`.
   - In `public/js/app.js`: add `#/admin` routing branch with role guard.
   - In `public/js/components/adminDashboard.js`: implement dark-mode glassmorphic Admin Panel UI.

6. **Regression Verification Gate**:
   - Run `npm test` -> All 8 suites (7 previous + 1 admin) must pass 100%.
   - Run `npm run test:e2e` -> All 8 suites (56 tests) must pass 100%.
   - Run `npm run seed` -> Validates CLI seeder functionality with admin and customer personas.
