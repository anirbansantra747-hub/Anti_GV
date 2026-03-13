/**
 * @file dbService.js
 * @description MongoDB connection management using Mongoose.
 * Exports `connectDB()` which is called once from app.js on startup.
 *
 * Environment variables:
 *   MONGODB_URI  — full MongoDB connection string (required)
 *   DB_NAME      — optional database name override
 */

import mongoose from 'mongoose';

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

/**
 * Connect to MongoDB with exponential-backoff retry.
 * @returns {Promise<void>}
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.warn(
      '[DB] MONGODB_URI is not set. Running without database — workspace persistence disabled.'
    );
    return;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, {
        dbName: process.env.DB_NAME || 'antigv',
        serverSelectionTimeoutMS: 5000,
      });

      console.log(`[DB] ✅ MongoDB connected (${mongoose.connection.host})`);
      _registerEvents();
      return;
    } catch (err) {
      const isLast = attempt === MAX_RETRIES;
      console.error(
        `[DB] Connection attempt ${attempt}/${MAX_RETRIES} failed: ${err.message}${isLast ? '' : ` — retrying in ${RETRY_DELAY_MS}ms…`}`
      );
      if (isLast) {
        console.error(
          '[DB] ❌ Could not connect to MongoDB after all retries. Continuing without DB.'
        );
        return;
      }
      await _sleep(RETRY_DELAY_MS * attempt);
    }
  }
}

/**
 * Gracefully close the Mongoose connection. Useful in tests / shutdown hooks.
 */
export async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[DB] MongoDB disconnected.');
  }
}

/**
 * Returns true if Mongoose is currently connected.
 */
export function isConnected() {
  return mongoose.connection.readyState === 1;
}

// ── Private helpers ──────────────────────────────────────────

function _registerEvents() {
  mongoose.connection.on('disconnected', () => {
    console.warn('[DB] MongoDB disconnected — will auto-reconnect if network recovers.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[DB] MongoDB reconnected ✅');
  });

  mongoose.connection.on('error', (err) => {
    console.error('[DB] MongoDB connection error:', err.message);
  });

  // Graceful process shutdown
  process.on('SIGINT', async () => {
    await disconnectDB();
    process.exit(0);
  });
}

function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
