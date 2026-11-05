/**
 * VelvetAura - Milestone 5: Admin Dashboard Test Suite
 * 
 * Verifies:
 * 1. Role-Based Access Control (RBAC):
 *    - 401 Unauthorized for unauthenticated requests
 *    - 403 Forbidden for customer requests to admin endpoints
 *    - 200/201 OK for authorized admin requests
 * 2. Product Management CRUD:
 *    - POST /api/products creates product with validation
 *    - PUT /api/products/:id updates product attributes and validates bounds
 *    - DELETE /api/products/:id removes product
 * 3. Order Oversight & Status Management:
 *    - GET /api/orders lists all customer orders populated with user details
 *    - PUT /api/orders/:id/status updates fulfillment status against enum
 * 4. Architecture and Contract Compliance:
 *    - Middleware exports and signatures
 *    - Frontend SPA route protection and role-based navigation contracts
 */

const request = require('supertest');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const app = require('../src/app');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const Order = require('../src/models/Order');
const authMiddleware = require('../src/middleware/authMiddleware');

describe('Milestone 5: Admin Dashboard Subsystem', () => {
  let adminUser;
  let customerUser;
  let adminToken;
  let customerToken;
  let existingProduct;
  let existingOrder;

  beforeEach(async () => {
    // 1. Create genuine admin user in database
    adminUser = await User.create({
      name: 'Vault Administrator',
      email: 'admin.test@velvetaura.luxury',
      password: 'AdminSuperPassword2026!',
      role: 'admin',
      address: {
        street: '1 Place Vendôme',
        city: 'Paris',
        state: 'Ile-de-France',
        zip: '75001',
        country: 'France',
      },
    });

    // 2. Create genuine customer user in database
    customerUser = await User.create({
      name: 'Elena Rostova',
      email: 'elena.rostova@velvetaura.luxury',
      password: 'CustomerPassword2026!',
      role: 'customer',
      address: {
        street: '450 Park Avenue',
        city: 'New York',
        state: 'NY',
        zip: '10022',
        country: 'USA',
      },
    });

    // 3. Obtain real JWT tokens via authentication endpoints
    const adminLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin.test@velvetaura.luxury',
        password: 'AdminSuperPassword2026!',
      });
    adminToken = adminLoginRes.body.token;

    const customerLoginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'elena.rostova@velvetaura.luxury',
        password: 'CustomerPassword2026!',
      });
    customerToken = customerLoginRes.body.token;

    // 4. Seed a baseline luxury product
    existingProduct = await Product.create({
      name: 'Sublimage L’Extrait de Crème',
      brand: 'Chanel',
      origin: 'France',
      category: 'skincare',
      description: 'An all-in-one cream combining all the active fractions of Vanilla Planifolia for ultimate revitalization.',
      price: 650.00,
      stock: 12,
      images: ['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800'],
      featured: true,
    });

    // 5. Seed a baseline customer order
    existingOrder = await Order.create({
      user: customerUser._id,
      items: [
        {
          product: existingProduct._id,
          name: existingProduct.name,
          brand: existingProduct.brand,
          origin: existingProduct.origin,
          price: existingProduct.price,
          quantity: 1,
          image: existingProduct.images[0],
        },
      ],
      shippingAddress: {
        fullName: 'Elena Rostova',
        street: '450 Park Avenue',
        city: 'New York',
        state: 'NY',
        zip: '10022',
        country: 'USA',
      },
      pricing: {
        subtotal: 650.00,
        tax: 52.00,
        shipping: 0.00,
        grandTotal: 702.00,
      },
      payment: {
        transactionId: 'mock_tx_admin_seed_001',
        method: 'mock_credit_card',
        status: 'succeeded',
        cardLast4: '4242',
      },
      status: 'pending',
    });
  });

  // =========================================================================
  // 1. Role-Based Access Control (RBAC) Guard Verification
  // =========================================================================
  describe('RBAC Route Protection & Access Guards', () => {
    test('POST /api/products should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .post('/api/products')
        .send({ name: 'Unauthorized Item' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not authorized/i);
    });

    test('POST /api/products should reject customer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Customer Created Item',
          brand: 'Unauthorized',
          origin: 'France',
          category: 'skincare',
          description: 'A customer should not be able to create products in the catalog.',
          price: 99.00,
          stock: 5,
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/administrator privileges required/i);
      expect(res.body.error).toBe('Forbidden');
    });

    test('PUT /api/products/:id should reject customer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .put(`/api/products/${existingProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ price: 10.00 });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/administrator privileges required/i);
    });

    test('DELETE /api/products/:id should reject customer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .delete(`/api/products/${existingProduct._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/administrator privileges required/i);
    });

    test('GET /api/orders should reject unauthenticated requests with 401', async () => {
      const res = await request(app)
        .get('/api/orders');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/orders should reject customer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/administrator privileges required/i);
    });

    test('PUT /api/orders/:id/status should reject customer requests with 403 Forbidden', async () => {
      const res = await request(app)
        .put(`/api/orders/${existingOrder._id}/status`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ status: 'delivered' });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/administrator privileges required/i);
    });
  });

  // =========================================================================
  // 2. Product Management CRUD Endpoints
  // =========================================================================
  describe('Product Management CRUD (Admin)', () => {
    test('POST /api/products should successfully create a new luxury product', async () => {
      const newProductPayload = {
        name: 'The Rich Cream',
        brand: 'Augustinus Bader',
        origin: 'Germany',
        category: 'skincare',
        subcategory: 'Moisturizer',
        description: 'An intensely luxurious, deeply moisturizing formula powered by TFC8 patented cellular technology.',
        price: 290.00,
        stock: 35,
        image: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800',
        volume: '50 ml / 1.7 oz',
        featured: true,
      };

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(newProductPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.product).toBeDefined();
      expect(res.body.product.name).toBe(newProductPayload.name);
      expect(res.body.product.brand).toBe(newProductPayload.brand);
      expect(res.body.product.origin).toBe(newProductPayload.origin);
      expect(res.body.product.category).toBe(newProductPayload.category);
      expect(res.body.product.price).toBe(290);
      expect(res.body.product.stock).toBe(35);

      // Verify persistence in MongoDB
      const persisted = await Product.findById(res.body.product._id);
      expect(persisted).not.toBeNull();
      expect(persisted.name).toBe(newProductPayload.name);
    });

    test('POST /api/products should reject creation with missing required fields', async () => {
      const incompletePayload = {
        name: 'Missing Fields Cream',
        // missing brand, origin, category, description, price
      };

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(incompletePayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('POST /api/products should reject creation with unsupported category', async () => {
      const invalidCatPayload = {
        name: 'Luxury Smartphone Case',
        brand: 'Goldcraft',
        origin: 'Italy',
        category: 'electronics', // Invalid! Allowed: skincare, cosmetics, fragrances, haircare
        description: 'Fine Italian calfskin crafted phone case with 24K gold accents.',
        price: 150.00,
        stock: 10,
      };

      const res = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidCatPayload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/category/i);
    });

    test('POST /api/products should reject creation with negative price or negative stock', async () => {
      const negativePriceRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Negative Price Serum',
          brand: 'Serum Co',
          origin: 'South Korea',
          category: 'skincare',
          description: 'A high-potency serum with impossible negative pricing.',
          price: -25.00,
          stock: 10,
        });

      expect(negativePriceRes.status).toBe(400);
      expect(negativePriceRes.body.success).toBe(false);

      const negativeStockRes = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Negative Stock Serum',
          brand: 'Serum Co',
          origin: 'South Korea',
          category: 'skincare',
          description: 'A high-potency serum with impossible negative inventory.',
          price: 25.00,
          stock: -5,
        });

      expect(negativeStockRes.status).toBe(400);
      expect(negativeStockRes.body.success).toBe(false);
    });

    test('PUT /api/products/:id should update existing product attributes', async () => {
      const updatePayload = {
        price: 695.00,
        stock: 18,
        description: 'Updated luxury description for Sublimage L’Extrait de Crème with enriched formulation.',
        featured: false,
      };

      const res = await request(app)
        .put(`/api/products/${existingProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updatePayload);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.product.price).toBe(695);
      expect(res.body.product.stock).toBe(18);
      expect(res.body.product.featured).toBe(false);

      // Verify database reflection
      const updatedDB = await Product.findById(existingProduct._id);
      expect(updatedDB.price).toBe(695);
      expect(updatedDB.stock).toBe(18);
    });

    test('PUT /api/products/:id should return 404 for non-existent ObjectId', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/product not found/i);
    });

    test('PUT /api/products/:id should return 400 for malformed ObjectId', async () => {
      const res = await request(app)
        .put('/api/products/invalid-hex-id-1234')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ price: 100 });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('DELETE /api/products/:id should permanently delete product', async () => {
      const res = await request(app)
        .delete(`/api/products/${existingProduct._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted successfully/i);

      // Verify product is gone from database
      const deletedFromDB = await Product.findById(existingProduct._id);
      expect(deletedFromDB).toBeNull();

      // Subsequent public GET should return 404
      const getRes = await request(app).get(`/api/products/${existingProduct._id}`);
      expect(getRes.status).toBe(404);
    });

    test('DELETE /api/products/:id should return 404 for non-existent product', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/products/${nonExistentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // =========================================================================
  // 3. Order Oversight & Status Updates
  // =========================================================================
  describe('Order Oversight & Fulfillment Management (Admin)', () => {
    test('GET /api/orders should return all customer orders with populated user information', async () => {
      const res = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.orders)).toBe(true);
      expect(res.body.orders.length).toBeGreaterThanOrEqual(1);

      const targetOrder = res.body.orders.find((o) => String(o._id) === String(existingOrder._id));
      expect(targetOrder).toBeDefined();
      expect(targetOrder.user).toBeDefined();
      expect(targetOrder.user.name).toBe('Elena Rostova');
      expect(targetOrder.user.email).toBe('elena.rostova@velvetaura.luxury');
    });

    test('PUT /api/orders/:id/status should update order status to shipped', async () => {
      const res = await request(app)
        .put(`/api/orders/${existingOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.status).toBe('shipped');

      // Verify in MongoDB
      const updatedDB = await Order.findById(existingOrder._id);
      expect(updatedDB.status).toBe('shipped');
    });

    test('PUT /api/orders/:id/status should support all valid status enum states', async () => {
      const validEnumStates = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];

      for (const st of validEnumStates) {
        const res = await request(app)
          .put(`/api/orders/${existingOrder._id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: st });

        expect(res.status).toBe(200);
        expect(res.body.order.status).toBe(st);
      }
    });

    test('PUT /api/orders/:id/status should reject invalid status enum value with 400', async () => {
      const res = await request(app)
        .put(`/api/orders/${existingOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'teleported' }); // Invalid!

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid order status/i);
    });

    test('PUT /api/orders/:id/status should return 404 for non-existent order', async () => {
      const nonExistentId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .put(`/api/orders/${nonExistentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'processing' });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/order not found/i);
    });
  });

  // =========================================================================
  // 4. Architecture & Frontend Contracts Verification
  // =========================================================================
  describe('Frontend & Architecture Contract Compliance', () => {
    test('authMiddleware should correctly export protect, optionalAuth, and admin middleware functions', () => {
      expect(typeof authMiddleware.protect).toBe('function');
      expect(typeof authMiddleware.optionalAuth).toBe('function');
      expect(typeof authMiddleware.admin).toBe('function');
    });

    test('public/index.html must contain #admin-view-container mounting section', () => {
      const htmlPath = path.join(__dirname, '../public/index.html');
      const htmlContent = fs.readFileSync(htmlPath, 'utf8');
      expect(htmlContent).toContain('id="admin-view-container"');
      expect(htmlContent).toContain('admin-section');
    });

    test('public/js/components/navbar.js must render admin dashboard link conditionally on role === admin', () => {
      const navPath = path.join(__dirname, '../public/js/components/navbar.js');
      const navContent = fs.readFileSync(navPath, 'utf8');
      expect(navContent).toContain('role === \'admin\'');
      expect(navContent).toContain('id="nav-admin-link"');
      expect(navContent).toContain('#/admin');
    });

    test('public/js/app.js must guard #/admin route and redirect non-admin users', () => {
      const appJsPath = path.join(__dirname, '../public/js/app.js');
      const appJsContent = fs.readFileSync(appJsPath, 'utf8');
      expect(appJsContent).toContain('#/admin');
      expect(appJsContent).toContain('role !== \'admin\'');
      expect(appJsContent).toContain('adminDashboard');
    });

    test('public/js/components/adminDashboard.js must exist and export AdminDashboardComponent', () => {
      const adminDashPath = path.join(__dirname, '../public/js/components/adminDashboard.js');
      expect(fs.existsSync(adminDashPath)).toBe(true);
      const dashContent = fs.readFileSync(adminDashPath, 'utf8');
      expect(dashContent).toContain('class AdminDashboardComponent');
      expect(dashContent).toContain('export default AdminDashboardComponent');
    });
  });
});
