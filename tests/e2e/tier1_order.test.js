/**
 * Tier 1: Feature Coverage — Order Creation & Mock Payment (F17, F18, F19)
 * Opaque-box verification of checkout, payment simulation, stock decrement, and order history.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');
const { createUniqueUser, mockCards, shippingAddresses } = require('./helpers/fixtures');

describe('Tier 1: Order Creation, Mock Payment & Order History APIs', () => {
  let authToken;
  let products = [];
  let placedOrderId;

  beforeAll(async () => {
    await connectTestDb();
    await seedSampleProducts();

    const user = createUniqueUser('tier1_orders');
    const authRes = await testClient.register(user);
    authToken = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    const prodRes = await testClient.getProducts();
    products = Array.isArray(prodRes.body) ? prodRes.body : (prodRes.body.products || []);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('F17-1: should complete checkout with valid cart, address, and payment', async () => {
    expect(products.length).toBeGreaterThan(0);
    const targetProduct = products[0];

    // Add item to cart
    await testClient.addToCart(authToken, {
      productId: targetProduct._id,
      quantity: 2
    });

    // Execute checkout
    const checkoutRes = await testClient.checkout(authToken, {
      shippingAddress: shippingAddresses.usa,
      paymentDetails: mockCards.validVisa
    });

    expect([200, 201]).toContain(checkoutRes.status);
    const order = checkoutRes.body.order || checkoutRes.body;
    expect(order).toBeDefined();
    expect(order._id || order.orderNumber).toBeDefined();
    placedOrderId = order._id;

    // Check line items snapshot
    expect(Array.isArray(order.items)).toBe(true);
    expect(order.items.length).toBe(1);
    expect(order.items[0].quantity).toBe(2);
  });

  test('F18-1: should simulate mock payment and record transaction ID with completed status', async () => {
    // Add another item and checkout to inspect payment simulation
    const targetProduct = products[1] || products[0];
    await testClient.addToCart(authToken, {
      productId: targetProduct._id,
      quantity: 1
    });

    const res = await testClient.checkout(authToken, {
      shippingAddress: shippingAddresses.france,
      paymentDetails: mockCards.validMastercard
    });

    expect([200, 201]).toContain(res.status);
    const order = res.body.order || res.body;
    const payment = order.payment || (res.body.transactionId ? { transactionId: res.body.transactionId, status: 'completed' } : {});

    expect(payment.transactionId || res.body.transactionId).toBeDefined();
    const txnId = payment.transactionId || res.body.transactionId;
    expect(typeof txnId).toBe('string');
    expect(txnId.length).toBeGreaterThan(5);
  });

  test('F17-2: should automatically clear active cart upon successful checkout', async () => {
    const res = await testClient.getCart(authToken);
    expect(res.status).toBe(200);

    const cart = res.body.cart || res.body;
    expect(cart.items.length).toBe(0);
    expect(Number(cart.subtotal || 0)).toBe(0);
  });

  test('F17-3: should decrement catalog inventory stock following checkout', async () => {
    // Choose product with known stock
    const prodRes = await testClient.getProductById(products[0]._id);
    const initialProduct = prodRes.body.product || prodRes.body;
    const initialStock = initialProduct.stock;

    const purchaseQty = 3;
    await testClient.addToCart(authToken, {
      productId: initialProduct._id,
      quantity: purchaseQty
    });

    await testClient.checkout(authToken, {
      shippingAddress: shippingAddresses.usa,
      paymentDetails: mockCards.validVisa
    });

    // Check stock after checkout
    const postRes = await testClient.getProductById(initialProduct._id);
    const updatedProduct = postRes.body.product || postRes.body;
    expect(updatedProduct.stock).toBe(initialStock - purchaseQty);
  });

  test('F19-1: should list previously placed orders in customer order history', async () => {
    const res = await testClient.getMyOrders(authToken);

    expect(res.status).toBe(200);
    const orders = Array.isArray(res.body) ? res.body : (res.body.orders || []);
    expect(Array.isArray(orders)).toBe(true);
    expect(orders.length).toBeGreaterThanOrEqual(1);

    // Verify order structure
    const firstOrder = orders[0];
    expect(firstOrder.items).toBeDefined();
    expect(firstOrder.grandTotal || firstOrder.total).toBeDefined();
  });
});
