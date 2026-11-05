/**
 * VelvetAura - Payment Gateway Routes
 * Mounts PayHere notification webhook and payment configuration endpoints.
 */

const express = require('express');
const router = express.Router();
const {
  handlePayHereNotify,
  getPayHerePublicConfig,
} = require('../controllers/paymentController');

// PayHere Webhook (IPN / Notify callback)
router.post('/payhere/notify', handlePayHereNotify);

// Public PayHere Gateway Config
router.get('/payhere/config', getPayHerePublicConfig);

module.exports = router;
