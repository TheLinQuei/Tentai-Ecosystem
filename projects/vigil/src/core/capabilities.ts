// src/core/capabilities.ts
import {
  type Client, ChannelType, GatewayIntentBits as G,
} from "discord.js";

export type CapabilitySnapshot = {
  timestamp: number;
  // platform
  node: string;
  os: NodeJS.Platform;
  pid: number;
  uptimeSec: number;
  memoryMB: { rss: number; heap: number };
  // discord
  shardId: number | null;
  shards: number;
  guilds: number;
  usersApprox: number; // may be partial without full member intent
  intents: string[];
  // permissions (contextless best-effort)
  canReadAttachments: boolean;
  canManageMessagesLikely: boolean;
  hasGuildMembersIntent: boolean;
  hasMessageContentIntent: boolean;
  // ai / vision
  aiProviderConfigured: boolean;
  visionEnabled: boolean;
  // misc features
  dmsEnabled: boolean;
  ownerDMReachable: boolean;
};

let lastProbe = 0;
let cache: CapabilitySnapshot | null = null;

function intentBitsToNames(bitfield: number): string[] {
  const flags: Array<[number, string]> = [
    [G.Guilds, "Guilds"],
    [G.GuildMembers, "GuildMembers"],
    [G.GuildModeration, "GuildModeration"],
    [G.GuildEmojisAndStickers, "GuildEmojisAndStickers"],
    [G.GuildIntegrations, "GuildIntegrations"],
    [G.GuildWebhooks, "GuildWebhooks"],
    [G.GuildInvites, "GuildInvites"],
    [G.GuildVoiceStates, "GuildVoiceStates"],
    [G.GuildPresences, "GuildPresences"],
    [G.GuildMessages, "GuildMessages"],
    [G.GuildMessageReactions, "GuildMessageReactions"],
    [G.GuildMessageTyping, "GuildMessageTyping"],
    [G.DirectMessages, "DirectMessages"],
    [G.DirectMessageReactions, "DirectMessageReactions"],
    [G.DirectMessageTyping, "DirectMessageTyping"],
    [G.MessageContent, "MessageContent"],
    [G.GuildScheduledEvents, "GuildScheduledEvents"],
    [G.AutoModerationConfiguration, "AutoModConfig"],
    [G.AutoModerationExecution, "AutoModExec"],
  ];
  const out: string[] = [];
  for (const [flag, name] of flags) {
    if ((bitfield & flag) !== 0) out.push(name);
  }
  return out;
}

export async function probeCapabilities(client: Client): Promise<CapabilitySnapshot> {
  const now = Date.now();
  if (cache && now - lastProbe < 15_000) return cache; // 15s cache

  const raw = (client.options as any)?.intents?.bitfield;
  const bf: number = Number.isFinite(raw) ? Number(raw) : 0;
  const intents = intentBitsToNames(bf);
  const hasGuildMembersIntent = intents.includes("GuildMembers");
  const hasMessageContentIntent = intents.includes("MessageContent");

  const shard = (client as any)?.shard?.ids?.[0] ?? null;
  const shards = (client as any)?.shard?.count ?? 1;

  const guilds = client.guilds.cache.size;
  // Approx users: sum known memberCount when cached; otherwise fall back
  let usersApprox = 0;
  for (const g of client.guilds.cache.values()) {
    usersApprox += g.memberCount || 0;
  }
  if (!usersApprox) usersApprox = guilds * 100; // conservative placeholder if members not cached

  const permsGuess = {
    canReadAttachments: true, // discord.js delivers attachments via messageCreate if bot can read channel
    canManageMessagesLikely: false, // true when role has ManageMessages in most guilds—unknown here
  };

  const aiProviderConfigured =
    !!process.env.OPENAI_API_KEY ||
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.GENAI_PROVIDER;

  // “Vision enabled” here = your AI layer knows how to pass images through;
  // if you gate it behind a flag, check that too
  const visionEnabled = aiProviderConfigured && (process.env.VISION_ENABLED !== "false");

  // owner DM reachability
  const ownerId = process.env.OWNER_ID || process.env.FORSA_ID;
  let ownerDMReachable = false;
  if (ownerId) {
    try {
      const u = await client.users.fetch(ownerId);
      const dm = await u.createDM();
      ownerDMReachable = dm.type === ChannelType.DM;
    } catch { ownerDMReachable = false; }
  }

  cache = {
    timestamp: now,
    node: process.version,
    os: process.platform,
    pid: process.pid,
    uptimeSec: Math.round(process.uptime()),
    memoryMB: {
      rss: Math.round(process.memoryUsage().rss / 1_000_000),
      heap: Math.round(process.memoryUsage().heapUsed / 1_000_000),
    },
    shardId: shard,
    shards,
    guilds,
    usersApprox,
    intents,
    canReadAttachments: permsGuess.canReadAttachments,
    canManageMessagesLikely: permsGuess.canManageMessagesLikely,
    hasGuildMembersIntent: hasGuildMembersIntent,
    hasMessageContentIntent: hasMessageContentIntent,
    aiProviderConfigured,
    visionEnabled,
    dmsEnabled: intents.includes("DirectMessages"),
    ownerDMReachable,
  };
  lastProbe = now;
  return cache;
}
