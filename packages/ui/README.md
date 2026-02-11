# packages/ui

**Shared UI component library.** Reusable components used by Sovereign, Astralis Codex, and future clients.

## Purpose

Prevent duplication of UI components across clients:

- ✅ Single source of truth for Button, Panel, Modal, HUD widgets, etc.
- ✅ All clients use the same components
- ✅ 77EZ design tokens baked in
- ✅ Can be published to npm later

## Structure

```
packages/ui/
  package.json
  src/
    components/
      Button/
        Button.tsx
        Button.stories.tsx
      Panel/
        Panel.tsx
      Modal/
        Modal.tsx
      HUD/
        HUD.tsx
        HUDPanel.tsx
      Evidence/
        CitationBadge.tsx
        ProvenancePanel.tsx
    hooks/
      useTheme.ts
      useResponsive.ts
    types/
      index.ts
    index.ts               # Export all components
  dist/
    index.js              # Compiled
```

## Components (Stubs for Now)

These don't need full implementation until their client unfreezes.

- **Button** — Primary/secondary/accent variants (uses tokens)
- **Panel** — Generic container with title and content
- **Modal** — Overlay dialog
- **HUD** — Heads-up display widget (for evidence panel)
- **CitationBadge** — Shows source + confidence
- **ProvenancePanel** — Displays approval chain

## Usage

### In Sovereign
```typescript
import { Button, Panel, HUD, CitationBadge } from '@tentai/ui';

export function ChatPanel() {
  return (
    <Panel title="Chat">
      <ChatInput />
      <CitationBadge source="memory" confidence={0.95} />
      <Button variant="primary">Send</Button>
    </Panel>
  );
}
```

### In Astralis Codex
```typescript
import { Button, Panel, ProvenancePanel } from '@tentai/ui';

export function EntityEditor() {
  return (
    <Panel title="Character">
      <EntityForm />
      <ProvenancePanel approval="approved" />
      <Button variant="primary">Save</Button>
    </Panel>
  );
}
```

## Design

- All components use `@tentai/tokens` for colors and spacing
- No hardcoded colors anywhere in components
- Responsive by default
- Accessible (ARIA labels, keyboard nav)
- Storybook stories for documentation

## Development

Phase 0: Component stubs (structure, exports)
Phase 1: Full implementation once Sovereign unfreezes
Phase 2+: Extended components as clients need them

## Publishing

Later, publish to npm:
```bash
npm publish --access public
```

Then clients install:
```bash
npm install @tentai/ui
```

Keep everything in sync.
