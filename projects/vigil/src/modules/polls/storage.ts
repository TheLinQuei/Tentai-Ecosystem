import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

export type PollAnswer = { label: string; emoji?: string };
export type BuiltPoll = {
  question: string;
  answers: PollAnswer[];
  anonymous: boolean;
  multi: boolean;
  durationMs: number;
  roleGateId?: string;
  makeThread: boolean;
  live: boolean;
  dmCreator?: boolean;
  image?: string; // Image URL for poll thumbnail
  color?: number; // Hex color for embed
  theme?: "wyr" | "omg" | "vibe" | "yesno" | "multi" | "rating5" | "custom"; // Theme type
};

export type VoteSnapshot = {
  voters: Record<string, number[]>;
  weights?: Record<string, number>;
};

export type ArchiveRecord = {
  messageId: string;
  channelId: string;
  guildId: string;
  creatorId: string;
  createdAt: number;
  closedAt: number;
  config: BuiltPoll;
  votes: VoteSnapshot;
};

export type Preset = {
  name: string;
  question: string;
  answers: PollAnswer[];
  defaults?: Partial<Omit<BuiltPoll, "question" | "answers">>;
};

const DATA_DIR = process.env.POLL_DATA_DIR ?? "./data/polls";
const PRESETS_PATH = (g: string) => path.join(DATA_DIR, g, "poll_presets.json");
const WEIGHTS_PATH = (g: string) => path.join(DATA_DIR, g, "poll_weights.json");
const ARCHIVE_DIR = (g: string) => path.join(DATA_DIR, g, "archive");

function ensureDir(p: string) { fs.mkdirSync(p, { recursive: true }); }
function readJSON<T>(p: string, fallback: T): T { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return fallback; } }
function writeJSON(p: string, v: any) { ensureDir(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(v, null, 2), "utf8"); }

export interface StorageAdapter {
  listPresets(guildId: string): Promise<Preset[]>;
  getPreset(guildId: string, name: string): Promise<Preset | null>;
  savePreset(guildId: string, preset: Preset): Promise<void>;
  deletePreset(guildId: string, name: string): Promise<boolean>;

  readWeights(guildId: string): Promise<Record<string, number>>;
  writeWeights(guildId: string, map: Record<string, number>): Promise<void>;

  writeArchive(rec: ArchiveRecord): Promise<void>;
  readArchive(guildId: string, messageId: string): Promise<ArchiveRecord | null>;
  listRecentArchives(guildId: string, limit: number): Promise<ArchiveRecord[]>;
}

class JsonStorage implements StorageAdapter {
  async listPresets(guildId: string) { return readJSON<Preset[]>(PRESETS_PATH(guildId), []); }
  async getPreset(guildId: string, name: string) {
    const all = await this.listPresets(guildId);
    return all.find(p => p.name.toLowerCase() === name.toLowerCase()) ?? null;
  }
  async savePreset(guildId: string, preset: Preset) {
    const file = PRESETS_PATH(guildId);
    const items = (await this.listPresets(guildId)).filter(p => p.name.toLowerCase() !== preset.name.toLowerCase());
    items.push(preset);
    writeJSON(file, items);
  }
  async deletePreset(guildId: string, name: string) {
    const file = PRESETS_PATH(guildId);
    const items = await this.listPresets(guildId);
    const next = items.filter(p => p.name.toLowerCase() !== name.toLowerCase());
    if (next.length === items.length) return false;
    writeJSON(file, next);
    return true;
  }

  async readWeights(guildId: string) { return readJSON<Record<string, number>>(WEIGHTS_PATH(guildId), {}); }
  async writeWeights(guildId: string, map: Record<string, number>) { writeJSON(WEIGHTS_PATH(guildId), map); }

  async writeArchive(rec: ArchiveRecord) {
    const dir = ARCHIVE_DIR(rec.guildId);
    ensureDir(dir);
    writeJSON(path.join(dir, `${rec.messageId}.json`), rec);
  }
  async readArchive(guildId: string, messageId: string) {
    try { return JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR(guildId), `${messageId}.json`), "utf8")); } catch { return null; }
  }
  async listRecentArchives(guildId: string, limit: number) {
    const dir = ARCHIVE_DIR(guildId);
    ensureDir(dir);
    const files = (fs.readdirSync(dir).filter(f => f.endsWith(".json"))).slice(-limit).reverse();
    return files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
  }
}

class PrismaStorage implements StorageAdapter {
  prisma: PrismaClient;
  constructor(client?: PrismaClient) { this.prisma = client ?? new PrismaClient(); }

  async listPresets(guildId: string) {
    const rows = await this.prisma.pollPreset.findMany({ where: { guildId }, orderBy: { updatedAt: "desc" } });
    return rows.map(r => ({ name: r.name, question: r.question, answers: r.answers as any, defaults: r.defaults as any }));
  }
  async getPreset(guildId: string, name: string) {
    const r = await this.prisma.pollPreset.findUnique({ where: { guildId_name: { guildId, name } } });
    return r ? { name: r.name, question: r.question, answers: r.answers as any, defaults: r.defaults as any } : null;
  }
  async savePreset(guildId: string, preset: Preset) {
    await this.prisma.pollPreset.upsert({
      where: { guildId_name: { guildId, name: preset.name } },
      create: { guildId, name: preset.name, question: preset.question, answers: preset.answers as any, defaults: (preset.defaults ?? null) as any },
      update: { question: preset.question, answers: preset.answers as any, defaults: (preset.defaults ?? null) as any },
    });
  }
  async deletePreset(guildId: string, name: string) {
    try { await this.prisma.pollPreset.delete({ where: { guildId_name: { guildId, name } } }); return true; } catch { return false; }
  }

  async readWeights(guildId: string) {
    const rows = await this.prisma.pollWeight.findMany({ where: { guildId } });
    const map: Record<string, number> = {};
    for (const r of rows) map[r.roleId] = r.weight;
    return map;
  }
  async writeWeights(guildId: string, map: Record<string, number>) {
    await this.prisma.pollWeight.deleteMany({ where: { guildId } });
    const items = Object.entries(map).map(([roleId, weight]) => ({ guildId, roleId, role: roleId, weight }));
    if (items.length) await this.prisma.pollWeight.createMany({ data: items, skipDuplicates: true });
  }

  async writeArchive(rec: ArchiveRecord) {
    await this.prisma.pollArchive.upsert({
      where: { messageId: rec.messageId },
      create: {
        messageId: rec.messageId,
        guildId: rec.guildId,
        channelId: rec.channelId,
        creatorId: rec.creatorId,
        createdAt: new Date(rec.createdAt),
        closedAt: new Date(rec.closedAt),
        config: rec.config as any,
        votes: rec.votes as any,
      },
      update: {
        closedAt: new Date(rec.closedAt),
        config: rec.config as any,
        votes: rec.votes as any,
      }
    });
  }
  async readArchive(guildId: string, messageId: string) {
    const r = await this.prisma.pollArchive.findUnique({ where: { messageId } });
    if (!r || r.guildId !== guildId) return null;
    return {
      messageId: r.messageId,
      guildId: r.guildId,
      channelId: r.channelId,
      creatorId: r.creatorId,
      createdAt: r.createdAt.getTime(),
      closedAt: r.closedAt.getTime(),
      config: r.config as any,
      votes: r.votes as any,
    } as ArchiveRecord;
  }
  async listRecentArchives(guildId: string, limit: number) {
    const rows = await this.prisma.pollArchive.findMany({
      where: { guildId }, orderBy: { createdAt: "desc" }, take: limit
    });
    return rows.map(r => ({
      messageId: r.messageId,
      guildId: r.guildId,
      channelId: r.channelId,
      creatorId: r.creatorId,
      createdAt: r.createdAt.getTime(),
      closedAt: r.closedAt.getTime(),
      config: r.config as any,
      votes: r.votes as any,
    }));
  }
}

let _adapter: StorageAdapter | null = null;
export function storage(): StorageAdapter {
  if (_adapter) return _adapter;
  const mode = (process.env.POLL_STORAGE ?? "json").toLowerCase();
  _adapter = mode === "prisma" ? new PrismaStorage() : new JsonStorage();
  return _adapter;
}

export async function listPresets(guildId: string) { return storage().listPresets(guildId); }
export async function getPreset(guildId: string, name: string) { return storage().getPreset(guildId, name); }
export async function savePreset(guildId: string, preset: Preset) { return storage().savePreset(guildId, preset); }
export async function deletePreset(guildId: string, name: string) { return storage().deletePreset(guildId, name); }

export async function readWeightsMap(guildId: string) { return storage().readWeights(guildId); }
export async function writeWeightsMap(guildId: string, m: Record<string, number>) { return storage().writeWeights(guildId, m); }

export async function archiveWrite(rec: ArchiveRecord) { return storage().writeArchive(rec); }
export async function archiveRead(guildId: string, messageId: string) { return storage().readArchive(guildId, messageId); }
export async function archiveListRecent(guildId: string, limit: number) { return storage().listRecentArchives(guildId, limit); }