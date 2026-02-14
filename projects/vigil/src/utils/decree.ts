// src/utils/decree.ts
import fs from "fs";
import path from "path";
import crypto from "crypto";

type Decree = {
  version: string;
  seq: number;
  level: "major" | "minor" | "patch";
  autopost?: boolean;
  title: string;
  whats_live?: string[];
  notes?: string[];
  roadmap?: string[];
  patches?: string[];
  cheatsheet?: string[];
  capabilities?: Array<{ area: string; title: string; details: string }>;
  signed_by?: string;
};

const ROOT = process.cwd();
const DECREE_PATH = process.env.DECREE_PATH || path.join(ROOT, "decree.json");
const STATE_DIR = path.join(ROOT, "memory");
const STATE_PATH = path.join(STATE_DIR, "decree.state.json");

function safeReadJSON<T = any>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf8")) as T;
  } catch { return null; }
}
function writeJSON(p: string, obj: any) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf8");
}
function hash(obj: any) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

export function loadDecree(): Decree | null {
  const d = safeReadJSON<Decree>(DECREE_PATH);
  if (!d) return null;
  return d;
}

export function validateDecree(d: Decree): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!d.version || typeof d.version !== "string") errors.push("version missing");
  if (typeof d.seq !== "number") errors.push("seq missing");
  if (!["major", "minor", "patch"].includes(d.level as any)) errors.push("level invalid");
  if (!d.title) errors.push("title missing");
  // keep arrays optional but validate types if present
  const arrKeys: (keyof Decree)[] = [
    "whats_live", "notes", "roadmap", "patches", "cheatsheet"
  ];
  for (const k of arrKeys) {
    const v = d[k] as any;
    if (v && !Array.isArray(v)) errors.push(`${String(k)} must be an array of strings`);
  }
  if (d.capabilities && !Array.isArray(d.capabilities)) errors.push("capabilities must be an array");
  return { ok: errors.length === 0, errors };
}

export function shouldPostDecree(d: Decree): { ok: boolean; reason?: string } {
  const state = safeReadJSON<{ lastHash?: string; lastSeq?: number; lastVersion?: string }>(STATE_PATH) || {};
  const curHash = hash(d);
  // Block when unchanged by hash OR when seq is not incremented
  if (state.lastHash === curHash) return { ok: false, reason: "no-change (hash)" };
  if (typeof state.lastSeq === "number" && d.seq <= state.lastSeq) {
    return { ok: false, reason: "seq not increased" };
  }
  if (state.lastVersion && state.lastVersion === d.version && d.seq === state.lastSeq) {
    return { ok: false, reason: "same version+seq" };
  }
  return { ok: true };
}

export function markPosted(d: Decree) {
  writeJSON(STATE_PATH, { lastHash: hash(d), lastSeq: d.seq, lastVersion: d.version, ts: Date.now() });
}

/** Formats the decree into <=2000 char parts. */
export function formatDecreeParts(d: Decree): string[] {
  const lines: string[] = [];
  lines.push(`${d.title || "Vi — State of the House"}\n`);
  lines.push(`v${d.version} • ${d.level.toUpperCase()} • seq ${d.seq}\n`);

  const pushSection = (hdr: string, arr?: string[]) => {
    if (!arr || !arr.length) return;
    lines.push(`**${hdr}**`);
    for (const item of arr) lines.push(`• ${item}`);
    lines.push(""); // spacer
  };

  pushSection("What’s Live", d.whats_live as string[]);
  pushSection("Notes", d.notes as string[]);
  pushSection("Roadmap", d.roadmap as string[]);
  pushSection("Patches", d.patches as string[]);
  pushSection("Cheat Sheet", d.cheatsheet as string[]);
  if (d.capabilities && d.capabilities.length) {
    lines.push("**Capabilities**");
    for (const c of d.capabilities) lines.push(`• ${c.area}: ${c.title} — ${c.details}`);
    lines.push("");
  }
  if (d.signed_by) lines.push(`Signed by: ${d.signed_by}`);

  // Split into <=2000 parts, tidy joins between sections.
  const out: string[] = [];
  let cur = "";
  const MAX = 2000;
  for (const ln of lines) {
    const next = (cur ? cur + "\n" : "") + ln;
    if (next.length > MAX) {
      if (cur) out.push(cur);
      if (ln.length > MAX) {
        // fallback: hard-chunk a long single line
        let s = ln;
        while (s.length > MAX) {
          out.push(s.slice(0, MAX));
          s = s.slice(MAX);
        }
        cur = s;
      } else {
        cur = ln;
      }
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);

  // Add "Part X/Y" header to each part for clarity.
  if (out.length > 1) {
    return out.map((chunk, i) => `__Part ${i + 1}/${out.length}__\n${chunk}`);
  }
  return out;
}
