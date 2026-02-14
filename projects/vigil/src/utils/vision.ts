// src/utils/vision.ts

/* =========================== ENV =========================== */
const GV_ENABLED = (process.env.GOOGLE_VISION_ENABLED ?? "1") !== "0";
const GV_KEY = process.env.GOOGLE_API_KEY || "";

const GV_TIMEOUT_MS = Math.max(2000, Number(process.env.VISION_TIMEOUT_MS ?? "8000"));
const GV_RETRIES = Math.max(0, Number(process.env.VISION_RETRIES ?? "2"));
const GV_MAX_PER_MSG = Math.max(1, Number(process.env.VISION_MAX_IMAGES_PER_MESSAGE ?? "3"));
const GV_LANG_HINTS = (process.env.VISION_LANG_HINTS ?? "en")
  .split(",").map(s => s.trim()).filter(Boolean);

const MAX_BYTES = Math.max(100_000, Number(process.env.AUTOMOD_OCR_MAX_BYTES ?? "5000000"));

const CAPTION_ENABLED = (process.env.VISION_CAPTION_ENABLED ?? "1") !== "0";
const CAPTION_MODEL = process.env.VISION_CAPTION_MODEL || "gpt-4o-mini";
const CAPTION_MAX = Math.max(1, Number(process.env.VISION_CAPTION_MAX_IMAGES ?? "2"));
const CAPTION_TIMEOUT_MS = Math.max(2000, Number(process.env.VISION_CAPTION_TIMEOUT_MS ?? "12000"));
const CAPTION_RETRIES = Math.max(0, Number(process.env.VISION_CAPTION_RETRIES ?? "2"));
const CAPTION_PROMPT =
  process.env.VISION_CAPTION_PROMPT ||
  "Describe the image briefly. Avoid guessing text or hallucinating specifics. Tone: neutral, helpful.";

const OPENAI_KEY = process.env.OPENAI_API_KEY || "";

/* ======================= Rate Limiter ====================== */
/** Very small per-guild token bucket. Shared by OCR and Captions. */
const TOKENS_PER_5S = Math.max(1, Number(process.env.VISION_TOKENS_PER_5S ?? "4"));
const BUCKET_WINDOW = Math.max(1000, Number(process.env.VISION_BUCKET_WINDOW_MS ?? "5000"));
type Bucket = { tokens: number; last: number };
const buckets = new Map<string, Bucket>();

export function takeVisionToken(guildId: string): boolean {
  const now = Date.now();
  const b = buckets.get(guildId) ?? { tokens: TOKENS_PER_5S, last: now };
  // refill
  const elapsed = now - b.last;
  if (elapsed >= BUCKET_WINDOW) {
    const slots = Math.floor(elapsed / BUCKET_WINDOW);
    b.tokens = Math.min(TOKENS_PER_5S, b.tokens + slots * TOKENS_PER_5S);
    b.last = now;
  }
  if (b.tokens <= 0) { buckets.set(guildId, b); return false; }
  b.tokens -= 1;
  buckets.set(guildId, b);
  return true;
}

/* ======================== Helpers ========================== */
function looksImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|tiff?)($|\?)/i.test(url) || /\/attachments\//i.test(url);
}
function normalizeUrl(u: string) {
  try {
    const url = new URL(u);
    url.protocol = "https:"; // normalize
    // Discord CDN without extension → request raster
    if (/cdn\.discordapp\.com/i.test(url.hostname) && !/\.(png|jpe?g|gif|webp|bmp|tiff?)$/i.test(url.pathname)) {
      url.searchParams.set("format", "png");
    }
    return url.toString();
  } catch { return u; }
}
function controllerWithTimeout(ms: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(t) };
}
async function safeHead(url: string): Promise<number> {
  try {
    const { signal, cancel } = controllerWithTimeout(3000);
    const res = await fetch(url, { method: "HEAD", signal });
    cancel();
    const len = res.headers.get("content-length");
    return len ? Number(len) : 0;
  } catch { return 0; }
}

/* ====================== Google Vision ====================== */
type AnnotateRequest = {
  image: { source: { imageUri: string } };
  features: Array<{ type: "TEXT_DETECTION" | "DOCUMENT_TEXT_DETECTION" }>;
  imageContext?: { languageHints?: string[] };
};
const GV_BATCH = 16;

async function gvPost(payload: { requests: AnnotateRequest[] }): Promise<any | null> {
  if (!GV_ENABLED || !GV_KEY) return null;
  const uri = `https://vision.googleapis.com/v1/images:annotate?key=${GV_KEY}`;

  for (let attempt = 0; attempt <= GV_RETRIES; attempt++) {
    const { signal, cancel } = controllerWithTimeout(GV_TIMEOUT_MS);
    try {
      const res: Response = await fetch(uri, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      cancel();
      if (!res.ok) {
        if (res.status === 429 || res.status >= 500) { // retryable
          await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
          continue;
        }
        return null;
      }
      return await res.json();
    } catch {
      // retry on abort/network until last try
      if (attempt === GV_RETRIES) return null;
      await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  return null;
}

/** Extract candidate URLs from a Discord message-like object. */
export function extractImageUrlsFromMessage(msg: {
  attachments: Map<string, { url: string; contentType?: string }>;
  embeds?: Array<{ image?: { url?: string }, thumbnail?: { url?: string } }>;
  stickers?: Array<{ formatType?: number, name?: string }>;
  reference?: { messageId?: string };
}): string[] {
  const urls: string[] = [];

  for (const a of msg.attachments.values()) {
    const ct = a.contentType ?? "";
    if (ct.startsWith("image/") || looksImageUrl(a.url)) urls.push(a.url);
  }
  for (const e of (msg.embeds ?? [])) {
    const u = e.image?.url || e.thumbnail?.url;
    if (u && looksImageUrl(u)) urls.push(u);
  }
  // stickers: Discord doesn’t give easy OCR targets — skip

  return urls;
}

/** Batch OCR. Returns array length equal to original `urls.length`. */
export async function ocrFromMany(urls: string[], guildId?: string): Promise<(string | null)[]> {
  if (!GV_ENABLED || !GV_KEY || urls.length === 0) return urls.map(() => null);

  // Per-guild token (rate limit)
  if (guildId && !takeVisionToken(guildId)) return urls.map(() => null);

  const out: (string | null)[] = new Array(urls.length).fill(null);
  const capped = urls.slice(0, GV_MAX_PER_MSG).map(normalizeUrl);

  // Size pre-check
  const usable: string[] = [];
  const indexMap: number[] = [];
  for (let i = 0; i < capped.length; i++) {
    const u = capped[i];
    const len = await safeHead(u);
    if (!len || len <= MAX_BYTES) { usable.push(u); indexMap.push(i); }
  }
  if (!usable.length) return out;

  const mkReq = (imageUri: string): AnnotateRequest => ({
    image: { source: { imageUri } },
    features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
    imageContext: GV_LANG_HINTS.length ? { languageHints: GV_LANG_HINTS } : undefined,
  });

  for (let i = 0; i < usable.length; i += GV_BATCH) {
    const group = usable.slice(i, i + GV_BATCH);
    const resp = await gvPost({ requests: group.map(mkReq) });
    if (!resp?.responses) continue;

    for (let j = 0; j < group.length; j++) {
      const targetIdxWithinCapped = indexMap[i + j];
      const targetIdx = targetIdxWithinCapped; // position within `capped`
      const globalIdx = targetIdx;             // same offset within original because we capped by slice(0, N)
      const r = resp.responses[j];
      const text = r?.fullTextAnnotation?.text || r?.textAnnotations?.[0]?.description || null;
      out[globalIdx] = (typeof text === "string" && text.trim()) ? text.trim() : null;
    }
  }

  return out;
}

/* ======================= Captioning ======================== */
/** Minimal OpenAI Vision call for short captions (with retries & timeouts).
 * Returns array length equal to original `urls.length`.
 */
export async function captionsForMany(urls: string[], guildId?: string): Promise<(string | null)[]> {
  if (!CAPTION_ENABLED || !OPENAI_KEY || urls.length === 0) return urls.map(() => null);

  // Per-guild rate limit
  if (guildId && !takeVisionToken(guildId)) return urls.map(() => null);

  const out: (string | null)[] = new Array(urls.length).fill(null);
  const capped = urls.slice(0, CAPTION_MAX).map(normalizeUrl);

  for (let i = 0; i < capped.length; i++) {
    const u = capped[i];

    for (let attempt = 0; attempt <= CAPTION_RETRIES; attempt++) {
      const { signal, cancel } = controllerWithTimeout(CAPTION_TIMEOUT_MS);
      try {
        const body = {
          model: CAPTION_MODEL,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: CAPTION_PROMPT },
              { type: "image_url", image_url: { url: u } },
            ],
          }],
          max_tokens: 150,
        };

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${OPENAI_KEY}`,
          },
          body: JSON.stringify(body),
          signal,
        });
        cancel();

        if (!res.ok) {
          // retry on 429/5xx
          if (res.status === 429 || res.status >= 500) {
            await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
            continue;
          }
          out[i] = null;
          break;
        }

        const json: any = await res.json();
        const txt = json?.choices?.[0]?.message?.content ?? "";
        out[i] = (typeof txt === "string" && txt.trim()) ? txt.trim() : null;
        break; // success
      } catch {
        if (attempt === CAPTION_RETRIES) {
          out[i] = null;
        } else {
          await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
        }
      }
    }
  }

  return out;
}
