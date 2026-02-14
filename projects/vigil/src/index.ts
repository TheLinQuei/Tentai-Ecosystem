// Boot-time performance timers
const bootStart = Date.now();
const checkpoint = (label: string) => {
  const elapsed = ((Date.now() - bootStart) / 1000).toFixed(2);
  console.log(`[BOOT] ${label.padEnd(25)} +${elapsed}s`);
};

checkpoint("init start");

import { bootstrap } from "./core/bootstrap";
import { spawnLogViewer } from "./lib/logViewer";
import { logStartup, logger } from "./lib/logger";

// Spawn dedicated log viewer window (Windows only)
logStartup('Log viewer spawning');
spawnLogViewer();

// Minimal entrypoint to run the new core bootstrap
void (async () => {
  try {
    logStartup('Bootstrap starting', { timestamp: new Date().toISOString() });
    await bootstrap(checkpoint);
    checkpoint("fully online");
    const totalSeconds = ((Date.now() - bootStart) / 1000).toFixed(2);
    console.log("[BOOT] total:", totalSeconds, "seconds");
    logStartup('Bootstrap complete', { totalSeconds: parseFloat(totalSeconds) });
    
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('✅ Vi Discord Bot fully operational');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  } catch (error) {
    console.error("Fatal:", error);
    logger.error({ err: error }, '🔥 Fatal bootstrap error');
    process.exit(1);
  }
})();
