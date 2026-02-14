// src/admin/server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { Client } from "discord.js";
import path from "path";

import { access } from "../modules/security/access";
import { CustomCommands } from "../modules/customCommands";
import { requestLogger } from "@/lib/logger";
import { register as metricsRegister, httpRequestDuration } from "@/lib/metrics";
import { requireAuth, requireRole, handleLogin } from "./auth";

// ---------- SSE (live events) ----------
type Sink = Response;
const sinks: Set<Sink> = new Set();

function ssePush(evt: string, data: any) {
  const payload = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of sinks) s.write(payload);
}

export const AdminStream = { push: ssePush };

// ---------- config ----------
const PORT = Number(process.env.ADMIN_PORT || 4310);
const ORIGIN = process.env.ADMIN_CORS_ORIGIN || "http://localhost:4311";

// ---------- attach ----------
export function attachAdminServer(client: Client): Promise<void> {
  const app = express();

  // Logging middleware
  app.use(requestLogger);

  // Metrics middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      httpRequestDuration.observe({
        method: req.method,
        route: req.path,
        status: String(res.statusCode),
      }, duration);
    });
    next();
  });

  // Security + basics
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
        },
      },
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cors({ origin: ORIGIN, credentials: false }));
  app.use(rateLimit({ windowMs: 30_000, max: 200 }));

  // Static Command Center
  app.use(express.static(path.join(process.cwd(), "admin", "public")));
  app.get(["/", "/panel", "/admin", "/command-center"], (_req, res) => {
    res.sendFile(path.join(process.cwd(), "admin", "public", "index.html"));
  });

  // Health
  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, uptime: process.uptime(), pid: process.pid });
  });
  app.get("/api/status", (_req, res) => {
    res.json({ ok: true, bot: client.user?.tag, guilds: client.guilds.cache.size });
  });

  // Prometheus metrics endpoint (public, no auth)
  app.get("/metrics", async (_req, res) => {
    res.set('Content-Type', metricsRegister.contentType);
    res.send(await metricsRegister.metrics());
  });

  // Login endpoint (public)
  app.post("/api/auth/login", handleLogin);

  // ---------- Protected routes below (require JWT) ----------

  // ---------- Guilds ----------
  app.get("/api/guilds", requireAuth, async (_req, res) => {
    const out = await Promise.all(
      client.guilds.cache.map(async (g) => {
        const lic = (await access.status(g.id as any)) as any;
        const effective = await access.canUseGuild(g.id);
        return {
          id: g.id,
          name: g.name,
          memberCount: g.memberCount,
          iconURL: g.iconURL({ size: 64 }),
          license: lic?.status || null,
          expiresAt: lic?.expiresAt || null,
          killswitch: lic?.killswitch || false,
          effective,
        };
      })
    );
    res.json(out.sort((a, b) => a.name.localeCompare(b.name)));
  });

  // ---------- Access ops (single definitions + SSE emits) ----------
  app.post("/api/access/grant", requireAuth, requireRole('admin', 'owner'), async (req, res) => {
    const Body = z.object({
      guildId: z.string().min(10),
      days: z.number().int().optional(),
      note: z.string().optional(),
    });
    const { guildId, days, note } = Body.parse(req.body);
    const lic = await access.grantGuild(guildId, days, note);
    AdminStream.push("grant", { guildId, days: days ?? null, at: Date.now() });
    res.json(lic);
  });

  app.post("/api/access/revoke", requireAuth, async (req, res) => {
    const Body = z.object({ guildId: z.string().min(10), note: z.string().optional() });
    const { guildId, note } = Body.parse(req.body);
    const lic = await access.revokeGuild(guildId, note);
    AdminStream.push("revoke", { guildId, at: Date.now() });
    res.json(lic);
  });

  app.post("/api/access/killswitch", requireAuth, async (req, res) => {
    const Body = z.object({ guildId: z.string().min(10), on: z.boolean() });
    const { guildId, on } = Body.parse(req.body);
    const lic = await access.setKillswitch(guildId, on);
    AdminStream.push("killswitch", { guildId, on, at: Date.now() });
    res.json(lic);
  });

  app.post("/api/allowlist", requireAuth, async (req, res) => {
    const Body = z.object({ guildId: z.string().min(10) });
    const { guildId } = Body.parse(req.body);
    await access.allowGuild(guildId);
    res.json({ ok: true });
  });

  app.delete("/api/allowlist/:guildId", requireAuth, async (req, res) => {
    await access.unallowGuild(req.params.guildId);
    res.json({ ok: true });
  });

  app.post("/api/denylist", requireAuth, async (req, res) => {
    const Body = z.object({ guildId: z.string().min(10) });
    const { guildId } = Body.parse(req.body);
    await access.denyGuild(guildId);
    res.json({ ok: true });
  });

  app.delete("/api/denylist/:guildId", requireAuth, async (req, res) => {
    await access.undenyGuild(req.params.guildId);
    res.json({ ok: true });
  });

  // ---------- Users: block / unblock (global) ----------
  app.post("/api/users/block", requireAuth, async (req, res) => {
    const Body = z.object({ userId: z.string().min(5) });
    const { userId } = Body.parse(req.body);
    await access.blockUser(userId);
    res.json({ ok: true });
  });

  app.post("/api/users/unblock", requireAuth, async (req, res) => {
    const Body = z.object({ userId: z.string().min(5) });
    const { userId } = Body.parse(req.body);
    await access.unblockUser(userId);
    res.json({ ok: true });
  });

  // ---------- Custom commands ----------
  app.get("/api/custom/:guildId", requireAuth, async (req, res) => {
    const list = await CustomCommands.list(req.params.guildId);
    res.json(list);
  });

  app.post("/api/custom/:guildId", requireAuth, async (req, res) => {
    const Body = z.object({
      name: z.string().regex(/^[\w-]{1,32}$/),
      description: z.string().min(1).max(100),
      response: z.string().min(1).max(1900),
      ephemeral: z.boolean().optional(),
    });
    const { name, description, response, ephemeral } = Body.parse(req.body);
    await CustomCommands.add(req.params.guildId, { name, description, response, ephemeral: !!ephemeral });
    await CustomCommands.syncGuild(client, req.params.guildId);
    res.json({ ok: true });
  });

  app.delete("/api/custom/:guildId/:name", requireAuth, async (req, res) => {
    await CustomCommands.remove(req.params.guildId, req.params.name);
    await CustomCommands.syncGuild(client, req.params.guildId);
    res.json({ ok: true });
  });

  app.post("/api/custom/:guildId/reload", requireAuth, async (req, res) => {
    await CustomCommands.syncGuild(client, req.params.guildId);
    res.json({ ok: true });
  });

  // ---------- App commands (all) ----------
  app.get("/api/appcmds/:guildId", requireAuth, async (req, res) => {
    const g = await client.guilds.fetch(req.params.guildId).catch(() => null);
    if (!g) return res.status(404).json({ error: "guild not found" });
    const cmds = await g.commands.fetch();
    res.json(
      cmds.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type,
        dmPermission: (c as any).dmPermission ?? null,
        options: (c.options?.length ?? 0),
      }))
    );
  });

  app.delete("/api/appcmds/:guildId/:id", requireAuth, async (req, res) => {
    const g = await client.guilds.fetch(req.params.guildId).catch(() => null);
    if (!g) return res.status(404).json({ error: "guild not found" });
    await g.commands.delete(req.params.id).catch((err) => res.status(400).json({ error: String(err) }));
    res.json({ ok: true });
  });

  // Members (requires GUILD_MEMBERS intent enabled on the bot)
  app.get("/api/members/:guildId", requireAuth, async (req, res) => {
    try {
      const g = await client.guilds.fetch(req.params.guildId).catch(() => null);
      if (!g) return res.status(404).json({ error: "guild not found" });
  
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  
      // Best-effort hydrate; OK if it fails (large guilds).
      await g.members.fetch().catch(() => null);
  
      let collection: any = g.members?.cache;
      const manager: any = g.members as any;
  
      // If we have a query and the API supports search, prefer that.
      if (q && typeof manager.search === "function") {
        const found = await manager.search({ query: q, limit }).catch(() => null);
        if (found && found.size) collection = found;
      }
  
      if (!collection) return res.json([]);
  
      const arr = Array.from(collection.values());
      const out = arr.slice(0, limit).map((m: any) => ({
        id: m.id,
        tag: m.user?.tag ?? `${m.user?.tag || "unknown"}#0000`,
        nick: m.nickname || null,
        roles: (m.roles?.cache ? Array.from(m.roles.cache.values()) : []).map((r: any) => ({ id: r.id, name: r.name })),
        joinedAt: m.joinedAt?.toISOString() ?? null,
      }));
  
      return res.json(out);
    } catch (err) {
      console.error("[admin] /api/members error:", err);
      return res.status(500).json({ error: "members_failed" });
    }
  });

  // ---------- Command Deployment ----------
  app.post("/api/commands/deploy/:scope", requireAuth, requireRole('admin', 'owner'), async (req, res) => {
    const Body = z.object({
      guildId: z.string().optional(),
      subset: z.enum(['core', 'full']).optional(),
    });
    const { guildId, subset } = Body.parse(req.body);
    const scope = req.params.scope; // 'global' | 'guild'
    
    if (scope !== 'global' && scope !== 'guild') {
      return res.status(400).json({ error: 'scope must be global or guild' });
    }
    
    if (scope === 'guild' && !guildId) {
      return res.status(400).json({ error: 'guildId required for guild scope' });
    }

    try {
      // Dynamic import to get commands
      const { commands: allCommands } = await import('../commands/index.js');
      const coreCommands = ['beep', 'event', 'poll', 'xp', 'status'];
      const selectedCommands = subset === 'core' 
        ? allCommands.filter((c: any) => coreCommands.includes(c.data.name))
        : allCommands;

      const commandData = selectedCommands.map((cmd: any) => cmd.data.toJSON());

      // Use Discord API to deploy
      const route = (scope === 'global'
        ? `/applications/${client.user!.id}/commands`
        : `/applications/${client.user!.id}/guilds/${guildId}/commands`) as `/${string}`;

      const deployed = await client.rest.put(route, { body: commandData }) as any[];

      AdminStream.push('commands_deployed', { 
        scope, 
        guildId: guildId || null, 
        count: deployed.length,
        subset: subset || 'full',
        at: Date.now() 
      });

      res.json({ 
        ok: true, 
        scope,
        count: deployed.length,
        commands: deployed.map((c: any) => c.name)
      });
    } catch (err: any) {
      console.error('[admin] command deployment error:', err);
      res.status(500).json({ error: err?.message || 'deployment_failed' });
    }
  });

  app.get("/api/commands/list", requireAuth, async (_req, res) => {
    try {
      const { commands } = await import('../commands/index.js');
      res.json({
        total: commands.length,
        commands: commands.map((c: any) => ({
          name: c.data.name,
          description: c.data.description,
        }))
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'list_failed' });
    }
  });

  // ---------- SSE endpoint ----------
  app.get("/api/events", requireAuth, (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    (res as any).flushHeaders?.();
    res.write("retry: 3000\n\n");
    sinks.add(res);
    req.on("close", () => sinks.delete(res));
  });

  // ---------- start ----------
  return new Promise<any>((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`[command-center] Vi Command Center listening on :${PORT}`);
      resolve(server);
  }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[ADMIN] ❌ Port ${PORT} already in use`);
        console.error(`[ADMIN] Exiting for watchdog restart...`);
        setTimeout(() => process.exit(99), 1000); // exit code 99 signals watchdog to restart
      } else {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
}
