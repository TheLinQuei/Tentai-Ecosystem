import http from 'node:http';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, execSync } from 'node:child_process';

/*
  Vi Watchdog — keeps Vi online by:
  - killing stale processes on admin port before spawn
  - polling health endpoints
  - restarting bot process on failure
  - optional Discord alert via webhook

  Env:
  - WATCHDOG_CMD: command to start bot (default: "pnpm start")
  - WATCHDOG_DIR: working directory (default: project root)
  - HEALTH_URLS: JSON array of URLs to check (default: ["http://127.0.0.1:4312/health","http://127.0.0.1:4311/health"]) 
  - ALERT_WEBHOOK: Discord webhook for alerts (optional)
  - CHECK_INTERVAL_SEC: interval between checks (default: 30)
  - RESTART_BACKOFF_SEC: delay before restart (default: 5)
  - ADMIN_PORT: port to clear before spawn (default: 4310)
*/

function killProcessOnPort(port: number) {
  // Best-effort; never throw. If we can't determine PID, we skip.
  try {
    if (process.platform === 'win32') {
      // Attempt PowerShell if available; fallback to skipping.
      const psPath = process.env.SystemRoot ? `${process.env.SystemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe` : 'powershell.exe';
      try {
        const output = execSync(`"${psPath}" -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`, { encoding: 'utf8' }).trim();
        const pid = output.split(/\r?\n/).filter(Boolean)[0];
        if (pid && /^\d+$/.test(pid)) {
          console.log(`[watchdog] Killing stale process ${pid} on port ${port}`);
          execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        }
      } catch {
        // Silent; continue.
      }
    } else {
      try {
        execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore outer
  }
  // Extra sanity: try connecting; if connect succeeds, port occupied.
  try {
    const socket = net.createConnection({ port, host: '127.0.0.1' });
    socket.setTimeout(1000);
    socket.on('connect', () => {
      console.log(`[watchdog] Port ${port} still occupied after cleanup attempt.`);
      socket.destroy();
    });
    socket.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') {
        // Port free
      }
    });
  } catch {
    // ignore
  }
}

function httpGet(url: string, timeoutMs = 5000): Promise<number> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode || 0);
    });
    req.on('error', () => resolve(0));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(0); });
  });
}

async function alert(msg: string) {
  const hook = process.env.ALERT_WEBHOOK;
  if (!hook) return;
  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🚨 Vi Watchdog: ${msg}` })
    });
  } catch {}
}

async function checkHealth(urls: string[]): Promise<boolean> {
  const codes = await Promise.all(urls.map(u => httpGet(u)));
  return codes.every(c => c >= 200 && c < 500); // consider 4xx as app up
}

function spawnBot(cmd: string, cwd: string) {
  const [exe, ...args] = cmd.split(' ');
  const child = spawn(exe, args, { cwd, stdio: 'inherit', shell: true });
  return child;
}

async function main() {
  const cwd = process.env.WATCHDOG_DIR || process.cwd();
  const cmd = process.env.WATCHDOG_CMD || 'pnpm start';
  const adminPort = Number(process.env.ADMIN_PORT || 4310);
  const urls = (() => {
    try { return JSON.parse(process.env.HEALTH_URLS || '[]'); } catch { return []; }
  })();
  if (!urls.length) urls.push('http://127.0.0.1:4312/health', 'http://127.0.0.1:4311/health');

  const interval = Number(process.env.CHECK_INTERVAL_SEC || 30);
  const backoff = Number(process.env.RESTART_BACKOFF_SEC || 5);

  // Clear any stale admin server process before first spawn
  killProcessOnPort(adminPort);

  let child = spawnBot(cmd, cwd);

  while (true) {
    const ok = await checkHealth(urls);
    if (!ok) {
      await alert(`Health check failed. Restarting bot...`);
      try { child.kill('SIGTERM'); } catch {}
      await delay(backoff * 1000);
      
      // Clear port again before respawn
      killProcessOnPort(adminPort);
      child = spawnBot(cmd, cwd);
    }
    await delay(interval * 1000);
  }
}

main().catch(async (e) => {
  await alert(`Watchdog crashed: ${e?.message || e}`);
  process.exit(1);
});
