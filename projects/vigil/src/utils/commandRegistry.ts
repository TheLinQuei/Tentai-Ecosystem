import { REST, Routes, type RESTPostAPIApplicationGuildCommandsJSONBody } from "discord.js";

export async function upsertGuildCommandsNonDestructive(
  rest: REST,
  appId: string,
  guildId: string,
  defs: RESTPostAPIApplicationGuildCommandsJSONBody[],
  opts?: { namespace?: string; deleteStale?: boolean }
) {
  const existing = (await rest.get(
    Routes.applicationGuildCommands(appId, guildId)
  )) as any[];

  const byName = new Map(existing.map(c => [c.name, c]));
  let upserts = 0, created = 0, deleted = 0;

  // create / update each def
  for (const def of defs) {
    const prev = byName.get(def.name);
    if (prev) {
      await rest.patch(
        Routes.applicationGuildCommand(appId, guildId, prev.id),
        { body: def }
      );
      upserts++;
    } else {
      await rest.post(
        Routes.applicationGuildCommands(appId, guildId),
        { body: def }
      );
      created++;
    }
  }

  // optional: delete stale only within a namespace (safe)
  if (opts?.deleteStale && opts.namespace) {
    for (const c of existing) {
      if (c.name.startsWith(opts.namespace) && !defs.find(d => d.name === c.name)) {
        await rest.delete(Routes.applicationGuildCommand(appId, guildId, c.id));
        deleted++;
      }
    }
  }

  return { upserts, created, deleted };
}
