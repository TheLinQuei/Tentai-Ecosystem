// scripts/postApplications.ts
import 'dotenv/config';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Guild,
  GuildMember,
  ModalBuilder,
  PermissionFlagsBits as P,
  Role,
  TextChannel,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

// --------- Env / Args ----------
const TOKEN = process.env.DISCORD_TOKEN!;
const GUILD_ID = process.env.GUILD_ID ?? process.env.TEST_GUILD_ID;
const ARG_CHANNEL = (process.argv[2]?.trim() || ''); // panel target (ID or name)
const REVIEW_CHANNEL_ID = '1413799066688819201';     // <— hard-locked review channel
const OWNER_ID = process.env.BOT_OWNER_ID ?? process.env.FORSA_ID;
const STAFF_CSV = process.env.STAFF_CSV || 'Sovereign,The House,Starlit Orders,Sentinels';

if (!TOKEN || !GUILD_ID) {
  console.error('✗ Missing DISCORD_TOKEN or GUILD_ID.');
  process.exit(1);
}

// --------- Utility ----------
function norm(s: string) {
  return s
    .normalize('NFKC')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}\p{Emoji}\uFE0F]/gu, '')
    .replace(/[^\p{L}\p{N}\- _]/gu, '')
    .replace(/[·・]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

async function resolveTextChannel(guild: Guild, hint: string): Promise<TextChannel> {
  // Try ID first
  if (hint) {
    const byId = await guild.channels.fetch(hint).catch(() => null);
    if (byId && byId.type === ChannelType.GuildText) return byId as TextChannel;
  }
  // Fuzzy by name (emoji/prefix safe)
  const target = norm(hint || 'applications');
  const all = await guild.channels.fetch();
  let best: { ch: TextChannel; score: number } | null = null;
  for (const ch of all.values()) {
    if (!ch || ch.type !== ChannelType.GuildText) continue;
    const n = norm((ch as TextChannel).name);
    let score = 0;
    if (n === target) score = 3;
    else if (n.endsWith(target)) score = 2;
    else if (n.includes(target)) score = 1;
    if (!best || score > best.score) best = { ch: ch as TextChannel, score };
  }
  if (best) return best.ch;
  throw new Error('Could not resolve applications channel. Pass the channel ID as an argument.');
}

function needPerms(channel: TextChannel, me: GuildMember) {
  const perms = channel.permissionsFor(me);
  const required = [P.ViewChannel, P.SendMessages, P.EmbedLinks];
  const missing = required.filter(p => !perms?.has(p));
  return { ok: missing.length === 0, missing };
}

// --------- Application Catalog ----------
type AppKey = keyof typeof APPS;

const APPS = {
  admin: {
    label: 'Admin',
    emoji: '🛡️',
    roleName: 'The House',
    desc: 'High-trust leadership. Policy, safety, direction.',
    questions: [
      { id: 'exp', label: 'Admin/lead experience (servers, size, duties)?', style: TextInputStyle.Paragraph, required: true },
      { id: 'risk', label: 'Biggest moderation crisis you’ve handled?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Weekly availability (days & hours, timezone)', style: TextInputStyle.Short, required: true },
      { id: 'values', label: 'Your admin philosophy in 1–2 lines', style: TextInputStyle.Short, required: true },
      { id: 'conflict', label: 'How do you handle staff conflict?', style: TextInputStyle.Paragraph, required: true },
    ],
  },
  moderator: {
    label: 'Moderator',
    emoji: '⚔️',
    roleName: 'Starlit Orders',
    desc: 'Frontline community safety & vibe.',
    questions: [
      { id: 'exp', label: 'Mod experience (tools used, examples)?', style: TextInputStyle.Paragraph, required: true },
      { id: 'situ', label: 'How do you act on harassment reports?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Weekly availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
      { id: 'edge', label: 'Where’s your line for timeout vs ban?', style: TextInputStyle.Paragraph, required: true },
      { id: 'why', label: 'Why this server? Short answer.', style: TextInputStyle.Short, required: true },
    ],
  },
  jrmod: {
    label: 'Junior Mod',
    emoji: '🧭',
    roleName: 'Sentinels',
    desc: 'Learn the tools. Shadow seniors. Handle basics.',
    questions: [
      { id: 'exp', label: 'Any prior mod/helper experience?', style: TextInputStyle.Paragraph, required: true },
      { id: 'tone', label: 'Describe your moderation tone in 1 line', style: TextInputStyle.Short, required: true },
      { id: 'scen', label: 'A user spams slurs—your first 3 actions?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Weekly availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
      { id: 'goal', label: 'What do you want to learn on the job?', style: TextInputStyle.Short, required: true },
    ],
  },
  eventhost: {
    label: 'Event Host',
    emoji: '🎉',
    roleName: 'Bards',
    desc: 'Plan & run events. Keep it smooth.',
    questions: [
      { id: 'exp', label: 'Events you’ve run before? Outcome?', style: TextInputStyle.Paragraph, required: true },
      { id: 'pitch', label: 'Pitch an event you’d host here (1–2 lines)', style: TextInputStyle.Short, required: true },
      { id: 'plan', label: 'What prep tasks would you do beforehand?', style: TextInputStyle.Paragraph, required: true },
      { id: 'risk', label: 'What can go wrong and how do you mitigate?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
    ],
  },
  lorecurator: {
    label: 'Lore Curator',
    emoji: '📜',
    roleName: 'Bards',
    desc: 'Curate & format Codex entries with consistency.',
    questions: [
      { id: 'exp', label: 'Worldbuilding/editing experience?', style: TextInputStyle.Paragraph, required: true },
      { id: 'sample', label: 'Link one sample (doc/img) or say N/A', style: TextInputStyle.Short, required: true },
      { id: 'style', label: 'How do you enforce style/consistency?', style: TextInputStyle.Paragraph, required: true },
      { id: 'tools', label: 'Tools you use (Notion, Docs, etc.)', style: TextInputStyle.Short, required: true },
      { id: 'time', label: 'Availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
    ],
  },
  community: {
    label: 'Community Support',
    emoji: '🤝',
    roleName: 'Odysseans',
    desc: 'Greeter. Ticket triage. Light moderation.',
    questions: [
      { id: 'exp', label: 'Support/mod/helpdesk experience?', style: TextInputStyle.Paragraph, required: true },
      { id: 'conflict', label: 'How do you de-escalate?', style: TextInputStyle.Paragraph, required: true },
      { id: 'tools', label: 'Tools you know (AutoMod, Tickets, etc.)', style: TextInputStyle.Short, required: true },
      { id: 'time', label: 'Availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
      { id: 'why', label: 'Why this role?', style: TextInputStyle.Short, required: true },
    ],
  },
  developer: {
    label: 'Developer',
    emoji: '💻',
    roleName: 'Artificer',
    desc: 'Bot/site/features. Ship clean code.',
    questions: [
      { id: 'stack', label: 'Primary stack (Node/TS/etc.)', style: TextInputStyle.Short, required: true },
      { id: 'repo', label: 'Link to a repo or portfolio (or N/A)', style: TextInputStyle.Short, required: true },
      { id: 'exp', label: 'What have you shipped recently?', style: TextInputStyle.Paragraph, required: true },
      { id: 'fit', label: 'Where can you help here first?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
    ],
  },
  designer: {
    label: 'Designer',
    emoji: '🎨',
    roleName: 'Bards',
    desc: 'Brand/UI/graphics. Consistent visuals.',
    questions: [
      { id: 'port', label: 'Link to portfolio (or N/A)', style: TextInputStyle.Short, required: true },
      { id: 'tools', label: 'Tools (Figma, PS, etc.)', style: TextInputStyle.Short, required: true },
      { id: 'exp', label: 'Recent design you’re proud of?', style: TextInputStyle.Paragraph, required: true },
      { id: 'fit', label: 'What would you design for us first?', style: TextInputStyle.Paragraph, required: true },
      { id: 'time', label: 'Availability (days/hours, timezone)', style: TextInputStyle.Short, required: true },
    ],
  },
} as const;

// --------- UI builders ----------
function appRow(keys: AppKey[]) {
  const row = new ActionRowBuilder<ButtonBuilder>();
  keys.forEach((k) => {
    const a = APPS[k];
    row.addComponents(
      new ButtonBuilder().setCustomId(`apply:${k}`).setLabel(`${a.emoji} ${a.label}`).setStyle(ButtonStyle.Primary),
    );
  });
  return row;
}

function buildBoardEmbed() {
  const e = new EmbedBuilder()
    .setTitle('Applications')
    .setDescription('Pick a role below to apply. You’ll get a short form; staff will review and respond in DMs.')
    .setColor(0x111111);
  Object.values(APPS).forEach((a) => {
    e.addFields({ name: `${a.emoji} ${a.label}`, value: a.desc, inline: true });
  });
  return e;
}

function buildModal(key: AppKey, userId: string) {
  const a = APPS[key];
  const modal = new ModalBuilder().setCustomId(`modal:${key}:${userId}`).setTitle(`${a.emoji} ${a.label} Application`);
  const rows: ActionRowBuilder<TextInputBuilder>[] = [];
  a.questions.slice(0, 5).forEach((q) => {
    rows.push(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(q.id)
          .setLabel(q.label.slice(0, 45))
          .setRequired(q.required)
          .setStyle(q.style)
          .setMaxLength(q.style === TextInputStyle.Short ? 256 : 1024),
      )
    );
  });
  modal.addComponents(...rows);
  return modal;
}

function buildSubmissionEmbed(key: AppKey, applicant: GuildMember, answers: Record<string, string>) {
  const a = APPS[key];
  const e = new EmbedBuilder()
    .setTitle(`${a.emoji} ${a.label} — New Application`)
    .setDescription(a.desc)
    .setColor(0x222222)
    .addFields({ name: 'Applicant', value: `${applicant} • \`${applicant.user.tag}\` • ${applicant.id}` })
    .setTimestamp(new Date());
  a.questions.forEach((q) => {
    const val = (answers[q.id] ?? '—').slice(0, 1024);
    e.addFields({ name: q.label, value: val || '—' });
  });
  return e;
}

function reviewButtons(key: AppKey, applicantId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`review:approve:${key}:${applicantId}`).setLabel('Approve').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`review:reject:${key}:${applicantId}`).setLabel('Reject').setStyle(ButtonStyle.Danger),
  );
}

async function grantRoleIfExists(guild: Guild, member: GuildMember, roleName?: string) {
  if (!roleName) return false;
  const role = guild.roles.cache.find(r => r.name === roleName);
  if (!role) return false;
  if (member.roles.cache.has(role.id)) return true;
  await member.roles.add(role, 'Application approved');
  return true;
}

// --------- Main ----------
(async () => {
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID).then(g => g.fetch());
  const me = await guild.members.fetchMe();

  // Panel channel (from arg)
  if (!ARG_CHANNEL) {
    console.error('✗ Provide the applications channel ID or name as the first argument.');
    process.exit(1);
  }
  const appChannel = await resolveTextChannel(guild, ARG_CHANNEL);

  // Permission preflight: panel channel
  {
    const { ok, missing } = needPerms(appChannel, me);
    if (!ok) {
      const names = missing.map(p => Object.entries(P).find(([, v]) => v === p)?.[0] ?? String(p));
      console.error(`✗ Bot missing permissions in #${appChannel.name}: ${names.join(', ')}`);
      process.exit(1);
    }
  }

  // Review channel (hard-locked)
  let reviewChannel: TextChannel;
  {
    const ch = await guild.channels.fetch(REVIEW_CHANNEL_ID).catch(() => null);
    if (!ch || ch.type !== ChannelType.GuildText) {
      console.error(`✗ Review channel ${REVIEW_CHANNEL_ID} not found or not a text channel.`);
      process.exit(1);
    }
    reviewChannel = ch as TextChannel;

    const { ok, missing } = needPerms(reviewChannel, me);
    if (!ok) {
      const names = missing.map(p => Object.entries(P).find(([, v]) => v === p)?.[0] ?? String(p));
      console.error(`✗ Bot missing permissions in review #${reviewChannel.name}: ${names.join(', ')}`);
      process.exit(1);
    }
  }

  // Post the board
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const keys = Object.keys(APPS) as AppKey[];
  for (let i = 0; i < keys.length; i += 5) rows.push(appRow(keys.slice(i, i + 5)));

  const board = await appChannel.send({ embeds: [buildBoardEmbed()], components: rows });
  try { await board.pin(); } catch {}

  console.log(`✅ Applications panel posted in #${appChannel.name} (${appChannel.id}). Listening…`);
  console.log(`→ Submissions will be sent to #${reviewChannel.name} (${reviewChannel.id}).`);

  // Interactions
  client.on('interactionCreate', async (i) => {
    try {
      if (!i.inCachedGuild()) return;

      if (i.isButton() && i.customId.startsWith('apply:')) {
        const key = i.customId.split(':')[1] as AppKey;
        if (!APPS[key]) return;
        await i.showModal(buildModal(key, i.user.id));
        return;
      }

      if (i.isModalSubmit() && i.customId.startsWith('modal:')) {
        const [, key, uid] = i.customId.split(':');
        const appKey = key as AppKey;
        if (!APPS[appKey]) return;

        const member = await i.guild.members.fetch(uid).catch(() => null);
        if (!member) {
          await i.reply({ flags: MessageFlags.Ephemeral, content: 'Could not resolve your member record.' });
          return;
        }

        const answers: Record<string, string> = {};
        APPS[appKey].questions.forEach(q => { answers[q.id] = i.fields.getTextInputValue(q.id) ?? ''; });

        const staffMention = STAFF_CSV
          .split(',')
          .map(s => guild.roles.cache.find(r => r.name.trim() === s.trim()))
          .filter(Boolean)
          .map(r => `<@&${(r as Role).id}>`)
          .join(' ');

        const msg = await reviewChannel.send({
          content: staffMention || undefined,
          embeds: [buildSubmissionEmbed(appKey, member, answers)],
          components: [reviewButtons(appKey, uid)],
        });

        await i.reply({ flags: MessageFlags.Ephemeral, content: `Application submitted. Reference: ${msg.url}` });
        return;
      }

      if (i.isButton() && i.customId.startsWith('review:')) {
        const gm = i.member as GuildMember;
        if (!gm.permissions.has(P.ManageGuild) && i.user.id !== OWNER_ID) {
          await i.reply({ flags: MessageFlags.Ephemeral, content: 'Only staff can review applications.' });
          return;
        }

        const [, action, key, applicantId] = i.customId.split(':');
        const appKey = key as AppKey;
        const applicant = await i.guild.members.fetch(applicantId).catch(() => null);
        if (!applicant) {
          await i.reply({ flags: MessageFlags.Ephemeral, content: 'Applicant not found.' });
          return;
        }

        if (action === 'approve') {
          const granted = await grantRoleIfExists(i.guild, applicant, APPS[appKey].roleName);
          try { await applicant.send(`✅ Your **${APPS[appKey].label}** application was approved.`); } catch {}
          await i.update({ components: [], content: `Approved by ${i.user}. ${granted ? 'Role granted.' : 'Role not found to grant.'}` });
          return;
        }

        if (action === 'reject') {
          const modal = new ModalBuilder()
            .setCustomId(`reject:${appKey}:${applicantId}`)
            .setTitle('Rejection Reason');
          const reasonInput = new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Why rejecting? (user will see this)')
            .setRequired(true)
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(512);
          modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput));
          await (i as ButtonInteraction).showModal(modal);
          return;
        }
      }

      if (i.isModalSubmit() && i.customId.startsWith('reject:')) {
        const [, key, applicantId] = i.customId.split(':');
        const appKey = key as AppKey;
        const applicant = await i.guild.members.fetch(applicantId).catch(() => null);
        const reason = i.fields.getTextInputValue('reason') || 'No reason provided.';
        if (applicant) { try { await applicant.send(`❌ Your **${APPS[appKey].label}** application was rejected.\nReason: ${reason}`); } catch {} }
        if (i.message && i.message.edit) { await i.message.edit({ components: [] }).catch(() => {}); }
        await i.reply({ flags: MessageFlags.Ephemeral, content: 'Rejection sent.' });
        return;
      }
    } catch (err) {
      console.error('[applications] interaction error:', err);
      if (i.isRepliable()) await i.reply({ flags: MessageFlags.Ephemeral, content: 'Something went wrong.' }).catch(() => {});
    }
  });
})();
