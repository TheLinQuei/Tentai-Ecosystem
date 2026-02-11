# Tentai Ecosystem - Deployment & Monitoring Guide

## Quick Fix (Run This Now)

The console is pointing to the wrong port. Run this script:

```powershell
.\deploy-fixes.ps1
```

This will:
1. ✅ Rebuild console with correct port (3000 instead of 3100)
2.✅ Deploy to GitHub Pages  
3. ✅ Add automated health monitoring
4. ✅ Run first health check

## What Was Added

### 1. **Health Monitoring System** 
- **Script**: `core/vi/scripts/healthCheck.ts`
- **Log File**: `HEALTH_LOG.md` (auto-updated)
- **Schedule**: Every 15 minutes via GitHub Actions

### 2. **Health Check Command**
```bash
cd core/vi
npm run health
```

Checks:
- ✅ Backend status (local + Railway)
- ✅ Database connectivity  
- ✅ Console deployment
- ✅ Writes report to `HEALTH_LOG.md`

### 3. **GitHub Action** (`.github/workflows/health-check.yml`)
- Runs every 15 minutes
- Auto-commits results to `HEALTH_LOG.md`
- No manual intervention needed

## Current Issues

### Railway Deployment
- ❌ Postgres crashed (see screenshot)
- ⚠️ Vi backend can't connect to database

**Fix Options:**

**A) Restart Postgres (Easiest)**
1. Go to https://railway.com/project/6b8f45bb-8423-462d-93d3-0705d322713c
2. Click on "Postgres" service
3. Click "Restart"

**B) Use Render.com Instead**
- Free tier with auto-restart
- Web UI (no CLI needed)
- See `core/vi/DEPLOY.md` for instructions

### Console App (tentaitech.com/console/)
- ✅ Fixed: Will use port 3000 after deploy-fixes.ps1 runs
- ✅ Health monitoring added
- ✅ Auto-logging to repo

## Monitoring Your App

### Check Health Anytime
```bash
cd core/vi
npm run health
```

### View Health History
Open `HEALTH_LOG.md` in your repo - automatically updated every 15 minutes

### Manual Check
```powershell
# Test backend
Invoke-WebRequest http://localhost:3000/v1/health

# Test chat
$body = '{"message":"test"}' | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/v1/chat -Method POST -Body $body -ContentType "application/json"
```

## Next Steps

1. **Run the deploy script**: `.\deploy-fixes.ps1`
2. **Restart Railway Postgres** (link above)
3. **Check `HEALTH_LOG.md`** in 15 minutes to see automated monitoring working
4. **Optional**: Deploy to Render.com for more reliable hosting (see DEPLOY.md)
