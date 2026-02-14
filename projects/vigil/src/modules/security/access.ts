// src/modules/security/access.ts
import { promises as fs } from "fs";
import path from "path";
import type { Interaction } from "discord.js";
import { PermissionFlagsBits as P } from "discord.js";
import { MessageFlags } from "discord.js";

export type LicenseStatus = "active" | "revoked";

export interface GuildLicense {
  guildId: string;
  status: LicenseStatus;
  expiresAt?: string | null;
  killswitch?: boolean;
  note?: string;
  updatedAt: string;
}

export interface AccessState {
  allowlist: string[];
  denylist: string[];
  blockedUsers: string[];
  guilds: Record<string, GuildLicense>;
}

const DEFAULT_STATE: AccessState = {
  allowlist: [],
  denylist: [],
  blockedUsers: [],
  guilds: {},
};

function nowISO() { return new Date().toISOString(); }
function isExpired(lic?: GuildLicense): boolean {
  if (!lic?.expiresAt) return false;
  return Date.now() > Date.parse(lic.expiresAt);
}

export class AccessStore {
  private dbPath: string;
  private state: AccessState | null = null;

  constructor(customPath?: string) {
    this.dbPath = customPath || process.env.ACCESS_DB_PATH || path.join(process.cwd(), "data", "access.json");
  }
  private async ensureDir() {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
  }
  async load(): Promise<AccessState> {
    if (this.state) return this.state;
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.dbPath, "utf8");
      this.state = { ...DEFAULT_STATE, ...JSON.parse(raw) } as AccessState;
    } catch {
      this.state = { ...DEFAULT_STATE };
      await this.save();
    }
    return this.state;
  }
  async save(): Promise<void> {
    await this.ensureDir();
    await fs.writeFile(this.dbPath, JSON.stringify(this.state ?? DEFAULT_STATE, null, 2), "utf8");
  }

  // Queries
  async canUseGuild(guildId: string): Promise<boolean> {
    const s = await this.load();
    if (!guildId) return false;
    const lic = s.guilds[guildId];
    if (lic?.killswitch) return false;
    if (s.denylist.includes(guildId)) return false;
    if (s.allowlist.length > 0 && !s.allowlist.includes(guildId)) return false;
    if (!lic) return false;
    if (lic.status !== "active") return false;
    if (isExpired(lic)) return false;
    return true;
  }
  async isUserBlocked(userId: string): Promise<boolean> {
    const s = await this.load();
    return s.blockedUsers.includes(userId);
  }

  // Mutations
  async grantGuild(guildId: string, days?: number, note?: string): Promise<GuildLicense> {
    const s = await this.load();
    const expiresAt = typeof days === "number" && days > 0 ? new Date(Date.now() + days * 86400000).toISOString() : undefined;
    const lic: GuildLicense = { guildId, status: "active", expiresAt, killswitch: false, note, updatedAt: nowISO() };
    s.guilds[guildId] = lic; await this.save(); return lic;
  }
  async revokeGuild(guildId: string, note?: string): Promise<GuildLicense> {
    const s = await this.load();
    const curr = s.guilds[guildId] || ({ guildId } as GuildLicense);
    const lic: GuildLicense = { ...curr, guildId, status: "revoked", updatedAt: nowISO(), note };
    s.guilds[guildId] = lic; await this.save(); return lic;
  }
  async setKillswitch(guildId: string, on: boolean): Promise<GuildLicense> {
    const s = await this.load();
    const lic = s.guilds[guildId] || ({ guildId, status: on ? "revoked" : "active", updatedAt: nowISO() } as GuildLicense);
    lic.killswitch = on; lic.updatedAt = nowISO();
    s.guilds[guildId] = lic; await this.save(); return lic;
  }
  async allowGuild(guildId: string) { const s = await this.load(); if (!s.allowlist.includes(guildId)) s.allowlist.push(guildId); await this.save(); }
  async denyGuild(guildId: string) { const s = await this.load(); if (!s.denylist.includes(guildId)) s.denylist.push(guildId); await this.save(); }
  async unallowGuild(guildId: string) { const s = await this.load(); s.allowlist = s.allowlist.filter(g => g !== guildId); await this.save(); }
  async undenyGuild(guildId: string) { const s = await this.load(); s.denylist = s.denylist.filter(g => g !== guildId); await this.save(); }
  async blockUser(userId: string) { const s = await this.load(); if (!s.blockedUsers.includes(userId)) s.blockedUsers.push(userId); await this.save(); }
  async unblockUser(userId: string) { const s = await this.load(); s.blockedUsers = s.blockedUsers.filter(u => u !== userId); await this.save(); }
  async status(guildId?: string) { const s = await this.load(); return guildId ? s.guilds[guildId] : s; }
}

export const access = new AccessStore();

export async function enforceAccess(i: Interaction): Promise<boolean> {
  if (!i.guildId) return false;
  const allowed = await access.canUseGuild(i.guildId);
  const userBlocked = i.user ? await access.isUserBlocked(i.user.id) : false;
  if (allowed && !userBlocked) return true;

  try {
    const isAdmin = "memberPermissions" in i && (i as any).memberPermissions?.has(P.Administrator);
    if (isAdmin && i.isRepliable()) {
      await i.reply({
        content: `⚠️ Vi is disabled in this server. ${userBlocked ? "(Your user is blocked.) " : ""}Ask the owner to grant a license or remove the revoke/killswitch.`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch { /* ignore */ }
  return false;
}
