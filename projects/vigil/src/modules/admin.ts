import {
  Guild,
  GuildMember,
  PermissionsBitField,
  Role,
  ChannelType,
  GuildBasedChannel,
} from "discord.js";

const P = PermissionsBitField.Flags;

function hasBotPerm(guild: Guild, perm: bigint) {
  return guild.members.me?.permissions.has(perm) || false;
}

export function isAuthorizedMember(m: GuildMember): boolean {
  const sovereign = (process.env.VI_SOVEREIGN_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (sovereign.includes(m.id)) return true;
  if (m.id === m.guild.ownerId) return true;
  return (
    m.permissions.has(P.Administrator) ||
    m.permissions.has(P.ManageGuild) ||
    m.permissions.has(P.ManageRoles)
  );
}

/* ----------------------- Fuzzy helpers ----------------------- */
function levRatio(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (!m && !n) return 1;
  if (!m || !n) return 0;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  const dist = dp[m][n];
  return 1 - dist / Math.max(m, n);
}
function scoreName(hay: string, needle: string): number {
  hay = hay.toLowerCase();
  needle = needle.toLowerCase();
  if (hay === needle) return 1;
  if (hay.includes(needle)) return 0.92;
  return levRatio(hay, needle);
}

export async function findMemberFuzzy(guild: Guild, query: string): Promise<GuildMember | null> {
  const idMatch = query.match(/^<@!?(\d+)>$/) || query.match(/^\d{16,}$/);
  if (idMatch) {
    const id = idMatch[1] || idMatch[0];
    return guild.members.fetch(id).catch(() => null);
  }

  let bestMember: GuildMember | null = null;
  let bestScore = 0;
  guild.members.cache.forEach((m) => {
    const candidates = [m.displayName, m.user.username, m.nickname ?? ""];
    const s = Math.max(...candidates.map((c) => scoreName(c, query)));
    if (!bestMember || s > bestScore) { bestMember = m; bestScore = s; }
  });

  if (bestMember && bestScore >= 0.55) return bestMember;

  const all = await guild.members.fetch().catch(() => null);
  if (!all) return bestMember ?? null;

  bestMember = null; bestScore = 0;
  all.forEach((m) => {
    const candidates = [m.displayName, m.user.username, m.nickname ?? ""];
    const s = Math.max(...candidates.map((c) => scoreName(c, query)));
    if (!bestMember || s > bestScore) { bestMember = m; bestScore = s; }
  });

  return bestMember && bestScore >= 0.5 ? bestMember : null;
}

export function findRoleFuzzy(guild: Guild, name: string): Role | null {
  const lower = name.toLowerCase();
  let bestRole: Role | null = null;
  let bestScore = 0;
  guild.roles.cache.forEach((r) => {
    const s = scoreName(r.name, lower);
    if (!bestRole || s > bestScore) { bestRole = r; bestScore = s; }
  });
  return bestRole && bestScore >= 0.55 ? bestRole : null;
}

export function findChannelFuzzy(guild: Guild, name: string): GuildBasedChannel | null {
  const lower = name.toLowerCase();
  let bestChannel: GuildBasedChannel | null = null;
  let bestScore = 0;
  guild.channels.cache.forEach((c) => {
    const s = scoreName(c.name, lower);
    if (!bestChannel || s > bestScore) { bestChannel = c; bestScore = s; }
  });
  return bestChannel && bestScore >= 0.55 ? bestChannel : null;
}

/* ----------------------- Role Actions ----------------------- */
export async function createRoleAllPerms(guild: Guild, requester: GuildMember, name: string): Promise<Role> {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to create roles.");
  if (!hasBotPerm(guild, P.ManageRoles)) throw new Error("I need Manage Roles.");

  const role = await guild.roles.create({
    name: name.trim(),
    permissions: new PermissionsBitField(P.Administrator),
    mentionable: true,
    reason: `Created by Vi for ${requester.user.tag}`,
  });

  try {
    const pos = guild.members.me?.roles.highest.position ?? role.position;
    if (pos > role.position) await role.setPosition(pos - 1).catch(() => {});
  } catch {}

  return role;
}

export async function giveRoleByName(
  guild: Guild,
  requester: GuildMember,
  memberQuery: string,
  roleQuery: string,
): Promise<{ member: GuildMember; role: Role }> {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to manage roles.");
  if (!hasBotPerm(guild, P.ManageRoles)) throw new Error("I need Manage Roles.");

  const member = await findMemberFuzzy(guild, memberQuery);
  if (!member) throw new Error(`Couldn't find a member like "${memberQuery}".`);

  const role = findRoleFuzzy(guild, roleQuery);
  if (!role) throw new Error(`Couldn't find a role like "${roleQuery}".`);

  const viTop = guild.members.me?.roles.highest;
  if (viTop && role.position >= viTop.position) {
    throw new Error(`I can't manage the "${role.name}" role because it's higher than my role.`);
  }

  await member.roles.add(role, `Assigned by Vi for ${requester.user.tag}`);
  return { member, role };
}

export async function removeRoleByName(
  guild: Guild,
  requester: GuildMember,
  memberQuery: string,
  roleQuery: string,
): Promise<{ member: GuildMember; role: Role }> {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to manage roles.");
  if (!hasBotPerm(guild, P.ManageRoles)) throw new Error("I need Manage Roles.");

  const member = await findMemberFuzzy(guild, memberQuery);
  if (!member) throw new Error(`Couldn't find a member like "${memberQuery}".`);

  const role = findRoleFuzzy(guild, roleQuery);
  if (!role) throw new Error(`Couldn't find a role like "${roleQuery}".`);

  const viTop = guild.members.me?.roles.highest;
  if (viTop && role.position >= viTop.position) {
    throw new Error(`I can't remove the "${role.name}" role because it's higher than my role.`);
  }

  await member.roles.remove(role, `Removed by Vi for ${requester.user.tag}`);
  return { member, role };
}

export async function deleteRoleByName(
  guild: Guild,
  requester: GuildMember,
  roleQuery: string,
): Promise<Role> {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to delete roles.");
  if (!hasBotPerm(guild, P.ManageRoles)) throw new Error("I need Manage Roles.");

  const role = findRoleFuzzy(guild, roleQuery);
  if (!role) throw new Error(`Couldn't find a role like "${roleQuery}".`);

  const viTop = guild.members.me?.roles.highest;
  if (viTop && role.position >= viTop.position) {
    throw new Error(`I can't delete the "${role.name}" role because it's higher than my role.`);
  }

  await role.delete(`Deleted by Vi for ${requester.user.tag}`);
  return role;
}

/* ----------------------- Channel Actions ----------------------- */
export async function createChannel(
  guild: Guild,
  requester: GuildMember,
  name: string,
  type: "text" | "voice",
) {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to create channels.");
  const needed = type === "voice" ? P.ManageChannels : P.ManageChannels;
  if (!hasBotPerm(guild, needed)) throw new Error("I need Manage Channels.");

  const exists = findChannelFuzzy(guild, name);
  if (exists) throw new Error(`A channel similar to "${name}" already exists.`);

  const chan = await guild.channels.create({
    name,
    type: type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText,
    reason: `Created by Vi for ${requester.user.tag}`,
  });
  return chan;
}

export async function deleteChannelByName(
  guild: Guild,
  requester: GuildMember,
  name: string,
) {
  if (!isAuthorizedMember(requester)) throw new Error("Not authorized to delete channels.");
  if (!hasBotPerm(guild, P.ManageChannels)) throw new Error("I need Manage Channels.");

  const chan = findChannelFuzzy(guild, name);
  if (!chan) throw new Error(`Couldn't find a channel like "${name}".`);

  await chan.delete(`Deleted by Vi for ${requester.user.tag}`);
  return chan;
}
