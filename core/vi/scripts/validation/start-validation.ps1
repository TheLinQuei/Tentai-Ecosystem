$ErrorActionPreference = "Stop"

$logDir = "e:\Tentai Ecosystem\core\vi\staging-validation"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logFile = Join-Path $logDir "validation_$stamp.log"
$metricsFile = Join-Path $logDir "metrics_$stamp.log"
$baseUrl = "http://localhost:3100"

Write-Host "Log: $logFile"
Write-Host "Metrics: $metricsFile"

$smokeJob = Start-Job -Name "smoke-loop" -ArgumentList $baseUrl,$logFile -ScriptBlock {
  param($baseUrl,$logFile)
  for ($i = 1; $i -le 12; $i++) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content $logFile "=== Smoke Check $i @ $ts ==="
    try {
      $body1 = @{ message = "What is machine learning?"; userId = "smoke-user-1" } | ConvertTo-Json
      $res1 = Invoke-RestMethod -Method Post -Uri "$baseUrl/v1/chat" -ContentType "application/json" -Body $body1
      $intent1 = $res1.cognitive.intent.category
      Add-Content $logFile "normal: recordId=$($res1.recordId) intent=$intent1"
    } catch { Add-Content $logFile "normal: ERROR $($_.Exception.Message)" }

    try {
      $body2 = @{ message = "so what not"; userId = "smoke-user-2" } | ConvertTo-Json
      $res2 = Invoke-RestMethod -Method Post -Uri "$baseUrl/v1/chat" -ContentType "application/json" -Body $body2
      $intent2 = $res2.cognitive.intent.category
      Add-Content $logFile "ambiguous: recordId=$($res2.recordId) intent=$intent2"
    } catch { Add-Content $logFile "ambiguous: ERROR $($_.Exception.Message)" }

    try {
      $health = Invoke-RestMethod -Method Get -Uri "$baseUrl/v1/health"
      Add-Content $logFile "health: status=$($health.status) version=$($health.version)"
    } catch { Add-Content $logFile "health: ERROR $($_.Exception.Message)" }

    Add-Content $logFile "Status: Ongoing"
    Add-Content $logFile ""
    Start-Sleep -Seconds 300
  }
}

$promptJob = Start-Job -Name "prompt-set" -ArgumentList $baseUrl,$logFile -ScriptBlock {
  param($baseUrl,$logFile)
  $prompts = @(
    "What is artificial intelligence?",
    "Explain quantum computing in simple terms",
    "Tell me about machine learning algorithms",
    "How does photosynthesis work?",
    "What are the uses of blockchain?",
    "so what not",
    "when time we",
    "the the the",
    "what was that again",
    "compare this to that",
    "Tell me about your perspective on luxury",
    "How would you advise me on this decision?",
    "What's your take on this sensitive topic?"
  )

  $ts = Get-Date -Format "yyyyMMddHHmmss"
  for ($i = 0; $i -lt $prompts.Count; $i++) {
    $prompt = $prompts[$i]
    $userId = "validation-user-$ts-$i"
    $body = @{ message = $prompt; userId = $userId; timestamp = [int][double]::Parse((Get-Date -UFormat %s)) * 1000 } | ConvertTo-Json
    $stamp2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
      $res = Invoke-RestMethod -Method Post -Uri "$baseUrl/v1/chat" -ContentType "application/json" -Body $body
      $intent = $res.cognitive.intent.category
      Add-Content $logFile "[$stamp2] prompt=$prompt | recordId=$($res.recordId) intent=$intent status=$($res.status)"
    } catch { Add-Content $logFile "[$stamp2] prompt=$prompt | ERROR $($_.Exception.Message)" }
    Start-Sleep -Seconds 5
  }
  Add-Content $logFile "Controlled prompt set complete"
}

$metricsJob = Start-Job -Name "metrics-snapshot" -ArgumentList $metricsFile -ScriptBlock {
  param($metricsFile)
  for ($i = 1; $i -le 48; $i++) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content $metricsFile "=== Metrics Snapshot $i @ $ts ==="
    Add-Content $metricsFile "(See validation log for request-level details)"
    Add-Content $metricsFile ""
    Start-Sleep -Seconds 1800
  }
}

$monitorJob = Start-Job -Name "health-monitor" -ArgumentList $baseUrl,$metricsFile -ScriptBlock {
  param($baseUrl,$metricsFile)
  for ($i = 1; $i -le 288; $i++) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
      $health = Invoke-RestMethod -Method Get -Uri "$baseUrl/v1/health"
      Add-Content $metricsFile "health @${ts}: status=$($health.status) version=$($health.version)"
    } catch { Add-Content $metricsFile "health @${ts}: ERROR $($_.Exception.Message)" }
    Start-Sleep -Seconds 300
  }
}

Write-Host "Started jobs: smoke-loop=$($smokeJob.Id), prompt-set=$($promptJob.Id), metrics-snapshot=$($metricsJob.Id), health-monitor=$($monitorJob.Id)"
