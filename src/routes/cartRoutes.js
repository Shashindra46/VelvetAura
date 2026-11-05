/**
 * VelvetAura - Shopping Cart Routes
 * 
 * Maps cart endpoints protected by JWT authentication:
 * - GET    /api/cart                  - Fetch active cart
 * - POST   /api/cart/items            - Add item (with stock validation)
 * - PUT    /api/cart/items/:productId - Update quantity
 * - DELETE /api/cart/items/:productId - Remove line item
 * - DELETE /api/cart                  - Clear cart
 */

const express = require('express');
const {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} = require('../controllers/cartController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Enforce JWT authentication on all cart endpoints
router.use(protect);

router
  .route('/')
  .get(getCart)
  .post(addToCart)
  .delete(clearCart);

router
  .route('/items')
  .post(addToCart);

router
  .route('/items/:productId')
  .put(updateCartItem)
  .delete(removeCartItem);

// Direct productId aliases for flexible client calls
router
  .route('/:productId')
  .put(updateCartItem)
  .delete(removeCartItem);

router.delete('/clear', clearCart);

module.exports = router;
