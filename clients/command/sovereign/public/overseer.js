// Overseer Overlay (Founder/Dev Only)
import { api } from './app.js';

let overlayEl = null;
let sseClient = null;

export function renderOverseer() {
  if (overlayEl) {
    overlayEl.classList.add('visible');
    return;
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'overseer-overlay';
  overlayEl.innerHTML = `
    <div class="overseer-drawer">
      <header class="overseer-header">
        <div class="overseer-title">⚙️ Overseer</div>
        <button class="overseer-close" id="overseerClose">✕</button>
      </header>
      <div class="overseer-body">
        <section class="overseer-section">
          <div class="overseer-section-title">Core Posture</div>
          <div class="overseer-section-body" id="overseerCore">
            <div class="panel-empty">Loading...</div>
          </div>
        </section>
        <section class="overseer-section">
          <div class="overseer-section-title">Founder Controls</div>
          <div class="overseer-section-body">
            <button class="overseer-action-btn danger" id="freezeLearningBtn">Freeze Learning (Irreversible)</button>
            <button class="overseer-action-btn danger" id="emergencyHaltBtn">Emergency Halt</button>
            <button class="overseer-action-btn secondary" id="reinitLoopBtn">Reinit Control Loop</button>
          </div>
        </section>
        <section class="overseer-section">
          <div class="overseer-section-title">Audit Stream</div>
          <div class="overseer-section-body">
            <div class="audit-stream" id="auditStream"></div>
          </div>
        </section>
      </div>
    </div>
  `;

  document.body.appendChild(overlayEl);
  setTimeout(() => overlayEl.classList.add('visible'), 10);

  document.getElementById('overseerClose').addEventListener('click', hideOverseer);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) hideOverseer();
  });

  hydrateCorePosture();
  startAuditStream();
  attachControls();
}

export function hideOverseer() {
  if (overlayEl) {
    overlayEl.classList.remove('visible');
    if (sseClient) {
      sseClient.abort();
      sseClient = null;
    }
  }
}

async function hydrateCorePosture() {
  const coreEl = document.getElementById('overseerCore');
  const res = await api('/api/god/core');
  if (res.ok && res.body) {
    const { viStatus, systemState, signals } = res.body;
    coreEl.innerHTML = `
      <div class="kv-grid">
        <div class="kv-item"><div class="kv-key">Vi Status</div><div class="kv-value">${viStatus?.label || '—'}</div></div>
        <div class="kv-item"><div class="kv-key">System State</div><div class="kv-value">${systemState || '—'}</div></div>
        <div class="kv-item"><div class="kv-key">Behavior</div><div class="kv-value">${signals?.['core-posture']?.label || '—'}</div></div>
      </div>
    `;
  } else {
    coreEl.innerHTML = '<div class="panel-empty">Core posture unavailable</div>';
  }
}

function startAuditStream() {
  const streamEl = document.getElementById('auditStream');
  streamEl.innerHTML = '<div class="panel-empty">Connecting to audit stream...</div>';

  const controller = new AbortController();
  sseClient = controller;

  fetch('/api/god/audit/stream', {
    method: 'GET',
    headers: { Accept: 'text/event-stream', ...(localStorage.getItem('vi_access_token') ? { Authorization: `Bearer ${localStorage.getItem('vi_access_token')}` } : {}) },
    signal: controller.signal,
  })
    .then((res) => {
      if (!res.ok || !res.body) throw new Error('SSE failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const read = () => {
        reader.read().then(({ done, value }) => {
          if (done) return;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() || '';

          events.forEach((evt) => {
            const lines = evt.split('\n');
            let event = 'message';
            let data = '';
            lines.forEach((line) => {
              if (line.startsWith('event:')) event = line.slice(6).trim();
              if (line.startsWith('data:')) data += line.slice(5).trim();
            });
            if (event === 'audit' && data) {
              try {
                const auditEvent = JSON.parse(data);
                prependAuditEvent(auditEvent);
              } catch {}
            }
          });
          read();
        });
      };
      read();
      streamEl.innerHTML = '<div class="panel-empty">Audit stream active. Events will appear below.</div>';
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        streamEl.innerHTML = `<div class="panel-empty">Audit stream disconnected: ${err.message}</div>`;
      }
    });
}

function prependAuditEvent(evt) {
  const streamEl = document.getElementById('auditStream');
  if (!streamEl) return;

  if (streamEl.querySelector('.panel-empty')) {
    streamEl.innerHTML = '';
  }

  const row = document.createElement('div');
  row.className = 'audit-row';
  const ts = new Date(evt.ts).toLocaleTimeString();
  row.textContent = `${ts} — ${evt.actor} — ${evt.action} (${evt.outcome})`;
  streamEl.prepend(row);

  // Keep last 20
  const rows = streamEl.querySelectorAll('.audit-row');
  if (rows.length > 20) {
    rows[rows.length - 1].remove();
  }
}

function attachControls() {
  document.getElementById('freezeLearningBtn').addEventListener('click', async () => {
    if (!confirm('This will lock learning mode and memory writes. Irreversible. Proceed?')) return;
    await api('/overseer/control/freeze-learning', { method: 'POST' });
    alert('Learning frozen.');
  });

  document.getElementById('emergencyHaltBtn').addEventListener('click', async () => {
    if (!confirm('Emergency halt. Requires manual recovery. Proceed?')) return;
    await api('/api/god/authority/emergency-halt', { method: 'POST' });
    alert('Emergency halt activated.');
  });

  document.getElementById('reinitLoopBtn').addEventListener('click', async () => {
    await api('/api/god/authority/reinit-loop', { method: 'POST' });
    alert('Control loop reinit requested.');
  });
}
