# Vi Overseer - God Console Control Spine

## What This Is

The **Vi Overseer** is the privileged daemon that enforces authority over the entire Vi ecosystem from the God Console.

It is:
- **Not a service registry** (you already have that)
- **Not a log aggregator** (though it streams logs)
- **Not middleware** (it's a control plane)

It is:
- **The spine of the God Console** - if you can't control Vi from the console without touching a terminal, the console isn't real authority
- **A process manager** - owns PID lifecycle, port management, restarts
- **A TEST_MODE enforcer** - hard gate that ensures TEST_MODE is locked at the daemon level
- **A build orchestrator** - triggers builds, tracks success/failure
- **A log river** - streams live logs to the console

## Architecture

```
God Console (UI)
    ↓ (REST API calls only)
Vi Overseer (Daemon)
    ↓ (Process spawning, env control, signal handling)
OS / Node / Docker
```

The console never talks to the OS directly. It **only talks to Overseer**. Overseer enforces all state transitions.

## Starting the Overseer

```bash
cd core/overseer
npm install
npm run dev
```

The daemon will listen on `http://127.0.0.1:3200` by default.

## Control Endpoints

### Status

```
GET /overseer/services/status
GET /overseer/services/:serviceId/status
```

Returns full lifecycle state: pid, uptime, status, last error.

### Lifecycle

```
POST /overseer/services/:serviceId/start
POST /overseer/services/:serviceId/stop
POST /overseer/services/:serviceId/restart
```

### Build

```
POST /overseer/build/:serviceId
```

Runs `npm run build` or the configured build command.

### Logs

```
GET /overseer/logs/:serviceId?lines=100
```

Returns last N lines of service output.

### TEST_MODE (Hard Gate)

```
POST /overseer/mode/test-mode
Content-Type: application/json

{ "enabled": true }
```

This is the **only place** TEST_MODE is actually enforced. The God Console can toggle it here, and Overseer will restart Vi Core with the new mode active.

```
GET /overseer/mode/test-mode
```

Returns current TEST_MODE state.

## Why This Matters

Without Overseer, the God Console is:
- Observability theater
- A dashboard that pretends to be in charge
- Still dependent on PowerShell/terminal for day-to-day ops

With Overseer, the God Console is:
- The actual control authority
- The entry point for all system changes
- The record of who did what and when

This is the difference between "neat UI" and "operational system."

## Next Steps

1. Start Overseer: `npm run dev` in `core/overseer/`
2. Open God Console at `http://localhost:3001`
3. Use the "Authority Control Plane" section to start/stop Vi Core
4. Verify logs stream correctly
5. Toggle TEST_MODE and confirm it restarts Vi Core with the new mode

## Future Expansion

Future versions will add:
- Authority failsafes (lock Vi in safe mode, freeze memory, force reflective stance)
- Build artifact tracking
- Deterministic run replay
- Multi-service orchestration (Memory, Gateway, Workers)
- Signature verification on critical commands
- Audit log (immutable record of all state changes)

But for God-0, this spine is enough to prove authority is real.
