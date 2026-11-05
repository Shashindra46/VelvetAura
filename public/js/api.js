/**
 * VelvetAura - Client REST API Wrapper Service
 * 
 * Provides unified, promise-based HTTP communication with backend services.
 * Automatically injects JWT Bearer authorization headers, formats payloads,
 * and normalizes responses into { success, data, error, status }.
 */

export class ApiClient {
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

  /**
   * Upload product image file (Admin only)
   * @param {File|FormData} fileOrFormData - Image file or pre-constructed FormData
   * @returns {Promise<{ success: boolean, data: { success: boolean, imageUrl: string, message?: string }, error: string|null, status: number }>}
   */
  async uploadProductImage(fileOrFormData) {
    let formData;
    if (fileOrFormData instanceof FormData) {
      formData = fileOrFormData;
    } else {
      formData = new FormData();
      formData.append('image', fileOrFormData);
    }

    return this.request('/products/upload', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Create a new product (Admin only)
   * @param {Object} productData - New product attributes
   */
  async createProduct(productData) {
    return this.request('/products', {
      method: 'POST',
      body: productData,
    });
  }

  /**
   * Update existing product by ID (Admin only)
   * @param {string} id - Product ObjectId
   * @param {Object} productData - Updated product attributes
   */
  async updateProduct(id, productData) {
    return this.request(`/products/${id}`, {
      method: 'PUT',
      body: productData,
    });
  }

  /**
   * Delete product by ID (Admin only)
   * @param {string} id - Product ObjectId
   */
  async deleteProduct(id) {
    return this.request(`/products/${id}`, {
      method: 'DELETE',
    });
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

  /**
   * Retrieve all customer orders across store (Admin only)
   */
  async getAllOrders() {
    return this.request('/orders', { method: 'GET' });
  }

  /**
   * Update fulfillment status of an order (Admin only)
   * @param {string} orderId - Order ObjectId
   * @param {string} status - New order status enum
   */
  async updateOrderStatus(orderId, status) {
    return this.request(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: { status },
    });
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
