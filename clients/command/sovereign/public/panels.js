// S5: Sovereign Multi-Client UI Panels
// Four operational modes: devMode (identity), profileMode (memory), auditMode (lore), systemMode (observability)

import { getSession, api } from './app.js';

const root = document.getElementById('app-root');

// ========== IDENTITY PANEL ==========
export async function renderIdentityPanel() {
  const session = getSession();
  
  // Fetch identity map from API
  const res = await api(`/v1/identity/map/${session?.vi_user_id || 'unknown'}`);
  const identityMap = res.ok && res.body?.ok ? res.body.data : [];

  const panelHtml = `
    <div class="panel identity-panel">
      <div class="panel-header">
        <h2 class="panel-title">Identity Map</h2>
        <p class="panel-desc">Linked provider identities for cross-client continuity</p>
      </div>
      
      <div class="panel-content">
        <div class="identity-primary">
          <div class="identity-label">VI User ID</div>
          <div class="identity-value" id="viUserIdDisplay">
            ${session?.vi_user_id || 'Loading...'}
          </div>
          <button class="copy-btn" id="copyViUserIdBtn" title="Copy to clipboard">📋</button>
        </div>

        <div class="identity-divider"></div>

        <div class="identity-section">
          <h3 class="identity-subtitle">Linked Providers</h3>
          <div class="identity-list" id="identityList">
            ${identityMap.length === 0 
              ? '<div class="identity-empty">No linked providers yet</div>' 
              : identityMap.map(id => `
                <div class="identity-item">
                  <div class="identity-provider">
                    <div class="provider-name">${id.provider.toUpperCase()}</div>
                    <div class="provider-id">${id.provider_user_id}</div>
                  </div>
                  <button class="unlink-btn" data-provider="${id.provider}" title="Unlink">✕</button>
                </div>
              `).join('')
            }
          </div>
        </div>

        <div class="identity-divider"></div>

        <div class="identity-section">
          <h3 class="identity-subtitle">Link New Provider</h3>
          <div class="link-controls">
            <select id="providerSelect" class="provider-select">
              <option value="">Select a provider...</option>
              <option value="discord">Discord</option>
              <option value="astralis">Astralis Codex</option>
              <option value="overseer">Overseer</option>
            </select>
            <input type="text" id="providerUserIdInput" placeholder="Provider User ID" class="provider-input" />
            <button id="linkBtn" class="link-btn">Link Provider</button>
            <div class="link-status" id="linkStatus"></div>
          </div>
        </div>
      </div>
    </div>
  `;

  return panelHtml;
}

// ========== MEMORY PANEL ==========
export async function renderMemoryPanel() {
  const session = getSession();
  
  // Fetch continuity pack (or memory summary) from API
  const res = await api('/api/memory/continuity');
  const continuityPack = res.ok && res.body?.ok ? res.body.data : {};

  const panelHtml = `
    <div class="panel memory-panel">
      <div class="panel-header">
        <h2 class="panel-title">Memory & Continuity</h2>
        <p class="panel-desc">Working memory, episodic events, semantic knowledge</p>
      </div>
      
      <div class="panel-content">
        <div class="memory-tabs" id="memoryTabs">
          <button class="memory-tab active" data-tab="working">Working</button>
          <button class="memory-tab" data-tab="episodic">Episodic</button>
          <button class="memory-tab" data-tab="semantic">Semantic</button>
          <button class="memory-tab" data-tab="relational">Relational</button>
        </div>

        <div class="memory-content" id="memoryContent">
          <!-- TAB: Working Memory -->
          <div class="memory-tab-pane active" data-pane="working">
            <div class="memory-layer">
              <h3 class="memory-title">Current Context</h3>
              <pre class="memory-data">${JSON.stringify(continuityPack.workingMemory || {}, null, 2)}</pre>
            </div>
          </div>

          <!-- TAB: Episodic Events -->
          <div class="memory-tab-pane" data-pane="episodic">
            <div class="memory-layer">
              <h3 class="memory-title">Recent Events</h3>
              <div class="memory-list" id="episodicList">
                ${(continuityPack.recentMemories || [])
                  .slice(0, 10)
                  .map((mem, idx) => `
                    <div class="memory-item">
                      <div class="memory-timestamp">${new Date(mem.created_at).toLocaleString()}</div>
                      <div class="memory-text">${mem.content || 'Untitled event'}</div>
                      <div class="memory-type">${mem.memory_type || 'episodic'}</div>
                    </div>
                  `)
                  .join('')}
              </div>
            </div>
          </div>

          <!-- TAB: Semantic Facts -->
          <div class="memory-tab-pane" data-pane="semantic">
            <div class="memory-layer">
              <h3 class="memory-title">Semantic Knowledge</h3>
              <pre class="memory-data">${JSON.stringify(continuityPack.semanticMemory || {}, null, 2)}</pre>
            </div>
          </div>

          <!-- TAB: Relational Context -->
          <div class="memory-tab-pane" data-pane="relational">
            <div class="memory-layer">
              <h3 class="memory-title">Relationships</h3>
              <div class="memory-list" id="relationalList">
                ${(continuityPack.relationshipContext || [])
                  .map(rel => `
                    <div class="memory-item">
                      <div class="rel-user">${rel.user_email || 'Unknown'}</div>
                      <div class="rel-type">${rel.relationship_type || 'normal'}</div>
                      <div class="rel-trust">Trust: ${rel.trust_level || 0}/100</div>
                    </div>
                  `)
                  .join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return panelHtml;
}

// ========== LORE PANEL ==========
export async function renderLorePanel() {
  // Fetch canon entities from API
  const res = await api('/api/canon/entities');
  const canonEntities = res.ok && res.body?.ok ? res.body.data : [];

  const panelHtml = `
    <div class="panel lore-panel">
      <div class="panel-header">
        <h2 class="panel-title">Astralis Codex</h2>
        <p class="panel-desc">Canon entities, multiverse rules, lore verification</p>
      </div>
      
      <div class="panel-content">
        <div class="lore-search">
          <input type="text" id="loreSearch" placeholder="Search entities..." class="lore-search-input" />
          <button id="loreSearchBtn" class="lore-search-btn">🔍</button>
        </div>

        <div class="lore-entities" id="loreEntities">
          ${canonEntities.length === 0
            ? '<div class="lore-empty">No canon entities loaded</div>'
            : canonEntities.map(entity => `
              <div class="lore-entity">
                <div class="entity-name">${entity.name}</div>
                <div class="entity-type">${entity.entity_type || 'Unknown'}</div>
                <div class="entity-desc">${entity.description || 'No description'}</div>
                ${entity.properties ? `
                  <div class="entity-props">
                    ${Object.entries(entity.properties)
                      .map(([key, val]) => `<div class="prop"><span class="prop-key">${key}:</span> <span class="prop-val">${val}</span></div>`)
                      .join('')}
                  </div>
                ` : ''}
                <div class="entity-verse">Verse: ${entity.verse || 'Unknown'}</div>
              </div>
            `).join('')}
        </div>
      </div>
    </div>
  `;

  return panelHtml;
}

// ========== OBSERVABILITY PANEL ==========
export async function renderObservabilityPanel() {
  // Fetch service status and metrics
  const servicesRes = await api('/api/observability/services');
  const services = servicesRes.ok && servicesRes.body?.ok ? servicesRes.body.data : [];
  
  const metricsRes = await api('/api/observability/metrics');
  const metrics = metricsRes.ok && metricsRes.body?.ok ? metricsRes.body.data : {};

  const panelHtml = `
    <div class="panel observability-panel">
      <div class="panel-header">
        <h2 class="panel-title">Observability</h2>
        <p class="panel-desc">Docker services, metrics, event stream, alerts</p>
      </div>
      
      <div class="panel-content">
        <div class="observability-tabs" id="observabilityTabs">
          <button class="obs-tab active" data-tab="services">Services</button>
          <button class="obs-tab" data-tab="metrics">Metrics</button>
          <button class="obs-tab" data-tab="events">Events</button>
          <button class="obs-tab" data-tab="alerts">Alerts</button>
        </div>

        <div class="observability-content" id="observabilityContent">
          <!-- TAB: Services -->
          <div class="obs-pane active" data-pane="services">
            <div class="services-list">
              ${services.length === 0
                ? '<div class="obs-empty">No services running</div>'
                : services.map(svc => `
                  <div class="service-item ${svc.status}">
                    <div class="service-name">${svc.name}</div>
                    <div class="service-status">
                      <span class="status-indicator ${svc.status}">●</span>
                      ${svc.status.toUpperCase()}
                    </div>
                    <div class="service-detail">${svc.uptime || 'N/A'}</div>
                  </div>
                `).join('')}
            </div>
          </div>

          <!-- TAB: Metrics -->
          <div class="obs-pane" data-pane="metrics">
            <div class="metrics-grid">
              <div class="metric-card">
                <div class="metric-label">CPU Usage</div>
                <div class="metric-value">${metrics.cpu_usage || 'N/A'}%</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Memory Usage</div>
                <div class="metric-value">${metrics.memory_usage || 'N/A'}%</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">Active Sessions</div>
                <div class="metric-value">${metrics.active_sessions || 0}</div>
              </div>
              <div class="metric-card">
                <div class="metric-label">API Latency</div>
                <div class="metric-value">${metrics.avg_latency || 'N/A'}ms</div>
              </div>
            </div>
          </div>

          <!-- TAB: Event Stream -->
          <div class="obs-pane" data-pane="events">
            <div class="events-stream" id="eventsStream">
              <div class="event-item">Listening for events...</div>
            </div>
          </div>

          <!-- TAB: Alerts -->
          <div class="obs-pane" data-pane="alerts">
            <div class="alerts-list" id="alertsList">
              <div class="alert-item info">
                <div class="alert-level">INFO</div>
                <div class="alert-msg">System running normally</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  return panelHtml;
}

// ========== TAB SWITCHING LOGIC ==========
export function attachPanelListeners() {
  // Memory panel tabs
  const memoryTabs = document.querySelectorAll('.memory-tab');
  const memoryPanes = document.querySelectorAll('.memory-tab-pane');
  memoryTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      memoryTabs.forEach(t => t.classList.remove('active'));
      memoryPanes.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelector(`.memory-tab-pane[data-pane="${tabName}"]`)?.classList.add('active');
    });
  });

  // Observability panel tabs
  const obsTabs = document.querySelectorAll('.obs-tab');
  const obsPanes = document.querySelectorAll('.obs-pane');
  obsTabs.forEach(tab => {
    tab.addEventListener('click', (e) => {
      const tabName = e.target.dataset.tab;
      obsTabs.forEach(t => t.classList.remove('active'));
      obsPanes.forEach(p => p.classList.remove('active'));
      e.target.classList.add('active');
      document.querySelector(`.obs-pane[data-pane="${tabName}"]`)?.classList.add('active');
    });
  });

  // Copy vi_user_id button
  document.getElementById('copyViUserIdBtn')?.addEventListener('click', () => {
    const text = document.getElementById('viUserIdDisplay').textContent;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('copyViUserIdBtn');
      const oldText = btn.textContent;
      btn.textContent = '✓';
      setTimeout(() => { btn.textContent = oldText; }, 2000);
    });
  });

  // Unlink provider buttons
  document.querySelectorAll('.unlink-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const provider = e.target.dataset.provider;
      const confirmed = confirm(`Unlink ${provider}?`);
      if (!confirmed) return;
      
      const res = await api('/v1/identity/link', {
        method: 'DELETE',
        body: JSON.stringify({ provider })
      });
      
      if (res.ok) {
        const statusEl = document.getElementById('linkStatus');
        statusEl.textContent = `Unlinked ${provider}`;
        statusEl.className = 'link-status success';
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const statusEl = document.getElementById('linkStatus');
        statusEl.textContent = `Error unlinking ${provider}`;
        statusEl.className = 'link-status error';
      }
    });
  });

  // Link new provider button
  document.getElementById('linkBtn')?.addEventListener('click', async () => {
    const provider = document.getElementById('providerSelect').value;
    const providerId = document.getElementById('providerUserIdInput').value;
    const statusEl = document.getElementById('linkStatus');

    if (!provider || !providerId) {
      statusEl.textContent = 'Please select provider and enter ID';
      statusEl.className = 'link-status error';
      return;
    }

    const res = await api('/v1/identity/link', {
      method: 'POST',
      body: JSON.stringify({ provider, provider_user_id: providerId })
    });

    if (res.ok) {
      statusEl.textContent = `Linked ${provider} successfully`;
      statusEl.className = 'link-status success';
      setTimeout(() => window.location.reload(), 1500);
    } else {
      statusEl.textContent = res.body?.error || 'Failed to link provider';
      statusEl.className = 'link-status error';
    }
  });
}
