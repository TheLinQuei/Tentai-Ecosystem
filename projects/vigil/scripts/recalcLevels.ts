// scripts/recalcLevels.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function levelReq(l: number) { return 5*l*l + 50*l; }
function levelFromTotalXp(total: number) {
  let level = 0, need = levelReq(level), into = total;
  while (into >= need) { into -= need; level++; need = levelReq(level); }
  return level;
}

async function main() {
  const rows = await prisma.xpProfile.findMany({ select: { userId:true, guildId:true, xp:true, level:true } });
  for (const r of rows) {
    const trueLevel = levelFromTotalXp(Number(r.xp));
    if (trueLevel !== r.level) {
      await prisma.xpProfile.update({
        where: { userId_guildId: { userId: r.userId, guildId: r.guildId } },
        data: { level: trueLevel },
      });
      console.log(`[fix] ${r.userId}@${r.guildId}: ${r.level} -> ${trueLevel} (xp=${r.xp})`);
    }
  }
}
main().then(()=>prisma.$disconnect());
