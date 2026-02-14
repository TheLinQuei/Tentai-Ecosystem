// src/features/economy/index.ts
import { getPrisma } from "../../utils/prisma";
import type { PrismaClient } from "@prisma/client";

const prisma = getPrisma();

export async function getBalance(userId: string, guildId: string) {
  const acc = await prisma.ecoAccount.upsert({
    where: { userId_guildId: { userId, guildId } },
    update: {},
    create: { userId, guildId },
  });
  return acc.balance;
}

export async function transact(userId: string, guildId: string, amount: bigint, type: string, meta?: object) {
  return prisma.$transaction(async (tx: PrismaClient) => {
    const acc = await tx.ecoAccount.upsert({
      where: { userId_guildId: { userId, guildId } },
      update: {},
      create: { userId, guildId },
    });
    const newBal = acc.balance + amount;
    if (newBal < 0n) throw new Error('Insufficient funds');
    await tx.ecoAccount.update({
      where: { userId_guildId: { userId, guildId } },
      data: { balance: newBal },
    });
    await tx.ecoTx.create({ data: { userId, guildId, amount, type, meta } });
    return newBal;
  });
}
