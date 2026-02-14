# Simple skill promotion test with detailed error output
$testSkill = @{
    skill = @{
        id = "skill-simple-test"
        intent = "simple test"
        pattern = "test-pattern-simple"
        actions = @(@{ tool = "test"; input = @{} })
        inputs = @()
        outputs = @()
        createdAt = (Get-Date).ToUniversalTime().ToString("o")
        lastUsed = (Get-Date).ToUniversalTime().ToString("o")
    }
}

Write-Host "Sending skill promotion request..." -ForegroundColor Yellow
Write-Host "Payload:" -ForegroundColor Cyan
$testSkill | ConvertTo-Json -Depth 5

try {
    $response = Invoke-WebRequest -Uri "http://localhost:4311/v1/skills/promote" `
        -Method POST `
        -ContentType "application/json" `
        -Body ($testSkill | ConvertTo-Json -Depth 5) `
        -UseBasicParsing
    
    Write-Host "`n✅ SUCCESS" -ForegroundColor Green
    Write-Host "Status: $($response.StatusCode)" -ForegroundColor Cyan
    Write-Host "Response:" -ForegroundColor Cyan
    $response.Content | ConvertFrom-Json | ConvertTo-Json
} catch {
    Write-Host "`n❌ FAILED" -ForegroundColor Red
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "Error Message: $($_.ErrorDetails.Message)" -ForegroundColor Red
    
    # Try to get the response body
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response Body: $responseBody" -ForegroundColor Red
    }
}
