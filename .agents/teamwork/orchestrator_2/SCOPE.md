# Scope: Milestone 5 — Admin Dashboard

## Architecture

VelvetAura Milestone 5 adds an authenticated, role-protected Admin Dashboard to the full-stack e-commerce web application, preserving the luxury dark obsidian and glassmorphism aesthetic.

### 1. Backend Architecture & RBAC
- **Auth Middleware (`src/middleware/authMiddleware.js`)**:
  - Export `admin` middleware checking `req.user && req.user.role === 'admin'`.
  - Non-authenticated requests return `401 Unauthorized` via `protect`.
  - Authenticated non-admin requests return `403 Forbidden` (`{ success: false, message: 'Access denied: Administrator privileges required', error: 'Forbidden' }`).
- **Product Routes & Controller (`src/routes/productRoutes.js`, `src/controllers/productController.js`)**:
  - `POST /api/products` (guarded by `protect, admin`): Creates a new product. Validates `name` (>=2), `brand`, `origin`, `category` (enum), `description` (>=10), `price` (>=0), `stock` (>=0).
  - `PUT /api/products/:id` (guarded by `protect, admin`): Updates existing product by ID.
  - `DELETE /api/products/:id` (guarded by `protect, admin`): Deletes existing product by ID.
- **Order Routes & Controller (`src/routes/orderRoutes.js`, `src/controllers/orderController.js`)**:
  - `GET /api/orders` (guarded by `protect, admin`): Returns all orders across all customers, populated with `user: { name, email, role }`, sorted by `createdAt: -1`.
  - `PUT /api/orders/:id/status` (guarded by `protect, admin`): Updates order fulfillment status against allowed enum: `['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled']`. Validates enum, handles 400 for invalid status, 404 for missing order.

### 2. Frontend Architecture
- **API Client (`public/js/api.js`)**:
  - Add admin methods: `createProduct(productData)`, `updateProduct(id, productData)`, `deleteProduct(id)`, `getAllOrders()`, `updateOrderStatus(orderId, status)`.
- **State Store (`public/js/store.js`)**:
  - Add `admin` slice containing `{ activeTab: 'products', orders: [], isSaving: false, error: null }`.
  - Add actions: `fetchAdminOrders()`, `createAdminProduct(data)`, `updateAdminProduct(id, data)`, `deleteAdminProduct(id)`, `updateAdminOrderStatus(id, status)`, `setAdminActiveTab(tab)`.
- **Navbar (`public/js/components/navbar.js`)**:
  - Render "Admin Dashboard" link (`#nav-admin-link`) in navbar actions and user dropdown strictly when `authState.user?.role === 'admin'`.
- **SPA Routing & Guard (`public/js/app.js`, `public/index.html`)**:
  - Mount point: `<section id="admin-view-container" class="admin-section hidden" aria-label="Admin Dashboard"></section>`.
  - Guard route `#/admin`: Check `store.getState('auth')`. If not authenticated or not admin, redirect to `#/catalog` with error toast.
  - Subscribe to `auth` slice so dynamic logout or token expiration immediately evicts user from `#/admin`.
- **Admin Dashboard Component (`public/js/components/adminDashboard.js`)**:
  - Tabbed interface matching dark glassmorphism design:
    - Tab 1: Product Management (Summary metrics, data table of products, "Add Product" modal, "Edit Product" modal, "Delete Product" confirmation modal).
    - Tab 2: Order Management (Orders table showing Order #, Customer, Date, Items, Total, Payment status, Fulfillment status dropdown updater).
- **Styling (`public/css/components.css`)**:
  - Dedicated classes for admin table, KPI cards, status badges, action buttons, admin modals.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Admin RBAC Middleware | `admin` middleware in `authMiddleware.js` enforcing `req.user.role === 'admin'` with HTTP 403 Forbidden | M5 | Sentinel Dispatch / Explorer 1 |
| 2 | Product Create API | `POST /api/products` (protected, admin-only) with validation | M5 | Sentinel Dispatch / Explorer 1 |
| 3 | Product Update API | `PUT /api/products/:id` (protected, admin-only) | M5 | Sentinel Dispatch / Explorer 1 |
| 4 | Product Delete API | `DELETE /api/products/:id` (protected, admin-only) | M5 | Sentinel Dispatch / Explorer 1 |
| 5 | Order Oversight API | `GET /api/orders` (protected, admin-only) returning all orders with user details | M5 | Sentinel Dispatch / Explorer 1 |
| 6 | Order Status Update API | `PUT /api/orders/:id/status` (protected, admin-only) validating enum | M5 | Sentinel Dispatch / Explorer 1 |
| 7 | Client API Admin Methods | `createProduct`, `updateProduct`, `deleteProduct`, `getAllOrders`, `updateOrderStatus` in `api.js` | M5 | Sentinel Dispatch / Explorer 1 & 2 |
| 8 | Protected Route `#/admin` | SPA route guard in `app.js` with redirection for unauthenticated & non-admin users | M5 | Sentinel Dispatch / Explorer 2 |
| 9 | Navbar Admin Link | "Admin Dashboard" link in navbar & dropdown visible exclusively to admin | M5 | Sentinel Dispatch / Explorer 2 |
| 10 | Admin Dashboard UI Component | `adminDashboard.js` with Product CRUD modals/tables and Order status updater | M5 | Sentinel Dispatch / Explorer 2 |
| 11 | Dark-Mode Glassmorphism CSS | Admin styling matching obsidian canvas, translucent glass cards, gold/purple accents | M5 | Sentinel Dispatch / Explorer 2 |
| 12 | Automated Verification Suite | `tests/admin.test.js` covering RBAC, Product CRUD, Order management, ensuring 100% pass | M5 | Verification Requirement / Explorer 3 |

---

## Code Layout & Ownership
The following files are modified or created for Milestone 5:
- `src/middleware/authMiddleware.js`: Add `admin` authorization middleware.
- `src/controllers/productController.js`: Add `createProduct`, `updateProduct`, `deleteProduct`.
- `src/routes/productRoutes.js`: Register `POST /`, `PUT /:id`, `DELETE /:id` guarded by `protect, admin`.
- `src/controllers/orderController.js`: Add `getAllOrders`, `updateOrderStatus`.
- `src/routes/orderRoutes.js`: Register `GET /`, `PUT /:id/status` guarded by `protect, admin`.
- `public/js/api.js`: Add admin REST methods.
- `public/js/store.js`: Add admin state slice and actions.
- `public/js/components/navbar.js`: Add role-based Admin Dashboard link rendering.
- `public/js/components/adminDashboard.js`: New component implementing Product and Order management views.
- `public/js/app.js`: Add `#/admin` route guard, mount admin component, subscribe to auth changes.
- `public/index.html`: Add `#admin-view-container` mounting point.
- `public/css/components.css`: Add admin dashboard styles.
- `tests/admin.test.js`: New comprehensive test suite for Milestone 5 admin capabilities.
