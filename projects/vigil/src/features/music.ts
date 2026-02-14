import { SlashCommandBuilder, CommandInteraction, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

// Track the last control message per guild to update instead of spam
const lastControlMessage = new Map<string, { messageId: string; channelId: string }>();

// Create music control buttons - accept paused state to show correct pause/resume button
function createMusicButtons(isPaused: boolean = false) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    isPaused 
      ? new ButtonBuilder()
          .setCustomId("music:resume")
          .setLabel("▶️ Resume")
          .setStyle(ButtonStyle.Success)
      : new ButtonBuilder()
          .setCustomId("music:pause")
          .setLabel("⏸️ Pause")
          .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music:skip")
      .setLabel("⏭️ Skip")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:stop")
      .setLabel("⏹️ Stop")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music:loop:track")
      .setLabel("🔂 Loop Track")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music:loop:queue")
      .setLabel("🔁 Loop Queue")
      .setStyle(ButtonStyle.Secondary)
  );
  return [row];
}

// Audio filter presets
const FILTER_PRESETS = {
  bassboost: { equalizer: [{ band: 0, gain: 0.2 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.1 }] },
  trebleboost: { equalizer: [{ band: 12, gain: 0.2 }, { band: 13, gain: 0.15 }, { band: 14, gain: 0.1 }] },
  nightcore: { timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 } },
  vaporwave: { timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 }, equalizer: [{ band: 0, gain: 0.1 }] },
  "8d": { rotation: { rotationHz: 0.2 } },
  karaoke: { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } },
  vibrato: { vibrato: { frequency: 4.0, depth: 0.75 } },
  tremolo: { tremolo: { frequency: 4.0, depth: 0.75 } },
};

// Slash command definition for /music
export const data = new SlashCommandBuilder()
  .setName("music")
  .setDescription("Music controls")
  .addSubcommand(sub =>
    sub.setName("play")
      .setDescription("Play a track or playlist")
      .addStringOption(opt =>
        opt.setName("query")
          .setDescription("Search or URL")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("search")
      .setDescription("Search for tracks and choose which to play")
      .addStringOption(opt =>
        opt.setName("query")
          .setDescription("Search query")
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName("filter")
      .setDescription("Apply audio filters to enhance playback")
      .addStringOption(opt =>
        opt.setName("preset")
          .setDescription("Filter preset to apply")
          .setRequired(true)
          .addChoices(
            { name: "🎸 Bass Boost", value: "bassboost" },
            { name: "🎵 Treble Boost", value: "trebleboost" },
            { name: "⚡ Nightcore", value: "nightcore" },
            { name: "🌊 Vaporwave", value: "vaporwave" },
            { name: "🎧 8D Audio", value: "8d" },
            { name: "🎤 Karaoke", value: "karaoke" },
            { name: "〰️ Vibrato", value: "vibrato" },
            { name: "🔊 Tremolo", value: "tremolo" },
            { name: "❌ Clear Filters", value: "clear" }
          )
      )
  )
  .addSubcommand(sub =>
    sub.setName("queue")
      .setDescription("View the current queue")
  )
  .addSubcommand(sub =>
    sub.setName("nowplaying")
      .setDescription("Show currently playing track")
  );

export async function execute(interaction: CommandInteraction) {
  if (!interaction.isChatInputCommand()) return;
  const sub = interaction.options.getSubcommand();
  if (sub === "play") {
    // CRITICAL: Defer reply immediately to prevent "Unknown interaction" timeout
    await interaction.deferReply();
    
    const query = interaction.options.getString("query", true);
    const guildId = interaction.guildId!;
    const channel = interaction.channel as TextBasedChannel;
    try {
      try {
        await ensureJoined(guildId);
      } catch {
        // Not connected: try to join user's voice channel
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const voiceId = member?.voice?.channelId;
        if (!voiceId) throw new Error("You must be in a voice channel to use this command.");
        const gp = getGuildPlayer(guildId, channel);
        await gp.join(voiceId, channel);
        await ensureJoined(guildId);
      }
      const gp = getGuildPlayer(guildId, channel);
      
      // Multi-platform search strategy (all platforms working!):
      // 1. YouTube Music (prioritizes actual songs over talk shows)
      // 2. Spotify (official tracks, full credentials loaded)
      // 3. SoundCloud (indie/remixes, no auth needed)
      let track = null;
      
      if (!query.startsWith("http") && !query.includes(":")) {
        // Plain search - try YouTube Music first (music-focused search)
        console.log("[music] Searching YouTube Music first (prioritizes songs)");
        try {
          track = await gp.playNow(`ytmsearch:${query}`, interaction.user.id);
          console.log("[music] playNow returned track:", track?.title);
        } catch (ytError) {
          console.log("[music] YouTube Music failed, trying Spotify:", ytError);
          try {
            track = await gp.playNow(`spsearch:${query}`, interaction.user.id);
          } catch (spError) {
            console.log("[music] Spotify failed, trying SoundCloud:", spError);
            try {
              track = await gp.playNow(`scsearch:${query}`, interaction.user.id);
            } catch (scError) {
              console.log("[music] All platforms failed, trying YouTube fallback:", scError);
              track = await gp.playNow(`ytsearch:${query}`, interaction.user.id);
            }
          }
        }
      } else {
        // User provided URL or explicit prefix - use as-is
        // Supports: YouTube URLs, Spotify URLs, SoundCloud URLs, Bandcamp, etc.
        track = await gp.playNow(query, interaction.user.id);
      }
      
      // Get the raw player to check pause state
      const rawPlayer = await ensureJoined(guildId);
      const isPaused = rawPlayer?.paused || false;
      
      // Update existing control message or create new one
      const content = `🔊 Playing: **${track.title}**`;
      const components = createMusicButtons(isPaused);
      
      const lastMsg = lastControlMessage.get(guildId);
      let updated = false;
      
      if (lastMsg) {
        try {
          const ch = await interaction.client.channels.fetch(lastMsg.channelId);
          if (ch?.isTextBased()) {
            const msg = await ch.messages.fetch(lastMsg.messageId);
            await msg.edit({ content, components });
            updated = true;
            console.log("[music] Updated existing control message");
          }
        } catch (e) {
          console.log("[music] Failed to update existing message, will create new:", e);
        }
      }
      
      if (!updated) {
        // Create new control message
        await interaction.editReply({ content, components });
        const reply = await interaction.fetchReply();
        lastControlMessage.set(guildId, {
          messageId: reply.id,
          channelId: reply.channelId
        });
        console.log("[music] Created new control message");
      } else {
        // Just acknowledge the command
        await interaction.editReply({ content: `✅ Now playing: **${track.title}**` });
      }
    } catch (err) {
      console.error("[music] play error:", err);
      // Offer a helpful hint when search fails without exposing internals
      const msg = String((err as any)?.message || "Music play failed.");
      const hint = msg.includes("No tracks found")
        ? "Try a full YouTube/Spotify URL or add a prefix like ytsearch: <query>."
        : undefined;
      const content = hint ? `${msg} ${hint}` : msg;
      await interaction.editReply({ content });
    }
  } 
  
  else if (sub === "search") {
    await interaction.deferReply();
    const query = interaction.options.getString("query", true);
    const guildId = interaction.guildId!;
    
    try {
      // Ensure bot is in voice channel
      try {
        await ensureJoined(guildId);
      } catch {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        const voiceId = member?.voice?.channelId;
        if (!voiceId) throw new Error("You must be in a voice channel to use this command.");
        const gp = getGuildPlayer(guildId, interaction.channel as TextBasedChannel);
        await gp.join(voiceId, interaction.channel as TextBasedChannel);
        await ensureJoined(guildId);
      }
      
      // Search YouTube Music for top 5 results
      const node = AudioNode.instance!.manager;
      const results = await node.search({ query: `ytmsearch:${query}` }, interaction.user);
      
      if (!results.tracks || results.tracks.length === 0) {
        await interaction.editReply("❌ No tracks found for that search.");
        return;
      }
      
      // Build select menu with top 5 results
      const { StringSelectMenuBuilder } = await import("discord.js");
      const tracks = results.tracks.slice(0, 5);
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("music:search_select")
        .setPlaceholder("Choose a track to play")
        .addOptions(tracks.map((t: any, i: number) => ({
          label: t.info.title.slice(0, 100),
          description: `${t.info.author} • ${formatDuration(t.info.length)}`.slice(0, 100),
          value: i.toString(),
        })));
      
      const row = new ActionRowBuilder<any>().addComponents(selectMenu);
      const playFirstButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("music:search_play_first")
          .setLabel("▶️ Play First Result")
          .setStyle(ButtonStyle.Success)
      );
      
      await interaction.editReply({
        content: `🔍 **Search Results for:** ${query}`,
        components: [row, playFirstButton],
      });
      
      // Store search results temporarily (5 min cache)
      const searchCache = new Map<string, any>();
      searchCache.set(`${guildId}:${interaction.user.id}`, tracks);
      setTimeout(() => searchCache.delete(`${guildId}:${interaction.user.id}`), 300000);
      
    } catch (err) {
      console.error("[music] search error:", err);
      await interaction.editReply({ content: `❌ Search failed: ${(err as any).message}` });
    }
  }
  
  else if (sub === "filter") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId!;
    const preset = interaction.options.getString("preset", true);
    
    try {
      const player = await ensureJoined(guildId);
      
      if (preset === "clear") {
        await player.filterManager.clearFilters();
        await interaction.editReply("✅ All audio filters cleared.");
      } else {
        const filterConfig = FILTER_PRESETS[preset as keyof typeof FILTER_PRESETS];
        if (!filterConfig) {
          await interaction.editReply("❌ Unknown filter preset.");
          return;
        }
        
        await player.filterManager.setFilters(filterConfig);
        await interaction.editReply(`✅ Applied **${preset}** filter.`);
      }
    } catch (err) {
      console.error("[music] filter error:", err);
      await interaction.editReply(`❌ Failed to apply filter: ${(err as any).message}`);
    }
  }
  
  else if (sub === "queue") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId!;
    
    try {
      const gp = getGuildPlayer(guildId);
      const queueInfo = await gp.getQueueInfo();
      
      if (!queueInfo.current && queueInfo.queue.length === 0) {
        await interaction.editReply("📭 Queue is empty.");
        return;
      }
      
      const { EmbedBuilder, Colors } = await import("discord.js");
      const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle("🎵 Music Queue");
      
      if (queueInfo.current) {
        embed.addFields({
          name: "Now Playing",
          value: `**${queueInfo.current.title}**\n${queueInfo.current.sourceName || "Unknown"} • Requested by <@${queueInfo.current.requestedBy}>`,
        });
      }
      
      if (queueInfo.queue.length > 0) {
        const upcoming = queueInfo.queue.slice(0, 10).map((item: any, i: number) => 
          `${i + 1}. **${item.title}** - ${item.sourceName || "Unknown"}`
        ).join("\n");
        
        embed.addFields({
          name: `Up Next (${queueInfo.queue.length} track${queueInfo.queue.length !== 1 ? "s" : ""})`,
          value: upcoming + (queueInfo.queue.length > 10 ? `\n...and ${queueInfo.queue.length - 10} more` : ""),
        });
      }
      
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[music] queue error:", err);
      await interaction.editReply(`❌ Failed to fetch queue: ${(err as any).message}`);
    }
  }
  
  else if (sub === "nowplaying") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guildId = interaction.guildId!;
    
    try {
      const gp = getGuildPlayer(guildId);
      const queueInfo = await gp.getQueueInfo();
      
      if (!queueInfo.current) {
        await interaction.editReply("❌ Nothing is currently playing.");
        return;
      }
      
      const { EmbedBuilder, Colors } = await import("discord.js");
      const player = await ensureJoined(guildId);
      
      const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle("🎵 Now Playing")
        .setDescription(`**${queueInfo.current.title}**`)
        .addFields(
          { name: "Source", value: queueInfo.current.sourceName || "Unknown", inline: true },
          { name: "Requested By", value: `<@${queueInfo.current.requestedBy}>`, inline: true },
          { name: "Volume", value: `${player.volume}%`, inline: true },
        );
      
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error("[music] nowplaying error:", err);
      await interaction.editReply(`❌ Failed to fetch now playing: ${(err as any).message}`);
    }
  }
  
  else {
    await interaction.reply({ content: "Unknown music subcommand.", flags: MessageFlags.Ephemeral });
  }
}

// Helper to format duration (ms to MM:SS)
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

// src/features/music.ts
import type { ButtonInteraction, TextBasedChannel } from "discord.js";
import { GuildPlayer } from "../audio/guildPlayer";
import { AudioNode } from "../audio/node";

// Simple per-guild registry of our GuildPlayer wrappers
const PLAYERS = new Map<string, GuildPlayer>();

function getGuildPlayer(guildId: string, textChannel?: TextBasedChannel) {
  let gp = PLAYERS.get(guildId);
  if (!gp) {
    gp = new GuildPlayer(guildId, textChannel);
    PLAYERS.set(guildId, gp);
  } else if (textChannel) {
    gp.attachTextChannel(textChannel);
  }
  return gp;
}

function requireContext(i: ButtonInteraction) {
  if (!i.guildId) throw new Error("No guild.");
  const member = i.member;
  const channel = i.channel;
  return { guildId: i.guildId, member, channel };
}

async function ensureJoined(guildId: string) {
  // Ensure Lavalink is ready and a raw player exists.
  const node = AudioNode.instance;
  if (!node) throw new Error("Audio node not initialized.");
  const raw = node.getPlayer(guildId);
  if (!raw) throw new Error("Player is not connected. Use /join first.");
  return raw as any;
}

/**
 * Handle music control buttons.
 * Expected customId format: "music:<action>[:arg]"
 *
 * Actions:
 *  - pause, resume, toggle
 *  - skip
 *  - stop
 *  - loop:off | loop:track | loop:queue
 *  - vol:+ | vol:- | vol:set:<1-150>
 *  - filter:bass | filter:nightcore | filter:karaoke | filter:reset
 *  - autoplay:toggle
 */
export async function handleButton(customId: string, i: ButtonInteraction) {
  const { guildId, channel } = requireContext(i);

  // We can safely defer an ephemeral update to avoid "This interaction failed"
  try { await i.deferUpdate(); } catch { /* ignore if already acknowledged */ }

  // Parse "music:action[:arg[:arg2]]"
  const parts = customId.split(":");
  // parts[0] === "music"
  const action = parts[1]?.toLowerCase();
  const arg = parts[2]?.toLowerCase();
  const arg2 = parts[3]?.toLowerCase();

  // Make sure a raw Lavalink player exists
  const raw = await ensureJoined(guildId);

  // Wrap with our higher-level queue/loop brain
  const gp = getGuildPlayer(guildId, channel!);

  try {
    switch (action) {
      case "pause": {
        if (raw.paused) {
          await i.followUp({ content: "Player is already paused.", flags: MessageFlags.Ephemeral });
        } else {
          try {
            await raw.pause(true);
            // Update button to show Resume
            try {
              await i.message.edit({ components: createMusicButtons(true) });
            } catch {}
            await i.followUp({ content: "⏸️ Paused", flags: MessageFlags.Ephemeral });
          } catch (err: any) {
            console.error("[music] pause error:", err.message);
            await i.followUp({ content: "❌ Failed to pause", flags: MessageFlags.Ephemeral });
          }
        }
        break;
      }

      case "resume": {
        if (!raw.paused) {
          await i.followUp({ content: "Player is not paused.", flags: MessageFlags.Ephemeral });
        } else {
          try {
            await raw.pause(false);
            // Update button to show Pause
            try {
              await i.message.edit({ components: createMusicButtons(false) });
            } catch {}
            await i.followUp({ content: "▶️ Resumed", flags: MessageFlags.Ephemeral });
          } catch (err: any) {
            console.error("[music] resume error:", err.message);
            await i.followUp({ content: "❌ Failed to resume", flags: MessageFlags.Ephemeral });
          }
        }
        break;
      }

      case "skip":
        try {
          await gp.skip();
          // Update button to show Pause (since next track will be playing)
          try {
            await i.message.edit({ components: createMusicButtons(false) });
          } catch {}
        } catch (err: any) {
          console.error("[music] skip error:", err.message);
          await i.followUp({ content: "❌ Failed to skip", flags: MessageFlags.Ephemeral });
        }
        break;

      case "stop":
        try {
          await gp.stop(true);
          // Clear tracked control message when music stops
          lastControlMessage.delete(guildId);
        } catch (err: any) {
          console.error("[music] stop error:", err.message);
          await i.followUp({ content: "❌ Failed to stop", flags: MessageFlags.Ephemeral });
        }
        break;

      case "loop": {
        // arg: off | track | queue
        const mode = (arg === "track" || arg === "queue") ? arg : "off";
        gp.setLoop(mode as any);
        break;
      }

      case "vol": {
        // arg: "+" | "-" | "set"; arg2 for "set"
        const current = typeof raw.volume === "number" ? raw.volume : 80;
        if (arg === "+") {
          const v = Math.min(150, current + 10);
          raw.setVolume?.(v);
          gp.setDefaultVolume(v);
        } else if (arg === "-") {
          const v = Math.max(1, current - 10);
          raw.setVolume?.(v);
          gp.setDefaultVolume(v);
        } else if (arg === "set") {
          const n = Math.max(1, Math.min(150, Number(arg2 || current)));
          raw.setVolume?.(n);
          gp.setDefaultVolume(n);
        }
        break;
      }

      case "filter": {
        // arg: bass | nightcore | karaoke | reset
        const preset =
          arg === "bass" ? "bassboost" :
          arg === "nightcore" ? "nightcore" :
          arg === "karaoke" ? "karaoke" :
          "reset";
        await gp.setFilters(preset as any);
        break;
      }

      case "autoplay": {
        // arg: toggle
        if (arg === "toggle") {
          const now = gp["state"].autoplay;
          gp.setAutoplay(!now);
        }
        break;
      }

      default:
        // Unknown action; no-op
        break;
    }
  } catch (err) {
    console.error("[music] button handler error:", err);
    // Try to let the user know (ignore if we already updated)
    try {
      const errMsg = err instanceof Error ? err.message : String(err);
      await i.followUp({ content: `Music control failed: ${errMsg}`, flags: MessageFlags.Ephemeral });
    } catch {}
  }
}

/**
 * Handle music select menu interactions (e.g., search results).
 * Expected customId format: "music:search_select"
 */
export async function handleSelectMenu(customId: string, i: any) {
  try {
    if (customId !== "music:search_select") return;

    await i.deferUpdate();

    const selectedUrl = i.values?.[0];
    if (!selectedUrl) {
      await i.followUp({ content: "❌ No track selected.", flags: MessageFlags.Ephemeral });
      return;
    }

    const { guildId, channel } = requireContext(i);
    const member = i.member;
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await i.followUp({ content: "❌ You must be in a voice channel.", flags: MessageFlags.Ephemeral });
      return;
    }

    // Load the track
    const node = AudioNode.instance;
    if (!node) {
      await i.followUp({ content: "❌ Audio node not initialized.", flags: MessageFlags.Ephemeral });
      return;
    }

    const searchResult = await node.search(selectedUrl, i.user);
    if (!searchResult?.tracks?.length) {
      await i.followUp({ content: "❌ Could not load track.", flags: MessageFlags.Ephemeral });
      return;
    }

    const track = searchResult.tracks[0];
    const gp = getGuildPlayer(guildId, channel as TextBasedChannel);
    
    // Ensure player is connected
    let raw = node.getPlayer(guildId);
    if (!raw || !raw.voiceChannelId) {
      await gp.join(voiceChannel.id, channel as TextBasedChannel);
      raw = node.getPlayer(guildId);
    }

    // Add track to queue using push method
    const queueItem = {
      title: track.info.title,
      uri: track.info.uri,
      track: track,
      requestedBy: i.user.id,
      sourceName: track.info.sourceName,
      identifier: track.info.identifier,
    };
    
    const wasEmpty = !raw?.queue?.current;
    gp.push(queueItem);
    
    if (wasEmpty) {
      // Start playing if nothing was playing
      await (raw as any)?.play?.();
    }

    const { EmbedBuilder, Colors } = await import("discord.js");
    const queueState = gp.state;
    const embed = new EmbedBuilder()
      .setColor(Colors.Green)
      .setTitle(wasEmpty ? "▶️ Now Playing" : "➕ Added to Queue")
      .setDescription(`**[${track.info.title}](${track.info.uri})**`)
      .addFields(
        { name: "Duration", value: formatDuration(track.info.duration), inline: true },
        { name: "Position", value: wasEmpty ? "Now" : `#${queueState.queueSize}`, inline: true }
      )
      .setThumbnail(track.info.artworkUrl || null);

    await i.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (err) {
    console.error("[music] select menu error:", err);
    try {
      const errMsg = err instanceof Error ? err.message : String(err);
      await i.followUp({ content: `❌ Failed to play track: ${errMsg}`, flags: MessageFlags.Ephemeral });
    } catch {}
  }
}

// Optional: export a getter so your slash commands can reuse the same registry
export function getPlayerForGuild(guildId: string) {
  return PLAYERS.get(guildId);
}

/**
 * Legacy playback interface for voiceManager.ts
 * Returns { title } after queueing the track
 */
export async function playQueryLegacy(guildId: string, query: string, requestedBy?: string) {
  const gp = getGuildPlayer(guildId);
  if (!gp) throw new Error("No music player initialized for this guild.");
  
  const node = AudioNode.instance;
  if (!node) throw new Error("Audio node not initialized.");
  
  // Search for the track
  const searchResult = await node.search(query, { id: requestedBy || "system" } as any);
  if (!searchResult?.tracks?.length) {
    throw new Error(`No tracks found for: ${query}`);
  }
  
  const track = searchResult.tracks[0];
  
  // Add to queue
  const queueItem = {
    title: track.info.title,
    uri: track.info.uri,
    track: track,
    requestedBy: requestedBy,
    sourceName: track.info.sourceName,
    identifier: track.info.identifier,
  };
  
  gp.push(queueItem);
  
  // Start playing if nothing is playing
  const raw = node.getPlayer(guildId);
  if (raw && !raw.queue?.current) {
    await raw.play();
  }
  
  return { title: track.info.title };
}

/**
 * Legacy control functions for voiceManager.ts
 */
export function pause(guildId: string) {
  const gp = getGuildPlayer(guildId);
  if (gp) gp.pause();
}

export function resume(guildId: string) {
  const gp = getGuildPlayer(guildId);
  if (gp) gp.resume();
}

export function skip(guildId: string) {
  const gp = getGuildPlayer(guildId);
  if (gp) void gp.skip();
}

export function stop(guildId: string) {
  const gp = getGuildPlayer(guildId);
  if (gp) void gp.stop(true);
}

export function setVolume(guildId: string, volume: number) {
  const gp = getGuildPlayer(guildId);
  if (gp) gp.setVolume(volume);
}
