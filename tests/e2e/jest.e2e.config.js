module.exports = {
  displayName: 'VelvetAura E2E Opaque-Box Suite',
  testEnvironment: 'node',
  testMatch: [
    '**/tests/e2e/**/*.test.js'
  ],
  testTimeout: 60000,
  verbose: true,
  forceExit: true,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};
