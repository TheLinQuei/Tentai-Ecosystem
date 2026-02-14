// src/core/escalate.ts
import { Client, type TextBasedChannel } from "discord.js";

type Pending = { expires: number; payload: any };
const PENDING = new Map<string, Pending>();

export async function askEscalation(channel: TextBasedChannel, key: string, payload: any) {
  PENDING.set(key, { expires: Date.now() + 5 * 60_000, payload });

  if (!("send" in channel)) return; // TS: now knows this branch has .send

  await channel.send(
    "I can notify The Lin Quei about this. Say **yes** to notify, or **no** to ignore (within 5 minutes)."
  );
}

export async function handleEscalationReply(client: Client, channelId: string, content: string) {
  const entry = PENDING.get(channelId);
  if (!entry || Date.now() > entry.expires) return false;

  const text = content.trim().toLowerCase();
  const yes = text === "y" || text === "yes";
  const no = text === "n" || text === "no";

  if (!yes && !no) return false;

  PENDING.delete(channelId);
  if (yes) {
    const ownerId = process.env.OWNER_ID || process.env.FORSA_ID;
    if (!ownerId) return true;
    try {
      const u = await client.users.fetch(ownerId);
      await u.send(
        `⚠️ Escalation requested.\n\`\`\`json\n${JSON.stringify(entry.payload, null, 2)}\n\`\`\``
      );
    } catch { /* ignore */ }
  }
  return true;
}
