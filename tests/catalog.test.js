/**
 * VelvetAura - Product Catalog Integration Test Suite
 * 
 * Verifies catalog listing, multi-facet filtering, keyword search,
 * ReDoS input safety, category taxonomy discovery, and single-item retrieval.
 */

const request = require('supertest');
const app = require('../src/app');
const Product = require('../src/models/Product');
const seedProducts = require('../src/data/seedProducts');

describe('Product Catalog & Discovery APIs (Integration Suite)', () => {
  let seededProducts = [];

  beforeEach(async () => {
    // Seed products before each test because tests/setup.js clears collections afterEach
    seededProducts = await Product.insertMany(seedProducts);
  });

  describe('GET /api/products (Catalog Listing & Pagination)', () => {
    test('should retrieve all products with complete luxury metadata and pagination info', async () => {
      const res = await request(app).get('/api/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.products)).toBe(true);
      expect(res.body.products.length).toBe(seededProducts.length);
      expect(res.body.total).toBe(seededProducts.length);
      expect(res.body.page).toBe(1);
      expect(res.body.pages).toBeDefined();

      const sample = res.body.products[0];
      expect(sample._id).toBeDefined();
      expect(sample.name).toBeDefined();
      expect(sample.brand).toBeDefined();
      expect(sample.origin).toBeDefined();
      expect(sample.category).toBeDefined();
      expect(typeof sample.price).toBe('number');
      expect(typeof sample.stock).toBe('number');
      expect(sample.image).toBeDefined();
    });

    test('should paginate catalog correctly according to page and limit parameters', async () => {
      const res = await request(app).get('/api/products?page=2&limit=5');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(5);
      expect(res.body.page).toBe(2);
      expect(res.body.total).toBe(seededProducts.length);
      expect(res.body.pages).toBe(Math.ceil(seededProducts.length / 5));
    });

    test('should sort products by price ascending', async () => {
      const res = await request(app).get('/api/products?sort=price-asc');

      expect(res.status).toBe(200);
      const items = res.body.products;
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].price).toBeLessThanOrEqual(items[i + 1].price);
      }
    });

    test('should sort products by price descending', async () => {
      const res = await request(app).get('/api/products?sort=price-desc');

      expect(res.status).toBe(200);
      const items = res.body.products;
      for (let i = 0; i < items.length - 1; i++) {
        expect(items[i].price).toBeGreaterThanOrEqual(items[i + 1].price);
      }
    });
  });

  describe('Catalog Multi-Facet Filtering', () => {
    test('should filter products by category (skincare)', async () => {
      const res = await request(app).get('/api/products?category=skincare');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBe(6);
      res.body.products.forEach((p) => {
        expect(p.category.toLowerCase()).toBe('skincare');
      });
    });

    test('should filter products by imported origin country (France)', async () => {
      const res = await request(app).get('/api/products?origin=France');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
      res.body.products.forEach((p) => {
        expect(p.origin.toLowerCase()).toBe('france');
      });
    });

    test('should filter products by brand (Sulwhasoo)', async () => {
      const res = await request(app).get('/api/products?brand=Sulwhasoo');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
      res.body.products.forEach((p) => {
        expect(p.brand.toLowerCase()).toBe('sulwhasoo');
      });
    });

    test('should filter products by price bounds (minPrice and maxPrice)', async () => {
      const res = await request(app).get('/api/products?minPrice=50&maxPrice=100');

      expect(res.status).toBe(200);
      res.body.products.forEach((p) => {
        expect(p.price).toBeGreaterThanOrEqual(50);
        expect(p.price).toBeLessThanOrEqual(100);
      });
    });

    test('should return empty list when filtering by non-existent category', async () => {
      const res = await request(app).get('/api/products?category=non_existent_category');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(0);
      expect(res.body.count).toBe(0);
    });

    test('should return empty list when filtering by non-existent origin', async () => {
      const res = await request(app).get('/api/products?origin=Atlantis');

      expect(res.status).toBe(200);
      expect(res.body.products).toHaveLength(0);
    });
  });

  describe('Keyword Search & ReDoS Hardening', () => {
    test('should search products by keyword matching name, brand, or description', async () => {
      const res = await request(app).get('/api/products?q=Serum');

      expect(res.status).toBe(200);
      expect(res.body.products.length).toBeGreaterThanOrEqual(1);
      res.body.products.forEach((p) => {
        const text = `${p.name} ${p.brand} ${p.description || ''}`.toLowerCase();
        expect(text).toContain('serum');
      });
    });

    test('should safely handle adversarial and injection inputs without crash or 500 error', async () => {
      const adversarialQueries = [
        '<script>alert("xss")</script>',
        "' OR '1'='1' --",
        '{"$gt": ""}',
        '[[[**+++??',
        '\\(^.^)/',
      ];

      for (const q of adversarialQueries) {
        const res = await request(app).get(`/api/products?q=${encodeURIComponent(q)}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.products)).toBe(true);
      }
    });
  });

  describe('GET /api/products/categories (Taxonomy Discovery)', () => {
    test('should retrieve distinct categories and origins taxonomy', async () => {
      const res = await request(app).get('/api/products/categories');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.categories)).toBe(true);
      expect(Array.isArray(res.body.origins)).toBe(true);
      expect(res.body.categories).toContain('skincare');
      expect(res.body.categories).toContain('cosmetics');
      expect(res.body.categories).toContain('fragrances');
      expect(res.body.categories).toContain('haircare');
      expect(res.body.origins).toContain('France');
      expect(res.body.origins).toContain('South Korea');
    });
  });

  describe('GET /api/products/:id (Single Product Detail)', () => {
    test('should retrieve single product by valid ID', async () => {
      const target = seededProducts[0];
      const res = await request(app).get(`/api/products/${target._id}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.product).toBeDefined();
      expect(res.body.product._id.toString()).toBe(target._id.toString());
      expect(res.body.product.name).toBe(target.name);
      expect(res.body.product.price).toBe(target.price);
      expect(res.body.product.stock).toBe(target.stock);
      expect(res.body.product.specs).toBeDefined();
    });

    test('should return 404 for non-existent valid ObjectId', async () => {
      const fakeId = '654321654321654321654321';
      const res = await request(app).get(`/api/products/${fakeId}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    test('should return 400 for malformed non-ObjectId parameter', async () => {
      const res = await request(app).get('/api/products/not-a-valid-object-id');

      expect([400, 404]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message || res.body.error).toBeDefined();
    });
  });
});
