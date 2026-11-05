/**
 * Tier 1: Feature Coverage — Product Catalog & Discovery (F8, F11, F12, F13, F14)
 * Opaque-box verification of catalog listing, filtering, search, and detail retrieval.
 */

const { testClient } = require('./helpers/testClient');
const { connectTestDb, seedSampleProducts, disconnectTestDb } = require('./helpers/testDb');

describe('Tier 1: Product Catalog & Discovery APIs', () => {
  let seededProducts = [];

  beforeAll(async () => {
    await connectTestDb();
    await seedSampleProducts();

    // Fetch catalog to retain IDs for test assertions
    const res = await testClient.getProducts();
    seededProducts = Array.isArray(res.body) ? res.body : (res.body.products || []);
  });

  afterAll(async () => {
    await disconnectTestDb();
  });

  test('F11-1: should retrieve product catalog with complete luxury attributes', async () => {
    const res = await testClient.getProducts();

    expect(res.status).toBe(200);
    const products = Array.isArray(res.body) ? res.body : (res.body.products || []);
    expect(products.length).toBeGreaterThanOrEqual(1);

    const first = products[0];
    expect(first._id).toBeDefined();
    expect(first.name).toBeDefined();
    expect(first.brand).toBeDefined();
    expect(first.origin).toBeDefined();
    expect(first.category).toBeDefined();
    expect(typeof first.price).toBe('number');
    expect(typeof first.stock).toBe('number');
  });

  test('F12-1: should filter products by category (skincare)', async () => {
    const res = await testClient.getProducts({ category: 'skincare' });

    expect(res.status).toBe(200);
    const products = Array.isArray(res.body) ? res.body : (res.body.products || []);
    expect(products.length).toBeGreaterThanOrEqual(1);

    products.forEach(p => {
      expect(p.category.toLowerCase()).toBe('skincare');
    });
  });

  test('F12-2: should filter products by imported origin country (France)', async () => {
    const res = await testClient.getProducts({ origin: 'France' });

    expect(res.status).toBe(200);
    const products = Array.isArray(res.body) ? res.body : (res.body.products || []);
    expect(products.length).toBeGreaterThanOrEqual(1);

    products.forEach(p => {
      expect(p.origin.toLowerCase()).toBe('france');
    });
  });

  test('F13-1: should search products by keyword matching name or brand', async () => {
    const res = await testClient.getProducts({ q: 'Serum' });

    expect(res.status).toBe(200);
    const products = Array.isArray(res.body) ? res.body : (res.body.products || []);
    expect(products.length).toBeGreaterThanOrEqual(1);

    products.forEach(p => {
      const match = (p.name + ' ' + p.brand + ' ' + (p.description || '')).toLowerCase();
      expect(match).toContain('serum');
    });
  });

  test('F14-1: should retrieve individual product details by ID', async () => {
    expect(seededProducts.length).toBeGreaterThan(0);
    const target = seededProducts[0];

    const res = await testClient.getProductById(target._id);

    expect(res.status).toBe(200);
    const product = res.body.product || res.body;
    expect(product._id.toString()).toBe(target._id.toString());
    expect(product.name).toBe(target.name);
    expect(product.price).toBe(target.price);
    expect(product.stock).toBeDefined();
  });

  test('F14-2: should return 404 for a non-existent valid ObjectId', async () => {
    const nonExistentId = '654321654321654321654321';
    const res = await testClient.getProductById(nonExistentId);

    expect(res.status).toBe(404);
    expect(res.body).toBeDefined();
    expect(res.body.message || res.body.error).toBeDefined();
  });
});
