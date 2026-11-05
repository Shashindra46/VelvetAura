/**
 * VelvetAura - Server Entry Point
 * Bootstraps dual-mode database connection, initializes Express HTTP listener,
 * and handles graceful process termination.
 */

require('dotenv').config();
const app = require('./src/app');
const { connectDB, disconnectDB } = require('./src/config/db');

const PORT = process.env.PORT || 5000;
let server;

async function startServer() {
  try {
    // Connect to database (external MongoDB URI or automatic fallback to In-Memory Mongo)
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

process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled Promise Rejection:', reason);
  gracefulShutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

startServer();
