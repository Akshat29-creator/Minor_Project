# ========================================================================
# SHUT DOWN ALL SONAR SYSTEM SERVICES AND CLOSE ALL PORTS
# ========================================================================
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  SHUTTING DOWN ALL SONAR SYSTEM SERVICES AND CLOSING ALL PORTS" -ForegroundColor Yellow
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Scanning and terminating processes on ports 8000, 3000, 3001..." -ForegroundColor Gray

$ports = @(8000, 3000, 3001)
$connections = Get-NetTCPConnection -LocalPort $ports -ErrorAction SilentlyContinue

if ($connections) {
    $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Write-Host "[-] Stopping Process ID $p..." -ForegroundColor Red
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "[OK] No active listeners found on ports 8000, 3000, 3001." -ForegroundColor Green
}

# Double check with netstat / taskkill fallback
$netstatLines = netstat -ano | Select-String ":8000\s+|:3000\s+|:3001\s+" | Select-String "LISTENING"
foreach ($line in $netstatLines) {
    if ($line.Line -match '\s+(\d+)$') {
        $pidToKill = $matches[1]
        taskkill /F /PID $pidToKill 2>$null
    }
}

Write-Host ""
Write-Host "========================================================================" -ForegroundColor Cyan
Write-Host "  [SUCCESS] All ports (8000, 3000, 3001) successfully closed!" -ForegroundColor Green
Write-Host "========================================================================" -ForegroundColor Cyan
