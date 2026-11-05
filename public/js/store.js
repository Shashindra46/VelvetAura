/**
 * VelvetAura - Client Reactive State Manager
 * 
 * Implements a centralized, reactive state container utilizing the Observer pattern.
 * Coordinates Auth lifecycle, Guest/Member Cart auto-sync, Catalog query state,
 * Product detail modal, Checkout transactions, and Glass Toast notifications.
 */

import api from './api.js';

export class Store {
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
        priceRange: 'all',
        minPrice: null,
        maxPrice: null,
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
        isOpen: false,
        isSubmitting: false,
        lastOrder: null,
        transactionId: null,
        error: null,
        shippingAddress: {
          fullName: '',
          street: '',
          address2: '',
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
      admin: {
        activeTab: 'products', // 'products' | 'orders'
        orders: [],
        isSaving: false,
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
      this.state[slice] = {};
    }

    this.state[slice] = {
      ...this.state[slice],
      ...partialState,
    };

    this.notify(slice);
  }

  /**
   * Get snapshot of current state or slice
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

          // Validate token against backend
          api.getMe().then((res) => {
            if (res.success && res.data && res.data.user) {
              this.setState('auth', { user: res.data.user });
              if (res.data.user.shippingAddress || res.data.user.address) {
                const addr = res.data.user.shippingAddress || res.data.user.address;
                this.setState('checkout', {
                  shippingAddress: {
                    ...this.state.checkout.shippingAddress,
                    ...addr,
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

    if (user.shippingAddress || user.address) {
      const addr = user.shippingAddress || user.address;
      this.setState('checkout', {
        shippingAddress: {
          ...this.state.checkout.shippingAddress,
          ...addr,
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
    const { activeCategory, activeOrigin, minPrice, maxPrice, searchQuery, sort, page } = this.state.catalog;
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
    if (minPrice !== null && minPrice !== undefined) {
      queryParams.minPrice = minPrice;
    }
    if (maxPrice !== null && maxPrice !== undefined) {
      queryParams.maxPrice = maxPrice;
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

  setActiveCategory(category) {
    this.setCategory(category);
  }

  setOrigin(origin) {
    this.setState('catalog', {
      activeOrigin: origin,
      page: 1,
    });
    this.fetchProducts();
  }

  setActiveOrigin(origin) {
    this.setOrigin(origin);
  }

  setPriceRange(min, max) {
    this.setState('catalog', {
      minPrice: min !== undefined ? min : null,
      maxPrice: max !== undefined ? max : null,
      page: 1,
    });
    this.fetchProducts();
  }

  setPriceFilter(rangeStr) {
    if (rangeStr === 'all' || !rangeStr) {
      this.setState('catalog', { priceRange: 'all', minPrice: null, maxPrice: null, page: 1 });
    } else if (rangeStr === '0-50') {
      this.setState('catalog', { priceRange: rangeStr, minPrice: 0, maxPrice: 50, page: 1 });
    } else if (rangeStr === '50-100') {
      this.setState('catalog', { priceRange: rangeStr, minPrice: 50, maxPrice: 100, page: 1 });
    } else if (rangeStr === '100-250') {
      this.setState('catalog', { priceRange: rangeStr, minPrice: 100, maxPrice: 250, page: 1 });
    } else if (rangeStr === '250-9999') {
      this.setState('catalog', { priceRange: rangeStr, minPrice: 250, maxPrice: null, page: 1 });
    }
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

  resetFilters() {
    this.setState('catalog', {
      activeCategory: 'all',
      activeOrigin: 'all',
      priceRange: 'all',
      minPrice: null,
      maxPrice: null,
      searchQuery: '',
      sort: 'featured',
      page: 1,
    });
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
   * Matches backend mathematical rules exactly:
   * 8% tax rate, free shipping over $50.00 ($5.99 below).
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
          const productId = item.product?._id || item.product || item.productId || item._id;
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
   * @param {Object|string} productOrId - Product model or ObjectId
   * @param {number} quantity - Quantity to add
   */
  async addToCart(productOrId, quantity = 1) {
    let product = productOrId;
    let prodId = null;

    if (typeof productOrId === 'string') {
      prodId = productOrId;
      product = this.state.catalog.products.find(p => (p._id || p.id) === prodId) ||
                (this.state.activeProduct.product?._id === prodId ? this.state.activeProduct.product : null);
      if (!product) {
        const res = await api.getProduct(prodId);
        if (res.success && res.data?.product) {
          product = res.data.product;
        }
      }
    } else if (productOrId && typeof productOrId === 'object') {
      prodId = productOrId._id || productOrId.id;
    }

    if (!prodId) return;

    const qtyToAdd = Math.max(1, parseInt(quantity, 10) || 1);

    // Optimistically update cart line items
    const currentItems = [...this.state.cart.items];
    const existingIndex = currentItems.findIndex(
      (item) => (item.product?._id || item.product || item.productId || item._id) === prodId
    );

    if (existingIndex > -1) {
      currentItems[existingIndex] = {
        ...currentItems[existingIndex],
        quantity: currentItems[existingIndex].quantity + qtyToAdd,
      };
    } else {
      currentItems.push({
        product: prodId,
        productId: prodId,
        _id: prodId,
        name: product?.name || 'Luxury Product',
        brand: product?.brand || 'VelvetAura Import',
        price: product?.price || 0,
        stock: product?.stock || 99,
        quantity: qtyToAdd,
        image: product?.image || (Array.isArray(product?.images) && product?.images[0]) || '/assets/images/placeholder.svg',
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
    this.showToast(`Added "${product?.name || 'Item'}" to your shopping bag`, 'success');

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

    let currentItems = [...this.state.cart.items];
    const index = currentItems.findIndex(
      (item) => (item.product?._id || item.product || item.productId || item._id) === productId
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

  updateCartItem(productId, newQty) {
    return this.updateQuantity(productId, newQty);
  }

  /**
   * Remove a line item from cart
   */
  async removeCartItem(productId) {
    const currentItems = this.state.cart.items.filter(
      (item) => (item.product?._id || item.product || item.productId || item._id) !== productId
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

  openCheckout() {
    this.setState('checkout', { isOpen: true, error: null });
  }

  closeCheckout() {
    this.setState('checkout', { isOpen: false, error: null });
  }

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
      this.showToast('Autofilled approved test card (Visa)', 'info');
    } else {
      this.setState('checkout', {
        paymentDetails: {
          cardNumber: '4000000000000002',
          expDate: '12/28',
          cvv: '000',
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
  async submitCheckout(customPayload) {
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
    const payload = customPayload || {
      shippingAddress,
      paymentDetails,
    };

    this.setState('checkout', { isSubmitting: true, error: null });

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
      isOpen: false,
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
  // Admin Operations & Reactive State
  // =========================================================================

  /**
   * Set active tab in Admin Dashboard
   * @param {'products'|'orders'} tab - Active tab view
   */
  setAdminActiveTab(tab) {
    this.setState('admin', { activeTab: tab });
  }

  /**
   * Fetch all customer orders for store administrator
   */
  async fetchAdminOrders() {
    this.setState('admin', { error: null });
    const res = await api.getAllOrders();
    if (res.success && res.data) {
      const orders = res.data.orders || [];
      this.setState('admin', { orders, error: null });
      return orders;
    } else {
      const msg = res.error || res.data?.message || 'Failed to fetch admin orders';
      this.setState('admin', { error: msg });
      return [];
    }
  }

  /**
   * Upload product image file via admin portal
   * @param {File|FormData} fileOrFormData - Image file or FormData
   * @returns {Promise<string>} Uploaded image URL (e.g. '/assets/images/products/...')
   */
  async uploadProductImage(fileOrFormData) {
    this.setState('admin', { isSaving: true, error: null });
    const res = await api.uploadProductImage(fileOrFormData);
    this.setState('admin', { isSaving: false });

    if (res.success && res.data && res.data.imageUrl) {
      return res.data.imageUrl;
    } else {
      const msg = res.error || res.data?.message || 'Failed to upload product image';
      this.showToast(msg, 'error');
      this.setState('admin', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Create new product via admin portal
   * @param {Object} productData - New product details
   */
  async createAdminProduct(productData) {
    this.setState('admin', { isSaving: true, error: null });
    const res = await api.createProduct(productData);
    this.setState('admin', { isSaving: false });

    if (res.success && res.data) {
      this.showToast('Product added successfully', 'success');
      await this.fetchProducts();
      await this.fetchTaxonomy();
      return res.data.product;
    } else {
      const msg = res.error || res.data?.message || 'Failed to create product';
      this.showToast(msg, 'error');
      this.setState('admin', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Update existing product via admin portal
   * @param {string} id - Product ID
   * @param {Object} productData - Product fields to update
   */
  async updateAdminProduct(id, productData) {
    this.setState('admin', { isSaving: true, error: null });
    const res = await api.updateProduct(id, productData);
    this.setState('admin', { isSaving: false });

    if (res.success && res.data) {
      this.showToast('Product updated successfully', 'success');
      await this.fetchProducts();
      return res.data.product;
    } else {
      const msg = res.error || res.data?.message || 'Failed to update product';
      this.showToast(msg, 'error');
      this.setState('admin', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Delete product via admin portal
   * @param {string} id - Product ID
   */
  async deleteAdminProduct(id) {
    this.setState('admin', { isSaving: true, error: null });
    const res = await api.deleteProduct(id);
    this.setState('admin', { isSaving: false });

    if (res.success) {
      this.showToast('Product deleted successfully', 'success');
      await this.fetchProducts();
      return true;
    } else {
      const msg = res.error || res.data?.message || 'Failed to delete product';
      this.showToast(msg, 'error');
      this.setState('admin', { error: msg });
      throw new Error(msg);
    }
  }

  /**
   * Update order fulfillment status via admin portal
   * @param {string} orderId - Order ObjectId
   * @param {string} status - New order status enum
   */
  async updateAdminOrderStatus(orderId, status) {
    this.setState('admin', { isSaving: true, error: null });
    const res = await api.updateOrderStatus(orderId, status);
    this.setState('admin', { isSaving: false });

    if (res.success && res.data) {
      this.showToast(`Order status updated to ${status}`, 'success');
      await this.fetchAdminOrders();
      return res.data.order;
    } else {
      const msg = res.error || res.data?.message || 'Failed to update order status';
      this.showToast(msg, 'error');
      this.setState('admin', { error: msg });
      throw new Error(msg);
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
    const badge = document.getElementById('cart-badge') || document.getElementById('nav-cart-badge');
    if (!badge) return;

    badge.classList.remove('badge-pop', 'badge-pulse');
    // Force DOM reflow to re-trigger keyframe animation
    void badge.offsetWidth;
    badge.classList.add('badge-pop');

    setTimeout(() => {
      badge.classList.remove('badge-pop', 'badge-pulse');
    }, 600);
  }
}

// Export singleton instance
export const store = new Store();
export default store;
