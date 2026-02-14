import { MessageFlags } from "discord.js";
// src/utils/safeReply.ts
// Defer quickly (safe if heavy work might be fast)
export async function safeDefer(i: any, { ephemeral = true } = {}) {
  try { if (!i.deferred && !i.replied) await i.deferReply({ ephemeral }); } catch {}
}

export async function safeRespond(i: any, data: any = {}, opts: { preferDefer?: boolean } = {}) {
  const { preferDefer } = opts;
  try {
    if (i.deferred) return await i.editReply(data);
    if (i.replied)  return await i.followUp({ ...data, flags: MessageFlags.Ephemeral });
    if (preferDefer) { await i.deferReply({ flags: MessageFlags.Ephemeral }); return await i.editReply(data); }
    return await i.reply({ ...data, flags: MessageFlags.Ephemeral });
  } catch {
    try { return await i.followUp({ ...data, flags: MessageFlags.Ephemeral }); } catch {}
  }
}
