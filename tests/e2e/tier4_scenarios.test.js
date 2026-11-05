/**
 * Tier 4: Real-World Luxury Beauty Shopping Scenarios Suite
 * Simulates authentic customer personas and multi-step luxury shopping workflows:
 * - Persona 1: French Skincare Aficionado (Premium Parisian routine)
 * - Persona 2: K-Beauty Glow Seeker (Threshold-crossing free shipping optimization)
 * - Persona 3: Japanese Haircare Connoisseur (Multi-unit salon care)
 * - Persona 4: High-End Fragrance Collector (Niche luxury perfumery)
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');
const {
  createUniqueUser,
  mockCards,
  shippingAddresses,
  calculateExpectedPricing
} = require('./helpers/fixtures');

describe('Tier 4: Real-World Luxury Beauty Shopping Scenarios', () => {
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

  // ---------------------------------------------------------
  // Scenario 1: The French Skincare Aficionado
  // ---------------------------------------------------------
  test('Scenario 1: French Skincare Aficionado — Parisian High-Potency Routine', async () => {
    const customer = createUniqueUser('camille_dupont');
    const authRes = await testClient.register(customer);
    const token = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // 1. Browse French imports in skincare
    const frenchSkincareRes = await testClient.getProducts({
      category: 'skincare',
      origin: 'France'
    });
    expect(frenchSkincareRes.status).toBe(200);
    const frenchItems = Array.isArray(frenchSkincareRes.body)
      ? frenchSkincareRes.body
      : (frenchSkincareRes.body.products || []);
    expect(frenchItems.length).toBeGreaterThanOrEqual(1);

    // Pick French items (e.g. La Roche-Posay and Caudalie)
    const serum = frenchItems[0];
    const secondItem = frenchItems[1] || products.find(p => p.origin === 'France') || products[0];

    // 2. Add serum and second French item to cart
    await testClient.addToCart(token, { productId: serum._id, quantity: 1 });
    if (secondItem && secondItem._id !== serum._id) {
      await testClient.addToCart(token, { productId: secondItem._id, quantity: 1 });
    }

    // 3. Verify cart pricing
    const cartRes = await testClient.getCart(token);
    const cart = cartRes.body.cart || cartRes.body;

    const itemsForPricing = [
      { price: serum.price, quantity: 1 },
      ...(secondItem && secondItem._id !== serum._id ? [{ price: secondItem.price, quantity: 1 }] : [])
    ];
    const expected = calculateExpectedPricing(itemsForPricing);

    expect(Number(cart.subtotal)).toBeCloseTo(expected.subtotal, 2);
    expect(Number(cart.tax)).toBeCloseTo(expected.tax, 2);
    expect(Number(cart.shipping)).toBeCloseTo(expected.shipping, 2);
    expect(Number(cart.grandTotal)).toBeCloseTo(expected.grandTotal, 2);

    // 4. Checkout with Parisian address
    const checkoutRes = await testClient.checkout(token, {
      shippingAddress: shippingAddresses.france,
      paymentDetails: mockCards.validVisa
    });

    expect([200, 201]).toContain(checkoutRes.status);
    const order = checkoutRes.body.order || checkoutRes.body;
    expect(order.shippingAddress?.city || order.shippingAddress).toBeDefined();

    // 5. Verify order receipt in customer order history
    const historyRes = await testClient.getMyOrders(token);
    const orders = Array.isArray(historyRes.body) ? historyRes.body : (historyRes.body.orders || []);
    expect(orders.length).toBe(1);
    expect(orders[0].items.length).toBe(itemsForPricing.length);
  });

  // ---------------------------------------------------------
  // Scenario 2: The K-Beauty Glow Seeker
  // ---------------------------------------------------------
  test('Scenario 2: K-Beauty Glow Seeker — Dynamic Free Shipping Threshold Optimization', async () => {
    const customer = createUniqueUser('minji_park');
    const authRes = await testClient.register(customer);
    const token = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // 1. Browse Korean imports
    const kBeautyRes = await testClient.getProducts({ origin: 'South Korea' });
    const kBeautyItems = Array.isArray(kBeautyRes.body)
      ? kBeautyRes.body
      : (kBeautyRes.body.products || []);
    expect(kBeautyItems.length).toBeGreaterThanOrEqual(1);

    // Find affordable item under $50
    const affordableItem = kBeautyItems.find(p => p.price < 50) || kBeautyItems[0];
    await testClient.addToCart(token, { productId: affordableItem._id, quantity: 1 });

    // 2. Observe shipping fee is applied if subtotal < $50
    let cartRes = await testClient.getCart(token);
    let cart = cartRes.body.cart || cartRes.body;

    if (cart.subtotal < 50.0) {
      expect(Number(cart.shipping)).toBeCloseTo(5.99, 2);
    }

    // 3. Customer strategically adds more items to surpass $50 threshold for free shipping
    const booster = kBeautyItems.find(p => p._id !== affordableItem._id) || products.find(p => p._id !== affordableItem._id);
    const neededQty = Math.ceil((50.0 - cart.subtotal) / (booster ? booster.price : affordableItem.price)) + 1;

    if (booster) {
      await testClient.addToCart(token, { productId: booster._id, quantity: neededQty });
    } else {
      await testClient.updateCartItem(token, affordableItem._id, { quantity: 1 + neededQty });
    }

    // 4. Verify free shipping is now activated
    cartRes = await testClient.getCart(token);
    cart = cartRes.body.cart || cartRes.body;
    expect(cart.subtotal).toBeGreaterThanOrEqual(50.0);
    expect(Number(cart.shipping)).toBeCloseTo(0.0, 2);

    // 5. Checkout with Korean shipping address
    const checkoutRes = await testClient.checkout(token, {
      shippingAddress: shippingAddresses.southKorea,
      paymentDetails: mockCards.validMastercard
    });
    expect([200, 201]).toContain(checkoutRes.status);
  });

  // ---------------------------------------------------------
  // Scenario 3: The Japanese Haircare Connoisseur
  // ---------------------------------------------------------
  test('Scenario 3: Japanese Haircare Connoisseur — Salon Repair Multi-Unit Order', async () => {
    const customer = createUniqueUser('kenji_sato');
    const authRes = await testClient.register(customer);
    const token = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // 1. Filter Japanese haircare
    const res = await testClient.getProducts({ category: 'haircare', origin: 'Japan' });
    const japaneseHaircare = Array.isArray(res.body) ? res.body : (res.body.products || []);

    const product = japaneseHaircare.length > 0 ? japaneseHaircare[0] : products.find(p => p.category === 'haircare') || products[0];

    // 2. View product details & specifications
    const detailRes = await testClient.getProductById(product._id);
    expect(detailRes.status).toBe(200);
    const productDetail = detailRes.body.product || detailRes.body;
    expect(productDetail.specs).toBeDefined();

    // 3. Add 3 units to cart
    await testClient.addToCart(token, { productId: product._id, quantity: 3 });

    // 4. Verify subtotal = 3 * price
    const cartRes = await testClient.getCart(token);
    const cart = cartRes.body.cart || cartRes.body;
    const expected = calculateExpectedPricing([{ price: product.price, quantity: 3 }]);

    expect(Number(cart.subtotal)).toBeCloseTo(expected.subtotal, 2);
    expect(Number(cart.grandTotal)).toBeCloseTo(expected.grandTotal, 2);

    // 5. Complete checkout with Tokyo destination
    const checkoutRes = await testClient.checkout(token, {
      shippingAddress: shippingAddresses.japan,
      paymentDetails: mockCards.validVisa
    });
    expect([200, 201]).toContain(checkoutRes.status);
  });

  // ---------------------------------------------------------
  // Scenario 4: The High-End Fragrance Collector
  // ---------------------------------------------------------
  test('Scenario 4: High-End Fragrance Collector — Niche Perfumery Vault Acquisition', async () => {
    const customer = createUniqueUser('eleanor_vance');
    const authRes = await testClient.register(customer);
    const token = authRes.body.token || (authRes.body.user && authRes.body.user.token);

    // 1. Search for luxury fragrances
    const perfumeRes = await testClient.getProducts({ category: 'fragrances' });
    const perfumes = Array.isArray(perfumeRes.body) ? perfumeRes.body : (perfumeRes.body.products || []);
    expect(perfumes.length).toBeGreaterThanOrEqual(1);

    const luxuryPerfume = perfumes[0];

    // 2. Add high-value fragrance to cart
    await testClient.addToCart(token, { productId: luxuryPerfume._id, quantity: 1 });

    // 3. Verify subtotal qualifies for free shipping
    const cartRes = await testClient.getCart(token);
    const cart = cartRes.body.cart || cartRes.body;
    expect(cart.subtotal).toBeGreaterThanOrEqual(50.0);
    expect(Number(cart.shipping)).toBeCloseTo(0.0, 2);

    // 4. Checkout with US address
    const checkoutRes = await testClient.checkout(token, {
      shippingAddress: shippingAddresses.usa,
      paymentDetails: mockCards.validVisa
    });
    expect([200, 201]).toContain(checkoutRes.status);

    const order = checkoutRes.body.order || checkoutRes.body;
    expect(order.grandTotal || order.total).toBeDefined();

    // 5. Confirm order is recorded with line item snapshot
    const myOrdersRes = await testClient.getMyOrders(token);
    const orders = Array.isArray(myOrdersRes.body) ? myOrdersRes.body : (myOrdersRes.body.orders || []);
    expect(orders.length).toBe(1);
    expect(orders[0].items[0].price).toBe(luxuryPerfume.price);
  });
});
