/**
 * VelvetAura - Catalog Component
 * Multi-faceted filtering toolbar, responsive grid, glassmorphism product cards, and quick add-to-bag.
 */

import { BaseComponent, formatPrice, escapeHtml, getOriginBadge } from './base.js';
import store from '../store.js';

export class CatalogComponent extends BaseComponent {
  constructor(containerSelector = '#catalog-container', options = {}) {
    super(containerSelector, options);
  }

  init() {
    super.init();

    // Subscribe to catalog state updates
    this.unsubscribers.push(
      store.subscribe('catalog', () => {
        this.render();
      })
    );
  }

  render() {
    if (!this.container) return;

    const catalogState = store.getState('catalog') || {};
    const {
      products = [],
      activeCategory = 'all',
      activeOrigin = 'all',
      priceRange = 'all',
      sort = 'featured',
      searchQuery = '',
      loading = false,
      total = 0,
    } = catalogState;

    // Build active filters summary
    const activeFilters = [];
    if (activeCategory && activeCategory !== 'all') {
      activeFilters.push({ label: `Category: ${activeCategory}`, type: 'category' });
    }
    if (activeOrigin && activeOrigin !== 'all') {
      activeFilters.push({ label: `Origin: ${activeOrigin}`, type: 'origin' });
    }
    if (priceRange && priceRange !== 'all') {
      const priceLabels = {
        '0-50': 'Under Rs. 50',
        '50-100': 'Rs. 50 – Rs. 100',
        '100-250': 'Rs. 100 – Rs. 250',
        '250-9999': 'Rs. 250+',
      };
      activeFilters.push({ label: `Price: ${priceLabels[priceRange] || priceRange}`, type: 'price' });
    }
    if (searchQuery && searchQuery.trim()) {
      activeFilters.push({ label: `Search: "${searchQuery}"`, type: 'search' });
    }

    const hasFilters = activeFilters.length > 0;
    const countDisplay = loading
      ? 'Curating luxury catalog...'
      : `Showing ${products.length} of ${total || products.length} luxury imports`;

    this.container.innerHTML = `
      <!-- Filter & Sort Control Toolbar -->
      <div class="catalog-toolbar glass-card">
        <div class="toolbar-row">
          <!-- Category Chips -->
          <div class="filter-group category-chips" id="catalog-category-chips">
            <button type="button" class="filter-chip ${activeCategory === 'all' ? 'active' : ''}" data-category="all">All Items</button>
            <button type="button" class="filter-chip ${activeCategory === 'skincare' ? 'active' : ''}" data-category="skincare">Skincare</button>
            <button type="button" class="filter-chip ${activeCategory === 'cosmetics' ? 'active' : ''}" data-category="cosmetics">Cosmetics</button>
            <button type="button" class="filter-chip ${activeCategory === 'fragrances' ? 'active' : ''}" data-category="fragrances">Fragrances</button>
            <button type="button" class="filter-chip ${activeCategory === 'haircare' ? 'active' : ''}" data-category="haircare">Haircare</button>
          </div>

          <!-- Secondary Filters & Sort Controls -->
          <div class="filter-controls-right">
            <!-- Origin Country Selector -->
            <div class="select-wrapper">
              <label for="catalog-origin-select" class="sr-only">Country of Origin</label>
              <select id="catalog-origin-select" class="glass-select" aria-label="Country of Origin">
                <option value="all" ${activeOrigin === 'all' ? 'selected' : ''}>🌍 All Global Capitals</option>
                <option value="France" ${activeOrigin === 'France' ? 'selected' : ''}>🇫🇷 France (Paris)</option>
                <option value="South Korea" ${activeOrigin === 'South Korea' ? 'selected' : ''}>🇰🇷 South Korea (Seoul)</option>
                <option value="Japan" ${activeOrigin === 'Japan' ? 'selected' : ''}>🇯🇵 Japan (Tokyo)</option>
                <option value="Germany" ${activeOrigin === 'Germany' ? 'selected' : ''}>🇩🇪 Germany (Munich)</option>
                <option value="United Kingdom" ${activeOrigin === 'United Kingdom' ? 'selected' : ''}>🇬🇧 United Kingdom (London)</option>
                <option value="USA" ${activeOrigin === 'USA' ? 'selected' : ''}>🇺🇸 USA (New York)</option>
                <option value="Sweden" ${activeOrigin === 'Sweden' ? 'selected' : ''}>🇸🇪 Sweden (Stockholm)</option>
                <option value="Italy" ${activeOrigin === 'Italy' ? 'selected' : ''}>🇮🇹 Italy (Milan)</option>
              </select>
            </div>

            <!-- Price Range Filter -->
            <div class="select-wrapper">
              <label for="catalog-price-select" class="sr-only">Price Range</label>
              <select id="catalog-price-select" class="glass-select" aria-label="Price Range">
                <option value="all" ${priceRange === 'all' ? 'selected' : ''}>All Prices</option>
                <option value="0-50" ${priceRange === '0-50' ? 'selected' : ''}>Under Rs. 50</option>
                <option value="50-100" ${priceRange === '50-100' ? 'selected' : ''}>Rs. 50 – Rs. 100</option>
                <option value="100-250" ${priceRange === '100-250' ? 'selected' : ''}>Rs. 100 – Rs. 250</option>
                <option value="250-9999" ${priceRange === '250-9999' ? 'selected' : ''}>Rs. 250+</option>
              </select>
            </div>

            <!-- Sort Dropdown -->
            <div class="select-wrapper">
              <label for="catalog-sort-select" class="sr-only">Sort By</label>
              <select id="catalog-sort-select" class="glass-select" aria-label="Sort By">
                <option value="featured" ${sort === 'featured' ? 'selected' : ''}>Featured Curations</option>
                <option value="price-asc" ${sort === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
                <option value="price-desc" ${sort === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
                <option value="rating" ${sort === 'rating' ? 'selected' : ''}>Top Customer Rated</option>
                <option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest Arrivals</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Active Filters Summary & Result Count -->
        <div class="catalog-status-bar">
          <span id="catalog-result-count" class="result-count">${countDisplay}</span>
          <div id="catalog-active-tags" class="active-tags-list">
            ${activeFilters
              .map(
                (f) =>
                  `<span class="glass-pill" style="font-size: 0.75rem;">${escapeHtml(f.label)}</span>`
              )
              .join('')}
          </div>
          ${
            hasFilters
              ? `<button type="button" id="catalog-reset-btn" class="btn-text-gold">Reset All Filters</button>`
              : ''
          }
        </div>
      </div>

      <!-- Products Grid -->
      <div id="product-grid" class="product-grid" role="region" aria-live="polite">
        ${
          loading
            ? this.renderSkeletons()
            : products.length > 0
            ? products.map((product) => this.renderProductCard(product)).join('')
            : this.renderEmptyState()
        }
      </div>
    `;
  }

  renderProductCard(product) {
    const prodId = product._id || product.id;
    const stock = Number(product.stock) || 0;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock <= 5;

    let stockStatusClass = 'in-stock';
    let stockStatusLabel = '✓ In Stock';
    if (isOutOfStock) {
      stockStatusClass = 'out-of-stock';
      stockStatusLabel = '✕ Sold Out';
    } else if (isLowStock) {
      stockStatusClass = 'low-stock';
      stockStatusLabel = `⚠ Only ${stock} left`;
    }

    const ratingVal = Number(product.rating) || 5.0;
    const numReviews = Number(product.numReviews) || 12;
    const imageSrc = product.image || (Array.isArray(product.images) && product.images[0]) || '/assets/images/placeholder.svg';

    return `
      <article class="product-card glass-card" data-product-id="${prodId}">
        <div class="product-media-wrapper" data-action="detail" data-product-id="${prodId}">
          <div class="product-badges-top">
            <span class="origin-pill glass-pill">${getOriginBadge(product.origin)}</span>
            <span class="stock-pill ${stockStatusClass}">${stockStatusLabel}</span>
          </div>
          <img 
            src="${escapeHtml(imageSrc)}" 
            alt="${escapeHtml(product.name)}" 
            class="product-image"
            loading="lazy"
            onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;"
          />
          <div class="quick-view-overlay" data-action="detail" data-product-id="${prodId}">
            <span class="quick-view-text">Quick View</span>
          </div>
        </div>

        <div class="product-body" data-action="detail" data-product-id="${prodId}">
          <span class="product-brand">${escapeHtml(product.brand || 'Import')}</span>
          <h3 class="product-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</h3>
          
          <div class="product-rating">
            <span class="stars" style="color: var(--accent-gold);">★★★★★</span>
            <span class="rating-val" style="font-weight: 600;">${ratingVal.toFixed(1)}</span>
            <span class="rating-count">(${numReviews})</span>
          </div>

          <div class="product-pricing">
            <span class="current-price">${formatPrice(product.price)}</span>
            ${product.originalPrice ? `<span class="original-price">${formatPrice(product.originalPrice)}</span>` : ''}
          </div>
        </div>

        <div class="product-actions">
          <button 
            type="button" 
            class="btn-add-to-bag ${isOutOfStock ? 'disabled' : ''}" 
            data-action="add-to-bag"
            data-product-id="${prodId}"
            ${isOutOfStock ? 'disabled aria-disabled="true"' : ''}
          >
            ${isOutOfStock ? '<span>Sold Out</span>' : '<span>🛍️ Add to Bag</span>'}
          </button>
        </div>
      </article>
    `;
  }

  renderSkeletons() {
    return Array.from({ length: 8 })
      .map(
        () => `
        <div class="glass-card skeleton" style="height: 380px; border-radius: var(--radius-lg);"></div>
      `
      )
      .join('');
  }

  renderEmptyState() {
    return `
      <div class="glass-card" style="grid-column: 1 / -1; padding: var(--space-3xl); text-align: center; border-radius: var(--radius-xl);">
        <div style="font-size: 3rem; margin-bottom: var(--space-md);">✨</div>
        <h3 style="font-size: 1.5rem; margin-bottom: var(--space-sm); color: var(--text-high);">No Imported Luxuries Match Your Filter</h3>
        <p style="color: var(--text-muted); max-width: 480px; margin: 0 auto var(--space-lg) auto;">
          Try broadening your category, origin, price range, or search keywords to discover our authentic worldwide collections.
        </p>
        <button type="button" id="catalog-empty-reset-btn" class="btn-primary-gold">
          Reset All Filters
        </button>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Category Chip Click
      const chip = e.target.closest('.filter-chip');
      if (chip) {
        const cat = chip.dataset.category || 'all';
        store.setCategory(cat);
        return;
      }

      // Reset Filters
      if (e.target.closest('#catalog-reset-btn') || e.target.closest('#catalog-empty-reset-btn')) {
        store.resetFilters();
        return;
      }

      // Add To Bag Button Click
      const addBtn = e.target.closest('[data-action="add-to-bag"]');
      if (addBtn) {
        e.stopPropagation();
        const prodId = addBtn.dataset.productId;
        const catalogState = store.getState('catalog') || {};
        const product = (catalogState.products || []).find((p) => (p._id || p.id) === prodId);

        if (product && product.stock > 0) {
          const originalContent = addBtn.innerHTML;
          addBtn.innerHTML = '<span style="color: var(--status-success);">✓ Added to Bag!</span>';
          addBtn.style.borderColor = 'var(--status-success)';

          store.addToCart(product, 1);

          setTimeout(() => {
            addBtn.innerHTML = originalContent;
            addBtn.style.borderColor = '';
          }, 1200);
        }
        return;
      }

      // Open Product Detail Modal
      const detailTarget = e.target.closest('[data-action="detail"]');
      if (detailTarget) {
        const prodId = detailTarget.dataset.productId;
        if (prodId) {
          store.openProductDetail(prodId);
        }
      }
    });

    // Origin Selector Change
    this.container.addEventListener('change', (e) => {
      if (e.target.id === 'catalog-origin-select') {
        store.setOrigin(e.target.value);
      } else if (e.target.id === 'catalog-price-select') {
        store.setPriceFilter(e.target.value);
      } else if (e.target.id === 'catalog-sort-select') {
        store.setSort(e.target.value);
      }
    });
  }
}

export default CatalogComponent;
