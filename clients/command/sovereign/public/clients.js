// Client Launcher Grid
import { getSession, navigateTo, showOverseerOverlay, api } from './app.js';

const root = document.getElementById('app-root');

export async function renderLauncher() {
  const session = getSession();
  console.log('[LAUNCHER] Session object:', JSON.stringify(session, null, 2));
  const res = await api('/api/clients');
  console.log('[LAUNCHER] Clients response:', JSON.stringify(res, null, 2));
  const clients = res.ok && res.body?.ok ? res.body.data : [];

  root.innerHTML = `
    <div class="launcher">
      <header class="launcher-header">
        <div class="launcher-brand">
          <div class="eyebrow">Tentai // Command Console</div>
          <div class="title">Client Launcher</div>
        </div>
        <div class="launcher-user">
          <div class="user-profile">
            <div class="user-email">${session?.email || 'User'}</div>
            <div class="user-tier">${session?.tier?.toUpperCase() || 'STANDARD'} ${session?.founder ? '• FOUNDER' : ''}</div>
          </div>
          <button class="logout-btn" id="logoutBtn" title="Logout">↗</button>
          ${session?.founder ? `<button class="overseer-btn" id="overseerBtn">⚙️ Overseer</button>` : ''}
        </div>
      </header>
      <main class="launcher-grid" id="launcherGrid"></main>
    </div>
  `;

  const grid = document.getElementById('launcherGrid');
  clients.forEach((client) => {
    const tile = document.createElement('button');
    tile.className = `client-tile ${client.status}`;
    tile.disabled = client.status !== 'available';
    tile.innerHTML = `
      <div class="client-tile-header">
        <div class="client-tile-name">${client.name}</div>
        <div class="client-tile-badge ${client.status}">${client.status === 'available' ? '●' : client.status === 'coming-soon' ? '○' : '🔒'}</div>
      </div>
      <div class="client-tile-desc">${client.description}</div>
      ${client.status === 'coming-soon' ? '<div class="client-tile-label">Coming Soon</div>' : ''}
      ${client.status === 'locked' ? '<div class="client-tile-label">Upgrade Required</div>' : ''}
    `;

    if (client.status === 'available') {
      tile.addEventListener('click', () => navigateTo(`/client/${client.id}`));
    }

    grid.appendChild(tile);
  });

  if (session?.founder) {
    document.getElementById('overseerBtn')?.addEventListener('click', showOverseerOverlay);
  }

  // Logout handler
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    localStorage.removeItem('vi_access_token');
    localStorage.removeItem('vi_refresh_token');
    window.location.hash = '/';
    window.location.reload();
  });
}
