/**
 * VelvetAura - Mock Payment Authorization & Processing Service
 * 
 * Simulates credit card authorization, capture, decline triggers, and transaction receipts:
 * - Deterministic declines on cards ending in '0002' (HTTP 402)
 * - Deterministic declines on expired cards (HTTP 402)
 * - Input validation on card digits, CVV format, and expiration date (HTTP 400)
 * - Deterministic approval with TXN-VA-... transaction receipts for valid test cards
 */

/**
 * Normalizes and validates credit card expiration date.
 * Supports MM/YY and MM/YYYY formats.
 * @param {string} expDate 
 * @returns {{ valid: boolean, expired: boolean, message?: string }}
 */
function validateExpirationDate(expDate) {
  if (!expDate || typeof expDate !== 'string') {
    return { valid: false, expired: false, message: 'Expiration date is required (expected MM/YY)' };
  }

  const cleanExp = expDate.trim();
  const parts = cleanExp.split('/');
  if (parts.length !== 2) {
    return { valid: false, expired: false, message: 'Invalid expiration date format (expected MM/YY)' };
  }

  const month = parseInt(parts[0], 10);
  let year = parseInt(parts[1], 10);

  if (isNaN(month) || month < 1 || month > 12) {
    return { valid: false, expired: false, message: 'Invalid expiration month (must be 01-12)' };
  }

  if (isNaN(year)) {
    return { valid: false, expired: false, message: 'Invalid expiration year' };
  }

  // Handle 2-digit years (e.g. 28 -> 2028)
  if (year < 100) {
    year += 2000;
  }

  // Last millisecond of the expiration month
  const expiryEnd = new Date(year, month, 0, 23, 59, 59, 999);
  const now = new Date();

  if (expiryEnd < now) {
    return { valid: true, expired: true, message: 'Card has expired. Please use an active card.' };
  }

  return { valid: true, expired: false };
}

/**
 * Detects credit card brand based on starting digits
 * @param {string} cleanNumber 
 * @returns {string} Card network name
 */
function detectCardBrand(cleanNumber) {
  if (/^4/.test(cleanNumber)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(cleanNumber)) return 'Mastercard';
  if (/^3[47]/.test(cleanNumber)) return 'American Express';
  if (/^6(011|5)/.test(cleanNumber)) return 'Discover';
  return 'Credit Card';
}

/**
 * Processes mock payment transaction.
 * 
 * @param {number} amount - Total amount in USD
 * @param {Object} paymentDetails - Payment card details
 * @returns {Promise<Object>} Authorization result or decline response
 */
async function processPayment(amount, paymentDetails = {}) {
  // 1. Validate Amount
  const numAmount = Number(amount);
  if (isNaN(numAmount) || numAmount <= 0) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_AMOUNT',
      error: 'Transaction amount must be a positive number',
    };
  }

  // 2. Validate Payment Details Object
  if (!paymentDetails || typeof paymentDetails !== 'object') {
    return {
      success: false,
      statusCode: 400,
      code: 'MISSING_PAYMENT_DETAILS',
      error: 'Payment details are required',
    };
  }

  const rawCardNumber = paymentDetails.cardNumber || paymentDetails.number || '';
  const rawExpDate = paymentDetails.expDate || paymentDetails.expiryDate || '';
  const rawCvv = paymentDetails.cvv || paymentDetails.cvc || '';

  // 3. Card Number Validation
  const cleanNumber = String(rawCardNumber).replace(/[\s-]/g, '');
  if (!cleanNumber) {
    return {
      success: false,
      statusCode: 400,
      code: 'MISSING_CARD_NUMBER',
      error: 'Card number is required',
    };
  }

  if (!/^\d{13,19}$/.test(cleanNumber)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_CARD_NUMBER',
      error: 'Invalid credit card number format (must be 13-19 digits)',
    };
  }

  // 4. CVV Validation (reject empty, non-numeric, length != 3 or 4, or test decline CVV '000')
  const cleanCvv = String(rawCvv).trim();
  if (!cleanCvv || cleanCvv === '000' || !/^\d{3,4}$/.test(cleanCvv)) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_CVV',
      error: 'Invalid CVV/CVC security code',
    };
  }

  // 5. Expiration Date Check
  const expCheck = validateExpirationDate(rawExpDate);
  if (!expCheck.valid) {
    return {
      success: false,
      statusCode: 400,
      code: 'INVALID_EXPIRATION',
      error: expCheck.message,
    };
  }

  if (expCheck.expired) {
    return {
      success: false,
      statusCode: 402,
      code: 'EXPIRED_CARD',
      error: 'Card has expired. Please use an active card.',
    };
  }

  // 6. Test Card Decline Simulation (cards ending in 0002)
  if (cleanNumber.endsWith('0002')) {
    return {
      success: false,
      statusCode: 402,
      code: 'CARD_DECLINED',
      error: 'Your card was declined by the issuing bank (insufficient funds / restriction).',
    };
  }

  // 7. Successful Payment Authorization & Capture
  const cardBrand = paymentDetails.brand || detectCardBrand(cleanNumber);
  const cardLast4 = cleanNumber.slice(-4);
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const transactionId = `TXN-VA-${timestamp}-${randomSuffix}`;

  return {
    success: true,
    statusCode: 200,
    transactionId,
    status: 'succeeded',
    amount: Math.round(numAmount * 100) / 100,
    currency: 'USD',
    method: 'mock_credit_card',
    cardBrand,
    cardLast4,
    cardHolder: paymentDetails.cardHolder || 'Valued VelvetAura Customer',
    paidAt: new Date(),
    message: 'Payment authorized and captured successfully',
  };
}

module.exports = {
  processPayment,
  validateExpirationDate,
  detectCardBrand,
};
