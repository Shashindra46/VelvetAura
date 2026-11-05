/**
 * VelvetAura - Client Application Entry Point & Router
 * Boots state store, mounts all UI components, handles hash navigation, and manages floating toasts.
 */

import store from './store.js';
import { NavbarComponent } from './components/navbar.js';
import { CatalogComponent } from './components/catalog.js';
import { ProductDetailModalComponent } from './components/productDetail.js';
import { CartDrawerComponent } from './components/cartDrawer.js';
import { CheckoutModalComponent } from './components/checkoutModal.js';
import { OrderConfirmationComponent } from './components/orderConfirmation.js';
import { AccountViewComponent } from './components/accountView.js';
import { AuthModalComponent } from './components/authModal.js';
import { AdminDashboardComponent } from './components/adminDashboard.js';
import { escapeHtml } from './components/base.js';

class VelvetAuraApp {
  constructor() {
    this.components = {};
  }

  async init() {
    console.log('[VelvetAura] Initializing SPA Client Application...');

    // 1. Instantiate and mount UI components into their container elements
    this.components.navbar = new NavbarComponent('#navbar-container');
    this.components.catalog = new CatalogComponent('#catalog-container');
    this.components.productModal = new ProductDetailModalComponent('#product-modal-container');
    this.components.cartDrawer = new CartDrawerComponent('#cart-drawer-container');
    this.components.checkoutModal = new CheckoutModalComponent('#checkout-modal-container');
    this.components.orderConfirmation = new OrderConfirmationComponent('#order-confirmation-container');
    this.components.accountView = new AccountViewComponent('#account-view-container');
    this.components.authModal = new AuthModalComponent('#auth-modal-container');
    this.components.adminDashboard = new AdminDashboardComponent('#admin-view-container');

    // 2. Initialize all mounted components
    Object.values(this.components).forEach((comp) => comp.init());

    // 3. Initialize Global Reactive State Store (restore tokens, fetch taxonomy & products, sync cart)
    await store.init();

    // 4. Setup Toast Notification Stack Renderer
    this.initToastRenderer();

    // 5. Bind Global Routing & Hash Navigation
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();

    // 6. Dynamic Auth State Observer (evict user from protected admin route on logout)
    store.subscribe('auth', (auth) => {
      if (window.location.hash.startsWith('#/admin')) {
        if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
          store.showToast('Access denied: Administrator privileges required', 'error');
          window.location.hash = '#/catalog';
        }
      }
    });

    // 7. Global Keyboard Accessibility
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
    const rawHash = window.location.hash || '#/catalog';
    const hash = rawHash.split('?')[0]; // strip query string

    const heroBanner = document.querySelector('#hero-banner');
    const catalogContainer = document.querySelector('#catalog-container');
    const accountContainer = document.querySelector('#account-view-container');
    const orderReceiptContainer = document.querySelector('#order-confirmation-container');
    const adminContainer = document.querySelector('#admin-view-container');

    if (hash.startsWith('#/admin')) {
      const auth = store.getState('auth');
      if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
        store.showToast('Access denied: Administrator privileges required', 'error');
        if (!auth.isAuthenticated) {
          store.openAuthModal('login');
        }
        window.location.hash = '#/catalog';
        return;
      }

      if (heroBanner) heroBanner.classList.add('hidden');
      if (catalogContainer) catalogContainer.classList.add('hidden');
      if (accountContainer) accountContainer.classList.add('hidden');
      if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
      if (adminContainer) {
        adminContainer.classList.remove('hidden');
        if (this.components.adminDashboard) {
          this.components.adminDashboard.loadData();
          this.components.adminDashboard.render();
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hash.startsWith('#/account')) {
      if (heroBanner) heroBanner.classList.add('hidden');
      if (catalogContainer) catalogContainer.classList.add('hidden');
      if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
      if (adminContainer) adminContainer.classList.add('hidden');
      if (accountContainer) {
        accountContainer.classList.remove('hidden');
        if (this.components.accountView) {
          this.components.accountView.render();
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hash.startsWith('#/order/')) {
      const orderId = hash.replace('#/order/', '');
      if (heroBanner) heroBanner.classList.add('hidden');
      if (catalogContainer) catalogContainer.classList.add('hidden');
      if (accountContainer) accountContainer.classList.add('hidden');
      if (adminContainer) adminContainer.classList.add('hidden');
      if (orderReceiptContainer) {
        orderReceiptContainer.classList.remove('hidden');
        if (this.components.orderConfirmation) {
          this.components.orderConfirmation.loadOrder(orderId);
        }
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Default to Catalog
      if (heroBanner) heroBanner.classList.remove('hidden');
      if (catalogContainer) catalogContainer.classList.remove('hidden');
      if (accountContainer) accountContainer.classList.add('hidden');
      if (orderReceiptContainer) orderReceiptContainer.classList.add('hidden');
      if (adminContainer) adminContainer.classList.add('hidden');
    }
  }

  initToastRenderer() {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    store.subscribe('ui', (ui) => {
      const toasts = ui.toasts || [];
      toastContainer.innerHTML = toasts
        .map((t) => {
          let icon = 'ℹ️';
          if (t.type === 'success') icon = '✓';
          else if (t.type === 'error') icon = '✕';
          else if (t.type === 'warning') icon = '⚠';

          return `
            <div class="glass-toast toast-${t.type}" data-toast-id="${t.id}" role="alert">
              <span style="font-size: 1.1rem; line-height: 1;">${icon}</span>
              <span style="flex: 1;">${escapeHtml(t.message)}</span>
              <span style="opacity: 0.6; font-size: 0.8rem; cursor: pointer;">✕</span>
            </div>
          `;
        })
        .join('');
    });

    toastContainer.addEventListener('click', (e) => {
      const toastEl = e.target.closest('.glass-toast');
      if (toastEl) {
        const id = toastEl.dataset.toastId;
        store.removeToast(id);
      }
    });
  }
}

// Auto-bootstrap when DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
  const app = new VelvetAuraApp();
  app.init();
});
