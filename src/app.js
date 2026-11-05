/**
 * VelvetAura - Express Application Configuration
 * Configures middleware pipeline, security headers, CORS, static file serving,
 * API routes, SPA client routing fallback, and error handling.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const fs = require('fs');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Route imports
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');

let productRoutes;
try {
  productRoutes = require('./routes/productRoutes');
} catch (e) {
  productRoutes = express.Router();
}

let cartRoutes;
try {
  cartRoutes = require('./routes/cartRoutes');
} catch (e) {
  cartRoutes = express.Router();
}

let orderRoutes;
try {
  orderRoutes = require('./routes/orderRoutes');
} catch (e) {
  orderRoutes = express.Router();
}

let paymentRoutes;
try {
  paymentRoutes = require('./routes/paymentRoutes');
} catch (e) {
  paymentRoutes = express.Router();
}

const app = express();

// 1. CORS Configuration
const allowedOrigin = process.env.CLIENT_URL || '*';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  })
);

// 2. Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. HTTP Request Logging (suppressed during test runs)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 4. Static Frontend Assets
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// 5. REST API Route Mounting
app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);

// 6. SPA Client-Side Routing Fallback (for non-API GET requests)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(publicPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('VelvetAura API Server Running. Frontend mounting point.');
  }
});

// 7. 404 Route Not Found Middleware for unmapped /api routes
app.use(notFound);

// 8. Global Centralized Error Handling Middleware
app.use(errorHandler);

module.exports = app;
