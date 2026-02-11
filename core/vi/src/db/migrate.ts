import { loadConfig } from '../config/config.js';
import { initializeLogger, getLogger } from '../telemetry/logger.js';
import { initializeTelemetry } from '../telemetry/telemetry.js';
import { createPool, closePool } from './pool.js';
import { runMigrations } from './migrations.js';

async function main(): Promise<void> {
  const config = loadConfig();
  initializeLogger(config.logging.level);
  initializeTelemetry(config.telemetry.path, config.telemetry.enabled);

  const logger = getLogger();
  logger.info('Running migrations...');

  const pool = createPool(config);
  try {
    await runMigrations(pool);
    logger.info('Migrations complete');
  } catch (error) {
    logger.error({ error }, 'Migration failed');
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
