# Phase 3: Frontend Modernization (Weeks 3-4, 30-40 hours)

## Overview
Modernize Sovereign's frontend from single 2,163-line HTML file to maintainable React application with component library.

## Task 3.1: React Migration (15-20 hours)

### Current State
```
clients/command/sovereign/public/index.html (2,163 lines)
├── All styles (CSS)
├── All components (DOM elements)
├── All logic (JavaScript)
└── No separation of concerns
```

### Target State
```
clients/command/sovereign/src/
├── components/
│   ├── Chat.tsx
│   ├── CodeBlock.tsx
│   ├── ResponseTime.tsx
│   └── ...
├── hooks/
│   ├── useChat.ts
│   ├── useAuth.ts
│   └── useWebSocket.ts
├── pages/
│   ├── ChatPage.tsx
│   └── LoginPage.tsx
├── styles/
│   ├── theme.css
│   ├── components.css
│   └── ...
└── App.tsx
```

### Implementation

**1. Set up React project**
```bash
cd clients/command/sovereign
npm install react react-dom typescript @types/react @types/react-dom
npm install -D vite @vitejs/plugin-react typescript
npm install axios zustand
```

**2. Create package.json updates**
```json
{
  "name": "sovereign-console",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0",
    "zustand": "^4.4.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.3.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0"
  }
}
```

**3. Create main components**

**App.tsx:**
```typescript
import { useEffect } from 'react';
import { useAuthStore } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import './styles/App.css';

export default function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <div className="app">
      {isAuthenticated ? <ChatPage /> : <LoginPage />}
    </div>
  );
}
```

**hooks/useAuth.ts:**
```typescript
import { create } from 'zustand';
import axios from 'axios';

interface AuthStore {
  isAuthenticated: boolean;
  user: any;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  user: null,
  token: localStorage.getItem('authToken'),

  login: async (email: string, password: string) => {
    const response = await axios.post('/api/auth/login', { email, password });
    const { token, user } = response.data.data;
    
    localStorage.setItem('authToken', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    
    set({ isAuthenticated: true, user, token });
  },

  logout: () => {
    localStorage.removeItem('authToken');
    delete axios.defaults.headers.common['Authorization'];
    set({ isAuthenticated: false, user: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem('authToken');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }

    try {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get('/api/auth/me');
      set({ isAuthenticated: true, user: response.data.data, token });
    } catch {
      set({ isAuthenticated: false, token: null });
      localStorage.removeItem('authToken');
    }
  }
}));
```

**hooks/useChat.ts:**
```typescript
import { create } from 'zustand';
import axios from 'axios';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  responseTime?: number;
}

interface ChatStore {
  conversationId: string | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  
  sendMessage: (content: string) => Promise<void>;
  startConversation: () => Promise<void>;
  loadMessages: () => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversationId: null,
  messages: [],
  isLoading: false,
  error: null,

  startConversation: async () => {
    try {
      const response = await axios.post('/api/conversations');
      const { id } = response.data.data;
      set({ conversationId: id, messages: [], error: null });
    } catch (error: any) {
      set({ error: error.response?.data?.error?.message || 'Failed to start conversation' });
    }
  },

  sendMessage: async (content: string) => {
    const { conversationId } = get();
    if (!conversationId) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now()
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isLoading: true,
      error: null
    }));

    try {
      const startTime = Date.now();
      const response = await axios.post(
        `/api/conversations/${conversationId}/messages`,
        { content }
      );
      const responseTime = Date.now() - startTime;

      const assistantMessage: Message = {
        id: response.data.data.id,
        role: 'assistant',
        content: response.data.data.content,
        timestamp: response.data.data.timestamp,
        responseTime
      };

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        isLoading: false
      }));
    } catch (error: any) {
      set({
        error: error.response?.data?.error?.message || 'Failed to send message',
        isLoading: false
      });
    }
  },

  loadMessages: async () => {
    const { conversationId } = get();
    if (!conversationId) return;

    try {
      const response = await axios.get(
        `/api/conversations/${conversationId}/messages`
      );
      set({ messages: response.data.data, error: null });
    } catch (error: any) {
      set({
        error: error.response?.data?.error?.message || 'Failed to load messages'
      });
    }
  }
}));
```

**components/Chat.tsx:**
```typescript
import { useEffect } from 'react';
import { useChatStore } from '../hooks/useChat';
import MessageList from './MessageList';
import InputBox from './InputBox';

export default function Chat() {
  const { conversationId, isLoading, error, loadMessages } = useChatStore();

  useEffect(() => {
    if (conversationId) {
      loadMessages();
    }
  }, [conversationId]);

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Vi Console</h1>
        {error && <div className="error-banner">{error}</div>}
      </div>

      <MessageList />
      <InputBox disabled={isLoading} />
    </div>
  );
}
```

**components/MessageList.tsx:**
```typescript
import { useRef, useEffect } from 'react';
import { useChatStore } from '../hooks/useChat';
import Message from './Message';

export default function MessageList() {
  const { messages } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="messages-list">
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
```

**components/InputBox.tsx:**
```typescript
import { useState } from 'react';
import { useChatStore } from '../hooks/useChat';

interface InputBoxProps {
  disabled: boolean;
}

export default function InputBox({ disabled }: InputBoxProps) {
  const [input, setInput] = useState('');
  const { sendMessage } = useChatStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;

    await sendMessage(input);
    setInput('');
  };

  return (
    <form className="input-form" onSubmit={handleSubmit}>
      <textarea
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={disabled}
        placeholder="Type your message..."
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.ctrlKey) {
            handleSubmit(e as any);
          }
        }}
      />
      <button type="submit" disabled={disabled || !input.trim()}>
        Send
      </button>
    </form>
  );
}
```

### Success Criteria
✅ React app compiles and runs  
✅ Authentication flow working  
✅ Chat sends/receives messages  
✅ Responsive design maintained  

---

## Task 3.2: Component Library (8-10 hours)

### Create Reusable Components

**components/CodeBlock.tsx:**
```typescript
import { useState } from 'react';
import './CodeBlock.css';

interface CodeBlockProps {
  language: string;
  code: string;
}

export default function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="language">{language}</span>
        <button className="copy-btn" onClick={copyToClipboard}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  );
}
```

**components/ResponseTime.tsx:**
```typescript
import './ResponseTime.css';

interface ResponseTimeProps {
  milliseconds: number;
}

export default function ResponseTime({ milliseconds }: ResponseTimeProps) {
  const getColor = (ms: number) => {
    if (ms < 500) return 'green';
    if (ms < 1000) return 'yellow';
    return 'red';
  };

  return (
    <div className={`response-time ${getColor(milliseconds)}`}>
      ⏱ {milliseconds}ms
    </div>
  );
}
```

**components/LoadingSpinner.tsx:**
```typescript
import './LoadingSpinner.css';

export default function LoadingSpinner() {
  return <div className="spinner"></div>;
}
```

### Success Criteria
✅ Component library complete  
✅ Components reusable across app  
✅ Consistent styling  

---

## Task 3.3: Memory Viewer UI (6-8 hours)

### Create Memory Visualization

**components/MemoryViewer.tsx:**
```typescript
import { useEffect, useState } from 'react';
import axios from 'axios';
import './MemoryViewer.css';

interface Memory {
  id: string;
  type: 'semantic' | 'episodic' | 'procedural';
  embedding: number[];
  summary: string;
  frequency: number;
  created_at: string;
}

export default function MemoryViewer() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    try {
      const response = await axios.get('/api/memories');
      setMemories(response.data.data);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading memories...</div>;

  return (
    <div className="memory-viewer">
      <h2>Memory Bank</h2>
      <div className="memory-stats">
        <div className="stat">
          <strong>Total Memories:</strong> {memories.length}
        </div>
        <div className="stat">
          <strong>Semantic:</strong> {memories.filter(m => m.type === 'semantic').length}
        </div>
        <div className="stat">
          <strong>Episodic:</strong> {memories.filter(m => m.type === 'episodic').length}
        </div>
      </div>

      <div className="memories-grid">
        {memories.map((memory) => (
          <div key={memory.id} className={`memory-card ${memory.type}`}>
            <div className="memory-type">{memory.type}</div>
            <div className="memory-content">{memory.summary}</div>
            <div className="memory-frequency">
              Frequency: {memory.frequency}
            </div>
            <div className="memory-date">
              {new Date(memory.created_at).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Success Criteria
✅ Memory viewer displays memories  
✅ Filters by type working  
✅ Visual hierarchy clear  

---

## Task 3.4: Evidence Panel (6-8 hours)

### Create Evidence Citation Panel

**components/EvidencePanel.tsx:**
```typescript
import './EvidencePanel.css';

interface Evidence {
  id: string;
  type: 'memory' | 'tool_result' | 'external' | 'reasoning';
  content: string;
  confidence: number;
  source: string;
}

interface EvidencePanelProps {
  evidence: Evidence[];
  visible: boolean;
}

export default function EvidencePanel({ evidence, visible }: EvidencePanelProps) {
  if (!visible) return null;

  return (
    <div className="evidence-panel">
      <h3>Evidence & Sources</h3>
      <div className="evidence-list">
        {evidence.map((item) => (
          <div key={item.id} className="evidence-item">
            <div className="evidence-header">
              <span className="evidence-type">{item.type}</span>
              <span className="confidence">
                Confidence: {Math.round(item.confidence * 100)}%
              </span>
            </div>
            <div className="evidence-content">{item.content}</div>
            <div className="evidence-source">Source: {item.source}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Success Criteria
✅ Evidence panel toggles visibility  
✅ Shows sources for responses  
✅ Confidence scores visible  

---

## Implementation Checklist

- [ ] Set up React/TypeScript/Vite
- [ ] Create authentication flow
- [ ] Create chat messaging UI
- [ ] Build component library
- [ ] Create memory viewer
- [ ] Build evidence panel
- [ ] Style responsive design
- [ ] Add error handling
- [ ] Test in different browsers
- [ ] Performance optimization

## Estimated Time: 30-40 hours

- React setup & architecture: 5 hours
- Core chat components: 10 hours
- Component library: 8-10 hours
- Memory viewer: 6-8 hours
- Evidence panel: 6-8 hours
- Testing & optimization: 2-3 hours

## Success Criteria

✅ App loads in < 2 seconds  
✅ Chat responsive and fast  
✅ Mobile-friendly design  
✅ No console errors  
✅ Accessibility standards met  

---

# Phase 4: Testing & Documentation (Week 5, 17-21 hours)

## Task 4.1: Comprehensive Test Suite (6-7 hours)

### Identify Under-Tested Areas
- Tool execution flow
- Memory consolidation
- Policy enforcement
- Error recovery

### Add Tests
```typescript
// tests/tool-execution.test.ts
import { describe, it, expect } = vitest;
import { executeToolStep } from '../src/runtime/tool-executor';

describe('Tool Execution', () => {
  it('should execute tool with valid params', async () => {
    const result = await executeToolStep('math', { operation: 'add', a: 1, b: 2 });
    expect(result).toEqual({ result: 3 });
  });

  it('should handle tool timeout', async () => {
    expect(async () => {
      await executeToolStep('slow-tool', {}, { timeout: 1000 });
    }).rejects.toThrow('timeout');
  });

  it('should enforce policies', async () => {
    expect(async () => {
      await executeToolStep('dangerous-tool', {});
    }).rejects.toThrow('policy violation');
  });
});
```

## Task 4.2: Deployment Guide (4-5 hours)

### Create Comprehensive Deployment Guide
```markdown
# Deployment Guide

## Prerequisites
- Docker & Docker Compose
- PostgreSQL 14+
- Node.js 18+

## Development Setup
```

## Task 4.3: OpenAPI Specification (4-5 hours)

### Generate OpenAPI Docs
```typescript
import { generateOpenApi } from 'fastify-openapi-glue';

const openApi = {
  openapi: '3.0.0',
  info: { title: 'Vi API', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3000' }],
  paths: {
    '/api/conversations': {
      post: {
        summary: 'Create conversation',
        requestBody: { required: true, content: { 'application/json': { schema: {...} } } },
        responses: { '200': { description: 'Success' } }
      }
    }
  }
};
```

## Task 4.4: Troubleshooting Guide (3-4 hours)

### Common Issues & Solutions
- Database connection errors
- Authentication failures
- Memory leaks
- Performance degradation

## Estimated Time: 17-21 hours

---

# Phase 5: Advanced Features (Weeks 6-8, 30-37 hours)

## Task 5.1: Streaming Responses (10-12 hours)

### Implement Server-Sent Events (SSE)
```typescript
app.get('/api/conversations/:id/stream', async (request, reply) => {
  reply.type('text/event-stream');
  reply.header('Cache-Control', 'no-cache');

  // Start streaming
  for await (const chunk of generateResponse(...)) {
    reply.send(`data: ${JSON.stringify(chunk)}\n\n`);
  }
});
```

## Task 5.2: Advanced Planning (10-12 hours)

### Implement Multi-step Planning
- Chain-of-thought reasoning
- Subgoal decomposition
- Plan validation
- Execution monitoring

## Task 5.3: Python SDK (10-13 hours)

### Create Full Python Client Library
```python
from vi_sdk import ViClient

client = ViClient(api_key='...')
response = client.chat.create(
    conversation_id='...',
    message='Hello'
)
```

## Estimated Time: 30-37 hours

---

## Overall Success Criteria

✅ All 5 phases completed  
✅ 80%+ test coverage  
✅ Production deployment ready  
✅ Full documentation  
✅ Operations team trained  

**Total Estimated Time: 104-134 hours (8 weeks)**
