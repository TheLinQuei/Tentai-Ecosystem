/**
 * Reminder System
 * Polls Redis for expired reminders and sends them to users
 */

import { Client } from 'discord.js';
import Redis from 'ioredis';

// Prefer REDIS_URL; default to localhost:6380 (Brain also uses 6380). Fallback to 6379 if 6380 unreachable.
let redis: Redis;
const primaryUrl = process.env.REDIS_URL || 'redis://localhost:6380';
const fallbackUrl = 'redis://localhost:6379';
try {
  redis = new Redis(primaryUrl, { lazyConnect: true });
} catch {
  redis = new Redis(fallbackUrl, { lazyConnect: true });
}

let pollInterval: NodeJS.Timeout | null = null;

/**
 * Initialize the reminder system
 * Connects to Redis and starts polling for expired reminders
 */
export async function initReminders(client: Client): Promise<void> {
  try {
    // Attempt primary connection, fallback if fails
    try {
      await redis.connect();
    } catch (err) {
      console.warn(`[REMINDERS] Primary Redis connect failed (${primaryUrl}):`, err);
      if (primaryUrl !== fallbackUrl) {
        try {
          redis = new Redis(fallbackUrl);
          await redis.ping();
          console.log(`[REMINDERS] ✓ Fallback Redis connected (${fallbackUrl})`);
        } catch (err2) {
          console.error('[REMINDERS] ✗ Failed both primary and fallback Redis connections');
          throw err2;
        }
      } else {
        throw err;
      }
    }
    console.log(`[REMINDERS] ✓ Connected to Redis (${redis.options.host}:${redis.options.port})`);

    // Start polling for due reminders every 5 seconds
    pollInterval = setInterval(() => checkReminders(client), 5000);
    console.log('[REMINDERS] ✓ Polling started (5s interval)');
  } catch (err) {
    console.error('[REMINDERS] ✗ Failed to initialize:', err);
    throw err;
  }
}

/**
 * Check Redis for expired reminders and send them
 */
async function checkReminders(client: Client): Promise<void> {
  try {
    // Scan for all reminder keys
    const keys = await redis.keys('remind:*');
    if (keys.length > 0) {
      console.log(`[REMINDERS] Scan: ${keys.length} key(s)`);
    }
    
    for (const key of keys) {
      // Extract userId and timestamp from key: remind:userId:timestamp
      const parts = key.split(':');
      if (parts.length < 3) {
        console.warn(`[REMINDERS] Invalid key format: ${key}`);
        continue;
      }
      const userId = parts[1];
      
      // Get the reminder message and TTL
      const message = await redis.get(key);
      const ttl = await redis.ttl(key);
      
      // Skip if key disappeared
      if (ttl === -2 || !message) continue;
      
      // Calculate when reminder is due based on TTL
      const nowMs = Date.now();
      const estimatedDueAtMs = nowMs + (ttl * 1000);
      
      // Fire if due within next polling cycle (6 seconds buffer to catch cross-cycle boundaries)
      const fireWindowMs = 6000;
      if (estimatedDueAtMs <= nowMs + fireWindowMs) {
        console.log(`[REMINDERS] Triggering reminder for ${userId} (TTL=${ttl}s, due in ~${Math.round((estimatedDueAtMs - nowMs) / 1000)}s)`);
        
        // Send reminder via DM
        try {
          const user = await client.users.fetch(userId);
          await user.send(`⏰ **Reminder:** ${message}`);
          console.log(`[REMINDERS] ✓ Sent reminder to ${userId}: "${message}"`);
        } catch (err) {
          console.error(`[REMINDERS] ✗ Failed to send reminder to ${userId}:`, err);
        }

        // Delete the key immediately (best-effort)
        await redis.del(key).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[REMINDERS] ✗ Error checking reminders:', err);
  }
}

/**
 * Stop the reminder polling and disconnect from Redis
 */
export async function stopReminders(): Promise<void> {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[REMINDERS] Polling stopped');
  }

  await redis.quit();
  console.log('[REMINDERS] Disconnected from Redis');
}
