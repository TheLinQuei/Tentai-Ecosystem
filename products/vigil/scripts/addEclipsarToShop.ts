#!/usr/bin/env tsx
// Add Eclipsar unlock item to the shop

import { prisma } from "../src/db/prisma";

const GUILD_ID = process.env.GUILD_ID || "547355812314742814";
const ECLIPSAR_PRICE = 50000; // 50k coins (adjust as needed)

async function main() {
  console.log("Adding Eclipsar unlock to shop...");

  const existing = await prisma.ecoItem.findUnique({
    where: {
      guildId_sku: {
        guildId: GUILD_ID,
        sku: "eclipsar-unlock",
      },
    },
  });

  if (existing) {
    console.log("✅ Eclipsar unlock already exists in shop.");
    return;
  }

  await prisma.ecoItem.create({
    data: {
      guildId: GUILD_ID,
      sku: "eclipsar-unlock",
      name: "🌓 Eclipsar Hybrid Unlock",
      kind: "unlock",
      price: ECLIPSAR_PRICE,
      stock: null, // unlimited
      data: {
        description: "Unlock the rare Celestial + Akuma hybrid role (Eclipsar). Light and shadow, balanced.",
        unlocks: "eclipsar-hybrid",
      },
    },
  });

  console.log(`✅ Added Eclipsar unlock to shop (${ECLIPSAR_PRICE} coins).`);
  console.log("   SKU: eclipsar-unlock");
  console.log("   Purchase with: /buy sku:eclipsar-unlock");
}

main()
  .catch((e) => {
    console.error("Error adding Eclipsar to shop:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
