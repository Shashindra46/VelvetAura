/**
 * VelvetAura - Product Detail Modal Component
 * Detailed luxury inspection modal with specifications table, inventory status, and clamped quantity stepper.
 */

import { BaseComponent, formatPrice, escapeHtml, getOriginBadge } from './base.js';
import store from '../store.js';

export class ProductDetailModalComponent extends BaseComponent {
  constructor(containerSelector = '#product-modal-container', options = {}) {
    super(containerSelector, options);
  }

  init() {
    super.init();

    // Subscribe to active product changes
    this.unsubscribers.push(
      store.subscribe('activeProduct', () => {
        this.render();
      })
    );
  }

  render() {
    if (!this.container) return;

    const activeState = store.getState('activeProduct') || {};
    const { product, isOpen = false, quantity = 1, loading = false } = activeState;

    if (!isOpen || !product) {
      this.container.innerHTML = '';
      return;
    }

    const prodId = product._id || product.id;
    const stock = Number(product.stock) || 0;
    const isOutOfStock = stock <= 0;
    const isLowStock = stock > 0 && stock <= 5;

    let stockStatusHtml = `
      <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--status-success);">
        <span style="font-size: 1rem;">●</span>
        <span>In Stock (${stock} units available in bonded warehouse)</span>
      </div>
    `;

    if (isOutOfStock) {
      stockStatusHtml = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--status-danger);">
          <span style="font-size: 1rem;">✕</span>
          <span>Out of Stock in our bonded facilities</span>
        </div>
      `;
    } else if (isLowStock) {
      stockStatusHtml = `
        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--status-warning);">
          <span style="font-size: 1rem;">⚠</span>
          <span>Low Stock: Only ${stock} items remaining</span>
        </div>
      `;
    }

    const imageSrc = product.image || (Array.isArray(product.images) && product.images[0]) || '/assets/images/placeholder.svg';
    const ratingVal = Number(product.rating) || 5.0;
    const numReviews = Number(product.numReviews) || 12;
    const totalPrice = formatPrice((Number(product.price) || 0) * quantity);

    const specs = product.specs || {};
    const volume = specs.volume || product.volume || 'Standard Luxury Size';
    const skinType = specs.skinType || specs.hairType || specs.scentFamily || 'All Types';
    const formulation = specs.formulation || product.subcategory || 'Artisanal Formulation';
    const keyBenefit = specs.keyBenefit || specs.notes || 'Deep luxury nourishment';
    const ingredients = specs.ingredients || '';

    this.container.innerHTML = `
      <div id="product-detail-modal" class="modal-overlay glass-backdrop is-open" role="dialog" aria-modal="true" aria-labelledby="modal-product-title">
        <div class="modal-dialog glass-elevated">
          <button type="button" id="modal-close-btn" class="modal-close-btn" aria-label="Close Product Details">✕</button>

          <div class="modal-content-grid">
            <!-- Left Column: Media Showcase -->
            <div class="modal-media-column">
              <div class="modal-image-frame glass-card">
                <img 
                  id="modal-product-image" 
                  src="${escapeHtml(imageSrc)}" 
                  alt="${escapeHtml(product.name)}" 
                  class="modal-hero-image"
                  onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;"
                />
              </div>
              <div class="authenticity-seal">
                <span class="seal-icon">🛡️</span>
                <span class="seal-text">Directly Imported from ${escapeHtml(product.origin || 'Europe/Asia')} · 100% Authentic Certified</span>
              </div>
            </div>

            <!-- Right Column: Details & Purchasing -->
            <div class="modal-details-column">
              <div class="modal-header">
                <span class="glass-pill" style="margin-bottom: 6px;">${getOriginBadge(product.origin)}</span>
                <div class="modal-brand">${escapeHtml(product.brand || 'Luxury Import')}</div>
                <h2 id="modal-product-title" class="modal-title">${escapeHtml(product.name)}</h2>

                <div class="modal-rating">
                  <span class="stars">★★★★★</span>
                  <span class="rating-val">${ratingVal.toFixed(1)}</span>
                  <span style="color: var(--text-dim); font-size: 0.8rem;">(${numReviews} verified reviews)</span>
                </div>

                <div class="modal-price-row">
                  <span class="modal-price">${formatPrice(product.price)}</span>
                  ${product.originalPrice ? `<span class="original-price">${formatPrice(product.originalPrice)}</span>` : ''}
                  <span class="tax-duty-note">Import duties &amp; global taxes calculated</span>
                </div>
              </div>

              <!-- Stock Status -->
              <div class="modal-stock-status">
                ${stockStatusHtml}
              </div>

              <p class="modal-description">${escapeHtml(product.description || '')}</p>

              <!-- Purchasing Stepper & Actions -->
              ${
                !isOutOfStock
                  ? `
                <div class="modal-purchase-controls">
                  <div class="quantity-stepper-wrapper">
                    <label for="modal-qty-input" class="qty-label">Quantity:</label>
                    <div class="quantity-stepper glass-card">
                      <button type="button" id="modal-qty-dec" class="stepper-btn" ${quantity <= 1 ? 'disabled' : ''} aria-label="Decrease quantity">−</button>
                      <input 
                        type="number" 
                        id="modal-qty-input" 
                        class="stepper-input" 
                        value="${quantity}" 
                        min="1" 
                        max="${stock}" 
                        readonly
                      />
                      <button type="button" id="modal-qty-inc" class="stepper-btn" ${quantity >= stock ? 'disabled' : ''} aria-label="Increase quantity">+</button>
                    </div>
                  </div>

                  <div class="modal-action-buttons">
                    <button type="button" id="modal-add-bag-btn" class="btn-primary-gold" data-product-id="${prodId}">
                      <span>🛍️ Add to Bag — <span id="modal-total-price">${totalPrice}</span></span>
                    </button>
                    <button type="button" id="modal-buy-now-btn" class="btn-secondary-glass" data-product-id="${prodId}">
                      ⚡ Instant Checkout
                    </button>
                  </div>
                </div>
              `
                  : `
                <div class="glass-card" style="padding: var(--space-md); border-color: var(--status-danger-border); color: var(--status-danger);">
                  This luxury imported selection is currently sold out in our bonded facilities. Check back for upcoming cargo shipments.
                </div>
              `
              }

              <!-- Product Specifications Table -->
              <div class="modal-specs-section">
                <h4 class="specs-heading">Specifications &amp; Provenance</h4>
                <table class="specs-table">
                  <tbody>
                    <tr><th>Volume / Size</th><td>${escapeHtml(volume)}</td></tr>
                    <tr><th>Skin / Scent Profile</th><td>${escapeHtml(skinType)}</td></tr>
                    <tr><th>Formulation</th><td>${escapeHtml(formulation)}</td></tr>
                    <tr><th>Key Benefits</th><td>${escapeHtml(keyBenefit)}</td></tr>
                    ${ingredients ? `<tr><th>Active Ingredients</th><td>${escapeHtml(ingredients)}</td></tr>` : ''}
                    <tr><th>Country of Origin</th><td>${escapeHtml(product.origin || 'Imported')}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Close button
      if (e.target.closest('#modal-close-btn')) {
        store.closeProductDetail();
        return;
      }

      // Backdrop overlay click
      if (e.target.classList.contains('modal-overlay')) {
        store.closeProductDetail();
        return;
      }

      // Quantity Decrement
      if (e.target.closest('#modal-qty-dec')) {
        const activeState = store.getState('activeProduct');
        const currentQty = activeState.quantity || 1;
        if (currentQty > 1) {
          store.setDetailQuantity(currentQty - 1);
        }
        return;
      }

      // Quantity Increment
      if (e.target.closest('#modal-qty-inc')) {
        const activeState = store.getState('activeProduct');
        const currentQty = activeState.quantity || 1;
        const maxStock = activeState.product?.stock || 99;
        if (currentQty < maxStock) {
          store.setDetailQuantity(currentQty + 1);
        }
        return;
      }

      // Add to Bag Button
      const addBtn = e.target.closest('#modal-add-bag-btn');
      if (addBtn) {
        const activeState = store.getState('activeProduct');
        if (activeState.product) {
          store.addToCart(activeState.product, activeState.quantity || 1);
          store.closeProductDetail();
          store.openCart();
        }
        return;
      }

      // Instant Checkout Button
      const buyNowBtn = e.target.closest('#modal-buy-now-btn');
      if (buyNowBtn) {
        const activeState = store.getState('activeProduct');
        if (activeState.product) {
          store.addToCart(activeState.product, activeState.quantity || 1);
          store.closeProductDetail();
          if (store.getState('auth').isAuthenticated) {
            store.openCheckout();
          } else {
            store.openAuthModal('login');
          }
        }
        return;
      }
    });
  }
}

export default ProductDetailModalComponent;
