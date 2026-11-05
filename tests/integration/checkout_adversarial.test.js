/**
 * VelvetAura - Adversarial Checkout & Payment Options (COD & Bank Transfer)
 * Challenger: teamwork_challenger_pay_2
 * 
 * Adversarially challenges:
 * 1. Bank Transfer Confirmation Guard:
 *    - Rejection of checkout without bankTransferConfirmed: true (HTTP 400)
 *    - Rejection with boolean false, null, undefined, string 'true', number 1
 *    - Frontend UI modal blocking and error message display
 * 2. COD Checkout Flow:
 *    - Initial paymentStatus: 'pending' and fulfillment status: 'pending'
 *    - Exact inventory decrement and cart clearance
 *    - Stock depletion rollback during checkout
 *    - Rejection of empty cart checkout
 * 3. Currency Display & Formatting:
 *    - formatPrice edge cases (0, fractions, large numbers, NaN, null, undefined, strings)
 *    - formatPaymentMethod and formatPaymentStatus badge and status mappings
 *    - Verification of no NaN, undefined, or hardcoded $ in customer/admin views
 * 4. Admin Status Updates & RBAC Security:
 *    - Admin updating paymentStatus (pending -> paid, paid -> pending)
 *    - Admin updating fulfillment status (pending -> processing -> shipped -> delivered)
 *    - Timestamp paidAt recorded on paid, cleared on pending
 *    - Invalid status strings rejected with HTTP 400
 *    - Customer RBAC 403 enforcement on status updates and GET /api/orders
 *    - Cross-customer order detail access rejected with HTTP 403
 */

const path = require('path');
const fs = require('fs');
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../src/app');
const User = require('../../src/models/User');
const Product = require('../../src/models/Product');
const Cart = require('../../src/models/Cart');
const Order = require('../../src/models/Order');

describe('Adversarial Challenge: COD & Bank Transfer Checkout, Currency, & RBAC', () => {
  let customer1;
  let customer1Token;
  let customer2;
  let customer2Token;
  let adminUser;
  let adminToken;
  let serumProduct;
  let perfumeProduct;

  const validShipping = {
    fullName: 'Dilshan Silva',
    street: 'No. 12, Flower Road',
    city: 'Colombo',
    state: 'Western Province',
    zip: '00700',
    country: 'Sri Lanka',
    phone: '+94712345678',
  };

  beforeEach(async () => {
    // 1. Seed Customer 1
    customer1 = await User.create({
      name: 'Dilshan Silva',
      email: `dilshan_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
      role: 'customer',
    });
    const cust1Login = await request(app).post('/api/auth/login').send({
      email: customer1.email,
      password: 'Password123!',
    });
    customer1Token = cust1Login.body.token;

    // 2. Seed Customer 2
    customer2 = await User.create({
      name: 'Anuki Perera',
      email: `anuki_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'Password123!',
      role: 'customer',
    });
    const cust2Login = await request(app).post('/api/auth/login').send({
      email: customer2.email,
      password: 'Password123!',
    });
    customer2Token = cust2Login.body.token;

    // 3. Seed Admin
    adminUser = await User.create({
      name: 'Admin Commander',
      email: `admin_${Date.now()}_${Math.random()}@velvetaura.test`,
      password: 'AdminPassword123!',
      role: 'admin',
    });
    const adminLogin = await request(app).post('/api/auth/login').send({
      email: adminUser.email,
      password: 'AdminPassword123!',
    });
    adminToken = adminLogin.body.token;

    // 4. Seed Products
    serumProduct = await Product.create({
      name: 'Sulwhasoo First Care Activating Serum VI',
      brand: 'Sulwhasoo',
      origin: 'South Korea',
      category: 'skincare',
      price: 18500.0,
      currency: 'LKR',
      stock: 10,
      description: 'Pre-serum formulated with JAUM Activator.',
    });

    perfumeProduct = await Product.create({
      name: 'Maison Francis Kurkdjian Baccarat Rouge 540',
      brand: 'Maison Francis Kurkdjian',
      origin: 'France',
      category: 'fragrances',
      price: 98000.0,
      currency: 'LKR',
      stock: 5,
      description: 'Amber floral fragrance with luminous cedar.',
    });
  });

  // =========================================================================
  // 1. Bank Transfer Confirmation Guard
  // =========================================================================
  describe('1. Bank Transfer Confirmation Guard', () => {
    test('rejects bank transfer checkout when bankTransferConfirmed is omitted (HTTP 400)', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ productId: serumProduct._id, quantity: 1 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: validShipping,
          paymentMethod: 'bank_transfer',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Confirmation of bank transfer is required');
      expect(res.body.message).toContain('Confirmation of bank transfer is required');

      // Verify cart and stock are untouched
      const cartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer1Token}`);
      expect(cartRes.body.cart.items.length).toBe(1);
      const stock = (await Product.findById(serumProduct._id)).stock;
      expect(stock).toBe(10);
    });

    test('rejects bank transfer with bankTransferConfirmed: false, null, "true" (string), or 1 (number)', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ productId: serumProduct._id, quantity: 1 });

      const invalidPayloads = [
        { bankTransferConfirmed: false },
        { bankTransferConfirmed: null },
        { bankTransferConfirmed: 'true' },
        { bankTransferConfirmed: 1 },
        { bankTransferConfirmed: 0 },
        { paymentDetails: { confirmed: false, confirmedTransfer: false } },
      ];

      for (const payload of invalidPayloads) {
        const res = await request(app)
          .post('/api/orders/checkout')
          .set('Authorization', `Bearer ${customer1Token}`)
          .send({
            shippingAddress: validShipping,
            paymentMethod: 'bank_transfer',
            ...payload,
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.error).toBe('Confirmation of bank transfer is required');
      }

      // Stock remains completely intact
      const stock = (await Product.findById(serumProduct._id)).stock;
      expect(stock).toBe(10);
    });

    test('accepts bank transfer checkout when bankTransferConfirmed: true, decrements stock, and clears cart', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ productId: serumProduct._id, quantity: 2 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: validShipping,
          paymentMethod: 'bank_transfer',
          bankTransferConfirmed: true,
          paymentNotes: 'Deposit slip verified via ATM deposit',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.order;
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('bank_transfer');
      expect(order.paymentStatus).toBe('pending');
      expect(order.status).toBe('pending');
      expect(res.body.transactionId).toMatch(/^BT-VA-\d+-\d+$/);

      // Verify bank confirmation flag stored in order
      const fetchedOrder = await Order.findById(order._id);
      expect(fetchedOrder.payment.bankDetails.confirmed).toBe(true);
      expect(fetchedOrder.payment.bankDetails.accountNumber).toBe('1000 8924 7712');
      expect(fetchedOrder.payment.bankDetails.bankName).toBe('Commercial Bank of Ceylon');

      // Verify stock was decremented: 10 - 2 = 8
      const updatedStock = (await Product.findById(serumProduct._id)).stock;
      expect(updatedStock).toBe(8);

      // Verify cart was emptied
      const cartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer1Token}`);
      expect(cartRes.body.cart.items.length).toBe(0);
      expect(cartRes.body.cart.subtotal).toBe(0);
    });

    test('frontend checkout modal template enforces Commercial Bank of Ceylon details and confirmation checkbox', () => {
      const checkoutModalPath = path.resolve(__dirname, '../../public/js/components/checkoutModal.js');
      const content = fs.readFileSync(checkoutModalPath, 'utf8');

      expect(content).toContain('Commercial Bank of Ceylon');
      expect(content).toContain('Colombo Fort Premier Branch');
      expect(content).toContain('VelvetAura (Pvt) Ltd');
      expect(content).toContain('1000 8924 7712');
      expect(content).toContain('bank-transfer-confirm-checkbox');
      expect(content).toContain('Please confirm that you have transferred');
      expect(content).toContain('bankTransferConfirmed');
    });
  });

  // =========================================================================
  // 2. COD Checkout Flow
  // =========================================================================
  describe('2. Cash on Delivery (COD) Checkout Flow', () => {
    test('successfully places COD order with initial paymentStatus: pending and fulfillment: pending', async () => {
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({ productId: perfumeProduct._id, quantity: 2 });

      const initialStock = (await Product.findById(perfumeProduct._id)).stock; // 5

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          shippingAddress: validShipping,
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const order = res.body.order;
      expect(order.currency).toBe('LKR');
      expect(order.paymentMethod).toBe('cod');
      expect(order.paymentStatus).toBe('pending');
      expect(order.status).toBe('pending');
      expect(res.body.transactionId).toMatch(/^COD-VA-\d+-\d+$/);
      expect(order.paymentNotes).toContain('Cash on Delivery');

      // Verify financial calculation accuracy in LKR
      expect(order.pricing.subtotal).toBe(196000.0);
      expect(order.pricing.tax).toBe(15680.0);
      expect(order.pricing.shipping).toBe(0.0);
      expect(order.pricing.grandTotal).toBe(211680.0);

      // Verify inventory decrement: 5 - 2 = 3
      const updatedStock = (await Product.findById(perfumeProduct._id)).stock;
      expect(updatedStock).toBe(initialStock - 2);

      // Verify cart clearance
      const cartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer2Token}`);
      expect(cartRes.body.cart.items.length).toBe(0);
      expect(cartRes.body.cart.subtotal).toBe(0);
      expect(cartRes.body.cart.grandTotal).toBe(0);

      // Customer can retrieve order in history
      const historyRes = await request(app).get('/api/orders/my-orders').set('Authorization', `Bearer ${customer2Token}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.orders.length).toBe(1);
      expect(historyRes.body.orders[0].paymentMethod).toBe('cod');
      expect(historyRes.body.orders[0].paymentStatus).toBe('pending');
    });

    test('rejects COD checkout when cart is empty with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customer2Token}`)
        .send({
          shippingAddress: validShipping,
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Cart is empty');
      expect(res.body.message).toContain('Cannot checkout with an empty cart');
    });

    test('rolls back decremented stock cleanly when inventory is depleted during checkout', async () => {
      // Put 2 items in cart
      await request(app)
        .post('/api/cart')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ productId: serumProduct._id, quantity: 2 });

      // Deplete product stock to 1
      await Product.findByIdAndUpdate(serumProduct._id, { stock: 1 });

      const res = await request(app)
        .post('/api/orders/checkout')
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({
          shippingAddress: validShipping,
          paymentMethod: 'cod',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('Insufficient stock');

      // Verify stock was not left at a corrupted or negative level
      const currentStock = (await Product.findById(serumProduct._id)).stock;
      expect(currentStock).toBe(1);

      // Cart items remain preserved
      const cartRes = await request(app).get('/api/cart').set('Authorization', `Bearer ${customer1Token}`);
      expect(cartRes.body.cart.items.length).toBe(1);
    });
  });

  // =========================================================================
  // 3. Currency Display & Formatting
  // =========================================================================
  describe('3. Currency Display & Formatting (Rs. X,XXX.XX & Edge Prices)', () => {
    let formatPrice;
    let formatPaymentMethod;
    let formatPaymentStatus;

    beforeAll(() => {
      const baseJsPath = path.resolve(__dirname, '../../public/js/components/base.js');
      const baseCode = fs.readFileSync(baseJsPath, 'utf8');
      const cjsCode = baseCode
        .replace(/export\s+function/g, 'function')
        .replace(/export\s+class/g, 'class');
      const fn = new Function(`${cjsCode}; return { formatPrice, formatPaymentMethod, formatPaymentStatus };`);
      const extracted = fn();
      formatPrice = extracted.formatPrice;
      formatPaymentMethod = extracted.formatPaymentMethod;
      formatPaymentStatus = extracted.formatPaymentStatus;
    });

    test('formats standard integers and decimals with Rs. prefix and 2 decimal places', () => {
      expect(formatPrice(100)).toBe('Rs. 100.00');
      expect(formatPrice(12500)).toBe('Rs. 12,500.00');
      expect(formatPrice(28500.5)).toBe('Rs. 28,500.50');
      expect(formatPrice(0.5)).toBe('Rs. 0.50');
      expect(formatPrice(12.3456)).toBe('Rs. 12.35');
      expect(formatPrice(99.999)).toBe('Rs. 100.00');
    });

    test('formats edge price values: 0, negative 0, and large numbers without NaN or undefined', () => {
      expect(formatPrice(0)).toBe('Rs. 0.00');
      expect(formatPrice(-0)).toBe('Rs. 0.00');
      expect(formatPrice(1000000)).toBe('Rs. 1,000,000.00');
      expect(formatPrice(123456789.99)).toBe('Rs. 123,456,789.99');
      expect(formatPrice('4500.50')).toBe('Rs. 4,500.50');
      expect(formatPrice('0')).toBe('Rs. 0.00');
    });

    test('gracefully handles non-numeric or falsy edge values (NaN, null, undefined, "", "abc")', () => {
      expect(formatPrice(null)).toBe('Rs. 0.00');
      expect(formatPrice(undefined)).toBe('Rs. 0.00');
      expect(formatPrice(NaN)).toBe('Rs. 0.00');
      expect(formatPrice('')).toBe('Rs. 0.00');
      expect(formatPrice('invalid_price')).toBe('Rs. 0.00');
      expect(formatPrice(false)).toBe('Rs. 0.00');
      expect(formatPrice({})).toBe('Rs. 0.00');
    });

    test('supports custom prefix option', () => {
      expect(formatPrice(1500, { prefix: 'LKR ' })).toBe('LKR 1,500.00');
      expect(formatPrice(0, { prefix: 'Rs ' })).toBe('Rs 0.00');
    });

    test('formatPaymentMethod and formatPaymentStatus map payment badges correctly', () => {
      expect(formatPaymentMethod('cod')).toBe('💵 Cash on Delivery');
      expect(formatPaymentMethod('bank_transfer')).toBe('🏦 Direct Bank Transfer');
      expect(formatPaymentMethod('payhere')).toBe('💳 PayHere Gateway');
      expect(formatPaymentMethod('mock_credit_card')).toBe('💳 Credit Card');
      expect(formatPaymentMethod('unknown')).toContain('unknown');

      expect(formatPaymentStatus('pending')).toBe('Pending Payment');
      expect(formatPaymentStatus('paid')).toBe('Payment Received');
      expect(formatPaymentStatus('succeeded')).toBe('Payment Completed');
      expect(formatPaymentStatus('failed')).toBe('Payment Failed');
      expect(formatPaymentStatus(null)).toBe('Pending');
    });

    test('verifies zero hardcoded dollar sign prices across catalog, cart, checkout, confirmation, account, admin', () => {
      const filesToCheck = [
        'public/index.html',
        'public/js/components/catalog.js',
        'public/js/components/cartDrawer.js',
        'public/js/components/checkoutModal.js',
        'public/js/components/orderConfirmation.js',
        'public/js/components/accountView.js',
        'public/js/components/adminDashboard.js',
        'public/js/components/productDetail.js',
      ];

      for (const relFile of filesToCheck) {
        const fullPath = path.resolve(__dirname, '../..', relFile);
        expect(fs.existsSync(fullPath)).toBe(true);
        const content = fs.readFileSync(fullPath, 'utf8');

        // Strip comments to test actual rendered templates and code literals
        const codeWithoutComments = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        const dollarMatches = codeWithoutComments.match(/\$\d+(\.\d+)?/g);
        expect(dollarMatches).toBeNull();
      }
    });
  });

  // =========================================================================
  // 4. Admin Status Updates & RBAC Security
  // =========================================================================
  describe('4. Admin Status Updates & RBAC Security', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await Order.create({
        orderNumber: `VA-RBAC-${Date.now()}`,
        user: customer1._id,
        items: [
          {
            product: serumProduct._id,
            name: serumProduct.name,
            brand: serumProduct.brand,
            price: serumProduct.price,
            quantity: 1,
          },
        ],
        shippingAddress: validShipping,
        currency: 'LKR',
        pricing: {
          subtotal: 18500.0,
          tax: 1480.0,
          shipping: 0.0,
          grandTotal: 19980.0,
        },
        paymentMethod: 'bank_transfer',
        paymentStatus: 'pending',
        status: 'pending',
      });
    });

    test('admin updates paymentStatus from pending to paid and records paidAt', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          paymentStatus: 'paid',
          notes: 'Customer transferred via Commercial Bank online banking. Slip verified.',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.order.paymentStatus).toBe('paid');
      expect(res.body.order.payment.status).toBe('paid');
      expect(res.body.order.payment.paidAt).toBeDefined();
      expect(res.body.order.paymentNotes).toContain('Slip verified');
    });

    test('admin transitions fulfillment status through full lifecycle (pending -> processing -> shipped -> delivered)', async () => {
      const statusFlow = ['processing', 'shipped', 'delivered'];

      for (const st of statusFlow) {
        const res = await request(app)
          .put(`/api/orders/${testOrder._id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: st });

        expect(res.status).toBe(200);
        expect(res.body.order.status).toBe(st);
      }
    });

    test('admin can revert paymentStatus back to pending, clearing paidAt', async () => {
      // First mark paid
      await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentStatus: 'paid' });

      // Revert to pending
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentStatus: 'pending' });

      expect(res.status).toBe(200);
      expect(res.body.order.paymentStatus).toBe('pending');
      expect(res.body.order.payment.paidAt).toBeNull();
    });

    test('rejects invalid fulfillment status or paymentStatus with HTTP 400', async () => {
      const badStatusRes = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status_xyz' });
      expect(badStatusRes.status).toBe(400);
      expect(badStatusRes.body.error).toBe('Invalid order status');

      const badPayStatusRes = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ paymentStatus: 'invalid_payment_status' });
      expect(badPayStatusRes.status).toBe(400);
      expect(badPayStatusRes.body.error).toBe('Invalid payment status');

      const emptyRes = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error).toBe('Missing update fields');
    });

    test('RBAC: non-admin customer cannot update order status (HTTP 403 Forbidden)', async () => {
      const resPut = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ paymentStatus: 'paid' });
      expect(resPut.status).toBe(403);
      expect(resPut.body.error).toBe('Forbidden');

      const resPatch = await request(app)
        .patch(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ status: 'delivered' });
      expect(resPatch.status).toBe(403);
      expect(resPatch.body.error).toBe('Forbidden');

      const resPayStatus = await request(app)
        .put(`/api/orders/${testOrder._id}/payment-status`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ paymentStatus: 'paid' });
      expect(resPayStatus.status).toBe(403);
      expect(resPayStatus.body.error).toBe('Forbidden');
    });

    test('RBAC: unauthenticated request to update order status returns HTTP 401', async () => {
      const res = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .send({ paymentStatus: 'paid' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Not authorized, no token provided');
    });

    test('RBAC: customer cannot access admin GET /api/orders (all orders)', async () => {
      const custRes = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(custRes.status).toBe(403);

      const adminRes = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
      expect(Array.isArray(adminRes.body.orders)).toBe(true);
    });

    test('Ownership RBAC: customer can view own order, but cannot view another customer order', async () => {
      // Customer 1 owns testOrder
      const cust1Res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${customer1Token}`);
      expect(cust1Res.status).toBe(200);

      // Customer 2 attempts to view Customer 1's order
      const cust2Res = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${customer2Token}`);
      expect(cust2Res.status).toBe(403);
      expect(cust2Res.body.error).toBe('Forbidden');

      // Admin can view Customer 1's order
      const adminRes = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(adminRes.status).toBe(200);
    });

    test('handles malformed order ID (HTTP 400) and non-existent order ID (HTTP 404)', async () => {
      const badIdRes = await request(app)
        .put('/api/orders/not-a-valid-id/status')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(badIdRes.status).toBe(400);

      const nonExistent = new mongoose.Types.ObjectId();
      const notFoundRes = await request(app)
        .put(`/api/orders/${nonExistent}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'shipped' });
      expect(notFoundRes.status).toBe(404);
    });
  });
});
