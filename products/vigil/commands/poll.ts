import {
  ChatInputCommandInteraction, SlashCommandBuilder, PermissionFlagsBits as P, Colors, EmbedBuilder,
} from "discord.js";

import * as Polls from "../features/polls";
import { startInteractivePollWizard } from "../modules/polls/interactive";
import * as Presets from "../modules/polls/presets";
import { endPoll, showResults, exportCSV, listLogs } from "../modules/polls/runtime";
import { readWeightsMap, writeWeightsMap } from "../modules/polls/storage";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Polls: create, manage, or control")
  .addSubcommand(s => s.setName("create").setDescription("Start an interactive poll builder"))
  .addSubcommand(s => s.setName("now").setDescription("Post a poll immediately (daily engine)"))
  .addSubcommand(s => s.setName("reload").setDescription("Rebuild the poll bank (if supported)"))
  .addSubcommand(s => s.setName("stats").setDescription("Show poll engine status"))
  .addSubcommand(s => s.setName("mystats").setDescription("View your voting statistics"))
  .addSubcommand(s => s.setName("leaderboard").setDescription("View top voters")
    .addIntegerOption(o => o.setName("limit").setDescription("How many users (max 25, default 10)").setMinValue(1).setMaxValue(25)))
  .addSubcommand(s => s.setName("end").setDescription("End a live poll by message link or id")
    .addStringOption(o => o.setName("message").setDescription("Message link or id").setRequired(true)))
  .addSubcommand(s => s.setName("results").setDescription("Show results for a poll")
    .addStringOption(o => o.setName("message").setDescription("Message link or id").setRequired(true)))
  .addSubcommand(s => s.setName("export").setDescription("Export votes as CSV")
    .addStringOption(o => o.setName("message").setDescription("Message link or id").setRequired(true)))
  .addSubcommand(s => s.setName("log").setDescription("Show recent archived polls (ephemeral)")
    .addIntegerOption(o => o.setName("limit").setDescription("How many (default 10)").setMinValue(1).setMaxValue(25)))
  .addSubcommandGroup(g => g
    .setName("template").setDescription("Manage poll templates")
    .addSubcommand(s => s.setName("list").setDescription("List saved templates"))
    .addSubcommand(s => s.setName("use").setDescription("Preview a template")
      .addStringOption(o => o.setName("name").setDescription("Template name").setRequired(true)))
    .addSubcommand(s => s.setName("save").setDescription("Save a template")
      .addStringOption(o => o.setName("name").setDescription("Template name").setRequired(true))
      .addStringOption(o => o.setName("question").setDescription("Question").setRequired(true))
      .addStringOption(o => o.setName("answers").setDescription("Comma/newline separated answers").setRequired(true))
      .addStringOption(o => o.setName("emojis").setDescription("Comma separated emojis (optional)"))
      .addBooleanOption(o => o.setName("anonymous").setDescription("Default anonymous?"))
      .addBooleanOption(o => o.setName("multi").setDescription("Default multi-select?"))
      .addIntegerOption(o => o.setName("duration").setDescription("Default duration ms"))
      .addBooleanOption(o => o.setName("dmcreator").setDescription("DM results to creator by default?")))
    .addSubcommand(s => s.setName("delete").setDescription("Delete a template")
      .addStringOption(o => o.setName("name").setDescription("Template name").setRequired(true))))
  .addSubcommandGroup(g => g
    .setName("weights").setDescription("Role vote weights")
    .addSubcommand(s => s.setName("list").setDescription("List role weights"))
    .addSubcommand(s => s.setName("set").setDescription("Set a weight for a role")
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
      .addNumberOption(o => o.setName("weight").setDescription("Weight (e.g., 2)").setRequired(true)))
    .addSubcommand(s => s.setName("clear").setDescription("Clear weight for a role")
      .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))))
  .setDMPermission(false);

export async function execute(i: ChatInputCommandInteraction) {
  const group = i.options.getSubcommandGroup(false);
  const sub = i.options.getSubcommand();

  const staffOnly = new Set(["now","reload","stats","end","export","log","weights"]);
  if ((staffOnly.has(sub) || group === "weights") && !i.memberPermissions?.has(P.ManageGuild)) {
    await i.reply({ content: "Staff only.", flags: MessageFlags.Ephemeral });
    return;
  }

  if (!group) {
    if (sub === "create") return startInteractivePollWizard(i);

    if (sub === "now") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        if (typeof (Polls as any).pollsPostNow === "function") { await (Polls as any).pollsPostNow(i.client); await i.editReply("Posted a poll."); }
        else { await i.editReply("Poll engine not initialized."); }
      } catch (e: any) { await i.editReply(`Failed to post: ${e?.message ?? e}`); }
      return;
    }

    if (sub === "reload") {
      if (typeof (Polls as any).pollsReloadBank === "function") {
        try { const n = await (Polls as any).pollsReloadBank(); await i.reply({ content: `Poll bank rebuilt. Size: **${n}**`, flags: MessageFlags.Ephemeral }); }
        catch (e: any) { await i.reply({ content: `Reload failed: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral }); }
      } else {
        await i.reply({ content: "Reload not available: LLM-driven polls are enabled (no static bank). Set `POLLS_LLM_ENABLED=0` for banked engine.", flags: MessageFlags.Ephemeral });
      }
      return;
    }

    if (sub === "stats") {
      try {
        if (typeof (Polls as any).pollsStats !== "function") { await i.reply({ content: "Stats not available.", flags: MessageFlags.Ephemeral }); return; }
        const st: any = (Polls as any).pollsStats();
        const isBanked = typeof st.bank === "number" || typeof st.remaining === "number";
        const e = new EmbedBuilder().setColor(Colors.Blurple).setTitle("Daily Polls — Status");
        if (isBanked) e.addFields(
          { name: "UTC Hour", value: String(st.hourUTC ?? "—"), inline: true },
          { name: "Bank Size", value: String(st.bank ?? "—"), inline: true },
          { name: "Remaining", value: String(st.remaining ?? "—"), inline: true },
          { name: "Last Posted", value: st.lastAt ? `<t:${Math.floor(new Date(st.lastAt).getTime()/1000)}:R>` : "—", inline: true },
          { name: "Recent Window", value: String(st.recentWindow ?? "—"), inline: true },
          { name: "Recent Count", value: String(st.recentCount ?? "—"), inline: true },
          { name: "Jitter (min)", value: String(st.jitterMin ?? "0"), inline: true },
        );
        else e.addFields(
          { name: "LLM", value: st.llmEnabled ? "On" : "Off", inline: true },
          { name: "Model", value: String(st.model ?? "—"), inline: true },
          { name: "UTC Hour", value: String(st.hourUTC ?? "—"), inline: true },
          { name: "Jitter (min)", value: String(st.jitterMin ?? "0"), inline: true },
          { name: "Unique Tracked", value: String(st.recentCount ?? "0"), inline: true },
          { name: "Last Posted", value: st.lastAt ? `<t:${Math.floor(new Date(st.lastAt).getTime()/1000)}:R>` : "—", inline: true },
        );
        await i.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
      } catch (e: any) { await i.reply({ content: `Stats failed: ${e?.message ?? e}`, flags: MessageFlags.Ephemeral }); }
      return;
    }

    if (sub === "end") { await i.deferReply({ flags: MessageFlags.Ephemeral }); const link = i.options.getString("message", true); const r = await endPoll(i, link); await i.editReply(typeof r === "string" ? r : "Done."); return; }
    if (sub === "results") { await i.deferReply({ flags: MessageFlags.Ephemeral }); const link = i.options.getString("message", true); const r = await showResults(i, link); if (typeof r === "string") await i.editReply(r); return; }
    if (sub === "export") { await i.deferReply({ flags: MessageFlags.Ephemeral }); const link = i.options.getString("message", true); const r = await exportCSV(i, link); if (typeof r === "string") await i.editReply(r); return; }
    if (sub === "log") { await i.deferReply({ flags: MessageFlags.Ephemeral }); const limit = i.options.getInteger("limit") ?? 10; const r = await listLogs(i, limit); if (typeof r === "string") await i.editReply(r); return; }
    
    if (sub === "mystats") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { getVoterStats, buildStatsEmbed } = await import("../modules/polls/gamification.js");
        const stats = await getVoterStats(i.guild!.id, i.user.id);
        if (!stats) {
          await i.editReply("You haven't voted in any polls yet! Cast your first vote to start tracking stats.");
          return;
        }
        const embed = buildStatsEmbed(i.user, stats);
        await i.editReply({ embeds: [embed] });
      } catch (e: any) {
        await i.editReply(`Failed to fetch stats: ${e?.message ?? e}`);
      }
      return;
    }
    
    if (sub === "leaderboard") {
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      try {
        const { buildLeaderboardEmbed } = await import("../modules/polls/gamification.js");
        const limit = i.options.getInteger("limit") ?? 10;
        const embed = await buildLeaderboardEmbed(i.guild!, limit);
        await i.editReply({ embeds: [embed] });
      } catch (e: any) {
        await i.editReply(`Failed to fetch leaderboard: ${e?.message ?? e}`);
      }
      return;
    }

    await i.reply({ content: "Unknown subcommand.", flags: MessageFlags.Ephemeral });
    return;
  }

  // template group
  if (group === "template") {
    if (sub === "list") {
      const all = await Presets.list(i.guild!.id);
      if (!all.length) return i.reply({ content: "No templates saved.", flags: MessageFlags.Ephemeral });
      const lines = all.map(p => `• **${p.name}** — ${p.question} (${p.answers.length} answers)`);
      return i.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    }
    if (sub === "use") {
      const name = i.options.getString("name", true);
      const cfg = await Presets.use(i.guild!.id, name);
      if (!cfg) return i.reply({ content: "Template not found.", flags: MessageFlags.Ephemeral });
      const e = new EmbedBuilder().setColor(Colors.Aqua)
        .setTitle(`Template: ${name}`)
        .setDescription(`**${cfg.question}**\n\n${cfg.answers.map(a => `• ${a.emoji ? `${a.emoji} ` : ""}${a.label}`).join("\n")}`)
        .setFooter({ text: `Anon:${cfg.anonymous?"Yes":"No"} • Multi:${cfg.multi?"Yes":"No"} • Duration:${cfg.durationMs}ms • DM:${cfg.dmCreator?"Yes":"No"}` });
      return i.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
    }
    if (sub === "save") {
      const name = i.options.getString("name", true);
      const question = i.options.getString("question", true).trim();
      const answers = i.options.getString("answers", true).split(/\n|,/g).map(s => s.trim()).filter(Boolean).slice(0, 10);
      const emojis  = (i.options.getString("emojis") ?? "").split(",").map(s => s.trim()).filter(Boolean).slice(0, answers.length);
      const anonymous = !!i.options.getBoolean("anonymous");
      const multi     = !!i.options.getBoolean("multi");
      const duration  = Math.max(60000, Number(i.options.getInteger("duration") ?? 3600000));
      const dmCreator = !!i.options.getBoolean("dmcreator");

      await Presets.save(i.guild!.id, {
        name,
        question,
        answers: answers.map((l, idx) => ({ label: l, emoji: emojis[idx] })),
        defaults: { anonymous, multi, durationMs: duration, dmCreator },
      });
      return i.reply({ content: `Saved template **${name}**`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "delete") {
      const ok = await Presets.remove(i.guild!.id, i.options.getString("name", true));
      return i.reply({ content: ok ? "Deleted." : "Template not found.", flags: MessageFlags.Ephemeral });
    }
  }

  // weights group
  if (group === "weights") {
    if (sub === "list") {
      const map = await readWeightsMap(i.guild!.id);
      if (!Object.keys(map).length) return i.reply({ content: "No weights set.", flags: MessageFlags.Ephemeral });
      const lines = Object.entries(map).map(([roleId, w]) => `• <@&${roleId}> → **${w}x**`);
      return i.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
    }
    if (sub === "set") {
      const role = i.options.getRole("role", true);
      const weight = i.options.getNumber("weight", true);
      const map = await readWeightsMap(i.guild!.id);
      map[role.id] = weight;
      await writeWeightsMap(i.guild!.id, map);
      return i.reply({ content: `Set <@&${role.id}> → **${weight}x**`, flags: MessageFlags.Ephemeral });
    }
    if (sub === "clear") {
      const role = i.options.getRole("role", true);
      const map = await readWeightsMap(i.guild!.id);
      if (map[role.id] === undefined) return i.reply({ content: "No weight set for that role.", flags: MessageFlags.Ephemeral });
      delete map[role.id];
      await writeWeightsMap(i.guild!.id, map);
      return i.reply({ content: `Cleared weight for <@&${role.id}>.`, flags: MessageFlags.Ephemeral });
    }
  }
}
