/**
 * VelvetAura Opaque-Box HTTP Test Client
 * Sends external HTTP requests to the target Express app or live server URL.
 * Implements strict interface contracts from PROJECT.md.
 */

let supertest;
try {
  supertest = require('supertest');
} catch (e) {
  supertest = null;
}

let loadedApp = null;
function getApp() {
  if (loadedApp) return loadedApp;
  try {
    try {
      loadedApp = require('../../../src/app');
    } catch (e1) {
      loadedApp = require('../../src/app');
    }
    if (loadedApp && loadedApp.default) {
      loadedApp = loadedApp.default;
    }
    return loadedApp;
  } catch (err) {
    return null;
  }
}

class TestClient {
  constructor(baseUrl = process.env.BASE_URL) {
    this.baseUrl = baseUrl;
    this.app = baseUrl ? null : getApp();
  }

  setApp(app) {
    this.app = app;
  }

  async _request(method, path, body = null, headers = {}) {
    const finalHeaders = {
      'Accept': 'application/json',
      ...headers
    };

    if (body && !finalHeaders['Content-Type'] && !(body instanceof FormData)) {
      finalHeaders['Content-Type'] = 'application/json';
    }

    if (this.baseUrl) {
      // Live server over HTTP
      const url = `${this.baseUrl.replace(/\/$/, '')}${path}`;
      const fetchOpts = {
        method: method.toUpperCase(),
        headers: finalHeaders
      };

      if (body) {
        fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
      }

      const res = await fetch(url, fetchOpts);
      let resBody;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        try {
          resBody = await res.json();
        } catch (e) {
          resBody = await res.text();
        }
      } else {
        resBody = await res.text();
      }

      const responseHeaders = {};
      res.headers.forEach((val, key) => {
        responseHeaders[key.toLowerCase()] = val;
      });

      return {
        status: res.status,
        headers: responseHeaders,
        body: resBody,
        ok: res.ok
      };
    }

    // In-process Supertest execution
    const app = this.app || getApp();
    if (!app) {
      throw new Error(
        'TestClient could not load Express app from src/app.js, and BASE_URL is not set.'
      );
    }

    if (!supertest) {
      throw new Error('Supertest is not installed in the environment.');
    }

    const agent = supertest(app);
    let req = agent[method.toLowerCase()](path);

    for (const [key, value] of Object.entries(finalHeaders)) {
      req = req.set(key, value);
    }

    if (body) {
      req = req.send(body);
    }

    const res = await req;
    return {
      status: res.status,
      headers: res.headers,
      body: res.body && Object.keys(res.body).length > 0 ? res.body : (res.text ? tryParseJson(res.text) : res.body),
      text: res.text,
      ok: res.status >= 200 && res.status < 300
    };
  }

  // Generic HTTP methods
  get(path, headers = {}) {
    return this._request('GET', path, null, headers);
  }

  post(path, body = null, headers = {}) {
    return this._request('POST', path, body, headers);
  }

  put(path, body = null, headers = {}) {
    return this._request('PUT', path, body, headers);
  }

  delete(path, headers = {}) {
    return this._request('DELETE', path, null, headers);
  }

  // Contract-specific API Helpers
  async register(userData) {
    return this.post('/api/auth/register', userData);
  }

  async login(credentials) {
    return this.post('/api/auth/login', credentials);
  }

  async getProfile(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.get('/api/auth/me', headers);
  }

  async getProducts(params = {}) {
    const qs = new URLSearchParams(params).toString();
    const path = qs ? `/api/products?${qs}` : '/api/products';
    return this.get(path);
  }

  async getProductById(id) {
    return this.get(`/api/products/${id}`);
  }

  async getCart(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.get('/api/cart', headers);
  }

  async addToCart(token, { productId, quantity = 1 }) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.post('/api/cart/items', { productId, quantity }, headers);
  }

  async updateCartItem(token, productId, { quantity }) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.put(`/api/cart/items/${productId}`, { quantity }, headers);
  }

  async removeCartItem(token, productId) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.delete(`/api/cart/items/${productId}`, headers);
  }

  async clearCart(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.delete('/api/cart', headers);
  }

  async checkout(token, payload) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.post('/api/orders/checkout', payload, headers);
  }

  async getMyOrders(token) {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return this.get('/api/orders/my-orders', headers);
  }

  async getHealth() {
    return this.get('/api/health');
  }
}

function tryParseJson(str) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return str;
  }
}

module.exports = {
  TestClient,
  testClient: new TestClient()
};
