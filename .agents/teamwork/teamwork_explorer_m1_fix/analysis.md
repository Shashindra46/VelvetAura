# Technical Analysis & Remediation Blueprint — Milestone 1 Fix Strategy

**Agent**: `teamwork_explorer_m1_fix`  
**Milestone**: M1 (Backend Foundation & Data Persistence)  
**Date**: 2026-11-04  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m1_fix\`  
**Target Files**:
1. `src/middleware/errorMiddleware.js`
2. `src/controllers/authController.js`
3. `src/models/Product.js`

---

## 1. Executive Summary

Following the adversarial audit and stress analysis performed by `teamwork_challenger_m1_2` (Verdict: `REQUEST_CHANGES`), this investigation conducted a thorough code inspection, call-chain trace, and failure mode analysis on the three flagged defects in Milestone 1.

All three defects have been verified:
1. **Malformed JSON Error Status (`src/middleware/errorMiddleware.js`)**: The centralized `errorHandler` derives `statusCode` solely from `res.statusCode !== 200 ? res.statusCode : 500`. Because `res.statusCode` defaults to 200 before handlers run, Express's body-parser `SyntaxError` (which arrives with `err.status = 400`) is coerced into HTTP 500, directly violating the dispatch criterion ("ensure malformed payloads return 400").
2. **Unchecked Type Coercion (`src/controllers/authController.js`)**: In `register`, `login`, and `updateProfile`, input properties are checked for truthiness (`!name || !email || !password`) but not validated for string types. Non-string inputs (numbers, objects, or arrays) pass truthy checks and subsequently throw unhandled V8 `TypeError` exceptions (`name.trim is not a function`, `email.toLowerCase is not a function`), which trigger HTTP 500 instead of HTTP 400.
3. **Product Virtual `image` Mutator Bug (`src/models/Product.js`)**: The virtual setter `productSchema.virtual('image').set(...)` only assigns `this.images = [val]` when `(!this.images || this.images.length === 0)`. If `this.images` already contains elements, assigning `product.image = newUrl` silently no-ops, preventing updates to a product's primary hero image.

This document details the exact technical root cause for each issue, provides complete before/after code specifications, unified diff patches, and recommended regression tests to ensure 100% compliance.

---

## 2. Issue Deep-Dive & Evidence Chains

### 2.1 Issue 1: Malformed JSON Payload Status Code Coercion

#### Observation
- **File**: `src/middleware/errorMiddleware.js`, lines 24–67
- **Code**:
  ```javascript
  const errorHandler = (err, req, res, next) => {
    let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
    let message = err.message || 'Internal Server Error';
  ```
- When a client sends broken JSON syntax (e.g. `POST /api/auth/register` with body `{"name": "Broken", "email": `), Express's built-in `express.json()` (from `body-parser`) throws a `SyntaxError` decorated with:
  - `err.status = 400`
  - `err.statusCode = 400`
  - `err.type = 'entity.parse.failed'`
  - `err.name = 'SyntaxError'`
- Because the route handler is never reached, Express sets `res.statusCode` to its initial default `200`.
- In `errorHandler:25`, `res.statusCode && res.statusCode !== 200` evaluates to `false`.
- Therefore, `statusCode` defaults to `500`.
- The subsequent conditional branches (`CastError`, `ValidationError`, `code === 11000`, `JsonWebTokenError`, `TokenExpiredError`) do not match `SyntaxError`.
- Response sent to client: `HTTP 500 Internal Server Error` with `{ success: false, message: "Unexpected end of JSON input", error: "Unexpected end of JSON input" }`.

#### Requirement Violation
- `DISPATCH.md`: *"ensure ... malformed payloads return 400"*.
- RFC 7231 §6.5.1: Client syntax errors MUST yield 4xx (Bad Request), never 5xx (Internal Server Error).

#### Remediation Architecture
1. Compute `statusCode` using `err.status || err.statusCode || (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500)`.
2. Add an explicit check for JSON syntax parsing errors:
   ```javascript
   if (
     (err instanceof SyntaxError || err.name === 'SyntaxError') &&
     (err.status === 400 || err.statusCode === 400 || err.type === 'entity.parse.failed')
   ) {
     statusCode = 400;
     message = 'Invalid JSON payload. Please verify syntax.';
   }
   ```
3. Return normalized JSON payload with status 400.

---

### 2.2 Issue 2: Non-String Type Validation in Authentication Controller

#### Observation
- **File**: `src/controllers/authController.js`
- **Locations**:
  - `register` (lines 31–75):
    ```javascript
    const { name, email, password, address, shippingAddress } = req.body;
    if (!name || !email || !password) { ... }
    if (password.length < 6) { ... }
    const cleanEmail = email.toLowerCase().trim();
    ...
    name: name.trim(),
    ```
  - `login` (lines 118–128):
    ```javascript
    const { email, password } = req.body;
    if (!email || !password) { ... }
    const cleanEmail = email.toLowerCase().trim();
    ```
  - `updateProfile` (lines 222–224):
    ```javascript
    if (req.body.name) {
      user.name = req.body.name.trim();
    }
    ```
- When a client sends non-string values:
  - `{ "name": 12345, "email": "valid@luxury.test", "password": "Password123!" }` → `!name` is false; `.trim()` throws `TypeError: name.trim is not a function`.
  - `{ "name": "Camille", "email": 99999, "password": "Password123!" }` → `!email` is false; `.toLowerCase()` throws `TypeError: email.toLowerCase is not a function`.
  - `{ "name": "Camille", "email": { "$gt": "" }, "password": "Password123!" }` → NoSQL injection probe; `.toLowerCase()` throws `TypeError: email.toLowerCase is not a function`.
  - `{ "name": "Camille", "email": "valid@luxury.test", "password": 123456 }` → `password.length` is `undefined`; `undefined < 6` evaluates to `false`, bypassing password length checks, and fails during bcrypt hashing.
  - In `updateProfile`: `{ "name": 9876 }` → `req.body.name.trim()` throws `TypeError`.
- When these `TypeError` exceptions are thrown, they jump to `catch (error) { next(error); }`, which forwards them to `errorHandler` where they return HTTP 500 instead of HTTP 400.

#### Requirement Violation
- `PROJECT.md` Feature 4 & 5 (Input sanitization and validation).
- Standard REST contract: Malformed client data types must be rejected with HTTP 400 Bad Request.

#### Remediation Architecture
1. In `register`:
   - Immediately after presence check `if (!name || !email || !password)`, add:
     ```javascript
     if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
       return res.status(400).json({
         success: false,
         message: 'Name, email, and password must be valid strings',
         error: 'Name, email, and password must be valid strings',
       });
     }
     if (name.trim().length === 0) {
       return res.status(400).json({
         success: false,
         message: 'Please provide a valid name',
         error: 'Please provide a valid name',
       });
     }
     ```
2. In `login`:
   - Immediately after presence check `if (!email || !password)`, add:
     ```javascript
     if (typeof email !== 'string' || typeof password !== 'string') {
       return res.status(400).json({
         success: false,
         message: 'Email and password must be valid strings',
         error: 'Email and password must be valid strings',
       });
     }
     ```
3. In `updateProfile`:
   - Validate `name` if provided:
     ```javascript
     if (req.body.name !== undefined) {
       if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
         return res.status(400).json({
           success: false,
           message: 'Name must be a valid non-empty string',
           error: 'Name must be a valid non-empty string',
         });
       }
       user.name = req.body.name.trim();
     }
     ```

---

### 2.3 Issue 3: Product Virtual `image` Setter Mutation Bug

#### Observation
- **File**: `src/models/Product.js`, lines 122–127
- **Code**:
  ```javascript
  // Set virtual image setter or pre-save hook to populate images array if single image provided
  productSchema.virtual('image').set(function (val) {
    if (val && (!this.images || this.images.length === 0)) {
      this.images = [val];
    }
  });
  ```
- **Getter**:
  ```javascript
  productSchema.virtual('image').get(function () {
    return this.images && this.images.length > 0 ? this.images[0] : '';
  });
  ```
- **Scenario**:
  - An existing product has `images: ['/assets/images/product-front.webp', '/assets/images/product-back.webp']`.
  - A catalog update script or administrative service calls `product.image = '/assets/images/product-new-front.webp'`.
  - The setter condition `(!this.images || this.images.length === 0)` evaluates to `false`.
  - The setter exits without performing any mutation.
  - `product.image` continues to return the old image URL, silently ignoring updates.

#### Requirement Violation
- `PROJECT.md` Interface Contracts (Product schema: `image` virtual hero image property must support both reading and updating).

#### Remediation Architecture
1. When `val` is provided:
   - If `!this.images || !Array.isArray(this.images) || this.images.length === 0`, assign `this.images = [val];`.
   - If `this.images.length > 0`, update the first element: `this.images[0] = val;`.
   - Call `this.markModified && this.markModified('images');` to ensure Mongoose change tracking registers the in-place array index mutation.

---

## 3. Concrete File-by-File Remediation Blueprint

### 3.1 `src/middleware/errorMiddleware.js`

#### Target Line Range: 24–67
#### Proposed Replacement:
```javascript
/**
 * Global Centralized Error Handling Middleware
 * Intercepts operational and runtime errors, normalizing database, validation,
 * body-parser syntax, and authentication errors into standard JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode =
    err.status ||
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  let message = err.message || 'Internal Server Error';

  // 1. Express body-parser / JSON SyntaxError (malformed JSON payloads)
  if (
    (err instanceof SyntaxError || err.name === 'SyntaxError') &&
    (err.status === 400 || err.statusCode === 400 || err.type === 'entity.parse.failed')
  ) {
    statusCode = 400;
    message = 'Invalid JSON payload. Please verify syntax.';
  }

  // 2. Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = `Resource not found with ID: ${err.value}`;
  }

  // 3. Mongoose Schema Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // 4. Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // 5. JWT Verification Errors
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

---

### 3.2 `src/controllers/authController.js`

#### Target Line Ranges:
- `register`: lines 33–50
- `login`: lines 120–127
- `updateProfile`: lines 222–225

#### Proposed Replacement for `register`:
```javascript
    // Field presence validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
        error: 'Please provide name, email, and password',
      });
    }

    // Type validation: name, email, and password must be strings
    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password must be valid strings',
        error: 'Name, email, and password must be valid strings',
      });
    }

    // Check trimmed name is not blank
    if (name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid name',
        error: 'Please provide a valid name',
      });
    }

    // Password length validation
    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
        error: 'Password must be at least 6 characters long',
      });
    }
```

#### Proposed Replacement for `login`:
```javascript
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password',
        error: 'Please provide both email and password',
      });
    }

    // Type validation: email and password must be strings
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Email and password must be valid strings',
        error: 'Email and password must be valid strings',
      });
    }
```

#### Proposed Replacement for `updateProfile`:
```javascript
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Name must be a valid non-empty string',
          error: 'Name must be a valid non-empty string',
        });
      }
      user.name = req.body.name.trim();
    }
```

---

### 3.3 `src/models/Product.js`

#### Target Line Range: 122–127
#### Proposed Replacement:
```javascript
// Set virtual image setter to populate images array or update primary hero image
productSchema.virtual('image').set(function (val) {
  if (val) {
    if (!this.images || !Array.isArray(this.images) || this.images.length === 0) {
      this.images = [val];
    } else {
      this.images[0] = val;
      if (typeof this.markModified === 'function') {
        this.markModified('images');
      }
    }
  }
});
```

---

## 4. Verification & Regression Test Suite Additions

To ensure these three fixes are permanently validated within `npm test`, the following test blocks should be added to `tests/auth.test.js`:

```javascript
  describe('Input Hardening & Boundary Stress (M1 Fix Verifications)', () => {
    test('should return HTTP 400 when client sends malformed JSON payload', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{"name": "Broken", "email": ');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid json|syntax/i);
    });

    test('should reject registration when name, email, or password are non-string types', async () => {
      // Numeric name
      const res1 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 12345,
          email: 'valid@luxury.test',
          password: 'Password123!',
        });
      expect(res1.status).toBe(400);
      expect(res1.body.success).toBe(false);
      expect(res1.body.message).toMatch(/must be valid strings/i);

      // Object email (NoSQL injection probe)
      const res2 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Valid Name',
          email: { $gt: '' },
          password: 'Password123!',
        });
      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/must be valid strings/i);

      // Numeric password
      const res3 = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Valid Name',
          email: 'valid2@luxury.test',
          password: 123456,
        });
      expect(res3.status).toBe(400);
      expect(res3.body.success).toBe(false);
      expect(res3.body.message).toMatch(/must be valid strings/i);
    });

    test('should reject login when email or password are non-string types', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: { $gt: '' },
          password: 'Password123!',
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/must be valid strings/i);
    });

    test('Product model virtual image setter updates images[0] on existing items', () => {
      const product = new Product({
        name: 'Glow Serum',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        description: 'First care activating serum luxury edition.',
        price: 89.00,
        stock: 15,
        images: ['/images/first-care.webp', '/images/first-care-box.webp'],
      });

      expect(product.image).toBe('/images/first-care.webp');

      // Mutate hero image via setter
      product.image = '/images/first-care-v2.webp';
      expect(product.image).toBe('/images/first-care-v2.webp');
      expect(product.images[0]).toBe('/images/first-care-v2.webp');
      expect(product.images[1]).toBe('/images/first-care-box.webp'); // Secondary image retained

      // Set on newly initialized product without images
      const newProduct = new Product({
        name: 'Lip Tint',
        brand: 'Rom&nd',
        origin: 'South Korea',
        category: 'cosmetics',
        description: 'Juicy lasting tint in shade figfig.',
        price: 13.00,
        stock: 50,
      });
      newProduct.image = '/images/figfig.webp';
      expect(newProduct.image).toBe('/images/figfig.webp');
      expect(newProduct.images[0]).toBe('/images/figfig.webp');
    });
  });
```

---

## 5. Unified Remediation Patch

For immediate application by the implementation worker, the following unified diff specifies all required modifications:

```diff
--- a/src/middleware/errorMiddleware.js
+++ b/src/middleware/errorMiddleware.js
@@ -24,8 +24,19 @@
 const errorHandler = (err, req, res, next) => {
-  let statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
+  let statusCode =
+    err.status ||
+    err.statusCode ||
+    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);
   let message = err.message || 'Internal Server Error';
 
+  // Express body-parser / JSON SyntaxError (malformed JSON payloads)
+  if (
+    (err instanceof SyntaxError || err.name === 'SyntaxError') &&
+    (err.status === 400 || err.statusCode === 400 || err.type === 'entity.parse.failed')
+  ) {
+    statusCode = 400;
+    message = 'Invalid JSON payload. Please verify syntax.';
+  }
+
   // 1. Mongoose Bad ObjectId (CastError)
   if (err.name === 'CastError' && err.kind === 'ObjectId') {
     statusCode = 404;

--- a/src/controllers/authController.js
+++ b/src/controllers/authController.js
@@ -40,6 +40,24 @@
     }
 
+    // Type validation: name, email, and password must be strings
+    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
+      return res.status(400).json({
+        success: false,
+        message: 'Name, email, and password must be valid strings',
+        error: 'Name, email, and password must be valid strings',
+      });
+    }
+
+    // Check trimmed name is not blank
+    if (name.trim().length === 0) {
+      return res.status(400).json({
+        success: false,
+        message: 'Please provide a valid name',
+        error: 'Please provide a valid name',
+      });
+    }
+
     // Password length validation
     if (password.length < 6) {
@@ -124,4 +142,13 @@
     }
 
+    // Type validation: email and password must be strings
+    if (typeof email !== 'string' || typeof password !== 'string') {
+      return res.status(400).json({
+        success: false,
+        message: 'Email and password must be valid strings',
+        error: 'Email and password must be valid strings',
+      });
+    }
+
     const cleanEmail = email.toLowerCase().trim();
@@ -221,4 +248,11 @@
-    if (req.body.name) {
+    if (req.body.name !== undefined) {
+      if (typeof req.body.name !== 'string' || req.body.name.trim().length === 0) {
+        return res.status(400).json({
+          success: false,
+          message: 'Name must be a valid non-empty string',
+          error: 'Name must be a valid non-empty string',
+        });
+      }
       user.name = req.body.name.trim();
     }

--- a/src/models/Product.js
+++ b/src/models/Product.js
@@ -122,5 +122,12 @@
-// Set virtual image setter or pre-save hook to populate images array if single image provided
+// Set virtual image setter to populate images array or update primary hero image
 productSchema.virtual('image').set(function (val) {
-  if (val && (!this.images || this.images.length === 0)) {
-    this.images = [val];
+  if (val) {
+    if (!this.images || !Array.isArray(this.images) || this.images.length === 0) {
+      this.images = [val];
+    } else {
+      this.images[0] = val;
+      if (typeof this.markModified === 'function') {
+        this.markModified('images');
+      }
+    }
   }
 });
```

---

## 6. Synthesis & Reconciliation

| Requirement Source | Challenger Finding | Investigation Outcome | Resolution |
|--------------------|-------------------|----------------------|------------|
| `DISPATCH.md` completion criterion: "malformed payloads return 400" | F-01: `errorHandler` ignores `err.status`, returning 500 on broken JSON syntax | Confirmed. `res.statusCode` defaults to 200 before handlers execute. | Respect `err.status`/`err.statusCode` and explicitly map `SyntaxError` to HTTP 400. |
| `PROJECT.md` Feature 4 & 5 (Auth API robust validation) | F-02: Non-string inputs bypass truthiness check and throw unhandled `TypeError` | Confirmed. `.trim()` and `.toLowerCase()` on numbers/objects crash into 500. | Add explicit `typeof === 'string'` checks in `register`, `login`, and `updateProfile`. |
| `PROJECT.md` Product schema interface contract | F-03: Virtual `image` setter silently ignores updates if `this.images` has items | Confirmed. Setter strictly checks `(!this.images \|\| this.images.length === 0)`. | Update `this.images[0] = val` when `this.images` already exists, and mark modified. |

This remediation plan resolves all 3 identified issues without breaking any existing behavior or interface contracts.
