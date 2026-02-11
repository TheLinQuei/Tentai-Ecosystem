# Documentation Writing Rules

## Audience
- **Primary:** Engineers building the system
- **Secondary:** New contributors, stakeholders
- **Avoid:** Marketing speak, vague promises

## Structure
- Start with **why** (context + problem)
- Explain **what** (design, scope, constraints)
- Show **how** (concrete examples, code samples when relevant)
- Provide **references** (links to related docs, ADRs, code)

## Style
- Concise, direct language
- Active voice ("we built" not "has been built")
- Code examples are mandatory for technical docs
- Diagrams when they clarify (ASCII or tools, not vague flowcharts)

## Maintenance
- Date your docs if they include time-bound info
- Mark docs as "Draft," "Stable," or "Deprecated" at the top
- Link related docs at the end
- Update when code changes

## Where Docs Live
- **Feature / module docs** → `/docs/20-modules` in the repo
- **Architectural decisions** → `/docs/90-adr` (one file per decision)
- **Ecosystem-wide specs** → `tentai-docs/specs/`
- **Brand / tokens** → `tentai-docs/brand/`
- **Playbooks / processes** → `tentai-docs/playbooks/`

## ADR Format (for `/docs/90-adr`)
```
# [ADR Number] [Title]

## Status
Proposed | Accepted | Deprecated

## Context
[Why did we need to decide this?]

## Decision
[What did we decide?]

## Consequences
[What are the tradeoffs and implications?]
```

## Avoid
- Placeholder text ("TODO: fill this in")
- Outdated examples
- Opinions without context
- Docs that belong in code comments
