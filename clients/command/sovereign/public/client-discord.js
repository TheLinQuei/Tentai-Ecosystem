// Discord Client Workspace
import { getSession, navigateTo, showOverseerOverlay, api } from './app.js';

const root = document.getElementById('app-root');

export async function renderDiscordClient() {
  const session = getSession();

  root.innerHTML = `
    <div class="client-workspace">
      <header class="workspace-header">
        <button class="back-btn" id="backBtn">← Clients</button>
        <div class="workspace-title">
          <div class="workspace-name">Discord Bot</div>
          <div class="workspace-scope">Servers, Commands, Operations</div>
        </div>
        ${session?.founder ? `<button class="overseer-btn" id="overseerBtn">⚙️ Overseer</button>` : ''}
      </header>
      <main class="workspace-body discord-workspace">
        <div class="discord-main">
          <section class="discord-section">
            <div class="section-title">Bot Status</div>
            <div class="section-body" id="discordStatus">
              <div class="panel-empty">Loading bot status...</div>
            </div>
          </section>
          <section class="discord-section">
            <div class="section-title">Server List</div>
            <div class="section-body" id="discordServers">
              <div class="panel-empty">Loading servers...</div>
            </div>
          </section>
          <section class="discord-section">
            <div class="section-title">Audit Logs</div>
            <div class="section-body">
              <div class="panel-empty">Discord-scoped audit stream (SSE) will appear here when wired.</div>
            </div>
          </section>
        </div>
        <aside class="discord-sidebar">
          <div class="sidebar-section">
            <div class="sidebar-title">Discord Ops Copilot</div>
            <div class="sidebar-scope">Discord-scoped Vi chat</div>
            <div class="sidebar-body">
              <div class="panel-empty">Ops-focused chat will appear here. Wiring pending.</div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => navigateTo('/clients'));
  if (session?.founder) {
    document.getElementById('overseerBtn')?.addEventListener('click', showOverseerOverlay);
  }

  // Hydrate bot status
  const statusEl = document.getElementById('discordStatus');
  const res = await api('/api/discord/status');
  if (res.ok && res.body?.ok) {
    const status = res.body.data;
    statusEl.innerHTML = `
      <div class="kv-grid">
        <div class="kv-item"><div class="kv-key">Connection</div><div class="kv-value">${status.connected ? 'Connected' : 'Disconnected'}</div></div>
        <div class="kv-item"><div class="kv-key">Bot User</div><div class="kv-value">${status.botUser || '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Latency</div><div class="kv-value">${status.latencyMs ? status.latencyMs + ' ms' : '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Servers</div><div class="kv-value">${status.serverCount ?? '—'}</div></div>
      </div>
    `;
  } else {
    statusEl.innerHTML = `<div class="panel-empty">${res.body?.error || 'Bot not connected'}</div>`;
  }

  // Hydrate server list
  const serversEl = document.getElementById('discordServers');
  const serversRes = await api('/api/discord/servers');
  if (serversRes.ok && serversRes.body?.ok) {
    const servers = serversRes.body.data;
    if (!servers.length) {
      serversEl.innerHTML = '<div class="panel-empty">No servers found.</div>';
    } else {
      let html = '<div class="server-list">';
      servers.forEach((srv) => {
        html += `
          <div class="server-item">
            <div class="server-name">${srv.name}</div>
            <div class="server-id">${srv.id}</div>
            <div class="server-actions">
              <button class="server-action-btn" data-action="restart" data-server="${srv.id}">Restart</button>
            </div>
          </div>
        `;
      });
      html += '</div>';
      serversEl.innerHTML = html;

      // Attach restart handlers
      serversEl.querySelectorAll('[data-action="restart"]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const serverId = btn.getAttribute('data-server');
          btn.disabled = true;
          btn.textContent = 'Restarting...';
          await api(`/api/discord/server/${serverId}/restart`, { method: 'POST' });
          btn.textContent = 'Restart';
          btn.disabled = false;
        });
      });
    }
  } else {
    serversEl.innerHTML = `<div class="panel-empty">${serversRes.body?.error || 'Failed to load servers'}</div>`;
  }
}
