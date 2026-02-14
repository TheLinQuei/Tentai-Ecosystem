/**
 * Log Viewer Spawner
 * 
 * Opens a dedicated PowerShell window that tails the latest log file
 * Provides real-time log viewing during bot operation
 */

import { spawn } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { logger } from './logger';

const LOG_DIR = path.join(process.cwd(), 'logs');
const today = new Date().toISOString().split('T')[0];
const logFile = path.join(LOG_DIR, `discord-${today}.log`);

/**
 * Spawns a PowerShell window that tails the current log file
 * Only works on Windows
 */
export function spawnLogViewer() {
  // Only spawn on Windows
  if (process.platform !== 'win32') {
    logger.info('Log viewer only supported on Windows');
    return;
  }

  // Wait a moment for log file to be created
  setTimeout(() => {
    if (!existsSync(logFile)) {
      logger.warn({ logFile }, 'Log file not found, skipping viewer spawn');
      return;
    }

    try {
      // PowerShell command to tail log file with color coding
      const psCommand = `
        $logFile = '${logFile.replace(/\\/g, '\\\\')}';
        $host.UI.RawUI.WindowTitle = 'Vi Bot Logs - ${today}';
        Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan;
        Write-Host '📋 Vi Discord Bot - Live Log Viewer' -ForegroundColor Green;
        Write-Host "📁 Tailing: $logFile" -ForegroundColor Yellow;
        Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan;
        Write-Host '';
        
        Get-Content -Path $logFile -Wait -Tail 50 | ForEach-Object {
          $line = $_;
          
          # Color code based on log level
          if ($line -match '"level":(30|"info")') {
            Write-Host $line -ForegroundColor White
          }
          elseif ($line -match '"level":(20|"debug")') {
            Write-Host $line -ForegroundColor Gray
          }
          elseif ($line -match '"level":(40|"warn")') {
            Write-Host $line -ForegroundColor Yellow
          }
          elseif ($line -match '"level":(50|60|"error"|"fatal")') {
            Write-Host $line -ForegroundColor Red
          }
          elseif ($line -match '(🚀|✅|🎯|⚡|📨|🧠|💭|🔍|👁️)') {
            Write-Host $line -ForegroundColor Cyan
          }
          else {
            Write-Host $line
          }
        }
      `.trim();

      // Spawn PowerShell window using full path to avoid PATH resolution issues
      const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const logViewer = spawn(psPath, [
        '-NoExit',
        '-Command',
        psCommand
      ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });

      logViewer.unref(); // Allow parent to exit independently

      logger.info('📺 Log viewer window spawned');
    } catch (err) {
      logger.error({ err }, 'Failed to spawn log viewer');
    }
  }, 1000); // Wait 1 second for log file creation
}

/**
 * Spawns a filtered log viewer for specific events
 */
export function spawnFilteredLogViewer(filter: string, title: string) {
  if (process.platform !== 'win32') return;

  setTimeout(() => {
    if (!existsSync(logFile)) return;

    try {
      const psCommand = `
        $logFile = '${logFile.replace(/\\/g, '\\\\')}';
        $host.UI.RawUI.WindowTitle = '${title}';
        Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan;
        Write-Host '📋 ${title}' -ForegroundColor Green;
        Write-Host "🔍 Filter: ${filter}" -ForegroundColor Yellow;
        Write-Host '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' -ForegroundColor Cyan;
        Write-Host '';
        
        Get-Content -Path $logFile -Wait -Tail 20 | Where-Object { $_ -match '${filter}' } | ForEach-Object {
          Write-Host $_ -ForegroundColor Cyan
        }
      `.trim();

      const psPath = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';
      const viewer = spawn(psPath, ['-NoExit', '-Command', psCommand], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });

      viewer.unref();
      logger.info({ filter, title }, 'Filtered log viewer spawned');
    } catch (err) {
      logger.error({ err }, 'Failed to spawn filtered log viewer');
    }
  }, 1000);
}
