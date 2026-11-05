/**
 * VelvetAura - Navbar Component
 * Sticky glass navigation bar with search, category tabs, cart trigger, and auth dropdown.
 */

import { BaseComponent, escapeHtml } from './base.js';
import store from '../store.js';

export class NavbarComponent extends BaseComponent {
  constructor(containerSelector = '#navbar-container', options = {}) {
    super(containerSelector, options);
    this.userDropdownOpen = false;
  }

  init() {
    super.init();

    // Subscribe to cart changes
    this.unsubscribers.push(
      store.subscribe('cart', (cart) => {
        this.updateCartBadge(cart.itemCount);
      })
    );

    // Subscribe to auth changes
    this.unsubscribers.push(
      store.subscribe('auth', (auth) => {
        this.renderAuthSection(auth);
      })
    );

    // Subscribe to catalog changes
    this.unsubscribers.push(
      store.subscribe('catalog', (catalog) => {
        this.updateActiveCategoryTab(catalog.activeCategory);
        this.updateSearchInputValue(catalog.searchQuery);
      })
    );
  }

  render() {
    if (!this.container) return;

    const cartState = store.getState('cart') || {};
    const authState = store.getState('auth') || {};
    const catalogState = store.getState('catalog') || {};

    this.container.innerHTML = `
      <div class="navbar-inner">
        <!-- Brand Identity -->
        <a href="#/catalog" class="navbar-brand" id="nav-brand-logo" aria-label="VelvetAura Home">
          <span class="brand-title">Velvet<span class="text-gold">Aura</span></span>
          <span class="brand-subtitle">Luxe Importations</span>
        </a>

        <!-- Center Section: Search Bar & Category Navigation -->
        <div class="navbar-center">
          <div class="navbar-search-wrapper">
            <span class="search-icon" aria-hidden="true">🔍</span>
            <input 
              type="text" 
              id="navbar-search-input" 
              class="glass-input search-input" 
              placeholder="Search imported serums, fragrances, luxury makeup..." 
              value="${escapeHtml(catalogState.searchQuery || '')}"
              autocomplete="off"
              aria-label="Search Catalog"
            />
            <button 
              type="button" 
              id="search-clear-btn" 
              class="search-clear-btn ${catalogState.searchQuery ? '' : 'hidden'}" 
              aria-label="Clear Search"
            >✕</button>
          </div>

          <nav class="navbar-categories" aria-label="Product Categories">
            <button type="button" class="category-nav-btn ${(!catalogState.activeCategory || catalogState.activeCategory === 'all') ? 'active' : ''}" data-category="all">All</button>
            <button type="button" class="category-nav-btn ${catalogState.activeCategory === 'skincare' ? 'active' : ''}" data-category="skincare">Skincare</button>
            <button type="button" class="category-nav-btn ${catalogState.activeCategory === 'cosmetics' ? 'active' : ''}" data-category="cosmetics">Cosmetics</button>
            <button type="button" class="category-nav-btn ${catalogState.activeCategory === 'fragrances' ? 'active' : ''}" data-category="fragrances">Fragrances</button>
            <button type="button" class="category-nav-btn ${catalogState.activeCategory === 'haircare' ? 'active' : ''}" data-category="haircare">Haircare</button>
          </nav>
        </div>

        <!-- Right Controls: Cart Badge & Auth Indicator -->
        <div class="navbar-actions">
          <div id="nav-admin-link-container" class="nav-admin-link-container"></div>
          <button type="button" id="nav-cart-btn" class="nav-cart-btn" aria-label="Shopping Bag">
            <span class="cart-icon">🛍️</span>
            <span class="cart-label">Bag</span>
            <span id="cart-badge" class="cart-badge">${cartState.itemCount || 0}</span>
          </button>

          <div id="nav-auth-container" class="nav-auth-container"></div>
        </div>
      </div>
    `;

    this.renderAuthSection(authState);
  }

  renderAuthSection(authState) {
    const authContainer = this.container ? this.container.querySelector('#nav-auth-container') : null;
    const adminContainer = this.container ? this.container.querySelector('#nav-admin-link-container') : null;
    if (!authContainer) return;

    const isAdmin = Boolean(authState && authState.isAuthenticated && authState.user && authState.user.role === 'admin');

    if (adminContainer) {
      if (isAdmin) {
        adminContainer.innerHTML = `
          <a href="#/admin" class="nav-admin-btn" id="nav-admin-action-btn" title="Admin Dashboard">
            <span class="admin-icon">⚙️</span>
            <span class="admin-label">Admin</span>
          </a>
        `;
      } else {
        adminContainer.innerHTML = '';
      }
    }

    if (authState && authState.isAuthenticated && authState.user) {
      const name = authState.user.name || 'Member';
      const initials = name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

      authContainer.innerHTML = `
        <button type="button" id="user-avatar-btn" class="user-avatar-pill" aria-label="User Account Menu" aria-expanded="${this.userDropdownOpen}">
          <span>👤</span>
          <span class="avatar-text">${initials}</span>
          <span style="font-size: 0.65rem;">▼</span>
        </button>
        <div id="nav-user-dropdown" class="user-dropdown-menu glass-elevated ${this.userDropdownOpen ? '' : 'hidden'}">
          <div style="padding: 6px 12px; font-size: 0.75rem; color: var(--text-dim); border-bottom: 1px solid var(--glass-border-subtle); margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <span>Signed in as <strong style="color: var(--text-high);">${escapeHtml(name)}</strong></span>
            ${isAdmin ? `<span class="badge-role-admin" style="font-size: 0.65rem; background: rgba(224, 169, 109, 0.2); color: var(--accent-gold); border: 1px solid var(--accent-gold); padding: 1px 6px; border-radius: 4px; font-weight: 600;">ADMIN</span>` : ''}
          </div>
          ${isAdmin ? `<a href="#/admin" class="dropdown-item dropdown-item-admin" id="nav-admin-link" style="color: var(--accent-gold); font-weight: 600;">⚙️ Admin Dashboard</a>` : ''}
          <a href="#/account" class="dropdown-item" id="nav-my-account-link">My Account</a>
          <a href="#/account" class="dropdown-item" id="nav-order-history-link">Order History</a>
          <button type="button" id="nav-logout-btn" class="dropdown-item" style="color: var(--status-danger);">Sign Out</button>
        </div>
      `;
    } else {
      authContainer.innerHTML = `
        <button type="button" id="nav-login-btn" class="nav-auth-btn">
          Sign In
        </button>
      `;
    }
  }

  updateCartBadge(count) {
    const badge = this.container ? this.container.querySelector('#cart-badge') : document.getElementById('cart-badge');
    if (!badge) return;
    const currentCount = parseInt(badge.textContent, 10) || 0;
    const newCount = count || 0;
    badge.textContent = String(newCount);

    if (newCount !== currentCount) {
      badge.classList.remove('badge-pop', 'badge-pulse');
      void badge.offsetWidth;
      badge.classList.add('badge-pop');
      setTimeout(() => {
        badge.classList.remove('badge-pop', 'badge-pulse');
      }, 500);
    }
  }

  updateActiveCategoryTab(activeCategory = 'all') {
    if (!this.container) return;
    const tabs = this.container.querySelectorAll('.category-nav-btn');
    tabs.forEach((tab) => {
      const cat = tab.dataset.category;
      if (cat === activeCategory) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  updateSearchInputValue(query = '') {
    if (!this.container) return;
    const input = this.container.querySelector('#navbar-search-input');
    const clearBtn = this.container.querySelector('#search-clear-btn');
    if (input && input.value !== query) {
      input.value = query;
    }
    if (clearBtn) {
      if (query && query.length > 0) {
        clearBtn.classList.remove('hidden');
      } else {
        clearBtn.classList.add('hidden');
      }
    }
  }

  bindEvents() {
    if (!this.container) return;

    // Search input typing
    this.container.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'navbar-search-input') {
        const query = e.target.value;
        const clearBtn = this.container.querySelector('#search-clear-btn');
        if (clearBtn) {
          if (query.trim().length > 0) {
            clearBtn.classList.remove('hidden');
          } else {
            clearBtn.classList.add('hidden');
          }
        }
        store.setSearchQuery(query);
        if (window.location.hash !== '#/catalog' && window.location.hash !== '') {
          window.location.hash = '#/catalog';
        }
      }
    });

    // Clear search
    this.container.addEventListener('click', (e) => {
      const clearBtn = e.target.closest('#search-clear-btn');
      if (clearBtn) {
        const input = this.container.querySelector('#navbar-search-input');
        if (input) input.value = '';
        clearBtn.classList.add('hidden');
        store.setSearchQuery('');
      }

      // Category tabs click
      const catBtn = e.target.closest('.category-nav-btn');
      if (catBtn) {
        const cat = catBtn.dataset.category || 'all';
        store.setCategory(cat);
        if (window.location.hash !== '#/catalog' && window.location.hash !== '') {
          window.location.hash = '#/catalog';
        }
      }

      // Cart button click
      const cartBtn = e.target.closest('#nav-cart-btn');
      if (cartBtn) {
        store.openCart();
      }

      // Login button click
      const loginBtn = e.target.closest('#nav-login-btn');
      if (loginBtn) {
        store.openAuthModal('login');
      }

      // User avatar dropdown toggle
      const avatarBtn = e.target.closest('#user-avatar-btn');
      if (avatarBtn) {
        this.userDropdownOpen = !this.userDropdownOpen;
        const dropdown = this.container.querySelector('#nav-user-dropdown');
        if (dropdown) {
          dropdown.classList.toggle('hidden', !this.userDropdownOpen);
        }
      }

      // Logout button click
      const logoutBtn = e.target.closest('#nav-logout-btn');
      if (logoutBtn) {
        this.userDropdownOpen = false;
        store.logout();
      }

      // Dropdown menu links
      const accountLink = e.target.closest('#nav-my-account-link, #nav-order-history-link, #nav-admin-link');
      if (accountLink) {
        this.userDropdownOpen = false;
        const dropdown = this.container.querySelector('#nav-user-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
      }
    });

    // Click outside listener for user dropdown
    document.addEventListener('click', (e) => {
      if (!this.container) return;
      const authCont = this.container.querySelector('#nav-auth-container');
      if (authCont && !authCont.contains(e.target)) {
        if (this.userDropdownOpen) {
          this.userDropdownOpen = false;
          const dropdown = this.container.querySelector('#nav-user-dropdown');
          if (dropdown) dropdown.classList.add('hidden');
        }
      }
    });
  }
}

export default NavbarComponent;
