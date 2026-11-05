/**
 * VelvetAura - Admin Dashboard Component
 * 
 * Luxury dark-mode glassmorphic administrative interface.
 * Implements:
 * - Product Management CRUD (KPIs, table, add/edit modal, delete modal)
 * - Order Oversight & Fulfillment Management (KPIs, orders table, live status selector)
 */

import { BaseComponent, formatPrice, escapeHtml, formatDate, getOriginBadge, formatPaymentMethod, formatPaymentStatus } from './base.js';
import store from '../store.js';

export class AdminDashboardComponent extends BaseComponent {
  constructor(containerSelector = '#admin-view-container', options = {}) {
    super(containerSelector, options);
    this.modalMode = null; // null | 'add' | 'edit' | 'delete'
    this.activeProduct = null;
    this.productSearchFilter = '';
    this.productCategoryFilter = 'all';
    this.orderStatusFilter = 'all';
    this.currentPreviewBlobUrl = null;
    this.isUploadingImage = false;
  }

  init() {
    super.init();

    // Subscribe to store slices
    this.unsubscribers.push(
      store.subscribe('admin', () => {
        this.render();
      })
    );

    this.unsubscribers.push(
      store.subscribe('catalog', () => {
        this.render();
      })
    );

    this.unsubscribers.push(
      store.subscribe('auth', (auth) => {
        if (!auth.isAuthenticated || auth.user?.role !== 'admin') {
          // Handled by app.js router guard, but ensure clean render
          this.render();
        }
      })
    );
  }

  async loadData() {
    try {
      await Promise.all([
        store.fetchAdminOrders(),
        store.fetchProducts({ limit: 100 }),
      ]);
    } catch (err) {
      console.error('[AdminDashboard] Failed to load data:', err);
    }
  }

  render() {
    if (!this.container) return;

    const authState = store.getState('auth') || {};
    if (!authState.isAuthenticated || authState.user?.role !== 'admin') {
      this.container.innerHTML = `
        <div class="admin-denied-wrapper glass-card">
          <div style="font-size: 3rem; margin-bottom: 12px;">🔒</div>
          <h2 style="color: var(--text-high); font-family: var(--font-serif); margin-bottom: 8px;">Administrator Access Required</h2>
          <p style="color: var(--text-muted); margin-bottom: 20px;">You must be authenticated with an administrator account to access this studio.</p>
          <a href="#/catalog" class="btn-primary-gold" style="text-decoration: none; display: inline-block;">Return to Catalog</a>
        </div>
      `;
      return;
    }

    const adminState = store.getState('admin') || { activeTab: 'products', orders: [] };
    const catalogState = store.getState('catalog') || { products: [] };
    const activeTab = adminState.activeTab || 'products';

    const products = catalogState.products || [];
    const orders = adminState.orders || [];

    this.container.innerHTML = `
      <div class="admin-dashboard-container">
        <!-- Header & Studio Title -->
        <header class="admin-studio-header glass-card">
          <div class="admin-header-main">
            <div class="admin-brand-tag">
              <span class="badge-role-admin">🔒 ADMINISTRATOR PORTAL</span>
              <span class="admin-session-user">Signed in as <strong>${escapeHtml(authState.user.name || 'Admin')}</strong></span>
            </div>
            <h1 class="admin-title">Haute Management <span class="text-gold-gradient">Studio</span></h1>
            <p class="admin-subtitle">Real-time inventory management, catalog curation, and international client fulfillment oversight.</p>
          </div>
          <div class="admin-header-actions">
            <button type="button" id="admin-refresh-btn" class="btn-secondary-glass" title="Refresh Live Data">
              <span>🔄</span> Refresh Data
            </button>
          </div>
        </header>

        <!-- Navigation Tabs -->
        <div class="admin-nav-tabs glass-elevated">
          <button type="button" class="admin-tab-btn ${activeTab === 'products' ? 'active' : ''}" data-tab="products">
            <span class="tab-icon">📦</span>
            <span class="tab-label">Product Catalog</span>
            <span class="tab-count-badge">${products.length}</span>
          </button>
          <button type="button" class="admin-tab-btn ${activeTab === 'orders' ? 'active' : ''}" data-tab="orders">
            <span class="tab-icon">📜</span>
            <span class="tab-label">Order Oversight & Fulfillment</span>
            <span class="tab-count-badge">${orders.length}</span>
          </button>
        </div>

        <!-- Tab Body Content -->
        <div class="admin-tab-content">
          ${activeTab === 'products' ? this.renderProductsTab(products) : this.renderOrdersTab(orders)}
        </div>

        <!-- Modal Overlay Portal (Add / Edit / Delete) -->
        ${this.renderModal(catalogState)}
      </div>
    `;
  }

  /* =========================================================================
     TAB 1: PRODUCT MANAGEMENT
     ========================================================================= */

  renderProductsTab(products) {
    const totalCount = products.length;
    const lowStockCount = products.filter((p) => p.stock > 0 && p.stock < 10).length;
    const outOfStockCount = products.filter((p) => p.stock <= 0).length;
    const totalUnits = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);

    // Apply client filters
    let filteredProducts = [...products];
    if (this.productCategoryFilter && this.productCategoryFilter !== 'all') {
      filteredProducts = filteredProducts.filter((p) => (p.category || '').toLowerCase() === this.productCategoryFilter.toLowerCase());
    }
    if (this.productSearchFilter && this.productSearchFilter.trim()) {
      const q = this.productSearchFilter.trim().toLowerCase();
      filteredProducts = filteredProducts.filter((p) => 
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.origin || '').toLowerCase().includes(q)
      );
    }

    return `
      <!-- Product KPIs -->
      <div class="admin-kpi-grid">
        <div class="admin-kpi-card glass-card">
          <div class="kpi-icon">💎</div>
          <div class="kpi-info">
            <span class="kpi-label">Total Catalog Products</span>
            <span class="kpi-value">${totalCount}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card">
          <div class="kpi-icon">📦</div>
          <div class="kpi-info">
            <span class="kpi-label">Total Units in Vault</span>
            <span class="kpi-value">${totalUnits}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card ${lowStockCount > 0 ? 'kpi-warning' : ''}">
          <div class="kpi-icon">⚠️</div>
          <div class="kpi-info">
            <span class="kpi-label">Low Stock (&lt; 10 units)</span>
            <span class="kpi-value">${lowStockCount}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card ${outOfStockCount > 0 ? 'kpi-danger' : ''}">
          <div class="kpi-icon">🚫</div>
          <div class="kpi-info">
            <span class="kpi-label">Depleted / Out of Stock</span>
            <span class="kpi-value">${outOfStockCount}</span>
          </div>
        </div>
      </div>

      <!-- Controls Toolbar -->
      <div class="admin-toolbar glass-card">
        <div class="admin-toolbar-left">
          <div class="admin-search-wrap">
            <span class="admin-search-icon">🔍</span>
            <input type="text" id="admin-product-search-input" class="admin-search-input" placeholder="Search by name, brand, origin..." value="${escapeHtml(this.productSearchFilter)}" />
            ${this.productSearchFilter ? `<button type="button" id="admin-product-search-clear" class="admin-clear-btn">✕</button>` : ''}
          </div>
          <select id="admin-product-cat-select" class="admin-select">
            <option value="all" ${this.productCategoryFilter === 'all' ? 'selected' : ''}>All Categories</option>
            <option value="skincare" ${this.productCategoryFilter === 'skincare' ? 'selected' : ''}>Skincare</option>
            <option value="cosmetics" ${this.productCategoryFilter === 'cosmetics' ? 'selected' : ''}>Cosmetics</option>
            <option value="fragrances" ${this.productCategoryFilter === 'fragrances' ? 'selected' : ''}>Fragrances</option>
            <option value="haircare" ${this.productCategoryFilter === 'haircare' ? 'selected' : ''}>Haircare</option>
          </select>
        </div>
        <div class="admin-toolbar-right">
          <button type="button" id="btn-admin-add-product" class="btn-primary-gold">
            <span>✨</span> Add New Product
          </button>
        </div>
      </div>

      <!-- Products Data Table -->
      <div class="admin-table-container glass-card">
        <table class="admin-table" aria-label="Product Catalog Inventory">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>Import Origin</th>
              <th>Price</th>
              <th>Stock Status</th>
              <th style="text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredProducts.length === 0 ? `
              <tr>
                <td colspan="6" class="admin-table-empty">
                  <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                    <p>No products match your current filters.</p>
                  </div>
                </td>
              </tr>
            ` : filteredProducts.map((p) => this.renderProductRow(p)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderProductRow(p) {
    const stock = Number(p.stock) || 0;
    let stockBadge = `<span class="stock-badge in-stock">${stock} in vault</span>`;
    if (stock <= 0) {
      stockBadge = `<span class="stock-badge out-stock">Depleted (0)</span>`;
    } else if (stock < 10) {
      stockBadge = `<span class="stock-badge low-stock">Low Stock (${stock})</span>`;
    }

    const imgUrl = (p.images && p.images[0]) || p.image || 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=300&q=80';

    return `
      <tr class="admin-row" data-product-id="${p._id}">
        <td class="admin-col-product">
          <div class="product-cell">
            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(p.name)}" class="product-thumbnail" loading="lazy" />
            <div class="product-cell-meta">
              <span class="product-cell-name">${escapeHtml(p.name)}</span>
              <span class="product-cell-brand">${escapeHtml(p.brand)}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="admin-category-pill category-${p.category}">${escapeHtml(p.category)}</span>
        </td>
        <td>
          <span class="admin-origin-text">${getOriginBadge(p.origin)}</span>
        </td>
        <td class="admin-price-cell">
          <strong>${formatPrice(p.price)}</strong>
        </td>
        <td>
          ${stockBadge}
        </td>
        <td class="admin-actions-cell" style="text-align: right;">
          <button type="button" class="btn-admin-action btn-edit-product" data-product-id="${p._id}" title="Edit Product">
            ✏️ Edit
          </button>
          <button type="button" class="btn-admin-action btn-delete-product" data-product-id="${p._id}" title="Delete Product">
            🗑️ Delete
          </button>
        </td>
      </tr>
    `;
  }

  /* =========================================================================
     TAB 2: ORDER OVERSIGHT
     ========================================================================= */

  renderOrdersTab(orders) {
    const totalOrders = orders.length;
    const grossRevenue = orders.reduce((sum, o) => sum + (Number(o.pricing?.grandTotal || o.grandTotal) || 0), 0);
    const pendingCount = orders.filter((o) => ['pending', 'processing', 'confirmed'].includes(o.status)).length;
    const completedCount = orders.filter((o) => ['completed', 'shipped', 'delivered'].includes(o.status)).length;

    let filteredOrders = [...orders];
    if (this.orderStatusFilter && this.orderStatusFilter !== 'all') {
      filteredOrders = filteredOrders.filter((o) => (o.status || '').toLowerCase() === this.orderStatusFilter.toLowerCase());
    }

    return `
      <!-- Order KPIs -->
      <div class="admin-kpi-grid">
        <div class="admin-kpi-card glass-card">
          <div class="kpi-icon">📜</div>
          <div class="kpi-info">
            <span class="kpi-label">Total Customer Orders</span>
            <span class="kpi-value">${totalOrders}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card">
          <div class="kpi-icon">💰</div>
          <div class="kpi-info">
            <span class="kpi-label">Gross Processed Revenue</span>
            <span class="kpi-value">${formatPrice(grossRevenue)}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card ${pendingCount > 0 ? 'kpi-warning' : ''}">
          <div class="kpi-icon">⏳</div>
          <div class="kpi-info">
            <span class="kpi-label">Pending / Processing</span>
            <span class="kpi-value">${pendingCount}</span>
          </div>
        </div>
        <div class="admin-kpi-card glass-card">
          <div class="kpi-icon">✈️</div>
          <div class="kpi-info">
            <span class="kpi-label">Completed / Dispatched</span>
            <span class="kpi-value">${completedCount}</span>
          </div>
        </div>
      </div>

      <!-- Order Controls Toolbar -->
      <div class="admin-toolbar glass-card">
        <div class="admin-toolbar-left">
          <span style="font-size: 0.9rem; color: var(--text-dim); margin-right: 8px;">Filter by Status:</span>
          <select id="admin-order-status-select" class="admin-select">
            <option value="all" ${this.orderStatusFilter === 'all' ? 'selected' : ''}>All Statuses (${orders.length})</option>
            <option value="pending" ${this.orderStatusFilter === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="confirmed" ${this.orderStatusFilter === 'confirmed' ? 'selected' : ''}>Confirmed</option>
            <option value="processing" ${this.orderStatusFilter === 'processing' ? 'selected' : ''}>Processing</option>
            <option value="completed" ${this.orderStatusFilter === 'completed' ? 'selected' : ''}>Completed</option>
            <option value="shipped" ${this.orderStatusFilter === 'shipped' ? 'selected' : ''}>Shipped</option>
            <option value="delivered" ${this.orderStatusFilter === 'delivered' ? 'selected' : ''}>Delivered</option>
            <option value="cancelled" ${this.orderStatusFilter === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
        </div>
        <div class="admin-toolbar-right">
          <span style="font-size: 0.85rem; color: var(--text-muted);">
            Showing ${filteredOrders.length} of ${orders.length} orders
          </span>
        </div>
      </div>

      <!-- Orders Data Table -->
      <div class="admin-table-container glass-card">
        <table class="admin-table" aria-label="Customer Orders Oversight">
          <thead>
            <tr>
              <th>Order #</th>
              <th>Placed Date</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Grand Total</th>
              <th>Payment</th>
              <th>Fulfillment Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredOrders.length === 0 ? `
              <tr>
                <td colspan="7" class="admin-table-empty">
                  <div style="padding: 40px; text-align: center; color: var(--text-muted);">
                    <div style="font-size: 2rem; margin-bottom: 8px;">📜</div>
                    <p>No customer orders match the selected filter.</p>
                  </div>
                </td>
              </tr>
            ` : filteredOrders.map((o) => this.renderOrderRow(o)).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderOrderRow(order) {
    const orderNumber = order.orderNumber || `VA-${(order._id || '').slice(-6).toUpperCase()}`;
    const dateFormatted = formatDate(order.createdAt);
    const customerName = order.user?.name || order.shippingAddress?.fullName || 'Client';
    const customerEmail = order.user?.email || 'N/A';
    const grandTotal = Number(order.pricing?.grandTotal || order.grandTotal) || 0;
    const paymentMethod = order.paymentMethod || order.payment?.method || 'cod';
    const paymentStatus = order.paymentStatus || order.payment?.status || 'pending';

    const itemsSummary = (order.items || [])
      .map((i) => `${i.quantity}x ${escapeHtml(i.name)}`)
      .join(', ');

    const statuses = ['pending', 'confirmed', 'processing', 'completed', 'shipped', 'delivered', 'cancelled'];

    return `
      <tr class="admin-row" data-order-id="${order._id}">
        <td>
          <a href="#/order/${order._id}" class="admin-order-link" title="View Full Receipt">
            ${escapeHtml(orderNumber)}
          </a>
        </td>
        <td style="font-size: 0.85rem; color: var(--text-dim);">
          ${dateFormatted}
        </td>
        <td>
          <div class="admin-customer-cell">
            <span class="customer-name">${escapeHtml(customerName)}</span>
            <span class="customer-email">${escapeHtml(customerEmail)}</span>
          </div>
        </td>
        <td style="max-width: 220px;" title="${escapeHtml(itemsSummary)}">
          <span class="admin-items-summary">${escapeHtml(itemsSummary || 'No items')}</span>
        </td>
        <td class="admin-price-cell">
          <strong>${formatPrice(grandTotal)}</strong>
        </td>
        <td class="admin-payment-cell">
          <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
            <span class="method-badge method-badge-${escapeHtml(paymentMethod)}">
              ${formatPaymentMethod(paymentMethod)}
            </span>
            <span class="payment-badge payment-${escapeHtml(paymentStatus)}">
              ● ${formatPaymentStatus(paymentStatus)}
            </span>
          </div>
        </td>
        <td>
          <div class="status-select-wrap">
            <select class="admin-status-dropdown status-pill-${order.status}" data-order-id="${order._id}">
              ${statuses.map((s) => `
                <option value="${s}" ${order.status === s ? 'selected' : ''}>
                  ${s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              `).join('')}
            </select>
          </div>
        </td>
      </tr>
    `;
  }

  /* =========================================================================
     MODALS: ADD / EDIT / DELETE
     ========================================================================= */

  renderModal(catalogState) {
    if (!this.modalMode) return '';

    if (this.modalMode === 'delete') {
      const prod = this.activeProduct || {};
      return `
        <div class="admin-modal-overlay">
          <div class="admin-modal-dialog glass-elevated" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title">
            <div class="admin-modal-header">
              <h3 id="delete-modal-title" style="color: var(--status-danger); display: flex; align-items: center; gap: 8px;">
                <span>⚠️</span> Confirm Permanent Deletion
              </h3>
              <button type="button" class="admin-modal-close" id="btn-cancel-modal">✕</button>
            </div>
            <div class="admin-modal-body">
              <p style="color: var(--text-high); margin-bottom: 12px;">
                Are you sure you want to permanently delete <strong style="color: var(--accent-gold);">${escapeHtml(prod.name || 'this item')}</strong> from the catalog?
              </p>
              <p style="color: var(--text-dim); font-size: 0.85rem;">
                This product will immediately be removed from client storefront listings and cannot be recovered.
              </p>
            </div>
            <div class="admin-modal-footer">
              <button type="button" class="btn-secondary-glass" id="btn-cancel-modal">Cancel</button>
              <button type="button" class="btn-danger-solid" id="btn-confirm-delete" data-product-id="${prod._id}">
                Delete Product
              </button>
            </div>
          </div>
        </div>
      `;
    }

    const isEdit = this.modalMode === 'edit';
    const prod = isEdit ? (this.activeProduct || {}) : {};
    const title = isEdit ? 'Edit Luxury Product' : 'Add New Imported Product';
    const currentImage = (prod.images && prod.images[0]) || prod.image || '';

    return `
      <div class="admin-modal-overlay">
        <div class="admin-modal-dialog admin-modal-lg glass-elevated" role="dialog" aria-modal="true" aria-labelledby="prod-modal-title">
          <form id="admin-product-form" class="admin-modal-form">
            <!-- Non-shrinking pinned header -->
            <div class="admin-modal-header">
              <h3 id="prod-modal-title" style="color: var(--text-high); display: flex; align-items: center; gap: 8px;">
                <span>${isEdit ? '✏️' : '✨'}</span> ${title}
              </h3>
              <button type="button" class="admin-modal-close" id="btn-cancel-modal" aria-label="Close dialog">✕</button>
            </div>

            <!-- Scrollable body: inputs only -->
            <div class="admin-modal-body">
              <div class="admin-form-grid">
                <!-- Row 1: Name & Brand -->
                <div class="form-group col-span-2">
                  <label for="form-prod-name">Product Name *</label>
                  <input type="text" id="form-prod-name" name="name" class="glass-input" required minlength="2" placeholder="e.g. Absolue Revitalizing Soft Cream" value="${escapeHtml(prod.name || '')}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-brand">Brand Name *</label>
                  <input type="text" id="form-prod-brand" name="brand" class="glass-input" required placeholder="e.g. Lancôme" value="${escapeHtml(prod.brand || '')}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-origin">Import Origin Country *</label>
                  <input type="text" id="form-prod-origin" name="origin" class="glass-input" required placeholder="e.g. France, South Korea, Japan" value="${escapeHtml(prod.origin || '')}" />
                </div>

                <!-- Row 2: Category & Subcategory -->
                <div class="form-group">
                  <label for="form-prod-category">Category *</label>
                  <select id="form-prod-category" name="category" class="glass-select" required>
                    <option value="" disabled ${!prod.category ? 'selected' : ''}>Select Category</option>
                    <option value="skincare" ${prod.category === 'skincare' ? 'selected' : ''}>Skincare</option>
                    <option value="cosmetics" ${prod.category === 'cosmetics' ? 'selected' : ''}>Cosmetics</option>
                    <option value="fragrances" ${prod.category === 'fragrances' ? 'selected' : ''}>Fragrances</option>
                    <option value="haircare" ${prod.category === 'haircare' ? 'selected' : ''}>Haircare</option>
                  </select>
                </div>

                <div class="form-group">
                  <label for="form-prod-subcategory">Subcategory</label>
                  <input type="text" id="form-prod-subcategory" name="subcategory" class="glass-input" placeholder="e.g. Moisturizer, Eau de Parfum" value="${escapeHtml(prod.subcategory || '')}" />
                </div>

                <!-- Row 3: Price & Stock -->
                <div class="form-group">
                  <label for="form-prod-price">Retail Price (LKR) *</label>
                  <input type="number" step="0.01" min="0" id="form-prod-price" name="price" class="glass-input" required placeholder="0.00" value="${prod.price !== undefined ? prod.price : ''}" />
                </div>

                <div class="form-group">
                  <label for="form-prod-stock">Vault Stock Quantity *</label>
                  <input type="number" step="1" min="0" id="form-prod-stock" name="stock" class="glass-input" required placeholder="0" value="${prod.stock !== undefined ? prod.stock : '15'}" />
                </div>

                <!-- Row 4: Modern Glassmorphic Product Image Upload -->
                <div class="form-group col-span-2 admin-image-upload-group">
                  <label class="form-label" style="display: block; margin-bottom: 8px;">
                    Product Hero Image <span style="font-size: 0.8rem; color: var(--text-dim); font-weight: normal;">(JPG, PNG, WebP, GIF - max 5MB)</span>
                  </label>
                  
                  <div class="image-upload-widget glass-panel">
                    <!-- 1. Image Preview Frame with 1:1 Aspect Ratio -->
                    <div class="image-preview-frame">
                      <div id="image-preview-box" class="image-preview-box ${currentImage ? 'has-image' : 'empty'}">
                        <img 
                          id="image-preview-img" 
                          src="${escapeHtml(currentImage)}" 
                          alt="Product Preview" 
                          class="image-preview-img ${currentImage ? '' : 'hidden'}"
                          onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;"
                        />
                        <div id="image-preview-placeholder" class="image-preview-placeholder ${currentImage ? 'hidden' : ''}">
                          <span class="placeholder-icon">📷</span>
                          <span class="placeholder-text">No image selected</span>
                        </div>
                      </div>
                      
                      <button 
                        type="button" 
                        id="btn-remove-image" 
                        class="btn-remove-image ${currentImage ? '' : 'hidden'}" 
                        title="Remove product image"
                      >
                        <span>🗑️</span> Remove Image
                      </button>
                    </div>

                    <!-- 2. Dropzone & File Action Controls -->
                    <div class="image-dropzone-container">
                      <div id="image-dropzone" class="image-dropzone" tabindex="0" role="button" aria-label="Upload product image">
                        <input 
                          type="file" 
                          id="form-prod-file-input" 
                          name="productImageFile" 
                          accept="image/png,image/jpeg,image/webp,image/gif" 
                          class="file-input-hidden"
                        />
                        <div class="dropzone-content">
                          <div class="dropzone-icon">✨</div>
                          <p class="dropzone-prompt">
                            <strong>Click to browse</strong> or drag & drop image here
                          </p>
                          <span class="dropzone-hint">Recommended high-resolution square asset (1:1 aspect ratio)</span>
                        </div>
                      </div>

                      <!-- Upload Progress / File Status Feedback -->
                      <div id="image-upload-status" class="image-upload-status hidden"></div>

                      <!-- Hidden Input for Final Image URL (submitted with form) -->
                      <input 
                        type="hidden" 
                        id="form-prod-image" 
                        name="image" 
                        value="${escapeHtml(currentImage)}" 
                      />
                    </div>
                  </div>
                </div>

                <!-- Row 5: Volume & Featured -->
                <div class="form-group">
                  <label for="form-prod-volume">Volume / Size</label>
                  <input type="text" id="form-prod-volume" name="volume" class="glass-input" placeholder="e.g. 50 ml / 1.7 oz" value="${escapeHtml(prod.volume || '')}" />
                </div>

                <div class="form-group" style="display: flex; align-items: center; gap: 8px; margin-top: 24px;">
                  <input type="checkbox" id="form-prod-featured" name="featured" ${prod.featured ? 'checked' : ''} style="width: 18px; height: 18px; accent-color: var(--accent-gold);" />
                  <label for="form-prod-featured" style="cursor: pointer; color: var(--text-high); font-size: 0.9rem;">Feature on Homepage Banner</label>
                </div>

                <!-- Row 6: Description -->
                <div class="form-group col-span-2">
                  <label for="form-prod-description">Product Description * (min 10 characters)</label>
                  <textarea id="form-prod-description" name="description" class="glass-input" rows="4" required minlength="10" placeholder="Detail the luxury formulation, artisanal extraction, and sensory benefits...">${escapeHtml(prod.description || '')}</textarea>
                </div>

                <div id="form-prod-error" class="form-error-msg col-span-2 hidden"></div>
              </div>
            </div>

            <!-- Non-shrinking pinned footer -->
            <div class="admin-modal-footer">
              <button type="button" class="btn-secondary-glass" id="btn-cancel-modal">Cancel</button>
              <button type="submit" class="btn-primary-gold" id="btn-submit-product">
                ${isEdit ? 'Save Changes' : 'Create Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  /* =========================================================================
     DOM EVENT BINDING & INTERACTION
     ========================================================================= */

  bindEvents() {
    if (!this.container) return;

    // Refresh Data
    this.container.addEventListener('click', async (e) => {
      const refreshBtn = e.target.closest('#admin-refresh-btn');
      if (refreshBtn) {
        refreshBtn.classList.add('rotating');
        await this.loadData();
        store.showToast('Admin data refreshed', 'info');
        refreshBtn.classList.remove('rotating');
      }
    });

    // Tab Switching
    this.container.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('.admin-tab-btn');
      if (tabBtn) {
        const tab = tabBtn.dataset.tab;
        store.setAdminActiveTab(tab);
      }
    });

    // Product search filter
    this.container.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'admin-product-search-input') {
        this.productSearchFilter = e.target.value;
        this.render();
      }
    });

    // Clear search
    this.container.addEventListener('click', (e) => {
      if (e.target && e.target.id === 'admin-product-search-clear') {
        this.productSearchFilter = '';
        this.render();
      }
    });

    // Product category select
    this.container.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'admin-product-cat-select') {
        this.productCategoryFilter = e.target.value;
        this.render();
      }
    });

    // Order status filter select
    this.container.addEventListener('change', (e) => {
      if (e.target && e.target.id === 'admin-order-status-select') {
        this.orderStatusFilter = e.target.value;
        this.render();
      }
    });

    // Add Product Modal Trigger
    this.container.addEventListener('click', (e) => {
      const addBtn = e.target.closest('#btn-admin-add-product');
      if (addBtn) {
        this.modalMode = 'add';
        this.activeProduct = null;
        this.render();
      }
    });

    // Edit Product Modal Trigger
    this.container.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.btn-edit-product');
      if (editBtn) {
        const id = editBtn.dataset.productId;
        const products = store.getState('catalog')?.products || [];
        const prod = products.find((p) => String(p._id) === String(id));
        if (prod) {
          this.modalMode = 'edit';
          this.activeProduct = prod;
          this.render();
        }
      }
    });

    // Delete Product Modal Trigger
    this.container.addEventListener('click', (e) => {
      const deleteBtn = e.target.closest('.btn-delete-product');
      if (deleteBtn) {
        const id = deleteBtn.dataset.productId;
        const products = store.getState('catalog')?.products || [];
        const prod = products.find((p) => String(p._id) === String(id));
        if (prod) {
          this.modalMode = 'delete';
          this.activeProduct = prod;
          this.render();
        }
      }
    });

    // Cancel Modal
    this.container.addEventListener('click', (e) => {
      const cancelBtn = e.target.closest('#btn-cancel-modal, .admin-modal-close');
      if (cancelBtn) {
        if (this.currentPreviewBlobUrl) {
          URL.revokeObjectURL(this.currentPreviewBlobUrl);
          this.currentPreviewBlobUrl = null;
        }
        this.isUploadingImage = false;
        this.modalMode = null;
        this.activeProduct = null;
        this.render();
      }
    });

    // Dropzone click triggers file input dialog
    this.container.addEventListener('click', (e) => {
      const dropzone = e.target.closest('#image-dropzone');
      if (dropzone && !e.target.closest('#form-prod-file-input') && !e.target.closest('#btn-remove-image')) {
        const fileInput = this.container.querySelector('#form-prod-file-input');
        if (fileInput) fileInput.click();
      }
    });

    // Dropzone keyboard accessibility (Enter/Space)
    this.container.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.id === 'image-dropzone') {
        e.preventDefault();
        const fileInput = this.container.querySelector('#form-prod-file-input');
        if (fileInput) fileInput.click();
      }
    });

    // File Input Change Handler
    this.container.addEventListener('change', async (e) => {
      if (e.target && e.target.id === 'form-prod-file-input') {
        const file = e.target.files && e.target.files[0];
        if (file) {
          await this.handleImageFileSelection(file);
        }
      }
    });

    // Drag & Drop Handlers on Dropzone
    this.container.addEventListener('dragover', (e) => {
      const dropzone = e.target.closest('#image-dropzone');
      if (dropzone) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('drag-active');
      }
    });

    this.container.addEventListener('dragleave', (e) => {
      const dropzone = e.target.closest('#image-dropzone');
      if (dropzone && !dropzone.contains(e.relatedTarget)) {
        dropzone.classList.remove('drag-active');
      }
    });

    this.container.addEventListener('drop', async (e) => {
      const dropzone = e.target.closest('#image-dropzone');
      if (dropzone) {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('drag-active');
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) {
          await this.handleImageFileSelection(file);
        }
      }
    });

    // Remove Image Button Handler
    this.container.addEventListener('click', (e) => {
      const removeBtn = e.target.closest('#btn-remove-image');
      if (removeBtn) {
        e.preventDefault();
        this.handleImageRemoval();
      }
    });

    // Confirm Product Deletion
    this.container.addEventListener('click', async (e) => {
      const confirmDeleteBtn = e.target.closest('#btn-confirm-delete');
      if (confirmDeleteBtn) {
        const id = confirmDeleteBtn.dataset.productId;
        try {
          confirmDeleteBtn.disabled = true;
          confirmDeleteBtn.textContent = 'Deleting...';
          await store.deleteAdminProduct(id);
          this.modalMode = null;
          this.activeProduct = null;
          this.render();
        } catch (err) {
          store.showToast(err.message || 'Failed to delete product', 'error');
          confirmDeleteBtn.disabled = false;
          confirmDeleteBtn.textContent = 'Delete Product';
        }
      }
    });

    // Product Form Submit (Create / Edit)
    this.container.addEventListener('submit', async (e) => {
      if (e.target && e.target.id === 'admin-product-form') {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('#btn-submit-product');
        const errorEl = form.querySelector('#form-prod-error');

        const name = form.name.value.trim();
        const brand = form.brand.value.trim();
        const origin = form.origin.value.trim();
        const category = form.category.value;
        const subcategory = form.subcategory.value.trim();
        const price = parseFloat(form.price.value);
        const stock = parseInt(form.stock.value, 10);
        const image = form.image.value.trim();
        const volume = form.volume.value.trim();
        const featured = form.featured.checked;
        const description = form.description.value.trim();

        if (this.isUploadingImage) {
          if (errorEl) {
            errorEl.textContent = 'Please wait for the image upload to complete.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        if (name.length < 2) {
          if (errorEl) {
            errorEl.textContent = 'Product name must be at least 2 characters.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        if (description.length < 10) {
          if (errorEl) {
            errorEl.textContent = 'Description must be at least 10 characters.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        if (isNaN(price) || price < 0) {
          if (errorEl) {
            errorEl.textContent = 'Please provide a valid non-negative price.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        if (isNaN(stock) || stock < 0) {
          if (errorEl) {
            errorEl.textContent = 'Please provide a valid non-negative stock count.';
            errorEl.classList.remove('hidden');
          }
          return;
        }

        const payload = {
          name,
          brand,
          origin,
          category,
          subcategory,
          price,
          stock,
          image,
          volume,
          featured,
          description,
        };

        try {
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Saving...';
          }

          if (this.modalMode === 'edit' && this.activeProduct?._id) {
            await store.updateAdminProduct(this.activeProduct._id, payload);
          } else {
            await store.createAdminProduct(payload);
          }

          if (this.currentPreviewBlobUrl) {
            URL.revokeObjectURL(this.currentPreviewBlobUrl);
            this.currentPreviewBlobUrl = null;
          }
          this.isUploadingImage = false;
          this.modalMode = null;
          this.activeProduct = null;
          this.render();
        } catch (err) {
          if (errorEl) {
            errorEl.textContent = err.message || 'Operation failed. Please verify input.';
            errorEl.classList.remove('hidden');
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = this.modalMode === 'edit' ? 'Save Changes' : 'Create Product';
          }
        }
      }
    });

    // Order Fulfillment Status Dropdown Change
    this.container.addEventListener('change', async (e) => {
      const statusSelect = e.target.closest('.admin-status-dropdown');
      if (statusSelect) {
        const orderId = statusSelect.dataset.orderId;
        const newStatus = statusSelect.value;
        const prevStatusClass = Array.from(statusSelect.classList).find((c) => c.startsWith('status-pill-'));

        try {
          statusSelect.disabled = true;
          await store.updateAdminOrderStatus(orderId, newStatus);
          if (prevStatusClass) statusSelect.classList.remove(prevStatusClass);
          statusSelect.classList.add(`status-pill-${newStatus}`);
        } catch (err) {
          store.showToast(err.message || 'Status update failed', 'error');
          // Re-render to restore previous select state
          this.render();
        } finally {
          statusSelect.disabled = false;
        }
      }
    });
  }

  async handleImageFileSelection(file) {
    const validMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    const maxSizeBytes = 5 * 1024 * 1024; // 5 MB

    const previewImg = this.container.querySelector('#image-preview-img');
    const placeholder = this.container.querySelector('#image-preview-placeholder');
    const previewBox = this.container.querySelector('#image-preview-box');
    const removeBtn = this.container.querySelector('#btn-remove-image');
    const statusEl = this.container.querySelector('#image-upload-status');
    const hiddenInput = this.container.querySelector('#form-prod-image');
    const errorEl = this.container.querySelector('#form-prod-error');
    const submitBtn = this.container.querySelector('#btn-submit-product');

    if (!validMimes.includes(file.type.toLowerCase())) {
      store.showToast('Please select a valid image file (JPEG, PNG, WebP, GIF)', 'error');
      if (errorEl) {
        errorEl.textContent = 'Invalid file type. Please select a JPEG, PNG, WebP, or GIF image.';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (file.size > maxSizeBytes) {
      store.showToast('Image file size exceeds the 5MB limit', 'error');
      if (errorEl) {
        errorEl.textContent = `File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 5MB.`;
        errorEl.classList.remove('hidden');
      }
      return;
    }

    if (errorEl) {
      errorEl.classList.add('hidden');
    }

    // 1. Show immediate local preview
    if (this.currentPreviewBlobUrl) {
      URL.revokeObjectURL(this.currentPreviewBlobUrl);
    }
    this.currentPreviewBlobUrl = URL.createObjectURL(file);

    if (previewImg) {
      previewImg.src = this.currentPreviewBlobUrl;
      previewImg.classList.remove('hidden');
    }
    if (placeholder) {
      placeholder.classList.add('hidden');
    }
    if (previewBox) {
      previewBox.classList.add('has-image');
      previewBox.classList.remove('empty');
    }
    if (removeBtn) {
      removeBtn.classList.remove('hidden');
    }

    // 2. Upload file immediately to backend
    if (statusEl) {
      statusEl.className = 'image-upload-status status-uploading';
      statusEl.innerHTML = '<span class="status-spinner">⏳</span> <span class="status-text">Uploading image to vault...</span>';
      statusEl.classList.remove('hidden');
    }

    this.isUploadingImage = true;
    if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      const uploadedUrl = await store.uploadProductImage(file);
      if (hiddenInput) {
        hiddenInput.value = uploadedUrl;
      }
      if (statusEl) {
        statusEl.className = 'image-upload-status status-success';
        statusEl.innerHTML = '<span class="status-icon">✓</span> <span class="status-text">Image uploaded and attached</span>';
      }
      store.showToast('Product image uploaded successfully', 'success');
    } catch (err) {
      if (statusEl) {
        statusEl.className = 'image-upload-status status-error';
        statusEl.innerHTML = `<span class="status-icon">⚠️</span> <span class="status-text">Upload failed: ${escapeHtml(err.message || 'Error')}</span>`;
      }
    } finally {
      this.isUploadingImage = false;
      if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  }

  handleImageRemoval() {
    if (this.currentPreviewBlobUrl) {
      URL.revokeObjectURL(this.currentPreviewBlobUrl);
      this.currentPreviewBlobUrl = null;
    }

    const previewImg = this.container.querySelector('#image-preview-img');
    const placeholder = this.container.querySelector('#image-preview-placeholder');
    const previewBox = this.container.querySelector('#image-preview-box');
    const removeBtn = this.container.querySelector('#btn-remove-image');
    const statusEl = this.container.querySelector('#image-upload-status');
    const hiddenInput = this.container.querySelector('#form-prod-image');
    const fileInput = this.container.querySelector('#form-prod-file-input');

    if (previewImg) {
      previewImg.src = '';
      previewImg.classList.add('hidden');
    }
    if (placeholder) {
      placeholder.classList.remove('hidden');
    }
    if (previewBox) {
      previewBox.classList.remove('has-image');
      previewBox.classList.add('empty');
    }
    if (removeBtn) {
      removeBtn.classList.add('hidden');
    }
    if (fileInput) {
      fileInput.value = '';
    }
    if (hiddenInput) {
      hiddenInput.value = '';
    }
    if (statusEl) {
      statusEl.className = 'image-upload-status status-info';
      statusEl.innerHTML = '<span class="status-icon">ℹ️</span> <span class="status-text">Image removed. Save changes to update.</span>';
      statusEl.classList.remove('hidden');
    }
  }
}

export default AdminDashboardComponent;
