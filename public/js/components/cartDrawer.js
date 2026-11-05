/**
 * VelvetAura - Slide-Over Cart Drawer Component
 * Interactive glass drawer with line item steppers, live 8% tax, free shipping meter ($50 threshold).
 */

import { BaseComponent, formatPrice, escapeHtml } from './base.js';
import store from '../store.js';

export class CartDrawerComponent extends BaseComponent {
  constructor(containerSelector = '#cart-drawer-container', options = {}) {
    super(containerSelector, options);
  }

  init() {
    super.init();

    // Subscribe to cart updates
    this.unsubscribers.push(
      store.subscribe('cart', () => {
        this.render();
      })
    );
  }

  render() {
    if (!this.container) return;

    const cartState = store.getState('cart') || {};
    const {
      items = [],
      subtotal = 0,
      tax = 0,
      shipping = 0,
      grandTotal = 0,
      itemCount = 0,
      isOpen = false,
      freeShippingThreshold = 50.0,
      freeShippingRemaining = 50.0,
    } = cartState;

    const shippingPct = Math.min(100, Math.round((subtotal / freeShippingThreshold) * 100));
    const qualifiedForFreeShipping = subtotal >= freeShippingThreshold && subtotal > 0;
    const shippingText = qualifiedForFreeShipping
      ? '✨ You have qualified for Free Islandwide Shipping!'
      : `Add ${formatPrice(freeShippingRemaining)} more for Free Islandwide Shipping`;

    this.container.innerHTML = `
      <!-- Backdrop Overlay -->
      <div id="cart-drawer-backdrop" class="drawer-backdrop ${isOpen ? 'is-open' : ''}"></div>

      <!-- Slide-Over Drawer -->
      <div id="cart-drawer" class="cart-drawer ${isOpen ? 'is-open' : ''}" role="dialog" aria-modal="true" aria-label="Shopping Bag">
        <!-- Drawer Header -->
        <div class="cart-drawer-header">
          <div class="header-title-wrap">
            <span class="drawer-icon" aria-hidden="true">🛍️</span>
            <h2 class="drawer-title">Your Luxury Bag</h2>
            <span id="drawer-item-count" class="drawer-badge">(${itemCount} ${itemCount === 1 ? 'item' : 'items'})</span>
          </div>
          <button type="button" id="drawer-close-btn" class="drawer-close-btn" aria-label="Close Bag">✕</button>
        </div>

        <!-- Free Shipping Progress Meter -->
        <div class="free-shipping-banner" id="free-shipping-banner">
          <div class="shipping-meter-label">
            <span id="shipping-meter-text">${shippingText}</span>
          </div>
          <div class="shipping-progress-track">
            <div id="shipping-progress-fill" class="shipping-progress-fill" style="width: ${shippingPct}%;"></div>
          </div>
        </div>

        <!-- Scrollable Cart Line Items -->
        <div class="cart-items-container" id="cart-items-list" tabindex="0">
          ${
            items.length > 0
              ? items.map((item) => this.renderCartItemRow(item)).join('')
              : this.renderEmptyCart()
          }
        </div>

        <!-- Drawer Footer: Financial Breakdown & Checkout CTA -->
        ${
          items.length > 0
            ? `
          <div class="cart-drawer-footer" id="cart-drawer-footer">
            <div class="summary-card glass-card">
              <div class="summary-line">
                <span class="summary-label">Subtotal</span>
                <span id="cart-subtotal" class="summary-val">${formatPrice(subtotal)}</span>
              </div>
              <div class="summary-line">
                <span class="summary-label">Estimated Tax (8%)</span>
                <span id="cart-tax" class="summary-val">${formatPrice(tax)}</span>
              </div>
              <div class="summary-line">
                <span class="summary-label">Global Air Shipping</span>
                <span id="cart-shipping" class="summary-val">${shipping === 0 ? 'FREE' : formatPrice(shipping)}</span>
              </div>
              <div class="summary-divider"></div>
              <div class="summary-line grand-total-line">
                <span class="total-label">Grand Total</span>
                <span id="cart-grand-total" class="total-val">${formatPrice(grandTotal)}</span>
              </div>
            </div>

            <!-- Checkout Action Button -->
            <button type="button" id="cart-checkout-btn" class="btn-checkout-primary">
              <span>Proceed to Checkout</span>
              <span id="checkout-btn-total">${formatPrice(grandTotal)}</span>
            </button>
          </div>
        `
            : ''
        }
      </div>
    `;
  }

  renderCartItemRow(item) {
    const prodId = item.product?._id || item.product || item.productId || item._id;
    const name = item.product?.name || item.name || 'Luxury Product';
    const brand = item.product?.brand || item.brand || 'Import';
    const price = Number(item.price) || 0;
    const qty = Number(item.quantity) || 1;
    const stock = Number(item.product?.stock || item.stock) || 99;
    const imageSrc = item.image || item.product?.image || '/assets/images/placeholder.svg';
    const lineTotal = formatPrice(price * qty);

    return `
      <div class="cart-item-row glass-card" data-product-id="${prodId}">
        <img 
          src="${escapeHtml(imageSrc)}" 
          alt="${escapeHtml(name)}" 
          class="cart-item-thumb" 
          onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;"
        />
        <div class="cart-item-info">
          <span class="cart-item-brand">${escapeHtml(brand)}</span>
          <h4 class="cart-item-name" title="${escapeHtml(name)}">${escapeHtml(name)}</h4>
          <span class="cart-item-unit-price">${formatPrice(price)} each</span>
          
          <div class="cart-item-actions">
            <div class="cart-stepper glass-pill">
              <button 
                type="button" 
                class="btn-cart-qty-dec" 
                data-action="dec" 
                data-id="${prodId}" 
                data-qty="${qty}"
                aria-label="Decrease quantity"
              >−</button>
              <span class="cart-qty-display">${qty}</span>
              <button 
                type="button" 
                class="btn-cart-qty-inc ${qty >= stock ? 'disabled' : ''}" 
                data-action="inc" 
                data-id="${prodId}" 
                data-qty="${qty}"
                ${qty >= stock ? 'disabled' : ''}
                aria-label="Increase quantity"
              >+</button>
            </div>

            <span class="cart-item-subtotal">${lineTotal}</span>
            
            <button 
              type="button" 
              class="btn-remove-item" 
              data-action="remove" 
              data-id="${prodId}" 
              aria-label="Remove item"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  }

  renderEmptyCart() {
    return `
      <div class="empty-cart-state">
        <div class="empty-cart-icon">✨</div>
        <h3 style="font-size: 1.25rem; color: var(--text-high);">Your Luxury Bag is Empty</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 280px;">
          Explore authentic imported skincare, fragrances, and cosmetics from world beauty capitals.
        </p>
        <button type="button" id="btn-explore-catalog" class="btn-primary-gold" style="margin-top: var(--space-sm);">
          Explore Curated Imports
        </button>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Close button
      if (e.target.closest('#drawer-close-btn')) {
        store.closeCart();
        return;
      }

      // Backdrop click
      if (e.target.id === 'cart-drawer-backdrop') {
        store.closeCart();
        return;
      }

      // Explore Catalog button from empty cart
      if (e.target.closest('#btn-explore-catalog')) {
        store.closeCart();
        window.location.hash = '#/catalog';
        return;
      }

      // Stepper Decrement
      const decBtn = e.target.closest('[data-action="dec"]');
      if (decBtn) {
        const prodId = decBtn.dataset.id;
        const currentQty = parseInt(decBtn.dataset.qty, 10) || 1;
        if (currentQty <= 1) {
          store.removeCartItem(prodId);
        } else {
          store.updateQuantity(prodId, currentQty - 1);
        }
        return;
      }

      // Stepper Increment
      const incBtn = e.target.closest('[data-action="inc"]');
      if (incBtn) {
        const prodId = incBtn.dataset.id;
        const currentQty = parseInt(incBtn.dataset.qty, 10) || 1;
        store.updateQuantity(prodId, currentQty + 1);
        return;
      }

      // Remove item
      const removeBtn = e.target.closest('[data-action="remove"]');
      if (removeBtn) {
        const prodId = removeBtn.dataset.id;
        store.removeCartItem(prodId);
        return;
      }

      // Proceed to Checkout
      const checkoutBtn = e.target.closest('#cart-checkout-btn');
      if (checkoutBtn) {
        store.closeCart();
        const authState = store.getState('auth');
        if (authState.isAuthenticated) {
          store.openCheckout();
        } else {
          store.showToast('Please sign in or create an account to proceed to checkout', 'info');
          store.openAuthModal('login');
        }
        return;
      }
    });
  }
}

export default CartDrawerComponent;
