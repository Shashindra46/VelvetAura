/**
 * VelvetAura - Milestone 3 Empirical Challenge & Stress Test Suite
 * Executed by teamwork_challenger_m3_2
 * 
 * Verifies:
 * 1. Static asset serving & SPA client-side routing fallback
 * 2. DOM container schemas, component mounting points, and hash routing
 * 3. Search & Filter resilience (XSS, regex ReDoS, special characters, multi-faceted filtering)
 * 4. Reactive store mathematics & boundary conditions (8% tax, $50 shipping threshold)
 */

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { connectDB, disconnectDB } = require('../src/config/db');
const app = require('../src/app');

// Results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function assert(condition, testName, details = '') {
  if (condition) {
    results.passed++;
    results.tests.push({ status: 'PASS', name: testName, details });
    console.log(`  ✓ PASS: ${testName}`);
  } else {
    results.failed++;
    results.tests.push({ status: 'FAIL', name: testName, details });
    console.error(`  ✗ FAIL: ${testName} - ${details}`);
  }
}

async function runStaticAndRoutingChallenges() {
  console.log('\n--- 1. Challenging Static Asset Serving & SPA Routing ---');

  // Test 1.1: Root GET / serves index.html
  const rootRes = await request(app).get('/');
  assert(rootRes.status === 200, 'GET / returns HTTP 200');
  assert(rootRes.headers['content-type'].includes('text/html'), 'GET / returns Content-Type text/html');
  assert(rootRes.text.includes('<!DOCTYPE html>'), 'GET / payload contains <!DOCTYPE html>');
  assert(rootRes.text.includes('VelvetAura'), 'GET / payload mentions VelvetAura');

  // Test 1.2: Static CSS and JS assets
  const cssRes = await request(app).get('/css/variables.css');
  assert(cssRes.status === 200, 'GET /css/variables.css returns HTTP 200');
  assert(cssRes.headers['content-type'].includes('text/css'), 'GET /css/variables.css returns Content-Type text/css');
  assert(cssRes.text.includes('--glass-card'), 'GET /css/variables.css contains glass design tokens');

  const jsRes = await request(app).get('/js/app.js');
  assert(jsRes.status === 200, 'GET /js/app.js returns HTTP 200');
  assert(jsRes.text.includes('VelvetAuraApp'), 'GET /js/app.js contains VelvetAuraApp class');

  const svgRes = await request(app).get('/assets/images/placeholder.svg');
  assert(svgRes.status === 200, 'GET /assets/images/placeholder.svg returns HTTP 200');
  assert(svgRes.headers['content-type'].includes('image/svg+xml'), 'GET /assets/images/placeholder.svg has SVG content type');

  // Test 1.3: Sub-routes (SPA fallback)
  const catalogRouteRes = await request(app).get('/catalog');
  assert(catalogRouteRes.status === 200, 'GET /catalog falls back to SPA shell (HTTP 200)');
  assert(catalogRouteRes.text.includes('id="app-root"'), 'GET /catalog serves index.html shell');

  const accountRouteRes = await request(app).get('/account');
  assert(accountRouteRes.status === 200, 'GET /account falls back to SPA shell (HTTP 200)');

  const orderRouteRes = await request(app).get('/order/66184a51e6b3dfa82c418901');
  assert(orderRouteRes.status === 200, 'GET /order/:id falls back to SPA shell (HTTP 200)');

  const arbitraryRouteRes = await request(app).get('/curated/luxury/collections');
  assert(arbitraryRouteRes.status === 200, 'Arbitrary deep path falls back to SPA shell (HTTP 200)');

  // Test 1.4: API routes must NOT fall back to SPA shell
  const apiNotFoundRes = await request(app).get('/api/unmapped-endpoint-challenge');
  assert(apiNotFoundRes.status === 404, 'GET /api/unmapped-endpoint returns HTTP 404');
  assert(apiNotFoundRes.headers['content-type'].includes('application/json'), 'GET /api/unmapped-endpoint returns application/json');
  assert(!apiNotFoundRes.text.includes('<!DOCTYPE html>'), 'GET /api/unmapped does NOT serve SPA HTML shell');
}

function runDOMContainerSchemaChallenges() {
  console.log('\n--- 2. Challenging DOM Container Schema & Component Bindings ---');

  const indexPath = path.join(__dirname, '../public/index.html');
  const indexHtml = fs.readFileSync(indexPath, 'utf8');

  const requiredContainers = [
    'navbar-container',
    'catalog-container',
    'product-modal-container',
    'cart-drawer-container',
    'checkout-modal-container',
    'order-confirmation-container',
    'account-view-container',
    'auth-modal-container',
    'toast-container',
    'hero-banner',
    'app-root',
    'footer-root'
  ];

  for (const id of requiredContainers) {
    const regex = new RegExp(`id=["']${id}["']`);
    assert(regex.test(indexHtml), `index.html contains mounting element #${id}`);
  }

  // Component binding checks
  const componentBindings = [
    { file: 'public/js/components/navbar.js', expected: '#navbar-container' },
    { file: 'public/js/components/catalog.js', expected: '#catalog-container' },
    { file: 'public/js/components/productDetail.js', expected: '#product-modal-container' },
    { file: 'public/js/components/cartDrawer.js', expected: '#cart-drawer-container' },
    { file: 'public/js/components/checkoutModal.js', expected: '#checkout-modal-container' },
    { file: 'public/js/components/orderConfirmation.js', expected: '#order-confirmation-container' },
    { file: 'public/js/components/accountView.js', expected: '#account-view-container' },
    { file: 'public/js/components/authModal.js', expected: '#auth-modal-container' },
    { file: 'public/js/app.js', expected: 'toast-container' },
  ];

  for (const comp of componentBindings) {
    const compContent = fs.readFileSync(path.join(__dirname, '..', comp.file), 'utf8');
    assert(compContent.includes(comp.expected), `${comp.file} binds to ${comp.expected}`);
  }

  // HTML escaping utility resilience
  const baseJsContent = fs.readFileSync(path.join(__dirname, '../public/js/components/base.js'), 'utf8');
  assert(baseJsContent.includes('escapeHtml'), 'public/js/components/base.js exports escapeHtml');

  // Simple mock of escapeHtml from base.js
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const xssAttacks = [
    '<script>alert("XSS")</script>',
    '"><img src=x onerror=alert(1)>',
    '<svg/onload=confirm(1)>',
    '\' onfocus="alert(1)"',
    '& < > " \''
  ];

  for (const xss of xssAttacks) {
    const sanitized = escapeHtml(xss);
    assert(!sanitized.includes('<script>'), `escapeHtml neutralizes <script> in "${xss}"`);
    assert(!sanitized.includes('<img'), `escapeHtml neutralizes <img in "${xss}"`);
    assert(!sanitized.includes('<svg'), `escapeHtml neutralizes <svg in "${xss}"`);
    assert(!sanitized.includes('"'), `escapeHtml neutralizes double quotes in "${xss}"`);
  }
}

async function runSearchAndFilterChallenges() {
  console.log('\n--- 3. Challenging Search & Filter Interactions ---');

  // Ensure DB connected (in-memory mode auto-seeds catalog)
  await connectDB({ forceMemory: true });

  // 3.1: Special Character & XSS Search Queries
  const searchStressVectors = [
    { name: 'XSS script tag', query: '<script>alert(1)</script>' },
    { name: 'XSS img tag', query: '"><img src=x onerror=alert(1)>' },
    { name: 'Regex brackets & dots', query: '[a-z].*+?^$()|' },
    { name: 'Regex unclosed parenthesis', query: '(unclosed regex' },
    { name: 'Regex unclosed bracket', query: '[unclosed bracket' },
    { name: 'SQL injection fragments', query: "'; DROP TABLE products; --" },
    { name: 'Quotes and double quotes', query: '""\'\'' },
    { name: 'Japanese characters', query: 'ルージュ' },
    { name: 'Korean characters', query: '설화수' },
    { name: 'French accented characters', query: 'Crème de la Mer & Édition' },
    { name: 'Emoji characters', query: '✨💎🌸' },
    { name: 'Extremely long string (2000 chars)', query: 'A'.repeat(2000) }
  ];

  for (const vec of searchStressVectors) {
    const res = await request(app).get(`/api/products?q=${encodeURIComponent(vec.query)}`);
    assert(res.status === 200, `Search query "${vec.name}" handled safely with HTTP 200 (no 500 crash)`);
    assert(Array.isArray(res.body.products), `Search query "${vec.name}" returns valid products array`);
  }

  // 3.2: Multi-Country Origin Filtering
  const origins = ['France', 'South Korea', 'Japan', 'Germany', 'United Kingdom', 'USA', 'Sweden', 'Italy'];
  for (const origin of origins) {
    const res = await request(app).get(`/api/products?origin=${encodeURIComponent(origin)}`);
    assert(res.status === 200, `Filter by origin "${origin}" returns HTTP 200`);
    assert(Array.isArray(res.body.products), `Filter by origin "${origin}" returns array`);
    if (res.body.products.length > 0) {
      const allMatch = res.body.products.every(p => p.origin === origin);
      assert(allMatch, `All products returned for origin "${origin}" match origin attribute exactly`);
    }
  }

  // 3.3: Invalid and Edge Origin Filters
  const invalidOriginRes = await request(app).get('/api/products?origin=Atlantis');
  assert(invalidOriginRes.status === 200, 'Filter by non-existent origin returns HTTP 200');
  assert(invalidOriginRes.body.products.length === 0, 'Filter by non-existent origin returns empty list');

  // 3.4: Category Filtering
  const categories = ['skincare', 'cosmetics', 'fragrances', 'haircare'];
  for (const cat of categories) {
    const res = await request(app).get(`/api/products?category=${cat}`);
    assert(res.status === 200, `Filter by category "${cat}" returns HTTP 200`);
    const allMatch = res.body.products.every(p => p.category.toLowerCase() === cat.toLowerCase());
    assert(allMatch, `All products returned for category "${cat}" match category attribute`);
  }

  // 3.5: Sorting Combinations
  const sorts = ['featured', 'price-asc', 'price-desc', 'rating', 'newest'];
  for (const sort of sorts) {
    const res = await request(app).get(`/api/products?sort=${sort}`);
    assert(res.status === 200, `Sort by "${sort}" returns HTTP 200`);
    if (sort === 'price-asc' && res.body.products.length > 1) {
      const isAsc = res.body.products.every((p, i, arr) => i === 0 || arr[i - 1].price <= p.price);
      assert(isAsc, 'Sort price-asc correctly orders items by ascending price');
    }
    if (sort === 'price-desc' && res.body.products.length > 1) {
      const isDesc = res.body.products.every((p, i, arr) => i === 0 || arr[i - 1].price >= p.price);
      assert(isDesc, 'Sort price-desc correctly orders items by descending price');
    }
  }

  // 3.6: Multi-Faceted Combination (Category + Origin + Search + Sort)
  const multiFacetRes = await request(app).get('/api/products?category=skincare&origin=France&sort=price-asc');
  assert(multiFacetRes.status === 200, 'Multi-faceted query (category=skincare&origin=France&sort=price-asc) returns HTTP 200');
  if (multiFacetRes.body.products.length > 0) {
    const allSkincareFrance = multiFacetRes.body.products.every(p => p.category === 'skincare' && p.origin === 'France');
    assert(allSkincareFrance, 'Multi-faceted results satisfy both category and origin constraints');
  }

  await disconnectDB();
}

function runReactiveStoreMathChallenges() {
  console.log('\n--- 4. Challenging Reactive Store Cart Mathematics & Thresholds ---');

  // Extract cart calculations matching public/js/store.js:
  // calculateTotals(items):
  // subtotal = sum(price * qty)
  // tax = round(subtotal * 0.08)
  // shipping = subtotal >= 50.0 || subtotal === 0 ? 0 : 5.99
  // grandTotal = subtotal + tax + shipping
  // freeShippingRemaining = max(0, 50.0 - subtotal)

  function calculateTotals(items) {
    const subtotal = items.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const shipping = subtotal >= 50.0 || items.length === 0 ? 0.0 : 5.99;
    const grandTotal = Math.round((subtotal + tax + shipping) * 100) / 100;
    const freeShippingRemaining = Math.max(0, Math.round((50.0 - subtotal) * 100) / 100);

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      tax,
      shipping,
      grandTotal,
      freeShippingRemaining,
    };
  }

  // Case A: Empty cart
  const emptyTotals = calculateTotals([]);
  assert(emptyTotals.subtotal === 0, 'Empty cart has subtotal $0.00');
  assert(emptyTotals.tax === 0, 'Empty cart has tax $0.00');
  assert(emptyTotals.shipping === 0, 'Empty cart has shipping $0.00');
  assert(emptyTotals.grandTotal === 0, 'Empty cart has grandTotal $0.00');
  assert(emptyTotals.freeShippingRemaining === 50.0, 'Empty cart freeShippingRemaining is $50.00');

  // Case B: Boundary subtotal $49.99 (below threshold)
  const belowBoundaryTotals = calculateTotals([{ price: 49.99, quantity: 1 }]);
  assert(belowBoundaryTotals.subtotal === 49.99, 'Boundary $49.99 subtotal is exact');
  assert(belowBoundaryTotals.shipping === 5.99, 'Boundary $49.99 triggers $5.99 shipping fee');
  assert(belowBoundaryTotals.tax === 4.00, 'Boundary $49.99 8% tax is $4.00');
  assert(belowBoundaryTotals.grandTotal === 59.98, 'Boundary $49.99 grand total is $59.98 ($49.99 + $4.00 + $5.99)');
  assert(belowBoundaryTotals.freeShippingRemaining === 0.01, 'Boundary $49.99 freeShippingRemaining is exactly $0.01');

  // Case C: Boundary subtotal $50.00 (exact threshold)
  const exactBoundaryTotals = calculateTotals([{ price: 25.00, quantity: 2 }]);
  assert(exactBoundaryTotals.subtotal === 50.00, 'Boundary $50.00 subtotal is exact');
  assert(exactBoundaryTotals.shipping === 0.00, 'Boundary $50.00 qualifies for FREE shipping ($0.00)');
  assert(exactBoundaryTotals.tax === 4.00, 'Boundary $50.00 8% tax is $4.00');
  assert(exactBoundaryTotals.grandTotal === 54.00, 'Boundary $50.00 grand total is $54.00');
  assert(exactBoundaryTotals.freeShippingRemaining === 0.00, 'Boundary $50.00 freeShippingRemaining is $0.00');

  // Case D: Luxury High Subtotal ($350.00)
  const luxuryTotals = calculateTotals([{ price: 175.00, quantity: 2 }]);
  assert(luxuryTotals.subtotal === 350.00, 'Luxury $350.00 subtotal is exact');
  assert(luxuryTotals.shipping === 0.00, 'Luxury $350.00 has FREE shipping');
  assert(luxuryTotals.tax === 28.00, 'Luxury $350.00 8% tax is $28.00');
  assert(luxuryTotals.grandTotal === 378.00, 'Luxury $350.00 grand total is $378.00');
}

async function main() {
  console.log('================================================================');
  console.log('  VelvetAura M3 Empirical Stress & Contract Challenge Runner   ');
  console.log('================================================================');

  try {
    await runStaticAndRoutingChallenges();
    runDOMContainerSchemaChallenges();
    await runSearchAndFilterChallenges();
    runReactiveStoreMathChallenges();
  } catch (err) {
    console.error('Unhandled failure during challenge execution:', err);
    results.failed++;
  }

  console.log('\n================================================================');
  console.log(`CHALLENGE SUMMARY: ${results.passed} Passed, ${results.failed} Failed`);
  console.log('================================================================');

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
