/**
 * VelvetAura - Account View Component
 * Customer profile management, member status, and order history timeline with expandable receipts.
 */

import { BaseComponent, formatPrice, escapeHtml, formatDate, formatPaymentMethod, formatPaymentStatus } from './base.js';
import store from '../store.js';

export class AccountViewComponent extends BaseComponent {
  constructor(containerSelector = '#account-view-container', options = {}) {
    super(containerSelector, options);
  }

  init() {
    super.init();

    // Subscribe to auth state updates
    this.unsubscribers.push(
      store.subscribe('auth', () => {
        this.render();
      })
    );

    // Subscribe to orders state updates
    this.unsubscribers.push(
      store.subscribe('orders', () => {
        this.render();
      })
    );
  }

  render() {
    if (!this.container) return;

    const authState = store.getState('auth') || {};
    const ordersState = store.getState('orders') || {};

    if (!authState.isAuthenticated || !authState.user) {
      this.container.innerHTML = `
        <div class="account-section">
          <div class="glass-card" style="padding: var(--space-3xl); text-align: center; max-width: 540px; margin: 0 auto; border-radius: var(--radius-xl);">
            <div style="font-size: 3rem; margin-bottom: var(--space-md);">👤</div>
            <h2 style="font-size: 1.8rem; margin-bottom: var(--space-sm); color: var(--text-high);">Sign In to View Your Account</h2>
            <p style="color: var(--text-muted); margin-bottom: var(--space-xl);">
              Access your order history, tracked international air cargo shipments, and registered luxury addresses.
            </p>
            <button type="button" id="account-login-prompt-btn" class="btn-primary-gold">
              Sign In to VelvetAura
            </button>
          </div>
        </div>
      `;
      return;
    }

    const user = authState.user;
    const name = user.name || 'Member';
    const email = user.email || '';
    const joinedDate = formatDate(user.createdAt || new Date());
    const initials = name
      .split(' ')
      .map((p) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    const orders = ordersState.list || [];
    const orderCountLabel = `${orders.length} ${orders.length === 1 ? 'Order' : 'Orders'}`;

    this.container.innerHTML = `
      <section id="account-view" class="account-section">
        <!-- Profile Header Card -->
        <div class="profile-card glass-card">
          <div class="profile-avatar-wrap">
            <div id="account-avatar" class="profile-avatar">${escapeHtml(initials)}</div>
            <div>
              <div class="tier-badge">Aura Luxe Member</div>
              <h1 id="account-user-name" class="profile-name" style="margin-top: 4px;">${escapeHtml(name)}</h1>
              <p id="account-user-email" class="profile-email">${escapeHtml(email)}</p>
              <span id="account-member-since" class="profile-joined">Member since ${escapeHtml(joinedDate)}</span>
            </div>
          </div>
          <div class="profile-actions">
            <button type="button" id="account-logout-btn" class="btn-secondary-glass">Sign Out</button>
          </div>
        </div>

        <!-- Order History Timeline Section -->
        <div class="order-history-section">
          <div class="section-header">
            <h2 class="section-title" style="font-size: 1.5rem;">Your Order History</h2>
            <span id="history-order-count" class="badge-count">${orderCountLabel}</span>
          </div>

          <!-- Timeline Container -->
          <div id="orders-timeline" class="orders-timeline">
            ${
              orders.length > 0
                ? orders.map((order) => this.renderOrderCard(order)).join('')
                : this.renderEmptyOrders()
            }
          </div>
        </div>
      </section>
    `;
  }

  renderOrderCard(order) {
    const orderNum = order.orderNumber || (order._id ? `#VA-${order._id.slice(-6).toUpperCase()}` : '#VA-102948');
    const orderDate = formatDate(order.createdAt);
    const grandTotal = formatPrice(order.pricing?.grandTotal || order.grandTotal || 0);
    const items = order.items || [];
    const txnId = order.gatewayTransactionId || order.payment?.transactionId || 'TXN-VA-PENDING';
    const destination = order.shippingAddress?.city
      ? `${order.shippingAddress.city}, ${order.shippingAddress.country || 'Sri Lanka'}`
      : 'Registered Luxury Destination';
    const orderStatus = order.status || 'pending';
    const paymentMethod = order.paymentMethod || order.payment?.method || 'cod';
    const paymentStatus = order.paymentStatus || order.payment?.status || 'pending';

    return `
      <div class="order-history-card glass-card" data-order-id="${order._id}">
        <div class="order-card-header">
          <div class="order-id-group">
            <span class="order-number">Order ${escapeHtml(orderNum)}</span>
            <span class="order-date">${escapeHtml(orderDate)}</span>
          </div>
          <div class="order-status-group" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="method-badge method-badge-${escapeHtml(paymentMethod)}">
              ${formatPaymentMethod(paymentMethod)}
            </span>
            <span class="payment-badge payment-${escapeHtml(paymentStatus)}">
              ${formatPaymentStatus(paymentStatus)}
            </span>
            <span class="status-pill status-${escapeHtml(orderStatus)}">● ${escapeHtml(orderStatus.toUpperCase())}</span>
            <span class="order-card-total">${grandTotal}</span>
          </div>
        </div>

        <!-- Expandable Items Toggle -->
        <div class="order-card-body">
          <button type="button" class="btn-toggle-items" data-action="toggle-items" data-order-id="${order._id}">
            <span>View Items (${items.length})</span> <span class="toggle-icon">▼</span>
          </button>

          <div class="order-items-collapsible hidden" id="order-items-${order._id}">
            <div class="items-table">
              ${items
                .map((item) => {
                  const name = item.name || item.product?.name || 'Luxury Selection';
                  const img = item.image || item.product?.image || '/assets/images/placeholder.svg';
                  const price = item.price || 0;
                  const qty = item.quantity || 1;
                  return `
                  <div class="order-line-item">
                    <img 
                      src="${escapeHtml(img)}" 
                      alt="${escapeHtml(name)}" 
                      class="item-thumb" 
                      onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;" 
                    />
                    <div class="item-meta">
                      <span class="item-name">${escapeHtml(name)}</span>
                      <span class="item-qty-price">${qty} × ${formatPrice(price)}</span>
                    </div>
                    <span class="item-total">${formatPrice(price * qty)}</span>
                  </div>
                `;
                })
                .join('')}
            </div>
            <div class="order-meta-footer">
              <span class="txn-meta">Transaction: <code>${escapeHtml(txnId)}</code></span>
              <span class="dest-meta">Shipped to: ${escapeHtml(destination)}</span>
              ${order.paymentNotes ? `<span class="notes-meta">Notes: ${escapeHtml(order.paymentNotes)}</span>` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderEmptyOrders() {
    return `
      <div class="glass-card" style="padding: var(--space-2xl); text-align: center; border-radius: var(--radius-lg);">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-sm);">📦</div>
        <h3 style="font-size: 1.25rem; color: var(--text-high); margin-bottom: 6px;">No Orders Placed Yet</h3>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: var(--space-lg);">
          When you purchase authentic imported beauty items, your receipts and air cargo details will appear here.
        </p>
        <a href="#/catalog" class="btn-primary-gold">Start Shopping</a>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    this.container.addEventListener('click', (e) => {
      // Login prompt button
      if (e.target.closest('#account-login-prompt-btn')) {
        store.openAuthModal('login');
        return;
      }

      // Logout button
      if (e.target.closest('#account-logout-btn')) {
        store.logout();
        return;
      }

      // Expandable items toggle
      const toggleBtn = e.target.closest('[data-action="toggle-items"]');
      if (toggleBtn) {
        const orderId = toggleBtn.dataset.orderId;
        const collapsible = this.container.querySelector(`#order-items-${orderId}`);
        const icon = toggleBtn.querySelector('.toggle-icon');
        if (collapsible) {
          const isHidden = collapsible.classList.contains('hidden');
          collapsible.classList.toggle('hidden', !isHidden);
          if (icon) {
            icon.textContent = isHidden ? '▲' : '▼';
          }
        }
      }
    });
  }
}

export default AccountViewComponent;
