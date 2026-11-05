/**
 * VelvetAura - Global Test Environment Setup
 * Configures in-memory database hooks and guarantees 100% test isolation.
 */

const { connectDB, disconnectDB, clearDatabase } = require('../src/config/db');

// Ensure test environment variables are loaded
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_key_velvetaura_2026_super_secure';
process.env.JWT_EXPIRES_IN = '1d';
process.env.PORT = '5001';

// Set generous timeout for MongoDB binary download/extraction if needed on first run
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
  // Gracefully close Mongoose connection and stop in-memory MongoDB daemon
  await disconnectDB();
});
