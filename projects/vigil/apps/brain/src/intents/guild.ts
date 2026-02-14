/**
 * Guild Intent Mapping
 * Fast mapping from natural language intents to correct guild tools.
 */

export const guildIntentMap: Record<string, string> = {
  // Member queries
  'how many members': 'guild.member.count',
  'member count': 'guild.member.count',
  'how many people': 'guild.member.count',
  'total members': 'guild.member.count',

  // Owner queries
  'who owns': 'guild.owner',
  'who is the owner': 'guild.owner',
  'who owns this server': 'guild.owner',
  'server owner': 'guild.owner',
  'guild owner': 'guild.owner',
  'owner of this server': 'guild.owner',

  // Icon queries
  'server icon': 'guild.icon',
  'guild icon': 'guild.icon',
  'icon url': 'guild.icon',

  // Admin queries
  'admins': 'guild.roles.admins',
  'admin': 'guild.roles.admins',
  'administrators': 'guild.roles.admins',
  'administrator': 'guild.roles.admins',
  'who are admins': 'guild.roles.admins',
  'who are the admin': 'guild.roles.admins',
  'who are the admins': 'guild.roles.admins',
  'server admins': 'guild.roles.admins',
  'who are the admin in this server': 'guild.roles.admins',

  // Permissions queries
  'permissions': 'guild.member.permissions',
  'my permissions': 'guild.member.permissions',
  'what can i do': 'guild.member.permissions',
  'my perms': 'guild.member.permissions',

  // Roles queries
  'my roles': 'guild.member.roles',
  'what roles do i have': 'guild.member.roles',
  'user roles': 'guild.member.roles',
  'highest role': 'guild.roles.highest',
  'what is your role': 'guild.bot.role',
  'what role do you have': 'guild.bot.role',
  'what are your roles': 'guild.bot.role',
  'your roles': 'guild.bot.role',

  // Uptime queries
  'uptime': 'guild.uptime',
  'how long online': 'guild.uptime',
  'bot uptime': 'guild.uptime',
  'how long have you been online': 'guild.uptime',
  'how long have you been running': 'guild.uptime',

  // Server info queries
  'server info': 'guild.info',
  'guild info': 'guild.info',
  'about this server': 'guild.info',
  'tell me about this server': 'guild.info',
  'how old is this server': 'guild.info',
  'server age': 'guild.info',
  'when was this server created': 'guild.info',

  // Stats queries
  'server stats': 'guild.stats.overview',
  'guild stats': 'guild.stats.overview',
  'how active': 'guild.stats.overview',
  'online count': 'guild.stats.overview',
  'how many members in this server': 'guild.member.count',

  // Boost queries
  'boosts': 'guild.boost.stats',
  'boost count': 'guild.boost.stats',
  'boost level': 'guild.boost.stats',
  'server boosts': 'guild.boost.stats',

  // Channel queries
  'list channels': 'guild.channels.list',
  'all channels': 'guild.channels.list',
  'show channels': 'guild.channels.list',

  // Join date queries
  'when did i join': 'guild.member.joinedAt',
  'join date': 'guild.member.joinedAt',
  'when joined': 'guild.member.joinedAt',

  // Health queries
  'health': 'guild.health',
  'system health': 'guild.health',
  'status check': 'guild.health',

  // Latency queries
  'latency': 'guild.latency',
  'ping': 'guild.latency',
  'api latency': 'guild.latency',

  // Commands queries
  'commands': 'guild.commands.sync',
  'slash commands': 'guild.commands.sync',
  'registered commands': 'guild.commands.sync',

  // Moderation queries
  'moderation stats': 'guild.moderation.stats',
  'mod stats': 'guild.moderation.stats',
  'bans': 'guild.moderation.stats',
  'kicks': 'guild.moderation.stats',
  'mod actions': 'guild.moderation.stats',
  'recent bans': 'guild.moderation.stats',
  'recent kicks': 'guild.moderation.stats',
  'audit log stats': 'guild.moderation.stats',

  // Invites queries
  'invites': 'guild.invites.list',
  'invite links': 'guild.invites.list',
  'active invites': 'guild.invites.list',
  'list invites': 'guild.invites.list',
  'show invites': 'guild.invites.list',

  // Webhooks queries
  'webhooks': 'guild.webhooks.list',
  'list webhooks': 'guild.webhooks.list',
  'active webhooks': 'guild.webhooks.list',
  'show webhooks': 'guild.webhooks.list',

  // Identity queries
  'who am i': 'identity.user.self',
  'what is my name': 'identity.user.self',
  'my identity': 'identity.user.self',
  'who are you talking to': 'identity.user.self',
  'who made you': 'identity.creator',
  'who built you': 'identity.creator',
  'who created you': 'identity.creator',
  'your creator': 'identity.creator',
  'your builder': 'identity.creator',
  'who is kaelen': 'identity.lookup',
  'who is forsa': 'identity.lookup',
  'who is the lin quei': 'identity.lookup',
  'lookup user': 'identity.lookup',
};

export function resolveGuildIntent(query: string | undefined | null): string | null {
  if (!query) return null;
  const normalized = query.toLowerCase().trim();
  // BUG-002 heuristic guard: avoid mapping qualitative / conversational queries directly
  const qualitativeTokens = ['vibe','feel','feeling','atmosphere','mood','engagement','busy today','active today','active right now'];
  if (qualitativeTokens.some(tok => normalized.includes(tok))) return null;
  const clauseFragments = normalized.split(/\b(and|then|but)\b|[?!\.]/).map(s => s?.trim() || '').filter(Boolean);
  const longClauses = clauseFragments.filter(s => s.length > 40);
  if (longClauses.length > 1) return null;
  if (guildIntentMap[normalized]) return guildIntentMap[normalized];
  for (const [intent, tool] of Object.entries(guildIntentMap)) {
    if (normalized.includes(intent)) {
      if (qualitativeTokens.some(tok => normalized.includes(tok))) return null;
      return tool;
    }
  }
  return null;
}
