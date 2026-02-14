// src/modules/customCommands.ts
import { promises as fs } from "fs";
import path from "path";
import type { ChatInputCommandInteraction, Client, RESTPostAPIChatInputApplicationCommandsJSONBody } from "discord.js";

export type SimpleCmd = { name: string; description: string; response: string; ephemeral?: boolean };

const DB_PATH = process.env.CUSTOM_CMDS_DB_PATH || path.join(process.cwd(), "data", "custom-commands.json");

type Store = Record<string, SimpleCmd[]>;

async function ensure(): Promise<Store> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
    await fs.writeFile(DB_PATH, JSON.stringify({}, null, 2));
    return {};
  }
}
async function save(s: Store) { await fs.writeFile(DB_PATH, JSON.stringify(s, null, 2)); }

export const CustomCommands = {
  async list(guildId: string): Promise<SimpleCmd[]> {
    const s = await ensure();
    return s[guildId] || [];
  },
  async add(guildId: string, cmd: SimpleCmd) {
    const s = await ensure();
    const list = s[guildId] || [];
    const idx = list.findIndex((c) => c.name === cmd.name);
    if (idx >= 0) list[idx] = cmd; else list.push(cmd);
    s[guildId] = list;
    await save(s);
  },
  async remove(guildId: string, name: string) {
    const s = await ensure();
    s[guildId] = (s[guildId] || []).filter((c) => c.name !== name);
    await save(s);
  },

  async maybeHandle(i: ChatInputCommandInteraction): Promise<boolean> {
    if (!i.guildId) return false;
    const list = await this.list(i.guildId);
    const match = list.find((c) => c.name === i.commandName);
    if (!match) return false;
    await i.reply({ content: match.response, ephemeral: !!match.ephemeral });
    return true;
  },

  async syncGuild(client: Client, guildId: string) {
    const g = await client.guilds.fetch(guildId).catch(() => null);
    if (!g) return;
    const existing = await g.commands.fetch();
    const desired = await this.list(guildId);

    for (const c of desired) {
      const found = existing.find((ec) => ec.name === c.name);
      const body: RESTPostAPIChatInputApplicationCommandsJSONBody = {
        name: c.name,
        description: c.description || "Custom command",
        type: 1,
        dm_permission: false,
        default_member_permissions: null,
      } as any;
      if (!found) await g.commands.create(body);
      else {
        if (found.description !== body.description) await g.commands.edit(found, body);
      }
    }

    const names = new Set(desired.map((d) => d.name));
    for (const ec of existing.values()) {
      if (!names.has(ec.name)) {
        if (!ec.options?.length) await g.commands.delete(ec.id).catch(() => {});
      }
    }
  },
};
