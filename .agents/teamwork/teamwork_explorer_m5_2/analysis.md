# Technical Analysis: Frontend Architecture, Navigation, State Management & UI Design for Milestone 5 (Admin Dashboard)

**Agent**: `teamwork_explorer_m5_2`  
**Date**: 2026-11-04  
**Project**: VelvetAura Luxury Imported Beauty E-Commerce Platform  
**Target Milestone**: Milestone 5 — Admin Dashboard UI & Protected Workflows  

---

## 1. Executive Summary

Milestone 5 introduces a luxury dark-mode glassmorphism **Admin Dashboard** to the VelvetAura SPA. This analysis details the complete frontend architecture required to support this feature:
1. **Client-Side Protected Routing**: Integrating `#/admin` into the hash router in `public/js/app.js` with defensive role validation, real-time auth observation, and automatic redirection.
2. **Navigation Bar Reactivity**: Conditionally rendering the "Admin Dashboard" link in `public/js/components/navbar.js` strictly when an authenticated user has `role: 'admin'`.
3. **State Management & REST API Layer**: Adding REST client methods in `public/js/api.js` and an `admin` reactive state slice with actions in `public/js/store.js` for full Product CRUD and Order Fulfillment management.
4. **UI Component Design**: Architecting `public/js/components/adminDashboard.js` adhering to the dark obsidian (`#0B0B13`), frosted glass (`--glass-card`, `--glass-elevated`), champagne gold (`#E0A96D`), and royal velvet (`#9D4EDD`) design tokens. Features include KPI summary cards, tabbed views for Product and Order management, responsive tables, prepopulated modal forms, safety-checked delete dialogs, and interactive order status dropdowns.
5. **CSS System Additions**: Establishing clean, modular styles for admin tables, badges, form grids, and modals within `public/css/components.css`.

---

## 2. Client Routing & Route Protection (`public/js/app.js` & `public/index.html`)

### 2.1 Current Routing Architecture
The VelvetAura SPA utilizes client-side hash routing managed in `public/js/app.js`:
- A global `window.addEventListener('hashchange', () => this.handleRouting())` listener is established during `VelvetAuraApp.init()` (line 45).
- `handleRouting()` (lines 61–100) reads `window.location.hash || '#/catalog'`, strips query parameters (`hash.split('?')[0]`), and toggles visibility classes (`hidden`) across container sections in `<main id="app-root">`.
- Existing routes include:
  - `#/account` — Displays `#account-view-container` and invokes `this.components.accountView.render()`.
  - `#/order/:id` — Displays `#order-confirmation-container` and invokes `this.components.orderConfirmation.loadOrder(orderId)`.
  - Default (`#/catalog` or unrecognized hash) — Displays `#hero-banner` and `#catalog-container`.

### 2.2 Adding the Protected `#/admin` Route
To support the Admin Dashboard, the routing flow must be enhanced with defensive route guards.

#### HTML Mounting Container (`public/index.html`)
Inside `<main id="app-root" class="main-layout" role="main">`, directly following `#order-confirmation-container` (line 120), insert:
```html
<!-- View E: Admin Dashboard (SPA router toggled, role-protected) -->
<section id="admin-dashboard-container" class="admin-section hidden" aria-label="Admin Dashboard"></section>
```

#### Protected Route Handler in `app.js`
Inside `handleRouting()`, add a check for `hash.startsWith('#/admin')`:
```javascript
if (hash.startsWith('#/admin')) {
  const authState = store.getState('auth');

  // Check 1: User must be authenticated
  if (!authState || !authState.isAuthenticated) {
    store.showToast('Please sign in with an administrator account', 'warning');
    window.location.hash = '#/catalog';
    store.openAuthModal('login');
    return;
  }

  // Check 2: Authenticated user must possess the 'admin' role
  if (authState.user?.role !== 'admin') {
    store.showToast('Access denied: Administrator privileges required', 'error');
    window.location.hash = '#/catalog';
    return;
  }

  // Route Granted: Toggle layout containers
  if (heroBanner) heroBanner.classList.add('hidden');
  if (catalogContainer) catalogContainer.classList.add('hidden');
  if (accountContainer) accountContainer.classList.add('hidden');
  if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');

  const adminContainer = document.querySelector('#admin-dashboard-container');
  if (adminContainer) {
    adminContainer.classList.remove('hidden');
    if (this.components.adminDashboard) {
      this.components.adminDashboard.render();
    }
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}
```

#### Real-Time Reactive Session Guard
If an admin is actively viewing `#/admin` and logs out, or if their session token expires, the interface must immediately transition back to `#/catalog` rather than remaining on a stale administrative screen.
In `VelvetAuraApp.init()`, register an auth subscriber:
```javascript
// Real-time auth session guard for protected routes
store.subscribe('auth', (auth) => {
  if (window.location.hash.startsWith('#/admin')) {
    if (!auth || !auth.isAuthenticated || auth.user?.role !== 'admin') {
      window.location.hash = '#/catalog';
      store.showToast('Administrator session ended', 'info');
    }
  }
});
```

#### Component Mounting in `app.js`
1. Import the component:
   ```javascript
   import { AdminDashboardComponent } from './components/adminDashboard.js';
   ```
2. In `init()`:
   ```javascript
   this.components.adminDashboard = new AdminDashboardComponent('#admin-dashboard-container');
   ```

---

## 3. Navigation Bar Component (`public/js/components/navbar.js`)

### 3.1 Current Auth Tracking Mechanism
In `NavbarComponent.init()` (lines 25–30), the component subscribes to the `'auth'` slice:
```javascript
this.unsubscribers.push(
  store.subscribe('auth', (auth) => {
    this.renderAuthSection(auth);
  })
);
```
`renderAuthSection(authState)` (lines 102–137) switches between:
- Logged-out state: Renders `#nav-login-btn` ("Sign In").
- Logged-in state: Renders `#user-avatar-btn` with user initials and `#nav-user-dropdown` with user name, "My Account", "Order History", and "Sign Out".

### 3.2 Rendering the "Admin Dashboard" Link
Requirement 4 explicitly states:
> *"Add an 'Admin Dashboard' link in the main Navbar that only appears when an admin is logged in."*

To ensure high visibility and accessibility, the link should be rendered in **two coordinated locations**:
1. **Prominently in the User Dropdown Menu (`#nav-user-dropdown`)**:
   Directly above "My Account", rendered conditionally:
   ```html
   ${authState.user?.role === 'admin' ? `
     <a href="#/admin" class="dropdown-item admin-dropdown-item" id="nav-admin-dashboard-link" style="color: var(--accent-gold); font-weight: 600; display: flex; align-items: center; gap: 6px;">
       <span>👑</span> Admin Dashboard
     </a>
   ` : ''}
   ```
2. **Prominently in Navbar Actions (`.navbar-actions`)**:
   Between the category/search center and the bag/avatar, render a dedicated gold-accented glass pill button when `role === 'admin'`:
   ```html
   <div id="nav-admin-action-container">
     ${authState.user?.role === 'admin' ? `
       <a href="#/admin" class="nav-admin-btn glass-pill active" id="nav-admin-btn" aria-label="Admin Dashboard">
         <span style="color: var(--accent-gold);">👑</span>
         <span>Admin Dashboard</span>
       </a>
     ` : ''}
   </div>
   ```

### 3.3 Event Delegation & Reactivity Lifecycle
- **Dropdown link click**: When an admin clicks `#nav-admin-dashboard-link`, event delegation in `navbar.js:bindEvents()` automatically closes the dropdown menu (`this.userDropdownOpen = false; dropdown.classList.add('hidden');`) and navigates to `#/admin`.
- **Login reactivity**: When an admin logs in (e.g. `admin@velvetaura.com`), `store.login()` updates the `auth` state slice. The observer immediately invokes `renderAuthSection(auth)`, displaying the "Admin Dashboard" links without page refresh.
- **Logout reactivity**: When `store.logout()` is clicked, `auth.isAuthenticated` becomes `false` and `auth.user` becomes `null`. `renderAuthSection()` re-renders the standard "Sign In" button, and the admin links vanish.

---

## 4. State Management (`public/js/store.js`) & REST API Client (`public/js/api.js`)

### 4.1 Current Auth Model
In `store.js`, the `auth` state is:
```javascript
auth: {
  user: null, // includes: { _id, name, email, role, address, shippingAddress, ... }
  token: null,
  isAuthenticated: false,
  loading: false,
}
```
Credentials and JWT are persisted in `localStorage` under key `'velvetaura_auth'`. Seed user `admin@velvetaura.com` (`AdminPassword123!`) has `role: 'admin'`, while standard customers have `role: 'customer'`.

### 4.2 REST API Client Extensions (`public/js/api.js`)
Add the following methods to `ApiClient` in `public/js/api.js`:

```javascript
// =========================================================================
// 6. Admin Management Endpoints
// =========================================================================

/**
 * Admin: Create a new catalog product
 * @param {Object} productData - { name, brand, origin, category, subcategory, price, stock, description, image, images, specs }
 */
async createProduct(productData) {
  return this.request('/products', {
    method: 'POST',
    body: productData,
  });
}

/**
 * Admin: Update an existing catalog product
 * @param {string} id - Product ObjectId
 * @param {Object} productData - Partial or full update payload
 */
async updateProduct(id, productData) {
  return this.request(`/products/${id}`, {
    method: 'PUT',
    body: productData,
  });
}

/**
 * Admin: Delete a catalog product
 * @param {string} id - Product ObjectId
 */
async deleteProduct(id) {
  return this.request(`/products/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Admin: Retrieve all customer orders across all users
 * @param {Object} [params] - Optional query params (status, sort, page, limit)
 */
async getAllOrders(params = {}) {
  return this.request('/orders', {
    method: 'GET',
    params,
  });
}

/**
 * Admin: Update fulfillment status of an order
 * @param {string} orderId - Order ObjectId
 * @param {string} status - 'pending'|'confirmed'|'processing'|'shipped'|'delivered'|'cancelled'
 */
async updateOrderStatus(orderId, status) {
  return this.request(`/orders/${orderId}/status`, {
    method: 'PUT',
    body: { status },
  });
}
```

### 4.3 Reactive State Slice: `admin` in `public/js/store.js`
Add an `admin` slice to `this.state` in `store.js`:
```javascript
admin: {
  activeTab: 'products',          // 'products' | 'orders'
  
  // Products Management
  products: [],                   // cached list of all products for admin table
  productsLoading: false,
  productsError: null,
  editingProduct: null,           // product object if editing, null if creating
  isProductModalOpen: false,      // toggles Add/Edit modal dialog
  productModalMode: 'create',     // 'create' | 'edit'
  isDeleteModalOpen: false,       // toggles Delete Confirmation dialog
  deletingProduct: null,          // { _id, name } of product pending deletion
  isSavingProduct: false,         // submission spinner flag
  
  // Orders Management
  orders: [],                     // list of all customer orders
  ordersLoading: false,
  ordersError: null,
  orderStatusFilter: 'all',       // 'all' | 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  orderSearchQuery: '',           // search by orderNumber, customer name, email
  isUpdatingOrderStatus: false,   // status updater flag
}
```

### 4.4 Admin Store Actions
Add the following methods to `Store`:
1. `setAdminTab(tab)`: Updates `admin.activeTab` ('products' | 'orders') and calls `this.notify('admin')`.
2. `fetchAdminProducts()`:
   - Sets `admin.productsLoading = true`, calls `api.getProducts({ limit: 100 })`.
   - On success: stores products in `admin.products`, resets loading, notifies `'admin'`.
3. `openCreateProductModal()`:
   - Sets `admin.editingProduct = null`, `admin.productModalMode = 'create'`, `admin.isProductModalOpen = true`.
   - Notifies `'admin'`.
4. `openEditProductModal(productId)`:
   - Finds product by `_id` in `admin.products` or `catalog.products`.
   - Sets `admin.editingProduct = product`, `admin.productModalMode = 'edit'`, `admin.isProductModalOpen = true`.
   - Notifies `'admin'`.
5. `closeAdminProductModal()`:
   - Sets `admin.isProductModalOpen = false`, `admin.editingProduct = null`.
   - Notifies `'admin'`.
6. `saveAdminProduct(productData)`:
   - Sets `admin.isSavingProduct = true`, notifies `'admin'`.
   - If mode is `'create'`: calls `api.createProduct(productData)`.
   - If mode is `'edit'`: calls `api.updateProduct(admin.editingProduct._id, productData)`.
   - On success:
     - Shows toast (`"Product created successfully"` or `"Product updated successfully"`).
     - Closes modal.
     - Re-fetches admin products (`this.fetchAdminProducts()`).
     - Refreshes customer catalog (`this.fetchProducts()`) to maintain cross-view parity.
   - On error: Shows error toast.
7. `openDeleteProductModal(productId)`:
   - Finds product, sets `admin.deletingProduct = product`, `admin.isDeleteModalOpen = true`.
   - Notifies `'admin'`.
8. `closeDeleteProductModal()`:
   - Sets `admin.isDeleteModalOpen = false`, `admin.deletingProduct = null`.
   - Notifies `'admin'`.
9. `confirmDeleteProduct()`:
   - Retrieves `productId = admin.deletingProduct._id`.
   - Calls `api.deleteProduct(productId)`.
   - On success:
     - Shows toast: `"Product permanently removed from catalog"`, `'success'`.
     - Closes delete modal.
     - Updates `admin.products` in memory (filter out deleted item).
     - Refreshes customer catalog (`this.fetchProducts()`).
   - On error: Shows error toast.
10. `fetchAdminOrders(params = {})`:
    - Sets `admin.ordersLoading = true`, notifies `'admin'`.
    - Calls `api.getAllOrders(params)`.
    - On success: sets `admin.orders = res.data.orders || res.data`, notifies `'admin'`.
11. `updateAdminOrderStatus(orderId, newStatus)`:
    - Calls `api.updateOrderStatus(orderId, newStatus)`.
    - On success:
      - Updates the matching order in `admin.orders`.
      - Shows instant glass toast: `"Order #${orderNumber || orderId} marked as ${newStatus}"`, `'success'`.
      - Notifies `'admin'`.
    - On error: Shows error toast with error message, re-renders to restore previous status.
12. `setAdminOrderStatusFilter(filter)`:
    - Sets `admin.orderStatusFilter = filter`, notifies `'admin'`.

---

## 5. UI Component Architecture (`public/js/components/adminDashboard.js`)

### 5.1 Component Structure
`AdminDashboardComponent` extends `BaseComponent` (`public/js/components/base.js`).
- Subscribes to `'admin'` slice: triggers re-render when tabs change, modals open/close, or items/orders are updated.
- Subscribes to `'auth'` slice: automatically redirects if session becomes invalid.

### 5.2 Visual Layout & Hierarchy

```
+-----------------------------------------------------------------------------------+
|  👑 VelvetAura Admin Control Center                                                |
|  Curated Haute Beauté Inventory & Global Cargo Order Fulfillment                   |
+-----------------------------------------------------------------------------------+
|  [ 24 Total Products ]  [ 8 Total Orders ]  [ 2 Low Stock Items ]  [ $1,842 Revenue ]  |
+-----------------------------------------------------------------------------------+
|  [ 🛍️ Product Management (Active) ]         [ 📦 Order Management ]               |
+-----------------------------------------------------------------------------------+
|  [Search products...] [Category Filter: All v]               [ + Add New Product ]|
+-----------------------------------------------------------------------------------+
|  THUMB  | NAME & BRAND        | ORIGIN    | CAT      | PRICE  | STOCK | ACTIONS    |
|  [img]  | Crème de Nuit       | 🇫🇷 France | Skincare | $185   | 14    | [Edit][Del]|
|  [img]  | Velvet Rouge 888    | 🇫🇷 France | Cosmetics| $48    | 3 ⚠️  | [Edit][Del]|
+-----------------------------------------------------------------------------------+
```

### 5.3 Detailed Section Specifications

#### A. Header & KPI Metrics Cards
Display 4 glass cards with luminous icons and key metrics:
1. **Total Products**: Count of active items in catalog (`admin.products.length`).
2. **Total Customer Orders**: Count of historical purchases (`admin.orders.length`).
3. **Low Stock Alerts**: Count of items with stock $\le 5$ (flagged with amber accent).
4. **Gross Revenue**: Sum of `order.grandTotal` across all completed orders (formatted via `formatPrice`).

#### B. Tab Switcher
A frosted glass segmented pill control:
- Tab 1: `🛍️ Product Management` (`id="admin-tab-products"`)
- Tab 2: `📦 Order Management` (`id="admin-tab-orders"`)
Clicking either tab invokes `store.setAdminTab(tab)`.

#### C. Section A: Product Management View
1. **Admin Product Toolbar**:
   - Live Search Input (`id="admin-product-search"`): Filters table rows by product name, brand, or origin.
   - Category Filter Dropdown (`id="admin-category-filter"`): All, Skincare, Cosmetics, Fragrances, Haircare.
   - Action Button (`id="btn-open-add-product"`): High-contrast gold gradient button (`.btn-gold`) labeled `+ Add New Product`.
2. **Products Table (`.admin-table`)**:
   - Columns:
     - `Thumbnail`: 48x48px image preview with fallback placeholder onerror handler.
     - `Product & Brand`: Product name (in bold white) and brand (in champagne gold uppercase).
     - `Origin`: Provenance country with flag emoji (`🇫🇷 France`, `🇰🇷 South Korea`, etc.).
     - `Category`: Category badge.
     - `Price`: Currency formatted price (`$XX.XX`).
     - `Stock`: Inventory count with dynamic stock pills:
       - Green (`.stock-pill.in-stock`) for stock $> 5$.
       - Amber (`.stock-pill.low-stock`) for stock between $1$ and $5$.
       - Red (`.stock-pill.out-of-stock`) for stock $= 0$.
     - `Actions`:
       - Edit Button (`data-action="edit-product"`): Opens prepopulated Edit Modal.
       - Delete Button (`data-action="delete-product"`): Opens Delete Confirmation Modal.

3. **Add / Edit Product Modal (`.glass-elevated`)**:
   - Triggered when `admin.isProductModalOpen === true`.
   - Title: `Add New Imported Beauty Product` or `Edit Product: {Name}`.
   - Fields:
     - Name (`input text`, required, min 2 chars)
     - Brand (`input text`, required)
     - Origin (`select` or `input text`, France, South Korea, Japan, Germany, UK, USA, Sweden, Italy)
     - Category (`select`, skincare, cosmetics, fragrances, haircare)
     - Subcategory (`input text`, e.g. "Facial Oil", "Night Cream")
     - Price (`input number`, step 0.01, min 0, required)
     - Compare/Original Price (`input number`, step 0.01, min 0)
     - Stock (`input number`, step 1, min 0, required)
     - Rating (`input number`, step 0.1, min 0, max 5, default 4.8)
     - Image URL (`input url` with live thumbnail preview)
     - Description (`textarea`, required, min 10 chars)
   - Form Submission:
     - Sanitizes inputs, casts numeric fields.
     - Submits through `store.saveAdminProduct(data)`.
     - Displays loading state on submit button.

4. **Delete Product Confirmation Modal (`.glass-elevated`)**:
   - Triggered when `admin.isDeleteModalOpen === true`.
   - Shows danger warning icon (`⚠️`), target product name in champagne gold, and alert message:
     *"Are you sure you want to permanently delete this product? This action removes the item from the catalog and cannot be undone."*
   - Buttons: `Cancel` (`.btn-secondary-glass`) and `Delete Product` (`.btn-danger-glass`).
   - Confirming invokes `store.confirmDeleteProduct()`.

#### D. Section B: Order Management View
1. **Order Toolbar**:
   - Order Status Filter Chips: All, Pending, Confirmed, Processing, Shipped, Delivered, Cancelled.
   - Order Search Input: Real-time search across order number, customer name, customer email.
2. **Orders Table (`.admin-table`)**:
   - Columns:
     - `Order ID`: e.g. `VA-20261104-4821` (formatted in monospace font).
     - `Date`: Formatted date and time (`formatDate(order.createdAt)`).
     - `Customer`: Customer full name and email address.
     - `Items`: Item count (e.g. `3 items`) with a toggle to expand/collapse itemized thumbnail list.
     - `Grand Total`: Highlighted in champagne gold (`formatPrice(order.grandTotal)`).
     - `Payment`: Status pill (`succeeded` in green, `failed` in red).
     - `Fulfillment Status`: Interactive `<select class="glass-select admin-status-select" data-order-id="${order._id}">` with options:
       - `pending`
       - `confirmed`
       - `processing`
       - `shipped`
       - `delivered`
       - `cancelled`
       The `<select>` displays the current status and triggers an immediate update upon user selection.
     - `Actions`: `View Receipt` button linking to `#/order/${order._id}`.

---

## 6. CSS Styling System Additions

All styles leverage VelvetAura's design tokens in `public/css/variables.css` and can be appended cleanly to `public/css/components.css`.

### 6.1 Admin Layout & Dashboard Container
```css
/* =========================================================================
   14. ADMIN DASHBOARD STYLING
   ========================================================================= */
.admin-section {
  width: 100%;
  max-width: var(--container-max);
  margin: 0 auto;
  padding: var(--space-xl) var(--space-lg) var(--space-3xl) var(--space-lg);
}

.admin-header {
  margin-bottom: var(--space-xl);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.admin-title-wrap h1 {
  font-family: var(--font-serif);
  font-size: clamp(2rem, 4vw, 2.8rem);
  color: var(--text-high);
}

.admin-subtitle {
  color: var(--accent-gold);
  font-size: 0.85rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

/* KPI Metrics Grid */
.admin-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-xl);
}

.admin-kpi-card {
  padding: var(--space-lg);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  background: var(--glass-card);
  backdrop-filter: var(--blur-standard);
  border: 1px solid var(--glass-border-subtle);
  border-top: 1px solid var(--glass-border-highlight);
}

.admin-kpi-icon {
  font-size: 2rem;
  width: 52px;
  height: 52px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--glass-border-subtle);
}

.admin-kpi-val {
  font-family: var(--font-mono);
  font-size: 1.6rem;
  font-weight: var(--fw-bold);
  color: var(--text-high);
  line-height: 1.1;
}

.admin-kpi-lbl {
  font-size: 0.78rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Admin Tabs Navigation */
.admin-nav-tabs {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: var(--space-xl);
  border-bottom: 1px solid var(--glass-border-subtle);
  padding-bottom: var(--space-sm);
}

.admin-tab-btn {
  padding: 10px 22px;
  border-radius: var(--radius-full);
  font-size: 0.92rem;
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--glass-border-subtle);
  transition: all var(--transition-fast);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.admin-tab-btn:hover {
  color: var(--text-high);
  border-color: var(--glass-border-mid);
}

.admin-tab-btn.active {
  background: var(--accent-gold-muted);
  border-color: var(--glass-border-gold);
  color: var(--accent-gold);
  box-shadow: 0 0 16px var(--accent-gold-glow);
}
```

### 6.2 Admin Tables & Controls
```css
/* Admin Toolbar */
.admin-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
  flex-wrap: wrap;
}

.admin-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  flex: 1;
}

/* Responsive Table Container */
.admin-table-container {
  overflow-x: auto;
  border-radius: var(--radius-lg);
  border: 1px solid var(--glass-border-mid);
  background: var(--glass-card);
  backdrop-filter: var(--blur-standard);
  box-shadow: var(--shadow-card);
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.88rem;
}

.admin-table th {
  padding: 14px 16px;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid var(--glass-border-mid);
  font-weight: var(--fw-semibold);
}

.admin-table td {
  padding: 14px 16px;
  color: var(--text-medium);
  border-bottom: 1px solid var(--glass-border-subtle);
  vertical-align: middle;
}

.admin-table tr:hover td {
  background: rgba(255, 255, 255, 0.035);
}

.admin-table-thumb {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  background: #000;
  border: 1px solid var(--glass-border-subtle);
}

.admin-actions-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Stock Pills */
.stock-pill {
  padding: 3px 10px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: var(--fw-semibold);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.stock-pill.in-stock {
  background: var(--status-success-bg);
  border: 1px solid var(--status-success-border);
  color: var(--status-success);
}

.stock-pill.low-stock {
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning-border);
  color: var(--status-warning);
}

.stock-pill.out-of-stock {
  background: var(--status-danger-bg);
  border: 1px solid var(--status-danger-border);
  color: var(--status-danger);
}

/* Fulfillment Status Badges & Selects */
.admin-status-select {
  padding: 6px 12px;
  border-radius: var(--radius-md);
  font-size: 0.82rem;
  font-weight: var(--fw-semibold);
  cursor: pointer;
  background: rgba(26, 24, 41, 0.85);
  border: 1px solid var(--glass-border-mid);
  color: var(--text-high);
}

.admin-status-select:focus {
  border-color: var(--accent-gold);
  box-shadow: 0 0 12px var(--accent-gold-glow);
}

/* Danger Button */
.btn-danger-glass {
  background: var(--status-danger-bg);
  border: 1px solid var(--status-danger-border);
  color: var(--status-danger);
  padding: 10px 20px;
  border-radius: var(--radius-full);
  font-weight: var(--fw-semibold);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.btn-danger-glass:hover {
  background: rgba(239, 68, 68, 0.28);
  box-shadow: 0 0 16px rgba(239, 68, 68, 0.45);
}

/* Modal Form Grids */
.admin-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-md);
}

.admin-form-full {
  grid-column: 1 / -1;
}

.admin-image-preview-wrap {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-top: 6px;
}

.admin-image-preview {
  width: 60px;
  height: 60px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  border: 1px solid var(--glass-border-subtle);
  background: #000;
}
```

### 6.3 Responsive Media Queries
- **Tablet ($\le 1024$px)**:
  `.admin-kpi-grid` switches to 2 columns (`repeat(2, 1fr)`).
- **Mobile ($\le 640$px)**:
  `.admin-kpi-grid` switches to 1 column (`1fr`).
  `.admin-form-grid` collapses to 1 column.
  `.admin-toolbar` aligns vertically.

---

## 7. Implementation Roadmap & Recommended Worker Tasks

| Step | Target File | Action Description |
|---|---|---|
| **1** | `public/index.html` | Add `#admin-dashboard-container` section to `<main id="app-root">`. |
| **2** | `public/js/api.js` | Add `createProduct()`, `updateProduct()`, `deleteProduct()`, `getAllOrders()`, `updateOrderStatus()`. |
| **3** | `public/js/store.js` | Initialize `admin` state slice and implement 12 reactive admin actions with cross-slice customer catalog sync. |
| **4** | `public/js/components/navbar.js` | Conditionally render "Admin Dashboard" link in user dropdown and navbar actions when `authState.user?.role === 'admin'`. |
| **5** | `public/js/components/adminDashboard.js` | Create component with KPI cards, tab switching, product CRUD table & modals, and order table with interactive status updater. |
| **6** | `public/css/components.css` | Append `.admin-section`, `.admin-table`, `.admin-kpi-grid`, status pills, and modal form styling. |
| **7** | `public/js/app.js` | Import `AdminDashboardComponent`, instantiate in `init()`, enforce role-based route guard on `#/admin`, and subscribe to real-time auth changes. |

---

## 8. Verification Strategy

The frontend implementation can be verified through the following checks:
1. **Unauthenticated Access Denial**:
   Navigate to `#/admin` while logged out $\rightarrow$ Redirects to `#/catalog`, triggers warning toast, opens auth modal.
2. **Unauthorized Customer Access Denial**:
   Log in as customer (`customer@velvetaura.com` or `minji@velvetaura.com`), navigate to `#/admin` $\rightarrow$ Redirects to `#/catalog`, triggers error toast.
3. **Authorized Admin Access**:
   Log in as admin (`admin@velvetaura.com` / `AdminPassword123!`) $\rightarrow$ Navbar immediately displays "Admin Dashboard" link. Navigating to `#/admin` loads the dashboard view with KPI metrics, product table, and order table.
4. **Product CRUD Operations**:
   - Create a product via `+ Add New Product` $\rightarrow$ Product appears in admin table and customer catalog (`#/catalog`).
   - Edit an existing product $\rightarrow$ Changes reflect immediately.
   - Delete a product $\rightarrow$ Item is removed from catalog and database.
5. **Order Status Mutation**:
   - Change order status via interactive dropdown $\rightarrow$ Immediate toast notification appears; state persists on refresh.
6. **Session Expiration Guard**:
   - While on `#/admin`, click "Sign Out" $\rightarrow$ Redirects immediately to `#/catalog` and removes the admin navbar link.
