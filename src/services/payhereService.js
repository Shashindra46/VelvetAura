/**
 * VelvetAura - PayHere Payment Gateway Integration Service
 * 
 * Provides official PayHere Sri Lanka cryptographic hash generation,
 * webhook (IPN) signature verification, environment configuration, and status mapping.
 * 
 * Official PayHere Spec:
 * Checkout Hash:
 *   strtoupper(md5(merchant_id + order_id + amount_formatted + currency + strtoupper(md5(merchant_secret))))
 * 
 * Webhook (Notify) Signature:
 *   strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
 */

const crypto = require('crypto');

/**
 * Returns active PayHere configuration resolved from environment variables.
 * @returns {Object} PayHere config
 */
function getPayHereConfig() {
  const mode = (process.env.PAYHERE_MODE || 'sandbox').toLowerCase().trim();
  const isProduction = mode === 'production';
  const merchantId = (process.env.PAYHERE_MERCHANT_ID || '1211149').trim();
  const merchantSecret = (process.env.PAYHERE_MERCHANT_SECRET || '').trim();
  const currency = (process.env.PAYHERE_CURRENCY || 'LKR').toUpperCase().trim();

  return {
    merchantId,
    merchantSecret,
    mode: isProduction ? 'production' : 'sandbox',
    currency,
    checkoutUrl: isProduction
      ? 'https://www.payhere.lk/pay/checkout'
      : 'https://sandbox.payhere.lk/pay/checkout',
    notifyUrl: process.env.PAYHERE_NOTIFY_URL || '/api/payments/payhere/notify',
    returnUrl: process.env.PAYHERE_RETURN_URL || '/#/order/',
    cancelUrl: process.env.PAYHERE_CANCEL_URL || '/#/cart',
  };
}

/**
 * Computes PayHere MD5 checkout initiation hash.
 * Supports both object params and positional arguments.
 *
 * @param {Object|string} arg1 - { merchantId, orderId, amount, currency, merchantSecret } OR merchantId
 * @param {string} [arg2] - orderId
 * @param {number|string} [arg3] - amount
 * @param {string} [arg4='LKR'] - currency
 * @param {string} [arg5] - merchantSecret
 * @returns {string} 32-character uppercase MD5 hex string
 */
function generatePayHereHash(arg1, arg2, arg3, arg4, arg5) {
  let merchantId;
  let orderId;
  let amount;
  let currency;
  let merchantSecret;

  if (typeof arg1 === 'object' && arg1 !== null) {
    merchantId = arg1.merchantId || arg1.merchant_id;
    orderId = arg1.orderId || arg1.order_id;
    amount = arg1.amount;
    currency = arg1.currency || 'LKR';
    merchantSecret = arg1.merchantSecret || arg1.merchant_secret || process.env.PAYHERE_MERCHANT_SECRET;
  } else {
    merchantId = arg1;
    orderId = arg2;
    amount = arg3;
    currency = arg4 || 'LKR';
    merchantSecret = arg5 || process.env.PAYHERE_MERCHANT_SECRET;
  }

  if (!merchantId || !orderId || amount === undefined || amount === null || !merchantSecret) {
    throw new Error('Missing required parameters for PayHere hash generation');
  }

  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount < 0) {
    throw new Error('Amount must be a non-negative number');
  }

  // Strictly 2 decimal places with dot separator, no thousands separator
  const amountFormatted = numAmount.toFixed(2);

  // 1. Compute uppercase MD5 hash of merchant secret
  const hashedSecret = crypto
    .createHash('md5')
    .update(String(merchantSecret).trim())
    .digest('hex')
    .toUpperCase();

  // 2. Concatenate: merchant_id + order_id + amount_formatted + currency + hashedSecret
  const hashString = `${String(merchantId).trim()}${String(orderId).trim()}${amountFormatted}${String(currency).trim().toUpperCase()}${hashedSecret}`;

  // 3. Compute uppercase MD5 hash of the combined string
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}

/**
 * Verifies authenticity of inbound PayHere Webhook (IPN / Notify) payload.
 * Supports both object params and positional arguments.
 *
 * @param {Object} payload - Inbound payload or parameter object
 * @param {string} [secret] - Merchant secret override
 * @returns {boolean} True if signature is valid and authentic
 */
function verifyPayHereSignature(payload, secret) {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const merchantSecret = secret || payload.merchantSecret || payload.merchant_secret || process.env.PAYHERE_MERCHANT_SECRET;
  if (!merchantSecret) {
    return false;
  }

  const merchantId = payload.merchant_id || payload.merchantId;
  const orderId = payload.order_id || payload.orderId;
  let payhereAmount = payload.payhere_amount !== undefined ? payload.payhere_amount : payload.payhereAmount;
  const payhereCurrency = payload.payhere_currency || payload.payhereCurrency;
  const statusCode = payload.status_code !== undefined ? payload.status_code : payload.statusCode;
  const md5sig = payload.md5sig || payload.signature;

  if (
    merchantId === undefined ||
    orderId === undefined ||
    payhereAmount === undefined ||
    payhereCurrency === undefined ||
    statusCode === undefined ||
    !md5sig
  ) {
    return false;
  }

  // Format amount to 2 decimal places if passed as a number or string number
  if (typeof payhereAmount === 'number') {
    payhereAmount = payhereAmount.toFixed(2);
  } else {
    const parsed = Number(payhereAmount);
    if (!isNaN(parsed) && String(payhereAmount).indexOf('.') === -1) {
      payhereAmount = parsed.toFixed(2);
    } else {
      payhereAmount = String(payhereAmount).trim();
    }
  }

  // 1. Hash the secret to uppercase MD5
  const hashedSecret = crypto
    .createHash('md5')
    .update(String(merchantSecret).trim())
    .digest('hex')
    .toUpperCase();

  // 2. Concatenate parameters: merchant_id + order_id + payhere_amount + payhere_currency + status_code + hashedSecret
  const hashString = `${String(merchantId).trim()}${String(orderId).trim()}${payhereAmount}${String(payhereCurrency).trim().toUpperCase()}${String(statusCode).trim()}${hashedSecret}`;

  // 3. Compute expected signature
  const localSignature = crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();

  // 4. Case-insensitive comparison
  return localSignature === String(md5sig).trim().toUpperCase();
}

/**
 * Maps PayHere numeric status codes to internal order payment status.
 * @param {number|string} statusCode 
 * @returns {'paid' | 'pending' | 'failed'}
 */
function mapPayHereStatus(statusCode) {
  const code = Number(statusCode);
  if (code === 2) {
    return 'paid';
  }
  if (code === 0) {
    return 'pending';
  }
  if (code === -1 || code === -2 || code === -3) {
    return 'failed';
  }
  return 'pending';
}

module.exports = {
  getPayHereConfig,
  generatePayHereHash,
  verifyPayHereSignature,
  verifyPayHereNotifySignature: verifyPayHereSignature, // alias for spec compatibility
  mapPayHereStatus,
};
