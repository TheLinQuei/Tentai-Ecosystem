// src/modules/stt.ts
import { SpeechClient } from "@google-cloud/speech";
import OpenAI from "openai";
import { CONFIG } from "../config";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

const gclient = new SpeechClient(); // Requires GOOGLE_APPLICATION_CREDENTIALS
const openai = new OpenAI({ apiKey: CONFIG.OPENAI_API_KEY });

function cleanTranscript(t: string): string {
  return (t || "").replace(/\s+/g, " ").trim();
}

function normalizePcm16(pcm: Buffer, targetPeak = 0.92): Buffer {
  let max = 1;
  for (let i = 0; i < pcm.length; i += 2) {
    const s = pcm.readInt16LE(i);
    const a = Math.abs(s);
    if (a > max) max = a;
  }
  const gain = Math.min((targetPeak * 32767) / max, 5);
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i += 2) {
    let s = Math.round(pcm.readInt16LE(i) * gain);
    if (s > 32767) s = 32767;
    if (s < -32768) s = -32768;
    out.writeInt16LE(s, i);
  }
  return out;
}

async function writeTmpWavFromPCM(pcmMono48k: Buffer): Promise<string> {
  const numChannels = 1;
  const sampleRate = 48000;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmMono48k.length;
  const wavSize = 44 + dataSize;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(wavSize - 8, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  const tmp = path.join(tmpdir(), `stt_${Date.now()}.wav`);
  await fs.writeFile(tmp, Buffer.concat([header, pcmMono48k]));
  return tmp;
}

/* ---------------- Google STT (primary) ---------------- */

async function sttGoogle(pcmMono48k: Buffer): Promise<string | null> {
  try {
    const boosted = normalizePcm16(pcmMono48k);
    const [resp] = await gclient.recognize({
      audio: { content: boosted.toString("base64") },
      config: {
        encoding: "LINEAR16",
        sampleRateHertz: 48000,
        languageCode: "en-US",
        enableAutomaticPunctuation: true,
        model: "latest_long",
        speechContexts: [
          { phrases: ["vi", "vee", "vie", "hey vi", "ok vi", "okay vi"], boost: 20.0 },
          { phrases: ["play", "pause", "stop", "skip", "resume", "weather", "forecast", "volume"], boost: 8.0 },
        ],
      } as any,
    });
    const text = (resp.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript?.trim())
      .filter(Boolean)
      .join(" ")
      .trim();
    return text || null;
  } catch (err) {
    console.warn("[stt] Google failed:", (err as Error).message);
    return null;
  }
}

/* ---------------- Whisper (fallback) ---------------- */

async function sttWhisper(pcmMono48k: Buffer): Promise<string | null> {
  try {
    const wavPath = await writeTmpWavFromPCM(pcmMono48k);
    const file = createReadStream(wavPath);
    const tr: any = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      response_format: "verbose_json",
      temperature: 0,
      language: "en",
      prompt: "Wake word is 'Vi' (vee). Commands include play, pause, stop, skip, weather, forecast, volume.",
    } as any);
    await fs.unlink(wavPath).catch(() => {});
    const text = tr?.text?.trim() || "";
    return text || null;
  } catch (err) {
    console.warn("[stt] Whisper failed:", (err as Error).message);
    return null;
  }
}

/**
 * Public STT entry: give me PCM mono 48kHz, get back clean text (or null)
 */
export async function transcribePcm48kMono(pcmMono48k: Buffer): Promise<string | null> {
  const g = await sttGoogle(pcmMono48k);
  if (g) return cleanTranscript(g);

  const w = await sttWhisper(pcmMono48k);
  if (w) return cleanTranscript(w);

  return null;
}
