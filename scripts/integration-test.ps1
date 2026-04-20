param([int]$Port = 2027, [switch]$KeepServer)
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$REPO       = "C:\Users\ULTRAPC\Documents\GitHub\graph-rag-retriever"
$STORE_PATH = "C:\Users\ULTRAPC\Documents\GitHub\graph-doc-ingestion\vector-store.json"
$BASE       = "http://localhost:$Port"
$GRAPH      = "ragRetriever"
$PASS       = 0
$FAIL       = 0

function Write-Pass { param([string]$n) Write-Host "  [PASS] $n" -ForegroundColor Green; $script:PASS++ }
function Write-Fail { param([string]$n,[string]$d) Write-Host "  [FAIL] $n -- $d" -ForegroundColor Red; $script:FAIL++ }

function Wait-ServerReady {
  param([string]$url,[int]$max=60)
  $dl = (Get-Date).AddSeconds($max)
  while ((Get-Date) -lt $dl) {
    try { $r = Invoke-RestMethod "$url/ok" -TimeoutSec 2 -ErrorAction Stop; if ($r.ok -eq $true) { return $true } } catch {}
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Invoke-GraphRun {
  param([hashtable]$graphInput,[int]$timeout=120)
  $t = Invoke-RestMethod "$BASE/threads" -Method POST -ContentType "application/json" -Body "{}" -TimeoutSec 10
  $b = @{ assistant_id=$GRAPH; input=$graphInput } | ConvertTo-Json -Depth 8
  return Invoke-RestMethod "$BASE/threads/$($t.thread_id)/runs/wait" -Method POST -ContentType "application/json" -Body $b -TimeoutSec $timeout
}

Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  graph-rag-retriever -- LangGraph API Integration Tests" -ForegroundColor Cyan
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $STORE_PATH)) {
  Write-Host "  [ERROR] Vector store not found: $STORE_PATH" -ForegroundColor Red
  Write-Host "  Run graph-doc-ingestion tests first to populate the store." -ForegroundColor Yellow
  exit 1
}
$recordCount = (Get-Content $STORE_PATH -Raw | ConvertFrom-Json).Count
Write-Host "  Vector store: $recordCount records at $STORE_PATH" -ForegroundColor DarkGray
Write-Host "  Starting langgraph dev on port $Port..." -ForegroundColor DarkGray

$env:VECTOR_STORE_PATH = $STORE_PATH
$serverJob = Start-Job -ScriptBlock {
  param($repo,$port,$storePath)
  Set-Location $repo
  $env:VECTOR_STORE_PATH = $storePath
  npx @langchain/langgraph-cli dev --port $port --no-browser 2>&1
} -ArgumentList $REPO,$Port,$STORE_PATH

if (-not (Wait-ServerReady $BASE)) {
  Write-Host "  [ERROR] Server failed to start" -ForegroundColor Red
  Stop-Job $serverJob -PassThru | Remove-Job -Force
  exit 1
}
Write-Host "  Server ready" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Running tests..." -ForegroundColor DarkGray
Write-Host ""

# Test 1: Basic retrieval -- LangGraph query returns context chunks
try {
  $r = Invoke-GraphRun -graphInput @{
    query="What is LangGraph and how does it work?"
    topK=5
    clientId="integ-test"
  }
  $cc = if ($r.chunkCount) { $r.chunkCount } else { 0 }
  $cw = if ($r.contextWindow) { $r.contextWindow } else { "" }
  if ($r.phase -eq "format-context" -and $cc -gt 0 -and $cw.Length -gt 0) {
    Write-Pass "1. LangGraph query -- phase=$($r.phase) chunkCount=$cc ctxLen=$($cw.Length)"
  } else {
    Write-Fail "1. LangGraph query" "phase=$($r.phase) chunkCount=$cc ctxLen=$($cw.Length)"
  }
} catch { Write-Fail "1. LangGraph query" $_.Exception.Message }

# Test 2: RAG query -- Retrieval-Augmented Generation query
try {
  $r = Invoke-GraphRun -graphInput @{
    query="How does RAG combine language models with vector stores?"
    topK=5
    clientId="integ-test"
  }
  $cc = if ($r.chunkCount) { $r.chunkCount } else { 0 }
  if ($r.phase -eq "format-context" -and $cc -gt 0) {
    Write-Pass "2. RAG query -- phase=$($r.phase) chunkCount=$cc"
  } else {
    Write-Fail "2. RAG query" "phase=$($r.phase) chunkCount=$cc"
  }
} catch { Write-Fail "2. RAG query" $_.Exception.Message }

# Test 3: Empty store fallback -- query that matches nothing returns graceful empty context
try {
  $r = Invoke-GraphRun -graphInput @{
    query="Blockchain decentralized finance crypto NFT metaverse"
    topK=3
    clientId="integ-test"
  }
  $cc = if ($r.PSObject.Properties["chunkCount"]) { $r.chunkCount } else { 0 }
  $cw = if ($r.contextWindow) { $r.contextWindow } else { "" }
  if ($r.phase -eq "format-context" -and $cw.Length -gt 0) {
    Write-Pass "3. No-match query -- phase=$($r.phase) chunkCount=$cc (graceful empty)"
  } else {
    Write-Fail "3. No-match query" "phase=$($r.phase) chunkCount=$cc"
  }
} catch { Write-Fail "3. No-match query" $_.Exception.Message }

# Test 4: topK=1 returns exactly 1 chunk
try {
  $r = Invoke-GraphRun -graphInput @{
    query="LangGraph stateful multi-actor applications"
    topK=1
    clientId="integ-test"
  }
  $cc = if ($r.chunkCount) { $r.chunkCount } else { 0 }
  if ($r.phase -eq "format-context" -and $cc -eq 1) {
    Write-Pass "4. topK=1 -- phase=$($r.phase) chunkCount=$cc"
  } else {
    Write-Fail "4. topK=1" "phase=$($r.phase) chunkCount=$cc (expected 1)"
  }
} catch { Write-Fail "4. topK=1" $_.Exception.Message }

Write-Host ""
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
$color = if ($FAIL -eq 0) { "Green" } else { "Red" }
Write-Host ("  Results: {0}/{1} passed" -f $PASS,($PASS+$FAIL)) -ForegroundColor $color
Write-Host "-----------------------------------------------------------" -ForegroundColor Cyan
Write-Host ""

if (-not $KeepServer) {
  Stop-Job $serverJob -PassThru | Remove-Job -Force 2>$null
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
exit $(if ($FAIL -eq 0) { 0 } else { 1 })