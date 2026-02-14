import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
} from "discord.js";
import fs from "node:fs/promises";

/* ========= CONFIG (your values) ========= */
const DEADLINE = "Tue Sep 2, 10:00 PM CT";           // Oklahoma = Central
const OATH_CHANNEL_ID = "1410147182279131166";       // #oath
const APPEALS_CHANNEL_ID = "1409730919803387958";    // #appeals-court
/* ======================================= */

const KEEP_DB = "data/keep.json";
const OPTOUT_DB = "data/optout.json";

/* ---------- JSON helpers ---------- */
async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}
async function writeJson(path: string, data: any) {
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(path, JSON.stringify(data, null, 2));
}

/* ---------- Public DB helpers ---------- */
export async function markKeep(userId: string) {
  const db = await readJson<Record<string, number>>(KEEP_DB, {});
  db[userId] = Date.now();
  await writeJson(KEEP_DB, db);
}
export async function isOptedOut(userId: string) {
  const db = await readJson<Record<string, number>>(OPTOUT_DB, {});
  return Boolean(db[userId]);
}
export async function markOptOut(userId: string) {
  const db = await readJson<Record<string, number>>(OPTOUT_DB, {});
  db[userId] = Date.now();
  await writeJson(OPTOUT_DB, db);
}
export async function readKeepMap() {
  return readJson<Record<string, number>>(KEEP_DB, {});
}

/* ---------- DM content ---------- */
export function buildPurgeEmbed(guildId: string, guildName: string) {
  const oathUrl = `https://discord.com/channels/${guildId}/${OATH_CHANNEL_ID}`;
  const appealsUrl = `https://discord.com/channels/${guildId}/${APPEALS_CHANNEL_ID}`;

  return new EmbedBuilder()
    .setTitle(`A note from ${guildName || "The Odyssey"}`)
    .setDescription(
      [
        "Hey! Sorry for the unexpected DM. I’m **Vi**, the server assistant built by **Shykem** (formerly **Celestial Vengeance**).",
        "We used to be **xlGAMINGlx** — we’re now **The Odyssey**.",
        "",
        "We’re doing a quick roster cleanup so only folks who want to stay keep their spot.",
        "**If you were active or reacted in the last month, you’re good — you can ignore this.**",
        "",
        `If you **want to stay**, tap **I’m staying** or visit **#oath** before **${DEADLINE}**.`,
        "",
        "This is a one-time message. I’ll never ask for passwords or sensitive info.",
        "Reply **STOP** to opt out of future notices.",
      ].join("\n"),
    )
    .addFields(
      { name: "Stay link", value: oathUrl },
      { name: "Questions?", value: `Appeals: ${appealsUrl}` },
    )
    .setColor(0xd1b279);
}

export function stayRow(guildId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("purge:stay")
      .setLabel("I’m staying")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setLabel("Open #oath")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guildId}/${OATH_CHANNEL_ID}`),
  );
}

/* ---------- Mass DM ---------- */
function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** DM everyone (except bots); paced to be rate-limit safe. */
export async function sendMassDM(guild: Guild) {
  const members = await guild.members.fetch({ withPresences: false });
  const embed = buildPurgeEmbed(guild.id, guild.name);

  let sent = 0,
    failed = 0,
    idx = 0;

  for (const [, m] of members) {
    idx++;
    if (m.user.bot) continue;
    if (await isOptedOut(m.id)) continue; // honor STOP

    try {
      const dm = await m.createDM(true);
      await dm.send({ embeds: [embed], components: [stayRow(guild.id)] });
      sent++;
    } catch {
      failed++;
    }

    // ~40/min (plenty for ~80 members)
    await wait(1500);

    // Console heartbeat every 20 members
    if (idx % 20 === 0) {
      console.log(`[purge-dm] progress: ${idx}/${members.size}`);
    }
  }
  console.log(`[purge-dm] done: sent ${sent}, failed ${failed}`);
  return { sent, failed };
}

/* ---------- Read-only name tools (no DMs) ---------- */
export type KeepResolved = {
  id: string;
  when: number;
  name: string; // display/global/username best-effort
  inGuild: boolean;
};

export async function resolveKeep(guild: Guild): Promise<KeepResolved[]> {
  const keep = await readKeepMap();
  const members = await guild.members.fetch({ withPresences: false }).catch(() => null);

  const rows: KeepResolved[] = [];
  for (const [id, when] of Object.entries(keep)) {
    const m = members?.get(id);
    let name = "";
    let inGuild = false;

    if (m) {
      name = m.displayName || m.user.globalName || m.user.username || id;
      inGuild = true;
    } else {
      const u = await guild.client.users.fetch(id).catch(() => null);
      name = u?.globalName || u?.username || id;
      inGuild = false;
    }
    rows.push({ id, when, name, inGuild });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return rows;
}

export async function exportKeepNames(guild: Guild) {
  const rows = await resolveKeep(guild);
  const lines = rows.map((r) => `${r.name}${r.inGuild ? "" : " (left)"}`);
  const path = "data/keep-names.txt";
  await fs.mkdir("data", { recursive: true });
  await fs.writeFile(path, lines.join("\n"), "utf8");
  return { path, total: rows.length, left: rows.filter((r) => !r.inGuild).length };
}
