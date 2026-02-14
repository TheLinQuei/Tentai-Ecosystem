import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { connect, type NatsConnection, StringCodec } from 'nats';
import { registerAndWireCommands } from '@/command';
import { initApplications } from '@/features/applications';
import { initGuardian } from '@/features/guardian';
import { initInteractionRouter } from '@/core/interactionRouter';
import { loadConsent } from '@/core/consent';
import { loadBrain } from '@/memory/vibrainStore';
import { attachAdminServer } from '@/admin/server';
import { prisma } from '@/db/prisma';
import { CONFIG } from '@/core/config';
import { validateEnv } from '@/core/env';
import { AudioNode } from '@/audio/node';
import { initAutoCrew } from '@/modules/autoCrew';
import { registerOathboundOnboarding } from '@/features/oathbound';
import { initOptionalFactions } from '@/modules/factions-optional';
import { initPingSelector } from '@/features/pings';
import { initRolePanel } from '@/modules/rolePanel';
// import { wirePhatic } from '@/features/phatic';
import { wireClarifier } from '@/features/clarifier';
// import { initFunModule } from '@/modules/fun';
import { initProgression } from '@/features/progression';
import { initReactionRoles } from '@/modules/reactionRoles';
import { initLfgHandlers } from '@/modules/lfg';
import { initGate } from '@/modules/gate';
import { initDailyPolls } from '@/features/polls';
import { initDiagnostics } from '@/features/diagnostics';
import { initReminders } from '@/features/reminders';
import { setupShutdownHandlers } from '@/core/shutdown';

// NATS connection for Brain bridge
let natsConnection: NatsConnection | null = null;
let adminServerInstance: any = null;

export async function bootstrap(checkpoint?: (label: string) => void): Promise<void> {
  console.log('\n[BOOTSTRAP] Starting Vi Discord Bot...');
  console.log('[BOOTSTRAP] Loading configuration...');
  // Validate environment early (throws on critical issues)
  try {
    validateEnv();
    console.log('[BOOTSTRAP] ✓ Environment validated');
  } catch (e) {
    console.error('[BOOTSTRAP] ✗ Environment validation failed:', e);
    throw e;
  }
  
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
  });
  console.log('[BOOTSTRAP] ✓ Discord client created');
  checkpoint?.("env loaded");

  console.log('[DATABASE] Connecting to PostgreSQL via Prisma...');
  // Log target (sanitized) to confirm we're not using localhost accidentally
  try {
    const raw = process.env.DATABASE_URL || '';
    if (raw) {
      const u = new URL(raw);
      const host = u.hostname;
      const port = u.port || '5432';
      const db = (u.pathname || '').replace(/^\//, '') || '(default)';
      console.log(`[DATABASE] Target → ${host}:${port}/${db}`);
    } else {
      console.warn('[DATABASE] DATABASE_URL is empty');
    }
  } catch {
    console.warn('[DATABASE] Failed to parse DATABASE_URL');
  }
  // Be resilient on cold starts: Postgres (especially new clusters) can take a few seconds
  // to accept connections. Retry with backoff instead of exiting immediately.
  try {
    const maxAttempts = 30; // ~60s total with 2s delay
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await prisma.$connect();
        console.log('[DATABASE] ✓ Connected to database');
        checkpoint?.('db connected');
        break;
      } catch (err) {
        const msg = (err as any)?.message || String(err);
        const code = (err as any)?.code || (err as any)?.errorCode || '';
        const delayMs = 2000;
        console.warn(`[DATABASE] Connection attempt ${attempt}/${maxAttempts} failed${code ? ` (${code})` : ''}: ${msg}`);
        if (attempt === maxAttempts) throw err;
        await new Promise(res => setTimeout(res, delayMs));
      }
    }
  } catch (e) {
    console.error('[DATABASE] ✗ Database connection failed:', e);
    throw e;
  }

  console.log('[MEMORY] Loading ViBrain and consent data...');
  try {
    await loadBrain();
    console.log('[MEMORY] ✓ ViBrain loaded');
  } catch (e) {
    console.error('[MEMORY] ✗ ViBrain load failed:', e);
  }

  try {
    await loadConsent();
    console.log('[MEMORY] ✓ Consent data loaded');
  } catch (e) {
    console.error('[MEMORY] ✗ Consent load failed:', e);
  }

  // Connect to NATS for Brain bridge
  console.log('[NATS] Connecting to NATS for Brain bridge...');
  try {
    const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
    natsConnection = await connect({ servers: natsUrl });
    console.log(`[NATS] ✓ Connected to ${natsUrl}`);
  } catch (e) {
    console.error('[NATS] ✗ NATS connection failed:', e);
    console.error('[NATS] Brain bridge will be disabled');
  }

  // Cross-version ready compatibility: support both 'ready' (v14) and 'clientReady' (v15+)
  const readyOnce = new Promise<void>((resolve) => {
    let fired = false;
    const runOnce = async () => {
      if (fired) return; // ensure single execution
      fired = true;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`[STARTUP] Vi Discord Bot - Initializing`);
      console.log(`[STARTUP] Logged in as ${client.user?.tag}`);
      console.log(`[STARTUP] Serving ${client.guilds.cache.size} guild(s)`);
      console.log(`${'='.repeat(60)}\n`);

      // Let AI module access Discord for lookups (admins/mods/member counts)
      try { 
        // setAIModuleClient(client as any);
        // console.log('[MODULE] ✓ AI Module - Client context set');
      } catch (e) { 
        console.error('[MODULE] ✗ AI Module - Failed:', e);
      }

      // Fire-and-forget non-blocking command (re)registration unless disabled
      const disableSync = (process.env.DISABLE_COMMAND_SYNC || '').trim().toLowerCase();
      if (disableSync === 'true' || disableSync === '1' || disableSync === 'yes') {
        console.log('[COMMANDS] Skipped re-registration (safe mode: DISABLE_COMMAND_SYNC)');
      } else {
        (async () => {
          console.log('[COMMANDS] Non-blocking registration starting...');
          let registeredCount = 0;
          let coreTimeoutWarned = false;
          for (const [gid] of client.guilds.cache) {
            const start = Date.now();
            // Timeout guard - 15 minutes for large command sets (49 commands can take 5-10 minutes)
            const TIMEOUT_MS = 900000; // 15 minutes
            const race = async <T>(p: Promise<T>): Promise<T> => {
              return Promise.race<T>([
                p,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)) as any,
              ]);
            };
            try {
              // Register all commands (core + progression unified)
              await race(registerAndWireCommands(client, gid, CONFIG.DISCORD_TOKEN));
              registeredCount++;
            } catch (e) {
              const msg = (e as any)?.message || String(e);
              if (msg.includes('timeout')) {
                if (!coreTimeoutWarned) {
                  coreTimeoutWarned = true;
                  console.warn(`[COMMANDS] Unified sync skipped (timeout after ${TIMEOUT_MS/1000}s); suppressing further timeout logs...`);
                  console.warn(`[COMMANDS] Note: ${registeredCount > 0 ? 'Commands may still be registering in background.' : 'Try /refresh command when bot is online.'}`);
                }
              } else {
                console.warn(`[COMMANDS] Command sync skipped for guild ${gid} (${msg})`);
              }
            }
            // Snapshot (best-effort)
            try {
              const g = client.guilds.cache.get(gid);
              if (g) {
                const fetched = await g.commands.fetch();
                const list = [...fetched.values()].map(c => `/${c.name}`).sort();
                console.log(`[COMMANDS] Guild ${g.name} (${gid}) → ${list.join(' ')}`);
              }
            } catch { /* silent */ }
            console.log(`[COMMANDS] Guild ${gid} processed in ${Date.now() - start}ms`);
          }
          console.log(`[COMMANDS] (async) Registered: ${registeredCount}/${client.guilds.cache.size} guilds`);
          checkpoint?.('commands registered');
          console.log('[COMMANDS] Non-blocking registration finished');
        })().catch(err => console.warn('[COMMANDS] async registration error:', err));
      }

      // Wire interaction router
      console.log('\n[CORE] Initializing core systems...');
      try {
        initInteractionRouter(client);
        console.log('[CORE] ✓ Interaction Router');
      } catch (e) {
        console.error('[CORE] ✗ Interaction Router failed:', e);
      }

      // Initialize feature modules
      console.log('\n[FEATURES] Initializing feature modules...');
      
      try {
        initApplications(client);
        console.log('[FEATURES] ✓ Applications System');
      } catch (e) {
        console.error('[FEATURES] ✗ Applications System failed:', e);
      }

      try {
        initGuardian(client);
        console.log('[FEATURES] ✓ Guardian (Moderation)');
      } catch (e) {
        console.error('[FEATURES] ✗ Guardian failed:', e);
      }

      try {
        initProgression(client);
        console.log('[FEATURES] ✓ Progression (XP, Economy, Shop, Leaderboards)');
      } catch (e) {
        console.error('[FEATURES] ✗ Progression failed:', e);
      }

      // try {
      //   wirePhatic(client);
      //   console.log('[FEATURES] ✓ Phatic (Conversational AI)');
      // } catch (e) {
      //   console.error('[FEATURES] ✗ Phatic failed:', e);
      // }

      try {
        wireClarifier(client);
        console.log('[FEATURES] ✓ Clarifier (Message Enhancement)');
      } catch (e) {
        console.error('[FEATURES] ✗ Clarifier failed:', e);
      }

      try {
        initPingSelector(client);
        console.log('[FEATURES] ✓ Ping Selector');
      } catch (e) {
        console.error('[FEATURES] ✗ Ping Selector failed:', e);
      }

      try {
        initDailyPolls(client);
        console.log('[FEATURES] ✓ Daily Polls');
      } catch (e) {
        console.error('[FEATURES] ✗ Daily Polls failed:', e);
      }

      try {
        await initDiagnostics(client);
        console.log('[FEATURES] ✓ Diagnostics');
      } catch (e) {
        console.error('[FEATURES] ✗ Diagnostics failed:', e);
      }

      try {
        await initReminders(client);
        console.log('[FEATURES] ✓ Reminders (Redis polling)');
      } catch (e) {
        console.error('[FEATURES] ✗ Reminders failed:', e);
      }

      // Initialize game/community modules
      console.log('\n[MODULES] Initializing community modules...');

      try {
        initAutoCrew(client); // Disabled - kept for compatibility
        registerOathboundOnboarding(client);
        console.log('[MODULES] ✓ Oathbound Onboarding (Welcome/Farewell + Role Assignment)');
      } catch (e) {
        console.error('[MODULES] ✗ Oathbound Onboarding failed:', e);
      }

      try {
        initOptionalFactions(client);
        console.log('[MODULES] ✓ Faction System (Multi-Select + Hybrids)');
      } catch (e) {
        console.error('[MODULES] ✗ Faction System failed:', e);
      }

      try {
        initRolePanel(client);
        console.log('[MODULES] ✓ Role Panel');
      } catch (e) {
        console.error('[MODULES] ✗ Role Panel failed:', e);
      }

      try {
        initReactionRoles(client);
        console.log('[MODULES] ✓ Reaction Roles (Legacy)');
      } catch (e) {
        console.error('[MODULES] ✗ Reaction Roles failed:', e);
      }

      try {
        initLfgHandlers(client);
        console.log('[MODULES] ✓ LFG (Looking For Group)');
      } catch (e) {
        console.error('[MODULES] ✗ LFG failed:', e);
      }

      try {
        initGate(client);
        console.log('[MODULES] ✓ Gate (Member Verification)');
      } catch (e) {
        console.error('[MODULES] ✗ Gate failed:', e);
      }

      try {
        // initFunModule(client);
        // console.log('[MODULES] ✓ Fun Module (Games & Entertainment)');
      } catch (e) {
        console.error('[MODULES] ✗ Fun Module failed:', e);
      }

      // Audio system
      console.log('\n[AUDIO] Initializing Lavalink...');
      checkpoint?.("lavalink init start");
      try {
        // Delay connect slightly to avoid early-open spam before the jar exposes /v4/info
        await new Promise((r) => setTimeout(r, 2000));
        const node = AudioNode.init(client);
        await node.ready().catch(() => {});
        console.log('[AUDIO] ✓ Lavalink connected');
        checkpoint?.("lavalink connected");
      } catch (e) {
        console.error('[AUDIO] ✗ Lavalink failed:', e);
      }

      // Admin API
      console.log('\n[ADMIN] Starting admin API server...');
      try {
        adminServerInstance = await attachAdminServer(client);
        console.log('[ADMIN] ✓ Admin API server ready');
        checkpoint?.("admin API ready");
      } catch (e) {
        console.error('[ADMIN] ✗ Admin API failed:', e);
      }

      // Setup graceful shutdown handlers (after all services initialized)
      setupShutdownHandlers(client, natsConnection, adminServerInstance);
      console.log('[SHUTDOWN] ✓ Graceful shutdown handlers registered');

      // NATS → Brain Message Bridge with auto-reconnect
      if (natsConnection) {
        console.log('\n[BRAIN BRIDGE] Setting up Discord → NATS event stream...');
        let reconnectAttempts = 0;
        const maxReconnectAttempts = 5;
        let brainHealthy = true;
        
        // Health check for Brain service (treat any HTTP response as reachable; network errors = unreachable)
        const checkBrainHealth = async (): Promise<boolean> => {
          try {
            await fetch('http://localhost:4312/health', { signal: AbortSignal.timeout(2000) });
            return true; // any response means server is up; we don't depend on specific payload
          } catch {
            return false;
          }
        };
        
        // Auto-reconnect logic
        const attemptReconnect = async () => {
          if (reconnectAttempts >= maxReconnectAttempts) {
            console.error('[BRAIN BRIDGE] ✗ Max reconnection attempts reached. Brain service may be down.');
            brainHealthy = false;
            return;
          }
          
          reconnectAttempts++;
          console.log(`[BRAIN BRIDGE] 🔄 Attempting reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
          
          try {
            const { connect } = await import('nats');
            const natsUrl = process.env.NATS_URL || 'nats://localhost:4222';
            natsConnection = await connect({ servers: natsUrl });
            console.log('[BRAIN BRIDGE] ✓ Reconnected to NATS');
            reconnectAttempts = 0; // Reset on success
            brainHealthy = true;
          } catch (err) {
            console.error('[BRAIN BRIDGE] ✗ Reconnection failed:', err);
            // Retry after delay
            setTimeout(attemptReconnect, 5000 * reconnectAttempts);
          }
        };
        
        // Only perform health checks at key moments to avoid noisy HTTP 404 logs in Brain service
        const onPotentialHealthChange = async () => {
          const healthy = await checkBrainHealth();
          if (!healthy && brainHealthy) {
            console.warn('[BRAIN BRIDGE] ⚠️  Brain service unreachable at http://localhost:4312/health');
            brainHealthy = false;
          } else if (healthy && !brainHealthy) {
            console.log('[BRAIN BRIDGE] ✓ Brain service recovered');
            brainHealthy = true;
          }
        };
        
        try {
          const sc = StringCodec();
          
          // Import logger
          const { logMessageEvent } = await import('../lib/logger.js');
          
          client.on('messageCreate', async (message) => {
            // Skip bot messages and messages without content
            if (message.author.bot || !message.content) return;

            try {
              // Log the message event with full context
              logMessageEvent({
                messageId: message.id,
                author: {
                  id: message.author.id,
                  username: message.author.username,
                },
                channel: {
                  id: message.channel.id,
                  name: message.channel.isDMBased() ? 'DM' : (message.channel as any).name,
                },
                guild: message.guild ? {
                  id: message.guild.id,
                  name: message.guild.name,
                } : undefined,
                content: message.content,
                contentLength: message.content.length,
              });

              const payload = {
                id: message.id,
                type: 'message',
                content: message.content,
                authorId: message.author.id,
                channelId: message.channel.id,
                guildId: message.guild?.id,
                timestamp: new Date().toISOString(),
                // Phase D: Include Discord display name for identity addressing
                authorDisplayName: message.member?.displayName || message.author.globalName || message.author.username,
              };

              natsConnection!.publish('discord.message', sc.encode(JSON.stringify(payload)));
              // Suppress per-message publish logs to keep bot terminal clean
              // console.log(`[BRAIN BRIDGE] ➡️  Published message ${message.id} to Brain`);
            } catch (err: any) {
              if (err?.code === 'CONNECTION_CLOSED') {
                console.error('[BRAIN BRIDGE] ✗ NATS connection lost, attempting reconnect...');
                await attemptReconnect();
                // Re-check Brain reachability after reconnection attempts
                void onPotentialHealthChange();
              } else {
                console.error('[BRAIN BRIDGE] Failed to publish message:', err);
              }
            }
          });
          
          // Initial health check
          void checkBrainHealth().then((initialHealth) => {
            if (!initialHealth) {
              console.warn('[BRAIN BRIDGE] ⚠️  Brain service not reachable at http://localhost:4312/health');
              console.warn('[BRAIN BRIDGE] ⚠️  Natural language messages will not be processed until Brain starts');
              brainHealthy = false;
            }
          });
          
          console.log('[BRAIN BRIDGE] ✓ Discord → NATS bridge active');
        } catch (e) {
          console.error('[BRAIN BRIDGE] ✗ Failed to setup message bridge:', e);
        }
      }

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[STARTUP] ✓ Vi Discord Bot is fully operational`);
      console.log(`[STARTUP] All systems initialized and ready`);
      console.log(`${'='.repeat(60)}\n`);

      resolve();
    };

    // Attach both listeners; whichever fires first proceeds
    client.once('ready', runOnce);
    (client as any).once?.('clientReady', runOnce);
  });

  console.log('\n[DISCORD] Logging in to Discord...');
  await client.login(CONFIG.DISCORD_TOKEN);
  console.log('[DISCORD] ✓ Login successful, waiting for ready/clientReady event...');
  checkpoint?.("discord login success");
  await readyOnce;
}