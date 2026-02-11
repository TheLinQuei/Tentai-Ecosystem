# Quick Deploy Script - Fixes Console Port and Deploys Health Monitoring
Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan

# 1. Build and deploy console with correct port (3000)
Write-Host "`n📦 Building console..." -ForegroundColor Yellow
Set-Location "e:\Tentai Ecosystem\packages\ui\console-app"
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful" -ForegroundColor Green
    
    Write-Host "`n📤 Deploying to GitHub Pages..." -ForegroundColor Yellow
    Copy-Item -Path "dist\*" -Destination "e:\Sol Calender\console\" -Recurse -Force
    
    Set-Location "e:\Sol Calender"
    git add -A
    git commit -m "Fix: Update API port from 3100 to 3000"
    git push origin main
    
    Write-Host "✅ Console deployed to tentaitech.com/console/" -ForegroundColor Green
} else {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

# 2. Commit health monitoring system
Write-Host "`n🏥 Adding health monitoring..." -ForegroundColor Yellow
Set-Location "e:\Tentai Ecosystem"
git add -A
git commit -m "Add automated health monitoring

- Health check script writes to HEALTH_LOG.md  
- GitHub Action runs every 15 minutes
- Tracks backend, database, and console status"
git push origin main

Write-Host "✅ Health monitoring committed" -ForegroundColor Green

# 3. Run first health check
Write-Host "`n🔍 Running initial health check..." -ForegroundColor Yellow
Set-Location "e:\Tentai Ecosystem\core\vi"
npm run health

Write-Host "`n✨ Deployment complete!" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "1. Visit https://tentaitech.com/console/ (wait 30s for GitHub Pages to update)"
Write-Host "2. Check HEALTH_LOG.md for automated health reports"
Write-Host "3. GitHub Actions will check health every 15 minutes"
