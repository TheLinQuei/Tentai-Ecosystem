// src/features/xp-buttons.ts
import type { Client } from "discord.js";
import { MessageFlags } from "discord.js";

export function wireXpButtons(client: Client) {
  client.on("interactionCreate", async (ix) => {
    if (!ix.isButton()) return;
    if (!/^xp:(accept|reject|ship)$/.test(ix.customId)) return;

    const member = ix.guild?.members.cache.get(ix.user.id);
    const canModerate = member?.permissions.has("ManageMessages");
    if (!canModerate) {
      await ix.reply({ content: "Only moderators can change XP status.", flags: MessageFlags.Ephemeral });
      return;
    }

    const action = ix.customId.split(":")[1];
    const msg = ix.message;
    const embed = msg.embeds[0];
    const base = embed?.data ?? {};

    let status = "";
    if (action === "accept") status = "✅ **Accepted**";
    else if (action === "reject") status = "❌ **Rejected**";
    else status = "🚀 **Shipped / Logged**";

    await ix.update({
      embeds: [{ ...base, description: (base.description ?? "") + `\n\n**Status:** ${status} — by <@${ix.user.id}>` }],
      components: []
    });

    // Optional: post a final line in the thread if exists
    if (msg.hasThread) {
      await msg.thread!.send(`${status} — <@${ix.user.id}>. Summarize the outcome and close the loop.`);
    }
  });
}
