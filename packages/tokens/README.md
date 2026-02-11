# packages/tokens

**Design tokens package.** Single source of truth for all Tentai 77EZ design system values.

## Purpose

All clients import from this package instead of hardcoding hex colors. This ensures:

- ✅ Single source of truth for 77EZ design system
- ✅ Consistency across all UIs (Sovereign, Astralis Codex, Vigil embeds, etc.)
- ✅ Easy to change colors later (update here, ripple everywhere)
- ✅ Rule 10 compliance enforced

## Current Structure

```
packages/tokens/
  package.json        # NPM package metadata
  theme.css           # CSS variables - CANONICAL SOURCE
  README.md           # This file
```

## Usage

### In HTML Clients (Sovereign)
```html
<link rel="stylesheet" href="/tokens/theme.css" />
```

Then use CSS variables:
```css
.button {
  background-color: var(--gold);
  color: var(--onyx);
  border: 1px solid var(--divider);
}
```

### Serving from Express
```typescript
app.use('/tokens', express.static(path.join(__dirname, '../../../packages/tokens')));
```

## Available Tokens

See [theme.css](./theme.css) for the complete list.

**Base Palette:**
- `--onyx` - Primary background (obsidian black)
- `--ink` - Secondary background (deep slate)
- `--panel` - Panel background
- `--card` - Card background

**Accents:**
- `--gold` - Primary accent (sovereign gold)
- `--divider` - Subtle dividers

**Text:**
- `--text` - Primary text (crisp white)
- `--muted` - Muted text (readable gray)

**Semantic:**
- `--green` - Success, online status
- `--error` - Error, danger

**System:**
- `--purple` - System accent (purple lightning)
- `--cyan` - Secondary system accent

## Rules (77EZ Enforcement)

**NO EXCEPTIONS:**
- ❌ No `#` hex values outside theme.css
- ❌ No inline styles with colors in JavaScript
- ❌ No new CSS variables outside theme.css
- ✅ All color changes happen here only

If you need a new color, add it to theme.css first.
  padding: var(--spacing-md);
  font-size: var(--font-size-body);
}
```

### In Discord.js (Vigil)
```typescript
import { colors } from '@tentai/tokens';

const embed = new EmbedBuilder()
  .setColor(colors.sovereignGold)
  .setTitle('Vi Response');
```

## Canonical Values

These are locked and inherited from ops/tentai-docs/brand/:

- **Void-Black:** `#0A0E27`
- **Sovereign Gold:** `#D4AF37`
- **Controlled Cyan:** `#00D9FF`
- **Purple Accent:** `#9D4EDD`
- **Dark Slate:** `#1A1F3A`
- **Silver:** `#A0A8C8`
- **Deep Purple:** `#7B2CBF`
- **Error Red:** `#FF6B6B`

## Rule

> **No hardcoded hex colors outside this package.**

If you're typing a # symbol in your client code, you're doing it wrong. Import from tokens instead.

## Later

When mature enough, publish to npm:
```bash
npm publish --access public
```

Then clients import from npm:
```typescript
import { colors } from '@tentai/tokens';
```

This keeps everything in sync across all future deployments.
