// scripts/seedProgression.ts (optional)
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const guildId = process.env.GUILD_ID!;

async function main() {
  // Role item example: SKU "role-goldname" mapped to roleId
  await prisma.ecoItem.upsert({
    where: { guildId_sku: { guildId, sku: 'role-goldname' } },
    update: { name: 'Golden Name', price: 2500n, kind: 'role', data: { roleId: '1411796404749471844' } },
    create: { guildId, sku: 'role-goldname', name: 'Golden Name', price: 2500n, kind: 'role', data: { roleId: '1411796404749471844' } },
  });

  // Level role mapping
  await prisma.levelRole.upsert({
    where: { guildId_level: { guildId, level: 5 } },
    update: { roleId: 'ROLE_ID_LEVEL5' },
    create: { guildId, level: 5, roleId: 'ROLE_ID_LEVEL5' },
  });
  await prisma.levelRole.upsert({
    where: { guildId_level: { guildId, level: 10 } },
    update: { roleId: 'ROLE_ID_LEVEL10' },
    create: { guildId, level: 10, roleId: 'ROLE_ID_LEVEL10' },
  });

  console.log('Seeded.');
}
main().finally(() => prisma.$disconnect());
