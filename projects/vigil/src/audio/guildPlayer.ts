// src/audio/guildPlayer.ts
import type { TextBasedChannel } from "discord.js";
import type { Player as LLPlayer, SearchResult } from "lavalink-client";
import { AudioNode } from "./node";

type LoopMode = "off" | "track" | "queue";

export interface QueueItem {
  title: string;
  uri?: string;
  track: any;           // opaque lavalink track object
  requestedBy?: string;
  sourceName?: string;  // yt / sc / etc.
  identifier?: string;  // source id (e.g., YouTube video id)
}

export class GuildPlayer {
  readonly guildId: string;
  private textChannel?: TextBasedChannel;

  private node = AudioNode.instance!;
  private player?: LLPlayer;

  private queue: QueueItem[] = [];
  private current?: QueueItem;
  private loop: LoopMode = "off";

  // Feature flags (per guild)
  private autoplayEnabled = false;     // smart autoplay when queue ends
  private defaultVolume = 80;

  constructor(guildId: string, textChannel?: TextBasedChannel) {
    this.guildId = guildId;
    this.textChannel = textChannel;
  }

  attachTextChannel(ch: TextBasedChannel) {
    this.textChannel = ch;
  }

  setAutoplay(on: boolean) {
    this.autoplayEnabled = on;
  }
  setDefaultVolume(v: number) {
    this.defaultVolume = Math.max(1, Math.min(150, Math.floor(v)));
    if (this.player) (this.player as any).setVolume?.(this.defaultVolume);
  }

  async join(voiceChannelId: string, textChannel?: TextBasedChannel) {
    if (textChannel) this.textChannel = textChannel;

    const guild = { id: this.guildId };
    const voice = { id: voiceChannelId };
    this.player = await this.node.join(guild, voice, this.textChannel ? this.textChannel.id : undefined);

    // Set initial volume
    try { (this.player as any).setVolume?.(this.defaultVolume); } catch {}

    // Wire events ONCE
    const p = this.player as any;
    if (!p._vi_wired) {
      p._vi_wired = true;

      p.on?.("playerUpdate", (data: any) => {
        console.log(`[music] [${this.guildId}] playerUpdate:`, data);
      });

      p.on?.("trackStart", () => {
        console.log(`[music] [${this.guildId}] trackStart: ${this.current?.title ?? "(unknown)"}`);
      });

      // Do NOT clear current here; next() needs it for loop logic.
      const onEnd = async () => {
        try { await this.next(); } catch (e) { console.error("[music] next() after end error:", e); }
      };

      p.on?.("trackEnd", onEnd);
      p.on?.("end", onEnd);

      p.on?.("error", (e: any) => {
        console.error(`[music] [${this.guildId}] player error:`, e);
        // Attempt to skip to next on error
        this.next().catch(() => {});
      });
    }

    return this.player;
  }

  /** Enqueue a lavalink SearchResult (first track) or a track payload. */
  push(item: QueueItem) {
    this.queue.push(item);
  }

  get state() {
    return {
      guildId: this.guildId,
      current: this.current,
      queueSize: this.queue.length,
      loop: this.loop,
      autoplay: this.autoplayEnabled,
      volume: this.defaultVolume,
    };
  }

  setLoop(mode: LoopMode) {
    this.loop = mode;
  }

  /** Core play helper */
  private async play(item: QueueItem) {
    const p = this.player as any;
    this.current = item;
    console.log("[music] play() called with track:", {
      title: item.title,
      hasTrack: !!item.track,
      hasEncoded: !!(item.track)?.encoded,
      playerExists: !!p,
      playerState: p?.state,
      connected: p?.connected,
      voiceChannelId: p?.voiceChannelId
    });
    
    // lavalink-client expects clientTrack for immediate play
    // OR use play() without arguments to play from queue
    try {
      // Option 1: Use clientTrack to play immediately (bypasses queue)
      await p.play({ clientTrack: item.track });
      console.log("[music] p.play({ clientTrack }) completed successfully");
    } catch (err) {
      console.error("[music] p.play() error:", err);
      throw err;
    }
  }

  /** Advance the queue according to loop/autoplay rules. */
  async next() {
    const p = this.player as any;
    if (!p) return;

    const isLoopTrack = this.loop === "track" && !!this.current;
    const isLoopQueue = this.loop === "queue";
    const hasNext = this.queue.length > 0;

    // 1) loop single track → replay current
    if (isLoopTrack) {
      await this.play(this.current!);
      return;
    }

    // 2) queue has next track → play it
    if (hasNext) {
      const nextItem = this.queue.shift()!;
      await this.play(nextItem);
      return;
    }

    // 3) loop entire queue — put the just-finished track back & replay queue
    if (isLoopQueue && this.current) {
      this.queue.push(this.current);
      const nextItem = this.queue.shift()!;
      await this.play(nextItem);
      return;
    }

    // 4) autoplay if enabled
    if (this.autoplayEnabled && this.current) {
      const rec = await this.recommendFrom(this.current).catch(() => undefined);
      if (rec) {
        await this.play(rec);
        return;
      }
    }

    // 5) nothing left — stop gracefully
    this.current = undefined;
    try {
      // Stop variants across clients (be explicit to satisfy lint)
      if (p && typeof p.stop === 'function') {
        p.stop();
      } else if (p && typeof p.stopTrack === 'function') {
        p.stopTrack();
      } else if (p && typeof p.pause === 'function') {
        p.pause(true);
      }
    } catch {}
  }

  /** Quick search wrapper (returns first track or null). */
  private async searchFirst(idOrQuery: string): Promise<QueueItem | null> {
    const res: SearchResult = await this.node.search(idOrQuery, { guildId: this.guildId });
    try {
      const anyRes: any = res as any;
      // After normalization, tracks should be in 'tracks' property
      const trackList = anyRes?.tracks ?? [];
      const n = trackList?.length ?? 0;
      const lt = anyRes?.loadType ?? "unknown";
      const ex = anyRes?.exception;
      const exMsg = ex?.message ? ` exception=${String(ex.message).slice(0,200)}` : "";
      console.log(`[music] search loadType=${lt} tracks=${n}${exMsg} for`, idOrQuery.slice(0, 80));
    } catch {}
    // After normalizeSearchResult(), tracks are in 'tracks' property
    const t: any = res?.tracks?.[0];
    if (!t) return null;

    const info = (t.info ?? {});
    const title = info?.title ?? "Unknown";
    const uri = info?.uri ?? info?.url;
    const videoId = info?.identifier ?? undefined;
    const sourceName = info?.sourceName ?? undefined;

    return { title, uri, track: t, sourceName, identifier: videoId };
  }

  /** Basic YT-related autoplay; requires YT_API_KEY for official "related videos". */
  private async recommendFrom(seed: QueueItem): Promise<QueueItem | null> {
    // Prefer GOOGLE_API_KEY if present, fallback to legacy YT_API_KEY
    const key = process.env.GOOGLE_API_KEY || process.env.YT_API_KEY;
    const seedId = seed.identifier || this.extractYouTubeId(seed.uri || "");
    // Prefer related videos if we have a video id AND API key
    if (key && seedId) {
      try {
        const url = new URL("https://www.googleapis.com/youtube/v3/search");
        url.searchParams.set("part", "snippet");
        url.searchParams.set("type", "video");
        url.searchParams.set("maxResults", "5");
        url.searchParams.set("relatedToVideoId", seedId);
        url.searchParams.set("key", key);

        const res = await fetch(url.toString());
        if (res.ok) {
          const data = (await res.json()) as any;
          const candidate = data?.items?.find((x: any) => x?.id?.videoId)?.id?.videoId;
          if (candidate) {
            return await this.searchFirst(`https://www.youtube.com/watch?v=${candidate}`);
          }
        }
      } catch (e) {
        console.warn("[music] related videos fetch failed; falling back to ytsearch", e);
      }
    }

    // Fallback: ytsearch using seed title/artist (best-effort)
    const q = seed.title || seed.uri || "";
    if (q) {
      return await this.searchFirst(`ytsearch:${q}`);
    }

    return null;
  }

  private extractYouTubeId(url: string) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || undefined;
      if (u.hostname === "youtu.be") return u.pathname.slice(1) || undefined;
    } catch {}
    return undefined;
  }

  /** Public controls */
  async playNow(identifierOrQuery: string, requestedBy?: string) {
    const q = (identifierOrQuery || "").trim();

    // 1) Try as-is (URL or prefixed search)
    let found = await this.searchFirst(q);
    const attempts: string[] = [];
    if (q) attempts.push(q);

    // 2) If not found and no explicit prefix/URL, try common search prefixes
    const lower = q.toLowerCase();
    const hasPrefixOrUrl = /^(ytsearch:|ytmsearch:|scsearch:|spsearch:|https?:\/\/)/.test(lower);
    if (!found && !hasPrefixOrUrl && q.length > 0) {
      for (const prefix of ["ytsearch:", "ytmsearch:", "scsearch:"]) {
        const attempt = prefix + q;
        attempts.push(attempt);
        found = await this.searchFirst(attempt);
        if (found) break;
      }
    }

    // 2b) If not found and the input WAS a URL, try extracting a video id/title and searching via ytsearch/ytmsearch
    if (!found && q.length > 0 && /https?:\/\//.test(lower)) {
      const vid = this.extractYouTubeId(q);
      const urlSearches = [
        `ytsearch:${q}`,
        vid ? `ytsearch:${vid}` : undefined,
        vid ? `ytmsearch:${vid}` : undefined,
      ].filter(Boolean) as string[];
      for (const attempt of urlSearches) {
        attempts.push(attempt);
        found = await this.searchFirst(attempt);
        if (found) break;
      }
    }

    // 3) Last-chance fallback: use play-dl to find a YouTube URL, then hand that URL to Lavalink
    if (!found && q.length > 0) {
      try {
        const mod: any = await import("play-dl");
        // Prefer YouTube search
        const yt = await mod.search(q, { source: { youtube: "video" }, limit: 1 }).catch(() => []);
        const cand: any = Array.isArray(yt) ? yt[0] : undefined;
        const url: string | undefined = cand?.url || cand?.shortURL || (cand?.id ? `https://www.youtube.com/watch?v=${cand.id}` : undefined);
        if (url) {
          attempts.push(url);
          found = await this.searchFirst(url);
          // If the URL still fails, try searching by the resolved title
          if (!found && cand?.title) {
            const q2 = `ytsearch:${cand.title}`;
            attempts.push(q2);
            found = await this.searchFirst(q2);
          }
        }
      } catch {
        // ignore if play-dl not available or blocked
      }
    }

    if (!found) {
      console.warn("[music] No tracks found after attempts:", attempts);
      throw new Error("No tracks found.");
    }

    found.requestedBy = requestedBy;
    if (!this.player) throw new Error("Player not joined.");
    
    // Always play immediately (stop current track if needed)
    // This gives users control - if they want to queue, they can use a separate queue command
    if (this.current) {
      // Clear current and play new track immediately
      this.current = undefined;
    }
    await this.play(found);
    
    return found;
  }

  async skip() {
    await this.next();
  }

  async stop(clearQueue = true) {
    if (clearQueue) {
      this.queue = [];
    }
    const p = this.player as any;
    if (p) {
      try {
        if (typeof p.stop === 'function') {
          p.stop();
        } else if (typeof p.stopTrack === 'function') {
          p.stopTrack();
        }
        // Only pause if stop methods don't exist and player isn't already paused
        if (!p.stop && !p.stopTrack && !p.paused && typeof p.pause === 'function') {
          p.pause(true);
        }
      } catch (e) {
        console.error("[guildPlayer] stop error:", e);
      }
    }
    this.current = undefined;
  }

  pause() {
    const p = this.player as any;
    if (p && !p.paused) {
      try {
        if (typeof p.pause === 'function') {
          p.pause(true);
        } else if (typeof p.setPaused === 'function') {
          p.setPaused(true);
        }
      } catch (e) { console.error("[guildPlayer] pause error:", e); }
    }
  }

  resume() {
    const p = this.player as any;
    if (p && p.paused) {
      try {
        if (typeof p.pause === 'function') {
          p.pause(false);
        } else if (typeof p.setPaused === 'function') {
          p.setPaused(false);
        } else if (typeof p.resume === 'function') {
          p.resume();
        }
      } catch (e) { console.error("[guildPlayer] resume error:", e); }
    }
  }

  setVolume(volume: number) {
    this.setDefaultVolume(volume);
  }

  getCurrent() {
    return this.current;
  }

  getQueueArray() {
    return this.queue;
  }

  /** Filter presets (keep light — CPU load runs on Lavalink). */
  async setFilters(preset: "reset" | "bassboost" | "nightcore" | "karaoke") {
    const p: any = this.player;
    if (!p) return;

    // Most lavalink clients accept setFilters({...}) or filters.set(...)
    const apply = (body: any) => (p.setFilters?.(body) ?? p.filters?.set?.(body));

    switch (preset) {
      case "reset":
        await apply({}); // clear all
        break;

      case "bassboost": {
        // Gentle low-band lift
        const bands = [
          { band: 0, gain: 0.25 },
          { band: 1, gain: 0.20 },
          { band: 2, gain: 0.15 },
          { band: 3, gain: 0.10 },
        ];
        await apply({ equalizer: bands });
        break;
      }

      case "nightcore":
        await apply({ timescale: { speed: 1.1, pitch: 1.1, rate: 1.0 } });
        break;

      case "karaoke":
        // Default params for vocal removal
        await apply({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } });
        break;
    }
  }

  /** Get current queue information */
  async getQueueInfo() {
    return {
      current: this.current,
      queue: this.queue,
      loop: this.loop,
    };
  }
}
