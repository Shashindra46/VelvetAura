# VelvetAura UI Components, View Controllers & Interaction Architecture

**Author**: `teamwork_explorer_m3_3`  
**Milestone**: M3 — Dark-Mode Glassmorphism Frontend  
**Scope**: UI Component Hierarchy, View Controllers, DOM Schemas, and User Interactions  
**Working Directory**: `g:\VelvetAura\.agents\teamwork\teamwork_explorer_m3_3`  
**Date**: 2026-11-04  

---

## 1. Executive Overview & Architectural Philosophy

VelvetAura is a luxury e-commerce platform curating premier imported beauty, skincare, cosmetics, and fragrances from the world's beauty capitals: France 🇫🇷, South Korea 🇰🇷, Japan 🇯🇵, Germany 🇩🇪, United Kingdom 🇬🇧, USA 🇺🇸, Sweden 🇸🇪, and Italy 🇮🇹.

The frontend is implemented as a **zero-dependency Vanilla ES6 Modules Single-Page Application (SPA)** with an obsidian-and-frosted-glass aesthetic. It delivers an ultra-fast, fluid desktop and mobile experience without requiring a full page refresh during any stage of the shopping journey.

### 1.1 Core Interaction Principles
1. **Zero-Reload Reactivity**: Adding an item to the shopping bag immediately triggers a badge pulse animation and updates the drawer's financial breakdown synchronously via reactive store subscriptions.
2. **Deterministic UI State Machine**: Views and dialogs (Catalog, Product Detail Modal, Cart Drawer, Checkout Modal, Order Confirmation Receipt, Account View, Auth Modal) are mounted into predictable DOM containers and transitioned via CSS classes (`.is-open`, `.is-active`, `.fade-in`, `.slide-in`).
3. **Robust Input Guards & Clamping**: Quantity steppers in both the product modal and cart drawer strictly clamp inputs between `1` and `product.stock`, disabling increment buttons when inventory limits are reached.
4. **Resilient Mock Payment Simulation**: The checkout view provides 1-click test card autofill for both approved test credentials (`4242...4242`) and bank decline simulation (`...0002`), giving developers, reviewers, and automated test runners an immediate feedback loop.

---

## 2. Global Component Architecture & Base Contract

### 2.1 Base Component Contract
All UI components implement a standard interface:
```javascript
/**
 * Base UI Component pattern for VelvetAura SPA
 */
export class BaseComponent {
  constructor(containerSelector, options = {}) {
    this.container = typeof containerSelector === 'string' 
      ? document.querySelector(containerSelector) 
      : containerSelector;
    this.options = options;
    this.unsubscribers = [];
  }

  /**
   * Initializes component, subscribes to store slices, and performs initial render.
   */
  init() {
    this.render();
    this.bindEvents();
  }

  /**
   * Generates or mutates DOM elements inside this.container.
   */
  render() {}

  /**
   * Registers DOM event listeners using event delegation.
   */
  bindEvents() {}

  /**
   * Cleans up store subscriptions and event listeners.
   */
  destroy() {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
  }
}
```

### 2.2 Shared Formatting & Utility Helpers
To guarantee consistent presentation across all components:
```javascript
/**
 * Formats numeric price into USD currency string.
 * @param {number} amount 
 * @returns {string} e.g. "$89.00"
 */
export function formatPrice(amount) {
  const val = Number(amount) || 0;
  return `$${val.toFixed(2)}`;
}

/**
 * Escapes HTML entities to prevent XSS.
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Maps country name to country flag emoji and formatted name.
 * @param {string} origin 
 * @returns {string} e.g. "🇫🇷 France"
 */
export function getOriginBadge(origin) {
  const map = {
    'France': '🇫🇷 France',
    'South Korea': '🇰🇷 South Korea',
    'Japan': '🇯🇵 Japan',
    'Germany': '🇩🇪 Germany',
    'United Kingdom': '🇬🇧 United Kingdom',
    'UK': '🇬🇧 United Kingdom',
    'USA': '🇺🇸 USA',
    'United States': '🇺🇸 USA',
    'Sweden': '🇸🇪 Sweden',
    'Italy': '🇮🇹 Italy'
  };
  return map[origin] || `🌍 ${origin || 'Imported'}`;
}

/**
 * Formats ISO date into readable receipt format.
 * @param {string|Date} dateStr 
 * @returns {string} e.g. "November 4, 2026, 12:45 PM"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}
```

---

## 3. Modular Component Hierarchy & Specifications

```
                     ┌──────────────────────────────────────┐
                     │          AppBoot & Router            │
                     │          (public/js/app.js)          │
                     └──────────────────┬───────────────────┘
                                        │
     ┌───────────────────┬──────────────┼──────────────┬───────────────────┐
     ▼                   ▼              ▼              ▼                   ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Navbar       │ │ Catalog      │ │ ProductModal │ │ CartDrawer   │ │ Checkout     │
│ Component    │ │ Component    │ │ Component    │ │ Component    │ │ Modal        │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────┬───────┘
                                                                           │
                                                                           ▼
                                                             ┌─────────────────────┐
                                                             │ OrderConfirmation   │
                                                             │ Receipt             │
                                                             └─────────────────────┘
                                                                           │
                                                                           ▼
                                                             ┌─────────────────────┐
                                                             │ AccountView         │
                                                             │ (History & Profile) │
                                                             └─────────────────────┘
```

---

### 3.1 Component 1: `NavbarComponent` (`public/js/components/navbar.js`)

#### Purpose & Responsibilities
The sticky frosted glass navigation bar acts as the primary global control header:
- Displays luxury brand identity with shimmery metallic typography.
- Hosts debounced keyword search with an instant clear button (`✕`).
- Provides quick category navigation tabs (`All`, `Skincare`, `Cosmetics`, `Fragrances`, `Haircare`).
- Displays the shopping bag button with a reactive counter badge that animates (`pulse-badge`) whenever items are added or quantities change.
- Displays customer authentication status: "Sign In / Register" when unauthenticated, or a customer avatar pill with a dropdown menu ("My Account", "Order History", "Sign Out") when authenticated.

#### Target DOM Mount Point
`<header id="navbar-container" class="navbar-sticky glass-elevated"></header>`

#### State Subscriptions
- `auth`: re-renders auth button / user avatar menu upon login or logout.
- `cart.itemCount`: updates dynamic badge count; triggers CSS scale-pulse animation.
- `catalog.activeCategory`: toggles active state on category navigation tabs.
- `catalog.searchQuery`: syncs input value if cleared externally.

#### Detailed DOM Schema
```html
<header id="navbar-container" class="navbar-container glass-elevated">
  <div class="navbar-inner container">
    <!-- Brand Identity -->
    <a href="#/catalog" class="navbar-brand" id="nav-brand-logo">
      <span class="brand-title">Velvet<span class="text-gold">Aura</span></span>
      <span class="brand-subtitle">Luxe Importations</span>
    </a>

    <!-- Center Section: Search Bar & Category Navigation -->
    <div class="navbar-center">
      <!-- Search Bar -->
      <div class="navbar-search-wrapper">
        <span class="search-icon">🔍</span>
        <input 
          type="text" 
          id="navbar-search-input" 
          class="glass-input search-input" 
          placeholder="Search imported serums, fragrances, luxury makeup..." 
          autocomplete="off"
          aria-label="Search Catalog"
        />
        <button type="button" id="search-clear-btn" class="search-clear-btn hidden" aria-label="Clear Search">✕</button>
      </div>

      <!-- Category Navigation Tabs -->
      <nav class="navbar-categories" aria-label="Product Categories">
        <button type="button" class="category-nav-btn active" data-category="all">All</button>
        <button type="button" class="category-nav-btn" data-category="skincare">Skincare</button>
        <button type="button" class="category-nav-btn" data-category="cosmetics">Cosmetics</button>
        <button type="button" class="category-nav-btn" data-category="fragrances">Fragrances</button>
        <button type="button" class="category-nav-btn" data-category="haircare">Haircare</button>
      </nav>
    </div>

    <!-- Right Controls: Cart Badge & Auth Indicator -->
    <div class="navbar-actions">
      <!-- Cart Drawer Trigger Button -->
      <button type="button" id="nav-cart-btn" class="nav-cart-btn glass-btn" aria-label="Shopping Bag">
        <span class="cart-icon">🛍️</span>
        <span class="cart-label">Bag</span>
        <span id="cart-badge" class="cart-badge">0</span>
      </button>

      <!-- Auth Action Container -->
      <div id="nav-auth-container" class="nav-auth-container">
        <!-- Rendered dynamically: Sign In button OR User Dropdown -->
      </div>
    </div>
  </div>
</header>
```

#### Event & Interaction Specifications
1. **Debounced Search**:
   - On `input` event on `#navbar-search-input`:
     - Show `#search-clear-btn` if input has characters; hide if empty.
     - Clear existing timer and start 300ms debounce.
     - On timeout: Call `store.setSearchQuery(input.value.trim())`.
     - Route to `#/catalog` if currently on another route.
2. **Clear Search**:
   - On click `#search-clear-btn`:
     - Set `input.value = ''`.
     - Hide `#search-clear-btn`.
     - Call `store.setSearchQuery('')`.
3. **Category Navigation**:
   - On click `.category-nav-btn`:
     - Extract `dataset.category`.
     - Call `store.setActiveCategory(category)`.
     - Update `.active` class across tab buttons.
     - Route to `#/catalog`.
4. **Cart Bag Click**:
   - On click `#nav-cart-btn`:
     - Call `store.openCart()`.
5. **Badge Animation Lifecycle**:
   - Whenever `cart.itemCount` increases:
     - Add CSS class `.badge-pulse` to `#cart-badge`.
     - Set timeout for 400ms to remove `.badge-pulse`.
6. **User Menu Dropdown**:
   - If authenticated:
     - Avatar pill with customer initials (e.g. `CP` for Camille Dupont).
     - Clicking toggles `.is-open` on `#nav-user-dropdown`.
     - Clicking "My Account" routes to `#/account`.
     - Clicking "Sign Out" calls `store.logout()` and displays info toast.
     - Click outside listener closes the dropdown automatically.

---

### 3.2 Component 2: `CatalogComponent` (`public/js/components/catalog.js`)

#### Purpose & Responsibilities
The Catalog view is the e-commerce heart of VelvetAura:
- Multi-faceted filtering toolbar:
  - Category filter pills.
  - Country of origin dropdown selector (France, South Korea, Japan, Germany, United Kingdom, USA, Sweden, Italy).
  - Price range selector (`All`, `Under $50`, `$50 – $100`, `$100 – $250`, `$250+`).
  - Sort selector (`Featured`, `Price: Low to High`, `Price: High to Low`, `Customer Rating`, `Newest`).
- Responsive Product Grid displaying glassmorphism product cards:
  - High-res image with smooth hover zoom.
  - Imported origin flag pill (e.g. `🇫🇷 France`, `🇰🇷 South Korea`).
  - Luxury brand tag in champagne gold (`--accent-gold`).
  - Full product title with 2-line clamp.
  - Star rating with average and review count.
  - Stock status pill (`✓ In Stock`, `⚠ Only X left`, `✕ Sold Out`).
  - Quick "Add to Bag" button with immediate visual feedback (`✓ Added!`) and zero-reload cart sync.
- Empty state with reset filters CTA when criteria match 0 items.
- Shimmer glass skeleton cards during data fetching.

#### Target DOM Mount Point
`<main id="catalog-container" class="catalog-container container"></main>`

#### State Subscriptions
- `catalog.products`: re-renders product grid.
- `catalog.loading`: toggles skeleton cards.
- `catalog.activeCategory`, `catalog.activeOrigin`, `catalog.searchQuery`, `catalog.sort`: syncs filter toolbar controls.

#### Detailed DOM Schema
```html
<section id="catalog-container" class="catalog-section">
  <!-- Filter & Sort Control Toolbar -->
  <div class="catalog-toolbar glass-card">
    <div class="toolbar-row">
      <!-- Category Chips -->
      <div class="filter-group category-chips" id="catalog-category-chips">
        <button type="button" class="filter-chip active" data-category="all">All Items</button>
        <button type="button" class="filter-chip" data-category="skincare">Skincare</button>
        <button type="button" class="filter-chip" data-category="cosmetics">Cosmetics</button>
        <button type="button" class="filter-chip" data-category="fragrances">Fragrances</button>
        <button type="button" class="filter-chip" data-category="haircare">Haircare</button>
      </div>

      <!-- Secondary Filters & Sort Controls -->
      <div class="filter-controls-right">
        <!-- Origin Country Selector -->
        <div class="select-wrapper">
          <label for="catalog-origin-select" class="sr-only">Country of Origin</label>
          <select id="catalog-origin-select" class="glass-select">
            <option value="all">🌍 All Global Capitals</option>
            <option value="France">🇫🇷 France (Paris)</option>
            <option value="South Korea">🇰🇷 South Korea (Seoul)</option>
            <option value="Japan">🇯🇵 Japan (Tokyo)</option>
            <option value="Germany">🇩🇪 Germany (Munich)</option>
            <option value="United Kingdom">🇬🇧 United Kingdom (London)</option>
            <option value="USA">🇺🇸 USA (New York)</option>
            <option value="Sweden">🇸🇪 Sweden (Stockholm)</option>
            <option value="Italy">🇮🇹 Italy (Milan)</option>
          </select>
        </div>

        <!-- Price Range Filter -->
        <div class="select-wrapper">
          <label for="catalog-price-select" class="sr-only">Price Range</label>
          <select id="catalog-price-select" class="glass-select">
            <option value="all">All Prices</option>
            <option value="0-50">Under $50</option>
            <option value="50-100">$50 – $100</option>
            <option value="100-250">$100 – $250</option>
            <option value="250-9999">$250+</option>
          </select>
        </div>

        <!-- Sort Dropdown -->
        <div class="select-wrapper">
          <label for="catalog-sort-select" class="sr-only">Sort By</label>
          <select id="catalog-sort-select" class="glass-select">
            <option value="featured">Featured Curations</option>
            <option value="price-asc">Price: Low to High</option>
            <option value="price-desc">Price: High to Low</option>
            <option value="rating">Top Customer Rated</option>
            <option value="newest">Newest Arrivals</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Active Filters Summary & Result Count -->
    <div class="catalog-status-bar">
      <span id="catalog-result-count" class="result-count">Showing 24 luxury imports</span>
      <div id="catalog-active-tags" class="active-tags-list"></div>
      <button type="button" id="catalog-reset-btn" class="btn-text-gold hidden">Reset Filters</button>
    </div>
  </div>

  <!-- Product Grid Container -->
  <div id="product-grid" class="product-grid" aria-live="polite">
    <!-- Rendered Product Cards or Skeletons or Empty State -->
  </div>
</section>
```

#### Product Card Schema (`.product-card`)
```html
<article class="product-card glass-card" data-product-id="${product._id}">
  <!-- Card Header Media Area -->
  <div class="product-media-wrapper">
    <div class="product-badges-top">
      <span class="origin-pill glass-pill">${getOriginBadge(product.origin)}</span>
      <span class="stock-pill ${stockStatusClass}">${stockStatusLabel}</span>
    </div>
    <img 
      src="${escapeHtml(product.image)}" 
      alt="${escapeHtml(product.name)}" 
      class="product-image"
      loading="lazy"
      onerror="this.src='/assets/images/placeholder.webp'; this.onerror=null;"
    />
    <div class="quick-view-overlay">
      <span class="quick-view-text">Quick View</span>
    </div>
  </div>

  <!-- Card Body Content Area -->
  <div class="product-body">
    <span class="product-brand">${escapeHtml(product.brand)}</span>
    <h3 class="product-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
    
    <div class="product-rating">
      <span class="stars">★★★★★</span>
      <span class="rating-val">${product.rating.toFixed(1)}</span>
      <span class="rating-count">(${product.numReviews})</span>
    </div>

    <div class="product-pricing">
      <span class="current-price">${formatPrice(product.price)}</span>
      ${product.originalPrice ? `<span class="original-price">${formatPrice(product.originalPrice)}</span>` : ''}
    </div>
  </div>

  <!-- Card Action Footer -->
  <div class="product-actions">
    <button 
      type="button" 
      class="btn-add-to-bag glass-btn ${product.stock === 0 ? 'disabled' : ''}" 
      data-product-id="${product._id}"
      ${product.stock === 0 ? 'disabled' : ''}
    >
      ${product.stock === 0 ? 'Sold Out' : '<span>🛍️ Add to Bag</span>'}
    </button>
  </div>
</article>
```

#### Event & Interaction Specifications
1. **Toolbar Filters**:
   - Filter chip click: Updates `store.setActiveCategory(cat)`.
   - Origin select change: Updates `store.setActiveOrigin(e.target.value)`.
   - Price range select change: Updates `store.setPriceRange(min, max)`.
   - Sort select change: Updates `store.setSort(e.target.value)`.
   - Reset button click: Clears all filters back to defaults.
2. **Product Card Click**:
   - Clicking card body or quick view overlay (not the Add to Bag button): Calls `store.openProductDetail(productId)`.
3. **Quick "Add to Bag" Click**:
   - Stop propagation (to prevent opening detail modal).
   - If item is in stock (`stock > 0`):
     - Button displays temporary state: `✓ Added!` with green glow.
     - Dispatches `store.addToCart(productId, 1)`.
     - After 1200ms, restore button text to `🛍️ Add to Bag`.
4. **Empty State**:
   - If `products.length === 0`:
     - Render frosted card with glass sparkle icon:
     - Copy: *"No imported luxury items match your active filters."*
     - Button: *"Reset All Filters"* which clears query and selects "All".

---

### 3.3 Component 3: `ProductDetailModalComponent` (`public/js/components/productDetail.js`)

#### Purpose & Responsibilities
Provides a high-definition, two-column inspection modal for single products:
- Frosted glass backdrop with ambient blur (`backdrop-filter: blur(20px)`).
- Full brand provenance, origin badge, and authenticity guarantee seal.
- Stock availability indicator:
  - Green (`● In Stock (X units available)`).
  - Amber (`⚠ Low Stock: Only X left in our bonded warehouse`).
  - Red (`✕ Out of Stock`).
- Quantity stepper selector (`[-]` / `input` / `[+]`):
  - Strictly clamped between 1 and `product.stock`.
  - Disables decrement at 1; disables increment at `product.stock`.
- Dynamic button label reflecting total price: *"Add to Bag — $XX.XX"*.
- Secondary action: *"Instant Checkout"* (adds to cart and triggers checkout modal immediately).
- Detailed Specifications Table:
  - Skin / Hair / Scent Type.
  - Volume / Net Weight.
  - Key Ingredients & Active Actives (e.g. Pitera™, TFC8®, JAUM Activator™).
  - Country of Origin.

#### Target DOM Mount Point
`<div id="product-modal-container" class="modal-backdrop-wrapper"></div>`

#### Detailed DOM Schema
```html
<div id="product-detail-modal" class="modal-overlay glass-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-product-title">
  <div class="modal-dialog glass-elevated">
    <!-- Close Button -->
    <button type="button" id="modal-close-btn" class="modal-close-btn" aria-label="Close Product Details">✕</button>

    <div class="modal-content-grid">
      <!-- Left Column: Media Showcase -->
      <div class="modal-media-column">
        <div class="modal-image-frame glass-card">
          <img 
            id="modal-product-image" 
            src="${product.image}" 
            alt="${escapeHtml(product.name)}" 
            class="modal-hero-image"
          />
        </div>
        <div class="authenticity-seal">
          <span class="seal-icon">🛡️</span>
          <span class="seal-text">Directly Imported from ${escapeHtml(product.origin)} · 100% Authentic</span>
        </div>
      </div>

      <!-- Right Column: Specs & Purchasing Controls -->
      <div class="modal-details-column">
        <div class="modal-header">
          <span class="modal-origin-pill glass-pill">${getOriginBadge(product.origin)}</span>
          <span class="modal-brand">${escapeHtml(product.brand)}</span>
          <h2 id="modal-product-title" class="modal-title">${escapeHtml(product.name)}</h2>
          
          <div class="modal-rating">
            <span class="stars">★★★★★</span>
            <span class="rating-val">${product.rating.toFixed(1)}</span>
            <span class="rating-reviews">(${product.numReviews} customer reviews)</span>
          </div>

          <div class="modal-price-row">
            <span class="modal-price">${formatPrice(product.price)}</span>
            ${product.originalPrice ? `<span class="modal-original-price">${formatPrice(product.originalPrice)}</span>` : ''}
            <span class="tax-duty-note">Import duties included</span>
          </div>
        </div>

        <!-- Inventory Stock Status Indicator -->
        <div class="modal-stock-status">
          ${stockStatusHtml}
        </div>

        <p class="modal-description">${escapeHtml(product.description)}</p>

        <!-- Purchasing Stepper & Actions -->
        ${product.stock > 0 ? `
          <div class="modal-purchase-controls">
            <div class="quantity-stepper-wrapper">
              <label for="modal-qty-input" class="qty-label">Quantity</label>
              <div class="quantity-stepper glass-card">
                <button type="button" id="modal-qty-dec" class="stepper-btn" aria-label="Decrease quantity">−</button>
                <input 
                  type="number" 
                  id="modal-qty-input" 
                  class="stepper-input" 
                  value="1" 
                  min="1" 
                  max="${product.stock}" 
                  readonly
                />
                <button type="button" id="modal-qty-inc" class="stepper-btn" aria-label="Increase quantity">+</button>
              </div>
            </div>

            <div class="modal-action-buttons">
              <button type="button" id="modal-add-bag-btn" class="btn-primary-gold">
                <span>🛍️ Add to Bag — <span id="modal-total-price">${formatPrice(product.price)}</span></span>
              </button>
              <button type="button" id="modal-buy-now-btn" class="btn-secondary-glass">
                ⚡ Instant Checkout
              </button>
            </div>
          </div>
        ` : `
          <div class="out-of-stock-alert glass-card">
            <span class="alert-icon">✕</span>
            <span>This imported luxury item is currently sold out in our bonded facility.</span>
          </div>
        `}

        <!-- Product Specifications Accordion / Table -->
        <div class="modal-specs-section">
          <h4 class="specs-heading">Specifications & Provenance</h4>
          <table class="specs-table">
            <tbody>
              <tr><th>Volume / Size</th><td>${escapeHtml(product.specs?.volume || product.volume || 'Standard')}</td></tr>
              <tr><th>Skin / Hair Type</th><td>${escapeHtml(product.specs?.skinType || product.specs?.hairType || product.specs?.scentFamily || 'All Types')}</td></tr>
              <tr><th>Formulation</th><td>${escapeHtml(product.specs?.formulation || product.subcategory || 'Standard')}</td></tr>
              <tr><th>Key Benefits</th><td>${escapeHtml(product.specs?.keyBenefit || product.specs?.notes || 'Deep luxury care')}</td></tr>
              ${product.specs?.ingredients ? `<tr><th>Active Ingredients</th><td>${escapeHtml(product.specs.ingredients)}</td></tr>` : ''}
              <tr><th>Country of Origin</th><td>${escapeHtml(product.origin)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
```

#### Event & Interaction Specifications
1. **Modal Visibility**:
   - Controlled by `store.state.activeProduct`. When `product !== null`, modal displays with class `.is-open`.
   - Dismissable by: clicking close button (`#modal-close-btn`), clicking backdrop overlay, or pressing `Escape` key.
2. **Quantity Stepper Calculations**:
   - Decrement button: Decreases quantity by 1 down to min 1.
   - Increment button: Increases quantity by 1 up to max `product.stock`.
   - Input change / Stepper click immediately updates `#modal-total-price` to `formatPrice(product.price * currentQty)`.
   - Button states (`disabled`) update dynamically when quantity is at boundaries (1 or `product.stock`).
3. **Add to Bag Action**:
   - Calls `store.addToCart(product._id, currentQty)`.
   - Closes product detail modal.
   - Opens Cart Drawer automatically to show updated line item.
4. **Instant Checkout Action**:
   - Calls `store.addToCart(product._id, currentQty)`.
   - Closes product detail modal.
   - Launches Checkout Modal directly.

---

### 3.4 Component 4: `CartDrawerComponent` (`public/js/components/cartDrawer.js`)

#### Purpose & Responsibilities
The slide-over shopping bag drawer offers a tactile, high-fashion checkout launchpad:
- Slides smoothly from the right edge over a dark frosted backdrop overlay.
- Free shipping progress bar dynamically tracking the **$50.00 free shipping threshold**:
  - If subtotal < $50.00: *"Add $XX.XX more to unlock Free Global Air Shipping!"*
  - If subtotal >= $50.00: *"✨ You've unlocked Free Global Air Shipping!"*
- Scrollable list of active cart line items:
  - 64x64px glass-framed thumbnail.
  - Brand tag, product name, unit price, and line subtotal.
  - In-place quantity stepper (`[-]` and `[+]`) with zero-reload updates.
  - Remove item button (`🗑️`).
- Live Financial Summary Breakdown:
  - **Subtotal**: Sum of `(price * quantity)`.
  - **Estimated Tax (8%)**: Exact 8% tax calculation (`Math.round(subtotal * 0.08 * 100) / 100`).
  - **Shipping**: `$0.00` if subtotal >= $50, else `$5.99`.
  - **Grand Total**: `subtotal + tax + shipping`.
- Primary CTA: *"Proceed to Checkout — $XX.XX"*:
  - If user is logged in: Closes drawer, opens `CheckoutModalComponent`.
  - If guest: Prompts Auth Modal with return callback to checkout upon login.

#### Target DOM Mount Point
`<aside id="cart-drawer-container" class="cart-drawer-wrapper"></aside>`

#### State Subscriptions
- `cart`: Re-renders items list, recalculates totals, and updates free shipping progress bar.
- `cart.isOpen`: Toggles `.is-open` class on drawer and backdrop.

#### Detailed DOM Schema
```html
<div id="cart-drawer" class="cart-drawer glass-elevated" role="dialog" aria-modal="true" aria-label="Shopping Bag">
  <!-- Drawer Header -->
  <div class="cart-drawer-header">
    <div class="header-title-wrap">
      <span class="drawer-icon">🛍️</span>
      <h2 class="drawer-title">Your Luxury Bag</h2>
      <span id="drawer-item-count" class="drawer-badge">(0 items)</span>
    </div>
    <button type="button" id="drawer-close-btn" class="drawer-close-btn" aria-label="Close Bag">✕</button>
  </div>

  <!-- Free Shipping Progress Meter -->
  <div class="free-shipping-banner" id="free-shipping-banner">
    <div class="shipping-meter-label">
      <span id="shipping-meter-text">Add $50.00 more for Free Global Shipping</span>
    </div>
    <div class="shipping-progress-track">
      <div id="shipping-progress-fill" class="shipping-progress-fill" style="width: 0%;"></div>
    </div>
  </div>

  <!-- Scrollable Cart Line Items -->
  <div class="cart-items-container" id="cart-items-list" tabindex="0">
    <!-- Populated by Cart Items or Empty State -->
  </div>

  <!-- Drawer Footer: Financial Breakdown & Checkout CTA -->
  <div class="cart-drawer-footer" id="cart-drawer-footer">
    <div class="summary-card glass-card">
      <div class="summary-line">
        <span class="summary-label">Subtotal</span>
        <span id="cart-subtotal" class="summary-val">$0.00</span>
      </div>
      <div class="summary-line">
        <span class="summary-label">Estimated Tax (8%)</span>
        <span id="cart-tax" class="summary-val">$0.00</span>
      </div>
      <div class="summary-line">
        <span class="summary-label">Global Shipping</span>
        <span id="cart-shipping" class="summary-val">$0.00</span>
      </div>
      <div class="summary-divider"></div>
      <div class="summary-line grand-total-line">
        <span class="total-label">Grand Total</span>
        <span id="cart-grand-total" class="total-val">$0.00</span>
      </div>
    </div>

    <!-- Checkout Action Button -->
    <button type="button" id="cart-checkout-btn" class="btn-checkout-primary">
      <span>Proceed to Checkout</span>
      <span id="checkout-btn-total">$0.00</span>
    </button>
  </div>
</div>
<div id="cart-drawer-backdrop" class="drawer-backdrop"></div>
```

#### Line Item HTML Template (`.cart-item-row`)
```html
<div class="cart-item-row glass-card" data-product-id="${item.productId}">
  <img 
    src="${escapeHtml(item.image)}" 
    alt="${escapeHtml(item.name)}" 
    class="cart-item-thumb" 
    onerror="this.src='/assets/images/placeholder.webp';"
  />
  <div class="cart-item-info">
    <span class="cart-item-brand">${escapeHtml(item.brand)}</span>
    <h4 class="cart-item-name">${escapeHtml(item.name)}</h4>
    <span class="cart-item-unit-price">${formatPrice(item.price)} each</span>
    
    <div class="cart-item-actions">
      <!-- Quantity Stepper -->
      <div class="cart-stepper glass-pill">
        <button type="button" class="btn-cart-qty-dec" data-id="${item.productId}" aria-label="Decrease quantity">−</button>
        <span class="cart-qty-display">${item.quantity}</span>
        <button 
          type="button" 
          class="btn-cart-qty-inc ${item.quantity >= item.stock ? 'disabled' : ''}" 
          data-id="${item.productId}"
          ${item.quantity >= item.stock ? 'disabled' : ''} 
          aria-label="Increase quantity"
        >+</button>
      </div>

      <span class="cart-item-subtotal">${formatPrice(item.price * item.quantity)}</span>
      
      <!-- Remove Item Button -->
      <button type="button" class="btn-remove-item" data-id="${item.productId}" aria-label="Remove item">
        🗑️
      </button>
    </div>
  </div>
</div>
```

#### Event & Interaction Specifications
1. **Drawer Open / Close**:
   - `store.openCart()` adds `.is-open` to `#cart-drawer` and `#cart-drawer-backdrop`.
   - Dismissed by: clicking `#drawer-close-btn`, clicking backdrop, or pressing `Escape`.
2. **Real-Time Stepper Modifications**:
   - Decrement click:
     - If `quantity > 1`: Calls `store.updateCartItem(productId, quantity - 1)`.
     - If `quantity === 1`: Prompts confirmation or removes item via `store.removeCartItem(productId)`.
   - Increment click:
     - If `quantity < stock`: Calls `store.updateCartItem(productId, quantity + 1)`.
     - Totals update synchronously on screen without reload.
3. **Free Shipping Progress Meter Math**:
   - Threshold = `$50.00`.
   - Percent = `Math.min(100, (subtotal / 50.0) * 100)`.
   - If `subtotal >= 50.0`: Progress fill width `100%`, color emerald green/gold, text: *"✨ You have qualified for Free Global Air Shipping!"*.
   - If `subtotal < 50.0`: Progress fill width `${Percent}%`, text: `Add ${formatPrice(50.0 - subtotal)} more for Free Global Shipping`.
4. **Checkout CTA Click**:
   - If `items.length === 0`: Disabled.
   - If `!store.state.auth.isAuthenticated`: Closes drawer, opens Auth Modal with notice *"Please sign in to proceed with your luxury checkout"*.
   - If authenticated: Closes drawer, opens `CheckoutModalComponent`.

---

### 3.5 Component 5: `CheckoutModalComponent` (`public/js/components/checkoutModal.js`)

#### Purpose & Responsibilities
Provides a streamlined, transparent checkout modal simulating luxury payment capture:
- Two-Section Workflow:
  - **Section A: Shipping Destination**:
    - Full Name, Street Address, Apt/Suite (optional), City, State/Province, ZIP/Postal Code, Country selector.
    - Pre-filled from user profile address if available.
  - **Section B: Payment Simulation (Sandbox Mock Gateway)**:
    - Clear sandbox disclaimer banner:
      - `🛡️ Sandbox Testing Mode — No real charges will be made to any credit card.`
    - **One-Click Sandbox Test Card Autofill Buttons**:
      - `✨ Auto-fill Approved Card (Visa)`: Autofills `4242424242424242`, `12/28`, `123`, `Camille Dupont`.
      - `❌ Auto-fill Declined Card`: Autofills `4000000000000002`, `12/28`, `000`, `Declined Cardholder`.
    - Live card input with automated card network logo detection (Visa, Mastercard, Amex).
- Order review summary box (Item count, Subtotal, 8% Tax, Shipping, Grand Total).
- Submission Guard:
  - Form validation with inline error feedback.
  - Submission button `#submit-order-btn` displays loading spinner and disables during API roundtrip to prevent double charges.
- Error handling: Displays server decline reason (e.g. `Your card was declined by the issuing bank`).

#### Target DOM Mount Point
`<div id="checkout-modal-container" class="modal-backdrop-wrapper"></div>`

#### Detailed DOM Schema
```html
<div id="checkout-modal" class="modal-overlay glass-backdrop" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
  <div class="modal-dialog checkout-dialog glass-elevated">
    <!-- Modal Header -->
    <div class="checkout-header">
      <div class="checkout-title-wrap">
        <span class="lock-icon">🔒</span>
        <h2 id="checkout-title" class="checkout-title">VelvetAura Secure Checkout</h2>
        <span class="security-badge">256-Bit Encrypted</span>
      </div>
      <button type="button" id="checkout-close-btn" class="modal-close-btn" aria-label="Cancel Checkout">✕</button>
    </div>

    <!-- Sandbox Disclaimer Banner -->
    <div class="sandbox-banner glass-card">
      <span class="sandbox-icon">🛡️</span>
      <div class="sandbox-text">
        <strong>Sandbox Testing Environment:</strong> No real currency will be charged. Use test credit cards below.
      </div>
    </div>

    <!-- Checkout Form -->
    <form id="checkout-form" class="checkout-form" novalidate>
      <div class="checkout-two-column">
        <!-- Column 1: Shipping Destination -->
        <fieldset class="checkout-fieldset glass-card">
          <legend class="fieldset-legend">1. Shipping Address</legend>
          
          <div class="form-group">
            <label for="shipping-name">Full Name *</label>
            <input type="text" id="shipping-name" class="glass-input" required placeholder="e.g. Camille Dupont" />
          </div>

          <div class="form-group">
            <label for="shipping-street">Street Address *</label>
            <input type="text" id="shipping-street" class="glass-input" required placeholder="e.g. 14 Rue de Rivoli" />
          </div>

          <div class="form-group">
            <label for="shipping-address2">Apartment / Suite (Optional)</label>
            <input type="text" id="shipping-address2" class="glass-input" placeholder="e.g. Apt 4B" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="shipping-city">City *</label>
              <input type="text" id="shipping-city" class="glass-input" required placeholder="e.g. Paris" />
            </div>
            <div class="form-group">
              <label for="shipping-state">State / Province *</label>
              <input type="text" id="shipping-state" class="glass-input" required placeholder="e.g. Ile-de-France" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="shipping-zip">Postal / ZIP Code *</label>
              <input type="text" id="shipping-zip" class="glass-input" required placeholder="e.g. 75001" />
            </div>
            <div class="form-group">
              <label for="shipping-country">Destination Country *</label>
              <select id="shipping-country" class="glass-select" required>
                <option value="France">France</option>
                <option value="South Korea">South Korea</option>
                <option value="Japan">Japan</option>
                <option value="Germany">Germany</option>
                <option value="United Kingdom">United Kingdom</option>
                <option value="USA" selected>USA</option>
                <option value="Sweden">Sweden</option>
                <option value="Italy">Italy</option>
              </select>
            </div>
          </div>
        </fieldset>

        <!-- Column 2: Payment Simulation -->
        <fieldset class="checkout-fieldset glass-card">
          <legend class="fieldset-legend">2. Payment Authorization</legend>

          <!-- Quick-Fill Sandbox Test Cards -->
          <div class="demo-card-actions">
            <button type="button" id="fill-approved-card-btn" class="btn-demo-pill success">
              ✨ Auto-fill Approved Card (Visa)
            </button>
            <button type="button" id="fill-declined-card-btn" class="btn-demo-pill danger">
              ❌ Auto-fill Declined Card
            </button>
          </div>

          <div class="form-group">
            <label for="card-holder">Cardholder Name *</label>
            <input type="text" id="card-holder" class="glass-input" required placeholder="Name on card" />
          </div>

          <div class="form-group">
            <label for="card-number">Card Number *</label>
            <div class="card-input-wrapper">
              <input 
                type="text" 
                id="card-number" 
                class="glass-input" 
                required 
                maxlength="19" 
                placeholder="4242 •••• •••• 4242" 
                autocomplete="cc-number"
              />
              <span id="card-brand-badge" class="card-brand-badge">💳</span>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label for="card-expiry">Expiration (MM/YY) *</label>
              <input 
                type="text" 
                id="card-expiry" 
                class="glass-input" 
                required 
                maxlength="5" 
                placeholder="12/28" 
                autocomplete="cc-exp"
              />
            </div>
            <div class="form-group">
              <label for="card-cvv">CVV / CVC *</label>
              <input 
                type="password" 
                id="card-cvv" 
                class="glass-input" 
                required 
                maxlength="4" 
                placeholder="123" 
                autocomplete="cc-csc"
              />
            </div>
          </div>

          <!-- Order Financial Summary Box -->
          <div class="checkout-summary-box glass-card">
            <div class="summary-line">
              <span>Items Total (<span id="checkout-item-count">0</span>)</span>
              <span id="checkout-subtotal">$0.00</span>
            </div>
            <div class="summary-line">
              <span>Estimated Tax (8%)</span>
              <span id="checkout-tax">$0.00</span>
            </div>
            <div class="summary-line">
              <span>Global Air Shipping</span>
              <span id="checkout-shipping">$0.00</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-line grand-total">
              <strong>Order Grand Total</strong>
              <strong id="checkout-grand-total">$0.00</strong>
            </div>
          </div>
        </fieldset>
      </div>

      <!-- Error Alert Container -->
      <div id="checkout-error-banner" class="checkout-error-banner hidden" role="alert"></div>

      <!-- Submission Actions -->
      <div class="checkout-actions">
        <button type="submit" id="submit-order-btn" class="btn-primary-gold btn-place-order">
          <span class="btn-text">🔒 Authorize & Place Order — <span id="btn-order-total">$0.00</span></span>
          <span class="btn-spinner hidden">Authorizing with Gateway...</span>
        </button>
      </div>
    </form>
  </div>
</div>
```

#### Event & Interaction Specifications
1. **Demo Card Autofill**:
   - Approved card click: Fills `Camille Dupont`, `4242424242424242`, `12/28`, `123`.
   - Declined card click: Fills `Declined Cardholder`, `4000000000000002`, `12/28`, `000`.
2. **Card Formatting & Brand Detection**:
   - On `input` of `#card-number`: Format with spaces every 4 digits; update `#card-brand-badge` (Visa, Mastercard, Amex, Discover).
3. **Form Submission Lifecycle**:
   - Validate required fields (address street, city, state, zip, country; cardholder, number, expiry, CVV).
   - If invalid: Show targeted error message in `#checkout-error-banner`.
   - If valid:
     - Disable `#submit-order-btn`.
     - Hide `.btn-text`, show `.btn-spinner`.
     - Dispatch `store.checkout({ shippingAddress, paymentDetails })`.
     - On backend failure (e.g. 402 Card Declined, 400 Insufficient Stock):
       - Enable button, restore text.
       - Display error in `#checkout-error-banner` with subtle shake animation.
     - On success:
       - Close checkout modal.
       - Clear form inputs.
       - Transition directly to `OrderConfirmationComponent`.
       - Empty active shopping cart.

---

### 3.6 Component 6: `OrderConfirmationComponent` (`public/js/components/orderConfirmation.js`)

#### Purpose & Responsibilities
Provides a celebratory, glass-styled order receipt:
- Celebratory checkmark with pulsating green/gold halo animation.
- Order identification:
  - Order Number (`#VA-XXXXXX` or MongoDB ID).
  - Mock Payment Transaction ID (`TXN-VA-${timestamp}-${suffix}`).
  - Placed timestamp.
- Verified shipping address snapshot.
- Line items table with thumbnails, titles, quantities, unit prices, and line totals.
- Financial totals: Subtotal, 8% Tax, Shipping, Grand Total.
- Actions:
  - "Continue Shopping" (navigates to `#/catalog`).
  - "View in Order History" (navigates to `#/account`).

#### Target DOM Mount Point
`<section id="order-confirmation-container" class="order-confirmation-wrapper container"></section>`

#### Detailed DOM Schema
```html
<section id="order-confirmation-view" class="confirmation-section">
  <div class="confirmation-card glass-card">
    <!-- Success Animation Header -->
    <div class="confirmation-header">
      <div class="check-animation-wrapper">
        <div class="check-circle-pulse">
          <span class="check-mark">✓</span>
        </div>
      </div>
      <h1 class="confirmation-title">Thank You For Your Luxury Order!</h1>
      <p class="confirmation-subtitle">
        Your imported beauty selections have been authorized and are being prepared for temperature-controlled air transit.
      </p>
    </div>

    <!-- Receipt Metadata Banner -->
    <div class="receipt-metadata-grid glass-card">
      <div class="meta-item">
        <span class="meta-label">Order Number</span>
        <span id="receipt-order-number" class="meta-value">#VA-984210</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Transaction ID</span>
        <span id="receipt-txn-id" class="meta-value">TXN-VA-1730723491-948102</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Date & Time</span>
        <span id="receipt-date" class="meta-value">Nov 4, 2026, 12:45 PM</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Payment Method</span>
        <span id="receipt-payment-method" class="meta-value">Visa ending in 4242</span>
      </div>
    </div>

    <!-- Two-Column Order Snapshot -->
    <div class="receipt-details-grid">
      <!-- Left: Line Items Summary -->
      <div class="receipt-items-column">
        <h3 class="section-title">Purchased Items</h3>
        <div id="receipt-items-list" class="receipt-items-list">
          <!-- Populated with item rows -->
        </div>
      </div>

      <!-- Right: Destination & Financial Summary -->
      <div class="receipt-summary-column">
        <!-- Shipping Address Snapshot -->
        <div class="shipping-snapshot-card glass-card">
          <h4 class="card-subtitle">Shipping Destination</h4>
          <p id="receipt-shipping-address" class="address-paragraph">
            <!-- Full Name, Street, City, State ZIP, Country -->
          </p>
        </div>

        <!-- Financial Summary -->
        <div class="receipt-financial-card glass-card">
          <h4 class="card-subtitle">Payment Summary</h4>
          <div class="summary-line">
            <span>Subtotal</span>
            <span id="receipt-subtotal">$0.00</span>
          </div>
          <div class="summary-line">
            <span>Estimated Tax (8%)</span>
            <span id="receipt-tax">$0.00</span>
          </div>
          <div class="summary-line">
            <span>Air Cargo Shipping</span>
            <span id="receipt-shipping">$0.00</span>
          </div>
          <div class="summary-divider"></div>
          <div class="summary-line grand-total">
            <strong>Total Paid</strong>
            <strong id="receipt-grand-total" class="total-highlight">$0.00</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- Receipt Action Buttons -->
    <div class="receipt-actions">
      <a href="#/catalog" class="btn-primary-gold">
        🛍️ Continue Shopping
      </a>
      <a href="#/account" class="btn-secondary-glass">
        📜 View in Order History
      </a>
    </div>
  </div>
</section>
```

---

### 3.7 Component 7: `AccountViewComponent` (`public/js/components/accountView.js`)

#### Purpose & Responsibilities
Provides customer self-service, order history tracking, and member status:
- Profile Header:
  - Customer avatar with initials.
  - Full Name, Email, and Join Date.
  - Member Tier Badge: *"Aura Luxe Member"*.
  - Sign Out button calling `store.logout()`.
- Order History Timeline:
  - Fetches and displays customer orders from `/api/orders/my-orders`.
  - Cards displaying:
    - Order Number (`#VA-XXXXXX`).
    - Date Placed.
    - Status badge (`Completed` in glowing emerald green).
    - Grand Total paid.
    - Expandable line items toggle ("View Items" / "Hide Items").
- Empty State: Encouraging message when 0 orders exist, with a direct CTA to explore the catalog.
- Guest Protection: If unauthenticated, displays prompt to Sign In / Register.

#### Target DOM Mount Point
`<section id="account-view-container" class="account-view-wrapper container"></section>`

#### State Subscriptions
- `auth`: Re-renders profile info or guest login prompt.
- `orders.list`: Re-renders orders timeline.

#### Detailed DOM Schema
```html
<section id="account-view" class="account-section">
  <!-- Profile Header Card -->
  <div class="profile-card glass-card">
    <div class="profile-avatar-wrap">
      <div id="account-avatar" class="profile-avatar">CD</div>
      <div class="tier-badge">Aura Luxe Member</div>
    </div>
    <div class="profile-info">
      <h1 id="account-user-name" class="profile-name">Camille Dupont</h1>
      <p id="account-user-email" class="profile-email">camille@velvetaura.test</p>
      <span id="account-member-since" class="profile-joined">Member since Nov 2026</span>
    </div>
    <div class="profile-actions">
      <button type="button" id="account-logout-btn" class="btn-secondary-glass">Sign Out</button>
    </div>
  </div>

  <!-- Order History Timeline Section -->
  <div class="order-history-section">
    <div class="section-header">
      <h2 class="section-title">Your Order History</h2>
      <span id="history-order-count" class="badge-count">1 Order</span>
    </div>

    <!-- Timeline Container -->
    <div id="orders-timeline" class="orders-timeline">
      <!-- Populated with Order History Cards or Empty State -->
    </div>
  </div>
</section>
```

#### Order Card Schema (`.order-history-card`)
```html
<div class="order-history-card glass-card" data-order-id="${order._id}">
  <div class="order-card-header">
    <div class="order-id-group">
      <span class="order-number">Order #${order.orderNumber || order._id.slice(-6).toUpperCase()}</span>
      <span class="order-date">${formatDate(order.createdAt)}</span>
    </div>
    <div class="order-status-group">
      <span class="status-pill status-completed">● Completed</span>
      <span class="order-card-total">${formatPrice(order.grandTotal)}</span>
    </div>
  </div>

  <!-- Expandable Items Toggle -->
  <div class="order-card-body">
    <button type="button" class="btn-toggle-items" data-order-id="${order._id}">
      <span>View Items (${order.items.length})</span> <span class="toggle-icon">▼</span>
    </button>

    <div class="order-items-collapsible hidden" id="order-items-${order._id}">
      <div class="items-table">
        ${order.items.map(item => `
          <div class="order-line-item">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" class="item-thumb" onerror="this.src='/assets/images/placeholder.webp';" />
            <div class="item-meta">
              <span class="item-name">${escapeHtml(item.name)}</span>
              <span class="item-qty-price">${item.quantity} × ${formatPrice(item.price)}</span>
            </div>
            <span class="item-total">${formatPrice(item.price * item.quantity)}</span>
          </div>
        `).join('')}
      </div>
      <div class="order-meta-footer">
        <span class="txn-meta">Transaction: <code>${escapeHtml(order.payment?.transactionId || 'N/A')}</code></span>
        <span class="dest-meta">Shipped to: ${escapeHtml(order.shippingAddress?.city || 'Registered Address')}, ${escapeHtml(order.shippingAddress?.country || '')}</span>
      </div>
    </div>
  </div>
</div>
```

---

### 3.8 Component 8: `AuthModalComponent` (`public/js/components/authModal.js`)

#### Purpose & Responsibilities
Provides a frictionless authentication dialog for Sign In and Account Creation:
- Tab switch between "Sign In" and "Create Account".
- Quick-fill button: *"✨ Fill Demo Customer"* for rapid manual and automated testing.
- Form validation (email formatting, password minimum 6 chars).
- Direct integration with `store.login()` and `store.register()`.
- Error feedback (invalid credentials, duplicate email).
- Closes and resumes the user's prior intent (e.g. proceeding with checkout or viewing orders).

#### Target DOM Mount Point
`<div id="auth-modal-container" class="modal-backdrop-wrapper"></div>`

#### Detailed DOM Schema
```html
<div id="auth-modal" class="modal-overlay glass-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
  <div class="modal-dialog auth-dialog glass-elevated">
    <!-- Close Button -->
    <button type="button" id="auth-close-btn" class="modal-close-btn" aria-label="Close Authentication Dialog">✕</button>

    <div class="auth-header">
      <h2 id="auth-modal-title" class="auth-title">Velvet<span class="text-gold">Aura</span> Luxe Club</h2>
      <p class="auth-subtitle">Sign in to manage your orders, bonded warehouse shipments, and wishlist.</p>
    </div>

    <!-- Tabs: Sign In vs Register -->
    <div class="auth-tabs glass-card">
      <button type="button" id="tab-login" class="auth-tab-btn active" data-tab="login">Sign In</button>
      <button type="button" id="tab-register" class="auth-tab-btn" data-tab="register">Create Account</button>
    </div>

    <!-- Quick-Fill Sandbox Customer Button -->
    <div class="auth-demo-action">
      <button type="button" id="btn-fill-demo-user" class="btn-demo-pill">
        ✨ Fill Demo Customer Credentials
      </button>
    </div>

    <!-- Sign In Form -->
    <form id="form-login" class="auth-form">
      <div class="form-group">
        <label for="login-email">Email Address</label>
        <input type="email" id="login-email" class="glass-input" required autocomplete="email" placeholder="customer@velvetaura.test" />
      </div>

      <div class="form-group">
        <label for="login-password">Password</label>
        <input type="password" id="login-password" class="glass-input" required autocomplete="current-password" placeholder="••••••••" />
      </div>

      <div id="login-error-alert" class="auth-error-alert hidden" role="alert"></div>

      <button type="submit" id="btn-submit-login" class="btn-primary-gold btn-block">
        <span class="btn-text">Sign In to VelvetAura</span>
        <span class="btn-spinner hidden">Authenticating...</span>
      </button>
    </form>

    <!-- Register Form -->
    <form id="form-register" class="auth-form hidden">
      <div class="form-group">
        <label for="reg-name">Full Name</label>
        <input type="text" id="reg-name" class="glass-input" required autocomplete="name" placeholder="Camille Dupont" />
      </div>

      <div class="form-group">
        <label for="reg-email">Email Address</label>
        <input type="email" id="reg-email" class="glass-input" required autocomplete="email" placeholder="camille@velvetaura.test" />
      </div>

      <div class="form-group">
        <label for="reg-password">Password (min. 6 characters)</label>
        <input type="password" id="reg-password" class="glass-input" required minlength="6" autocomplete="new-password" placeholder="••••••••" />
      </div>

      <div id="reg-error-alert" class="auth-error-alert hidden" role="alert"></div>

      <button type="submit" id="btn-submit-register" class="btn-primary-gold btn-block">
        <span class="btn-text">Create Luxury Account</span>
        <span class="btn-spinner hidden">Registering...</span>
      </button>
    </form>
  </div>
</div>
```

---

### 3.9 Component 9: `AppBoot & Router` (`public/js/app.js`)

#### Purpose & Responsibilities
The central orchestrator of the single-page application:
- Boots the client store (`store.init()`).
- Instantiates all 8 components into their assigned container mounting points.
- Coordinates client-side hash routing (`window.location.hash`):
  - `#/catalog` (default view): Shows Hero Banner & Catalog Grid.
  - `#/account`: Hides Hero/Catalog, loads and displays Customer Profile & Order History.
  - `#/order/:id`: Displays order confirmation receipt.
- Listens to global toast notifications emitted by the store (`store.state.ui.toasts`) and renders floating glass notification pills.
- Global keyboard navigation shortcuts (e.g. `Escape` dismisses any active drawer or modal).

#### Blueprint Implementation Structure
```javascript
import { store } from './store.js';
import { NavbarComponent } from './components/navbar.js';
import { CatalogComponent } from './components/catalog.js';
import { ProductDetailModalComponent } from './components/productDetail.js';
import { CartDrawerComponent } from './components/cartDrawer.js';
import { CheckoutModalComponent } from './components/checkoutModal.js';
import { OrderConfirmationComponent } from './components/orderConfirmation.js';
import { AccountViewComponent } from './components/accountView.js';
import { AuthModalComponent } from './components/authModal.js';

class App {
  constructor() {
    this.components = {};
  }

  async init() {
    console.log('[VelvetAura] Initializing SPA Client Application...');

    // 1. Initialize Global State Store (Auth token restoration, catalog fetch, cart sync)
    await store.init();

    // 2. Instantiate and mount UI components
    this.components.navbar = new NavbarComponent('#navbar-container');
    this.components.catalog = new CatalogComponent('#catalog-container');
    this.components.productModal = new ProductDetailModalComponent('#product-modal-container');
    this.components.cartDrawer = new CartDrawerComponent('#cart-drawer-container');
    this.components.checkoutModal = new CheckoutModalComponent('#checkout-modal-container');
    this.components.orderConfirmation = new OrderConfirmationComponent('#order-confirmation-container');
    this.components.accountView = new AccountViewComponent('#account-view-container');
    this.components.authModal = new AuthModalComponent('#auth-modal-container');

    // 3. Initialize all mounted components
    Object.values(this.components).forEach(comp => comp.init());

    // 4. Bind Global Routing & Hash Navigation
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();

    // 5. Global Keyboard Accessibility
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        store.closeCart();
        store.closeProductDetail();
        store.closeCheckout();
        store.closeAuthModal();
      }
    });

    console.log('[VelvetAura] SPA Client Application Ready.');
  }

  handleRouting() {
    const hash = window.location.hash || '#/catalog';
    const heroBanner = document.querySelector('#hero-banner');
    const catalogContainer = document.querySelector('#catalog-container');
    const accountContainer = document.querySelector('#account-view-container');
    const orderReceiptContainer = document.querySelector('#order-confirmation-container');

    if (hash.startsWith('#/account')) {
      if (heroBanner) heroBanner.classList.add('hidden');
      if (catalogContainer) catalogContainer.classList.add('hidden');
      if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
      if (accountContainer) {
        accountContainer.classList.remove('hidden');
        this.components.accountView.render();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hash.startsWith('#/order/')) {
      const orderId = hash.replace('#/order/', '');
      if (heroBanner) heroBanner.classList.add('hidden');
      if (catalogContainer) catalogContainer.classList.add('hidden');
      if (accountContainer) accountContainer.classList.add('hidden');
      if (orderReceiptContainer) {
        orderReceiptContainer.classList.remove('hidden');
        this.components.orderConfirmation.loadOrder(orderId);
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Default to Catalog
      if (heroBanner) heroBanner.classList.remove('hidden');
      if (catalogContainer) catalogContainer.classList.remove('hidden');
      if (accountContainer) accountContainer.classList.add('hidden');
      if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
```

---

## 4. End-to-End User Interaction Flows & State Synchronization Matrix

### Flow 1: Search & Multi-Faceted Catalog Exploration
```
User Types in Search Bar -> Debounce (300ms) -> store.setSearchQuery(q) -> api.getProducts({ q })
   │
   ├─► CatalogComponent receives updated catalog.products
   ├─► Product grid updates with 0-reload
   └─► Result count bar reflects matches (e.g. "Showing 3 items")
```

### Flow 2: Zero-Reload Cart Manipulation & Pulse Badge
```
User clicks "Add to Bag" on Product Card / Modal
   │
   ├─► Card button briefly shows "✓ Added!" (1.2s)
   ├─► store.addToCart(productId, qty)
   │     ├─► Optimistic local cart update
   │     ├─► Emits cart change event
   │     ├─► Navbar cart badge animates with .badge-pulse (scale 1.35x + gold glow)
   │     └─► api.addToCart() syncs to backend MongoDB
   └─► Drawer updates subtotal, exact 8% tax, and shipping status ($50 threshold)
```

### Flow 3: Slide-Over Cart Drawer & Stepper Clamping
```
User clicks Cart Bag icon in Navbar
   │
   ├─► Drawer slides from right edge (translateX: 100% -> 0)
   ├─► Free Shipping Meter calculates: min(100, (subtotal / 50) * 100)%
   ├─► Stepper [+] button disables when quantity == item.stock
   ├─► Decrement to 0 removes line item
   └─► Totals recalculate instantly
```

### Flow 4: Guided Checkout, Mock Payment & Order Receipt
```
User clicks "Proceed to Checkout" in Cart Drawer
   │
   ├─► If guest: Auth modal displayed with return callback
   ├─► If logged in: CheckoutModal opens with pre-filled address
   ├─► User clicks "✨ Auto-fill Approved Card (Visa)"
   │     └─► Fills 4242424242424242 / 12/28 / 123
   ├─► User clicks "Place Order"
   │     ├─► Button disables & shows spinner "Authorizing with Gateway..."
   │     ├─► POST /api/orders/checkout
   │     │     ├─► Backend decrements inventory atomically
   │     │     ├─► Generates TXN-VA-... mock transaction ID
   │     │     └─► Returns created Order document
   │     ├─► CheckoutModal closes
   │     ├─► Active Cart is cleared (items = [], badge = 0)
   │     └─► OrderConfirmationComponent renders animated checkmark receipt
```

---

## 5. Implementation Roadmap for M3 Implementers

| Component | Target File | Primary Dependencies | Key Focus Areas |
|---|---|---|---|
| Shared Base | `public/js/components/base.js` | None | BaseComponent lifecycle, escapeHtml, formatPrice, getOriginBadge |
| Navbar | `public/js/components/navbar.js` | `store.js` | Debounced search, category tabs, pulsing badge, auth dropdown |
| Catalog | `public/js/components/catalog.js` | `store.js`, `api.js` | Multi-filters, glass cards, origin pills, quick add-to-bag, empty state |
| Product Modal | `public/js/components/productDetail.js` | `store.js` | Specs table, provenance seal, stock-clamped stepper, instant checkout |
| Cart Drawer | `public/js/components/cartDrawer.js` | `store.js` | Slide-over animation, $50 free shipping progress bar, live line steppers |
| Checkout Modal | `public/js/components/checkoutModal.js` | `store.js`, `api.js` | Sandbox banner, 1-click test cards, double-submission lock |
| Order Receipt | `public/js/components/orderConfirmation.js` | `store.js` | Animated checkmark, #VA order ID, TXN ID, address & items snapshot |
| Account View | `public/js/components/accountView.js` | `store.js`, `api.js` | Profile card, collapsible order timeline, guest gate |
| Auth Modal | `public/js/components/authModal.js` | `store.js` | Tab switch, 1-click demo user credentials, workflow resumption |
| App & Router | `public/js/app.js` | All components, `store.js` | AppBoot, hash router (`#/catalog`, `#/account`, `#/order/:id`), ESC handling |

---

## 6. Synthesis & Quality Verification

1. **User Requirement R2 Full Alignment**:
   - Navigation bar with branding, debounced search, category navigation, pulsing cart badge, and auth dropdown.
   - Product catalog with glassmorphism product cards, imported origins, star ratings, and quick add-to-cart.
   - Rich product detail modal with full specifications, live stock indicators, and quantity stepper.
   - Interactive slide-over cart drawer with live subtotal, tax, and shipping calculation.
   - Complete checkout workflow with shipping capture, test card autofill, and receipt screen.
   - Customer account view with profile and order history timeline.
2. **Backend API Contract (M2 <-> M3) Fidelity**:
   - Matches all endpoint paths and JSON payload shapes from `PROJECT.md` and controllers.
   - Handles the exact 8% tax formula and $50.00 free shipping threshold ($5.99 below).
   - Simulates the exact mock payment behavior with `TXN-VA-...` transaction receipts.
3. **E2E Test Scenarios Compatibility**:
   - Guarantees seamless execution of Tier 3 interactions (full customer journey, multi-user isolation, inventory guards, cart persistence) and Tier 4 real-world luxury shopping scenarios.
