// scripts/vi-audit.mjs
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SRC  = path.join(ROOT, 'src');

function readJson(p, fallback={}) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function readFileSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function listFiles(dir) {
  const out = [];
  (function walk(d) {
    for (const name of (fs.existsSync(d) ? fs.readdirSync(d) : [])) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else out.push(full);
    }
  })(dir);
  return out;
}
function rel(p){ return p.replace(`${ROOT}${path.sep}`, ''); }

function findSlashNames(files) {
  const rx = /\.setName\(['"`]([a-z0-9_\-]+)['"`]\)/gi;
  const results = [];
  for (const f of files) {
    const text = readFileSafe(f);
    if (!/SlashCommandBuilder/.test(text)) continue;
    let m;
    while ((m = rx.exec(text))) results.push({ name: m[1], file: rel(f) });
  }
  // dedupe
  const seen=new Set(); return results.filter(r=>{ const k=r.name; if(seen.has(k))return false; seen.add(k); return true; });
}

function findEnvVars(files) {
  const rx = /process\.env\.([A-Z0-9_]+)/g;
  const set = new Set();
  for (const f of files) {
    const txt = readFileSafe(f);
    let m; while ((m = rx.exec(txt))) set.add(m[1]);
  }
  return [...set].sort();
}

function findListeners(files) {
  const rx = /client\.(once|on)\(['"`]([a-zA-Z0-9:_-]+)['"`]/g;
  const out = [];
  for (const f of files) {
    const txt = readFileSafe(f);
    let m; while ((m = rx.exec(txt))) out.push({ type:m[1], event:m[2], file: rel(f) });
  }
  return out;
}

function findIntervals(files) {
  const rx = /setInterval\s*\(/g;
  const out = [];
  for (const f of files) {
    const txt = readFileSafe(f);
    if (rx.test(txt)) out.push(rel(f));
  }
  return out;
}

function tree(dir, depth=2) {
  function walk(d, level=0) {
    if (level>depth) return [];
    const entries = fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes:true }) : [];
    const lines = [];
    for (const e of entries) {
      const p = path.join(d, e.name);
      const prefix = '  '.repeat(level) + (e.isDirectory() ? '📂 ' : '📄 ');
      lines.push(prefix + e.name);
      if (e.isDirectory()) lines.push(...walk(p, level+1));
    }
    return lines;
  }
  return walk(dir).join('\n');
}

// Collect
const pkg = readJson(path.join(ROOT, 'package.json'));
const files = listFiles(SRC).filter(f => /\.(ts|js|tsx|mjs|cjs)$/.test(f));
const cmdFiles = files.filter(f => /src[\/\\]commands[\/\\].*\.(ts|js)$/.test(f));
const featureFiles = files.filter(f => /src[\/\\](features|modules)[\/\\].*\.(ts|js)$/.test(f));
const prismaSchema = readFileSafe(path.join(ROOT, 'prisma', 'schema.prisma'));

const commands = findSlashNames(cmdFiles);
const envs = findEnvVars(files);
const listeners = findListeners(featureFiles.concat(files.filter(f=>/src[\/\\]index\.(ts|js)$/.test(f))));
const intervals = findIntervals(files);

// Output
let md = '';
md += `# ViBot Audit Report\n\n`;
md += `Generated: ${new Date().toISOString()}\n\n`;

md += `## Package\n`;
md += `**name**: \`${pkg.name || 'unknown'}\`\n\n`;
md += `**scripts**:\n\n`;
for (const [k,v] of Object.entries(pkg.scripts || {})) md += `- \`${k}\`: \`${v}\`\n`;
md += `\n**dependencies**: ${Object.keys(pkg.dependencies||{}).length} • **devDependencies**: ${Object.keys(pkg.devDependencies||{}).length}\n\n`;

md += `## Directory Snapshot (src)\n`;
md += '```\n' + tree(SRC, 3) + '\n```\n\n';

md += `## Slash Commands (${commands.length})\n`;
if (!commands.length) md += `*(none detected)*\n\n`; else {
  md += commands.map(c => `- \`/${c.name}\` — ${c.file}`).join('\n') + '\n\n';
}

md += `## Event Listeners (${listeners.length})\n`;
if (!listeners.length) md += `*(none)*\n\n`; else {
  md += listeners.map(e => `- \`${e.type}\` **${e.event}** — ${e.file}`).join('\n') + '\n\n';
}

md += `## Timers / Schedules (files using setInterval)\n`;
md += intervals.length ? intervals.map(f=>`- ${f}`).join('\n') + '\n\n' : '*none*\n\n';

md += `## ENV Vars Referenced (${envs.length})\n`;
md += envs.length ? envs.map(n=>`- \`${n}\``).join('\n') + '\n\n' : '*none*\n\n';

if (prismaSchema) {
  md += `## Prisma Schema (excerpt)\n`;
  const short = prismaSchema.split('\n').slice(0, 300).join('\n');
  md += '```prisma\n' + short + '\n```\n\n';
}

md += `## Notes\n`;
md += `- If some commands don't appear above, ensure each file exports \`data: SlashCommandBuilder\` and \`execute()\`.\n`;
md += `- ENV list helps build a clean \`.env.example\`.\n`;

fs.writeFileSync('VIBOT_REPORT.md', md, 'utf8');
console.log('Wrote VIBOT_REPORT.md');
