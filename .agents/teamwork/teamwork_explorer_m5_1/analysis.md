# VelvetAura Milestone 5: Backend Architecture & Auth/RBAC Exploration Report

**Investigator**: `teamwork_explorer_m5_1`  
**Date**: 2026-11-04  
**Milestone**: Milestone 5 — Admin Dashboard  
**Status**: Investigation Complete  

---

## Executive Summary

This exploration analyzes the backend architecture, data models, authentication/RBAC layer, product catalog endpoints, order management workflows, and frontend API client wrapper for **Milestone 5: Admin Dashboard**.

Key findings:
1. **User & Auth/RBAC**: The `User` model (`src/models/User.js`) already defines `role: { type: String, enum: ['customer', 'admin'], default: 'customer' }`. The demo admin account (`admin@velvetaura.com` / `AdminPassword123!`) in `src/data/seed.js` is seeded with `role: 'admin'`. However, **no admin authorization middleware currently exists** in `src/middleware/authMiddleware.js`. An admin guard (e.g. `requireAdmin`) must be created to enforce HTTP 403 Forbidden on privileged endpoints.
2. **Product Catalog CRUD**: `src/routes/productRoutes.js` and `src/controllers/productController.js` currently provide public read-only endpoints (`GET /categories`, `GET /`, `GET /:id`). Admin endpoints for product creation (`POST /api/products`), modification (`PUT /api/products/:id`), and deletion (`DELETE /api/products/:id`) **do not exist** and must be added with admin RBAC guards and strict payload validation according to `Product` model schema constraints.
3. **Order Management**: `src/routes/orderRoutes.js` and `src/controllers/orderController.js` only expose customer checkout (`POST /checkout`), customer order history (`GET /my-orders`), and single order viewing (`GET /:id`). **No admin endpoint exists to list all customer orders across all users**, and **no endpoint exists to update an order's status**. Valid order statuses in the schema are `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']`. Endpoints `GET /api/orders` (populating user name and email) and `PUT /api/orders/:id/status` must be added.
4. **API Client Wrapper**: `public/js/api.js` contains methods for customer operations but lacks admin functions. Methods `createProduct(productData)`, `updateProduct(id, productData)`, `deleteProduct(id)`, `getAllOrders()`, and `updateOrderStatus(id, status)` need to be implemented.

---

## Detailed Investigation Findings

### 1. User Model, Authentication & Role-Based Access Control (RBAC)

#### 1.1 Schema Definition & Field Constraints (`src/models/User.js`)
- **Location**: `src/models/User.js`, lines 54-58.
- **Code**:
  ```javascript
  role: {
    type: String,
    enum: ['customer', 'admin'],
    default: 'customer',
  },
  ```
- **Defaulting & Serialization**:
  - Newly created users default to `'customer'`.
  - In `src/models/User.js` lines 70-86 (`toJSON` and `toObject` transforms), only `password` and `__v` are deleted. The `role` attribute is explicitly preserved in the JSON output, along with `id = ret._id`.
  - Password hashing is safely isolated in a `pre('save')` hook (`src/models/User.js:89-110`).

#### 1.2 Registration & Login Controllers (`src/controllers/authController.js`)
- **Registration Privilege Escalation Guard** (`src/controllers/authController.js:92-98`):
  When a user registers via `POST /api/auth/register`, the controller explicitly extracts:
  ```javascript
  const user = await User.create({
    name: name.trim(),
    email: cleanEmail,
    password,
    address: address || shippingAddress || {},
    shippingAddress: shippingAddress || address || {},
  });
  ```
  `role` is not passed to `User.create()`, so arbitrary clients cannot self-promote to `admin` through registration payloads.
- **Payload Return**:
  In `register` (lines 113-122), `login` (lines 182-192), `getMe` (lines 216-226), and `updateProfile` (lines 277-287), the `role` field is explicitly returned in `user.role`.
- **Profile Update Protection**:
  In `updateProfile` (`src/controllers/authController.js:238-292`), only `name`, `address`, and `shippingAddress` can be modified. The `role` property is ignored, preventing post-registration privilege escalation.

#### 1.3 Seeding of Existing Admin Account (`src/data/seed.js`)
- **Location**: `src/data/seed.js`, lines 20-33:
  ```javascript
  {
    name: 'VelvetAura Administrator',
    email: 'admin@velvetaura.com',
    password: 'AdminPassword123!',
    role: 'admin',
    address: {
      street: '1 Place Vendôme',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France',
    },
  }
  ```
- In `seedInitialData` (`src/data/seed.js:108`), `User.create(userData)` passes the entire demo user object into Mongoose, properly creating the administrator record with `role: 'admin'`.

#### 1.4 Existing Middleware Gap & Required Admin Guard (`src/middleware/authMiddleware.js`)
- **Current State**: `src/middleware/authMiddleware.js` only exports:
  - `protect`: extracts Bearer token, verifies JWT, loads `req.user = await User.findById(decoded.id).select('-password')`. Returns HTTP 401 if token is missing or invalid.
  - `optionalAuth`: extracts user if token provided, but does not block requests.
- **Gap**: There is **no role authorization middleware**. If a customer accesses an admin route protected only by `protect`, `req.user` is populated, but the route executes without checking if `req.user.role === 'admin'`.
- **Recommendation**: Add `requireAdmin` (or `admin` / `authorize('admin')`) middleware in `src/middleware/authMiddleware.js`:
  ```javascript
  /**
   * Admin authorization middleware
   * Enforces role === 'admin'. Must run after protect middleware.
   */
  const requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Administrator privileges required',
        error: 'Access denied: Administrator privileges required',
      });
    }
    next();
  };
  ```
  - Standard status code: `403 Forbidden` (user is authenticated, but lacks permissions).
  - Export `requireAdmin` from `src/middleware/authMiddleware.js`.

---

### 2. Product Catalog Backend & CRUD Operations

#### 2.1 Current Endpoints (`src/routes/productRoutes.js`, `src/controllers/productController.js`)
- Currently mounted in `src/app.js:69` at `/api/products`:
  - `GET /api/products/categories` -> taxonomy categories and origins
  - `GET /api/products` -> filtered, sorted, paginated product list
  - `GET /api/products/:id` -> single product details
- All current product endpoints are public (`getProducts`, `getCategories`, `getProductById`).

#### 2.2 Product Model Schema Constraints (`src/models/Product.js`)
To safely create and update products, controllers must adhere to these schema definitions:

| Field | Type | Required | Constraints / Default | Notes |
|---|---|---|---|---|
| `name` | String | **Yes** | `minlength: 2`, `maxlength: 150`, trimmed | Unique display name |
| `brand` | String | **Yes** | trimmed | Luxury brand name (e.g., "Maison Francis Kurkdjian") |
| `origin` | String | **Yes** | trimmed | Country of provenance (e.g., "France", "South Korea") |
| `category` | String | **Yes** | Enum: `['skincare', 'cosmetics', 'fragrances', 'haircare']` | Case-sensitive in schema; controller should normalize to lowercase |
| `subcategory` | String | No | default: `''`, trimmed | Optional sub-classification |
| `description` | String | **Yes** | `minlength: 10`, trimmed | Detailed description |
| `price` | Number | **Yes** | `min: 0` | Price in USD |
| `originalPrice` | Number | No | `min: 0`, default: `null` | Strikethrough price for discounts |
| `currency` | String | No | default: `'USD'` | |
| `stock` | Number | **Yes** | `min: 0`, default: `0` | Available inventory count |
| `rating` | Number | No | `min: 0`, `max: 5`, default: `4.8` | |
| `numReviews` | Number | No | `min: 0`, default: `0` | |
| `images` | [String] | No | default: `[]` | Array of image URLs |
| `image` | Virtual | No | Getter/Setter virtual | Sets `images[0]` if set as single string; returns `images[0]` |
| `featured` | Boolean | No | default: `false` | Highlighted on homepage |
| `volume` | String | No | default: `''`, trimmed | e.g. "50 ml", "1.7 fl oz" |
| `tags` | [String] | No | default: `[]` | Search tags |
| `specs` / `specifications` | Mixed | No | default: `{}` | Pre-validate hook mirrors `specs` and `specifications` |

#### 2.3 Required CRUD Endpoints to Add

1. **`POST /api/products` (Create Product)**:
   - **Protection**: `protect, requireAdmin`
   - **Controller**: `createProduct`
   - **Validation**:
     - Required: `name`, `brand`, `origin`, `category`, `description`, `price`.
     - Numeric validation: `price` must be a valid number `>= 0`; `stock` (if provided) must be a non-negative integer `>= 0` (defaults to 0).
     - Category validation: Normalize `category.toLowerCase()`; ensure it matches one of `['skincare', 'cosmetics', 'fragrances', 'haircare']`.
     - String length: `name` (2-150 chars), `description` (>= 10 chars).
     - Image handling: If `image` string is provided, assign to `images: [image]`. If empty, provide luxury fallback placeholder `/assets/images/placeholder.svg`.
   - **Status Code**: `201 Created` with `{ success: true, message: 'Product created successfully', product }`.

2. **`PUT /api/products/:id` (Update Product)**:
   - **Protection**: `protect, requireAdmin`
   - **Controller**: `updateProduct`
   - **Validation**:
     - Check `mongoose.Types.ObjectId.isValid(id)` -> return `400 Bad Request` if invalid.
     - Find product by ID (`Product.findById(id)`) -> return `404 Not Found` if missing.
     - If updating `price`: validate `>= 0`.
     - If updating `stock`: validate `>= 0`.
     - If updating `category`: validate in enum.
     - If updating `name`: validate length 2-150.
     - If updating `description`: validate length >= 10.
     - Update fields and call `product.save()` or `findByIdAndUpdate` with `{ runValidators: true, new: true }`.
   - **Status Code**: `200 OK` with `{ success: true, message: 'Product updated successfully', product }`.

3. **`DELETE /api/products/:id` (Delete Product)**:
   - **Protection**: `protect, requireAdmin`
   - **Controller**: `deleteProduct`
   - **Validation**:
     - Check `mongoose.Types.ObjectId.isValid(id)` -> return `400 Bad Request` if invalid.
     - Find product by ID -> return `404 Not Found` if missing.
     - Execute `await product.deleteOne()` or `Product.findByIdAndDelete(id)`.
   - **Status Code**: `200 OK` with `{ success: true, message: 'Product removed successfully' }`.

#### 2.4 Route Ordering Considerations in `src/routes/productRoutes.js`
Notice lines 19-22 of `src/routes/productRoutes.js`:
```javascript
// Specific routes first to prevent :id parameter shadowing
router.get('/categories', getCategories);
router.get('/', getProducts);
router.get('/:id', getProductById);
```
When mounting `POST /`, `PUT /:id`, and `DELETE /:id`, ensure parameter shadowing rules are preserved. `POST /` mounts on `/`, while `PUT /:id` and `DELETE /:id` mount on `/:id`.

---

### 3. Order Management Backend & Admin Capabilities

#### 3.1 Order Storage Architecture (`src/models/Order.js`)
- **Structure**:
  - `orderNumber`: Unique alphanumeric identifier (`VA-YYYYMMDD-XXXX`), indexed.
  - `user`: ObjectId referencing `User` model, indexed, required.
  - `items`: Immutable snapshots of purchased products (`product` ObjectId, `name`, `brand`, `origin`, `price`, `quantity`, `image`).
  - `shippingAddress`: Destination (`fullName`, `street`, `addressLine1`, `addressLine2`, `city`, `state`, `zip`, `postalCode`, `country`, `phone`).
  - `pricing`: Financial ledger snapshot (`subtotal`, `tax`, `shipping`, `grandTotal`).
  - `payment`: Mock payment record (`transactionId`, `method`, `status`, `paidAt`, `cardLast4`).
  - `status`: Order progression state.
  - `timestamps`: `createdAt`, `updatedAt`.

#### 3.2 Valid Order Status Values (`src/models/Order.js:143-151`)
The schema enforces the following enumerated values for `status`:
```javascript
status: {
  type: String,
  enum: [
    'pending',
    'confirmed',
    'processing',
    'completed',
    'shipped',
    'delivered',
    'cancelled',
  ],
  default: 'completed',
}
```
Any status update must be validated against this exact set of 7 states.

#### 3.3 Existing Order Routes Gap
- Currently `src/routes/orderRoutes.js` has:
  ```javascript
  router.use(protect);
  router.post('/checkout', checkout);
  router.get('/my-orders', getMyOrders);
  router.get('/:id', getOrderById);
  ```
- **Gaps**:
  1. No endpoint to list **all customer orders across all users**.
  2. No endpoint to **update order status**.

#### 3.4 Required Order Endpoints to Add

1. **`GET /api/orders` (List All Orders for Admin)**:
   - **Protection**: `protect, requireAdmin`
   - **Controller**: `getAllOrders`
   - **Implementation**:
     ```javascript
     const orders = await Order.find({})
       .populate('user', 'name email role')
       .sort({ createdAt: -1 });
     ```
   - **Key Requirement**: Populating `user` with `'name email role'` allows the admin table to display the purchasing customer's identity alongside the order number, total, date, and status.
   - **Status Code**: `200 OK` with `{ success: true, count: orders.length, orders }`.

2. **`PUT /api/orders/:id/status` (Update Order Status)**:
   - **Protection**: `protect, requireAdmin`
   - **Controller**: `updateOrderStatus`
   - **Validation**:
     - Validate `mongoose.Types.ObjectId.isValid(id)` -> return `400 Bad Request` if invalid.
     - Validate `req.body.status` presence -> return `400 Bad Request` if missing.
     - Validate against allowed enum: `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']` -> return `400 Bad Request` with message listing allowed values if invalid.
     - Find order by ID -> return `404 Not Found` if missing.
     - Set `order.status = req.body.status.toLowerCase()`, then `await order.save()`.
   - **Status Code**: `200 OK` with `{ success: true, message: 'Order status updated successfully', order }`.
   - Note: For maximum API flexibility, supporting both `PUT /api/orders/:id/status` and `PUT /api/orders/:id` (with `{ status }` in body) or alias `PATCH /api/orders/:id/status` avoids frontend routing friction.

---

### 4. API Client Wrapper (`public/js/api.js`) & Frontend Integration

#### 4.1 Existing Client Methods in `public/js/api.js`
The `ApiClient` class currently exposes:
- **Auth**: `register`, `login`, `getMe`, `updateProfile`
- **Catalog**: `getProducts`, `getProduct`, `getCategories`
- **Cart**: `getCart`, `addToCart`, `updateCartItem`, `removeCartItem`, `clearCart`
- **Orders**: `checkout`, `getMyOrders`, `getOrder`
- **System**: `getHealth`

All requests automatically attach `Authorization: Bearer <token>` from `localStorage` via `getToken()` (`public/js/api.js:76-79`).

#### 4.2 Methods Needed in `public/js/api.js` for Admin Operations
The following methods should be added to the `ApiClient` class:

```javascript
// =========================================================================
// 6. Admin Management Endpoints
// =========================================================================

/**
 * Admin: Create a new product in the catalog
 * @param {Object} productData
 * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
 */
async createProduct(productData) {
  return this.request('/products', {
    method: 'POST',
    body: productData,
  });
}

/**
 * Admin: Update an existing product
 * @param {string} id - Product ObjectId
 * @param {Object} productData
 * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
 */
async updateProduct(id, productData) {
  return this.request(`/products/${id}`, {
    method: 'PUT',
    body: productData,
  });
}

/**
 * Admin: Delete a product from catalog
 * @param {string} id - Product ObjectId
 * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
 */
async deleteProduct(id) {
  return this.request(`/products/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Admin: Retrieve all customer orders across all users
 * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
 */
async getAllOrders() {
  return this.request('/orders', {
    method: 'GET',
  });
}

/**
 * Admin: Update status of an existing order
 * @param {string} orderId - Order ObjectId
 * @param {string} status - New order status (e.g. 'processing', 'shipped')
 * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
 */
async updateOrderStatus(orderId, status) {
  return this.request(`/orders/${orderId}/status`, {
    method: 'PUT',
    body: { status },
  });
}
```

#### 4.3 Frontend Store & Routing Integration Points
To fulfill the user's Milestone 5 requirements:
1. **Store helper (`public/js/store.js`)**:
   - Provide an accessor/getter:
     ```javascript
     isAdmin() {
       return this.state.auth.isAuthenticated && this.state.auth.user?.role === 'admin';
     }
     ```
2. **Navbar (`public/js/components/navbar.js`)**:
   - In `renderAuthSection(authState)` (lines 102-137):
     When `authState.user?.role === 'admin'`, render an "Admin Dashboard" navigation button or dropdown item:
     ```html
     <a href="#/admin" class="dropdown-item" id="nav-admin-dashboard-link" style="color: var(--accent-gold); font-weight: 600;">
       👑 Admin Dashboard
     </a>
     ```
     Also consider a top-level badge/link in `#nav-auth-container` or `.navbar-actions` next to the user avatar:
     ```html
     <a href="#/admin" class="nav-admin-pill" id="nav-admin-btn">Admin</a>
     ```
3. **SPA Router (`public/js/app.js`)**:
   - In `handleRouting()`:
     When `hash.startsWith('#/admin')`:
     - If not authenticated or `store.getState('auth').user?.role !== 'admin'`:
       - Show toast: `"Access denied: Administrator privileges required"`
       - Redirect to `#/catalog` or trigger `store.openAuthModal('login')`
     - If admin:
       - Hide `#hero-banner`, `#catalog-container`, `#account-view-container`, `#order-confirmation-container`
       - Unhide `#admin-view-container` and render the admin dashboard component.
4. **Mounting Container (`public/index.html`)**:
   - Add `<section id="admin-view-container" class="admin-section hidden" aria-label="Admin Dashboard"></section>` within `#app-root`.

---

## Technical Recommendations for Implementer

1. **RBAC Middleware**:
   - Create `requireAdmin` in `src/middleware/authMiddleware.js`.
   - Export both `protect` and `requireAdmin`.
   - Apply `protect, requireAdmin` to all admin routes.
2. **Product Controller & Routes**:
   - Add `createProduct`, `updateProduct`, `deleteProduct` in `src/controllers/productController.js`.
   - Wire them in `src/routes/productRoutes.js`:
     - `router.post('/', protect, requireAdmin, createProduct)`
     - `router.put('/:id', protect, requireAdmin, updateProduct)`
     - `router.delete('/:id', protect, requireAdmin, deleteProduct)`
3. **Order Controller & Routes**:
   - Add `getAllOrders`, `updateOrderStatus` in `src/controllers/orderController.js`.
   - Wire them in `src/routes/orderRoutes.js`:
     - `router.get('/', protect, requireAdmin, getAllOrders)`
     - `router.put('/:id/status', protect, requireAdmin, updateOrderStatus)`
     - (Optionally also support `PUT /:id` or `PATCH /:id/status` as alias).
4. **Frontend API Wrapper**:
   - Add `createProduct`, `updateProduct`, `deleteProduct`, `getAllOrders`, `updateOrderStatus` to `ApiClient` in `public/js/api.js`.
5. **Testing**:
   - Add backend tests in `tests/admin.test.js`:
     - Test that non-admin (customer) gets 403 on `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`, `GET /api/orders`, `PUT /api/orders/:id/status`.
     - Test that unauthenticated client gets 401.
     - Test that admin (`admin@velvetaura.com`) can successfully create, update, delete products, list all orders, and change order status.
     - Test invalid status value rejection (400 Bad Request).
