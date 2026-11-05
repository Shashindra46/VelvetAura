/**
 * VelvetAura - Product Catalog Routes
 * 
 * Maps catalog endpoints:
 * - GET /api/products/categories (taxonomy discovery, mounted before /:id)
 * - GET /api/products (listing with multi-facet filters, search, sort, pagination)
 * - GET /api/products/:id (single product detail)
 */

const express = require('express');
const {
  getProducts,
  getCategories,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
} = require('../controllers/productController');
const { protect, admin } = require('../middleware/authMiddleware');
const { uploadProductImageMiddleware } = require('../middleware/uploadMiddleware');

const router = express.Router();

// Specific routes first to prevent :id parameter shadowing
router.get('/categories', getCategories);
router.get('/', getProducts);

// Admin-only Product Image Upload endpoint (placed before /:id)
router.post('/upload', protect, admin, uploadProductImageMiddleware, uploadProductImage);

router.get('/:id', getProductById);

// Admin-only Product Management CRUD endpoints
router.post('/', protect, admin, createProduct);
router.put('/:id', protect, admin, updateProduct);
router.delete('/:id', protect, admin, deleteProduct);

module.exports = router;
