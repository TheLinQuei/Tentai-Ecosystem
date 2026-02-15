import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  
  PermissionFlagsBits as P,
} from "discord.js";
import { GuardianControl } from "../features/guardian";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("guardian")
  .setDescription("Guardian settings")
  .addSubcommand(s => s.setName("test").setDescription("Send a test DM to the owner"))
  .addSubcommand(s => s.setName("toggle")
    .setDescription("Enable/disable Guardian in this server")
    .addStringOption(o => o.setName("state").setDescription("on|off").setRequired(true)
      .addChoices({ name: "on", value: "on" }, { name: "off", value: "off" })))
  .addSubcommand(s => s.setName("ignore")
    .setDescription("Manage ignored channels")
    .addStringOption(o => o.setName("action").setDescription("add|remove|list").setRequired(true)
      .addChoices({ name: "add", value: "add" }, { name: "remove", value: "remove" }, { name: "list", value: "list" }))
    .addChannelOption(o => o.setName("channel").setDescription("Channel to add/remove")))
  .setDefaultMemberPermissions(P.ManageGuild)
  .setDMPermission(false);

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inCachedGuild()) return;
  await i.deferReply({ flags: MessageFlags.Ephemeral });

  const sub = i.options.getSubcommand(true);
  const gid = i.guildId;

  if (sub === "test") {
    await GuardianControl.sendTest(i).catch(()=>{});
    await i.editReply({ content: "Sent you a test DM." });
    return;
  }

  if (sub === "toggle") {
    const on = i.options.getString("state", true) === "on";
    GuardianControl.toggleGuild(gid, on);
    await i.editReply({ content: `Guardian is now **${on ? "on" : "off"}** in this server.` });
    return;
  }

  if (sub === "ignore") {
    const action = i.options.getString("action", true) as "add"|"remove"|"list";
    if (action === "list") {
      const items = GuardianControl.listIgnores(gid)
        .map(s => (s.match(/^\d+$/) ? `<#${s}>` : `#${s}`))
        .join(", ") || "—";
      await i.editReply({ content: `Ignored: ${items}` });
      return;
    }
    const ch = i.options.getChannel("channel");
    if (!ch) { await i.editReply({ content: "Pick a channel." }); return; }
    if (action === "add") GuardianControl.addIgnore(gid, ch.id, (ch as any).name);
    else GuardianControl.removeIgnore(gid, ch.id, (ch as any).name);
    await i.editReply({ content: "Ignored list updated." });
  }
}
