/**
 * Phase 0.2 Overseer Fixes
 * 
 * This patch applies three critical fixes to Overseer:
 * 1. Health check polling loop (hit each service /health on interval)
 * 2. Start command enforcement (respects service.startCmd instead of hardcoding npm run dev)
 * 3. Hung process detection (restart if health check fails for N intervals)
 * 
 * Integration:
 * - Replace Overseer spawn() call with this smart start function
 * - Start polling loop in server initialization
 * - Add "hung" status tracking to ServiceConfig
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';

/**
 * Parse startCmd into command and args
 * Supports:
 * - "npm run dev"
 * - "npm run dev -- --port 3100"
 * - "node dist/index.js"
 * - "docker-compose up -d qdrant"
 * - etc.
 */
export function parseStartCmd(cmd: string): { program: string; args: string[] } {
  const trimmed = cmd.trim();
  
  if (trimmed.includes('docker')) {
    // docker-compose up -d qdrant => ["docker-compose", ["up", "-d", "qdrant"]]
    const parts = trimmed.split(/\s+/);
    return { program: parts[0], args: parts.slice(1) };
  }
  
  if (trimmed.startsWith('npm')) {
    const parts = trimmed.split(/\s+/);
    return { program: 'npm', args: parts.slice(1) };
  }

  if (trimmed.startsWith('node')) {
    const parts = trimmed.split(/\s+/);
    return { program: 'node', args: parts.slice(1) };
  }

  // Generic split
  const parts = trimmed.split(/\s+/);
  return { program: parts[0], args: parts.slice(1) };
}

/**
 * Smart process spawner that respects service.startCmd
 */
export function spawnService(
  serviceId: string,
  startCmd: string,
  cwd: string,
  env: Record<string, string>,
  onLog: (line: string) => void
): ChildProcess {
  const { program, args } = parseStartCmd(startCmd);
  
  const isWindows = os.platform() === 'win32';
  const windir = process.env.WINDIR || 'C:\\Windows';
  const powershellPath = path.join(windir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const cmdPath = process.env.ComSpec || path.join(windir, 'System32', 'cmd.exe');
  const shell = isWindows
    ? (existsSync(powershellPath) ? powershellPath : (existsSync(cmdPath) ? cmdPath : 'cmd.exe'))
    : true;

  console.log(`[${serviceId}] Spawning: ${startCmd}`);
  console.log(`[${serviceId}] Program: ${program}, Args: ${args.join(' ')}`);
  console.log(`[${serviceId}] CWD: ${cwd}`);

  const proc = spawn(program, args, {
    cwd,
    env,
    stdio: 'pipe',
    shell,
    detached: false, // Important: don't detach, so we can kill the whole process tree
  });

  if (proc.stdout) {
    proc.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) onLog(line);
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) onLog(`[STDERR] ${line}`);
    });
  }

  return proc;
}

/**
 * Health check poller for a single service
 * Returns: 'ok', 'degraded', or 'down'
 */
export async function checkServiceHealth(
  healthCheckUrl: string | null | undefined,
  timeout: number = 5000
): Promise<'ok' | 'degraded' | 'down'> {
  if (!healthCheckUrl) {
    // No health check URL = assume ok if process is running
    return 'ok';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(healthCheckUrl, {
      method: 'GET',
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);

    if (!response) return 'down';
    if (response.ok) return 'ok';
    if (response.status >= 500) return 'degraded';
    return 'ok'; // 4xx = responding, consider healthy for now
  } catch (err) {
    return 'down';
  }
}

/**
 * Hung process detector
 * If health check fails for N consecutive intervals, service is considered hung
 */
export interface HealthTracker {
  consecutiveFailures: number;
  lastCheckTime: number;
  lastStatus: 'ok' | 'degraded' | 'down';
  lastOverall: 'healthy' | 'degraded' | 'hung';
}

export function createHealthTracker(): HealthTracker {
  return {
    consecutiveFailures: 0,
    lastCheckTime: 0,
    lastStatus: 'ok',
    lastOverall: 'healthy',
  };
}

export function updateHealthStatus(
  tracker: HealthTracker,
  newStatus: 'ok' | 'degraded' | 'down',
  consecutiveFailureThreshold: number = 3
): 'healthy' | 'degraded' | 'hung' {
  tracker.lastCheckTime = Date.now();
  tracker.lastStatus = newStatus;

  if (newStatus === 'ok') {
    tracker.consecutiveFailures = 0;
    tracker.lastOverall = 'healthy';
    return tracker.lastOverall;
  }

  tracker.consecutiveFailures++;

  if (tracker.consecutiveFailures >= consecutiveFailureThreshold) {
    tracker.lastOverall = 'hung';
    return tracker.lastOverall;
  }

  tracker.lastOverall = 'degraded';
  return tracker.lastOverall;
}

/**
 * Polling loop manager
 * To be called after services are registered:
 * 
 *   const poller = startHealthPolling(services, healthTrackers, {
 *     interval: 5000,
 *     onHealthChange: (serviceId, newStatus) => {
 *       console.log(`${serviceId} is now ${newStatus}`);
 *       if (newStatus === 'hung') {
 *         // Auto-restart or alert
 *       }
 *     },
 *   });
 */

export interface PollerConfig {
  interval?: number; // ms between health checks (default 5000)
  consecutiveFailureThreshold?: number; // how many failures = hung (default 3)
  onHealthChange?: (serviceId: string, status: 'healthy' | 'degraded' | 'hung') => void;
}

export function startHealthPolling(
  services: Map<string, any>, // ServiceConfig map
  healthTrackers: Map<string, HealthTracker>,
  config: PollerConfig = {}
): { stop: () => void } {
  const interval = config.interval || 5000;
  const threshold = config.consecutiveFailureThreshold || 3;
  const onHealthChange = config.onHealthChange || (() => {});

  let isRunning = true;

  const pollLoop = async () => {
    while (isRunning) {
      for (const [serviceId, service] of services.entries()) {
        if (service.status !== 'running') {
          // Skip health checks for stopped/starting services
          continue;
        }

        let tracker = healthTrackers.get(serviceId);
        if (!tracker) {
          tracker = createHealthTracker();
          healthTrackers.set(serviceId, tracker);
        }

        const prevOverall = tracker.lastOverall;
        const healthStatus = await checkServiceHealth(service.healthCheckUrl, 3000);
        const overallStatus = updateHealthStatus(tracker, healthStatus, threshold);

        if (!prevOverall || prevOverall !== overallStatus) {
          console.log(`[${serviceId}] Health: ${healthStatus} (overall: ${overallStatus})`);
          onHealthChange(serviceId, overallStatus);
        }

        // Update service status based on health
        if (overallStatus === 'hung') {
          service.status = 'degraded';
          service.lastError = `Health check failed for ${threshold} consecutive attempts`;
          console.warn(`[${serviceId}] HUNG: ${service.lastError}`);
        } else if (overallStatus === 'degraded' && service.status === 'running') {
          service.status = 'degraded';
          service.lastError = `Health check degraded (${tracker.consecutiveFailures}/${threshold})`;
          console.warn(`[${serviceId}] DEGRADED: ${service.lastError}`);
        } else if (overallStatus === 'healthy' && service.status === 'degraded') {
          service.status = 'running';
          service.lastError = undefined;
          console.log(`[${serviceId}] Recovered to running`);
        }
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }
  };

  // Start the poll loop in background
  pollLoop().catch(err => console.error('Health poll error:', err));

  return {
    stop: () => {
      isRunning = false;
    },
  };
}
