// scripts/postOcHowTo.ts
import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Colors,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  TextChannel,
} from "discord.js";

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("DISCORD_TOKEN missing in env.");
  process.exit(1);
}

const BRAND_BANNER =
  process.env.ODYSSEY_BANNER_URL ||
  process.env.LORE_BANNER_URL || // fallback to lore assets if you already set them
  "";
const BRAND_CREST =
  process.env.ODYSSEY_CREST_URL ||
  process.env.LORE_CREST_URL ||
  "";

const [, , guildId, channelId, ...flags] = process.argv;
const doPin = flags.includes("--pin");

if (!guildId || !channelId) {
  console.error("Usage: pnpm tsx scripts/postOcHowTo.ts <GUILD_ID> <CHANNEL_ID> [--pin]");
  process.exit(1);
}

function eb(title: string, desc?: string, color = Colors.Blurple) {
  const e = new EmbedBuilder().setTitle(title).setColor(color);
  if (desc && desc.trim().length > 0) e.setDescription(desc);
  if (BRAND_CREST) e.setThumbnail(BRAND_CREST);
  return e;
}

function quickStartEmbed() {
  const e = eb(
    "Odyssey Character Creator — Quick Start",
    [
      "Build an original character (OC) for the Odyssey. **Nothing posts publicly until you hit _Publish_**.",
      "Use the commands below in this channel. If you need help, ping staff.",
    ].join("\n"),
  );

  e.addFields(
    {
      name: "1) Start",
      value: "Type **`/oc create`**. A private wizard opens with menus and buttons.",
      inline: false,
    },
    {
      name: "2) Race & Subtype",
      value:
        "Pick a **Race** (Humans, Tenkai, Celestials, Akuma, Elves, Dwarves, Kitsune, Drakonai, Beastfolk) and a **Subtype** (e.g., *Lunar Elf*, *Ironhide Drakonai*). *Eclipsar is exclusive and not selectable.*",
      inline: false,
    },
    {
      name: "3) Details",
      value:
        "Click **Details** to set **Name** (required) and optional **Age, Height, Eyes, Hair, Features, Bio**.",
      inline: false,
    },
    {
      name: "4) Abilities (Point-Buy)",
      value:
        "Click **Abilities** to assign points. Base is **8** in each of **STR, AGI, INT, WIL, PRS** with a **10-point pool**. Race bonuses apply **after** point-buy.",
      inline: false,
    },
    {
      name: "5) Preview",
      value:
        "Click **Preview** to see your on-brand sheet privately. Adjust as needed.",
      inline: false,
    },
    {
      name: "6) Publish",
      value:
        "Click **Publish** to post your sheet to the character gallery. A thread may open automatically for edits/RP.",
      inline: false,
    },
  );

  if (BRAND_BANNER) e.setImage(BRAND_BANNER);
  return e;
}

function rulesTipsEmbed() {
  const e = eb(
    "Formatting & Tips",
    [
      "• **Keep it tidy** — short bios read best; use the thread for longer lore.",
      "• **Respect canon** — races follow the Codex; no god-mode hacks.",
      "• **Edits** — republish with `/oc create` if you want a fresh sheet, or use the thread under your post for minor updates.",
      "• **Staff help** — stuck or unsure? Ping The House / staff.",
    ].join("\n"),
    Colors.DarkButNotBlack,
  );

  e.addFields(
    {
      name: "Shortcuts",
      value:
        "• **`/oc view`** — show your current builder state (private)\n• **`/oc create`** — open the builder anew",
      inline: false,
    },
    {
      name: "Stat Keys",
      value: "**STR** strength • **AGI** agility • **INT** intellect • **WIL** willpower • **PRS** presence",
      inline: false,
    },
    {
      name: "Note on Exclusives",
      value:
        "The **Eclipsar** lineage is invite-only and not available in the public builder.",
      inline: false,
    },
  );

  return e;
}

async function main() {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once("ready", async () => {
    try {
      const guild = await client.guilds.fetch(guildId);
      const chan = await guild.channels.fetch(channelId);

      if (!chan || chan.type !== ChannelType.GuildText) {
        throw new Error("Channel not found or not a text channel.");
      }

      const components = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("oc_hint_nop") // just a visual anchor; non-functional
          .setLabel("/oc create")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId("oc_hint_view")
          .setLabel("/oc view")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
      );

      const first = await (chan as TextChannel).send({
        content: "### 🧩 Odyssey Character Creator — Read Me First",
        embeds: [quickStartEmbed(), rulesTipsEmbed()],
        components: [components],
      });

      if (doPin) {
        await first.pin().catch(() => {});
      }

      console.log("Posted OC how-to.");
    } catch (err) {
      console.error(err);
    } finally {
      client.destroy();
    }
  });

  await client.login(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
