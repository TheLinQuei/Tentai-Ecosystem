#!/usr/bin/env tsx
// Seed the Lore Market with all hybrid unlocks, titles, auras, utilities, and seasonal items

import { prisma } from "../src/db/prisma";

const GUILD_ID = process.env.GUILD_ID || "547355812314742814";

const SHOP_ITEMS = [
  // ===== HYBRID UNLOCKS =====
  {
    sku: "eclipsar-unlock",
    name: "🌗 Eclipsar Hybrid",
    kind: "hybrid-unlock",
    price: 50000,
    category: "Hybrid Evolutions",
    description: "The forbidden union of Celestial + Akuma — cosmic balance between light and shadow. Premium unlock only.",
    data: { locked: true, hybrid: "eclipsar", requires: ["cel", "aku"] },
  },
  {
    sku: "aetherborn-unlock",
    name: "🌤️ Aetherborn Hybrid",
    kind: "hybrid-unlock",
    price: 15000,
    category: "Hybrid Evolutions",
    description: "Celestials who walked free among the wild — cosmic drifters seeking freedom.",
    data: { hybrid: "aetherborn", requires: ["cel", "ind"] },
  },
  {
    sku: "luminari-unlock",
    name: "💫 Luminari Hybrid",
    kind: "hybrid-unlock",
    price: 12500,
    category: "Hybrid Evolutions",
    description: "Mortals blessed by the heavens — radiant warriors touched by divine light.",
    data: { hybrid: "luminari", requires: ["cel", "mor"] },
  },
  {
    sku: "blightwalker-unlock",
    name: "🌑 Blightwalker Hybrid",
    kind: "hybrid-unlock",
    price: 12000,
    category: "Hybrid Evolutions",
    description: "Akuma who chose life over ruin — twisted souls seeking redemption.",
    data: { hybrid: "blightwalker", requires: ["aku", "ind"] },
  },
  {
    sku: "dreadmarked-unlock",
    name: "🔥 Dreadmarked Hybrid",
    kind: "hybrid-unlock",
    price: 10000,
    category: "Hybrid Evolutions",
    description: "Pactbound mortals bearing burning flux scars — warriors who traded safety for power.",
    data: { hybrid: "dreadmarked", requires: ["aku", "mor"] },
  },
  {
    sku: "warden-unlock",
    name: "🐾 Warden Hybrid",
    kind: "hybrid-unlock",
    price: 9000,
    category: "Hybrid Evolutions",
    description: "Guardians of the wild — defenders who maintain the free balance.",
    data: { hybrid: "warden", requires: ["ind", "mor"] },
  },

  // ===== TITLES & AURAS =====
  {
    sku: "sovereign-title",
    name: "👑 Sovereign Title",
    kind: "title",
    price: 20000,
    category: "Titles & Auras",
    description: "Displays a golden 'Sovereign' tag in your profile embeds — mark of ultimate prestige.",
    data: { title: "Sovereign", color: "gold" },
  },
  {
    sku: "starborne-aura",
    name: "🌌 Starborne Aura",
    kind: "aura",
    price: 15000,
    category: "Titles & Auras",
    description: "Adds a glowing cosmic aura effect to your embeds and /profile displays.",
    data: { aura: "starborne", effect: "cosmic-glow" },
  },
  {
    sku: "umbral-halo",
    name: "💀 Umbral Halo",
    kind: "aura",
    price: 12000,
    category: "Titles & Auras",
    description: "Dark shimmer aura around your user embeds — for those who walk in shadow.",
    data: { aura: "umbral", effect: "dark-shimmer" },
  },
  {
    sku: "celestial-crest",
    name: "💎 Celestial Crest",
    kind: "cosmetic",
    price: 8000,
    category: "Titles & Auras",
    description: "Adds a radiant symbol next to your name in the leaderboard.",
    data: { crest: "celestial", marker: "💎" },
  },

  // ===== UTILITY ITEMS =====
  {
    sku: "xp-booster-2x",
    name: "⚡ XP Booster (2x)",
    kind: "booster",
    price: 2500,
    category: "Utility Items",
    description: "Doubles XP gain for 1 hour — accelerate your progression!",
    data: { multiplier: 2, duration: 3600 },
  },
  {
    sku: "cooldown-reset",
    name: "🔁 Cooldown Reset",
    kind: "utility",
    price: 1000,
    category: "Utility Items",
    description: "Instantly resets all daily command cooldowns — claim your daily twice!",
    data: { type: "cooldown-reset", singleUse: true },
  },
  {
    sku: "vi-chat-24h",
    name: "💬 Summon Vi (Personal Chat)",
    kind: "utility",
    price: 5000,
    category: "Utility Items",
    description: "Grants temporary private chat access with Vi for 24 hours — ask anything!",
    data: { type: "private-chat", duration: 86400 },
  },
  {
    sku: "memory-fragment",
    name: "💎 Memory Core Fragment",
    kind: "lore-token",
    price: 7500,
    category: "Utility Items",
    description: "Unlocks hidden dialogue lines and secret lore entries — uncover the past.",
    data: { type: "lore-unlock", permanent: true },
  },

  // ===== SEASONAL & EVENT ITEMS =====
  {
    sku: "winter-crest",
    name: "❄️ Winter Crest",
    kind: "cosmetic",
    price: 6000,
    category: "Seasonal & Limited",
    description: "Limited crest from the Frostmoon Festival — only available in winter.",
    data: { season: "winter", limited: true },
    stock: 50,
  },
  {
    sku: "eclipse-mask",
    name: "🎃 Eclipse Mask",
    kind: "cosmetic",
    price: 7000,
    category: "Seasonal & Limited",
    description: "Halloween-exclusive cosmetic that hides your username glow — spooky!",
    data: { season: "halloween", limited: true },
    stock: 30,
  },
];

async function main() {
  console.log("🏛️ Seeding Lore Market...\n");

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of SHOP_ITEMS) {
    try {
      const existing = await prisma.ecoItem.findUnique({
        where: {
          guildId_sku: {
            guildId: GUILD_ID,
            sku: item.sku,
          },
        },
      });

      if (existing) {
        // Update price/description if changed
        await prisma.ecoItem.update({
          where: { id: existing.id },
          data: {
            name: item.name,
            price: item.price,
            kind: item.kind,
            stock: item.stock ?? null,
            data: item.data as any,
          },
        });
        updated++;
        console.log(`✏️  Updated: ${item.name}`);
      } else {
        await prisma.ecoItem.create({
          data: {
            guildId: GUILD_ID,
            sku: item.sku,
            name: item.name,
            kind: item.kind,
            price: item.price,
            stock: item.stock ?? null,
            data: item.data as any,
          },
        });
        created++;
        console.log(`✅ Created: ${item.name}`);
      }
    } catch (e) {
      console.error(`❌ Failed to process ${item.sku}:`, e);
      skipped++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Created: ${created}`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`\n🎉 Lore Market is ready!`);
}

main()
  .catch((e) => {
    console.error("Error seeding Lore Market:", e);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
