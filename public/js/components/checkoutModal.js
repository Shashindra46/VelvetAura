/**
 * VelvetAura - Checkout Modal Component
 * Modern dark-mode glassmorphic checkout capturing shipping destination,
 * payment method selection (Cash on Delivery vs. Direct Bank Transfer),
 * official corporate bank account details card, and transfer confirmation.
 */

import { BaseComponent, formatPrice, escapeHtml } from './base.js';
import store from '../store.js';

export class CheckoutModalComponent extends BaseComponent {
  constructor(containerSelector = '#checkout-modal-container', options = {}) {
    super(containerSelector, options);
    this.selectedMethod = 'cod';
    this.bankTransferConfirmed = false;
  }

  init() {
    super.init();

    // Subscribe to checkout state updates
    this.unsubscribers.push(
      store.subscribe('checkout', () => {
        this.render();
      })
    );
  }

  render() {
    if (!this.container) return;

    const checkoutState = store.getState('checkout') || {};
    const cartState = store.getState('cart') || {};
    const authState = store.getState('auth') || {};

    const {
      isOpen = false,
      isSubmitting = false,
      error = null,
      shippingAddress = {},
    } = checkoutState;

    if (!isOpen) {
      this.container.innerHTML = '';
      return;
    }

    const user = authState.user || {};
    const fullName = shippingAddress.fullName || user.name || '';
    const street = shippingAddress.street || user.shippingAddress?.street || user.address?.street || '';
    const address2 = shippingAddress.address2 || '';
    const city = shippingAddress.city || user.shippingAddress?.city || user.address?.city || '';
    const state = shippingAddress.state || user.shippingAddress?.state || user.address?.state || '';
    const zip = shippingAddress.zip || user.shippingAddress?.zip || user.address?.zip || '';
    const country = shippingAddress.country || user.shippingAddress?.country || user.address?.country || 'Sri Lanka';

    const grandTotal = cartState.grandTotal || 0;
    const subtotal = cartState.subtotal || 0;
    const tax = cartState.tax || 0;
    const shipping = cartState.shipping || 0;
    const itemCount = cartState.itemCount || 0;

    const selectedMethod = this.selectedMethod || 'cod';
    const isBank = selectedMethod === 'bank_transfer';

    this.container.innerHTML = `
      <div id="checkout-modal" class="modal-overlay glass-backdrop is-open" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
        <div class="modal-dialog checkout-dialog glass-elevated">
          <!-- Modal Header -->
          <div class="checkout-header">
            <div class="checkout-title-wrap">
              <span class="lock-icon" aria-hidden="true">🔒</span>
              <h2 id="checkout-title" class="checkout-title">VelvetAura Secure Checkout</h2>
              <span class="security-badge">LKR Verified</span>
            </div>
            <button type="button" id="checkout-close-btn" class="modal-close-btn" aria-label="Cancel Checkout">✕</button>
          </div>

          <!-- Checkout Form -->
          <form id="checkout-form" class="checkout-form" novalidate>
            <div class="checkout-two-column">
              <!-- Column 1: Shipping Destination -->
              <fieldset class="checkout-fieldset glass-card">
                <legend class="fieldset-legend">1. Shipping Destination</legend>
                
                <div class="form-group">
                  <label for="shipping-name">Full Name *</label>
                  <input type="text" id="shipping-name" class="glass-input" required value="${escapeHtml(fullName)}" placeholder="e.g. Kasun Perera" />
                </div>

                <div class="form-group">
                  <label for="shipping-street">Street Address *</label>
                  <input type="text" id="shipping-street" class="glass-input" required value="${escapeHtml(street)}" placeholder="e.g. No. 45, Galle Road" />
                </div>

                <div class="form-group">
                  <label for="shipping-address2">Apartment / Suite / Landmark (Optional)</label>
                  <input type="text" id="shipping-address2" class="glass-input" value="${escapeHtml(address2)}" placeholder="e.g. Apartment 4B" />
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="shipping-city">City *</label>
                    <input type="text" id="shipping-city" class="glass-input" required value="${escapeHtml(city)}" placeholder="e.g. Colombo" />
                  </div>
                  <div class="form-group">
                    <label for="shipping-state">Province / State *</label>
                    <input type="text" id="shipping-state" class="glass-input" required value="${escapeHtml(state)}" placeholder="e.g. Western Province" />
                  </div>
                </div>

                <div class="form-row">
                  <div class="form-group">
                    <label for="shipping-zip">Postal / ZIP Code *</label>
                    <input type="text" id="shipping-zip" class="glass-input" required value="${escapeHtml(zip)}" placeholder="e.g. 00300" />
                  </div>
                  <div class="form-group">
                    <label for="shipping-country">Destination Country *</label>
                    <select id="shipping-country" class="glass-select" required>
                      <option value="Sri Lanka" ${country === 'Sri Lanka' ? 'selected' : ''}>🇱🇰 Sri Lanka</option>
                      <option value="France" ${country === 'France' ? 'selected' : ''}>🇫🇷 France</option>
                      <option value="South Korea" ${country === 'South Korea' ? 'selected' : ''}>🇰🇷 South Korea</option>
                      <option value="Japan" ${country === 'Japan' ? 'selected' : ''}>🇯🇵 Japan</option>
                      <option value="United Kingdom" ${country === 'United Kingdom' ? 'selected' : ''}>🇬🇧 United Kingdom</option>
                      <option value="USA" ${country === 'USA' ? 'selected' : ''}>🇺🇸 USA</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              <!-- Column 2: Payment Method Selection -->
              <fieldset class="checkout-fieldset glass-card">
                <legend class="fieldset-legend">2. Payment Method</legend>

                <!-- Payment Options Radio Grid -->
                <div class="payment-options-grid" role="radiogroup" aria-label="Select Payment Method">
                  <!-- Option 1: Cash on Delivery (COD) -->
                  <label class="payment-option-card ${selectedMethod === 'cod' ? 'active' : ''}" for="pay-method-cod">
                    <input 
                      type="radio" 
                      id="pay-method-cod" 
                      name="payment-method" 
                      value="cod" 
                      ${selectedMethod === 'cod' ? 'checked' : ''} 
                    />
                    <div class="payment-option-content">
                      <div class="payment-option-header">
                        <span class="payment-option-icon">💵</span>
                        <span class="payment-option-title">Cash on Delivery (COD)</span>
                        <span class="payment-badge-pill">Pay at Doorstep</span>
                      </div>
                      <p class="payment-option-desc">
                        Pay in cash upon physical arrival of your luxury parcel. No pre-payment required.
                      </p>
                    </div>
                  </label>

                  <!-- Option 2: Direct Bank Transfer -->
                  <label class="payment-option-card ${selectedMethod === 'bank_transfer' ? 'active' : ''}" for="pay-method-bank">
                    <input 
                      type="radio" 
                      id="pay-method-bank" 
                      name="payment-method" 
                      value="bank_transfer" 
                      ${selectedMethod === 'bank_transfer' ? 'checked' : ''} 
                    />
                    <div class="payment-option-content">
                      <div class="payment-option-header">
                        <span class="payment-option-icon">🏦</span>
                        <span class="payment-option-title">Direct Bank Transfer</span>
                        <span class="payment-badge-pill gold">Commercial Bank</span>
                      </div>
                      <p class="payment-option-desc">
                        Transfer directly to VelvetAura’s official corporate bank account via online banking or CDM/ATM deposit.
                      </p>
                    </div>
                  </label>
                </div>

                <!-- COD Informational Note Box -->
                ${
                  !isBank
                    ? `
                  <div class="payment-detail-card glass-card cod-note-box">
                    <div class="detail-note-header">
                      <span class="note-icon">ℹ️</span>
                      <strong>Cash on Delivery Guidelines:</strong>
                    </div>
                    <p class="detail-note-body">
                      Please have the exact amount of <strong style="color: var(--accent-gold);">${formatPrice(grandTotal)}</strong> ready for our courier partner upon delivery. Your order will be placed with <span class="method-badge method-badge-cod">💵 Cash on Delivery</span> and initial status <strong>Pending Payment</strong>.
                    </p>
                  </div>
                `
                    : ''
                }

                <!-- Direct Bank Transfer Official Account Details Card -->
                ${
                  isBank
                    ? `
                  <div class="payment-detail-card glass-card bank-transfer-details-box">
                    <div class="bank-details-header">
                      <span class="bank-icon">🏛️</span>
                      <span class="bank-title">VelvetAura Official Corporate Banking</span>
                    </div>

                    <div class="bank-details-table">
                      <div class="bank-detail-row">
                        <span class="bank-field-label">Bank Name</span>
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
                      <div class="bank-detail-row">
                        <span class="bank-field-label">Currency</span>
                        <span class="bank-field-value">LKR (Sri Lankan Rupees)</span>
                      </div>
                    </div>

                    <div class="bank-transfer-instructions">
                      <span class="instruction-icon">📌</span>
                      <span>Please include your <strong>Order Number</strong> or <strong>Full Name</strong> in the transfer reference/remarks.</span>
                    </div>

                    <!-- Required Confirmation Checkbox -->
                    <div class="bank-confirmation-wrap">
                      <label class="glass-checkbox-label" for="bank-transfer-confirm-checkbox">
                        <input 
                          type="checkbox" 
                          id="bank-transfer-confirm-checkbox" 
                          ${this.bankTransferConfirmed ? 'checked' : ''} 
                          required 
                        />
                        <span class="checkbox-custom"></span>
                        <span class="checkbox-text">
                          I confirm that I have transferred / will transfer the total amount (<strong style="color: var(--accent-gold);">${formatPrice(grandTotal)}</strong>) to the VelvetAura bank account above.
                        </span>
                      </label>
                    </div>
                  </div>
                `
                    : ''
                }

                <!-- Order Financial Summary Box -->
                <div class="checkout-summary-box glass-card">
                  <div class="summary-line">
                    <span>Items Total (${itemCount})</span>
                    <span>${formatPrice(subtotal)}</span>
                  </div>
                  <div class="summary-line">
                    <span>Estimated Tax (8%)</span>
                    <span>${formatPrice(tax)}</span>
                  </div>
                  <div class="summary-line">
                    <span>Islandwide Delivery</span>
                    <span>${shipping === 0 ? 'FREE' : formatPrice(shipping)}</span>
                  </div>
                  <div class="summary-divider"></div>
                  <div class="summary-line grand-total">
                    <strong>Order Grand Total</strong>
                    <strong style="color: var(--accent-gold);">${formatPrice(grandTotal)}</strong>
                  </div>
                </div>
              </fieldset>
            </div>

            <!-- Error Banner -->
            ${
              error
                ? `<div id="checkout-error-banner" class="checkout-error-banner" role="alert">⚠ ${escapeHtml(error)}</div>`
                : ''
            }

            <!-- Submission Actions -->
            <div class="checkout-actions">
              <button 
                type="submit" 
                id="submit-order-btn" 
                class="btn-primary-gold btn-place-order" 
                ${isSubmitting ? 'disabled' : ''}
              >
                ${
                  isSubmitting
                    ? `<span class="btn-spinner">Placing Your Order...</span>`
                    : isBank
                    ? `<span>🏦 Place Bank Transfer Order — ${formatPrice(grandTotal)}</span>`
                    : `<span>💵 Place Order (Cash on Delivery) — ${formatPrice(grandTotal)}</span>`
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  bindEvents() {
    if (!this.container) return;

    // Click delegation for modal closing
    this.container.addEventListener('click', (e) => {
      // Close button
      if (e.target.closest('#checkout-close-btn')) {
        store.closeCheckout();
        return;
      }

      // Backdrop click
      if (e.target.classList.contains('modal-overlay')) {
        store.closeCheckout();
        return;
      }
    });

    // Radio change delegation for payment method
    this.container.addEventListener('change', (e) => {
      if (e.target.name === 'payment-method') {
        this.selectedMethod = e.target.value;
        this.render();
      } else if (e.target.id === 'bank-transfer-confirm-checkbox') {
        this.bankTransferConfirmed = e.target.checked;
      }
    });

    // Form submission
    this.container.addEventListener('submit', async (e) => {
      if (e.target.id === 'checkout-form') {
        e.preventDefault();

        const shippingName = this.container.querySelector('#shipping-name')?.value.trim();
        const shippingStreet = this.container.querySelector('#shipping-street')?.value.trim();
        const shippingAddress2 = this.container.querySelector('#shipping-address2')?.value.trim();
        const shippingCity = this.container.querySelector('#shipping-city')?.value.trim();
        const shippingState = this.container.querySelector('#shipping-state')?.value.trim();
        const shippingZip = this.container.querySelector('#shipping-zip')?.value.trim();
        const shippingCountry = this.container.querySelector('#shipping-country')?.value;

        if (!shippingName || !shippingStreet || !shippingCity || !shippingState || !shippingZip) {
          store.setState('checkout', { error: 'Please fill in all required shipping address fields.' });
          return;
        }

        const selectedMethod = this.selectedMethod || 'cod';

        // Bank transfer confirmation validation
        if (selectedMethod === 'bank_transfer') {
          const isConfirmed = this.container.querySelector('#bank-transfer-confirm-checkbox')?.checked;
          if (!isConfirmed) {
            store.setState('checkout', {
              error: 'Please confirm that you have transferred / will transfer the total amount to the VelvetAura bank account.',
            });
            return;
          }
        }

        const payload = {
          shippingAddress: {
            fullName: shippingName,
            street: shippingStreet,
            address2: shippingAddress2,
            city: shippingCity,
            state: shippingState,
            zip: shippingZip,
            country: shippingCountry,
          },
          paymentMethod: selectedMethod,
          bankTransferConfirmed: selectedMethod === 'bank_transfer',
          paymentDetails: {
            method: selectedMethod,
            confirmed: selectedMethod === 'bank_transfer',
            confirmedTransfer: selectedMethod === 'bank_transfer',
          },
        };

        const res = await store.submitCheckout(payload);
        if (res.success && (res.data?.order || res.order)) {
          const order = res.data?.order || res.order;
          const orderId = order._id || order.id || order.orderNumber;
          store.closeCheckout();
          window.location.hash = `#/order/${orderId}`;
        }
      }
    });
  }
}

export default CheckoutModalComponent;
