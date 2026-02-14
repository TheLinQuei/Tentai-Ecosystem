# Sovereign - Vi Chat Console

A chat-first interface for interacting with Vi, the transparent AI assistant. Features conversation history, real-time responses, and optional debug tools for transparency audits.

## Overview

Sovereign is the primary user interface for Vi. It provides:
- **Chat-first design**: Main focus is conversation, not debugging
- **Conversation history**: Create, switch, and delete conversations
- **Persistent storage**: Conversations saved per userId in localStorage
- **Debug panel**: Optional transparency tools (audit traces, safety profile, testing)
- **Real-time health**: Backend connectivity indicator

## Local Development

```bash
cd projects/sovereign
npm install
npm run dev
```

Opens at `http://localhost:5173`. The app connects to Vi backend at `https://tentai-ecosystem.onrender.com` (production) or `http://localhost:3000` (local).

## Production Build

```bash
npm run build
```

Builds to `dist/` folder. Set environment variables:

```
VITE_BASE=/console/
VITE_API_BASE=https://tentai-ecosystem.onrender.com
```

Deploy the `dist/` folder to the `/console` path on your website.

## Vi Adapter

Sovereign uses a Vi adapter for all backend communication:

```tsx
import { useUser, useConversations, useChat } from './adapters/vi';

function ChatInterface() {
  const { userId } = useUser();
  const { conversations, activeConversation, addMessage } = useConversations(userId);
  const { sendMessage, loading } = useChat(userId);
  // ... use hooks for chat functionality
}
```

## Deployment

Deployed to GitHub Pages via GitHub Actions → https://tentaitech.com/console/

## Styling

Uses **Vi Sovereign 2.0** theme:
- Dark mode: `#0a0a0b` background
- Gold accent: `#c9a951`
- Cyan highlights: `#7dd3fc`

