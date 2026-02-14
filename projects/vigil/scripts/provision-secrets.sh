#!/usr/bin/env bash
# Fly.io Secrets Provisioning Script
# Sets all required environment variables for ViBot services
# Usage: ./scripts/provision-secrets.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ViBot Fly.io Secrets Provisioning"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check if flyctl is installed
if ! command -v fly &> /dev/null; then
    echo "❌ Error: flyctl is not installed. Install it from https://fly.io/docs/hands-on/install-flyctl/"
    exit 1
fi

# Verify fly auth
if ! fly auth whoami &> /dev/null; then
    echo "❌ Error: Not logged in to Fly.io. Run: fly auth login"
    exit 1
fi

echo "✅ flyctl found and authenticated"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Load secrets from .env file
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ ! -f .env ]; then
    echo "❌ Error: .env file not found. Copy .env.example to .env and fill in your values."
    exit 1
fi

echo "📝 Loading secrets from .env..."
source .env

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Validate required secrets
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REQUIRED_VARS=(
    "DISCORD_TOKEN"
    "DATABASE_URL"
    "OPENAI_API_KEY"
    "JWT_SECRET"
    "LAVALINK_PASSWORD"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -ne 0 ]; then
    echo "❌ Error: Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "   - $var"
    done
    exit 1
fi

echo "✅ All required secrets present"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set secrets for Bot service
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "🤖 Setting secrets for vibot-bot..."
fly secrets set \
    DISCORD_TOKEN="${DISCORD_TOKEN}" \
    DATABASE_URL="${DATABASE_URL}" \
    OPENAI_API_KEY="${OPENAI_API_KEY}" \
    JWT_SECRET="${JWT_SECRET}" \
    LAVALINK_PASSWORD="${LAVALINK_PASSWORD}" \
    LAVALINK_HOST="vibot-lavalink.internal" \
    LAVALINK_PORT="2333" \
    BRAIN_API="http://vibot-brain.internal:3001" \
    MEMORY_API="http://vibot-memory.internal:3002" \
    BOT_NAME="${BOT_NAME:-Vi}" \
    BOT_OWNER_ID="${BOT_OWNER_ID:-}" \
    BOT_CREATOR_NAME="${BOT_CREATOR_NAME:-Kaelen (Forsa)}" \
    BOT_CREATOR_ID="${BOT_CREATOR_ID:-}" \
    NODE_ENV="production" \
    LOG_LEVEL="${LOG_LEVEL:-info}" \
    OPENAI_MODEL_DEFAULT="${OPENAI_MODEL_DEFAULT:-gpt-4o}" \
    ECO_CURRENCY_NAME="${ECO_CURRENCY_NAME:-Shards}" \
    ECO_DAILY_BASE="${ECO_DAILY_BASE:-250}" \
    VI_AUTOMOD="${VI_AUTOMOD:-true}" \
    GUARDIAN_ENABLED="${GUARDIAN_ENABLED:-false}" \
    --app vibot-bot

echo "✅ Bot secrets set"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set secrets for Brain service
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "🧠 Setting secrets for vibot-brain..."
fly secrets set \
    OPENAI_API_KEY="${OPENAI_API_KEY}" \
    MEMORY_API="http://vibot-memory.internal:3002" \
    REDIS_URL="${REDIS_URL:-redis://localhost:6380}" \
    NATS_URL="${NATS_URL:-nats://localhost:4222}" \
    LLM_MODEL="${LLM_MODEL:-gpt-4o-mini}" \
    NODE_ENV="production" \
    PORT="3001" \
    --app vibot-brain

echo "✅ Brain secrets set"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set secrets for Memory service
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "🧩 Setting secrets for vibot-memory..."
fly secrets set \
    DATABASE_URL="${DATABASE_URL}" \
    POSTGRES_URL="${POSTGRES_URL:-}" \
    QDRANT_URL="${QDRANT_URL:-http://localhost:6333}" \
    NEO4J_URL="${NEO4J_URL:-bolt://localhost:7687}" \
    NEO4J_USER="${NEO4J_USER:-neo4j}" \
    NEO4J_PASSWORD="${NEO4J_PASSWORD:-vibot123}" \
    REDIS_URL="${REDIS_URL:-redis://localhost:6380}" \
    OPENAI_API_KEY="${OPENAI_API_KEY}" \
    NODE_ENV="production" \
    PORT="3002" \
    --app vibot-memory

echo "✅ Memory secrets set"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set secrets for Lavalink service
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo "🎵 Setting secrets for vibot-lavalink..."
fly secrets set \
    LAVALINK_SERVER_PASSWORD="${LAVALINK_PASSWORD}" \
    SPOTIFY_CLIENT_ID="${SPOTIFY_CLIENT_ID:-}" \
    SPOTIFY_CLIENT_SECRET="${SPOTIFY_CLIENT_SECRET:-}" \
    --app vibot-lavalink

echo "✅ Lavalink secrets set"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Optional secrets (if provided)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -n "$GOOGLE_API_KEY" ]; then
    echo "🔧 Setting optional Google API secrets..."
    fly secrets set \
        GOOGLE_API_KEY="${GOOGLE_API_KEY}" \
        GOOGLE_VISION_ENABLED="${GOOGLE_VISION_ENABLED:-1}" \
        --app vibot-bot
    echo "✅ Google API secrets set"
fi

if [ -n "$BING_KEY" ]; then
    echo "🔧 Setting optional Bing search secret..."
    fly secrets set BING_KEY="${BING_KEY}" --app vibot-brain
    echo "✅ Bing search secret set"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ All secrets provisioned successfully!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Create Lavalink config volume: fly volumes create lavalink_config --region ord --size 1 --app vibot-lavalink"
echo "  2. Deploy services: fly deploy --app vibot-bot && fly deploy --app vibot-brain && fly deploy --app vibot-memory && fly deploy --app vibot-lavalink"
echo "  3. Check logs: fly logs --app vibot-bot"
echo ""
