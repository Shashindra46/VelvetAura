/**
 * VelvetAura - Cash on Delivery & Direct Bank Transfer Checkout Test Suite
 * 
 * Verifies COD and Direct Bank Transfer checkout pipelines, stock decrements,
 * bank transfer confirmation requirement, currency persistence, and admin oversight.
 */

const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/models/Order');
const Product = require('../../src/models/Product');
const User = require('../../src/models/User');
const Cart = require('../../src/models/Cart');

describe('Checkout & Payment Options (COD & Bank Transfer Integration Suite)', () => {
  let customerUser;
  let customerToken;
  let adminUser;
  let adminToken;
  let product1;
  let product2;

  beforeEach(async () => {
    // 1. Create customer
    customerUser = await User.create({
      name: 'Kasun Perera',
      email: `customer_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
      role: 'customer',
      address: {
        street: 'No. 45, Galle Road',
        city: 'Colombo',
        state: 'Western Province',
        zip: '00300',
        country: 'Sri Lanka',
      },
    });

    const custLogin = await request(app).post('/api/auth/login').send({
      email: customerUser.email,
      password: 'Password123!',
    });
    customerToken = custLogin.body.token;

    // 2. Create admin
    adminUser = await User.create({
      name: 'VelvetAura Finance Admin',
      email: `admin_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'AdminPassword123!',
      role: 'admin',
    });

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: adminUser.email,
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.token;

    // 3. Create products
    product1 = await Product.create({
      name: 'Sulwhasoo First Care Activating Serum',
      brand: 'Sulwhasoo',
      origin: 'South Korea',
      category: 'skincare',
      price: 12500.0,
      currency: 'LKR',
      stock: 15,
      description: 'Iconic Korean activating serum.',
    });

    product2 = await Product.create({
      name: 'Augustinus Bader The Rich Cream',
      brand: 'Augustinus Bader',
      origin: 'Germany',
      category: 'skincare',
      price: 28500.0,
      currency: 'LKR',
      stock: 8,
      description: 'Restorative luxury cream with TFC8.',
    });
  });

  const validShippingAddress = {
    fullName: 'Kasun Perera',
    street: 'No. 45, Galle Road',
    addressLine1: 'No. 45, Galle Road',
    city: 'Colombo',
    state: 'Western Province',
    zip: '00300',
    country: 'Sri Lanka',
    phone: '+94771234567',
  };

  describe('Cash on Delivery (COD) Checkout Flow', () => {
    test('successfully places COD order with pending status and LKR currency', async () => {
      // Add item to cart
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product1._id, quantity: 2 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validShippingAddress,
          paymentMethod: 'cod',
          paymentDetails: {
            method: 'cod',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.order;
      expect(order).toBeDefined();
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('cod');
      expect(order.paymentStatus).toBe('pending');
      expect(order.status).toBe('pending');
      expect(res.body.transactionId).toMatch(/^COD-VA-\d+-\d+$/);

      // Verify cart was emptied
      const cartRes = await request(app)
        .get('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(cartRes.body.cart.items.length).toBe(0);

      // Verify stock was decremented: 15 - 2 = 13
      const updatedProduct = await Product.findById(product1._id);
      expect(updatedProduct.stock).toBe(13);

      // Verify customer can retrieve order in history
      const historyRes = await request(app)
        .get('/api/orders/my-orders')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.orders.length).toBe(1);
      expect(historyRes.body.orders[0].paymentMethod).toBe('cod');
      expect(historyRes.body.orders[0].paymentStatus).toBe('pending');
    });
  });

  describe('Direct Bank Transfer Checkout Flow', () => {
    test('successfully places Direct Bank Transfer order when confirmed', async () => {
      // Add item to cart
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product2._id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validShippingAddress,
          paymentMethod: 'bank_transfer',
          bankTransferConfirmed: true,
          paymentDetails: {
            method: 'bank_transfer',
            confirmed: true,
          },
          paymentNotes: 'Transfer reference: COMBANK-ONLINE-771',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.order;
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('bank_transfer');
      expect(order.paymentStatus).toBe('pending');
      expect(order.status).toBe('pending');
      expect(res.body.transactionId).toMatch(/^BT-VA-\d+-\d+$/);

      // Verify bank confirmation flag stored
      const fetchedOrder = await Order.findById(order._id);
      expect(fetchedOrder.payment.bankDetails.confirmed).toBe(true);
      expect(fetchedOrder.payment.bankDetails.accountNumber).toBe('1000 8924 7712');

      // Verify inventory decremented
      const updatedProduct = await Product.findById(product2._id);
      expect(updatedProduct.stock).toBe(7);
    });

    test('rejects Direct Bank Transfer without confirmation with HTTP 400', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ productId: product2._id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          shippingAddress: validShippingAddress,
          paymentMethod: 'bank_transfer',
          bankTransferConfirmed: false,
          paymentDetails: {
            method: 'bank_transfer',
            confirmed: false,
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Confirmation of bank transfer is required');
    });
  });

  describe('Admin Order Oversight & Payment Status Updates', () => {
    test('admin can update order paymentStatus to paid and fulfill order', async () => {
      // Create pending bank transfer order
      const order = await Order.create({
        orderNumber: `VA-ADMIN-TEST-${Date.now()}`,
        user: customerUser._id,
        items: [
          {
            product: product1._id,
            name: product1.name,
            brand: product1.brand,
            price: product1.price,
            quantity: 1,
          },
        ],
        shippingAddress: validShippingAddress,
        currency: 'LKR',
        pricing: {
          subtotal: 12500.0,
          tax: 1000.0,
          shipping: 0.0,
          grandTotal: 13500.0,
        },
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        status: 'pending',
      });

      // 1. Admin verifies bank transfer -> marks paymentStatus = 'paid'
      const updateRes = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          paymentStatus: 'paid',
          notes: 'Bank slip verified with Commercial Bank statement',
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.order.paymentStatus).toBe('paid');
      expect(updateRes.body.order.payment.status).toBe('paid');
      expect(updateRes.body.order.payment.paidAt).toBeDefined();

      // 2. Admin fulfills order -> marks status = 'shipped'
      const fulfillRes = await request(app)
        .put(`/api/orders/${order._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'shipped',
        });

      expect(fulfillRes.status).toBe(200);
      expect(fulfillRes.body.order.status).toBe('shipped');
      expect(fulfillRes.body.order.paymentStatus).toBe('paid'); // Remains paid

      // 3. Admin retrieves all orders -> verifies paymentMethod and paymentStatus returned
      const allOrdersRes = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(allOrdersRes.status).toBe(200);
      const targetOrder = allOrdersRes.body.orders.find((o) => o._id === String(order._id));
      expect(targetOrder).toBeDefined();
      expect(targetOrder.paymentMethod).toBe('bank_transfer');
      expect(targetOrder.paymentStatus).toBe('paid');
    });
  });
});
