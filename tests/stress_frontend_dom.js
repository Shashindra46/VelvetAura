/**
 * VelvetAura - Frontend DOM, Event Delegation & Hash Routing Stress Harness
 * Executed by teamwork_challenger_m3_2
 */

const fs = require('fs');
const path = require('path');

const results = {
  passed: 0,
  failed: 0,
};

function assert(cond, name, msg = '') {
  if (cond) {
    results.passed++;
    console.log(`  ✓ PASS: ${name}`);
  } else {
    results.failed++;
    console.error(`  ✗ FAIL: ${name} - ${msg}`);
  }
}

async function runDomHarness() {
  console.log('\n--- Challenging Frontend DOM Architecture & Delegation ---');

  const indexHtml = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

  // Verify all essential IDs in index.html
  const requiredIds = [
    'navbar-container',
    'hero-banner',
    'catalog-container',
    'account-view-container',
    'order-confirmation-container',
    'footer-root',
    'product-modal-container',
    'cart-drawer-container',
    'checkout-modal-container',
    'auth-modal-container',
    'toast-container',
  ];

  for (const id of requiredIds) {
    assert(indexHtml.includes(`id="${id}"`), `DOM shell defines id="${id}"`);
  }

  // Verify CSS link references
  assert(indexHtml.includes('href="css/variables.css"'), 'index.html links css/variables.css');
  assert(indexHtml.includes('href="css/base.css"'), 'index.html links css/base.css');
  assert(indexHtml.includes('href="css/glassmorphism.css"'), 'index.html links css/glassmorphism.css');
  assert(indexHtml.includes('href="css/components.css"'), 'index.html links css/components.css');

  // Verify JS module entry point
  assert(indexHtml.includes('<script type="module" src="js/app.js"></script>'), 'index.html loads js/app.js as ES module');

  // Verify accessibility attributes in index.html
  assert(indexHtml.includes('role="banner"'), 'Navbar has role="banner"');
  assert(indexHtml.includes('role="main"'), 'Main has role="main"');
  assert(indexHtml.includes('role="contentinfo"'), 'Footer has role="contentinfo"');
  assert(indexHtml.includes('aria-live="polite"'), 'Toast container has aria-live="polite"');

  // Analyze app.js routing logic
  const appJs = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
  assert(appJs.includes("hash.startsWith('#/account')"), 'app.js handles #/account route');
  assert(appJs.includes("hash.startsWith('#/order/')"), 'app.js handles #/order/:id route');
  assert(appJs.includes("heroBanner.classList.remove('hidden')"), 'app.js defaults to catalog and displays hero banner');
  assert(appJs.includes("e.key === 'Escape'"), 'app.js handles Escape key for modal closing');

  // Analyze catalog.js event delegation
  const catalogJs = fs.readFileSync(path.join(__dirname, '../public/js/components/catalog.js'), 'utf8');
  assert(catalogJs.includes("e.target.closest('.filter-chip')"), 'catalog.js delegates filter-chip clicks');
  assert(catalogJs.includes("e.target.closest('[data-action=\"add-to-bag\"]')"), 'catalog.js delegates add-to-bag clicks');
  assert(catalogJs.includes("e.target.closest('[data-action=\"detail\"]')"), 'catalog.js delegates quick view / detail clicks');
  assert(catalogJs.includes("e.target.id === 'catalog-origin-select'"), 'catalog.js handles origin dropdown changes');
  assert(catalogJs.includes("e.target.id === 'catalog-price-select'"), 'catalog.js handles price dropdown changes');
  assert(catalogJs.includes("e.target.id === 'catalog-sort-select'"), 'catalog.js handles sort dropdown changes');

  // Analyze navbar.js event delegation
  const navbarJs = fs.readFileSync(path.join(__dirname, '../public/js/components/navbar.js'), 'utf8');
  assert(navbarJs.includes("e.target.id === 'navbar-search-input'"), 'navbar.js listens to search input typing');
  assert(navbarJs.includes("e.target.closest('#search-clear-btn')"), 'navbar.js handles search clear button');
  assert(navbarJs.includes("e.target.closest('.category-nav-btn')"), 'navbar.js handles category nav buttons');
  assert(navbarJs.includes("e.target.closest('#nav-cart-btn')"), 'navbar.js handles cart button trigger');
  assert(navbarJs.includes("e.target.closest('#nav-login-btn')"), 'navbar.js handles sign in button trigger');

  // Analyze cartDrawer.js event delegation & live calculations
  const cartDrawerJs = fs.readFileSync(path.join(__dirname, '../public/js/components/cartDrawer.js'), 'utf8');
  assert(cartDrawerJs.includes("e.target.closest('#drawer-close-btn')"), 'cartDrawer.js handles drawer close');
  assert(cartDrawerJs.includes("e.target.closest('#cart-drawer-backdrop')"), 'cartDrawer.js handles click-outside backdrop close');
  assert(cartDrawerJs.includes("e.target.closest('[data-action=\"qty-inc\"]')"), 'cartDrawer.js handles quantity increment');
  assert(cartDrawerJs.includes("e.target.closest('[data-action=\"qty-dec\"]')"), 'cartDrawer.js handles quantity decrement');
  assert(cartDrawerJs.includes("e.target.closest('[data-action=\"remove-item\"]')"), 'cartDrawer.js handles item deletion');
  assert(cartDrawerJs.includes("e.target.closest('#drawer-checkout-btn')"), 'cartDrawer.js handles proceed to checkout CTA');

  // Analyze checkoutModal.js payment method selectors
  const checkoutJs = fs.readFileSync(path.join(__dirname, '../public/js/components/checkoutModal.js'), 'utf8');
  assert(checkoutJs.includes('pay-method-cod'), 'checkoutModal.js provides Cash on Delivery (COD) payment selector');
  assert(checkoutJs.includes('pay-method-bank'), 'checkoutModal.js provides Direct Bank Transfer selector');
  assert(checkoutJs.includes("store.submitCheckout"), 'checkoutModal.js invokes submitCheckout on form submit');

  console.log(`\nDOM HARNESS SUMMARY: ${results.passed} Passed, ${results.failed} Failed\n`);
  process.exit(results.failed > 0 ? 1 : 0);
}

runDomHarness();
