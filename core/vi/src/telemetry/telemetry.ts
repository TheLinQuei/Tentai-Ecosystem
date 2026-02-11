import fs from 'fs/promises';
import path from 'path';
import { getLogger } from './logger.js';

export interface TelemetryEvent {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  type: string;
  data: Record<string, unknown>;
}

class TelemetryCollector {
  private telemetryPath: string;
  private enabled: boolean;

  constructor(telemetryPath: string, enabled: boolean) {
    this.telemetryPath = telemetryPath;
    this.enabled = enabled;
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      await fs.mkdir(this.telemetryPath, { recursive: true });
      getLogger().info(
        { path: this.telemetryPath },
        'Telemetry initialized'
      );
    } catch (error) {
      getLogger().error(
        { error, path: this.telemetryPath },
        'Failed to initialize telemetry directory'
      );
    }
  }

  async recordEvent(event: TelemetryEvent): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const filename = path.join(this.telemetryPath, `${today}.jsonl`);
      const line = JSON.stringify(event) + '\n';
      await fs.appendFile(filename, line, 'utf-8');
    } catch (error) {
      getLogger().error(
        { error, event },
        'Failed to record telemetry event'
      );
    }
  }

  async getEventCount(): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    try {
      const files = await fs.readdir(this.telemetryPath);
      let count = 0;

      for (const file of files) {
        if (file.endsWith('.jsonl')) {
          const content = await fs.readFile(
            path.join(this.telemetryPath, file),
            'utf-8'
          );
          count += content.split('\n').filter((line) => line.trim()).length;
        }
      }

      return count;
    } catch (error) {
      getLogger().error({ error }, 'Failed to count telemetry events');
      return 0;
    }
  }
}

let telemetry: TelemetryCollector | null = null;

export function initializeTelemetry(
  telemetryPath: string,
  enabled: boolean
): TelemetryCollector {
  if (telemetry) {
    return telemetry;
  }

  telemetry = new TelemetryCollector(telemetryPath, enabled);
  return telemetry;
}

export function getTelemetry(): TelemetryCollector {
  if (!telemetry) {
    throw new Error(
      'Telemetry not initialized. Call initializeTelemetry first.'
    );
  }
  return telemetry;
}
