# Empirical Stress Test Analysis — Milestone 1: Backend Foundation & Data Persistence

**Agent**: `teamwork_challenger_m1_1`  
**Milestone**: Milestone 1  
**Date**: 2026-11-04  
**Verdict**: **APPROVE**  

---

## 1. Challenge Summary

**Overall Risk Assessment**: **LOW**

An exhaustive adversarial stress-test suite was conducted on the Milestone 1 backend implementation across four primary subsystems:
1. **Cart Pricing Engine & Mathematical Boundaries**: Free shipping threshold ($49.99 vs $50.00 vs $50.01), 8% tax rounding half-up, empty cart totals, and persistence-layer tampering resistance.
2. **User Password Hashing & Credential Security**: Bcryptjs salt generation (10 rounds), comparePassword safety, profile update re-hashing prevention, and 5-layer password non-exposure.
3. **Authentication Controllers & Middleware**: Missing/malformed fields, duplicate email collision, password length boundaries, token tampering, expired tokens, malformed headers, and NoSQL injection resilience.
4. **Database Lifecycle & In-Memory Fallback**: External 3000ms connection timeout, zero-config MongoMemoryServer fallback, concurrency mutex locks, auto-seed idempotency, and clean teardown.

All critical assumptions were validated. No blocking vulnerabilities or specification deviations were identified.

---

## 2. Challenges & Adversarial Attack Scenarios

### Challenge 1 (Cart Pricing Engine): Free Shipping Boundary Value Inversion
- **Assumption Challenged**: Free shipping applies when subtotal is strictly greater than or equal to $50.00 (`subtotal >= 50.00`), and standard shipping ($5.99) applies when subtotal is strictly less than $50.00 (`subtotal < 50.00`). Empty cart ($0.00) must incur $0.00 shipping.
- **Attack Scenario**: Submit cart with $49.99, $50.00, $50.01, and $0.00 (empty). Test for off-by-one errors (e.g. `>` instead of `>=`), floating point rounding drift, or charging $5.99 on empty carts.
- **Observed Implementation (`src/models/Cart.js:118-126`)**:
  ```javascript
  if (this.subtotal === 0) {
    this.shipping = 0.0;
  } else if (this.subtotal >= 50.0) {
    this.shipping = 0.0;
  } else {
    this.shipping = 5.99;
  }
  ```
- **Blast Radius**: Financial overcharging ($5.99 charged on $50 orders) or revenue loss ($0 shipping on $49.99 orders).
- **Result**: **PASS**.
  - Subtotal = $49.99 -> Shipping = $5.99, Tax = $4.00, GrandTotal = $59.98.
  - Subtotal = $50.00 -> Shipping = $0.00, Tax = $4.00, GrandTotal = $54.00.
  - Subtotal = $50.01 -> Shipping = $0.00, Tax = $4.00, GrandTotal = $54.01.
  - Subtotal = $0.00 -> Shipping = $0.00, Tax = $0.00, GrandTotal = $0.00.
- **Mitigation**: Implemented correctly; logic matches E2E test fixture formula in `tests/e2e/helpers/fixtures.js:219-232`.

---

### Challenge 2 (Cart Persistence): Direct Payload Tampering of Totals
- **Assumption Challenged**: Cart totals stored in MongoDB cannot be spoofed by a malicious client sending forged `subtotal` or `grandTotal` in request bodies.
- **Attack Scenario**: Client updates cart line items totaling $500, but injects `{ subtotal: 1.00, grandTotal: 1.00 }`.
- **Observed Implementation (`src/models/Cart.js:136-140`)**:
  ```javascript
  cartSchema.pre('save', function (next) {
    this.recalculateTotals();
    next();
  });
  ```
- **Blast Radius**: Client buys expensive products at arbitrary self-assigned prices.
- **Result**: **PASS**. Pre-save hook recalculates totals directly from line items (`items.reduce(...)`), unconditionally overwriting forged values before write.

---

### Challenge 3 (User Security): Re-Hashing Password on Profile Modification
- **Assumption Challenged**: Modifying customer profile details (name, shipping address) must NOT trigger a second round of bcrypt hashing on an already-hashed password string.
- **Attack Scenario**: User registers with `'Secret123!'`. Later, user updates address via `PUT /api/auth/profile`. Pre-save hook runs on user document. If naive, it runs `bcrypt.hash('$2a$10$...', salt)`, locking the customer out.
- **Observed Implementation (`src/models/User.js:98-101`)**:
  ```javascript
  if (!this.isModified('password')) {
    return next();
  }
  ```
- **Blast Radius**: High (Customer lockout upon saving profile).
- **Result**: **PASS**. Mongoose `this.isModified('password')` prevents re-hashing when password is unchanged.

---

### Challenge 4 (User Security): Credential Leakage Vectors
- **Assumption Challenged**: Password hash must NEVER be exposed in HTTP response payloads or logs under any circumstance.
- **Attack Scenario**: Check responses for `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`, `PUT /api/auth/profile`, and global error handler stack traces.
- **Observed Implementation**:
  - Schema projection: `password: { select: false }` (`src/models/User.js:52`).
  - `toJSON` transform: `delete ret.password; delete ret.__v;` (`src/models/User.js:70-76`).
  - `toObject` transform: `delete ret.password; delete ret.__v;` (`src/models/User.js:78-84`).
  - Explicit sanitized response mapping in `authController.js` lines 95-104, 155-164, 189-199, 243-253.
  - Middleware exclusion: `User.findById(decoded.id).select('-password')` (`src/middleware/authMiddleware.js:35`).
- **Blast Radius**: Critical (Credential disclosure / rainbow table attack).
- **Result**: **PASS**. Zero leakage vectors exist across all 5 layers of defense.

---

### Challenge 5 (Auth Middleware): Token Tampering & Malformed Authorization Headers
- **Assumption Challenged**: Protected endpoints (`/api/auth/me`, `/api/auth/profile`) must reliably reject missing, malformed, non-Bearer, expired, or cryptographically invalid tokens with HTTP 401.
- **Attack Scenario**: Test 7 distinct authorization header variants:
  1. Missing `Authorization` header
  2. Missing `Bearer ` keyword prefix
  3. Empty `Bearer ` token
  4. Malformed signature string (e.g. `invalid.token.payload`)
  5. Cryptographically tampered payload
  6. Expired token (`TokenExpiredError`)
  7. Valid token referring to non-existent / deleted user
- **Observed Implementation (`src/middleware/authMiddleware.js:13-60`)**:
  - Validates `authHeader.startsWith('Bearer ')`.
  - Catches `JsonWebTokenError` and `TokenExpiredError`.
  - Checks `if (!user) return res.status(401)...`.
  - Normalizes all rejection payloads with `{ success: false, message, error }`.
- **Blast Radius**: High (Unauthorized access to customer personal data).
- **Result**: **PASS**. All 7 scenarios yield HTTP 401 without unhandled 500 exceptions.

---

### Challenge 6 (Auth Controller): Registration Duplicate & Validation Edge Cases
- **Assumption Challenged**: Registration enforces minimum 6-character passwords, RFC-compliant email formatting, presence of required fields, and rejects duplicate emails with HTTP 409 (or 400).
- **Attack Scenario**:
  - 5-character password (`'12345'`)
  - Malformed email (`'not-an-email'`, `'@missing.com'`, `'user@domain'`)
  - Missing name/email/password
  - Duplicate registration with identical email
  - Duplicate registration with case variation (`'CAMILLE@LUXURY.TEST'` vs `'camille@luxury.test'`)
- **Observed Implementation (`src/controllers/authController.js:33-71`)**:
  - `if (password.length < 6)` -> returns HTTP 400.
  - `emailRegex.test(cleanEmail)` -> returns HTTP 400.
  - `cleanEmail = email.toLowerCase().trim()` ensures case insensitivity.
  - `User.findOne({ email: cleanEmail })` returns HTTP 409.
  - MongoDB unique index + `errorMiddleware.js` code 11000 handler acts as concurrent race condition fallback returning HTTP 409.
- **Blast Radius**: Medium (Data corruption, duplicate accounts).
- **Result**: **PASS**.

---

### Challenge 7 (Database Connection): 3000ms Fallback & Memory Auto-Seed Idempotency
- **Assumption Challenged**: System connects to external MongoDB if accessible, but automatically and transparently falls back to `mongodb-memory-server` within 3000ms if unreachable. In-memory databases must auto-seed on startup without double-seeding on restarts.
- **Attack Scenario**: Run connection without active MongoDB daemon. Verify 3000ms timeout enforcement. Trigger `connectDB()` multiple times concurrently. Call `triggerAutoSeed()` when database already contains records.
- **Observed Implementation (`src/config/db.js`)**:
  - External connection options: `{ serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000 }`.
  - On error, immediately transitions to Mode 2 (`mongodb-memory-server`).
  - Mutex lock via `connectionPromise` prevents duplicate connections on concurrent requests.
  - Auto-seed checks `Product.countDocuments() > 0` before inserting baseline luxury items.
  - `disconnectDB()` cleans up Mongoose connection and stops mongod daemon.
- **Blast Radius**: Critical (Application boot failure in environments without running MongoDB).
- **Result**: **PASS**.

---

## 3. Stress Test Results Matrix

| # | Test Scenario | Input / Vector | Expected Behavior | Actual Behavior | Verdict |
|---|---------------|----------------|-------------------|-----------------|---------|
| 1 | Free Shipping Under Threshold | Subtotal = $49.99 | Shipping = $5.99, GrandTotal = $59.98 | Shipping = $5.99, GrandTotal = $59.98 | **PASS** |
| 2 | Free Shipping At Boundary | Subtotal = $50.00 | Shipping = $0.00, GrandTotal = $54.00 | Shipping = $0.00, GrandTotal = $54.00 | **PASS** |
| 3 | Free Shipping Over Threshold | Subtotal = $50.01 | Shipping = $0.00, GrandTotal = $54.01 | Shipping = $0.00, GrandTotal = $54.01 | **PASS** |
| 4 | Tax Half-Up Rounding (.0052) | Subtotal = $12.44 | Tax = $1.00 ($0.9952 rounded) | Tax = $1.00 | **PASS** |
| 5 | Tax Half-Up Rounding (.0044) | Subtotal = $12.43 | Tax = $0.99 ($0.9944 rounded) | Tax = $0.99 | **PASS** |
| 6 | Empty Cart Totals | items = [] | Subtotal = 0, Shipping = 0, Tax = 0, GrandTotal = 0 | All zero, no $5.99 fee | **PASS** |
| 7 | Cart Price Spoofing | Inject `{ grandTotal: 1.00 }` | Pre-save overwrites with authoritative calculation | Spoofed values discarded | **PASS** |
| 8 | Password Bcrypt Salt | `'VelvetSecret2026!'` | Hash matches `^\$2[ab]\$10\$` | Hash is 10-round bcrypt | **PASS** |
| 9 | Profile Update No Rehash | Update `name` | Password hash remains identical | Hash unchanged | **PASS** |
| 10 | Password Projection Hide | Query user document | `.password` is undefined | Password hidden | **PASS** |
| 11 | Short Password Validation | `'123'` (3 chars) | HTTP 400 validation error | HTTP 400 | **PASS** |
| 12 | Duplicate Email Registration | Same email twice | HTTP 409 or 400 error | HTTP 409 | **PASS** |
| 13 | Case-Insensitive Email Login | `'CAMILLE@LUXURY.TEST'` | HTTP 200 with JWT | HTTP 200 with JWT | **PASS** |
| 14 | Missing Bearer Header | No Authorization | HTTP 401 | HTTP 401 | **PASS** |
| 15 | Malformed Token Signature | `invalid.token.payload` | HTTP 401 | HTTP 401 | **PASS** |
| 16 | Expired Token Handling | Expired JWT | HTTP 401 with expired message | HTTP 401 | **PASS** |
| 17 | DB External Timeout Fallback | No local MongoDB | Fallback to MongoMemoryServer within 3s | Transparent fallback | **PASS** |
| 18 | In-Memory Auto-Seed Safety | 0 products in memory | Seeds 4 luxury products; skips if count > 0 | Idempotent seed | **PASS** |
| 19 | Health Endpoint Diagnostic | `GET /api/health` | HTTP 200, status: "ok", mode: "memory" | HTTP 200, valid payload | **PASS** |
| 20 | Unmapped Route 404 Routing | `GET /api/unknown-xyz` | HTTP 404 with structured JSON | HTTP 404 structured JSON | **PASS** |

---

## 4. Minor Observations & Future Hardening Recommendations (Non-Blocking)

1. **Non-String Email Type Guard**:
   - In `src/controllers/authController.js:51`, calling `email.toLowerCase()` assumes `email` is a string. If a caller sends `{ email: 12345 }`, a `TypeError` occurs and is caught by `errorHandler` returning HTTP 500.
   - *Mitigation for M2*: Prepend an explicit type check `if (typeof email !== 'string' || typeof password !== 'string') return res.status(400)...`.
   - *Impact*: Very Low; NoSQL injection is completely prevented because non-strings never reach MongoDB.

2. **Integer Quantity Validation on Line Items**:
   - `cartItemSchema` specifies `min: [1, 'Quantity must be at least 1']`. In M2 when `cartController` is implemented, enforce `Number.isInteger(quantity)` so fractional units (e.g. 1.5) cannot be ordered.

---

## 5. Unchallenged Areas

- **Full Catalog Search/Filter Endpoints (`/api/products`)**: Planned for Milestone 2.
- **Cart Add/Update/Remove Endpoints (`/api/cart`)**: Planned for Milestone 2.
- **Checkout, Order Creation & Mock Payment Endpoints (`/api/orders`)**: Planned for Milestone 2.
- **Frontend Glassmorphism SPA**: Planned for Milestone 3.

---

## 6. Empirical Challenger Verdict

### **VERDICT: APPROVE**

The Milestone 1 backend code is resilient, well-architected, mathematically rigorous, securely credentialed, and adheres to all project specifications and E2E contracts. It is approved to proceed to Milestone 2.
