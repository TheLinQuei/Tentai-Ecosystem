# Deploy Vi Backend to Render.com

## Step 1: Sign Up (30 seconds)

1. Go to https://render.com
2. Click "Get Started for Free"
3. Sign up with GitHub (recommended) or email

## Step 2: Create Web Service (2 minutes)

### Option A: Deploy from GitHub (Recommended)

1. Push your code to GitHub first:
   ```powershell
   cd "e:\Tentai Ecosystem"
   git init  # If not already a repo
   git add core/vi/
   git commit -m "Add Vi backend for Render deployment"
   git push origin main
   ```

2. In Render dashboard:
   - Click "New +" → "Web Service"
   - Connect your GitHub account
   - Select your repository
   - Root Directory: `core/vi`
   - Click "Connect"

### Option B: Deploy from Local Files (Faster)

1. In Render dashboard:
   - Click "New +" → "Web Service"
   - Select "Build and deploy from a Git repository"
   - Click "Public Git repository"
   - Enter a placeholder URL (we'll upload manually)
   
2. Upload via command line:
   ```powershell
   cd "e:\Tentai Ecosystem\core\vi"
   # Install Render CLI
   npm install -g @render-cloud/cli
   render login
   render deploy
   ```

## Step 3: Configure Service

### Basic Settings:
- **Name:** `vi-backend`
- **Environment:** `Docker`
- **Region:** `Oregon (US West)` (free tier)
- **Branch:** `main` (if using GitHub)
- **Dockerfile Path:** `./Dockerfile`

### Environment Variables:
Add these in the "Environment" tab:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `VI_AUTH_ENABLED` | `false` |
| `PORT` | `10000` (Render requirement) |
| `OPENAI_API_KEY` | `YOUR_API_KEY_HERE` |

**DATABASE_URL will be added automatically in Step 4**

### Health Check:
- **Health Check Path:** `/v1/health`
- **Health Check Interval:** 30 seconds

## Step 4: Add PostgreSQL Database (1 minute)

1. In your service page, scroll to "Environment" section
2. Click "Add Database"
3. Select "PostgreSQL"
4. Choose **Free tier** (90 days, 256MB RAM, 1GB storage)
5. Name: `vi-postgres`
6. Database: `vi`
7. User: `vi_user`
8. Click "Create Database"

This automatically adds `DATABASE_URL` to your environment variables.

## Step 5: Deploy! (3-5 minutes)

1. Click "Manual Deploy" → "Deploy latest commit"
2. Watch the build logs
3. Wait for status to show "Live" (green)
4. Your backend will be at: `https://vi-backend.onrender.com`

## Step 6: Test Your Deployment

```powershell
# Check health
Invoke-WebRequest -Uri "https://vi-backend.onrender.com/v1/health"

# Test chat endpoint
Invoke-WebRequest -Uri "https://vi-backend.onrender.com/v1/chat" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"message":"Hello","sessionId":"test"}'
```

## Step 7: Update & Deploy Console

The console has already been updated to use Render in production.

```powershell
cd "e:\Tentai Ecosystem\packages\ui\console-app"
npm run build
Copy-Item -Recurse -Force dist\* "e:\Sol Calender\console\"
cd "e:\Sol Calender"
git add .
git commit -m "Update console to use Render backend"
git push
```

Visit https://tentaitech.com/console/ and test!

---

## Troubleshooting

### Build Fails
- Check Render build logs for TypeScript errors
- Verify Dockerfile runs locally: `docker build -t vi-test .`

### Database Connection Fails
- Verify DATABASE_URL is set (should auto-populate from PostgreSQL)
- Check PostgreSQL service is "Available" status

### Health Check Fails
- Ensure `/v1/health` endpoint returns 200 status
- Check PORT environment variable is set to `10000`

### CORS Errors
- Verify `server.ts` has `https://tentaitech.com` in allowed origins
- Check browser console for actual error

---

## Render Free Tier Limits

- ✅ **Web Services:** 750 hours/month (enough for 24/7 operation)
- ✅ **PostgreSQL:** 90 days free trial, then $7/month
- ✅ **Auto-sleep:** Service sleeps after 15 min inactivity (wakes on request)
- ✅ **Build time:** Included
- ⚠️ **Cold starts:** First request after sleep takes 30-60 seconds

## Alternative: Paid Render ($7/month)
- No auto-sleep
- Faster cold starts
- PostgreSQL included
- Worth it for production use

---

**Your Render URL:** `https://vi-backend.onrender.com`

Update your console's localStorage if needed:
```javascript
localStorage.setItem('vi-api-base', 'https://vi-backend.onrender.com');
```
