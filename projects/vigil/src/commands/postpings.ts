import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ChannelType,
  PermissionFlagsBits as P,
} from "discord.js";
import { postPingSelectorPanel } from "../features/pings";
import { MessageFlags } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("postpings")
  .setDescription("ADMIN: post the ping selector panel")
  .addChannelOption(o => o.setName("channel")
    .setDescription("Channel (defaults to current)")
    .addChannelTypes(ChannelType.GuildText))
  .setDefaultMemberPermissions(P.ManageGuild)
  .setDMPermission(false);

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.inCachedGuild()) return;
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const ch = i.options.getChannel("channel") ?? i.channel!;
  const msg = await postPingSelectorPanel(i.guild, ch.id);
  await i.editReply({ content: `Posted selector in <#${msg.channelId}> • ${msg.url}` });
}
