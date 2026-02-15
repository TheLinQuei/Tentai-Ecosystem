// src/commands/seed_rules.ts
import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits as P,
  EmbedBuilder,
  ChannelType,
  TextChannel,
  Guild,
  Channel,
  MessageFlags
} from "discord.js";

type Brand = { color: number; banner?: string; thumb?: string };

async function findAssets(guild: Guild): Promise<Brand> {
  const brand: Brand = { color: 0xF5E6A6 }; // The House gold
  const assets = guild.channels.cache.find(
    (c: Channel) => c.type === ChannelType.GuildText && c.name === "house-assets"
  ) as TextChannel | undefined;

  if (!assets) return brand;

  let before: string | undefined;
  for (let i = 0; i < 2; i++) {
    const batch = await assets.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const [, m] of batch) {
      for (const [, att] of m.attachments) {
        const n = (att.name || "").toLowerCase();
        if (n.includes("odyssey-banner")) brand.banner = att.url;
        if (n.includes("odyssey-crest") || n.includes("odyssey-icon")) brand.thumb = att.url;
      }
    }
    before = batch.last()?.id;
  }
  return brand;
}

export const data = new SlashCommandBuilder()
  .setName("seed-rules")
  .setDescription("Post Odyssey-styled Rules & Info embeds (Admin only)");

export async function execute(i: ChatInputCommandInteraction) {
  if (!i.memberPermissions?.has(P.Administrator)) {
    await i.reply({ flags: MessageFlags.Ephemeral, content: "No permission." });
    return;
  }
  if (i.channel?.type !== ChannelType.GuildText) {
    await i.reply({ flags: MessageFlags.Ephemeral, content: "Run this in a text channel." });
    return;
  }

  const brand = await findAssets(i.guild!);

  const head = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("✦ The Codex Gate — Rules & Info ✦")
    .setDescription("Read first. This is how we move.")
    .setThumbnail(brand.thumb ?? null)
    .setImage(brand.banner ?? null);

  const begin = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("🧭 Begin")
    .setDescription([
      "1) **/setup-roles** → pick **ONE** faction, add ping roles.",
      "2) Read **#wayfinder** (FAQ) and **#council** (suggestions).",
      "3) Greet the room in **#commons**. Use threads for deep dives.",
    ].join("\n"));

  const oaths = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("⚔️ House Oaths")
    .setDescription([
      "1) Respect the craft and the people. No harassment, slurs, doxxing, witch-hunts.",
      "2) Keep it SFW by default. No porn, explicit sexual content, gore, or illegal media.",
      "3) Signal > noise. No spam, chain pings, or low-effort bait.",
      "4) No piracy or leaks of paid content. Credit sources; ask before reposting members’ work.",
      "5) No scams, account selling, or cold-pitch DMs. Report suspicious DMs to staff.",
      "6) Names/avatars: no impersonation; no hateful symbols.",
      "7) Staff word is final in the moment; appeals are open.",
    ].join("\n"));

  const content = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("📚 Content & Spoilers")
    .setDescription([
      "• Use spoilers for new releases: `||like this||`.",
      "• Media-first posts in **#showcase**. Put breakdowns in a thread.",
      "• Canon in **#odyssey-codex** (curated). Drafts in **#story-lab**.",
    ].join("\n"));

  const voice = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("🔊 Voice & LFG")
    .setDescription([
      "• Push-to-talk or quiet-room etiquette. No hot-mics / overlap yelling.",
      "• Squad up in **#the-voyage**. Post intent, window, and requirements.",
    ].join("\n"));

  const safety = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("🛡️ Safety")
    .setDescription([
      "• DM **@Starlit Orders** privately with timestamps + evidence.",
      "• Zero tolerance for hate, stalking, targeted harassment.",
    ].join("\n"));

  const enforcement = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("⚖️ Enforcement & Appeals")
    .setDescription([
      "**Ladder:** Warn → Timeout → Exiles (mute) → Kick → Ban (steps may be skipped for severity).",
      "**Appeals:** Open a thread in **#suitors-court**. One case, one thread, facts only.",
    ].join("\n"));

  const roles = new EmbedBuilder()
    .setColor(brand.color)
    .setTitle("✴️ Factions & 🔔 Pings")
    .setDescription([
      "**Factions (choose ONE):** Celestials • Akuma • Mortal-Born • Independents (switching removes the previous).",
      "**Pings (any):** Decrees • Events • LFG • Lore Drops.",
      "Use **/setup-roles** in **#codex-gate**.",
    ].join("\n"));

  await i.reply({ content: "Posting Rules & Info…", flags: MessageFlags.Ephemeral }).catch(() => {});
  const ch = i.channel;
  for (const emb of [head, begin, oaths, content, voice, safety, enforcement, roles]) {
    await ch.send({ embeds: [emb] });
  }
  await ch.send("✦  Build with intent. Carry your name like it matters.  ✦");
  await i.followUp({ content: "Done. Pin what you want at the top.", flags: MessageFlags.Ephemeral });
}
