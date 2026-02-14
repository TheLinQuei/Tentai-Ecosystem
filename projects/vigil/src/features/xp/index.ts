// src/features/xp/index.ts
import { Client, Message } from "discord.js";
import type { Prisma } from '@prisma/client';
import type { XpProfile } from "../../types/prisma-shapes";
import { getPrisma } from "../../utils/prisma";

const prisma = getPrisma();

const MSG_COOLDOWN_MS = 60_000;              // per-user spam guard
const BASE_XP = 10;
const LEN_BONUS = (len: number) => Math.min(20, Math.floor(len / 80)); // +1 per 80 chars, cap 20

function reqForNextLevel(level: number) {
  // XP needed to go FROM `level` TO `level+1`
  return 5 * level * level + 50 * level;
}

function computeLevelAfter(xp: number, currentLevel: number) {
  let level = currentLevel;
  while (xp >= reqForNextLevel(level)) level++;
  return level;
}

// ---- safe grant (no P2002) ----
async function grantXp(userId: string, guildId: string, delta: number, meta?: Record<string, any>) {
  const now = new Date();

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // 1) try to UPDATE first (common case)
    try {
      const before = await tx.xpProfile.findUnique({
        where: { userId_guildId: { userId, guildId } },
        select: { xp: true, level: true },
      });

      if (before) {
        const after = await tx.xpProfile.update({
          where: { userId_guildId: { userId, guildId } },
          data: { xp: { increment: delta }, lastMsgAt: now },
          select: { xp: true, level: true },
        });

        const newLevel = computeLevelAfter(after.xp, after.level);
        let final: XpProfile | null = null;
        if (newLevel !== after.level) {
          final = await tx.xpProfile.update({
            where: { userId_guildId: { userId, guildId } },
            data: { level: newLevel },
          });
        }

        await tx.xpEvent.create({
          data: { userId, guildId, source: "message", delta, meta },
        });

        return { xp: after.xp, level: final?.level ?? newLevel };
      }
    } catch {
      // continue into create path
    }

    // 2) record doesn't exist -> CREATE
    try {
      const created = await tx.xpProfile.create({
        data: { userId, guildId, xp: delta, level: 1, lastMsgAt: now },
      });

      const newLevel = computeLevelAfter(created.xp, created.level);
      if (newLevel !== created.level) {
        await tx.xpProfile.update({
          where: { userId_guildId: { userId, guildId } },
          data: { level: newLevel },
        });
      }

      await tx.xpEvent.create({
        data: { userId, guildId, source: "message", delta, meta },
      });

      return { xp: created.xp, level: newLevel };
    } catch (e: any) {
      // Another txn created it at the same time -> fall back to UPDATE
      if (e?.code === "P2002") {
        const after = await tx.xpProfile.update({
          where: { userId_guildId: { userId, guildId } },
          data: { xp: { increment: delta }, lastMsgAt: now },
          select: { xp: true, level: true },
        });

        const newLevel = computeLevelAfter(after.xp, after.level);
        if (newLevel !== after.level) {
          await tx.xpProfile.update({
            where: { userId_guildId: { userId, guildId } },
            data: { level: newLevel },
          });
        }

        await tx.xpEvent.create({
          data: { userId, guildId, source: "message", delta, meta },
        });

        return { xp: after.xp, level: newLevel };
      }
      throw e;
    }
  });
}

const lastMsgMap = new Map<string, number>(); // userId:guildId -> ts
const XP_WIRED = Symbol.for("vi.xp.wired");

export function initXp(client: Client) {
  if ((client as any)[XP_WIRED]) return;       // prevent double listeners
  (client as any)[XP_WIRED] = true;

  client.on("messageCreate", async (m: Message) => {
    try {
      if (!m.inGuild() || m.author.bot) return;
      if (!m.content || m.content.length < 6) return; // anti-spam

      const key = `${m.author.id}:${m.guildId}`;
      const now = Date.now();
      if (now - (lastMsgMap.get(key) ?? 0) < MSG_COOLDOWN_MS) return;
      lastMsgMap.set(key, now);

      const delta = BASE_XP + LEN_BONUS(m.content.length);
      await grantXp(m.author.id, m.guildId, delta, { channel: m.channelId });
    } catch (e) {
      console.error("[xp:message] grant failed", e);
    }
  });
}

export async function getProfile(userId: string, guildId: string) {
  return prisma.xpProfile.findUnique({
    where: { userId_guildId: { userId, guildId } },
  });
}
