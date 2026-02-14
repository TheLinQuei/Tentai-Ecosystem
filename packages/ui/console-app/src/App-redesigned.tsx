import { useEffect, useMemo, useState } from 'react';

type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  timestamp: number;
};

type SafetyProfile = {
  profile_id?: string;
  user_id: string;
  safety_level: 'maximum' | 'balanced' | 'minimal';
  context_sensitivity: boolean;
  refusal_explanation: 'detailed' | 'brief';
  appeal_process: boolean;
  custom_rules: Array<{ rule_type: string; condition: string; action: string }>;
};

type LoyaltyContract = {
  contract_id?: string;
  user_id: string;
  primary_goals: string[];
  boundaries: string[];
  override_conditions: string[];
  verification_frequency: string;
  last_verified_at?: string | null;
};

type AuditTrace = {
  trace_id: string;
  record_id: string;
  user_id: string;
  intent_category: string;
  intent_confidence: number;
  had_violation: boolean;
  created_at?: string;
};

type MemoryRecord = {
  record_id: string;
  user_id: string;
  authority_level: string;
  content: string;
  created_at?: string;
};

type TestingChecklistItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  completed: boolean;
};

const defaultSafety: SafetyProfile = {
  user_id: '',
  safety_level: 'balanced',
  context_sensitivity: true,
  refusal_explanation: 'detailed',
  appeal_process: true,
  custom_rules: [],
};

const defaultContract: LoyaltyContract = {
  user_id: '',
  primary_goals: [],
  boundaries: [],
  override_conditions: [],
  verification_frequency: 'monthly',
};

const resolveApiBase = () => {
  const userOverride = localStorage.getItem('vi-api-base');
  if (userOverride) return userOverride;

  const configured = import.meta.env.VITE_API_BASE as string | undefined;
  if (configured && configured.trim().length > 0) return configured;

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') return 'http://localhost:3000';
    return 'https://tentai-ecosystem.onrender.com';
  }
  return 'http://localhost:3000';
};

export default function App() {
  const apiBase = useMemo(() => resolveApiBase(), []);

  // State Management
  const [userId, setUserId] = useState('');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>('');
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [showDebugPanel, setShowDebugPanel] = useState<boolean>(false);
  const [status, setStatus] = useState<string>('Ready');
  const [error, setError] = useState<string>('');
  const [healthStatus, setHealthStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [customApiBase, setCustomApiBase] = useState<string>(apiBase);
  const [showApiConfig, setShowApiConfig] = useState<boolean>(false);

  // Debug state
  const [auditTraces, setAuditTraces] = useState<AuditTrace[]>([]);
  const [safetyProfile, setSafetyProfile] = useState<SafetyProfile>(defaultSafety);
  const [contract, setContract] = useState<LoyaltyContract>(defaultContract);
  const [testingChecklistItems, setTestingChecklistItems] = useState<TestingChecklistItem[]>([
    { id: '1', category: 'Behavior', title: 'Responses are relevant', description: 'Check if Vi responds accurately to prompts', completed: false },
    { id: '2', category: 'Behavior', title: 'Tone is appropriate', description: 'Verify tone matches context', completed: false },
    { id: '3', category: 'Safety', title: 'Refuses harmful requests', description: 'Test refusal mechanism on edge cases', completed: false },
    { id: '4', category: 'Safety', title: 'Explains refusals clearly', description: 'Check explanation quality and reasoning', completed: false },
    { id: '5', category: 'Context', title: 'Remembers conversation history', description: 'Verify multi-turn context awareness', completed: false },
    { id: '6', category: 'Context', title: 'Respects user preferences', description: 'Check if user settings are honored', completed: false },
    { id: '7', category: 'Performance', title: 'Responses are timely', description: 'Measure latency and responsiveness', completed: false },
    { id: '8', category: 'Performance', title: 'Handles long inputs gracefully', description: 'Test with extended prompts', completed: false },
  ]);

  // Initialize userId (persist to localStorage)
  useEffect(() => {
    if (!userId) {
      let savedUserId = localStorage.getItem('vi-user-id');
      if (!savedUserId) {
        const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
        savedUserId = uuid;
        localStorage.setItem('vi-user-id', uuid);
      }
      setUserId(savedUserId);
    }
  }, []);

  // Load conversations from localStorage
  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`vi-conversations-${userId}`);
      if (saved) {
        try {
          const loaded = JSON.parse(saved) as Conversation[];
          setConversations(loaded);
          if (loaded.length > 0) {
            setActiveConversationId(loaded[0].id);
          }
        } catch (e) {
          console.warn('Failed to load conversations:', e);
        }
      }
    }
  }, [userId]);

  // Health check
  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch(`${apiBase}/v1/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000),
        });
        setHealthStatus(response.ok ? 'online' : 'offline');
      } catch {
        setHealthStatus('offline');
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => clearInterval(interval);
  }, [apiBase]);

  // Get active conversation
  const activeConversation = conversations.find(c => c.id === activeConversationId);
  const messages = activeConversation?.messages || [];

  // Create new conversation
  const createNewConversation = () => {
    const conversationId = `conv-${Date.now()}`;
    const newConversation: Conversation = {
      id: conversationId,
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    const updated = [newConversation, ...conversations];
    setConversations(updated);
    setActiveConversationId(conversationId);
    
    if (userId) {
      localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(updated));
    }
  };

  // Update conversation title
  const updateConversationTitle = (id: string, title: string) => {
    const updated = conversations.map(c => 
      c.id === id ? { ...c, title } : c
    );
    setConversations(updated);
    if (userId) {
      localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(updated));
    }
  };

  // Delete conversation
  const deleteConversation = (id: string) => {
    const updated = conversations.filter(c => c.id !== id);
    setConversations(updated);
    
    if (activeConversationId === id) {
      if (updated.length > 0) {
        setActiveConversationId(updated[0].id);
      } else {
        createNewConversation();
      }
    }
    
    if (userId) {
      localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(updated));
    }
  };

  // Send chat message
  const sendChatMessage = async () => {
    if (!chatInput.trim() || !activeConversationId || chatLoading) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      message: chatInput,
      timestamp: Date.now(),
    };

    const updatedConversations = conversations.map(c => 
      c.id === activeConversationId
        ? { 
            ...c, 
            messages: [...c.messages, userMessage],
            updatedAt: Date.now(),
            title: c.messages.length === 0 ? chatInput.substring(0, 50) : c.title
          }
        : c
    );
    
    setConversations(updatedConversations);
    if (userId) {
      localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(updatedConversations));
    }

    setChatInput('');
    setChatLoading(true);
    setStatus('Waiting for Vi...');

    try {
      const response = await fetch(`${apiBase}/v1/chat?userId=${encodeURIComponent(userId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        message: data.output || 'No response',
        timestamp: Date.now(),
      };

      const finalConversations = updatedConversations.map(c =>
        c.id === activeConversationId
          ? { ...c, messages: [...c.messages, assistantMessage], updatedAt: Date.now() }
          : c
      );
      
      setConversations(finalConversations);
      if (userId) {
        localStorage.setItem(`vi-conversations-${userId}`, JSON.stringify(finalConversations));
      }

      setStatus('Message received');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
      setStatus('Error');
    }

    setChatLoading(false);
  };

  const toggleChecklistItem = (id: string) => {
    setTestingChecklistItems(prev =>
      prev.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const updateApiBase = () => {
    localStorage.setItem('vi-api-base', customApiBase);
    window.location.reload();
  };

  // Format conversation date
  const formatConvDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="app chat-focused">
      <div className="ambient-glow" />
      
      {/* Conversation Sidebar */}
      <aside className="conversations-sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <div className="brand-mark">V</div>
            <p className="brand-title">Vi</p>
          </div>
          <button 
            className="new-chat-btn" 
            onClick={createNewConversation}
            title="New conversation"
          >
            + New
          </button>
        </div>

        <div className="conversations-list">
          {conversations.length === 0 ? (
            <div className="empty-conversations">
              <p>No conversations yet</p>
              <button className="action" onClick={createNewConversation}>
                Start One
              </button>
            </div>
          ) : (
            conversations.map(conv => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === activeConversationId ? 'active' : ''}`}
                onClick={() => setActiveConversationId(conv.id)}
              >
                <div className="conv-content">
                  <h4 className="conv-title">{conv.title}</h4>
                  <p className="conv-date">{formatConvDate(conv.updatedAt)}</p>
                </div>
                <button
                  className="conv-delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteConversation(conv.id);
                  }}
                  title="Delete"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="sidebar-footer">
          <div className={`health-indicator health-${healthStatus}`}>
            <div className="health-dot" />
            <span>{healthStatus === 'online' ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </aside>

      {/* Chat Interface */}
      <main className="chat-interface">
        <div className="chat-header">
          <div className="header-content">
            <h1>Chat with Vi</h1>
            <p>Conversation with the transparency API</p>
          </div>
          <button 
            className="debug-toggle" 
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            title="Toggle debug panel"
          >
            ⚙️ Debug
          </button>
        </div>

        <div className="chat-container">
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-empty">
                <div className="empty-icon">💭</div>
                <h3>Start a conversation</h3>
                <p>Type a message below to begin. Vi will remember this conversation.</p>
              </div>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`chat-message chat-${msg.role}`}>
                  <div className="message-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
                  <div className="message-content">
                    <div className="message-role">{msg.role === 'user' ? 'You' : 'Vi'}</div>
                    <div className="message-text">{msg.message}</div>
                    <div className="message-time">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="chat-message chat-assistant loading">
                <div className="message-avatar">🤖</div>
                <div className="message-content">
                  <div className="message-role">Vi</div>
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}>
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !chatLoading && sendChatMessage()}
              placeholder="Ask Vi something..."
              disabled={chatLoading || !activeConversationId}
              className="chat-input"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim() || !activeConversationId}
              className="send-btn"
            >
              Send
            </button>
          </form>

          <div className="chat-status">
            {error ? <span className="status-error">{error}</span> : <span className="status-ok">{status}</span>}
          </div>
        </div>
      </main>

      {/* Debug Panel (Sidebar) */}
      {showDebugPanel && (
        <aside className="debug-panel">
          <div className="debug-header">
            <h3>Debug Panel</h3>
            <button className="close-btn" onClick={() => setShowDebugPanel(false)}>✕</button>
          </div>

          <div className="debug-tabs">
            <div className="debug-section">
              <h4>User ID</h4>
              <div style={{ wordBreak: 'break-all', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                {userId}
              </div>
            </div>

            <div className="debug-section">
              <h4>API Base</h4>
              <button 
                onClick={() => setShowApiConfig(!showApiConfig)}
                style={{ fontSize: '0.8rem', marginBottom: '8px' }}
              >
                {showApiConfig ? '▼' : '▶'} {apiBase.includes('localhost') ? 'Local' : 'Remote'}
              </button>
              {showApiConfig && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <input
                    type="text"
                    value={customApiBase}
                    onChange={(e) => setCustomApiBase(e.target.value)}
                    placeholder="http://localhost:3000"
                    style={{ 
                      padding: '6px 8px', 
                      fontSize: '0.8rem',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                      borderRadius: '6px',
                      color: 'var(--text-primary)'
                    }}
                  />
                  <button onClick={updateApiBase} style={{ fontSize: '0.8rem' }}>
                    Update
                  </button>
                </div>
              )}
            </div>

            <div className="debug-section">
              <h4>Testing Checklist</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {testingChecklistItems.map(item => (
                  <label key={item.id} style={{ display: 'flex', marginBottom: '8px', fontSize: '0.8rem' }}>
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleChecklistItem(item.id)}
                      style={{ marginRight: '6px' }}
                    />
                    <span>{item.title}</span>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '8px' }}>
                {testingChecklistItems.filter(i => i.completed).length} of {testingChecklistItems.length}
              </p>
            </div>
          </div>
        </aside>
      )}

      {/* Styles */}
      <style>{`
        .app.chat-focused {
          display: grid;
          grid-template-columns: 280px 1fr ${showDebugPanel ? '280px' : '0'};
          gap: 0;
          height: 100vh;
          overflow: hidden;
        }

        .conversations-sidebar {
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-default);
          overflow: hidden;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border-bottom: 1px solid var(--border-default);
          gap: 8px;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
        }

        .brand-mark {
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background: var(--accent);
          color: var(--bg-primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 16px;
        }

        .brand-title {
          font-weight: 600;
          font-size: 16px;
          color: var(--text-primary);
          margin: 0;
        }

        .new-chat-btn {
          background: var(--accent);
          color: var(--bg-primary);
          border: none;
          border-radius: 6px;
          padding: 8px 12px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .new-chat-btn:hover {
          background: var(--color-gold-hover);
        }

        .conversations-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }

        .empty-conversations {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 16px;
          color: var(--text-tertiary);
          text-align: center;
          padding: 20px;
        }

        .conversation-item {
          padding: 12px;
          margin-bottom: 8px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }

        .conversation-item:hover {
          background: var(--bg-elevated);
          border-color: var(--border-default);
        }

        .conversation-item.active {
          background: var(--bg-elevated);
          border-color: var(--accent);
        }

        .conv-content {
          flex: 1;
          min-width: 0;
        }

        .conv-title {
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
          margin: 0 0 4px 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .conv-date {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          margin: 0;
        }

        .conv-delete {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 0.9rem;
          opacity: 0;
          transition: opacity 0.2s;
          padding: 4px;
        }

        .conversation-item:hover .conv-delete {
          opacity: 1;
        }

        .conv-delete:hover {
          color: var(--color-gold);
        }

        .sidebar-footer {
          padding: 12px;
          border-top: 1px solid var(--border-default);
          font-size: 0.8rem;
        }

        .health-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--text-secondary);
        }

        .health-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        .health-indicator.health-online .health-dot {
          background: #00ff00;
        }

        .health-indicator.health-offline .health-dot {
          background: #ff4444;
          animation: none;
        }

        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }

        /* Chat Interface */
        .chat-interface {
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          overflow: hidden;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 20px;
          border-bottom: 1px solid var(--border-default);
          background: var(--bg-secondary);
        }

        .header-content h1 {
          margin: 0 0 4px 0;
          font-size: 20px;
          color: var(--text-primary);
        }

        .header-content p {
          margin: 0;
          font-size: 0.85rem;
          color: var(--text-tertiary);
        }

        .debug-toggle {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.85rem;
          transition: all 0.2s;
        }

        .debug-toggle:hover {
          background: var(--bg-elevated);
          border-color: var(--border-default);
        }

        .chat-container {
          display: flex;
          flex-direction: column;
          flex: 1;
          overflow: hidden;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 20px;
        }

        .chat-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-tertiary);
          text-align: center;
        }

        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .chat-empty h3 {
          margin: 0 0 8px 0;
          color: var(--text-primary);
        }

        .chat-empty p {
          margin: 0;
          font-size: 0.9rem;
        }

        .chat-message {
          display: flex;
          gap: 12px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .chat-message.chat-user {
          justify-content: flex-end;
        }

        .chat-message.chat-user .message-content {
          background: var(--accent);
          color: var(--bg-primary);
          border-radius: 12px 12px 0 12px;
        }

        .chat-message.chat-assistant .message-content {
          background: var(--bg-secondary);
          border: 1px solid var(--border-default);
          border-radius: 12px 12px 12px 0;
        }

        .message-avatar {
          font-size: 20px;
          flex-shrink: 0;
          margin-top: 4px;
        }

        .chat-message.chat-user .message-avatar {
          order: 2;
        }

        .message-content {
          max-width: 70%;
          padding: 12px 16px;
          border-radius: 12px;
        }

        .message-role {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.7;
          margin-bottom: 4px;
        }

        .message-text {
          font-size: 0.95rem;
          line-height: 1.4;
          word-wrap: break-word;
        }

        .message-time {
          font-size: 0.7rem;
          opacity: 0.6;
          margin-top: 4px;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 8px 0;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { opacity: 0.5; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-10px); }
        }

        .chat-input-form {
          display: flex;
          gap: 12px;
          padding: 16px;
          background: var(--bg-secondary);
          border-top: 1px solid var(--border-default);
        }

        .chat-input {
          flex: 1;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          padding: 12px 16px;
          border-radius: 8px;
          font-size: 0.95rem;
        }

        .chat-input:focus {
          outline: none;
          border-color: var(--accent);
        }

        .chat-input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .send-btn {
          background: var(--accent);
          color: var(--bg-primary);
          border: none;
          border-radius: 8px;
          padding: 12px 24px;
          font-weight: 600;
          cursor: pointer;
          white-space: nowrap;
        }

        .send-btn:hover:not(:disabled) {
          background: var(--color-gold-hover);
        }

        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .chat-status {
          padding: 8px 16px;
          font-size: 0.8rem;
          text-align: center;
        }

        .status-ok {
          color: var(--text-tertiary);
        }

        .status-error {
          color: #ff6b6b;
        }

        /* Debug Panel */
        .debug-panel {
          display: flex;
          flex-direction: column;
          background: var(--bg-secondary);
          border-left: 1px solid var(--border-default);
          overflow-y: auto;
          align-items: stretch;
        }

        .debug-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border-default);
        }

        .debug-header h3 {
          margin: 0;
          font-size: 14px;
        }

        .close-btn {
          background: none;
          border: none;
          color: var(--text-tertiary);
          cursor: pointer;
          font-size: 16px;
        }

        .close-btn:hover {
          color: var(--text-primary);
        }

        .debug-tabs {
          padding: 12px;
          overflow-y: auto;
          flex: 1;
        }

        .debug-section {
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--border-subtle);
        }

        .debug-section h4 {
          margin: 0 0 8px 0;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        /* Scrollbar styling */
        ::-webkit-scrollbar {
          width: 8px;
        }

        ::-webkit-scrollbar-track {
          background: var(--bg-secondary);
        }

        ::-webkit-scrollbar-thumb {
          background: var(--border-default);
          border-radius: 4px;
        }

        ::-webkit-scrollbar-thumb:hover {
          background: var(--border-strong);
        }
      `}</style>
    </div>
  );
}
