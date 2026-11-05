# Handoff Report: Milestone 5 Backend Architecture & Auth/RBAC Exploration

**Author**: `teamwork_explorer_m5_1` (Technical Exploration Specialist)  
**Recipient**: `orchestrator_1` / Sentinel  
**Target Milestone**: Milestone 5: Admin Dashboard  
**Date**: 2026-11-04  
**Handoff Type**: Hard (Exploration Phase Complete)  

---

## 1. Observation

### 1.1 Auth & RBAC Architecture
- **User Schema**: In `src/models/User.js:54-58`:
  ```javascript
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer',
  },
  ```
  `role` defaults to `'customer'`. The schema's `toJSON` and `toObject` transforms (`src/models/User.js:70-86`) strip `password` and `__v` while keeping `role`.
- **Registration Controller**: In `src/controllers/authController.js:92-98`, `User.create({ name: name.trim(), email: cleanEmail, password, address, shippingAddress })` does NOT accept or pass `role`, preventing self-registration as admin.
- **Login & Profile Returns**: In `src/controllers/authController.js:187`, `login` returns `role: user.role`. `getMe` (`src/controllers/authController.js:221`) and `updateProfile` (`src/controllers/authController.js:282`) also return `role: user.role`. `updateProfile` restricts updates to `name`, `address`, and `shippingAddress`.
- **Seed Data**: In `src/data/seed.js:20-33`, the demo admin account is defined:
  ```javascript
  {
    name: 'VelvetAura Administrator',
    email: 'admin@velvetaura.com',
    password: 'AdminPassword123!',
    role: 'admin',
    address: { street: '1 Place Vendôme', city: 'Paris', state: 'Ile-de-France', zip: '75001', country: 'France' }
  }
  ```
  In `src/data/seed.js:108`, `User.create(userData)` persists this user with `role: 'admin'`.
- **Middleware**: In `src/middleware/authMiddleware.js:13-61`, only `protect` and `optionalAuth` exist. `protect` loads `req.user = await User.findById(decoded.id).select('-password')`. **No admin authorization middleware exists**.

### 1.2 Product Catalog Backend
- **Current Routes**: In `src/routes/productRoutes.js:20-22`:
  - `GET /api/products/categories` -> `getCategories`
  - `GET /api/products` -> `getProducts`
  - `GET /api/products/:id` -> `getProductById`
- **Product Model Schema**: In `src/models/Product.js:11-109`:
  - Required fields: `name` (minlength 2, maxlength 150), `brand`, `origin`, `category` (enum: `['skincare', 'cosmetics', 'fragrances', 'haircare']`), `description` (minlength 10), `price` (min 0), `stock` (min 0, default 0).
  - Virtual image accessor: `src/models/Product.js:118-134` sets/gets `images[0]`.
  - Specs mirror hook: `src/models/Product.js:136-144` mirrors `specs` and `specifications`.
- **Current Missing Endpoints**:
  - `POST /api/products` (Create product)
  - `PUT /api/products/:id` (Update product)
  - `DELETE /api/products/:id` (Delete product)

### 1.3 Order Management Backend
- **Order Model Schema**: In `src/models/Order.js:103-160`:
  - `orderNumber`: Unique string (`VA-YYYYMMDD-XXXX`), auto-generated in pre-validate hook.
  - `user`: ObjectId ref `User`, required, indexed.
  - `items`: Snapshot items (`product`, `name`, `brand`, `origin`, `price`, `quantity`, `image`).
  - `shippingAddress`: Structured address.
  - `pricing`: `subtotal`, `tax`, `shipping`, `grandTotal`.
  - `payment`: `transactionId`, `method`, `status`, `paidAt`, `cardLast4`.
  - `status`: String enum in `src/models/Order.js:143-151`:
    `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']`. Default is `'completed'`.
- **Current Routes**: In `src/routes/orderRoutes.js:23-25`:
  - `POST /checkout` -> `checkout`
  - `GET /my-orders` -> `getMyOrders` (scoped to `user: req.user._id`)
  - `GET /:id` -> `getOrderById` (scoped to owner or admin)
- **Current Missing Endpoints**:
  - `GET /api/orders` (Admin endpoint to list all customer orders across all users with user details populated).
  - `PUT /api/orders/:id/status` (Admin endpoint to update order status).

### 1.4 API Client Wrapper
- In `public/js/api.js`:
  - Provides `ApiClient` singleton `api`.
  - Injects `Authorization: Bearer <token>` from `localStorage` (`public/js/api.js:76-79`).
  - Missing admin methods: `createProduct`, `updateProduct`, `deleteProduct`, `getAllOrders`, `updateOrderStatus`.

### 1.5 Baseline Test Execution
- Tool command: `npm test`
- Result: 7/7 test suites passed, 97/97 tests passed (100% pass rate).

---

## 2. Logic Chain

1. **RBAC Logic**:
   - `User.js` already supports the `role` enum (`'customer'` and `'admin'`).
   - The demo admin (`admin@velvetaura.com`) is seeded with `role: 'admin'`.
   - `login` and `me` endpoints return `role: 'admin'`.
   - However, since `authMiddleware.js` lacks an admin check, non-admin users could access any endpoint that only specifies `protect`.
   - Therefore, a dedicated `requireAdmin` middleware checking `req.user.role === 'admin'` returning `403 Forbidden` is required before implementing any admin routes.

2. **Product CRUD Logic**:
   - `Product.js` specifies strict validation rules: `category` enum (`'skincare'`, `'cosmetics'`, `'fragrances'`, `'haircare'`), min lengths for `name` (2) and `description` (10), non-negative numbers for `price` and `stock`.
   - The existing `productRoutes.js` mounts `GET /categories` before `GET /:id` to avoid shadowing.
   - Therefore, adding `POST /` (`protect, requireAdmin`), `PUT /:id` (`protect, requireAdmin`), and `DELETE /:id` (`protect, requireAdmin`) in `productRoutes.js` and `productController.js` satisfies product management requirements while maintaining route parameter hygiene.

3. **Order Management Logic**:
   - Admins need visibility into all customer purchases and order lifecycles.
   - `Order.find({}).populate('user', 'name email role').sort({ createdAt: -1 })` provides the exact customer identity and order history required for the admin orders view.
   - Order statuses are strictly restricted by Mongoose enum to `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']`.
   - Status updates must validate against this list and persist via `PUT /api/orders/:id/status` (and optional `PATCH /api/orders/:id` alias).

4. **Client API Logic**:
   - Adding admin methods to `ApiClient` in `public/js/api.js` automatically inherits JWT bearer token injection from existing auth storage, enabling seamless admin frontend functionality.

---

## 3. Caveats

- **No Caveats**: The codebase is well-structured, modular, and possesses zero test failures.
- **Route Order Precaution**: When mounting new routes in `src/routes/orderRoutes.js`, ensure `GET /` (`getAllOrders`) does not conflict with existing `/my-orders` or `/:id`. In Express, mounting `router.get('/', protect, requireAdmin, getAllOrders)` after `router.get('/my-orders', getMyOrders)` and before or alongside `/:id` works cleanly because `/` is the root mount point.

---

## 4. Conclusion

1. **Auth/RBAC**: Add `requireAdmin` to `src/middleware/authMiddleware.js` returning HTTP 403 on non-admin requests.
2. **Product Management**: Add `createProduct`, `updateProduct`, and `deleteProduct` to `src/controllers/productController.js` and wire them with `protect, requireAdmin` in `src/routes/productRoutes.js`.
3. **Order Management**: Add `getAllOrders` (populating `user` name/email) and `updateOrderStatus` (validating enum) to `src/controllers/orderController.js` and wire them with `protect, requireAdmin` in `src/routes/orderRoutes.js`.
4. **API Wrapper**: Add `createProduct`, `updateProduct`, `deleteProduct`, `getAllOrders`, and `updateOrderStatus` to `public/js/api.js`.
5. **Navbar & SPA Routing**: Add the Admin link to `public/js/components/navbar.js` conditioned on `authState.user?.role === 'admin'`, and add `#/admin` protected route handling in `public/js/app.js`.

---

## 5. Verification Method

To verify the investigation and downstream implementation:

1. **Verify Baseline Tests**:
   ```powershell
   npm test
   ```
   Expect: 7/7 suites passed, 97/97 tests passed.

2. **Verify Admin Account in Seed**:
   ```powershell
   node -e "const { demoUsers } = require('./src/data/seed'); console.log(demoUsers.find(u => u.role === 'admin'));"
   ```
   Expect: Output shows `email: 'admin@velvetaura.com'`, `role: 'admin'`.

3. **Verify Product Schema Enum**:
   Inspect `src/models/Product.js:34-37`:
   Expect: `enum: ['skincare', 'cosmetics', 'fragrances', 'haircare']`.

4. **Verify Order Status Enum**:
   Inspect `src/models/Order.js:143-151`:
   Expect: `enum: ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']`.

5. **Post-Implementation Test Command**:
   Implement automated test suite `tests/admin.test.js` covering:
   - 401 for unauthenticated requests
   - 403 for customer access to admin endpoints
   - 200/201 for admin operations (`POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, `GET /api/orders`, `PUT /api/orders/:id/status`)
   - 400 for invalid product fields or invalid order status.
