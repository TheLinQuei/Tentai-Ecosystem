/**
 * Phase 0.2 Test Suite: Overseer Health Polling & StartCmd
 * Tests health polling loop, startCmd enforcement, and hung process detection
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  parseStartCmd,
  checkServiceHealth,
  createHealthTracker,
  updateHealthStatus,
  HealthTracker,
} from '../../src/health-polling.js';

// ─────────────────────────────────────────────────────────────
// Command Parsing Tests
// ─────────────────────────────────────────────────────────────

describe('Phase 0.2: Overseer Improvements', () => {
  describe('StartCmd Parsing', () => {
    it('should parse npm run dev', () => {
      const result = (parseStartCmd as any)('npm run dev');
      expect(result.program).toBe('npm');
      expect(result.args).toEqual(['run', 'dev']);
    });

    it('should parse npm with flags', () => {
      const result = (parseStartCmd as any)('npm run dev -- --port 3100');
      expect(result.program).toBe('npm');
      expect(result.args).toEqual(['run', 'dev', '--', '--port', '3100']);
    });

    it('should parse docker-compose commands', () => {
      const result = (parseStartCmd as any)('docker-compose up -d qdrant');
      expect(result.program).toBe('docker-compose');
      expect(result.args).toEqual(['up', '-d', 'qdrant']);
    });

    it('should parse node commands', () => {
      const result = (parseStartCmd as any)('node dist/index.js');
      expect(result.program).toBe('node');
      expect(result.args).toEqual(['dist/index.js']);
    });

    it('should parse commands with extra spaces', () => {
      const result = (parseStartCmd as any)('npm  run    dev');
      expect(result.program).toBe('npm');
      expect(result.args.length).toBeGreaterThan(0);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Health Check Tests
  // ─────────────────────────────────────────────────────────────

  describe('Service Health Checks', () => {
    it('should return ok for null healthCheckUrl', async () => {
      const result = await checkServiceHealth(null);
      expect(result).toBe('ok');
    });

    it('should return ok for undefined healthCheckUrl', async () => {
      const result = await checkServiceHealth(undefined);
      expect(result).toBe('ok');
    });

    it('should return ok for valid 200 response', async () => {
      // Mock fetch to return 200
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const result = await checkServiceHealth('http://localhost:3100/health');
      expect(result).toBe('ok');
    });

    it('should return degraded for 500 response', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await checkServiceHealth('http://localhost:3100/health');
      expect(result).toBe('degraded');
    });

    it('should return down for network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));

      const result = await checkServiceHealth('http://localhost:3100/health');
      expect(result).toBe('down');
    });

    it('should return down for timeout', async () => {
      global.fetch = vi.fn().mockImplementationOnce(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('AbortError')), 100);
        });
      });

      const result = await checkServiceHealth('http://localhost:3100/health', 50);
      expect(result).toBe('down');
    });

    it('should handle 4xx as ok (service responding)', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await checkServiceHealth('http://localhost:3100/health');
      expect(result).toBe('ok');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Health Tracking Tests
  // ─────────────────────────────────────────────────────────────

  describe('Health Tracker & Hung Detection', () => {
    let tracker: HealthTracker;

    beforeAll(() => {
      tracker = createHealthTracker();
    });

    it('should initialize with zero failures', () => {
      expect(tracker.consecutiveFailures).toBe(0);
      expect(tracker.lastStatus).toBe('ok');
    });

    it('should reset failures on ok', () => {
      tracker.consecutiveFailures = 2;
      const result = updateHealthStatus(tracker, 'ok');

      expect(tracker.consecutiveFailures).toBe(0);
      expect(result).toBe('healthy');
    });

    it('should increment failures on down', () => {
      tracker.consecutiveFailures = 0;
      
      let result = updateHealthStatus(tracker, 'down', 3);
      expect(tracker.consecutiveFailures).toBe(1);
      expect(result).toBe('degraded');

      result = updateHealthStatus(tracker, 'down', 3);
      expect(tracker.consecutiveFailures).toBe(2);
      expect(result).toBe('degraded');
    });

    it('should detect hung after threshold', () => {
      tracker.consecutiveFailures = 0;

      updateHealthStatus(tracker, 'down', 3);
      updateHealthStatus(tracker, 'down', 3);
      const result = updateHealthStatus(tracker, 'down', 3);

      expect(tracker.consecutiveFailures).toBe(3);
      expect(result).toBe('hung');
    });

    it('should respect custom threshold', () => {
      tracker.consecutiveFailures = 0;

      updateHealthStatus(tracker, 'down', 1);
      expect(tracker.consecutiveFailures).toBe(1);

      const result = updateHealthStatus(tracker, 'down', 1);
      expect(tracker.consecutiveFailures).toBe(2);
      expect(result).toBe('hung');
    });

    it('should track degraded status', () => {
      tracker.consecutiveFailures = 0;

      const result = updateHealthStatus(tracker, 'degraded', 3);
      expect(tracker.consecutiveFailures).toBe(1);
      expect(result).toBe('degraded');
      expect(tracker.lastStatus).toBe('degraded');
    });

    it('should update timestamp on check', () => {
      const before = Date.now();
      updateHealthStatus(tracker, 'ok');
      const after = Date.now();

      expect(tracker.lastCheckTime).toBeGreaterThanOrEqual(before);
      expect(tracker.lastCheckTime).toBeLessThanOrEqual(after);
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Integration Tests
  // ─────────────────────────────────────────────────────────────

  describe('Health Polling Lifecycle', () => {
    it('should track multiple services independently', () => {
      const tracker1 = createHealthTracker();
      const tracker2 = createHealthTracker();

      updateHealthStatus(tracker1, 'down', 3);
      updateHealthStatus(tracker1, 'down', 3);
      expect(tracker1.consecutiveFailures).toBe(2);

      updateHealthStatus(tracker2, 'ok', 3);
      expect(tracker2.consecutiveFailures).toBe(0);

      // Trackers should not affect each other
      expect(tracker1.consecutiveFailures).toBe(2);
      expect(tracker2.consecutiveFailures).toBe(0);
    });

    it('should recover from degraded to healthy', () => {
      const tracker = createHealthTracker();

      // Service goes down
      updateHealthStatus(tracker, 'down', 3);
      updateHealthStatus(tracker, 'down', 3);
      expect(tracker.consecutiveFailures).toBe(2);

      // Service recovers
      const result = updateHealthStatus(tracker, 'ok', 3);
      expect(tracker.consecutiveFailures).toBe(0);
      expect(result).toBe('healthy');
    });

    it('should use default threshold of 3', () => {
      const tracker = createHealthTracker();

      updateHealthStatus(tracker, 'down');
      updateHealthStatus(tracker, 'down');
      const result = updateHealthStatus(tracker, 'down');

      expect(tracker.consecutiveFailures).toBe(3);
      expect(result).toBe('hung');
    });
  });

  // ─────────────────────────────────────────────────────────────
  // StartCmd Enforcement Tests
  // ─────────────────────────────────────────────────────────────

  describe('StartCmd Enforcement (Overseer Integration)', () => {
    it('should respect per-service startCmd configuration', () => {
      // This is verified through manual test since spawning requires real processes
      // The parseStartCmd function correctly handles all command types
      
      const viCore = (parseStartCmd as any)('npm run dev');
      const docker = (parseStartCmd as any)('docker-compose up -d qdrant');
      
      expect(viCore.program).not.toBe(docker.program);
      expect(viCore.program).toBe('npm');
      expect(docker.program).toBe('docker-compose');
    });
  });
});
