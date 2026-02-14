// src/modules/ttsElevenLabs.ts
import { CONFIG } from "../config";
import { spawn } from "node:child_process";
import { FFMPEG_PATH } from "../boot/ffmpeg";
import { Readable } from "node:stream";

const cache = new Map<string, Buffer>();

async function fetchMp3FromElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const headers: Record<string, string> = {
    "xi-api-key": CONFIG.ELEVENLABS_API_KEY,
    "Content-Type": "application/json",
    "Accept": "audio/mpeg",
  };
  const body = JSON.stringify({
    text,
    // model_id: "eleven_multilingual_v2", // optional
    optimize_streaming_latency: 0,
  });

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${msg}`);
  }
  const arr = new Uint8Array(await res.arrayBuffer());
  return Buffer.from(arr);
}

/**
 * Decode MP3 → raw PCM s16le, 48kHz, stereo (Discord-compatible).
 */
function ffmpegDecodeMp3ToPcm48kStereo(mp3Buffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG_PATH) return reject(new Error("FFMPEG_PATH not set"));

    const ff = spawn(FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "error",
      // INPUT: infer format from stream
      "-i", "pipe:0",
      // OUTPUT: raw PCM s16le @ 48k stereo to stdout
      "-f", "s16le", "-ar", "48000", "-ac", "2",
      "pipe:1",
    ]);

    const chunks: Buffer[] = [];

    ff.stdout.on("data", (d) => chunks.push(Buffer.from(d)));
    ff.stderr.on("data", () => { /* keep quiet; flip to console.error(d.toString()) if needed */ });
    ff.on("error", reject);
    ff.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });

    // Avoid EPIPE noise if ffmpeg dies early
    ff.stdin.on("error", () => {});
    Readable.from(mp3Buffer).pipe(ff.stdin);
  });
}

export async function synthesizeSpeechPCM(text: string, voiceId?: string): Promise<Buffer | null> {
  const key = `${voiceId || CONFIG.ELEVENLABS_VOICE_ID}|${text}`;
  if (cache.has(key)) return cache.get(key)!;

  let attempt = 0;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    try {
      const mp3 = await fetchMp3FromElevenLabs(text, voiceId || CONFIG.ELEVENLABS_VOICE_ID);
      const pcmStereo = await ffmpegDecodeMp3ToPcm48kStereo(mp3);
      cache.set(key, pcmStereo);
      return pcmStereo;
    } catch (e) {
      attempt++;
      const delay = 300 * attempt;
      console.warn(`TTS attempt ${attempt} failed: ${(e as Error).message}. Retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  console.error("TTS failed after retries");
  return null;
}
