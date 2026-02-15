import type { Client } from 'discord.js';
import type { NatsConnection } from 'nats';
import { prisma } from '@/db/prisma';
import { memory } from '@/modules/memory';
import { stopReminders } from '@/features/reminders';

/**
 * Graceful shutdown handler for Vi Discord Bot
 * - Saves ViBrain state to disk
 * - Stops reminder polling
 * - Closes NATS connection
 * - Closes Prisma DB connection
 * - Destroys Discord client
 * - Releases all ports cleanly
 */

let isShuttingDown = false;

export async function gracefulShutdown(
  signal: string,
  client?: Client,
  natsConnection?: NatsConnection | null,
  adminServer?: any // Express app or HTTP server instance
): Promise<void> {
  if (isShuttingDown) return; // prevent double shutdown
  isShuttingDown = true;

  console.log(`\n[SHUTDOWN] Received ${signal}, shutting down gracefully...`);

  try {
    // 1. Save ViBrain memory state (vibrainStore)
    console.log('[SHUTDOWN] Saving ViBrain state...');
    await memory.saveAll();
    console.log('[SHUTDOWN] ✓ ViBrain saved');

    // 2. Stop reminder polling and close Redis
    console.log('[SHUTDOWN] Stopping reminders...');
    await stopReminders();
    console.log('[SHUTDOWN] ✓ Reminders stopped');

    // 3. Close NATS connection to Brain
    if (natsConnection) {
      console.log('[SHUTDOWN] Closing NATS connection...');
      await natsConnection.drain();
      await natsConnection.close();
      console.log('[SHUTDOWN] ✓ NATS closed');
    }

    // 4. Close Prisma DB connection
    console.log('[SHUTDOWN] Closing Prisma DB...');
    await prisma.$disconnect();
    console.log('[SHUTDOWN] ✓ Prisma disconnected');

    // 5. Destroy Discord client (closes WS, releases resources)
    if (client) {
      console.log('[SHUTDOWN] Destroying Discord client...');
      await client.destroy();
      console.log('[SHUTDOWN] ✓ Discord client destroyed');
    }

    // 6. Close admin API server (releases port 4310)
    if (adminServer && typeof adminServer.close === 'function') {
      console.log('[SHUTDOWN] Closing admin server...');
      await new Promise<void>((resolve) => {
        adminServer.close(() => {
          console.log('[SHUTDOWN] ✓ Admin server closed');
          resolve();
        });
      });
    }

    console.log('[SHUTDOWN] ✅ Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error('[SHUTDOWN] ❌ Error during shutdown:', err);
    process.exit(1);
  }
}

/**
 * Register shutdown handlers for SIGTERM, SIGINT, uncaughtException
 */
export function setupShutdownHandlers(
  client?: Client,
  natsConnection?: NatsConnection | null,
  adminServer?: any
): void {
  process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM', client, natsConnection, adminServer); });
  process.on('SIGINT', () => { void gracefulShutdown('SIGINT', client, natsConnection, adminServer); });

  // Catch unhandled promise rejections and exceptions
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[SHUTDOWN] Unhandled Promise Rejection:', reason);
    console.error('Promise:', promise);
    void gracefulShutdown('unhandledRejection', client, natsConnection, adminServer);
  });

  process.on('uncaughtException', (err) => {
    console.error('[SHUTDOWN] Uncaught Exception:', err);
    void gracefulShutdown('uncaughtException', client, natsConnection, adminServer);
  });
}
