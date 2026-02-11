// Tentai Command Console — Client-Centric Router
// Hash-based routing: #/login, #/clients, #/client/:id

import { renderLauncher } from './clients.js';
import { renderChatClient } from './client-chat.js';
import { renderLoreClient } from './client-lore.js';
import { renderDiscordClient } from './client-discord.js';
import { renderOverseer, hideOverseer } from './overseer.js';
import { renderClientWithTabs } from './client-tabs.js';

const root = document.getElementById('app-root');

const state = {
  session: null,
  currentRoute: null,
  currentClient: null,
};

export function getSession() {
  return state.session;
}

export function getAuthHeaders(extra = {}) {
  const headers = { ...extra };
  const token = localStorage.getItem('vi_access_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function api(path, options = {}) {
  const opts = {
    method: 'GET',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
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

async function fetchSession() {
  console.log('[SESSION] Fetching session with token:', localStorage.getItem('vi_access_token')?.substring(0, 20) + '...');
  const res = await api('/api/session');
  console.log('[SESSION] Response:', res);
  if (res.ok && res.body?.ok) {
    console.log('[SESSION] Session loaded successfully:', res.body.data);
    state.session = res.body.data;
    return state.session;
  }
  console.warn('[SESSION] Failed to load session:', res.body);
  return null;
}

function parseRoute() {
  const hash = window.location.hash.slice(1) || '/clients';
  const [path, ...rest] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, query: rest.join('?') };
}

async function navigate(hash) {
  window.location.hash = hash;
}

export function navigateTo(path) {
  navigate(path);
}

export function showOverseerOverlay() {
  if (!state.session?.founder) return;
  renderOverseer();
}

async function render() {
  const route = parseRoute();
  state.currentRoute = route;

  // Auth gate
  if (!state.session) {
    await renderLogin();
    return;
  }

  hideOverseer();

  // Route to view
  if (route.path === '/clients' || route.path === '/') {
    renderLauncher();
  } else if (route.parts[0] === 'client') {
    const clientId = route.parts[1];
    state.currentClient = clientId;
    let clientContent = '';
    
    switch (clientId) {
      case 'chat':
      case 'sovereign':
        clientContent = renderChatClientContent();
        break;
      case 'lore':
      case 'astralis':
        clientContent = renderLoreClientContent();
        break;
      case 'discord':
      case 'vigil':
        clientContent = renderDiscordClientContent();
        break;
      case 'overseer':
        clientContent = renderOverseerClientContent();
        break;
      default:
        renderNotFound();
        return;
    }
    
    // Normalize client ID for tab display
    const normalizedId = clientId === 'sovereign' ? 'sovereign' : 
                        clientId === 'chat' ? 'sovereign' :
                        clientId === 'vigil' ? 'vigil' :
                        clientId === 'discord' ? 'vigil' :
                        clientId === 'astralis' ? 'astralis' :
                        clientId === 'lore' ? 'astralis' :
                        clientId === 'overseer' ? 'overseer' : clientId;
    
    await renderClientWithTabs(normalizedId, clientContent);
  } else {
    renderNotFound();
  }
}

async function renderLogin() {
  root.innerHTML = `
    <div class="auth-gate">
      <div class="auth-card">
        <div class="auth-brand">
          <div class="eyebrow">Tentai</div>
          <div class="title">Command Console</div>
        </div>
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="login">Login</button>
          <button class="auth-tab" data-tab="register">Register</button>
        </div>
        <div class="auth-body" id="loginForm">
          <input type="email" id="loginEmail" placeholder="Email" class="auth-input" autocomplete="email" />
          <div class="password-field">
            <input type="password" id="loginPassword" placeholder="Password" class="auth-input" autocomplete="current-password" />
            <button type="button" class="password-toggle" id="toggleLoginPassword">👁</button>
          </div>
          <button id="loginBtn" class="auth-btn">Authorize</button>
          <div class="auth-error" id="loginError"></div>
        </div>
        <div class="auth-body hidden" id="registerForm">
          <input type="email" id="registerEmail" placeholder="Email" class="auth-input" autocomplete="email" />
          <input type="text" id="registerUsername" placeholder="Username" class="auth-input" autocomplete="username" />
          <div class="password-field">
            <input type="password" id="registerPassword" placeholder="Password" class="auth-input" autocomplete="new-password" />
            <button type="button" class="password-toggle" id="toggleRegisterPassword">👁</button>
          </div>
          <input type="text" id="registerDisplayName" placeholder="Display Name (optional)" class="auth-input" />
          <button id="registerBtn" class="auth-btn">Create Account</button>
          <div class="auth-error" id="registerError"></div>
        </div>
      </div>
    </div>
  `;

  // Tab switching
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const targetTab = tab.getAttribute('data-tab');
      document.getElementById('loginForm').classList.toggle('hidden', targetTab !== 'login');
      document.getElementById('registerForm').classList.toggle('hidden', targetTab !== 'register');
    });
  });

  // Password toggle handlers
  const toggleLoginPassword = document.getElementById('toggleLoginPassword');
  const loginPasswordInput = document.getElementById('loginPassword');
  toggleLoginPassword?.addEventListener('click', () => {
    const isPassword = loginPasswordInput.type === 'password';
    loginPasswordInput.type = isPassword ? 'text' : 'password';
    toggleLoginPassword.textContent = isPassword ? '🙈' : '👁';
  });

  const toggleRegisterPassword = document.getElementById('toggleRegisterPassword');
  const registerPasswordInput = document.getElementById('registerPassword');
  toggleRegisterPassword?.addEventListener('click', () => {
    const isPassword = registerPasswordInput.type === 'password';
    registerPasswordInput.type = isPassword ? 'text' : 'password';
    toggleRegisterPassword.textContent = isPassword ? '🙈' : '👁';
  });

  // Login handler
  document.getElementById('loginBtn').addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');

    if (!email || !password) {
      errorEl.textContent = 'Email and password required';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Authorizing...';
    errorEl.textContent = '';

    console.log('[AUTH] Attempting login for:', email);

    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    console.log('[AUTH] Login response:', res);

    if (res.ok && res.body?.data?.accessToken) {
      console.log('[AUTH] Login successful, storing tokens');
      localStorage.setItem('vi_access_token', res.body.data.accessToken);
      if (res.body.data.refreshToken) localStorage.setItem('vi_refresh_token', res.body.data.refreshToken);
      console.log('[AUTH] Calling bootstrap to load session and redirect');
      await bootstrap();
    } else {
      console.error('[AUTH] Login failed:', res.body);
      errorEl.textContent = res.body?.error || 'Login failed. Check console for details.';
      btn.disabled = false;
      btn.textContent = 'Authorize';
    }
  });

  // Register handler
  document.getElementById('registerBtn').addEventListener('click', async () => {
    const email = document.getElementById('registerEmail').value.trim();
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const displayName = document.getElementById('registerDisplayName').value.trim();
    const errorEl = document.getElementById('registerError');

    if (!email || !username || !password) {
      errorEl.textContent = 'Email, username, and password required';
      return;
    }

    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, username, password, displayName: displayName || username }),
    });

    if (res.ok && res.body?.data?.accessToken) {
      localStorage.setItem('vi_access_token', res.body.data.accessToken);
      if (res.body.data.refreshToken) localStorage.setItem('vi_refresh_token', res.body.data.refreshToken);
      await bootstrap();
    } else {
      errorEl.textContent = res.body?.error || 'Registration failed';
    }
  });
}

function renderNotFound() {
  root.innerHTML = `
    <div class="not-found">
      <div class="not-found-title">404</div>
      <div class="not-found-body">Route not found</div>
      <button class="auth-btn" onclick="window.location.hash='/clients'">Return to Launcher</button>
    </div>
  `;
}

// Client content renderers (return HTML content, not full page)
function renderChatClientContent() {
  return `
    <div class="chat-main">
      <div class="chat-messages" id="chatMessages">
        <div class="chat-empty">Vi is listening. Start a conversation.</div>
      </div>
      <div class="chat-input-row">
        <input type="text" class="chat-input" id="chatInput" placeholder="Message Vi..." />
        <button class="chat-send-btn" id="chatSendBtn">Send</button>
      </div>
    </div>
    <aside class="chat-sidebar">
      <div class="sidebar-section">
        <div class="sidebar-title">Context</div>
        <div class="sidebar-body">
          <div class="panel-empty">Session context visible in Memory panel.</div>
        </div>
      </div>
    </aside>
  `;
}

function renderLoreClientContent() {
  return `
    <div class="lore-main">
      <div class="lore-search-header">
        <input type="text" class="lore-search-input" id="loreMainSearch" placeholder="Search canon entities, verses, entities..." />
        <button class="lore-search-btn" id="loreMainSearchBtn">🔍</button>
      </div>
      <div class="lore-content-area" id="loreContentArea">
        <div class="lore-empty">Use the Lore panel (Astralis tab) to browse canon entities.</div>
      </div>
    </div>
  `;
}

function renderDiscordClientContent() {
  return `
    <div class="discord-main">
      <div class="discord-status">
        <div class="status-indicator">●</div>
        <div class="status-text">Connected to Discord</div>
      </div>
      <div class="discord-messages" id="discordMessages">
        <div class="message-empty">Discord messages sync visible in Memory panel.</div>
      </div>
    </div>
  `;
}

function renderOverseerClientContent() {
  return `
    <div class="overseer-main">
      <div class="overseer-empty">Overseer admin panel. Use Observability tab for system metrics.</div>
    </div>
  `;
}

async function bootstrap() {
  console.log('[BOOTSTRAP] Starting...');
  const session = await fetchSession();
  
  if (!session) {
    console.log('[BOOTSTRAP] No session, showing login');
    state.session = null;
    await render();
    return;
  }

  console.log('[BOOTSTRAP] Session loaded:', session);
  state.session = session;
  
  // If we're authenticated and on root/login, navigate to clients
  const currentHash = window.location.hash.slice(1) || '/';
  if (currentHash === '/' || currentHash === '/login' || !currentHash) {
    console.log('[BOOTSTRAP] Redirecting to /clients');
    await navigate('/clients');
  } else {
    await render();
  }
}

window.addEventListener('hashchange', render);
bootstrap();
