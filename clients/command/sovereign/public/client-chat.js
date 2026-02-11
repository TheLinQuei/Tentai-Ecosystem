// Chat Client Workspace
import { getSession, navigateTo, showOverseerOverlay } from './app.js';

const root = document.getElementById('app-root');

export function renderChatClient() {
  const session = getSession();

  root.innerHTML = `
    <div class="client-workspace">
      <header class="workspace-header">
        <button class="back-btn" id="backBtn">← Clients</button>
        <div class="workspace-title">
          <div class="workspace-name">Chat</div>
          <div class="workspace-scope">General Vi Interface</div>
        </div>
        ${session?.founder ? `<button class="overseer-btn" id="overseerBtn">⚙️ Overseer</button>` : ''}
      </header>
      <main class="workspace-body chat-workspace">
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
              <div class="panel-empty">Session context and memory controls will appear here.</div>
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

  // Chat logic stub (placeholder for real integration)
  const input = document.getElementById('chatInput');
  const sendBtn = document.getElementById('chatSendBtn');
  const messages = document.getElementById('chatMessages');

  const sendMessage = async () => {
    const text = input.value.trim();
    if (!text) return;

    const userMsg = document.createElement('div');
    userMsg.className = 'chat-message user';
    userMsg.textContent = text;
    messages.appendChild(userMsg);

    input.value = '';
    messages.scrollTop = messages.scrollHeight;

    try {
      // Get user identity from session
      const session = getSession();
      if (!session?.user?.sub) {
        throw new Error('No user session found');
      }

      // Call Vi chat endpoint with identity headers
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-provider': 'sovereign',
          'x-provider-user-id': session.user.sub,
          'x-client-id': 'sovereign'
        },
        body: JSON.stringify({
          message: text
        })
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status}`);
      }

      const data = await response.json();
      const viMsg = document.createElement('div');
      viMsg.className = 'chat-message vi';
      viMsg.textContent = data.reply || data.message || 'No response from Vi';
      messages.appendChild(viMsg);
      messages.scrollTop = messages.scrollHeight;
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'chat-message error';
      errorMsg.textContent = `Error: ${error.message}`;
      messages.appendChild(errorMsg);
      messages.scrollTop = messages.scrollHeight;
    }
  };

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}
