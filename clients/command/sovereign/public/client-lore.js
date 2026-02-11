// Lore Client Workspace (Astralis Codex)
import { getSession, navigateTo, showOverseerOverlay, api } from './app.js';

const root = document.getElementById('app-root');

export async function renderLoreClient() {
  const session = getSession();

  root.innerHTML = `
    <div class="client-workspace">
      <header class="workspace-header">
        <button class="back-btn" id="backBtn">← Clients</button>
        <div class="workspace-title">
          <div class="workspace-name">Lore Tracker</div>
          <div class="workspace-scope">Astralis Codex / Canon</div>
        </div>
        ${session?.founder ? `<button class="overseer-btn" id="overseerBtn">⚙️ Overseer</button>` : ''}
      </header>
      <main class="workspace-body lore-workspace">
        <div class="lore-main">
          <section class="lore-section">
            <div class="section-title">Codex Status</div>
            <div class="section-body" id="codexStatus">
              <div class="panel-empty">Loading codex status...</div>
            </div>
          </section>
          <section class="lore-section">
            <div class="section-title">Entity Search</div>
            <div class="section-body">
              <div class="search-row">
                <input type="text" class="search-input" id="loreSearchInput" placeholder="Search entities, facts, rules..." />
                <button class="search-btn" id="loreSearchBtn">Search</button>
              </div>
              <div class="search-results" id="loreSearchResults"></div>
            </div>
          </section>
        </div>
        <aside class="lore-sidebar">
          <div class="sidebar-section">
            <div class="sidebar-title">Codex Copilot</div>
            <div class="sidebar-scope">Lore-scoped Vi chat</div>
            <div class="sidebar-body">
              <div class="panel-empty">Lore-focused chat will appear here. Wiring pending.</div>
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

  // Hydrate codex status
  const statusEl = document.getElementById('codexStatus');
  const res = await api('/api/lore/status');
  if (res.ok && res.body?.ok) {
    const status = res.body.data;
    statusEl.innerHTML = `
      <div class="kv-grid">
        <div class="kv-item"><div class="kv-key">Connected</div><div class="kv-value">${status.codexConnected ? 'Yes' : 'No'}</div></div>
        <div class="kv-item"><div class="kv-key">Entities</div><div class="kv-value">${status.entityCount ?? '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Timeline Events</div><div class="kv-value">${status.timelineEvents ?? '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Rules Loaded</div><div class="kv-value">${status.rulesLoaded ? 'Yes' : 'No'}</div></div>
      </div>
    `;
  } else {
    statusEl.innerHTML = `<div class="panel-empty">${res.body?.error || 'Codex not connected'}</div>`;
  }

  // Search handler
  const searchInput = document.getElementById('loreSearchInput');
  const searchBtn = document.getElementById('loreSearchBtn');
  const resultsEl = document.getElementById('loreSearchResults');

  searchBtn.addEventListener('click', async () => {
    const q = searchInput.value.trim();
    if (!q) return;

    resultsEl.innerHTML = '<div class="panel-empty">Searching...</div>';
    const searchRes = await api(`/api/lore/search?q=${encodeURIComponent(q)}`);

    if (searchRes.ok && searchRes.body?.ok && searchRes.body.data) {
      const { entities = [], facts = [] } = searchRes.body.data;
      if (!entities.length && !facts.length) {
        resultsEl.innerHTML = '<div class="panel-empty">No results found.</div>';
        return;
      }

      let html = '';
      if (entities.length) {
        html += `<div class="result-group"><div class="result-group-title">Entities</div>`;
        entities.forEach((e) => {
          html += `<div class="result-item">${e.name} — ${e.type}${e.summary ? ': ' + e.summary : ''}</div>`;
        });
        html += `</div>`;
      }
      if (facts.length) {
        html += `<div class="result-group"><div class="result-group-title">Facts</div>`;
        facts.forEach((f) => {
          html += `<div class="result-item">${f.statement} (${f.confidence ?? '—'})</div>`;
        });
        html += `</div>`;
      }
      resultsEl.innerHTML = html;
    } else {
      resultsEl.innerHTML = `<div class="panel-empty">${searchRes.body?.error || 'Search failed'}</div>`;
    }
  });
}
