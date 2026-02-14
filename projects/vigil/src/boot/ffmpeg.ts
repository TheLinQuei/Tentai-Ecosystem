// src/boot/ffmpeg.ts
import fs from "node:fs";
import path from "node:path";

let resolved = process.env.FFMPEG_PATH || "ffmpeg";

// Prefer ffmpeg-static only if the file actually exists, else stick to system
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const maybe = require("ffmpeg-static") as string | undefined;
  if (maybe && fs.existsSync(maybe)) resolved = maybe;
} catch { /* ignore */ }

// Export + env for libs like prism-media / play-dl
process.env.FFMPEG_PATH = resolved;

// Also push the folder onto PATH for libs (e.g., fluent-ffmpeg) that only look at PATH
if (resolved && resolved !== "ffmpeg" && fs.existsSync(resolved)) {
  const dir = path.dirname(resolved);
  process.env.PATH = `${dir}${path.delimiter}${process.env.PATH ?? ""}`;
  // If fluent-ffmpeg is installed, point it explicitly
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ff = require("fluent-ffmpeg");
    ff.setFfmpegPath(resolved);
  } catch {}
}

console.log("[voice] ffmpeg path ->", resolved);
export const FFMPEG_PATH = resolved;
