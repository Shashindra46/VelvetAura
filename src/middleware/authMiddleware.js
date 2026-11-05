/**
 * VelvetAura - Authentication & Authorization Middleware
 * Verifies JSON Web Tokens in HTTP Authorization Bearer headers
 * and injects the authenticated User document into the request context.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware: enforces authenticated access via Bearer JWT token
 */
const protect = async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
      error: 'Not authorized, no token provided',
    });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'velvetaura_luxury_secret_jwt_key_2026_secure'
    );

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, user not found',
        error: 'Not authorized, user not found',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token has expired',
        error: 'Not authorized, token has expired',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Not authorized, invalid token',
      error: 'Not authorized, invalid token',
    });
  }
};

/**
 * Optional authentication middleware:
 * Attaches req.user if a valid token is provided, but continues as guest if not.
 */
const optionalAuth = async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'velvetaura_luxury_secret_jwt_key_2026_secure'
    );
    const user = await User.findById(decoded.id).select('-password');
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }

  next();
};

/**
 * Admin authorization middleware:
 * Enforces role === 'admin' on previously authenticated req.user.
 * Returns 403 Forbidden if user is missing or not an administrator.
 */
const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied: Administrator privileges required',
    error: 'Forbidden',
  });
};

module.exports = {
  protect,
  optionalAuth,
  admin,
};
