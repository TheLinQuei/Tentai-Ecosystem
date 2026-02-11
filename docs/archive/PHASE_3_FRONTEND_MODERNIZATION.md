# Phase 3: Frontend Modernization — Planning Document

**Date:** January 4, 2026  
**Duration:** 3-4 weeks  
**Priority:** HIGH (current frontend unmaintainable at scale)  
**Status:** Planning

---

## Executive Summary

Phase 3 modernizes the Sovereign web console from vanilla HTML/CSS/JavaScript (2,163 lines in one file) to a professional React + TypeScript application with proper component architecture, state management, and design tokens.

**Current State:**
- ❌ Frontend is unmaintainable (monolithic 2,163-line file)
- ❌ No component reusability (CSS/JS duplicated)
- ❌ No state management (globals and DOM selectors)
- ❌ No accessibility features (missing ARIA labels)
- ❌ No component library

**Target State:**
- ✅ React 18 + TypeScript
- ✅ Component-based architecture
- ✅ Design tokens from packages/tokens/
- ✅ Zustand state management
- ✅ Vite build system
- ✅ Full accessibility (WCAG 2.1 AA)
- ✅ Jest + React Testing Library
- ✅ Storybook for component documentation

---

## Architecture Overview

### New Project Structure

```
clients/command/sovereign/
├── src/
│   ├── main.tsx                    # React entry point
│   ├── App.tsx                     # Root component
│   ├── index.css                   # Global styles (design tokens)
│   │
│   ├── components/                 # Reusable components
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   ├── AuthLayout.tsx
│   │   │   └── AuthGuard.tsx
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── MessageList.tsx
│   │   │   ├── MessageItem.tsx
│   │   │   ├── InputBox.tsx
│   │   │   └── ResponseTime.tsx
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   ├── Loading.tsx
│   │   │   ├── Error.tsx
│   │   │   └── Toast.tsx
│   │   ├── memory/
│   │   │   ├── MemoryViewer.tsx    # NEW: View short/long-term memory
│   │   │   ├── MemoryPanel.tsx
│   │   │   └── MemorySearch.tsx
│   │   ├── settings/
│   │   │   ├── SettingsPanel.tsx   # NEW: User preferences
│   │   │   ├── ProfileSettings.tsx
│   │   │   └── SystemSettings.tsx
│   │   └── dashboard/
│   │       ├── Dashboard.tsx       # NEW: Overview dashboard
│   │       ├── MetricsCard.tsx
│   │       └── StatsPanel.tsx
│   │
│   ├── pages/                      # Page-level components
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── ChatPage.tsx
│   │   ├── SettingsPage.tsx
│   │   ├── MemoryPage.tsx
│   │   └── DashboardPage.tsx
│   │
│   ├── hooks/                      # Custom React hooks
│   │   ├── useAuth.ts              # Authentication state
│   │   ├── useChat.ts              # Chat state & API calls
│   │   ├── useMemory.ts            # Memory API access
│   │   ├── useLocalStorage.ts      # Persistent state
│   │   ├── useApi.ts               # Generic API calls
│   │   └── useTheme.ts             # Theme switching
│   │
│   ├── store/                      # Zustand stores
│   │   ├── authStore.ts            # Auth state
│   │   ├── chatStore.ts            # Chat state
│   │   ├── uiStore.ts              # UI state (modals, panels)
│   │   └── settingsStore.ts        # User settings
│   │
│   ├── services/                   # API clients
│   │   ├── viApi.ts                # Vi-core API client
│   │   ├── authService.ts          # Auth API
│   │   └── memoryService.ts        # Memory API
│   │
│   ├── types/                      # TypeScript types
│   │   ├── api.ts                  # API response types
│   │   ├── auth.ts                 # Auth types
│   │   ├── chat.ts                 # Chat types
│   │   └── ui.ts                   # UI types
│   │
│   ├── styles/                     # Design tokens & theme
│   │   ├── theme.ts                # Token definitions
│   │   ├── colors.ts               # Color palette
│   │   └── globals.css             # Global CSS
│   │
│   ├── utils/                      # Utilities
│   │   ├── format.ts               # Formatting utilities
│   │   ├── validation.ts           # Validation logic
│   │   └── constants.ts            # App constants
│   │
│   └── routes/                     # Route definitions
│       └── routes.tsx
│
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
│
├── tests/
│   ├── components/
│   ├── hooks/
│   ├── services/
│   └── utils/
│
├── .storybook/                     # Storybook config
│   ├── main.ts
│   └── preview.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── README.md
```

### Key Technologies

| Layer | Technology | Why |
|-------|-----------|-----|
| **Framework** | React 18 | Industry standard, large ecosystem |
| **Language** | TypeScript | Type safety, better DX |
| **Build** | Vite | Fast dev server, optimized builds |
| **State Management** | Zustand | Simple, lightweight, composable |
| **UI Components** | packages/ui | Consistent design tokens |
| **HTTP Client** | Axios | Simple, feature-rich |
| **Form Handling** | React Hook Form | Lightweight, performant |
| **Validation** | Zod | TypeScript-first validation |
| **Testing** | Jest + RTL | Industry standard |
| **Docs** | Storybook | Component library showcase |
| **Design Tokens** | CSS variables | Themeable, maintainable |
| **Styling** | CSS Modules | Scoped, collision-free |

---

## Detailed Component Plan

### Authentication Components

#### LoginForm.tsx
```typescript
// Responsibilities:
// - Email/password input validation
// - Login API call
// - Error display with field highlighting
// - Cool-down timer after failed attempts
// - Remember me checkbox
// - Password toggle visibility
// - Dev quick-fill (localhost only)

// Props:
interface LoginFormProps {
  onLoginSuccess?: (token: string) => void;
  onSignUpClick?: () => void;
  isLoading?: boolean;
}

// Tests:
// - Valid credentials → successful login
// - Invalid credentials → error message
// - Too many attempts → cool-down timer
// - Dev mode → quick-fill available
// - Accessibility: Tab navigation, ARIA labels
```

#### RegisterForm.tsx
```typescript
// Responsibilities:
// - Username/email/password input
// - Password strength indicator
// - Confirmation password matching
// - API call to register
// - Error handling

// Tests:
// - Weak password → warning
// - Password mismatch → error
// - Email already exists → error
// - Successful registration → redirect to login
```

#### AuthLayout.tsx
```typescript
// Responsibilities:
// - Premium auth branding (header, colors)
// - Centered form layout
// - Background gradient/image
// - Responsive design

// Features:
// - Sovereign gold + void-black theme
// - Smooth transitions
// - Mobile-friendly
```

### Chat Components

#### ChatInterface.tsx
```typescript
// Root chat page component
// - Manages conversation list in sidebar
// - Displays main chat area
// - Integrates InputBox, MessageList, ResponseTime
// - Handles real-time updates

Props:
interface ChatInterfaceProps {
  conversationId?: string;
  onConversationChange?: (id: string) => void;
}
```

#### MessageList.tsx
```typescript
// Displays scrollable list of messages
// - Virtual scrolling for performance (1000s of messages)
// - Auto-scroll to newest
// - Loading states
// - Error states

Features:
- Virtualization using react-window
- Smooth scrolling
- Optimistic updates
```

#### MessageItem.tsx
```typescript
// Individual message display
// - User vs assistant styling
// - Markdown rendering
// - Citation display (links, metadata)
// - Timestamp + response time
// - Copy-to-clipboard button
// - Edit/delete (for user messages)

Props:
interface MessageItemProps {
  message: Message;
  onEdit?: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
}
```

#### InputBox.tsx
```typescript
// Message input component
// - Textarea with auto-expand
// - Send button
// - Keyboard shortcuts (Shift+Enter for newline, Enter to send)
// - Character limit display
// - Loading state (disable while sending)
// - Error state from previous message

Tests:
- Send on Enter key
- Newline on Shift+Enter
- Character limit enforced
- Submit disabled while loading
```

#### ResponseTime.tsx
```typescript
// Display response timing information
// - Total time
// - Per-stage breakdown (if available)
// - Color-coded: green (fast), yellow (medium), red (slow)

Props:
interface ResponseTimeProps {
  totalMs: number;
  breakdown?: {
    perception: number;
    intent: number;
    planning: number;
    execution: number;
    reflection: number;
  };
}
```

### Memory Components (NEW)

#### MemoryViewer.tsx
```typescript
// Full-page memory browser
// - Search memories
// - Filter by type (short-term, long-term, bond, etc.)
// - Show embedding/relevance scores
// - Timeline view
// - Statistics panel

Features:
- Full-text search
- Sort by relevance, date, type
- Expandable memory detail view
- Export to JSON
```

#### MemoryPanel.tsx
```typescript
// Sidebar panel showing recent memories
// - Last 10 memories
// - Quick search
// - Expandable
```

### Settings Components (NEW)

#### SettingsPanel.tsx
```typescript
// User settings page
// - Profile information
// - Voice preferences
// - Memory management
// - Theme settings
// - Export/import data

Tabs:
1. Profile (name, email, avatar)
2. Voice (tone preference, style)
3. Data (export conversations, clear history)
4. Appearance (theme selection)
```

### Dashboard Components (NEW)

#### Dashboard.tsx
```typescript
// Overview dashboard
// - Quick stats (conversations, messages, memories)
// - Recent activity
// - System health
// - Quick actions

Features:
- Real-time stats
- Usage graphs
- Last 7 days activity
```

### Common Components

#### Button.tsx
```typescript
// Reusable button component
// - Variants: primary, secondary, danger, ghost
// - Sizes: small, medium, large
// - Loading state
// - Disabled state
// - Icons

Props:
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}
```

#### Input.tsx
```typescript
// Reusable input component
// - Text, password, email, number types
// - Error display
// - Label
// - Placeholder
// - Icon support

Props:
interface InputProps {
  type?: string;
  label?: string;
  error?: string;
  icon?: ReactNode;
  required?: boolean;
}
```

#### Modal.tsx
```typescript
// Dialog/modal component
// - Header, body, footer
// - Close button
// - Escape key closes
// - Click outside closes
// - Accessibility (focus trap)

Props:
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
}
```

#### Loading.tsx
```typescript
// Loading spinner/skeleton component
// - Spinner animation
// - Skeleton loaders for content
// - Full-page loader

Props:
interface LoadingProps {
  type?: 'spinner' | 'skeleton' | 'page';
  size?: 'sm' | 'md' | 'lg';
}
```

#### Error.tsx
```typescript
// Error display component
// - Error message
// - Retry button
// - Error details (dev mode)

Props:
interface ErrorProps {
  message: string;
  details?: any;
  onRetry?: () => void;
}
```

---

## State Management Plan (Zustand)

### Auth Store
```typescript
interface AuthState {
  // State
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  refreshToken: () => Promise<void>;
  setUser: (user: User) => void;
}
```

### Chat Store
```typescript
interface ChatState {
  // State
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  lastResponseTime: number | null;
  
  // Actions
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (title?: string) => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  editMessage: (id: string, text: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  addMessage: (message: Message) => void;
}
```

### UI Store
```typescript
interface UIState {
  // State
  sidebarOpen: boolean;
  memoryPanelOpen: boolean;
  settingsPanelOpen: boolean;
  toasts: Toast[];
  theme: 'light' | 'dark';
  
  // Actions
  toggleSidebar: () => void;
  openMemoryPanel: () => void;
  closeMemoryPanel: () => void;
  addToast: (toast: Toast) => void;
  removeToast: (id: string) => void;
  setTheme: (theme: 'light' | 'dark') => void;
}
```

---

## Design Tokens (from packages/tokens/)

### Colors (22, color tokens)
```typescript
export const colors = {
  // Neutrals
  void: '#0a0a0a',        // Pure black
  neutral900: '#1a1a1a',
  neutral800: '#2d2d2d',
  neutral700: '#404040',
  // ... through neutral100
  
  // Sovereign Gold
  gold600: '#d4a574',
  gold500: '#e6b86a',
  gold400: '#f0ca78',
  
  // Cyan (accent)
  cyan500: '#20c997',
  
  // Purple (secondary)
  purple500: '#9333ea',
  
  // Semantic
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
};
```

### Typography
```typescript
export const typography = {
  heading1: { size: '2.5rem', weight: 700, lineHeight: '1.2' },
  heading2: { size: '2rem', weight: 700, lineHeight: '1.3' },
  heading3: { size: '1.5rem', weight: 600, lineHeight: '1.4' },
  body: { size: '1rem', weight: 400, lineHeight: '1.6' },
  small: { size: '0.875rem', weight: 400, lineHeight: '1.5' },
};
```

### Spacing
```typescript
export const spacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  xxl: '3rem',     // 48px
};
```

---

## Migration Strategy

### Phase 3.1: Setup & Foundation (Week 1)
- [ ] Create React project with Vite + TypeScript
- [ ] Set up project structure
- [ ] Configure ESLint, Prettier
- [ ] Set up Jest + React Testing Library
- [ ] Create initial components (Button, Input, Modal)
- [ ] Configure design tokens

**Deliverable:** Working React app with basic components

### Phase 3.2: Authentication (Week 1-2)
- [ ] Migrate LoginForm
- [ ] Migrate RegisterForm
- [ ] Create AuthGuard component
- [ ] Set up Zustand auth store
- [ ] API integration (authService.ts)
- [ ] Tests for auth flow

**Deliverable:** Full auth system working in React

### Phase 3.3: Chat Interface (Week 2-3)
- [ ] Migrate ChatInterface
- [ ] Create MessageList with virtualization
- [ ] Migrate MessageItem
- [ ] Create InputBox
- [ ] Create ResponseTime display
- [ ] Set up chat store
- [ ] API integration (viApi.ts)
- [ ] Tests for chat

**Deliverable:** Full chat experience in React

### Phase 3.4: New Features (Week 3)
- [ ] Create MemoryViewer component
- [ ] Create SettingsPanel component
- [ ] Create Dashboard component
- [ ] Tests for new components
- [ ] Storybook setup

**Deliverable:** Extended UI with new features

### Phase 3.5: Polish & Testing (Week 4)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Performance optimization
- [ ] Mobile responsiveness testing
- [ ] Full end-to-end testing
- [ ] Component documentation

**Deliverable:** Production-ready React application

---

## Technical Tasks

### Dependency Installation
```bash
npm install react@18 react-dom@18 typescript zustand axios react-hook-form zod react-markdown
npm install -D @vitejs/plugin-react vitest @testing-library/react @testing-library/jest-dom storybook
```

### Configuration Files to Create
- [ ] `vite.config.ts` — Build config
- [ ] `vitest.config.ts` — Test config
- [ ] `tsconfig.json` — TypeScript config
- [ ] `.prettierrc.json` — Formatting
- [ ] `.eslintrc.json` — Linting
- [ ] `jest.setup.ts` — Test setup
- [ ] `.storybook/main.ts` — Storybook config

### Environment Variables
```
VITE_API_URL=http://localhost:3100
VITE_ENV=development
VITE_DEBUG_MODE=true (localhost only)
```

---

## Testing Strategy

### Unit Tests
- Components in isolation
- Hooks with custom test utilities
- Utils and helpers
- **Target:** 80% coverage

### Integration Tests
- User flows (login → chat → memory)
- State management
- API integration
- **Target:** All critical paths

### E2E Tests (Future)
- Full user journey
- Multiple browser support
- Performance baselines

### Component Tests (Storybook)
- Visual regression testing
- Accessibility testing
- Interaction testing

---

## Accessibility Requirements

### WCAG 2.1 Level AA Compliance

1. **Keyboard Navigation**
   - All interactive elements reachable via Tab
   - Escape key closes modals
   - Enter/Space to activate buttons
   - Arrow keys in lists/menus

2. **Screen Reader Support**
   - Semantic HTML
   - ARIA labels for icons
   - ARIA live regions for updates
   - Role attributes where needed

3. **Visual**
   - Contrast ratio ≥ 4.5:1 (normal text)
   - Focus indicators visible
   - No color alone to convey information

4. **Cognitive**
   - Clear, simple language
   - Consistent navigation
   - Error messages clear
   - Undo available where appropriate

### Tools
- axe DevTools for testing
- WAVE for accessibility review
- Screen reader testing (NVDA, JAWS)

---

## Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| FCP (First Contentful Paint) | < 1.5s | Unknown |
| LCP (Largest Contentful Paint) | < 2.5s | Unknown |
| CLS (Cumulative Layout Shift) | < 0.1 | Unknown |
| TTI (Time to Interactive) | < 3.5s | Unknown |
| Bundle Size | < 200KB (gzipped) | ~150KB |

### Optimizations
- Code splitting by route
- Lazy loading components
- Image optimization
- CSS/JS minification
- Caching strategy

---

## Migration Checklist

### Pre-Migration
- [ ] Complete Phase 2 (✅ Done)
- [ ] Backup current sovereign/public/index.html
- [ ] Plan feature parity review

### Migration
- [ ] Create new React project
- [ ] Set up project structure
- [ ] Migrate each component group
- [ ] Test each group
- [ ] Run full test suite
- [ ] Performance testing

### Post-Migration
- [ ] Deploy to staging
- [ ] User acceptance testing
- [ ] Performance monitoring
- [ ] Rollback plan ready
- [ ] Deploy to production

### Rollback Plan
- Keep old index.html as fallback
- Feature flag to switch between old/new
- Database backups before deployment
- Rollback documentation

---

## Success Criteria

### Phase 3.1 ✅
- React app runs locally
- Basic components working
- Tests running and passing

### Phase 3.2 ✅
- Auth flow fully migrated
- Login/register working
- Store managing auth state

### Phase 3.3 ✅
- Chat fully functional
- Messages displaying correctly
- Send/receive working

### Phase 3.4 ✅
- New features implemented
- Memory viewer working
- Settings panel working

### Phase 3.5 ✅
- WCAG 2.1 AA compliance achieved
- All tests passing (80%+ coverage)
- Performance targets met
- Production deployment ready

---

## Resource Requirements

### Team
- 1 Senior Frontend Engineer (lead)
- 1 Mid-level Frontend Engineer
- 1 QA Engineer (testing, accessibility)
- 0.5 DevOps (deployment support)

### Timeline
- **Duration:** 3-4 weeks
- **Effort:** 400-500 engineer-hours
- **Cost:** Depends on team rates

### Tools & Services
- GitHub (code repository) ✅ Included
- Storybook (component docs) ✅ Free
- Chromatic (visual regression) 💰 $39/mo
- Datadog/New Relic (monitoring) 💰 For production

---

## Known Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Unforeseen API changes | Medium | High | Comprehensive API client tests |
| Performance regression | Medium | High | Benchmark testing, profiling |
| Accessibility bugs | Medium | Medium | Accessibility audit, tooling |
| Team unfamiliar with React | Low | Medium | Pairing, documentation, training |
| Timeline slippage | Medium | Medium | Buffer week, clear milestones |
| Browser compatibility | Low | Low | Testing on multiple browsers |

---

## Future Enhancements (Post-Phase 3)

1. **Real-time Updates**
   - WebSocket for live chat
   - Presence indicators
   - Real-time memory updates

2. **Advanced Features**
   - Voice input/output
   - Video chat
   - Document upload
   - Thread conversations

3. **Mobile App**
   - React Native version
   - iOS app
   - Android app

4. **Analytics**
   - Usage tracking
   - Performance metrics
   - User behavior analysis

5. **Internationalization**
   - Multi-language support
   - RTL layout support
   - Localization

---

## Conclusion

Phase 3 transforms Sovereign from a maintenance nightmare into a modern, professional React application. The benefits are enormous:

- ✅ **Maintainability:** Component-based architecture makes changes easy
- ✅ **Scalability:** Can add features without monolithic growth
- ✅ **Quality:** Comprehensive tests prevent regressions
- ✅ **Performance:** Optimized bundle size and rendering
- ✅ **Accessibility:** WCAG 2.1 AA compliance from day one
- ✅ **Developer Experience:** TypeScript, clear structure, good tooling

**Estimated Launch:** Week of January 21, 2026

**Next Step:** Kickoff meeting to assign team and confirm timeline.
