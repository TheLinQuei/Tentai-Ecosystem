// src/lib/metrics.ts
import { register, Counter, Histogram, Gauge } from 'prom-client';

// Enable default metrics (CPU, memory, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ prefix: 'vibot_' });

// Command execution metrics
export const commandCounter = new Counter({
  name: 'vibot_commands_total',
  help: 'Total number of commands executed',
  labelNames: ['command', 'status'],
});

export const commandDuration = new Histogram({
  name: 'vibot_command_duration_seconds',
  help: 'Command execution duration',
  labelNames: ['command'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// XP/Economy metrics
export const xpAwarded = new Counter({
  name: 'vibot_xp_awarded_total',
  help: 'Total XP awarded',
  labelNames: ['source'], // 'message' | 'voice'
});

export const economyTransactions = new Counter({
  name: 'vibot_economy_transactions_total',
  help: 'Total economy transactions',
  labelNames: ['type'], // 'daily' | 'weekly' | 'transfer'
});

// Music metrics
export const musicPlays = new Counter({
  name: 'vibot_music_plays_total',
  help: 'Total music tracks played',
  labelNames: ['source'], // 'youtube' | 'spotify' | 'soundcloud'
});

export const activeVoiceConnections = new Gauge({
  name: 'vibot_voice_connections_active',
  help: 'Current number of active voice connections',
});

// Guardian/Moderation metrics
export const moderationActions = new Counter({
  name: 'vibot_moderation_actions_total',
  help: 'Total moderation actions taken',
  labelNames: ['action'], // 'timeout' | 'kick' | 'ban' | 'warn'
});

export const guardianAlerts = new Counter({
  name: 'vibot_guardian_alerts_total',
  help: 'Total Guardian mental health alerts',
  labelNames: ['severity'],
});

// HTTP metrics
export const httpRequestDuration = new Histogram({
  name: 'vibot_http_request_duration_seconds',
  help: 'HTTP request duration',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
});

// Export registry for /metrics endpoint
export { register };
