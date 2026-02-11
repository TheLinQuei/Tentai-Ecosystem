# God Console — Operational Cockpit for Vi

Purpose: A single place to see, control, and verify Vi’s decisions deterministically.

## Core Views

- Stance Decision
  - Selected stance + reasoning
  - Inputs: user message, bond, profile, self model
- Memory
  - Raw retrieval results
  - Post-filtered list (ranking, penalties)
  - Final injected memory blob
- Evidence bundle
  - `/v1/admin/evidence` (VI_DEBUG_MODE): memory (raw/postFiltered/injectedBlob), continuity, recent run records, recent events
- Cost & Reliability
  - Cost per request (tokens, retries)
  - Provider errors (e.g., 429) with backoff timeline
- Bond/Profile
  - Delta per turn, audit entries, confidence changes
- Continuity
  - Compression metadata, tail preserve, record counts
- Harness Runner
  - Run 77EZ harness from a button
  - Collect debug evidence bundle
  - Export as JSON and markdown

## Controls

- TEST_MODE toggle (bypass provider on supported probes)
- Base URL selection (env or override)
- Session/User selectors for deterministic runs
- Replay conversation deterministically (using debug endpoints)
- Evidence download button (JSON/markdown)

## Evidence

- Persist JSON bundles with:
  - `/v1/debug/memory` (raw/postFiltered/injectedBlob)
  - `/v1/debug/continuity`
  - Stance/governor telemetry
  - Events feed (`/v1/admin/events`)

## Implementation Notes

- Lives in Sovereign (clients/command/sovereign)
- Reads Vi debug/admin endpoints
- Stores local run artifacts for auditing
- Adds harness log tee and export

## Milestones

1. Minimal: Memory, Continuity, Harness Runner
2. Add Stance/ Governor telemetry panels
3. Add replay and delta inspectors
4. Add export and evidence signing
