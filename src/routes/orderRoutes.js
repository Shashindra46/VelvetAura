/**
 * VelvetAura - Order Management Routes
 * 
 * Maps order endpoints protected by JWT authentication:
 * - POST /api/orders/checkout   - Process cart checkout and payment
 * - GET  /api/orders/my-orders  - Order history for authenticated user
 * - GET  /api/orders/:id        - Order details by ID (owner/admin)
 */

const express = require('express');
const {
  checkout,
  getMyOrders,
  getOrderById,
  getAllOrders,
  updateOrderStatus,
} = require('../controllers/orderController');
const { protect, admin } = require('../middleware/authMiddleware');

const router = express.Router();

// Enforce JWT authentication on all order endpoints
router.use(protect);

// Customer endpoints
router.post('/checkout', checkout);
router.get('/my-orders', getMyOrders);

// Admin-only order oversight & status updates
router.get('/', admin, getAllOrders);
router.put('/:id/status', admin, updateOrderStatus);
router.patch('/:id/status', admin, updateOrderStatus);
router.put('/:id/payment-status', admin, updateOrderStatus);
router.patch('/:id/payment-status', admin, updateOrderStatus);

// Individual order detail (owner or admin)
router.get('/:id', getOrderById);

module.exports = router;
