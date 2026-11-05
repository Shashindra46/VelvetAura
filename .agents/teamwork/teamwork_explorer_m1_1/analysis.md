# Express Server & Application Architecture Analysis — VelvetAura

**Author**: `teamwork_explorer_m1_1`  
**Milestone**: M1 (Backend Foundation & Data Persistence)  
**Date**: 2026-11-04  
**Target Files**:
- `package.json`
- `.env.example`
- `server.js`
- `src/app.js`
- `src/middleware/errorMiddleware.js`
- `src/routes/healthRoutes.js`

---

## 1. Executive Summary & Design Scope

This document provides the authoritative architectural design and concrete code specifications for the foundational Express server, middleware pipeline, package configuration, and lifecycle management for the **VelvetAura** luxury imported beauty e-commerce platform.

### Scope Boundaries for Explorer 1
1. **`package.json`**: Define scripts, production dependencies, development dependencies, engine targets, and module configuration.
2. **`.env.example`**: Specify all configuration parameters with sane defaults.
3. **`src/app.js`**: Configure Express instance, security headers, CORS, body parsers, static file serving, route mounting, 404 handler, and centralized error handler.
4. **`server.js`**: Establish server startup lifecycle, port binding, dual-mode database connection invocation, and graceful shutdown signal traps (`SIGINT`, `SIGTERM`, unhandled exceptions).
5. **`src/middleware/errorMiddleware.js`**: Implement structured 404 handler and universal JSON error handler normalizing Mongoose errors (CastError, ValidationError, duplicate key 11000) and JWT errors.
6. **`src/routes/healthRoutes.js`**: Provide the `/api/health` endpoint reporting system status, uptime, and database connection mode (`memory` vs `external`).

---

## 2. Dependency & Module System Analysis

### 2.1 Module System Choice: CommonJS vs ESM
- **Evaluation**: While ES Modules (`"type": "module"`) are modern, running Jest on Windows with pure ESM requires `NODE_OPTIONS=--experimental-vm-modules`, cross-env scripts, and strict `.js` extensions on every internal import, which creates friction and fragility across different Node versions and Windows shell environments.
- **Decision**: Adopt standard **CommonJS** (`require` / `module.exports`). CommonJS provides 100% out-of-the-box compatibility with `jest`, `supertest`, `mongoose`, `mongodb-memory-server`, `bcryptjs`, and Windows path handling without any experimental flags or transpilation.

### 2.2 Dependency Inventory
| Package | Version | Classification | Purpose |
|---|---|---|---|
| `express` | `^4.19.2` | Production | Core REST API web framework |
| `mongoose` | `^8.3.0` | Production | MongoDB Object-Document Mapper |
| `mongodb-memory-server` | `^9.2.0` | Production | In-memory MongoDB engine for zero-dependency local runs & tests |
| `bcryptjs` | `^2.4.3` | Production | Pure JavaScript password hashing (avoids `node-gyp` Windows build issues) |
| `jsonwebtoken` | `^9.0.2` | Production | Stateless JWT token issuance and verification |
| `cors` | `^2.8.5` | Production | Cross-Origin Resource Sharing middleware |
| `dotenv` | `^16.4.5` | Production | Environment variable loader from `.env` |
| `morgan` | `^1.10.0` | Production | HTTP request logging (suppressed during tests) |
| `jest` | `^29.7.0` | Development | Automated testing framework for `npm test` |
| `supertest` | `^6.3.4` | Development | In-process HTTP assertion library for API endpoints |
| `nodemon` | `^3.1.0` | Development | Dev file watcher and server auto-reloader |

---

## 3. Concrete File Specifications

### 3.1 `package.json`
```json
{
  "name": "velvetaura",
  "version": "1.0.0",
  "description": "VelvetAura - Luxury Imported Beauty E-Commerce Platform",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "seed": "node src/data/seed.js",
    "test": "jest --runInBand --detectOpenHandles --forceExit",
    "test:e2e": "node tests/e2e/runner.js"
  },
  "keywords": [
    "velvetaura",
    "ecommerce",
    "express",
    "mongodb",
    "glassmorphism",
    "luxury-beauty"
  ],
  "author": "VelvetAura Team",
  "license": "ISC",
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "jsonwebtoken": "^9.0.2",
    "mongodb-memory-server": "^9.2.0",
    "mongoose": "^8.3.0",
    "morgan": "^1.10.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "nodemon": "^3.1.0",
    "supertest": "^6.3.4"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

### 3.2 `.env.example`
```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Connection
# If MONGODB_URI is blank or unreachable, server automatically activates in-memory MongoDB
MONGODB_URI=

# JWT Authentication
JWT_SECRET=velvetaura_luxury_secret_jwt_key_2026_secure
JWT_EXPIRES_IN=7d

# CORS Allowed Origin
CLIENT_URL=http://localhost:5000
```

---

### 3.3 `server.js` (Server Lifecycle & Graceful Shutdown)
Key requirements:
1. Load environment variables first.
2. Initialize database connection via `connectDB()`.
3. Start listening on `process.env.PORT || 5000`.
4. Capture `SIGINT`, `SIGTERM`, `unhandledRejection`, and `uncaughtException`.
5. On shutdown: close HTTP listener, close database connection (`disconnectDB()`), and exit with code 0.

```javascript
require('dotenv').config();
const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');

const PORT = process.env.PORT || 5000;
let server;

async function startServer() {
  try {
    // Connect to database (external MongoDB URI or fallback to MongoMemoryServer)
    await connectDB();

    server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`  VelvetAura Server Running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`  Listening on port: ${PORT}`);
      console.log(`  Local URL: http://localhost:${PORT}`);
      console.log(`====================================================`);
    });
  } catch (error) {
    console.error('[Server] Critical failure during startup:', error);
    process.exit(1);
  }
}

let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('[Server] HTTP listener closed.');
      try {
        await disconnectDB();
        console.log('[Server] Database connections closed cleanly.');
        process.exit(0);
      } catch (err) {
        console.error('[Server] Error during database disconnection:', err);
        process.exit(1);
      }
    });

    // Forced shutdown timer if graceful closure exceeds 5 seconds
    setTimeout(() => {
      console.error('[Server] Forced shutdown: connections did not close in time.');
      process.exit(1);
    }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

startServer();
```

---

### 3.4 `src/app.js` (Express Pipeline & Middleware)
Key requirements:
1. Export the Express `app` directly (DO NOT call `app.listen()` here).
2. Configure CORS for cross-origin or local requests.
3. Configure `express.json()` and `express.urlencoded()`.
4. Enable `morgan('dev')` in non-test environments.
5. Serve `public/` directory statically for frontend assets.
6. Mount API routes:
   - `/api/health` -> `healthRoutes`
   - `/api/auth` -> `authRoutes`
   - `/api/products` -> `productRoutes` (M2)
   - `/api/cart` -> `cartRoutes` (M2)
   - `/api/orders` -> `orderRoutes` (M2)
7. SPA fallback routing for client-side HTML5 history: Any non-`/api` GET request serves `public/index.html` if it exists.
8. 404 handler for unmatched `/api/*` routes.
9. Centralized error handling middleware.

```javascript
const express = require('express');
const cors = require('cors');
const path = require('path');
const morgan = require('morgan');
const fs = require('fs');

const { notFound, errorHandler } = require('./middleware/errorMiddleware');

// Route imports
const healthRoutes = require('./routes/healthRoutes');
// In M1, authRoutes is required. Other routes can be loaded if present or safely stubbed.
let authRoutes;
try {
  authRoutes = require('./routes/authRoutes');
} catch (e) {
  authRoutes = express.Router();
}

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

const app = express();

// 1. CORS Configuration
const allowedOrigin = process.env.CLIENT_URL || '*';
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 2. Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 3. HTTP Request Logging (disabled during automated test execution)
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

// 6. SPA Client-Side Routing Fallback (for non-API paths)
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

// 7. Route Not Found (404) for unmatched /api routes
app.use(notFound);

// 8. Centralized Global Error Handler
app.use(errorHandler);

module.exports = app;
```

---

### 3.5 `src/middleware/errorMiddleware.js` (Error Normalization)
Key requirements:
1. `notFound`: Generates a standard 404 response for unknown routes.
2. `errorHandler`: Intercepts all unhandled errors, logs if appropriate, and guarantees a JSON payload with `{ success: false, error: ... }`.
3. Handles Mongoose:
   - `CastError`: e.g. Invalid ObjectId -> returns 404 with "Resource not found with ID: [val]".
   - `ValidationError`: Schema validation failure -> returns 400 with mapped validation messages.
   - Code `11000`: Duplicate key violation (e.g. duplicate email) -> returns 400 or 409 with "Duplicate field value entered".
4. Handles JWT:
   - `JsonWebTokenError` -> returns 401 "Invalid authorization token".
   - `TokenExpiredError` -> returns 401 "Authorization token has expired".
5. Suppresses stack traces in production (`process.env.NODE_ENV === 'production'`).

```javascript
/**
 * 404 Not Found Middleware
 * Intercepts requests that did not match any registered routes or static assets.
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route Not Found - ${req.method} ${req.originalUrl}`);
  res.status(404);
  next(error);
};

/**
 * Global Centralized Error Handling Middleware
 * Normalizes error responses across database, validation, auth, and runtime errors.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  let message = err.message || 'Internal Server Error';

  // 1. Mongoose Bad ObjectId (CastError)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = `Resource not found with ID: ${err.value}`;
  }

  // 2. Mongoose Validation Error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(', ');
  }

  // 3. Mongoose Duplicate Key Error (code 11000)
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  }

  // 4. JWT Verification Errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token has expired';
  }

  // Ensure JSON response with proper header
  res.status(statusCode).json({
    success: false,
    error: message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = {
  notFound,
  errorHandler,
};
```

---

### 3.6 `src/routes/healthRoutes.js` (Operational Readiness Probe)
Key requirements:
1. Endpoint: `GET /api/health`
2. Status: HTTP 200
3. Response:
   ```json
   {
     "status": "ok",
     "database": "connected",
     "mode": "memory",
     "uptime": 12.34,
     "timestamp": "2026-11-04T11:05:00.000Z"
   }
   ```
4. Reads connection state from Mongoose and `getDbMode()` helper from `src/config/db`.

```javascript
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Dynamic require or fallback for getDbMode
let getDbMode = () => 'memory';
try {
  const dbConfig = require('../config/db');
  if (typeof dbConfig.getDbMode === 'function') {
    getDbMode = dbConfig.getDbMode;
  }
} catch (e) {
  // db.js not yet loaded
}

router.get('/', (req, res) => {
  const isDbConnected = mongoose.connection && mongoose.connection.readyState === 1;

  res.status(200).json({
    status: 'ok',
    database: isDbConnected ? 'connected' : 'disconnected',
    mode: getDbMode(),
    uptime: Math.round(process.uptime() * 100) / 100,
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
```

---

## 4. Architectural Verification Against Requirements

| Requirement | Contract Clause | Architectural Provision | Status |
|---|---|---|---|
| R1 (Backend API & Persistence) | Express REST service | `src/app.js` with full JSON & CORS pipeline | SATISFIED |
| R4 (Dual-mode MongoDB Support) | Fallback & connection modes | `src/routes/healthRoutes.js` reports mode; `server.js` orchestrates clean connection & teardown | SATISFIED |
| R5 (Automated Test Suite) | Supertest integration | `src/app.js` exported without `.listen()`, enabling in-process testing | SATISFIED |
| F1 (Express Server & App Config) | Modular setup with error handling | `server.js` + `src/app.js` + `src/middleware/errorMiddleware.js` | SATISFIED |
| F7 (Health Check API) | `/api/health` returning server status & mode | `src/routes/healthRoutes.js` with dynamic Mongoose state inspection | SATISFIED |

---

## 5. Worker Implementation Checklist

When implementing Milestone 1, the worker should execute in this sequence:
1. [ ] Create `package.json` with exact scripts and dependencies as defined in Section 3.1.
2. [ ] Create `.env.example` with environment template as defined in Section 3.2.
3. [ ] Create `src/middleware/errorMiddleware.js` with `notFound` and `errorHandler` as defined in Section 3.5.
4. [ ] Create `src/routes/healthRoutes.js` as defined in Section 3.6.
5. [ ] Create `src/app.js` as defined in Section 3.4.
6. [ ] Create `server.js` as defined in Section 3.3.
7. [ ] Run `npm install` to install dependencies.
8. [ ] Verify `src/app.js` boots with `supertest` in test runner.
