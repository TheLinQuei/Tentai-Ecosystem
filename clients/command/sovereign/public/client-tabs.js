// S5: Multi-Client Tab System
// Top navigation tabs for: Overseer, Vigil, Astralis, Sovereign + mode buttons (dev, profile, audit, system)

import { getSession, navigateTo, api } from './app.js';
import {
  renderIdentityPanel,
  renderMemoryPanel,
  renderLorePanel,
  renderObservabilityPanel,
  attachPanelListeners
} from './panels.js';

const root = document.getElementById('app-root');

export async function renderClientWithTabs(clientId, clientContent) {
  const session = getSession();

  // Client tabs configuration
  const clientTabs = [
    { id: 'overseer', name: 'Overseer', icon: '⚙️', available: true },
    { id: 'vigil', name: 'Vigil', icon: '🔮', available: true },
    { id: 'astralis', name: 'Astralis', icon: '📖', available: true },
    { id: 'sovereign', name: 'Sovereign', icon: '👑', available: true },
  ];

  const modeTabs = [
    { id: 'devMode', name: 'Identity', icon: '🔐', desc: 'Provider mappings' },
    { id: 'profileMode', name: 'Memory', icon: '🧠', desc: 'Continuity pack' },
    { id: 'auditMode', name: 'Lore', icon: '📜', desc: 'Canon entities' },
    { id: 'systemMode', name: 'Observability', icon: '📊', desc: 'Services & metrics' },
  ];

  root.innerHTML = `
    <div class="client-workspace">
      <!-- HEADER: Client Tabs + Mode Toggle -->
      <header class="client-header">
        <div class="client-tabs-container">
          <nav class="client-tabs" id="clientTabs">
            ${clientTabs.map(tab => `
              <button class="client-tab ${tab.id === clientId ? 'active' : ''} ${!tab.available ? 'disabled' : ''}" 
                      data-client="${tab.id}"
                      title="${tab.name}">
                <span class="tab-icon">${tab.icon}</span>
                <span class="tab-name">${tab.name}</span>
              </button>
            `).join('')}
          </nav>

          <div class="client-header-spacer"></div>

          <div class="mode-controls">
            <div class="mode-tabs" id="modeTabs">
              ${modeTabs.map((mode, idx) => `
                <button class="mode-tab ${idx === 0 ? 'active' : ''}" 
                        data-mode="${mode.id}"
                        title="${mode.desc}">
                  <span class="mode-icon">${mode.icon}</span>
                  <span class="mode-name">${mode.name}</span>
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </header>

      <!-- MAIN CONTENT AREA -->
      <main class="client-main">
        <!-- Client View (default) -->
        <div class="client-view active" id="clientView">
          ${clientContent}
        </div>

        <!-- Mode Panels -->
        <div class="mode-panel hidden" id="devModePanel" data-mode="devMode">
          <!-- Identity Panel loaded here -->
        </div>
        <div class="mode-panel hidden" id="profileModePanel" data-mode="profileMode">
          <!-- Memory Panel loaded here -->
        </div>
        <div class="mode-panel hidden" id="auditModePanel" data-mode="auditMode">
          <!-- Lore Panel loaded here -->
        </div>
        <div class="mode-panel hidden" id="systemModePanel" data-mode="systemMode">
          <!-- Observability Panel loaded here -->
        </div>
      </main>
    </div>
  `;

  // Attach event listeners
  attachClientTabListeners(clientTabs);
  await attachModeTabListeners(modeTabs);
}

function attachClientTabListeners(clientTabs) {
  const tabs = document.querySelectorAll('.client-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const clientId = tab.dataset.client;
      const baseRoutes = {
        'overseer': '/client/overseer',
        'vigil': '/client/vigil',
        'astralis': '/client/astralis',
        'sovereign': '/client/sovereign',
      };
      if (baseRoutes[clientId]) {
        navigateTo(baseRoutes[clientId]);
      }
    });
  });
}

async function attachModeTabListeners(modeTabs) {
  const tabs = document.querySelectorAll('.mode-tab');
  const clientView = document.getElementById('clientView');
  const panels = document.querySelectorAll('.mode-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', async () => {
      const modeId = tab.dataset.mode;
      
      // Update active state
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      clientView.classList.add('hidden');

      // Load and display the appropriate panel
      const panelMap = {
        'devMode': { id: 'devModePanel', renderer: renderIdentityPanel },
        'profileMode': { id: 'profileModePanel', renderer: renderMemoryPanel },
        'auditMode': { id: 'auditModePanel', renderer: renderLorePanel },
        'systemMode': { id: 'systemModePanel', renderer: renderObservabilityPanel },
      };

      const panelInfo = panelMap[modeId];
      if (panelInfo) {
        const panelEl = document.getElementById(panelInfo.id);
        const html = await panelInfo.renderer();
        panelEl.innerHTML = html;
        panelEl.classList.remove('hidden');
        
        // Attach panel-specific listeners
        setTimeout(() => attachPanelListeners(), 100);
      }
    });
  });

  // Initial devMode panel load (Identity)
  const devModePanel = document.getElementById('devModePanel');
  const devModeHtml = await renderIdentityPanel();
  devModePanel.innerHTML = devModeHtml;
  attachPanelListeners();
}
