import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { registerAndWireCommands } from '../command';
import { CONFIG } from '../config';

const OWNER_ID = process.env.BOT_OWNER_ID || process.env.FORSA_ID || '';

export const data = new SlashCommandBuilder()
  .setName('refresh')
  .setDescription('[Owner] Re-register slash commands now');

export async function execute(i: ChatInputCommandInteraction) {
  if (i.user.id !== OWNER_ID) {
    return i.reply({ content: '❌ Owner only.', flags: MessageFlags.Ephemeral });
  }
  
  // Defer immediately to avoid 3s timeout
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err: any) {
    // If defer fails due to expired token, try to reply directly
    if (err?.code === 10062) {
      console.error('[slash] /refresh interaction expired before defer - command may have been delayed');
      return;
    }
    throw err;
  }

  let registered = 0; const errs: string[] = [];
  let shopPresent = 0; const guildCount = i.client.guilds.cache.size;
  
  for (const [gid] of i.client.guilds.cache) {
    try { 
      // Register all commands (core + progression unified)
      await registerAndWireCommands(i.client, gid, CONFIG.DISCORD_TOKEN);
      registered++;
    } catch (e:any) { 
      errs.push(`${gid}:${e?.message||e}`); 
    }

    // Verify '/shop' presence post-sync (best-effort)
    try {
      const g = i.client.guilds.cache.get(gid);
      if (g) {
        const fetched = await g.commands.fetch();
        const names = [...fetched.values()].map((c) => c.name);
        if (names.includes('shop')) shopPresent++;
      }
    } catch {/* ignore */}
  }
  
  const msg = [
    `🔁 Refresh complete.`,
    `• Registered: ${registered}/${guildCount} guilds`,
    `• /shop present: ${shopPresent}/${guildCount}`,
    errs.length ? `\n\nErrors:\n${errs.slice(0, 5).join('\n')}${errs.length > 5 ? `\n...and ${errs.length - 5} more` : ''}` : ''
  ].filter(Boolean).join('\n');
  
  await i.editReply({ content: msg });
}
