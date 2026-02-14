// src/core/interactionRouter.ts
import type { Client, ChatInputCommandInteraction, Interaction } from "discord.js";
import { commands } from "../commands";
import { progressionHandlers } from "../features/progression";
import { CustomCommands } from "../modules/customCommands";
import { handleButton as handleMusicButton, handleSelectMenu as handleMusicSelectMenu } from "../features/music";
import { touchUser, getUser, getGuild, setGuildMemberCount } from "../memory/vibrainStore";
import { MessageFlags } from "discord.js";
import { logCommand } from "../lib/logger.js";

type CommandModule = {
  data: { name: string };
  execute: (i: ChatInputCommandInteraction) => Promise<any>;
};

const ROUTER_WIRED = Symbol.for("vi.router.wired");

// DM/guild-safe reply helper (no ephemeral in DMs; edit when already replied)
async function safeReply(i: ChatInputCommandInteraction, content: string, allowEphemeral = true) {
  if (i.deferred || i.replied) {
    await i.editReply({ content }).catch(() => {});
    return;
  }
  const opts = allowEphemeral && i.inGuild() ? { content, flags: MessageFlags.Ephemeral as const } : { content };
  await i.reply(opts).catch(() => {});
}

export function initInteractionRouter(client: Client) {
  if ((client as any)[ROUTER_WIRED]) return; // idempotent
  (client as any)[ROUTER_WIRED] = true;

  const commandMap = new Map<string, CommandModule>();
  const bad: any[] = [];
  for (const mod of commands as CommandModule[]) {
    if (!mod?.data?.name || typeof mod.execute !== "function") { bad.push(mod); continue; }
    if (commandMap.has(mod.data.name)) {
      console.warn(`[router] Duplicate command name detected: ${mod.data.name} (overwriting)`);
    }
    commandMap.set(mod.data.name, mod);
  }
  console.log("[router] Loaded commands:", [...commandMap.keys()].join(", "));
  if (bad.length) console.error(`[router] Invalid command modules: ${bad.length}`);

  client.on("interactionCreate", async (interaction: Interaction) => {
    try {
      // Handle button interactions
      if (interaction.isButton()) {
        const customId = interaction.customId;
        // Music control buttons (uses "music:" prefix)
        if (customId.startsWith("music:")) {
          try {
            await handleMusicButton(customId, interaction);
          } catch (err) {
            console.error(`[router] Music button error (${customId}):`, err);
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "Button action failed.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
          }
          return;
        }
        return; // Unknown button type
      }

      // Handle select menu interactions
      if (interaction.isStringSelectMenu()) {
        const customId = interaction.customId;
        if (customId.startsWith("music:")) {
          try {
            await handleMusicSelectMenu(customId, interaction);
          } catch (err) {
            console.error(`[router] Music select menu error (${customId}):`, err);
            if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: "Select menu action failed.", flags: MessageFlags.Ephemeral }).catch(() => {});
            }
          }
          return;
        }
        return; // Unknown select menu type
      }

      if (!interaction.isChatInputCommand()) return;
      const i = interaction;

      // Guild-only
      if (!i.inGuild()) {
        await safeReply(i, "This command only works in servers.", /*allowEphemeral*/ false);
        return;
      }

      // ---- ViBrain memory touch + context injection ----
      const userId = i.user.id;
      const gm: any = i.member; // GuildMember | APIInteractionGuildMember
      const alias =
        (gm?.nickname as string | undefined) ??
        (gm?.user?.username as string | undefined) ??
        i.user.username;

      touchUser(userId, alias);

      if (i.guild) {
        // best-effort member count capture
        setGuildMemberCount(i.guild.id, i.guild.memberCount ?? 0);
      }

      const mem = getUser(userId);
      const guildMem = i.guild ? getGuild(i.guild.id) : undefined;
      const memoryContext =
        `User aliases: ${mem.aliases.slice(0, 3).join(", ") || alias}\n` +
        `Trust: ${mem.trust}\n` +
        `Recent facts: ${mem.facts.slice(0, 5).join(" • ") || "none"}\n` +
        (guildMem?.memberCount ? `Server members: ${guildMem.memberCount}\n` : "");

      // attach for commands to use in their LLM prompts
      (i as any).viMemory = { mem, guildMem, alias, memoryContext };
      // --------------------------------------------------

      const started = Date.now();
      const cmd = commandMap.get(i.commandName);

      if (!cmd) {
          // Try custom commands first
          try {
            const handled = await CustomCommands.maybeHandle(i);
            if (handled) {
              console.log(`[router] (custom) /${i.commandName} by ${i.user.id}`);
              logCommand({
                command: i.commandName,
                user: { id: i.user.id, username: i.user.username },
                guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
                options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
                success: true,
                latencyMs: Date.now() - started,
              });
              return;
            }
          } catch (e) {
            console.error(`[router] Custom command error (${i.commandName}):`, e);
          }

        // Fallback into progression handlers
        const h = (progressionHandlers as Record<string, any>)[i.commandName];
        if (h) {
          console.log(`[router] (fallback) -> progressionHandlers.${i.commandName}`);
          try {
            await h(i);
            logCommand({
              command: i.commandName,
              user: { id: i.user.id, username: i.user.username },
              guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
              options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
              success: true,
              latencyMs: Date.now() - started,
            });
          } catch (e) {
            console.error(`[router] progressionHandlers.${i.commandName} error:`, e);
            logCommand({
              command: i.commandName,
              user: { id: i.user.id, username: i.user.username },
              guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
              options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
              success: false,
              error: e instanceof Error ? e.message : String(e),
              latencyMs: Date.now() - started,
            });
            if (i.isRepliable()) {
              if (i.deferred || i.replied) {
                await i.editReply("Unexpected error.").catch(() => {});
              } else {
                await i.reply({ content: "Unexpected error.", flags: MessageFlags.Ephemeral }).catch(() => {});
              }
            }
          } finally {
            console.log(`[router] /${i.commandName} done in ${Date.now() - started}ms`);
          }
          return;
        }

        await i.reply({ content: "Command not loaded.", flags: MessageFlags.Ephemeral }).catch(() => {});
        console.error(`[router] No module for /${i.commandName}`);
        logCommand({
          command: i.commandName,
          user: { id: i.user.id, username: i.user.username },
          guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
          options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
          success: false,
          error: "Command not loaded",
          latencyMs: Date.now() - started,
        });
        return;
      }

      console.log(`[router] /${i.commandName} by ${i.user.id} in ${i.guildId}/${i.channelId}`);
      try {
        await cmd.execute(i);
        logCommand({
          command: i.commandName,
          user: { id: i.user.id, username: i.user.username },
          guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
          options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
          success: true,
          latencyMs: Date.now() - started,
        });
        console.log(`[router] /${i.commandName} done in ${Date.now() - started}ms`);
      } catch (cmdErr) {
        console.error(`[router] Command /${i.commandName} error:`, cmdErr);
        logCommand({
          command: i.commandName,
          user: { id: i.user.id, username: i.user.username },
          guild: i.guild ? { id: i.guild.id, name: i.guild.name } : undefined,
          options: i.options.data.map(opt => ({ name: opt.name, value: opt.value })),
          success: false,
          error: cmdErr instanceof Error ? cmdErr.message : String(cmdErr),
          latencyMs: Date.now() - started,
        });
        throw cmdErr;
      }
    } catch (err) {
      console.error("[router] Uncaught command error:", err);
      // At this point we're in a guild (DMs return earlier)
      const i = interaction as ChatInputCommandInteraction;
      if (i.isRepliable()) {
        if (i.deferred || i.replied) {
          await i.editReply("Unexpected error.").catch(() => {});
        } else {
          await i.reply({ content: "Unexpected error.", flags: MessageFlags.Ephemeral }).catch(() => {});
        }
      }
    }
  });
}
