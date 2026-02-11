# TEST_MODE — Deterministic Verification Without Providers

Purpose: Run the harness and critical proofs green without depending on external LLM providers.

## What TEST_MODE Does

- Routes verification prompts to local deterministic responders
- Skips provider calls for recall, stance, and governor probes (when possible)
- Uses debug endpoints and local logic to construct evidence bundles
- Emits telemetry to prove decisions without token spend

## Scope (Initial)

- Layer 4: Deterministic recall answers from stored facts (already implemented in gateway)
- Layer 8: Continuity compression proof via `/v1/debug/continuity`
- Layer 5/6: Log-only stance decision + governor interventions (add debug outputs)
- Identity/Profile/Bond: Use repositories and debug endpoints where available

## How To Enable

- Env var: `VI_TEST_MODE=true`
- Gateway: bypass provider on supported probes when TEST_MODE is active
- Harness: prefer debug endpoints over provider-dependent behavioral checks

## Harness Run (Windows)

```powershell
pwsh -NoProfile -Command '$env:VI_BASE_URL="http://localhost:3100"; Set-Location "E:\Tentai Ecosystem\ops\tests"; .\77ez-test.ps1'
```

## Evidence Bundle

- Include:
  - `/v1/debug/memory` raw + postFiltered + injectedBlob
  - `/v1/debug/continuity` compression metadata
  - Stance decision (when logged) + governor interventions
  - Telemetry snapshot (events emitted during run)

## Next Steps

- Add `stanceDecision` debug output
- Add governor debug output per attempt
- Wire TEST_MODE in gateway to skip provider on supported probes
- Button in God Console to run harness and export evidence
