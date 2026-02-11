# tentai-docs

**The reference vault.** Centralized docs, specs, and governance for the entire ecosystem.

## What This Is

All ecosystem-level documentation:

- **Brand** — Visual identity, tokens (77EZ design system)
- **Specs** — Architecture docs for each repo
- **Playbooks** — How we build, document, and govern
- **ADRs** — Cross-ecosystem architecture decisions

## Structure

```
brand/
  visual.md          # Visual identity (locked)
  tokens.css         # Canonical design tokens
  tokens.json        # Machine-readable tokens
  logo/              # Logo files

specs/
  vi-core/           # Architecture overview
  command-center/    # UI/UX spec
  codex/             # Data model spec
  vibot/             # Bot integration spec
  sereph/            # Hardware integration spec

playbooks/
  repo-structure.md  # How repos are organized
  doc-writing-rules.md # Writing guidelines
  copilot-rules.md   # Copilot build rules (canonical)

adr/
  [ADR decision files]
```

## Purpose

This vault prevents:

- **Doc sprawl** — No random docs scattered across repos
- **Inconsistent branding** — All UIs use canonical tokens
- **Reinvented wheels** — Shared specs, not copy-paste
- **Copilot chaos** — Clear rules, enforced everywhere

## See Also

- [brand/visual.md](brand/visual.md) — 77EZ design system
- [playbooks/copilot-rules.md](playbooks/copilot-rules.md) — Build rules
- [playbooks/repo-structure.md](playbooks/repo-structure.md) — Repo layout
- [playbooks/doc-writing-rules.md](playbooks/doc-writing-rules.md) — Writing guidelines
