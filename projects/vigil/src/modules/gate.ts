import {
  ButtonInteraction,
  Client, Colors, EmbedBuilder, TextChannel
} from "discord.js";
import { MessageFlags } from "discord.js";
const OATH_ROLE_ID = process.env.OATH_ROLE_ID!;
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID!;
const PINGS_CHANNEL_ID = process.env.PINGS_CHANNEL_ID;

const OATH_CUSTOM_ID = "oath.accept";

async function handleOathAccept(i: ButtonInteraction) {
  if (!i.inCachedGuild()) return;
  try {
    const gm = await i.guild.members.fetch(i.user.id);
    if (gm.roles.cache.has(OATH_ROLE_ID)) {
      // already unlocked
      return i.reply({ content: "You’re already in. Welcome back.", flags: MessageFlags.Ephemeral });
    }

    await gm.roles.add(OATH_ROLE_ID, "Accepted server oath");

    // Welcome ping in channel (soft, no spam if panel lives in a welcome channel)
    const lines = [
      "✅ **Oath accepted!** You now have full access to the server.",
      PINGS_CHANNEL_ID ? `• Grab notification roles in <#${PINGS_CHANNEL_ID}>.` : "",
      "• Say hi in the chat. If you need anything, @Staff.",
    ].filter(Boolean);

    // Try DM; if user blocks DMs, fall back to channel reply
    try {
      await i.user.send({
        embeds: [new EmbedBuilder()
          .setColor(Colors.Green)
          .setTitle("Welcome!")
          .setDescription(lines.join("\n"))],
      });
    } catch {}

    await i.reply({
      embeds: [new EmbedBuilder()
        .setColor(Colors.Green)
        .setDescription(lines.join("\n"))],
      flags: MessageFlags.Ephemeral,
    });

    // Soft welcome in the main channel, if configured
    if (WELCOME_CHANNEL_ID) {
      const ch = await i.client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
      if (ch && ch.isTextBased()) {
        (ch as TextChannel).send({ content: `Welcome ${i.user} — glad you’re here.` }).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[oath.accept] error", e);
    try { await i.reply({ content: "Something went wrong. Ping staff.", flags: MessageFlags.Ephemeral, }); } catch {}
  }
}

export function initGate(client: Client) {
  client.on("interactionCreate", async (i) => {
    try {
      // Only keep component handling here; /oathpanel lives in a command module
      if (i.isButton() && i.customId === OATH_CUSTOM_ID) return handleOathAccept(i);
    } catch (e) { console.error("[gate]", e); }
  });
}
