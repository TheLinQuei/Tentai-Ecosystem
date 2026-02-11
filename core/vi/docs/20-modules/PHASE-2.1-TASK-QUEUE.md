# Phase 2.1: Persistent Task Queue + Execution Engine

**Status:** ✅ Complete (25/25 tests passing)

## Overview

Phase 2.1 implements the persistent task queue and resumable execution engine that enables Vi to manage long-running goals as atomic, trackable work units. This closes the gap between request-scoped chat and autonomous agency.

## Key Components

### 1. Domain Models (`src/domain/task.ts`)

- **Goal**: Top-level objectives (title, status, priority, user scoping)
- **Task**: Atomic steps within a goal (state, retries, backoff, verification)
- **TaskEvent**: Audit trail for state transitions
- **ExponentialBackoffStrategy**: Configurable retry backoff (2^retries * baseDelay)

### 2. Database Schema (Migration 0009)

#### Goals Table
```sql
goals (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  title TEXT,
  description TEXT,
  status ENUM (open|in_progress|completed|failed|cancelled),
  priority INT DEFAULT 0,
  created_at, updated_at TIMESTAMPTZ
)
```

#### Tasks Table
```sql
tasks (
  id UUID PRIMARY KEY,
  goal_id UUID REFERENCES goals(id),
  step_index INT,
  title TEXT,
  state ENUM (pending|running|completed|failed|cancelled|blocked),
  retries INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  backoff_until TIMESTAMPTZ,
  last_error TEXT,
  verification_status ENUM (unverified|verified|failed),
  metadata JSONB,
  created_at, updated_at TIMESTAMPTZ
)
```

#### Task Events Table
```sql
task_events (
  id UUID PRIMARY KEY,
  task_id UUID REFERENCES tasks(id),
  event_type VARCHAR(50),
  payload JSONB,
  created_at TIMESTAMPTZ
)
```

### 3. Repositories

#### GoalRepository
- `create(input)` — Create goal, default status: 'open'
- `getById(id)` — Retrieve goal by ID
- `listByUser(userId, status?, limit, offset)` — List goals with optional filtering
- `update(id, input)` — Update goal status/title/description/priority
- `delete(id)` — Delete goal (cascades tasks via FK)

#### TaskRepository
- `create(input)` — Create task, default state: 'pending'
- `getById(id)` — Retrieve task by ID
- `listByGoal(goalId, limit, offset)` — List tasks for goal (ordered by step_index)
- `listByState(state, limit, offset)` — Find tasks by state
- `listReadyToRetry(limit)` — Find failed tasks with expired backoff
- `update(id, input)` — Update task state/retries/backoff/error/verification
- `delete(id)` — Delete task

#### TaskEventRepository
- `create(input)` — Create task event
- `listByTask(taskId, limit, offset)` — Get events for task (reverse chronological)
- `listByType(eventType, limit, offset)` — Find events by type

### 4. TaskExecutor (`src/execution/TaskExecutor.ts`)

Core execution engine with resumable control flow:

#### Public Methods

**`executeTask(taskId): Task`**
- Loads task + goal context
- Respects backoff periods (skips if still active)
- Transitions to 'running', executes step, marks 'completed'
- Handles failures with retry scheduling
- Emits audit events for all state changes

**`executeGoal(goalId): void`**
- Transitions goal to 'in_progress'
- Executes all tasks sequentially (ordered by step_index)
- Marks goal 'completed' on success, 'failed' on any task failure
- Emits goal-level events

**`resumeGoal(goalId): void`**
- Finds first incomplete task in goal
- Resumes from checkpoint (no replay)
- Useful for interrupted executions or manual resume triggers

**`getFailedTasksReadyForRetry(): Task[]`**
- Returns tasks where:
  - `state === 'failed'`
  - `retries < maxRetries`
  - `backoff_until IS NULL OR backoff_until <= now()`
- Called by retry loop to find candidates

**`retryFailedTasks(): void`**
- Gets all retry-ready tasks
- Attempts execution for each
- Logs failures, continues to next task

#### Retry Logic

1. Task fails during execution → emits 'task_failed' event
2. Check if `retries < maxRetries`:
   - **YES**: Calculate next retry time via `ExponentialBackoffStrategy`
   - Transition to 'failed' state with `backoff_until` set
   - Emit 'task_scheduled_for_retry' event
   - **NO**: Mark 'failed' with `lastError`, emit 'task_exhausted_retries'
3. Retry loop calls `retryFailedTasks()` periodically (e.g., every 30s)
4. Tasks with expired backoff are picked up and re-executed

#### Audit Trail

Every state transition creates a `TaskEvent`:
- `task_started`: Goal execution initiated
- `task_step_executed`: Single step completed (placeholder for real tool execution)
- `task_completed`: Task succeeded with verification
- `task_failed`: Task execution failed
- `task_scheduled_for_retry`: Retry scheduled with backoff time
- `task_exhausted_retries`: Max retries exceeded, marked permanently failed

## Test Coverage (25/25 Passing)

### Goal Repository (6 tests)
- Create goal, retrieve by ID, list by user, filter by status, update, delete

### Task Repository (6 tests)
- Create task, retrieve by ID, list by goal, filter by state, list retry-ready, update

### Task Event Repository (3 tests)
- Create event, list by task, list by type

### Task Executor (7 tests)
- Execute single task, track events during execution, skip backoff period
- Implement exponential backoff, execute multi-task goal, resume from checkpoint
- Get failed tasks ready for retry

### Data Integrity (3 tests)
- Maintain metadata through updates, preserve user associations, referential integrity

## Integration with Vi Core

### Future: Handler Integration (Not Yet Implemented)

When tools/actions are registered, `TaskExecutor.runTaskStep()` will:

```typescript
// Lookup handler for task.type
const handler = toolRegistry.get(task.title);
const result = await handler(task.metadata.params);

// Store tool result
context.toolResults.set(`step_${task.stepIndex}`, result);

// If verifier exists, run verification
const verifier = verifierRegistry.get(task.title);
if (verifier) {
  const verified = await verifier(result, task.metadata.expectedOutput);
  context.verificationResults.set(`step_${task.stepIndex}`, verified);
}

// Update task metadata with results
await taskRepo.update(task.id, {
  metadata: { ...task.metadata, toolResult: result, verified },
});
```

### Future: Scheduler Integration (Not Yet Implemented)

A background scheduler (e.g., node-cron, bull queue) will periodically:

```typescript
// Every 30 seconds:
const ready = await executor.getFailedTasksReadyForRetry();
for (const task of ready) {
  try {
    await executor.executeTask(task.id);
  } catch (error) {
    logger.error({ taskId: task.id }, 'Retry failed', error);
  }
}
```

### Future: API Integration (Not Yet Implemented)

HTTP endpoints for task management:

```
POST   /v1/admin/goals              — Create goal
GET    /v1/admin/goals/:id           — Get goal
GET    /v1/admin/goals?status=...    — List goals for user
PATCH  /v1/admin/goals/:id           — Update goal
GET    /v1/admin/goals/:id/tasks     — List tasks for goal
POST   /v1/admin/goals/:id/resume    — Resume goal from checkpoint
GET    /v1/tasks/:id/events          — Get audit trail for task
```

## Verification Checklist

- ✅ Schema migration applied (0009_task_queue_and_execution_engine)
- ✅ All repositories fully implement CRUD + domain queries
- ✅ TaskExecutor handles nominal path (execute → complete)
- ✅ TaskExecutor handles error path (execute → fail → backoff → retry)
- ✅ Exponential backoff strategy implemented
- ✅ Goal execution respects task order (step_index ASC)
- ✅ Resume from checkpoint works (finds first incomplete task)
- ✅ Event audit trail captures all state transitions
- ✅ Referential integrity maintained (cascading deletes)
- ✅ 25/25 integration tests passing

## Next Steps

1. **Phase 2.2: Verification Layer** (Planned)
   - Add verify hooks to task steps
   - Implement generic + custom verifiers
   - Mark tasks 'verified' or 'failed' post-execution

2. **Integration Points** (Ready for implementation)
   - Register tool handlers in TaskExecutor
   - Implement background retry scheduler
   - Add HTTP endpoints for goal/task management
   - Emit task events to Evidence for UI display

3. **Optimization** (Future)
   - Add task priority queue (urgent tasks bump queue)
   - Implement circuit breaker (stop retrying flaky tasks)
   - Add task dependencies (task B waits for task A)
   - Parallel task execution with semaphore control

## Testing

Run Phase 2.1 tests:
```bash
npm run test:integration -- tests/integration/phase-2.1-task-queue.test.ts
```

Expected output:
```
✓ tests/integration/phase-2.1-task-queue.test.ts (25)
  ✓ Goal Repository (6)
  ✓ Task Repository (6)
  ✓ Task Event Repository (3)
  ✓ Task Executor (7)
  ✓ Data Integrity (3)

Tests: 25 passed (85 total)
```

## Files Modified

- `src/db/migrations.ts` — Added migration 0009
- `src/domain/task.ts` — Created domain models + BackoffStrategy
- `src/db/repositories/GoalRepository.ts` — Full CRUD implementation
- `src/db/repositories/TaskRepository.ts` — Full CRUD + domain queries
- `src/db/repositories/TaskEventRepository.ts` — Event audit trail
- `src/execution/TaskExecutor.ts` — Resumable execution engine
- `tests/integration/phase-2.1-task-queue.test.ts` — Comprehensive test suite
