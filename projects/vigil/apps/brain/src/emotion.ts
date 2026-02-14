import { z } from 'zod';
import { prepareLog } from './utils/logContract.js';

export const Emotion = z.enum([
  'neutral',
  'curious',
  'calm',
  'confident',
  'humble',
  'playful',
  'serious',
  'empathetic',
]);
export type Emotion = z.infer<typeof Emotion>;

let current: Emotion = 'neutral';

/* ---------- State ---------- */
export function getEmotion(): Emotion {
  return current;
}

export function setEmotion(e: Emotion) {
  current = e;
  const log = (globalThis as any).__brainLogger;
  if (log) {
    log.debug(prepareLog('Emotion', {
      emotion: current,
      message: `💠 Emotion → ${current}`
    }));
  }
}

/* ---------- Bias prompt ---------- */
export function injectEmotion(prompt: string): string {
  const tone = {
    calm: 'Speak gently and reassuringly.',
    curious: 'Ask thoughtful follow-ups.',
    confident: 'Use decisive and direct language.',
    humble: 'Use modest phrasing.',
    playful: 'Add light humor or warmth.',
    serious: 'Be concise and factual.',
    empathetic: 'Express understanding and care.',
    neutral: '',
  }[current];
  return `${tone}\n${prompt}`;
}
