#!/usr/bin/env tsx
// scripts/deploy-commands.ts
// Manual command deployment with retry/backoff

// Load environment FIRST before any other imports
import { config } from "dotenv";
config();

import { REST, Routes } from "discord.js";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const COMMAND_SCOPE = (process.env.COMMAND_SCOPE || "guild").toLowerCase(); // 'global' | 'guild'
const COMMAND_SUBSET = (process.env.COMMAND_SUBSET || "full").toLowerCase(); // 'core' | 'full'
const COMMAND_PURGE_OTHER = (process.env.COMMAND_PURGE_OTHER || 'true').toLowerCase() === 'true'; // when deploying guild, remove any existing global duplicates (or vice versa)

// Core command subset (3-5 commands for testing)
const CORE_COMMANDS = ["beep", "event", "poll", "xp", "status"];

if (!TOKEN || !CLIENT_ID) {
  console.error("❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID");
  process.exit(1);
}

if (COMMAND_SCOPE === "guild" && !GUILD_ID) {
  console.error("❌ Missing GUILD_ID for guild-scoped registration");
  process.exit(1);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      console.log(`🔄 Attempt ${attempt}/${maxAttempts}: ${label}`);
      const result = await fn();
      console.log(`✅ Success: ${label}`);
      return result;
    } catch (err: any) {
      console.warn(`⚠️  Attempt ${attempt} failed for ${label}: ${err?.message || err}`);
      if (attempt === maxAttempts) {
        console.error(`❌ All attempts exhausted for ${label}`);
        throw err;
      }
      const jitter = Math.random() * 500;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
      await sleep(delay);
    }
  }
  throw new Error(`Retry logic failed unexpectedly for ${label}`);
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  Vi Discord Bot - Manual Command Deployment                       ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
  console.log(`  Scope: ${COMMAND_SCOPE.toUpperCase()}`);
  console.log(`  Subset: ${COMMAND_SUBSET.toUpperCase()}`);
  console.log(`  Client ID: ${CLIENT_ID}`);
  if (COMMAND_SCOPE === "guild") {
    console.log(`  Guild ID: ${GUILD_ID}`);
  }
  console.log(`  Purge Other Scope: ${COMMAND_PURGE_OTHER ? 'ENABLED' : 'DISABLED'}`);
  console.log("────────────────────────────────────────────────────────────────────");

  // Dynamically import commands AFTER env is loaded to avoid side effects
  const { commands } = await import("../src/commands");
  
  // Filter commands if subset=core
  let selectedCommands = commands;
  if (COMMAND_SUBSET === "core") {
    selectedCommands = commands.filter((c) => CORE_COMMANDS.includes(c.data.name));
    console.log(`📋 Deploying ${selectedCommands.length} CORE commands: ${selectedCommands.map((c) => c.data.name).join(", ")}`);
  } else {
    console.log(`📋 Deploying ${selectedCommands.length} FULL commands`);
  }

  const commandData = selectedCommands.map((cmd) => cmd.data.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN!);

  const route =
    COMMAND_SCOPE === "global"
      ? Routes.applicationCommands(CLIENT_ID!)
      : Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID!);

  console.log("🚀 Starting deployment with exponential backoff...");

  try {
    const result = await retryWithBackoff(
      async () => {
        return rest.put(route, { body: commandData }) as Promise<any[]>;
      },
      `Bulk PUT ${selectedCommands.length} commands to ${COMMAND_SCOPE}`,
      3, // 3 attempts
      3000, // 3s base delay
    );

    console.log("────────────────────────────────────────────────────────────────────");
    console.log(`✅ Successfully deployed ${result.length} commands to ${COMMAND_SCOPE.toUpperCase()}`);
    console.log(`   Commands: ${result.map((c: any) => c.name).join(", ")}`);

    // Verification fetch
    console.log("────────────────────────────────────────────────────────────────────");
    console.log("🔍 Verifying registration...");
    const verified = (await rest.get(route)) as any[];
    console.log(`✅ Discord reports ${verified.length} commands registered`);
    console.log(`   Commands: ${verified.map((c) => c.name).join(", ")}`);

    const registeredNames = new Set(verified.map((c) => c.name));
    const missing = commandData.filter((c: any) => !registeredNames.has(c.name));
    if (missing.length > 0) {
      console.warn(`⚠️  WARNING: ${missing.length} commands missing!`);
      console.warn(`   Missing: ${missing.map((c: any) => c.name).join(", ")}`);
    } else {
      console.log(`✅ All ${commandData.length} commands verified successfully`);
    }

    // Optional purge of the opposite scope to eliminate duplicates in client UI
    if (COMMAND_PURGE_OTHER) {
      try {
        if (COMMAND_SCOPE === 'guild') {
          console.log('🧹 Checking for existing GLOBAL commands to purge...');
          const globalExisting = (await rest.get(Routes.applicationCommands(CLIENT_ID!))) as any[];
          const toDelete = globalExisting.filter(g => commandData.some((c: any) => c.name === g.name));
          if (toDelete.length) {
            console.log(`🧽 Purging ${toDelete.length} global duplicate(s): ${toDelete.map(c => c.name).join(', ')}`);
            for (const cmd of toDelete) {
              const delRoute = Routes.applicationCommand(CLIENT_ID!, cmd.id);
              try {
                await retryWithBackoff(() => rest.delete(delRoute) as Promise<any>, `delete global ${cmd.name}`, 2, 1000);
                console.log(`   ✂️  Deleted global '${cmd.name}'`);
              } catch (e: any) {
                console.warn(`   ⚠️  Failed to delete global '${cmd.name}': ${e?.message || e}`);
              }
              await sleep(250);
            }
            console.log('✅ Global purge complete. Discord may take up to ~1 minute to reflect changes.');
          } else {
            console.log('ℹ️  No matching global commands found to purge.');
          }
        } else if (COMMAND_SCOPE === 'global') {
          console.log('🧹 Checking for existing GUILD commands to purge...');
          if (!GUILD_ID) {
            console.log('ℹ️  No GUILD_ID provided; cannot purge guild commands.');
          } else {
            const guildExisting = (await rest.get(Routes.applicationGuildCommands(CLIENT_ID!, GUILD_ID))) as any[];
            const toDelete = guildExisting.filter(g => commandData.some((c: any) => c.name === g.name));
            if (toDelete.length) {
              console.log(`🧽 Purging ${toDelete.length} guild duplicate(s): ${toDelete.map(c => c.name).join(', ')}`);
              for (const cmd of toDelete) {
                const delRoute = Routes.applicationGuildCommand(CLIENT_ID!, GUILD_ID!, cmd.id);
                try {
                  await retryWithBackoff(() => rest.delete(delRoute) as Promise<any>, `delete guild ${cmd.name}`, 2, 1000);
                  console.log(`   ✂️  Deleted guild '${cmd.name}'`);
                } catch (e: any) {
                  console.warn(`   ⚠️  Failed to delete guild '${cmd.name}': ${e?.message || e}`);
                }
                await sleep(250);
              }
              console.log('✅ Guild purge complete. Discord may take up to ~1 minute to reflect changes.');
            } else {
              console.log('ℹ️  No matching guild commands found to purge.');
            }
          }
        }
      } catch (purgeErr: any) {
        console.warn(`⚠️  Purge step encountered an error: ${purgeErr?.message || purgeErr}`);
      }
    } else {
      console.log('ℹ️  COMMAND_PURGE_OTHER disabled; leaving other scope commands intact.');
    }
  } catch (err: any) {
    console.error("────────────────────────────────────────────────────────────────────");
    console.error("❌ Deployment failed after all retry attempts");
    console.error(`   Error: ${err?.message || err}`);
    if (err?.stack) {
      console.error(`   Stack: ${err.stack}`);
    }
    process.exit(1);
  }

  console.log("╔════════════════════════════════════════════════════════════════════╗");
  console.log("║  Deployment complete!                                              ║");
  console.log("╚════════════════════════════════════════════════════════════════════╝");
}

main().catch((err) => {
  console.error("❌ Unhandled error:", err);
  process.exit(1);
});
