import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HealthLog {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'down';
  services: {
    backend: { status: string; url?: string; error?: string };
    database: { status: string; error?: string };
    console: { status: string; url?: string };
  };
  errors: string[];
}

const LOG_FILE = path.join(__dirname, '../../HEALTH_LOG.md');

async function checkBackend(url: string): Promise<{ status: string; error?: string }> {
  try {
    const response = await fetch(`${url}/v1/health`, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      return { status: 'online' };
    }
    return { status: 'error', error: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'down', error: error instanceof Error ? error.message : String(error) };
  }
}

async function checkHealth(): Promise<HealthLog> {
  const timestamp = new Date().toISOString();
  const errors: string[] = [];

  // Check local backend
  const localBackend = await checkBackend('http://localhost:3000');
  
  // Check Railway backend (if deployed)
  const railwayUrl = process.env.RAILWAY_URL || '';
  const railwayBackend = railwayUrl ? await checkBackend(railwayUrl) : { status: 'not_deployed' };

  // Determine overall status
  const backendOnline = localBackend.status === 'online' || railwayBackend.status === 'online';
  
  if (!backendOnline) {
    errors.push('Backend is down');
  }

  const log: HealthLog = {
    timestamp,
    status: errors.length === 0 ? 'healthy' : 'degraded',
    services: {
      backend: {
        status: localBackend.status === 'online' ? 'online' : railwayBackend.status,
        url: localBackend.status === 'online' ? 'http://localhost:3000' : railwayUrl,
        error: localBackend.error || railwayBackend.error,
      },
      database: {
        status: 'unknown', // Will be populated by backend health check
      },
      console: {
        status: 'deployed',
        url: 'https://tentaitech.com/console/',
      },
    },
    errors,
  };

  return log;
}

function formatLog(log: HealthLog): string {
  const statusEmoji = log.status === 'healthy' ? '✅' : log.status === 'degraded' ? '⚠️' : '❌';
  
  return `
## ${statusEmoji} Health Check - ${log.timestamp}

**Overall Status**: ${log.status.toUpperCase()}

### Services

| Service | Status | Details |
|---------|--------|---------|
| Backend | ${log.services.backend.status} | ${log.services.backend.url || 'N/A'} ${log.services.backend.error ? `(${log.services.backend.error})` : ''} |
| Database | ${log.services.database.status} | ${log.services.database.error || 'N/A'} |
| Console | ${log.services.console.status} | ${log.services.console.url} |

${log.errors.length > 0 ? `### Errors\n${log.errors.map(e => `- ${e}`).join('\n')}` : ''}

---
`;
}

async function writeHealthLog() {
  const log = await checkHealth();
  const formatted = formatLog(log);

  // Read existing log
  let existingLog = '';
  if (fs.existsSync(LOG_FILE)) {
    existingLog = fs.readFileSync(LOG_FILE, 'utf-8');
  }

  // Prepend new log (most recent first)
  const header = `# Tentai Ecosystem - Health Log\n\nAutomatically generated health checks. Most recent first.\n\n`;
  const newLog = header + formatted + existingLog.replace(header, '');

  // Keep only last 50 entries
  const entries = newLog.split('---').slice(0, 51);
  const trimmedLog = entries.join('---');

  fs.writeFileSync(LOG_FILE, trimmedLog);

  console.log(`✅ Health check logged at ${log.timestamp}`);
  console.log(`Status: ${log.status}`);
  
  if (log.errors.length > 0) {
    console.error('⚠️ Errors detected:');
    log.errors.forEach(e => console.error(`  - ${e}`));
    process.exit(1);
  }
}

writeHealthLog().catch(console.error);
