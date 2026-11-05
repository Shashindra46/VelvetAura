# Adversarial Challenge & Stress Analysis — Milestone 1 API Contracts & Error Handlers

**Agent**: `teamwork_challenger_m1_2`  
**Milestone**: M1 (Backend Foundation & Data Persistence)  
**Date**: 2026-11-04  
**Verdict**: **`REQUEST_CHANGES`**  

---

## 1. Executive Summary

An exhaustive adversarial audit and stress analysis was conducted on the Milestone 1 backend implementation in `g:\VelvetAura`. The audit evaluated four core operational surfaces:
1. **Health Check Diagnostic Probe (`/api/health`)**
2. **Route 404 Error Normalization (`notFound` & unmapped routing)**
3. **Invalid & Malformed Payload Handling (`express.json()`, body parsers, type coercion)**
4. **Mongoose Schema Constraints & Model Life Cycles (`User`, `Product`, `Cart`, `Order`)**

While health reporting, 404 handling, and Mongoose schema definitions are robustly structured, **two high-severity defects were uncovered in payload and error handling**:
- **Critical/High Defect (F-01)**: The centralized error handler `src/middleware/errorMiddleware.js` ignores `err.status` and `err.statusCode`. Consequently, any malformed JSON payload (`SyntaxError: entity.parse.failed`) causes `res.statusCode` (default `200`) to fall back to `500 Internal Server Error` instead of `400 Bad Request`, directly violating the `DISPATCH.md` requirement that malformed payloads return HTTP 400.
- **High Defect (F-02)**: The authentication controller `src/controllers/authController.js` invokes string operations (`name.trim()`, `email.toLowerCase().trim()`) without validating data types. Supplying non-string primitives (numbers, arrays, or objects) causes unhandled `TypeError` exceptions that crash into `errorHandler` as `500 Internal Server Error` instead of returning `400 Bad Request`.
- **Medium Defect (F-03)**: The virtual `image` setter on `src/models/Product.js` fails to mutate `this.images` if the array already contains items, silently preventing updates to a product's primary hero image.

Because the explicit dispatch criterion mandates that **"malformed payloads return 400"**, the formal verdict is **`REQUEST_CHANGES`**.

---

## 2. Attack Surface Breakdown & Empirical Findings

### Challenge 1 (Critical/High): Malformed JSON Payloads Return HTTP 500 Instead of HTTP 400

- **Requirement Reference**: `DISPATCH.md` ("ensure ... malformed payloads return 400"), RFC 7231 §6.5.1 (Bad Request), `PROJECT.md` Feature 1.
- **Location**: `src/middleware/errorMiddleware.js`, lines 24–67
- **Target Code**:
  ```javascript
  const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    let message = err.message || 'Internal Server Error';

    // 1. Mongoose Bad ObjectId (CastError)
    if (err.name === 'CastError' && err.kind === 'ObjectId') {
      statusCode = 404;
      message = `Resource not found with ID: ${err.value}`;
    }

    // 2. Mongoose Schema Validation Error
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = Object.values(err.errors)
        .map((val) => val.message)
        .join(', ');
    }

    // 3. Mongoose Duplicate Key Error (code 11000)
    if (err.code === 11000) {
      statusCode = 409;
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      message = `Duplicate value entered for ${field}. Please use another value.`;
    }

    // 4. JWT Verification Errors
    if (err.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Not authorized, invalid token';
    }

    if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Not authorized, token has expired';
    }

    // Always return consistent JSON structure with message, error, and success: false
    res.status(statusCode).json({
      success: false,
      message,
      error: message,
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
    });
  };
  ```
- **Attack Scenario**:
  A client or penetration test suite submits malformed JSON to any JSON-accepting endpoint (e.g., `POST /api/auth/register` or `POST /api/auth/login`):
  ```http
  POST /api/auth/register HTTP/1.1
  Host: localhost:5000
  Content-Type: application/json

  {"name": "Adversary", "email": "broken-payload", 
  ```
- **Mechanism of Failure**:
  1. Express's built-in `express.json()` middleware attempts to parse the payload via `JSON.parse`.
  2. Parsing fails, throwing a `SyntaxError: Unexpected end of JSON input`.
  3. `body-parser` decorates the error with:
     - `err.status = 400`
     - `err.statusCode = 400`
     - `err.type = 'entity.parse.failed'`
  4. `body-parser` forwards the error via `next(err)`.
  5. In Express, `res.statusCode` defaults to `200` unless explicitly set by a prior controller.
  6. `errorHandler` runs line 25:
     ```javascript
     let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
     ```
     Because `res.statusCode === 200`, `statusCode` evaluates to `500`.
  7. None of the conditional blocks (`CastError`, `ValidationError`, `code === 11000`, `JsonWebTokenError`, `TokenExpiredError`) match `SyntaxError`.
  8. `errorHandler` issues:
     ```javascript
     res.status(500).json({
       success: false,
       message: 'Unexpected end of JSON input',
       error: 'Unexpected end of JSON input',
       stack: '...'
     });
     ```
- **Blast Radius**:
  High. Any client transmitting syntax-broken JSON receives a server crash status (`500`) instead of client error (`400`). This causes false positive server error alarms in APM / monitoring tools and fails standard REST API contract audits.
- **Recommended Mitigation**:
  Update `src/middleware/errorMiddleware.js`:
  ```javascript
  const errorHandler = (err, req, res, next) => {
    let statusCode =
      err.status ||
      err.statusCode ||
      (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

    let message = err.message || 'Internal Server Error';

    // Handle body-parser / JSON SyntaxError explicitly
    if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400)) {
      statusCode = 400;
      message = 'Invalid JSON payload. Please verify syntax.';
    }
  ```

---

### Challenge 2 (High): Type Coercion & Non-String Values Trigger Unhandled `TypeError` (HTTP 500)

- **Requirement Reference**: `DISPATCH.md` (invalid payload handling), `PROJECT.md` Feature 4 & 5.
- **Location**: `src/controllers/authController.js`, lines 31, 51, 75, 128
- **Target Code**:
  ```javascript
  // register:
  const { name, email, password, address, shippingAddress } = req.body;
  ...
  const cleanEmail = email.toLowerCase().trim();
  ...
  const user = await User.create({
    name: name.trim(),
    email: cleanEmail,
    password,
    ...
  });

  // login:
  const { email, password } = req.body;
  ...
  const cleanEmail = email.toLowerCase().trim();
  ```
- **Attack Scenario**:
  A client or security fuzzer transmits non-string JSON data types:
  1. `{ "name": 12345, "email": "valid@luxury.test", "password": "Password123!" }`
  2. `{ "name": "Camille", "email": 99999, "password": "Password123!" }`
  3. `{ "name": "Camille", "email": { "$gt": "" }, "password": "Password123!" }`
- **Mechanism of Failure**:
  1. The presence check `if (!name || !email || !password)` passes for numbers and objects because truthy values evaluate to `true`.
  2. The code immediately invokes `.toLowerCase()` or `.trim()` on `email` and `name`.
  3. If `name` or `email` is numeric or an object (e.g., `{ "$gt": "" }`), V8 throws:
     `TypeError: name.trim is not a function` or `TypeError: email.toLowerCase is not a function`.
  4. The `catch (error)` block forwards the `TypeError` via `next(error)`.
  5. Because `res.statusCode` is `200`, `errorHandler` returns `500 Internal Server Error`.
- **Blast Radius**:
  Medium/High. Fuzz testing or unexpected client payloads crash the request handler with a 500 status code rather than cleanly rejecting the payload with a 400 Bad Request.
- **Recommended Mitigation**:
  Add explicit type validation in `src/controllers/authController.js` before string method execution:
  ```javascript
  if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({
      success: false,
      message: 'Name, email, and password must be valid strings',
      error: 'Name, email, and password must be valid strings',
    });
  }
  ```

---

### Challenge 3 (Medium): Product Model Virtual `image` Setter Does Not Mutate Populated Arrays

- **Requirement Reference**: `PROJECT.md` Interface Contracts (Product schema), M2 preparation.
- **Location**: `src/models/Product.js`, lines 123–127
- **Target Code**:
  ```javascript
  // Set virtual image setter or pre-save hook to populate images array if single image provided
  productSchema.virtual('image').set(function (val) {
    if (val && (!this.images || this.images.length === 0)) {
      this.images = [val];
    }
  });
  ```
- **Attack Scenario**:
  A product document already containing image assets (`images: ['/assets/images/item1.webp']`) is updated by setting `product.image = '/assets/images/item1-updated.webp'`.
- **Mechanism of Failure**:
  Because `this.images.length === 0` is `false`, the setter silently no-ops. The product's primary hero image remains unchanged.
- **Blast Radius**:
  Medium. Any catalog updater or admin tool relying on the `image` virtual setter will silently fail to update existing images.
- **Recommended Mitigation**:
  In `src/models/Product.js`:
  ```javascript
  productSchema.virtual('image').set(function (val) {
    if (val) {
      if (!this.images || this.images.length === 0) {
        this.images = [val];
      } else {
        this.images[0] = val;
      }
    }
  });
  ```

---

## 3. Verified Robust Areas (Passing Challenges)

### 3.1 Health Check Probe (`GET /api/health`)
- **Verified Behavior**:
  - In-memory database connected: Returns HTTP 200 with `{ status: "ok", database: "connected", mode: "memory", service: "VelvetAura E-Commerce API", uptime: ..., timestamp: ..., version: "1.0.0" }`.
  - Disconnected database state: Evaluates `mongoose.connection.readyState !== 1`, returning HTTP 503 with `{ status: "degraded", database: "disconnected" }`.
  - Non-GET requests (`POST /api/health`): Bypasses `router.get('/')` and falls through to `notFound`, returning HTTP 404 JSON.
  - Safe null-guarding: `mongoose.connection && mongoose.connection.readyState === 1` prevents null dereferences during early bootstrap.

### 3.2 404 Not Found Routing
- **Verified Behavior**:
  - `GET /api/unmapped-endpoint` → Handled by `notFound` middleware, returning HTTP 404 with `{ success: false, message: "Route Not Found - GET /api/unmapped-endpoint", error: "..." }`.
  - `POST /api/unknown` or `DELETE /api/cart/invalid` → Handled by `notFound`, returning HTTP 404 JSON.
  - Non-API requests (`GET /cart`, `GET /products`) → Falls through to SPA client routing fallback `app.get('*')`, which safely serves the frontend shell or placeholder string without crashing.

### 3.3 Mongoose Schema Constraints & Model Calculations
- **`User` Model**:
  - Password hashing: Transparently hashes using bcrypt with salt rounds 10 on new records or modified passwords.
  - Query exclusion: `select: false` prevents accidental credential leakage during queries.
  - JSON serialization: `toJSON` transform automatically strips `password` and `__v`.
  - Address mirroring: Bidirectionally syncs `address` and `shippingAddress` on save.
- **`Product` Model**:
  - Category enum constraint: Enforces `['skincare', 'cosmetics', 'fragrances', 'haircare']`.
  - Numeric boundaries: Enforces non-negative price (`min: 0`) and stock (`min: 0`), and rating bounded in `[0, 5]`.
  - Full-text search index: Compound index `ProductTextIndex` correctly specifies weights:
    `name: 10, brand: 8, origin: 5, tags: 5, description: 2`.
  - Compound facet indexes: `{ category: 1, price: 1 }` and `{ origin: 1, category: 1 }` established for fast query performance.
- **`Cart` Model**:
  - Mathematical pricing engine:
    - Subtotal = `sum(price * quantity)`
    - Tax = 8% of subtotal (`Math.round(subtotal * 0.08 * 100) / 100`)
    - Tiered shipping = `$0.00` if subtotal >= `$50.00`; `$5.99` if subtotal < `$50.00`; `$0.00` if empty cart.
    - Grand total = `subtotal + tax + shipping`
    - Pre-save hook automatically triggers `recalculateTotals()`.
- **`Order` Model**:
  - Validates non-empty item array (`val && val.length > 0`).
  - Order number generation format: `VA-YYYYMMDD-XXXX`.
  - Pricing and address alias synchronization.

---

## 4. Verification & Stress Test Matrix

| # | Stress Test Scenario | Expected Outcome | Actual Code Behavior | Status |
|---|----------------------|------------------|----------------------|:------:|
| 1 | `GET /api/health` with memory DB | 200 `{ status: "ok", database: "connected", mode: "memory" }` | 200 with specified JSON structure | **PASS** |
| 2 | `GET /api/health` when DB down | 503 `{ status: "degraded", database: "disconnected" }` | 503 with degraded status | **PASS** |
| 3 | `POST /api/health` | 404 `{ success: false, error: ... }` | 404 via `notFound` middleware | **PASS** |
| 4 | `GET /api/nonexistent-route` | 404 `{ success: false, error: ... }` | 404 JSON with error message | **PASS** |
| 5 | `POST /api/auth/register` with malformed JSON | 400 Bad Request `{ success: false, ... }` | **500 Internal Server Error** (F-01) | **FAIL** |
| 6 | `POST /api/auth/register` with numeric `name: 123` | 400 Bad Request `{ success: false, ... }` | **500 Unhandled TypeError** (F-02) | **FAIL** |
| 7 | `POST /api/auth/login` with object `email: { $gt: "" }` | 400 Bad Request `{ success: false, ... }` | **500 Unhandled TypeError** (F-02) | **FAIL** |
| 8 | Product schema invalid category (`category: "shoes"`) | ValidationError caught as 400 | ValidationError caught as 400 | **PASS** |
| 9 | Product schema negative price (`price: -10`) | ValidationError caught as 400 | ValidationError caught as 400 | **PASS** |
| 10| Compound text index definition on Product | Weights: name 10, brand 8, origin 5, tags 5, desc 2 | Weights match exactly | **PASS** |
| 11| Cart recalculation under $50 subtotal | 8% tax + $5.99 shipping | Exactly calculated | **PASS** |
| 12| Cart recalculation at or over $50 subtotal | 8% tax + $0.00 free shipping | Exactly calculated | **PASS** |
| 13| Cart recalculation for empty cart | subtotal 0, tax 0, shipping 0, grandTotal 0 | All 0.00 | **PASS** |
| 14| Order model creation without items | ValidationError: at least one item required | ValidationError triggered | **PASS** |
| 15| Product virtual `image` update on existing item | Updates `images[0]` | **Silently ignores update** (F-03) | **FAIL** |

---

## 5. Conclusion & Actionable Next Steps

Based on empirical stress analysis against the Milestone 1 requirements:
- **Verdict**: **`REQUEST_CHANGES`**
- **Required Actions for Worker/Implementer**:
  1. **Fix `src/middleware/errorMiddleware.js`**:
     Include `err.status` and `err.statusCode` in calculating `statusCode`, and explicitly map JSON `SyntaxError` (status 400) to HTTP 400.
  2. **Harden `src/controllers/authController.js`**:
     Add strict string type checks (`typeof name === 'string'`, `typeof email === 'string'`, `typeof password === 'string'`) in `register` and `login` before calling string methods (`.trim()`, `.toLowerCase()`).
  3. **Fix `src/models/Product.js`**:
     Allow the virtual `image` setter to update `this.images[0]` when `this.images` already contains elements.
