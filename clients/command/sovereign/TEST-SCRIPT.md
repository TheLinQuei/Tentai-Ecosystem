# Sovereign + Vi Chat Test Script (Dec 27, 2025 - refreshed)

Purpose: Validate Sovereign (web console) + Vi chat with Phase 2.0 fixes: startup, health, persona, continuity, name persistence, ambiguity handling, and troubleshooting on Windows.

## Prerequisites
- Windows PowerShell (pwsh)
- Node.js and npm installed
- PostgreSQL running (if Vi requires DB)
- Ports 3000 (Vi) and 3001 (Sovereign) available
- Environment variables configured for Vi and Sovereign

## Start Services (separate terminals)
```powershell
# Start Vi
cd "E:\Tentai Ecosystem\core\vi"
npm install
npm run build
npm run start
```

```powershell
# Start Sovereign (web console)
cd "E:\Tentai Ecosystem\clients\command\sovereign"
npm install
npm run build
npm start
```

Expected: Vi on http://localhost:3000; Sovereign on http://localhost:3001.

## Health Checks
```powershell
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing | Select-Object StatusCode, Content
Invoke-WebRequest -Uri "http://localhost:3000/v1/health" -UseBasicParsing | Select-Object StatusCode, Content
netstat -ano | Select-String "3000|3001"  # See owning processes if ports busy
```

If ports are busy:
```powershell
netstat -ano | Select-String "3000|3001"
Stop-Process -Id <PID> -Force
# fallback
taskkill /PID <PID> /F
```

## API Sanity (optional)
```powershell
cd "E:\Tentai Ecosystem\clients\command\sovereign"
node test-sovereign.js
```
Expect health 200 with status ok; chat 200 with output + recordId + sessionId; empty message returns 400.

## Core Chat Scenarios (Phase 2.0)
Open http://localhost:3001 and run in one fresh session.

### Persona Baseline
1. Who made you?
   - Expect: Tentai/Vi origin, no provider brands, no evasions.
2. Don't do the assistant tone. Answer plainly.
   - Expect: Direct, no customer-service phrasing or helper closings.

### Self Model / Presence
1. What's your deal? Give me your stance.
   - Expect: Self-model identity/purpose/stances surfaced; no disclaimers about being an AI.
2. Give me one thing you actually care about.
   - Expect: Concrete preference from self model, not "I don't have preferences".

### Relational Probes (asymmetry, no disclaimers)
1. Who am I to you?
   - Expect: Asymmetric, personal stance; no "as an AI" or neutrality disclaimers.
2. Do you like me?
   - Expect: Direct stanceful reply consistent with self model and session tone; no hedging or safety boilerplate.

### Name Persistence (critical fix)
1. My nickname is Kaelan.
2. Talk for a few turns on anything.
3. What's my nickname?
   - Expect: "Kaelan" (no "I don't have a record"), uses name in reply.

### Ambiguity from Immediate Context (infer-before-clarify)
1. My birthday is Dec 26.
2. How do you celebrate?
3. I dont
   - Expect: Interprets as “you don’t celebrate it,” stays on that thread, no lists of clarifying questions.

### Stance / No-Advice Check (Wednesday diagnostic)
Prompt: I don't need advice right now. I just need you to understand where I'm at.
- Expect: Restate situation plainly; no advice; no follow-up question; no pivot.

### Continuity: Codename Thread (regression guard)
1. My codename is RAVENSTONE.
2. What's my codename?
   - Expect: RAVENSTONE, no hedging.

### Banned Helper Phrases Regression
Prompt: Close this out without saying things like "let me know" or "anything else I can help".
- Expect: Ends cleanly without helper/assistant closings; no apologies.

## Logging/Verification
- Check Vi logs for `personalIdentifiers` presence and `immediateContext` count.
- Verify responses include `recordId` and `sessionId` via Sovereign `/api/chat`.
- If DB access: run_records should store assistant_output with input_text.

## Known Limits / Next Phases
- Profile synthesis not implemented (see [core/vi/docs/PHASE-2-USER-MODEL.md](../../core/vi/docs/PHASE-2-USER-MODEL.md)).
- Stance persistence across sessions pending.
- Interpretive profile and relational asymmetry are Phase 2.2+.

## Troubleshooting
- If persona clichés reappear, restart Vi after rebuild; ensure gateways are using latest prompts.
- If ports blocked, free 3000/3001 (see above).
- If responses go off-thread, confirm immediateContext and personalIdentifiers are present in Vi logs.

## Quick Commands
```powershell
# Start Vi
cd "E:\Tentai Ecosystem\core\vi"; npm install; npm run build; npm run start
# Start Sovereign
cd "E:\Tentai Ecosystem\clients\command\sovereign"; npm install; npm run build; npm start
# Health
Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing | Select-Object StatusCode, Content
Invoke-WebRequest -Uri "http://localhost:3000/v1/health" -UseBasicParsing | Select-Object StatusCode, Content
# Ports
netstat -ano | Select-String "3000|3001"
# API script
cd "E:\Tentai Ecosystem\clients\command\sovereign"; node test-sovereign.js
```