// src/core/consent.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

type UserFlags = { imageDescribeOptOut?: boolean; analysisOptOut?: boolean };
type ChannelFlags = { autoDescribeImages?: boolean; analysisEnabled?: boolean };

type Store = {
  users: Record<string, UserFlags>;
  channels: Record<string, ChannelFlags>;
};

const FILE = join(process.cwd(), "memory", "consent.json");
let store: Store = { users: {}, channels: {} };
let loaded = false;

async function save() {
  await mkdir(dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(store, null, 2));
}

export async function loadConsent(): Promise<void> {
  if (loaded) return;
  try {
    const buf = await readFile(FILE, "utf8");
    store = JSON.parse(buf);
  } catch {
    store = { users: {}, channels: {} };
    await save();
  }
  loaded = true;
}

export async function setUserOptOut(userId: string, k: keyof UserFlags, v: boolean) {
  await loadConsent();
  store.users[userId] ||= {};
  (store.users[userId] as any)[k] = v;
  await save();
}
export async function getUserOptOut(userId: string, k: keyof UserFlags): Promise<boolean> {
  await loadConsent();
  return !!store.users[userId]?.[k];
}

export async function setChannelFlag(channelId: string, k: keyof ChannelFlags, v: boolean) {
  await loadConsent();
  store.channels[channelId] ||= {};
  (store.channels[channelId] as any)[k] = v;
  await save();
}
export async function getChannelFlag(channelId: string, k: keyof ChannelFlags, fallback = true): Promise<boolean> {
  await loadConsent();
  const raw = store.channels[channelId]?.[k];
  return typeof raw === "boolean" ? raw : fallback;
}
