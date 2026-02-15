import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from 'discord.js';
import http from 'node:http';
import { AudioNode } from '@/audio/node';

const OWNER_ID = process.env.BOT_OWNER_ID || process.env.FORSA_ID;

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('[Owner] Check Vi service health and uptime');

async function httpGet(url: string, timeoutMs = 3000): Promise<{ status: number; body?: any }> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const body = JSON.parse(data);
          resolve({ status: res.statusCode || 0, body });
        } catch {
          resolve({ status: res.statusCode || 0 });
        }
      });
    });
    req.on('error', () => resolve({ status: 0 }));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ status: 0 }); });
  });
}

// Consider any HTTP response as reachable (200-599). Network/timeouts = unreachable.
async function httpReachable(url: string, timeoutMs = 1500): Promise<boolean> {
  const { status } = await httpGet(url, timeoutMs);
  return status > 0; // any response indicates a listening server
}

function formatStatus(on: boolean): string {
  return on ? '🟢 Online' : '🔴 Offline';
}

export async function execute(interaction: ChatInputCommandInteraction) {
  // Owner-only restriction
  if (interaction.user.id !== OWNER_ID) {
    return interaction.reply({ content: '❌ This command is restricted to the bot owner.', flags: MessageFlags.Ephemeral });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const uptimeSec = process.uptime();
  const uptimeStr = formatUptime(uptimeSec);

  // Check service health
  const [brainReachable, memoryReachable, admin] = await Promise.all([
    httpReachable('http://127.0.0.1:4312/health'),
    httpReachable('http://127.0.0.1:4311/health'),
    httpGet('http://127.0.0.1:4310/health'), // Admin does expose /health
  ]);

  const brainStatus = formatStatus(brainReachable);
  const memoryStatus = formatStatus(memoryReachable);
  const adminStatus = admin.status >= 200 && admin.status < 300 ? '🟢 Online' : '🔴 Offline';

  // Versions (best-effort via admin health payload)
  const brainVersion = admin.body?.services?.brain?.version || 'n/a';
  const memoryVersion = admin.body?.services?.memory?.version || 'n/a';

  // Lavalink health (best-effort)
  let lavalinkStatus = 'N/A';
  try {
    const audio = AudioNode.init(interaction.client as any);
    const mgr: any = (audio as any).manager;
    const nodes: any[] = [];
    try {
      if (mgr?.nodeManager?.nodes?.values) nodes.push(...Array.from(mgr.nodeManager.nodes.values()));
      else if (mgr?.nodes?.values) nodes.push(...Array.from(mgr.nodes.values()));
      else if (Array.isArray(mgr?.nodes)) nodes.push(...mgr.nodes);
    } catch {}
    const connected = nodes.some((n: any) => n?.socket?.readyState === 1 || n?.connected === true || n?._connected === true);
    lavalinkStatus = formatStatus(connected);
  } catch {
    // ignore
  }

  const embed = new EmbedBuilder()
    .setTitle('📊 Vi Service Status')
    .setColor(0x5865F2)
    .addFields(
      { name: '⏱️ Uptime', value: uptimeStr, inline: true },
      { name: '💾 Memory Usage', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`, inline: true },
      { name: '\u200B', value: '\u200B', inline: true },
      { name: '🧠 Brain Service', value: `${brainStatus}\n\`v${brainVersion}\``, inline: true },
      { name: '💾 Memory API', value: `${memoryStatus}\n\`v${memoryVersion}\``, inline: true },
      { name: '🎵 Lavalink', value: lavalinkStatus, inline: true },
      { name: '⚙️ Admin Server', value: adminStatus, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}
