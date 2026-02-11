# Phase 1 Implementation Guide: Quick Wins

## Overview
This guide walks through integrating the error handling, validation, logging, and rate limiting systems into the existing Vi server. All code is production-ready and can be dropped in with minimal changes.

## Files Created
- `src/errors/AppError.ts` - Standardized error classes and types
- `src/middleware/errorHandler.ts` - Global error handler middleware
- `src/middleware/validation.ts` - Request validation utilities
- `src/middleware/rateLimiter.ts` - Rate limiting middleware
- `src/middleware/logging.ts` - Structured logging utilities
- `src/config/validateEnv.ts` - Environment variable validation

## Integration Steps

### Step 1: Update main.ts to Initialize Everything

In `src/main.ts`, at the top of your server initialization:

```typescript
import { loadAndValidateEnv } from './config/validateEnv';
import { registerErrorHandler } from './middleware/errorHandler';
import { requestLoggingMiddleware } from './middleware/logging';
import { getLogger } from './middleware/logging';

// Validate environment at startup (FIRST thing)
loadAndValidateEnv();

const logger = getLogger();

// Then create Fastify app
const app = fastify();

// Register request logging middleware
app.addHook('preHandler', requestLoggingMiddleware());

// Register error handler (LAST middleware, catches all errors)
registerErrorHandler(app);
```

### Step 2: Update Error Handling in Routes

Replace all error responses with standardized AppError throws:

**Before:**
```typescript
app.get('/api/users/:id', async (request, reply) => {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [request.params.id]);
  if (!user) {
    return reply.status(404).send({ error: 'User not found' });
  }
  reply.send(user);
});
```

**After:**
```typescript
import { NotFoundError } from './errors/AppError';

app.get('/api/users/:id', async (request, reply) => {
  const user = await db.query('SELECT * FROM users WHERE id = $1', [request.params.id]);
  if (!user) {
    throw new NotFoundError('User', request.params.id);
  }
  reply.send({ success: true, data: user });
});
```

### Step 3: Add Request Validation to Routes

For routes that need validation, add schemas and middleware:

**Example for creating a conversation:**
```typescript
import { z } from 'zod';
import { validateBody } from './middleware/validation';
import { AppError, ValidationError, ErrorCode } from './errors/AppError';

const createConversationSchema = z.object({
  title: z.string().min(1, 'Title required').max(255),
  systemPrompt: z.string().optional(),
  tags: z.array(z.string()).optional()
});

app.post(
  '/api/conversations',
  async (request, reply) => {
    // Validate request body
    await validateBody(createConversationSchema)(request, reply);
    
    const { title, systemPrompt, tags } = request.body as any;
    
    // Your logic here...
    reply.send({ success: true, data: { id: '123', title } });
  }
);
```

### Step 4: Add Rate Limiting to Public Routes

Apply rate limiters to routes that need protection:

```typescript
import { rateLimiters } from './middleware/rateLimiter';

// Public API endpoints
app.get(
  '/api/conversations',
  { preHandler: rateLimiters.api },
  async (request, reply) => {
    // Handler...
  }
);

// Authentication endpoints (stricter limit)
app.post(
  '/auth/login',
  { preHandler: rateLimiters.auth },
  async (request, reply) => {
    // Handler...
  }
);
```

### Step 5: Add Structured Logging

Replace console.log with structured logging:

**Before:**
```typescript
async function executeToolStep(toolName: string, params: any) {
  console.log('Executing tool:', toolName);
  const result = await tool.run(params);
  console.log('Tool result:', result);
  return result;
}
```

**After:**
```typescript
import { getLogger, PerformanceLogger } from './middleware/logging';

const logger = getLogger();
const perf = new PerformanceLogger();

async function executeToolStep(toolName: string, params: any) {
  perf.mark('tool-start');
  
  logger.debug({ toolName, params }, 'Executing tool');
  
  try {
    const result = await perf.timeAsync('tool-execution', () => 
      tool.run(params)
    );
    
    logger.info({ toolName, resultSize: JSON.stringify(result).length }, 'Tool executed');
    
    const duration = perf.measure('tool-duration', 'tool-start');
    logger.debug({ toolName, duration }, 'Tool performance');
    
    return result;
  } catch (error) {
    logger.error({ toolName, error }, 'Tool execution failed');
    throw error;
  }
}
```

## Common Patterns

### Pattern 1: Validating with Context Logger
```typescript
import { createContextLogger } from './middleware/logging';

async function processUserRequest(userId: string) {
  const logger = createContextLogger({ userId, timestamp: new Date() });
  
  logger.info('Processing request');
  
  try {
    const user = await getUser(userId);
    logger.debug({ user }, 'User loaded');
    
    // Do work...
    
    logger.info('Request completed successfully');
  } catch (error) {
    logger.error('Request failed', error);
    throw error;
  }
}
```

### Pattern 2: Audit Logging
```typescript
import { auditLogger } from './middleware/logging';

async function executeUserTool(userId: string, toolName: string) {
  auditLogger.toolExecution(userId, toolName, 'started');
  
  try {
    const result = await runTool(toolName);
    auditLogger.toolExecution(userId, toolName, 'success');
    return result;
  } catch (error) {
    auditLogger.toolExecution(userId, toolName, 'failure');
    throw error;
  }
}
```

### Pattern 3: Multiple Validations
```typescript
import { validateRequest } from './middleware/validation';

const createSessionSchema = z.object({
  conversationId: z.string().uuid()
});

const sessionQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(10),
  offset: z.coerce.number().min(0).default(0)
});

app.post(
  '/api/sessions/:id/execute',
  async (request, reply) => {
    await validateRequest({
      body: createSessionSchema,
      query: sessionQuerySchema,
      params: z.object({ id: z.string().uuid() })
    })(request, reply);
    
    // All data is validated
    reply.send({ success: true });
  }
);
```

## Error Response Examples

### Success Response (unchanged)
```json
{
  "success": true,
  "data": { /* your data */ }
}
```

### Validation Error (400)
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "fields": {
        "title": ["Title required"],
        "email": ["Invalid email format"]
      },
      "count": 2
    }
  },
  "requestId": "req_12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Authentication Error (401)
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or expired token"
  },
  "requestId": "req_12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Rate Limit Error (429)
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests, please try again later"
  },
  "requestId": "req_12345",
  "timestamp": "2024-01-15T10:30:00Z",
  "headers": {
    "X-RateLimit-Limit": 100,
    "X-RateLimit-Remaining": 0,
    "X-RateLimit-Reset": 1705316400000,
    "Retry-After": 300
  }
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  },
  "requestId": "req_12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Environment Variables to Set

Create a `.env` file with these variables:

```env
# Application
NODE_ENV=development
PORT=3000
HOST=localhost

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/tentai
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10
DATABASE_TIMEOUT_MS=5000

# JWT
JWT_SECRET=your-very-long-secret-key-at-least-32-characters-long
JWT_EXPIRATION=15m
REFRESH_TOKEN_EXPIRATION=7d

# LLM APIs
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Logging
LOG_LEVEL=debug

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
CORS_ORIGIN=http://localhost:3000
ENABLE_CORS=true
```

## Rollback Procedure

If issues occur, you can roll back incrementally:

1. **Remove error handler**: Comment out `registerErrorHandler(app)` - server continues with original error handling
2. **Disable validation**: Remove `validateRequest()` calls from routes
3. **Disable rate limiting**: Remove `{ preHandler: rateLimiters.* }` from routes
4. **Disable new logging**: Use original logger (just swap imports back)

Each system is independent and can be disabled without affecting others.

## Testing the Implementation

```bash
# Test validation error
curl -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{}' # Missing required field

# Test rate limiting
for i in {1..101}; do curl http://localhost:3000/api/users; done

# Test error response
curl http://localhost:3000/api/users/invalid-id

# Check logs
tail -f logs/app.log
```

## Success Criteria

✅ All endpoints return standardized error responses  
✅ All routes validate input according to schema  
✅ All functions have structured logging  
✅ Rate limiting is enforced on sensitive routes  
✅ Environment variables validated at startup  
✅ Request IDs tracked through entire flow  
✅ Performance metrics logged for critical operations  

## Estimated Time: 15-20 hours

- Error handling: 4-6 hours
- Request validation: 3-4 hours  
- Logging integration: 4-5 hours
- Rate limiting: 2-3 hours
- Environment validation: 1-2 hours
- Testing: 1-2 hours

## Next Steps

After Phase 1 is complete, move to Phase 2 (Operations Hardening):
- Persistent audit log
- Reliable health checks
- Graceful shutdown
- Database cleanup jobs
- Prometheus metrics
