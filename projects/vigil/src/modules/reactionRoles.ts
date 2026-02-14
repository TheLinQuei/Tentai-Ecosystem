// src/modules/reactionRoles.ts
import {
  Client,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import fs from "node:fs";
import path from "node:path";

// Map emoji → role name
const REACTION_MAP: Record<string, string> = {
  "✴️": "Celestials",
  "☄️": "Akuma",
  "🛠️": "Mortal-Born",
  "🌿": "Independents",
  "📢": "Decrees Ping",
  "📅": "Events Ping",
  "🗺️": "LFG Ping",
  "📚": "Lore Drop Ping",
};

// Factions are enforced single-select
const FACTIONS = ["Celestials", "Akuma", "Mortal-Born", "Independents"];

type PanelInfo = { guildId: string; channelId: string; messageId: string };

const memoryDir = path.join(process.cwd(), "memory");
const memoryPath = path.join(memoryDir, "rolepanel.json");

// --- persist/read the reaction-panel message id ---
export function writeReactionPanelMemory(data: PanelInfo) {
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });
  fs.writeFileSync(memoryPath, JSON.stringify(data, null, 2));
}

function readReactionPanelMemory(): PanelInfo | null {
  if (!fs.existsSync(memoryPath)) return null;
  try {
    const raw = fs.readFileSync(memoryPath, "utf8");
    const parsed = JSON.parse(raw) as PanelInfo;
    if (!parsed.guildId || !parsed.channelId || !parsed.messageId) return null;
    return parsed;
  } catch {
    return null;
  }
}

// --- wire reaction add/remove listeners ---
export function initReactionRoles(client: Client) {
  // Add role on react
  client.on(
    "messageReactionAdd",
    async (rx: MessageReaction | PartialMessageReaction, u: User | PartialUser) => {
      if (u.bot) return;
      const panel = readReactionPanelMemory();
      if (!panel) return;

      try {
        if (rx.partial) await rx.fetch();
        const msg = rx.message;
        if (!msg.inGuild()) return;
        if (msg.id !== panel.messageId || msg.channelId !== panel.channelId) return;

        const emoji = rx.emoji.name!;
        const roleName = REACTION_MAP[emoji];
        if (!roleName) return;

        const guild = msg.guild;
        const member = await guild.members.fetch(u.id);
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (!role) return;

        // enforce single faction
        if (FACTIONS.includes(roleName)) {
          const toRemove = member.roles.cache.filter(
            (r) => FACTIONS.includes(r.name) && r.id !== role.id
          );
          if (toRemove.size) await member.roles.remove([...toRemove.keys()]).catch(() => {});
        }

        await member.roles.add(role).catch(() => {});
      } catch {
        /* swallow */
      }
    }
  );

  // Remove role on unreact
  client.on(
    "messageReactionRemove",
    async (rx: MessageReaction | PartialMessageReaction, u: User | PartialUser) => {
      if (u.bot) return;
      const panel = readReactionPanelMemory();
      if (!panel) return;

      try {
        if (rx.partial) await rx.fetch();
        const msg = rx.message;
        if (!msg.inGuild()) return;
        if (msg.id !== panel.messageId || msg.channelId !== panel.channelId) return;

        const emoji = rx.emoji.name!;
        const roleName = REACTION_MAP[emoji];
        if (!roleName) return;

        const guild = msg.guild;
        const member = await guild.members.fetch(u.id);
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (!role) return;

        await member.roles.remove(role).catch(() => {});
      } catch {
        /* swallow */
      }
    }
  );
}
