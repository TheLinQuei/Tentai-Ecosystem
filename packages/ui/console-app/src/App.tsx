import { useEffect, useMemo, useState } from 'react';

const workspaces = [
  { id: 'chat', label: 'Chat' },
  { id: 'lore', label: 'Lore' },
  { id: 'discord', label: 'Discord' },
  { id: 'control-plane', label: 'Control Plane' },
];

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

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  message: string;
  timestamp: number;
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

const navItems = [
  { id: 'chat', label: 'Chat (Live)' },
  { id: 'audit', label: 'Reasoning Audit' },
  { id: 'safety', label: 'Safety Profile' },
  { id: 'loyalty', label: 'Loyalty Contract' },
  { id: 'memory', label: 'Memory Audit' },
  { id: 'testing', label: 'Testing Checklist' },
];

const resolveApiBase = () => {
  // Check if user has manually set API base in localStorage
  const userOverride = localStorage.getItem('vi-api-base');
  if (userOverride) {
    return userOverride;
  }

  const configured = import.meta.env.VITE_API_BASE as string | undefined;
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  if (typeof window !== 'undefined') {
    if (window.location.hostname === 'localhost') {
      return 'http://localhost:3000';
    }
    // When deployed to production, use Render backend
    return 'https://tentai-ecosystem.onrender.com';
  }

  return 'http://localhost:3000';
};

export default function App() {
  const apiBase = useMemo(() => resolveApiBase(), []);
  
  // Debug: log the resolved API base
  if (typeof window !== 'undefined') {
    console.log('🔌 API Base Resolved:', apiBase);
    console.log('🌐 Hostname:', window.location.hostname);
  }
  const [workspace, setWorkspace] = useState(workspaces[3]);
  const [userId, setUserId] = useState('');
  const [auditLimit, setAuditLimit] = useState(10);
  const [auditTraces, setAuditTraces] = useState<AuditTrace[]>([]);
  const [safetyProfile, setSafetyProfile] = useState<SafetyProfile>(defaultSafety);
  const [contract, setContract] = useState<LoyaltyContract>(defaultContract);
  const [memoryRecords, setMemoryRecords] = useState<MemoryRecord[]>([]);
  const [status, setStatus] = useState<string>('Idle');
  const [error, setError] = useState<string>('');
  const [healthStatus, setHealthStatus] = useState<'online' | 'offline' | 'checking'>('checking');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [testingChecklistItems, setTestingChecklistItems] = useState<TestingChecklistItem[]>([
    { id: '1', category: 'Behavior', title: 'Responses are relevant', description: 'Check if Vi responds accurately to prompts', completed: false },
    { id: '2', category: 'Behavior', title: 'Tone is appropriate', description: 'Verify tone matches workspace context', completed: false },
    { id: '3', category: 'Safety', title: 'Refuses harmful requests', description: 'Test refusal mechanism on edge cases', completed: false },
    { id: '4', category: 'Safety', title: 'Explains refusals clearly', description: 'Check explanation quality and reasoning', completed: false },
    { id: '5', category: 'Context', title: 'Remembers conversation history', description: 'Verify multi-turn context awareness', completed: false },
    { id: '6', category: 'Context', title: 'Respects user preferences', description: 'Check if user settings are honored', completed: false },
    { id: '7', category: 'Performance', title: 'Responses are timely', description: 'Measure latency and responsiveness', completed: false },
    { id: '8', category: 'Performance', title: 'Handles long inputs gracefully', description: 'Test with extended prompts', completed: false },
  ]);

  const [customApiBase, setCustomApiBase] = useState<string>(apiBase);
  const [showApiConfig, setShowApiConfig] = useState<boolean>(false);

  const canQuery = userId.trim().length > 0;

  // Generate a UUID for userId on mount
  useEffect(() => {
    if (!userId) {
      // Simple UUID v4 generation
      const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      setUserId(uuid);
      console.log('🆔 Generated userId:', uuid);
    }
  }, []);

  // Health check effect - polls every 5 seconds
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

  const handleError = (message: string) => {
    setError(message);
    setStatus('Error');
  };

  const fetchAudit = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Loading audit traces...');
    setError('');

    try {
      const url = `${apiBase}/v1/transparency/audit?userId=${encodeURIComponent(userId)}&limit=${auditLimit}`;
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('Audit endpoint unavailable:', response.status);
        setAuditTraces([]);
        setStatus('Audit not available (debug feature)');
        return;
      }
      const data = await response.json();
      setAuditTraces(data.traces || []);
      setStatus('Audit traces loaded.');
    } catch (err) {
      console.warn('Audit fetch error:', err);
      setAuditTraces([]);
      setStatus('Audit not available (debug feature)');
    }
  };

  const fetchSafetyProfile = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Loading safety profile...');
    setError('');

    try {
      const response = await fetch(`${apiBase}/v1/safety/profile/${encodeURIComponent(userId)}`);
      if (!response.ok) {
        console.warn('Safety profile endpoint unavailable:', response.status);
        setSafetyProfile(defaultSafety);
        setStatus('Using default safety settings');
        return;
      }
      const data = (await response.json()) as SafetyProfile;
      setSafetyProfile({ ...defaultSafety, ...data });
      setStatus('Safety profile loaded.');
    } catch (err) {
      console.warn('Safety profile fetch error:', err);
      setSafetyProfile(defaultSafety);
      setStatus('Using default safety settings');
    }
  };

  const updateSafetyProfile = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Updating safety profile...');
    setError('');

    try {
      const response = await fetch(`${apiBase}/v1/safety/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          settings: {
            safety_level: safetyProfile.safety_level,
            context_sensitivity: safetyProfile.context_sensitivity,
            refusal_explanation: safetyProfile.refusal_explanation,
            appeal_process: safetyProfile.appeal_process,
            custom_rules: safetyProfile.custom_rules,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update safety profile.');
      }

      const data = (await response.json()) as SafetyProfile;
      setSafetyProfile({ ...defaultSafety, ...data });
      setStatus('Safety profile updated.');
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Unknown error.');
    }
  };

  const fetchContract = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Loading loyalty contract...');
    setError('');

    try {
      const response = await fetch(`${apiBase}/v1/loyalty/contract/${encodeURIComponent(userId)}`);
      if (!response.ok) {
        console.warn('Loyalty contract endpoint unavailable:', response.status);
        setContract(defaultContract);
        setStatus('Using default contract settings');
        return;
      }
      const data = (await response.json()) as LoyaltyContract;
      setContract({ ...defaultContract, ...data });
      setStatus('Loyalty contract loaded.');
    } catch (err) {
      console.warn('Loyalty contract fetch error:', err);
      setContract(defaultContract);
      setStatus('Using default contract settings');
    }
  };

  const updateContract = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Updating loyalty contract...');
    setError('');

    try {
      const response = await fetch(`${apiBase}/v1/loyalty/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          contract: {
            primary_goals: contract.primary_goals,
            boundaries: contract.boundaries,
            override_conditions: contract.override_conditions,
            verification_frequency: contract.verification_frequency,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update loyalty contract.');
      }

      const data = (await response.json()) as LoyaltyContract;
      setContract({ ...defaultContract, ...data });
      setStatus('Loyalty contract updated.');
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Unknown error.');
    }
  };

  const verifyContract = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Verifying contract...');
    setError('');

    try {
      const response = await fetch(`${apiBase}/v1/loyalty/contract/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        throw new Error('Failed to verify contract.');
      }

      await fetchContract();
      setStatus('Contract verified.');
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Unknown error.');
    }
  };

  const fetchMemoryAudit = async () => {
    if (!canQuery) {
      handleError('User ID is required.');
      return;
    }

    setStatus('Loading memory audit...');
    setError('');

    try {
      const response = await fetch(
        `${apiBase}/v1/transparency/memory/audit?userId=${encodeURIComponent(userId)}&limit=10`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch memory audit.');
      }
      const data = await response.json();
      setMemoryRecords(data.memories || []);
      setStatus('Memory audit loaded.');
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Unknown error.');
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) {
      handleError('Message cannot be empty.');
      return;
    }

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      message: chatInput,
      timestamp: Date.now(),
    };

    setChatMessages([...chatMessages, userMessage]);
    const messageText = chatInput;
    setChatInput('');
    setChatLoading(true);
    setError('');

    try {
      const requestBody: any = {
        message: messageText,
        context: {
          recentHistory: chatMessages.slice(-5).map(m => m.message),
        },
        includeTrace: false,
      };

      // Only include sessionId if userId is not empty (backend expects valid UUID or omitted)
      if (userId && userId.trim()) {
        requestBody.sessionId = userId;
      }

      const response = await fetch(`${apiBase}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = {
        id: data.recordId || (Date.now() + 1).toString(),
        role: 'assistant',
        message: data.output || 'No response',
        timestamp: Date.now(),
      };

      setChatMessages(prev => [...prev, assistantMessage]);
      setStatus(`Message received. Session: ${data.sessionId?.slice(0, 8) || '?'}`);
    } catch (err) {
      handleError(err instanceof Error ? err.message : 'Chat failed.');
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

  return (
    <div className="app">
      <div className="ambient-glow" />
      <div className="layout">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark">V</div>
            <div>
              <p className="brand-title">Vi Console</p>
              <p className="brand-subtitle">Transparency Suite</p>
            </div>
          </div>
          
          <div className="api-config" style={{ 
            padding: '10px', 
            background: 'var(--bg-tertiary)', 
            borderRadius: '8px',
            border: '1px solid var(--border-default)'
          }}>
            <button 
              onClick={() => setShowApiConfig(!showApiConfig)}
              style={{ 
                fontSize: '0.8rem', 
                padding: '6px 10px', 
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              ⚙️ Backend: {apiBase.includes('localhost') ? 'Local :3000' : 'Remote'}
            </button>
            {showApiConfig && (
              <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
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
                <button onClick={updateApiBase} style={{ fontSize: '0.8rem', padding: '6px 10px' }}>
                  Update & Reload
                </button>
              </div>
            )}
          </div>
          
          <nav className="nav">
            {navItems.map((item) => (
              <a key={item.id} href={`#${item.id}`} className="nav-link">
                {item.label}
              </a>
            ))}
          </nav>
          <div className="quick-actions">
            <p className="quick-title">Quick Actions</p>
            <button className="action" onClick={fetchAudit}>
              Refresh Audit
            </button>
            <button className="action ghost" onClick={fetchSafetyProfile}>
              Load Safety Profile
            </button>
            <button className="action ghost" onClick={fetchContract}>
              Load Loyalty Contract
            </button>
            <button className="action ghost" onClick={fetchMemoryAudit}>
              Refresh Memory Audit
            </button>
          </div>
          <div className="sidebar-status">
            <span className={error ? 'status-error' : 'status-ok'}>{error || status}</span>
          </div>
          <div className="health-indicator">
            <div className={`health-dot health-${healthStatus}`} />
            <span className="health-text">
              {healthStatus === 'checking' && 'Backend: Checking...'}
              {healthStatus === 'online' && 'Backend: Online'}
              {healthStatus === 'offline' && 'Backend: Offline'}
            </span>
          </div>
        </aside>

        <div className="content">
          <div className="alpha-banner">
            <span className="alpha-tag">Alpha</span>
            Manual testing environment. Features and data may change.
          </div>
          <header className="hero">
            <div>
              <p className="eyebrow">Phase 3 Transparency Console</p>
              <h1>Vi Command Deck</h1>
              <p className="subtitle">
                Audit traces, safety settings, and loyalty contracts in one cockpit. Built for founders
                and operators.
              </p>
            </div>
            <div className="hero-card">
              <div className="field">
                <label>User ID</label>
                <input
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  placeholder="Paste user UUID"
                />
              </div>
              <div className="field">
                <label>Audit Limit</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={auditLimit}
                  onChange={(event) => setAuditLimit(Number(event.target.value))}
                />
              </div>
            </div>
          </header>

          <section className="workspace-switcher">
            <h2>Workspace</h2>
            <div className="pill-group">
              {workspaces.map((space) => (
                <button
                  key={space.id}
                  className={`pill ${workspace.id === space.id ? 'active' : ''}`}
                  onClick={() => setWorkspace(space)}
                >
                  {space.label}
                </button>
              ))}
            </div>
            <p className="workspace-note">
              Active: <strong>{workspace.label}</strong> · Role: Founder
            </p>
          </section>

          <main className="grid">
        <section className="panel" id="audit">
          <div className="panel-header">
            <div>
              <h3>Reasoning Trace Audit</h3>
              <p>Monitor decision trails and violations.</p>
            </div>
            <button className="action" onClick={fetchAudit}>
              Refresh Audit
            </button>
          </div>
          <div className="panel-body">
            {auditTraces.length === 0 ? (
              <div className="empty">No traces yet. Run a trace-producing action.</div>
            ) : (
              <div className="list">
                {auditTraces.map((trace) => (
                  <div className="list-item" key={trace.trace_id}>
                    <div>
                      <h4>{trace.intent_category || 'Unknown intent'}</h4>
                      <p>Record: {trace.record_id}</p>
                    </div>
                    <div className="meta">
                      <span>{Math.round((trace.intent_confidence || 0) * 100)}% confidence</span>
                      <span className={trace.had_violation ? 'flag' : 'ok'}>
                        {trace.had_violation ? 'Violation' : 'Clean'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel" id="safety">
          <div className="panel-header">
            <div>
              <h3>Safety Profile</h3>
              <p>Dial safety levels and guardrails for this user.</p>
            </div>
            <div className="panel-actions">
              <button className="action ghost" onClick={fetchSafetyProfile}>
                Load
              </button>
              <button className="action" onClick={updateSafetyProfile}>
                Save
              </button>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="safety-level-select">Safety Level</label>
                <select
                  id="safety-level-select"
                  value={safetyProfile.safety_level}
                  onChange={(event) =>
                    setSafetyProfile((prev) => ({
                      ...prev,
                      safety_level: event.target.value as SafetyProfile['safety_level'],
                    }))
                  }
                >
                  <option value="maximum">Maximum</option>
                  <option value="balanced">Balanced</option>
                  <option value="minimal">Minimal</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="refusal-explanation-select">Refusal Explanation</label>
                <select
                  id="refusal-explanation-select"
                  value={safetyProfile.refusal_explanation}
                  onChange={(event) =>
                    setSafetyProfile((prev) => ({
                      ...prev,
                      refusal_explanation: event.target.value as SafetyProfile['refusal_explanation'],
                    }))
                  }
                >
                  <option value="detailed">Detailed</option>
                  <option value="brief">Brief</option>
                </select>
              </div>
              <div className="field toggle">
                <label htmlFor="context-sensitivity-checkbox">
                  <input
                    id="context-sensitivity-checkbox"
                    type="checkbox"
                    checked={safetyProfile.context_sensitivity}
                    onChange={(event) =>
                      setSafetyProfile((prev) => ({
                        ...prev,
                        context_sensitivity: event.target.checked,
                      }))
                    }
                  />
                  Context sensitivity enabled
                </label>
              </div>
              <div className="field toggle">
                <label htmlFor="appeal-process-checkbox">
                  <input
                    id="appeal-process-checkbox"
                    type="checkbox"
                    checked={safetyProfile.appeal_process}
                    onChange={(event) =>
                      setSafetyProfile((prev) => ({
                        ...prev,
                        appeal_process: event.target.checked,
                      }))
                    }
                  />
                  Appeal process enabled
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="panel" id="loyalty">
          <div className="panel-header">
            <div>
              <h3>Loyalty Contract</h3>
              <p>Define primary goals and hard boundaries.</p>
            </div>
            <div className="panel-actions">
              <button className="action ghost" onClick={fetchContract}>
                Load
              </button>
              <button className="action" onClick={updateContract}>
                Save
              </button>
              <button className="action" onClick={verifyContract}>
                Verify
              </button>
            </div>
          </div>
          <div className="panel-body">
            <div className="form-grid">
              <div className="field">
                <label>Primary Goals (comma separated)</label>
                <input
                  value={contract.primary_goals.join(', ')}
                  onChange={(event) =>
                    setContract((prev) => ({
                      ...prev,
                      primary_goals: event.target.value
                        .split(',')
                        .map((goal) => goal.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Boundaries (comma separated)</label>
                <input
                  value={contract.boundaries.join(', ')}
                  onChange={(event) =>
                    setContract((prev) => ({
                      ...prev,
                      boundaries: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div className="field">
                <label>Override Conditions (comma separated)</label>
                <input
                  value={contract.override_conditions.join(', ')}
                  onChange={(event) =>
                    setContract((prev) => ({
                      ...prev,
                      override_conditions: event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    }))
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="verification-frequency-select">Verification Frequency</label>
                <select
                  id="verification-frequency-select"
                  value={contract.verification_frequency}
                  onChange={(event) =>
                    setContract((prev) => ({
                      ...prev,
                      verification_frequency: event.target.value,
                    }))
                  }
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        <section className="panel" id="memory">
          <div className="panel-header">
            <div>
              <h3>Memory Audit</h3>
              <p>Review stored memories and authority levels.</p>
            </div>
            <button className="action" onClick={fetchMemoryAudit}>
              Refresh Memory
            </button>
          </div>
          <div className="panel-body">
            {memoryRecords.length === 0 ? (
              <div className="empty">No memory audit records available.</div>
            ) : (
              <div className="list">
                {memoryRecords.map((memory) => (
                  <div className="list-item" key={memory.record_id}>
                    <div>
                      <h4>{memory.authority_level}</h4>
                      <p>{memory.content}</p>
                    </div>
                    <div className="meta">
                      <span>{memory.created_at || 'timestamp pending'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel" id="chat">
          <div className="panel-header">
            <div>
              <h3>Chat with Vi</h3>
              <p>Live conversation with the transparency API.</p>
            </div>
          </div>
          <div className="panel-body chat-panel">
            <div className="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="empty-chat">Start a conversation. Type a message below.</div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`chat-message chat-${msg.role}`}>
                    <div className="chat-role">{msg.role === 'user' ? 'You' : 'Vi'}</div>
                    <div className="chat-content">{msg.message}</div>
                    <div className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</div>
                  </div>
                ))
              )}
              {chatLoading && (
                <div className="chat-message chat-assistant loading">
                  <div className="chat-role">Vi</div>
                  <div className="chat-content typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              )}
            </div>
            <form className="chat-input-group" onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}>
              <label htmlFor="chat-message-input" className="sr-only">Message</label>
              <input
                id="chat-message-input"
                name="message"
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask Vi something..."
                disabled={chatLoading}
                className="chat-input"
                autoComplete="off"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="action"
              >
                {chatLoading ? 'Sending...' : 'Send'}
              </button>
            </form>
          </div>
        </section>

        <section className="panel" id="testing">
          <div className="panel-header">
            <div>
              <h3>Manual Testing Checklist</h3>
              <p>Track Vi's validation across behavior, safety, context, and performance.</p>
            </div>
          </div>
          <div className="panel-body testing-panel">
            <div className="testing-checklist">
              {testingChecklistItems.map((item) => (
                <div key={item.id} className="checklist-item">
                  <input
                    type="checkbox"
                    id={`check-${item.id}`}
                    checked={item.completed}
                    onChange={() => toggleChecklistItem(item.id)}
                    className="checklist-checkbox"
                  />
                  <label htmlFor={`check-${item.id}`} className="checklist-label">
                    <div className="item-header">
                      <span className="item-title">{item.title}</span>
                      <span className="item-category">{item.category}</span>
                    </div>
                    <p className="item-description">{item.description}</p>
                  </label>
                </div>
              ))}
            </div>
            <div className="testing-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{
                    width: `${(testingChecklistItems.filter(i => i.completed).length / testingChecklistItems.length) * 100}%`,
                  }}
                />
              </div>
              <p className="progress-text">
                {testingChecklistItems.filter(i => i.completed).length} of {testingChecklistItems.length} complete
              </p>
            </div>
          </div>
        </section>
          </main>
        </div>
      </div>
    </div>
  );
}
