// src/modules/tts.ts
import { synthesizeSpeechPCM } from "./ttsElevenLabs";

export async function speakToPcm(text: string, voiceId?: string): Promise<Buffer | null> {
  return synthesizeSpeechPCM(text, voiceId);
}
