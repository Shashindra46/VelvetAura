/**
 * Tier 3: Cross-Feature Pairwise Interactions Suite
 * Opaque-box verification of multi-module workflows, state transitions,
 * session isolation, and inventory synchronization across the full application.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');
const {
  createUniqueUser,
  mockCards,
  shippingAddresses,
  calculateExpectedPricing
} = require('./helpers/fixtures');

describe('Tier 3: Cross-Feature Pairwise Interactions', () => {
  let products = [];

  beforeAll(async () => {
    await connectTestDb();
    await seedSampleProducts();

    const prodRes = await testClient.getProducts();
    products = Array.isArray(prodRes.body) ? prodRes.body : (prodRes.body.products || []);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('T3-1: Full end-to-end customer journey (Register -> Login -> Search -> Cart -> Checkout -> History)', async () => {
    // 1. Register new customer
    const customerFixture = createUniqueUser('journey_user');
    const regRes = await testClient.register(customerFixture);
    expect([200, 201]).toContain(regRes.status);

    // 2. Login
    const loginRes = await testClient.login({
      email: customerFixture.email,
      password: customerFixture.password
    });
    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token || (loginRes.body.user && loginRes.body.user.token);
    expect(token).toBeDefined();

    // 3. Search and filter catalog
    const searchRes = await testClient.getProducts({ q: 'Serum', category: 'skincare' });
    expect(searchRes.status).toBe(200);
    const searchItems = Array.isArray(searchRes.body) ? searchRes.body : (searchRes.body.products || []);
    expect(searchItems.length).toBeGreaterThanOrEqual(1);

    const selectedProduct1 = searchItems[0];
    const selectedProduct2 = products.find(p => p._id !== selectedProduct1._id) || products[1];

    // 4. View product detail
    const detailRes = await testClient.getProductById(selectedProduct1._id);
    expect(detailRes.status).toBe(200);

    // 5. Add two products to cart
    const addRes1 = await testClient.addToCart(token, {
      productId: selectedProduct1._id,
      quantity: 1
    });
    expect([200, 201]).toContain(addRes1.status);

    if (selectedProduct2) {
      const addRes2 = await testClient.addToCart(token, {
        productId: selectedProduct2._id,
        quantity: 2
      });
      expect([200, 201]).toContain(addRes2.status);
    }

    // 6. Update quantity of item 1
    const updateRes = await testClient.updateCartItem(token, selectedProduct1._id, {
      quantity: 3
    });
    expect(updateRes.status).toBe(200);

    // 7. Verify pricing formulas
    const cartRes = await testClient.getCart(token);
    const cart = cartRes.body.cart || cartRes.body;
    expect(cart.items.length).toBe(selectedProduct2 ? 2 : 1);

    const expectedPricing = calculateExpectedPricing([
      { price: selectedProduct1.price, quantity: 3 },
      ...(selectedProduct2 ? [{ price: selectedProduct2.price, quantity: 2 }] : [])
    ]);

    expect(Number(cart.subtotal)).toBeCloseTo(expectedPricing.subtotal, 2);
    expect(Number(cart.tax)).toBeCloseTo(expectedPricing.tax, 2);
    expect(Number(cart.shipping)).toBeCloseTo(expectedPricing.shipping, 2);
    expect(Number(cart.grandTotal)).toBeCloseTo(expectedPricing.grandTotal, 2);

    // 8. Place order via checkout
    const checkoutRes = await testClient.checkout(token, {
      shippingAddress: shippingAddresses.france,
      paymentDetails: mockCards.validVisa
    });
    expect([200, 201]).toContain(checkoutRes.status);
    const order = checkoutRes.body.order || checkoutRes.body;
    expect(order).toBeDefined();

    // 9. Verify cart is cleared
    const postCheckoutCartRes = await testClient.getCart(token);
    const postCart = postCheckoutCartRes.body.cart || postCheckoutCartRes.body;
    expect(postCart.items.length).toBe(0);

    // 10. Verify order exists in order history
    const historyRes = await testClient.getMyOrders(token);
    expect(historyRes.status).toBe(200);
    const orders = Array.isArray(historyRes.body) ? historyRes.body : (historyRes.body.orders || []);
    expect(orders.length).toBeGreaterThanOrEqual(1);
  });

  test('T3-2: Multi-user session isolation (zero cart leakage across concurrent users)', async () => {
    // Register User A
    const userA = createUniqueUser('user_A');
    const authARes = await testClient.register(userA);
    const tokenA = authARes.body.token || (authARes.body.user && authARes.body.user.token);

    // Register User B
    const userB = createUniqueUser('user_B');
    const authBRes = await testClient.register(userB);
    const tokenB = authBRes.body.token || (authBRes.body.user && authBRes.body.user.token);

    // User A adds product 0
    await testClient.addToCart(tokenA, { productId: products[0]._id, quantity: 2 });

    // User B inspects cart -> must be completely empty!
    const cartBRes1 = await testClient.getCart(tokenB);
    const cartB1 = cartBRes1.body.cart || cartBRes1.body;
    expect(cartB1.items.length).toBe(0);

    // User B adds product 1
    const targetProductB = products[1] || products[0];
    await testClient.addToCart(tokenB, { productId: targetProductB._id, quantity: 1 });

    // User A checks out
    await testClient.checkout(tokenA, {
      shippingAddress: shippingAddresses.usa,
      paymentDetails: mockCards.validVisa
    });

    // User A cart is cleared
    const cartARes2 = await testClient.getCart(tokenA);
    const cartA2 = cartARes2.body.cart || cartARes2.body;
    expect(cartA2.items.length).toBe(0);

    // User B's cart still has product B!
    const cartBRes2 = await testClient.getCart(tokenB);
    const cartB2 = cartBRes2.body.cart || cartBRes2.body;
    expect(cartB2.items.length).toBe(1);

    // User B has 0 orders in history; User A has 1 order
    const ordersBRes = await testClient.getMyOrders(tokenB);
    const ordersB = Array.isArray(ordersBRes.body) ? ordersBRes.body : (ordersBRes.body.orders || []);
    expect(ordersB.length).toBe(0);

    const ordersARes = await testClient.getMyOrders(tokenA);
    const ordersA = Array.isArray(ordersARes.body) ? ordersARes.body : (ordersARes.body.orders || []);
    expect(ordersA.length).toBe(1);
  });

  test('T3-3: Inventory synchronization and stock protection guard', async () => {
    // Choose product
    const target = products.find(p => p.stock > 5) || products[0];
    const initialDetail = await testClient.getProductById(target._id);
    const startStock = (initialDetail.body.product || initialDetail.body).stock;

    // Create buyer
    const buyer = createUniqueUser('inventory_buyer');
    const authRes = await testClient.register(buyer);
    const buyerToken = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // Purchase 2 items
    await testClient.addToCart(buyerToken, { productId: target._id, quantity: 2 });
    await testClient.checkout(buyerToken, {
      shippingAddress: shippingAddresses.japan,
      paymentDetails: mockCards.validMastercard
    });

    // Verify stock decreased by 2
    const postDetail = await testClient.getProductById(target._id);
    const postStock = (postDetail.body.product || postDetail.body).stock;
    expect(postStock).toBe(startStock - 2);

    // Attempt to add more than remaining stock
    const guardRes = await testClient.addToCart(buyerToken, {
      productId: target._id,
      quantity: postStock + 10
    });
    expect(guardRes.status).toBe(400);
  });

  test('T3-4: Cart state persistence across logout and re-authentication', async () => {
    const user = createUniqueUser('persistent_cart');
    const regRes = await testClient.register(user);
    const token1 = regRes.body.token || (regRes.body.user && regRes.body.user.token);

    // Add items
    await testClient.addToCart(token1, { productId: products[0]._id, quantity: 2 });

    // Re-login to simulate fresh session
    const loginRes = await testClient.login({
      email: user.email,
      password: user.password
    });
    const token2 = loginRes.body.token || (loginRes.body.user && loginRes.body.user.token);

    // Check cart with token2
    const cartRes = await testClient.getCart(token2);
    const cart = cartRes.body.cart || cartRes.body;
    expect(cart.items.length).toBe(1);
    expect(cart.items[0].quantity).toBe(2);
  });
});
