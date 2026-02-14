// src/command.ts
import {
  Client,
  Collection,
  REST,
  Routes,
  Interaction,
} from "discord.js";
import { API } from "@discordjs/core";
// no unused type imports here
import { commands } from "./commands";
import type { CommandModule } from "./commands/_types";
import { MessageFlags } from "discord.js";

/* ─────────────────────── Configuration ─────────────────────── */
const COMMAND_SCOPE = (process.env.COMMAND_SCOPE || "guild").toLowerCase(); // 'global' | 'guild'
const COMMAND_SUBSET = (process.env.COMMAND_SUBSET || "full").toLowerCase(); // 'core' | 'full'
const CORE_COMMANDS = ["beep", "event", "poll", "xp", "status"];
const BULK_TIMEOUT_MS = 120000; // 120s for bulk overwrite
const PER_REQUEST_TIMEOUT_MS = 60000; // 60s per individual request
const MAX_RETRY_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 2000;

/* ───────────────────────── registry ───────────────────────── */
function buildRegistry(mods: CommandModule[]) {
  const byName = new Collection<string, CommandModule>();
  // component prefix -> handler
  const components = new Map<string, (i: Interaction) => Promise<any> | any>();

  for (const m of mods) {
    byName.set(m.data.name, m);
    if (m.components) {
      for (const [prefix, fn] of Object.entries(m.components)) {
        components.set(prefix, fn as any); // keep as-is, just cast
      }
    }
  }
  return { byName, components };
}

/* ──────────────────────── registration ─────────────────────── */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = MAX_RETRY_ATTEMPTS,
  baseDelayMs = BASE_BACKOFF_MS,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err: any) {
      console.warn(`[CMD-REG] Attempt ${attempt}/${maxAttempts} failed for ${label}: ${err?.message || err}`);
      if (attempt === maxAttempts) {
        throw err;
      }
      const jitter = Math.random() * 500;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + jitter;
      console.log(`[CMD-REG] Retrying in ${Math.round(delay)}ms...`);
      await sleep(delay);
    }
  }
  throw new Error(`Retry logic failed for ${label}`);
}

function pickCmdShape(o: any) {
  if (!o) return o;
  // Normalize to a comparable shape (ignore server-generated fields like id, version, application_id)
  const {
    name,
    description,
    type,
    dm_permission,
    default_member_permissions,
    nsfw,
    options,
  } = o;
  return { name, description, type, dm_permission, default_member_permissions, nsfw, options };
}

async function ensureGuildCommandsUpToDate(
  rest: REST,
  clientId: string,
  guildId: string,
  mods: CommandModule[],
) {
  const isGlobal = COMMAND_SCOPE === "global";
  const scope = isGlobal ? "GLOBAL" : `GUILD [${guildId}]`;
  const LOG_PREFIX = `[CMD-REG] [${scope}]`;
  
  // Filter commands by subset
  let selectedMods = mods;
  if (COMMAND_SUBSET === "core") {
    selectedMods = mods.filter((m) => CORE_COMMANDS.includes(m.data.name));
    console.log(`${LOG_PREFIX} SUBSET MODE: Deploying ${selectedMods.length}/${mods.length} core commands`);
  }
  
  console.log(`${LOG_PREFIX} ========== COMMAND REGISTRATION START ==========`);
  console.log(`${LOG_PREFIX} Client ID: ${clientId}`);
  console.log(`${LOG_PREFIX} Scope: ${COMMAND_SCOPE.toUpperCase()}`);
  console.log(`${LOG_PREFIX} Subset: ${COMMAND_SUBSET.toUpperCase()}`);
  console.log(`${LOG_PREFIX} Local command count: ${selectedMods.length}`);
  console.log(`${LOG_PREFIX} Local commands: ${selectedMods.map(m => m.data.name).join(', ')}`);
  
  // Fetch existing commands
  let existing: any[] = [];
  const route = isGlobal
    ? Routes.applicationCommands(clientId)
    : Routes.applicationGuildCommands(clientId, guildId);
  
  try {
    console.log(`${LOG_PREFIX} [STEP 1/5] Fetching existing commands from Discord API...`);
    const fetchStart = Date.now();
    
    existing = await rest.get(route) as any[];
    
    const fetchTime = Date.now() - fetchStart;
    console.log(`${LOG_PREFIX} [STEP 1/5] ✓ Fetch completed in ${fetchTime}ms`);
    console.log(`${LOG_PREFIX} Discord command count: ${existing.length}`);
    console.log(`${LOG_PREFIX} Discord commands: ${existing.map((c: any) => c.name).join(', ')}`);
  } catch (err) {
    console.error(`${LOG_PREFIX} [STEP 1/5] ✗ FETCH FAILED: ${(err as any)?.message || err}`);
    console.error(`${LOG_PREFIX} Error details:`, err);
    console.error(`${LOG_PREFIX} Cannot proceed without existing command list. Aborting registration.`);
    return;
  }

  const byName = new Map(existing.map((c: any) => [c.name, pickCmdShape(c)]));

  // Desired commands from code
  console.log(`${LOG_PREFIX} [STEP 2/5] Building desired command list...`);
  const desired = selectedMods.map((m) => m.data.toJSON());
  const desiredByName = new Map(desired.map((d: any) => [d.name, pickCmdShape(d)]));
  console.log(`${LOG_PREFIX} [STEP 2/5] ✓ Desired commands built: ${desired.length} total`);

  // Detect changes
  console.log(`${LOG_PREFIX} [STEP 3/5] Comparing local vs Discord commands...`);
  let changed = 0;
  const newCommands: string[] = [];
  const updatedCommands: string[] = [];
  const unchangedCommands: string[] = [];
  
  for (const [name, nextShape] of desiredByName) {
    const prev = byName.get(name);
    if (!prev) {
      changed++;
      newCommands.push(name);
    } else if (JSON.stringify(prev) !== JSON.stringify(nextShape)) {
      changed++;
      updatedCommands.push(name);
    } else {
      unchangedCommands.push(name);
    }
  }
  
  // Detect deletions
  const deletedCommands: string[] = [];
  for (const name of byName.keys()) {
    if (!desiredByName.has(name)) {
      changed++;
      deletedCommands.push(name);
    }
  }
  
  console.log(`${LOG_PREFIX} [STEP 3/5] ✓ Comparison complete:`);
  console.log(`${LOG_PREFIX}   - New commands: ${newCommands.length} ${newCommands.length > 0 ? `(${newCommands.join(', ')})` : ''}`);
  console.log(`${LOG_PREFIX}   - Updated commands: ${updatedCommands.length} ${updatedCommands.length > 0 ? `(${updatedCommands.join(', ')})` : ''}`);
  console.log(`${LOG_PREFIX}   - Deleted commands: ${deletedCommands.length} ${deletedCommands.length > 0 ? `(${deletedCommands.join(', ')})` : ''}`);
  console.log(`${LOG_PREFIX}   - Unchanged commands: ${unchangedCommands.length}`);
  console.log(`${LOG_PREFIX}   - Total changes: ${changed}`);

  if (changed === 0) {
    console.log(`${LOG_PREFIX} [STEP 4/5] ⊘ No changes detected - skipping registration`);
    console.log(`${LOG_PREFIX} ========== COMMAND REGISTRATION COMPLETE (SKIPPED) ==========`);
    return;
  }

  // STEP 4: Attempt bulk overwrite with retry/backoff, no aggressive abort
  const startTime = Date.now();
  const api = new API(rest);
  let bulkWorked = false;
  console.log(`${LOG_PREFIX} [STEP 4/5] Attempting bulk overwrite with retry (timeout ${BULK_TIMEOUT_MS}ms)...`);
  try {
    const result = await retryWithBackoff(
      async () => {
        if (isGlobal) {
          return api.applicationCommands.bulkOverwriteGlobalCommands(clientId, desired);
        } else {
          return api.applicationCommands.bulkOverwriteGuildCommands(clientId, guildId, desired);
        }
      },
      "Bulk overwrite",
      MAX_RETRY_ATTEMPTS,
      BASE_BACKOFF_MS,
    );
    bulkWorked = true;
    console.log(`${LOG_PREFIX} [STEP 4/5] ✓ Bulk overwrite succeeded (registered: ${result.length})`);
  } catch (e: any) {
    console.warn(`${LOG_PREFIX} [STEP 4/5] Bulk overwrite failed after retries: ${e?.message || e}`);
  }

  if (!bulkWorked) {
    console.log(`${LOG_PREFIX} [STEP 4/5] Bulk failed → falling back to incremental registration (create/update/delete)`);

    // Refresh existing after bulk attempts
    try {
      existing = await rest.get(route) as any[];
    } catch {}
    console.log(`${LOG_PREFIX} Discord currently has ${existing.length} commands`);

    // Map existing command name -> full object (with id)
    const existingByName = new Map(existing.map(c => [c.name, c]));
    const failures: string[] = [];

    // Deletes first (avoid conflicts)
    for (const name of deletedCommands) {
      const obj = existingByName.get(name);
      if (!obj?.id) continue;
      const delRoute = isGlobal
        ? Routes.applicationCommand(clientId, obj.id)
        : Routes.applicationGuildCommand(clientId, guildId, obj.id);
      console.log(`${LOG_PREFIX} [DEL] ${name} (id ${obj.id})`);
      try {
        await retryWithBackoff(
          async () => rest.delete(delRoute),
          `delete ${name}`,
        );
        console.log(`${LOG_PREFIX} [DEL] ✓ ${name}`);
      } catch (err: any) {
        console.warn(`${LOG_PREFIX} [DEL] ✗ ${name}: ${err.message}`);
        failures.push(`delete:${name}`);
      }
      await sleep(300);
    }

    // Creates
    const existingNames = new Set(existing.map(c => c.name));
    const newCmds = desired.filter(d => !existingNames.has(d.name));
    for (const body of newCmds) {
      const name = body.name;
      console.log(`${LOG_PREFIX} [CREATE] ${name}`);
      try {
        await retryWithBackoff(
          async () => rest.post(route, { body }),
          `create ${name}`,
        );
        console.log(`${LOG_PREFIX} [CREATE] ✓ ${name}`);
      } catch (err: any) {
        console.warn(`${LOG_PREFIX} [CREATE] ✗ ${name}: ${err.message}`);
        failures.push(`create:${name}`);
      }
      await sleep(300);
    }

    // Updates
    for (const name of updatedCommands) {
      const existingCmd = existingByName.get(name);
      const body = desired.find(d => d.name === name);
      if (!existingCmd?.id || !body) continue;
      const updateRoute = isGlobal
        ? Routes.applicationCommand(clientId, existingCmd.id)
        : Routes.applicationGuildCommand(clientId, guildId, existingCmd.id);
      console.log(`${LOG_PREFIX} [UPDATE] ${name} (id ${existingCmd.id})`);
      try {
        await retryWithBackoff(
          async () => rest.patch(updateRoute, { body }),
          `update ${name}`,
        );
        console.log(`${LOG_PREFIX} [UPDATE] ✓ ${name}`);
      } catch (err: any) {
        console.warn(`${LOG_PREFIX} [UPDATE] ✗ ${name}: ${err.message}`);
        failures.push(`update:${name}`);
      }
      await sleep(300);
    }

    if (failures.length) {
      console.warn(`${LOG_PREFIX} [STEP 4/5] Incremental registration completed with ${failures.length} failures`);
      console.warn(`${LOG_PREFIX} Failures: ${failures.join(', ')}`);
    } else {
      console.log(`${LOG_PREFIX} [STEP 4/5] ✓ Incremental registration completed successfully`);
    }
  }

  // Verify registration
  console.log(`${LOG_PREFIX} [STEP 5/5] Verifying registration...`);
  try {
    const verifyStart = Date.now();
    const registered = await rest.get(route) as any[];
    const verifyTime = Date.now() - verifyStart;
    
    console.log(`${LOG_PREFIX} [STEP 5/5] ✓ Verification completed in ${verifyTime}ms`);
    console.log(`${LOG_PREFIX} [STEP 5/5] Discord now has ${registered.length} commands`);
    console.log(`${LOG_PREFIX} [STEP 5/5] Registered commands: ${registered.map((c: any) => c.name).join(', ')}`);
    
    // Check if all desired commands are present
    const registeredNames = new Set(registered.map((c: any) => c.name));
    const missing = desired.filter((d: any) => !registeredNames.has(d.name));
    
    if (missing.length > 0) {
      console.warn(`${LOG_PREFIX} [STEP 5/5] ⚠ WARNING: ${missing.length} commands missing after registration!`);
      console.warn(`${LOG_PREFIX} Missing: ${missing.map((c: any) => c.name).join(', ')}`);
    } else {
      console.log(`${LOG_PREFIX} [STEP 5/5] ✓ All ${desired.length} commands successfully registered`);
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} [STEP 5/5] ⚠ Could not verify registration: ${(err as any)?.message}`);
  }
  
  const totalTime = Math.floor((Date.now() - startTime) / 1000);
  console.log(`${LOG_PREFIX} ========== COMMAND REGISTRATION COMPLETE (${totalTime}s) ==========`);
}

/* ───────────────────── interaction wiring ───────────────────── */
const WIRED_SYMBOL = Symbol.for("vi.commands.wired");

function ensureWiredHandlers(
  client: Client,
  registry: { byName: Collection<string, CommandModule>; components: Map<string, any> },
) {
  // Prevent double-wiring
  if ((client as any)[WIRED_SYMBOL]) return;
  (client as any)[WIRED_SYMBOL] = true;

  client.on("interactionCreate", async (i: Interaction) => {
    try {
      /* ── Autocomplete ───────────────────────────────────────── */
      if (i.isAutocomplete()) {
        const ai = i;
        const modAny = registry.byName.get(ai.commandName) as any; // cast to access optional fields
        if (!modAny?.autocomplete) return;
        try {
          await modAny.autocomplete(ai);
        } catch (err) {
          console.warn(`[autocomplete] ${ai.commandName} errored:`, err);
        }
        return;
      }

      /* ── Chat input (slash) ────────────────────────────────── */
      if (i.isChatInputCommand()) {
        const ci = i;
        const modAny = registry.byName.get(ci.commandName) as any; // cast to access .run/.execute/.defer/.ephemeral
        const executor: undefined | ((ci: any) => Promise<any> | any) = (modAny?.run || modAny?.execute);
        if (!executor) return;

        try {
          // Read optional defer flag/function safely
          const hasDeferBool = typeof modAny?.defer === "boolean";
          const hasDeferFn = typeof modAny?.defer === "function";
          const wantsDefer: boolean = hasDeferBool
            ? !!modAny.defer
            : hasDeferFn
            ? !!modAny.defer(ci)
            : false;

          const wantsEphemeral: boolean = !!modAny?.ephemeral;

          if (wantsDefer && !ci.deferred && !ci.replied) {
            await ci.deferReply({ flags: wantsEphemeral ? MessageFlags.Ephemeral : undefined as any });
          }

          await executor(ci);

          // Fallback reply if command didn't respond
          if (!ci.deferred && !ci.replied) {
            await ci.reply({ content: "Done.", flags: wantsEphemeral ? MessageFlags.Ephemeral : undefined as any });
          }
        } catch (err) {
          console.error(`[slash] ${ci.commandName} error:`, err);
          if (ci.deferred) {
            await ci.editReply({ content: "Something went wrong executing that command." }).catch(() => {});
          } else if (!ci.replied) {
            await ci
              .reply({ content: "Something went wrong executing that command.", flags: MessageFlags.Ephemeral })
              .catch(() => {});
          }
        }
        return;
      }

      /* ── Components (buttons/selects/modals) ───────────────── */
      if (i.isMessageComponent() || i.isModalSubmit()) {
        const customId = (i as any).customId as string | undefined;
        if (!customId) return;

        // Longest-prefix match for specificity
        let bestPrefix = "";
        for (const prefix of registry.components.keys()) {
          if (customId.startsWith(prefix) && prefix.length > bestPrefix.length) {
            bestPrefix = prefix;
          }
        }
        if (!bestPrefix) return;

        const handler = registry.components.get(bestPrefix);
        if (!handler) return;

        try {
          await handler(i);
        } catch (err) {
          console.error(`[component] ${bestPrefix} handler error:`, err);
          if ("reply" in i && typeof (i as any).reply === "function" && !(i as any).replied) {
            await (i as any)
              .reply({ content: "Action failed.", flags: MessageFlags.Ephemeral })
              .catch(() => {});
          }
        }
        return;
      }
    } catch (outer) {
      console.error("[interaction] unhandled error:", outer);
      if ("reply" in i && typeof (i as any).reply === "function" && !(i as any).replied) {
        await (i as any).reply({ content: "Interaction failed.", flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    }
  });
}

/* ──────────────────────── public API ──────────────────────── */
export async function registerAndWireCommands(client: Client, guildId: string, token: string) {
  const rest = new REST({ version: "10" }).setToken(token);
  const clientId = client.user!.id;
  
  // Purge opposite scope to eliminate duplicates (if COMMAND_PURGE_OTHER is set)
  const shouldPurge = (process.env.COMMAND_PURGE_OTHER || 'true').toLowerCase() === 'true';
  if (shouldPurge) {
    try {
      if (COMMAND_SCOPE === 'guild') {
        const globalRoute = Routes.applicationCommands(clientId);
        const globalCmds = await rest.get(globalRoute) as any[];
        const commandNames = new Set(commands.map(c => c.data.name));
        const toDelete = globalCmds.filter(g => commandNames.has(g.name));
        
        if (toDelete.length > 0) {
          console.log(`[CMD-REG] 🧹 Purging ${toDelete.length} global duplicate(s): ${toDelete.map(c => c.name).join(', ')}`);
          for (const cmd of toDelete) {
            const delRoute = Routes.applicationCommand(clientId, cmd.id);
            try {
              await rest.delete(delRoute);
              console.log(`[CMD-REG]    ✂️  Deleted global '${cmd.name}'`);
            } catch (e: any) {
              console.warn(`[CMD-REG]    ⚠️  Failed to delete global '${cmd.name}': ${e?.message || e}`);
            }
            await sleep(100);
          }
          console.log('[CMD-REG] ✅ Global purge complete');
        }
      } else if (COMMAND_SCOPE === 'global') {
        const guildRoute = Routes.applicationGuildCommands(clientId, guildId);
        const guildCmds = await rest.get(guildRoute) as any[];
        const commandNames = new Set(commands.map(c => c.data.name));
        const toDelete = guildCmds.filter(g => commandNames.has(g.name));
        
        if (toDelete.length > 0) {
          console.log(`[CMD-REG] 🧹 Purging ${toDelete.length} guild duplicate(s): ${toDelete.map(c => c.name).join(', ')}`);
          for (const cmd of toDelete) {
            const delRoute = Routes.applicationGuildCommand(clientId, guildId, cmd.id);
            try {
              await rest.delete(delRoute);
              console.log(`[CMD-REG]    ✂️  Deleted guild '${cmd.name}'`);
            } catch (e: any) {
              console.warn(`[CMD-REG]    ⚠️  Failed to delete guild '${cmd.name}': ${e?.message || e}`);
            }
            await sleep(100);
          }
          console.log('[CMD-REG] ✅ Guild purge complete');
        }
      }
    } catch (purgeErr: any) {
      console.warn(`[CMD-REG] ⚠️  Purge step error: ${purgeErr?.message || purgeErr}`);
    }
  }
  
  await ensureGuildCommandsUpToDate(rest, clientId, guildId, commands);

  const registry = buildRegistry(commands);
  ensureWiredHandlers(client, registry);
}
