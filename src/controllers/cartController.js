/**
 * VelvetAura - Shopping Cart Controller
 * 
 * Handles cart CRUD operations:
 * - GET /api/cart: retrieve active cart with live pricing
 * - POST /api/cart/items: add item with strict stock validation
 * - PUT /api/cart/items/:productId: update quantity or remove if zero
 * - DELETE /api/cart/items/:productId: remove single line item
 * - DELETE /api/cart: clear entire cart
 */

const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { getOrCreateCart } = require('../services/cartService');

/**
 * @desc    Get active shopping cart for authenticated user
 * @route   GET /api/cart
 * @access  Private
 */
const getCart = async (req, res, next) => {
  try {
    const cart = await getOrCreateCart(req.user._id);
    return res.status(200).json({
      success: true,
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Add item to cart or increment quantity
 * @route   POST /api/cart/items
 * @access  Private
 */
const addToCart = async (req, res, next) => {
  try {
    const { productId, quantity } = req.body;

    // 1. Validate Product ID presence and ObjectId format
    if (!productId || typeof productId !== 'string' && !(productId instanceof mongoose.Types.ObjectId)) {
      return res.status(400).json({
        success: false,
        message: 'Product ID is required',
        error: 'Product ID is required',
      });
    }

    const prodIdStr = String(productId);
    if (!mongoose.Types.ObjectId.isValid(prodIdStr)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    // 2. Validate Quantity (must be integer >= 1)
    if (quantity === undefined || quantity === null) {
      // Default to 1 if not specified
    } else {
      const numQty = Number(quantity);
      if (isNaN(numQty) || !Number.isInteger(numQty) || numQty <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be a positive integer (>= 1)',
          error: 'Invalid quantity',
        });
      }
    }

    const requestedQty = quantity !== undefined && quantity !== null ? Number(quantity) : 1;

    // 3. Lookup Product in Catalog
    const product = await Product.findById(prodIdStr);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found in catalog',
        error: 'Product not found',
      });
    }

    // 4. Validate Stock
    if (product.stock === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product is currently out of stock',
        error: 'Out of stock',
      });
    }

    // 5. Fetch or create User Cart
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    // Check existing item in cart
    const existingIndex = cart.items.findIndex(
      (item) => item.product.toString() === prodIdStr
    );

    const currentQtyInCart = existingIndex > -1 ? cart.items[existingIndex].quantity : 0;
    const desiredTotalQty = currentQtyInCart + requestedQty;

    if (desiredTotalQty > product.stock) {
      return res.status(400).json({
        success: false,
        message: `Requested quantity (${desiredTotalQty}) exceeds available inventory (${product.stock})`,
        error: 'Exceeds stock limit',
      });
    }

    // 6. Mutate Cart Items
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity = desiredTotalQty;
      cart.items[existingIndex].price = product.price;
    } else {
      const primaryImage = product.image || (Array.isArray(product.images) && product.images[0]) || '';
      cart.items.push({
        product: product._id,
        name: product.name,
        brand: product.brand,
        price: product.price,
        quantity: requestedQty,
        image: primaryImage,
      });
    }

    // 7. Recalculate financial totals and persist
    cart.recalculateTotals();
    await cart.save();
    await cart.populate('items.product', 'name brand price stock image images category origin');

    return res.status(200).json({
      success: true,
      message: 'Item added to cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update quantity of an existing cart line item
 * @route   PUT /api/cart/items/:productId
 * @access  Private
 */
const updateCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;

    // Validate productId format
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    // Validate quantity parameter
    if (quantity === undefined || quantity === null) {
      return res.status(400).json({
        success: false,
        message: 'Quantity is required',
        error: 'Quantity is required',
      });
    }

    const numQty = Number(quantity);
    if (isNaN(numQty) || !Number.isInteger(numQty) || numQty < 0) {
      return res.status(400).json({
        success: false,
        message: 'Quantity must be a non-negative integer (>= 0)',
        error: 'Invalid quantity',
      });
    }

    // Retrieve user cart
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
        error: 'Cart not found',
      });
    }

    // Find line item
    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId || item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart',
        error: 'Item not found in cart',
      });
    }

    // If quantity is 0, remove line item
    if (numQty === 0) {
      cart.items.splice(itemIndex, 1);
    } else {
      // Validate requested quantity against current product stock
      const product = await Product.findById(cart.items[itemIndex].product);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found in catalog',
          error: 'Product not found',
        });
      }

      if (numQty > product.stock) {
        return res.status(400).json({
          success: false,
          message: `Requested quantity (${numQty}) exceeds available inventory (${product.stock})`,
          error: 'Exceeds stock limit',
        });
      }

      cart.items[itemIndex].quantity = numQty;
      cart.items[itemIndex].price = product.price;
    }

    cart.recalculateTotals();
    await cart.save();
    await cart.populate('items.product', 'name brand price stock image images category origin');

    return res.status(200).json({
      success: true,
      message: 'Cart updated',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Remove a specific line item from the cart
 * @route   DELETE /api/cart/items/:productId
 * @access  Private
 */
const removeCartItem = async (req, res, next) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid product ID format',
        error: 'Invalid product ID format',
      });
    }

    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found',
        error: 'Cart not found',
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId || item._id.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart',
        error: 'Item not found in cart',
      });
    }

    cart.items.splice(itemIndex, 1);
    cart.recalculateTotals();
    await cart.save();
    await cart.populate('items.product', 'name brand price stock image images category origin');

    return res.status(200).json({
      success: true,
      message: 'Item removed from cart',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Clear all items from active cart and reset totals
 * @route   DELETE /api/cart
 * @access  Private
 */
const clearCart = async (req, res, next) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id });
    if (!cart) {
      cart = new Cart({ user: req.user._id, items: [] });
    }

    cart.items = [];
    cart.recalculateTotals();
    await cart.save();

    return res.status(200).json({
      success: true,
      message: 'Cart cleared successfully',
      cart,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
};
