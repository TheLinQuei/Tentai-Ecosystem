# 003 Model Provider Selection & Fallback Strategy

## Status
Proposed

## Date
2025-12-27

## Context
We require a primary + fallback model strategy across environments (cloud vs on-prem), balancing cost, context length, safety, and agentic capabilities. This ADR sets the governance; implementation happens in vi-core with config-only wiring initially.

## Decision
- Selection matrix:
  - Primary: OpenAI GPT-5 (reasoning-heavy tasks); Fallback: Anthropic Claude 3.5 (tool use, long context)
  - Cost-sensitive flows: Google Gemini 2.5/3 Flash for throughput; On-prem: Mistral Large/Open or Meta Llama 4
  - Research/Local: DeepSeek V3.2 for math/reasoning when privacy/cost dominate
- Configuration-first:
  - Declare providers in `core/vi/config/providers.json` with per-route/model policies (max tokens, rate caps, allowed tools)
- Safety alignment:
  - Use provider-native moderation where available; otherwise enforce via `PolicyEngine`
- No code path divergence:
  - Gateways implement a unified interface; provider choice is a config concern

## Consequences
- Clear, auditable provider usage policy
- Easy environment-specific overrides without code changes
- Safety enforcement centralized

## References
- `ops/tentai-docs/playbooks/copilot-rules.md`
- `core/vi/docs/00-overview/QUICKSTART.md` (may reference provider config)
