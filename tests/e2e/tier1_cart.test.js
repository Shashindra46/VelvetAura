/**
 * Tier 1: Feature Coverage — Cart Management & Pricing Engine (F15, F16)
 * Opaque-box verification of cart CRUD, line items, 8% tax, and $50 shipping threshold.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');
const { createUniqueUser, calculateExpectedPricing } = require('./helpers/fixtures');

describe('Tier 1: Cart Management & Pricing Engine APIs', () => {
  let authToken;
  let products = [];

  beforeAll(async () => {
    await connectTestDb();
    await seedSampleProducts();

    // Create unique user and acquire JWT
    const user = createUniqueUser('tier1_cart');
    const authRes = await testClient.register(user);
    authToken = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // Retrieve available products
    const prodRes = await testClient.getProducts();
    products = Array.isArray(prodRes.body) ? prodRes.body : (prodRes.body.products || []);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('F15-1: should return empty cart with zero subtotal for new customer', async () => {
    const res = await testClient.getCart(authToken);

    expect(res.status).toBe(200);
    const cart = res.body.cart || res.body;
    expect(Array.isArray(cart.items)).toBe(true);
    expect(cart.items.length).toBe(0);
    expect(Number(cart.subtotal || 0)).toBe(0);
  });

  test('F15-2: should add an imported beauty item to the cart', async () => {
    expect(products.length).toBeGreaterThan(0);
    const product = products[0];

    const res = await testClient.addToCart(authToken, {
      productId: product._id,
      quantity: 1
    });

    expect([200, 201]).toContain(res.status);
    const cart = res.body.cart || res.body;
    expect(cart.items).toBeDefined();
    expect(cart.items.length).toBe(1);

    const item = cart.items[0];
    const itemId = item.product?._id || item.product || item.productId;
    expect(itemId.toString()).toBe(product._id.toString());
    expect(item.quantity).toBe(1);
  });

  test('F16-1: should accurately calculate subtotal, 8% sales tax, and shipping fee', async () => {
    const product = products[0];
    const res = await testClient.getCart(authToken);
    const cart = res.body.cart || res.body;

    const expected = calculateExpectedPricing([{ price: product.price, quantity: 1 }]);

    expect(Number(cart.subtotal)).toBeCloseTo(expected.subtotal, 2);
    expect(Number(cart.tax)).toBeCloseTo(expected.tax, 2);
    expect(Number(cart.shipping)).toBeCloseTo(expected.shipping, 2);
    expect(Number(cart.grandTotal)).toBeCloseTo(expected.grandTotal, 2);
  });

  test('F15-3: should update the quantity of an existing item in the cart', async () => {
    const product = products[0];
    const newQty = 3;

    const res = await testClient.updateCartItem(authToken, product._id, {
      quantity: newQty
    });

    expect(res.status).toBe(200);
    const cart = res.body.cart || res.body;
    const item = cart.items.find(i => {
      const pid = i.product?._id || i.product || i.productId;
      return pid.toString() === product._id.toString();
    });

    expect(item).toBeDefined();
    expect(item.quantity).toBe(newQty);

    // Verify subtotal reflects 3 units
    const expected = calculateExpectedPricing([{ price: product.price, quantity: newQty }]);
    expect(Number(cart.subtotal)).toBeCloseTo(expected.subtotal, 2);
  });

  test('F15-4: should remove a specific line item from the cart', async () => {
    const product = products[0];

    const res = await testClient.removeCartItem(authToken, product._id);

    expect(res.status).toBe(200);
    const cart = res.body.cart || res.body;
    const remaining = cart.items.filter(i => {
      const pid = i.product?._id || i.product || i.productId;
      return pid.toString() === product._id.toString();
    });

    expect(remaining.length).toBe(0);
  });

  test('F15-5: should clear the entire cart completely', async () => {
    // Add two items first
    await testClient.addToCart(authToken, { productId: products[0]._id, quantity: 1 });
    if (products.length > 1) {
      await testClient.addToCart(authToken, { productId: products[1]._id, quantity: 1 });
    }

    const clearRes = await testClient.clearCart(authToken);
    expect([200, 204]).toContain(clearRes.status);

    const getRes = await testClient.getCart(authToken);
    const cart = getRes.body.cart || getRes.body;
    expect(cart.items.length).toBe(0);
    expect(Number(cart.subtotal || 0)).toBe(0);
  });
});
