# Deploy Vi Backend to Railway

## Quick Deploy (5 minutes)

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
```

### 3. Create New Project
```bash
cd e:\Tentai Ecosystem\core\vi
railway init
# Choose "Empty Project"
# Name it "vi-backend"
```

### 4. Add PostgreSQL Database
```bash
railway add --database postgresql
```

### 5. Set Environment Variables
Railway will auto-set `DATABASE_URL` from the PostgreSQL addon. Add these:

```bash
railway variables set VI_AUTH_ENABLED=false
railway variables set NODE_ENV=production
railway variables set VI_LLM_PROVIDER=openai
railway variables set OPENAI_API_KEY="your-key-here"
railway variables set ADMIN_DASH_ENABLED=true
```

### 6. Deploy
```bash
npm run build  # Test build works
railway up     # Deploy to Railway
```

Railway will:
- Build your app (`npm install && npm run build`)
- Run migrations automatically (if configured)
- Start the server (`npm start`)
- Give you a public URL: `https://vi-backend-production.up.railway.app`

### 7. Update Console App

Edit `packages/ui/console-app/.env.production`:
```
VITE_API_BASE=https://vi-backend-production.up.railway.app
```

Rebuild and deploy console:
```bash
cd e:\Tentai Ecosystem\packages\ui\console-app
npm run build
# Copy to your GitHub Pages repo and push
```

## Done! 🎉

Your console at https://tentaitech.com/console/ will now connect to the cloud-hosted Vi backend.

### Automatic Deploys

Link your GitHub repo to Railway:
```bash
railway link
# Connect to GitHub repo
```

Now every `git push` to main will auto-deploy!

---

## Alternative: Render.com (Free Tier)

1. Go to https://render.com
2. "New +" → "Web Service"
3. Connect your GitHub: `TheLinQuei/tentai-ecosystem`
4. Root Directory: `core/vi`
5. Build Command: `npm install && npm run build`
6. Start Command: `npm start`
7. Add PostgreSQL database (free tier: 90 days)
8. Set environment variables

Done! You get `https://vi-backend.onrender.com`
