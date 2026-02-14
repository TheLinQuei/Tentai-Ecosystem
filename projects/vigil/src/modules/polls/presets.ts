import { BuiltPoll, Preset, getPreset, listPresets, savePreset, deletePreset } from "./storage";

export async function list(guildId: string): Promise<Preset[]> {
  return listPresets(guildId);
}

export async function use(guildId: string, name: string): Promise<BuiltPoll | null> {
  const p = await getPreset(guildId, name);
  if (!p) return null;
  return {
    question: p.question,
    answers: p.answers.map(a => ({ label: a.label, emoji: a.emoji })),
    anonymous: p.defaults?.anonymous ?? false,
    multi: p.defaults?.multi ?? false,
    durationMs: p.defaults?.durationMs ?? 3600000,
    roleGateId: p.defaults?.roleGateId,
    makeThread: p.defaults?.makeThread ?? false,
    live: p.defaults?.live ?? true,
    dmCreator: p.defaults?.dmCreator ?? false,
  };
}

export async function save(guildId: string, p: Preset) {
  const clean: Preset = {
    name: p.name.trim(),
    question: p.question.trim(),
    answers: p.answers.map(a => ({ label: a.label.trim(), emoji: a.emoji?.trim() || undefined })),
    defaults: p.defaults ? {
      anonymous: !!p.defaults.anonymous,
      multi: !!p.defaults.multi,
      durationMs: Math.max(60000, Number(p.defaults.durationMs ?? 3600000)),
      roleGateId: p.defaults.roleGateId,
      makeThread: !!p.defaults.makeThread,
      live: p.defaults.live ?? true,
      dmCreator: !!p.defaults.dmCreator,
    } : undefined,
  };
  await savePreset(guildId, clean);
}

export async function remove(guildId: string, name: string): Promise<boolean> {
  return deletePreset(guildId, name);
}
