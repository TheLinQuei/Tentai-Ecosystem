// src/audio/node.ts
import type { Client } from "discord.js";
import type { SearchResult, Player as LLPlayer } from "lavalink-client";

// Production safety: refuse default Lavalink password
const isProd = process.env.NODE_ENV === 'production';
const lavalinkPassword = process.env.LAVALINK_PASSWORD ?? "youshallnotpass";
if (isProd && lavalinkPassword === "youshallnotpass") {
  throw new Error('[AUDIO] CRITICAL: LAVALINK_PASSWORD must be set to a secure value in production. Refusing to start.');
}

/** Waits for Lavalink to actually report ready via /v4/info */
async function waitForLavalinkReady() {
  const base = `${process.env.LAVALINK_SECURE === "true" ? "https" : "http"}://${process.env.LAVALINK_HOST ?? "127.0.0.1"}:${process.env.LAVALINK_PORT ?? 2333}`;
  const headers = { Authorization: lavalinkPassword } as Record<string, string>;

  console.log(`[music] Waiting for Lavalink /v4/info at ${base}...`);
  const start = Date.now();

  for (let i = 1; i <= 30; i++) {
    try {
      const res = await fetch(`${base}/v4/info`, { headers });
      if (res.ok) {
        console.log(`[music] Lavalink is ready after ${(Date.now() - start) / 1000}s`);
        return;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.warn(`[music] Lavalink not responding after ${(Date.now() - start) / 1000}s, continuing anyway`);
}

/** Detect whether Lavalink exposes v4 or v3 API. Defaults to v4. */
async function detectLavalinkVersion(): Promise<"v4" | "v3"> {
  const base = `${process.env.LAVALINK_SECURE === "true" ? "https" : "http"}://${process.env.LAVALINK_HOST ?? "127.0.0.1"}:${process.env.LAVALINK_PORT ?? 2333}`;
  const headers = { Authorization: lavalinkPassword } as Record<string, string>;
  const isJsonOk = async (res: Response) => {
    if (!res.ok) return false;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) return false;
    try {
      const j = await res.clone().json();
      return typeof j === "object" && j !== null;
    } catch {
      return false;
    }
  };
  try {
    const r4 = await fetch(`${base}/v4/info`, { headers });
    if (await isJsonOk(r4)) return "v4";
  } catch {}
  try {
    const r3 = await fetch(`${base}/v3/info`, { headers });
    if (await isJsonOk(r3)) return "v3";
  } catch {}
  return "v4";
}

/**
 * Resolve the Manager constructor regardless of lavalink-client build shape.
 */
function resolveManagerCtor(): any {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod: any = require("lavalink-client");
  const ctor =
    mod?.LavalinkManager ||
    mod?.Manager ||
    mod?.default?.LavalinkManager ||
    mod?.default?.Manager ||
    (typeof mod === "function" ? mod : undefined);

  if (typeof ctor !== "function") {
    const keys = Object.keys(mod || {});
    console.error("[music] lavalink-client exports:", keys.length ? keys.join(", ") : "(none)");
    throw new TypeError("lavalink-client: Manager constructor not found");
  }
  console.log("[music] Using lavalink-client constructor:", ctor.name || "Manager");
  return ctor;
}

const ManagerCtor = resolveManagerCtor();

/** Build Lavalink node definitions for a specific API version. */
function makeNodesFor(apiVersion: "v4" | "v3"): any[] {
  const host = process.env.LAVALINK_HOST ?? "127.0.0.1";
  const port = Number(process.env.LAVALINK_PORT ?? 2333);
  const authorization = lavalinkPassword;
  const secure = String(process.env.LAVALINK_SECURE ?? "false").toLowerCase() === "true";

  console.log("[music] Node config ->", { id: "main", host, port, secure });

  return [
    {
      id: "main",
      host,
      port,
      secure,
      authorization,
      password: authorization,
      restVersion: apiVersion,
      // Remove wsPath - let lavalink-client auto-detect the correct WebSocket endpoint
    },
  ];
}

function getAllNodes(mgr: any): any[] {
  const out: any[] = [];
  try {
    if (mgr?.nodeManager?.nodes?.values) out.push(...Array.from(mgr.nodeManager.nodes.values()));
    else if (mgr?.nodes?.values) out.push(...Array.from(mgr.nodes.values()));
    else if (Array.isArray(mgr?.nodes)) out.push(...mgr.nodes);
  } catch {}
  return out;
}

const isNodeConnected = (n: any) =>
  n?.socket?.readyState === 1 || n?.connected === true || n?._connected === true;

/** Prefer a connected node for REST/search. */
function pickNode(mgr: any) {
  const list = getAllNodes(mgr);
  return list.find(isNodeConnected) || list[0];
}

/** Minimal fetch fallback for /loadtracks */
async function httpGet(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res.json();
}

export class AudioNode {
  static instance: AudioNode | undefined;
  manager: any;

  private readyOnce!: Promise<void>;
  private markReady!: () => void;
  private _readyFired = false;

  private constructor(client: Client) {
    // Guard against lavalink-client throwing during initial websocket open
    // Some builds throw synchronously in the WS 'open' handler if /v4/info probe fails.
    // We swallow only those specific errors and allow our retry loop to continue.
    let suppressionCount = 0;
    const maxSuppressions = 50; // Increased threshold - allow more retries during startup
    
    const handleUncaught = (err: any) => {
      const msg = String(err?.message || "");
      const stack = String(err?.stack || "");
      
      // Check if this is a lavalink-client initialization error
      if (
        (msg.includes("does not provide any /v4/info") ||
         msg.includes("The node is not connected to the Lavalink Server")) &&
        stack.includes("lavalink-client")
      ) {
        suppressionCount++;
        if (suppressionCount === 1) {
          console.warn("[music] ⚠️ Suppressing lavalink-client initialization errors (will reconnect automatically)");
        }
        if (suppressionCount <= maxSuppressions) {
          // Silently continue - forceConnectNodes will handle retries
          return; // swallow
        } else if (suppressionCount === maxSuppressions + 1) {
          console.error("[music] ❌ Too many lavalink-client errors (50+), stopping suppression");
        }
      }
      // Not our error — rethrow by letting the default handler continue
      throw err;
    };
    // Register guards once per process
    if (!(global as any)._vi_music_guard) {
      (global as any)._vi_music_guard = true;
      process.on("uncaughtException", handleUncaught as any);
      process.on("unhandledRejection", (e: any) => handleUncaught(e));
    }
    const sendToShard = (guildId: string, payload: unknown) => {
      const g = client.guilds.cache.get(guildId);
      const shard =
        (g as any)?.shard ||
        (client as any).ws?.shards?.get?.(0) ||
        (client as any).ws;

      if (shard?.send) {
        try {
          shard.send(payload);
          if ((payload as any)?.op === 4) {
            const d: any = (payload as any).d;
            console.log("[music] VOICE STATE UPDATE → shard.send()", {
              guildId: d?.guild_id,
              channelId: d?.channel_id,
              selfDeaf: d?.self_deaf,
            });
          }
        } catch (e) {
          console.error("[music] sendToShard error:", e);
        }
      } else {
        console.error("[music] sendToShard: no shard transport available!");
      }
    };

    // --- Ready gate ---
    this.readyOnce = new Promise<void>((resolve) => {
      this.markReady = () => {
        if (!this._readyFired) {
          this._readyFired = true;
          resolve();
        }
      };
    });

    // Defer manager creation until Lavalink REST is responsive
    (async () => {
      await waitForLavalinkReady();
      // Small settle delay: some docker images report /v4/info before WS is fully ready
      await new Promise((r) => setTimeout(r, 1000));
      const apiVersion = await detectLavalinkVersion();
      const nodes = makeNodesFor(apiVersion);

      this.manager = new ManagerCtor({
        nodes,
        sendToShard,
        client: { id: client.user?.id ?? "0" },
        shards: (client.ws as any)?.shardCount ?? 1,
        autoSkip: true,
        playerOptions: {
          volume: 80,
          // Audio quality settings to reduce skipping and rate instability
          selfDeaf: true,
          selfMute: false,
          // Use 48kHz 2-channel stereo (Discord standard)
          // This matches Discord's native format to avoid resampling artifacts
          applyVolumeAsFilter: false, // Hardware volume control is more stable
        },
      });

      // Try priming
      try {
        this.manager.init?.({
          clientId: client.user?.id ?? "0",
          shards: (client.ws as any)?.shardCount ?? 1,
        });
        console.log("[music] Manager primed.");
      } catch {}

      // Forward Discord voice events to Lavalink
      // IMPORTANT: Only use 'raw' event to avoid duplicate event processing
      // Other bots use this pattern for stable playback
      client.on("raw", (d: any) => {
        try { 
          this.manager.sendRawData(d); 
        } catch (e) { 
          // Only log voice-related errors
          if (d.t === "VOICE_SERVER_UPDATE" || d.t === "VOICE_STATE_UPDATE") {
            console.error(`[music] sendRawData error for ${d.t}:`, e); 
          }
        }
      });

      // Logs
      const markReady = () => this.markReady?.();
      this.manager.on?.("ready", (n: any) => { console.log(`[music] node ready: ${n?.id ?? "unknown"}`); markReady(); });
      this.manager.on?.("nodeConnect", (n: any) => { console.log(`[music] node connect: ${n?.id ?? "unknown"}`); markReady(); });
      this.manager.on?.("nodeDisconnect", (n: any, r: any) => console.log(`[music] node disconnect: ${n?.id ?? "unknown"} reason=${String(r)}`));
      this.manager.on?.("reconnecting", (n: any) => console.log(`[music] node reconnecting: ${n?.id ?? "unknown"}`));
      this.manager.on?.("nodeError", (n: any, e: any) => console.error("[music] node error", n?.id ?? "unknown", e));

      // Try to connect initially
      this.forceConnectNodes().catch(() => {});
      // Health watcher for runtime reconnects
      this.startHealthWatcher();
    })().catch(() => {});
  }

  /**
   * Actively connect all nodes, retrying until one is online (up to ~90s total).
   */
  private async forceConnectNodes() {
    const maxRetries = 15; // Increased from 10
    const baseDelay = 2000; // Reduced from 3000ms for faster initial attempts
    let attempt = 0;

    const nodes = getAllNodes(this.manager);

    const connectOnce = async (): Promise<boolean> => {
      attempt++;
      for (const n of nodes) {
        try {
          n.connect?.();
          console.log(`[music] Lavalink connect attempt ${attempt}: node ${n.id ?? "main"}`);
        } catch (e) {
          // Only log non-initialization errors
          const msg = String((e as Error)?.message || "");
          if (!msg.includes("does not provide any /v4/info") && !msg.includes("not connected to the Lavalink Server")) {
            console.warn(`[music] connect() error:`, msg);
          }
        }
      }

      await new Promise((r) => setTimeout(r, baseDelay));

      if (nodes.some(isNodeConnected)) {
        console.log(`[music] ✅ Lavalink node connected after ${attempt} attempt(s).`);
        this.markReady?.();
        return true;
      }

      if (attempt < maxRetries) {
        const delay = Math.min(baseDelay * attempt, 8000); // Cap backoff at 8s
        console.log(`[music] ⏳ Lavalink still not ready, retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        return connectOnce();
      }

      console.warn("[music] ❌ Lavalink connection timeout (~90s). Proceeding anyway.");
      this.markReady?.();
      return false;
    };

    await connectOnce();
  }

  /**
   * Background health watcher: pings every 30s and reconnects if needed.
   */
  private startHealthWatcher() {
    setInterval(() => {
      const nodes = getAllNodes(this.manager);
      const healthy = nodes.some(isNodeConnected);
      if (!healthy) {
        console.warn("[music] ⚠️ Lavalink node disconnected — attempting reconnect.");
        this.forceConnectNodes().catch(() => {});
      }
    }, 30_000);
  }

  static init(client: Client) {
    if (!this.instance) this.instance = new AudioNode(client);
    return this.instance;
  }

  async ready() {
    return this.readyOnce;
  }

  async search(query: string, requester?: any): Promise<SearchResult> {
    await this.ready();

    if (typeof this.manager.search === "function") {
      return this.manager.search(query, { requester });
    }

    const node: any = pickNode(this.manager);
    if (!node) throw new Error("No Lavalink node available for search.");

    const rest = node?.rest ?? node?.node?.rest ?? null;
    const call =
      rest?.loadTracks ||
      rest?.fetchTracks ||
      rest?.search ||
      null;

    if (typeof call === "function") {
      const raw = await (call.length >= 2 ? call.call(rest, query, requester) : call.call(rest, query));
      return this.normalizeSearchResult(raw);
    }

    const opts = node?.options ?? {};
    const base = `${opts.secure ? "https" : "http"}://${opts.host}:${opts.port}`;
    const headers: Record<string, string> = {
      Authorization: opts.authorization ?? lavalinkPassword,
    };

    for (const path of ["/v4/loadtracks", "/v3/loadtracks", "/loadtracks"]) {
      try {
        const data = await httpGet(`${base}${path}?identifier=${encodeURIComponent(query)}`, headers);
        return this.normalizeSearchResult(data);
      } catch {}
    }

    throw new Error("No compatible search method found for lavalink-client (manager.search, node.rest.*, or HTTP fallback).");
  }

  private normalizeSearchResult(raw: any): SearchResult {
    const loadType = (raw?.loadType ?? "search") as SearchResult["loadType"];
    const playlistInfo = (raw?.playlistInfo ?? {}) as unknown;
    // Lavalink v4 uses 'data' array, v3 uses 'tracks'
    const tracks = (raw?.data ?? raw?.tracks ?? (Array.isArray(raw) ? raw : [])) as unknown as Array<any>;
    return { loadType, playlistInfo, tracks } as unknown as SearchResult;
  }

  async join(guild: { id: string }, voiceChannel: { id: string }, textChannelId?: string): Promise<LLPlayer> {
    await this.ready();

    const opts: any = {
      guildId: guild.id,
      voiceChannelId: voiceChannel.id,
      textChannelId,
      selfDeaf: true,
      voiceId: voiceChannel.id,
      textId: textChannelId ?? voiceChannel.id,
    };

    const p = this.manager.createPlayer(opts);

    // Don't check p.connected - it requires VOICE_SERVER_UPDATE from Discord which is async
    // Instead, just call connect and trust that voice state was sent
    if (typeof p.connect === "function") {
      console.log(`[music] Calling p.connect() for guild ${guild.id}, voiceChannel ${voiceChannel.id}`);
      await p.connect();
      console.log(`[music] p.connect() completed for guild ${guild.id}`);
    }
    return p as LLPlayer;
  }

  getPlayer(guildId: string) {
    return this.manager.players.get(guildId) as LLPlayer | undefined;
  }
}
