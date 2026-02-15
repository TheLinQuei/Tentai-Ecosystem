// scripts/postLfgHowTo.ts
import 'dotenv/config';                        // <-- add this

// scripts/postLfgHowTo.ts
import {
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  TextChannel,
} from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN!;
if (!TOKEN) {
  console.error("DISCORD_TOKEN missing in env.");
  process.exit(1);
}

type Args = {
  guildId: string;
  channelId: string;
  pin: boolean;
  assetsId?: string;
};

function parseArgs(): Args {
  const [, , guildId, channelId, ...rest] = process.argv;
  if (!guildId || !channelId) {
    console.error("Usage: tsx scripts/postLfgHowTo.ts <GUILD_ID> <CHANNEL_ID> [--pin] [--assets=<ASSETS_CH_ID>]");
    process.exit(1);
  }
  let pin = false;
  let assetsId: string | undefined;
  for (const a of rest) {
    if (a === "--pin") pin = true;
    else if (a.startsWith("--assets=")) assetsId = a.split("=")[1];
  }
  return { guildId, channelId, pin, assetsId };
}

const ODSY_COLOR = 0xe7c978; // Odyssey gold

async function findHouseBanner(
  client: Client,
  guildId: string,
  assetsId?: string
): Promise<string | undefined> {
  const guild = await client.guilds.fetch(guildId);
  let chan =
    (assetsId ? await guild.channels.fetch(assetsId).catch(() => null) : null) ||
    guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && /house-assets/i.test(c.name)
    );

  if (!chan || chan.type !== ChannelType.GuildText) return;

  try {
    const pins = await (chan as TextChannel).messages.fetchPinned();
    // Prefer filenames hinting at Odyssey/LFG/Banner; fallback to any image
    for (const [, m] of pins) {
      const a = m.attachments.find(
        (att) =>
          /\.(png|jpe?g|webp)$/i.test(att.name || "") &&
          /(odyssey|lfg|banner)/i.test(att.name || "")
      );
      if (a) return a.url;
    }
    for (const [, m] of pins) {
      const a = m.attachments.find((att) =>
        /\.(png|jpe?g|webp)$/i.test(att.name || "")
      );
      if (a) return a.url;
    }
  } catch {
    // ignore
  }
}

function buildHowToEmbed(bannerUrl?: string) {
  return new EmbedBuilder()
    .setColor(ODSY_COLOR)
    .setTitle("🧭 LFG — How It Works")
    .setDescription("Signal > noise. Find your squad fast. ✦")
    .setImage(bannerUrl ?? null as any)
    .addFields(
      {
        name: "Create",
        value:
          "Use `/lfg game:<title> mode:<short> window:<tz> [slots] [reqs]`.\n" +
          "Slots default **4**. Everything else is optional.",
      },
      {
        name: "Join",
        value:
          "Click **Join**. Pick roles/voice/platform *if you care*. Otherwise ignore them. You’re in.",
      },
      {
        name: "Role Packs (optional)",
        value:
          "Shooter • MMO/Co-op • MOBA • Fighting • Sports • Horror • etc.\n" +
          "Select a pack, then choose up to **3** roles.",
      },
      {
        name: "Host Controls",
        value:
          "🔔 **Ping LFG** to nudge • 🛑 **Close** when full.\nEdits keep the Odyssey style + banner.",
      },
      {
        name: "Examples",
        value:
          "• `/lfg game:\"Marvel Rivals\" mode:\"Quickplay\" window:\"ASAP\" slots:5`\n" +
          "• `/lfg game:\"MW3\" mode:\"Search\" window:\"22:00–01:00 CST\" reqs:\"18+ comms, KB+M\"`\n" +
          "• `/lfg game:\"Madden 25\" mode:\"Head-to-Head\" window:\"Tonight\" slots:2`",
      },
      {
        name: "Good Form",
        value:
          "Use threads for planning in **#the-voyage**. Be clear, SFW, and keep comms clean. ✦",
      }
    )
    .setFooter({ text: "THE ODYSSEY — Craft • Cohesion • Momentum" })
    .setTimestamp(Date.now());
}

async function main() {
  const { guildId, channelId, pin, assetsId } = parseArgs();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  await client.login(TOKEN);

  const guild = await client.guilds.fetch(guildId);
  const channel = await guild.channels.fetch(channelId);

  if (!channel || channel.type !== ChannelType.GuildText) {
    console.error("Channel not found or not a text channel.");
    process.exit(1);
  }

  const banner = await findHouseBanner(client, guildId, assetsId);
  const embed = buildHowToEmbed(banner);

  const msg = await (channel as TextChannel).send({ embeds: [embed] });
  if (pin) await msg.pin().catch(() => {});

  console.log(`Posted guide${pin ? " and pinned" : ""}: ${msg.url}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
