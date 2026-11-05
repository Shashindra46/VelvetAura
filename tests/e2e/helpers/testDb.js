/**
 * VelvetAura In-Memory & Dual-Mode DB Test Lifecycle Manager
 * Handles hermetic in-memory MongoDB lifecycle for isolated E2E testing.
 */

let mongoose;
try {
  mongoose = require('mongoose');
} catch (e) {
  mongoose = null;
}

let MongoMemoryServer;
try {
  const mms = require('mongodb-memory-server');
  MongoMemoryServer = mms.MongoMemoryServer;
} catch (e) {
  MongoMemoryServer = null;
}

const { sampleProducts } = require('./fixtures');

let mongoServer = null;

async function connectTestDb() {
  if (process.env.BASE_URL) {
    // Running against a live external server — no local MongoMemoryServer needed
    return null;
  }

  if (!mongoose) {
    return null;
  }

  if (mongoose.connection.readyState === 1) {
    // Already connected
    return mongoose.connection;
  }

  const targetUri = process.env.MONGODB_URI;
  if (targetUri && !targetUri.includes('undefined')) {
    try {
      await mongoose.connect(targetUri);
      return mongoose.connection;
    } catch (err) {
      // Fallback to memory server below
    }
  }

  if (MongoMemoryServer) {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGODB_URI = uri;
    await mongoose.connect(uri);
    return mongoose.connection;
  }

  return null;
}

async function seedSampleProducts() {
  if (process.env.BASE_URL || !mongoose || mongoose.connection.readyState !== 1) {
    return;
  }

  try {
    let Product;
    try {
      Product = require('../../src/models/Product');
    } catch (e) {
      if (mongoose.models.Product) {
        Product = mongoose.models.Product;
      }
    }

    if (Product) {
      const count = await Product.countDocuments();
      if (count === 0) {
        await Product.insertMany(sampleProducts);
      }
    } else {
      // Seed via raw collection if model not yet loaded
      const collection = mongoose.connection.collection('products');
      const count = await collection.countDocuments();
      if (count === 0) {
        await collection.insertMany(sampleProducts.map(p => ({ ...p, createdAt: new Date(), updatedAt: new Date() })));
      }
    }
  } catch (err) {
    // Graceful seed attempt
  }
}

async function clearTestCollections() {
  if (process.env.BASE_URL || !mongoose || mongoose.connection.readyState !== 1) {
    return;
  }

  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      // Keep products seeded for catalog tests, clear users, carts, orders
      if (key !== 'products') {
        await collections[key].deleteMany({});
      }
    }
  } catch (err) {
    // Silently continue
  }
}

async function disconnectTestDb() {
  if (process.env.BASE_URL || !mongoose) {
    return;
  }

  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    if (mongoServer) {
      await mongoServer.stop();
      mongoServer = null;
    }
  } catch (err) {
    // Clean exit
  }
}

module.exports = {
  connectTestDb,
  seedSampleProducts,
  clearTestCollections,
  disconnectTestDb
};
