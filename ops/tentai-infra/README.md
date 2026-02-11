# Vi Ecosystem Infrastructure

**Unified container orchestration and deployment.**

## Quick Start

### Prerequisites
- Docker Desktop (Windows/Mac) or Docker Engine + Docker Compose (Linux)

### Boot Ecosystem

```bash
# From repo root
cd ops/tentai-infra
docker-compose up -d
```

### Access Console

```
http://localhost:3001
```

### Stop

```bash
docker-compose down
```

## Services

| Service | Port | Container | Purpose |
|---------|------|-----------|---------|
| Postgres | 5432 | vi-postgres | Database (pgVector) |
| Vi Core | 3100 | vi-core | AI Brain |
| Qdrant | 6333 | vi-vector-store | Vector Store |
| Sovereign | 3001 | sovereign | God Console UI |

## Development

### Live Code Updates

Volumes are mounted for development:
```bash
docker-compose up -d     # Auto-restarts on src changes
docker-compose logs -f   # Watch logs
```

### Rebuild Images

```bash
docker-compose build --no-cache
docker-compose up -d
```

### Check Logs

```bash
docker-compose logs vi-core -f --tail=50
docker-compose logs sovereign -f --tail=50
```

## Database

**Connection:** `postgresql://postgres:postgres@localhost:5432/vi`

```bash
# Connect with psql
psql postgresql://postgres:postgres@localhost:5432/vi

# Run migrations
docker-compose exec vi-core npm run migrate
```

## Structure

```
docker-compose.yml     # Unified orchestration
../../../core/vi/Dockerfile
../../../clients/command/sovereign/Dockerfile
```

## Next: Phase 2

Database migration (SQLite → Postgres in Vi Core)

## Docs

- [00-overview](docs/00-overview) — Quick start
- [10-deployment](docs/10-deployment) — Deployment procedures
- [90-adr](docs/90-adr) — Infrastructure decisions

## See Also

- All service repositories for deployment requirements
