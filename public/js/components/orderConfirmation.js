/**
 * VelvetAura - Order Confirmation Component
 * Celebratory glass receipt card with animated checkmark, transaction metadata, and itemized breakdown.
 */

import { BaseComponent, formatPrice, escapeHtml, formatDate, formatPaymentMethod, formatPaymentStatus } from './base.js';
import store from '../store.js';
import api from '../api.js';

export class OrderConfirmationComponent extends BaseComponent {
  constructor(containerSelector = '#order-confirmation-container', options = {}) {
    super(containerSelector, options);
    this.currentOrder = null;
    this.loading = false;
  }

  async loadOrder(orderId) {
    this.loading = true;
    this.render();

    // Check if the order is already in checkout state
    const checkoutState = store.getState('checkout') || {};
    if (checkoutState.lastOrder && (checkoutState.lastOrder._id === orderId || checkoutState.lastOrder.id === orderId)) {
      this.currentOrder = checkoutState.lastOrder;
      this.loading = false;
      this.render();
      return;
    }

    // Otherwise fetch from API
    const res = await api.getOrder(orderId);
    this.loading = false;

    if (res.success && res.data?.order) {
      this.currentOrder = res.data.order;
    } else {
      this.currentOrder = checkoutState.lastOrder || null;
    }

    this.render();
  }

  render() {
    if (!this.container) return;

    if (this.loading) {
      this.container.innerHTML = `
        <div class="confirmation-section">
          <div class="confirmation-card glass-card">
            <div class="check-circle-pulse" style="margin: 0 auto 16px auto;">⏳</div>
            <h2>Retrieving Your Order Receipt...</h2>
          </div>
        </div>
      `;
      return;
    }

    const order = this.currentOrder || store.getState('checkout')?.lastOrder;

    if (!order) {
      this.container.innerHTML = `
        <div class="confirmation-section">
          <div class="confirmation-card glass-card">
            <h2>No Recent Order Found</h2>
            <p style="color: var(--text-muted); margin: var(--space-md) 0;">
              Browse our curated selections and place an order to view your luxury receipt.
            </p>
            <a href="#/catalog" class="btn-primary-gold">Explore Catalog</a>
          </div>
        </div>
      `;
      return;
    }

    const orderNum = order.orderNumber || (order._id ? `#VA-${order._id.slice(-6).toUpperCase()}` : '#VA-109284');
    const txnId = order.gatewayTransactionId || order.payment?.transactionId || store.getState('checkout')?.transactionId || 'TXN-VA-PENDING';
    const dateFormatted = formatDate(order.createdAt || new Date());
    const method = order.paymentMethod || order.payment?.method || 'cod';
    const status = order.paymentStatus || order.payment?.status || 'pending';
    const paymentMethodDisplay = formatPaymentMethod(method);
    const paymentStatusDisplay = formatPaymentStatus(status);
    const grandTotal = Number(order.pricing?.grandTotal || order.grandTotal) || 0;

    const items = order.items || [];
    const shippingAddr = order.shippingAddress || {};
    const street = shippingAddr.street || shippingAddr.addressLine1 || 'No. 45, Galle Road';
    const city = shippingAddr.city || 'Colombo';
    const state = shippingAddr.state || 'Western Province';
    const zip = shippingAddr.zip || shippingAddr.postalCode || '00300';
    const country = shippingAddr.country || 'Sri Lanka';
    const recipient = shippingAddr.fullName || order.user?.name || 'Valued Client';

    this.container.innerHTML = `
      <section id="order-confirmation-view" class="confirmation-section">
        <div class="confirmation-card glass-card">
          <!-- Success Animation Header -->
          <div class="confirmation-header">
            <div class="check-animation-wrapper">
              <span class="check-mark">✓</span>
            </div>
            <h1 class="confirmation-title">Thank You For Your Luxury Order!</h1>
            <p class="confirmation-subtitle">
              Your imported beauty selections have been recorded and are being processed for delivery.
            </p>
          </div>

          <!-- Receipt Metadata Banner -->
          <div class="receipt-metadata-grid glass-card">
            <div class="meta-item">
              <span class="meta-label">Order Number</span>
              <span id="receipt-order-number" class="meta-value font-mono">${escapeHtml(orderNum)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Transaction ID</span>
              <span id="receipt-txn-id" class="meta-value font-mono">${escapeHtml(txnId)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Date &amp; Time</span>
              <span id="receipt-date" class="meta-value">${escapeHtml(dateFormatted)}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Payment Method</span>
              <span id="receipt-payment-method" class="meta-value">
                <span class="method-badge method-badge-${escapeHtml(method)}">${escapeHtml(paymentMethodDisplay)}</span>
              </span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Payment Status</span>
              <span id="receipt-payment-status" class="meta-value">
                <span class="payment-badge payment-${escapeHtml(status)}">● ${escapeHtml(paymentStatusDisplay)}</span>
              </span>
            </div>
          </div>

          ${
            method === 'bank_transfer'
              ? `
            <!-- Bank Transfer Reminder Card on Receipt -->
            <div class="payment-detail-card glass-card bank-transfer-details-box" style="margin-top: var(--space-md); text-align: left;">
              <div class="bank-details-header">
                <span class="bank-icon">🏛️</span>
                <span class="bank-title">Bank Transfer Payment Instructions</span>
              </div>
              <p style="font-size: 0.85rem; color: var(--text-medium); margin-bottom: 8px;">
                Please transfer the total order amount of <strong style="color: var(--accent-gold);">${formatPrice(grandTotal)}</strong> to our official corporate account:
              </p>
              <div class="bank-details-table">
                <div class="bank-detail-row">
                  <span class="bank-field-label">Bank</span>
                  <span class="bank-field-value">Commercial Bank of Ceylon</span>
                </div>
                <div class="bank-detail-row">
                  <span class="bank-field-label">Branch</span>
                  <span class="bank-field-value">Colombo Fort Premier Branch</span>
                </div>
                <div class="bank-detail-row">
                  <span class="bank-field-label">Account Name</span>
                  <span class="bank-field-value">VelvetAura (Pvt) Ltd</span>
                </div>
                <div class="bank-detail-row highlight">
                  <span class="bank-field-label">Account Number</span>
                  <span class="bank-field-value font-mono">1000 8924 7712</span>
                </div>
              </div>
              <div class="bank-transfer-instructions">
                <span class="instruction-icon">📌</span>
                <span>Transfer Reference: <strong>${escapeHtml(orderNum)}</strong>. Your order will be dispatched once payment is verified.</span>
              </div>
            </div>
          `
              : ''
          }

          <!-- Two-Column Order Snapshot -->
          <div class="receipt-details-grid">
            <!-- Left: Line Items Summary -->
            <div class="receipt-items-column">
              <h3 class="section-title">Purchased Items (${items.length})</h3>
              <div id="receipt-items-list" class="receipt-items-list">
                ${items
                  .map((item) => {
                    const name = item.name || item.product?.name || 'Luxury Item';
                    const price = item.price || 0;
                    const qty = item.quantity || 1;
                    const img = item.image || item.product?.image || '/assets/images/placeholder.svg';
                    return `
                    <div class="receipt-item-row">
                      <img 
                        src="${escapeHtml(img)}" 
                        alt="${escapeHtml(name)}" 
                        class="receipt-thumb" 
                        onerror="this.src='/assets/images/placeholder.svg'; this.onerror=null;"
                      />
                      <div class="receipt-item-meta">
                        <span class="receipt-item-name">${escapeHtml(name)}</span>
                        <span class="receipt-item-qty">${qty} × ${formatPrice(price)}</span>
                      </div>
                      <span class="receipt-item-total">${formatPrice(price * qty)}</span>
                    </div>
                  `;
                  })
                  .join('')}
              </div>
            </div>

            <!-- Right: Destination & Financial Summary -->
            <div class="receipt-summary-column">
              <!-- Shipping Address Snapshot -->
              <div class="shipping-snapshot-card glass-card">
                <h4 class="card-subtitle">Shipping Destination</h4>
                <p id="receipt-shipping-address" class="address-paragraph">
                  <strong>${escapeHtml(recipient)}</strong><br />
                  ${escapeHtml(street)}<br />
                  ${escapeHtml(city)}, ${escapeHtml(state)} ${escapeHtml(zip)}<br />
                  ${escapeHtml(country)}
                </p>
              </div>

              <!-- Financial Summary -->
              <div class="receipt-financial-card glass-card">
                <h4 class="card-subtitle">Payment Summary</h4>
                <div class="summary-line">
                  <span>Subtotal</span>
                  <span id="receipt-subtotal">${formatPrice(order.subtotal || 0)}</span>
                </div>
                <div class="summary-line">
                  <span>Estimated Tax (8%)</span>
                  <span id="receipt-tax">${formatPrice(order.tax || 0)}</span>
                </div>
                <div class="summary-line">
                  <span>Air Cargo Shipping</span>
                  <span id="receipt-shipping">${order.shipping === 0 ? 'FREE' : formatPrice(order.shipping || 0)}</span>
                </div>
                <div class="summary-divider"></div>
                <div class="summary-line grand-total">
                  <strong>Total Paid</strong>
                  <strong id="receipt-grand-total" class="total-highlight">${formatPrice(order.grandTotal || 0)}</strong>
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
    `;
  }
}

export default OrderConfirmationComponent;
