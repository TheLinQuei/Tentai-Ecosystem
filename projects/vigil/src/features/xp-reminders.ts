// src/features/xp-reminders.ts
import { ChannelType } from "discord.js";
import type { Client } from "discord.js";
import cron, { ScheduledTask } from "node-cron";   // <-- bring the type explicitly
import { getPref } from "../memory/vibrainStore";

type JobBundle = { daily?: ScheduledTask; weekly?: ScheduledTask };
const jobsByGuild = new Map<string, JobBundle>();

function toDailyCron(hhmm: string) {
  const [hh, mm] = hhmm.split(":").map(x => parseInt(x, 10));
  return `${mm} ${hh} * * *`;
}
function toWeeklyCron(spec: string) {
  const m = spec.match(/^(sun|mon|tue|wed|thu|fri|sat)@(\d{2}):(\d{2})$/i);
  if (!m) throw new Error("Bad weekly format");
  const day = ["sun","mon","tue","wed","thu","fri","sat"].indexOf(m[1].toLowerCase());
  const hh = parseInt(m[2], 10), mm = parseInt(m[3], 10);
  return `${mm} ${hh} * * ${day}`;
}

export async function rescheduleXpReminders(client: Client, guildId: string) {
  // clear existing
  const prev = jobsByGuild.get(guildId);
  void prev?.daily?.stop();
  void prev?.weekly?.stop();
  jobsByGuild.delete(guildId);

  const cfg = getPref<any>(guildId, "xp.points.reminders", null);
  if (!cfg || !cfg.enabled) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const ch = cfg.channelId ? guild.channels.cache.get(cfg.channelId) : null;
  if (!ch || ch.type !== ChannelType.GuildText) return;   // no magic 0
  const channel = ch;

  const rolePing = cfg.roleId ? `<@&${cfg.roleId}> ` : "";
  const tz = cfg.tz || "UTC";

  const daily = cron.schedule(toDailyCron(cfg.daily), async () => {
    try { await channel.send(`${rolePing}Daily XP reset. Use **/daily** to claim and keep your streak.`); } catch {}
  }, { timezone: tz });

  const weekly = cron.schedule(toWeeklyCron(cfg.weekly), async () => {
    try { await channel.send(`${rolePing}Weekly XP reset. Use **/weekly** to claim for the big boost.`); } catch {}
  }, { timezone: tz });

  jobsByGuild.set(guildId, { daily, weekly });
}

export function wireXpReminders(client: Client) {
  client.once("ready", async () => {
    for (const [gid] of client.guilds.cache) {
      await rescheduleXpReminders(client, gid);
    }
  });
}
