# MB: Memory Consolidation Spec

## Goals
- Consolidate raw events/notes into durable semantic chunks optimized for retrieval.
- Reduce duplication and noise while preserving salient facts and relationships.
- Maintain retention policies to keep the memory store lean and relevant.

## Inputs & Sources
- User messages, run records, tool execution outputs.
- Existing `memory_vectors` entries produced by the cognition pipeline.

## Processing Pipeline
1. Ingest: collect new items since last consolidation window.
2. Normalize: strip markup, canonicalize entities, detect language.
3. Chunking: split into ~200–800 token segments guided by headings/bullets.
4. Embedding: use existing embedding provider, store vectors in `memory_vectors` (pgvector).
5. Merge: cluster similar chunks; synthesize consolidated summaries.
6. Index Update: upsert consolidated vectors, mark raw items as consolidated.

## Dedupe Strategy
- Cosine similarity threshold: drop or merge items above `sim >= 0.90`.
- Exact text hash dedupe for near-identical copies.

## Retention Policy
- Time-based TTL for low-signal items (e.g., 30–60 days).
- Keep consolidated summaries; prune raw items after consolidation.
- Credit-aware retention (optional): favor items linked to active sessions/users.

## Scheduling & Triggers
- Run on demand and via a daily scheduled job.
- Trigger after N new items (e.g., 100) or after session end.

## Schema Notes
- Existing: `memory_vectors` table with pgvector index.
- Optional: `memory_consolidations` table to track windows, counts, durations.
- Optional: add `is_consolidated`/`source_id` fields to link raw→consolidated.

## Verification
- Add `scripts/verify-mb.ps1` to produce Section 13 log: commands, outputs, ExitCode lines.
- Integration test: assert consolidation flags and vector count changes.
