/**
 * VelvetAura - Standalone & Programmatic Database Seeder
 * 
 * Populates MongoDB with the 24 curated luxury imported beauty products and
 * baseline customer/admin personas with securely hashed bcrypt passwords.
 * 
 * Usages:
 *   CLI:           npm run seed (or node src/data/seed.js)
 *   Programmatic:  const { seedInitialData } = require('./src/data/seed');
 *                  await seedInitialData({ silent: true });
 */

const { connectDB, disconnectDB } = require('../config/db');
const Product = require('../models/Product');
const User = require('../models/User');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const seedProducts = require('./seedProducts');

const demoUsers = [
  {
    name: 'VelvetAura Administrator',
    email: 'admin@velvetaura.com',
    password: 'AdminPassword123!',
    role: 'admin',
    address: {
      street: '1 Place Vendôme',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France',
    },
  },
  {
    name: 'Camille Dupont',
    email: 'customer@velvetaura.com',
    password: 'Password123!',
    role: 'customer',
    address: {
      street: '14 Rue de Rivoli',
      city: 'Paris',
      state: 'Ile-de-France',
      zip: '75001',
      country: 'France',
    },
  },
  {
    name: 'Min-ji Park',
    email: 'minji@velvetaura.com',
    password: 'Password123!',
    role: 'customer',
    address: {
      street: '450 Teheran-ro',
      city: 'Gangnam-gu',
      state: 'Seoul',
      zip: '06193',
      country: 'South Korea',
    },
  },
];

/**
 * Programmatic seeding function
 * @param {Object} [options={}]
 * @param {boolean} [options.silent=false] - Suppress console output
 * @param {boolean} [options.forceReset=false] - Force delete existing collections
 * @returns {Promise<{ success: boolean, productsCount: number, usersCount: number }>}
 */
async function seedInitialData(options = {}) {
  const silent = Boolean(options.silent);
  const forceReset = Boolean(options.forceReset);

  const log = (...args) => {
    if (!silent) console.log(...args);
  };

  try {
    const existingCount = await Product.countDocuments();
    if (existingCount > 0 && !forceReset) {
      log(`[Seed] Catalog already populated with ${existingCount} products. Skipping seed.`);
      const usersCount = await User.countDocuments();
      return { success: true, productsCount: existingCount, usersCount };
    }

    if (forceReset || existingCount === 0) {
      log('[Seed] Resetting existing collections...');
      await Product.deleteMany({});
      await Cart.deleteMany({});
      await Order.deleteMany({});
      // Delete existing demo users if forceReset
      if (forceReset) {
        await User.deleteMany({
          email: { $in: demoUsers.map((u) => u.email) },
        });
      }
    }

    // 1. Seed Products
    log(`[Seed] Inserting ${seedProducts.length} luxury imported beauty products...`);
    const insertedProducts = await Product.insertMany(seedProducts);
    log(`[Seed] Successfully seeded ${insertedProducts.length} products into catalog.`);

    // 2. Seed Demo Users (using User.create to trigger bcrypt password hashing)
    let createdUsersCount = 0;
    for (const userData of demoUsers) {
      const exists = await User.findOne({ email: userData.email });
      if (!exists) {
        const user = await User.create(userData);
        // Create matching empty cart for demo user
        await Cart.create({ user: user._id, items: [] });
        createdUsersCount++;
      }
    }
    log(`[Seed] Successfully created/verified ${demoUsers.length} demo customer & admin accounts.`);

    return {
      success: true,
      productsCount: insertedProducts.length,
      usersCount: createdUsersCount,
    };
  } catch (error) {
    if (!silent) {
      console.error('[Seed] Error during seeding:', error.message);
    }
    throw error;
  }
}

/**
 * CLI execution entrypoint
 */
async function runCLI() {
  console.log('=====================================================');
  console.log(' VelvetAura - Luxury Beauty Database Seeding Engine  ');
  console.log('=====================================================');

  try {
    await connectDB({ autoSeed: false });
    const result = await seedInitialData({ silent: false, forceReset: true });

    console.log('-----------------------------------------------------');
    console.log(`✓ Products seeded: ${result.productsCount}`);
    console.log(`✓ Demo users created: ${result.usersCount}`);
    console.log('✓ Seeding complete. All luxury items and accounts ready.');
    console.log('=====================================================');

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('✗ Seeding failed with error:', error);
    try {
      await disconnectDB();
    } catch (_) {}
    process.exit(1);
  }
}

// Automatically trigger CLI when executed directly via `node src/data/seed.js`
if (require.main === module) {
  runCLI();
}

module.exports = {
  seedInitialData,
  seedCatalog: seedInitialData,
  demoUsers,
};
