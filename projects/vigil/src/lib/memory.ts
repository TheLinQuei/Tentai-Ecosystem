import fs from 'fs';
import path from 'path';
import { Guild, User, PermissionsBitField } from 'discord.js';
import { ensureLongtermSchema, recall } from './longterm.js';
import { deriveRelationship } from './relationship.js';

interface MemoryUser {
  id: string;
  username: string;
  displayName: string;
  trust: number;
  tone: string;
  toneProfile: string;
  dominantEmotion: string;
  personaTier: string;
  aliases: string[];
  notes: string[];
  lastSeen: number;
}
interface MemoryServer {
  id: string;
  name: string;
  ownerId: string;
  admins: string[];
  mods: string[];
  nsfw: boolean;
  modules: string[];
}
interface MemorySession {
  messages: { userId: string; content: string; time: number }[];
  participants: Record<string, number>;
  context: string;
  lastActive: number;
  mood: string;
  history: { userId: string; content: string; time: number }[];
  topicCounts: Record<string, number>;
}

interface ViBrainMemory {
  users: Record<string, MemoryUser>;
  servers: Record<string, MemoryServer>;
  sessions: Record<string, MemorySession>;
}

// In-memory short-term memory (ViBrain)
export const memory: ViBrainMemory = {
  users: {},
  servers: {},
  sessions: {}
};

const memoryDir = path.join(process.cwd(), 'memory');
const vibrainPath = path.join(memoryDir, 'vibrain.json');
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}
let savingMemory = false;

/**
 * Load short-term memory from disk, or initialize if not present.
 */
export function loadShortTermMemory(): void {
  let loaded = false;
  if (fs.existsSync(vibrainPath)) {
    try {
      const raw = fs.readFileSync(vibrainPath, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data === 'object') {
        if (data.users) memory.users = data.users;
        if (data.servers) memory.servers = data.servers;
        if (data.sessions) memory.sessions = data.sessions;
      }
      loaded = true;
    } catch {
      // If file is corrupted, reset memory
      memory.users = {};
      memory.servers = {};
      memory.sessions = {};
      fs.writeFileSync(vibrainPath, JSON.stringify(memory, null, 2));
      console.warn('⚠️ vibrain.json was invalid. Resetting memory.');
    }
  } else {
    // No prior memory file; create a new one
    fs.writeFileSync(vibrainPath, JSON.stringify(memory, null, 2));
  }
  if (loaded) {
    console.log(`🧠 ViBrain loaded with ${Object.keys(memory.users).length} users.`);
  } else {
    console.log('🧠 ViBrain starting fresh.');
  }
  // Sync with long-term profiles for trust/tone
  const ownerId = process.env.OWNER_ID ?? process.env.BOT_OWNER_ID ?? process.env.FORSA_ID;
  const ownerProfile = ownerId ? recall(ownerId) : null;
  for (const userId in memory.users) {
    const memUser = memory.users[userId];
    const ltUser = recall(userId);
    if (userId === ownerId && ownerProfile) {
      // Elevate bot owner to max trust and devoted tone
      memUser.trust = ownerProfile.trust ?? 10;
      memUser.tone = ownerProfile.toneProfile || 'devoted';
      memUser.toneProfile = ownerProfile.toneProfile || 'devoted';
    } else if (ltUser) {
      // Sync others' trust and tone from their long-term profile
      memUser.trust = ltUser.trust ?? memUser.trust;
      memUser.tone = ltUser.toneProfile || memUser.tone || 'neutral';
      memUser.toneProfile = ltUser.toneProfile || memUser.toneProfile || 'neutral';
    }
    memUser.personaTier = deriveRelationship(memUser.trust ?? 0);
  }
  // Ensure owner is tracked in memory (if not already present)
  if (ownerId && ownerProfile && !memory.users[ownerId]) {
    memory.users[ownerId] = {
      id: ownerId,
      username: ownerProfile.name || 'Owner',
      displayName: ownerProfile.displayName || ownerProfile.name || 'Owner',
      trust: ownerProfile.trust ?? 10,
      tone: ownerProfile.toneProfile || 'devoted',
      toneProfile: ownerProfile.toneProfile || 'devoted',
      dominantEmotion: ownerProfile.emotionalPattern || 'neutral',
      personaTier: 'rideOrDie',
      aliases: ownerProfile.aliases || [],
      notes: [],
      lastSeen: Date.now()
    };
    console.log('🔐 Owner profile synced to memory.');
  }
  saveShortTermMemory();
}

/** Save short-term memory to disk (async). */
export function saveShortTermMemory(): void {
  if (savingMemory) return;
  savingMemory = true;
  fs.writeFile(vibrainPath, JSON.stringify(memory, null, 2), err => {
    if (err) console.error('❌ Error saving memory:', err);
    savingMemory = false;
  });
}

/** Track a new user (or update lastSeen for existing user). */
export function trackUser(user: User): void {
  const userId = user.id;
  if (!memory.users[userId]) {
    ensureLongtermSchema(userId, user.username);
    const profile = recall(userId);
    memory.users[userId] = {
      id: userId,
      username: user.username,
      displayName: (user as any).globalName || user.username,
      trust: profile?.trust ?? 0,
      tone: profile?.toneProfile || 'neutral',
      toneProfile: profile?.toneProfile || 'neutral',
      dominantEmotion: profile?.emotionalPattern || 'neutral',
      personaTier: deriveRelationship(profile?.trust ?? 0),
      aliases: profile?.aliases || [],
      notes: [],
      lastSeen: Date.now()
    };
    console.log(`🧠 New user tracked: ${user.username} (${userId})`);
    saveShortTermMemory();
  } else {
    // Existing user: update last seen and display name
    memory.users[userId].lastSeen = Date.now();
    memory.users[userId].displayName = (user as any).globalName || user.username;
  }
}

/** Track a guild (server) and identify its admin/moderator users. */
export function trackServer(server: Guild): void {
  const serverId = server.id;
  if (!memory.servers[serverId]) {
    memory.servers[serverId] = {
      id: serverId,
      name: server.name,
      ownerId: server.ownerId,
      admins: [],
      mods: [],
      nsfw: false,
      modules: []
    };
    console.log(`🏛️ Tracked server: ${server.name}`);
  }
  // Update admin and mod lists (by permission)
  const serverMemory = memory.servers[serverId];
  serverMemory.ownerId = server.ownerId;
  serverMemory.admins = [];
  serverMemory.mods = [];
  for (const member of server.members.cache.values()) {
    if (member.user.bot) continue;
    if (member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      serverMemory.admins.push(member.user.id);
    } else if (member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      serverMemory.mods.push(member.user.id);
    }
  }
  if (serverMemory.admins.length || serverMemory.mods.length) {
    console.log(`🔍 Found ${serverMemory.admins.length} admins and ${serverMemory.mods.length} mods in ${server.name}.`);
  }
}
