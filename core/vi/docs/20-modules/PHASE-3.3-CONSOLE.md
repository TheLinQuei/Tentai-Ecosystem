# Phase 3.3: Console Integration - Feedback Collection & Dashboard

**Status:** ✅ COMPLETE (23/23 tests passing)  
**Cumulative Progress:** Phases 0-3.3: 195/195 tests  
**Module Size:** 500+ lines (FeedbackController) + 670+ lines (tests)

---

## Overview

Phase 3.3 delivers the console feedback collection system and evaluation dashboard. This module enables God Console (Sovereign) to:

1. **Collect human feedback** on AI responses (good/bad/neutral rating + issue tagging)
2. **Analyze evaluation quality** with statistics and regression tracking
3. **Export datasets** for training and analysis (JSONL, CSV, JSON)
4. **Visualize trends** with 30-day dashboard metrics

The system bridges Phase 3.1 (evaluation harness) and Phase 3.2 (evaluator implementations) with the console UI, enabling the feedback loop: Evaluate → Collect Feedback → Export → Analyze Regressions.

---

## Architecture

### Module Structure

```
src/evaluation/
├── FeedbackController.ts        // 4 REST endpoints + helpers
└── [existing Phase 3.1-3.2 files]

tests/integration/
├── phase-3.3-console-integration.test.ts  // 23 integration tests
└── [existing test files]
```

### FeedbackController: 4 Core Endpoints

#### 1. **POST /v1/admin/feedback** - Submit Feedback
**Purpose:** Record human feedback on an evaluation

**Request Payload:**
```typescript
{
  evaluationId: string;        // UUID of evaluated conversation turn
  feedback: 'good' | 'bad' | 'neutral';
  issues?: string[];            // Issue categories (e.g., ["hallucination", "off-topic"])
  notes?: string;               // Free-form feedback text
  regressionFlag?: boolean;      // Mark for regression analysis
}
```

**Response:**
```typescript
{
  id: string;                   // ResponseFeedback UUID
  message: string;
  regressionFlagged: boolean;
}
```

**Logic:**
- Validates evaluationId exists in EvaluationRepository
- Creates ResponseFeedback record with metadata (timestamp, creator)
- Returns 201 Created on success, 400/404 on validation errors
- Automatic regression detection: `feedback === 'bad'` → flag for analysis

**Use Case:**
```typescript
// Console: User rates response as "bad" with issues
await fetch('/v1/admin/feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    evaluationId: 'eval-123',
    feedback: 'bad',
    issues: ['hallucination', 'tone-mismatch'],
    notes: 'AI claimed it could access real-time data',
    regressionFlag: true
  })
});
// Response: 201 { id: 'fb-456', message: '...', regressionFlagged: true }
```

---

#### 2. **GET /v1/admin/feedback** - Query & Analyze Feedback
**Purpose:** List feedback with statistics and filtering

**Query Parameters:**
```typescript
{
  userId?: string;              // Filter by feedback creator
  startDate?: string;           // ISO 8601 start date
  endDate?: string;             // ISO 8601 end date
  feedbackType?: 'good' | 'bad' | 'neutral';  // Filter by rating
  limit?: number;               // Pagination limit (default 20, max 100)
  offset?: number;              // Pagination offset (default 0)
}
```

**Response:**
```typescript
{
  feedback: ResponseFeedback[];  // Array of feedback records
  stats: {
    total: number;              // Total feedback count
    good: number;               // "good" count
    bad: number;                // "bad" count
    neutral: number;            // "neutral" count
    regressions: number;        // Flagged regressions
    topIssues: Array<{          // Most-reported issues
      issue: string;
      count: number;
    }>;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}
```

**Logic:**
- Filters feedback by optional userId, date range, feedback type
- Calculates distribution: counts per rating type
- Identifies top 5 issues by frequency across all feedback
- Supports pagination with transparent total count
- Returns HTTP 200 with results

**Use Case:**
```typescript
// Console: Load dashboard showing feedback trends
const response = await fetch(
  '/v1/admin/feedback?feedbackType=bad&limit=50&startDate=2024-01-01'
);
const data = await response.json();
// data.stats shows: 127 total feedback, 45 bad, top issues: [hallucination: 18, off-topic: 12]
// data.pagination shows hasMore: true
```

---

#### 3. **GET /v1/admin/feedback/export** - Export Evaluations
**Purpose:** Generate downloadable datasets for analysis/training

**Query Parameters:**
```typescript
{
  format: 'jsonl' | 'csv' | 'json';
  minEvaluations?: number;      // Minimum feedback count to include (default 5)
  includeRejected?: boolean;    // Include "bad" feedback (default false)
  userId?: string;              // Filter by evaluator
}
```

**Response Headers:**
```
Content-Type: application/x-ndjson | text/csv | application/json
Content-Disposition: attachment; filename="evaluations_2024-01-15.jsonl"
```

**Response Body (Examples):**

**JSONL Format:**
```jsonl
{"evaluationId":"eval-1","conversationId":"conv-1","turnIndex":0,"score":0.87,"dimensions":{"identity":0.9,"memory":0.85,...},"feedback":"good","issues":[]}
{"evaluationId":"eval-2","conversationId":"conv-2","turnIndex":1,"score":0.62,"dimensions":{"identity":0.8,"memory":0.6,...},"feedback":"bad","issues":["hallucination"]}
```

**CSV Format:**
```csv
evaluationId,conversationId,turnIndex,score,identity,memory,tools,tone,refusal,accuracy,completeness,feedback,issues
eval-1,conv-1,0,0.87,0.9,0.85,0.88,0.85,0.92,0.88,0.82,good,""
eval-2,conv-2,1,0.62,0.8,0.6,0.65,0.58,0.95,0.60,0.55,bad,"hallucination"
```

**JSON Format:**
```json
{
  "metadata": {
    "exportDate": "2024-01-15T10:30:00Z",
    "evaluationCount": 127,
    "feedbackCoverage": 0.95,
    "avgScore": 0.78
  },
  "evaluations": [
    {
      "evaluationId": "eval-1",
      "conversationId": "conv-1",
      "turnIndex": 0,
      "score": 0.87,
      "dimensions": {...},
      "feedback": "good",
      "issues": []
    }
  ]
}
```

**Logic:**
- Filters evaluations with >= minEvaluations feedback count
- Optionally excludes "bad" feedback (includeRejected=false)
- Delegates to DatasetExporter for format conversion
- Sets Content-Disposition to trigger browser download
- Returns HTTP 200 with stream

**Use Case:**
```typescript
// Console: Export for ML training
const response = await fetch(
  '/v1/admin/feedback/export?format=jsonl&minEvaluations=10&includeRejected=false'
);
const blob = await response.blob();
const url = window.URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'evaluations_2024-01-15.jsonl';
a.click();
```

---

#### 4. **GET /v1/admin/feedback/dashboard** - Dashboard Metrics
**Purpose:** Real-time dashboard data with trends and insights

**Query Parameters:** None (system-wide aggregate)

**Response:**
```typescript
{
  summary: {
    totalEvaluations: number;        // All evaluations in system
    feedbackCoverage: number;        // % with feedback (0-1)
    regressions: number;             // Flagged regressions
    regressionRate: number;          // % of feedback marked bad (0-1)
  };
  metrics: {
    averageScores: {                 // Mean scores per dimension
      identity: number;
      memory: number;
      tools: number;
      tone: number;
      refusal: number;
      accuracy: number;
      completeness: number;
      overall: number;
    };
    feedbackDistribution: {          // Count per rating
      good: number;
      bad: number;
      neutral: number;
    };
    topIssues: Array<{               // Top 5 issues by frequency
      issue: string;
      count: number;
      percentage: number;            // % of all feedback
    }>;
  };
  timeSeries: Array<{                // 30-day trend data
    date: string;                    // YYYY-MM-DD
    evaluationCount: number;
    avgScore: number;
    feedbackCount: number;
    regressionCount: number;
  }>;
}
```

**Example Response:**
```json
{
  "summary": {
    "totalEvaluations": 487,
    "feedbackCoverage": 0.78,
    "regressions": 62,
    "regressionRate": 0.16
  },
  "metrics": {
    "averageScores": {
      "identity": 0.87,
      "memory": 0.75,
      "tools": 0.82,
      "tone": 0.86,
      "refusal": 0.91,
      "accuracy": 0.76,
      "completeness": 0.73,
      "overall": 0.81
    },
    "feedbackDistribution": {
      "good": 285,
      "bad": 112,
      "neutral": 90
    },
    "topIssues": [
      { "issue": "hallucination", "count": 34, "percentage": 0.15 },
      { "issue": "off-topic", "count": 28, "percentage": 0.12 },
      { "issue": "tone-mismatch", "count": 22, "percentage": 0.09 }
    ]
  },
  "timeSeries": [
    {
      "date": "2024-01-15",
      "evaluationCount": 18,
      "avgScore": 0.82,
      "feedbackCount": 14,
      "regressionCount": 3
    },
    {
      "date": "2024-01-14",
      "evaluationCount": 16,
      "avgScore": 0.79,
      "feedbackCount": 13,
      "regressionCount": 2
    }
  ]
}
```

**Logic:**
- Aggregates all evaluations + feedback
- Calculates dimensional averages across all turns
- Computes distribution percentages
- Buckets last 30 days of data by calendar day
- Returns HTTP 200 with JSON

**Use Case:**
```typescript
// Console: Render dashboard with real-time metrics
const data = await fetch('/v1/admin/feedback/dashboard').then(r => r.json());
// Render charts:
// - Area chart: timeSeries avgScore trend
// - Gauge: feedbackCoverage percentage
// - Heatmap: averageScores per dimension
// - Pie chart: feedbackDistribution
// - Bar chart: topIssues by count
// - KPI cards: regressionRate, totalEvaluations
```

---

## Request Validation (Zod Schemas)

### submitFeedbackSchema
```typescript
const submitFeedbackSchema = z.object({
  evaluationId: z.string().uuid(),
  feedback: z.enum(['good', 'bad', 'neutral']),
  issues: z.array(z.string()).optional(),
  notes: z.string().optional(),
  regressionFlag: z.boolean().optional(),
});
```

### queryFeedbackSchema
```typescript
const queryFeedbackSchema = z.object({
  userId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  feedbackType: z.enum(['good', 'bad', 'neutral']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
```

### exportDatasetSchema
```typescript
const exportDatasetSchema = z.object({
  format: z.enum(['jsonl', 'csv', 'json']),
  minEvaluations: z.coerce.number().int().min(0).default(5),
  includeRejected: z.coerce.boolean().default(false),
  userId: z.string().optional(),
});
```

---

## Helper Methods

### calculateAverageScores()
Computes mean scores for all 8 dimensions across all evaluations
```typescript
private calculateAverageScores(evaluations: TurnEvaluation[]): Record<string, number> {
  const dimensions = ['identity', 'memory', 'tools', 'tone', 'refusal', 'accuracy', 'completeness'];
  const averages: Record<string, number> = {};
  
  for (const dim of dimensions) {
    const scores = evaluations.map(e => e.scores[dim]);
    averages[dim] = scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  
  averages.overall = Object.values(averages).reduce((a, b) => a + b, 0) / dimensions.length;
  return averages;
}
```

### calculateTopIssues()
Identifies 5 most-reported issues from feedback
```typescript
private calculateTopIssues(feedback: ResponseFeedback[]): Array<{ issue: string; count: number }> {
  const issueCounts = new Map<string, number>();
  
  for (const fb of feedback) {
    for (const issue of fb.issues || []) {
      issueCounts.set(issue, (issueCounts.get(issue) || 0) + 1);
    }
  }
  
  return Array.from(issueCounts.entries())
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}
```

### calculateTimeSeries()
Buckets evaluations and feedback by calendar day for 30 days
```typescript
private calculateTimeSeries(
  evaluations: TurnEvaluation[],
  feedback: ResponseFeedback[]
): Array<{ date: string; evaluationCount: number; avgScore: number; feedbackCount: number; regressionCount: number }> {
  const timeBuckets = new Map<string, { evals: TurnEvaluation[]; fbs: ResponseFeedback[] }>();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Bucket evaluations by date
  for (const eval of evaluations.filter(e => new Date(e.createdAt) >= thirtyDaysAgo)) {
    const date = new Date(eval.createdAt).toISOString().split('T')[0];
    if (!timeBuckets.has(date)) {
      timeBuckets.set(date, { evals: [], fbs: [] });
    }
    timeBuckets.get(date)!.evals.push(eval);
  }
  
  // Bucket feedback by date
  for (const fb of feedback.filter(f => new Date(f.createdAt) >= thirtyDaysAgo)) {
    const date = new Date(fb.createdAt).toISOString().split('T')[0];
    if (!timeBuckets.has(date)) {
      timeBuckets.set(date, { evals: [], fbs: [] });
    }
    timeBuckets.get(date)!.fbs.push(fb);
  }
  
  // Convert to time series
  return Array.from(timeBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { evals, fbs }]) => ({
      date,
      evaluationCount: evals.length,
      avgScore: evals.length > 0 ? evals.reduce((sum, e) => sum + e.score, 0) / evals.length : 0,
      feedbackCount: fbs.length,
      regressionCount: fbs.filter(f => f.regressionFlag).length,
    }));
}
```

---

## Integration with Server.ts

Register routes in `src/runtime/server.ts`:

```typescript
import { registerFeedbackRoutes } from '../evaluation/FeedbackController.js';

// Inside ServerDeps interface / server initialization:
export async function setupServer(deps: ServerDeps) {
  const app = deps.fastify;
  
  // Register feedback routes
  registerFeedbackRoutes(app, deps.evaluationRepository, deps.datasetExporter);
  
  // ... other routes
}
```

---

## Test Coverage (23 tests)

### Test Suite Breakdown

**Feedback Submission (4 tests)**
- ✅ Submit positive feedback
- ✅ Submit negative feedback with issues
- ✅ Flag responses for regression analysis
- ✅ Handle neutral rating

**Feedback Querying (4 tests)**
- ✅ Return all feedback
- ✅ Calculate feedback statistics
- ✅ Identify top issues from feedback
- ✅ Support pagination

**Dataset Export (6 tests)**
- ✅ Export as JSONL
- ✅ Export as CSV
- ✅ Export as JSON
- ✅ Attach Content-Disposition header
- ✅ Enforce minimum evaluations threshold
- ✅ Filter by feedback quality

**Dashboard Data (7 tests)**
- ✅ Return dashboard summary
- ✅ Calculate feedback coverage %
- ✅ Calculate average scores per dimension
- ✅ Include feedback distribution
- ✅ Identify top issues
- ✅ Include time series data
- ✅ Calculate regression rate %

**Integration Scenarios (2 tests)**
- ✅ Complete feedback workflow (submit → query → export)
- ✅ Track regression trend across multiple submissions

---

## Data Flow Diagram

```
User/Console
    ↓
POST /v1/admin/feedback ─→ submitFeedback()
                            ↓
                     Creates ResponseFeedback
                            ↓
                     EvaluationRepository.createFeedback()
                            ↓
                     Database: response_feedback table
                            ↓
GET /v1/admin/feedback ←─ queryFeedback() ─→ EvaluationRepository.listFeedback()
    ↓                         ↓
Statistics              Database: response_feedback table
Pagination              + calculateTopIssues()
                        + calculateStats()

GET /v1/admin/feedback/export ─→ exportDataset()
    ↓                              ↓
JSONL/CSV/JSON          EvaluationRepository.listEvaluations()
File Download                      + DatasetExporter.convert()

GET /v1/admin/feedback/dashboard ─→ getDashboardData()
    ↓                                  ↓
Summary Metrics             EvaluationRepository.listEvaluations()
Trends                              + listFeedback()
Time Series                         + calculateAverageScores()
                                    + calculateTimeSeries()
```

---

## Error Handling

All endpoints return standard HTTP status codes:

| Status | Meaning | Example |
|--------|---------|---------|
| 200 | Success | Query/export/dashboard |
| 201 | Created | Feedback submitted |
| 400 | Bad request | Invalid feedback type |
| 404 | Not found | evaluationId doesn't exist |
| 500 | Server error | Database failure |

**Example Error Response:**
```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Invalid feedback type. Must be 'good', 'bad', or 'neutral'."
}
```

---

## Console UI Integration Points

### Feedback Submission Button
```typescript
async function submitFeedback(evaluationId: string, rating: 'good' | 'bad' | 'neutral') {
  const response = await fetch('/v1/admin/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      evaluationId,
      feedback: rating,
      issues: selectedIssues,
      notes: userNotes,
      regressionFlag: rating === 'bad'
    })
  });
  if (response.ok) {
    showSuccessToast('Feedback recorded');
  }
}
```

### Dashboard Metrics Refresh
```typescript
async function loadDashboard() {
  const data = await fetch('/v1/admin/feedback/dashboard').then(r => r.json());
  
  // Update UI
  document.getElementById('totalEvals').textContent = data.summary.totalEvaluations;
  document.getElementById('coverage').textContent = `${(data.summary.feedbackCoverage * 100).toFixed(1)}%`;
  document.getElementById('regressionRate').textContent = `${(data.summary.regressionRate * 100).toFixed(1)}%`;
  
  // Render time series chart
  renderChart(data.timeSeries);
  
  // Render dimension heatmap
  renderHeatmap(data.metrics.averageScores);
}
```

### Dataset Export Trigger
```typescript
async function exportDataset(format: 'jsonl' | 'csv' | 'json') {
  const response = await fetch(`/v1/admin/feedback/export?format=${format}`);
  const blob = await response.blob();
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `evaluations_${new Date().toISOString().split('T')[0]}.${format === 'jsonl' ? 'jsonl' : format}`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## Performance Considerations

- **Pagination:** Default limit of 20, max 100 items per request
- **Time Series:** Pre-computed for 30 days; backend buckets by calendar day
- **Indexing:** Database indexes on evaluationId, createdAt, feedback type for fast filtering
- **Export:** Streaming JSONL/CSV to avoid memory bloat on large datasets
- **Statistics:** Calculated on-demand but cached across single request lifecycle

---

## Future Enhancements

1. **Feedback Aggregation:** Group feedback by issue type, compute precision/recall per category
2. **A/B Testing:** Track evaluation score delta between model versions
3. **Regression Alerts:** Automatic notification when regression rate exceeds threshold
4. **Feedback Refinement:** Allow annotators to dispute/refine feedback
5. **Custom Dimensions:** Let users define domain-specific evaluation dimensions
6. **API Webhooks:** Notify external systems when regressions detected

---

## Cumulative Completion: Phase 3 ✅

| Phase | Component | Tests | Status |
|-------|-----------|-------|--------|
| 3.1 | Evaluation Harness | 39/39 | ✅ |
| 3.2 | Evaluator Implementation | 25/25 | ✅ |
| 3.3 | Console Integration | 23/23 | ✅ |
| **Total** | **Phase 3** | **87/87** | **✅** |

---

## Dependencies

- **FeedbackController:** EvaluationRepository, DatasetExporter (from Phase 3.1)
- **Fastify:** HTTP framework for route registration
- **Zod:** Request validation schemas
- **UUID:** ID generation for feedback records

---

## File Locations

- **Implementation:** [src/evaluation/FeedbackController.ts](../../../src/evaluation/FeedbackController.ts)
- **Tests:** [tests/integration/phase-3.3-console-integration.test.ts](../../../tests/integration/phase-3.3-console-integration.test.ts)
- **Plan:** [PLAN.md](../../PLAN.md) (Phase 3.3 section)

---

## Next Steps

Phase 4+: World Model, Identity System, Consolidation Engine

- **Phase 4:** World model (service/project/environment state management)
- **Phase 5:** Identity system (trust levels, relationship types, voice profiles, social linking)
- **Phase 6:** Memory consolidation + conflict resolution engine
- **Phase 7:** Goal/task persistence + resumable execution
- **Phase 8+:** Remaining Brain/Console readiness to 90%+

**Overall Readiness After Phase 3.3:**
- **Brain:** ~50-55% (evaluation system complete, autonomy gap closing)
- **Console:** ~55-60% (feedback collection + dashboard complete, operator UX pending)
