/**
 * VelvetAura - Base Component & UI Helpers
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

/**
 * Formats numeric price into Sri Lankan Rupee (LKR) currency string.
 * Uses standard "Rs. X,XXX.XX" format with thousands separators.
 * @param {number} amount 
 * @param {Object} [options]
 * @param {string} [options.prefix='Rs. '] - Currency symbol prefix ('Rs. ' or 'LKR ')
 * @returns {string} e.g. "Rs. 28,500.00"
 */
export function formatPrice(amount, options = {}) {
  const val = Number(amount) || 0;
  const prefix = options.prefix !== undefined ? options.prefix : 'Rs. ';
  return `${prefix}${val.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Maps raw payment method codes to user-facing badges with icons.
 * @param {'cod' | 'bank_transfer' | 'payhere' | string} method 
 * @returns {string}
 */
export function formatPaymentMethod(method) {
  const map = {
    'cod': '💵 Cash on Delivery',
    'bank_transfer': '🏦 Direct Bank Transfer',
    'payhere': '💳 PayHere Gateway',
    'mock_credit_card': '💳 Credit Card',
  };
  return map[method] || `💳 ${method || 'Standard Payment'}`;
}

/**
 * Maps raw payment status codes to user-friendly status descriptions.
 * @param {'pending' | 'paid' | 'succeeded' | 'failed' | string} status 
 * @returns {string}
 */
export function formatPaymentStatus(status) {
  const map = {
    'pending': 'Pending Payment',
    'paid': 'Payment Received',
    'succeeded': 'Payment Completed',
    'failed': 'Payment Failed',
  };
  return map[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Pending');
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
 * @returns {string} e.g. "Nov 4, 2026, 12:45 PM"
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
