// src/voice/intents.ts
export function detectWeatherIntent(text: string) {
  const t = text.toLowerCase();
  if (/(what'?s|hows?|tell me).*weather/.test(t) || /^weather\b/.test(t)) return true;
  return false;
}

export function extractLocation(text: string): string | null {
  // crude: "in X", or whole utterance if it looks like a place (two words, capitalized from STT often lost)
  const m = /\b(?:in|for|at)\s+([a-z][\w\s,.'-]{2,})$/i.exec(text);
  if (m) return m[1].trim();
  // If user just says the place as a follow-up ("Enid Oklahoma")
  if (/^[a-z][\w\s,.'-]+$/i.test(text) && text.trim().length <= 60) return text.trim();
  return null;
}
