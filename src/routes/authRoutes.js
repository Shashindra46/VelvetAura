/**
 * VelvetAura - Authentication Routes
 * Exposes customer registration, login, profile retrieval, and profile update endpoints.
 */

const express = require('express');
const {
  register,
  login,
  getMe,
  updateProfile,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);

module.exports = router;
