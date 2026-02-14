// src/modules/voiceManager.ts
import {
  AudioPlayer,
  AudioPlayerStatus,
  StreamType,
  VoiceConnection,
  VoiceConnectionStatus,
  createAudioResource,
  createAudioPlayer,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  EndBehaviorType,
  DiscordGatewayAdapterCreator,
  AudioResource,
} from "@discordjs/voice";
import {
  Guild,
  TextBasedChannel,
  VoiceBasedChannel,
} from "discord.js";
import prism from "prism-media";
import { Readable } from "node:stream";
import { memory } from "./memory";
import { quickEmotionHeuristic, generateResponse } from "./ai";
import { speakToPcm } from "./tts";
import { transcribePcm48kMono } from "./stt";
// Emotion type removed — not explicitly referenced in this module
import { parseVoiceCommand } from "./intents";
import * as automod from "./moderation";
import { detectWake } from "../voice/wake";            // << wake lives in /voice
import { getSession, wakeSession, extendSession, setAwaiting } from "./session"; // << session module
import "../boot/ffmpeg";
import * as music from "../features/music";
import type { Source } from "./moderation";          // path from voiceManager to your moderation.ts
import type { Message } from "discord.js";

/** If you have a first-party weather module, we’ll try it first… */
let getWeatherByName: ((place: string) => Promise<any>) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const w = require("../weather/weather");
  if (w && typeof w.getWeatherByName === "function") {
    getWeatherByName = w.getWeatherByName as (p: string) => Promise<any>;
  }
} catch { /* optional */ }

/* ====== Open-Meteo fallback (no API key) for robust weather ====== */
type When = "now" | "tomorrow";
const WMO: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "freezing fog",
  51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
  56: "freezing drizzle", 57: "freezing drizzle",
  61: "light rain", 63: "moderate rain", 65: "heavy rain",
  66: "freezing rain", 67: "freezing rain",
  71: "light snow", 73: "moderate snow", 75: "heavy snow",
  77: "snow grains",
  80: "rain showers", 81: "heavy rain showers", 82: "violent rain showers",
  85: "snow showers", 86: "heavy snow showers",
  95: "thunderstorm", 96: "thunderstorm with hail", 99: "severe thunderstorm with hail",
};
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}
async function weatherFallback(place: string, when: When): Promise<{ where: string; line: string }> {
  const geo = await fetchJson<{ results?: any[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`
  );
  const g = geo.results?.[0];
  if (!g) throw new Error("location not found");
  const lat = g.latitude, lon = g.longitude;
  const where = `${g.name}${g.admin1 ? ", " + g.admin1 : ""}${g.country ? ", " + g.country : ""}`;
  const api = new URL("https://api.open-meteo.com/v1/forecast");
  api.searchParams.set("latitude", String(lat));
  api.searchParams.set("longitude", String(lon));
  api.searchParams.set("timezone", "auto");
  api.searchParams.set("current_weather", "true");
  api.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min");
  const wx = await fetchJson<any>(api.toString());

  if (when === "now") {
    const c = wx.current_weather || {};
    const desc = WMO[c.weathercode as number] || "current conditions";
    const line = `${Math.round(c.temperature)}° with ${desc}`;
    return { where, line };
  } else {
    // tomorrow = next day in 'daily'
    const idx = 1;
    const code = wx.daily?.weather_code?.[idx];
    const tmax = wx.daily?.temperature_2m_max?.[idx];
    const tmin = wx.daily?.temperature_2m_min?.[idx];
    const desc = WMO[Number(code)] || "conditions";
    const line = `tomorrow: ${Math.round(tmin)}° / ${Math.round(tmax)}°, ${desc}`;
    return { where, line };
  }
}

/* ====== minimal weather intent + follow-ups ====== */
function extractLocation(t: string): string | null {
  const m = /\b(?:in|for|at)\s+([a-z][\w\s,.'-]{2,})/i.exec(t);
  if (m) return m[1].trim().replace(/[?.!,;:\s]+$/g, "");
  return null;
}
function extractWhen(t: string): When {
  return /\btomorrow\b/i.test(t) ? "tomorrow" : "now";
}
const weatherCtx = new Map<string, { city: string; ts: number }>(); // key = guild:user

/* ===================== Voice I/O state ===================== */
type GuildId = string;
type QueueItem = Buffer | AudioResource;

interface GuildVoiceState {
  connection: VoiceConnection;
  player?: AudioPlayer;
  queue: QueueItem[];
  playing: boolean;
  busyUsers: Set<string>;
  textChannelId?: string;
}

const state = new Map<GuildId, GuildVoiceState>();

/* ------------------------ Safe text sender ------------------------ */
// function sendToChannel(guild: Guild, channelId: string | undefined, content: string) {
//   if (!channelId) return;
//   const chan = guild.channels.cache.get(channelId) as any;
//   if (!chan) return;
//   if (typeof chan.isTextBased === "function" ? chan.isTextBased() : true) {
//     if ("send" in chan) {
//       console.log(`[voice] text -> ${content}`);
//       chan.send({ content }).catch(() => {});
//     }
//   }
// }

/* ------------------------ Audio Helpers ------------------------ */
function playNext(guildId: string) {
  const st = state.get(guildId);
  if (!st || !st.player) return;

  const item = st.queue.shift();
  if (!item) {
    st.playing = false;
    return;
  }

  let res: AudioResource;
  if (Buffer.isBuffer(item)) {
    res = createAudioResource(Readable.from(item), { inputType: StreamType.Raw });
  } else {
    res = item;
  }

  st.player.play(res);
  st.playing = true;
}

function getOrCreatePlayer(guildId: string): AudioPlayer {
  const s = state.get(guildId);
  if (!s) throw new Error("No voice state");
  if (s.player) return s.player;

  const p = createAudioPlayer();
  p.on("error", (e) => console.error("AudioPlayer error:", e));
  p.on(AudioPlayerStatus.Idle, () => playNext(guildId));

  s.player = p;
  s.connection.subscribe(p);
  return p;
}

function enqueueItem(guildId: string, item: QueueItem) {
  const s = state.get(guildId);
  if (!s) return;
  getOrCreatePlayer(guildId);
  if (s.playing) s.queue.push(item);
  else { s.queue.push(item); playNext(guildId); }
}
function enqueuePcm(guildId: string, pcm: Buffer) { enqueueItem(guildId, pcm); }

/* ------------------- speak (public helper) ------------------- */
export async function speak(guildId: string, text: string) {
  console.log(`[voice] reply -> ${text}`);
  const pcm = await speakToPcm(text);
  if (pcm) enqueuePcm(guildId, pcm);
  else console.warn("[voice] TTS produced no audio");
}

/* ------------------- helper for /bind_here ------------------- */
export function getBoundTextChannelId(guildId: string): string | undefined {
  return state.get(guildId)?.textChannelId;
}

export interface ScanOpts {
  guild: Guild;
  userId: string;
  text: string;
  source: Source;
  message?: Message;
  textChannelId?: string;
  speak?: (line: string) => Promise<Buffer | null>; // optional
  enqueue?: (pcm: Buffer) => void;                  // optional
}

/* --------------------- Public API: join/leave --------------------- */
export async function join(voiceChannel: VoiceBasedChannel, textChannel?: TextBasedChannel) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: (voiceChannel.guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator),
    selfDeaf: false,
  });

  await entersState(connection, VoiceConnectionStatus.Ready, 15_000);

  const guildId = voiceChannel.guild.id;
  const gv: GuildVoiceState = {
    connection,
    queue: [],
    playing: false,
    busyUsers: new Set(),
    textChannelId: textChannel?.id,
  };
  state.set(guildId, gv);

  getOrCreatePlayer(guildId);

  const meDeaf = voiceChannel.guild.members.me?.voice.deaf;
  console.log(`[join] connected. selfDeaf=${connection.joinConfig.selfDeaf} serverDeaf=${meDeaf}`);

  setupReceivePipeline(guildId, connection, voiceChannel.guild);
}

export async function leave(guild: Guild) {
  const s = state.get(guild.id);
  try { s?.player?.stop(true); } catch {}
  try { s?.connection?.removeAllListeners(); } catch {}

  const conn = getVoiceConnection(guild.id) || s?.connection;
  if (conn) { try { conn.destroy(); } catch {} }
  state.delete(guild.id);
}

export function bindTextChannel(guildId: string, channelId: string) {
  const s = state.get(guildId);
  if (s) s.textChannelId = channelId;
}

/* ---------------- Central transcript handler (wake + session) ---------------- */
export async function handleTranscript(guildId: string, userId: string, rawText: string) {
  const text = (rawText || "").trim();
  if (!text) return;

  const sess = getSession(guildId, userId);
  const wake = detectWake(text, guildId);

  if (wake.wake) {
    wakeSession(guildId, userId);
    const remainder = (wake.trimmed || "").trim();
    if (!remainder) {
      await speak(guildId, "I'm listening.");
      return;
    }
    return routeIntentOrChat(guildId, userId, remainder);
  }

  if (sess) {
    extendSession(guildId, userId);
    return routeIntentOrChat(guildId, userId, text);
  }
  return;
}

// --- add back the helpers music.ts imports ---
export function enqueueResource(guildId: string, resource: AudioResource) {
  enqueueItem(guildId, resource);
}

export function getPlayer(guildId: string): AudioPlayer | undefined {
  return state.get(guildId)?.player;
}

export function clearQueue(guildId: string) {
  const s = state.get(guildId);
  if (s) s.queue.length = 0;
}

export function stopAudio(guildId: string) {
  state.get(guildId)?.player?.stop(true);
}

export function isConnected(guildId: string): boolean {
  return !!(state.get(guildId)?.connection && getVoiceConnection(guildId));
}


/* ---------------- Voice Receive Pipeline (Opus -> PCM -> STT) ---------------- */
function setupReceivePipeline(guildId: string, connection: VoiceConnection, guild: Guild) {
  const receiver = connection.receiver;

  receiver.speaking.on("start", async (userId) => {
    const st = state.get(guildId);
    if (!st) return;
    if (userId === guild.members.me?.id) return;
    if (st.busyUsers.has(userId)) return;
    st.busyUsers.add(userId);
    // If Vi is speaking, stop it so the user can interrupt
    if (st.player) {
        st.player.stop(true);
        st.playing = false;
        st.queue.length = 0;
    }

    const member = await guild.members.fetch(userId).catch(() => null);
    const username = member?.displayName || member?.user.username || `user-${userId}`;
    console.log(`[voice] speaking start: ${username} (${userId})`);

    try {
      const opusStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
      });

      const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
      const pcmStream = opusStream.pipe(decoder);

      collectStream(pcmStream, 20_000)
        .then(async (pcmStereo) => {
          const bytes = pcmStereo.length;
          console.log(`[voice] captured ${bytes} bytes from ${username}`);

          const pcmMono = downmixStereoToMono(pcmStereo);
          if (pcmMono.length < 48000 * 2 * 0.5) {
            console.log(`[voice] too short (<0.5s), ignoring`);
            return;
          }

          const text = (await transcribePcm48kMono(pcmMono)) || "";
          console.log(`[voice] STT result (${username}): "${text}"`);
          if (!text) return;

          await automod.scanAndMaybeAct({
            guild,
            userId,
            text,
            source: "voice",
            textChannelId: state.get(guildId)?.textChannelId,
            speak: speakToPcm,
            enqueue: (pcm) => enqueuePcm(guildId, pcm),
          });

          await handleTranscript(guildId, userId, text);
        })
        .catch((e) => console.error("Voice pipeline error:", e))
        .finally(() => {
          st.busyUsers.delete(userId);
        });
    } catch (e) {
      state.get(guildId)?.busyUsers.delete(userId);
      console.error("Receive setup error:", e);
    }
  });
}

function collectStream(readable: Readable, maxMs: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let ended = false;
    const timer = setTimeout(() => {
      if (!ended) { ended = true; resolve(Buffer.concat(chunks)); }
    }, maxMs);

    readable.on("data", (d: Buffer) => chunks.push(Buffer.from(d)));
    readable.on("end", () => {
      if (!ended) { ended = true; clearTimeout(timer); resolve(Buffer.concat(chunks)); }
    });
    readable.on("error", (e) => {
      if (!ended) { ended = true; clearTimeout(timer); reject(e); }
    });
  });
}

// stereo->mono average for 16-bit LE interleaved samples
function downmixStereoToMono(stereo: Buffer): Buffer {
  const out = Buffer.alloc(stereo.length / 2);
  for (let i = 0, o = 0; i < stereo.length; i += 4, o += 2) {
    const l = stereo.readInt16LE(i);
    const r = stereo.readInt16LE(i + 2);
    const m = (l + r) / 2;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, m | 0)), o);
  }
  return out;
}

/* ---------------- High-level router: intents/commands/chat ---------------- */
async function routeIntentOrChat(guildId: string, userId: string, stripped: string) {
  // If awaiting a location from "Which city?", treat this utterance as the city name
  const sess = getSession(guildId, userId);
  if (sess && sess.awaiting) {
    const awaiting = sess.awaiting;
    let when: any = "now";
    if (awaiting && typeof awaiting === "object" && (awaiting as any).slot === "location") {
       when = (awaiting as any).hint ?? "now";
    }
    const city = stripped;
    const key = `${guildId}:${userId}`;
    weatherCtx.set(key, { city, ts: Date.now() });
    setAwaiting(guildId, userId, null);
    // Try first-party weather
    try {
      if (getWeatherByName) {
        const r = await getWeatherByName(`${city}${when === "tomorrow" ? " tomorrow" : ""}`);
        if (r && r.where && r.line) {
          const say = `${r.where}: ${r.line}`;
          console.log(`[voice] reply -> ${say}`);
          const pcm = await speakToPcm(say);
          if (pcm) enqueuePcm(guildId, pcm);
          return;
        }
      }
    } catch {}
    // Fallback weather (Open-Meteo)
    try {
      const r = await weatherFallback(city, when as When);
      const say = `${r.where}: ${r.line}`;
      console.log(`[voice] reply -> ${say}`);
      const pcm = await speakToPcm(say);
      if (pcm) enqueuePcm(guildId, pcm);
      return;
    } catch {
      const msg = `I couldn't get weather for **${city}**.`;
      console.log(`[voice] reply -> ${msg}`);
      const pcm = await speakToPcm(msg);
      if (pcm) enqueuePcm(guildId, pcm);
      return;
    }
  }
  const lower = stripped.toLowerCase();

  /* ==== WEATHER (first-party -> fallback) ==== */
  if (/^weather\b/.test(lower) || /(what'?s|what is|how'?s|tell me|give me).*(weather|forecast)/i.test(lower)) {
    const when = extractWhen(lower);
    const loc = extractLocation(stripped);
    const key = `${guildId}:${userId}`;

    const city = loc || weatherCtx.get(key)?.city || null;
    if (!city) {
      const ask = "Which city?";
      console.log(`[voice] reply -> ${ask}`);
      const pcmAsk = await speakToPcm(ask);
      if (pcmAsk) enqueuePcm(guildId, pcmAsk);
      (setAwaiting as any)(guildId, userId, { slot: "location", hint: when });
      return;
    }

    // remember for follow-ups like "tomorrow?"
    weatherCtx.set(key, { city, ts: Date.now() });

    // Try your module first
    try {
      if (getWeatherByName) {
        const r = await getWeatherByName(`${city}${when === "tomorrow" ? " tomorrow" : ""}`);
        if (r && r.where && r.line) {
          const say = `${r.where}: ${r.line}`;
          console.log(`[voice] reply -> ${say}`);
          const pcm = await speakToPcm(say);
          if (pcm) enqueuePcm(guildId, pcm);
          return;
        }
      }
    } catch { /* fall through to Open-Meteo */ }

    // Fallback (no key required)
    try {
      const r = await weatherFallback(city, when);
      const say = `${r.where}: ${r.line}`;
      console.log(`[voice] reply -> ${say}`);
      const pcm = await speakToPcm(say);
      if (pcm) enqueuePcm(guildId, pcm);
      return;
    } catch {
      const msg = `I couldn't get weather for **${city}**.`;
      console.log(`[voice] reply -> ${msg}`);
      const pcm = await speakToPcm(msg);
      if (pcm) enqueuePcm(guildId, pcm);
      return;
    }
  }

  /* ==== COMMANDS (music etc.) ==== */
  const intent = parseVoiceCommand(stripped);
  if (intent.kind !== "none") {
    try {
      switch (intent.kind) {
        case "say": {
          console.log(`[voice] reply -> ${intent.text}`);
          const pcm = await speakToPcm(intent.text);
          if (pcm) enqueuePcm(guildId, pcm);
          return;
        }
        case "beep":
          console.log(`[voice] reply -> [beep]`);
          enqueuePcm(guildId, makeBeep()); 
          return;

        // MUSIC
        case "music_play": {
          const out = await music.playQueryLegacy(guildId, intent.query);
          console.log(`[voice] reply -> Playing ${out.title}`);
          const pcm = await speakToPcm(`Playing ${out.title}`);
          if (pcm) enqueuePcm(guildId, pcm);
          return;
        }
        case "music_pause":
          console.log(`[voice] reply -> Paused.`);
          music.pause(guildId); return;

        case "music_resume":
          console.log(`[voice] reply -> Resumed.`);
          music.resume(guildId); return;

        case "music_skip":
          console.log(`[voice] reply -> Skipped.`);
          music.skip(guildId); return;

        case "music_stop":
          console.log(`[voice] reply -> Stopped and cleared queue.`);
          music.stop(guildId); return;

        case "music_volume":
          console.log(`[voice] reply -> Volume set to ${intent.pct}%`);
          music.setVolume(guildId, intent.pct); return;
      }
    } catch {
      const errMsg = "I couldn't do that.";
      console.log(`[voice] reply -> ${errMsg}`);
      const pcm = await speakToPcm(errMsg);
      if (pcm) enqueuePcm(guildId, pcm);
      return;
    }
  }

  /* ==== CHAT FALLBACK ==== */
  const em = quickEmotionHeuristic(stripped);
  memory.bumpLastSeen(userId);
  memory.updateEmotion(userId, em);

  const sessionChannelId =
    (state.get(guildId)?.textChannelId) ||
    `guild:${guildId}`;

  memory.pushHistory(sessionChannelId, { userId, text: stripped, ts: Date.now(), emotion: em });

  const reply = await generateResponse({
    text: stripped,
    context: {
      user: memory.getOrCreateUser(userId, `user-${userId}`),
      server: memory.getOrCreateServer(guildId),
      session: memory.getOrCreateSession(sessionChannelId),
    },
  });
  console.log(`[voice] reply -> ${reply}`);
  memory.pushAssistant(sessionChannelId, reply);
  const pcm = await speakToPcm(reply);
  if (pcm) enqueuePcm(guildId, pcm);
}

/* ---------- tiny tone for beeps ---------- */
function makeBeep(durationMs = 800, freq = 440, sampleRate = 48000, amp = 0.2): Buffer {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const buf = Buffer.alloc(samples * 2 * 2); // stereo 16-bit
  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amp;
    const val = (Math.max(-1, Math.min(1, sample)) * 32767) | 0;
    buf.writeInt16LE(val, (i * 4) + 0);
    buf.writeInt16LE(val, (i * 4) + 2);
  }
  return buf;
}
