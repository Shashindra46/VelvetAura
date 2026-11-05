# VelvetAura Client State Management, API Wrapper & Real-Time Lifecycle Blueprint

**Architect & Author**: `teamwork_explorer_m3_2`  
**Date**: 2026-11-04  
**Milestone**: M3 — Frontend Architecture  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m3_2\`  
**Target Code Files**: `public/js/api.js`, `public/js/store.js`  

---

## 1. Executive Architecture Summary

VelvetAura's frontend is an immersive luxury e-commerce Single Page Application (SPA) with a dark-mode glassmorphism aesthetic. To deliver a seamless luxury shopping experience, the client architecture must eliminate full-page reloads and provide **instant, deterministic reactive updates** across navigation badges, catalog filtering, slide-over cart management, guest-to-member cart synchronization, and guided checkout.

This blueprint establishes:
1. **Unified API Client Service (`public/js/api.js`)**:
   - Centralized `fetch` wrapper targeting `/api` base URL.
   - Automatic injection of JWT Bearer tokens from persistent storage.
   - Standardized error unwrapping and normalized response contracts `{ success, data, error, status }`.
   - Comprehensive endpoint bindings for Auth, Catalog, Cart, Orders, and System Health.
2. **Reactive State Manager & Observer Engine (`public/js/store.js`)**:
   - Zero-dependency reactive state store implementing the Publish/Subscribe (Observer) pattern with granular slice subscriptions (`auth`, `catalog`, `cart`, `activeProduct`, `checkout`, `orders`, `ui`).
   - Optimistic state updates with rollback guarantees on API failure.
   - Seamless **Guest Cart ↔ Authenticated Member Cart auto-synchronization** during login or registration.
   - Authoritative mathematical pricing engine mirroring backend formulas (exact 8% tax and $50.00 tiered free shipping).
3. **Real-Time Interaction Lifecycles**:
   - Cart badge bounce and champagne-gold glow pulse animation keyframes.
   - Slide-over cart drawer opening, closing, and stepper manipulation without DOM thrashing.
   - **Floating Glass Toast Notification Engine** delivering contextual alerts with Dark Opulence styling.

---

## 2. Unified API Client Wrapper (`public/js/api.js`)

### 2.1 Design Objectives & Invariants
- **Base URL Routing**: Default to `/api`, easily configurable for testing or remote hosts.
- **Stateless Token Management**: Retrieves JWT token dynamically from `localStorage.getItem('velvetaura_auth')` or in-memory fallback. Injects `Authorization: Bearer <token>` on every outgoing request when present.
- **Normalized Response Envelope**: Every API method resolves (never throws uncaught network rejections) to a uniform envelope:
  ```typescript
  interface ApiResponse<T = any> {
    success: boolean;
    data: T | null;
    error: string | null;
    status: number;
  }
  ```
- **Error Extraction Hierarchy**: Extracts user-friendly error messages by evaluating:
  1. `data.error` (e.g. `'Insufficient stock'`, `'Invalid email or password'`)
  2. `data.message` (e.g. `'Please provide both email and password'`)
  3. HTTP status fallback (e.g. `'HTTP 404: Not Found'`)
  4. Network failure (e.g. `'Network connection failed. Please check your connectivity.'`)

### 2.2 Complete Implementation Specification for `public/js/api.js`

```javascript
/**
 * VelvetAura - Client REST API Wrapper Service
 * 
 * Provides unified, promise-based HTTP communication with backend services.
 * Automatically injects JWT Bearer authorization headers, formats payloads,
 * and normalizes responses into { success, data, error, status }.
 */

class ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenKey = 'velvetaura_auth';
  }

  /**
   * Retrieves the current JWT token from local storage or store
   * @returns {string|null}
   */
  getToken() {
    try {
      const authRaw = localStorage.getItem(this.tokenKey);
      if (!authRaw) return null;
      const parsed = JSON.parse(authRaw);
      return parsed.token || parsed.jwt || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Stores auth payload into local storage
   * @param {Object} authData - { user, token }
   */
  setAuth(authData) {
    if (!authData || !authData.token) {
      localStorage.removeItem(this.tokenKey);
    } else {
      localStorage.setItem(this.tokenKey, JSON.stringify(authData));
    }
  }

  /**
   * Clears stored authentication credentials
   */
  clearAuth() {
    localStorage.removeItem(this.tokenKey);
  }

  /**
   * Core request dispatcher with normalized error handling
   * @param {string} endpoint - Relative path (e.g. '/products')
   * @param {Object} options - Fetch options { method, body, headers, params }
   * @returns {Promise<{ success: boolean, data: any, error: string|null, status: number }>}
   */
  async request(endpoint, { method = 'GET', body = null, headers = {}, params = null } = {}) {
    let url = `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    if (params && typeof params === 'object') {
      const searchParams = new URLSearchParams();
      for (const [key, val] of Object.entries(params)) {
        if (val !== undefined && val !== null && val !== '') {
          searchParams.append(key, String(val));
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const defaultHeaders = {
      'Accept': 'application/json',
      ...headers,
    };

    const token = this.getToken();
    if (token && !defaultHeaders['Authorization']) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    const fetchConfig = {
      method: method.toUpperCase(),
      headers: defaultHeaders,
    };

    if (body) {
      if (body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
        fetchConfig.body = body;
      } else {
        defaultHeaders['Content-Type'] = 'application/json';
        fetchConfig.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    try {
      const response = await fetch(url, fetchConfig);
      const status = response.status;
      let responseData = null;

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          responseData = await response.json();
        } catch (jsonErr) {
          responseData = null;
        }
      } else {
        responseData = await response.text();
      }

      if (response.ok) {
        return {
          success: true,
          data: responseData,
          error: null,
          status,
        };
      }

      // Handle HTTP error responses (4xx, 5xx)
      let extractedError = 'Request failed';
      if (responseData && typeof responseData === 'object') {
        extractedError = responseData.error || responseData.message || extractedError;
      } else if (typeof responseData === 'string' && responseData.trim()) {
        extractedError = responseData;
      } else {
        extractedError = `HTTP ${status}: ${response.statusText || 'Error'}`;
      }

      return {
        success: false,
        data: responseData,
        error: extractedError,
        status,
      };
    } catch (networkError) {
      console.error(`[API Network Error] ${method} ${url}:`, networkError);
      return {
        success: false,
        data: null,
        error: 'Network connection error. Please verify the server is running.',
        status: 0,
      };
    }
  }

  // =========================================================================
  // 1. Authentication Endpoints
  // =========================================================================

  /**
   * Register a new customer account
   * @param {Object} userData - { name, email, password, address, shippingAddress }
   */
  async register(userData) {
    const res = await this.request('/auth/register', {
      method: 'POST',
      body: userData,
    });
    if (res.success && res.data && res.data.token) {
      this.setAuth({ token: res.data.token, user: res.data.user });
    }
    return res;
  }

  /**
   * Authenticate customer credentials and store JWT token
   * @param {Object} credentials - { email, password }
   */
  async login(credentials) {
    const res = await this.request('/auth/login', {
      method: 'POST',
      body: credentials,
    });
    if (res.success && res.data && res.data.token) {
      this.setAuth({ token: res.data.token, user: res.data.user });
    }
    return res;
  }

  /**
   * Fetch currently authenticated customer profile
   */
  async getMe() {
    return this.request('/auth/me', { method: 'GET' });
  }

  /**
   * Update authenticated customer profile details or shipping address
   * @param {Object} profileData - { name, address, shippingAddress }
   */
  async updateProfile(profileData) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: profileData,
    });
  }

  // =========================================================================
  // 2. Product Catalog Endpoints
  // =========================================================================

  /**
   * Query product catalog with multi-facet filters, search, sorting & pagination
   * @param {Object} params - { category, origin, brand, featured, q, minPrice, maxPrice, sort, page, limit }
   */
  async getProducts(params = {}) {
    return this.request('/products', {
      method: 'GET',
      params,
    });
  }

  /**
   * Retrieve single product details by ObjectId
   * @param {string} id - Product ObjectId
   */
  async getProduct(id) {
    return this.request(`/products/${id}`, { method: 'GET' });
  }

  /**
   * Retrieve distinct product categories and import origins
   */
  async getCategories() {
    return this.request('/products/categories', { method: 'GET' });
  }

  // =========================================================================
  // 3. Shopping Cart Endpoints
  // =========================================================================

  /**
   * Fetch active shopping cart for authenticated user
   */
  async getCart() {
    return this.request('/cart', { method: 'GET' });
  }

  /**
   * Add item to active cart or increment existing quantity
   * @param {string} productId - Product ObjectId
   * @param {number} quantity - Quantity to add (default 1)
   */
  async addToCart(productId, quantity = 1) {
    return this.request('/cart/items', {
      method: 'POST',
      body: { productId, quantity },
    });
  }

  /**
   * Update exact quantity of a cart line item
   * @param {string} productId - Product ObjectId
   * @param {number} quantity - New quantity (0 triggers removal)
   */
  async updateCartItem(productId, quantity) {
    return this.request(`/cart/items/${productId}`, {
      method: 'PUT',
      body: { quantity },
    });
  }

  /**
   * Remove a line item completely from active cart
   * @param {string} productId - Product ObjectId
   */
  async removeCartItem(productId) {
    return this.request(`/cart/items/${productId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Clear all items from active cart
   */
  async clearCart() {
    return this.request('/cart', {
      method: 'DELETE',
    });
  }

  // =========================================================================
  // 4. Order Management & Checkout Endpoints
  // =========================================================================

  /**
   * Process order checkout, validate stock, authorize payment, and create order
   * @param {Object} payload - { shippingAddress, paymentDetails }
   */
  async checkout(payload) {
    return this.request('/orders/checkout', {
      method: 'POST',
      body: payload,
    });
  }

  /**
   * Retrieve order history for authenticated user
   */
  async getMyOrders() {
    return this.request('/orders/my-orders', { method: 'GET' });
  }

  /**
   * Retrieve single order details by ID
   * @param {string} id - Order ObjectId
   */
  async getOrder(id) {
    return this.request(`/orders/${id}`, { method: 'GET' });
  }

  // =========================================================================
  // 5. System Health Check
  // =========================================================================

  /**
   * Query server diagnostic health and DB connection mode
   */
  async getHealth() {
    return this.request('/health', { method: 'GET' });
  }
}

// Export singleton instance
export const api = new ApiClient();
export default api;
```

---

## 3. Reactive State Manager (`public/js/store.js`)

### 3.1 Architectural Principles
- **Observer Pattern**: Components subscribe to specific state slices (e.g. `'cart'`, `'catalog'`, `'auth'`) or general state changes. Whenever state updates, registered listeners are invoked synchronously with `(sliceState, fullState, sliceName)`.
- **Zero-Refresh Reactivity**: Adding an item to the cart updates the badge counter and drawer list instantly without triggering a browser reload.
- **Persistent Storage Synchronization**:
  - `auth`: Persisted in `localStorage.getItem('velvetaura_auth')`.
  - `guest_cart`: When unauthenticated, items are stored in `localStorage.getItem('velvetaura_guest_cart')`.
  - **Auto-Sync on Login**: When an unauthenticated guest who added items logs in or registers, the store automatically migrates their local guest items into the backend database and purges the local guest cart.
- **Strict Mathematical Pricing Calculation**:
  Matches backend rules in `src/models/Cart.js` and `src/services/cartService.js`:
  $$\text{Subtotal} = \sum (\text{item.price} \times \text{item.quantity})$$
  $$\text{Tax} = \text{round}(\text{Subtotal} \times 0.08, 2)$$
  $$\text{Shipping} = \begin{cases} 0.00 & \text{if } \text{Subtotal} \ge 50.00 \text{ or } \text{Subtotal} == 0 \\ 5.99 & \text{otherwise} \end{cases}$$
  $$\text{GrandTotal} = \text{round}(\text{Subtotal} + \text{Tax} + \text{Shipping}, 2)$$
  $$\text{ItemCount} = \sum \text{item.quantity}$$

### 3.2 State Slices Definition

| Slice | Type | Description |
|---|---|---|
| `auth` | `Object` | `{ user, token, isAuthenticated, loading }` |
| `catalog` | `Object` | `{ products: [], categories: [], origins: [], activeCategory: 'all', activeOrigin: 'all', searchQuery: '', sort: 'featured', page: 1, pages: 1, total: 0, loading: false, error: null }` |
| `cart` | `Object` | `{ items: [], subtotal: 0, tax: 0, shipping: 0, grandTotal: 0, itemCount: 0, isOpen: false, loading: false, freeShippingThreshold: 50.00, freeShippingRemaining: 50.00 }` |
| `activeProduct` | `Object` | `{ product: null, isOpen: false, quantity: 1, loading: false }` |
| `checkout` | `Object` | `{ isSubmitting: false, lastOrder: null, transactionId: null, error: null, shippingAddress: {...}, paymentDetails: {...} }` |
| `orders` | `Object` | `{ list: [], selectedOrder: null, loading: false, error: null }` |
| `ui` | `Object` | `{ toasts: [], authModal: { isOpen: false, mode: 'login' } }` |

### 3.3 Complete Implementation Specification for `public/js/store.js`

```javascript
/**
 * VelvetAura - Client Reactive State Manager
 * 
 * Implements a centralized, reactive state container utilizing the Observer pattern.
 * Coordinates Auth lifecycle, Guest/Member Cart auto-sync, Catalog query state,
 * Product detail modal, Checkout transactions, and Glass Toast notifications.
 */

import api from './api.js';

class Store {
  constructor() {
    this.state = {
      auth: {
        user: null,
        token: null,
        isAuthenticated: false,
        loading: false,
      },
      catalog: {
        products: [],
        categories: [],
        origins: [],
        activeCategory: 'all',
        activeOrigin: 'all',
        searchQuery: '',
        sort: 'featured',
        page: 1,
        pages: 1,
        total: 0,
        loading: false,
        error: null,
      },
      cart: {
        items: [],
        subtotal: 0.0,
        tax: 0.0,
        shipping: 0.0,
        grandTotal: 0.0,
        itemCount: 0,
        isOpen: false,
        loading: false,
        freeShippingThreshold: 50.0,
        freeShippingRemaining: 50.0,
      },
      activeProduct: {
        product: null,
        isOpen: false,
        quantity: 1,
        loading: false,
      },
      checkout: {
        isSubmitting: false,
        lastOrder: null,
        transactionId: null,
        error: null,
        shippingAddress: {
          fullName: '',
          street: '',
          city: '',
          state: '',
          zip: '',
          country: 'USA',
          phone: '',
        },
        paymentDetails: {
          cardNumber: '',
          expDate: '',
          cvv: '',
          cardHolder: '',
          brand: 'Visa',
        },
      },
      orders: {
        list: [],
        selectedOrder: null,
        loading: false,
        error: null,
      },
      ui: {
        toasts: [],
        authModal: {
          isOpen: false,
          mode: 'login', // 'login' | 'register'
        },
      },
    };

    // Subscriptions indexed by slice or '*' for wildcard
    this.listeners = new Map();

    // Debounce timer for search queries
    this.searchDebounceTimer = null;
  }

  // =========================================================================
  // Observer Engine (Subscribe / Notify)
  // =========================================================================

  /**
   * Subscribe to state slice changes
   * @param {string|Function} sliceOrListener - Name of slice (e.g. 'cart') or global callback
   * @param {Function} [listener] - Callback function if slice specified
   * @returns {Function} Unsubscribe cleanup function
   */
  subscribe(sliceOrListener, listener) {
    let slice = '*';
    let callback = sliceOrListener;

    if (typeof sliceOrListener === 'string') {
      slice = sliceOrListener;
      callback = listener;
    }

    if (typeof callback !== 'function') {
      throw new Error('[Store] Subscriber callback must be a function');
    }

    if (!this.listeners.has(slice)) {
      this.listeners.set(slice, new Set());
    }

    this.listeners.get(slice).add(callback);

    // Return immediate unsubscribe closure
    return () => {
      const sliceSet = this.listeners.get(slice);
      if (sliceSet) {
        sliceSet.delete(callback);
        if (sliceSet.size === 0) {
          this.listeners.delete(slice);
        }
      }
    };
  }

  /**
   * Internal notify dispatcher
   * @param {string} slice - Slice name modified
   */
  notify(slice) {
    const sliceState = this.state[slice];
    const fullState = this.getState();

    // Specific slice listeners
    if (this.listeners.has(slice)) {
      for (const listener of this.listeners.get(slice)) {
        try {
          listener(sliceState, fullState, slice);
        } catch (err) {
          console.error(`[Store] Error in slice listener for "${slice}":`, err);
        }
      }
    }

    // Global listeners
    if (this.listeners.has('*')) {
      for (const listener of this.listeners.get('*')) {
        try {
          listener(sliceState, fullState, slice);
        } catch (err) {
          console.error('[Store] Error in global listener:', err);
        }
      }
    }
  }

  /**
   * Shallow-updates a state slice and triggers reactivity
   * @param {string} slice - Slice identifier
   * @param {Object} partialState - Properties to merge
   */
  setState(slice, partialState) {
    if (!this.state[slice]) {
      console.warn(`[Store] Slice "${slice}" does not exist. Creating slice.`);
      this.state[slice] = {};
    }

    this.state[slice] = {
      ...this.state[slice],
      ...partialState,
    };

    this.notify(slice);
  }

  /**
   * Get immutable snapshot of current state or slice
   * @param {string} [slice] - Optional slice name
   * @returns {any}
   */
  getState(slice) {
    if (slice) {
      return this.state[slice];
    }
    return this.state;
  }

  // =========================================================================
  // Application Bootstrap & Lifecycle
  // =========================================================================

  /**
   * Initialize state from storage and remote APIs
   */
  async init() {
    // 1. Restore persistent auth session
    this.loadAuthFromStorage();

    // 2. Concurrently load taxonomy discovery and initial catalog
    await Promise.all([
      this.fetchTaxonomy(),
      this.fetchProducts(),
    ]);

    // 3. Load cart (backend cart if authenticated, or local guest cart)
    if (this.state.auth.isAuthenticated) {
      await this.syncAuthCart();
      this.fetchMyOrders();
    } else {
      this.loadGuestCart();
    }
  }

  // =========================================================================
  // Auth Lifecycle & Guest Cart Auto-Sync
  // =========================================================================

  loadAuthFromStorage() {
    try {
      const stored = localStorage.getItem('velvetaura_auth');
      if (stored) {
        const { user, token } = JSON.parse(stored);
        if (token) {
          this.setState('auth', {
            user: user || null,
            token,
            isAuthenticated: true,
          });

          // Proactively validate token against backend
          api.getMe().then((res) => {
            if (res.success && res.data && res.data.user) {
              this.setState('auth', { user: res.data.user });
              if (res.data.user.shippingAddress) {
                this.setState('checkout', {
                  shippingAddress: {
                    ...this.state.checkout.shippingAddress,
                    ...res.data.user.shippingAddress,
                    fullName: res.data.user.name || '',
                  },
                });
              }
            } else if (res.status === 401) {
              this.logout();
            }
          });
        }
      }
    } catch (e) {
      console.warn('[Store] Failed to parse stored auth payload');
    }
  }

  /**
   * Authenticate customer with email and password
   * Automatically migrates any guest cart items into backend database
   */
  async login(credentials) {
    this.setState('auth', { loading: true });
    const res = await api.login(credentials);
    this.setState('auth', { loading: false });

    if (!res.success) {
      this.showToast(res.error || 'Authentication failed', 'error');
      return res;
    }

    const { user, token } = res.data;
    this.setState('auth', {
      user,
      token,
      isAuthenticated: true,
    });

    if (user.shippingAddress) {
      this.setState('checkout', {
        shippingAddress: {
          ...this.state.checkout.shippingAddress,
          ...user.shippingAddress,
          fullName: user.name || '',
        },
      });
    }

    this.showToast(`Welcome back, ${user.name}!`, 'success');
    this.closeAuthModal();

    // Auto-migrate local guest items to backend
    await this.migrateGuestCartToBackend();
    await this.syncAuthCart();
    this.fetchMyOrders();

    return res;
  }

  /**
   * Register a new customer
   */
  async register(userData) {
    this.setState('auth', { loading: true });
    const res = await api.register(userData);
    this.setState('auth', { loading: false });

    if (!res.success) {
      this.showToast(res.error || 'Registration failed', 'error');
      return res;
    }

    const { user, token } = res.data;
    this.setState('auth', {
      user,
      token,
      isAuthenticated: true,
    });

    this.showToast(`Welcome to VelvetAura, ${user.name}!`, 'success');
    this.closeAuthModal();

    // Auto-migrate local guest items to backend
    await this.migrateGuestCartToBackend();
    await this.syncAuthCart();

    return res;
  }

  /**
   * Log out currently authenticated customer
   */
  logout() {
    api.clearAuth();
    this.setState('auth', {
      user: null,
      token: null,
      isAuthenticated: false,
    });

    // Reset member cart and orders
    this.setState('orders', { list: [], selectedOrder: null });
    this.setState('cart', {
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      grandTotal: 0,
      itemCount: 0,
      isOpen: false,
      freeShippingRemaining: 50.0,
    });

    this.showToast('You have been signed out', 'info');
  }

  openAuthModal(mode = 'login') {
    this.setState('ui', {
      authModal: { isOpen: true, mode },
    });
  }

  closeAuthModal() {
    this.setState('ui', {
      authModal: { ...this.state.ui.authModal, isOpen: false },
    });
  }

  // =========================================================================
  // Catalog & Filtering Operations
  // =========================================================================

  async fetchTaxonomy() {
    const res = await api.getCategories();
    if (res.success && res.data) {
      this.setState('catalog', {
        categories: res.data.categories || [],
        origins: res.data.origins || [],
      });
    }
  }

  async fetchProducts() {
    const { activeCategory, activeOrigin, searchQuery, sort, page } = this.state.catalog;
    this.setState('catalog', { loading: true, error: null });

    const queryParams = {
      page,
      limit: 24,
      sort,
    };

    if (activeCategory && activeCategory !== 'all') {
      queryParams.category = activeCategory;
    }
    if (activeOrigin && activeOrigin !== 'all') {
      queryParams.origin = activeOrigin;
    }
    if (searchQuery && searchQuery.trim()) {
      queryParams.q = searchQuery.trim();
    }

    const res = await api.getProducts(queryParams);

    if (res.success && res.data) {
      this.setState('catalog', {
        products: res.data.products || [],
        total: res.data.total || 0,
        pages: res.data.pages || 1,
        page: res.data.page || 1,
        loading: false,
      });
    } else {
      this.setState('catalog', {
        loading: false,
        error: res.error || 'Failed to load catalog',
      });
    }
  }

  setCategory(category) {
    this.setState('catalog', {
      activeCategory: category,
      page: 1,
    });
    this.fetchProducts();
  }

  setOrigin(origin) {
    this.setState('catalog', {
      activeOrigin: origin,
      page: 1,
    });
    this.fetchProducts();
  }

  setSort(sort) {
    this.setState('catalog', {
      sort,
      page: 1,
    });
    this.fetchProducts();
  }

  setSearchQuery(q) {
    this.setState('catalog', { searchQuery: q, page: 1 });
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.fetchProducts();
    }, 300);
  }

  setPage(page) {
    this.setState('catalog', { page });
    this.fetchProducts();
  }

  // =========================================================================
  // Active Product Detail Modal
  // =========================================================================

  async openProductDetail(productOrId) {
    if (typeof productOrId === 'string') {
      this.setState('activeProduct', { isOpen: true, loading: true, quantity: 1 });
      const res = await api.getProduct(productOrId);
      if (res.success && res.data && res.data.product) {
        this.setState('activeProduct', {
          product: res.data.product,
          isOpen: true,
          loading: false,
          quantity: 1,
        });
      } else {
        this.showToast(res.error || 'Could not load product details', 'error');
        this.closeProductDetail();
      }
    } else if (productOrId && typeof productOrId === 'object') {
      this.setState('activeProduct', {
        product: productOrId,
        isOpen: true,
        loading: false,
        quantity: 1,
      });
    }
  }

  closeProductDetail() {
    this.setState('activeProduct', {
      ...this.state.activeProduct,
      isOpen: false,
    });
  }

  setDetailQuantity(qty) {
    const product = this.state.activeProduct.product;
    const maxStock = product ? product.stock : 99;
    const clamped = Math.max(1, Math.min(maxStock, parseInt(qty, 10) || 1));
    this.setState('activeProduct', { quantity: clamped });
  }

  // =========================================================================
  // Shopping Cart & Real-Time Calculations
  // =========================================================================

  /**
   * Client-side pricing calculation engine
   * Matches backend mathematical rules exactly
   */
  calculateTotals(items) {
    const rawSubtotal = (items || []).reduce((acc, item) => {
      const price = Number(item.price) || 0;
      const qty = Number(item.quantity) || 0;
      return acc + price * qty;
    }, 0);

    const subtotal = Math.round(rawSubtotal * 100) / 100;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const shipping = subtotal >= 50.0 || subtotal === 0 ? 0.0 : 5.99;
    const grandTotal = Math.round((subtotal + tax + shipping) * 100) / 100;
    const itemCount = (items || []).reduce((acc, item) => acc + (Number(item.quantity) || 0), 0);
    const freeShippingRemaining = Math.max(0, Math.round((50.0 - subtotal) * 100) / 100);

    return {
      subtotal,
      tax,
      shipping,
      grandTotal,
      itemCount,
      freeShippingRemaining,
    };
  }

  loadGuestCart() {
    try {
      const stored = localStorage.getItem('velvetaura_guest_cart');
      if (stored) {
        const items = JSON.parse(stored);
        if (Array.isArray(items)) {
          const totals = this.calculateTotals(items);
          this.setState('cart', {
            items,
            ...totals,
          });
        }
      }
    } catch (e) {
      console.warn('[Store] Failed to load guest cart');
    }
  }

  saveGuestCart(items) {
    try {
      localStorage.setItem('velvetaura_guest_cart', JSON.stringify(items));
    } catch (e) {}
  }

  async syncAuthCart() {
    this.setState('cart', { loading: true });
    const res = await api.getCart();
    this.setState('cart', { loading: false });

    if (res.success && res.data && res.data.cart) {
      const serverCart = res.data.cart;
      const freeShippingRemaining = Math.max(0, Math.round((50.0 - (serverCart.subtotal || 0)) * 100) / 100);
      this.setState('cart', {
        items: serverCart.items || [],
        subtotal: serverCart.subtotal || 0,
        tax: serverCart.tax || 0,
        shipping: serverCart.shipping || 0,
        grandTotal: serverCart.grandTotal || 0,
        itemCount: serverCart.itemCount || 0,
        freeShippingRemaining,
      });
    }
  }

  async migrateGuestCartToBackend() {
    try {
      const stored = localStorage.getItem('velvetaura_guest_cart');
      if (!stored) return;
      const guestItems = JSON.parse(stored);
      if (Array.isArray(guestItems) && guestItems.length > 0) {
        for (const item of guestItems) {
          const productId = item.product?._id || item.product || item._id;
          if (productId) {
            await api.addToCart(productId, item.quantity || 1);
          }
        }
        localStorage.removeItem('velvetaura_guest_cart');
      }
    } catch (e) {
      console.warn('[Store] Guest cart migration failed:', e);
    }
  }

  /**
   * Add product to cart with zero-refresh reactive feedback
   * @param {Object} product - Product model
   * @param {number} quantity - Quantity to add
   */
  async addToCart(product, quantity = 1) {
    if (!product) return;
    const prodId = product._id || product.id;
    const qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);

    // Optimistically update cart line items
    const currentItems = [...this.state.cart.items];
    const existingIndex = currentItems.findIndex(
      (item) => (item.product?._id || item.product || item._id) === prodId
    );

    if (existingIndex > -1) {
      currentItems[existingIndex] = {
        ...currentItems[existingIndex],
        quantity: currentItems[existingIndex].quantity + qtyToAdd,
      };
    } else {
      currentItems.push({
        product: prodId,
        _id: prodId,
        name: product.name,
        brand: product.brand,
        price: product.price,
        quantity: qtyToAdd,
        image: product.image || (Array.isArray(product.images) && product.images[0]) || '',
      });
    }

    const optimisticTotals = this.calculateTotals(currentItems);
    this.setState('cart', {
      items: currentItems,
      ...optimisticTotals,
    });

    // Fire navbar badge bounce animation
    this.triggerCartBadgeAnimation();

    // Show floating toast confirmation
    this.showToast(`Added "${product.name}" to your shopping bag`, 'success');

    // Sync with backend if authenticated, or persist locally for guest
    if (this.state.auth.isAuthenticated) {
      const res = await api.addToCart(prodId, qtyToAdd);
      if (res.success && res.data && res.data.cart) {
        const sc = res.data.cart;
        const freeShippingRemaining = Math.max(0, Math.round((50.0 - sc.subtotal) * 100) / 100);
        this.setState('cart', {
          items: sc.items,
          subtotal: sc.subtotal,
          tax: sc.tax,
          shipping: sc.shipping,
          grandTotal: sc.grandTotal,
          itemCount: sc.itemCount,
          freeShippingRemaining,
        });
      } else {
        // Rollback on failure (e.g. out of stock)
        this.showToast(res.error || 'Failed to update cart on server', 'error');
        await this.syncAuthCart();
      }
    } else {
      this.saveGuestCart(currentItems);
    }
  }

  /**
   * Update quantity of an existing line item in cart
   */
  async updateQuantity(productId, newQty) {
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) {
      return this.removeCartItem(productId);
    }

    // Optimistic local update
    let currentItems = [...this.state.cart.items];
    const index = currentItems.findIndex(
      (item) => (item.product?._id || item.product || item._id) === productId
    );

    if (index === -1) return;

    currentItems[index] = {
      ...currentItems[index],
      quantity: qty,
    };

    const totals = this.calculateTotals(currentItems);
    this.setState('cart', {
      items: currentItems,
      ...totals,
    });

    if (this.state.auth.isAuthenticated) {
      const res = await api.updateCartItem(productId, qty);
      if (res.success && res.data && res.data.cart) {
        const sc = res.data.cart;
        const freeShippingRemaining = Math.max(0, Math.round((50.0 - sc.subtotal) * 100) / 100);
        this.setState('cart', {
          items: sc.items,
          subtotal: sc.subtotal,
          tax: sc.tax,
          shipping: sc.shipping,
          grandTotal: sc.grandTotal,
          itemCount: sc.itemCount,
          freeShippingRemaining,
        });
      } else {
        this.showToast(res.error || 'Failed to update item quantity', 'error');
        await this.syncAuthCart();
      }
    } else {
      this.saveGuestCart(currentItems);
    }
  }

  /**
   * Remove a line item from cart
   */
  async removeCartItem(productId) {
    const currentItems = this.state.cart.items.filter(
      (item) => (item.product?._id || item.product || item._id) !== productId
    );

    const totals = this.calculateTotals(currentItems);
    this.setState('cart', {
      items: currentItems,
      ...totals,
    });

    this.showToast('Item removed from bag', 'info');

    if (this.state.auth.isAuthenticated) {
      const res = await api.removeCartItem(productId);
      if (res.success && res.data && res.data.cart) {
        const sc = res.data.cart;
        const freeShippingRemaining = Math.max(0, Math.round((50.0 - sc.subtotal) * 100) / 100);
        this.setState('cart', {
          items: sc.items,
          subtotal: sc.subtotal,
          tax: sc.tax,
          shipping: sc.shipping,
          grandTotal: sc.grandTotal,
          itemCount: sc.itemCount,
          freeShippingRemaining,
        });
      }
    } else {
      this.saveGuestCart(currentItems);
    }
  }

  /**
   * Clear active cart
   */
  async clearCart() {
    this.setState('cart', {
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      grandTotal: 0,
      itemCount: 0,
      freeShippingRemaining: 50.0,
    });

    if (this.state.auth.isAuthenticated) {
      await api.clearCart();
    } else {
      localStorage.removeItem('velvetaura_guest_cart');
    }
  }

  openCart() {
    this.setState('cart', { isOpen: true });
  }

  closeCart() {
    this.setState('cart', { isOpen: false });
  }

  toggleCart() {
    this.setState('cart', { isOpen: !this.state.cart.isOpen });
  }

  // =========================================================================
  // Checkout & Order Management
  // =========================================================================

  setShippingAddress(address) {
    this.setState('checkout', {
      shippingAddress: {
        ...this.state.checkout.shippingAddress,
        ...address,
      },
    });
  }

  setPaymentDetails(payment) {
    this.setState('checkout', {
      paymentDetails: {
        ...this.state.checkout.paymentDetails,
        ...payment,
      },
    });
  }

  /**
   * Quick-fill sandbox demo cards
   * @param {'approved' | 'declined'} type
   */
  fillDemoCard(type = 'approved') {
    if (type === 'approved') {
      this.setState('checkout', {
        paymentDetails: {
          cardNumber: '4242424242424242',
          expDate: '12/28',
          cvv: '123',
          cardHolder: this.state.auth.user?.name || 'Camille Dupont',
          brand: 'Visa',
        },
      });
      this.showToast('Autofilled approved test card', 'info');
    } else {
      this.setState('checkout', {
        paymentDetails: {
          cardNumber: '4000000000000002',
          expDate: '12/28',
          cvv: '123',
          cardHolder: 'Declined Cardholder',
          brand: 'Visa',
        },
      });
      this.showToast('Autofilled declined test card (ends in 0002)', 'info');
    }
  }

  /**
   * Submit order checkout
   */
  async submitCheckout() {
    if (!this.state.auth.isAuthenticated) {
      this.showToast('Please sign in or create an account to complete checkout', 'warning');
      this.openAuthModal('login');
      return { success: false, error: 'Authentication required' };
    }

    if (this.state.cart.items.length === 0) {
      this.showToast('Your shopping bag is empty', 'error');
      return { success: false, error: 'Empty cart' };
    }

    const { shippingAddress, paymentDetails } = this.state.checkout;
    this.setState('checkout', { isSubmitting: true, error: null });

    const payload = {
      shippingAddress,
      paymentDetails,
    };

    const res = await api.checkout(payload);
    this.setState('checkout', { isSubmitting: false });

    if (!res.success) {
      this.setState('checkout', { error: res.error });
      this.showToast(res.error || 'Checkout failed', 'error');
      return res;
    }

    // Success: capture order receipt and clear client cart
    const { order, transactionId } = res.data;
    this.setState('checkout', {
      lastOrder: order,
      transactionId,
      error: null,
    });

    // Reset cart
    this.setState('cart', {
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      grandTotal: 0,
      itemCount: 0,
      isOpen: false,
      freeShippingRemaining: 50.0,
    });

    this.showToast(`Order #${order.orderNumber || 'confirmed'} placed successfully!`, 'success');
    this.fetchMyOrders();

    return res;
  }

  async fetchMyOrders() {
    if (!this.state.auth.isAuthenticated) return;
    this.setState('orders', { loading: true, error: null });
    const res = await api.getMyOrders();
    if (res.success && res.data) {
      this.setState('orders', {
        list: res.data.orders || [],
        loading: false,
      });
    } else {
      this.setState('orders', {
        loading: false,
        error: res.error,
      });
    }
  }

  // =========================================================================
  // Toast Notification Engine
  // =========================================================================

  /**
   * Display floating glass toast alert
   * @param {string} message - User message
   * @param {'success'|'error'|'info'|'warning'} type - Visual aesthetic
   * @param {number} duration - Milliseconds before auto-dismiss (default 3500)
   */
  showToast(message, type = 'info', duration = 3500) {
    const id = `toast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newToast = { id, message, type, duration };

    const currentToasts = [...this.state.ui.toasts, newToast];
    this.setState('ui', { toasts: currentToasts });

    if (duration > 0) {
      setTimeout(() => {
        this.removeToast(id);
      }, duration);
    }

    return id;
  }

  removeToast(id) {
    const filtered = this.state.ui.toasts.filter((t) => t.id !== id);
    this.setState('ui', { toasts: filtered });
  }

  // =========================================================================
  // Reactive DOM Visual Effects
  // =========================================================================

  /**
   * Triggers CSS pulse and glow animation on navbar cart badge
   */
  triggerCartBadgeAnimation() {
    const badge = document.getElementById('nav-cart-badge');
    if (!badge) return;

    badge.classList.remove('badge-pop');
    // Force DOM reflow to re-trigger keyframe animation
    void badge.offsetWidth;
    badge.classList.add('badge-pop');

    setTimeout(() => {
      badge.classList.remove('badge-pop');
    }, 600);
  }
}

// Export singleton instance
export const store = new Store();
export default store;
```

---

## 4. Toast Notification Engine Specification

### 4.1 Visual Hierarchy & Styling Tokens
The toast engine renders floating frosted glass pills positioned at the bottom-right (or top-right on desktop) with:
- **Container**: Fixed overlay `#toast-container` with `z-index: 9999`, pointer-events pass-through except on individual toast cards.
- **Glass Card Aesthetics**:
  - `background: rgba(22, 20, 36, 0.85)`
  - `backdrop-filter: blur(16px) saturate(180%)`
  - `border: 1px solid rgba(255, 255, 255, 0.12)`
  - `box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 20px [glow-token]`
  - `border-radius: 12px`
- **Color Accent Glow by Type**:
  - **`success`**: Border left `4px solid #10B981` (Emerald), glow `rgba(16, 185, 129, 0.3)`, SVG checkmark icon.
  - **`error`**: Border left `4px solid #F43F5E` (Rose/Ruby), glow `rgba(244, 63, 94, 0.3)`, SVG alert icon.
  - **`info`**: Border left `4px solid #9D4EDD` (Royal Velvet), glow `rgba(157, 78, 221, 0.3)`, SVG information icon.
  - **`warning`**: Border left `4px solid #E0A96D` (Champagne Gold), glow `rgba(224, 169, 109, 0.3)`, SVG shield icon.

### 4.2 Toast HTML Mounting & Animation Mechanics
```html
<!-- Toast Container inside index.html -->
<div id="toast-container" class="toast-container" aria-live="polite"></div>
```

```css
/* Toast Container */
.toast-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  flex-direction: column-reverse;
  gap: 12px;
  z-index: 9999;
  pointer-events: none;
  max-width: 400px;
  width: calc(100% - 48px);
}

/* Individual Glass Toast */
.glass-toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  background: rgba(22, 20, 36, 0.88);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: #F8FAFC;
  font-size: 0.9rem;
  font-weight: 500;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  animation: toast-slide-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: all 0.3s ease;
  cursor: pointer;
}

.glass-toast.toast-exit {
  animation: toast-fade-out 0.3s ease forwards;
}

.glass-toast-success {
  border-left: 4px solid #10B981;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(16, 185, 129, 0.25);
}

.glass-toast-error {
  border-left: 4px solid #F43F5E;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(244, 63, 94, 0.25);
}

.glass-toast-info {
  border-left: 4px solid #9D4EDD;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(157, 78, 221, 0.25);
}

.glass-toast-warning {
  border-left: 4px solid #E0A96D;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(224, 169, 109, 0.25);
}

@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes toast-fade-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.9);
  }
}
```

---

## 5. Cart Badge Bounce & Glow Animation Lifecycle

### 5.1 The Interaction Pipeline
When the customer clicks "Add to Bag" on any catalog item card or inside the detail modal:
1. **Immediate Optimistic Action**:
   - `store.addToCart(product, 1)` updates `cart.itemCount` immediately.
2. **Animation Trigger**:
   - `triggerCartBadgeAnimation()` locates the DOM node `#nav-cart-badge`.
   - Clears existing animation class, forces reflow (`void badge.offsetWidth`), and applies class `badge-pop`.
3. **Keyframe Specs**:
   ```css
   @keyframes badge-bounce-glow {
     0% {
       transform: scale(1);
       box-shadow: 0 0 0 rgba(224, 169, 109, 0);
     }
     35% {
       transform: scale(1.45);
       box-shadow: 0 0 20px rgba(224, 169, 109, 0.9), 0 0 35px rgba(157, 78, 221, 0.6);
     }
     65% {
       transform: scale(0.92);
       box-shadow: 0 0 10px rgba(224, 169, 109, 0.4);
     }
     100% {
       transform: scale(1);
       box-shadow: 0 0 0 rgba(224, 169, 109, 0);
     }
   }

   .badge-pop {
     animation: badge-bounce-glow 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
   }
   ```
4. **Button Feedback Co-Animation**:
   - The clicked card button switches temporarily to:
     `<span class="text-emerald-400">✓ Added to Bag</span>`
     with an emerald glow for 1200ms before returning to `"Add to Bag"`.

---

## 6. Slide-Over Cart Drawer Interaction Lifecycle

### 6.1 State Machine Transitions

```
[ CLOSED ]
    │
    ▼ (User clicks Cart Icon in Navbar or "View Bag")
[ OPENING ] -> Add backdrop blur, slide in from right (translate-x-0)
    │
    ▼
[ OPEN (ACTIVE) ]
    ├─ (Click '+' stepper) ───────> Optimistic qty increment -> Live totals update -> API PUT /api/cart/items/:id
    ├─ (Click '-' stepper) ───────> Optimistic qty decrement -> If qty == 0, remove item -> Live totals update
    ├─ (Click 'Delete' icon) ─────> Optimistic remove -> Live totals update -> API DELETE /api/cart/items/:id
    ├─ (Click 'Proceed to Checkout') ──> Close Drawer -> Open Checkout Modal
    │
    ▼ (Click Backdrop, Close '✕', or Press ESC)
[ CLOSING ] -> Slide drawer off-canvas (translate-x-full), fade backdrop
    │
    ▼
[ CLOSED ]
```

### 6.2 Line-Item Quantity Stepper Contract
- **Increment (`+`)**:
  - Clamped to known stock or maximum 99.
  - Instantly updates subtotal, 8% tax, shipping, and grand total in the drawer summary card.
  - Updates free shipping progress bar:
    $$\text{Width \%} = \min(100, \frac{\text{Subtotal}}{50.00} \times 100)$$
- **Decrement (`-`)**:
  - If current quantity is 1, decrementing prompts confirmation or directly removes item via `removeCartItem(productId)`.
  - Otherwise decrements by 1 and updates live totals.
- **Empty Cart Handling**:
  - Displays frosted cosmetic jar illustration, text: *"Your luxury beauty bag is currently empty"*, and CTA button: *"Explore Curated Imports"* which closes drawer and scrolls to catalog.

---

## 7. Data Contracts & Backend Alignment Matrix

| Frontend Store Slice / Action | REST API Endpoint | HTTP Method | Request Body / Query Params | Expected Server Response |
|---|---|---|---|---|
| `auth.login(cred)` | `/api/auth/login` | `POST` | `{ email, password }` | `{ success: true, token, user }` |
| `auth.register(data)` | `/api/auth/register` | `POST` | `{ name, email, password, address }` | `{ success: true, token, user }` |
| `auth.getMe()` | `/api/auth/me` | `GET` | *(Bearer token header)* | `{ success: true, user }` |
| `catalog.fetchTaxonomy()` | `/api/products/categories` | `GET` | *(none)* | `{ success: true, categories: [], origins: [] }` |
| `catalog.fetchProducts()` | `/api/products` | `GET` | `?category=&origin=&q=&sort=&page=&limit=` | `{ success: true, count, total, page, pages, products: [] }` |
| `activeProduct.open(id)` | `/api/products/:id` | `GET` | *(none)* | `{ success: true, product: {} }` |
| `cart.syncAuthCart()` | `/api/cart` | `GET` | *(Bearer token header)* | `{ success: true, cart: { items, subtotal, tax, shipping, grandTotal, itemCount } }` |
| `cart.addToCart(id, qty)` | `/api/cart/items` | `POST` | `{ productId, quantity }` | `{ success: true, message, cart: {} }` |
| `cart.updateQuantity(id, qty)`| `/api/cart/items/:id` | `PUT` | `{ quantity }` | `{ success: true, message, cart: {} }` |
| `cart.removeCartItem(id)` | `/api/cart/items/:id` | `DELETE`| *(none)* | `{ success: true, message, cart: {} }` |
| `cart.clearCart()` | `/api/cart` | `DELETE`| *(none)* | `{ success: true, message, cart: {} }` |
| `checkout.submitCheckout()` | `/api/orders/checkout` | `POST` | `{ shippingAddress: {}, paymentDetails: {} }` | `{ success: true, order: {}, transactionId: "TXN-VA-..." }` |
| `orders.fetchMyOrders()` | `/api/orders/my-orders` | `GET` | *(Bearer token header)* | `{ success: true, count, orders: [] }` |
| `health.check()` | `/api/health` | `GET` | *(none)* | `{ status: "ok", database: "connected", mode: "memory"\|"external" }` |

---

## 8. Summary of Downstream Implementation Instructions

1. **Implementer (Worker)**:
   - Create `public/js/api.js` using the exact `ApiClient` class and singleton export provided in Section 2.2.
   - Create `public/js/store.js` using the exact `Store` class and singleton export provided in Section 3.3.
   - Ensure `public/js/app.js` calls `store.init()` upon `DOMContentLoaded`.
2. **UI Component Explorer & Implementer (`teamwork_explorer_m3_3`)**:
   - Connect navbar elements to `store.subscribe('cart', ...)` and `store.subscribe('auth', ...)`.
   - Wire catalog filter controls and search inputs to `store.setCategory`, `store.setOrigin`, `store.setSort`, `store.setSearchQuery`.
   - Connect cart drawer buttons to `store.updateQuantity`, `store.removeCartItem`, `store.closeCart`.
   - Mount `#toast-container` in `public/index.html` and connect toast renderer to `store.subscribe('ui', ...)`.
