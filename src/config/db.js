/**
 * VelvetAura - Dual-Mode MongoDB Connection Module
 * 
 * Supports transparent connection to an external MongoDB instance with a 3000ms timeout,
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
        images: ['/assets/images/sulwhasoo-first-care.webp'],
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
        images: ['/assets/images/byredo-gypsy-water.webp'],
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
        images: ['/assets/images/chanel-rouge-allure.webp'],
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
        images: ['/assets/images/oribe-gold-lust.webp'],
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
        process.env.DB_MODE = 'external';
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
      process.env.DB_MODE = 'memory';
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
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return 'disconnected';
  }
  return currentMode;
}

/**
 * Upper-case naming alias for compatibility
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
 * Helper to retrieve active MongoMemoryServer instance
 * @returns {MongoMemoryServer|null}
 */
function getMongoServer() {
  return mongod;
}

/**
 * Test helper: Clears all document collections in the active database.
 * @returns {Promise<void>}
 */
async function clearDatabase() {
  if (!mongoose.connection || mongoose.connection.readyState !== 1) return;
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
