// src/features/diagnostics.ts
// Vi Diagnostics + Decree Announcer + JSON Source of Truth + Auto Versioning + Capabilities Registry

import type { Client, TextChannel } from "discord.js";
import {
  ChannelType,
  SlashCommandBuilder,
  PermissionFlagsBits as P,
  EmbedBuilder,
} from "discord.js";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import crypto from "crypto";
import path from "path";
import { MessageFlags } from "discord.js";

// ===== CONFIG =====
const DECREE_CHANNEL_ID = process.env.DECREE_CHANNEL_ID ?? "1409730902510272594"; // 📢・decrees
const HEALTH_PERIOD_MIN = Number(process.env.DIAG_HEALTH_PERIOD_MIN ?? "60");

// IMPORTANT: when decree.json exists, we will NOT fallback-post legacy, even on boot.
// You can still force post via /decree post.
const FORCE_ANNOUNCE_ON_BOOT = String(process.env.DIAG_FORCE_BOOT ?? "true").toLowerCase() !== "false";
const AUTOBUMP = String(process.env.DIAG_AUTOBUMP ?? "true").toLowerCase() !== "false"; // only used when JSON path doesn't trigger & file not present

// Files
const STATE_DIR = path.resolve("memory");
const STATE_FILE = path.join(STATE_DIR, "diagnostics.state.json");
const CAP_FILE = path.join(STATE_DIR, "capabilities.json");
const DECREE_JSON_PATH = path.join(STATE_DIR, "decree.json");

// ===== TYPES =====
type DiagResult = { name: string; ok: boolean; note?: string };
type TestFn = (client: Client) => Promise<DiagResult> | DiagResult;
type Capability = { area: string; title: string; details?: string };
type Bump = "none" | "patch" | "minor" | "major";

type State = {
  lastVersion?: string;
  lastCommit?: string;
  bootAnnounced?: boolean;

  // JSON guard
  lastDecreeHash?: string;
  lastDecreeSeq?: number;

  // (kept for backward compat if you ever re-enable manual overrides)
  versionOverride?: string;
  notesOverride?: string;
};

type DecreeJson = {
  version: string;
  seq: number;                          // must increase to allow auto post
  level?: "major" | "minor" | "patch" | "hotfix" | "info";
  autopost?: boolean;                   // default true
  title?: string;                       // optional header override
  whats_live?: string[];
  notes?: string[];
  roadmap?: string[];
  patches?: string[];
  cheatsheet?: string[];
  capabilities?: { area: string; title: string; details?: string }[];
  signed_by?: string;
};

// ===== REGISTRIES =====
const testRegistry: TestFn[] = [];
const capabilities: Capability[] = []; // in-memory; persisted to CAP_FILE on announce
export function registerDiagnosticTest(fn: TestFn) { testRegistry.push(fn); }
export function registerCapability(cap: Capability) {
  if (!cap.area || !cap.title) return;
  capabilities.push(cap);
}

// ===== UTIL =====
function ensureDir() { if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true }); }
function getPkg(): any { try { return JSON.parse(readFileSync("package.json", "utf8")); } catch { return {}; } }
function writePkg(pkg: any) { try { writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n", "utf8"); } catch {} }
function getVersion(): string { return String(getPkg().version ?? "0.0.0"); }
function setVersion(v: string) { const pkg = getPkg(); pkg.version = v; writePkg(pkg); }
function getCommit(): string { try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "nogit"; } }
function loadState(): State { try { ensureDir(); if (!existsSync(STATE_FILE)) return {}; return JSON.parse(readFileSync(STATE_FILE, "utf8")) as State; } catch { return {}; } }
function saveState(s: State) { try { ensureDir(); writeFileSync(STATE_FILE, JSON.stringify(s, null, 2), "utf8"); } catch {} }
function saveCapabilities() {
  try {
    ensureDir();
    const payload = { updatedAt: new Date().toISOString(), capabilities };
    writeFileSync(CAP_FILE, JSON.stringify(payload, null, 2), "utf8");
  } catch {}
}

async function resolveDecree(client: Client): Promise<TextChannel | null> {
  if (DECREE_CHANNEL_ID) {
    try {
      const ch = await client.channels.fetch(DECREE_CHANNEL_ID);
      if (ch && ch.type === ChannelType.GuildText) return ch;
    } catch {}
  }
  for (const [, g] of client.guilds.cache) {
    const found = g.channels.cache.find(
      c => c.type === ChannelType.GuildText && c.name.toLowerCase().includes("decree")
    );
    if (found) return found as TextChannel;
  }
  console.error("[diagnostics] Cannot resolve 📢・decrees. Set DECREE_CHANNEL_ID.");
  return null;
}

// ===== Auto versioning from commit messages (fallback path) =====
function semverBump(v: string, b: Bump): string {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/) || [null, "0", "0", "0"];
  const [, M, mnr, p] = m as any;
  let major = +M, minor = +mnr, patch = +p;
  if (b === "major") { major += 1; minor = 0; patch = 0; }
  else if (b === "minor") { minor += 1; patch = 0; }
  else if (b === "patch") { patch += 1; }
  return `${major}.${minor}.${patch}`;
}
function bumpLevelFromCommits(sinceCommit?: string) {
  try {
    const range = sinceCommit && sinceCommit !== "nogit" ? `${sinceCommit}..HEAD` : "HEAD~10..HEAD";
    const raw = execSync(`git log ${range} --pretty=format:%H%n%s%n%b%n---cut---`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    if (!raw.trim()) return { bump: "none" as Bump, notes: "" };
    const entries = raw.split("---cut---").map(s => s.trim()).filter(Boolean);
    let bump: Bump = "none";
    const lines: string[] = [];
    const order = (x: Bump) => (x === "none" ? 0 : x === "patch" ? 1 : x === "minor" ? 2 : 3);
    for (const e of entries) {
      const [first, ...rest] = e.split("\n");
      const subj = first ?? "";
      const body = rest.join("\n");
      const subjLower = subj.toLowerCase();
      let level: Bump = "none";
      if (subjLower.startsWith("feat!")) level = "major";
      else if (body.includes("BREAKING CHANGE")) level = "major";
      else if (subjLower.startsWith("feat")) level = "minor";
      else if (/^(fix|perf|refactor|build|chore|ci|docs)/.test(subjLower)) level = "patch";
      if (order(level) > order(bump)) bump = level;
      lines.push(`- ${subj}`);
    }
    return { bump, notes: lines.join("\n") };
  } catch { return { bump: "none" as Bump, notes: "" }; }
}

// ===== JSON decree helpers =====
function stableStringify(obj: any) { return JSON.stringify(obj, Object.keys(obj).sort(), 2); }
function sha(data: string) { return crypto.createHash("sha256").update(data).digest("hex"); }

function loadDecreeJson(): { data?: DecreeJson; hash?: string; error?: string } {
  try {
    if (!existsSync(DECREE_JSON_PATH)) return {};
    const raw = readFileSync(DECREE_JSON_PATH, "utf8");
    const json = JSON.parse(raw) as DecreeJson;

    if (!json.version || typeof json.seq !== "number") {
      return { error: "decree.json missing required fields: version (string) and seq (number)" };
    }

    const canon = stableStringify({
      version: json.version,
      seq: json.seq,
      level: json.level ?? "info",
      autopost: json.autopost ?? true,
      title: json.title ?? "",
      whats_live: json.whats_live ?? [],
      notes: json.notes ?? [],
      roadmap: json.roadmap ?? [],
      patches: json.patches ?? [],
      cheatsheet: json.cheatsheet ?? [],
      capabilities: json.capabilities ?? [],
      signed_by: json.signed_by ?? ""
    });

    return { data: json, hash: sha(canon) };
  } catch (e: any) {
    return { error: `decree.json parse error: ${e?.message}` };
  }
}

/** Build JSON-driven decree body (can exceed 2k; we'll split on send). */
function buildDecreeFromJson(j: DecreeJson, commit: string) {
  const header = j.title || `⚙️ ViBot — State of the House (${j.version})`;
  const intro = `\n\nShe’s awake — and doing actual work. Here’s the pulse:`;

  const live = j.whats_live?.length
    ? `\n\n🧩 What’s Live in ${j.version}\n- ${j.whats_live.join("\n- ")}`
    : "";

  const notes = j.notes?.length
    ? `\n\n🔧 ${j.version} — ${(j.level || "current").toUpperCase()}\n- ${j.notes.join("\n- ")}`
    : `\n\n🔧 ${j.version} — Current Build\nInternal improvements and stability fixes.`;

  const roadmap = j.roadmap?.length
    ? `\n\n🛠️ Roadmap — Next Big Update\n- ${j.roadmap.join("\n- ")}`
    : "";

  const patches = j.patches?.length
    ? `\n\n🩹 Small Patches in the Pipe\n- ${j.patches.join("\n- ")}`
    : "";

  const cheats = j.cheatsheet?.length
    ? `\n\n📜 How to Use (cheat sheet)\n${j.cheatsheet.join("\n")}`
    : "";

  const caps = Array.isArray(j.capabilities) && j.capabilities.length
    ? `\n\n🧰 Capabilities\n${j.capabilities.map(c => `- ${c.area}: ${c.title}${c.details ? ` — ${c.details}` : ""}`).join("\n")}`
    : "";

  const footer = `\n\n@🛠️ Patch Notes\n${new Date().toLocaleString()} • ${j.version} ${commit}`;

  return `${header}${intro}${live}${notes}${roadmap}${patches}${cheats}${caps}${footer}`;
}

// Legacy formatter (fallback)
function buildLegacyDecree(version: string, commit: string, diagLine: string, failures: DiagResult[], notes: string, label: "update" | "boot" | "failure") {
  const now = new Date();
  const header = `⚙️ ViBot — State of the House (${version})\n\nShe’s ${label === "update" ? "evolved" : label === "boot" ? "awake" : "throwing flags"} — and doing actual work. Here’s the pulse:\n`;
  const live = `🧩 What’s Live in ${version}\n${diagLine}\n${failures.length ? `${failures.length} failing check(s)` : `All core checks pass`}\n`;
  const change = `\n🔧 ${version} — ${label === "update" ? "Dropping Now" : "Current Build"}\n${notes || "Internal improvements and stability fixes."}\n`;
  const roadmap = `\n🛠️ Roadmap — Next Big Update\nQuests & Seasons • Economy 2.0 • Profile cards (/rank)\n`;
  const patches = `\n🩹 Small Patches in the Pipe\nFine-tuned XP, better ephemeral copies, extra guards on relaxed channels\n`;
  const fails = failures.length ? `\n**Failing Checks**\n${failures.map(f => `• ${f.name}: ${f.note ?? "fail"}`).join("\n")}\n` : "";
  const footer = `\n@🛠️ Patch Notes\n${now.toLocaleString()} • ${version} ${commit}\n`;
  return [header, live, change, roadmap, patches, fails, footer].join("");
}

// ===== DIAGNOSTICS =====
async function runTests(client: Client): Promise<DiagResult[]> {
  const tests: TestFn[] = [
    () => ({ name: "guilds.visible", ok: client.guilds.cache.size > 0, note: `${client.guilds.cache.size} guild(s)` }),
    async () => {
      const ch = await resolveDecree(client);
      return { name: "decree.resolve", ok: !!ch, note: ch ? `#${ch.name}` : "not found" };
    },
    async () => {
      const ch = await resolveDecree(client);
      if (!ch) return { name: "decree.perms", ok: false, note: "no channel" };
      const me = await ch.guild.members.fetchMe().catch(() => null);
      const ok = !!me && ch.permissionsFor(me)?.has("SendMessages");
      return { name: "decree.perms", ok, note: ok ? "ok" : "missing SendMessages" };
    },
    () => {
      const keys = ["DISCORD_TOKEN"];
      const missing = keys.filter(k => !process.env[k]);
      return { name: "env.core", ok: missing.length === 0, note: missing.length ? `missing: ${missing.join(", ")}` : "ok" };
    },
  ];
  const all = [...tests, ...testRegistry];
  const out: DiagResult[] = [];
  for (const t of all) {
    try { out.push(await Promise.resolve(t(client))); }
    catch (e: any) { out.push({ name: t.name || "anonymous-test", ok: false, note: e?.message ?? "error" }); }
  }
  return out;
}

function summarize(results: DiagResult[]) {
  const passed = results.filter(r => r.ok).length;
  const total = results.length;
  const failures = results.filter(r => !r.ok);
  return {
    line: `Diagnostics: ${passed}/${total} passed`,
    failures
  };
}

/** Split into <=2000 character chunks on newlines where possible. */
function splitIntoParts(content: string, max = 2000): string[] {
  const lines = content.split("\n");
  const parts: string[] = [];
  let cur = "";
  for (const ln of lines) {
    const next = (cur ? cur + "\n" : "") + ln;
    if (next.length > max) {
      if (cur) parts.push(cur);
      if (ln.length > max) {
        // hard chunk
        let s = ln;
        while (s.length > max) {
          parts.push(s.slice(0, max));
          s = s.slice(max);
        }
        cur = s;
      } else {
        cur = ln;
      }
    } else {
      cur = next;
    }
  }
  if (cur) parts.push(cur);
  if (parts.length > 1) {
    return parts.map((p, i) => `__Part ${i + 1}/${parts.length}__\n${p}`);
  }
  return parts;
}

async function postDecree(client: Client, content: string) {
  const ch = await resolveDecree(client);
  if (!ch) return;
  const parts = splitIntoParts(content, 2000);
  for (const p of parts) {
    await ch.send({ content: p }).catch(e => console.error("[diagnostics] decree send failed:", e?.message));
  }
}

// ===== PUBLIC ORCHESTRATOR =====
export async function initDiagnostics(client: Client) {
  ensureDir();
  const state = loadState();
  const currentCommit = getCommit();

  // ---------- JSON decree path (authoritative) ----------
  const j = loadDecreeJson();
  if (j.error) console.warn("[diagnostics] " + j.error);

  if (j.data) {
    // Seed /capabilities from JSON (non-destructive)
    if (Array.isArray(j.data.capabilities)) {
      for (const cap of j.data.capabilities) registerCapability(cap as any);
      saveCapabilities();
    }

    const shouldAutoPost = j.data.autopost ?? true;
    const seqOk = (state.lastDecreeSeq ?? 0) < j.data.seq;
    const hashChanged = (state.lastDecreeHash ?? "") !== j.hash;

    if (shouldAutoPost && seqOk && hashChanged) {
      const body = buildDecreeFromJson(j.data, currentCommit);
      await postDecree(client, body);
      saveState({
        ...state,
        lastVersion: j.data.version,
        lastCommit: currentCommit,
        lastDecreeHash: j.hash,
        lastDecreeSeq: j.data.seq,
        bootAnnounced: true,
      });
      // JSON posted: stop here to avoid duplicate legacy post
      return;
    }

    // ⛔ If decree.json exists but isn't updated / allowed, DO NOT post anything on boot.
    // No legacy fallback; obey JSON source-of-truth.
    console.log("[diagnostics] decree.json present; no post (guard prevented or unchanged).");
    saveCapabilities(); // still persist any registered caps snapshot
    return;
  }

  // ---------- Fallback path ONLY when decree.json is missing ----------
  const currentVersion = getVersion();
  let effectiveVersion = currentVersion;
  let notes = "";

  if (AUTOBUMP && currentCommit !== "nogit") {
    const { bump, notes: n } = bumpLevelFromCommits(state.lastCommit);
    notes = n;
    if (bump !== "none") {
      const bumped = semverBump(currentVersion, bump);
      setVersion(bumped);
      effectiveVersion = bumped;
    }
  }

  // Diagnostics sweep
  const results = await runTests(client);
  const { line: diagLine, failures } = summarize(results);

  // Persist capabilities (from registerCapability calls elsewhere)
  saveCapabilities();

  // Decide announce reason
  const changed = state.lastVersion !== effectiveVersion || state.lastCommit !== currentCommit;
  const reason: "update" | "boot" | "failure" = changed ? "update" : (failures.length ? "failure" : "boot");

  if (FORCE_ANNOUNCE_ON_BOOT || changed || failures.length) {
    const body = buildLegacyDecree(effectiveVersion, currentCommit, diagLine, failures, notes, reason);
    await postDecree(client, body);
  }

  saveState({ ...state, lastVersion: effectiveVersion, lastCommit: currentCommit, bootAnnounced: true });
  
  // Periodic sweeps (post only on failures)
  const periodMs = Math.max(1, HEALTH_PERIOD_MIN) * 60 * 1000;
  setInterval(async () => {
    const r = await runTests(client);
    const { line, failures: f } = summarize(r);
    if (f.length) {
      const body = buildLegacyDecree(getVersion(), getCommit(), line, f, "", "failure");
      await postDecree(client, body);
    }
  }, periodMs).unref();
}

// ===== Slash: /diag — run tests and post legacy-style =====
export const diagSlash = {
  data: new SlashCommandBuilder()
    .setName("diag")
    .setDescription("Run diagnostics + (re)announce in 📢・decrees (legacy format)")
    .setDefaultMemberPermissions(P.Administrator),
  async execute(i: any) {
    const client = i.client as Client;
    const r = await runTests(client);
    const { line, failures } = summarize(r);
    const body = buildLegacyDecree(getVersion(), getCommit(), line, failures, "", failures.length ? "failure" : "boot");
    await postDecree(client, body);
    await i.reply({ content: "Posted to 📢・decrees (legacy).", flags: MessageFlags.Ephemeral }).catch(() => void 0);
  }
};

// ===== Slash: /decree — control JSON-driven decrees =====
export const decreeSlash = {
  data: new SlashCommandBuilder()
    .setName("decree")
    .setDescription("Admin: control JSON decrees")
    .setDefaultMemberPermissions(P.Administrator)
    .addSubcommand(sc => sc.setName("status").setDescription("Show decree.json status (seq/hash/flags)"))
    .addSubcommand(sc => sc.setName("preview").setDescription("Preview decree.json (ephemeral)"))
    .addSubcommand(sc => sc.setName("reload").setDescription("Reload decree.json and post if seq/hash changed & autopost=true"))
    .addSubcommand(sc => sc.setName("post").setDescription("Force-post decree.json now (ignores seq/hash/autopost)")),
  async execute(i: any) {
    const sub = i.options.getSubcommand();
    const { data, hash, error } = loadDecreeJson();

    if (sub === "status") {
      const st = loadState();
      const lines = [
        error ? `decree.json error: ${error}` : [
          `version: **${data?.version ?? "—"}**`,
          `seq: **${data?.seq ?? "—"}**`,
          `autopost: **${String(data?.autopost ?? true)}**`,
          `hash: \`${hash ?? "—"}\``,
        ].join("  "),
        `lastDecreeSeq: **${st.lastDecreeSeq ?? 0}**`,
        `lastDecreeHash: \`${st.lastDecreeHash ?? "-"}\``,
      ];
      await i.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "preview") {
      if (error || !data) { await i.reply({ content: `decree.json error: ${error}`, flags: MessageFlags.Ephemeral }); return; }
      const body = buildDecreeFromJson(data, getCommit());
      await i.reply({ content: body.slice(0, 1900), flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === "reload") {
      if (error || !data) { await i.reply({ content: `decree.json error: ${error}`, flags: MessageFlags.Ephemeral }); return; }
      const st = loadState();
      const seqOk = (st.lastDecreeSeq ?? 0) < data.seq;
      const hashChanged = (st.lastDecreeHash ?? "") !== hash;
      const shouldAutoPost = data.autopost ?? true;
      if (!shouldAutoPost || !seqOk || !hashChanged) {
        await i.reply({ content: "No post: guard prevented (autopost/seq/hash). Use `/decree post` to force.", flags: MessageFlags.Ephemeral });
        return;
      }
      const body = buildDecreeFromJson(data, getCommit());
      await postDecree(i.client as Client, body);
      saveState({ ...st, lastDecreeSeq: data.seq, lastDecreeHash: hash, lastVersion: data.version, lastCommit: getCommit() });
      await i.reply({ content: "Posted.", flags: MessageFlags.Ephemeral });
      return;
    }

    // post (force)
    if (error || !data) { await i.reply({ content: `decree.json error: ${error}`, flags: MessageFlags.Ephemeral }); return; }
    const body = buildDecreeFromJson(data, getCommit());
    await postDecree(i.client as Client, body);
    const st = loadState();
    saveState({ ...st, lastDecreeSeq: data.seq, lastDecreeHash: hash, lastVersion: data.version, lastCommit: getCommit() });
    await i.reply({ content: "Posted (forced).", flags: MessageFlags.Ephemeral });
  }
};

// ===== Slash: /capabilities — show what she can do =====
export const capabilitiesSlash = {
  data: new SlashCommandBuilder()
    .setName("capabilities")
    .setDescription("Show Vi’s current abilities (from registry + live slash commands)")
    .setDefaultMemberPermissions(P.Administrator),
  async execute(i: any) {
    const client = i.client as Client;

    // persisted registry
    let caps: { updatedAt?: string; capabilities?: Capability[] } = {};
    try { caps = JSON.parse(readFileSync(CAP_FILE, "utf8")); } catch {}
    const list = (caps.capabilities ?? capabilities);

    // currently registered global commands (best effort)
    let cmds: string[] = [];
    try {
      const fetched = await client.application?.commands.fetch();
      cmds = [...(fetched?.values() ?? [])].map(c => `/${c.name}`);
    } catch {}

    const embed = new EmbedBuilder()
      .setTitle("Vi — Current Capabilities")
      .setDescription(caps.updatedAt ? `Last updated: ${new Date(caps.updatedAt).toLocaleString()}` : "Live snapshot")
      .addFields(
        ...(groupByArea(list).map(([area, items]) => ({
          name: area,
          value: items.slice(0, 12).map(it => `• **${it.title}**${it.details ? ` — ${it.details}` : ""}`).join("\n") || "—",
          inline: false,
        })) as any),
        { name: "Slash Commands", value: cmds.length ? cmds.sort().join("  ") : "—", inline: false },
      );

    await i.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => void 0);
  }
};

function groupByArea(items: Capability[]): [string, Capability[]][] {
  const map = new Map<string, Capability[]>();
  for (const it of items) {
    const key = it.area || "General";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return [...map.entries()];
}
