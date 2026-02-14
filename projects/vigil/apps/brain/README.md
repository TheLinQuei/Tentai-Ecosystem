# Vi Brain — Phase 3 Reasoning Pipeline

**Observer → Retriever → Planner → Executor → Reflector**

Vi's reasoning loop: awareness → decision → action → reflection.

## Architecture

```
Discord Event → NATS → Observer → Retriever → Planner → Executor → Reflector → Memory API
```

### Pipeline Stages

1. **Observer** (`observer.ts`)
   - Receives events from NATS `discord.message` stream
   - Orchestrates pipeline execution
   - Tracks latency metrics

2. **Retriever** (`retriever.ts`)
   - Fetches context from Memory API
   - Hybrid search (vector + keyword)
   - Returns recent + relevant events

3. **Planner** (`planner.ts`)
   - Generates Plan with Steps (Zod validated)
   - Phase 3 v1: Simple echo logic
   - Future: LLM-driven planning

4. **Executor** (`executor.ts`)
   - Invokes tools via ToolRegistry
   - Validates args with Zod schemas
   - Collects execution results

5. **Reflector** (`reflector.ts`)
   - Upserts reflection summaries to Memory API
   - Stores observation + plan + result
   - Enables future context retrieval

## Development

### Start Brain Service

```powershell
cd apps/brain
.\start.ps1
```

Runs on `http://localhost:4312`

### Environment Variables

```bash
BRAIN_PORT=4312
MEMORY_API=http://localhost:4311
NATS_URL=nats://localhost:4222
```

### Test Event Flow

Publish a test message via NATS:

```powershell
# Using natsio/nats-box container
docker run --rm -it --network=host natsio/nats-box:latest
nats pub discord.message '{"id":"test-1","type":"message","content":"Hello Vi","authorId":"user-123","channelId":"channel-456","timestamp":"2025-01-01T00:00:00Z"}'
```

Check Brain logs for pipeline execution and reflection storage.

### Query Reflections

```powershell
# Search for reflections in Memory API
curl http://localhost:4311/v1/mem/searchHybrid `
  -H "Content-Type: application/json" `
  -d '{"query":"test","limit":5}'
```

## Performance Targets

- **Pipeline latency**: < 500ms end-to-end
- **Reflection storage**: < 100ms
- **Context retrieval**: < 100ms (Memory API)
- **Tool execution**: Depends on tool (echo ~1ms)

## Current State (Phase 3 v1)

- ✅ Pipeline scaffolding complete
- ✅ Echo responses via `message.send` tool
- ✅ Reflection storage to Memory API
- ✅ Deterministic replay capability
- 🔲 LLM integration (future)
- 🔲 Discord client integration (future)

## Tools

See `packages/tools` for tool definitions.

Current tools:
- `message.send`: Echo messages to console (future: Discord client)

## Monitoring

- `GET /health` - Health check
- `GET /stats` - NATS stats (messages in/out)

## Troubleshooting

### Brain won't connect to NATS

Ensure NATS is running:

```powershell
docker-compose -f infra/docker-compose.yml up nats
```

### No events processing

Publish a test event (see "Test Event Flow" above).

### Reflection not stored

Check Memory API logs and health:

```powershell
curl http://localhost:4311/health/postgres
```

## Next Steps

1. Test with NATS event publication
2. Validate reflection storage in Postgres
3. Add LLM planner (OpenAI integration)
4. Wire to Discord bot events
5. Add more tools (search, remind, etc.)
