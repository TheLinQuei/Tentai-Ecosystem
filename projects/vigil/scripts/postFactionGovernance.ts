// scripts/postFactionGovernance.ts
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  GuildTextBasedChannel,
  EmbedBuilder,
  TextChannel,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error("DISCORD_TOKEN missing in env.");
  process.exit(1);
}

// CLI: guildId channelId [--pin]
const [, , guildId, channelId, ...flags] = process.argv;
if (!guildId || !channelId) {
  console.error("Usage: pnpm tsx scripts/postFactionGovernance.ts <GUILD_ID> <CHANNEL_ID> [--pin]");
  process.exit(1);
}
const DO_PIN = flags.includes("--pin");

const BRAND_BANNER = process.env.LORE_BANNER_URL || "";
const BRAND_CREST  = process.env.LORE_CREST_URL  || "";
const COLOR = 0xD1B279; // Odyssey gold

function eb(title: string, desc?: string) {
  const e = new EmbedBuilder().setColor(COLOR).setTitle(title);
  if (desc && desc.trim().length > 0) e.setDescription(desc);
  if (BRAND_CREST) e.setThumbnail(BRAND_CREST);
  return e;
}

function withBanner(e: EmbedBuilder) {
  if (BRAND_BANNER) e.setImage(BRAND_BANNER);
  return e;
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

  client.once("ready", async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const chan = await guild.channels.fetch(channelId);
      if (!chan || !chan.isTextBased()) {
        throw new Error("Channel not found or not text-based.");
      }
      const channel = chan as GuildTextBasedChannel;

      // ---- Embed 1: Overview ------------------------------------------------
      const e1 = withBanner(
        eb(
          "Odyssey Faction Governance — Roles & Powers",
          `**TL;DR:** Each faction/section has a **Leader** who runs their domain like a mini-server inside the server. They can recruit **Admins** and **Moderators**, set local policies, organize channels/events, and choose how their community runs (elections, appointments, councils, etc.). All local governance sits **under Odyssey’s global rules & safety.**`
        ).addFields(
          { name: "Core Idea", value: "Autonomy with accountability. Leaders build their section’s culture, content, and cadence; global rules protect the whole ship." },
          { name: "Who Picks Leaders?", value: "Founding appointment, community election, trial periods, or council vote — the section chooses its model and can change it later." },
          { name: "Allowed Tools", value: "Channels, roles (within your section), events, pinned resources, forms/polls, and reasonable automations." },
        )
      );

      // ---- Embed 2: Global Guardrails --------------------------------------
      const e2 = eb(
        "Global Guardrails (Apply to Every Section)",
        "These protect the whole community. They’re minimal but non-negotiable."
      ).addFields(
        { name: "1) Server Rules Always Apply", value: "Safety, ToS compliance, and anti-abuse are universal. Moderation escalations go to central staff when needed." },
        { name: "2) Role Scope", value: "Leaders/Admins can only grant roles within their section; server-wide or protected roles remain centralized." },
        { name: "3) Transparency", value: "Publish your section’s how-it-works: leadership model, elections/appointments, and a simple appeal path." },
        { name: "4) Data & Privacy", value: "No doxxing, scraping, or private sharing without consent. Polls and forms must disclose how results are used." },
        { name: "5) Conflict & Escalation", value: "Handle locally when possible. Escalate harassment, raids, or cross-section disputes to server staff quickly." },
        { name: "Note on Eclipsar (Exclusive)", value: "Eclipsar exist outside all factions as an exclusive role; they’re not governed by section leaders." },
      );

      // ---- Embed 3: Role Matrix --------------------------------------------
      const e3 = eb("Role Matrix (Your Section’s Team)").addFields(
        {
          name: "Leader",
          value:
            "Owns the section’s vision and safety. Creates channels/resources, sets local policy, appoints staff, and defines election/appointment models.",
        },
        {
          name: "Admins (by Leader appointment)",
          value:
            "Second-in-command. Help with structure: channel org, events, collaborations, backlog, analytics. Can act on the Leader’s behalf.",
        },
        {
          name: "Moderators",
          value:
            "Hands-on community care: onboarding, daily moderation, enforcing section policy, running events. Report edge cases up to Admin/Leader.",
        },
        {
          name: "Curators / Scribes",
          value:
            "Keep the section’s docs, codex entries, guides, and pinned posts up to date. Make it easy for newcomers to get oriented.",
        },
        {
          name: "Artificers (Optional)",
          value:
            "Automation & bot helpers. Set up forms, LFG, drop-downs, and streamline repetitive tasks.",
        },
      );

      // ---- Embed 4: Per-Faction Leader Briefs ------------------------------
      const e4 = eb("Per-Faction Leader Briefs").addFields(
        {
          name: "Celestials — Starlit Chain Lead",
          value:
            "Build a culture around **oath, remembrance, clarity**. Lead choirs, trials, lore readings. Your staff can be **Wardens (mods)** and **Witnesses (scribes)**. Elections or choir-consensus both fit here.",
        },
        {
          name: "Akuma — Core Flux Lead",
          value:
            "Channel **discipline in the dissonance**. Establish clear safety lines, opt-in content gates, and cathartic, art-heavy events. Staff split cleanly: **Court (admins)** vs **Packs (mods)**.",
        },
        {
          name: "Mortal-Born Lead",
          value:
            "Practical, frequent activity: guides, RP hubs, collaborations with other sections. Staff as **Guildmasters (admins)** and **Stewards (mods)**. Elections and town-halls feel natural here.",
        },
        {
          name: "Independents Lead",
          value:
            "Celebrate **tribes, drifts, and free cities**. Use sub-captains for **Beastfolk / Kitsune / Drakonai** threads. Rotating councils, charter votes, and traveling events are on-theme.",
        },
      );

      // ---- Embed 5: How to Run Your Section (Template) ---------------------
      const e5 = eb("How to Run Your Section (Template)").addFields(
        {
          name: "1) Publish Your Model",
          value: "Pin a short post: leadership structure, how staff are chosen, how to appeal a decision.",
        },
        {
          name: "2) Stand Up Your Space",
          value: "Create 3–5 core channels max. Pinned welcome, starter threads, and a monthly calendar.",
        },
        {
          name: "3) Staff Onboarding",
          value: "Assign Admin/Mod roles, set expectations, and define a simple escalation ladder.",
        },
        {
          name: "4) Cadence",
          value: "Pick a reliable rhythm: weekly post, biweekly event, monthly retrospective.",
        },
        {
          name: "5) Succession",
          value: "Define hand-off: deputy list, election trigger (e.g., 30-day inactivity), archive handover.",
        },
      );

      // ---- Post chain -------------------------------------------------------
      const first = await (channel as TextChannel).send({ embeds: [e1] });
      await channel.send({ embeds: [e2], reply: { messageReference: first.id } }).catch(() => channel.send({ embeds: [e2] }));
      await channel.send({ embeds: [e3], reply: { messageReference: first.id } }).catch(() => channel.send({ embeds: [e3] }));
      await channel.send({ embeds: [e4], reply: { messageReference: first.id } }).catch(() => channel.send({ embeds: [e4] }));
      await channel.send({ embeds: [e5], reply: { messageReference: first.id } }).catch(() => channel.send({ embeds: [e5] }));

      if (DO_PIN) {
        try { await (first as any).pin(); } catch {}
      }

      console.log(`Posted governance explainer to #${(channel as any).name} in ${guild.name}`);
    } catch (err) {
      console.error(err);
    } finally {
      setTimeout(() => process.exit(0), 500);
    }
  });

  client.login(TOKEN);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
