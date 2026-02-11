# Vi Core API Reference

**Version:** 0.1.0  
**Base URL:** `http://localhost:3000`  
**Content-Type:** `application/json`

**Authentication:** Bearer JWT (required for all endpoints except `/v1/health` and `/v1/auth/*`).

**Auth Toggle for Tests:** set `VI_AUTH_ENABLED=true` to require JWT in tests (default is disabled in `NODE_ENV=test`).

---

## Health Check

### GET /v1/health

Check server status and readiness.

**Request:**
```http
GET /v1/health HTTP/1.1
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-12-23T22:47:11.460Z",
  "version": "0.1.0"
}
```

**Status Codes:**
- `200` — Server is healthy
- `500` — Server error

**Example:**
```bash
curl http://localhost:3000/v1/health
```

---

## Conversations

### POST /v1/conversations

Create a new conversation.

**Auth:** Required — `Authorization: Bearer <accessToken>`

**Request:**
```http
POST /v1/conversations HTTP/1.1
Content-Type: application/json

{
  "title": "My Conversation"
}
```

**Request Body:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| title | string | Yes | 1-200 characters |

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My Conversation",
  "createdAt": "2025-12-23T22:47:11.460Z"
}
```

**Status Codes:**
- `201` — Conversation created
- `400` — Invalid request (validation error)
- `401` — Missing/invalid token
- `403` — Forbidden (not owner)
- `500` — Server error

**Example:**
```bash
curl -X POST http://localhost:3000/v1/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"My First Conversation"}'
```

**Validation Errors:**
```json
{
  "error": "Bad Request",
  "issues": [
    {
      "code": "too_small",
      "minimum": 1,
      "type": "string",
      "path": ["title"],
      "message": "String must contain at least 1 character(s)"
    }
  ]
}
```

---

## Messages

## Authentication

### POST /v1/auth/register

Create a new user account and return access/refresh tokens.

**Auth:** Not required

**Request:**
```http
POST /v1/auth/register HTTP/1.1
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "testuser",
  "password": "Passw0rd!123",
  "displayName": "Test User"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "<jwt>",
    "refreshToken": "<refresh-token>",
    "expiresIn": 900
  }
}
```

**Status Codes:**
- `201` — User created
- `400` — Validation error
- `409` — Email or username already exists
- `500` — Server error

---

### POST /v1/auth/login

Authenticate a user and return access/refresh tokens.

**Auth:** Not required

**Request:**
```http
POST /v1/auth/login HTTP/1.1
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Passw0rd!123"
}
```

**Status Codes:**
- `200` — Login successful
- `400` — Validation error
- `401` — Invalid credentials
- `500` — Server error

---

### POST /v1/auth/refresh

Exchange a refresh token for a new access token (and refresh token).

**Auth:** Not required

**Request:**
```http
POST /v1/auth/refresh HTTP/1.1
Content-Type: application/json

{
  "refreshToken": "<refresh-token>"
}
```

**Status Codes:**
- `200` — Tokens refreshed
- `400` — Validation error
- `401` — Invalid/expired/revoked refresh token
- `500` — Server error

---

### POST /v1/auth/logout

Revoke a refresh token (logout current session).

**Auth:** Not required (token provided in body)

**Request:**
```http
POST /v1/auth/logout HTTP/1.1
Content-Type: application/json

{
  "refreshToken": "<refresh-token>"
}
```

**Status Codes:**
- `200` — Logged out
- `400` — Validation error
- `500` — Server error

---

### POST /v1/auth/logout-all

Revoke all sessions for the authenticated user.

**Auth:** Required — `Authorization: Bearer <accessToken>`

**Request:**
```http
POST /v1/auth/logout-all HTTP/1.1
Authorization: Bearer <accessToken>
```

**Status Codes:**
- `200` — All sessions revoked
- `401` — Missing/invalid token
- `500` — Server error

### POST /v1/conversations/:conversationId/messages

Add a message to a conversation.

**Auth:** Required — `Authorization: Bearer <accessToken>`

**Request:**
```http
POST /v1/conversations/:conversationId/messages HTTP/1.1
Content-Type: application/json

{
  "role": "user",
  "content": "Hello, how are you?"
}
```

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| conversationId | string (UUID) | ID of the conversation |

**Request Body:**
| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| role | enum | Yes | `"user"`, `"assistant"`, or `"system"` |
| content | string | Yes | Minimum 1 character |

**Response:**
```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "conversationId": "550e8400-e29b-41d4-a716-446655440000",
  "role": "user",
  "content": "Hello, how are you?",
  "createdAt": "2025-12-23T22:47:12.123Z"
}
```

**Status Codes:**
- `201` — Message created
- `400` — Invalid request (validation error)
- `404` — Conversation not found
- `401` — Missing/invalid token
- `403` — Forbidden (not owner)
- `500` — Server error

**Example:**
```bash
curl -X POST http://localhost:3000/v1/conversations/550e8400-e29b-41d4-a716-446655440000/messages \
  -H "Content-Type: application/json" \
  -d '{"role":"user","content":"Hello!"}'
```

**Not Found Error:**
```json
{
  "error": "Conversation not found",
  "conversationId": "invalid-id"
}
```

---

### GET /v1/conversations/:conversationId/messages

List all messages in a conversation.
**Auth:** Required — `Authorization: Bearer <accessToken>`

**Request:**
```http
GET /v1/conversations/:conversationId/messages HTTP/1.1
```

**URL Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| conversationId | string (UUID) | ID of the conversation |

**Response:**
```json
{
  "conversation": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My Conversation",
    "createdAt": "2025-12-23T22:47:11.460Z"
  },
  "messages": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "conversationId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "user",
      "content": "Hello, how are you?",
      "createdAt": "2025-12-23T22:47:12.123Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "conversationId": "550e8400-e29b-41d4-a716-446655440000",
      "role": "assistant",
      "content": "I'm doing well, thank you!",
      "createdAt": "2025-12-23T22:47:13.456Z"
    }
  ]
}
```

**Status Codes:**
- `200` — Success
- `400` — Invalid conversation ID
- `404` — Conversation not found
- `401` — Missing/invalid token
- `403` — Forbidden (not owner)
- `500` — Server error

**Example:**
```bash
curl http://localhost:3000/v1/conversations/550e8400-e29b-41d4-a716-446655440000/messages
```

**Message Ordering:**
Messages are returned in chronological order (oldest first) based on `createdAt` timestamp.

---

## Data Models

### Conversation

```typescript
interface Conversation {
  id: string;              // UUID
  title: string;           // 1-200 characters
  createdAt: string;       // ISO 8601 timestamp (UTC)
}
```

### Message

```typescript
interface Message {
  id: string;              // UUID
  conversationId: string;  // UUID (foreign key)
  role: 'user' | 'assistant' | 'system';
  content: string;         // Minimum 1 character
  createdAt: string;       // ISO 8601 timestamp (UTC)
}
```

---

## Error Responses

### Validation Error (400)

```json
{
  "error": "Bad Request",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": ["title"],
      "message": "Expected string, received number"
    }
  ]
}
```

### Not Found (404)

```json
{
  "error": "Not Found",
  "path": "/v1/nonexistent"
}
```

Or for specific resources:

```json
{
  "error": "Conversation not found",
  "conversationId": "invalid-uuid"
}
```

### Server Error (500)

```json
{
  "error": "Internal Server Error"
}
```

---

## Environment Configuration

### Server

```bash
VI_HOST=0.0.0.0          # Default: 0.0.0.0
VI_PORT=3000             # Default: 3000
VI_LOG_LEVEL=info        # Default: info (debug|info|warn|error)
```

### Database

```bash
# Option 1: Full connection URL (takes precedence)
DATABASE_URL=postgres://user:pass@host:port/dbname

# Option 2: Individual components
VI_DB_HOST=127.0.0.1              # Default: 127.0.0.1
VI_DB_PORT=55432                  # Default: 55432
VI_DB_USER=postgres               # Default: postgres
VI_DB_PASSWORD=postgres           # Default: postgres
VI_DB_NAME=vi                     # Default: vi
VI_DB_SSL=false                   # Default: false

# Connection pool tuning
VI_DB_POOL_SIZE=10                # Default: 10
VI_DB_CONNECTION_TIMEOUT_MS=5000  # Default: 5000
VI_DB_IDLE_TIMEOUT_MS=10000       # Default: 10000
```

### Telemetry

```bash
VI_TELEMETRY_ENABLED=true    # Default: true
VI_TELEMETRY_PATH=./telemetry # Default: ./telemetry
```

---

## Identity Management

Vi uses a universal identity system that maps provider-specific identities (Discord, Sovereign, Astralis, etc.) to a canonical `vi_user_id`. This enables cross-client continuity — users can start a conversation in Discord and continue it in Sovereign with the same memory and context.

### GET /v1/identity/resolve

Resolve or create a canonical identity from provider context.

**Auth:** Public (no token required)

**Request:**
```http
GET /v1/identity/resolve?provider=discord&provider_user_id=123456 HTTP/1.1
```

**Query Parameters:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| provider | string | Yes | Provider name (discord, sovereign, astralis, console, guest) |
| provider_user_id | string | Yes | Provider-specific user ID |

**Response:**
```json
{
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "discord",
  "provider_user_id": "123456"
}
```

**Status Codes:**
- `200` — Identity resolved (created if new)
- `400` — Missing required query params
- `500` — Server error

**Example:**
```bash
curl "http://localhost:3000/v1/identity/resolve?provider=discord&provider_user_id=123456"
```

---

### GET /v1/identity/map/:vi_user_id

List all provider identities linked to a canonical user ID.

**Auth:** Public (no token required)

**Request:**
```http
GET /v1/identity/map/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
```

**Response:**
```json
{
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "identities": [
    {
      "provider": "discord",
      "provider_user_id": "123456",
      "metadata": {
        "username": "testuser"
      }
    },
    {
      "provider": "sovereign",
      "provider_user_id": "sov_789",
      "metadata": {}
    }
  ]
}
```

**Status Codes:**
- `200` — Success (empty array if no identities found)
- `500` — Server error

**Example:**
```bash
curl http://localhost:3000/v1/identity/map/550e8400-e29b-41d4-a716-446655440000
```

---

### POST /v1/identity/link

Link a new provider identity to an existing canonical user.

**Auth:** Public (no token required, but audit logging captures request context)

**Use Case:** User logged into Discord, now wants to link their Sovereign account to share memory/context.

**Request:**
```http
POST /v1/identity/link HTTP/1.1
Content-Type: application/json

{
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "sovereign",
  "provider_user_id": "sov_789",
  "metadata": {
    "email": "user@example.com"
  }
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vi_user_id | UUID | Yes | Canonical Vi user ID |
| provider | string | Yes | Provider name |
| provider_user_id | string | Yes | Provider-specific user ID |
| metadata | object | No | Additional metadata (email, username, etc.) |

**Response:**
```json
{
  "success": true,
  "message": "Provider identity linked",
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "sovereign",
  "provider_user_id": "sov_789"
}
```

**Status Codes:**
- `201` — Identity linked successfully
- `400` — Missing required fields
- `409` — Provider identity already linked to a different user
- `500` — Server error

**Audit Logging:**
All link operations are logged to `identity_audit_log` with:
- User agent
- IP address
- Timestamp
- Performer (user ID from JWT, or 'anonymous')

**Example:**
```bash
curl -X POST http://localhost:3000/v1/identity/link \
  -H "Content-Type: application/json" \
  -d '{
    "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "sovereign",
    "provider_user_id": "sov_789"
  }'
```

---

### DELETE /v1/identity/link

Unlink a provider identity from a canonical user.

**Auth:** Public (no token required, but audit logging captures request context)

**Safety:** Cannot unlink the last provider (users must have at least one identity).

**Request:**
```http
DELETE /v1/identity/link HTTP/1.1
Content-Type: application/json

{
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "discord",
  "provider_user_id": "123456"
}
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| vi_user_id | UUID | Yes | Canonical Vi user ID |
| provider | string | Yes | Provider name to unlink |
| provider_user_id | string | Yes | Provider-specific user ID |

**Response:**
```json
{
  "success": true,
  "message": "Provider identity unlinked",
  "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
  "provider": "discord",
  "provider_user_id": "123456"
}
```

**Status Codes:**
- `200` — Identity unlinked successfully
- `400` — Missing required fields OR attempting to unlink last provider
- `500` — Server error

**Audit Logging:**
All unlink operations are logged to `identity_audit_log` with full context.

**Example:**
```bash
curl -X DELETE http://localhost:3000/v1/identity/link \
  -H "Content-Type: application/json" \
  -d '{
    "vi_user_id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "discord",
    "provider_user_id": "123456"
  }'
```

---

## Rate Limiting

**Not yet implemented.** All endpoints are currently unrestricted.

---

## Authentication

**Not yet implemented.** All endpoints are currently public.

---

## Changelog

### v0.1.0 (2025-12-23)
- Initial release
- Health check endpoint
- Conversation CRUD (create, get)
- Message CRUD (create, list)
- PostgreSQL persistence
- Zod validation
- Structured logging with Pino
