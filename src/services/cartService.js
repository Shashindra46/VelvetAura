/**
 * VelvetAura - Shopping Cart Business Logic & Pricing Engine Service
 * 
 * Provides pure financial calculation functions, cart lifecycle operations,
 * stock validation routines, and user cart reset mechanisms.
 */

const Cart = require('../models/Cart');
const Product = require('../models/Product');

/**
 * Pure mathematical calculation engine for cart financial totals:
 * - Subtotal = sum(price * qty), rounded to 2 decimal places
 * - Tax = 8% of subtotal, rounded half-up to 2 decimals
 * - Shipping = $0.00 if subtotal == 0 or subtotal >= $50.00, otherwise $5.99
 * - GrandTotal = subtotal + tax + shipping, rounded to 2 decimals
 * - ItemCount = sum(quantity)
 * 
 * @param {Array<{ price: number, quantity: number }>} items 
 * @returns {{ subtotal: number, tax: number, shipping: number, grandTotal: number, itemCount: number }}
 */
function calculatePricing(items = []) {
  if (!Array.isArray(items)) {
    return {
      subtotal: 0.0,
      tax: 0.0,
      shipping: 0.0,
      grandTotal: 0.0,
      itemCount: 0,
    };
  }

  const rawSubtotal = items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return sum + qty * price;
  }, 0);

  const subtotal = Math.round(rawSubtotal * 100) / 100;
  const tax = Math.round(subtotal * 0.08 * 100) / 100;

  let shipping = 0.0;
  if (subtotal > 0 && subtotal < 50.0) {
    shipping = 5.99;
  }

  const grandTotal = Math.round((subtotal + tax + shipping) * 100) / 100;
  const itemCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

  return {
    subtotal,
    tax,
    shipping,
    grandTotal,
    itemCount,
  };
}

/**
 * Retrieves or creates active shopping cart for an authenticated user
 * @param {string|mongoose.Types.ObjectId} userId 
 * @returns {Promise<Cart>} Active cart document with populated product details
 */
async function getOrCreateCart(userId) {
  let cart = await Cart.findOne({ user: userId });

  if (!cart) {
    cart = await Cart.create({
      user: userId,
      items: [],
      subtotal: 0.0,
      tax: 0.0,
      shipping: 0.0,
      grandTotal: 0.0,
      itemCount: 0,
    });
  }

  cart.recalculateTotals();
  await cart.populate('items.product', 'name brand price stock image images category origin');
  return cart;
}

/**
 * Validates available catalog inventory for all line items currently in the cart
 * @param {Cart} cart 
 * @returns {Promise<{ isValid: boolean, issues: Array<Object> }>}
 */
async function validateCartStock(cart) {
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return {
      isValid: false,
      message: 'Cart is empty',
      issues: [],
    };
  }

  const issues = [];

  for (const item of cart.items) {
    const productId = item.product?._id || item.product;
    const product = await Product.findById(productId);

    if (!product) {
      issues.push({
        productId,
        name: item.name,
        requestedQty: item.quantity,
        availableStock: 0,
        reason: 'Product not found in catalog',
      });
      continue;
    }

    if (product.stock < item.quantity) {
      issues.push({
        productId,
        name: product.name,
        requestedQty: item.quantity,
        availableStock: product.stock,
        reason: `Requested quantity (${item.quantity}) exceeds available inventory (${product.stock})`,
      });
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Clears all items from user cart and resets all pricing counters to zero
 * @param {string|mongoose.Types.ObjectId} userId 
 * @returns {Promise<Cart>} Cleared cart document
 */
async function clearUserCart(userId) {
  const cart = await getOrCreateCart(userId);
  cart.items = [];
  cart.recalculateTotals();
  await cart.save();
  return cart;
}

module.exports = {
  calculatePricing,
  getOrCreateCart,
  validateCartStock,
  clearUserCart,
};
