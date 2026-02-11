# Tentai Ecosystem - Quick Start Guide

## The Problem You're Having

Vi backend needs to be running for the console to work. When you restart your PC or close the terminal, the backend stops.

## ✅ Solution 1: Quick Start (Do This Now)

### Start the Backend:
```powershell
.\start-vi.ps1
```

**Keep this terminal open** while using the console. Press `Ctrl+C` to stop.

### Test Everything:
```powershell
.\health-check.ps1
```

---

## 🚀 Solution 2: Railway Deployment (Run Once, Works Forever)

Your Railway Postgres keeps crashing. Here's how to fix it:

### Step 1: Restart Railway Postgres

1. Go to https://railway.com/project/6b8f45bb-8423-462d-93d3-0705d322713c
2. Click **"Postgres"** service
3. Click **"Restart"** button

### Step 2: Redeploy Vi Backend

```powershell
cd "e:\Tentai Ecosystem\core\vi"
railway up
```

### Step 3: Update Console to Use Railway

Once Railway gives you a URL (like `https://vi-production-xxxx.up.railway.app`):

1. Edit `.env.production` in `packages/ui/console-app`:
   ```
   VITE_API_BASE=https://your-railway-url.up.railway.app
   ```

2. Rebuild and deploy:
   ```powershell
   cd "e:\Tentai Ecosystem\packages\ui\console-app"
   npm run build
   Copy-Item -Path "dist\*" -Destination "e:\Sol Calender\console\" -Recurse -Force
   cd "e:\Sol Calender"
   git add -A
   git commit -m "Connect to Railway backend"
   git push origin main
   ```

---

## 📋 Daily Workflow

### Option A: Using Local Backend (Current Setup)

**Morning:**
```powershell
.\start-vi.ps1  # Keep terminal open
```

**Test:**
- Go to https://tentaitech.com/console/
- Chat should work

**Evening:**
- Press `Ctrl+C` in the backend terminal
- Or just close it

### Option B: Using Railway (After Setup Above)

**Nothing to do!** It runs 24/7 in the cloud.

---

## 🔍 Troubleshooting

### Chat fails with 405:
```powershell
.\start-vi.ps1  # Backend not running
```

### "Backend: Offline" in console:
```powershell
.\health-check.ps1  # Check what's down
```

### Port 3000 already in use:
```powershell
# Find and kill the process
Get-NetTCPConnection -LocalPort 3000 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

---

## 📊 Health Monitoring

### Manual Check:
```powershell
.\health-check.ps1
```

### Auto-Logging:
- GitHub Actions runs every 15 minutes
- Check `HEALTH_LOG.md` in your repo

### Vi Backend:
```powershell
cd core/vi
npm run health
```

---

## 🎯 Recommended Setup

1. **For testing/development**: Use `.\start-vi.ps1` (local backend)
2. **For production/24-7 access**: Deploy to Railway (run once, works forever)

**Current Status**: You're using local backend. Railway is set up but Postgres keeps crashing (needs restart).
