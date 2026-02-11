// God Console frontend (unified domains + SSE)
// Uses the unified contracts from src/contracts/godConsole.ts

const authState = {
  accessToken: localStorage.getItem('vi_access_token'),
};

const ui = {
  nav: document.querySelector('[data-domain-nav]'),
  summary: document.querySelector('[data-domain-summary]'),
  panels: document.querySelector('[data-panel-region]'),
  viStatus: document.querySelector('[data-vi-status]'),
  systemState: document.querySelector('[data-system-state]'),
};

const DOMAINS = [
  {
    id: 'core',
    label: 'Core',
    intent: 'Posture, heartbeat, and control-plane stance.',
    summary: 'Keep vi-core online, expose posture, and surface any founder enforcement actions.',
  },
  {
    id: 'memory',
    label: 'Memory',
    intent: 'Learning gates, flush/lock control, memory telemetry.',
    summary: 'Govern Vi\'s memory sanctum: flush volatile buffers, lock long-term memory, and observe last writes.',
  },
  {
    id: 'lore',
    label: 'Lore / Canon',
    intent: 'Astralis Codex status and search once wired.',
    summary: 'Check codex availability and search canonical knowledge when wiring lands.',
  },
  {
    id: 'clients',
    label: 'Clients',
    intent: 'Adapters, Discord presence, edge devices.',
    summary: 'Track and govern adapters across Discord, Vigil, Sovereign, and future operators.',
  },
  {
    id: 'systems',
    label: 'Systems',
    intent: 'Subsystem health across vi-core, database, connectors.',
    summary: 'Verify the full stack health: vi-core, Sovereign, database, connectors, and codex stubs.',
  },
  {
    id: 'authority',
    label: 'Authority',
    intent: 'Founder controls, emergency halt, loop reinit.',
    summary: 'Assert founder authority: emergency halt, reinit the control loop, and view control flags.',
  },
  {
    id: 'audit',
    label: 'Audit',
    intent: 'Recent founder actions and system-side audit trail.',
    summary: 'Review latest audit events emitted by Sovereign and God Console actions.',
  },
];

const domainMap = Object.fromEntries(DOMAINS.map((d) => [d.id, d]));

const state = {
  activeDomain: 'core',
  core: { hydration: null, error: null },
  memory: { status: null, error: null, lastAction: null },
  lore: { status: null, error: null, lastQuery: null, results: null },
  clients: { status: null, error: null },
  systems: { status: null, error: null },
  authority: { status: null, error: null, lastAction: null },
  audit: { events: [], error: null },
};

function authHeaders(extra = {}) {
  const headers = { ...extra };
  if (authState.accessToken) headers['Authorization'] = `Bearer ${authState.accessToken}`;
  return headers;
}

async function api(path, options = {}) {
  const opts = {
    method: 'GET',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    ...options,
  };
  try {
    const res = await fetch(path, opts);
    const contentType = res.headers.get('content-type') || '';
    const body = contentType.includes('application/json') ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    console.warn('API error', err);
    return { ok: false, status: 0, body: { error: err.message } };
  }
}

function h(tag, className, children = []) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (!Array.isArray(children)) children = [children];
  for (const child of children) {
    if (child === null || child === undefined) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}

function statusChip(label, tone) {
  const el = h('div', `status-chip ${tone || 'offline'}`);
  el.appendChild(h('div', 'status-dot'));
  el.appendChild(h('span', '', label || '—'));
  return el;
}

function pill(text, tone = 'neutral') {
  return h('span', `pill ${tone}`, text);
}

function kvGrid(entries = []) {
  const grid = h('div', 'kv-grid');
  entries.forEach(({ key, value }) => {
    const item = h('div', 'kv-item', [
      h('div', 'kv-key', key),
      h('div', 'kv-value', value ?? '—'),
    ]);
    grid.appendChild(item);
  });
  return grid;
}

function formatTs(ts) {
  if (!ts) return '—';
  const date = typeof ts === 'number' ? new Date(ts) : new Date(String(ts));
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function setTopStatus(core) {
  if (!ui.viStatus || !ui.systemState) return;
  const vi = core?.viStatus;
  ui.viStatus.innerHTML = '';
  ui.viStatus.appendChild(statusChip(vi?.label || 'Unknown', vi?.tone || 'offline'));
  if (vi?.detail) ui.viStatus.appendChild(h('span', 'small', vi.detail));

  const sys = core?.systemState || 'Awaiting system signals.';
  ui.systemState.textContent = sys;
}

function renderSummary() {
  const domain = domainMap[state.activeDomain];
  if (!domain || !ui.summary) return;
  ui.summary.innerHTML = '';
  ui.summary.append(
    h('div', 'copy', [
      h('div', 'panel-title', domain.label),
      h('div', 'panel-intent', domain.summary),
    ]),
    h('div', 'assumption', domain.intent)
  );
}

function renderNav() {
  if (!ui.nav) return;
  ui.nav.innerHTML = '';
  DOMAINS.forEach((domain) => {
    const btn = h('button', `domain-button ${state.activeDomain === domain.id ? 'active' : ''}`, [
      h('div', 'label', domain.label),
      h('div', 'intent', domain.intent),
    ]);
    btn.addEventListener('click', () => setActiveDomain(domain.id));
    ui.nav.appendChild(btn);
  });
}

function setActiveDomain(id) {
  if (!domainMap[id]) return;
  state.activeDomain = id;
  renderNav();
  renderSummary();
  renderPanels();
}

function renderPanels() {
  if (!ui.panels) return;
  ui.panels.innerHTML = '';
  const renderer = {
    core: renderCore,
    memory: renderMemory,
    lore: renderLore,
    clients: renderClients,
    systems: renderSystems,
    authority: renderAuthority,
    audit: renderAudit,
  }[state.activeDomain];

  const panels = renderer ? renderer() : [];
  panels.forEach((panel) => ui.panels.appendChild(panel));
}

function renderCore() {
  const hydration = state.core.hydration;
  const error = state.core.error;
  const panels = [];

  const posturePanel = h('article', 'panel');
  posturePanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Core Posture'), h('div', 'panel-intent', 'Heartbeat + behavior state')]),
    h('div', 'panel-body', [
      hydration?.viStatus ? statusChip(hydration.viStatus.label, hydration.viStatus.tone) : h('div', 'panel-empty', 'Awaiting vi-core health'),
      kvGrid([
        { key: 'System State', value: hydration?.systemState || '—' },
        { key: 'Behavior Mode', value: hydration?.signals?.['core-posture']?.label || '—' },
        { key: 'Memory Locked', value: hydration?.signals?.['core-posture']?.detail?.includes('locked') ? 'Yes' : 'No' },
        { key: 'Signal Updated', value: hydration?.signals?.['core-posture']?.timestamp ? formatTs(hydration.signals['core-posture'].timestamp) : '—' },
      ]),
    ])
  );

  if (error) {
    posturePanel.appendChild(h('div', 'panel-empty', `Core hydration failed: ${error}`));
  }

  const signalDetail = hydration?.signals?.['core-posture']?.detail || 'No signals yet.';
  const signalPanel = h('article', 'panel');
  signalPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Signals'), h('div', 'panel-intent', 'Latest system broadcast')]),
    h('div', 'panel-body', [h('div', 'panel-empty', signalDetail)])
  );

  panels.push(posturePanel, signalPanel);
  return panels;
}

function renderMemory() {
  const status = state.memory.status;
  const error = state.memory.error;
  const panels = [];

  const statusPanel = h('article', 'panel');
  statusPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Memory Status'), h('div', 'panel-intent', 'Learning gates and sanctum locks')]),
    h('div', 'panel-body', [
      status ? kvGrid([
        { key: 'Learning Mode', value: status.learningMode },
        { key: 'Short-term count', value: status.shortTerm.count ?? '—' },
        { key: 'Short-term last write', value: formatTs(status.shortTerm.lastWriteTs) },
        { key: 'Long-term locked', value: status.longTerm.locked ? 'Yes' : 'No' },
        { key: 'Long-term last write', value: formatTs(status.longTerm.lastWriteTs) },
        { key: 'Pinned items', value: status.pinned.count ?? '—' },
      ]) : h('div', 'panel-empty', error || 'Memory status not loaded yet.'),
      h('div', 'panel-footer', [
        h('div', 'small', status ? 'Memory telemetry reflects last known control state.' : 'Awaiting telemetry.'),
      ]),
    ])
  );

  const actionsPanel = h('article', 'panel');
  const flushBtn = h('button', 'action-btn secondary', 'Flush short-term');
  const lockBtn = h('button', 'action-btn danger', 'Lock long-term (irreversible)');
  flushBtn.disabled = !authState.accessToken;
  lockBtn.disabled = !authState.accessToken || status?.longTerm.locked;

  flushBtn.addEventListener('click', async () => {
    flushBtn.disabled = true;
    const res = await api('/api/god/memory/flush-short-term', { method: 'POST' });
    if (!res.ok) state.memory.error = res.body?.error || 'Flush failed';
    await hydrateMemory();
    flushBtn.disabled = false;
  });

  lockBtn.addEventListener('click', async () => {
    lockBtn.disabled = true;
    const res = await api('/api/god/memory/lock-long-term', { method: 'POST' });
    if (!res.ok) state.memory.error = res.body?.error || 'Lock failed';
    await hydrateMemory();
    lockBtn.disabled = false;
  });

  actionsPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Actions'), h('div', 'panel-intent', 'Founder-only controls')]),
    h('div', 'panel-body', [
      h('div', 'action-row', [flushBtn, h('span', 'small', 'Flush volatile buffer (short-term)')]),
      h('div', 'action-row', [lockBtn, h('span', 'small', 'Lock long-term memory. Cannot be undone.')]),
    ])
  );

  panels.push(statusPanel, actionsPanel);
  return panels;
}

function renderLore() {
  const status = state.lore.status;
  const error = state.lore.error;
  const results = state.lore.results;
  const panels = [];

  const statusPanel = h('article', 'panel');
  statusPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Codex Status'), h('div', 'panel-intent', 'Astralis Codex / Lore system')]),
    h('div', 'panel-body', [
      status ? kvGrid([
        { key: 'Codex Connected', value: status.codexConnected ? 'Yes' : 'No' },
        { key: 'Entities', value: status.entityCount ?? '—' },
        { key: 'Timeline Events', value: status.timelineEvents ?? '—' },
        { key: 'Last Sync', value: formatTs(status.lastSyncTs) },
        { key: 'Rules Loaded', value: status.rulesLoaded ? 'Yes' : 'No' },
      ]) : h('div', 'panel-empty', error || 'Codex not connected yet.'),
    ])
  );

  const searchPanel = h('article', 'panel');
  const input = h('input', 'text-input');
  input.placeholder = 'Search canon (e.g. entity, fact, rule)';
  const btn = h('button', 'action-btn secondary', 'Search Codex');
  btn.disabled = !authState.accessToken;

  btn.addEventListener('click', async () => {
    const q = input.value.trim();
    if (!q) return;
    state.lore.lastQuery = q;
    const res = await api(`/api/god/lore/search?q=${encodeURIComponent(q)}`);
    if (res.ok && res.body?.ok && res.body.data) {
      state.lore.results = res.body.data;
      state.lore.error = null;
    } else {
      state.lore.results = null;
      state.lore.error = res.body?.error || 'Search failed';
    }
    renderPanels();
  });

  const resultList = h('div', 'panel-body');
  if (results?.entities?.length || results?.facts?.length) {
    if (results.entities?.length) {
      resultList.appendChild(h('div', 'panel-intent', `Entities (${results.entities.length})`));
      results.entities.forEach((entity) => {
        resultList.appendChild(h('div', 'panel-empty', `${entity.name} — ${entity.type}${entity.summary ? ': ' + entity.summary : ''}`));
      });
    }
    if (results.facts?.length) {
      resultList.appendChild(h('div', 'panel-intent', `Facts (${results.facts.length})`));
      results.facts.forEach((fact) => {
        resultList.appendChild(h('div', 'panel-empty', `${fact.statement} (conf: ${fact.confidence ?? '—'})`));
      });
    }
  } else {
    resultList.appendChild(h('div', 'panel-empty', state.lore.error || 'Search codex once wired.'));
  }

  searchPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Search'), h('div', 'panel-intent', 'Routes are ready; codex wiring pending')]),
    h('div', 'panel-body', [h('div', 'input-row', [input, btn])]),
    resultList
  );

  panels.push(statusPanel, searchPanel);
  return panels;
}

function renderClients() {
  const status = state.clients.status;
  const error = state.clients.error;
  const panels = [];

  const adaptersPanel = h('article', 'panel');
  const body = h('div', 'panel-body');
  if (status?.adapters?.length) {
    status.adapters.forEach((adapter) => {
      const row = h('div', 'panel-empty');
      row.textContent = `${adapter.name}: ${adapter.status}`;
      body.appendChild(row);
    });
  } else {
    body.appendChild(h('div', 'panel-empty', error || 'No adapters reported.'));
  }

  adaptersPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Adapters'), h('div', 'panel-intent', 'Edge connectors and gateways')]),
    body
  );

  const discordPanel = h('article', 'panel');
  discordPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Discord Presence'), h('div', 'panel-intent', 'Bot + gateway state')]),
    h('div', 'panel-body', [
      status ? kvGrid([
        { key: 'Discord', value: status.discord },
        { key: 'Bot User', value: status.discordBotUser || '—' },
        { key: 'Gateway Latency', value: status.gatewayLatencyMs ? `${status.gatewayLatencyMs} ms` : '—' },
        { key: 'Devices', value: status.devices ?? '—' },
      ]) : h('div', 'panel-empty', error || 'Discord connector not wired yet.'),
    ])
  );

  panels.push(adaptersPanel, discordPanel);
  return panels;
}

function renderSystems() {
  const status = state.systems.status;
  const error = state.systems.error;
  const panels = [];

  const healthPanel = h('article', 'panel');
  const body = h('div', 'panel-body');
  if (status?.subsystems?.length) {
    status.subsystems.forEach((sub) => {
      const tone = sub.status === 'ok' ? 'ok' : sub.status === 'degraded' ? 'warn' : sub.status === 'down' ? 'offline' : 'warn';
      const row = h('div', 'panel-empty');
      row.append(
        statusChip(sub.name, tone),
        h('span', 'small', sub.detail || ''),
        h('span', 'small', formatTs(sub.lastCheckTs))
      );
      body.appendChild(row);
    });
  } else {
    body.appendChild(h('div', 'panel-empty', error || 'No subsystem telemetry yet.'));
  }

  healthPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Subsystem Health'), h('div', 'panel-intent', 'vi-core, DB, connectors')]),
    body
  );

  panels.push(healthPanel);
  return panels;
}

function renderAuthority() {
  const status = state.authority.status;
  const error = state.authority.error;
  const panels = [];

  const statusPanel = h('article', 'panel');
  statusPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Authority Flags'), h('div', 'panel-intent', 'Founder control plane state')]),
    h('div', 'panel-body', [
      status ? kvGrid([
        { key: 'Direct Control', value: status.directControl ? 'On' : 'Off' },
        { key: 'Shadow Mode', value: status.shadowMode ? 'On' : 'Off' },
        { key: 'Test Mode', value: status.testMode ? 'On' : 'Off' },
        { key: 'Emergency Halt', value: status.emergencyHalt ? 'Active' : 'Inactive' },
      ]) : h('div', 'panel-empty', error || 'Authority status unavailable.'),
    ])
  );

  const actionsPanel = h('article', 'panel');
  const haltBtn = h('button', 'action-btn danger', status?.emergencyHalt ? 'Emergency Halt Active' : 'Trigger Emergency Halt');
  haltBtn.disabled = !authState.accessToken || status?.emergencyHalt;
  haltBtn.addEventListener('click', async () => {
    haltBtn.disabled = true;
    await api('/api/god/authority/emergency-halt', { method: 'POST' });
    await hydrateAuthority();
    haltBtn.disabled = false;
  });

  const reinitBtn = h('button', 'action-btn secondary', 'Reinit Control Loop');
  reinitBtn.disabled = !authState.accessToken;
  reinitBtn.addEventListener('click', async () => {
    reinitBtn.disabled = true;
    await api('/api/god/authority/reinit-loop', { method: 'POST' });
    await hydrateAuthority();
    reinitBtn.disabled = false;
  });

  actionsPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Controls'), h('div', 'panel-intent', 'Founder-only authority actions')]),
    h('div', 'panel-body', [
      h('div', 'action-row', [haltBtn, h('span', 'small', 'Immediate halt. Requires manual recovery.')]),
      h('div', 'action-row', [reinitBtn, h('span', 'small', 'Kick the control loop.')]),
    ])
  );

  panels.push(statusPanel, actionsPanel);
  return panels;
}

function renderAudit() {
  const events = state.audit.events;
  const error = state.audit.error;
  const panels = [];

  const auditPanel = h('article', 'panel');
  const body = h('div', 'panel-body');

  if (events?.length) {
    events.slice(0, 50).forEach((evt) => {
      const row = h('div', 'audit-row');
      row.textContent = `${formatTs(evt.ts)} — ${evt.actor} — ${evt.action} (${evt.outcome}) ${evt.message || ''}`;
      body.appendChild(row);
    });
  } else {
    body.appendChild(h('div', 'audit-empty', error || 'Awaiting audit events.'));
  }

  auditPanel.append(
    h('div', 'panel-header', [h('div', 'panel-title', 'Recent Audit Events'), h('div', 'panel-intent', 'Live founder/system actions')]),
    body
  );

  panels.push(auditPanel);
  return panels;
}

async function hydrateCore() {
  const res = await api('/api/god/core');
  if (res.ok) {
    state.core.hydration = res.body;
    state.core.error = null;
    setTopStatus(res.body);
  } else {
    state.core.hydration = null;
    state.core.error = res.body?.error || 'Core hydration failed';
  }
}

async function hydrateMemory() {
  const res = await api('/api/god/memory/status');
  if (res.ok && res.body?.ok) {
    state.memory.status = res.body.data;
    state.memory.error = null;
  } else {
    state.memory.status = null;
    state.memory.error = res.body?.error || 'Memory status failed';
  }
}

async function hydrateLore() {
  const res = await api('/api/god/lore/status');
  if (res.ok && res.body?.ok) {
    state.lore.status = res.body.data;
    state.lore.error = null;
  } else {
    state.lore.status = res.body?.details?.status || null;
    state.lore.error = res.body?.error || 'Lore status failed';
  }
}

async function hydrateClients() {
  const res = await api('/api/god/clients/status');
  if (res.ok && res.body?.ok) {
    state.clients.status = res.body.data;
    state.clients.error = null;
  } else {
    state.clients.status = null;
    state.clients.error = res.body?.error || 'Clients status failed';
  }
}

async function hydrateSystems() {
  const res = await api('/api/god/systems/health');
  if (res.ok && res.body?.ok) {
    state.systems.status = res.body.data;
    state.systems.error = null;
  } else {
    state.systems.status = null;
    state.systems.error = res.body?.error || 'Systems health failed';
  }
}

async function hydrateAuthority() {
  const res = await api('/api/god/authority/status');
  if (res.ok && res.body?.ok) {
    state.authority.status = res.body.data;
    state.authority.error = null;
  } else {
    state.authority.status = null;
    state.authority.error = res.body?.error || 'Authority status failed';
  }
}

async function hydrateAudit() {
  const res = await api('/api/god/audit?limit=50');
  if (res.ok) {
    state.audit.events = Array.isArray(res.body) ? res.body : res.body?.events || [];
    state.audit.error = null;
  } else {
    state.audit.events = [];
    state.audit.error = res.body?.error || 'Audit fetch failed';
  }
}

async function hydrateAll() {
  await Promise.all([
    hydrateCore(),
    hydrateMemory(),
    hydrateLore(),
    hydrateClients(),
    hydrateSystems(),
    hydrateAuthority(),
    hydrateAudit(),
  ]);
  renderPanels();
}

function startSseStream(url, handler) {
  let stop = false;
  let controller = null;

  async function connect() {
    if (stop) return;
    controller = new AbortController();
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: authHeaders({ Accept: 'text/event-stream' }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) throw new Error(`SSE failed: ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done || stop) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const lines = evt.split('\n');
          let event = 'message';
          let data = '';
          for (const line of lines) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            if (line.startsWith('data:')) data += line.slice(5).trim();
          }
          if (!data || event === 'ping') continue;
          try {
            handler(event, JSON.parse(data));
          } catch (err) {
            console.warn('SSE parse error', err);
          }
        }
      }
    } catch (err) {
      if (!stop) {
        console.warn('SSE disconnected, retrying...', err.message);
        setTimeout(connect, 1500);
      }
    }
  }

  connect();
  return () => {
    stop = true;
    if (controller) controller.abort();
  };
}

function handleGodSignal(event, payload) {
  if (event !== 'signal') return;
  const envelope = payload;
  if (!envelope?.domain) return;
  switch (envelope.domain) {
    case 'core':
      state.core.hydration = { ...state.core.hydration, ...envelope.payload };
      setTopStatus(state.core.hydration);
      break;
    case 'memory':
      state.memory.status = envelope.payload?.status || state.memory.status;
      break;
    case 'systems':
      state.systems.status = envelope.payload?.status || state.systems.status;
      break;
    case 'authority':
      state.authority.status = envelope.payload?.status || state.authority.status;
      break;
    case 'clients':
      state.clients.status = envelope.payload?.status || state.clients.status;
      break;
    case 'lore':
      state.lore.status = envelope.payload?.status || state.lore.status;
      break;
    default:
      break;
  }
  renderPanels();
}

function handleAuditSignal(event, payload) {
  if (event !== 'audit') return;
  state.audit.events = [payload, ...state.audit.events].slice(0, 50);
  if (state.activeDomain === 'audit') renderPanels();
}

function bootstrap() {
  renderNav();
  renderSummary();
  hydrateAll();
  startSseStream('/api/god/stream', handleGodSignal);
  startSseStream('/api/god/audit/stream', handleAuditSignal);
}

bootstrap();
