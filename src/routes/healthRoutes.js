/**
 * VelvetAura - Health & Diagnostic Probe Route
 * Reports application health, uptime, and dual-mode database connection state.
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Dynamic resolution of getDbMode helper
let getDbMode = () => 'memory';
try {
  const dbConfig = require('../config/db');
  if (typeof dbConfig.getDbMode === 'function') {
    getDbMode = dbConfig.getDbMode;
  }
} catch (e) {
  // db module fallback
}

router.get('/', (req, res) => {
  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;
  const currentMode = getDbMode();

  const payload = {
    status: isDbConnected ? 'ok' : 'degraded',
    service: 'VelvetAura E-Commerce API',
    database: isDbConnected ? 'connected' : 'disconnected',
    mode: currentMode === 'disconnected' ? (process.env.DB_MODE || 'memory') : currentMode,
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  };

  const statusCode = isDbConnected ? 200 : 503;
  res.status(statusCode).json(payload);
});

module.exports = router;
