# Dual-Mode Database Connection Architecture & Implementation Plan — VelvetAura

**Author**: `teamwork_explorer_m1_2`  
**Milestone**: Milestone 1 (Backend Foundation & Data Persistence)  
**Target File**: `src/config/db.js` & `tests/setup.js`  
**Workspace**: `g:\VelvetAura`  
**Date**: 2026-11-04  
**Status**: COMPLETE / READY FOR WORKER IMPLEMENTATION  

---

## 1. Executive Summary & Design Scope

The VelvetAura platform mandates an uncompromising zero-friction database architecture (Requirement R4). Developers and automated test suites must be able to clone and immediately run the backend (`npm start` or `npm test`) without having an external MongoDB daemon pre-installed, running, or configured on their host system.

This document details the complete architectural design and concrete code implementation for the **Dual-Mode MongoDB Connection Module** (`src/config/db.js`) and its testing companion (`tests/setup.js`).

### Core Responsibilities
1. **Primary Connection Attempt**: Connect to `process.env.MONGODB_URI` (or fallback default `mongodb://127.0.0.1:27017/velvetaura`) with a strict `3000ms` server selection timeout (`serverSelectionTimeoutMS: 3000`).
2. **Transparent In-Memory Fallback**: If the external connection fails (connection refused, timeout, network error) or if `MONGODB_URI` is explicitly omitted/empty, immediately instantiate an in-memory MongoDB instance using `mongodb-memory-server` (`MongoMemoryServer.create()`) and connect Mongoose to its ephemeral URI.
3. **Automated Seeding Hook**: In in-memory mode, evaluate if `Product.countDocuments() === 0`. If empty, dynamically trigger catalog auto-seeding so the application starts with fully populated luxury imported beauty products.
4. **Active Mode Introspection**: Export `getDbMode()` / `getDBMode()` returning `'memory' | 'external' | 'disconnected'` to support `/api/health` diagnostic probes and test assertions.
5. **Clean Teardown & Lifecycle Management**: Export `disconnectDB()` to gracefully disconnect Mongoose and shut down the `MongoMemoryServer` child daemon during application exit (`SIGINT`, `SIGTERM`) or test teardown (`afterAll`).

---

## 2. Requirement & Boundary Analysis

### 2.1 Authoritative Requirement Mapping

| Requirement | Contract Clause | Architectural Specification |
|---|---|---|
| **R4 (Database Support)** | Seamless local execution with local MongoDB or in-memory fallback | Dual-mode connection manager in `src/config/db.js` supporting both live MongoDB and `mongodb-memory-server` |
| **R4 / Dispatch** | 3000ms external connection timeout | Pass `{ serverSelectionTimeoutMS: 3000 }` to `mongoose.connect()`. Catch error on timeout and initiate fallback |
| **R4 / Dispatch** | In-memory catalog auto-seeding | Inspect collection count `Product.countDocuments() === 0`. If true and mode is `memory`, populate catalog |
| **R4 / Lifecycle** | Clean shutdown & teardown | Implement idempotent `disconnectDB()` closing Mongoose connections and stopping `mongod` daemon |
| **PROJECT.md Contract** | Health route diagnostic mode reporting | Provide `getDbMode()` returning `"memory"` or `"external"` consumed by `src/routes/healthRoutes.js` |
| **PROJECT.md Contract** | Test suite isolation | Provide `forceMemory: true` option and `clearDatabase()` utility for `tests/setup.js` |

---

## 3. Architecture & State Management of `src/config/db.js`

### 3.1 State Machine

```
                   +----------------------------------+
                   |           DISCONNECTED           |
                   |      (currentMode = 'none')      |
                   +----------------------------------+
                                     |
                       connectDB(options) called
                                     |
                +--------------------+--------------------+
                |                                         |
     options.forceMemory === true              options.forceMemory !== true
     or process.env.USE_MEMORY_DB === 'true'              |
                |                                         v
                |                         +--------------------------------+
                |                         |   Attempt External MongoDB     |
                |                         |   URI: MONGODB_URI or default  |
                |                         |   Timeout: 3000ms              |
                |                         +--------------------------------+
                |                                         |
                |                          +--------------+--------------+
                |                          | Success                     | Timeout / Error
                |                          v                             v
                |             +------------------------+    Log warning & switch
                |             |    EXTERNAL MODE       |    to fallback
                |             | (currentMode='external'|                 |
                |             +------------------------+                 |
                |                          |                             |
                +------------------------> v <---------------------------+
                              +--------------------------+
                              |   MongoMemoryServer      |
                              |   .create()              |
                              |   Connect Mongoose       |
                              |   (currentMode='memory') |
                              +--------------------------+
                                           |
                              +--------------------------+
                              |  In-Memory Mode Check:   |
                              |  Product.count === 0?    |
                              |  YES -> Auto-seed data   |
                              +--------------------------+
                                           |
                                           v
                              +--------------------------+
                              |      READY / ACTIVE      |
                              +--------------------------+
                                           |
                                  disconnectDB()
                                           v
                              +--------------------------+
                              |       DISCONNECTED       |
                              +--------------------------+
```

### 3.2 Key Design Patterns

1. **Module Singleton State**:
   - `currentMode`: tracks `'disconnected'`, `'external'`, or `'memory'`.
   - `mongod`: holds the active `MongoMemoryServer` instance when running in memory mode.
   - `isConnecting`: boolean mutex flag preventing concurrent race conditions if multiple modules call `connectDB()` simultaneously.
2. **Safe Credential Masking in Logs**:
   - External MongoDB connection URIs often embed sensitive username/password pairs (e.g., `mongodb+srv://admin:SecretPass@cluster.mongodb.net/velvetaura`).
   - All connection logging passes through `maskMongoUri()` to replace credentials with asterisks before printing to console:
     `uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')`
3. **Decoupled Auto-Seeding (Zero Circular Dependencies)**:
   - `src/data/seed.js` imports `connectDB` and `disconnectDB` to run standalone via `npm run seed`.
   - If `src/config/db.js` also statically required `src/data/seed.js`, a circular dependency cycle (`db.js` <-> `seed.js`) would occur.
   - **Solution**: The auto-seeding trigger inside `db.js` executes lazily at runtime:
     - It checks if `Product` has 0 documents.
     - If 0, it dynamically attempts to require `../data/seedProducts` or `../data/seed` safely inside a `try/catch`.
     - If the seed file does not exist yet (e.g., during early Milestone 1 development), it seeds a fallback luxury placeholder set or logs a warning without crashing the server.

---

## 4. Concrete File Specifications

### 4.1 Primary Implementation: `src/config/db.js`

Adhering to CommonJS module conventions established by Explorer 1 (`teamwork_explorer_m1_1`) for seamless Windows, Jest, and Supertest compatibility without experimental flags.

```javascript
/**
 * VelvetAura - Dual-Mode MongoDB Connection Module
 * 
 * Supports seamless connection to an external MongoDB instance with a 3000ms timeout,
 * with automatic zero-configuration fallback to an in-memory MongoDB instance
 * (mongodb-memory-server) if the external connection fails or is not configured.
 * 
 * Handles automatic catalog seeding in memory mode and provides clean teardown.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const path = require('path');
const fs = require('fs');

// Internal module state
let mongod = null;
let currentMode = 'disconnected'; // 'external' | 'memory' | 'disconnected'
let connectionPromise = null;

/**
 * Safely masks credentials in MongoDB connection URI for console logging
 * @param {string} uri - Raw connection URI
 * @returns {string} Sanitized URI
 */
function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

/**
 * In-memory auto-seeding hook
 * Triggers only when connected to In-Memory MongoDB and Product count is 0.
 */
async function triggerAutoSeed() {
  try {
    // Resolve Product model safely
    let Product;
    try {
      Product = mongoose.models.Product || require('../models/Product');
    } catch (e) {
      console.warn('[DB] Product model not found. Skipping auto-seed.');
      return;
    }

    const count = await Product.countDocuments();
    if (count > 0) {
      console.log(`[DB] In-memory database already contains ${count} products. Auto-seed skipped.`);
      return;
    }

    console.log('[DB] In-memory database has 0 products. Initiating catalog auto-seed...');

    // Attempt 1: Check if standalone seeder script exports a programmatic seeder
    const seedScriptPath = path.join(__dirname, '../data/seed.js');
    if (fs.existsSync(seedScriptPath)) {
      try {
        const seeder = require(seedScriptPath);
        if (typeof seeder.seedInitialData === 'function') {
          await seeder.seedInitialData({ silent: true });
          console.log('[DB] Catalog auto-seeded successfully via seedInitialData().');
          return;
        } else if (typeof seeder.seedCatalog === 'function') {
          await seeder.seedCatalog({ silent: true });
          console.log('[DB] Catalog auto-seeded successfully via seedCatalog().');
          return;
        }
      } catch (err) {
        console.warn(`[DB] Error invoking seed script (${err.message}). Trying direct product seed...`);
      }
    }

    // Attempt 2: Direct seed using seedProducts dataset
    const seedProductsPath = path.join(__dirname, '../data/seedProducts.js');
    if (fs.existsSync(seedProductsPath)) {
      const seedProducts = require(seedProductsPath);
      const items = Array.isArray(seedProducts) ? seedProducts : seedProducts.seedProducts || [];
      if (items.length > 0) {
        await Product.insertMany(items);
        console.log(`[DB] Auto-seeded ${items.length} luxury beauty products into in-memory catalog.`);
        return;
      }
    }

    // Attempt 3: Milestone 1 baseline seed (if M2 seed datasets are not yet written)
    const baselineProducts = [
      {
        name: 'First Care Activating Serum VI',
        brand: 'Sulwhasoo',
        origin: 'South Korea',
        category: 'skincare',
        subcategory: 'Serum',
        description: 'An essential first-step rejuvenating serum formulated with JAUM Activator™ for radiant luxury skin.',
        price: 89.00,
        stock: 45,
        rating: 4.9,
        numReviews: 120,
        images: ['/assets/products/sulwhasoo-serum.webp'],
        specs: { volume: '60 ml', skinType: 'All skin types' }
      },
      {
        name: 'Gypsy Water Eau de Parfum',
        brand: 'Byredo',
        origin: 'Sweden',
        category: 'fragrances',
        subcategory: 'Eau de Parfum',
        description: 'An iconic tribute to the beauty of Romani culture, with notes of pine needle, sandalwood, and amber.',
        price: 290.00,
        stock: 25,
        rating: 4.9,
        numReviews: 142,
        images: ['/assets/products/byredo-gypsy-water.webp'],
        specs: { volume: '100 ml', concentration: 'Eau de Parfum' }
      },
      {
        name: 'Rouge Allure Velvet Luminous Matte',
        brand: 'CHANEL',
        origin: 'France',
        category: 'cosmetics',
        subcategory: 'Lipstick',
        description: 'A comfortable, luminous matte lipstick with concentrated pigments for intense color.',
        price: 45.00,
        stock: 65,
        rating: 4.8,
        numReviews: 95,
        images: ['/assets/products/chanel-rouge-allure.webp'],
        specs: { weight: '3.5 g', finish: 'Luminous Matte' }
      },
      {
        name: 'Gold Lust Repair & Restore Shampoo',
        brand: 'Oribe',
        origin: 'USA',
        category: 'haircare',
        subcategory: 'Shampoo',
        description: 'Rejuvenating cleanser that balances the scalp and reinforces the inner strength of each strand.',
        price: 49.00,
        stock: 50,
        rating: 4.9,
        numReviews: 88,
        images: ['/assets/products/oribe-gold-lust.webp'],
        specs: { volume: '250 ml', formulation: 'Sulfate-free' }
      }
    ];

    await Product.insertMany(baselineProducts);
    console.log(`[DB] Auto-seeded ${baselineProducts.length} baseline products into in-memory database.`);
  } catch (error) {
    console.error('[DB] Warning: Failed to execute in-memory auto-seed:', error.message);
  }
}

/**
 * Connects to MongoDB using dual-mode fallback logic.
 * 
 * @param {Object} [options={}] - Connection configuration options
 * @param {boolean} [options.forceMemory=false] - If true, immediately boots MongoMemoryServer without attempting external connection
 * @param {number} [options.timeoutMS=3000] - Server selection timeout for external MongoDB in milliseconds
 * @param {boolean} [options.autoSeed=true] - Whether to auto-seed when connected to in-memory MongoDB
 * @returns {Promise<mongoose.Connection>} Mongoose connection instance
 */
async function connectDB(options = {}) {
  // If already connected, return active connection immediately
  if (mongoose.connection.readyState === 1 && currentMode !== 'disconnected') {
    return mongoose.connection;
  }

  // Mutex lock to prevent multiple concurrent calls from creating duplicate connections
  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = (async () => {
    const forceMemory = options.forceMemory || process.env.USE_MEMORY_DB === 'true';
    const timeoutMS = options.timeoutMS || 3000;
    const shouldAutoSeed = options.autoSeed !== false;
    const externalUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/velvetaura';

    // =========================================================================
    // MODE 1: External MongoDB Connection Attempt
    // =========================================================================
    if (!forceMemory) {
      try {
        console.log(`[DB] Attempting connection to external MongoDB: ${maskMongoUri(externalUri)} (timeout: ${timeoutMS}ms)...`);
        
        await mongoose.connect(externalUri, {
          serverSelectionTimeoutMS: timeoutMS,
          connectTimeoutMS: timeoutMS,
        });

        currentMode = 'external';
        console.log(`[DB] Connected successfully to external MongoDB: ${maskMongoUri(externalUri)}`);
        return mongoose.connection;
      } catch (err) {
        console.warn(`[DB] External MongoDB connection failed (${err.message}). Activating In-Memory fallback...`);
      }
    } else {
      console.log('[DB] forceMemory option enabled. Directing startup to In-Memory MongoDB...');
    }

    // =========================================================================
    // MODE 2: In-Memory MongoDB Fallback (MongoMemoryServer)
    // =========================================================================
    try {
      console.log('[DB] Initializing mongodb-memory-server instance...');
      mongod = await MongoMemoryServer.create({
        instance: {
          dbName: 'velvetaura',
        },
      });

      const memoryUri = mongod.getUri();
      console.log(`[DB] mongodb-memory-server started at: ${memoryUri}`);

      await mongoose.connect(memoryUri);
      currentMode = 'memory';
      console.log('[DB] Connected to In-Memory MongoDB');

      // Auto-seed in-memory database if requested
      if (shouldAutoSeed) {
        await triggerAutoSeed();
      }

      return mongoose.connection;
    } catch (fallbackError) {
      currentMode = 'disconnected';
      console.error('[DB] Critical failure initializing In-Memory MongoDB fallback:', fallbackError);
      throw fallbackError;
    }
  })();

  try {
    const conn = await connectionPromise;
    return conn;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Disconnects Mongoose and stops the in-memory MongoDB daemon if active.
 * Safe to call multiple times (idempotent).
 * 
 * @returns {Promise<void>}
 */
async function disconnectDB() {
  try {
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('[DB] Mongoose connection closed.');
    }

    if (mongod) {
      await mongod.stop({ doCleanup: true, force: true });
      mongod = null;
      console.log('[DB] In-Memory MongoDB daemon stopped cleanly.');
    }

    currentMode = 'disconnected';
  } catch (error) {
    console.error('[DB] Error during database disconnection teardown:', error);
    throw error;
  }
}

/**
 * Returns the current active database connection mode.
 * @returns {'memory' | 'external' | 'disconnected'}
 */
function getDbMode() {
  if (mongoose.connection.readyState !== 1) {
    return 'disconnected';
  }
  return currentMode;
}

/**
 * Alias for uppercase naming convention compatibility
 * @returns {'memory' | 'external' | 'disconnected'}
 */
function getDBMode() {
  return getDbMode();
}

/**
 * Returns whether the active database is running in memory
 * @returns {boolean}
 */
function isInMemory() {
  return currentMode === 'memory';
}

/**
 * Helper to retrieve active MongoMemoryServer instance (e.g. for inspection or advanced test hooks)
 * @returns {MongoMemoryServer|null}
 */
function getMongoServer() {
  return mongod;
}

/**
 * Test helper: Clears all document collections in the active database.
 * Useful in test suites (e.g. afterEach hook) to guarantee test isolation.
 * @returns {Promise<void>}
 */
async function clearDatabase() {
  if (mongoose.connection.readyState !== 1) return;
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = {
  connectDB,
  disconnectDB,
  getDbMode,
  getDBMode,
  isInMemory,
  getMongoServer,
  clearDatabase,
  maskMongoUri,
};
```

---

### 4.2 Test Suite Companion: `tests/setup.js`

To guarantee that automated test suites (`npm test`) run at maximum speed without incurring a 3000ms delay on every test suite attempt, `tests/setup.js` will configure the test lifecycle using `connectDB({ forceMemory: true, autoSeed: false })`.

```javascript
/**
 * VelvetAura - Global Jest Test Setup
 * 
 * Configures environment variables, establishes in-memory MongoDB connection
 * before test suites execute, purges collections between tests, and ensures
 * complete teardown without memory leaks or hanging handles.
 */

const { connectDB, disconnectDB, clearDatabase } = require('../src/config/db');

// Ensure test environment variables are loaded
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_velvetaura_2026_super_secure';
process.env.JWT_EXPIRES_IN = '1d';
process.env.PORT = '5001';

// Increase Jest timeout for initial MongoDB binary download if needed on first run
jest.setTimeout(60000);

beforeAll(async () => {
  // Direct connection to in-memory MongoDB without waiting 3000ms for external URI
  await connectDB({
    forceMemory: true,
    autoSeed: false, // Tests control their own seed data
  });
});

afterEach(async () => {
  // Clean all collections between tests to guarantee 100% test isolation
  await clearDatabase();
});

afterAll(async () => {
  // Gracefully close Mongoose connection and stop mongodb-memory-server daemon
  await disconnectDB();
});
```

---

## 5. In-Memory Auto-Seeding Trigger Analysis

### 5.1 Trigger Invariants
- **Trigger Condition**:
  1. Active mode is `'memory'`.
  2. `options.autoSeed !== false`.
  3. `Product.countDocuments() === 0`.
- **Safety Checks**:
  - If `Product.countDocuments() > 0`, do nothing (idempotent; prevents duplicate seeding if reconnected).
  - Wrap entire seeding logic in `try/catch` to ensure that catalog seed failures never abort server startup.

### 5.2 Seeding Hierarchy & Resilience
1. **Tier 1 (Full Dataset Seeder)**: Check if `src/data/seed.js` exists and exports `seedInitialData` or `seedCatalog`. If so, execute it with `{ silent: true }`.
2. **Tier 2 (Curated Product Array)**: Check if `src/data/seedProducts.js` exists. If so, execute `Product.insertMany(seedProducts)`.
3. **Tier 3 (Embedded Baseline)**: If neither Tier 1 nor Tier 2 file exists yet (e.g. during Milestone 1 before Milestone 2 creates `seedProducts.js`), `db.js` contains a built-in fallback array of 4 luxury imported beauty items (Sulwhasoo Serum, Byredo Gypsy Water, Chanel Rouge Allure, Oribe Shampoo) ensuring that `Product.countDocuments()` is immediately `> 0` and endpoints return real data from the very first run!

---

## 6. Lifecycle Management & Teardown Protocol

### 6.1 Server Shutdown (`server.js`)
When `server.js` catches termination signals (`SIGINT`, `SIGTERM`), it coordinates:
1. `server.close()` — Stops accepting new HTTP connections.
2. `await disconnectDB()` —
   - Disconnects Mongoose via `await mongoose.disconnect()`.
   - Stops the in-memory daemon via `await mongod.stop({ doCleanup: true, force: true })`.
   - Resets state variables (`mongod = null`, `currentMode = 'disconnected'`).
3. Clean process exit (`process.exit(0)`).

### 6.2 Windows OS Considerations
1. **Child Process Cleanup**: On Windows, when `mongodb-memory-server` launches `mongod.exe`, failing to stop the daemon cleanly can leave an orphan `mongod.exe` holding locks on temporary storage directories in `%TEMP%` or `%LOCALAPPDATA%`.
   - By specifying `await mongod.stop({ doCleanup: true, force: true })`, the daemon is forcefully killed and all temporary lock files are removed.
2. **Binary Caching**: On Windows, `mongodb-memory-server` downloads and caches the MongoDB binary in `%USERPROFILE%\.cache\mongodb-binaries`. First-time download might take 10-30 seconds depending on network speed. Jest timeout is set to `60000ms` in `tests/setup.js` to account for this initial fetch.

---

## 7. Cross-Subsystem Interface Contracts

### 7.1 Contract with Explorer 1 (`server.js` & `src/routes/healthRoutes.js`)
- `server.js` imports:
  ```javascript
  const { connectDB, disconnectDB } = require('./src/config/db');
  ```
  Calls `await connectDB()` on startup and `await disconnectDB()` inside `gracefulShutdown()`.
- `healthRoutes.js` imports:
  ```javascript
  const { getDbMode } = require('../config/db');
  ```
  Returns:
  ```json
  {
    "status": "ok",
    "database": "connected",
    "mode": "memory",
    "uptime": 12.34,
    "timestamp": "2026-11-04T11:15:00.000Z"
  }
  ```

### 7.2 Contract with Explorer 3 (`src/models/Product.js` & `src/models/User.js`)
- `db.js` requires `src/models/Product.js` to inspect document count:
  `const count = await Product.countDocuments();`
- Note on CommonJS vs ESM:
  - Explorer 1 chose CommonJS (`module.exports`).
  - Explorer 3 wrote models with `export default`.
  - **Resolution**: To prevent `SyntaxError: Cannot use import statement outside a module`, all models (`Product.js`, `User.js`, `Cart.js`, `Order.js`) MUST use CommonJS exports (`module.exports = Product;` and `module.exports = User;`). This is highlighted as a primary recommendation for the worker.

---

## 8. Verification & Validation Plan for Worker

| Test / Check | Command / Action | Expected Result |
|---|---|---|
| **External URI Timeout & Fallback** | Run with `MONGODB_URI=mongodb://127.0.0.1:27018/fake` | Logs warning after ~3000ms, then successfully starts `mongodb-memory-server` and connects |
| **In-Memory Auto-Seed** | Run with empty DB in memory mode | Logs: `[DB] Auto-seeded ... products into in-memory catalog`. `Product.countDocuments() > 0` |
| **Health Route Probe** | `curl http://localhost:5000/api/health` | HTTP 200 `{ "status": "ok", "database": "connected", "mode": "memory" }` |
| **Clean Teardown** | Send `SIGINT` (Ctrl+C) to server | HTTP server closes, Mongoose disconnects, MongoMemoryServer daemon stops, exits code 0 |
| **Automated Test Isolation** | `npm test` | All test suites connect immediately via `tests/setup.js`, collections purged between tests, 100% pass |
