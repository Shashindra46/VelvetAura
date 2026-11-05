/**
 * VelvetAura - Global Error Handling Middleware
 * Provides normalized, structured JSON error payloads across all routes.
 */

/**
 * 404 Not Found Middleware
 * Intercepts requests that do not match registered API endpoints or static assets.
 */
const notFound = (req, res, next) => {
  const message = `Route Not Found - ${req.method} ${req.originalUrl}`;
  res.status(404).json({
    success: false,
    message,
    error: message,
  });
};

/**
 * Global Centralized Error Handling Middleware
 * Intercepts operational and runtime errors, normalizing database, validation,
 * and authentication errors into standard JSON responses.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode =
    err.status ||
    err.statusCode ||
    (res.statusCode && res.statusCode !== 200 ? res.statusCode : 500);

  let message = err.message || 'Internal Server Error';

  // 1. Express body-parser / JSON SyntaxError (malformed JSON payloads)
  if (
    (err instanceof SyntaxError || err.name === 'SyntaxError') &&
    (err.status === 400 || err.statusCode === 400 || err.type === 'entity.parse.failed')
  ) {
    statusCode = 400;
    message = 'Invalid JSON payload. Please verify syntax.';
  }

  // 2. Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = `Resource not found with ID: ${err.value}`;
  }

  // 3. Mongoose Schema Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // 4. Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // 5. JWT Verification Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Not authorized, invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Not authorized, token has expired';
  }

  // Always return consistent JSON structure with message, error, and success: false
  res.status(statusCode).json({
    success: false,
    message,
    error: message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
